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

  let accessToken: string;
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
      redirect(
        `/investments?zerodha_error=${encodeURIComponent(`Token exchange failed (${res.status}): ${text}`)}`
      );
    }

    const json = (await res.json()) as { status: string; data?: { access_token: string } };
    if (json.status !== "success" || !json.data?.access_token) {
      redirect("/investments?zerodha_error=Kite+did+not+return+an+access_token");
    }
    accessToken = json.data.access_token;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    redirect(`/investments?zerodha_error=${encodeURIComponent(msg)}`);
  }

  // Save to DB so the page can read it server-side
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    await supabase.from("zerodha_credentials").upsert(
      {
        user_id: user.id,
        api_key: apiKey,
        access_token: accessToken,
        token_date: new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  }

  redirect("/investments?zerodha_connected=1");
}
