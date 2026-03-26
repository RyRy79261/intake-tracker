"use client";

import { Globe, Loader2 } from "lucide-react";
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimezoneCityName(iana: string): string {
  return iana.split("/").pop()?.replace(/_/g, " ") ?? iana;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TimezoneChangeDialogProps {
  open: boolean;
  oldTimezone: string;
  newTimezone: string;
  isRecalculating: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TimezoneChangeDialog({
  open,
  oldTimezone,
  newTimezone,
  isRecalculating,
  onConfirm,
  onDismiss,
}: TimezoneChangeDialogProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <Globe className="w-6 h-6 text-medication" />
          <AlertDialogTitle>Timezone Changed</AlertDialogTitle>
          <AlertDialogDescription>
            It looks like you&apos;ve traveled from{" "}
            {formatTimezoneCityName(oldTimezone)} to{" "}
            {formatTimezoneCityName(newTimezone)}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground mt-3">
          Your dose times will stay at the same wall-clock times (e.g. 08:00
          stays 08:00) in your new timezone.
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onDismiss} disabled={isRecalculating}>
            Not Now
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isRecalculating}>
            {isRecalculating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Adjusting...
              </>
            ) : (
              "Adjust Schedules"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
