"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle2 } from "lucide-react";
import type { InvestmentsData, PortfolioSummary } from "@/lib/zerodha/types";
import styles from "./investments.module.css";

interface Props {
  data: InvestmentsData;
  currency: string;
}

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
  // Generic API error
  return (
    <div className={styles.banner}>
      <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>Could not reach Zerodha ({reason}). Showing sample data.</span>
    </div>
  );
}

type Tab = "equity" | "mutual-funds";

function formatINR(currency: string, amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}${currency}${Math.abs(amount).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(p: number): string {
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(2)}%`;
}

function pnlClass(value: number): string {
  if (value > 0) return styles.positive;
  if (value < 0) return styles.negative;
  return styles.neutral;
}

function SummaryCard({
  label,
  summary,
  currency,
  showDayChange,
}: {
  label: string;
  summary: PortfolioSummary;
  currency: string;
  showDayChange?: boolean;
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
        <div className={`${styles.summarySub} ${pnlClass(summary.dayChange)}`} style={{ fontSize: 12 }}>
          Today: {formatINR(currency, summary.dayChange)} ({formatPercent(summary.dayChangePercent)})
        </div>
      )}
    </div>
  );
}

export default function InvestmentsView({ data, currency }: Props) {
  const [tab, setTab] = useState<Tab>("equity");

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

      {data.source === "mock" && (
        <MockBanner reason={data.mockReason} />
      )}

      <div className={styles.summaryGrid}>
        <SummaryCard label="Total Portfolio" summary={data.totalSummary} currency={currency} showDayChange />
        <SummaryCard label="Equity" summary={data.equitySummary} currency={currency} showDayChange />
        <SummaryCard label="Mutual Funds" summary={data.mfSummary} currency={currency} />
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Invested</div>
          <div className={styles.summaryValue}>{formatINR(currency, data.totalSummary.invested)}</div>
          <div className={`${styles.summarySub} ${styles.neutral}`} style={{ fontSize: 12 }}>
            Across {data.equity.length} stocks &amp; {data.mutualFunds.length} funds
          </div>
        </div>
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
        <EquityTable holdings={data.equity} currency={currency} />
      ) : (
        <MutualFundTable holdings={data.mutualFunds} currency={currency} />
      )}
    </div>
  );
}

function EquityTable({
  holdings,
  currency,
}: {
  holdings: InvestmentsData["equity"];
  currency: string;
}) {
  if (holdings.length === 0) {
    return (
      <div className={styles.tableWrap}>
        <div className={styles.emptyState}>No equity holdings.</div>
      </div>
    );
  }

  return (
    <div className={styles.tableWrap}>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Stock</th>
              <th className={styles.numeric}>Qty</th>
              <th className={styles.numeric}>Avg.</th>
              <th className={styles.numeric}>LTP</th>
              <th className={styles.numeric}>Current</th>
              <th className={styles.numeric}>P&amp;L</th>
              <th className={styles.numeric}>Day</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const current = h.last_price * h.quantity;
              const invested = h.average_price * h.quantity;
              const pnlPct = invested > 0 ? (h.pnl / invested) * 100 : 0;
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
                    <div style={{ fontSize: 11 }}>{formatPercent(pnlPct)}</div>
                  </td>
                  <td className={`${styles.numeric} ${pnlClass(h.day_change)}`}>
                    {formatPercent(h.day_change_percentage)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MutualFundTable({
  holdings,
  currency,
}: {
  holdings: InvestmentsData["mutualFunds"];
  currency: string;
}) {
  if (holdings.length === 0) {
    return (
      <div className={styles.tableWrap}>
        <div className={styles.emptyState}>No mutual fund holdings.</div>
      </div>
    );
  }

  return (
    <div className={styles.tableWrap}>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Fund</th>
              <th className={styles.numeric}>Units</th>
              <th className={styles.numeric}>Avg. NAV</th>
              <th className={styles.numeric}>Current NAV</th>
              <th className={styles.numeric}>Current</th>
              <th className={styles.numeric}>P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
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
                    <div style={{ fontSize: 11 }}>{formatPercent(pnlPct)}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
