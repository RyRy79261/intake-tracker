"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@intake/ui/dialog";
import { Button } from "@intake/ui/button";
import { Input } from "@intake/ui/input";
import { Label } from "@intake/ui/label";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import { Clock, StickyNote } from "lucide-react";
import { SubToggle, segOnClass } from "@/components/domain-scope";

import { Textarea } from "@intake/ui/textarea";
import {
  getCurrentDateTimeLocal,
  parseDateTimeLocal,
  timestampToDateTimeLocal,
} from "@/lib/date-utils";

/**
 * A datetime-local value only has minute precision, so "now" typed into the
 * picker can land up to a minute ahead of a slightly lagging clock.
 */
const FUTURE_GRACE_MS = 60_000;

/**
 * Why a custom time is unusable, or null when it is fine. Shared by the zod
 * schema (submit) and the live check that disables the submit button.
 */
function customTimeError(value: string): string | null {
  const timestamp = parseDateTimeLocal(value);
  if (timestamp === null) return "Enter a valid date and time";
  if (timestamp > Date.now() + FUTURE_GRACE_MS) return "Time can't be in the future";
  return null;
}

const IntakeFormSchema = z.object({
  amount: z.number({ error: "Amount is required" })
    .int("Amount must be a whole number")
    .positive("Amount must be positive"),
  note: z.string().max(200, "Note too long").optional(),
  customTime: z
    .string()
    .optional()
    .superRefine((value, ctx) => {
      if (value === undefined) return;
      const message = customTimeError(value);
      if (message) ctx.addIssue({ code: "custom", message });
    }),
});

/**
 * `Number` rather than `parseInt`: parseInt silently truncates what a
 * type=number input accepts ("1e3" became 1 ml). Non-integers are left for
 * the schema to reject with a field error.
 */
function parseAmount(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : undefined;
}

interface ManualInputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "water" | "salt";
  currentValue: number;
  onSubmit: (amount: number, timestamp?: number, note?: string) => Promise<void> | void;
  isSubmitting?: boolean;
  /** Overrides the default "Enter Water/Sodium Amount" title. */
  title?: string;
  /** Overrides the default description line. */
  description?: string;
  /** Overrides the default "Add Entry" submit label. */
  submitLabel?: string;
  /** Pre-fills (and reveals) the custom time when the dialog opens. */
  initialTimestamp?: number | undefined;
  /** Pre-fills (and reveals) the note when the dialog opens. */
  initialNote?: string | undefined;
}

export function ManualInputDialog({
  open,
  onOpenChange,
  type,
  currentValue,
  onSubmit,
  isSubmitting = false,
  title,
  description,
  submitLabel = "Add Entry",
  initialTimestamp,
  initialNote,
}: ManualInputDialogProps) {
  const [value, setValue] = useState(currentValue.toString());
  const [showTimeInput, setShowTimeInput] = useState(false);
  const [customTime, setCustomTime] = useState(getCurrentDateTimeLocal());
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [note, setNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isWater = type === "water";
  const unit = isWater ? "ml" : "mg";

  // Reset value when dialog opens
  useEffect(() => {
    if (open) {
      setValue(currentValue.toString());
      setShowTimeInput(initialTimestamp !== undefined);
      setCustomTime(
        initialTimestamp !== undefined
          ? timestampToDateTimeLocal(initialTimestamp)
          : getCurrentDateTimeLocal()
      );
      setShowNoteInput(initialNote !== undefined);
      setNote(initialNote ?? "");
      setFieldErrors({});
    }
  }, [open, currentValue, initialTimestamp, initialNote]);

  const amountValue = parseAmount(value);
  const liveTimeError = showTimeInput ? customTimeError(customTime) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedNote = note.trim() || undefined;

    const parsed = IntakeFormSchema.safeParse({
      amount: amountValue,
      ...(trimmedNote !== undefined && { note: trimmedNote }),
      ...(showTimeInput && { customTime }),
    });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field && typeof field === "string") errors[field] = issue.message;
      }
      setFieldErrors(errors);
      logAudit("validation_error", JSON.stringify({ form: "intake", errors: z.flattenError(parsed.error) }).slice(0, 100));
      return;
    }
    setFieldErrors({});

    // Pass custom timestamp if time input is shown, otherwise use current time.
    // The schema has already rejected an empty/invalid/future customTime.
    const timestamp =
      parsed.data.customTime !== undefined
        ? (parseDateTimeLocal(parsed.data.customTime) ?? undefined)
        : undefined;
    await onSubmit(parsed.data.amount, timestamp, trimmedNote);
  };

  const quickValues = isWater
    ? [100, 250, 500, 750, 1000]
    : [100, 250, 500, 750, 1000];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-domain={isWater ? "water" : "sodium"}>
        <DialogHeader>
          <DialogTitle>
            {title ?? `Enter ${isWater ? "Water" : "Sodium"} Amount`}
          </DialogTitle>
          <DialogDescription>
            {description ??
              `Enter the exact amount in ${unit} to add to your intake.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount ({unit})</Label>
            <Input
              id="amount"
              type="number"
              min="1"
              step="1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={`Enter amount in ${unit}`}
              className="num text-lg h-12"
              autoFocus
            />
            {fieldErrors.amount && (
              <p className="text-sm text-destructive mt-1">{fieldErrors.amount}</p>
            )}
          </div>

          {/* Quick value buttons */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Quick select</Label>
            <div className="flex flex-wrap gap-2">
              {quickValues.map((v) => (
                <Button
                  key={v}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setValue(v.toString())}
                  aria-pressed={value === v.toString()}
                  className={cn("num", value === v.toString() && segOnClass)}
                >
                  {v}
                  {unit}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom time section */}
          <div className="space-y-2">
            <SubToggle
              expanded={showTimeInput}
              icon={Clock}
              onToggle={() => setShowTimeInput(!showTimeInput)}
            >
              {showTimeInput ? "Using custom time" : "Set different time"}
            </SubToggle>
            
            {showTimeInput && (
              <div className="space-y-2 border border-line bg-muted/50 p-3">
                <Label htmlFor="custom-time" className="text-sm">
                  When did this happen?
                </Label>
                <Input
                  id="custom-time"
                  type="datetime-local"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  max={getCurrentDateTimeLocal()}
                  className="text-sm"
                  aria-invalid={liveTimeError !== null}
                />
                {(liveTimeError ?? fieldErrors.customTime) && (
                  <p className="text-sm text-destructive">
                    {liveTimeError ?? fieldErrors.customTime}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Use this to log intake that happened earlier
                </p>
              </div>
            )}
          </div>

          {/* Note section */}
          <div className="space-y-2">
            <SubToggle
              expanded={showNoteInput}
              icon={StickyNote}
              onToggle={() => setShowNoteInput(!showNoteInput)}
            >
              {showNoteInput ? "Adding note" : "Add a note"}
            </SubToggle>
            
            {showNoteInput && (
              <div className="space-y-2 border border-line bg-muted/50 p-3">
                <Label htmlFor="note" className="text-sm">
                  Note (optional)
                </Label>
                <Textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add any notes about this entry..."
                  className="text-sm min-h-[60px]"
                  maxLength={200}
                />
                <p className="text-xs text-muted-foreground">
                  {note.length}/200 characters
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isSubmitting ||
                amountValue === undefined ||
                amountValue <= 0 ||
                liveTimeError !== null
              }
            >
              {isSubmitting ? "Adding..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
