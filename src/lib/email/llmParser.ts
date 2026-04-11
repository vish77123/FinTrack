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

let globalApiKeys: KeyState[] = [];
let keysInitialized = false;

function getNextMidnight(): number {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

function initGlobalKeys() {
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
  const now = Date.now();
  
  globalApiKeys = uniqueKeys.map(key => ({
    key,
    client: new GoogleGenAI({ apiKey: key }),
    requestsThisMinute: 0,
    requestsToday: 0,
    minuteResetAt: now + 60_000,
    dayResetAt: getNextMidnight(),
    lastError429At: 0,
  }));
}

function getRequestKeys(userKeys?: string[] | null): KeyState[] {
  initGlobalKeys();
  if (!userKeys || userKeys.length === 0) {
    return globalApiKeys;
  }
  
  const now = Date.now();
  return userKeys.map(key => ({
    key,
    client: new GoogleGenAI({ apiKey: key }),
    requestsThisMinute: 0,
    requestsToday: 0,
    minuteResetAt: now + 60_000,
    dayResetAt: getNextMidnight(),
    lastError429At: 0,
  }));
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

function pickBestKey(activeKeys: KeyState[]): KeyState | null {
  let best: KeyState | null = null;
  let bestRemaining = -1;

  for (const k of activeKeys) {
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
 * Fast-failing Gemini API call. 
 * Picks best key, rotates on 429/503. If all keys hit rate limits, returns instantly.
 */
async function rateLimitedGenerate(options: {
  model: string;
  contents: string;
  config?: Record<string, any>;
}, activeKeys: KeyState[]): Promise<string | null> {
  // Try all available keys efficiently without artificial wait loops
  const MAX_ATTEMPTS = activeKeys.length * 2;
  let attempt = 0;
  
  while (attempt < MAX_ATTEMPTS) {
    const keyState = pickBestKey(activeKeys);

    if (!keyState) {
      console.warn(`[LLM] All keys exhausted or on cooldown. Fast-failing instantly to fallback.`);
      return null;
    }

    try {
      const keyIndex = activeKeys.indexOf(keyState) + 1;
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
      const keyIndex = activeKeys.indexOf(keyState) + 1;

      if (status === 429 || err?.message?.includes("429")) {
        console.warn(`[LLM] Key ${keyIndex} hit 429. Rotating instantly...`);
        keyState.lastError429At = Date.now();
        attempt++;
        continue;
      }

      if (status === 503 || err?.message?.includes("503")) {
        console.warn(`[LLM] Key ${keyIndex} hit 503. Rotating instantly...`);
        keyState.lastError429At = Date.now(); // treat 503 as a cooldown block to force failover
        attempt++;
        continue;
      }

      console.error(`[LLM] Key ${keyIndex} error:`, err?.message || err);
      // Hard failure (not a temporary load error), fail instantly.
      return null;
    }
  }

  console.error("[LLM] All fast-fail retries exhausted.");
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
  emails: EmailForParsing[],
  config?: any
): Promise<Map<string, LLMParsedTransaction>> {
  const results = new Map<string, LLMParsedTransaction>();
  if (emails.length === 0) return results;

  const activeKeys = getRequestKeys(config?.geminiKeys);
  if (activeKeys.length === 0) return results;

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
    const targetModel = config?.geminiModel || "gemini-2.5-flash";
    console.log(`[LLM] Sending batch of ${emails.length} emails to ${targetModel}...`);

    const outputString = await rateLimitedGenerate({
      model: targetModel,
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
    }, activeKeys);

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
  initGlobalKeys();
  return globalApiKeys.map((k, i) => {
    resetCountersIfNeeded(k);
    return {
      keyIndex: i + 1,
      rpm: k.requestsThisMinute,
      rpd: k.requestsToday,
      available: isKeyAvailable(k),
    };
  });
}
