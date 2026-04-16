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
