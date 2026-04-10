"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { parseTransactionText, isBankSender } from "@/lib/email/parser";
import { parseBatchWithLLM } from "@/lib/email/llmParser";
import { parseBatchWithBytez } from "@/lib/email/bytezParser";

// ═══════════════════════════════════════════════════════════
// BODY EXTRACTION — handles nested MIME structures
// ═══════════════════════════════════════════════════════════

function extractBodyFromParts(parts: any[]): string {
  if (!parts) return "";

  // First pass: look for text/plain
  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64url").toString("utf8");
    }
    // Recurse into nested parts (multipart/alternative, multipart/related)
    if (part.parts) {
      const nested = extractBodyFromParts(part.parts);
      if (nested) return nested;
    }
  }

  // Second pass: fallback to text/html → strip tags
  for (const part of parts) {
    if (part.mimeType === "text/html" && part.body?.data) {
      const html = Buffer.from(part.body.data, "base64url").toString("utf8");
      return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&#8377;/g, "Rs.")
        .replace(/&#x20B9;/gi, "Rs.")
        .replace(/₹/g, "Rs.")
        .replace(/&#\d+;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    if (part.parts) {
      const nested = extractBodyFromParts(part.parts);
      if (nested) return nested;
    }
  }

  return "";
}

// ═══════════════════════════════════════════════════════════
// MAIN SYNC ACTION
// ═══════════════════════════════════════════════════════════

export async function syncGmailAction() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // Get Gmail token
  const { data: tokenRow } = await supabase
    .from("gmail_tokens")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!tokenRow?.access_token) {
    return { error: "Gmail not connected. Please sign in with Google." };
  }

  // Get sync settings
  const { data: settings } = await supabase
    .from("email_sync_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const regexEnabled = settings?.regex_enabled ?? true;
  const llmEnabled = settings?.llm_enabled ?? false;
  const approvalRequired = settings?.approval_required ?? true;

  // Get alert profiles for account matching
  const { data: profiles } = await supabase
    .from("account_alert_profiles")
    .select("*, accounts(id, name)")
    .eq("user_id", user.id);

  // Fetch bank alert emails from Gmail (last 3 days)
  const threeDaysAgo = Math.floor((Date.now() - 3 * 86400000) / 1000);
  const query = `(from:alerts OR from:noreply OR subject:transaction OR subject:debited OR subject:credited) after:${threeDaysAgo}`;

  let messages: any[] = [];
  try {
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=20`,
      { headers: { Authorization: `Bearer ${tokenRow.access_token}` } }
    );

    if (listRes.status === 401) {
      return { error: "Gmail token expired. Please sign in with Google again." };
    }

    if (!listRes.ok) {
      const errText = await listRes.text();
      console.error("Gmail list error:", errText);
      return { error: "Failed to fetch emails from Gmail." };
    }

    const listData = await listRes.json();
    messages = listData.messages || [];
  } catch (err) {
    console.error("Gmail fetch error:", err);
    return { error: "Failed to connect to Gmail." };
  }

  console.log(`[SYNC] Found ${messages.length} emails to process`);

  let newCount = 0;
  let skippedCount = 0;

  // ── PHASE 1: Fetch all emails and try regex ──────────
  interface EmailData {
    msgId: string;
    from: string;
    subject: string;
    fullText: string;
    emailDate: string;
    regexResult: any | null;
  }

  const emailsToProcess: EmailData[] = [];

  for (const msg of messages) {
    // Dedup: skip if already pending or approved
    const { data: existing } = await supabase
      .from("pending_transactions")
      .select("id")
      .eq("source_email_id", msg.id)
      .eq("user_id", user.id)
      .in("status", ["pending", "approved"])
      .maybeSingle();

    if (existing) {
      skippedCount++;
      continue;
    }

    // Fetch full message
    let messageData: any;
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${tokenRow.access_token}` } }
      );
      if (!msgRes.ok) continue;
      messageData = await msgRes.json();
    } catch {
      continue;
    }

    // Extract headers
    const headers = messageData.payload?.headers || [];
    const from = headers.find((h: any) => h.name.toLowerCase() === "from")?.value || "";
    const subject = headers.find((h: any) => h.name.toLowerCase() === "subject")?.value || "";
    const dateHeader = headers.find((h: any) => h.name.toLowerCase() === "date")?.value || "";

    // Check if from a bank
    if (!isBankSender(from)) {
      console.log(`[SYNC] Skipping non-bank sender: ${from.slice(0, 50)}`);
      continue;
    }

    // Extract body — with proper nested MIME handling
    let bodyText = "";
    const payload = messageData.payload;

    // Method 1: body.data directly on payload
    if (payload?.body?.data) {
      bodyText = Buffer.from(payload.body.data, "base64url").toString("utf8");
    }
    // Method 2: nested parts (most common for HTML emails)
    if (!bodyText && payload?.parts) {
      bodyText = extractBodyFromParts(payload.parts);
    }
    // Method 3: Gmail's own snippet (always available, plain text, ~150 chars)
    if (!bodyText && messageData.snippet) {
      bodyText = messageData.snippet;
    }
    // Method 4: subject as last resort
    if (!bodyText && subject) bodyText = subject;
    if (!bodyText) continue;

    const fullText = `${subject} ${bodyText}`;
    const emailDate = dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString();

    // DEBUG: log what text the parser actually receives
    console.log(`[SYNC] Email from: ${from.slice(0, 40)}`);
    console.log(`[SYNC] Subject: ${subject.slice(0, 60)}`);
    console.log(`[SYNC] Body (first 200): ${bodyText.slice(0, 200)}`);

    // Try regex first
    let regexResult = null;
    if (regexEnabled) {
      regexResult = parseTransactionText(fullText, emailDate);
    }

    emailsToProcess.push({
      msgId: msg.id,
      from,
      subject,
      fullText,
      emailDate,
      regexResult,
    });
  }

  console.log(`[SYNC] ${emailsToProcess.length} emails passed filters (${skippedCount} skipped as dupes)`);

  // ── PHASE 2: Batch LLM for regex failures ──────────
  const regexFailures = emailsToProcess.filter(e => !e.regexResult);
  let llmResultsMap = new Map<string, any>();

  if (regexFailures.length > 0 && llmEnabled) {
    console.log(`[SYNC] ${regexFailures.length} regex failures → sending as ONE batch to LLM`);
    const emailsForLLM = regexFailures.map(e => ({
      id: e.msgId,
      text: e.fullText.slice(0, 400),
    }));
    // Primary: Bytez (Gemini temporarily disabled per user request)
    console.log(`[SYNC] Routing directly to Bytez API...`);
    llmResultsMap = await parseBatchWithBytez(emailsForLLM);
    
    // Fallback: Gemini (disabled)
    // if (llmResultsMap.size === 0) { ... }
  }

  // ── PHASE 3: Save results ──────────────────────────
  for (const email of emailsToProcess) {
    let parsed = email.regexResult;
    let parsedBy = "regex";

    if (!parsed) {
      // Check LLM result by email ID
      const llmResult = llmResultsMap.get(email.msgId);
      if (llmResult) {
        parsed = {
          amount: llmResult.amount,
          type: llmResult.type,
          merchant: llmResult.merchant,
          date: llmResult.date,
          last4: llmResult.accountLast4 || "",
          confidence: llmResult.confidence,
          rawSnippet: email.fullText.slice(0, 200),
        };
        parsedBy = "llm";
      }
    }

    if (!parsed) {
      console.warn(`[SYNC] Could not parse email: ${email.subject.slice(0, 60)}`);
      continue;
    }

    // Match to account via alert profiles
    let matchedAccountId: string | null = null;
    if (profiles) {
      const match = profiles.find((p: any) =>
        (parsed.last4 && p.account_last4 === parsed.last4) ||
        (p.email_sender_filter && email.from.toLowerCase().includes(p.email_sender_filter.toLowerCase()))
      );
      if (match) matchedAccountId = match.account_id;
    }

    // Save
    if (!approvalRequired) {
      const { error: txnError } = await supabase
        .from("transactions")
        .insert({
          user_id: user.id,
          account_id: matchedAccountId,
          type: parsed.type,
          amount: parsed.amount,
          date: parsed.date,
          note: parsed.merchant,
        });

      if (!txnError) {
        if (matchedAccountId) {
          const { data: account } = await supabase
            .from("accounts")
            .select("balance")
            .eq("id", matchedAccountId)
            .single();
          if (account) {
            const newBalance = parsed.type === "expense"
              ? Number(account.balance) - parsed.amount
              : Number(account.balance) + parsed.amount;
            await supabase
              .from("accounts")
              .update({ balance: newBalance })
              .eq("id", matchedAccountId);
          }
        }
        newCount++;
      }
    } else {
      await supabase
        .from("pending_transactions")
        .insert({
          user_id: user.id,
          account_id: matchedAccountId,
          type: parsed.type,
          amount: parsed.amount,
          date: parsed.date,
          note: parsed.merchant,
          source_email_id: email.msgId,
          confidence: parsed.confidence,
          status: "pending",
          raw_snippet: parsed.rawSnippet || email.fullText.slice(0, 200),
          parsed_by: parsedBy,
        });
      newCount++;
    }
  }

  // Update last sync time
  await supabase
    .from("email_sync_settings")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("user_id", user.id);

  revalidatePath("/dashboard");
  revalidatePath("/transactions");

  console.log(`[SYNC] Done! ${newCount} new, ${skippedCount} skipped, ${messages.length} total`);

  return {
    success: true,
    newTransactions: newCount,
    skipped: skippedCount,
    total: messages.length,
  };
}

// ═══════════════════════════════════════════════════════════
// APPROVE / DISCARD / STATUS
// ═══════════════════════════════════════════════════════════

export async function approvePendingAction(pendingId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: pending } = await supabase
    .from("pending_transactions")
    .select("*")
    .eq("id", pendingId)
    .eq("user_id", user.id)
    .single();

  if (!pending) return { error: "Transaction not found." };

  const { error: txnError } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      account_id: pending.account_id,
      category_id: pending.category_id,
      type: pending.type,
      amount: pending.amount,
      date: pending.date,
      note: pending.note,
    });

  if (txnError) return { error: "Failed to save transaction." };

  if (pending.account_id) {
    const { data: account } = await supabase
      .from("accounts")
      .select("balance")
      .eq("id", pending.account_id)
      .single();
    if (account) {
      const newBalance = pending.type === "expense"
        ? Number(account.balance) - Number(pending.amount)
        : Number(account.balance) + Number(pending.amount);
      await supabase
        .from("accounts")
        .update({ balance: newBalance })
        .eq("id", pending.account_id);
    }
  }

  await supabase
    .from("pending_transactions")
    .delete()
    .eq("id", pendingId);

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  return { success: true };
}

export async function discardPendingAction(pendingId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  await supabase
    .from("pending_transactions")
    .delete()
    .eq("id", pendingId)
    .eq("user_id", user.id);

  revalidatePath("/dashboard");
  return { success: true };
}

export async function getGmailStatusAction() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { connected: false, pendingCount: 0 };

  const { data: token } = await supabase
    .from("gmail_tokens")
    .select("email, expires_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const { count } = await supabase
    .from("pending_transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "pending");

  const { data: settings } = await supabase
    .from("email_sync_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    connected: !!token,
    email: token?.email || "",
    pendingCount: count || 0,
    settings: settings || null,
    lastSync: settings?.last_sync_at || null,
  };
}

export async function updateEmailSyncSettingsAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const approvalRequired = formData.get("approval_required") === "true";
  const regexEnabled = formData.get("regex_enabled") === "true";
  const llmEnabled = formData.get("llm_enabled") === "true";
  const syncInterval = parseInt(formData.get("sync_interval_minutes") as string) || 60;

  await supabase
    .from("email_sync_settings")
    .upsert({
      user_id: user.id,
      approval_required: approvalRequired,
      regex_enabled: regexEnabled,
      llm_enabled: llmEnabled,
      sync_interval_minutes: syncInterval,
    }, { onConflict: "user_id" });

  revalidatePath("/settings");
  return { success: true };
}

export async function saveAlertProfileAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const accountId = formData.get("account_id") as string;
  const emailSender = formData.get("email_sender_filter") as string;
  const last4 = formData.get("account_last4") as string;

  if (!accountId) return { error: "Account is required." };

  await supabase
    .from("account_alert_profiles")
    .upsert({
      user_id: user.id,
      account_id: accountId,
      email_sender_filter: emailSender || null,
      account_last4: last4 || null,
      auto_import: true,
      require_confirmation: true,
    }, { onConflict: "user_id,account_id" });

  revalidatePath("/accounts");
  return { success: true };
}

export async function getPendingTransactionsAction() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { transactions: [] };

  const { data } = await supabase
    .from("pending_transactions")
    .select(`
      *,
      accounts(name)
    `)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);

  return { transactions: data || [] };
}
