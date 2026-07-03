/**
 * Investments data fetcher.
 *
 * Credential priority:
 *   1. zerodha_credentials table (set by /api/zerodha/callback after Kite login)
 *   2. ZERODHA_API_KEY + ZERODHA_ACCESS_TOKEN env vars (manual override)
 *   3. Mock data (neither configured)
 *
 * Kite access tokens expire daily at 6 AM IST. Re-login via /api/zerodha/login.
 */

import { createClient } from "@/lib/supabase/server";
import {
  fetchEquityHoldings,
  fetchMutualFundHoldings,
  ZerodhaCredentialsMissingError,
  type ZerodhaCredentials,
} from "@/lib/zerodha/client";
import { mockEquityHoldings, mockMutualFundHoldings } from "@/lib/zerodha/mockData";
import type {
  EquityHolding,
  MutualFundHolding,
  InvestmentsData,
  PortfolioSummary,
} from "@/lib/zerodha/types";

interface CredentialsLookup {
  creds: ZerodhaCredentials | null;
  /** Set when creds is null: "not_connected" or a real failure description. */
  reason?: string;
}

async function getCredentials(): Promise<CredentialsLookup> {
  // Credentials are stored per-user in zerodha_credentials (RLS: auth.uid() = user_id).
  // No env-var fallback — that would expose one user's portfolio to all logged-in users.
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { creds: null, reason: "not_connected" };

    // maybeSingle: a missing row is a legitimate "not connected", not an error
    const { data, error } = await supabase
      .from("zerodha_credentials")
      .select("api_key, access_token")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      // Table missing (migration not applied), RLS problem, or query failure —
      // this is NOT "not connected"; surface the real cause instead of masking it.
      console.error("[investments] zerodha_credentials lookup failed:", error.message);
      return { creds: null, reason: `credentials lookup failed: ${error.message}` };
    }

    if (data?.api_key && data?.access_token) {
      return { creds: { apiKey: data.api_key, accessToken: data.access_token } };
    }

    return { creds: null, reason: "not_connected" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[investments] credentials lookup threw:", msg);
    return { creds: null, reason: `credentials lookup failed: ${msg}` };
  }
}

function summariseEquity(holdings: EquityHolding[]): PortfolioSummary {
  let invested = 0, current = 0, dayChange = 0;
  for (const h of holdings) {
    invested += h.average_price * h.quantity;
    current += h.last_price * h.quantity;
    dayChange += h.day_change * h.quantity;
  }
  const pnl = current - invested;
  return {
    invested, current, pnl,
    pnlPercent: invested > 0 ? (pnl / invested) * 100 : 0,
    dayChange,
    dayChangePercent: current > 0 ? (dayChange / current) * 100 : 0,
  };
}

function summariseMf(holdings: MutualFundHolding[]): PortfolioSummary {
  let invested = 0, current = 0;
  for (const h of holdings) {
    invested += h.average_price * h.quantity;
    current += h.last_price * h.quantity;
  }
  const pnl = current - invested;
  return {
    invested, current, pnl,
    pnlPercent: invested > 0 ? (pnl / invested) * 100 : 0,
    dayChange: 0,
    dayChangePercent: 0,
  };
}

function combine(a: PortfolioSummary, b: PortfolioSummary): PortfolioSummary {
  const invested = a.invested + b.invested;
  const current = a.current + b.current;
  const pnl = current - invested;
  const dayChange = a.dayChange + b.dayChange;
  return {
    invested, current, pnl,
    pnlPercent: invested > 0 ? (pnl / invested) * 100 : 0,
    dayChange,
    dayChangePercent: current > 0 ? (dayChange / current) * 100 : 0,
  };
}

export async function getInvestmentsData(): Promise<InvestmentsData> {
  const { creds, reason } = await getCredentials();

  let equity: EquityHolding[];
  let mutualFunds: MutualFundHolding[];
  let source: "live" | "mock" = "live";
  let mockReason: string | undefined;

  if (!creds) {
    source = "mock";
    mockReason = reason || "not_connected";
    equity = mockEquityHoldings;
    mutualFunds = mockMutualFundHoldings;
  } else {
    try {
      [equity, mutualFunds] = await Promise.all([
        fetchEquityHoldings(creds),
        fetchMutualFundHoldings(creds),
      ]);
    } catch (err) {
      source = "mock";
      const msg = err instanceof Error ? err.message : String(err);
      // 403 usually means access_token expired — prompt re-login
      if (err instanceof ZerodhaCredentialsMissingError || msg.includes("403")) {
        mockReason = "token_expired";
      } else {
        mockReason = msg;
        console.warn("[investments] Zerodha API error, falling back to mock:", msg);
      }
      equity = mockEquityHoldings;
      mutualFunds = mockMutualFundHoldings;
    }
  }

  const equitySummary = summariseEquity(equity);
  const mfSummary = summariseMf(mutualFunds);
  return {
    equity,
    mutualFunds,
    equitySummary,
    mfSummary,
    totalSummary: combine(equitySummary, mfSummary),
    source,
    mockReason,
  };
}
