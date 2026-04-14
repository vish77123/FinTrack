/**
 * Indian Bank Email/SMS Transaction Parser
 * Layer 1: Pure regex — zero API cost, runs entirely on-server
 * 
 * Tested against real HDFC Bank alerts. Handles HTML-sourced text.
 */

export interface ParsedTransaction {
  amount: number;
  type: "income" | "expense" | "cc_payment";
  merchant: string;
  date: string; // ISO string
  last4: string; // last 4 digits of account/card
  confidence: number; // 0.0 to 1.0
  rawSnippet: string; // first 200 chars for review
}

// ═══════════════════════════════════════════════════════════
// TEXT CLEANING — critical for HTML-sourced email bodies
// ═══════════════════════════════════════════════════════════

function cleanEmailText(raw: string): string {
  return raw
    // Remove HTML tags completely
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    // Decode HTML entities
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#8377;/g, "Rs.")  // ₹ symbol
    .replace(/&#x20B9;/gi, "Rs.")
    .replace(/₹/g, "Rs.")
    .replace(/&#\d+;/g, " ")     // other numeric entities
    // Normalize unicode and whitespace
    .replace(/\u00A0/g, " ")     // non-breaking space
    .replace(/\r\n|\r|\n/g, " ") // newlines
    .replace(/\s+/g, " ")
    .trim();
}

// ═══════════════════════════════════════════════════════════
// AMOUNT PARSING
// ═══════════════════════════════════════════════════════════

function parseAmount(raw: string): number {
  return parseFloat(raw.replace(/,/g, "").replace(/Rs\.?/gi, "").trim());
}

// ═══════════════════════════════════════════════════════════
// ACCOUNT LAST-4 EXTRACTION
// ═══════════════════════════════════════════════════════════

function extractLast4(text: string): string {
  // "from account 6842" or "from account XX6842" or "a/c *6842"
  const patterns = [
    /(?:a\/c|acct?|account|card)\s*(?:no\.?\s*)?(?:ending\s*)?(?:XX|xx|\*{2,})?\s*(\d{4})\b/i,
    /(?:XX|xx|X{2,}|x{2,}|\*{2,})(\d{4})\b/,
    /(?:debited from|credited to)\s*(?:account|a\/c)?\s*(\d{4})\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return "";
}

// ═══════════════════════════════════════════════════════════
// MERCHANT EXTRACTION — handles HDFC-style "to VPA xxx MERCHANT_NAME on DATE"
// ═══════════════════════════════════════════════════════════

function extractMerchant(text: string): string {
  // HDFC UPI: "to VPA <id>@<handle> MERCHANT NAME on DD-MM-YY"
  const hdfcUpi = text.match(/to\s+VPA\s+\S+\s+(.+?)\s+on\s+\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/i);
  if (hdfcUpi) {
    const m = hdfcUpi[1].trim();
    if (m.length > 1 && m.length < 80) return m;
  }

  // "at MERCHANT on" or "at MERCHANT."
  const atMatch = text.match(/\bat\s+([A-Za-z0-9\s&'.,-]+?)(?:\s+on\s+\d|\s+via\s|\s+ref\s|\.|$)/i);
  if (atMatch) {
    const m = atMatch[1].trim();
    if (m.length > 1 && m.length < 60) return m;
  }

  // "to MERCHANT on" (non-VPA)
  const toMatch = text.match(/\bto\s+([A-Z][A-Za-z0-9\s&'.,-]+?)(?:\s+on\s+\d|\.|$)/i);
  if (toMatch) {
    const m = toMatch[1].trim();
    // Filter out VPA IDs and generic words
    if (m.length > 2 && m.length < 60 && !m.includes("@") && !m.match(/^(VPA|UPI|your|the|a\/c)/i)) {
      return m;
    }
  }

  // "towards MERCHANT" (EMI / auto-debit)
  const towardsMatch = text.match(/towards\s+([A-Za-z0-9\s&'.,-]+?)(?:\s+a\/c|\.|$)/i);
  if (towardsMatch) {
    const m = towardsMatch[1].trim();
    if (m.length > 1 && m.length < 60) return m;
  }

  return "";
}

// ═══════════════════════════════════════════════════════════
// DATE EXTRACTION
// ═══════════════════════════════════════════════════════════

function extractDate(text: string): string | null {
  // "on 10-04-26" or "on 10/04/2026" or "dated 10-04-26"
  const dateMatch = text.match(/(?:on|dated|date[: ])\s*(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/i);
  if (dateMatch) {
    const day = parseInt(dateMatch[1]);
    const month = parseInt(dateMatch[2]) - 1;
    let year = parseInt(dateMatch[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// REGEX PATTERNS — ordered from most specific to most generic
// ═══════════════════════════════════════════════════════════

interface Pattern {
  name: string; // for debug logging
  regex: RegExp;
  type: "income" | "expense" | "cc_payment";
  amountGroup: number;
  confidence: number;
}

// ═══════════════════════════════════════════════════════════
// CC PAYMENT PATTERNS — must run BEFORE generic credit patterns
// to detect bill payments as a separate type (cc_payment)
// ═══════════════════════════════════════════════════════════

const CC_PAYMENT_PATTERNS: Pattern[] = [
  {
    name: "hdfc_cc_payment",
    // 'Payment of Rs.5,000 received on HDFC Bank Credit Card XX1234'
    regex: /[Pp]ayment\s+of\s+(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+received.*?(?:card|Card)/,
    type: "cc_payment",
    amountGroup: 1,
    confidence: 0.95,
  },
  {
    name: "icici_cc_payment",
    // 'ICICI Bank Credit Card XX1234 Payment received Rs.5000'
    regex: /[Cc]redit\s+[Cc]ard.*?[Pp]ayment\s+(?:received|processed)\s+(?:Rs\.?|INR|₹)\s*([\d,]+)/,
    type: "cc_payment",
    amountGroup: 1,
    confidence: 0.93,
  },
  {
    name: "amex_cc_payment",
    // 'Your payment of Rs. 5,000 has been received'
    regex: /[Yy]our\s+payment\s+of\s+(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+has\s+been\s+received/,
    type: "cc_payment",
    amountGroup: 1,
    confidence: 0.95,
  },
  {
    name: "generic_cc_payment",
    // 'Payment received of Rs.5000' or 'Payment received Rs.5000'
    regex: /[Pp]ayment\s+received\s+(?:of\s+)?(?:Rs\.?|INR|₹)\s*([\d,]+)/,
    type: "cc_payment",
    amountGroup: 1,
    confidence: 0.85,
  },
];

const PATTERNS: Pattern[] = [
  // ── DEBIT PATTERNS ──────────────────────────────────────
  {
    name: "Rs_debited_account",
    // "Rs.40.00 has been debited from account 6842"
    // "Rs 1,500 debited from a/c XX1234"
    regex: /Rs\.?\s*([\d,]+\.?\d*)\s*(?:has been\s*)?debited\s*(?:from\s*)?(?:your\s*)?(?:a\/c|acct?|account)\s*(?:no\.?\s*)?(?:XX|xx|\*{2,})?\s*(\d{4})/i,
    type: "expense",
    amountGroup: 1,
    confidence: 0.95,
  },
  {
    name: "debited_Rs",
    // "debited by Rs.500" or "debited with Rs 200"
    regex: /debited\s*(?:by|with|for)?\s*(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i,
    type: "expense",
    amountGroup: 1,
    confidence: 0.85,
  },
  {
    name: "spent_card",
    // "Rs.2,499 spent on HDFC Credit Card XX1234 at Swiggy"
    regex: /Rs\.?\s*([\d,]+\.?\d*)\s*spent/i,
    type: "expense",
    amountGroup: 1,
    confidence: 0.90,
  },
  {
    name: "ATM",
    // "ATM WDL of Rs.5,000"
    regex: /ATM\s*(?:WDL|withdrawal|cash)\s*(?:of\s*)?Rs\.?\s*([\d,]+\.?\d*)/i,
    type: "expense",
    amountGroup: 1,
    confidence: 0.95,
  },
  {
    name: "auto_debit",
    // "Auto-debit of Rs.3,500 towards Loan"
    regex: /(?:auto[- ]?debit|emi|standing instruction|mandate)\s*(?:of\s*)?Rs\.?\s*([\d,]+\.?\d*)/i,
    type: "expense",
    amountGroup: 1,
    confidence: 0.90,
  },
  {
    name: "IMPS_NEFT_debit",
    // "IMPS of Rs.500 done" or "NEFT Rs.1000 sent"
    regex: /(?:IMPS|NEFT|RTGS)\s*(?:of\s*)?Rs\.?\s*([\d,]+\.?\d*)\s*(?:done|sent|transferred)/i,
    type: "expense",
    amountGroup: 1,
    confidence: 0.90,
  },

  // ── CREDIT PATTERNS ─────────────────────────────────────
  {
    name: "Rs_credited_account",
    // "Rs.1,200 credited to a/c XX1234"
    regex: /Rs\.?\s*([\d,]+\.?\d*)\s*(?:has been\s*)?credited\s*(?:to\s*)?(?:your\s*)?(?:a\/c|acct?|account)\s*(?:no\.?\s*)?(?:XX|xx|\*{2,})?\s*(\d{4})/i,
    type: "income",
    amountGroup: 1,
    confidence: 0.95,
  },
  {
    name: "credited_Rs",
    // "credited with Rs.500"
    regex: /credited\s*(?:by|with)?\s*(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i,
    type: "income",
    amountGroup: 1,
    confidence: 0.85,
  },
  {
    name: "IMPS_NEFT_credit",
    // "IMPS of Rs.500 received"
    regex: /(?:IMPS|NEFT|RTGS)\s*(?:of\s*)?Rs\.?\s*([\d,]+\.?\d*)\s*(?:received|credited)/i,
    type: "income",
    amountGroup: 1,
    confidence: 0.90,
  },

  // ── GENERIC FALLBACKS ───────────────────────────────────
  {
    name: "generic_Rs_debited",
    // "Rs.500 debited" or "INR 500.00 debited" or "INR 500 deducted"
    regex: /(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s*(?:has been\s*)?(?:debited|deducted)/i,
    type: "expense",
    amountGroup: 1,
    confidence: 0.80,
  },
  {
    name: "generic_Rs_credited",
    // "Rs.500 credited" or "INR 500.00 credited"
    regex: /(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s*(?:has been\s*)?credited/i,
    type: "income",
    amountGroup: 1,
    confidence: 0.80,
  },
];

// ═══════════════════════════════════════════════════════════
// KNOWN BANK SENDERS
// ═══════════════════════════════════════════════════════════

export const KNOWN_BANK_SENDERS = [
  "alerts@hdfcbank.bank.in",
  "alerts@hdfcbank.net",
  "alerts@hdfcbank.com",
  "creditcardalerts@hdfcbank.com",
  "noreply@sbi.co.in",
  "alerts@sbi.co.in",
  "alerts@icicibank.com",
  "noreply@icicibank.com",
  "alerts@axisbank.com",
  "alerts.service@kotak.com",
  "alerts@kotak.com",
  "alerts@yesbank.in",
  "alerts@pnb.co.in",
  "noreply@paytmbank.com",
  "alerts@indusind.com",
];

// ═══════════════════════════════════════════════════════════
// MAIN PARSER
// ═══════════════════════════════════════════════════════════

export function parseTransactionText(text: string, emailDate?: string): ParsedTransaction | null {
  const cleanText = cleanEmailText(text);

  // Run CC payment patterns FIRST — before generic credit patterns
  // This ensures bank CC payment receipts are correctly typed as cc_payment
  for (const pattern of [...CC_PAYMENT_PATTERNS, ...PATTERNS]) {
    const match = cleanText.match(pattern.regex);
    if (match) {
      const amount = parseAmount(match[pattern.amountGroup]);
      if (isNaN(amount) || amount <= 0) continue;

      const isCCPayment = pattern.type === "cc_payment";
      const merchant = isCCPayment
        ? "Credit Card Payment"
        : extractMerchant(cleanText) || "Bank Transaction";
      const last4 = extractLast4(cleanText);
      const parsedDate = extractDate(cleanText) || emailDate || new Date().toISOString();

      console.log(`[REGEX ✓] ${pattern.name}: Rs.${amount} ${pattern.type} | merchant=${merchant} | last4=${last4}`);

      return {
        amount,
        type: pattern.type,
        merchant,
        date: parsedDate,
        last4,
        confidence: pattern.confidence,
        rawSnippet: cleanText.slice(0, 200),
      };
    }
  }

  // Log failure for debugging
  console.warn("[REGEX ✗] No pattern matched. Text preview:", cleanText.slice(0, 150));
  return null;
}

/**
 * Check if an email sender is a known bank alert sender
 */
export function isBankSender(sender: string): boolean {
  const email = sender.toLowerCase().replace(/.*</, "").replace(/>.*/, "").trim();
  return KNOWN_BANK_SENDERS.some(known => email.includes(known));
}
