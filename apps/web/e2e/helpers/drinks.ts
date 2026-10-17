import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Shared steps for the Drink module specs (drinks.spec.ts on a phone,
 * drinks-desktop.spec.ts on the desk). See GLOSSARY.md for the words.
 */

export const DB_NAME = "IntakeTrackerDB";

/**
 * A fixed "now" for every drink spec: 10:00 local time, well inside the
 * logical day (it starts at 02:00), so a drink logged "now" is today's and a
 * move to 23:40 the evening before crosses midnight into yesterday.
 */
export function fixedNow(): Date {
  return new Date(2026, 9, 14, 10, 0, 0);
}

/** `YYYY-MM-DDTHH:mm` for a datetime-local input, in local time. */
export function dateTimeLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * A preset with caffeine, alcohol and sugar in one drink, so one log writes
 * every kind of row. 330 ml at 5.5% ABV is 1.432 standard drinks: stored as
 * 1.43, shown as 1.4. 10 mg caffeine and 10.6 g sugar per 100 ml give 33 mg
 * and 35 g (34.98 rounded).
 */
export const SPIKED_COLA = {
  id: "e2e-spiked-cola",
  name: "Spiked cola",
  tab: "alcohol",
  defaultVolumeMl: 330,
  caffeinePer100ml: 10,
  alcoholPer100ml: 5.5,
  sugarPer100ml: 10.6,
  isDefault: false,
  source: "manual",
} as const;

/** The two default presets the specs use, as the app ships them. */
const DEFAULT_COFFEE = {
  id: "default-coffee", name: "Coffee", tab: "coffee", caffeinePer100ml: 38,
  defaultVolumeMl: 250, isDefault: true, source: "manual",
};
const DEFAULT_BEER = {
  id: "default-beer", name: "Beer", tab: "alcohol", alcoholPer100ml: 5,
  defaultVolumeMl: 330, isDefault: true, source: "manual",
};

/**
 * Before the app loads: fix the clock, skip the analytics intro, and put the
 * Spiked cola preset beside Coffee and Beer. The sugar tracker is on by
 * default.
 */
export async function prepareDrinkPage(page: Page, now: Date = fixedNow()) {
  await page.clock.setSystemTime(now);
  await page.addInitScript(
    ({ presets }) => {
      const key = "intake-tracker-settings";
      let parsed: { state?: Record<string, unknown>; version?: number } = {};
      try {
        parsed = JSON.parse(localStorage.getItem(key) ?? "{}");
      } catch {
        // Unparseable persisted settings: start fresh.
      }
      parsed.state = {
        ...(parsed.state ?? {}),
        analyticsIntroSeen: true,
        liquidPresets: presets,
      };
      parsed.version ??= 18;
      localStorage.setItem(key, JSON.stringify(parsed));
    },
    { presets: [DEFAULT_COFFEE, DEFAULT_BEER, SPIKED_COLA] },
  );
}

/** Hide the `next dev` indicator: it sits over the bottom-left corner. */
export async function hideDevIndicator(page: Page) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

// ─── Liquids card ─────────────────────────────────────────────────────

/** Pick a Liquids tab, then a preset in it, and check what it will log. */
export async function pickPreset(
  liquids: Locator,
  tab: "Coffee" | "Alcohol",
  preset: string,
) {
  await liquids.getByRole("tab", { name: tab, exact: true }).click();
  const panel = liquids.locator('[role="tabpanel"][data-state="active"]');
  await panel.getByRole("button", { name: new RegExp(`^${preset}\\b`) }).click();
  return panel;
}

/**
 * The Liquids card's Recent row that shows `amount` ("330ml"). The row's
 * text starts with its time, so match the amount cell.
 */
export function recentEntry(liquids: Locator, amount: string): Locator {
  return liquids
    .getByTestId("recent-entry")
    .filter({ has: liquids.page().locator("span.num", { hasText: new RegExp(`^${amount}$`) }) });
}

/** The inline edit form of the Liquids card (one Recent row at a time). */
export function inlineForm(liquids: Locator): Locator {
  return liquids.locator(".wc-ri-edit");
}

/** What the drink edit form should hold once the drink has loaded. */
export interface DrinkFields {
  volume?: string;
  caffeine?: string;
  abv?: string;
  sugar?: string;
}

/**
 * Check the drink fields of an edit form (inline or the Records dialog).
 * The fields fill from the Drink module after the form opens, so this is
 * also how a spec waits for the drink to load before it types.
 */
export async function expectDrinkFields(form: Locator, fields: DrinkFields) {
  if (fields.volume !== undefined) await expect(form.getByLabel("Amount (ml)")).toHaveValue(fields.volume);
  if (fields.caffeine !== undefined) await expect(form.getByLabel(/^Caffeine \(mg\)/)).toHaveValue(fields.caffeine);
  if (fields.abv !== undefined) await expect(form.getByLabel(/^Alcohol \(% ABV\)/)).toHaveValue(fields.abv);
  if (fields.sugar !== undefined) await expect(form.getByLabel(/^Sugar \(g\)/)).toHaveValue(fields.sugar);
}

/** Open the inline edit form of a Recent row and wait for the drink to load. */
export async function openInlineEdit(
  liquids: Locator,
  amount: string,
  loaded: DrinkFields = {},
): Promise<Locator> {
  await recentEntry(liquids, amount).locator("button.open").click();
  const form = inlineForm(liquids);
  await expect(form.getByLabel("Amount (ml)")).toBeVisible();
  await expectDrinkFields(form, loaded);
  return form;
}

// ─── Records tab ──────────────────────────────────────────────────────

/** A row in the Records list, by its accessible name ("Water 330 ml · …"). */
export function recordRow(scope: Locator, name: RegExp): Locator {
  return scope
    .getByTestId("record-row")
    .filter({ has: scope.page().getByRole("button", { name }) });
}

/** The day heading text of the day group a row sits in. */
export async function dayOf(row: Locator): Promise<string> {
  return row.evaluate((el) => {
    const group = el.closest(".wm-list")?.parentElement;
    return group?.querySelector("h3.wm-day span")?.textContent ?? "";
  });
}

// ─── IndexedDB (read back stored values) ──────────────────────────────

export interface StoredRow {
  id: string;
  type: string;
  amount?: number;
  amountMg?: number;
  abvPercent?: number;
  amountStandardDrinks?: number;
  volumeMl?: number;
  timestamp: number;
  groupId?: string;
  deletedAt?: number | null;
  [key: string]: unknown;
}

/** Every row of one IndexedDB store (raw, so it works in any build). */
export async function readStore(page: Page, store: string): Promise<StoredRow[]> {
  return page.evaluate(
    ({ dbName, store }) =>
      new Promise<StoredRow[]>((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const all = db.transaction(store, "readonly").objectStore(store).getAll();
          all.onsuccess = () => {
            db.close();
            resolve(all.result as StoredRow[]);
          };
          all.onerror = () => reject(all.error);
        };
      }),
    { dbName: DB_NAME, store },
  );
}

/** The live rows of every drink group (intake + substance), by group. */
export async function liveDrinkRows(page: Page): Promise<StoredRow[]> {
  const [intakes, substances] = await Promise.all([
    readStore(page, "intakeRecords"),
    readStore(page, "substanceRecords"),
  ]);
  return [...intakes, ...substances].filter((r) => r.deletedAt == null);
}

// ─── An old database (Dexie v25) ──────────────────────────────────────

/**
 * The Dexie v25 stores, as `db.ts` declares them. Dexie keeps version N as
 * IndexedDB version N × 10, so v25 is IndexedDB version 250.
 */
const V25_STORES: Record<string, string> = {
  intakeRecords: "id, [type+timestamp], timestamp, source, groupId, updatedAt",
  weightRecords: "id, timestamp, updatedAt",
  bloodPressureRecords: "id, timestamp, position, arm, updatedAt",
  eatingRecords: "id, timestamp, groupId, updatedAt",
  urinationRecords: "id, timestamp, updatedAt",
  defecationRecords: "id, timestamp, updatedAt",
  prescriptions: "id, updatedAt, createdAt",
  medicationPhases: "id, prescriptionId, status, type, titrationPlanId, updatedAt",
  phaseSchedules: "id, phaseId, time, updatedAt",
  inventoryItems: "id, prescriptionId, updatedAt",
  inventoryTransactions: "id, [inventoryItemId+timestamp], inventoryItemId, timestamp, type, updatedAt",
  doseLogs: "id, [prescriptionId+scheduledDate], [scheduleId+scheduledDate], prescriptionId, phaseId, scheduleId, scheduledDate, scheduledTime, status, updatedAt",
  dailyNotes: "id, date, prescriptionId, doseLogId, updatedAt",
  auditLogs: "id, [action+timestamp], timestamp, action",
  substanceRecords: "id, [type+timestamp], type, timestamp, source, sourceRecordId, groupId, updatedAt",
  titrationPlans: "id, conditionLabel, status, updatedAt",
  _syncQueue: "++id, [tableName+recordId], tableName, enqueuedAt",
  _syncMeta: "tableName",
  _errorLogs: "id, timestamp, source",
  userProfile: "id, updatedAt",
  insightReports: "id, generatedAt, updatedAt",
  userSettings: "id, updatedAt",
};

/** Rows to put in the old database, by store. */
export type SeedRows = Record<string, Array<Record<string, unknown>>>;

/**
 * Create the app's database as Dexie v25 left it, with `rows` in it, before
 * the app ever opens it. The page is a blank HTML page served by
 * `page.route` on the app's origin, so no app code runs while seeding.
 * The next `page.goto("/")` opens the database at the current version and
 * runs every upgrade after v25.
 */
export async function seedV25Database(page: Page, rows: SeedRows) {
  await page.route("**/__e2e-seed", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>seed</title>" }),
  );
  await page.goto("/__e2e-seed");
  await page.evaluate(
    ({ dbName, stores, rows }) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, 250);
        req.onerror = () => reject(req.error);
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const [name, spec] of Object.entries(stores)) {
            const [primary, ...indexes] = spec.split(",").map((s) => s.trim());
            const store = db.createObjectStore(name, {
              keyPath: primary!.replace(/^\+\+/, ""),
              autoIncrement: primary!.startsWith("++"),
            });
            for (const index of indexes) {
              const compound = index.match(/^\[(.+)\]$/);
              store.createIndex(index, compound ? compound[1]!.split("+") : index);
            }
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(Object.keys(rows), "readwrite");
          for (const [name, list] of Object.entries(rows)) {
            for (const row of list) tx.objectStore(name).add(row);
          }
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { dbName: DB_NAME, stores: V25_STORES, rows },
  );
}

// ─── Holding an IndexedDB read ────────────────────────────────────────

declare global {
  interface Window {
    __drinkHold?: {
      held: boolean;
      waiting: Array<() => void>;
      eatingQueries: number;
    };
  }
}

/**
 * From now on, hold every `intakeRecords` get: IndexedDB answers it, but the
 * code that asked does not hear back until {@link releaseIntakeGets}. Each
 * get runs in its own read-only transaction (Dexie's implicit one), so a
 * late answer is safe. Also counts finished `eatingRecords` index queries:
 * the last step of the Drink module's lookup.
 */
export async function holdIntakeGets(page: Page) {
  await page.evaluate(() => {
    const hold = { held: true, waiting: [] as Array<() => void>, eatingQueries: 0 };
    window.__drinkHold = hold;
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (this: IDBObjectStore, query: IDBValidKey | IDBKeyRange) {
      const req = get.call(this, query);
      if (!hold.held || this.name !== "intakeRecords") return req;
      let handler: ((this: IDBRequest, ev: Event) => unknown) | null = null;
      Object.defineProperty(req, "onsuccess", {
        configurable: true,
        get: () => handler,
        set: (h) => {
          handler = h;
        },
      });
      req.addEventListener("success", (ev) => {
        const run = () => void handler?.call(req, ev);
        if (hold.held) hold.waiting.push(run);
        else run();
      });
      return req;
    };
    const proto = IDBIndex.prototype as unknown as Record<string, (...a: unknown[]) => IDBRequest>;
    for (const method of ["getAll", "openCursor", "count", "getAllKeys", "openKeyCursor"]) {
      const original = proto[method]!;
      proto[method] = function (this: IDBIndex, ...args: unknown[]) {
        const req = original.apply(this, args);
        if (this.objectStore.name === "eatingRecords") {
          req.addEventListener("success", () => {
            hold.eatingQueries += 1;
          });
        }
        return req;
      };
    }
  });
}

/** How many held `intakeRecords` reads are waiting. */
export async function heldIntakeGets(page: Page): Promise<number> {
  return page.evaluate(() => window.__drinkHold?.waiting.length ?? 0);
}

/** Let the held reads answer, and every later one answer at once. */
export async function releaseIntakeGets(page: Page) {
  await page.evaluate(() => {
    const hold = window.__drinkHold!;
    hold.held = false;
    hold.eatingQueries = 0;
    for (const run of hold.waiting.splice(0)) run();
  });
}

/** Finished `eatingRecords` index queries since the release. */
export async function eatingQueriesSinceRelease(page: Page): Promise<number> {
  return page.evaluate(() => window.__drinkHold?.eatingQueries ?? 0);
}

/** Wait for React to commit what the last answers changed. */
export async function nextFrames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0))),
      ),
  );
}
