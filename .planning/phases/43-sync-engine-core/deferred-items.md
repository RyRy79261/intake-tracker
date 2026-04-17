# Phase 43 Deferred Items

Out-of-scope issues discovered during plan execution but not fixed (per SCOPE BOUNDARY rules).

## 43-02

### sync-payload.ts pre-existing TypeScript errors (untracked file)

- **File:** `src/lib/sync-payload.ts`
- **Status:** Untracked in git (not part of any commit at plan 43-02 base `4e1e564`)
- **Errors:** 17 TS errors — `drizzle-zod` return types are `ZodObject` from Zod's internal schema namespace, incompatible with `ZodType<any, any, any>` expected by `ZodDiscriminatedUnionOption`. Likely caused by `drizzle-zod` version drift vs the Zod version pinned in the project, or a mismatched `z` import path.
- **Ownership:** Belongs to a later plan (likely 43-04 — `sync-payload validation`). Surface to that plan's executor.
- **Not fixed because:** File is outside plan 43-02's `files_modified` list (db.ts + dexie-v16.test.ts only). Plan 43-02's own scope has zero TS errors.
