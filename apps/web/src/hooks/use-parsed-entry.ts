"use client";

import { useCallback } from "react";
import {
  logParsedEntry,
  type ParsedEntry,
  type ParsedEntryContext,
  type ParsedEntryResult,
  type ParsedFood,
} from "@/lib/parsed-entry-service";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";
import { unwrap } from "@intake/core/service";
import { withDbRecovery } from "@/lib/db-recovery";

export type { ParsedEntry, ParsedEntryResult, ParsedFood };

/**
 * Log one parsed entry (a voice item, or the Food card's detail form) with
 * the user's tracker settings. Throws on failure. A closed database is
 * reopened and the write retried once.
 */
export function useLogParsedEntry() {
  const sugar = useOptionalTrackerEnabled("sugar");
  const potassium = useOptionalTrackerEnabled("potassium");
  return useCallback(
    (
      entry: ParsedEntry,
      ctx: Omit<ParsedEntryContext, "trackers">,
    ): Promise<ParsedEntryResult> =>
      withDbRecovery(async () =>
        unwrap(await logParsedEntry(entry, { ...ctx, trackers: { sugar, potassium } })),
      ),
    [sugar, potassium],
  );
}
