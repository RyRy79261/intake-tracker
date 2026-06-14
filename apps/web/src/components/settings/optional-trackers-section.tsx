"use client";

import { ToggleLeft } from "lucide-react";
import { Label } from "@intake/ui/label";
import { Switch } from "@intake/ui/switch";
import { useSettingsStore } from "@/stores/settings-store";
import { ExpandableSettingsSection } from "@/components/settings/expandable-settings-section";
import {
  OPTIONAL_TRACKERS,
  type OptionalTrackerKey,
} from "@/lib/optional-trackers";
import { cn } from "@/lib/utils";

export function OptionalTrackersSection() {
  const trackers = useSettingsStore((s) => s.optionalTrackers);
  const setTracker = useSettingsStore((s) => s.setOptionalTracker);

  return (
    <ExpandableSettingsSection
      icon={ToggleLeft}
      label="Optional Trackers"
      iconColorClass="text-indigo-600 dark:text-indigo-400"
    >
      <p className="text-xs text-muted-foreground mb-3">
        Toggle which nutritional metrics you want to log. Disabled trackers
        are hidden from forms, voice input, progress bars, reports and the
        AI summary; previously-logged data is preserved.
      </p>
      <div className="space-y-3">
        {OPTIONAL_TRACKERS.map(({ key, label, description, icon: Icon, iconColorClass }) => {
          const enabled = trackers[key];
          const switchId = `optional-tracker-${key}`;
          return (
            <div
              key={key}
              className="flex items-start gap-3 rounded-md border border-border/60 bg-card/40 p-3"
              data-testid={`optional-tracker-row-${key}`}
            >
              <Icon
                className={cn("w-4 h-4 mt-0.5 shrink-0", iconColorClass)}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <Label
                  htmlFor={switchId}
                  className="text-sm font-medium cursor-pointer"
                >
                  {label}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {description}
                </p>
              </div>
              <Switch
                id={switchId}
                checked={enabled}
                onCheckedChange={(value) =>
                  setTracker(key as OptionalTrackerKey, value)
                }
                aria-label={`${label} tracking ${enabled ? "enabled" : "disabled"}`}
              />
            </div>
          );
        })}
      </div>
    </ExpandableSettingsSection>
  );
}
