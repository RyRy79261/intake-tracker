"use client";

import { useEffect, useState } from "react";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@intake/ui/drawer";
import { Button } from "@intake/ui/button";
import { Check, RotateCcw, X } from "lucide-react";
import { DoseRow } from "@/components/medications/dose-row";
import { needsTakenTimePrompt, slotActions, isOpenDoseStatus, type SlotDay } from "@intake/core/dose-rules";
import { formatDoseDate, formatDoseTime, medsCount } from "@/lib/medication-ui-utils";
import { useSettingsStore } from "@/stores/settings-store";
import { SAVE_FAILED, type DoseActionOutcome, type DoseActions } from "@/components/medications/use-dose-actions";
import type { DoseSlot } from "@/hooks/use-medication-queries";

interface MarkAllDosesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The slot time ("08:30"): the title. */
  time: string;
  date: string;
  day: SlotDay;
  /** The slot's doses, live. */
  slots: DoseSlot[];
  now: number;
  actions: DoseActions;
  onOpenDose: (slot: DoseSlot) => void;
}

/** How long the result shows before the modal closes. */
const RESULT_MS = 1000;

/**
 * "Mark all doses" for one dose time: the slot's doses and the bulk
 * actions Skip all, Take all and Untake all (Unskip all in place of Skip all
 * once every dose is marked). A bulk action changes only the doses with no
 * user action yet; a taken or skipped dose is changed from its own dialog.
 * After an action the result shows for a second, then the modal closes and
 * the Today screen offers Undo.
 */
export function MarkAllDosesSheet({
  open,
  onOpenChange,
  time,
  date,
  day,
  slots,
  now,
  actions,
  onOpenDose,
}: MarkAllDosesSheetProps) {
  const lateWindow = useSettingsStore((s) => s.lateWindowMinutes);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setResult(null);
      setError(null);
      setBusy(false);
    }
  }

  // Close a second after the result, once no sheet (the skip reason) is
  // open over the modal: drawers close in the order they opened.
  const sheetOpen = actions.sheetOpen;
  useEffect(() => {
    if (!result || sheetOpen) return;
    const id = setTimeout(() => onOpenChange(false), RESULT_MS);
    return () => clearTimeout(id);
  }, [result, sheetOpen, onOpenChange]);

  const buttons = slotActions(slots, day);
  const late =
    day !== "future" &&
    slots.some((s) => isOpenDoseStatus(s.status) && needsTakenTimePrompt(s.dueAt, now, lateWindow));

  const run = async (action: () => Promise<DoseActionOutcome>) => {
    setBusy(true);
    setError(null);
    const outcome = await action();
    setBusy(false);
    if (outcome === "cancelled") return;
    if (outcome === "failed") {
      setError(SAVE_FAILED);
      return;
    }
    setResult(`${medsCount(outcome.changed)} ${outcome.verb}`);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        data-domain="meds"
        data-testid="mark-all-doses"
        // Full height on a phone; a centred panel of normal width on a wide screen.
        className="h-[92dvh] bg-panel md:mx-auto md:h-auto md:max-h-[85dvh] md:w-full md:max-w-lg"
        {...(day === "today" && { "aria-describedby": undefined })}
      >
        <div className="relative flex min-h-0 flex-1 flex-col px-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-3">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <DrawerTitle className="font-mono text-lg font-semibold">{formatDoseTime(time)}</DrawerTitle>
              {day !== "today" && (
                <DrawerDescription className="text-[0.8125rem] text-muted-foreground">
                  {formatDoseDate(date)}
                </DrawerDescription>
              )}
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="-mr-2 flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {late && (
            <p className="mb-2 border-l-2 border-sodium pl-2 text-[0.8125rem] text-sodium" data-testid="late-warning">
              You have not marked these doses. Consider if it is safe to take them now.
            </p>
          )}

          <div className="mb-3 min-h-0 overflow-y-auto border border-line bg-background max-md:flex-1">
            {slots.map((slot) => (
              <DoseRow key={slot.scheduleId} slot={slot} isFuture={day === "future"} onOpen={onOpenDose} />
            ))}
          </div>

          {error && (
            <p role="alert" className="mb-2 text-[0.8125rem] text-bp">
              {error}
            </p>
          )}

          {buttons.untakeAll === "secondary" && (
            <Button
              variant="ghost"
              className="mb-1 h-9 self-center text-bp"
              disabled={busy}
              onClick={() => run(() => actions.untake(slots))}
            >
              Untake all
            </Button>
          )}

          <div className="grid grid-cols-[repeat(auto-fit,minmax(96px,1fr))] gap-2">
            {buttons.skipAll && (
              <Button variant="outline" disabled={busy} onClick={() => run(() => actions.skip(slots))}>
                <X aria-hidden="true" />
                Skip all
              </Button>
            )}
            {buttons.unskipAll && (
              <Button variant="outline" disabled={busy} onClick={() => run(() => actions.unskip(slots))}>
                <RotateCcw aria-hidden="true" />
                Unskip all
              </Button>
            )}
            {buttons.takeAll && (
              <Button disabled={busy} onClick={() => run(() => actions.take(slots))}>
                <Check aria-hidden="true" />
                Take all
              </Button>
            )}
            {buttons.untakeAll === "primary" && (
              <Button
                variant="outline"
                className="border-bp text-bp hover:text-bp"
                disabled={busy}
                onClick={() => run(() => actions.untake(slots))}
              >
                <RotateCcw aria-hidden="true" />
                Untake all
              </Button>
            )}
          </div>
          {day === "future" && (
            <p className="text-center text-[0.8125rem] text-muted-foreground">
              These doses are not due yet.
            </p>
          )}

          {result && (
            <div
              role="status"
              className="absolute inset-0 flex items-center justify-center bg-panel/90 text-lg font-semibold text-meds"
            >
              {result}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
