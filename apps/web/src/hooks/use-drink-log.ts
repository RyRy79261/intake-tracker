"use client";

import { useCallback } from "react";
import {
  logDrink,
  type LogDrinkInput,
  type LogDrinkResult,
} from "@/lib/drink-service";
import { unwrap } from "@intake/core/service";

export type { LogDrinkInput, LogDrinkResult };

/**
 * Mutation hook for logging a drink — the only supported way for a component
 * to record something with a fluid volume. `logDrink` derives the single water
 * IntakeRecord from `volumeMl` itself, so callers must never queue their own
 * water intake alongside it.
 */
export function useLogDrink() {
  return useCallback(
    async (input: LogDrinkInput): Promise<LogDrinkResult> => {
      return unwrap(await logDrink(input));
    },
    [],
  );
}
