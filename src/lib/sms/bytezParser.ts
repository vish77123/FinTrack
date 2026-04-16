/**
 * SMS Bytez LLM Parser — Layer 3 (Ultimate Fallback)
 * Adapted from src/lib/email/bytezParser.ts for SMS-specific parsing.
 * Uses the official Bytez.js SDK.
 */

export interface LLMParsedTransaction {
  amount: number;
  type: "income" | "expense";
  merchant: string;
  date: string;
  accountLast4?: string;
  confidence: number;
  categoryId?: string;
  newCategory?: {
    name: string;
    icon: string;
    color: string;
    type: "income" | "expense";
  };
}

// ═══════════════════════════════════════════════════════════
// PII STRIPPING
// ═══════════════════════════════════════════════════════════

function sanitize(text: string): string {
  return text
    .replace(/\b\d{10,}\b/g, "XXXX")
    .replace(/[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+/g, "")
    .replace(/\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g, "XXXX")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

import Bytez from "bytez.js";

// ═══════════════════════════════════════════════════════════
// SMS BATCH BYTEZ PARSER
// ═══════════════════════════════════════════════════════════

interface SmsForParsing {
  id: string;
  text: string;
  sender?: string;
}

export async function parseSmsWithBytez(
  messages: SmsForParsing[],
  config?: any
): Promise<Map<string, LLMParsedTransaction>> {
  const results = new Map<string, LLMParsedTransaction>();
  if (messages.length === 0) return results;

  const apiKey = config?.bytezKey || process.env.BYTEZ_API_KEY;
  if (!apiKey) {
    console.warn("[SMS-BYTEZ] No API key configured. Skipping Bytez fallback.");
    return results;
  }

  const bytez = new Bytez(apiKey);
  const targetModel = config?.bytezModel || "Qwen/Qwen2.5-7B-Instruct";

  const messagesBlock = messages.map((msg, idx) => `
--- SMS ${idx + 1} (ID: ${msg.id}) ---
Sender: ${msg.sender || "Unknown"}
${sanitize(msg.text)}
`).join("\n");

  const existingCategories = config?.existingCategories || [];
  const categoriesContext = existingCategories.length > 0 
    ? `\nExisting User Categories:\n${JSON.stringify(existingCategories, null, 2)}\n`
    : `\nThe user has no existing categories.\n`;

  const prompt = `You are an expert financial extraction engine for Indian bank SMS alerts.
SMS messages are short (< 200 chars), plain text, no HTML. The sender ID (e.g. BW-HDFCBK, AD-ICICIT) identifies the bank.

Parse ALL of the following ${messages.length} bank SMS messages and return a JSON ARRAY of results.

For EACH SMS, extract:
1. "emailId" — the ID provided in the header (copy it exactly)
2. "amount" — clean number (e.g. 500.50)
3. "merchant" — payee name, cleaned up
4. "type" — "expense" if debited/spent/paid, "income" if credited/received
5. "accountLast4" — 4-digit account/card reference if present
6. "date" — ISO 8601 date string if explicitly mentioned in text
7. "categoryId" — Use the provided "Existing User Categories". If the merchant fits cleanly into one, return its ID. If NOT, leave it null.
8. "newCategory" — If "categoryId" is null, propose a new vibrant category object with: "name", "icon", "color", and "type" (matching the transaction type).

Return ONLY the JSON array. Do not wrap it in markdown. Do not provide any explanation.
If an SMS is NOT a monetary transaction, still include it with emailId and all other fields null.

${categoriesContext}
${messagesBlock}
`;

  try {
    console.log(`[SMS-BYTEZ] Sending batch of ${messages.length} SMS to Bytez SDK (${targetModel})...`);

    const response = await bytez.model(targetModel).run([
      { role: "system", content: "You are a strictly deterministic extraction engine. Always output a raw JSON array." },
      { role: "user", content: prompt }
    ], { max_new_tokens: 2000 });

    if (response.error) {
      console.warn(`[SMS-BYTEZ] API failed with error: ${response.error}`);
      return results;
    }

    let outputString = "";
    if (typeof response.output === 'string') {
      outputString = response.output;
    } else if (response.output?.content) {
      outputString = response.output.content;
    } else {
      outputString = JSON.stringify(response.output);
    }
    
    console.log(`[SMS-BYTEZ] Raw response: ${outputString.slice(0, 600)}...`);

    let parsedArray: any[] = [];
    try {
      parsedArray = JSON.parse(outputString);
    } catch (e1: any) {
      const cleaned = outputString.replace(/```json/gi, "").replace(/```/g, "").trim();
      try {
        parsedArray = JSON.parse(cleaned);
      } catch (e2: any) {
        const match = cleaned.match(/\[[\s\S]*\]/);
        if (match) {
          try {
            parsedArray = JSON.parse(match[0]);
          } catch (e3: any) {
            console.error(`[SMS-BYTEZ] JSON.parse failed on matched block: ${e3.message}`);
          }
        } else {
          console.error(`[SMS-BYTEZ] JSON.parse completely failed.`);
        }
      }
    }

    if (Array.isArray(parsedArray)) {
      console.log(`[SMS-BYTEZ] Parsed ${parsedArray.length} items:`);

      for (const item of parsedArray) {
        console.log(`  [${item.emailId}] amount=${item.amount} type=${item.type} merchant=${item.merchant} date=${item.date}`);

        if (!item.emailId || !item.amount || Number(item.amount) <= 0) continue;

        results.set(item.emailId, {
          amount: Number(item.amount),
          type: item.type === "income" ? "income" : "expense",
          merchant: item.merchant || "Bank Transaction",
          date: item.date || new Date().toISOString().split("T")[0],
          accountLast4: item.accountLast4 || undefined,
          confidence: 0.80,
          categoryId: item.categoryId || undefined,
          newCategory: item.newCategory || undefined,
        });
      }
    }

    console.log(`[SMS-BYTEZ ✓] ${results.size}/${messages.length} transactions extracted via Bytez`);

  } catch (err) {
    console.error("[SMS-BYTEZ] Parsing failed:", err);
  }

  return results;
}
