/**
 * Export service for health data.
 * Provides PDF report generation and CSV export, both fully client-side.
 */

import { format, startOfDay } from "date-fns";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  fluidBalance,
  adherenceRate,
  bpTrend,
  weightTrend,
} from "@/lib/analytics-service";
import { db } from "@/lib/db";
import type {
  IntakeRecord,
  WeightRecord,
  BloodPressureRecord,
  EatingRecord,
  UrinationRecord,
  DefecationRecord,
  SubstanceRecord,
  DoseLog,
} from "@/lib/db";
import { getRecordsByDateRange as getIntakeRecordsByDateRange } from "@/lib/intake-service";
import {
  getWeightRecordsByDateRange,
  getBloodPressureRecordsByDateRange,
} from "@/lib/health-service";
import { getEatingRecordsByDateRange } from "@/lib/eating-service";
import { getUrinationRecordsByDateRange } from "@/lib/urination-service";
import { getDefecationRecordsByDateRange } from "@/lib/defecation-service";
import { getSubstanceRecordsByDateRange } from "@/lib/substance-service";
import { isLive } from "@intake/core/lifecycle";
import { logicalDayKey } from "@intake/core/logical-day";
import { getDeviceTimezone } from "@/lib/timezone";
import { useSettingsStore } from "@/stores/settings-store";
import type { TimeRange, AnalyticsResult } from "@intake/types/analytics";
import { URINATION_ESTIMATE_ML } from "@intake/types/analytics";

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
// Record loading and the 'All' range
// ---------------------------------------------------------------------------

interface ExportRecords {
  intake: IntakeRecord[];
  weight: WeightRecord[];
  bp: BloodPressureRecord[];
  eating: EatingRecord[];
  urination: UrinationRecord[];
  defecation: DefecationRecord[];
  substances: SubstanceRecord[];
}

async function loadRecords(range: TimeRange): Promise<ExportRecords> {
  const { start, end } = range;
  const [intake, weight, bp, eating, urination, defecation, substances] = await Promise.all([
    getIntakeRecordsByDateRange(start, end),
    getWeightRecordsByDateRange(start, end),
    getBloodPressureRecordsByDateRange(start, end),
    getEatingRecordsByDateRange(start, end),
    getUrinationRecordsByDateRange(start, end),
    getDefecationRecordsByDateRange(start, end),
    getSubstanceRecordsByDateRange(start, end),
  ]);
  return { intake, weight, bp, eating, urination, defecation, substances };
}

/**
 * The last day ("YYYY-MM-DD") a range covers. Ranges end at the close of a
 * logical day, which is dayStartHour the next calendar morning, so formatting
 * `range.end` directly would name tomorrow.
 */
function lastDayKey(range: TimeRange): string {
  return logicalDayKey(range.end, useSettingsStore.getState().dayStartHour, getDeviceTimezone());
}

/** `lastDayKey` as a local-midnight Date, for date-fns formatting. */
function lastDay(range: TimeRange): Date {
  const [y, m, d] = lastDayKey(range).split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

/**
 * Dose logs whose calendar `scheduledDate` falls in the range. Medications are
 * keyed on the calendar date (local midnight), not the logical day.
 */
async function loadDoseLogs(range: TimeRange): Promise<DoseLog[]> {
  const startKey = format(range.start, "yyyy-MM-dd");
  const endKey = lastDayKey(range);
  const logs = await db.doseLogs
    .where("scheduledDate")
    .between(startKey, endKey, true, true)
    .filter(isLive)
    .toArray();
  return logs.sort(
    (a, b) =>
      a.scheduledDate.localeCompare(b.scheduledDate) ||
      a.scheduledTime.localeCompare(b.scheduledTime),
  );
}

/**
 * The 'All' preset sends `start: 0`. Clamp it to the first day with any data
 * (records, dose logs or a prescription), so a report doesn't walk the dose
 * schedule day by day from 1970 and the filename carries a real date.
 */
async function resolveExportRange(range: TimeRange): Promise<TimeRange> {
  if (range.start > 0) return range;

  const candidates: number[] = [];
  const firsts = await Promise.all([
    db.intakeRecords.orderBy("timestamp").filter(isLive).first(),
    db.weightRecords.orderBy("timestamp").filter(isLive).first(),
    db.bloodPressureRecords.orderBy("timestamp").filter(isLive).first(),
    db.eatingRecords.orderBy("timestamp").filter(isLive).first(),
    db.urinationRecords.orderBy("timestamp").filter(isLive).first(),
    db.defecationRecords.orderBy("timestamp").filter(isLive).first(),
    db.substanceRecords.orderBy("timestamp").filter(isLive).first(),
  ]);
  for (const r of firsts) if (r) candidates.push(r.timestamp);

  const firstRx = await db.prescriptions.orderBy("createdAt").filter(isLive).first();
  if (firstRx) candidates.push(firstRx.createdAt);
  const firstDose = await db.doseLogs.orderBy("scheduledDate").filter(isLive).first();
  if (firstDose) {
    const [y, m, d] = firstDose.scheduledDate.split("-").map(Number);
    candidates.push(new Date(y!, m! - 1, d!).getTime());
  }

  const earliest = candidates.length > 0 ? Math.min(...candidates) : lastDay(range).getTime();
  return { start: Math.min(startOfDay(earliest).getTime(), range.end), end: range.end };
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

type Cell = string | number | boolean | null | undefined;

interface CsvSection {
  title: string;
  headers: string[];
  rows: Cell[][];
}

function cell(v: Cell): string {
  return v == null ? "" : String(v);
}

const byTime = <T extends { timestamp: number }>(records: T[]): T[] =>
  [...records].sort((a, b) => a.timestamp - b.timestamp);

/** ISO timestamp plus the device-local wall clock, the first two columns of every timed section. */
function when(ts: number): [string, string] {
  return [new Date(ts).toISOString(), format(ts, "yyyy-MM-dd HH:mm")];
}

const INTAKE_UNITS: Record<IntakeRecord["type"], string> = {
  water: "ml",
  salt: "mg",
  sugar: "g",
  potassium: "mg",
};

function buildSections(records: ExportRecords, doseLogs: DoseLog[], medNames: Map<string, string>): CsvSection[] {
  return [
    {
      title: "Intake",
      // The "salt" record type stores sodium mg, so it exports as "sodium".
      // entered_* is what the user typed for a sodium row (e.g. salt, 2, g);
      // blank when the source is unknown.
      headers: [
        "timestamp",
        "local_time",
        "type",
        "amount",
        "unit",
        "source",
        "note",
        "entered_as",
        "entered_amount",
        "entered_unit",
      ],
      rows: byTime(records.intake).map((r) => [
        ...when(r.timestamp),
        r.type === "salt" ? "sodium" : r.type,
        r.amount,
        INTAKE_UNITS[r.type],
        r.source,
        r.note,
        r.sodiumSource,
        r.sourceAmount,
        r.sourceUnit,
      ]),
    },
    {
      title: "Weight",
      headers: ["timestamp", "local_time", "weight_kg", "note"],
      rows: byTime(records.weight).map((r) => [...when(r.timestamp), r.weight, r.note]),
    },
    {
      title: "Blood pressure",
      headers: [
        "timestamp",
        "local_time",
        "systolic",
        "diastolic",
        "heart_rate",
        "irregular_heartbeat",
        "position",
        "arm",
        "note",
      ],
      rows: byTime(records.bp).map((r) => [
        ...when(r.timestamp),
        r.systolic,
        r.diastolic,
        r.heartRate,
        r.irregularHeartbeat,
        r.position,
        r.arm,
        r.note,
      ]),
    },
    {
      title: "Eating",
      headers: ["timestamp", "local_time", "grams", "note"],
      rows: byTime(records.eating).map((r) => [...when(r.timestamp), r.grams, r.note]),
    },
    {
      // Urination volume is never measured: the ml column is the app's fixed
      // estimate for the logged size, and the header says so.
      title: "Urination",
      headers: ["timestamp", "local_time", "amount_estimate", "estimated_ml (not measured)", "note"],
      rows: byTime(records.urination).map((r) => [
        ...when(r.timestamp),
        r.amountEstimate,
        r.amountEstimate ? URINATION_ESTIMATE_ML[r.amountEstimate] : undefined,
        r.note,
      ]),
    },
    {
      title: "Defecation",
      headers: ["timestamp", "local_time", "amount_estimate", "note"],
      rows: byTime(records.defecation).map((r) => [...when(r.timestamp), r.amountEstimate, r.note]),
    },
    {
      title: "Caffeine and alcohol",
      headers: [
        "timestamp",
        "local_time",
        "type",
        "caffeine_mg",
        "standard_drinks",
        "abv_percent",
        "volume_ml",
        "description",
      ],
      rows: byTime(records.substances).map((r) => [
        ...when(r.timestamp),
        r.type,
        r.amountMg,
        r.amountStandardDrinks,
        r.abvPercent,
        r.volumeMl,
        r.description,
      ]),
    },
    {
      title: "Dose logs",
      headers: [
        "scheduled_date",
        "scheduled_time",
        "medication",
        "status",
        "kind",
        "action_time",
        "dose_amount",
        "dose_unit",
        "pills_consumed",
        "pill_strength",
        "skip_reason",
        "rescheduled_to",
        "note",
      ],
      rows: doseLogs.map((l) => [
        l.scheduledDate,
        l.scheduledTime,
        medNames.get(l.prescriptionId) ?? l.prescriptionId,
        l.status,
        l.kind ?? "scheduled",
        l.actionTimestamp != null ? new Date(l.actionTimestamp).toISOString() : undefined,
        l.doseAmount ?? l.doseMg,
        l.doseUnit ?? (l.doseMg != null ? "mg" : undefined),
        l.pillsConsumed,
        l.pillStrength,
        l.skipReason,
        l.rescheduledTo,
        l.note,
      ]),
    },
  ];
}

/**
 * Export every record in the range as one CSV with a section per record type
 * ("# Title", header row, rows; sections separated by a blank line). Each
 * section carries that type's own columns, so blood pressure keeps diastolic,
 * heart rate, position and arm, meals keep their grams and notes, and dose
 * logs are included. Empty sections are left out; nothing is downloaded when
 * the range has no data.
 */
export async function exportAllRecordsCSV(range: TimeRange): Promise<void> {
  const resolved = await resolveExportRange(range);
  const [records, doseLogs, prescriptions] = await Promise.all([
    loadRecords(resolved),
    loadDoseLogs(resolved),
    db.prescriptions.toArray(),
  ]);
  const medNames = new Map(prescriptions.map((p) => [p.id, p.genericName]));

  const sections = buildSections(records, doseLogs, medNames).filter((s) => s.rows.length > 0);
  if (sections.length === 0) return;

  const csvContent = sections
    .map((s) =>
      [
        `# ${s.title}`,
        s.headers.map(escapeCSVField).join(","),
        ...s.rows.map((r) => r.map((v) => escapeCSVField(cell(v))).join(",")),
      ].join("\n"),
    )
    .join("\n\n");

  const startDate = format(new Date(resolved.start), "yyyy-MM-dd");
  const endDate = lastDayKey(resolved);
  const filename = `health-data-${startDate}-${endDate}.csv`;

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename);
}

// ---------------------------------------------------------------------------
// PDF report
// ---------------------------------------------------------------------------

const RECENT_PER_DOMAIN = 10;
const RECENT_TOTAL = 50;

interface RecentRow {
  timestamp: number;
  domain: string;
  value: string;
}

function recentRows(records: ExportRecords): RecentRow[][] {
  const intake = (type: IntakeRecord["type"], label: string) =>
    records.intake
      .filter((r) => r.type === type)
      .map((r) => ({ timestamp: r.timestamp, domain: label, value: `${r.amount} ${INTAKE_UNITS[type]}` }));
  const substances = (type: SubstanceRecord["type"]) =>
    records.substances
      .filter((r) => r.type === type)
      .map((r) => ({
        timestamp: r.timestamp,
        domain: type === "caffeine" ? "Caffeine" : "Alcohol",
        value:
          type === "caffeine"
            ? `${r.amountMg ?? 0} mg`
            : `${(r.amountStandardDrinks ?? 0).toFixed(1)} drinks`,
      }));

  return [
    intake("water", "Water"),
    intake("salt", "Sodium"),
    intake("sugar", "Sugar"),
    intake("potassium", "Potassium"),
    records.weight.map((r) => ({ timestamp: r.timestamp, domain: "Weight", value: `${r.weight} kg` })),
    records.bp.map((r) => ({
      timestamp: r.timestamp,
      domain: "Blood pressure",
      value:
        `${r.systolic}/${r.diastolic} mmHg` + (r.heartRate != null ? `, ${r.heartRate} bpm` : ""),
    })),
    records.eating.map((r) => ({
      timestamp: r.timestamp,
      domain: "Eating",
      value: [r.note, r.grams != null ? `${r.grams} g` : ""].filter(Boolean).join(" · ") || "meal",
    })),
    records.urination.map((r) => ({
      timestamp: r.timestamp,
      domain: "Urination",
      value: r.amountEstimate ? `${r.amountEstimate} (estimate)` : "logged",
    })),
    records.defecation.map((r) => ({
      timestamp: r.timestamp,
      domain: "Defecation",
      value: r.amountEstimate ?? "logged",
    })),
    substances("caffeine"),
    substances("alcohol"),
  ];
}

/**
 * Rows for the PDF "Recent Records" table: the newest records of each domain,
 * merged newest first on the numeric timestamp, then cut to the newest 50.
 * Dates carry the year when the range spans more than one.
 */
async function buildRecentRecordsTable(range: TimeRange): Promise<string[][]> {
  const records = await loadRecords(range);
  const rows = recentRows(records)
    .flatMap((domainRows) =>
      [...domainRows].sort((a, b) => b.timestamp - a.timestamp).slice(0, RECENT_PER_DOMAIN),
    )
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, RECENT_TOTAL);

  const crossesYear = new Date(range.start).getFullYear() !== lastDay(range).getFullYear();
  const dateFormat = crossesYear ? "MMM d, yyyy, HH:mm" : "MMM d, HH:mm";
  return rows.map((r) => [format(r.timestamp, dateFormat), r.domain, r.value]);
}

/**
 * Generate and download a structured PDF health report for the given range.
 * All computation is client-side -- works offline.
 */
export async function exportToPDF(inputRange: TimeRange): Promise<void> {
  const range = await resolveExportRange(inputRange);
  const [fluid, adherence, bp, weight] = await Promise.all([
    fluidBalance(range),
    adherenceRate(range),
    bpTrend(range),
    weightTrend(range),
  ]);

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const startDate = format(new Date(range.start), "MMM d, yyyy");
  const endDate = format(lastDay(range), "MMM d, yyyy");
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
  const limitedData = await buildRecentRecordsTable(range);

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

  const filename = `health-report-${format(new Date(range.start), "yyyy-MM-dd")}-${lastDayKey(range)}.pdf`;
  doc.save(filename);
}

// Re-export for testing
export {
  escapeCSVField as _escapeCSVField,
  buildRecentRecordsTable as _buildRecentRecordsTable,
};
