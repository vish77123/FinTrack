"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ═══════════════════════════════════════════════════════════
// SMS LOG ENTRIES
// ═══════════════════════════════════════════════════════════

export async function getSmsLogsAction() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { logs: [] };

  // Fetch raw_sms with LEFT JOIN to pending_transactions via raw_sms_id
  const { data: rawSms } = await supabase
    .from("raw_sms")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!rawSms || rawSms.length === 0) return { logs: [] };

  // Fetch pending_transactions that reference these SMS
  const smsIds = rawSms.map(s => s.id);
  const { data: pendingTxns } = await supabase
    .from("pending_transactions")
    .select("id, raw_sms_id, status, amount, type, note, parsed_by")
    .eq("user_id", user.id)
    .in("raw_sms_id", smsIds);

  // Fetch confirmed transactions that originated from these SMS
  // (raw_sms_id is copied from pending → transactions on approval)
  const { data: confirmedTxns } = await supabase
    .from("transactions")
    .select("id, raw_sms_id, amount, type, note")
    .eq("user_id", user.id)
    .in("raw_sms_id", smsIds);

  // Build lookup maps: raw_sms_id → row
  const pendingMap = new Map<string, any>();
  if (pendingTxns) {
    for (const pt of pendingTxns) {
      if (pt.raw_sms_id) pendingMap.set(pt.raw_sms_id, pt);
    }
  }

  const confirmedMap = new Map<string, any>();
  if (confirmedTxns) {
    for (const ct of confirmedTxns) {
      if (ct.raw_sms_id) confirmedMap.set(ct.raw_sms_id, ct);
    }
  }

  // Build enriched logs
  const logs = rawSms.map(sms => {
    const confirmed = confirmedMap.get(sms.id);
    const pending = pendingMap.get(sms.id);

    let parseStatus: "parsed" | "pending" | "failed" = "failed";
    let parsedAmount: number | null = null;
    let parsedMerchant: string | null = null;
    let parsedBy: string | null = null;
    let pendingId: string | null = null;

    if (confirmed) {
      // Transaction was approved and moved to transactions table
      parseStatus = "parsed";
      parsedAmount = confirmed.amount;
      parsedMerchant = confirmed.note;
    } else if (pending) {
      // Still in pending_transactions, awaiting review
      pendingId = pending.id;
      parsedAmount = pending.amount;
      parsedMerchant = pending.note;
      parsedBy = pending.parsed_by;
      parseStatus = "pending";
    }

    return {
      id: sms.id,
      sender: sms.sender,
      body: sms.body,
      received_at: sms.received_at,
      created_at: sms.created_at,
      parseStatus,
      parsedAmount,
      parsedMerchant,
      parsedBy,
      pendingId,
    };
  });

  return { logs };
}

// ═══════════════════════════════════════════════════════════
// WEBHOOK SECRET MANAGEMENT
// ═══════════════════════════════════════════════════════════

export async function getWebhookSecretAction() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("webhook_secret")
    .eq("id", user.id)
    .single();

  return { secret: profile?.webhook_secret || null };
}

export async function regenerateWebhookSecretAction() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // Generate a new UUID secret
  const { data, error } = await supabase
    .rpc("gen_random_uuid");

  if (error) {
    // Fallback: generate in JS
    const newSecret = crypto.randomUUID();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ webhook_secret: newSecret })
      .eq("id", user.id);

    if (updateError) return { error: "Failed to regenerate secret" };
    revalidatePath("/settings");
    return { secret: newSecret };
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ webhook_secret: data })
    .eq("id", user.id);

  if (updateError) return { error: "Failed to regenerate secret" };

  revalidatePath("/settings");
  return { secret: data };
}

// ═══════════════════════════════════════════════════════════
// RETRY FAILED SMS PARSE
// ═══════════════════════════════════════════════════════════

export async function retrySmsParseAction(smsId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // 1. Fetch the raw SMS row
  const { data: sms, error: smsError } = await supabase
    .from("raw_sms")
    .select("*")
    .eq("id", smsId)
    .eq("user_id", user.id)
    .single();

  if (smsError || !sms) {
    return { error: "SMS not found" };
  }

  // 2. Check dedup — if a pending_transaction already exists, skip
  const { data: existingPending } = await supabase
    .from("pending_transactions")
    .select("id")
    .eq("raw_sms_id", smsId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingPending) {
    return { error: "A pending transaction already exists for this SMS" };
  }

  // 3. Fetch user settings
  const { data: settings } = await supabase
    .from("email_sync_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const regexEnabled = settings?.regex_enabled ?? true;
  const llmEnabled = settings?.llm_enabled ?? false;

  // 4. Fetch categories for LLM context
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, type")
    .eq("user_id", user.id);

  // 5. Run the 3-layer parser
  const { parseSmsToTransaction } = await import("@/lib/sms/orchestrator");
  const parsed = await parseSmsToTransaction(
    {
      id: sms.id,
      user_id: user.id,
      sender: sms.sender,
      body: sms.body,
      received_at: sms.received_at,
    },
    {
      regexEnabled,
      llmEnabled,
      settings,
      categories: categories || [],
    }
  );

  if (!parsed) {
    return { error: "Parsing failed again — LLM may still be unavailable" };
  }

  // 6. Account matching via alert profiles
  let matchedAccountId: string | null = null;
  const { data: alertProfiles } = await supabase
    .from("account_alert_profiles")
    .select("*, accounts(id, name)")
    .eq("user_id", user.id);

  if (alertProfiles && parsed.last4) {
    const match = alertProfiles.find((p: any) => p.account_last4 === parsed.last4);
    if (match) matchedAccountId = match.account_id;
  }

  // 7. Merchant rules
  const { data: merchantRules } = await supabase
    .from("merchant_rules")
    .select("*")
    .eq("user_id", user.id);

  const originalMerchantName = parsed.merchant;
  let finalCategoryId: string | null = parsed.categoryId || null;

  if (merchantRules && merchantRules.length > 0) {
    const ruleMatch = merchantRules.find(
      (r: any) => r.synced_name.toLowerCase() === originalMerchantName.toLowerCase()
    );
    if (ruleMatch) {
      parsed.merchant = ruleMatch.renamed_to;
      if (ruleMatch.category_id) {
        finalCategoryId = ruleMatch.category_id;
      }
    }
  }

  // 8. Date validation
  if (parsed.date && sms.received_at) {
    const parsedDateObj = new Date(parsed.date);
    const receivedDateObj = new Date(sms.received_at);
    const diffTime = Math.abs(receivedDateObj.getTime() - parsedDateObj.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays > 14) {
      parsed.date = sms.received_at;
    }
  }

  // 9. Convert cc_payment → transfer for DB insert
  const insertType = parsed.type === "cc_payment" ? "transfer" : parsed.type;

  // 10. Insert pending transaction
  const { error: insertError } = await supabase
    .from("pending_transactions")
    .insert({
      user_id: user.id,
      account_id: matchedAccountId,
      category_id: finalCategoryId,
      type: insertType,
      amount: parsed.amount,
      date: parsed.date,
      note: parsed.merchant,
      original_synced_name: originalMerchantName,
      confidence: parsed.confidence,
      status: "pending",
      raw_snippet: parsed.rawSnippet || sms.body.slice(0, 200),
      parsed_by: parsed.parsedBy,
      source: "sms",
      raw_sms_id: smsId,
    });

  if (insertError) {
    console.error(`[SMS-RETRY] Failed to insert pending transaction:`, insertError);
    return { error: "Parsed successfully but failed to save: " + insertError.message };
  }

  revalidatePath("/sms");
  return { success: true, amount: parsed.amount, merchant: parsed.merchant };
}

// ═══════════════════════════════════════════════════════════
// DELETE RAW SMS
// ═══════════════════════════════════════════════════════════

export async function deleteSmsAction(smsId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  await supabase
    .from("raw_sms")
    .delete()
    .eq("id", smsId)
    .eq("user_id", user.id);

  revalidatePath("/sms");
  return { success: true };
}
