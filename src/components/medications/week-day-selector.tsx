"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface WeekDaySelectorProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
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
  const today = useMemo(() => new Date(), []);

  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate]);

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
    <div className="mb-4">
      <div className="flex items-center">
        <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => shiftWeek(-1)}>
          <ChevronLeft className="w-4 h-4" />
        </Button>

        <div className="flex-1 grid grid-cols-7 gap-0.5">
          {weekDays.map((day, i) => {
            const isSelected = isSameDay(day, selectedDate);
            const isToday = isSameDay(day, today);
            return (
              <button
                key={i}
                onClick={() => onSelectDate(day)}
                className={cn(
                  "flex flex-col items-center py-1.5 rounded-lg transition-colors",
                  "hover:bg-muted/80 active:scale-95",
                  isSelected && "bg-teal-600 text-white hover:bg-teal-700",
                  !isSelected && isToday && "ring-1 ring-teal-500"
                )}
              >
                <span className={cn(
                  "text-[10px] font-medium",
                  isSelected ? "text-teal-100" : "text-muted-foreground"
                )}>
                  {DAY_LABELS[i]}
                </span>
                <span className={cn(
                  "text-sm font-semibold mt-0.5",
                  isSelected ? "text-white" : isToday ? "text-teal-600 dark:text-teal-400" : ""
                )}>
                  {day.getDate()}
                </span>
              </button>
            );
          })}
        </div>

        <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => shiftWeek(1)}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <p className="text-center text-sm font-medium text-teal-600 dark:text-teal-400 mt-1.5">
        {isSameDay(selectedDate, today) ? `Today, ${fullDate}` : `${dateLabel}, ${fullDate}`}
      </p>
    </div>
  );
}
