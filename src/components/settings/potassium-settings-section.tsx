"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Banana } from "lucide-react";
import { NumericInput } from "@/components/ui/numeric-input";
import { useSettings } from "@/hooks/use-settings";
import { validateAndSave, incrementSetting, decrementSetting } from "@/lib/settings-helpers";
import { ExpandableSettingsSection } from "@/components/settings/expandable-settings-section";

export function PotassiumSettingsSection() {
  const settings = useSettings();
  const [limitInput, setLimitInput] = useState(settings.potassiumLimit.toString());

  useEffect(() => {
    setLimitInput(settings.potassiumLimit.toString());
  }, [settings.potassiumLimit]);

  return (
    <ExpandableSettingsSection
      icon={Banana}
      label="Potassium Settings"
      iconColorClass="text-purple-600 dark:text-purple-400"
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="potassium-limit">Daily Target (mg)</Label>
          <NumericInput
            id="potassium-limit"
            value={limitInput}
            onChange={setLimitInput}
            onBlur={() => validateAndSave(limitInput, 100, 20000, settings.potassiumLimit, settings.setPotassiumLimit, setLimitInput)}
            min={100}
            max={20000}
            step={100}
            onIncrement={() => incrementSetting(settings.potassiumLimit, 100, 20000, settings.setPotassiumLimit, setLimitInput)}
            onDecrement={() => decrementSetting(settings.potassiumLimit, 100, 100, settings.setPotassiumLimit, setLimitInput)}
          />
          <p className="text-xs text-muted-foreground">
            Soft daily potassium target in mg (100-20000). WHO suggests ~3500 mg
            adequate intake for healthy adults.
          </p>
        </div>
      </div>
    </ExpandableSettingsSection>
  );
}
