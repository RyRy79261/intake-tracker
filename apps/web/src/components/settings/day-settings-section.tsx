"use client";

import { Label } from "@intake/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@intake/ui/select";
import { Clock } from "lucide-react";
import { useSettings } from "@/hooks/use-settings";
import { formatHour } from "@intake/core/settings";
import { ExpandableSettingsSection } from "@/components/settings/expandable-settings-section";
import { DEFAULT_WEEK_STARTS_ON, weekDayOrder } from "@/lib/date-utils";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** Every weekday, the default (Monday) first. 0 = Sunday, JS getDay numbering. */
const WEEK_START_OPTIONS = weekDayOrder(DEFAULT_WEEK_STARTS_ON);

export function DaySettingsSection() {
  const settings = useSettings();

  return (
    <ExpandableSettingsSection
      icon={Clock}
      label="Day Settings"
      iconColorClass="text-indigo-600 dark:text-indigo-400"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="day-start">Day Start Time</Label>
          <Select
            value={settings.dayStartHour.toString()}
            onValueChange={(value) => settings.setDayStartHour(parseInt(value, 10))}
          >
            <SelectTrigger id="day-start" className="w-full">
              <SelectValue placeholder="Select day start time" />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 24 }, (_, i) => (
                <SelectItem key={i} value={i.toString()}>
                  {formatHour(i)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            When your &quot;day&quot; starts for budget tracking. Useful if you stay up past midnight.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="week-start">Week Starts On</Label>
          <Select
            value={settings.weekStartsOn.toString()}
            onValueChange={(value) => settings.setWeekStartsOn(parseInt(value, 10))}
          >
            <SelectTrigger id="week-start" className="w-full">
              <SelectValue placeholder="Select the first day of the week" />
            </SelectTrigger>
            <SelectContent>
              {WEEK_START_OPTIONS.map((day) => (
                <SelectItem key={day} value={day.toString()}>
                  {WEEKDAY_NAMES[day]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            The first day of every week the app shows: the weekly summary, the
            medications week strip and the day pickers.
          </p>
        </div>
      </div>
    </ExpandableSettingsSection>
  );
}
