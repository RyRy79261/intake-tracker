"use client";

import { ArrowRight, Globe, Loader2 } from "lucide-react";
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
import type { TimezoneAnchorGroup } from "@/hooks/use-timezone-detection";

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
  /** Every mismatched anchor zone with its doses' before/after times. */
  anchors?: TimezoneAnchorGroup[];
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
  anchors = [],
  isRecalculating,
  onConfirm,
  onDismiss,
}: TimezoneChangeDialogProps) {
  const zones = anchors.length > 0 ? anchors.map((g) => g.anchorTimezone) : [oldTimezone];
  const zoneNames = zones.map(formatTimezoneCityName).join(", ");
  const newCity = formatTimezoneCityName(newTimezone);

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <Globe className="w-6 h-6 text-medication" />
          <AlertDialogTitle>Timezone Changed</AlertDialogTitle>
          <AlertDialogDescription>
            Your device is now in {newCity}, but some dose times are set in{" "}
            {zoneNames} time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {anchors.length > 0 && (
          <div className="max-h-60 overflow-y-auto space-y-3 text-sm">
            {anchors.map((group) => (
              <div key={group.anchorTimezone}>
                <p className="font-medium">
                  Set in {formatTimezoneCityName(group.anchorTimezone)} time
                </p>
                <ul className="mt-1 space-y-1">
                  {group.doses.map((dose) => (
                    <li
                      key={dose.scheduleId}
                      data-testid={`tz-dose-${dose.scheduleId}`}
                      className="flex items-center justify-between gap-2 text-muted-foreground"
                    >
                      <span className="truncate">{dose.name}</span>
                      <span className="flex items-center gap-1 tabular-nums shrink-0">
                        {dose.before}
                        <ArrowRight className="w-3 h-3" aria-label="becomes" />
                        {dose.after}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        <div className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground mt-3">
          Adjusting keeps each dose at the same clock time (e.g. 08:00 stays
          08:00) in {newCity}. Not Now keeps each dose on its original
          zone&apos;s time (shown on the left).
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
