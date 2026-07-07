"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, FileUp, Plus } from "lucide-react";
import type { CreditCardWithStatements } from "@/lib/data/cards";
import { StatementUploadModal } from "./StatementUploadModal";
import styles from "./cards.module.css";

function formatINR(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function formatMonth(d: string): string {
  return new Date(d).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function formatDay(d: string): string {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/**
 * Layered gradient built from the account color: a lightened top-left, the
 * color itself, and a deep hue-shifted bottom-right, so even flat single-hue
 * account colors render as rich card plastic.
 */
function cardBackground(color: string | null): string {
  const base = color || "#1A1A2E";
  return [
    `radial-gradient(140% 100% at 100% 0%, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.02) 40%, transparent 60%)`,
    `radial-gradient(120% 160% at -10% 110%, rgba(0,0,0,0.4) 0%, transparent 55%)`,
    `linear-gradient(125deg, color-mix(in oklab, ${base} 85%, #ffffff) 0%, ${base} 45%, color-mix(in oklab, ${base} 55%, #050510) 100%)`,
  ].join(", ");
}

function getBankColor(name: string, fallback: string | null): string {
  const n = name.toLowerCase();
  if (n.includes("amex") || n.includes("american express")) return "#0047AB"; // Deep Blue
  if (n.includes("icici")) return "#800000"; // Deep Maroon
  if (n.includes("hdfc")) return "#002366"; // Navy Blue
  if (n.includes("axis")) return "#8B0045"; // Burgundy
  if (n.includes("sbi")) return "#007BA7"; // Cerulean
  if (n.includes("kotak")) return "#E3000F"; // Red
  return fallback || "#1A1A2E"; // Elegant dark fallback
}

function EmvChip() {
  return (
    <svg className={styles.chip} viewBox="0 0 40 30" aria-hidden="true">
      <defs>
        <linearGradient id="chipGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F3D97B" />
          <stop offset="45%" stopColor="#E4B94E" />
          <stop offset="100%" stopColor="#C99A35" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="28" rx="6" fill="url(#chipGold)" stroke="rgba(0,0,0,0.25)" strokeWidth="0.8" />
      <path
        d="M1 11 h11 a4 4 0 0 1 4 4 v0 a4 4 0 0 1 -4 4 H1 M39 11 h-11 a4 4 0 0 0 -4 4 v0 a4 4 0 0 0 4 4 h11 M16 1 v8 M24 1 v8 M16 29 v-8 M24 29 v-8"
        fill="none"
        stroke="rgba(80,50,0,0.45)"
        strokeWidth="1.1"
      />
    </svg>
  );
}

function ContactlessMark() {
  return (
    <svg className={styles.contactless} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M6 8.8a9 9 0 0 1 0 6.4" />
      <path d="M9.5 6.5a13 13 0 0 1 0 11" />
      <path d="M13 4.2a17 17 0 0 1 0 15.6" />
    </svg>
  );
}

interface CardsViewProps {
  cards: CreditCardWithStatements[];
  loadError?: string | null;
}

export function CardsView({ cards, loadError }: CardsViewProps) {
  const [uploadCard, setUploadCard] = useState<CreditCardWithStatements | null>(null);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Credit Cards</h1>
          <p className={styles.subtitle}>
            Upload a monthly statement to reconcile it against your auto-imported transactions.
          </p>
        </div>
      </header>

      {loadError && <div className={styles.errorBanner}>{loadError}</div>}

      {cards.length === 0 && !loadError && (
        <div className={styles.empty}>
          <p>No credit-card accounts yet.</p>
          <p className={styles.emptyHint}>
            Add one from the <Link href="/accounts">Accounts</Link> page and its statements will show up here.
          </p>
        </div>
      )}

      <div className={styles.cardGrid}>
        {cards.map((card) => {
          const utilization =
            card.credit_limit && card.credit_limit > 0
              ? Math.min(100, Math.max(0, (card.outstanding_balance / card.credit_limit) * 100))
              : null;

          return (
            <section key={card.id} className={styles.cardBlock}>
              <div className={styles.cardFaceWrap}>
                <div className={styles.cardFace} style={{ background: cardBackground(getBankColor(card.name, card.color)) }}>
                  <div className={styles.faceRow}>
                    <span className={styles.cardName}>{card.name}</span>
                    <ContactlessMark />
                  </div>

                  <div className={styles.faceChipRow}>
                    <EmvChip />
                  </div>

                  <div className={styles.cardNumber}>
                    <span>••••</span>
                    <span>••••</span>
                    <span>••••</span>
                    <span className={styles.cardNumberLast}>{card.last4 || "••••"}</span>
                  </div>

                  <div className={styles.faceBottom}>
                    <div>
                      <span className={styles.faceLabel}>Outstanding</span>
                      <span className={styles.faceValue}>{formatINR(Math.max(0, card.outstanding_balance))}</span>
                    </div>
                    {card.credit_limit !== null && (
                      <div className={styles.faceStat}>
                        <span className={styles.faceLabel}>Limit</span>
                        <span className={styles.faceValueSm}>{formatINR(card.credit_limit)}</span>
                      </div>
                    )}
                    {card.due_day && (
                      <div className={styles.faceStat}>
                        <span className={styles.faceLabel}>Due</span>
                        <span className={styles.faceValueSm}>{card.due_day}<span className={styles.faceSuffix}>th</span></span>
                      </div>
                    )}
                  </div>

                  {utilization !== null && (
                    <div
                      className={styles.utilTrack}
                      title={`${utilization.toFixed(1)}% of limit used`}
                    >
                      <div
                        className={`${styles.utilFill} ${utilization > 80 ? styles.utilHigh : ""}`}
                        style={{ width: `${Math.max(utilization, 1)}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.statementsBlock}>
                <div className={styles.statementsHeader}>
                  <h3>Statements</h3>
                  <button className={styles.uploadBtn} onClick={() => setUploadCard(card)}>
                    <FileUp size={14} /> Upload
                  </button>
                </div>

                {card.statements.length === 0 ? (
                  <button className={styles.emptyStatements} onClick={() => setUploadCard(card)}>
                    <Plus size={15} />
                    <span>Upload this card&apos;s latest statement to get started</span>
                  </button>
                ) : (
                  <ul className={styles.statementList}>
                    {card.statements.map((s) => {
                      const toReview = s.lineCounts.newLines + s.lineCounts.ambiguous;
                      const reconciled = s.status === "reconciled";
                      return (
                        <li key={s.id}>
                          <Link href={`/cards/${s.id}`} className={styles.statementRow}>
                            <span
                              className={`${styles.statusDot} ${reconciled ? styles.statusDotOk : styles.statusDotReview}`}
                              title={reconciled ? "Reconciled" : "Needs review"}
                            />
                            <div className={styles.statementMain}>
                              <span className={styles.statementDate}>{formatMonth(s.statement_date)}</span>
                              <span className={styles.statementCounts}>
                                {formatDay(s.statement_date)} · {s.lineCounts.matched + s.lineCounts.imported} of{" "}
                                {s.lineCounts.total} reconciled
                                {s.checksum_ok === false && " · totals mismatch"}
                              </span>
                            </div>
                            <div className={styles.statementSide}>
                              {toReview > 0 ? (
                                <span className={styles.reviewBadge}>{toReview} to review</span>
                              ) : (
                                s.total_due !== null && (
                                  <span className={styles.statementDue}>{formatINR(s.total_due)}</span>
                                )
                              )}
                              <ChevronRight size={15} className={styles.rowChevron} />
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {uploadCard && <StatementUploadModal card={uploadCard} onClose={() => setUploadCard(null)} />}
    </div>
  );
}
