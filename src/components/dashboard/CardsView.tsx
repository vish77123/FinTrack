"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, ChevronRight, FileUp, History, Plus } from "lucide-react";
import type { CreditCardWithStatements } from "@/lib/data/cards";
import { CardFace } from "./CardFace";
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

/** Days from today until the given date (negative = past). */
function daysUntil(d: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(d).setHours(0, 0, 0, 0) - today.getTime()) / 86_400_000);
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
          const latest = card.latestStatement;
          const dueDays = latest?.due_date && latest.total_due !== null ? daysUntil(latest.due_date) : null;
          const showDue = latest && dueDays !== null && dueDays >= -7;
          const awaitingUpload = latest !== null && latest.lineCounts.total === 0;
          const toReview = latest ? latest.lineCounts.newLines + latest.lineCounts.ambiguous : 0;

          return (
            <section key={card.id} className={styles.cardBlock}>
              <div className={styles.cardFaceWrap}>
                <Link href={`/cards/card/${card.id}`} aria-label={`${card.name} statements`}>
                  <CardFace card={card} />
                </Link>
              </div>

              <div className={styles.statementsBlock}>
                <div className={styles.statementsHeader}>
                  <h3>Latest statement</h3>
                  <button className={styles.uploadBtn} onClick={() => setUploadCard(card)}>
                    <FileUp size={14} /> Upload
                  </button>
                </div>

                {showDue && latest && (
                  <div
                    className={`${styles.dueBanner} ${
                      dueDays! < 0 ? styles.dueOverdue : dueDays! <= 5 ? styles.dueSoon : ""
                    }`}
                  >
                    <CalendarClock size={14} />
                    {dueDays! < 0
                      ? `${formatINR(latest.total_due!)} was due ${formatDay(latest.due_date!)}`
                      : dueDays === 0
                        ? `${formatINR(latest.total_due!)} due today`
                        : `${formatINR(latest.total_due!)} due in ${dueDays} day${dueDays === 1 ? "" : "s"} · ${formatDay(latest.due_date!)}`}
                  </div>
                )}

                {!latest ? (
                  <button className={styles.emptyStatements} onClick={() => setUploadCard(card)}>
                    <Plus size={15} />
                    <span>Upload this card&apos;s latest statement to get started</span>
                  </button>
                ) : (
                  <>
                    <Link href={`/cards/${latest.id}`} className={styles.statementRow}>
                      <span
                        className={`${styles.statusDot} ${
                          awaitingUpload || latest.status !== "reconciled" ? styles.statusDotReview : styles.statusDotOk
                        }`}
                        title={awaitingUpload ? "Awaiting PDF upload" : latest.status === "reconciled" ? "Reconciled" : "Needs review"}
                      />
                      <div className={styles.statementMain}>
                        <span className={styles.statementDate}>{formatMonth(latest.statement_date)}</span>
                        <span className={styles.statementCounts}>
                          {awaitingUpload
                            ? "From statement email — upload the PDF to reconcile"
                            : `${formatDay(latest.statement_date)} · ${latest.lineCounts.matched + latest.lineCounts.imported} of ${latest.lineCounts.total} reconciled${latest.checksum_ok === false ? " · totals mismatch" : ""}`}
                        </span>
                      </div>
                      <div className={styles.statementSide}>
                        {awaitingUpload ? (
                          <span className={styles.reviewBadge}>Upload PDF</span>
                        ) : toReview > 0 ? (
                          <span className={styles.reviewBadge}>{toReview} to review</span>
                        ) : (
                          latest.total_due !== null && (
                            <span className={styles.statementDue}>{formatINR(latest.total_due)}</span>
                          )
                        )}
                        <ChevronRight size={15} className={styles.rowChevron} />
                      </div>
                    </Link>

                    {card.statementCount > 1 && (
                      <Link href={`/cards/card/${card.id}`} className={styles.viewAllLink}>
                        <History size={13} /> View all {card.statementCount} statements
                      </Link>
                    )}
                  </>
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
