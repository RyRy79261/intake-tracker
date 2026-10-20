import type { InventoryItem, Prescription } from "@/lib/db";
import type { DoseSlot } from "@/lib/dose-schedule-service";
import type { VoiceMedication } from "@intake/ai-prompts/voice-parse";
import { applyDoseSteps, logPrnDose, logUnlistedDose, type DoseStep } from "@/lib/dose-log-service";
import { adjustStock, isActiveBrand } from "@/lib/inventory-service";
import { toLocalDateKey } from "@/lib/date-utils";
import { unwrap } from "@intake/core/service";
import { DEFAULT_LATE_WINDOW_MINUTES, needsTakenTimePrompt } from "@intake/core/dose-rules";
import type {
  ExtraMedicineItem,
  MedicationItem,
  ScheduledDoseItem,
  StockRefillItem,
} from "@/lib/voice-types";

/**
 * Voice items that act on the user's own medications.
 *
 * Voice never adds a prescription, a schedule or a stock item: those are set
 * up in the Medications window on purpose. A spoken item only acts on what is
 * already there:
 * - `scheduled_dose`: the doses of one dose time ("my 8:30 meds"), or one
 *   medicine in it, marked taken, skipped or not taken. A dose already taken
 *   gets its time corrected only when the user names its medicine and says
 *   a new time; a whole dose time leaves its taken doses as they are.
 * - `stock_refill`: pills added to the stock of a medicine on the list.
 * - `extra_medicine`: a dose outside the schedule. A medicine on the list is
 *   an extra (PRN) dose that takes its pills from stock; one not on the list
 *   (a paracetamol) is saved with its name only.
 *
 * Planning is pure (it reads a context the panel loads), so the review row
 * can show exactly what a save will do, and a row that would do nothing or
 * names an unknown medicine cannot be approved.
 */

/** What the panel loads for planning: the list and the dose slots by day. */
export interface VoiceMedicationContext {
  prescriptions: Prescription[];
  inventory: InventoryItem[];
  /** Dose slots by "YYYY-MM-DD". */
  slotsByDate: Record<string, DoseSlot[]>;
}

export type DoseChange =
  | { type: "take"; slot: DoseSlot }
  | { type: "retime"; slot: DoseSlot; from: number }
  | { type: "skip"; slot: DoseSlot }
  | { type: "untake"; slot: DoseSlot }
  | { type: "none"; slot: DoseSlot; reason: string };

export type MedicationPlan =
  | {
      kind: "scheduled_dose";
      date: string;
      slotTime: string;
      /** When the doses were taken: the spoken time, or the save time. */
      takenAt: number;
      /** True when the user said when; a named taken dose is then re-timed. */
      timeSaid: boolean;
      /**
       * No time was said and a dose to take is past its late window: the
       * user must pick "Take now", "Take at a specific time" or "Skip"
       * before saving (the same rule as Take on the Today screen).
       */
      needsTimeChoice: boolean;
      /** When the doses to take were due (the earliest), for "a specific time". */
      dueAt?: number;
      changes: DoseChange[];
    }
  | {
      kind: "stock_refill";
      prescription: Prescription;
      inventory: InventoryItem;
      pills: number;
      stockAfter: number;
      occurredAt?: number;
    }
  | {
      kind: "extra_medicine";
      name: string;
      takenAt: number;
      /** Set when the medicine is on the list. */
      prescription?: Prescription;
      inventory?: InventoryItem;
      /** Pills taken from stock, when the amount allows the sum. */
      pills?: number;
      dosageMg?: number;
      amount?: number;
      unit?: string;
      note?: string;
    };

export type PlanResult = { ok: true; plan: MedicationPlan } | { ok: false; problem: string };

const HALF_DAY_MS = 12 * 60 * 60 * 1000;
const RETIME_MIN_MS = 60 * 1000;

function fail(problem: string): PlanResult {
  return { ok: false, problem };
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");
}

/** "HH:MM" of a timestamp on the device's clock. */
export function clockTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function minutesOf(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function previousDay(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return toLocalDateKey(d);
}

/** The local timestamp of "HH:MM" on a date. */
function at(date: string, hhmm: string): number {
  const d = new Date(`${date}T00:00:00`);
  const minutes = minutesOf(hhmm);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d.getTime();
}

function brandsOf(prescriptionId: string, inventory: InventoryItem[]): InventoryItem[] {
  return inventory.filter((i) => i.prescriptionId === prescriptionId && !i.isArchived);
}

/** The brand the dose math uses: the active one, else the only one. */
function activeBrand(prescriptionId: string, inventory: InventoryItem[]): InventoryItem | undefined {
  const brands = brandsOf(prescriptionId, inventory);
  return brands.find((b) => isActiveBrand(b)) ?? (brands.length === 1 ? brands[0] : undefined);
}

type NameMatch =
  | { found: true; prescription: Prescription; brand?: InventoryItem }
  | { found: false; ambiguous?: string[] };

/**
 * The medicine on the list a spoken name means: its generic name or a brand
 * name, exactly (ignoring case, spaces and marks), else (unless `loose` is
 * false) one that contains the other. Two different medicines matching is ambiguous, never a guess.
 */
export function matchMedicine(
  name: string,
  ctx: VoiceMedicationContext,
  { loose: allowLoose = true }: { loose?: boolean } = {},
): NameMatch {
  const wanted = norm(name);
  if (wanted === "") return { found: false };
  const live = ctx.prescriptions.filter((p) => p.isActive);
  type Hit = { prescription: Prescription; brand?: InventoryItem };
  const exact: Hit[] = [];
  const loose: Hit[] = [];
  for (const prescription of live) {
    const names: { key: string; brand?: InventoryItem }[] = [
      { key: norm(prescription.genericName) },
      ...brandsOf(prescription.id, ctx.inventory).map((brand) => ({ key: norm(brand.brandName), brand })),
    ];
    for (const { key, brand } of names) {
      if (key === "") continue;
      const hit = brand ? { prescription, brand } : { prescription };
      if (key === wanted) exact.push(hit);
      else if (allowLoose && wanted.length >= 4 && (key.includes(wanted) || wanted.includes(key))) {
        loose.push(hit);
      }
    }
  }
  for (const hits of [exact, loose]) {
    const ids = [...new Set(hits.map((h) => h.prescription.id))];
    if (ids.length === 1) {
      const brandHit = hits.find((h) => h.brand);
      return {
        found: true,
        prescription: hits[0]!.prescription,
        ...(brandHit?.brand && { brand: brandHit.brand }),
      };
    }
    if (ids.length > 1) {
      return {
        found: false,
        ambiguous: ids.map((id) => live.find((p) => p.id === id)!.genericName),
      };
    }
  }
  return { found: false };
}

function unknownMedicine(name: string, match: NameMatch): PlanResult {
  if (!match.found && match.ambiguous) {
    return fail(`"${name}" could be ${match.ambiguous.join(" or ")}. Pick one.`);
  }
  return fail(`"${name}" is not on your medication list.`);
}

/** The dates whose slots planning may need for these items. */
export function medicationDates(takenAts: number[], now: number = Date.now()): string[] {
  const dates = new Set<string>();
  for (const t of [now, ...takenAts]) {
    const date = toLocalDateKey(t);
    dates.add(date);
    dates.add(previousDay(date));
  }
  return [...dates].sort();
}

/** What the parser is told is on the list: names and today's dose times. */
export function medicationsForParse(ctx: VoiceMedicationContext, today: string): VoiceMedication[] {
  const slots = ctx.slotsByDate[today] ?? [];
  return ctx.prescriptions
    .filter((p) => p.isActive)
    .map((p) => ({
      name: p.genericName,
      brands: brandsOf(p.id, ctx.inventory).map((b) => b.brandName),
      doseTimes: [...new Set(slots.filter((s) => s.prescriptionId === p.id).map((s) => s.localTime))].sort(),
    }));
}

/** How a plan applies the late-window rule. */
export interface PlanOptions {
  /** The current time; default `takenAt`. */
  now?: number;
  lateWindowMinutes?: number;
  /** The user picked "Take now": no time choice is asked. */
  takeNow?: boolean;
}

function planScheduledDose(
  item: ScheduledDoseItem,
  takenAt: number,
  timeSaid: boolean,
  ctx: VoiceMedicationContext,
  opts: PlanOptions,
): PlanResult {
  let prescriptionId: string | undefined;
  if (item.medicine !== undefined && item.medicine.trim() !== "") {
    const match = matchMedicine(item.medicine, ctx);
    if (!match.found) return unknownMedicine(item.medicine, match);
    prescriptionId = match.prescription.id;
  }

  let date = toLocalDateKey(takenAt);
  let slotTime = item.slotTime;
  if (slotTime !== undefined) {
    // The 22:00 doses taken at 00:30 belong to the day before.
    if (at(date, slotTime) - takenAt > HALF_DAY_MS) date = previousDay(date);
  } else {
    if (!prescriptionId) return fail("Say which dose time, or which medicine.");
    // No dose time said: the medicine's dose time nearest to when it was taken.
    const candidates = [date, previousDay(date)].flatMap((d) =>
      (ctx.slotsByDate[d] ?? [])
        .filter((s) => s.prescriptionId === prescriptionId)
        .map((s) => ({ d, s, gap: Math.abs(at(d, s.localTime) - takenAt) })),
    );
    candidates.sort((a, b) => a.gap - b.gap);
    const nearest = candidates[0];
    if (!nearest) return fail(`${item.medicine} has no dose time on this day.`);
    date = nearest.d;
    slotTime = nearest.s.localTime;
  }

  const inSlot = (ctx.slotsByDate[date] ?? []).filter((s) => s.localTime === slotTime);
  if (inSlot.length === 0) return fail(`You have no doses at ${slotTime} on ${date}.`);
  const slots = prescriptionId ? inSlot.filter((s) => s.prescriptionId === prescriptionId) : inSlot;
  if (slots.length === 0) return fail(`${item.medicine} is not in your ${slotTime} doses.`);

  // A dose of a day after today cannot be taken or skipped yet.
  if (item.action !== "not_taken" && date > toLocalDateKey(opts.now ?? Date.now())) {
    return fail(`Your ${slotTime} doses on ${date} are not due yet.`);
  }

  // Bulk rule: a whole dose time changes only the doses with no user action
  // yet. A dose already taken or skipped stays as it is. Only a dose the user
  // names gets its taken time corrected.
  const changes = slots.map((slot): DoseChange => {
    const log = slot.existingLog;
    const taken = slot.status === "taken";
    switch (item.action) {
      case "taken":
        if (slot.status === "skipped" && !prescriptionId) return { type: "none", slot, reason: "skipped" };
        if (!taken) return { type: "take", slot };
        if (
          prescriptionId !== undefined &&
          timeSaid &&
          log?.actionTimestamp !== undefined &&
          Math.abs(log.actionTimestamp - takenAt) >= RETIME_MIN_MS
        ) {
          return { type: "retime", slot, from: log.actionTimestamp };
        }
        return {
          type: "none",
          slot,
          reason: log?.actionTimestamp !== undefined ? `already taken at ${clockTime(log.actionTimestamp)}` : "already taken",
        };
      case "skipped":
        if (slot.status === "skipped") return { type: "none", slot, reason: "already skipped" };
        // A dose time skipped as a whole leaves its taken doses alone.
        if (taken && !prescriptionId) return { type: "none", slot, reason: "already taken" };
        return { type: "skip", slot };
      case "not_taken":
        return taken ? { type: "untake", slot } : { type: "none", slot, reason: "not marked taken" };
    }
  });
  if (changes.every((c) => c.type === "none")) {
    const reasons = changes
      .map((c) => `${c.slot.prescription.genericName} ${(c as { reason: string }).reason}`)
      .sort((a, b) => a.localeCompare(b));
    return fail(`Nothing to change: ${reasons.join(", ")}.`);
  }
  const takes = changes.filter((c) => c.type === "take");
  const now = opts.now ?? takenAt;
  const lateWindow = opts.lateWindowMinutes ?? DEFAULT_LATE_WINDOW_MINUTES;
  const needsTimeChoice =
    !timeSaid && !opts.takeNow && takes.some((c) => needsTakenTimePrompt(c.slot.dueAt, now, lateWindow));
  const dueAt = takes.length > 0 ? Math.min(...takes.map((c) => c.slot.dueAt)) : undefined;
  return {
    ok: true,
    plan: {
      kind: "scheduled_dose",
      date,
      slotTime,
      takenAt,
      timeSaid,
      needsTimeChoice,
      ...(dueAt !== undefined && { dueAt }),
      changes,
    },
  };
}

function planRefill(
  item: StockRefillItem,
  takenAt: number,
  timeSaid: boolean,
  ctx: VoiceMedicationContext,
): PlanResult {
  const match = matchMedicine(item.medicine, ctx);
  if (!match.found) return unknownMedicine(item.medicine, match);
  const inventory = match.brand ?? activeBrand(match.prescription.id, ctx.inventory);
  if (!inventory) {
    return fail(`${match.prescription.genericName} has no stock to refill. Add a brand in Medications first.`);
  }
  return {
    ok: true,
    plan: {
      kind: "stock_refill",
      prescription: match.prescription,
      inventory,
      pills: item.pills,
      stockAfter: Math.round(((inventory.currentStock ?? 0) + item.pills) * 10000) / 10000,
      ...(timeSaid && { occurredAt: takenAt }),
    },
  };
}

function planExtra(item: ExtraMedicineItem, takenAt: number, ctx: VoiceMedicationContext): PlanResult {
  const name = item.medicine.trim();
  // Exact names only: a near miss ("paracetamol" in "Paracetamol/Codeine")
  // must not take its pills from another medicine's stock. A name that is
  // not exact is saved as unlisted, and the row says so.
  const match = matchMedicine(name, ctx, { loose: false });
  if (!match.found && match.ambiguous) return unknownMedicine(name, match);
  const base = {
    kind: "extra_medicine" as const,
    takenAt,
    ...(item.amount !== undefined && { amount: item.amount }),
    ...(item.unit !== undefined && { unit: item.unit }),
    ...(item.note !== undefined && item.note.trim() !== "" && { note: item.note.trim() }),
  };
  if (!match.found) return { ok: true, plan: { ...base, name } };

  const inventory = match.brand ?? activeBrand(match.prescription.id, ctx.inventory);
  let dosageMg: number | undefined;
  if (item.amount !== undefined) {
    if (item.unit === "mg") dosageMg = item.amount;
    else if ((item.unit === "tablet" || item.unit === "capsule") && inventory && inventory.strength > 0) {
      dosageMg = item.amount * inventory.strength;
    }
  }
  const pills =
    dosageMg !== undefined && inventory && inventory.strength > 0
      ? Math.round((dosageMg / inventory.strength) * 10000) / 10000
      : undefined;
  return {
    ok: true,
    plan: {
      ...base,
      name: match.prescription.genericName,
      prescription: match.prescription,
      ...(inventory && { inventory }),
      ...(pills !== undefined && { pills }),
      ...(dosageMg !== undefined && { dosageMg }),
    },
  };
}

/**
 * What saving a medication item would do, or why it cannot be saved.
 * `takenAt` is the item's time (the spoken one, or the save time when
 * `timeSaid` is false).
 */
export function planMedicationItem(
  item: MedicationItem,
  ctx: VoiceMedicationContext,
  takenAt: number,
  timeSaid: boolean,
  opts: PlanOptions = {},
): PlanResult {
  switch (item.kind) {
    case "scheduled_dose":
      return planScheduledDose(item, takenAt, timeSaid, ctx, opts);
    case "stock_refill":
      return planRefill(item, takenAt, timeSaid, ctx);
    case "extra_medicine":
      return planExtra(item, takenAt, ctx);
  }
}

/** One line per thing a plan changes, for the review row. */
export function describePlan(plan: MedicationPlan): string[] {
  switch (plan.kind) {
    case "scheduled_dose":
      return plan.changes.map((c) => {
        const name = `${c.slot.prescription.genericName} ${c.slot.dosageMg} ${c.slot.unit}`;
        switch (c.type) {
          case "take":
            return `${name}: mark taken${plan.timeSaid ? ` at ${clockTime(plan.takenAt)}` : ""}`;
          case "retime":
            return `${name}: change time ${clockTime(c.from)} → ${clockTime(plan.takenAt)}`;
          case "skip":
            return `${name}: mark skipped`;
          case "untake":
            return `${name}: mark not taken, pills back in stock`;
          case "none":
            return `${name}: no change (${c.reason})`;
        }
      });
    case "stock_refill":
      return [
        `${plan.inventory.brandName}: add ${plan.pills} pills (stock ${plan.inventory.currentStock ?? 0} → ${plan.stockAfter})`,
      ];
    case "extra_medicine": {
      const amount = plan.amount !== undefined ? ` ${plan.amount}${plan.unit ? ` ${plan.unit}` : ""}` : "";
      if (!plan.prescription) {
        return [`${plan.name}${amount}: not on your medication list. Saved by name, no stock.`];
      }
      return [
        plan.pills !== undefined && plan.inventory
          ? `${plan.name}${amount}: extra dose, ${plan.pills} pills from ${plan.inventory.brandName}`
          : `${plan.name}${amount}: extra dose, no stock taken`,
      ];
    }
  }
}

/** Carry out a plan. Throws with the first failure. */
export async function saveMedicationPlan(plan: MedicationPlan): Promise<void> {
  switch (plan.kind) {
    case "scheduled_dose": {
      if (plan.needsTimeChoice) throw new Error("Pick when you took them first.");
      // One synced write for the whole row: every dose changes or none does.
      const steps = plan.changes.flatMap((change): DoseStep[] => {
        const { slot } = change;
        const key = {
          prescriptionId: slot.prescriptionId,
          phaseId: slot.phaseId,
          scheduleId: slot.scheduleId,
          date: plan.date,
          time: slot.localTime,
          dosageMg: slot.dosageMg,
        };
        switch (change.type) {
          case "take":
            return [{ type: "take", key, takenAt: plan.takenAt }];
          case "retime":
            return [{ type: "retime", key, takenAt: plan.takenAt }];
          case "skip":
            return [{ type: "skip", key }];
          case "untake":
            return [{ type: "untake", key }];
          case "none":
            return [];
        }
      });
      unwrap(await applyDoseSteps(steps));
      return;
    }
    case "stock_refill":
      unwrap(await adjustStock(plan.inventory.id, plan.pills, "Refill by voice", "refill", plan.occurredAt));
      return;
    case "extra_medicine":
      if (plan.prescription) {
        unwrap(
          await logPrnDose({
            prescriptionId: plan.prescription.id,
            date: toLocalDateKey(plan.takenAt),
            time: clockTime(plan.takenAt),
            ...(plan.dosageMg !== undefined && { doseMg: plan.dosageMg, dosageMg: plan.dosageMg }),
            ...(plan.note !== undefined && { note: plan.note }),
          }),
        );
      } else {
        unwrap(
          await logUnlistedDose({
            medicineName: plan.name,
            takenAt: plan.takenAt,
            ...(plan.amount !== undefined && { amount: plan.amount }),
            ...(plan.unit !== undefined && { unit: plan.unit }),
            ...(plan.note !== undefined && { note: plan.note }),
          }),
        );
      }
      return;
  }
}
