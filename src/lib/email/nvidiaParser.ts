/**
 * NVIDIA NIM LLM Parser — Layer 3 (Fallback)
 * Uses the NVIDIA build.nvidia.com OpenAI-compatible API.
 * Default model: google/gemma-3n-e4b-it
 * Requires NVIDIA_API_KEY in .env.local
 *
 * Emails are processed in small chunks: with max_tokens capped, a single
 * request covering a large backlog (e.g. 50+ emails) gets its JSON response
 * truncated mid-array and the whole batch fails as unparseable. Each parsed
 * item costs roughly 60–120 output tokens, so CHUNK_SIZE × ~120 must stay
 * comfortably under MAX_OUTPUT_TOKENS.
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
// CHUNKED NVIDIA PARSER
// Uses the OpenAI-compatible /chat/completions endpoint
// ═══════════════════════════════════════════════════════════

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const CHUNK_SIZE = 10;
const MAX_OUTPUT_TOKENS = 2048;
// Stop hammering a broken/unreachable API after this many chunk failures in a row
const MAX_CONSECUTIVE_FAILURES = 2;

export interface ParserOutcome {
  results: Map<string, LLMParsedTransaction>;
  /**
   * true when the provider itself failed for EVERY chunk (no key configured,
   * API errors, unparseable responses) — distinct from a successful call that
   * found no transactions in the input.
   */
  providerFailed: boolean;
  failureReason?: string;
  /** Emails that were in failed (or skipped-after-abort) chunks. */
  failedCount?: number;
}

type ChunkResult =
  | { ok: true; items: any[] }
  | { ok: false; failureReason: string };

async function parseNvidiaChunk(
  chunk: { id: string; text: string }[],
  apiKey: string,
  targetModel: string,
  categoriesContext: string
): Promise<ChunkResult> {
  const emailsBlock = chunk.map((email, idx) => `
--- EMAIL ${idx + 1} (ID: ${email.id}) ---
${sanitize(email.text)}
`).join("\n");

  const prompt = `You are an expert financial extraction engine.
Parse ALL of the following ${chunk.length} bank alert emails and return a JSON ARRAY of results.

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
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[NVIDIA] API failed (${response.status}): ${errText.slice(0, 300)}`);
      return { ok: false, failureReason: `nvidia_http_${response.status}` };
    }

    const data = await response.json();
    const outputString = data.choices?.[0]?.message?.content || "";

    console.log(`[NVIDIA] Raw response: ${outputString.slice(0, 600)}...`);

    let parsedArray: any[] | null = null;
    try {
      parsedArray = JSON.parse(outputString);
    } catch {
      const cleaned = outputString.replace(/```json/gi, "").replace(/```/g, "").trim();
      try {
        parsedArray = JSON.parse(cleaned);
      } catch {
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

    if (!Array.isArray(parsedArray)) {
      // Model produced no usable JSON at all — a provider failure, not
      // "these emails contain no transactions".
      return { ok: false, failureReason: "nvidia_unparseable_response" };
    }

    return { ok: true, items: parsedArray };
  } catch (err) {
    console.error("[NVIDIA] Chunk request failed:", err);
    return { ok: false, failureReason: "nvidia_exception" };
  }
}

export async function parseBatchWithNvidia(
  emails: { id: string; text: string }[],
  config?: any
): Promise<ParserOutcome> {
  const results = new Map<string, LLMParsedTransaction>();
  if (emails.length === 0) return { results, providerFailed: false };

  const apiKey = config?.nvidiaKey || process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.warn("[NVIDIA] No API key configured. Skipping NVIDIA fallback.");
    return { results, providerFailed: true, failureReason: "no_nvidia_key", failedCount: emails.length };
  }

  const targetModel = config?.nvidiaModel || "google/gemma-3n-e4b-it";

  const existingCategories = config?.existingCategories || [];
  const categoriesContext = existingCategories.length > 0
    ? `\nExisting User Categories:\n${JSON.stringify(existingCategories, null, 2)}\n`
    : `\nThe user has no existing categories.\n`;

  const chunks: { id: string; text: string }[][] = [];
  for (let i = 0; i < emails.length; i += CHUNK_SIZE) {
    chunks.push(emails.slice(i, i + CHUNK_SIZE));
  }

  console.log(`[NVIDIA] Sending ${emails.length} emails to NVIDIA NIM (${targetModel}) in ${chunks.length} chunk(s) of ≤${CHUNK_SIZE}...`);

  let chunksSucceeded = 0;
  let failedCount = 0;
  let firstFailureReason: string | undefined;
  let consecutiveFailures = 0;

  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c];
    const outcome = await parseNvidiaChunk(chunk, apiKey, targetModel, categoriesContext);

    if (!outcome.ok) {
      failedCount += chunk.length;
      firstFailureReason = firstFailureReason || outcome.failureReason;
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && c < chunks.length - 1) {
        // API is likely down/misconfigured — count the rest as failed instead
        // of hammering it once per remaining chunk.
        const remaining = chunks.slice(c + 1).reduce((sum, ch) => sum + ch.length, 0);
        failedCount += remaining;
        console.warn(`[NVIDIA] ${consecutiveFailures} consecutive chunk failures — skipping ${remaining} remaining email(s) this run.`);
        break;
      }
      continue;
    }

    consecutiveFailures = 0;
    chunksSucceeded++;

    for (const item of outcome.items) {
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

  console.log(`[NVIDIA ✓] ${results.size}/${emails.length} transactions extracted via NVIDIA NIM (${chunksSucceeded}/${chunks.length} chunks ok)`);

  return {
    results,
    providerFailed: chunksSucceeded === 0,
    failureReason: firstFailureReason,
    ...(failedCount > 0 ? { failedCount } : {}),
  };
}
