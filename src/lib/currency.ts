// Single source of truth for the display currency symbol. Pages that only
// need the symbol (e.g. /investments) import this instead of running the
// whole dashboard data pipeline. If per-user currency (profiles.currency_code)
// ever lands, this becomes a lookup — update all importers together.
export const CURRENCY_SYMBOL = "₹";
