/**
 * SMS Parser Orchestrator
 * 3-layer pipeline: Regex (reused from email) → Gemini LLM → Bytez fallback
 * 
 * Mirrors the gmail.ts sync pipeline but for SMS messages.
 */

import { parseTransactionText } from "@/lib/email/parser";
import { parseSmsWithLLM } from "./llmParser";
import { parseSmsWithBytez } from "./bytezParser";

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
  parsedBy: "sms-regex" | "sms-gemini" | "sms-bytez";
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

  // ── Layer 2 & 3: LLM (Gemini primary, Bytez fallback) ────
  if (llmEnabled) {
    const msgs = [{ id: sms.id, text: sms.body, sender: sms.sender }];

    let llmMap: Map<string, any> = new Map();
    let parsedBy: "sms-gemini" | "sms-bytez" = "sms-gemini";

    if (config?.settings?.selected_llm_provider === "bytez") {
      // User prefers Bytez as primary
      console.log(`[SMS-ORCH] Using Bytez as primary LLM provider`);
      parsedBy = "sms-bytez";
      llmMap = await parseSmsWithBytez(msgs, {
        bytezKey: config?.settings?.bytez_api_key,
        bytezModel: config?.settings?.bytez_model_id,
        existingCategories: config?.categories || [],
      });
    } else {
      // Gemini primary, Bytez fallback
      console.log(`[SMS-ORCH] Using Gemini as primary LLM provider`);
      llmMap = await parseSmsWithLLM(msgs, {
        geminiKeys: config?.settings?.gemini_api_keys,
        geminiModel: config?.settings?.gemini_model_id,
        existingCategories: config?.categories || [],
      });

      if (llmMap.size === 0) {
        console.log(`[SMS-ORCH] Gemini returned nothing. Falling over to Bytez...`);
        parsedBy = "sms-bytez";
        llmMap = await parseSmsWithBytez(msgs, {
          bytezKey: config?.settings?.bytez_api_key,
          bytezModel: config?.settings?.bytez_model_id,
          existingCategories: config?.categories || [],
        });
      }
    }

    const llmResult = llmMap.get(sms.id);
    if (llmResult) {
      console.log(`[SMS-ORCH] ✓ LLM matched: Rs.${llmResult.amount} ${llmResult.type} via ${parsedBy}`);
      return {
        amount: llmResult.amount,
        type: llmResult.type,
        merchant: llmResult.merchant || "Bank Transaction",
        date: llmResult.date || sms.received_at,
        last4: llmResult.accountLast4 || "",
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
