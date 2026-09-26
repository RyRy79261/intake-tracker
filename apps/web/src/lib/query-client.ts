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

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // networkMode 'always': queries and mutations here read and write local
      // IndexedDB, which works with no connectivity. React Query's default
      // ('online') pauses every mutation after the browser fires `offline`,
      // so a water/dose save never reached Dexie until the device came back
      // online (and was lost if the app closed first). The sync engine
      // handles connectivity for the server upload on its own.
      queries: {
        staleTime: 1000 * 60, // 1 minute
        refetchOnWindowFocus: false,
        networkMode: "always",
      },
      mutations: {
        networkMode: "always",
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
