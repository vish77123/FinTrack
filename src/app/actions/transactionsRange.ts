"use server";

import { z } from "zod";
import { getTransactionsRange } from "@/lib/data/dashboard";

const rangeSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime().nullable().optional(),
});

/**
 * Fetches day-grouped transactions for an arbitrary date range.
 * Called from TransactionsView when the user widens the date filter beyond
 * the default fetch window (last two months) — e.g. "All Time" or a custom
 * range reaching further back.
 */
export async function fetchTransactionsRangeAction(start: string, end?: string | null) {
  const validated = rangeSchema.safeParse({ start, end });
  if (!validated.success) {
    return { error: "Invalid date range.", transactions: [] };
  }

  try {
    const transactions = await getTransactionsRange(
      validated.data.start,
      validated.data.end ?? undefined
    );
    return { transactions };
  } catch (err) {
    console.error("fetchTransactionsRangeAction failed:", err);
    return { error: "Failed to load transactions for that range.", transactions: [] };
  }
}
