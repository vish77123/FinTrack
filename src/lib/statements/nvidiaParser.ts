/**
 * Statement parser — NVIDIA NIM (fallback provider).
 * OpenAI-compatible /chat/completions on integrate.api.nvidia.com, same
 * endpoint and defaults as the email/SMS Layer-3 parsers.
 */

import { buildStatementPrompt, extractJsonObject, finalizeStatement, maskLongNumbers } from "./prompt";
import type { ParsedStatement, StatementParseOptions } from "./types";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_MODEL = "google/gemma-3n-e4b-it";
const MAX_OUTPUT_TOKENS = 8192;

export async function parseStatementWithNvidia(
  statementText: string,
  options: StatementParseOptions
): Promise<{ result?: ParsedStatement; error?: string }> {
  const apiKey = options.nvidiaApiKey || process.env.NVIDIA_API_KEY;
  if (!apiKey) return { error: "No NVIDIA API key configured." };

  const model = options.nvidiaModelId || DEFAULT_MODEL;
  const prompt = buildStatementPrompt(maskLongNumbers(statementText));

  try {
    const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are a strictly deterministic extraction engine. Always output a raw JSON object. No markdown, no explanation." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
    });

    if (!response.ok) {
      return { error: `NVIDIA API error: ${response.status} ${response.statusText}` };
    }

    const data = await response.json();
    const text: string | undefined = data?.choices?.[0]?.message?.content;
    if (!text) return { error: "NVIDIA returned an empty response." };

    const parsed = extractJsonObject(text);
    if (!parsed) return { error: "NVIDIA response was not valid JSON." };

    return finalizeStatement(parsed, "nvidia");
  } catch (err: unknown) {
    const message = (err as { message?: string })?.message || "unknown error";
    return { error: `NVIDIA request failed: ${message}` };
  }
}
