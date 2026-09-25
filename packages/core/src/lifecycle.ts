/**
 * Record lifecycle predicates shared by every synced table.
 *
 * A row is soft-deleted when `deletedAt` holds a timestamp. Rows written
 * locally carry `deletedAt: null`, but rows that came through a pull, a
 * backup restore or an older client can have the key missing entirely — so a
 * strict `=== null` check silently treats those as deleted. `== null` covers
 * both shapes.
 */

/** True when the row is not soft-deleted (`deletedAt` is null or absent). */
export function isLive(row: { deletedAt?: number | null | undefined }): boolean {
  return row.deletedAt == null;
}
