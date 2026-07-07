"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Pencil, RefreshCw, RotateCcw, Trash2, Users } from "lucide-react";
import type { CategoryOption, ContactOption, StatementDetailData, StatementLineDetail } from "@/lib/data/cards";
import { BaseModal } from "@/components/ui/BaseModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CategoryPicker } from "@/components/ui/CategoryPicker";
import { useUIStore } from "@/store/useUIStore";
import ui from "@/components/ui/ui.module.css";
import {
  deleteStatementAction,
  importLinesAction,
  rematchStatementAction,
  resolveLineMatchAction,
  setLineIgnoredAction,
  setLineOwnerAction,
  syncCardBalanceAction,
  updateLineDetailsAction,
} from "@/app/actions/statements";
import styles from "./statementDetail.module.css";

function formatINR(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatINRShort(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

type Filter = "all" | "new" | "ambiguous" | "matched" | "imported" | "ignored";

// Interest, fees, and taxes on a card statement deserve a loud flag — paying
// them is the #1 thing a finance tracker should surface
const FEE_PATTERN =
  /interest|fin(?:ance)?\s?charge|late\s?(?:payment\s?)?fee|over\s?limit|annual\s?fee|membership\s?fee|joining\s?fee|renewal\s?fee|processing\s?fee|\bgst\b|\bigst\b|\bcgst\b|\bsgst\b|service\s?tax/i;

function isFeeLine(line: StatementLineDetail): boolean {
  return line.direction === "debit" && FEE_PATTERN.test(line.merchant);
}

const STATUS_LABEL: Record<string, string> = {
  matched: "Matched",
  new: "New",
  ambiguous: "Ambiguous",
  ignored: "Ignored",
  imported: "Imported",
};

interface StatementDetailViewProps {
  statement: StatementDetailData["statement"];
  lines: StatementLineDetail[];
  candidateTransactions: StatementDetailData["candidateTransactions"];
  contacts: ContactOption[];
  categories: CategoryOption[];
  loadError?: string | null;
}

function getBankColor(name: string, fallback: string | null): string {
  const n = name.toLowerCase();
  if (n.includes("amex") || n.includes("american express")) return "#0047AB";
  if (n.includes("icici")) return "#800000";
  if (n.includes("hdfc")) return "#002366";
  if (n.includes("axis")) return "#8B0045";
  if (n.includes("sbi")) return "#007BA7";
  if (n.includes("kotak")) return "#E3000F";
  return fallback || "#1A1A2E";
}

export function StatementDetailView({ statement, lines, candidateTransactions, contacts, categories, loadError }: StatementDetailViewProps) {
  const router = useRouter();
  const setEditingTransaction = useUIStore((s) => s.setEditingTransaction);
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<Filter>("all");
  const [applyBalance, setApplyBalance] = useState(statement.isLatest);
  const [expandedLine, setExpandedLine] = useState<string | null>(null);
  const [editingLine, setEditingLine] = useState<StatementLineDetail | null>(null);
  const [confirming, setConfirming] = useState<"sync" | "delete" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: lines.length, new: 0, ambiguous: 0, matched: 0, imported: 0, ignored: 0 };
    for (const line of lines) c[line.match_status as Exclude<Filter, "all">]++;
    return c;
  }, [lines]);

  const visible = filter === "all" ? lines : lines.filter((l) => l.match_status === filter);
  const newLineIds = lines.filter((l) => l.match_status === "new").map((l) => l.id);
  const reconciledCount = counts.matched + counts.imported;
  const progress = counts.all > 0 ? (reconciledCount / counts.all) * 100 : 0;
  const feeTotal = lines.filter(isFeeLine).reduce((sum, l) => sum + l.amount, 0);
  const canRematch = lines.some(
    (l) => l.matched_pending || l.match_status === "new" || l.match_status === "ambiguous"
  );
  const isEmailShell = lines.length === 0 && !loadError;
  const cardColor = getBankColor(statement.accountName, statement.accountColor);

  function act(fn: () => Promise<{ error?: string } | { success?: boolean; error?: string }>) {
    setError("");
    startTransition(async () => {
      const result = await fn();
      if (result && "error" in result && result.error) setError(result.error);
      router.refresh();
    });
  }

  function openEditor(line: StatementLineDetail) {
    const txn = line.matchedTransaction;
    if (txn) {
      setEditingTransaction({
        id: txn.id,
        type: txn.type as "income" | "expense" | "transfer",
        amount: Number(txn.amount),
        account_id: txn.account_id || "",
        category_id: txn.category_id || null,
        transfer_to_account_id: txn.transfer_to_account_id || null,
        date: txn.date || new Date().toISOString(),
        note: txn.note || line.merchant || "",
        source: "transaction",
        original_synced_name: txn.original_synced_name || undefined,
        isSplitChild: !!txn.split_group_id,
      });
    } else {
      setEditingLine(line);
    }
  }

  return (
    <div className={styles.page}>
      <Link href="/cards" className={styles.backLink}>
        <ArrowLeft size={15} /> All cards
      </Link>

      <header className={styles.header}>
        <div className={styles.titleWrap}>
          <div
            className={styles.cardGlyph}
            style={{ background: `linear-gradient(135deg, color-mix(in oklab, ${cardColor} 85%, #fff), ${cardColor} 45%, color-mix(in oklab, ${cardColor} 55%, #050510))` }}
            aria-hidden="true"
          />
          <div>
            <h1>{statement.accountName}</h1>
            <p className={styles.subtitle}>
              {formatDate(statement.statement_date)}
              {statement.period_start && statement.period_end &&
                ` · ${formatDate(statement.period_start)} – ${formatDate(statement.period_end)}`}
            </p>
          </div>
        </div>
        <div className={styles.headerSide}>
          {canRematch && (
            <button
              className={styles.syncBtn}
              disabled={isPending}
              title="Re-run matching for unresolved lines — picks up transactions approved (or discarded) since the upload"
              onClick={() => {
                setNotice("");
                act(async () => {
                  const result = await rematchStatementAction(statement.id);
                  if ("rematched" in result && result.rematched !== undefined) {
                    setNotice(
                      result.rematched > 0
                        ? `Re-matched ${result.rematched} line${result.rematched === 1 ? "" : "s"}.`
                        : "Nothing new to match — all unresolved lines stay as they were."
                    );
                  }
                  return result;
                });
              }}
            >
              <RotateCcw size={14} /> Re-match
            </button>
          )}
          {statement.isLatest && statement.total_due !== null && (
            <button
              className={styles.syncBtn}
              disabled={isPending}
              onClick={() => setConfirming("sync")}
              title="Set the card's outstanding balance from this statement"
            >
              <RefreshCw size={14} /> Sync balance
            </button>
          )}
          <button
            className={styles.deleteBtn}
            disabled={isPending}
            onClick={() => setConfirming("delete")}
            aria-label="Delete statement"
            title="Delete statement"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>

      <div className={styles.hero}>
        <div className={`${styles.heroStat} ${styles.heroMain}`}>
          <span className={styles.heroLabel}>Total due</span>
          <span className={styles.heroValueBig}>
            {statement.total_due !== null ? formatINR(statement.total_due) : "—"}
          </span>
        </div>
        <div className={styles.heroStat}>
          <span className={styles.heroLabel}>Minimum due</span>
          <span className={styles.heroValue}>
            {statement.min_due !== null ? formatINR(statement.min_due) : "—"}
          </span>
        </div>
        <div className={styles.heroStat}>
          <span className={styles.heroLabel}>Due date</span>
          <span className={styles.heroValue}>
            {statement.due_date ? formatDate(statement.due_date) : "—"}
          </span>
        </div>
        <div className={styles.heroStat}>
          <span className={styles.heroLabel}>Reconciled</span>
          <span className={styles.heroValue}>
            {reconciledCount}<span className={styles.heroValueMuted}> / {counts.all}</span>
          </span>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {statement.checksum_ok === false && (
        <div className={styles.bannerWarn}>
          The parsed lines don&apos;t add up to the statement&apos;s printed purchase total — some rows may be
          missing or misread. Double-check before importing.
        </div>
      )}
      {feeTotal > 0 && (
        <div className={styles.bannerWarn}>
          <AlertTriangle size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          This statement includes <strong>{formatINR(feeTotal)}</strong> in interest, fees, or taxes — the flagged
          rows below. Paying interest on a credit card is worth avoiding.
        </div>
      )}
      {isEmailShell && (
        <div className={styles.bannerWarn}>
          This entry was created from your bank&apos;s statement email — the dues and date above are real, but the
          transactions aren&apos;t here yet. Upload the statement PDF from the Cards page to reconcile them.
        </div>
      )}
      {loadError && <div className={styles.bannerWarn}>{loadError}</div>}
      {error && <div className={styles.bannerError}>{error}</div>}
      {notice && <div className={styles.bannerOk}>{notice}</div>}

      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          {(["all", "new", "ambiguous", "matched", "imported", "ignored"] as Filter[]).map((f) =>
            f !== "all" && counts[f] === 0 ? null : (
              <button key={f} className={filter === f ? styles.tabActive : styles.tab} onClick={() => setFilter(f)}>
                {f === "all" ? "All" : STATUS_LABEL[f]}
                <span className={styles.tabCount}>{counts[f]}</span>
              </button>
            )
          )}
        </div>

        {newLineIds.length > 0 && (
          <div className={styles.importBar}>
            <label
              className={styles.checkboxLabel}
              title="On for the current statement. Turn off when backfilling an old statement whose dues are already settled."
            >
              <input type="checkbox" checked={applyBalance} onChange={(e) => setApplyBalance(e.target.checked)} />
              Adjust card balance
            </label>
            <button
              className={styles.primaryBtn}
              disabled={isPending}
              onClick={() => act(() => importLinesAction({ statementId: statement.id, lineIds: newLineIds, applyBalance }))}
            >
              {isPending ? "Importing…" : `Import ${newLineIds.length} new`}
            </button>
          </div>
        )}
      </div>

      <div className={styles.linesCard}>
        {visible.length === 0 && <div className={styles.emptyLines}>Nothing here.</div>}
        {visible.map((line) => (
          <LineRow
            key={line.id}
            line={line}
            contacts={contacts}
            candidateTransactions={candidateTransactions}
            expanded={expandedLine === line.id}
            onToggleExpand={() => setExpandedLine(expandedLine === line.id ? null : line.id)}
            onEdit={() => openEditor(line)}
            disabled={isPending}
            act={act}
          />
        ))}
      </div>

      <p className={styles.footnote}>
        <Users size={13} /> Assigning an owner other than you records the spend as a transfer from the card to that
        contact — it shows up as money they owe you instead of your own expense.
      </p>

      {editingLine && (
        <EditLineModal
          line={editingLine}
          categories={categories}
          contacts={contacts}
          isPending={isPending}
          onClose={() => setEditingLine(null)}
          onSave={(merchant, categoryId, ownerAccountId) => {
            act(async () => {
              const result = await updateLineDetailsAction({ lineId: editingLine.id, merchant, categoryId });
              if ("error" in result && result.error) return result;
              if (ownerAccountId !== (editingLine.owner_account_id || null)) {
                const ownerResult = await setLineOwnerAction(editingLine.id, ownerAccountId);
                if ("error" in ownerResult && ownerResult.error) return ownerResult;
              }
              setEditingLine(null);
              return result;
            });
          }}
        />
      )}

      <ConfirmDialog
        isOpen={confirming === "sync"}
        variant="warning"
        title="Sync card balance?"
        message={`This sets ${statement.accountName}'s outstanding balance to this statement's total due (${statement.total_due !== null ? formatINR(statement.total_due) : "—"}), adjusted for spends and payments recorded after the statement date. Use it when the card's balance has drifted from reality.`}
        confirmText={isPending ? "Syncing…" : "Sync balance"}
        isPending={isPending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          setNotice("");
          act(async () => {
            const result = await syncCardBalanceAction(statement.id);
            if ("newOutstanding" in result && result.newOutstanding !== undefined) {
              setNotice(`Card balance set to ${formatINR(result.newOutstanding)}.`);
              setConfirming(null);
            }
            return result;
          });
        }}
      />

      <ConfirmDialog
        isOpen={confirming === "delete"}
        variant="danger"
        title="Delete this statement?"
        message="The statement and its parsed lines are removed. Transactions already imported from it will remain."
        confirmText={isPending ? "Deleting…" : "Delete statement"}
        isPending={isPending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          act(async () => {
            const result = await deleteStatementAction(statement.id);
            if (!("error" in result) || !result.error) router.push("/cards");
            return result;
          });
        }}
      />
    </div>
  );
}

// ─── Line row ────────────────────────────────────────────────────────────

interface LineRowProps {
  line: StatementLineDetail;
  contacts: ContactOption[];
  candidateTransactions: StatementDetailData["candidateTransactions"];
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  disabled: boolean;
  act: (fn: () => Promise<{ error?: string } | { success?: boolean; error?: string }>) => void;
}

function LineRow({ line, contacts, candidateTransactions, expanded, onToggleExpand, onEdit, disabled, act }: LineRowProps) {
  const date = new Date(line.date);
  const isCredit = line.direction === "credit";
  const isIgnored = line.match_status === "ignored";

  const statusClass =
    line.match_status === "matched" || line.match_status === "imported"
      ? styles.statusOk
      : line.match_status === "ambiguous"
        ? styles.statusWarn
        : isIgnored
          ? styles.statusMuted
          : styles.statusNew;

  const candidates = (line.match_candidates || [])
    .map((id) => candidateTransactions[id])
    .filter(Boolean);

  const subText = line.matchedTransaction
    ? `↳ ${line.matchedTransaction.note || "Transaction"} · ${formatDate(line.matchedTransaction.date)}`
    : line.matched_pending
      ? "↳ matches a pending import"
      : line.category?.name || null;

  return (
    <>
      <div className={`${styles.lineRow} ${isIgnored ? styles.lineIgnored : ""}`}>
        <div className={styles.dateTile}>
          <span className={styles.dateDay}>{date.getDate()}</span>
          <span className={styles.dateMon}>{date.toLocaleDateString("en-IN", { month: "short" })}</span>
        </div>

        <div className={styles.mainCol}>
          <span className={styles.merchantName} title={line.merchant}>
            {line.merchant}
            {isFeeLine(line) && <span className={styles.feeBadge}>Fee</span>}
          </span>
          {subText && <span className={styles.lineSub} title={subText}>{subText}</span>}
        </div>

        {line.direction === "debit" && !isIgnored && (
          <div className={styles.ownerCol}>
            <select
              className={styles.ownerSelectMinimal}
              value={line.owner_account_id || ""}
              disabled={disabled}
              onChange={(e) => act(() => setLineOwnerAction(line.id, e.target.value || null))}
            >
              <option value="">👤 Me</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>👤 {c.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className={styles.amountCol}>
          <span className={`${styles.lineAmount} ${isCredit ? styles.amountCredit : ""}`}>
            {isCredit ? "− " : ""}
            {formatINR(line.amount)}
          </span>
          <span className={`${styles.statusText} ${statusClass}`}>
            <span className={styles.statusDot} />
            {STATUS_LABEL[line.match_status] || line.match_status}
            {line.matched_pending ? " (Pending)" : ""}
          </span>
        </div>

        <div className={styles.actionCol}>
          {!isIgnored && (
            <button className={styles.actionIconBtn} disabled={disabled} onClick={onEdit} aria-label="Edit" title="Edit">
              <Pencil size={12} />
            </button>
          )}
          {line.match_status === "new" && (
            <button className={styles.actionTextBtn} disabled={disabled} onClick={() => act(() => setLineIgnoredAction(line.id, true))}>
              Ignore
            </button>
          )}
          {isIgnored && (
            <button className={styles.actionTextBtn} disabled={disabled} onClick={() => act(() => setLineIgnoredAction(line.id, false))}>
              Restore
            </button>
          )}
          {line.match_status === "matched" && !line.matched_pending && (
            <button className={styles.actionTextBtn} disabled={disabled} onClick={() => act(() => resolveLineMatchAction(line.id, null))}>
              Unlink
            </button>
          )}
          {line.match_status === "ambiguous" && (
            <button className={styles.resolveBtn} onClick={onToggleExpand}>
              {expanded ? "Close" : "Resolve"}
            </button>
          )}
        </div>
      </div>

      {expanded && line.match_status === "ambiguous" && (
        <div className={styles.resolvePanel}>
          <p className={styles.resolveHint}>Several existing transactions could be this line — pick the right one:</p>
          <ul className={styles.candidateList}>
            {candidates.map((c) => (
              <li key={c.id}>
                <span>
                  {c.note || "Transaction"} · {formatDate(c.date)} · {formatINRShort(c.amount)}
                </span>
                <button className={styles.secondaryBtn} disabled={disabled} onClick={() => act(() => resolveLineMatchAction(line.id, c.id))}>
                  Link
                </button>
              </li>
            ))}
            <li>
              <span>None of these — it&apos;s a new transaction</span>
              <button className={styles.secondaryBtn} disabled={disabled} onClick={() => act(() => resolveLineMatchAction(line.id, null))}>
                Mark as new
              </button>
            </li>
          </ul>
        </div>
      )}
    </>
  );
}

// ─── Quick edit for lines that have no transaction yet ───────────────────

interface EditLineModalProps {
  line: StatementLineDetail;
  categories: CategoryOption[];
  contacts: ContactOption[];
  isPending: boolean;
  onClose: () => void;
  onSave: (merchant: string, categoryId: string | null, ownerAccountId: string | null) => void;
}

/** Styled to match the app's Add/Edit Transaction modal. */
function EditLineModal({ line, categories, contacts, isPending, onClose, onSave }: EditLineModalProps) {
  const [merchant, setMerchant] = useState(line.merchant);
  const [categoryId, setCategoryId] = useState(line.category_id || "");
  const [ownerAccountId, setOwnerAccountId] = useState(line.owner_account_id || "");

  const isDebit = line.direction === "debit";
  const amountStr = line.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const footer = (
    <>
      <button
        className="btn"
        style={{ background: "transparent", color: "var(--text-secondary)", border: "none" }}
        onClick={onClose}
        disabled={isPending}
      >
        Cancel
      </button>
      <button
        className="btn btn-primary"
        onClick={() => onSave(merchant.trim(), categoryId || null, ownerAccountId || null)}
        disabled={isPending || !merchant.trim()}
        style={{ opacity: isPending ? 0.7 : 1 }}
      >
        {isPending ? "Saving..." : "Update Transaction"}
      </button>
    </>
  );

  return (
    <BaseModal isOpen onClose={onClose} title="Edit Transaction" footer={footer}>
      <div className={styles.typeBadgeRow}>
        <span className={isDebit ? styles.typeBadgeExpense : styles.typeBadgeIncome}>
          {isDebit ? "Expense" : "Credit"}
        </span>
        <span className={styles.typeBadgeDate}>{formatDate(line.date)} · from statement</span>
      </div>

      <div className={ui.currencyInputWrapper}>
        <span className={ui.currencySymbol}>₹</span>
        <span className={`${ui.currencyInput} ${styles.amountStatic}`}>{amountStr}</span>
      </div>

      {isDebit && (
        <div className={ui.formGroup}>
          <label className={ui.inputLabel}>Owner</label>
          <select
            className={`${ui.formInput} ${ui.formSelect}`}
            value={ownerAccountId}
            onChange={(e) => setOwnerAccountId(e.target.value)}
          >
            <option value="">Me</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>👤 {c.name}</option>
            ))}
          </select>
          {ownerAccountId && (
            <div className={styles.ownerHint}>
              Recorded as a transfer from the card — shows up as money this contact owes you.
            </div>
          )}
        </div>
      )}

      <div className={ui.formGroup}>
        <label className={ui.inputLabel}>Name</label>
        <input
          type="text"
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          className={ui.formInput}
          autoFocus
        />
      </div>

      <CategoryPicker
        categories={categories}
        value={categoryId}
        onChange={setCategoryId}
        label="Category (Optional)"
        transactionType={isDebit ? "expense" : "income"}
        allowCreate={false}
      />
    </BaseModal>
  );
}
