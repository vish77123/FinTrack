/**
 * PII redaction for statement text — the single choke point before the text
 * leaves the app (LLM calls) or is persisted (card_statements.raw_text).
 *
 * Deterministic, pattern-based: no third party sees the text to "detect" PII.
 * Card last-4 digits are deliberately preserved — the wrong-card upload guard
 * and account matching need them. Amounts, dates, and merchant names are left
 * untouched; they are the data being extracted.
 */

export interface RedactionResult {
  text: string;
  /** Count of replacements per category, for logging/diagnostics. */
  counts: Record<string, number>;
}

export interface RedactOptions {
  /** Known names (e.g. the user's profile display name) to mask verbatim. */
  knownNames?: (string | null | undefined)[];
}

type Rule = {
  category: string;
  pattern: RegExp;
  replace: string | ((...groups: string[]) => string);
};

// Order matters: wider patterns (GSTIN ⊃ PAN, grouped cards ⊃ Aadhaar groups)
// must run before the narrower ones they contain.
const RULES: Rule[] = [
  // Card numbers in print format, keep last 4: "4523 6712 8890 1005" / 4-6-5 AMEX
  {
    category: "card",
    pattern: /\b(?:\d{4}[ -]){3}(\d{4})\b/g,
    replace: (_m, last4) => `XXXX-XXXX-XXXX-${last4}`,
  },
  {
    category: "card",
    pattern: /\b\d{4}[ -]\d{6}[ -](\d{5})\b/g,
    replace: (_m, last5) => `XXXX-XXXXXX-X${last5.slice(-4)}`,
  },
  // Aadhaar (4-4-4 groups). Runs after full card patterns so it can't eat them
  { category: "aadhaar", pattern: /\b\d{4}\s\d{4}\s\d{4}\b/g, replace: "[AADHAAR]" },
  // Contiguous long numbers: account numbers, customer IDs, 10-digit phones
  {
    category: "long-number",
    pattern: /\b\d{9,}\b/g,
    replace: (m) => `XXXX${m.slice(-4)}`,
  },
  // Phones written with separators: "+91 98765 43210", "98765-43210"
  { category: "phone", pattern: /(?:\+91[\s-]?)?\b[6-9]\d{4}[\s-]\d{5}\b/g, replace: "[PHONE]" },
  { category: "email", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replace: "[EMAIL]" },
  // GSTIN before PAN (a GSTIN contains a PAN)
  { category: "gstin", pattern: /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]\b/g, replace: "[GSTIN]" },
  { category: "pan", pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/g, replace: "[PAN]" },
  { category: "ifsc", pattern: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g, replace: "[IFSC]" },
];

// Words that mark a line as address-like (Indian postal conventions)
const ADDRESS_HINTS =
  /\b(nagar|road|rd|street|marg|lane|gali|flat|floor|apartment|apts?|block|sector|phase|colony|society|soc|chs|tower|residency|enclave|layout|cross|dist|district|taluka?|village|post|house|villa|bunglow|near|opp|opposite|behind|beside|pin\s?code?)\b/i;

// Ends with a 6-digit pincode (optionally "PIN: 411001" or "- 411 001")
const PINCODE_LINE = /\b\d{3}\s?\d{3}\s*$/;

// Lines containing these are statement structure, never mask them wholesale
const KEEP_HINTS =
  /\b(statement|account|card|credit|debit|limit|due|total|minimum|amount|payment|balance|date|period|transaction|summary|reward|points|gst|interest|charges|bank|amex|american|express|hdfc|icici|axis|sbi|kotak|visa|mastercard|rupay|diners)\b/i;

/** A short ALL-CAPS alphabetic line near the top is very likely the holder's name. */
function looksLikeNameLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || /\d/.test(trimmed)) return false;
  if (KEEP_HINTS.test(trimmed)) return false;
  const words = trimmed.split(/\s+/);
  if (words.length < 2 || words.length > 5) return false;
  return words.every((w) => /^[A-Z][A-Z.]*$/.test(w));
}

// A transaction/summary row always carries a date or a decimal amount — a
// postal address line never does. Guards against masking rows whose merchant
// contains address-ish words ("RENTOMOJO LIMITED MG ROAD").
const TXN_ROW_HINTS = /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d+\.\d{2}\b|₹/;

function looksLikeAddressLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 80) return false;
  if (KEEP_HINTS.test(trimmed) || TXN_ROW_HINTS.test(trimmed)) return false;
  const words = trimmed.split(/\s+/);
  if (words.length > 10) return false;
  return ADDRESS_HINTS.test(trimmed) || PINCODE_LINE.test(trimmed);
}

// The identity block sits in the statement header; only scan the top so a
// merchant called "MG ROAD CAFE" further down isn't collateral damage.
const HEADER_SCAN_LINES = 45;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactStatementText(text: string, options: RedactOptions = {}): RedactionResult {
  const counts: Record<string, number> = {};
  const bump = (category: string, n = 1) => {
    if (n > 0) counts[category] = (counts[category] || 0) + n;
  };

  let out = text;

  // 1. Known names (user profile), anywhere in the document
  for (const name of options.knownNames || []) {
    const trimmed = name?.trim();
    if (!trimmed || trimmed.length < 4) continue;
    const pattern = new RegExp(escapeRegExp(trimmed), "gi");
    out = out.replace(pattern, () => {
      bump("name");
      return "[NAME]";
    });
  }

  // 2. Structured PII patterns
  for (const rule of RULES) {
    out = out.replace(rule.pattern, (...args) => {
      bump(rule.category);
      if (typeof rule.replace === "string") return rule.replace;
      // args = [match, ...groups, offset, string]
      return rule.replace(...(args.slice(0, -2) as string[]));
    });
  }

  // 3. Header identity block: name + address lines near the top
  const lines = out.split("\n");
  const scanEnd = Math.min(lines.length, HEADER_SCAN_LINES);
  for (let i = 0; i < scanEnd; i++) {
    if (looksLikeAddressLine(lines[i])) {
      lines[i] = "[ADDRESS]";
      bump("address");
    } else if (looksLikeNameLine(lines[i])) {
      lines[i] = "[NAME]";
      bump("name");
    }
  }

  return { text: lines.join("\n"), counts };
}
