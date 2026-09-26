"use client";

import { useMemo, useState, useCallback } from "react";
import {
  useDailyDoseSchedule,
  useTakeDose,
  useSkipDose,
  useTakeAllDoses,
  useSkipAllDoses,
  useEditDoseTime,
  useRevertDoseActions,
} from "@/hooks/use-medication-queries";
import type { BulkDoseOutcome, DoseLog, DoseSlot, UntakeDoseInput } from "@/hooks/use-medication-queries";
import { useTodayKey } from "@/hooks/use-today-key";
import { hapticTake, hapticSkip, getCurrentTimeHHMM, formatTakeToastDescription } from "@/lib/medication-ui-utils";
import { toast } from "@intake/ui/use-toast";
import { showUndoToast } from "@/components/medications/undo-toast";
import { DoseProgressSummary } from "@/components/medications/dose-progress-summary";
import { TimeSlotGroup } from "@/components/medications/time-slot-group";
import { SkipReasonPicker } from "@/components/medications/skip-reason-picker";
import { EmptySchedule } from "@/components/medications/empty-schedule";
import { RetroactiveTimePicker } from "@/components/medications/retroactive-time-picker";
import { BulkDoseEditDialog } from "@/components/medications/bulk-dose-edit-dialog";
import { toLocalDateKey } from "@/lib/date-utils";

interface ScheduleViewProps {
  selectedDate: Date;
  onDoseClick: (slot: DoseSlot) => void;
  onAddMed: () => void;
}

function formatTime12(time24: string): string {
  const parts = time24.split(":").map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function untakeInputOf(slot: DoseSlot): UntakeDoseInput {
  return {
    prescriptionId: slot.prescriptionId,
    phaseId: slot.phaseId,
    scheduleId: slot.scheduleId,
    date: slot.scheduledDate,
    time: slot.localTime,
    dosageMg: slot.dosageMg,
  };
}

/** Bulk actions write each slot separately; name the ones that failed. */
function reportFailures(verb: string, failed: { entry: DoseSlot }[]) {
  if (failed.length === 0) return;
  toast({
    title: `Failed to ${verb} ${failed.length} dose(s)`,
    description: failed.map((f) => f.entry.prescription.genericName).join(", "),
    variant: "destructive",
  });
}

export function ScheduleView({ selectedDate, onDoseClick, onAddMed }: ScheduleViewProps) {
  const dateStr = toLocalDateKey(selectedDate);

  const slots = useDailyDoseSchedule(dateStr);

  const takeDoseMut = useTakeDose();
  const skipDoseMut = useSkipDose();
  const takeAllDosesMut = useTakeAllDoses<DoseSlot>();
  const skipAllDosesMut = useSkipAllDoses<DoseSlot>();
  const editDoseTimeMut = useEditDoseTime();
  const revertMut = useRevertDoseActions();

  // Skip reason picker state
  const [skipPickerOpen, setSkipPickerOpen] = useState(false);
  const [skipTarget, setSkipTarget] = useState<DoseSlot | null>(null);

  // Mark All time picker state (for late doses)
  const [markAllPickerOpen, setMarkAllPickerOpen] = useState(false);
  const [markAllTarget, setMarkAllTarget] = useState<{ time: string; slots: DoseSlot[] } | null>(null);

  // Skip All reason picker state
  const [skipAllPickerOpen, setSkipAllPickerOpen] = useState(false);
  const [skipAllTarget, setSkipAllTarget] = useState<{ time: string; slots: DoseSlot[] } | null>(null);

  // Bulk edit drawer state (for already-logged time slots)
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditTarget, setBulkEditTarget] = useState<{ time: string; slots: DoseSlot[] } | null>(null);

  // Compared by calendar-day key against a ticking "today", so the screen
  // agrees with itself across midnight.
  const todayKey = useTodayKey();
  const isToday = dateStr === todayKey;
  const isFuture = dateStr > todayKey;

  // Group slots by localTime
  const timeGroups = useMemo(() => {
    if (!slots) return [];
    const groups = new Map<string, DoseSlot[]>();
    for (const slot of slots) {
      const existing = groups.get(slot.localTime) || [];
      existing.push(slot);
      groups.set(slot.localTime, existing);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, groupSlots]) => ({ time, slots: groupSlots }));
  }, [slots]);

  // Determine next upcoming time slot
  const nextUpcomingTime = useMemo(() => {
    if (!isToday) return null;
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    for (const group of timeGroups) {
      const parts = group.time.split(":").map(Number);
      const h = parts[0] ?? 0;
      const m = parts[1] ?? 0;
      const schedMinutes = h * 60 + m;
      const hasPending = group.slots.some((s) => s.status === "pending");
      if (schedMinutes >= nowMinutes && hasPending) {
        return group.time;
      }
    }
    return null;
  }, [isToday, timeGroups]);

  // Low stock warnings
  const lowStockWarnings = useMemo(() => {
    if (!slots) return [];
    const names = new Set<string>();
    for (const slot of slots) {
      if (slot.inventoryWarning === "negative_stock") {
        names.add(slot.prescription.genericName);
      } else if (
        slot.inventory &&
        slot.inventory.currentStock != null &&
        slot.inventory.refillAlertPills != null &&
        slot.inventory.currentStock <= slot.inventory.refillAlertPills
      ) {
        names.add(slot.prescription.genericName);
      }
    }
    return Array.from(names);
  }, [slots]);

  // Undo is bound to the logs an action wrote: each is reverted only while it
  // is still exactly as the action left it (see useRevertDoseActions), so a
  // late Undo never discards a change made in between.
  const offerUndo = useCallback(
    (title: string, description: string | undefined, targets: { slot: DoseSlot; log: DoseLog }[]) => {
      if (targets.length === 0) return;
      showUndoToast({
        title,
        ...(description !== undefined && { description }),
        onUndo: async () => {
          try {
            const res = await revertMut.mutateAsync(
              targets.map(({ slot, log }) => ({ input: untakeInputOf(slot), log })),
            );
            if (res.stale > 0) {
              toast({
                title: `${res.stale} dose(s) not undone`,
                description: "Changed since -- edit it from the dose instead",
              });
            }
            if (res.failed > 0) {
              toast({ title: `Failed to undo ${res.failed} dose(s)`, variant: "destructive" });
            }
          } catch {
            toast({ title: "Failed to undo", variant: "destructive" });
          }
        },
      });
    },
    [revertMut],
  );

  const takeOne = useCallback(
    async (slot: DoseSlot, takenAtTime?: string) => {
      hapticTake();
      let log: DoseLog;
      try {
        log = await takeDoseMut.mutateAsync({
          prescriptionId: slot.prescriptionId,
          phaseId: slot.phaseId,
          scheduleId: slot.scheduleId,
          date: slot.scheduledDate,
          time: slot.localTime, // always use scheduled time as lookup key
          dosageMg: slot.dosageMg,
          // user-specified time stored in actionTimestamp
          ...(takenAtTime !== undefined && { takenAtTime }),
        });
      } catch {
        toast({ title: `Failed to log ${slot.prescription.genericName}`, variant: "destructive" });
        return;
      }

      const description = formatTakeToastDescription(slot);
      offerUndo(`${slot.prescription.genericName} taken`, description, [{ slot, log }]);
    },
    [takeDoseMut, offerUndo],
  );

  // Handle Take (today -- immediate)
  const handleTake = useCallback((slot: DoseSlot) => void takeOne(slot), [takeOne]);

  // Handle Take with user-specified time (late dose today or past date)
  const handleRetroactiveTake = useCallback(
    (slot: DoseSlot, takenAtTime: string) => void takeOne(slot, takenAtTime),
    [takeOne],
  );

  // Handle Skip - open picker
  const handleSkipStart = useCallback((slot: DoseSlot) => {
    setSkipTarget(slot);
    setSkipPickerOpen(true);
  }, []);

  // Handle skip reason selected
  const handleSkipReason = useCallback(
    async (reason: string) => {
      if (!skipTarget) return;
      const slot = skipTarget;
      setSkipTarget(null);
      hapticSkip();
      let log: DoseLog;
      try {
        log = await skipDoseMut.mutateAsync({
          prescriptionId: slot.prescriptionId,
          phaseId: slot.phaseId,
          scheduleId: slot.scheduleId,
          date: slot.scheduledDate,
          time: slot.localTime,
          dosageMg: slot.dosageMg,
          reason,
        });
      } catch {
        toast({ title: `Failed to skip ${slot.prescription.genericName}`, variant: "destructive" });
        return;
      }
      offerUndo(`${slot.prescription.genericName} skipped`, reason, [{ slot, log }]);
    },
    [skipTarget, skipDoseMut, offerUndo],
  );

  const executeMarkAll = useCallback(
    async (time: string, pendingSlots: DoseSlot[], takenAtTime?: string) => {
      hapticTake();
      let outcome: BulkDoseOutcome<DoseSlot>;
      try {
        outcome = await takeAllDosesMut.mutateAsync({
          entries: pendingSlots,
          date: dateStr,
          time,
          ...(takenAtTime ? { takenAtTime } : {}),
        });
      } catch {
        toast({ title: `Failed to log the ${formatTime12(time)} doses`, variant: "destructive" });
        return;
      }

      reportFailures("take", outcome.failed);
      offerUndo(
        outcome.failed.length > 0
          ? `${outcome.succeeded.length} of ${pendingSlots.length} ${formatTime12(time)} doses taken`
          : `All ${formatTime12(time)} doses taken`,
        undefined,
        outcome.succeeded.map(({ entry, log }) => ({ slot: entry, log })),
      );
    },
    [takeAllDosesMut, offerUndo, dateStr],
  );

  // Handle Mark All (take all at a time slot)
  const handleMarkAll = useCallback(
    (time: string, pendingSlots: DoseSlot[]) => {
      if (isToday) {
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const parts = time.split(":").map(Number);
        const schedMinutes = (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
        if (nowMinutes - schedMinutes > 30) {
          // Late — ask what time they took them
          setMarkAllTarget({ time, slots: pendingSlots });
          setMarkAllPickerOpen(true);
          return;
        }
      } else {
        // Past date — ask what time
        setMarkAllTarget({ time, slots: pendingSlots });
        setMarkAllPickerOpen(true);
        return;
      }
      // On time — take immediately
      void executeMarkAll(time, pendingSlots);
    },
    [isToday, executeMarkAll],
  );

  const handleMarkAllTimeConfirm = useCallback(
    (takenAtTime: string) => {
      if (markAllTarget) {
        void executeMarkAll(markAllTarget.time, markAllTarget.slots, takenAtTime);
        setMarkAllTarget(null);
      }
    },
    [markAllTarget, executeMarkAll],
  );

  // Skip All — only the group's pending/missed slots, and only once the user
  // picks a reason (the reason picker doubles as the confirmation step).
  const handleSkipAllStart = useCallback((time: string, openSlots: DoseSlot[]) => {
    setSkipAllTarget({ time, slots: openSlots });
    setSkipAllPickerOpen(true);
  }, []);

  const handleSkipAllReason = useCallback(
    async (reason: string) => {
      if (!skipAllTarget) return;
      const { time, slots: targetSlots } = skipAllTarget;
      setSkipAllTarget(null);
      hapticSkip();
      let outcome: BulkDoseOutcome<DoseSlot>;
      try {
        outcome = await skipAllDosesMut.mutateAsync({ entries: targetSlots, date: dateStr, time, reason });
      } catch {
        toast({ title: `Failed to skip the ${formatTime12(time)} doses`, variant: "destructive" });
        return;
      }

      reportFailures("skip", outcome.failed);
      offerUndo(
        outcome.failed.length > 0
          ? `${outcome.succeeded.length} of ${targetSlots.length} ${formatTime12(time)} doses skipped`
          : `All ${formatTime12(time)} doses skipped`,
        reason,
        outcome.succeeded.map(({ entry, log }) => ({ slot: entry, log })),
      );
    },
    [skipAllTarget, skipAllDosesMut, offerUndo, dateStr],
  );

  // Handle editing the recorded time of a single taken dose
  const handleEditTime = useCallback(
    async (slot: DoseSlot, takenAtTime: string) => {
      hapticTake();
      try {
        await editDoseTimeMut.mutateAsync({
          prescriptionId: slot.prescriptionId,
          phaseId: slot.phaseId,
          scheduleId: slot.scheduleId,
          date: slot.scheduledDate,
          time: slot.localTime,
          newTime: takenAtTime,
        });
      } catch {
        toast({ title: `Failed to update ${slot.prescription.genericName}`, variant: "destructive" });
        return;
      }
      toast({ title: `${slot.prescription.genericName} time updated` });
    },
    [editDoseTimeMut],
  );

  // Handle Edit All — open the bulk edit drawer for a logged time slot
  const handleEditAll = useCallback((time: string, groupSlots: DoseSlot[]) => {
    setBulkEditTarget({ time, slots: groupSlots });
    setBulkEditOpen(true);
  }, []);

  if (!slots || slots.length === 0) {
    return <EmptySchedule onAddMed={onAddMed} />;
  }

  return (
    <div className="space-y-4 pb-24 px-1">
      {isToday && (
        <DoseProgressSummary slots={slots} lowStockWarnings={lowStockWarnings} />
      )}

      {timeGroups.map(({ time, slots: groupSlots }) => (
        <TimeSlotGroup
          key={time}
          time={time}
          slots={groupSlots}
          isToday={isToday}
          isFuture={isFuture}
          isNextUpcoming={time === nextUpcomingTime}
          onTake={handleTake}
          onRetroactiveTake={handleRetroactiveTake}
          onSkip={handleSkipStart}
          onDoseClick={onDoseClick}
          onMarkAll={handleMarkAll}
          onSkipAll={handleSkipAllStart}
          onEditAll={handleEditAll}
          onEditTime={handleEditTime}
        />
      ))}

      <SkipReasonPicker
        open={skipPickerOpen}
        onOpenChange={setSkipPickerOpen}
        onSelect={handleSkipReason}
        suggestRanOut={
          skipTarget?.inventoryWarning === "negative_stock" ||
          skipTarget?.inventoryWarning === "no_inventory"
        }
      />

      <SkipReasonPicker
        open={skipAllPickerOpen}
        onOpenChange={setSkipAllPickerOpen}
        onSelect={handleSkipAllReason}
        suggestRanOut={!!skipAllTarget?.slots.some(
          (s) => s.inventoryWarning === "negative_stock" || s.inventoryWarning === "no_inventory",
        )}
      />

      {/* Late today defaults to now; a past-date back-fill defaults to the
          group's scheduled time rather than today's clock. */}
      <RetroactiveTimePicker
        open={markAllPickerOpen}
        onOpenChange={setMarkAllPickerOpen}
        defaultTime={isToday || !markAllTarget ? getCurrentTimeHHMM() : markAllTarget.time}
        compoundName="all doses"
        onConfirm={handleMarkAllTimeConfirm}
        notAfterNow={isToday}
      />

      <BulkDoseEditDialog
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        time={bulkEditTarget?.time ?? ""}
        slots={bulkEditTarget?.slots ?? []}
        date={dateStr}
      />
    </div>
  );
}
