/**
 * NVIDIA NIM LLM Parser — Layer 3 (Fallback)
 * Uses the NVIDIA build.nvidia.com OpenAI-compatible API.
 * Default model: google/gemma-3n-e4b-it
 * Requires NVIDIA_API_KEY in .env.local
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

// ═══════════════════════════════════════════════════════════
// BATCH NVIDIA PARSER
// Uses the OpenAI-compatible /chat/completions endpoint
// ═══════════════════════════════════════════════════════════

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

export async function parseBatchWithNvidia(
  emails: { id: string; text: string }[],
  config?: any
): Promise<Map<string, LLMParsedTransaction>> {
  const results = new Map<string, LLMParsedTransaction>();
  if (emails.length === 0) return results;

  const apiKey = config?.nvidiaKey || process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.warn("[NVIDIA] No API key configured. Skipping NVIDIA fallback.");
    return results;
  }

  const targetModel = config?.nvidiaModel || "google/gemma-3n-e4b-it";

  const emailsBlock = emails.map((email, idx) => `
--- EMAIL ${idx + 1} (ID: ${email.id}) ---
${sanitize(email.text)}
`).join("\n");

  const existingCategories = config?.existingCategories || [];
  const categoriesContext = existingCategories.length > 0 
    ? `\nExisting User Categories:\n${JSON.stringify(existingCategories, null, 2)}\n`
    : `\nThe user has no existing categories.\n`;

  const prompt = `You are an expert financial extraction engine.
Parse ALL of the following ${emails.length} bank alert emails and return a JSON ARRAY of results.

For EACH email, extract:
1. "emailId" — the ID provided in the header (copy it exactly)
2. "amount" — clean number (e.g. 500.50)
3. "merchant" — payee name, cleaned up
4. "type" — "expense" if debited/spent/paid, "income" if credited/received
5. "accountLast4" — Extract ONLY the last 4 digits of the account or card number. Some cards (e.g. AMEX) show 5 digits like '** 51005' — return only the last 4: '1005', NOT '5100'. For 'XX1234' return '1234'. If not present, return null.
6. "date" — ISO 8601 date string if explicitly mentioned in text
7. "categoryId" — Use the provided "Existing User Categories". If the merchant fits cleanly into one, return its ID. If NOT, leave it null.
8. "newCategory" — If "categoryId" is null, propose a new vibrant category object with: "name", "icon", "color", and "type" (matching the transaction type).

Return ONLY the JSON array. Do not wrap it in markdown. Do not provide any explanation.
If an email is NOT a monetary transaction, still include it with emailId and all other fields null.

${categoriesContext}
${emailsBlock}
`;

  try {
    console.log(`[NVIDIA] Sending batch of ${emails.length} emails to NVIDIA NIM (${targetModel})...`);

    const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: targetModel,
        messages: [
          { role: "system", content: "You are a strictly deterministic extraction engine. Always output a raw JSON array. No markdown, no explanation." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[NVIDIA] API failed (${response.status}): ${errText.slice(0, 300)}`);
      return results;
    }

    const data = await response.json();
    let outputString = data.choices?.[0]?.message?.content || "";

    console.log(`[NVIDIA] Raw response: ${outputString.slice(0, 600)}...`);

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
            console.error(`[NVIDIA] JSON.parse failed on matched block: ${e3.message}`);
          }
        } else {
          console.error(`[NVIDIA] JSON.parse completely failed. Cleaned string did not contain array block.`);
        }
      }
    }

    if (Array.isArray(parsedArray)) {
      console.log(`[NVIDIA] Parsed ${parsedArray.length} items:`);

      for (const item of parsedArray) {
        console.log(`  [${item.emailId}] amount=${item.amount} type=${item.type} merchant=${item.merchant} date=${item.date}`);

        if (!item.emailId || !item.amount || Number(item.amount) <= 0) continue;

        results.set(item.emailId, {
          amount: Number(item.amount),
          type: item.type === "income" ? "income" : "expense",
          merchant: item.merchant || "Bank Transaction",
          date: item.date || new Date().toISOString().split("T")[0],
          accountLast4: item.accountLast4 ? String(item.accountLast4).slice(-4) : undefined,
          confidence: 0.80,
          categoryId: item.categoryId || undefined,
          newCategory: item.newCategory || undefined,
        });
      }
    }

    console.log(`[NVIDIA ✓] ${results.size}/${emails.length} transactions extracted via NVIDIA NIM`);

  } catch (err) {
    console.error("[NVIDIA] Parsing failed:", err);
  }

  return results;
}
