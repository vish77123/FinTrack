/**
 * Statement parser — Gemini (primary provider).
 *
 * One statement = one API call (no batching needed at ~12 statements/year per
 * card). Rotates across the user's configured keys (falling back to env keys)
 * on 429/503, mirroring the email pipeline's behavior in simplified form.
 */

import { GoogleGenAI } from "@google/genai";
import { buildStatementPrompt, extractJsonObject, finalizeStatement, maskLongNumbers } from "./prompt";
import type { ParsedStatement, StatementParseOptions } from "./types";

const DEFAULT_MODEL = "gemini-2.5-flash";

function resolveKeys(userKeys?: string[] | null): string[] {
  if (userKeys && userKeys.length > 0) return userKeys.filter(Boolean);
  const envKeys = [
    process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY || "",
    process.env.GEMINI_API_KEY_2 || "",
  ];
  return Array.from(new Set(envKeys.filter(Boolean)));
}

export async function parseStatementWithGemini(
  statementText: string,
  options: StatementParseOptions
): Promise<{ result?: ParsedStatement; error?: string }> {
  const keys = resolveKeys(options.geminiKeys);
  if (keys.length === 0) return { error: "No Gemini API key configured." };

  const model = options.geminiModelId || DEFAULT_MODEL;
  const prompt = buildStatementPrompt(maskLongNumbers(statementText));

  let lastError = "Gemini request failed.";

  for (const key of keys) {
    try {
      const client = new GoogleGenAI({ apiKey: key });
      const response = await client.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.1,
          responseMimeType: "application/json",
          // Large statements can run to 150+ lines; don't truncate mid-array
          maxOutputTokens: 32768,
        },
      });

      const text = response.text ?? null;
      if (!text) {
        lastError = "Gemini returned an empty response.";
        continue;
      }

      const parsed = extractJsonObject(text);
      if (!parsed) {
        lastError = "Gemini response was not valid JSON.";
        continue;
      }

      return finalizeStatement(parsed, "gemini");
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      const status = e?.status;
      const message = e?.message || "unknown error";
      // 429/503: rotate to the next key; anything else is likely fatal for
      // every key (bad model id, malformed request) but rotating is harmless
      console.warn(`[STMT][GEMINI] Request failed (${status ?? "?"}): ${message}`);
      lastError = `Gemini error: ${message}`;
    }
  }

  return { error: lastError };
}
