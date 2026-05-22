"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Candy } from "lucide-react";
import { NumericInput } from "@/components/ui/numeric-input";
import { useSettings } from "@/hooks/use-settings";
import { validateAndSave, incrementSetting, decrementSetting } from "@/lib/settings-helpers";
import { ExpandableSettingsSection } from "@/components/settings/expandable-settings-section";

export function SugarSettingsSection() {
  const settings = useSettings();
  const [limitInput, setLimitInput] = useState(settings.sugarLimit.toString());

  useEffect(() => {
    setLimitInput(settings.sugarLimit.toString());
  }, [settings.sugarLimit]);

  return (
    <ExpandableSettingsSection
      icon={Candy}
      label="Sugar Settings"
      iconColorClass="text-pink-600 dark:text-pink-400"
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="sugar-limit">Daily Limit (g)</Label>
          <NumericInput
            id="sugar-limit"
            value={limitInput}
            onChange={setLimitInput}
            onBlur={() => validateAndSave(limitInput, 5, 500, settings.sugarLimit, settings.setSugarLimit, setLimitInput)}
            min={5}
            max={500}
            step={5}
            onIncrement={() => incrementSetting(settings.sugarLimit, 5, 500, settings.setSugarLimit, setLimitInput)}
            onDecrement={() => decrementSetting(settings.sugarLimit, 5, 5, settings.setSugarLimit, setLimitInput)}
          />
          <p className="text-xs text-muted-foreground">
            Your daily total-sugar intake limit (5-500)
          </p>
        </div>
      </div>
    </ExpandableSettingsSection>
  );
}
