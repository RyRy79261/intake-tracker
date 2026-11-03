/**
 * The journal printout as a PDF: one dated table to hand a doctor, oldest
 * entry first. Built on the device with jsPDF, like lib/export-service.ts;
 * nothing is sent anywhere to make it.
 */
import { format } from "date-fns";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { placeLabel } from "@intake/core/journal";
import type { JournalEntry } from "@/lib/db";

/** "14:05", "~14:00" for an approximate time, or "-" when only the day is known. */
export function journalTimeText(e: Pick<JournalEntry, "timestamp" | "timePrecision">): string {
  if (e.timePrecision === "day") return "-";
  return `${e.timePrecision === "approx" ? "~" : ""}${format(e.timestamp, "HH:mm")}`;
}

export interface JournalPrintout {
  rows: readonly JournalEntry[];
  fromMs: number;
  toMs: number;
  /** The patient's name for the header; omitted when unknown. */
  name?: string | null | undefined;
  timeZone: string;
  printedAt: number;
}

/** The table body: date (on the first row of each day), time, entry, where, rating. */
export function journalTableBody(rows: readonly JournalEntry[]): string[][] {
  let lastDay = "";
  return rows.map((e) => {
    const day = format(e.timestamp, "d MMM yyyy");
    const showDay = day !== lastDay;
    lastDay = day;
    return [
      showDay ? day : "",
      journalTimeText(e),
      `${e.finding}\n"${e.words}"`,
      e.places.length ? e.places.map(placeLabel).join("; ") : "-",
      e.severity === null ? "-" : String(e.severity),
    ];
  });
}

export function buildJournalPDF(p: JournalPrintout): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const period = `${format(p.fromMs, "d MMM yyyy")} - ${format(p.toMs, "d MMM yyyy")}`;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Symptom and event log", 14, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(period, pageWidth - 14, 18, { align: "right" });
  if (p.name) doc.text(p.name, 14, 25);
  doc.text(`Printed ${format(p.printedAt, "d MMM yyyy")}`, pageWidth - 14, 25, { align: "right" });

  autoTable(doc, {
    startY: 30,
    head: [["Date", "Time", "Entry, in the patient's words", "Where", "0-10"]],
    body: p.rows.length ? journalTableBody(p.rows) : [["", "", "No entries in this period.", "", ""]],
    theme: "grid",
    headStyles: { fillColor: [40, 40, 40], fontSize: 8 },
    styles: { fontSize: 8.5, cellPadding: 1.8, valign: "top" },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 14 },
      3: { cellWidth: 34 },
      4: { cellWidth: 12, halign: "center" },
    },
    margin: { left: 14, right: 14, bottom: 26 },
  });

  const pageCount = doc.getNumberOfPages();
  const footer = [
    "Intensity: 0 = none, 10 = worst imaginable. \"-\" = not rated, no time or no body place. \"~\" = approximate time.",
    `Times are local time (${p.timeZone}). Self-recorded in Intake Tracker; not clinical findings.`,
  ];
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(90);
    doc.text(footer, 14, 282);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, 290, { align: "right" });
  }
  return doc;
}

/** Build and download the printout. */
export function saveJournalPDF(p: JournalPrintout): void {
  const doc = buildJournalPDF(p);
  doc.save(`journal-${format(p.fromMs, "yyyy-MM-dd")}-${format(p.toMs, "yyyy-MM-dd")}.pdf`);
}
