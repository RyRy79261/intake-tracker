"use client";

import { useState } from "react";
import { Loader2, Pill, Trash2 } from "lucide-react";
import { Button } from "@intake/ui/button";
import { Input } from "@intake/ui/input";
import { Label } from "@intake/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@intake/ui/dialog";
import { useDeleteAllMedicationData } from "@/hooks/use-data-deletion";

const CONFIRM_PHRASE = "DELETE";

/**
 * Settings > Data & Storage: "Delete all medication data". Removes every
 * prescription, phase, schedule, inventory item and transaction, dose log and
 * titration plan behind a type-to-confirm dialog. Deletions are tombstoned and
 * synced, so the cloud copy and other devices follow.
 */
export function DeleteMedicationDataControl() {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const mutation = useDeleteAllMedicationData();
  const busy = mutation.isPending;
  const canDelete = confirmText.trim().toUpperCase() === CONFIRM_PHRASE && !busy;

  function close() {
    setConfirmText("");
    setOpen(false);
  }

  function handleDelete() {
    if (!canDelete) return;
    mutation.mutate(undefined, { onSuccess: close });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Pill className="w-4 h-4 text-muted-foreground" />
        <p className="text-sm font-medium">Medication data</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Delete every medication, schedule, titration plan, inventory item and
        dose log. Health logs are kept. In cloud-sync mode this also removes
        the cloud copy and your other devices.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-destructive"
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="w-3.5 h-3.5" />
        Delete all medication data
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return; // don't let the user dismiss mid-delete
          if (!next) close();
          else setOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete all medication data?</DialogTitle>
            <DialogDescription>
              This permanently deletes all your medications, their schedules
              and titration plans, inventory and stock history, and every
              logged dose, on this device and in the cloud. This can&apos;t be
              undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-delete-medication-data">
              Type {CONFIRM_PHRASE} to confirm
            </Label>
            <Input
              id="confirm-delete-medication-data"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              disabled={busy}
              placeholder={CONFIRM_PHRASE}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="gap-2"
              onClick={handleDelete}
              disabled={!canDelete}
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              {busy ? "Deleting…" : "Delete medication data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
