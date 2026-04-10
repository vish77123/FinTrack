/**
 * Bytez LLM Parser — Ultimate Fallback
 * Utilizes the official Bytez.js SDK or OpenAI-compatible endpoint.
 * Requires BYTEZ_API_KEY in .env.local
 */

export interface LLMParsedTransaction {
  amount: number;
  type: "income" | "expense";
  merchant: string;
  date: string;
  accountLast4?: string;
  confidence: number;
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
// BATCH BYTEZ PARSER
// Uses the official bytez.js SDK with Qwen2.5-7B-Instruct
// ═══════════════════════════════════════════════════════════

export async function parseBatchWithBytez(
  emails: { id: string; text: string }[]
): Promise<Map<string, LLMParsedTransaction>> {
  const results = new Map<string, LLMParsedTransaction>();
  if (emails.length === 0) return results;

  const apiKey = process.env.BYTEZ_API_KEY;
  if (!apiKey) {
    console.warn("[BYTEZ] BYTEZ_API_KEY not configured. Skipping Bytez fallback.");
    return results;
  }

  const bytez = new Bytez(apiKey);

  const emailsBlock = emails.map((email, idx) => `
--- EMAIL ${idx + 1} (ID: ${email.id}) ---
${sanitize(email.text)}
`).join("\n");

  const prompt = `You are an expert financial extraction engine.
Parse ALL of the following ${emails.length} bank alert emails and return a JSON ARRAY of results.

For EACH email, extract:
1. "emailId" — the ID provided in the header (copy it exactly)
2. "amount" — clean number (e.g. 500.50)
3. "merchant" — payee name, cleaned up
4. "type" — "expense" if debited/spent/paid, "income" if credited/received
5. "accountLast4" — 4-digit account/card reference if present
6. "date" — ISO 8601 date string if explicitly mentioned in text

Return ONLY the JSON array. Do not wrap it in markdown. Do not provide any explanation.
If an email is NOT a monetary transaction, still include it with emailId and all other fields null.

${emailsBlock}
`;

  try {
    console.log(`[BYTEZ] Sending batch of ${emails.length} emails to Bytez SDK (Qwen/Qwen2.5-7B-Instruct)...`);

    // Wrap the prompt in chat format to enforce instruction-following instead of getting a conversational greeting
    const response = await bytez.model("Qwen/Qwen2.5-7B-Instruct").run([
      { role: "system", content: "You are a strictly deterministic extraction engine. Always output a raw JSON array." },
      { role: "user", content: prompt }
    ], { max_new_tokens: 2000 });

    if (response.error) {
      console.warn(`[BYTEZ] API failed with error: ${response.error}`);
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
    
    console.log(`[BYTEZ] Raw response: ${outputString.slice(0, 600)}...`);

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
            console.error(`[BYTEZ] JSON.parse failed on matched block: ${e3.message}`);
          }
        } else {
          console.error(`[BYTEZ] JSON.parse completely failed. Cleaned string did not contain array block.`);
        }
      }
    }

    if (Array.isArray(parsedArray)) {
      console.log(`[BYTEZ] Parsed ${parsedArray.length} items:`);

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
        });
      }
    }

    console.log(`[BYTEZ ✓] ${results.size}/${emails.length} transactions extracted via Bytez`);

  } catch (err) {
    console.error("[BYTEZ] Parsing failed:", err);
  }

  return results;
}
