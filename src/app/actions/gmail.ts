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

  // Get categories and historical mappings for categorization
  const { data: existingCategories } = await supabase
    .from("categories")
    .select("id, name, type")
    .eq("user_id", user.id);

  const { data: history } = await supabase
    .from("transactions")
    .select("note, category_id")
    .eq("user_id", user.id)
    .not("category_id", "is", null);

  const historicalMappings = history || [];

  const { data: rules } = await supabase
    .from("merchant_rules")
    .select("*")
    .eq("user_id", user.id);
  const merchantRules = rules || [];

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
    const { data: existingPending } = await supabase
      .from("pending_transactions")
      .select("id")
      .eq("source_email_id", msg.id)
      .eq("user_id", user.id)
      .in("status", ["pending", "approved"])
      .maybeSingle();

    if (existingPending) {
      skippedCount++;
      continue;
    }

    // Dedup: check main transactions table.
    // Also covers split children — when a synced txn is converted to a split,
    // the first split child inherits source_email_id, so this check still fires.
    const { data: existingTxns } = await supabase
      .from("transactions")
      .select("id")
      .eq("source_email_id", msg.id)
      .eq("user_id", user.id)
      .limit(1);

    if (existingTxns && existingTxns.length > 0) {
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
    console.log(`[SYNC] ${regexFailures.length} regex failures → sending to AI Parsers`);
    const emailsForLLM = regexFailures.map(e => ({
      id: e.msgId,
      text: e.fullText.slice(0, 400),
    }));

    const config = {
      geminiKeys: settings?.gemini_api_keys,
      geminiModel: settings?.gemini_model_id,
      bytezKey: settings?.bytez_api_key,
      bytezModel: settings?.bytez_model_id,
      existingCategories: existingCategories || [],
    };

    if (settings?.selected_llm_provider === "bytez") {
      console.log(`[SYNC] User preferred primary provider: Bytez`);
      llmResultsMap = await parseBatchWithBytez(emailsForLLM, config);
    } else {
      console.log(`[SYNC] User preferred primary provider: Google Gemini`);
      llmResultsMap = await parseBatchWithLLM(emailsForLLM, config);
      if (llmResultsMap.size === 0) {
        console.log(`[SYNC] Gemini exhausted. Gracefully failing over to Bytez...`);
        llmResultsMap = await parseBatchWithBytez(emailsForLLM, config);
      }
    }
  }

  // cache for categories created in this run
  const newCategoriesCache = new Map<string, string>(); // name lower to id

  // ── PHASE 3: Save results ──────────────────────────
  for (const email of emailsToProcess) {
    let parsed = email.regexResult;
    let parsedBy = "regex";
    let finalCategoryId: string | null = null;
    let fallbackNewCategory: any = null; // Stash the new category object from LLM

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
        finalCategoryId = llmResult.categoryId || null;
        fallbackNewCategory = llmResult.newCategory || null;
      }
    }

    if (!parsed) {
      console.warn(`[SYNC] Could not parse email: ${email.subject.slice(0, 60)}`);
      continue;
    }

    // --- DATE VALIDATION ---
    // Extractors (Regex and LLM) sometimes hallucinate or pick up transaction IDs 
    // that look like dates (e.g. "26/04/23" causing 2023 issues in 2026).
    // Ensure the parsed date remains within 14 days of the actual email receipt.
    if (parsed.date && email.emailDate) {
      const parsedDateObj = new Date(parsed.date);
      const emailDateObj = new Date(email.emailDate);
      
      const diffTime = Math.abs(emailDateObj.getTime() - parsedDateObj.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      // If parsing resulted in a date > 14 days away from the email's arrival, fallback to email date
      if (diffDays > 14) {
        console.log(`[SYNC] Date hallucination detected (diff: ${diffDays} days). Parsed: ${parsed.date}, Email: ${email.emailDate}. Falling back to email date.`);
        parsed.date = email.emailDate;
      }
    }

    const originalMerchantName = parsed.merchant;
    let ruleMatched = false;

    // Apply auto-categorization Merchant Rules first
    if (merchantRules.length > 0) {
      const match = merchantRules.find((r: any) => r.synced_name.toLowerCase() === originalMerchantName.toLowerCase());
      if (match) {
        parsed.merchant = match.renamed_to;
        if (match.category_id) {
          finalCategoryId = match.category_id;
        }
        ruleMatched = true;
      }
    }

    // 1. FIRST PRIORITY: LOCAL HISTORICAL MATCH
    // If we have a local matching merchant from history, IT OVERRIDES everything else!
    let localMatchedCategory: string | null = null;
    if (!ruleMatched && historicalMappings.length > 0) {
      const merchantLower = parsed.merchant.toLowerCase();
      let match = historicalMappings.find(h => h.note?.toLowerCase() === merchantLower);
      if (!match) {
        match = historicalMappings.find(h => 
          h.note && (h.note.toLowerCase().includes(merchantLower) || merchantLower.includes(h.note.toLowerCase()))
        );
      }
      if (match) {
        localMatchedCategory = match.category_id;
      }
    }

    // Assign final category based on priority
    if (localMatchedCategory) {
      finalCategoryId = localMatchedCategory;
    } else if (finalCategoryId) {
      // LLM successfully matched an existing category, leave it.
    } else if (fallbackNewCategory) {
      // Create new category if it hasn't been created during this execution yet
      const catNameLower = fallbackNewCategory.name.toLowerCase();
      if (newCategoriesCache.has(catNameLower)) {
        finalCategoryId = newCategoriesCache.get(catNameLower)!;
      } else {
        console.log(`[SYNC] Creating new category from LLM fallback: ${fallbackNewCategory.name}`);
        const { data: newCat } = await supabase
          .from("categories")
          .insert({
            user_id: user.id,
            name: fallbackNewCategory.name,
            icon: fallbackNewCategory.icon || "🏷️",
            color: fallbackNewCategory.color || "#888888",
            type: fallbackNewCategory.type || parsed.type,
          })
          .select("id")
          .single();
        
        if (newCat) {
          finalCategoryId = newCat.id;
          newCategoriesCache.set(catNameLower, newCat.id);
        }
      }
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
      // cc_payment stored as transfer in main transactions
      const insertType = parsed.type === "cc_payment" ? "transfer" : parsed.type;
      const { error: txnError } = await supabase
        .from("transactions")
        .insert({
          user_id: user.id,
          account_id: matchedAccountId,
          category_id: finalCategoryId,
          type: insertType,
          amount: parsed.amount,
          date: parsed.date,
          note: parsed.merchant,
          source_email_id: email.msgId,
          original_synced_name: originalMerchantName,
        });

      if (!txnError) {
        if (matchedAccountId) {
          const { data: account } = await supabase
            .from("accounts")
            .select("type, balance, outstanding_balance")
            .eq("id", matchedAccountId)
            .single();
          if (account) {
            if (account.type === "credit_card") {
              // CC expense → increase outstanding; cc_payment → decrease outstanding
              const delta = parsed.type === "expense" ? parsed.amount : -parsed.amount;
              const newOutstanding = Math.max(0, (Number(account.outstanding_balance) || 0) + delta);
              await supabase.from("accounts").update({ outstanding_balance: newOutstanding }).eq("id", matchedAccountId);
            } else {
              const newBalance = parsed.type === "expense"
                ? Number(account.balance) - parsed.amount
                : Number(account.balance) + parsed.amount;
              await supabase.from("accounts").update({ balance: newBalance }).eq("id", matchedAccountId);
            }
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
          category_id: finalCategoryId,
          type: parsed.type,
          amount: parsed.amount,
          date: parsed.date,
          note: parsed.merchant,
          source_email_id: email.msgId,
          original_synced_name: originalMerchantName,
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

  const isCCPayment = pending.type === "cc_payment";
  // cc_payment is stored as 'transfer' in the main transactions table
  const insertType = isCCPayment ? "transfer" : pending.type;

  const { error: txnError } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      account_id: pending.account_id,
      category_id: pending.category_id,
      type: insertType,
      amount: pending.amount,
      date: pending.date,
      note: pending.note,
      source_email_id: pending.source_email_id,
      original_synced_name: pending.original_synced_name,
      raw_sms_id: pending.raw_sms_id || null,
      source: pending.source || 'email',
    });

  if (txnError) return { error: "Failed to save transaction." };

  if (pending.account_id) {
    const { data: account } = await supabase
      .from("accounts")
      .select("type, balance, outstanding_balance")
      .eq("id", pending.account_id)
      .single();
    if (account) {
      if (account.type === "credit_card") {
        // CC expense → more debt; cc_payment → reduce debt
        const delta = (pending.type === "expense") ? Number(pending.amount) : -Number(pending.amount);
        const newOutstanding = Math.max(0, (Number(account.outstanding_balance) || 0) + delta);
        await supabase
          .from("accounts")
          .update({ outstanding_balance: newOutstanding })
          .eq("id", pending.account_id);
      } else {
        const newBalance = pending.type === "expense"
          ? Number(account.balance) - Number(pending.amount)
          : Number(account.balance) + Number(pending.amount);
        await supabase
          .from("accounts")
          .update({ balance: newBalance })
          .eq("id", pending.account_id);
      }
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

export async function approvePendingBulkAction(pendingIds: string[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  if (!pendingIds || pendingIds.length === 0) return { success: true };

  const { data: pendingTxns } = await supabase
    .from("pending_transactions")
    .select("*")
    .in("id", pendingIds)
    .eq("user_id", user.id);

  if (!pendingTxns || pendingTxns.length === 0) return { error: "Transactions not found." };

  for (const pending of pendingTxns) {
    const isCCPayment = pending.type === "cc_payment";
    const insertType = isCCPayment ? "transfer" : pending.type;

    const { error: txnError } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        account_id: pending.account_id,
        category_id: pending.category_id,
        type: insertType,
        amount: pending.amount,
        date: pending.date,
        note: pending.note,
        source_email_id: pending.source_email_id,
        original_synced_name: pending.original_synced_name,
        raw_sms_id: pending.raw_sms_id || null,
        source: pending.source || 'email',
      });

    if (!txnError && pending.account_id) {
      const { data: account } = await supabase
        .from("accounts")
        .select("type, balance, outstanding_balance")
        .eq("id", pending.account_id)
        .single();
      if (account) {
        if (account.type === "credit_card") {
          const delta = (pending.type === "expense") ? Number(pending.amount) : -Number(pending.amount);
          const newOutstanding = Math.max(0, (Number(account.outstanding_balance) || 0) + delta);
          await supabase.from("accounts").update({ outstanding_balance: newOutstanding }).eq("id", pending.account_id);
        } else {
          const newBalance = pending.type === "expense"
            ? Number(account.balance) - Number(pending.amount)
            : Number(account.balance) + Number(pending.amount);
          await supabase.from("accounts").update({ balance: newBalance }).eq("id", pending.account_id);
        }
      }
    }
  }

  await supabase
    .from("pending_transactions")
    .delete()
    .in("id", pendingIds)
    .eq("user_id", user.id);

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  return { success: true };
}

export async function discardPendingBulkAction(pendingIds: string[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  if (!pendingIds || pendingIds.length === 0) return { success: true };

  await supabase
    .from("pending_transactions")
    .delete()
    .in("id", pendingIds)
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

  const { data: existing } = await supabase
    .from("email_sync_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const isAiConfig = formData.get("update_ai_config") === "true";
  let updates: any = { user_id: user.id };

  if (isAiConfig) {
    if (formData.has("selected_llm_provider")) updates.selected_llm_provider = formData.get("selected_llm_provider");
    if (formData.has("gemini_api_keys")) {
      const keysStr = formData.get("gemini_api_keys") as string;
      updates.gemini_api_keys = keysStr ? keysStr.split(",").map(k => k.trim()).filter(Boolean) : null;
    }
    if (formData.has("gemini_model_id")) updates.gemini_model_id = formData.get("gemini_model_id");
    if (formData.has("bytez_api_key")) updates.bytez_api_key = formData.get("bytez_api_key") || null;
    if (formData.has("bytez_model_id")) updates.bytez_model_id = formData.get("bytez_model_id");
  } else {
    updates.approval_required = formData.get("approval_required") === "true";
    updates.regex_enabled = formData.get("regex_enabled") === "true";
    updates.llm_enabled = formData.get("llm_enabled") === "true";
    updates.sync_interval_minutes = parseInt(formData.get("sync_interval_minutes") as string) || 60;
  }

  await supabase
    .from("email_sync_settings")
    .upsert({ ...existing, ...updates }, { onConflict: "user_id" });

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
