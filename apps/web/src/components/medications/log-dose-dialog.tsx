"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@intake/ui/dialog";
import { Button } from "@intake/ui/button";
import { toast } from "@intake/ui/use-toast";
import { useNowTick } from "@intake/ui/use-now-tick";
import {
  useAllActiveInventoryItems,
  useDailyDoseSchedule,
  useLogPrnDose,
  usePrescriptions,
  useUndoPrnDose,
} from "@/hooks/use-medication-queries";
import { useTodayKey } from "@/hooks/use-today-key";
import {
  describeBrandDose,
  formatPillCount,
  getCurrentTimeHHMM,
  hapticTake,
} from "@/lib/medication-ui-utils";
import { showUndoToast } from "@/components/medications/undo-toast";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const fieldClass =
  "h-10 w-full rounded-none border border-input bg-background px-2.5 text-[0.9375rem] text-foreground " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

interface LogDoseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Log a dose" from the Medications window's "+" button. Extra dose only for
 * now: another dose of an active prescription, taken from the stock of its
 * active brand. It writes a kind='prn' dose log through `logPrnDose`, the
 * path the Rx tab's as-needed button uses, so no schema change. The pill
 * maths line shows what the dose is in tablets and what stock is left.
 * (One-off medicines need their own table; see the build plan, PR 9.)
 */
export function LogDoseDialog({ open, onOpenChange }: LogDoseDialogProps) {
  const todayKey = useTodayKey();
  const prescriptions = usePrescriptions();
  const brands = useAllActiveInventoryItems();
  const todaySlots = useDailyDoseSchedule(todayKey);
  const logPrn = useLogPrnDose();
  const undoPrn = useUndoPrnDose();

  const pool = useMemo(
    () =>
      prescriptions
        .filter((p) => p.isActive)
        .sort((a, b) => a.genericName.localeCompare(b.genericName)),
    [prescriptions],
  );

  const [rxId, setRxId] = useState("");
  const [dose, setDose] = useState("");
  const [date, setDate] = useState(todayKey);
  const [time, setTime] = useState(getCurrentTimeHHMM());
  const [note, setNote] = useState("");
  const [wasOpen, setWasOpen] = useState(false);
  const [seeded, setSeeded] = useState(false);

  /** Today's scheduled dose for the prescription, else one tablet of its brand. */
  const presetDose = (id: string): string => {
    const slot = todaySlots?.find((s) => s.prescriptionId === id);
    if (slot) return String(slot.dosageMg);
    const brand = brands.find((b) => b.prescriptionId === id);
    return brand && brand.strength > 0 ? String(brand.strength) : "";
  };

  // Reset on the closed -> open transition only, so a re-render never
  // clobbers what the user typed.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDate(todayKey);
      setTime(getCurrentTimeHHMM());
      setNote("");
      setSeeded(false);
    }
  }
  // Pick the first prescription once the lists have loaded.
  if (open && !seeded && pool.length > 0 && todaySlots !== undefined) {
    const first = pool.find((p) => p.id === rxId) ?? pool[0]!;
    setSeeded(true);
    setRxId(first.id);
    setDose(presetDose(first.id));
  }

  useNowTick(30_000);
  const maxTime = getCurrentTimeHHMM();

  const rx = pool.find((p) => p.id === rxId);
  const brand = rx ? brands.find((b) => b.prescriptionId === rx.id) : undefined;
  const unit =
    brand?.unit || todaySlots?.find((s) => s.prescriptionId === rx?.id)?.unit || "mg";
  const doseNum = dose.trim() === "" ? NaN : Number(dose);
  const doseValid = Number.isFinite(doseNum) && doseNum > 0;
  const timeWellFormed = HHMM.test(time);
  const dateValid = YMD.test(date) && date <= todayKey;
  // Only a dose dated today is capped at now: last night's dose, logged just
  // after midnight, is dated the day before and may be any time.
  const timeValid = timeWellFormed && (date !== todayKey || time <= maxTime);
  const { label, pills } = describeBrandDose(doseNum, unit, brand);

  let maths: ReactNode;
  if (!brand) {
    maths = (
      <>
        <b>No active brand</b> · this dose is logged but no stock is deducted.
      </>
    );
  } else if (!doseValid) {
    maths = "Enter a dose to see how many pills that is.";
  } else if (pills === undefined) {
    maths = (
      <>
        <b>Tablet strength missing</b> · this dose is logged but no stock is deducted.
      </>
    );
  } else {
    const left = Math.round(((brand.currentStock ?? 0) - pills) * 10000) / 10000;
    maths = (
      <>
        = <b>{label}</b>
        <br />
        Deducts {formatPillCount(pills, "pill")} from {brand.brandName} ·{" "}
        {formatPillCount(left, "pill")} left after
      </>
    );
  }

  const canSave = !!rx && doseValid && dateValid && timeValid && !logPrn.isPending;

  const save = async () => {
    if (!rx || !canSave) return;
    hapticTake();
    const trimmed = note.trim();
    let logId: string;
    try {
      const log = await logPrn.mutateAsync({
        prescriptionId: rx.id,
        date,
        time,
        doseMg: doseNum,
        dosageMg: doseNum,
        ...(trimmed !== "" && { note: trimmed }),
      });
      logId = log.id;
    } catch {
      toast({ title: "Failed to log dose", variant: "destructive" });
      return;
    }
    onOpenChange(false);
    showUndoToast({
      title: `${rx.genericName} extra dose logged`,
      description:
        brand && pills !== undefined
          ? `${formatPillCount(pills)} deducted`
          : "Dose logged -- no stock tracked",
      // mutateAsync, not mutate's per-call onError: the toast outlives this
      // dialog (switching tabs unmounts it), and React Query drops per-call
      // callbacks once their component has gone.
      onUndo: () =>
        void undoPrn
          .mutateAsync(logId)
          .catch(() => toast({ title: "Failed to undo", variant: "destructive" })),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[calc(100dvh-24px)] w-[calc(100%-24px)] max-w-[460px] flex-col gap-0 border-line bg-panel p-0 shadow-[inset_0_3px_0_hsl(var(--meds))]"
      >
        <div className="flex-none px-4 pb-2.5 pr-12 pt-3.5">
          <DialogTitle className="text-base font-semibold leading-snug">Log a dose</DialogTitle>
          <DialogDescription className="mt-1 text-[0.8125rem] leading-normal">
            Recorded under Other doses on the day it was taken.
          </DialogDescription>
        </div>

        <form
          id="log-dose-form"
          className="flex min-h-0 flex-col gap-3 overflow-auto px-4 pb-3.5 pt-0.5 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <p className="text-[0.8125rem] text-muted-foreground">
            <b className="font-semibold text-foreground">Extra dose.</b> Another dose of one of your
            prescriptions. It is taken from the stock of its active brand.
          </p>

          {pool.length === 0 ? (
            <p className="text-[0.8125rem] text-muted-foreground">
              You have no active prescriptions. Add one on the Rx tab first.
            </p>
          ) : (
            <>
              <div>
                <label htmlFor="ld-rx" className="mb-1 block text-[0.8125rem] text-muted-foreground">
                  Prescription
                </label>
                <select
                  id="ld-rx"
                  className={fieldClass}
                  value={rxId}
                  onChange={(e) => {
                    setRxId(e.target.value);
                    setDose(presetDose(e.target.value));
                  }}
                >
                  {pool.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.genericName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="ld-dose" className="mb-1 block text-[0.8125rem] text-muted-foreground">
                  Dose
                </label>
                <div className="relative">
                  <input
                    id="ld-dose"
                    className={`${fieldClass} pr-12 font-mono`}
                    inputMode="decimal"
                    value={dose}
                    onChange={(e) => setDose(e.target.value.replace(",", "."))}
                    aria-invalid={dose !== "" && !doseValid}
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[0.8125rem] text-muted-foreground">
                    {unit}
                  </span>
                </div>
              </div>

              <p
                data-testid="log-dose-maths"
                aria-live="polite"
                className="border border-line p-2.5 text-[0.8125rem] leading-normal text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground"
              >
                {maths}
              </p>
            </>
          )}

          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <label htmlFor="ld-date" className="mb-1 block text-[0.8125rem] text-muted-foreground">
                Date taken
              </label>
              <input
                id="ld-date"
                type="date"
                className={`${fieldClass} font-mono`}
                value={date}
                max={todayKey}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={!dateValid}
              />
            </div>
            <div className="min-w-0 flex-1">
              <label htmlFor="ld-time" className="mb-1 block text-[0.8125rem] text-muted-foreground">
                Time taken
              </label>
              <input
                id="ld-time"
                type="time"
                className={`${fieldClass} font-mono`}
                value={time}
                max={date === todayKey ? maxTime : undefined}
                onChange={(e) => setTime(e.target.value)}
                aria-invalid={!timeValid}
              />
            </div>
          </div>
          <div>
            <label htmlFor="ld-note" className="mb-1 block text-[0.8125rem] text-muted-foreground">
              Note (optional)
            </label>
            <input
              id="ld-note"
              className={fieldClass}
              placeholder="e.g. headache"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {!dateValid ? (
            <p role="alert" className="text-[0.8125rem] text-bp">
              {YMD.test(date) ? "That day hasn't happened yet" : "Enter a date"}
            </p>
          ) : (
            !timeValid && (
              <p role="alert" className="text-[0.8125rem] text-bp">
                {timeWellFormed ? "That time hasn't happened yet" : "Enter a time"}
              </p>
            )
          )}
        </form>

        <div className="flex flex-none items-center justify-end gap-2 border-t border-line px-4 py-3">
          <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="log-dose-form" className="flex-1" disabled={!canSave}>
            Log dose
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
