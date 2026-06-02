"use client";

import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useDeleteDataInRange,
  olderThanDays,
  ALL_TIME,
  type DeleteRange,
} from "@/hooks/use-data-deletion";

interface Preset {
  label: string;
  /** Builds the time range for this preset, evaluated at click time. */
  range: () => DeleteRange;
  /** Human description used in the confirmation dialog. */
  describe: string;
}

const PRESETS: Preset[] = [
  {
    label: "Older than 1 year",
    range: () => olderThanDays(365),
    describe: "all records logged more than a year ago",
  },
  {
    label: "Older than 90 days",
    range: () => olderThanDays(90),
    describe: "all records logged more than 90 days ago",
  },
  {
    label: "Older than 30 days",
    range: () => olderThanDays(30),
    describe: "all records logged more than 30 days ago",
  },
  {
    label: "All data",
    range: () => ALL_TIME,
    describe: "every record you've logged",
  },
];

/**
 * "Delete data" controls for the Storage settings section: wipe logged records
 * by time frame. Deletions are tombstoned and synced, so in cloud-sync mode
 * they also remove the cloud copy.
 */
export function DeleteDataControls() {
  const [pending, setPending] = useState<Preset | null>(null);
  const mutation = useDeleteDataInRange();

  function confirmDelete() {
    if (!pending) return;
    const preset = pending;
    mutation.mutate(preset.range(), {
      onSettled: () => setPending(null),
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Trash2 className="w-4 h-4 text-muted-foreground" />
        <p className="text-sm font-medium">Delete data</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Permanently delete logged records by time frame. In cloud-sync mode this
        also removes the cloud copy.
      </p>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <Button
            key={preset.label}
            variant="outline"
            size="sm"
            disabled={mutation.isPending}
            onClick={() => setPending(preset)}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next && !mutation.isPending) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete data?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {pending?.describe}. This can&apos;t be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {mutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
