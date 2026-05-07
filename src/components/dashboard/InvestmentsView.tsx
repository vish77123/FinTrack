"use client";

import { useMemo, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Search,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type {
  InvestmentsData,
  PortfolioSummary,
  EquityHolding,
  MutualFundHolding,
} from "@/lib/zerodha/types";
import styles from "./investments.module.css";

interface Props {
  data: InvestmentsData;
  currency: string;
}

// Donut colors — distinct, work on both light and dark themes.
const DONUT_COLORS = [
  "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b",
  "#ef4444", "#3b82f6", "#ec4899", "#84cc16",
];
const OTHERS_COLOR = "#6b7280";

// ─────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────
function formatINR(currency: string, amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}${currency}${Math.abs(amount).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(p: number): string {
  if (p === 0 || Number.isNaN(p)) return "—";
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(2)}%`;
}

function pnlClass(value: number): string {
  if (value > 0) return styles.positive;
  if (value < 0) return styles.negative;
  return styles.neutral;
}

// ─────────────────────────────────────────────────────────────
// Banner
// ─────────────────────────────────────────────────────────────
function MockBanner({ reason }: { reason?: InvestmentsData["mockReason"] }) {
  if (reason === "not_connected") {
    return (
      <div className={styles.banner}>
        <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1 }}>
          <strong>Zerodha not connected.</strong> Connect your account to see live holdings.
          <br />
          <a href="/api/zerodha/login" className={styles.connectLink}>
            Connect Zerodha →
          </a>
        </div>
      </div>
    );
  }
  if (reason === "token_expired") {
    return (
      <div className={styles.bannerError}>
        <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1 }}>
          <strong>Zerodha session expired.</strong> Kite access tokens reset daily at 6 AM IST.
          <br />
          <a href="/api/zerodha/login" className={styles.connectLink}>
            Re-login to Zerodha →
          </a>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.banner}>
      <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>Could not reach Zerodha ({reason}). Showing sample data.</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Summary card
// ─────────────────────────────────────────────────────────────
function SummaryCard({
  label,
  summary,
  currency,
  showDayChange,
  bottomLine,
}: {
  label: string;
  summary: PortfolioSummary;
  currency: string;
  showDayChange?: boolean;
  bottomLine?: string;
}) {
  const PnlIcon = summary.pnl >= 0 ? TrendingUp : TrendingDown;
  return (
    <div className={styles.summaryCard}>
      <div className={styles.summaryLabel}>{label}</div>
      <div className={styles.summaryValue}>{formatINR(currency, summary.current)}</div>
      <div className={`${styles.summarySub} ${pnlClass(summary.pnl)}`}>
        <PnlIcon size={14} />
        {formatINR(currency, summary.pnl)} ({formatPercent(summary.pnlPercent)})
      </div>
      {showDayChange && (
        <div className={`${styles.summarySubSmall} ${pnlClass(summary.dayChange)}`}>
          Today: {formatINR(currency, summary.dayChange)} ({formatPercent(summary.dayChangePercent)})
        </div>
      )}
      {bottomLine && (
        <div className={`${styles.summarySubSmall} ${styles.neutral}`}>{bottomLine}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Allocation donut
// ─────────────────────────────────────────────────────────────
interface AllocationSlice {
  name: string;
  value: number;
  color: string;
}

function buildAllocation(
  equity: EquityHolding[],
  mfs: MutualFundHolding[]
): AllocationSlice[] {
  const items: { name: string; value: number }[] = [];
  for (const h of equity) items.push({ name: h.tradingsymbol, value: h.last_price * h.quantity });
  for (const h of mfs) items.push({ name: shortFundName(h.fund), value: h.last_price * h.quantity });
  items.sort((a, b) => b.value - a.value);

  const top = items.slice(0, 7);
  const rest = items.slice(7);
  const slices: AllocationSlice[] = top.map((it, i) => ({
    name: it.name,
    value: it.value,
    color: DONUT_COLORS[i] ?? OTHERS_COLOR,
  }));
  if (rest.length > 0) {
    slices.push({
      name: `Others (${rest.length})`,
      value: rest.reduce((s, it) => s + it.value, 0),
      color: OTHERS_COLOR,
    });
  }
  return slices;
}

function shortFundName(fund: string): string {
  // "Parag Parikh Flexi Cap Fund - Direct Plan - Growth" → "Parag Parikh Flexi Cap"
  return fund.split(" - ")[0].replace(/\s*Fund\s*$/, "").trim();
}

function AllocationDonut({
  slices,
  currency,
}: {
  slices: AllocationSlice[];
  currency: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) return null;
  const pct = (v: number) => ((v / total) * 100).toFixed(1);

  return (
    <div className={styles.allocationCard}>
      <div className={styles.summaryLabel}>Allocation</div>
      <div className={styles.donutWrap}>
        <div className={styles.donutChart}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {slices.map((s, i) => (
                  <Cell key={i} fill={s.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v) => {
                  const num = typeof v === "number" ? v : Number(v);
                  return [`${formatINR(currency, num)} (${pct(num)}%)`, ""];
                }}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--text-primary)",
                }}
                itemStyle={{ color: "var(--text-primary)" }}
                labelStyle={{ color: "var(--text-primary)" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className={styles.donutLegend}>
          {slices.map((s) => (
            <div key={s.name} className={styles.legendItem}>
              <div className={styles.legendLabel}>
                <span className={styles.legendDot} style={{ background: s.color }} />
                <span className={styles.legendName}>{s.name}</span>
              </div>
              <span className={styles.legendValue}>{pct(s.value)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Top movers
// ─────────────────────────────────────────────────────────────
function TopMovers({ equity }: { equity: EquityHolding[] }) {
  const sorted = useMemo(
    () => [...equity].sort((a, b) => b.day_change_percentage - a.day_change_percentage),
    [equity]
  );
  const gainers = sorted.filter((h) => h.day_change_percentage > 0).slice(0, 3);
  const losers = sorted.filter((h) => h.day_change_percentage < 0).slice(-3).reverse();

  if (gainers.length === 0 && losers.length === 0) return null;

  return (
    <div className={styles.moversCard}>
      <div className={styles.summaryLabel}>Today&apos;s Movers</div>
      <div className={styles.moversList}>
        {gainers.map((h) => (
          <div key={`up-${h.tradingsymbol}`} className={`${styles.moverPill} ${styles.moverUp}`}>
            <ArrowUp size={12} />
            <span className={styles.moverSym}>{h.tradingsymbol}</span>
            <span className={styles.moverPct}>{formatPercent(h.day_change_percentage)}</span>
          </div>
        ))}
        {losers.map((h) => (
          <div key={`down-${h.tradingsymbol}`} className={`${styles.moverPill} ${styles.moverDown}`}>
            <ArrowDown size={12} />
            <span className={styles.moverSym}>{h.tradingsymbol}</span>
            <span className={styles.moverPct}>{formatPercent(h.day_change_percentage)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sorting helpers
// ─────────────────────────────────────────────────────────────
type SortDir = "asc" | "desc";
type EquitySortKey =
  | "symbol" | "qty" | "avg" | "ltp" | "current" | "pnl" | "day";
type MfSortKey =
  | "fund" | "units" | "avg" | "ltp" | "current" | "pnl";

function sortEquity(
  rows: EquityHolding[],
  key: EquitySortKey,
  dir: SortDir
): EquityHolding[] {
  const sign = dir === "asc" ? 1 : -1;
  const sorted = [...rows].sort((a, b) => {
    switch (key) {
      case "symbol": return sign * a.tradingsymbol.localeCompare(b.tradingsymbol);
      case "qty":     return sign * (a.quantity - b.quantity);
      case "avg":     return sign * (a.average_price - b.average_price);
      case "ltp":     return sign * (a.last_price - b.last_price);
      case "current": return sign * ((a.last_price * a.quantity) - (b.last_price * b.quantity));
      case "pnl":     return sign * (a.pnl - b.pnl);
      case "day":     return sign * (a.day_change_percentage - b.day_change_percentage);
    }
  });
  return sorted;
}

function sortMf(rows: MutualFundHolding[], key: MfSortKey, dir: SortDir): MutualFundHolding[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    switch (key) {
      case "fund":    return sign * a.fund.localeCompare(b.fund);
      case "units":   return sign * (a.quantity - b.quantity);
      case "avg":     return sign * (a.average_price - b.average_price);
      case "ltp":     return sign * (a.last_price - b.last_price);
      case "current": return sign * ((a.last_price * a.quantity) - (b.last_price * b.quantity));
      case "pnl":     return sign * (a.pnl - b.pnl);
    }
  });
}

function SortHeader<K extends string>({
  label,
  sortKey,
  current,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: K;
  current: K;
  dir: SortDir;
  onSort: (k: K) => void;
  align?: "left" | "right";
}) {
  const active = current === sortKey;
  return (
    <th
      className={`${styles.sortableTh} ${align === "right" ? styles.numeric : ""}`}
      onClick={() => onSort(sortKey)}
    >
      <span className={styles.sortHeaderInner}>
        {label}
        <span className={`${styles.sortIcon} ${active ? styles.sortIconActive : ""}`}>
          {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </span>
    </th>
  );
}

// ─────────────────────────────────────────────────────────────
// Filters bar
// ─────────────────────────────────────────────────────────────
type EquityFilter = "all" | "gainers" | "losers" | "nse" | "bse";

function FiltersBar({
  search,
  onSearch,
  filter,
  onFilter,
  showExchangeChips,
}: {
  search: string;
  onSearch: (v: string) => void;
  filter: EquityFilter;
  onFilter: (f: EquityFilter) => void;
  showExchangeChips: boolean;
}) {
  const chips: { id: EquityFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "gainers", label: "Gainers" },
    { id: "losers", label: "Losers" },
    ...(showExchangeChips
      ? [
          { id: "nse" as EquityFilter, label: "NSE" },
          { id: "bse" as EquityFilter, label: "BSE" },
        ]
      : []),
  ];
  return (
    <div className={styles.filtersBar}>
      <div className={styles.searchWrap}>
        <Search size={14} className={styles.searchIcon} />
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className={styles.searchInput}
        />
      </div>
      <div className={styles.chipRow}>
        {chips.map((c) => (
          <button
            key={c.id}
            onClick={() => onFilter(c.id)}
            className={`${styles.chip} ${filter === c.id ? styles.chipActive : ""}`}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Equity list (table on desktop, cards on mobile)
// ─────────────────────────────────────────────────────────────
function EquitySection({
  holdings,
  currency,
}: {
  holdings: EquityHolding[];
  currency: string;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<EquityFilter>("all");
  const [sortKey, setSortKey] = useState<EquitySortKey>("current");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filtered = useMemo(() => {
    let rows = holdings;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((h) => h.tradingsymbol.toLowerCase().includes(q));
    }
    switch (filter) {
      case "gainers": rows = rows.filter((h) => h.pnl > 0); break;
      case "losers":  rows = rows.filter((h) => h.pnl < 0); break;
      case "nse":     rows = rows.filter((h) => h.exchange === "NSE"); break;
      case "bse":     rows = rows.filter((h) => h.exchange === "BSE"); break;
    }
    return sortEquity(rows, sortKey, sortDir);
  }, [holdings, search, filter, sortKey, sortDir]);

  const onSort = (k: EquitySortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "symbol" ? "asc" : "desc"); }
  };

  if (holdings.length === 0) {
    return (
      <div className={styles.tableWrap}>
        <div className={styles.emptyState}>No equity holdings.</div>
      </div>
    );
  }

  return (
    <>
      <FiltersBar
        search={search}
        onSearch={setSearch}
        filter={filter}
        onFilter={setFilter}
        showExchangeChips
      />

      {filtered.length === 0 ? (
        <div className={styles.tableWrap}>
          <div className={styles.emptyState}>No matches.</div>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className={`${styles.tableWrap} ${styles.desktopOnly}`}>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <SortHeader<EquitySortKey> label="Stock"   sortKey="symbol"  current={sortKey} dir={sortDir} onSort={onSort} />
                    <SortHeader<EquitySortKey> label="Qty"     sortKey="qty"     current={sortKey} dir={sortDir} onSort={onSort} align="right" />
                    <SortHeader<EquitySortKey> label="Avg."    sortKey="avg"     current={sortKey} dir={sortDir} onSort={onSort} align="right" />
                    <SortHeader<EquitySortKey> label="LTP"     sortKey="ltp"     current={sortKey} dir={sortDir} onSort={onSort} align="right" />
                    <SortHeader<EquitySortKey> label="Current" sortKey="current" current={sortKey} dir={sortDir} onSort={onSort} align="right" />
                    <SortHeader<EquitySortKey> label="P&L"     sortKey="pnl"     current={sortKey} dir={sortDir} onSort={onSort} align="right" />
                    <SortHeader<EquitySortKey> label="Day"     sortKey="day"     current={sortKey} dir={sortDir} onSort={onSort} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((h) => {
                    const current = h.last_price * h.quantity;
                    const invested = h.average_price * h.quantity;
                    const pnlPct = invested > 0 ? (h.pnl / invested) * 100 : 0;
                    const dayValue = h.day_change * h.quantity;
                    return (
                      <tr key={`${h.exchange}:${h.tradingsymbol}`}>
                        <td>
                          <div className={styles.symbol}>{h.tradingsymbol}</div>
                          <div className={styles.exchange}>{h.exchange}</div>
                        </td>
                        <td className={styles.numeric}>{h.quantity}</td>
                        <td className={styles.numeric}>{h.average_price.toFixed(2)}</td>
                        <td className={styles.numeric}>{h.last_price.toFixed(2)}</td>
                        <td className={styles.numeric}>{formatINR(currency, current)}</td>
                        <td className={`${styles.numeric} ${pnlClass(h.pnl)}`}>
                          {formatINR(currency, h.pnl)}
                          <div className={styles.subPct}>{formatPercent(pnlPct)}</div>
                        </td>
                        <td className={`${styles.numeric} ${pnlClass(dayValue)}`}>
                          {formatPercent(h.day_change_percentage)}
                          <div className={styles.subPct}>
                            {dayValue === 0 ? "—" : formatINR(currency, dayValue)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className={styles.mobileOnly}>
            <div className={styles.cardList}>
              {filtered.map((h) => {
                const current = h.last_price * h.quantity;
                const invested = h.average_price * h.quantity;
                const pnlPct = invested > 0 ? (h.pnl / invested) * 100 : 0;
                return (
                  <div key={`${h.exchange}:${h.tradingsymbol}`} className={styles.holdingCard}>
                    <div className={styles.holdingCardLeft}>
                      <div className={styles.symbol}>{h.tradingsymbol}</div>
                      <div className={styles.exchange}>
                        {h.exchange} · {h.quantity} @ ₹{h.average_price.toFixed(2)}
                      </div>
                    </div>
                    <div className={styles.holdingCardRight}>
                      <div className={styles.holdingCardCurrent}>
                        {formatINR(currency, current)}
                      </div>
                      <div className={`${styles.holdingCardPnl} ${pnlClass(h.pnl)}`}>
                        {formatPercent(pnlPct)} · {formatPercent(h.day_change_percentage)} today
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Mutual fund list
// ─────────────────────────────────────────────────────────────
function MutualFundSection({
  holdings,
  currency,
}: {
  holdings: MutualFundHolding[];
  currency: string;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<EquityFilter>("all");
  const [sortKey, setSortKey] = useState<MfSortKey>("current");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filtered = useMemo(() => {
    let rows = holdings;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((h) => h.fund.toLowerCase().includes(q));
    }
    if (filter === "gainers") rows = rows.filter((h) => h.pnl > 0);
    if (filter === "losers")  rows = rows.filter((h) => h.pnl < 0);
    return sortMf(rows, sortKey, sortDir);
  }, [holdings, search, filter, sortKey, sortDir]);

  const onSort = (k: MfSortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "fund" ? "asc" : "desc"); }
  };

  if (holdings.length === 0) {
    return (
      <div className={styles.tableWrap}>
        <div className={styles.emptyState}>No mutual fund holdings.</div>
      </div>
    );
  }

  return (
    <>
      <FiltersBar
        search={search}
        onSearch={setSearch}
        filter={filter}
        onFilter={setFilter}
        showExchangeChips={false}
      />

      {filtered.length === 0 ? (
        <div className={styles.tableWrap}>
          <div className={styles.emptyState}>No matches.</div>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className={`${styles.tableWrap} ${styles.desktopOnly}`}>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <SortHeader<MfSortKey> label="Fund"        sortKey="fund"    current={sortKey} dir={sortDir} onSort={onSort} />
                    <SortHeader<MfSortKey> label="Units"       sortKey="units"   current={sortKey} dir={sortDir} onSort={onSort} align="right" />
                    <SortHeader<MfSortKey> label="Avg. NAV"    sortKey="avg"     current={sortKey} dir={sortDir} onSort={onSort} align="right" />
                    <SortHeader<MfSortKey> label="Current NAV" sortKey="ltp"     current={sortKey} dir={sortDir} onSort={onSort} align="right" />
                    <SortHeader<MfSortKey> label="Current"     sortKey="current" current={sortKey} dir={sortDir} onSort={onSort} align="right" />
                    <SortHeader<MfSortKey> label="P&L"         sortKey="pnl"     current={sortKey} dir={sortDir} onSort={onSort} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((h) => {
                    const current = h.last_price * h.quantity;
                    const invested = h.average_price * h.quantity;
                    const pnlPct = invested > 0 ? (h.pnl / invested) * 100 : 0;
                    return (
                      <tr key={`${h.folio}:${h.tradingsymbol}`}>
                        <td>
                          <div className={styles.fundName}>{h.fund}</div>
                          <div className={styles.folio}>Folio {h.folio}</div>
                        </td>
                        <td className={styles.numeric}>{h.quantity.toFixed(3)}</td>
                        <td className={styles.numeric}>{h.average_price.toFixed(2)}</td>
                        <td className={styles.numeric}>{h.last_price.toFixed(2)}</td>
                        <td className={styles.numeric}>{formatINR(currency, current)}</td>
                        <td className={`${styles.numeric} ${pnlClass(h.pnl)}`}>
                          {formatINR(currency, h.pnl)}
                          <div className={styles.subPct}>{formatPercent(pnlPct)}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className={styles.mobileOnly}>
            <div className={styles.cardList}>
              {filtered.map((h) => {
                const current = h.last_price * h.quantity;
                const invested = h.average_price * h.quantity;
                const pnlPct = invested > 0 ? (h.pnl / invested) * 100 : 0;
                return (
                  <div key={`${h.folio}:${h.tradingsymbol}`} className={styles.holdingCard}>
                    <div className={styles.holdingCardLeft}>
                      <div className={styles.symbol} style={{ fontSize: 13 }}>
                        {shortFundName(h.fund)}
                      </div>
                      <div className={styles.exchange}>
                        {h.quantity.toFixed(3)} units @ ₹{h.average_price.toFixed(2)}
                      </div>
                    </div>
                    <div className={styles.holdingCardRight}>
                      <div className={styles.holdingCardCurrent}>
                        {formatINR(currency, current)}
                      </div>
                      <div className={`${styles.holdingCardPnl} ${pnlClass(h.pnl)}`}>
                        {formatPercent(pnlPct)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Main view
// ─────────────────────────────────────────────────────────────
type Tab = "equity" | "mutual-funds";

export default function InvestmentsView({ data, currency }: Props) {
  const [tab, setTab] = useState<Tab>("equity");
  const allocation = useMemo(
    () => buildAllocation(data.equity, data.mutualFunds),
    [data.equity, data.mutualFunds]
  );

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1>Investments</h1>
          <p>Stocks and mutual funds synced from Zerodha</p>
        </div>
        <div
          className={`${styles.sourceBadge} ${
            data.source === "live" ? styles.sourceBadgeLive : styles.sourceBadgeMock
          }`}
        >
          {data.source === "live" ? (
            <>
              <CheckCircle2 size={14} /> Live from Zerodha
            </>
          ) : (
            <>
              <AlertCircle size={14} /> Sample data
            </>
          )}
        </div>
      </div>

      {data.source === "mock" && <MockBanner reason={data.mockReason} />}

      <div className={styles.summaryGrid}>
        <SummaryCard label="Total Portfolio" summary={data.totalSummary} currency={currency} showDayChange />
        <SummaryCard label="Equity"          summary={data.equitySummary} currency={currency} showDayChange />
        <SummaryCard label="Mutual Funds"    summary={data.mfSummary}     currency={currency} />
        <SummaryCard
          label="Invested"
          summary={{
            invested: data.totalSummary.invested,
            current: data.totalSummary.invested,
            pnl: 0, pnlPercent: 0, dayChange: 0, dayChangePercent: 0,
          }}
          currency={currency}
          bottomLine={`${data.equity.length} stocks · ${data.mutualFunds.length} funds`}
        />
      </div>

      <div className={styles.insightsRow}>
        <AllocationDonut slices={allocation} currency={currency} />
        <TopMovers equity={data.equity} />
      </div>

      <div className={styles.tabs} role="tablist">
        <button
          role="tab"
          aria-selected={tab === "equity"}
          className={`${styles.tab} ${tab === "equity" ? styles.tabActive : ""}`}
          onClick={() => setTab("equity")}
        >
          Stocks ({data.equity.length})
        </button>
        <button
          role="tab"
          aria-selected={tab === "mutual-funds"}
          className={`${styles.tab} ${tab === "mutual-funds" ? styles.tabActive : ""}`}
          onClick={() => setTab("mutual-funds")}
        >
          Mutual Funds ({data.mutualFunds.length})
        </button>
      </div>

      {tab === "equity" ? (
        <EquitySection holdings={data.equity} currency={currency} />
      ) : (
        <MutualFundSection holdings={data.mutualFunds} currency={currency} />
      )}
    </div>
  );
}
