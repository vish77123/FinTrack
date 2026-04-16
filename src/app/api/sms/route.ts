/**
 * SMS Webhook API Route
 * Receives bank SMS from iPhone Shortcuts and processes inline.
 * 
 * Flow:
 * 1. Validate secret query param
 * 2. Insert raw_sms via Supabase RPC
 * 3. Parse SMS inline (Regex → Gemini → Bytez)
 * 4. Insert pending_transaction if parsed successfully
 */

import { createClient } from "@supabase/supabase-js";
import { parseSmsToTransaction } from "@/lib/sms/orchestrator";
import type { RawSms } from "@/lib/sms/orchestrator";

// Use service-level Supabase client for the webhook (no user session)
// REQUIRES SUPABASE_SERVICE_ROLE_KEY in .env.local to bypass RLS on profiles table
function getSupabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.warn("[SMS-API] SUPABASE_SERVICE_ROLE_KEY not set — profile lookup will fail RLS. Add it to .env.local.");
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret");

    if (!secret) {
      return Response.json({ error: "Missing secret parameter" }, { status: 400 });
    }

    // Parse body
    let body: any;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { sender, body: smsBody, received_at } = body;

    if (!sender || !smsBody) {
      return Response.json({ error: "Missing required fields: sender, body" }, { status: 400 });
    }

    // Use anon key client for the RPC (it's a SECURITY DEFINER function that validates the secret)
    const supabaseAnon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Insert raw SMS via the existing RPC function
    const { data: smsId, error: rpcError } = await supabaseAnon.rpc("insert_sms_via_webhook", {
      secret,
      p_sender: sender,
      p_body: smsBody,
      p_received_at: received_at || new Date().toISOString(),
    });

    if (rpcError) {
      console.error("[SMS-API] RPC error:", rpcError.message);
      if (rpcError.message?.includes("Invalid webhook secret")) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      return Response.json({ error: "Failed to store SMS" }, { status: 500 });
    }

    console.log(`[SMS-API] ✓ Raw SMS stored: ${smsId}`);

    // ── Inline parsing ──────────────────────────────────────
    // Look up the user_id from the secret so we can fetch their settings
    const supabase = getSupabaseAdmin();

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("webhook_secret", secret)
      .single();

    if (!profile) {
      // SMS was stored (RPC succeeded), but we can't parse without user context
      return Response.json({ success: true, smsId, parsed: false });
    }

    const userId = profile.id;

    try {
      // Fetch user settings
      const { data: settings } = await supabase
        .from("email_sync_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      const regexEnabled = settings?.regex_enabled ?? true;
      const llmEnabled = settings?.llm_enabled ?? false;

      // Fetch categories for LLM context
      const { data: categories } = await supabase
        .from("categories")
        .select("id, name, type")
        .eq("user_id", userId);

      // Build the RawSms object
      const rawSms: RawSms = {
        id: smsId,
        user_id: userId,
        sender,
        body: smsBody,
        received_at: received_at || new Date().toISOString(),
      };

      // Run the 3-layer parser
      const parsed = await parseSmsToTransaction(rawSms, {
        regexEnabled,
        llmEnabled,
        settings,
        categories: categories || [],
      });

      if (!parsed) {
        console.log(`[SMS-API] No parse result for SMS ${smsId}`);
        return Response.json({ success: true, smsId, parsed: false });
      }

      // ── Dedup check ─────────────────────────────────────
      const { data: existingPending } = await supabase
        .from("pending_transactions")
        .select("id")
        .eq("raw_sms_id", smsId)
        .eq("user_id", userId)
        .maybeSingle();

      if (existingPending) {
        console.log(`[SMS-API] Dedup: pending transaction already exists for SMS ${smsId}`);
        return Response.json({ success: true, smsId, parsed: true, dedup: true });
      }

      // ── Account matching via alert profiles ─────────────
      let matchedAccountId: string | null = null;
      const { data: alertProfiles } = await supabase
        .from("account_alert_profiles")
        .select("*, accounts(id, name)")
        .eq("user_id", userId);

      if (alertProfiles && parsed.last4) {
        const match = alertProfiles.find((p: any) => p.account_last4 === parsed.last4);
        if (match) matchedAccountId = match.account_id;
      }

      // ── Merchant rules ──────────────────────────────────
      const { data: merchantRules } = await supabase
        .from("merchant_rules")
        .select("*")
        .eq("user_id", userId);

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

      // ── Date validation (same as gmail.ts) ──────────────
      if (parsed.date && rawSms.received_at) {
        const parsedDateObj = new Date(parsed.date);
        const receivedDateObj = new Date(rawSms.received_at);
        const diffTime = Math.abs(receivedDateObj.getTime() - parsedDateObj.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 14) {
          console.log(`[SMS-API] Date hallucination detected (diff: ${diffDays} days). Falling back to received_at.`);
          parsed.date = rawSms.received_at;
        }
      }

      // ── Convert cc_payment → transfer for DB insert ─────
      const insertType = parsed.type === "cc_payment" ? "transfer" : parsed.type;

      // ── Insert pending transaction ──────────────────────
      const { error: insertError } = await supabase
        .from("pending_transactions")
        .insert({
          user_id: userId,
          account_id: matchedAccountId,
          category_id: finalCategoryId,
          type: insertType,
          amount: parsed.amount,
          date: parsed.date,
          note: parsed.merchant,
          original_synced_name: originalMerchantName,
          confidence: parsed.confidence,
          status: "pending",
          raw_snippet: parsed.rawSnippet || smsBody.slice(0, 200),
          parsed_by: parsed.parsedBy,
          source: "sms",
          raw_sms_id: smsId,
        });

      if (insertError) {
        console.error(`[SMS-API] Failed to insert pending transaction:`, insertError);
        return Response.json({ success: true, smsId, parsed: true, saved: false, error: insertError.message });
      }

      console.log(`[SMS-API] ✓ Pending transaction created: Rs.${parsed.amount} ${parsed.type} from ${parsed.merchant}`);
      return Response.json({ success: true, smsId, parsed: true, saved: true });

    } catch (parseError: any) {
      // Parsing errors should never block the HTTP response
      console.error(`[SMS-API] Parse error (non-fatal):`, parseError.message || parseError);
      return Response.json({ success: true, smsId, parsed: false });
    }

  } catch (err: any) {
    console.error("[SMS-API] Unexpected error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
