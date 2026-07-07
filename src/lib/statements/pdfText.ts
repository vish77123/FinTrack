/**
 * CLIENT-SIDE ONLY — browser PDF text extraction via pdf.js.
 *
 * Statements are decrypted and text-extracted in the browser so the PDF (and
 * its password) never leave the user's machine; only the extracted text is
 * sent to the server for parsing. Must be imported from a "use client"
 * component only (pdfjs-dist is dynamically imported to keep it out of any
 * server bundle).
 */

export type PdfExtractError = "password" | "invalid-password" | "failed";

export interface PdfExtractResult {
  text?: string;
  error?: PdfExtractError;
}

export async function extractPdfText(data: ArrayBuffer, password?: string): Promise<PdfExtractResult> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const loadingTask = pdfjs.getDocument({ data, password });
  try {
    const doc = await loadingTask.promise;
    let out = "";

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();

      // Rebuild table rows: bucket text items by y coordinate (±2px), then
      // sort rows top-to-bottom and items left-to-right. Raw item order in
      // statement PDFs does not follow the visual table layout.
      const rows = new Map<number, { x: number; str: string }[]>();
      for (const item of content.items) {
        const textItem = item as { str?: string; transform?: number[] };
        if (!textItem.str || !textItem.str.trim() || !textItem.transform) continue;
        const y = Math.round(textItem.transform[5]);
        let key = y;
        for (const existing of rows.keys()) {
          if (Math.abs(existing - y) <= 2) {
            key = existing;
            break;
          }
        }
        const row = rows.get(key) || [];
        row.push({ x: textItem.transform[4], str: textItem.str.trim() });
        rows.set(key, row);
      }

      const sortedRows = [...rows.entries()].sort((a, b) => b[0] - a[0]);
      for (const [, items] of sortedRows) {
        out += items.sort((a, b) => a.x - b.x).map((i) => i.str).join("  ") + "\n";
      }
      out += "\n";
    }

    await loadingTask.destroy();
    return { text: out };
  } catch (err: unknown) {
    const e = err as { name?: string; code?: number };
    if (e?.name === "PasswordException") {
      // pdf.js PasswordResponses: 1 = NEED_PASSWORD, 2 = INCORRECT_PASSWORD
      return { error: e.code === 2 ? "invalid-password" : "password" };
    }
    console.error("[STMT] PDF extraction failed:", err);
    return { error: "failed" };
  }
}
