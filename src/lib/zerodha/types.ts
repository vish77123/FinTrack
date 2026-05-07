/**
 * Zerodha Kite Connect API types.
 * Shapes mirror the official REST responses:
 *   GET /portfolio/holdings  -> EquityHolding[]
 *   GET /mf/holdings         -> MutualFundHolding[]
 */

export interface EquityHolding {
  tradingsymbol: string;
  exchange: string;
  isin: string;
  quantity: number;
  average_price: number;
  last_price: number;
  close_price: number;
  pnl: number;
  day_change: number;
  day_change_percentage: number;
  product: string;
}

export interface MutualFundHolding {
  folio: string;
  fund: string;
  tradingsymbol: string; // ISIN
  average_price: number;
  last_price: number;
  last_price_date: string;
  pnl: number;
  quantity: number;
}

export interface PortfolioSummary {
  invested: number;
  current: number;
  pnl: number;
  pnlPercent: number;
  dayChange: number;
  dayChangePercent: number;
}

export interface InvestmentsData {
  equity: EquityHolding[];
  mutualFunds: MutualFundHolding[];
  equitySummary: PortfolioSummary;
  mfSummary: PortfolioSummary;
  totalSummary: PortfolioSummary;
  /** "live" means the Kite API was reached. "mock" means not connected or call failed. */
  source: "live" | "mock";
  /**
   * "not_connected" — no credentials at all, show Connect button.
   * "token_expired" — had credentials but got 403, prompt re-login.
   * any other string — API error message.
   */
  mockReason?: "not_connected" | "token_expired" | string;
}
