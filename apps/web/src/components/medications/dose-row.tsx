"use client";

import { useRef } from "react";
import { Check } from "lucide-react";
import { PillIconWithBadge } from "@/components/medications/pill-icon";
import { cn } from "@/lib/utils";
import {
  doseDisplayName,
  doseStatusLine,
  formatDoseLine,
  isRescheduledSlot,
} from "@/lib/medication-ui-utils";
import type { DoseSlot } from "@/hooks/use-medication-queries";

interface DoseRowProps {
  slot: DoseSlot;
  /** A dose of a day after today: there is no Take button. */
  isFuture: boolean;
  /** A tap on the row opens the dose dialog, for every status. */
  onOpen: (slot: DoseSlot) => void;
  /** Take. Absent: no Take button (the rows of the "Mark all doses" modal). */
  onTake?: (slot: DoseSlot) => void;
  /** A long press of Take: ask for the time taken at once. */
  onTakeLongPress?: (slot: DoseSlot) => void;
  /** A dose of an earlier day ("From earlier days"): where it comes from. */
  origin?: string;
}

const LONG_PRESS_MS = 500;

/**
 * One dose: the pill with its status badge, the name on the box, the dose
 * line and the status line. A tap anywhere opens the dose dialog. The round
 * Take button on the right takes the dose (a long press asks for the time
 * taken); it shows a filled check once taken.
 */
export function DoseRow({ slot, isFuture, onOpen, onTake, onTakeLongPress, origin }: DoseRowProps) {
  const { status, inventory } = slot;
  const name = doseDisplayName(slot);
  const statusLine = doseStatusLine(slot);
  const rescheduled = isRescheduledSlot(slot);
  const badge = rescheduled ? "rescheduled" : status;

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const clearPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  const longPress = () => {
    longPressed.current = true;
    clearPress();
    onTakeLongPress?.(slot);
  };

  const showTake = !!onTake && !isFuture;
  const taken = status === "taken";

  return (
    <div
      data-status={rescheduled ? "rescheduled" : status}
      data-testid="dose-row"
      className={cn(
        "grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-line/60 p-2.5 first:border-t-0",
        status === "missed" && "shadow-[inset_3px_0_0_hsl(var(--sodium))]",
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(slot)}
        aria-label={`${name}${statusLine ? `, ${statusLine}` : ""}. Open dose`}
        className="col-span-2 grid cursor-pointer grid-cols-[34px_minmax(0,1fr)] items-center gap-2.5 text-left hover:bg-foreground/4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <PillIconWithBadge
          shape={inventory?.pillShape || "round"}
          color={inventory?.pillColor || "#ccc"}
          size={34}
          status={badge}
        />
        <span className="min-w-0">
          <span className={cn(
            "block text-[0.9375rem] font-semibold leading-snug",
            status === "skipped" && "text-muted-foreground line-through",
          )}>
            {name}
          </span>
          <span className="block text-[0.8125rem] leading-snug text-muted-foreground">
            {formatDoseLine(slot)}
          </span>
          {origin && (
            <span data-testid="dose-origin" className="block text-[0.8125rem] leading-snug text-muted-foreground">
              {origin}
            </span>
          )}
          {statusLine && (
            <span
              data-testid="dose-status"
              className={cn(
                "mt-0.5 block text-[0.8125rem]",
                taken && "font-semibold text-meds",
                status === "skipped" && "text-muted-foreground",
                status === "missed" && "font-medium text-sodium",
                rescheduled && "font-medium text-meds",
              )}
            >
              {statusLine}
            </span>
          )}
        </span>
      </button>

      {showTake ? (
        <button
          type="button"
          aria-label={taken ? `${name} taken. Open dose` : `Take ${name}`}
          aria-pressed={taken}
          className={cn(
            // 44px tap target around a 36px ring.
            "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
          onPointerDown={() => {
            if (taken || !onTakeLongPress) return;
            longPressed.current = false;
            clearPress();
            pressTimer.current = setTimeout(longPress, LONG_PRESS_MS);
          }}
          onPointerUp={clearPress}
          onPointerLeave={clearPress}
          onPointerCancel={clearPress}
          onContextMenu={(e) => {
            // A long press on a touch screen (and a right click) opens the menu
            // event; use it for the same "pick the time" action.
            if (taken || !onTakeLongPress) return;
            e.preventDefault();
            if (!longPressed.current) longPress();
          }}
          onClick={() => {
            if (longPressed.current) {
              longPressed.current = false;
              return;
            }
            if (taken) onOpen(slot);
            else onTake?.(slot);
          }}
        >
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full border-2",
              taken ? "border-meds bg-meds text-on-domain" : "border-meds text-meds",
            )}
          >
            <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
          </span>
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}
