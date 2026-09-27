/**
 * Per-setting conflict resolution for the synced `userSettings` row.
 *
 * Every other synced table resolves conflicts per row: the newest `updatedAt`
 * wins. For settings that lost edits: two devices changing *different*
 * settings while offline each wrote a whole row, and only the later row
 * survived. The row therefore carries `fieldUpdatedAt` — when each setting
 * was last changed — and two versions of the row merge setting by setting:
 * each setting takes the value with the newer stamp.
 *
 *   - A row without stamps (written before the field existed, or by an older
 *     client) counts every setting as changed at its `updatedAt`, which is
 *     exactly the old whole-row rule.
 *   - A stamp tie keeps the base (server) value, like the push route's
 *     upsert-vs-upsert tie.
 *   - Only live rows merge. A tombstone on either side uses the normal
 *     row rules.
 *
 * Used in two places with the same rule: the push route (base = the server
 * row, incoming = the pushed row) and the pull (base = the pulled row,
 * incoming = the local row). Pure — no Dexie, no store — so the server route
 * can import it.
 */

/**
 * A settings row as either side holds it: row metadata plus the settings
 * (read by key). `UserSettings` and a raw Postgres row both fit.
 */
export interface SettingsRowLike {
  id: string;
  updatedAt: number;
  createdAt?: number | undefined;
  deletedAt?: number | null | undefined;
  deviceId?: string | undefined;
  fieldUpdatedAt?: Record<string, number> | null | undefined;
}

const fields = (row: SettingsRowLike): Record<string, unknown> =>
  row as unknown as Record<string, unknown>;

/** Row metadata and server-only columns: never merged as settings. */
const NON_SETTING_KEYS: ReadonlySet<string> = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "deviceId",
  "fieldUpdatedAt",
  "userId",
  "serverUpdatedAt",
]);

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** When `key` was last changed in `row`. */
export function settingStamp(row: SettingsRowLike, key: string): number {
  const stamp = row.fieldUpdatedAt?.[key];
  return isFiniteNumber(stamp) ? stamp : row.updatedAt;
}

/** JSON with object keys sorted, undefined read as null. */
function canonical(value: unknown): string {
  return JSON.stringify(value ?? null, (_key, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        const inner = (v as Record<string, unknown>)[k];
        sorted[k] = inner === undefined ? null : inner;
      }
      return sorted;
    }
    return v;
  });
}

/**
 * Whether two setting values are the same. Object key order is ignored
 * (Postgres jsonb reorders keys) and undefined equals null (a pulled row
 * drops null columns).
 */
export function sameSettingValue(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

function settingKeys(...rows: SettingsRowLike[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(fields(row))) {
      if (!NON_SETTING_KEYS.has(key)) keys.add(key);
    }
  }
  return [...keys].sort();
}

export interface SettingsMergeResult<T extends SettingsRowLike> {
  /** The merged row. `updatedAt` is the newer of the two rows'. */
  row: T;
  /** Settings whose value came from `incoming` and differs from `base`. */
  incomingWins: string[];
  /** Settings whose value stayed `base`'s and differs from `incoming`. */
  baseWins: string[];
}

/**
 * Merge two live versions of the settings row, setting by setting. `base`
 * keeps ties; a setting `incoming` does not carry keeps `base`'s value.
 */
export function mergeSettingsRows<T extends SettingsRowLike>(
  base: T,
  incoming: SettingsRowLike,
): SettingsMergeResult<T> {
  const baseFields = fields(base);
  const inFields = fields(incoming);
  const merged: Record<string, unknown> = { ...baseFields };
  const stamps: Record<string, number> = {};
  const incomingWins: string[] = [];
  const baseWins: string[] = [];

  for (const key of settingKeys(base, incoming)) {
    const baseStamp = settingStamp(base, key);
    const inStamp = settingStamp(incoming, key);
    const incomingHas = Object.prototype.hasOwnProperty.call(inFields, key);
    const baseHas = Object.prototype.hasOwnProperty.call(baseFields, key);
    const takeIncoming = incomingHas && (!baseHas || inStamp > baseStamp);
    const differs = !sameSettingValue(baseFields[key], inFields[key]);

    if (takeIncoming) {
      merged[key] = inFields[key];
      stamps[key] = inStamp;
      if (differs) incomingWins.push(key);
    } else {
      stamps[key] = baseStamp;
      if (differs && incomingHas) baseWins.push(key);
    }
  }

  const incomingNewer = incoming.updatedAt > base.updatedAt;
  merged.fieldUpdatedAt = stamps;
  merged.updatedAt = Math.max(base.updatedAt, incoming.updatedAt);
  if (incomingNewer && incoming.deviceId !== undefined) merged.deviceId = incoming.deviceId;
  if (isFiniteNumber(incoming.createdAt) && isFiniteNumber(base.createdAt)) {
    merged.createdAt = Math.min(base.createdAt, incoming.createdAt);
  }

  return { row: merged as unknown as T, incomingWins, baseWins };
}

/**
 * Per-setting stamps for a row about to be written with `values`: a setting
 * whose value differs from `previous` is stamped `at`; the others keep
 * `previous`'s stamp. With no previous row every setting is stamped `at`.
 */
export function stampChangedSettings(
  previous: SettingsRowLike | undefined,
  values: object,
  at: number,
): Record<string, number> {
  const stamps: Record<string, number> = {};
  for (const [key, value] of Object.entries(values)) {
    stamps[key] =
      previous && sameSettingValue(fields(previous)[key], value)
        ? settingStamp(previous, key)
        : at;
  }
  return stamps;
}
