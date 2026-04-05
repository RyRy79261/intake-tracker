/**
 * Export service for health data.
 * Provides PDF report generation and CSV export, both fully client-side.
 */

import { format } from "date-fns";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  fluidBalance,
  adherenceRate,
  bpTrend,
  weightTrend,
  getRecordsByDomain,
} from "./analytics-service";
import type { TimeRange, Domain, AnalyticsResult, DataPoint } from "./analytics-types";

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

/** Escape a CSV field: wrap in quotes if it contains comma, quote, or newline */
function escapeCSVField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function dataPointsToCSVRows(points: DataPoint[]): string[][] {
  return points.map((p) => [
    new Date(p.timestamp).toISOString(),
    String(p.value),
    ...(p.label ? [p.label] : []),
  ]);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// CSV exports
// ---------------------------------------------------------------------------

/**
 * Export an AnalyticsResult's dataPoints as CSV and trigger download.
 * Returns early (no download) if there are no data points.
 */
export function exportToCSV(
  data: AnalyticsResult<unknown>,
  filename: string,
): void {
  if (!data.dataPoints || data.dataPoints.length === 0) {
    return;
  }

  // Build headers from first data point keys
  const sample = data.dataPoints[0]!;
  const headers = Object.keys(sample);
  const rows = data.dataPoints.map((p) =>
    headers.map((h) => escapeCSVField(String((p as unknown as Record<string, unknown>)[h] ?? ""))),
  );

  const csvContent = [
    headers.map(escapeCSVField).join(","),
    ...rows.map((r) => r.join(",")),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename);
}

/**
 * Export all domain records within a time range as a single CSV.
 */
export async function exportAllRecordsCSV(range: TimeRange): Promise<void> {
  const domains: Domain[] = [
    "water",
    "salt",
    "weight",
    "bp",
    "eating",
    "urination",
    "defecation",
    "caffeine",
    "alcohol",
  ];

  const allRows: string[][] = [];

  for (const domain of domains) {
    const points = await getRecordsByDomain(domain, range);
    for (const p of points) {
      allRows.push([
        new Date(p.timestamp).toISOString(),
        domain,
        String(p.value),
        domainUnit(domain),
        p.label ?? "",
      ]);
    }
  }

  if (allRows.length === 0) return;

  // Sort by timestamp
  allRows.sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""));

  const headers = ["timestamp", "domain", "value", "unit", "note"];
  const csvContent = [
    headers.join(","),
    ...allRows.map((r) => r.map(escapeCSVField).join(",")),
  ].join("\n");

  const startDate = format(new Date(range.start), "yyyy-MM-dd");
  const endDate = format(new Date(range.end), "yyyy-MM-dd");
  const filename = `health-data-${startDate}-${endDate}.csv`;

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename);
}

function domainUnit(domain: Domain): string {
  switch (domain) {
    case "water":
      return "ml";
    case "salt":
      return "mg";
    case "weight":
      return "kg";
    case "bp":
      return "mmHg";
    case "urination":
      return "ml";
    case "eating":
      return "event";
    case "defecation":
      return "event";
    case "caffeine":
      return "mg";
    case "alcohol":
      return "std_drinks";
    case "medication":
      return "dose";
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// PDF report
// ---------------------------------------------------------------------------

/**
 * Generate and download a structured PDF health report for the given range.
 * All computation is client-side -- works offline.
 */
export async function exportToPDF(range: TimeRange): Promise<void> {
  const [fluid, adherence, bp, weight] = await Promise.all([
    fluidBalance(range),
    adherenceRate(range),
    bpTrend(range),
    weightTrend(range),
  ]);

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const startDate = format(new Date(range.start), "MMM d, yyyy");
  const endDate = format(new Date(range.end), "MMM d, yyyy");
  let y = 20;

  // Title
  doc.setFontSize(20);
  doc.text("Health Report", pageWidth / 2, y, { align: "center" });
  y += 8;
  doc.setFontSize(11);
  doc.text(`${startDate} - ${endDate}`, pageWidth / 2, y, { align: "center" });
  y += 12;

  // Section helper
  const addSection = (title: string) => {
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(title, 14, y);
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
  };

  const addLine = (text: string) => {
    if (y > 275) {
      doc.addPage();
      y = 20;
    }
    doc.text(text, 18, y);
    y += 6;
  };

  // Section 1: Summary
  addSection("Summary");
  const totalRecords =
    fluid.dataPoints.length +
    bp.dataPoints.length +
    weight.dataPoints.length +
    adherence.dataPoints.length;
  addLine(`Period: ${startDate} to ${endDate}`);
  addLine(`Total data points: ${totalRecords}`);
  y += 4;

  // Section 2: Blood Pressure
  addSection("Blood Pressure");
  if (bp.value.readings.length > 0) {
    addLine(`Average: ${bp.value.avg.systolic.toFixed(0)}/${bp.value.avg.diastolic.toFixed(0)} mmHg`);
    addLine(`Systolic trend: ${bp.value.trend.systolic.direction} (slope: ${bp.value.trend.systolic.slope.toFixed(3)})`);
    addLine(`Diastolic trend: ${bp.value.trend.diastolic.direction} (slope: ${bp.value.trend.diastolic.slope.toFixed(3)})`);
    addLine(`Readings: ${bp.value.readings.length}`);
  } else {
    addLine("No blood pressure readings in this period.");
  }
  y += 4;

  // Section 3: Weight
  addSection("Weight");
  if (weight.value.readings.length > 0) {
    addLine(`Average: ${weight.value.avg.toFixed(1)} kg`);
    addLine(`Range: ${weight.value.min.toFixed(1)} - ${weight.value.max.toFixed(1)} kg`);
    addLine(`Trend: ${weight.value.trend.direction} (slope: ${weight.value.trend.slope.toFixed(3)})`);
  } else {
    addLine("No weight readings in this period.");
  }
  y += 4;

  // Section 4: Fluid Balance
  addSection("Fluid Balance");
  if (fluid.value.daily.length > 0) {
    addLine(`Average daily balance: ${fluid.value.avgBalance.toFixed(0)} ml`);
    addLine(`Days above target: ${fluid.value.daysAboveTarget} / ${fluid.value.daysTotal}`);
  } else {
    addLine("No fluid data in this period.");
  }
  y += 4;

  // Section 5: Medication Adherence
  addSection("Medication Adherence");
  if (adherence.value.total > 0) {
    addLine(`Overall rate: ${(adherence.value.rate * 100).toFixed(1)}%`);
    addLine(`Taken: ${adherence.value.taken} / ${adherence.value.total} doses`);
  } else {
    addLine("No medication schedule data in this period.");
  }
  y += 4;

  // Section 6: Recent Records table
  addSection("Recent Records");

  // Gather recent records from all domains for the table
  const tableData: string[][] = [];
  const domains: Domain[] = ["water", "salt", "weight", "bp", "caffeine", "alcohol"];

  for (const domain of domains) {
    const points = await getRecordsByDomain(domain, range);
    // Take last 10 per domain
    const recent = points.slice(-10);
    for (const p of recent) {
      tableData.push([
        format(new Date(p.timestamp), "MMM d, HH:mm"),
        domain,
        `${p.value} ${domainUnit(domain)}`,
      ]);
    }
  }

  // Sort by date desc, limit to 50
  tableData.sort((a, b) => (b[0] ?? "").localeCompare(a[0] ?? ""));
  const limitedData = tableData.slice(0, 50);

  if (limitedData.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Date", "Domain", "Value"]],
      body: limitedData,
      theme: "grid",
      headStyles: { fillColor: [66, 66, 66] },
      styles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
  }

  // Page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, 290, { align: "center" });
  }

  const filename = `health-report-${format(new Date(range.start), "yyyy-MM-dd")}-${format(new Date(range.end), "yyyy-MM-dd")}.pdf`;
  doc.save(filename);
}

// Re-export for testing
export { escapeCSVField as _escapeCSVField };
