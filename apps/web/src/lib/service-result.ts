// Moved in Phase 3b: the ServiceResult/PaginatedResult contract types live in
// @intake/types/service and the ok/err/unwrap runtime helpers in
// @intake/core/service. Re-exported here so existing `@/lib/service-result`
// importers resolve unchanged.
export type { ServiceResult, PaginatedResult } from "@intake/types/service";
export { ok, err, unwrap } from "@intake/core/service";
