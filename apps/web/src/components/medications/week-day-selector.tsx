"use client";

import { useMemo } from "react";
import { Button } from "@intake/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTodayKey } from "@/hooks/use-today-key";
import { weekDayPosition } from "@/lib/date-utils";
import { useSettingsStore } from "@/stores/settings-store";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface WeekDaySelectorProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}

/** Midnight of the first day of `date`'s week, the week starting on `weekStartsOn`. */
function startOfWeek(date: Date, weekStartsOn: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - weekDayPosition(d.getDay(), weekStartsOn));
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDateLabel(date: Date): string {
  const today = new Date();
  if (isSameDay(date, today)) return "Today";
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (isSameDay(date, tomorrow)) return "Tomorrow";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export function WeekDaySelector({ selectedDate, onSelectDate }: WeekDaySelectorProps) {
  // Re-derived from a ticking day key so the "Today" label and ring move at
  // midnight instead of staying on the day the screen was mounted.
  const todayKey = useTodayKey();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- todayKey is the rollover trigger
  const today = useMemo(() => new Date(), [todayKey]);

  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);
  const weekStart = useMemo(
    () => startOfWeek(selectedDate, weekStartsOn),
    [selectedDate, weekStartsOn],
  );

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const shiftWeek = (direction: -1 | 1) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + direction * 7);
    onSelectDate(newDate);
  };

  const dateLabel = formatDateLabel(selectedDate);
  const fullDate = selectedDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="mb-3">
      <div className="flex items-stretch border border-line bg-background">
        <Button
          variant="ghost"
          size="icon"
          className="h-auto min-h-11 w-9 shrink-0 text-muted-foreground"
          onClick={() => shiftWeek(-1)}
          aria-label="Previous week"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="grid flex-1 grid-cols-7 border-x border-line">
          {weekDays.map((day, i) => {
            const isSelected = isSameDay(day, selectedDate);
            const isToday = isSameDay(day, today);
            return (
              <button
                key={i}
                type="button"
                onClick={() => onSelectDate(day)}
                aria-pressed={isSelected}
                aria-current={isToday ? "date" : undefined}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center py-1 transition-colors",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                  i > 0 && "border-l border-line/60",
                  isSelected ? "bg-meds text-on-domain" : "hover:bg-foreground/6",
                  !isSelected && isToday && "shadow-[inset_0_0_0_2px_hsl(var(--meds))]",
                )}
              >
                <span
                  className={cn(
                    "text-[0.6875rem] font-medium leading-tight",
                    isSelected ? "text-on-domain" : "text-muted-foreground",
                  )}
                >
                  {DAY_LABELS[day.getDay()]}
                </span>
                <span
                  className={cn(
                    "font-mono text-sm font-semibold leading-tight",
                    !isSelected && isToday && "text-meds",
                  )}
                >
                  {day.getDate()}
                </span>
              </button>
            );
          })}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-auto min-h-11 w-9 shrink-0 text-muted-foreground"
          onClick={() => shiftWeek(1)}
          aria-label="Next week"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <p className="mt-1.5 text-center text-[0.8125rem] font-medium text-meds">
        {isSameDay(selectedDate, today) ? `Today, ${fullDate}` : `${dateLabel}, ${fullDate}`}
      </p>
    </div>
  );
}
