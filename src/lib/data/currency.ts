/**
 * Display currency symbol.
 *
 * profiles.currency_code exists per user, but every data fetcher currently
 * hardcodes the rupee symbol (see getDashboardData / getReportsData). This is
 * the single shared source for pages that only need the symbol — e.g.
 * /investments, which previously fetched the user's entire transaction
 * history via getDashboardData() just to read this one character.
 */
export const CURRENCY_SYMBOL = "₹";
