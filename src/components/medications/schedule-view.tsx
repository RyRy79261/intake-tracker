"use client";

import { useMemo, useEffect, useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { useDailyDoseSchedule, useTakeDose, useUntakeDose, useSkipDose, useTakeAllDoses } from "@/hooks/use-medication-queries";
import type { DoseSlot } from "@/hooks/use-medication-queries";
import { hapticTake, hapticSkip } from "@/lib/medication-ui-utils";
import { showUndoToast } from "./undo-toast";
import { DoseProgressSummary } from "./dose-progress-summary";
import { TimeSlotGroup } from "./time-slot-group";
import { SkipReasonPicker } from "./skip-reason-picker";
import { EmptySchedule } from "./empty-schedule";

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

export function ScheduleView({ selectedDate, onDoseClick, onAddMed }: ScheduleViewProps) {
  const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;

  const slots = useDailyDoseSchedule(dateStr);

  const takeDoseMut = useTakeDose();
  const untakeDoseMut = useUntakeDose();
  const skipDoseMut = useSkipDose();
  const takeAllDosesMut = useTakeAllDoses();

  // Skip reason picker state
  const [skipPickerOpen, setSkipPickerOpen] = useState(false);
  const [skipTarget, setSkipTarget] = useState<DoseSlot | null>(null);

  const isToday = selectedDate.toDateString() === new Date().toDateString();

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

  // Auto-scroll to next upcoming time slot on mount
  useEffect(() => {
    if (isToday && nextUpcomingTime) {
      const el = document.getElementById(`time-slot-${nextUpcomingTime}`);
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      }
    }
  }, [isToday, nextUpcomingTime]);

  // Handle Take
  const handleTake = useCallback(
    async (slot: DoseSlot) => {
      hapticTake();
      await takeDoseMut.mutateAsync({
        prescriptionId: slot.prescriptionId,
        phaseId: slot.phaseId,
        scheduleId: slot.scheduleId,
        date: slot.scheduledDate,
        time: slot.localTime,
        dosageMg: slot.dosageMg,
      });

      const description = slot.inventory
        ? `${slot.pillsPerDose ?? 1} pill(s) deducted`
        : "Dose logged -- no stock tracked";

      showUndoToast({
        title: `${slot.prescription.genericName} taken`,
        description,
        onUndo: () => {
          untakeDoseMut.mutateAsync({
            prescriptionId: slot.prescriptionId,
            phaseId: slot.phaseId,
            scheduleId: slot.scheduleId,
            date: slot.scheduledDate,
            time: slot.localTime,
            dosageMg: slot.dosageMg,
          });
        },
      });
    },
    [takeDoseMut, untakeDoseMut],
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
      hapticSkip();
      await skipDoseMut.mutateAsync({
        prescriptionId: skipTarget.prescriptionId,
        phaseId: skipTarget.phaseId,
        scheduleId: skipTarget.scheduleId,
        date: skipTarget.scheduledDate,
        time: skipTarget.localTime,
        dosageMg: skipTarget.dosageMg,
        reason,
      });
      setSkipTarget(null);
    },
    [skipTarget, skipDoseMut],
  );

  // Handle Mark All (take all at a time slot)
  const handleMarkAll = useCallback(
    async (time: string, pendingSlots: DoseSlot[]) => {
      hapticTake();
      await takeAllDosesMut.mutateAsync({
        entries: pendingSlots.map((s) => ({
          prescriptionId: s.prescriptionId,
          phaseId: s.phaseId,
          scheduleId: s.scheduleId,
          dosageMg: s.dosageMg,
        })),
        date: dateStr,
        time,
      });

      showUndoToast({
        title: `All ${formatTime12(time)} doses taken`,
        onUndo: () => {
          for (const s of pendingSlots) {
            untakeDoseMut.mutateAsync({
              prescriptionId: s.prescriptionId,
              phaseId: s.phaseId,
              scheduleId: s.scheduleId,
              date: s.scheduledDate,
              time: s.localTime,
              dosageMg: s.dosageMg,
            });
          }
        },
      });
    },
    [takeAllDosesMut, untakeDoseMut, dateStr],
  );

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
          isNextUpcoming={time === nextUpcomingTime}
          onTake={handleTake}
          onSkip={handleSkipStart}
          onDoseClick={onDoseClick}
          onMarkAll={handleMarkAll}
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

      <button
        onClick={onAddMed}
        className="fixed bottom-20 right-4 z-30 w-14 h-14 rounded-full bg-teal-600 hover:bg-teal-700 text-white shadow-lg flex items-center justify-center transition-colors active:scale-95"
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  );
}
