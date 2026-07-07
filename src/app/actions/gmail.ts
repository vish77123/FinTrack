"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { parseTransactionText, isBankSender, KNOWN_BANK_SENDERS } from "@/lib/email/parser";
import { parseBatchWithLLM } from "@/lib/email/llmParser";
import { parseBatchWithNvidia } from "@/lib/email/nvidiaParser";
// Balance updates are applied atomically in Postgres via src/lib/balance.ts
// (a plain module, so importing it here does not create a cross-"use server"
// dependency).
import { applyBalanceUpdate } from "@/lib/balance";
import { looksLikeStatementEmail, extractStatementSummary } from "@/lib/statements/emailShell";

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
// TOKEN REFRESH HELPER
// ═══════════════════════════════════════════════════════════

type RefreshResult =
  | { ok: true; accessToken: string; expiresIn: number; refreshToken?: string }
  | { ok: false; reason: string; needsReauth: boolean };

async function refreshGoogleToken(refreshToken: string): Promise<RefreshResult> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("[SYNC] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables.");
    return { ok: false, reason: "server_config_missing", needsReauth: false };
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    const data = await response.json().catch(() => ({} as any));

    if (!response.ok) {
      // Google's error body distinguishes a genuinely dead token from a config problem.
      // invalid_grant   → refresh token was revoked/expired → real re-auth needed.
      // invalid_client  → the GOOGLE_CLIENT_ID/SECRET here don't match the client that
      //                   minted this token (i.e. Supabase's Google provider) → config fix.
      const reason = data?.error || `http_${response.status}`;
      console.error("[SYNC] Failed to refresh token:", JSON.stringify(data));
      return { ok: false, reason, needsReauth: reason === "invalid_grant" };
    }

    return {
      ok: true,
      accessToken: data.access_token,
      expiresIn: Number(data.expires_in) || 3600,
      refreshToken: data.refresh_token, // Google occasionally rotates the refresh token
    };
  } catch (error) {
    console.error("[SYNC] Token refresh exception:", error);
    return { ok: false, reason: "network_error", needsReauth: false };
  }
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

  let accessToken = tokenRow.access_token;

  // Check if token is expired or expiring within 5 minutes
  const isExpired = tokenRow.expires_at ? new Date(tokenRow.expires_at).getTime() < Date.now() + 5 * 60 * 1000 : false;

  if (isExpired && tokenRow.refresh_token) {
    console.log("[SYNC] Token is expired. Attempting to refresh...");
    const refreshed = await refreshGoogleToken(tokenRow.refresh_token);
    if (refreshed.ok) {
      accessToken = refreshed.accessToken;
      const newExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString();

      // Save the new access token (and rotated refresh token, if Google sent one).
      await supabase
        .from("gmail_tokens")
        .update({
          access_token: accessToken,
          expires_at: newExpiresAt,
          ...(refreshed.refreshToken ? { refresh_token: refreshed.refreshToken } : {}),
        })
        .eq("user_id", user.id);

      console.log("[SYNC] Token refreshed successfully.");
    } else if (refreshed.needsReauth) {
      console.log("[SYNC] Refresh token revoked/expired — re-auth required.");
      return { error: "Google access was revoked or has expired. Please sign in with Google again." };
    } else if (refreshed.reason === "server_config_missing") {
      return { error: "Gmail sync is misconfigured: the server is missing Google credentials (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)." };
    } else {
      // invalid_client / http_xxx / network_error — not the user's fault, don't force a pointless re-login.
      return { error: `Couldn't refresh Gmail access (${refreshed.reason}). The server's Google credentials likely don't match the ones used to sign in. Verify GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET match your Supabase Google provider, then try again.` };
    }
  } else if (isExpired && !tokenRow.refresh_token) {
    return { error: "Gmail isn't fully connected — no refresh token was saved, so background sync can't run. Please sign in with Google again to grant offline access." };
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

  // Fetch bank alert emails from Gmail over the user's configured lookback window.
  // Query targets only known bank senders — avoids fetching marketing/noreply noise.
  const lookbackDays = Math.min(30, Math.max(1, settings?.sync_lookback_days ?? 3));
  const afterTs = Math.floor((Date.now() - lookbackDays * 86400000) / 1000);
  const senderFilter = KNOWN_BANK_SENDERS.map(s => `from:${s}`).join(" OR ");
  const query = `(${senderFilter}) after:${afterTs}`;

  const messages: any[] = [];
  try {
    let pageToken: string | undefined;
    do {
      const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ""}`;
      const listRes = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

      if (listRes.status === 401) {
        return { error: "Gmail token expired or revoked. Please sign in with Google again." };
      }

      if (!listRes.ok) {
        const errText = await listRes.text();
        console.error("Gmail list error:", errText);
        return { error: "Failed to fetch emails from Gmail." };
      }

      const listData = await listRes.json();
      messages.push(...(listData.messages || []));
      pageToken = listData.nextPageToken;
    } while (pageToken && messages.length < 200);
  } catch (err) {
    console.error("Gmail fetch error:", err);
    return { error: "Failed to connect to Gmail." };
  }

  console.log(`[SYNC] Found ${messages.length} emails to process`);

  let newCount = 0;
  let skippedCount = 0;

  // ── PHASE 1: Batch dedup → parallel message fetch → regex ──────────
  interface EmailData {
    msgId: string;
    from: string;
    subject: string;
    fullText: string;
    emailDate: string;
    regexResult: any | null;
  }

  const emailsToProcess: EmailData[] = [];
  // Statement-notification emails, diverted into card_statements shells
  const statementEmails: { fullText: string; emailDate: string }[] = [];

  // Single batch dedup query instead of N individual queries
  const allMsgIds = messages.map((m: any) => m.id as string);
  if (allMsgIds.length > 0) {
    const [{ data: existingPendingRows }, { data: existingTxnRows }] = await Promise.all([
      supabase
        .from("pending_transactions")
        .select("source_email_id")
        .in("source_email_id", allMsgIds)
        .eq("user_id", user.id)
        .in("status", ["pending", "approved"]),
      supabase
        .from("transactions")
        .select("source_email_id")
        .in("source_email_id", allMsgIds)
        .eq("user_id", user.id),
    ]);
    const skipSet = new Set<string>();
    for (const r of existingPendingRows ?? []) if (r.source_email_id) skipSet.add(r.source_email_id);
    for (const r of existingTxnRows ?? []) if (r.source_email_id) skipSet.add(r.source_email_id);

    const messagesToFetch = messages.filter((m: any) => !skipSet.has(m.id));
    skippedCount = messages.length - messagesToFetch.length;
    console.log(`[SYNC] ${messagesToFetch.length} emails to fetch (${skippedCount} dupes skipped)`);

    // Fetch all non-dupe message bodies in parallel
    const fetchedMessages = await Promise.all(
      messagesToFetch.map(async (msg: any) => {
        try {
          const msgRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (!msgRes.ok) return null;
          return { msgId: msg.id as string, data: await msgRes.json() };
        } catch {
          return null;
        }
      })
    );

    for (const fetched of fetchedMessages) {
      if (!fetched) continue;
      const { msgId, data: messageData } = fetched;

      const headers = messageData.payload?.headers || [];
      const from = headers.find((h: any) => h.name.toLowerCase() === "from")?.value || "";
      const subject = headers.find((h: any) => h.name.toLowerCase() === "subject")?.value || "";
      const dateHeader = headers.find((h: any) => h.name.toLowerCase() === "date")?.value || "";

      if (!isBankSender(from)) {
        console.log(`[SYNC] Skipping non-bank sender: ${from.slice(0, 50)}`);
        continue;
      }

      let bodyText = "";
      const payload = messageData.payload;

      if (payload?.body?.data) {
        bodyText = Buffer.from(payload.body.data, "base64url").toString("utf8");
      }
      if (!bodyText && payload?.parts) {
        bodyText = extractBodyFromParts(payload.parts);
      }
      if (!bodyText && messageData.snippet) {
        bodyText = messageData.snippet;
      }
      if (!bodyText && subject) bodyText = subject;
      if (!bodyText) continue;

      const fullText = `${subject} ${bodyText}`;
      const emailDate = dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString();

      console.log(`[SYNC] Email from: ${from.slice(0, 40)}`);
      console.log(`[SYNC] Subject: ${subject.slice(0, 60)}`);
      console.log(`[SYNC] Body (first 200): ${bodyText.slice(0, 200)}`);

      // "Your statement is ready" emails aren't transactions — divert them
      // into card_statements shells instead of the transaction parsers
      if (looksLikeStatementEmail(subject)) {
        console.log(`[SYNC] Statement notification detected: ${subject.slice(0, 60)}`);
        statementEmails.push({ fullText, emailDate });
        continue;
      }

      let regexResult = null;
      if (regexEnabled) {
        regexResult = parseTransactionText(fullText, emailDate);
      }

      emailsToProcess.push({ msgId, from, subject, fullText, emailDate, regexResult });
    }
  }

  // ── Statement shells from statement-notification emails ──────────
  if (statementEmails.length > 0) {
    const [{ data: ccAccounts }, { data: ccProfiles }] = await Promise.all([
      supabase
        .from("accounts")
        .select("id")
        .eq("user_id", user.id)
        .eq("type", "credit_card")
        .eq("is_archived", false),
      supabase
        .from("account_alert_profiles")
        .select("account_id, account_last4")
        .eq("user_id", user.id),
    ]);
    const last4ToAccount = new Map(
      (ccProfiles || [])
        .filter((p) => p.account_last4)
        .map((p) => [p.account_last4!.replace(/\D/g, "").slice(-4), p.account_id])
    );

    for (const email of statementEmails) {
      const summary = extractStatementSummary(email.fullText, email.emailDate);
      if (!summary) continue;

      // Resolve the card: alert-profile last4 first, single-card fallback
      const accountId =
        (summary.last4 && last4ToAccount.get(summary.last4)) ||
        ((ccAccounts || []).length === 1 ? ccAccounts![0].id : null);
      if (!accountId) {
        console.log(`[SYNC] Statement email skipped — could not resolve card (last4: ${summary.last4})`);
        continue;
      }

      // ignoreDuplicates: a real (PDF-parsed) statement for the same date
      // must never be overwritten by an email shell
      const { error: shellError } = await supabase.from("card_statements").upsert(
        {
          user_id: user.id,
          account_id: accountId,
          statement_date: summary.statementDate,
          due_date: summary.dueDate,
          total_due: summary.totalDue,
          min_due: summary.minDue,
          status: "review",
          parsed_by: "email",
        },
        { onConflict: "user_id,account_id,statement_date", ignoreDuplicates: true }
      );
      if (shellError) console.error("[SYNC] Statement shell insert failed:", shellError.message);
      else console.log(`[SYNC] Statement shell created: due ₹${summary.totalDue} on ${summary.dueDate}`);
    }
  }

  console.log(`[SYNC] ${emailsToProcess.length} emails passed filters (${skippedCount} skipped as dupes)`);

  // ── PHASE 2: Batch LLM for regex failures ──────────
  const regexFailures = emailsToProcess.filter(e => !e.regexResult);
  let llmResultsMap = new Map<string, any>();
  let llmWarning: string | null = null;

  if (regexFailures.length > 0 && llmEnabled) {
    console.log(`[SYNC] ${regexFailures.length} regex failures → sending to AI Parsers`);
    const emailsForLLM = regexFailures.map(e => ({
      id: e.msgId,
      text: e.fullText.slice(0, 600),
    }));

    const config = {
      geminiKeys: settings?.gemini_api_keys,
      geminiModel: settings?.gemini_model_id,
      nvidiaKey: settings?.nvidia_api_key,
      nvidiaModel: settings?.nvidia_model_id,
      existingCategories: existingCategories || [],
    };

    if (settings?.selected_llm_provider === "nvidia") {
      console.log(`[SYNC] User preferred primary provider: NVIDIA NIM`);
      const nvidia = await parseBatchWithNvidia(emailsForLLM, config);
      llmResultsMap = nvidia.results;
      if (nvidia.providerFailed) {
        llmWarning = `AI parsing unavailable (${nvidia.failureReason || "unknown"}) — ${emailsForLLM.length} email(s) left unparsed. They will be retried on the next sync.`;
      } else if (nvidia.failedCount) {
        // Some chunks failed but others parsed — partial progress, not an outage.
        llmWarning = `AI parsing partially failed (${nvidia.failureReason || "unknown"}) — ${nvidia.failedCount} email(s) left unparsed. They will be retried on the next sync.`;
      }
    } else {
      console.log(`[SYNC] User preferred primary provider: Google Gemini`);
      const gemini = await parseBatchWithLLM(emailsForLLM, config);
      llmResultsMap = gemini.results;

      // Fail over only when Gemini itself failed — an empty result from a
      // healthy call means these emails contained no transactions.
      if (gemini.providerFailed) {
        console.log(`[SYNC] Gemini failed (${gemini.failureReason || "unknown"}). Failing over to NVIDIA NIM...`);
        const nvidia = await parseBatchWithNvidia(emailsForLLM, config);
        llmResultsMap = nvidia.results;
        if (nvidia.providerFailed) {
          llmWarning = `AI parsing unavailable (Gemini: ${gemini.failureReason || "unknown"}; NVIDIA: ${nvidia.failureReason || "unknown"}) — ${emailsForLLM.length} email(s) left unparsed. They will be retried on the next sync.`;
        } else if (nvidia.failedCount) {
          llmWarning = `AI parsing partially failed (${nvidia.failureReason || "unknown"}) — ${nvidia.failedCount} email(s) left unparsed. They will be retried on the next sync.`;
        }
      } else if (gemini.failedCount) {
        llmWarning = `AI parsing partially failed (${gemini.failureReason || "unknown"}) — ${gemini.failedCount} email(s) left unparsed. They will be retried on the next sync.`;
      }
    }

    if (llmWarning) console.warn(`[SYNC] ${llmWarning}`);
  }

  // Cache of category name (lowercased) → id. Seed it with the user's EXISTING
  // categories so the LLM-fallback path reuses them instead of creating duplicates
  // (the LLM is unreliable at echoing back the matching categoryId). New names
  // created during this run are added below so they're reused too.
  const newCategoriesCache = new Map<string, string>();
  for (const c of existingCategories || []) {
    if (c.name) newCategoriesCache.set(c.name.toLowerCase(), c.id);
  }
  const MAX_NEW_CATEGORIES_PER_SYNC = 5;
  let newCategoriesCreated = 0;

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
    } else if (fallbackNewCategory && newCategoriesCreated < MAX_NEW_CATEGORIES_PER_SYNC) {
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
            // Sanitize icon: only use it if it contains non-ASCII chars (i.e. is an emoji).
            // CSS class names like "icon-question" would otherwise render as literal text in the UI.
            icon: (fallbackNewCategory.icon && !/^[a-zA-Z0-9\-_]+$/.test(fallbackNewCategory.icon))
              ? fallbackNewCategory.icon
              : "🏷️",
            color: fallbackNewCategory.color || "#888888",
            type: fallbackNewCategory.type || parsed.type,
          })
          .select("id")
          .single();

        if (newCat) {
          finalCategoryId = newCat.id;
          newCategoriesCache.set(catNameLower, newCat.id);
          newCategoriesCreated++;
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
      const { data: insertedTxn, error: txnError } = await supabase
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
          source: "email",
        })
        .select("id")
        .single();

      if (!txnError && insertedTxn) {
        const balanceResult = await applyBalanceUpdate(supabase, {
          type: parsed.type,
          amount: parsed.amount,
          account_id: matchedAccountId,
        });
        if (balanceResult.error) {
          // Compensate: remove the row so the next sync re-imports this email
          // instead of leaving a transaction with no balance effect.
          console.error(`[SYNC] Balance update failed for auto-imported txn: ${balanceResult.error}`);
          await supabase.from("transactions").delete().eq("id", insertedTxn.id).eq("user_id", user.id);
        } else {
          newCount++;
        }
      }
    } else {
      const { error: pendingError } = await supabase
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

      if (!pendingError) {
        newCount++;
      } else if (pendingError.code === "23505") {
        // Unique constraint: a concurrent sync already imported this email
        skippedCount++;
      } else {
        console.error(`[SYNC] Failed to save pending transaction:`, pendingError.message);
      }
    }
  }

  // Update last sync time
  await supabase
    .from("email_sync_settings")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("user_id", user.id);

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/cards");

  console.log(`[SYNC] Done! ${newCount} new, ${skippedCount} skipped, ${messages.length} total`);

  return {
    success: true,
    newTransactions: newCount,
    skipped: skippedCount,
    total: messages.length,
    warning: llmWarning || undefined,
  };
}

// ═══════════════════════════════════════════════════════════
// APPROVE / DISCARD / STATUS
// ═══════════════════════════════════════════════════════════

export async function approvePendingAction(pendingId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // Claim the pending row by deleting it conditionally. delete().select()
  // returns the row exactly once, so a concurrent approval (double-click)
  // gets nothing back and cannot insert the transaction twice.
  const { data: pending, error: claimError } = await supabase
    .from("pending_transactions")
    .delete()
    .eq("id", pendingId)
    .eq("user_id", user.id)
    .select("*")
    .maybeSingle();

  if (claimError) return { error: "Failed to approve transaction." };
  if (!pending) return { error: "Transaction not found (it may have already been approved)." };

  const isCCPayment = pending.type === "cc_payment";
  // cc_payment is stored as 'transfer' in the main transactions table
  const insertType = isCCPayment ? "transfer" : pending.type;

  const { data: insertedTxn, error: txnError } = await supabase
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
      transfer_to_account_id: pending.transfer_to_account_id || null,
    })
    .select("id")
    .single();

  if (txnError || !insertedTxn) {
    // Restore the claimed pending row (best effort) so the user can retry
    await supabase.from("pending_transactions").insert(pending);
    return { error: "Failed to save transaction." };
  }

  const balanceResult = await applyBalanceUpdate(supabase, {
    type: pending.type,
    amount: Number(pending.amount),
    account_id: pending.account_id,
    transfer_to_account_id: pending.transfer_to_account_id || null,
  });

  if (balanceResult.error) {
    return { error: `Transaction approved, but its balance update failed (${balanceResult.error}). Please review your account balances.` };
  }

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

  // Claim all requested pending rows atomically. A concurrent bulk approve
  // (or a racing single approve) gets none of the same rows back, so nothing
  // is inserted twice.
  const { data: pendingTxns, error: claimError } = await supabase
    .from("pending_transactions")
    .delete()
    .in("id", pendingIds)
    .eq("user_id", user.id)
    .select("*");

  if (claimError) return { error: "Failed to approve transactions." };
  if (!pendingTxns || pendingTxns.length === 0) {
    return { error: "Transactions not found (they may have already been approved)." };
  }

  const failures: string[] = [];
  for (const pending of pendingTxns) {
    const isCCPayment = pending.type === "cc_payment";
    const insertType = isCCPayment ? "transfer" : pending.type;

    const { data: insertedTxn, error: txnError } = await supabase
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
        transfer_to_account_id: pending.transfer_to_account_id || null,
      })
      .select("id")
      .single();

    if (txnError || !insertedTxn) {
      // Restore this pending row (best effort) so it can be retried
      await supabase.from("pending_transactions").insert(pending);
      failures.push(pending.note || pending.id);
      continue;
    }

    const balanceResult = await applyBalanceUpdate(supabase, {
      type: pending.type,
      amount: Number(pending.amount),
      account_id: pending.account_id,
      transfer_to_account_id: pending.transfer_to_account_id || null,
    });
    if (balanceResult.error) {
      failures.push(`${pending.note || pending.id} (balance update failed)`);
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/transactions");

  if (failures.length > 0) {
    const preview = failures.slice(0, 3).join(", ");
    return {
      error: `Approved ${pendingTxns.length - failures.length} of ${pendingTxns.length}. Failed: ${preview}${failures.length > 3 ? "…" : ""}. Please review your balances.`,
    };
  }
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
    if (formData.has("nvidia_api_key")) updates.nvidia_api_key = formData.get("nvidia_api_key") || null;
    if (formData.has("nvidia_model_id")) updates.nvidia_model_id = formData.get("nvidia_model_id");
  } else {
    updates.approval_required = formData.get("approval_required") === "true";
    updates.regex_enabled = formData.get("regex_enabled") === "true";
    updates.llm_enabled = formData.get("llm_enabled") === "true";
    updates.sync_interval_minutes = parseInt(formData.get("sync_interval_minutes") as string) || 60;
    if (formData.has("sync_lookback_days")) {
      updates.sync_lookback_days = Math.min(30, Math.max(1, parseInt(formData.get("sync_lookback_days") as string) || 3));
    }
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
      accounts!account_id(name)
    `)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);

  return { transactions: data || [] };
}
