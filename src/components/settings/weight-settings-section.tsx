"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Scale } from "lucide-react";
import { NumericInput } from "@/components/ui/numeric-input";
import { useSettings } from "@/hooks/use-settings";
import { validateAndSave, incrementSetting, decrementSetting } from "@/lib/settings-helpers";
import { ExpandableSettingsSection } from "@/components/settings/expandable-settings-section";

export function WeightSettingsSection() {
  const settings = useSettings();
  const [incrementInput, setIncrementInput] = useState(settings.weightIncrement.toString());

  useEffect(() => {
    setIncrementInput(settings.weightIncrement.toString());
  }, [settings.weightIncrement]);

  return (
    <ExpandableSettingsSection
      icon={Scale}
      label="Weight Settings"
      iconColorClass="text-emerald-600 dark:text-emerald-400"
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="weight-increment">Increment (kg)</Label>
          <NumericInput
            id="weight-increment"
            value={incrementInput}
            onChange={setIncrementInput}
            onBlur={() => validateAndSave(incrementInput, 0.05, 1, settings.weightIncrement, settings.setWeightIncrement, setIncrementInput)}
            min={0.05}
            max={1}
            step={0.05}
            onIncrement={() => incrementSetting(settings.weightIncrement, 0.05, 1, settings.setWeightIncrement, setIncrementInput)}
            onDecrement={() => decrementSetting(settings.weightIncrement, 0.05, 0.05, settings.setWeightIncrement, setIncrementInput)}
          />
          <p className="text-xs text-muted-foreground">
            Amount added with each +/- tap (0.05-1.00 kg)
          </p>
        </div>
      </div>
    </ExpandableSettingsSection>
  );
}
