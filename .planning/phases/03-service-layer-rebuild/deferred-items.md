# Deferred Items - Phase 03

## Pre-existing Build Errors

1. **history/page.tsx: `loadAllRecords` not in `useHistoryData` return type**
   - `useHistoryData()` returns `{ data, deleteWeight, deleteBP }` but `history/page.tsx` destructures `loadAllRecords` from it
   - Also affects `history-drawer.tsx`
   - Likely from 03-03 hooks migration (useLiveQuery removed the manual load pattern but consumers not updated)
   - Blocks `pnpm build` but not related to Plan 03-05
