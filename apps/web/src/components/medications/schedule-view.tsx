"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCarriedOverDoses, useDailyDoseSchedule } from "@/hooks/use-medication-queries";
import type { DoseSlot } from "@/hooks/use-medication-queries";
import { useTodayKey } from "@/hooks/use-today-key";
import { useNow } from "@/hooks/use-now";
import { DoseProgressSummary } from "@/components/medications/dose-progress-summary";
import { TimeSlotGroup } from "@/components/medications/time-slot-group";
import { EmptySchedule } from "@/components/medications/empty-schedule";
import { MarkAllDosesSheet } from "@/components/medications/mark-all-doses-sheet";
import { DoseDetailDialog } from "@/components/medications/dose-detail-dialog";
import { useDoseActions } from "@/components/medications/use-dose-actions";
import { DoseRow } from "@/components/medications/dose-row";
import { doseDisplayName, formatCarriedOverOrigin, isRescheduledSlot } from "@/lib/medication-ui-utils";
import { toLocalDateKey } from "@/lib/date-utils";
import { isOpenDoseStatus, type SlotDay } from "@intake/core/dose-rules";

interface ScheduleViewProps {
  selectedDate: Date;
  onAddMed: () => void;
  /** Info in the dose dialog: open "About this medicine". */
  onOpenInfo?: (prescriptionId: string) => void;
}

/** The `data-time` of the "Moved to today" group. */
const CARRIED_TIME = "carried";

/** One dose's key on this screen: a carried-over dose can share its schedule with today's. */
const doseId = (slot: DoseSlot) => `${slot.scheduleId}|${slot.scheduledDate}`;

interface TimeGroup {
  time: string;
  slots: DoseSlot[];
  dueAt: number;
}

/**
 * The Today (Schedule) tab: "Moved to today" (doses of other days, earlier
 * or later, rescheduled into today), then one card per dose time, in time order. A
 * rescheduled dose stays under its original time. On open the list scrolls
 * to the dose time nearest to now. A clock ticks, so the header colours,
 * "Missed" and the "Unmarked meds" chip stay current while the screen is
 * open.
 */
export function ScheduleView({ selectedDate, onAddMed, onOpenInfo }: ScheduleViewProps) {
  const dateStr = toLocalDateKey(selectedDate);
  const slots = useDailyDoseSchedule(dateStr);
  const carried = useCarriedOverDoses(dateStr);
  const now = useNow();
  const todayKey = useTodayKey();
  const day: SlotDay = dateStr < todayKey ? "past" : dateStr > todayKey ? "future" : "today";
  const isToday = day === "today";

  const actions = useDoseActions();
  const [markAllTime, setMarkAllTime] = useState<string | null>(null);
  const [openDoseId, setOpenDoseId] = useState<string | null>(null);

  const groups = useMemo<TimeGroup[]>(() => {
    if (!slots) return [];
    const byTime = new Map<string, DoseSlot[]>();
    for (const slot of slots) {
      const bucket = byTime.get(slot.localTime) ?? [];
      bucket.push(slot);
      byTime.set(slot.localTime, bucket);
    }
    return Array.from(byTime.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, groupSlots]) => ({
        time,
        slots: groupSlots,
        dueAt: Math.min(...groupSlots.map((s) => s.dueAt)),
      }));
  }, [slots]);

  // Low stock warnings
  const lowStockWarnings = useMemo(() => {
    if (!slots) return [];
    const names = new Set<string>();
    for (const slot of slots) {
      if (slot.inventoryWarning === "negative_stock") {
        names.add(doseDisplayName(slot));
      } else if (
        slot.inventory &&
        slot.inventory.currentStock != null &&
        slot.inventory.refillAlertPills != null &&
        slot.inventory.currentStock <= slot.inventory.refillAlertPills
      ) {
        names.add(doseDisplayName(slot));
      }
    }
    return Array.from(names);
  }, [slots]);

  // --- Auto-scroll to the dose time nearest to now --------------------------
  const listRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<string | null>(null);
  const scrollToTime = useCallback((time: string) => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-time="${time}"]`);
    el?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, []);
  const nearestTime = useCallback(() => {
    let best: TimeGroup | undefined;
    const t = Date.now();
    for (const g of groups) {
      if (!best || Math.abs(g.dueAt - t) < Math.abs(best.dueAt - t)) best = g;
    }
    return best?.time;
  }, [groups]);

  useEffect(() => {
    if (!isToday || groups.length === 0 || scrolledFor.current === dateStr) return;
    scrolledFor.current = dateStr;
    const time = nearestTime();
    if (time) scrollToTime(time);
  }, [isToday, groups.length, dateStr, nearestTime, scrollToTime]);

  useEffect(() => {
    if (!isToday) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const time = nearestTime();
      if (time) scrollToTime(time);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [isToday, nearestTime, scrollToTime]);

  // --- "Unmarked meds" chip: due, open doses in a card off screen -----------
  const [offScreen, setOffScreen] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const root = listRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      setOffScreen((prev) => {
        const next = new Set(prev);
        for (const entry of entries) {
          const time = (entry.target as HTMLElement).dataset.time;
          if (!time) continue;
          if (entry.isIntersecting) next.delete(time);
          else next.add(time);
        }
        return next;
      });
    });
    root.querySelectorAll<HTMLElement>("[data-time]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // The "Moved to today" card is observed too, once it is on screen.
  }, [groups, carried?.length]);

  // Off-screen cards with due, open doses. "Rescheduled meds" when every
  // such dose waits for a rescheduled time.
  const dueOpen = (list: DoseSlot[]) => list.filter((s) => isOpenDoseStatus(s.status) && s.dueAt <= now);
  const offScreenDue = isToday
    ? [
        ...(carried && carried.length > 0 ? [{ time: CARRIED_TIME, slots: carried }] : []),
        ...groups,
      ].filter((g) => offScreen.has(g.time) && dueOpen(g.slots).length > 0)
    : [];
  const unmarkedOffScreen = offScreenDue[0];
  const chipLabel = offScreenDue.flatMap((g) => dueOpen(g.slots)).every(isRescheduledSlot)
    ? "Rescheduled meds"
    : "Unmarked meds";

  // --- Actions ---------------------------------------------------------------
  const handleTake = useCallback(
    (slot: DoseSlot) => void actions.take([slot], { single: true }),
    [actions],
  );
  const handleTakeLongPress = useCallback(
    (slot: DoseSlot) => void actions.take([slot], { single: true, ask: true }),
    [actions],
  );
  const handleOpenDose = useCallback((slot: DoseSlot) => setOpenDoseId(doseId(slot)), []);
  const handleMarkAllOpenChange = useCallback((open: boolean) => {
    if (!open) setMarkAllTime(null);
  }, []);
  const handleDoseOpenChange = useCallback((open: boolean) => {
    if (!open) setOpenDoseId(null);
  }, []);

  const markAllGroup = groups.find((g) => g.time === markAllTime);
  const openDose =
    slots?.find((s) => doseId(s) === openDoseId) ?? carried?.find((s) => doseId(s) === openDoseId) ?? null;
  // A later day's dose rescheduled to today (or earlier) is due today: it
  // can be taken or skipped now, like the service allows.
  const movedIn = (s: DoseSlot) =>
    s.existingLog?.status === "rescheduled" && s.remindAt !== undefined && toLocalDateKey(s.remindAt) <= todayKey;
  const openDoseDay: SlotDay = !openDose
    ? day
    : openDose.scheduledDate < todayKey
      ? "past"
      : openDose.scheduledDate > todayKey && !movedIn(openDose)
        ? "future"
        : "today";

  const carriedGroup = isToday && carried && carried.length > 0 && (
    <div
      data-testid="carried-over"
      data-time={CARRIED_TIME}
      className="scroll-mt-14 border border-line bg-panel shadow-[inset_3px_0_0_hsl(var(--meds))]"
    >
      <div className="flex min-h-11 items-center border-b border-line bg-chrome px-2.5">
        <h3 className="text-[0.9375rem] font-semibold">Moved to today</h3>
      </div>
      <div>
        {carried.map((slot) => (
          <DoseRow
            key={doseId(slot)}
            slot={slot}
            isFuture={false}
            origin={formatCarriedOverOrigin(slot)}
            onOpen={handleOpenDose}
            onTake={handleTake}
            onTakeLongPress={handleTakeLongPress}
          />
        ))}
      </div>
    </div>
  );

  const doseDialog = (
    <DoseDetailDialog
      open={!!openDose}
      onOpenChange={handleDoseOpenChange}
      slot={openDose}
      day={openDoseDay}
      now={now}
      actions={actions}
      {...(onOpenInfo && { onOpenInfo })}
    />
  );

  if (!slots || slots.length === 0) {
    return (
      <div className="space-y-3" ref={listRef}>
        {carriedGroup}
        <EmptySchedule onAddMed={onAddMed} isToday={isToday} />
        {doseDialog}
        {actions.sheets}
      </div>
    );
  }

  return (
    <div className="space-y-3" ref={listRef}>
      {isToday && (
        <DoseProgressSummary slots={slots} lowStockWarnings={lowStockWarnings} />
      )}

      {carriedGroup}

      {groups.map(({ time, slots: groupSlots }) => (
        <TimeSlotGroup
          key={time}
          time={time}
          slots={groupSlots}
          isToday={isToday}
          isFuture={day === "future"}
          now={now}
          onOpenDose={handleOpenDose}
          onTake={handleTake}
          onTakeLongPress={handleTakeLongPress}
          onMarkAll={setMarkAllTime}
        />
      ))}

      {unmarkedOffScreen && (
        <div className="pointer-events-none sticky bottom-20 z-10 flex justify-center">
          <button
            type="button"
            onClick={() => scrollToTime(unmarkedOffScreen.time)}
            className="pointer-events-auto rounded-full bg-meds px-4 py-2 text-[0.8125rem] font-semibold text-on-domain shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {chipLabel}
          </button>
        </div>
      )}
      {/* Room below the chip, so at the end of the list it sits under the
          last row instead of being lifted over it. */}
      {unmarkedOffScreen && <div aria-hidden="true" className="h-20" data-testid="unmarked-spacer" />}

      <MarkAllDosesSheet
        open={!!markAllGroup}
        onOpenChange={handleMarkAllOpenChange}
        time={markAllGroup?.time ?? ""}
        date={dateStr}
        day={day}
        slots={markAllGroup?.slots ?? []}
        now={now}
        actions={actions}
        onOpenDose={handleOpenDose}
      />

      {doseDialog}

      {actions.sheets}
    </div>
  );
}
