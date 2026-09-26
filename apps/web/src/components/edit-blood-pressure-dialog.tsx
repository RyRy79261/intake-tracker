"use client";

import { type FocusEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@intake/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@intake/ui/select";
import { Button } from "@intake/ui/button";
import { Input } from "@intake/ui/input";
import { Label } from "@intake/ui/label";
import { toast } from "@intake/ui/use-toast";
import { ToastAction, type ToastActionElement } from "@intake/ui/toast";
import { BP_RANGES, parseBloodPressureForm } from "@intake/core/record-schemas";
import { type BloodPressureRecord } from "@/lib/db";

/**
 * Validate BP edit inputs with the shared schema. On failure shows a toast
 * (with a "Swap" action when systolic/diastolic look entered the wrong way
 * round) and returns null.
 */
export function validateBloodPressureEdit(
  input: { systolic: string; diastolic: string; heartRate: string },
  onSwap: () => void,
) {
  const parsed = parseBloodPressureForm(input);
  if (parsed.ok) return parsed.data;
  const action = parsed.swapSuggested
    ? ((
        <ToastAction altText="Swap systolic and diastolic" onClick={onSwap}>
          Swap
        </ToastAction>
      ) as ToastActionElement)
    : undefined;
  toast({
    title: "Invalid values",
    description: parsed.swapSuggested
      ? `${parsed.message}. Did you enter them the wrong way round?`
      : parsed.message,
    variant: "destructive",
    ...(action && { action }),
  });
  return null;
}

interface EditBloodPressureDialogProps {
  record: BloodPressureRecord | null;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  systolic: string;
  onSystolicChange: (value: string) => void;
  diastolic: string;
  onDiastolicChange: (value: string) => void;
  heartRate: string;
  onHeartRateChange: (value: string) => void;
  position: "sitting" | "standing";
  onPositionChange: (value: "sitting" | "standing") => void;
  arm: "left" | "right";
  onArmChange: (value: "left" | "right") => void;
  irregularHeartbeat?: boolean;
  onIrregularHeartbeatChange?: (value: boolean) => void;
  timestamp: string;
  onTimestampChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void;
}

export function EditBloodPressureDialog({
  record,
  onClose,
  onSubmit,
  systolic,
  onSystolicChange,
  diastolic,
  onDiastolicChange,
  heartRate,
  onHeartRateChange,
  position,
  onPositionChange,
  arm,
  onArmChange,
  irregularHeartbeat,
  onIrregularHeartbeatChange,
  timestamp,
  onTimestampChange,
  note,
  onNoteChange,
  onFocus,
}: EditBloodPressureDialogProps) {
  return (
    <Dialog open={record !== null} onOpenChange={(dialogOpen) => !dialogOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Blood Pressure Entry</DialogTitle>
          <DialogDescription>Update the blood pressure readings</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-systolic">Systolic</Label>
              <Input
                id="edit-systolic"
                type="number"
                min={BP_RANGES.systolic.min}
                max={BP_RANGES.systolic.max}
                value={systolic}
                onChange={(e) => onSystolicChange(e.target.value)}
                onFocus={onFocus}
                autoFocus
                aria-required="true"
                aria-describedby="edit-systolic-desc"
              />
              <p id="edit-systolic-desc" className="sr-only">
                Systolic pressure (top number), typically between 90-180
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-diastolic">Diastolic</Label>
              <Input
                id="edit-diastolic"
                type="number"
                min={BP_RANGES.diastolic.min}
                max={BP_RANGES.diastolic.max}
                value={diastolic}
                onChange={(e) => onDiastolicChange(e.target.value)}
                onFocus={onFocus}
                aria-required="true"
                aria-describedby="edit-diastolic-desc"
              />
              <p id="edit-diastolic-desc" className="sr-only">
                Diastolic pressure (bottom number), typically between 60-120
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-heartrate">Heart Rate (optional)</Label>
            <Input
              id="edit-heartrate"
              type="number"
              min={BP_RANGES.heartRate.min}
              max={BP_RANGES.heartRate.max}
              value={heartRate}
              onChange={(e) => onHeartRateChange(e.target.value)}
              onFocus={onFocus}
              placeholder="BPM"
              aria-describedby="edit-heartrate-desc"
            />
            <p id="edit-heartrate-desc" className="sr-only">
              Heart rate in beats per minute, typically between 60-100
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label id="edit-position-label">Position</Label>
              <Select value={position} onValueChange={onPositionChange} aria-labelledby="edit-position-label">
                <SelectTrigger aria-describedby="edit-position-desc">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sitting">Sitting</SelectItem>
                  <SelectItem value="standing">Standing</SelectItem>
                </SelectContent>
              </Select>
              <p id="edit-position-desc" className="sr-only">
                Body position when measurement was taken
              </p>
            </div>
            <div className="space-y-2">
              <Label id="edit-arm-label">Arm</Label>
              <Select value={arm} onValueChange={onArmChange} aria-labelledby="edit-arm-label">
                <SelectTrigger aria-describedby="edit-arm-desc">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
              <p id="edit-arm-desc" className="sr-only">
                Which arm the cuff was placed on
              </p>
            </div>
          </div>
          {onIrregularHeartbeatChange && (
            <div className="space-y-2">
              <Label id="edit-irregular-label">Irregular Heartbeat</Label>
              <Select
                value={irregularHeartbeat ? "yes" : "no"}
                onValueChange={(v) => onIrregularHeartbeatChange(v === "yes")}
                aria-labelledby="edit-irregular-label"
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="edit-bp-timestamp">Time</Label>
            <Input
              id="edit-bp-timestamp"
              type="datetime-local"
              value={timestamp}
              onChange={(e) => onTimestampChange(e.target.value)}
              onFocus={onFocus}
              aria-required="true"
              aria-describedby="edit-bp-timestamp-desc"
            />
            <p id="edit-bp-timestamp-desc" className="sr-only">
              Select the date and time when the reading was taken
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-bp-note">Note (optional)</Label>
            <Input
              id="edit-bp-note"
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              onFocus={onFocus}
              placeholder="Add a note..."
              aria-describedby="edit-bp-note-desc"
            />
            <p id="edit-bp-note-desc" className="sr-only">
              Optional note for additional context
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="bg-rose-600 hover:bg-rose-700">
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
