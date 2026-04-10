/**
 * Gemini LLM Parser — Layer 2
 * Adapted from the working FinTrackPro implementation.
 * 
 * Uses @google/genai SDK with gemini-2.5-flash only.
 * Batched: all emails → 1 API call.
 * Rate-limited: dual-key round-robin with 429 cooldown.
 */

import { GoogleGenAI } from "@google/genai";

export interface LLMParsedTransaction {
  amount: number;
  type: "income" | "expense";
  merchant: string;
  date: string;
  accountLast4?: string;
  confidence: number;
}

// ═══════════════════════════════════════════════════════════
// RATE-LIMITED CLIENT (adapted from working rateLimitedClient.ts)
// ═══════════════════════════════════════════════════════════

interface KeyState {
  key: string;
  client: GoogleGenAI;
  requestsThisMinute: number;
  requestsToday: number;
  minuteResetAt: number;
  dayResetAt: number;
  lastError429At: number;
}

const RPM_LIMIT = 5;
const RPD_LIMIT = 20;

let apiKeys: KeyState[] = [];
let keysInitialized = false;

function getNextMidnight(): number {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

function initKeys() {
  if (keysInitialized) return;
  keysInitialized = true;

  const keyStrings: string[] = [];
  if (process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY) {
    keyStrings.push(process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY || "");
  }
  if (process.env.GEMINI_API_KEY_2) {
    keyStrings.push(process.env.GEMINI_API_KEY_2);
  }

  const uniqueKeys = Array.from(new Set(keyStrings.filter(Boolean)));

  if (uniqueKeys.length === 0) {
    console.warn("[LLM] No GEMINI_API_KEY configured.");
    return;
  }

  const now = Date.now();
  apiKeys = uniqueKeys.map(key => ({
    key,
    client: new GoogleGenAI({ apiKey: key }),
    requestsThisMinute: 0,
    requestsToday: 0,
    minuteResetAt: now + 60_000,
    dayResetAt: getNextMidnight(),
    lastError429At: 0,
  }));

  console.log(`[LLM] Initialized ${apiKeys.length} API key(s). Limits: ${RPM_LIMIT} RPM, ${RPD_LIMIT} RPD per key.`);
}

function resetCountersIfNeeded(state: KeyState): void {
  const now = Date.now();
  if (now >= state.minuteResetAt) {
    state.requestsThisMinute = 0;
    state.minuteResetAt = now + 60_000;
  }
  if (now >= state.dayResetAt) {
    state.requestsToday = 0;
    state.dayResetAt = getNextMidnight();
  }
}

function isKeyAvailable(state: KeyState): boolean {
  resetCountersIfNeeded(state);
  // 60s cooldown after 429
  if (state.lastError429At > 0 && Date.now() - state.lastError429At < 60_000) {
    return false;
  }
  return state.requestsThisMinute < RPM_LIMIT && state.requestsToday < RPD_LIMIT;
}

function pickBestKey(): KeyState | null {
  initKeys();
  let best: KeyState | null = null;
  let bestRemaining = -1;

  for (const k of apiKeys) {
    if (!isKeyAvailable(k)) continue;
    const remaining = RPD_LIMIT - k.requestsToday;
    if (remaining > bestRemaining) {
      bestRemaining = remaining;
      best = k;
    }
  }
  return best;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Rate-limited Gemini API call — exact pattern from the working codebase.
 * Picks best key, rotates on 429, waits if all exhausted.
 */
async function rateLimitedGenerate(options: {
  model: string;
  contents: string;
  config?: Record<string, any>;
}): Promise<string | null> {
  initKeys();
  const MAX_RETRIES = 2;
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    const keyState = pickBestKey();

    if (!keyState) {
      const now = Date.now();
      const nextMinuteReset = Math.min(...apiKeys.map(k => k.minuteResetAt));
      const waitMs = Math.max(nextMinuteReset - now, 5_000) + 1_000;
      console.warn(`[LLM] All keys exhausted. Waiting ${Math.round(waitMs / 1000)}s...`);
      await sleep(waitMs);
      attempt++; // exhaustion counts as an attempt
      continue;
    }

    try {
      const keyIndex = apiKeys.indexOf(keyState) + 1;
      const response = await keyState.client.models.generateContent({
        model: options.model,
        contents: options.contents,
        config: options.config,
      });

      keyState.requestsThisMinute++;
      keyState.requestsToday++;
      keyState.lastError429At = 0;
      return response.text ?? null;

    } catch (err: any) {
      const status = err?.status || err?.httpStatusCode || err?.code;
      const keyIndex = apiKeys.indexOf(keyState) + 1;

      if (status === 429 || err?.message?.includes("429")) {
        console.warn(`[LLM] Key ${keyIndex} hit 429. Rotating key (attempt not consumed).`);
        keyState.lastError429At = Date.now();
        // Do NOT increment attempt — we just rotate to another key
        continue;
      }

      if (status === 503 || err?.message?.includes("503")) {
        console.warn(`[LLM] Key ${keyIndex} hit 503. Waiting 10s...`);
        await sleep(2000);
        attempt++; // 503 is a real failure, count it
        continue;
      }

      console.error(`[LLM] Key ${keyIndex} error:`, err?.message || err);
      throw err;
    }
  }

  console.error("[LLM] All retries exhausted.");
  return null;
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
// SINGLE EMAIL PARSE (compatibility)
// ═══════════════════════════════════════════════════════════

export async function parseWithLLM(snippet: string): Promise<LLMParsedTransaction | null> {
  const results = await parseBatchWithLLM([{ id: "single", text: snippet }]);
  return results.get("single") || null;
}

// ═══════════════════════════════════════════════════════════
// BATCH LLM PARSE — mirrors the working batchParseEmails
// ═══════════════════════════════════════════════════════════

interface EmailForParsing {
  id: string;
  text: string;
}

export async function parseBatchWithLLM(
  emails: EmailForParsing[]
): Promise<Map<string, LLMParsedTransaction>> {
  const results = new Map<string, LLMParsedTransaction>();
  if (emails.length === 0) return results;

  initKeys();
  if (apiKeys.length === 0) return results;

  // Build the prompt — same structure as the working FinTrackPro code
  const emailsBlock = emails.map((email, idx) => `
--- EMAIL ${idx + 1} (ID: ${email.id}) ---
${sanitize(email.text)}
`).join("\n");

  const batchPrompt = `
You are an expert financial extraction engine.
Parse ALL of the following ${emails.length} bank alert emails and return a JSON ARRAY of results.

For EACH email, extract:
1. "emailId" — the ID provided in the header (copy it exactly)
2. "amount" — clean number (e.g. 500.50)
3. "merchant" — payee name, cleaned up
4. "type" — "expense" if debited/spent/paid, "income" if credited/received
5. "accountLast4" — 4-digit account/card reference if present
6. "date" — ISO 8601 date string if explicitly mentioned in text

If an email is NOT a monetary transaction, still include it with emailId and all other fields null.

${emailsBlock}
`;

  try {
    console.log(`[LLM] Sending batch of ${emails.length} emails to gemini-2.5-flash...`);

    const outputString = await rateLimitedGenerate({
      model: "gemini-2.5-flash",
      contents: batchPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              emailId: { type: "STRING" },
              amount: { type: "NUMBER" },
              merchant: { type: "STRING" },
              type: { type: "STRING", enum: ["income", "expense"] },
              accountLast4: { type: "STRING" },
              date: { type: "STRING" },
            },
            required: ["emailId"],
          },
        },
      },
    });

    console.log(`[LLM] Raw response: ${outputString?.slice(0, 600) || "(empty)"}`);

    if (!outputString) return results;

    let parsedArray: any[] = [];
    try {
      parsedArray = JSON.parse(outputString);
    } catch {
      // Robust fallback for markdown formatting
      const cleaned = outputString.replace(/```json/gi, "").replace(/```/g, "").trim();
      try {
        parsedArray = JSON.parse(cleaned);
      } catch {
        const match = cleaned.match(/\[[\s\S]*\]/);
        if (match) {
          parsedArray = JSON.parse(match[0]);
        }
      }
    }

    if (Array.isArray(parsedArray)) {
      console.log(`[LLM] Parsed ${parsedArray.length} items:`);

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

    console.log(`[LLM ✓] ${results.size}/${emails.length} transactions extracted`);

  } catch (err) {
    console.error("[LLM] Batch parsing failed:", err);
  }

  return results;
}

/**
 * Get current rate limit status
 */
export function getRateLimitStatus() {
  initKeys();
  return apiKeys.map((k, i) => {
    resetCountersIfNeeded(k);
    return {
      keyIndex: i + 1,
      rpm: k.requestsThisMinute,
      rpd: k.requestsToday,
      available: isKeyAvailable(k),
    };
  });
}
