/**
 * SMS Parser Orchestrator
 * 3-layer pipeline: Regex (reused from email) → Gemini LLM → NVIDIA NIM fallback
 * 
 * Mirrors the gmail.ts sync pipeline but for SMS messages.
 */

import { parseTransactionText, extractLast4 } from "@/lib/email/parser";
import { parseSmsWithLLM } from "./llmParser";
import { parseSmsWithNvidia } from "./nvidiaParser";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface RawSms {
  id: string;
  user_id: string;
  sender: string;
  body: string;
  received_at: string;
}

export interface SmsParsedResult {
  amount: number;
  type: "income" | "expense" | "cc_payment";
  merchant: string;
  date: string;
  last4: string;
  confidence: number;
  rawSnippet: string;
  parsedBy: "sms-regex" | "sms-gemini" | "sms-nvidia";
  categoryId?: string;
  newCategory?: { name: string; icon: string; color: string; type: string };
}

// ═══════════════════════════════════════════════════════════
// ORCHESTRATOR
// ═══════════════════════════════════════════════════════════

export async function parseSmsToTransaction(
  sms: RawSms,
  config?: {
    regexEnabled?: boolean;
    llmEnabled?: boolean;
    settings?: any;
    categories?: any[];
  }
): Promise<SmsParsedResult | null> {
  const regexEnabled = config?.regexEnabled ?? true;
  const llmEnabled = config?.llmEnabled ?? false;

  console.log(`[SMS-ORCH] Processing SMS from ${sms.sender}: "${sms.body.slice(0, 80)}..."`);

  // ── Layer 1: Regex (reuse existing email parser) ──────────
  // The email parser's parseTransactionText() works on cleaned plain text.
  // SMS messages are already plain text, so the HTML stripping is a harmless no-op.
  if (regexEnabled) {
    const regexResult = parseTransactionText(sms.body, sms.received_at);
    if (regexResult && regexResult.confidence >= 0.8) {
      console.log(`[SMS-ORCH] ✓ Regex matched: Rs.${regexResult.amount} ${regexResult.type}`);
      return {
        amount: regexResult.amount,
        type: regexResult.type,
        merchant: regexResult.merchant,
        date: regexResult.date,
        last4: regexResult.last4,
        confidence: regexResult.confidence,
        rawSnippet: regexResult.rawSnippet,
        parsedBy: "sms-regex",
      };
    }
    console.log(`[SMS-ORCH] Regex did not match (or low confidence). Trying LLM...`);
  }

  // ── Layer 2 & 3: LLM (Gemini primary, NVIDIA fallback) ────
  if (llmEnabled) {
    const msgs = [{ id: sms.id, text: sms.body, sender: sms.sender }];

    let llmMap: Map<string, any> = new Map();
    let parsedBy: "sms-gemini" | "sms-nvidia" = "sms-gemini";

    if (config?.settings?.selected_llm_provider === "nvidia") {
      // User prefers NVIDIA as primary
      console.log(`[SMS-ORCH] Using NVIDIA NIM as primary LLM provider`);
      parsedBy = "sms-nvidia";
      const nvidia = await parseSmsWithNvidia(msgs, {
        nvidiaKey: config?.settings?.nvidia_api_key,
        nvidiaModel: config?.settings?.nvidia_model_id,
        existingCategories: config?.categories || [],
      });
      llmMap = nvidia.results;
      if (nvidia.providerFailed) {
        console.error(`[SMS-ORCH] NVIDIA NIM failed (${nvidia.failureReason || "unknown"}) — SMS left unparsed; retry from the /sms page.`);
      }
    } else {
      // Gemini primary, NVIDIA fallback
      console.log(`[SMS-ORCH] Using Gemini as primary LLM provider`);
      const gemini = await parseSmsWithLLM(msgs, {
        geminiKeys: config?.settings?.gemini_api_keys,
        geminiModel: config?.settings?.gemini_model_id,
        existingCategories: config?.categories || [],
      });
      llmMap = gemini.results;

      // Fail over only when Gemini itself failed — an empty result from a
      // healthy call means this SMS is not a transaction.
      if (gemini.providerFailed) {
        console.log(`[SMS-ORCH] Gemini failed (${gemini.failureReason || "unknown"}). Falling over to NVIDIA NIM...`);
        parsedBy = "sms-nvidia";
        const nvidia = await parseSmsWithNvidia(msgs, {
          nvidiaKey: config?.settings?.nvidia_api_key,
          nvidiaModel: config?.settings?.nvidia_model_id,
          existingCategories: config?.categories || [],
        });
        llmMap = nvidia.results;
        if (nvidia.providerFailed) {
          console.error(`[SMS-ORCH] Both LLM providers failed (Gemini: ${gemini.failureReason || "unknown"}; NVIDIA: ${nvidia.failureReason || "unknown"}) — SMS left unparsed; retry from the /sms page.`);
        }
      }
    }

    const llmResult = llmMap.get(sms.id);
    if (llmResult) {
      const regexLast4 = extractLast4(sms.body);
      const llmLast4 = llmResult.accountLast4 ? llmResult.accountLast4.slice(-4) : "";
      const finalLast4 = regexLast4 || llmLast4;
      console.log(`[SMS-ORCH] ✓ LLM matched: Rs.${llmResult.amount} ${llmResult.type} via ${parsedBy}`);
      console.log(`[SMS-ORCH] last4 override: LLM="${llmResult.accountLast4}" → regex="${regexLast4}" → final="${finalLast4}"`);
      return {
        amount: llmResult.amount,
        type: llmResult.type,
        merchant: llmResult.merchant || "Bank Transaction",
        date: llmResult.date || sms.received_at,
        // Always prefer regex extraction from raw text over LLM's value
        // (LLMs often get AMEX 5-digit card numbers wrong, e.g. '5100' instead of '1005')
        last4: finalLast4,
        confidence: llmResult.confidence,
        rawSnippet: sms.body.slice(0, 200),
        parsedBy,
        categoryId: llmResult.categoryId,
        newCategory: llmResult.newCategory,
      };
    }
  }

  console.log(`[SMS-ORCH] ✗ All layers failed for SMS ${sms.id}`);
  return null;
}
