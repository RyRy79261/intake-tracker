"use client";

import { useState } from "react";
import { useNowTick } from "@intake/ui/use-now-tick";
import { toLocalDateKey } from "@/lib/date-utils";

/**
 * Today's local calendar-day key ("YYYY-MM-DD"), re-evaluated every minute so
 * a screen left open overnight rolls over at midnight on its own.
 */
export function useTodayKey(): string {
  useNowTick(60_000);
  return toLocalDateKey();
}

/**
 * The Medications screen's selected day. When the calendar day rolls over, a
 * selection that was on "today" follows it to the new today; a day the user
 * browsed to on purpose is left alone.
 */
export function useRollingSelectedDate() {
  const todayKey = useTodayKey();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [prevTodayKey, setPrevTodayKey] = useState(todayKey);

  // Adjust state during render (not in an effect) so the stale day never
  // paints after the rollover.
  if (prevTodayKey !== todayKey) {
    setPrevTodayKey(todayKey);
    if (toLocalDateKey(selectedDate) === prevTodayKey) {
      setSelectedDate(new Date());
    }
  }

  return { selectedDate, setSelectedDate, todayKey };
}
