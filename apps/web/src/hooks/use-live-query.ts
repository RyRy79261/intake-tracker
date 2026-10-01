"use client";

import { useRef } from "react";
import { useLiveQuery as useDexieLiveQuery } from "dexie-react-hooks";
import { PREVIEW_PAUSED, liveReadRealDatabase } from "@/lib/db";
import { useInPreview } from "@/lib/help/preview-context";

/**
 * Dexie's `useLiveQuery`, kept off a manual preview's sample data.
 *
 * Inside a live preview it is the plain hook: it reads the sample database.
 * Everywhere else (Home, the windows and the sys-bar behind the manual) the
 * querier only ever reads the real database: while a preview is swapped in
 * the query pauses and keeps showing its last real result, and it runs again
 * once the preview is gone. See `liveReadRealDatabase`.
 */
export function useLiveQuery<T>(querier: () => Promise<T> | T, deps?: unknown[]): T | undefined;
export function useLiveQuery<T, TDefault>(
  querier: () => Promise<T> | T,
  deps: unknown[],
  defaultResult: TDefault,
): T | TDefault;
export function useLiveQuery<T, TDefault>(
  querier: () => Promise<T> | T,
  deps: unknown[] = [],
  defaultResult?: TDefault,
): T | TDefault | undefined {
  const inPreview = useInPreview();
  const value = useDexieLiveQuery<T | typeof PREVIEW_PAUSED, TDefault | undefined>(
    inPreview ? querier : () => liveReadRealDatabase(querier),
    [...deps, inPreview],
    defaultResult,
  );
  const last = useRef<T | TDefault | undefined>(defaultResult);
  if (value === PREVIEW_PAUSED) return last.current;
  last.current = value;
  return value;
}
