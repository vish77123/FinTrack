/**
 * Zerodha Kite Connect OAuth callback.
 *
 * Kite redirects here after user login:
 *   GET /api/zerodha/callback?request_token=XXX&status=success
 *
 * We then:
 *   1. Compute SHA-256(api_key + request_token + api_secret)
 *   2. POST to https://api.kite.trade/session/token
 *   3. Save the returned access_token to zerodha_credentials
 *   4. Redirect to /investments
 *
 * IMPORTANT: next/navigation's redirect() works by THROWING an internal
 * NEXT_REDIRECT error. It must never be called inside a try/catch that
 * catches generic errors — the catch would intercept the redirect itself.
 * All redirect() calls below live outside the try block.
 */

import { createHash } from "crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const KITE_BASE = "https://api.kite.trade";
const KITE_VERSION = "3";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const requestToken = searchParams.get("request_token");

  if (status !== "success" || !requestToken) {
    const errorMsg = searchParams.get("message") || "Login cancelled or failed";
    redirect(`/investments?zerodha_error=${encodeURIComponent(errorMsg)}`);
  }

  const apiKey = process.env.ZERODHA_API_KEY;
  const apiSecret = process.env.ZERODHA_API_SECRET;

  if (!apiKey || !apiSecret) {
    redirect("/investments?zerodha_error=ZERODHA_API_KEY+or+ZERODHA_API_SECRET+not+set+in+.env.local");
  }

  // SHA-256(api_key + request_token + api_secret)
  const checksum = createHash("sha256")
    .update(apiKey + requestToken + apiSecret)
    .digest("hex");

  let accessToken: string | null = null;
  let exchangeError: string | null = null;
  try {
    const res = await fetch(`${KITE_BASE}/session/token`, {
      method: "POST",
      headers: {
        "X-Kite-Version": KITE_VERSION,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        api_key: apiKey,
        request_token: requestToken,
        checksum,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[zerodha/callback] Session token exchange failed:", res.status, text);
      exchangeError = `Token exchange failed (${res.status}): ${text.slice(0, 200)}`;
    } else {
      const json = (await res.json()) as { status: string; data?: { access_token: string } };
      if (json.status !== "success" || !json.data?.access_token) {
        exchangeError = "Kite did not return an access_token";
      } else {
        accessToken = json.data.access_token;
      }
    }
  } catch (err) {
    exchangeError = err instanceof Error ? err.message : String(err);
  }

  if (!accessToken) {
    redirect(`/investments?zerodha_error=${encodeURIComponent(exchangeError || "Unknown error during token exchange")}`);
  }

  // Save to DB so the page can read it server-side
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/investments?zerodha_error=${encodeURIComponent("You were signed out during the Zerodha login. Sign in and try again.")}`);
  }

  const { error: saveError } = await supabase.from("zerodha_credentials").upsert(
    {
      user_id: user.id,
      api_key: apiKey,
      access_token: accessToken,
      token_date: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (saveError) {
    console.error("[zerodha/callback] Failed to save credentials:", saveError.message);
    redirect(`/investments?zerodha_error=${encodeURIComponent(`Login succeeded but saving credentials failed: ${saveError.message}`)}`);
  }

  redirect("/investments?zerodha_connected=1");
}
