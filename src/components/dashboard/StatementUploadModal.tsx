"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FileText, Lock, UploadCloud } from "lucide-react";
import type { CreditCardWithStatements } from "@/lib/data/cards";
import { extractPdfText } from "@/lib/statements/pdfText";
import { processStatementAction, saveCardPasswordAction } from "@/app/actions/statements";
import { BaseModal } from "@/components/ui/BaseModal";
import styles from "./cards.module.css";

type Phase = "pick" | "password" | "working" | "confirm-card" | "error";

interface StatementUploadModalProps {
  card: CreditCardWithStatements;
  onClose: () => void;
}

export function StatementUploadModal({ card, onClose }: StatementUploadModalProps) {
  const router = useRouter();
  const fileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const extractedTextRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<Phase>("pick");
  const [dragOver, setDragOver] = useState(false);
  const [password, setPassword] = useState("");
  const [savePassword, setSavePassword] = useState(true);
  const [message, setMessage] = useState("");
  const [workingMsg, setWorkingMsg] = useState("");
  const [mismatch, setMismatch] = useState<{ parsed: string; expected: string } | null>(null);

  async function submitText(text: string, force: boolean) {
    setPhase("working");
    setWorkingMsg("Parsing statement… this can take up to a minute.");
    const result = await processStatementAction({ accountId: card.id, text, force });

    if (result && "needsConfirmation" in result && result.needsConfirmation) {
      setMismatch({ parsed: result.parsedLast4 ?? "????", expected: result.expectedLast4 ?? "????" });
      setPhase("confirm-card");
      return;
    }
    if (!result || ("error" in result && result.error)) {
      setMessage(("error" in result && result.error) || "Something went wrong.");
      setPhase("error");
      return;
    }
    if ("statementId" in result && result.statementId) {
      router.push(`/cards/${result.statementId}`);
      onClose();
    }
  }

  async function run(pass?: string) {
    const file = fileRef.current;
    if (!file) return;

    setPhase("working");
    setWorkingMsg("Reading PDF in your browser…");
    const buffer = await file.arrayBuffer();
    const extracted = await extractPdfText(buffer, pass);

    if (extracted.error === "password" || extracted.error === "invalid-password") {
      setMessage(
        extracted.error === "invalid-password"
          ? pass && pass === card.statement_password
            ? "The saved password didn't work — enter the current one."
            : "Wrong password — try again."
          : ""
      );
      setPhase("password");
      return;
    }
    if (extracted.error || !extracted.text) {
      setMessage("Could not read this PDF. Make sure it's a text-based statement (not a scan).");
      setPhase("error");
      return;
    }

    // Password worked — remember it for next month if the user opted in
    if (pass && savePassword && pass !== card.statement_password) {
      await saveCardPasswordAction(card.id, pass);
    }

    extractedTextRef.current = extracted.text;
    await submitText(extracted.text, false);
  }

  function acceptFile(file: File | undefined | null) {
    if (!file) return;
    if (file.type && file.type !== "application/pdf") {
      setMessage("That doesn't look like a PDF — pick the statement PDF from your bank.");
      setPhase("error");
      return;
    }
    fileRef.current = file;
    setMessage("");
    run(card.statement_password ?? undefined);
  }

  return (
    <BaseModal isOpen onClose={onClose} title={`Upload statement · ${card.name}`} maxWidth="460px">
      {phase === "pick" && (
        <div className={styles.uploadBody}>
          <div
            className={`${styles.dropzone} ${dragOver ? styles.dropzoneActive : ""}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              acceptFile(e.dataTransfer.files?.[0]);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          >
            <UploadCloud size={30} className={styles.dropzoneIcon} />
            <p className={styles.dropzoneTitle}>Drop the statement PDF here</p>
            <p className={styles.dropzoneHint}>or click to browse</p>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              hidden
              onChange={(e) => acceptFile(e.target.files?.[0])}
            />
          </div>
          <p className={styles.privacyNote}>
            <Lock size={13} /> The PDF is decrypted and read in your browser — the file and its password never
            leave your device. Only the extracted text is parsed.
          </p>
        </div>
      )}

      {phase === "password" && (
        <form
          className={styles.uploadBody}
          onSubmit={(e) => {
            e.preventDefault();
            if (password) run(password);
          }}
        >
          <div className={styles.passwordHeader}>
            <span className={styles.passwordIcon}><Lock size={18} /></span>
            <div>
              <p className={styles.passwordTitle}>This statement is password-protected</p>
              {message && <p className={styles.modalWarn}>{message}</p>}
            </div>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="PDF password"
            autoFocus
            className={styles.textInput}
          />
          <label className={styles.checkboxLabel}>
            <input type="checkbox" checked={savePassword} onChange={(e) => setSavePassword(e.target.checked)} />
            Remember for this card
          </label>
          <button type="submit" className={styles.primaryBtn} disabled={!password}>
            Unlock &amp; parse
          </button>
        </form>
      )}

      {phase === "working" && (
        <div className={styles.uploadBody}>
          <div className={styles.workingWrap}>
            <span className={styles.spinner} aria-hidden="true" />
            <p className={styles.working}>{workingMsg}</p>
          </div>
        </div>
      )}

      {phase === "confirm-card" && mismatch && (
        <div className={styles.uploadBody}>
          <div className={styles.mismatchWrap}>
            <AlertTriangle size={22} className={styles.mismatchIcon} />
            <p className={styles.modalWarn}>
              This statement is for a card ending <strong>{mismatch.parsed}</strong>, but {card.name} is linked
              to <strong>{mismatch.expected}</strong>. Upload it to {card.name} anyway?
            </p>
          </div>
          <div className={styles.modalActions}>
            <button className={styles.secondaryBtn} onClick={onClose}>Cancel</button>
            <button
              className={styles.primaryBtn}
              onClick={() => extractedTextRef.current && submitText(extractedTextRef.current, true)}
            >
              Upload anyway
            </button>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className={styles.uploadBody}>
          <div className={styles.mismatchWrap}>
            <FileText size={22} className={styles.mismatchIcon} />
            <p className={styles.modalError}>{message}</p>
          </div>
          <button className={styles.secondaryBtn} onClick={() => { setPhase("pick"); setMessage(""); }}>
            Try again
          </button>
        </div>
      )}
    </BaseModal>
  );
}
