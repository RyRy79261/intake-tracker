"use client";

import { useCallback, useState, type ReactNode } from "react";
import {
  DoseRuleError,
  useCancelReschedule,
  useEditDoseTime,
  useRescheduleDoses,
  useRevertDoseChanges,
  useSetSkipReason,
  useSkipDoses,
  useTakeDoses,
  useUnskipDoses,
  useUntakeDoses,
  type DoseChange,
  type DoseKey,
  type DoseSlot,
} from "@/hooks/use-medication-queries";
import { bulkDoseTargets, isOpenDoseStatus, needsTakenTimePrompt } from "@intake/core/dose-rules";
import { useSettingsStore } from "@/stores/settings-store";
import { toLocalDateKey } from "@/lib/date-utils";
import { toast } from "@intake/ui/use-toast";
import { showUndoToast } from "@/components/medications/undo-toast";
import { SkipReasonPicker } from "@/components/medications/skip-reason-picker";
import { TakenTimeSheet, type TakenTimeChoice } from "@/components/medications/taken-time-sheet";
import { RescheduleSheet } from "@/components/medications/reschedule-sheet";
import {
  doseDisplayName,
  formatRescheduleTime,
  formatTakeToastDescription,
  hapticSkip,
  hapticTake,
  medsCount,
} from "@/lib/medication-ui-utils";

/**
 * How a dose action ended: how many doses changed and how ("taken", or
 * "skipped" when the time sheet's Skip was picked). "cancelled": the user
 * closed a sheet, nothing was written.
 */
export type DoseActionOutcome = { changed: number; verb: string } | "cancelled" | "failed";

export const SAVE_FAILED = "Could not save. No dose changed.";

/** A slot as the services key it, with the slot kept for labels. */
type SlotKey = DoseKey & { slot: DoseSlot };

function keyOf(slot: DoseSlot): SlotKey {
  return {
    prescriptionId: slot.prescriptionId,
    phaseId: slot.phaseId,
    scheduleId: slot.scheduleId,
    date: slot.scheduledDate,
    time: slot.localTime,
    dosageMg: slot.dosageMg,
    slot,
  };
}

interface TakeOptions {
  /** One dose the user tapped: a skipped dose is taken too. */
  single?: boolean;
  /** Always ask for the time (a long press of Take). */
  ask?: boolean;
}

interface ReschedulePrompt {
  slots: DoseSlot[];
  future: boolean;
  resolve: (remindAt: number | null) => void;
}

interface Prompt {
  title: string;
  dueAt: number;
  retime: boolean;
  initialAt?: number;
  resolve: (choice: TakenTimeChoice | null) => void;
}

/**
 * The dose actions of the Today screen, shared by the rows, the "Mark all
 * doses" modal and the dose dialog: take (with the late-window rule and the
 * time-taken sheet), skip (then the reason sheet), untake, unskip and change
 * time. Each write is one atomic synced write and offers Undo, which puts
 * every changed dose back exactly as it was. Render `sheets` once.
 */
export function useDoseActions() {
  const lateWindow = useSettingsStore((s) => s.lateWindowMinutes);
  const askSkipReason = useSettingsStore((s) => s.askSkipReason);

  const takeMut = useTakeDoses<SlotKey>();
  const skipMut = useSkipDoses<SlotKey>();
  const untakeMut = useUntakeDoses<SlotKey>();
  const unskipMut = useUnskipDoses<SlotKey>();
  const reasonMut = useSetSkipReason();
  const revertMut = useRevertDoseChanges();
  const editTimeMut = useEditDoseTime();
  const rescheduleMut = useRescheduleDoses<SlotKey>();
  const cancelRescheduleMut = useCancelReschedule();

  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [moving, setMoving] = useState<ReschedulePrompt | null>(null);
  const [reasonFor, setReasonFor] = useState<{ logIds: string[]; ranOut: boolean } | null>(null);

  const ask = useCallback(
    (p: Omit<Prompt, "resolve">) =>
      new Promise<TakenTimeChoice | null>((resolve) => setPrompt({ ...p, resolve })),
    [],
  );

  const offerUndo = useCallback(
    (title: string, description: string | undefined, changes: DoseChange<SlotKey>[]) => {
      if (changes.length === 0) return;
      showUndoToast({
        title,
        ...(description !== undefined && { description }),
        onUndo: async () => {
          try {
            const res = await revertMut.mutateAsync(changes);
            if (res.stale > 0) {
              toast({
                title: `${medsCount(res.stale)} not undone`,
                description: "They changed since. Change them from the dose instead.",
              });
            }
          } catch {
            toast({ title: "Could not undo", variant: "destructive" });
          }
        },
      });
    },
    [revertMut],
  );

  const failed = useCallback((): DoseActionOutcome => {
    toast({ title: SAVE_FAILED, variant: "destructive" });
    return "failed";
  }, []);

  const label = (slots: DoseSlot[], changes: DoseChange<SlotKey>[], verb: string) =>
    slots.length === 1 && changes.length === 1
      ? `${doseDisplayName(changes[0]!.key.slot)} ${verb}`
      : `${medsCount(changes.length)} ${verb}`;

  const skip = useCallback(
    async (slots: DoseSlot[], opts: { single?: boolean } = {}): Promise<DoseActionOutcome> => {
      const targets = opts.single ? slots : bulkDoseTargets(slots, "skip");
      if (targets.length === 0) return { changed: 0, verb: "skipped" };
      hapticSkip();
      let changes: DoseChange<SlotKey>[];
      try {
        // The skip is written first; the reason sheet may then be dismissed.
        changes = await skipMut.mutateAsync({ entries: targets.map(keyOf), onlyOpen: !opts.single });
      } catch {
        return failed();
      }
      offerUndo(label(targets, changes, "skipped"), undefined, changes);
      if (askSkipReason && changes.length > 0) {
        setReasonFor({
          logIds: changes.map((c) => c.after.id),
          ranOut: targets.some(
            (s) => s.inventoryWarning === "negative_stock" || s.inventoryWarning === "no_inventory",
          ),
        });
      }
      return { changed: changes.length, verb: "skipped" };
    },
    [skipMut, offerUndo, askSkipReason, failed],
  );

  const take = useCallback(
    async (slots: DoseSlot[], opts: TakeOptions = {}): Promise<DoseActionOutcome> => {
      const targets = opts.single ? slots : bulkDoseTargets(slots, "take");
      if (targets.length === 0) return { changed: 0, verb: "taken" };

      const now = Date.now();
      let takenAt: number | undefined;
      if (opts.ask || targets.some((t) => needsTakenTimePrompt(t.dueAt, now, lateWindow))) {
        const choice = await ask({
          title:
            targets.length === 1
              ? `When did you take ${doseDisplayName(targets[0]!)}?`
              : "When did you take your meds?",
          dueAt: Math.min(...targets.map((t) => t.dueAt)),
          retime: false,
        });
        if (!choice) return "cancelled";
        if (choice.kind === "skip") {
          // Only open doses are skipped: a dose that is already skipped keeps
          // its reason and its time.
          const open = targets.filter((t) => isOpenDoseStatus(t.status));
          if (open.length === 0) return { changed: 0, verb: "skipped" };
          return skip(open, opts.single ? { single: true } : {});
        }
        if (choice.kind === "at") takenAt = choice.at;
      }

      hapticTake();
      let changes: DoseChange<SlotKey>[];
      try {
        changes = await takeMut.mutateAsync({
          entries: targets.map(keyOf),
          ...(takenAt !== undefined && { takenAt }),
          onlyOpen: !opts.single,
        });
      } catch {
        return failed();
      }
      const description =
        targets.length === 1 && changes.length === 1 ? formatTakeToastDescription(targets[0]!) : undefined;
      offerUndo(label(targets, changes, "taken"), description, changes);
      return { changed: changes.length, verb: "taken" };
    },
    [takeMut, offerUndo, lateWindow, ask, skip, failed],
  );

  const untake = useCallback(
    async (slots: DoseSlot[]): Promise<DoseActionOutcome> => {
      const targets = bulkDoseTargets(slots, "untake");
      if (targets.length === 0) return { changed: 0, verb: "untaken" };
      hapticSkip();
      let changes: DoseChange<SlotKey>[];
      try {
        changes = await untakeMut.mutateAsync(targets.map(keyOf));
      } catch {
        return failed();
      }
      offerUndo(label(targets, changes, "untaken"), "The pills are back in stock.", changes);
      return { changed: changes.length, verb: "untaken" };
    },
    [untakeMut, offerUndo, failed],
  );

  const unskip = useCallback(
    async (slots: DoseSlot[]): Promise<DoseActionOutcome> => {
      const targets = bulkDoseTargets(slots, "unskip");
      if (targets.length === 0) return { changed: 0, verb: "unskipped" };
      let changes: DoseChange<SlotKey>[];
      try {
        changes = await unskipMut.mutateAsync(targets.map(keyOf));
      } catch {
        return failed();
      }
      offerUndo(label(targets, changes, "unskipped"), undefined, changes);
      return { changed: changes.length, verb: "unskipped" };
    },
    [unskipMut, offerUndo, failed],
  );

  /** "Change time": rewrite when a taken dose was taken. */
  const changeTime = useCallback(
    async (slot: DoseSlot): Promise<DoseActionOutcome> => {
      const choice = await ask({
        title: `When did you take ${doseDisplayName(slot)}?`,
        dueAt: slot.dueAt,
        retime: true,
        ...(slot.existingLog?.actionTimestamp !== undefined && { initialAt: slot.existingLog.actionTimestamp }),
      });
      if (!choice || choice.kind === "skip") return "cancelled";
      try {
        await editTimeMut.mutateAsync({
          prescriptionId: slot.prescriptionId,
          phaseId: slot.phaseId,
          scheduleId: slot.scheduleId,
          date: slot.scheduledDate,
          time: slot.localTime,
          takenAt: choice.kind === "at" ? choice.at : Date.now(),
        });
      } catch {
        return failed();
      }
      toast({ title: `${doseDisplayName(slot)} time changed` });
      return { changed: 1, verb: "changed" };
    },
    [ask, editTimeMut, failed],
  );

  /**
   * Reschedule: pick a new date and time, then move every open dose to it
   * (one dose from its dialog: a skipped dose too). The doses stay under
   * their original time; Undo puts back the previous reminder exactly.
   */
  const reschedule = useCallback(
    async (slots: DoseSlot[], opts: { single?: boolean } = {}): Promise<DoseActionOutcome> => {
      const targets = opts.single ? slots.filter((s) => s.status !== "taken") : bulkDoseTargets(slots, "reschedule");
      if (targets.length === 0) return { changed: 0, verb: "rescheduled" };
      const today = toLocalDateKey();
      const remindAt = await new Promise<number | null>((resolve) =>
        setMoving({ slots: targets, future: targets.every((t) => t.scheduledDate > today), resolve }),
      );
      if (remindAt === null) return "cancelled";
      let changes: DoseChange<SlotKey>[];
      try {
        ({ changes } = await rescheduleMut.mutateAsync({
          entries: targets.map(keyOf),
          remindAt,
          onlyOpen: !opts.single,
        }));
      } catch (e) {
        // unwrap folds the cause into the message; show only a rule's own text.
        const cause = e instanceof Error ? e.cause : undefined;
        toast({ title: cause instanceof DoseRuleError ? cause.message : SAVE_FAILED, variant: "destructive" });
        return "failed";
      }
      const when = formatRescheduleTime(remindAt, targets[0]!.scheduledDate);
      const verb = `rescheduled for ${when}`;
      offerUndo(label(targets, changes, verb), undefined, changes);
      return { changed: changes.length, verb };
    },
    [rescheduleMut, offerUndo],
  );

  /** "Cancel reschedule": the dose is due at its original time again. */
  const cancelReschedule = useCallback(
    async (slot: DoseSlot): Promise<DoseActionOutcome> => {
      const key = keyOf(slot);
      let change: DoseChange | null;
      try {
        change = await cancelRescheduleMut.mutateAsync(key);
      } catch {
        return failed();
      }
      if (!change) return { changed: 0, verb: "unchanged" };
      offerUndo(`${doseDisplayName(slot)} reschedule cancelled`, undefined, [{ ...change, key }]);
      return { changed: 1, verb: "reschedule cancelled" };
    },
    [cancelRescheduleMut, offerUndo, failed],
  );

  const closePrompt = (choice: TakenTimeChoice | null) => {
    prompt?.resolve(choice);
    setPrompt(null);
  };

  const sheets: ReactNode = (
    <>
      <TakenTimeSheet
        open={prompt !== null}
        title={prompt?.title ?? ""}
        dueAt={prompt?.dueAt ?? 0}
        retime={prompt?.retime ?? false}
        {...(prompt?.initialAt !== undefined && { initialAt: prompt.initialAt })}
        onCancel={() => closePrompt(null)}
        onChoose={(choice) => closePrompt(choice)}
      />
      <RescheduleSheet
        open={moving !== null}
        slots={moving?.slots ?? []}
        future={moving?.future ?? false}
        onCancel={() => {
          moving?.resolve(null);
          setMoving(null);
        }}
        onConfirm={(at) => {
          moving?.resolve(at);
          setMoving(null);
        }}
      />
      <SkipReasonPicker
        open={reasonFor !== null}
        onOpenChange={(open) => !open && setReasonFor(null)}
        suggestRanOut={reasonFor?.ranOut ?? false}
        onSelect={(reason) => {
          const ids = reasonFor?.logIds ?? [];
          reasonMut.mutate({ logIds: ids, reason }, {
            onError: () => toast({ title: "Could not save the reason", variant: "destructive" }),
          });
        }}
      />
    </>
  );

  /** A time or reason sheet is open over the screen. */
  const sheetOpen = prompt !== null || reasonFor !== null || moving !== null;

  return { take, skip, untake, unskip, changeTime, reschedule, cancelReschedule, sheets, sheetOpen };
}

export type DoseActions = ReturnType<typeof useDoseActions>;
