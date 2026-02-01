"use client";

import { type FocusEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type BloodPressureRecord } from "@/lib/db";

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
                min="60"
                max="300"
                value={systolic}
                onChange={(e) => onSystolicChange(e.target.value)}
                onFocus={onFocus}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-diastolic">Diastolic</Label>
              <Input
                id="edit-diastolic"
                type="number"
                min="40"
                max="200"
                value={diastolic}
                onChange={(e) => onDiastolicChange(e.target.value)}
                onFocus={onFocus}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-heartrate">Heart Rate (optional)</Label>
            <Input
              id="edit-heartrate"
              type="number"
              min="30"
              max="250"
              value={heartRate}
              onChange={(e) => onHeartRateChange(e.target.value)}
              onFocus={onFocus}
              placeholder="BPM"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Position</Label>
              <Select value={position} onValueChange={onPositionChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sitting">Sitting</SelectItem>
                  <SelectItem value="standing">Standing</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Arm</Label>
              <Select value={arm} onValueChange={onArmChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-bp-timestamp">Time</Label>
            <Input
              id="edit-bp-timestamp"
              type="datetime-local"
              value={timestamp}
              onChange={(e) => onTimestampChange(e.target.value)}
              onFocus={onFocus}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-bp-note">Note (optional)</Label>
            <Input
              id="edit-bp-note"
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              onFocus={onFocus}
              placeholder="Add a note..."
            />
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
