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

import { QueryClient, type QueryFunctionContext } from "@tanstack/react-query";
import { readRealDatabase } from "@/lib/db";

/**
 * Wraps every query of the app-wide client: while a manual's live preview
 * has its sample database swapped in, a fetch (a background window
 * refetching, a component mounting behind the manual) waits for the real
 * database instead of reading the sample data, and one caught mid-read by a
 * swap runs again. The preview renders with its own client, which has no
 * gate.
 */
function waitForRealDatabase<T>(
  queryFn: (context: QueryFunctionContext) => T | Promise<T>,
  context: QueryFunctionContext,
): Promise<T> {
  return readRealDatabase(() => queryFn(context));
}

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
        persister: waitForRealDatabase,
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
