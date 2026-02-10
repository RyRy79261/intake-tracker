"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock } from "lucide-react";
import { useSettings } from "@/hooks/use-settings";
import { formatHour } from "@/lib/settings-helpers";

export function DaySettingsSection() {
  const settings = useSettings();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
        <Clock className="w-4 h-4" />
        <h3 className="font-semibold">Day Settings</h3>
      </div>
      <div className="space-y-3 pl-6">
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
      </div>
    </div>
  );
}
