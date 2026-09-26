/**
 * Refill status — days of supply and the low-stock decision for one brand.
 *
 * The prescription card, the inventory drawer and the refill notifier all ask
 * the same question ("is this box running out?"), so the answer lives here
 * once. `computeRefillStatus` is pure: callers pass the active brand, the
 * phase that actually drives today's doses (`selectEffectivePhase` from
 * `@intake/core/effective-phase`) and that phase's schedules.
 * `getRefillStatuses` does that lookup from Dexie for every prescription.
 */
import { isLive } from "@intake/core/lifecycle";
import { selectEffectivePhase } from "@intake/core/effective-phase";
import { db, type InventoryItem, type Prescription } from "@/lib/db";
import { isActiveBrand } from "@/lib/inventory-service";

/** The inventory fields the refill decision reads. */
export interface RefillInventoryLike {
  strength: number;
  unit?: string | null;
  currentStock?: number | null;
  refillAlertDays?: number | null;
  refillAlertPills?: number | null;
}

/** The phase fields the refill decision reads. */
export interface RefillPhaseLike {
  id: string;
  unit?: string | null;
}

/** The schedule fields the refill decision reads. */
export interface RefillScheduleLike {
  phaseId: string;
  dosage: number;
  daysOfWeek: number[];
  enabled: boolean;
  deletedAt?: number | null;
}

export type RefillReason = "negative" | "pills" | "days";

export interface RefillStatus {
  stock: number;
  /** Average pills per day under the phase; 0 when nothing is scheduled. */
  dailyPills: number;
  /**
   * Whole days of supply left, clamped at 0. `null` when there is no
   * estimate: no effective phase or schedule, a non-positive pill strength,
   * or a phase unit that doesn't match the pill unit.
   */
  daysLeft: number | null;
  isNegative: boolean;
  /** At or under a refill threshold (pills or days) while stock is ≥ 0. */
  isLow: boolean;
  /** Negative or low — what the notifier alerts on. */
  needsRefill: boolean;
  reason: RefillReason | null;
}

export function computeRefillStatus(
  inventory: RefillInventoryLike,
  effectivePhase: RefillPhaseLike | undefined | null,
  schedules: readonly RefillScheduleLike[],
): RefillStatus {
  const stock = inventory.currentStock ?? 0;

  let dailyPills = 0;
  const unitsMatch =
    !effectivePhase?.unit || !inventory.unit || effectivePhase.unit === inventory.unit;
  if (effectivePhase && unitsMatch && inventory.strength > 0) {
    const dailyDosage = schedules
      .filter((s) => s.phaseId === effectivePhase.id && s.enabled === true && isLive(s))
      .reduce((acc, s) => acc + s.dosage * (s.daysOfWeek.length / 7), 0);
    dailyPills = dailyDosage / inventory.strength;
  }

  const daysLeft = dailyPills > 0 ? Math.max(0, Math.floor(stock / dailyPills)) : null;
  const isNegative = stock < 0;

  let reason: RefillReason | null = null;
  if (isNegative) {
    reason = "negative";
  } else if (inventory.refillAlertPills != null && stock <= inventory.refillAlertPills) {
    reason = "pills";
  } else if (
    inventory.refillAlertDays != null &&
    daysLeft !== null &&
    daysLeft <= inventory.refillAlertDays
  ) {
    reason = "days";
  }

  return {
    stock,
    dailyPills,
    daysLeft,
    isNegative,
    isLow: reason === "pills" || reason === "days",
    needsRefill: reason !== null,
    reason,
  };
}

export interface PrescriptionRefillStatus {
  prescriptionId: string;
  prescription: Prescription;
  inventory: InventoryItem;
  status: RefillStatus;
}

/**
 * Refill status for every live, active prescription that has an effective
 * phase and an active brand — the set the refill notifier checks.
 */
export async function getRefillStatuses(): Promise<PrescriptionRefillStatus[]> {
  const prescriptions = (await db.prescriptions.toArray()).filter(
    (rx) => isLive(rx) && rx.isActive === true,
  );
  const result: PrescriptionRefillStatus[] = [];

  for (const prescription of prescriptions) {
    const phases = await db.medicationPhases.where("prescriptionId").equals(prescription.id).toArray();
    const phase = selectEffectivePhase(phases);
    if (!phase) continue;

    const inventory = (
      await db.inventoryItems.where("prescriptionId").equals(prescription.id).toArray()
    ).find(isActiveBrand);
    if (!inventory) continue;

    const schedules = await db.phaseSchedules.where("phaseId").equals(phase.id).toArray();
    result.push({
      prescriptionId: prescription.id,
      prescription,
      inventory,
      status: computeRefillStatus(inventory, phase, schedules),
    });
  }
  return result;
}

/**
 * Decide which prescriptions to alert for. A prescription is notified once
 * while it needs a refill, and drops out of `notified` as soon as it no
 * longer does (refilled, or no longer checked), so running low again alerts
 * again.
 */
export function reconcileRefillNotifications(
  previouslyNotified: readonly string[],
  statuses: readonly { prescriptionId: string; status: Pick<RefillStatus, "needsRefill"> }[],
): { toNotify: string[]; notified: string[] } {
  const notified = statuses.filter((s) => s.status.needsRefill).map((s) => s.prescriptionId);
  const toNotify = notified.filter((id) => !previouslyNotified.includes(id));
  return { toNotify, notified };
}
