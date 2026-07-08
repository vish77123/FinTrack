"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarClock, ChevronRight, FileUp } from "lucide-react";
import type { CardDetailData, CardStatementSummary, CreditCardWithStatements } from "@/lib/data/cards";
import { CardFace } from "./CardFace";
import { StatementUploadModal } from "./StatementUploadModal";
import styles from "./cards.module.css";

function formatINR(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function formatMonth(d: string): string {
  return new Date(d).toLocaleDateString("en-IN", { month: "long" });
}

function formatDay(d: string): string {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function daysUntil(d: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(d).setHours(0, 0, 0, 0) - today.getTime()) / 86_400_000);
}

interface CardDetailViewProps {
  card: CreditCardWithStatements;
  statements: CardStatementSummary[];
  loadError?: string | null;
}

export function CardDetailView({ card, statements, loadError }: CardDetailViewProps) {
  const [uploading, setUploading] = useState(false);

  // Newest-first input → year groups in the same order
  const byYear = useMemo(() => {
    const groups = new Map<number, CardStatementSummary[]>();
    for (const s of statements) {
      const year = new Date(s.statement_date).getFullYear();
      const list = groups.get(year) || [];
      list.push(s);
      groups.set(year, list);
    }
    return [...groups.entries()];
  }, [statements]);

  const latest = card.latestStatement;
  const dueDays = latest?.due_date && latest.total_due !== null ? daysUntil(latest.due_date) : null;
  const showDue = latest && dueDays !== null && dueDays >= -7;

  return (
    <div className={styles.page}>
      <Link href="/cards" className={styles.backLink}>
        <ArrowLeft size={15} /> All cards
      </Link>

      {loadError && <div className={styles.errorBanner}>{loadError}</div>}

      <div className={styles.detailWrap}>
        <div className={styles.cardFaceWrap}>
          <CardFace card={card} />
        </div>

        <div className={styles.statementsBlock}>
          <div className={styles.statementsHeader}>
            <h3>All statements</h3>
            <button className={styles.uploadBtn} onClick={() => setUploading(true)}>
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

          {statements.length === 0 ? (
            <button className={styles.emptyStatements} onClick={() => setUploading(true)}>
              <FileUp size={15} />
              <span>Upload this card&apos;s latest statement to get started</span>
            </button>
          ) : (
            byYear.map(([year, yearStatements]) => (
              <div key={year}>
                <div className={styles.yearHeader}>{year}</div>
                <ul className={styles.statementList}>
                  {yearStatements.map((s) => {
                    const toReview = s.lineCounts.newLines + s.lineCounts.ambiguous;
                    const reconciled = s.status === "reconciled";
                    const awaitingUpload = s.lineCounts.total === 0;
                    return (
                      <li key={s.id}>
                        <Link href={`/cards/${s.id}`} className={styles.statementRow}>
                          <span
                            className={`${styles.statusDot} ${
                              awaitingUpload || !reconciled ? styles.statusDotReview : styles.statusDotOk
                            }`}
                            title={awaitingUpload ? "Awaiting PDF upload" : reconciled ? "Reconciled" : "Needs review"}
                          />
                          <div className={styles.statementMain}>
                            <span className={styles.statementDate}>{formatMonth(s.statement_date)}</span>
                            <span className={styles.statementCounts}>
                              {awaitingUpload
                                ? "From statement email — upload the PDF to reconcile"
                                : `${formatDay(s.statement_date)} · ${s.lineCounts.matched + s.lineCounts.imported} of ${s.lineCounts.total} reconciled${s.checksum_ok === false ? " · totals mismatch" : ""}`}
                            </span>
                          </div>
                          <div className={styles.statementSide}>
                            {awaitingUpload ? (
                              <span className={styles.reviewBadge}>Upload PDF</span>
                            ) : toReview > 0 ? (
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
              </div>
            ))
          )}
        </div>
      </div>

      {uploading && <StatementUploadModal card={card} onClose={() => setUploading(false)} />}
    </div>
  );
}

export type { CardDetailData };
