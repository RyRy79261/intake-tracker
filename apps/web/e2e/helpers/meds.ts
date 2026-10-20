import { expect, type Page } from "@playwright/test";

/**
 * Helpers for the Today screen specs: a fixed day and zone, six medicines
 * due at the same time, seeded straight into IndexedDB, and the app's clock
 * set to a chosen minute of that day.
 */

export const ZONE = "Europe/Berlin";
/** The test day: Monday 2026-10-19, in {@link ZONE} (CEST, UTC+2). */
export const DAY = "2026-10-19";

/** The instant of "HH:MM" on the test day in Berlin (UTC+2 in October). */
export function berlin(hhmm: string, day = DAY): number {
  return new Date(`${day}T${hhmm}:00+02:00`).getTime();
}

const DB_NAME = "IntakeTrackerDB";
const CREATED = berlin("08:00", "2026-09-01");

export interface SeededDose {
  prescriptionId: string;
  scheduleId: string;
  inventoryId: string;
  brand: string;
}

type Row = Record<string, unknown>;

/** Put rows into IndexedDB stores, outside the app. */
async function putRows(page: Page, rows: Record<string, Row[]>): Promise<void> {
  await page.evaluate(
    ({ dbName, rows }) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(Object.keys(rows), "readwrite");
          for (const [store, list] of Object.entries(rows)) {
            for (const row of list) tx.objectStore(store).put(row);
          }
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
    { dbName: DB_NAME, rows },
  );
}

/** Every row of one IndexedDB store. */
export async function readStore(page: Page, store: string): Promise<Row[]> {
  return page.evaluate(
    ({ dbName, store }) =>
      new Promise<Row[]>((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => {
          const db = req.result;
          const get = db.transaction(store, "readonly").objectStore(store).getAll();
          get.onsuccess = () => {
            db.close();
            resolve(get.result as Row[]);
          };
          get.onerror = () => reject(get.error);
        };
        req.onerror = () => reject(req.error);
      }),
    { dbName: DB_NAME, store },
  );
}

/** The scheduled dose logs, by schedule id. */
export async function doseLogs(page: Page): Promise<Map<string, Row>> {
  const logs = (await readStore(page, "doseLogs")).filter((l) => l.kind !== "prn" && l.deletedAt == null);
  return new Map(logs.map((l) => [String(l.scheduleId), l]));
}

/** Stock of each seeded medicine, in seed order. */
export async function stocks(page: Page, doses: SeededDose[]): Promise<number[]> {
  const items = await readStore(page, "inventoryItems");
  return doses.map((d) => Number(items.find((i) => i.id === d.inventoryId)?.currentStock));
}

/**
 * Keep the specs offline and the clock on the test day: no sync, no AI, and
 * the page's clock starting at `hhmm` (it runs on from there).
 */
export async function prepare(page: Page, hhmm: string): Promise<void> {
  await page.route("**/api/sync/**", (route) => route.abort());
  await page.route("**/api/ai/**", (route) => route.fulfill({ status: 503, json: { error: "mocked" } }));
  await page.clock.install({ time: new Date(berlin(hhmm)) });
}

export interface DoseState {
  status: "taken" | "skipped" | "rescheduled";
  at: string;
  reason?: string;
  /** A rescheduled dose: its new reminder instant (epoch ms). */
  remindAt?: number;
}

/**
 * Seed `count` medicines, each with one daily dose at 08:30 Berlin time and
 * 30 tablets in stock, plus optional logs for the test day. Opens the
 * Medications window first (so the app has created its database) and
 * reloads after, so the app reads the seeded rows.
 */
export async function seedSlot(
  page: Page,
  count: number,
  states: (DoseState | undefined)[] = [],
  /** Each medicine's dose time; default 08:30. */
  times: string[] = [],
  /** The day the seeded logs belong to; default {@link DAY}. */
  logDay: string = DAY,
): Promise<SeededDose[]> {
  await page.goto("/medications");
  await expect(page.getByTestId("window")).toBeVisible({ timeout: 30_000 });

  const doses: SeededDose[] = [];
  const rows: Record<string, Row[]> = {
    prescriptions: [],
    medicationPhases: [],
    phaseSchedules: [],
    inventoryItems: [],
    inventoryTransactions: [],
    doseLogs: [],
  };
  const sync = { createdAt: CREATED, updatedAt: CREATED, deletedAt: null, deviceId: "e2e" };
  for (let i = 0; i < count; i++) {
    const n = i + 1;
    const ids = {
      prescriptionId: `e2e-rx-${n}`,
      phaseId: `e2e-phase-${n}`,
      scheduleId: `e2e-schedule-${n}`,
      inventoryId: `e2e-inv-${n}`,
    };
    const brand = `Brand${n}`;
    const state = states[i];
    const taken = state?.status === "taken";
    rows.prescriptions!.push({ id: ids.prescriptionId, genericName: `Generic${n}`, isActive: true, ...sync });
    rows.medicationPhases!.push({
      id: ids.phaseId,
      prescriptionId: ids.prescriptionId,
      type: "maintenance",
      unit: "mg",
      startDate: CREATED,
      foodInstruction: "none",
      status: "active",
      ...sync,
    });
    const time = times[i] ?? "08:30";
    const [hh = 0, mm = 0] = time.split(":").map(Number);
    rows.phaseSchedules!.push({
      id: ids.scheduleId,
      phaseId: ids.phaseId,
      time,
      // Berlin is UTC+2 on the test day.
      scheduleTimeUTC: (hh * 60 + mm - 120 + 1440) % 1440,
      anchorTimezone: ZONE,
      dosage: 50,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      enabled: true,
      unit: "mg",
      ...sync,
    });
    rows.inventoryItems!.push({
      id: ids.inventoryId,
      prescriptionId: ids.prescriptionId,
      brandName: brand,
      currentStock: taken ? 29 : 30,
      strength: 50,
      unit: "mg",
      pillShape: "round",
      pillColor: "#FFFFFF",
      isActive: true,
      isArchived: false,
      timezone: ZONE,
      ...sync,
    });
    rows.inventoryTransactions!.push({
      id: `e2e-tx-${n}`,
      inventoryItemId: ids.inventoryId,
      timestamp: CREATED,
      amount: 30,
      type: "initial",
      timezone: ZONE,
      ...sync,
    });
    if (taken) {
      // The pill the take moved out (stock is the sum of the transactions).
      rows.inventoryTransactions!.push({
        id: `e2e-tx-take-${n}`,
        inventoryItemId: ids.inventoryId,
        timestamp: berlin(state.at),
        amount: -1,
        type: "consumed",
        doseLogId: `e2e-log-${n}`,
        timezone: ZONE,
        ...sync,
      });
    }
    if (state) {
      rows.doseLogs!.push({
        id: `e2e-log-${n}`,
        prescriptionId: ids.prescriptionId,
        phaseId: ids.phaseId,
        scheduleId: ids.scheduleId,
        scheduledDate: logDay,
        scheduledTime: time,
        status: state.status,
        actionTimestamp: berlin(state.at),
        timezone: ZONE,
        doseAmount: 50,
        doseUnit: "mg",
        pillsConsumed: taken ? 1 : 0,
        ...(taken && { inventoryItemId: ids.inventoryId, pillStrength: 50 }),
        ...(state.reason && { skipReason: state.reason }),
        ...(state.remindAt !== undefined && { remindAt: state.remindAt }),
        ...sync,
        updatedAt: berlin(state.at),
      });
    }
    doses.push({ ...ids, brand });
  }
  await putRows(page, rows);
  await page.reload();
  await expect(page.getByTestId("window").getByText("Brand1", { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  return doses;
}
