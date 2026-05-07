/**
 * Zerodha Kite Connect REST client.
 *
 * Auth flow:
 *   1. User visits /api/zerodha/login  → redirects to Kite login page.
 *   2. Kite redirects to /api/zerodha/callback?request_token=XXX&status=success
 *   3. Callback computes SHA-256(api_key + request_token + api_secret) and POSTs
 *      to /session/token to get an access_token.
 *   4. access_token is saved to zerodha_credentials table (expires daily at 6 AM IST).
 *
 * Env vars (only needed for the callback — not for API calls themselves):
 *   ZERODHA_API_KEY     — Kite Connect app key
 *   ZERODHA_API_SECRET  — Kite Connect app secret (never sent to client)
 */

import type { EquityHolding, MutualFundHolding } from "./types";

const KITE_BASE_URL = "https://api.kite.trade";
const KITE_API_VERSION = "3";

export interface ZerodhaCredentials {
  apiKey: string;
  accessToken: string;
}

export class ZerodhaCredentialsMissingError extends Error {
  constructor() {
    super("Zerodha not connected — visit /api/zerodha/login to authenticate");
    this.name = "ZerodhaCredentialsMissingError";
  }
}

export class ZerodhaApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ZerodhaApiError";
  }
}

async function kiteGet<T>(path: string, creds: ZerodhaCredentials): Promise<T> {
  const res = await fetch(`${KITE_BASE_URL}${path}`, {
    headers: {
      "X-Kite-Version": KITE_API_VERSION,
      Authorization: `token ${creds.apiKey}:${creds.accessToken}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ZerodhaApiError(res.status, `Kite ${path} → ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { status: string; data: T; message?: string };
  if (json.status !== "success") {
    throw new ZerodhaApiError(res.status, json.message ?? `Kite ${path} returned non-success`);
  }
  return json.data;
}

export async function fetchEquityHoldings(creds: ZerodhaCredentials): Promise<EquityHolding[]> {
  return kiteGet<EquityHolding[]>("/portfolio/holdings", creds);
}

export async function fetchMutualFundHoldings(creds: ZerodhaCredentials): Promise<MutualFundHolding[]> {
  return kiteGet<MutualFundHolding[]>("/mf/holdings", creds);
}
