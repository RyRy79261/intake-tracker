/**
 * Shared React Query client singleton.
 *
 * Extracted from `src/app/providers.tsx` so non-React modules (notably
 * `src/lib/sync-engine.ts`) can `invalidateQueries()` after a successful
 * pull without going through React context (Phase 43 Plan 06 Task 2 Part C).
 *
 * SSR note: the engine only runs in the browser (it touches IndexedDB and
 * `navigator.onLine`), so this module is safe to import from it. The
 * provider stack gates all React-side usage behind `typeof window !==
 * 'undefined'` already — see `providers.tsx` `getQueryClient()`.
 */

import { QueryClient } from "@tanstack/react-query";

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60, // 1 minute
        refetchOnWindowFocus: false,
      },
    },
  });
}

/**
 * Browser-side singleton. Always the same instance across the app so that
 * `invalidateQueries()` calls from `sync-engine.ts` hit the same cache the
 * React tree subscribes to.
 */
export const queryClient: QueryClient = makeQueryClient();
