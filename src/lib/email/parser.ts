/**
 * Indian Bank Email/SMS Transaction Parser
 * Layer 1: Pure regex — zero API cost, runs entirely on-server
 * 
 * Tested against real HDFC Bank alerts. Handles HTML-sourced text.
 */

export interface ParsedTransaction {
  amount: number;
  type: "income" | "expense";
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
  // Match "ending XXXXX" — take last 4 digits from any trailing digit sequence
  // (Amex uses 5-digit card references like "51005")
  const endingMatch = text.match(/(?:card|account|a\/c)\s+ending\s*:?\s*(\d{4,6})\b/i);
  if (endingMatch) {
    const digits = endingMatch[1];
    return digits.slice(-4);
  }
  // "from account XX6842" or "a/c *6842"
  const patterns = [
    /(?:a\/c|acct?|account|card)\s*(?:no\.?\s*)?(?:XX|xx|\*{2,})?\s*(\d{4})\b/i,
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
// MERCHANT EXTRACTION — updated for Amex SafeKey format
// ═══════════════════════════════════════════════════════════

function extractMerchant(text: string): string {
  // Amex SafeKey OTP: "One-Time Password for INR 175.00 at AMAZON is"
  const amexOtp = text.match(/(?:one-time password|otp|safekey)\s+for\s+(?:INR|Rs\.?)\s*[\d,]+\.?\d*\s+at\s+([A-Z][A-Za-z0-9\s&'.,-]+?)(?:\s+is[:\s]|\s+to\s|\.|$)/i);
  if (amexOtp) {
    const m = amexOtp[1].trim();
    if (m.length > 1 && m.length < 80) return m;
  }

  // Generic INR/Rs at MERCHANT: "INR 175 at AMAZON"
  const inrAt = text.match(/(?:INR|Rs\.?)\s*[\d,]+\.?\d*\s+at\s+([A-Z][A-Za-z0-9\s&'.,-]+?)(?:\s+is[:\s]|\.|$)/i);
  if (inrAt) {
    const m = inrAt[1].trim();
    if (m.length > 1 && m.length < 80) return m;
  }

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
  type: "income" | "expense";
  amountGroup: number;
  confidence: number;
}

const PATTERNS: Pattern[] = [
  // ── AMEX / OTP-STYLE PURCHASE ALERTS ────────────────────
  {
    name: "amex_safekey_otp",
    // "Your One-Time Password for INR 175.00 at AMAZON is:"
    // Also matches "OTP for INR 500 at FLIPKART"
    regex: /(?:one-time password|otp|safekey)\s+for\s+(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s+at\s+/i,
    type: "expense",
    amountGroup: 1,
    confidence: 0.90,
  },

  // ── DEBIT PATTERNS ──────────────────────────────────────
  {
    name: "Rs_or_INR_debited_account",
    // "Rs.40.00 has been debited from account 6842"
    // "INR 1,500 debited from a/c XX1234"
    regex: /(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s*(?:has been\s*)?debited\s*(?:from\s*)?(?:your\s*)?(?:a\/c|acct?|account)\s*(?:no\.?\s*)?(?:XX|xx|\*{2,})?\s*(\d{4,6})/i,
    type: "expense",
    amountGroup: 1,
    confidence: 0.95,
  },
  {
    name: "debited_Rs_or_INR",
    // "debited by Rs.500" or "debited with INR 200"
    regex: /debited\s*(?:by|with|for)?\s*(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i,
    type: "expense",
    amountGroup: 1,
    confidence: 0.85,
  },
  {
    name: "spent_card",
    // "Rs.2,499 spent" or "INR 2499 spent"
    regex: /(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s*spent/i,
    type: "expense",
    amountGroup: 1,
    confidence: 0.90,
  },
  {
    name: "ATM",
    // "ATM WDL of Rs.5,000" or "ATM WDL of INR 5000"
    regex: /ATM\s*(?:WDL|withdrawal|cash)\s*(?:of\s*)?(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i,
    type: "expense",
    amountGroup: 1,
    confidence: 0.95,
  },
  {
    name: "auto_debit",
    // "Auto-debit of Rs.3,500 towards Loan" or "INR 3500 auto-debited"
    regex: /(?:auto[- ]?debit|emi|standing instruction|mandate)\s*(?:of\s*)?(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i,
    type: "expense",
    amountGroup: 1,
    confidence: 0.90,
  },
  {
    name: "IMPS_NEFT_debit",
    // "IMPS of Rs.500 done" or "NEFT INR 1000 sent"
    regex: /(?:IMPS|NEFT|RTGS)\s*(?:of\s*)?(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s*(?:done|sent|transferred)/i,
    type: "expense",
    amountGroup: 1,
    confidence: 0.90,
  },

  // ── CREDIT PATTERNS ─────────────────────────────────────
  {
    name: "Rs_or_INR_credited_account",
    // "Rs.1,200 credited to a/c XX1234" or "INR 1200 credited to account"
    regex: /(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s*(?:has been\s*)?credited\s*(?:to\s*)?(?:your\s*)?(?:a\/c|acct?|account)\s*(?:no\.?\s*)?(?:XX|xx|\*{2,})?\s*(\d{4,6})/i,
    type: "income",
    amountGroup: 1,
    confidence: 0.95,
  },
  {
    name: "credited_Rs_or_INR",
    // "credited with Rs.500" or "INR 500 credited"
    regex: /credited\s*(?:by|with)?\s*(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i,
    type: "income",
    amountGroup: 1,
    confidence: 0.85,
  },
  {
    name: "IMPS_NEFT_credit",
    // "IMPS of INR 500 received"
    regex: /(?:IMPS|NEFT|RTGS)\s*(?:of\s*)?(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s*(?:received|credited)/i,
    type: "income",
    amountGroup: 1,
    confidence: 0.90,
  },

  // ── GENERIC FALLBACKS ───────────────────────────────────
  {
    name: "generic_INR_debited",
    // "INR 500.00 debited" or "Rs.500 deducted"
    regex: /(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s*(?:has been\s*)?(?:debited|deducted)/i,
    type: "expense",
    amountGroup: 1,
    confidence: 0.80,
  },
  {
    name: "generic_INR_credited",
    // "INR 500.00 credited" or "Rs.500 credited"
    regex: /(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s*(?:has been\s*)?credited/i,
    type: "income",
    amountGroup: 1,
    confidence: 0.80,
  },
  {
    name: "generic_INR_at_merchant",
    // "INR 175.00 at AMAZON" — Amex-style standalone transaction mentions
    regex: /(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s+at\s+([A-Z][A-Za-z0-9\s&'.,-]+?)(?:\s+is[:\s]|\.|$)/i,
    type: "expense",
    amountGroup: 1,
    confidence: 0.75,
  },
];

// ═══════════════════════════════════════════════════════════
// KNOWN BANK SENDERS
// ═══════════════════════════════════════════════════════════

export const KNOWN_BANK_SENDERS = [
  // HDFC Bank
  "alerts@hdfcbank.bank.in",
  "alerts@hdfcbank.net",
  "alerts@hdfcbank.com",
  "creditcardalerts@hdfcbank.com",
  // SBI
  "noreply@sbi.co.in",
  "alerts@sbi.co.in",
  // ICICI
  "alerts@icicibank.com",
  "noreply@icicibank.com",
  // Axis
  "alerts@axisbank.com",
  // Kotak
  "alerts.service@kotak.com",
  "alerts@kotak.com",
  // Yes Bank
  "alerts@yesbank.in",
  // PNB
  "alerts@pnb.co.in",
  // Paytm
  "noreply@paytmbank.com",
  // IndusInd
  "alerts@indusind.com",
  // American Express
  "americanexpress@welcome.americanexpress.com",
  "welcome.americanexpress.com",
  // Citibank
  "citibank@alerts.citibank.co.in",
  "alerts.citibank.co.in",
  // Standard Chartered
  "alerts@sc.com",
  // IDFC First
  "alerts@idfcfirstbank.com",
  // RBL Bank
  "alerts@rblbank.com",
  // AU Small Finance Bank
  "alerts@aubank.in",
];

// ═══════════════════════════════════════════════════════════
// MAIN PARSER
// ═══════════════════════════════════════════════════════════

export function parseTransactionText(text: string, emailDate?: string): ParsedTransaction | null {
  const cleanText = cleanEmailText(text);

  for (const pattern of PATTERNS) {
    const match = cleanText.match(pattern.regex);
    if (match) {
      const amount = parseAmount(match[pattern.amountGroup]);
      if (isNaN(amount) || amount <= 0) continue;

      const merchant = extractMerchant(cleanText) || "Bank Transaction";
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
