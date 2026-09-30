"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Spinner } from "@intake/ui/spinner";
import { Button } from "@intake/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@intake/ui/alert-dialog";
import {
  useDeleteDataInRange,
  olderThanDays,
  ALL_TIME,
  type DeleteRange,
} from "@/hooks/use-data-deletion";
import { SubHead, btnClass, helpClass } from "@/components/settings/settings-kit";

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
    describe: "all health logs and dose history from more than a year ago",
  },
  {
    label: "Older than 90 days",
    range: () => olderThanDays(90),
    describe: "all health logs and dose history from more than 90 days ago",
  },
  {
    label: "Older than 30 days",
    range: () => olderThanDays(30),
    describe: "all health logs and dose history from more than 30 days ago",
  },
  {
    label: "All data",
    range: () => ALL_TIME,
    describe:
      "every record you've logged, including your medications, schedules and inventory",
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
    <div className="flex flex-col gap-2.5">
      <SubHead icon={Trash2}>Delete data</SubHead>
      <p className={helpClass}>
        Permanently delete logged records by time frame. Time-framed deletes
        only remove health logs and dose history; medications, schedules and
        inventory are kept. In cloud-sync mode this also removes the cloud copy.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <Button
            key={preset.label}
            variant="outline"
            className={btnClass}
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
                <Spinner className="size-4 mr-2" />
              ) : null}
              {mutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
