"use client";

/**
 * The credit-card "plastic" — shared by the cards hub and the per-card page.
 * Visual code moved verbatim from CardsView.
 */

import type { CreditCardWithStatements } from "@/lib/data/cards";
import styles from "./cards.module.css";

function formatINR(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
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

export function getBankColor(name: string, fallback: string | null): string {
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

interface CardFaceProps {
  card: CreditCardWithStatements;
}

export function CardFace({ card }: CardFaceProps) {
  const utilization =
    card.credit_limit && card.credit_limit > 0
      ? Math.min(100, Math.max(0, (card.outstanding_balance / card.credit_limit) * 100))
      : null;

  return (
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
        <div className={styles.utilTrack} title={`${utilization.toFixed(1)}% of limit used`}>
          <div
            className={`${styles.utilFill} ${utilization > 80 ? styles.utilHigh : ""}`}
            style={{ width: `${Math.max(utilization, 1)}%` }}
          />
        </div>
      )}
    </div>
  );
}
