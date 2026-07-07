/**
 * Statement parsing orchestrator: Gemini → NVIDIA NIM fallback.
 *
 * Honors the user's selected_llm_provider from email_sync_settings — when it
 * is "nvidia", NVIDIA runs first and Gemini becomes the fallback. There is
 * deliberately NO regex layer here (unlike email/SMS): full statement tables
 * are too layout-variable, and volume is tiny.
 */

import { parseStatementWithGemini } from "./llmParser";
import { parseStatementWithNvidia } from "./nvidiaParser";
import type { ParsedStatement, StatementParseOptions } from "./types";

export async function parseStatementText(
  statementText: string,
  options: StatementParseOptions
): Promise<{ result?: ParsedStatement; error?: string }> {
  const nvidiaFirst = options.selectedProvider === "nvidia";
  const order = nvidiaFirst
    ? [parseStatementWithNvidia, parseStatementWithGemini]
    : [parseStatementWithGemini, parseStatementWithNvidia];

  const errors: string[] = [];
  for (const parse of order) {
    const outcome = await parse(statementText, options);
    if (outcome.result) return outcome;
    if (outcome.error) errors.push(outcome.error);
  }

  return { error: `Statement parsing failed. ${errors.join(" | ")}` };
}
