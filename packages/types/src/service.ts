/**
 * Result + pagination contract types shared across the service layer.
 *
 * Pure types only — the runtime helpers (`ok` / `err` / `unwrap`) live in
 * `@intake/core/service`. `apps/web/src/lib/service-result.ts` re-exports both
 * so existing `@/lib/service-result` importers resolve unchanged.
 */
export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

/** A page of records plus enough metadata to drive "load more" pagination. */
export interface PaginatedResult<T> {
  records: T[];
  hasMore: boolean;
  total: number;
}
