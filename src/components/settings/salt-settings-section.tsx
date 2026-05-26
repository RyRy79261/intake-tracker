"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Sparkles } from "lucide-react";
import { NumericInput } from "@/components/ui/numeric-input";
import { useSettings } from "@/hooks/use-settings";
import { validateAndSave, incrementSetting, decrementSetting } from "@/lib/settings-helpers";
import { ExpandableSettingsSection } from "@/components/settings/expandable-settings-section";

export function SaltSettingsSection() {
  const settings = useSettings();
  const [incrementInput, setIncrementInput] = useState(settings.saltIncrement.toString());
  const [limitInput, setLimitInput] = useState(settings.saltLimit.toString());
  const [extendedInput, setExtendedInput] = useState(settings.saltExtendedBuffer.toString());

  useEffect(() => {
    setIncrementInput(settings.saltIncrement.toString());
    setLimitInput(settings.saltLimit.toString());
    setExtendedInput(settings.saltExtendedBuffer.toString());
  }, [settings.saltIncrement, settings.saltLimit, settings.saltExtendedBuffer]);

  return (
    <ExpandableSettingsSection
      icon={Sparkles}
      label="Sodium Settings"
      iconColorClass="text-amber-600 dark:text-amber-400"
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="salt-increment">Increment (mg)</Label>
          <NumericInput
            id="salt-increment"
            value={incrementInput}
            onChange={setIncrementInput}
            onBlur={() => validateAndSave(incrementInput, 10, 1000, settings.saltIncrement, settings.setSaltIncrement, setIncrementInput)}
            min={10}
            max={1000}
            step={10}
            onIncrement={() => incrementSetting(settings.saltIncrement, 10, 1000, settings.setSaltIncrement, setIncrementInput)}
            onDecrement={() => decrementSetting(settings.saltIncrement, 10, 10, settings.setSaltIncrement, setIncrementInput)}
          />
          <p className="text-xs text-muted-foreground">
            Amount added with each +/- tap (10-1000)
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="salt-limit">Daily Limit (mg)</Label>
          <NumericInput
            id="salt-limit"
            value={limitInput}
            onChange={setLimitInput}
            onBlur={() => validateAndSave(limitInput, 100, 10000, settings.saltLimit, settings.setSaltLimit, setLimitInput)}
            min={100}
            max={10000}
            step={100}
            onIncrement={() => incrementSetting(settings.saltLimit, 100, 10000, settings.setSaltLimit, setLimitInput)}
            onDecrement={() => decrementSetting(settings.saltLimit, 100, 100, settings.setSaltLimit, setLimitInput)}
          />
          <p className="text-xs text-muted-foreground">
            Your daily sodium intake limit (100-10000)
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="salt-extended">Extended Buffer (mg)</Label>
          <NumericInput
            id="salt-extended"
            value={extendedInput}
            onChange={setExtendedInput}
            onBlur={() => validateAndSave(extendedInput, 0, 10000, settings.saltExtendedBuffer, settings.setSaltExtendedBuffer, setExtendedInput)}
            min={0}
            max={10000}
            step={100}
            onIncrement={() => incrementSetting(settings.saltExtendedBuffer, 100, 10000, settings.setSaltExtendedBuffer, setExtendedInput)}
            onDecrement={() => decrementSetting(settings.saltExtendedBuffer, 100, 0, settings.setSaltExtendedBuffer, setExtendedInput)}
          />
          <p className="text-xs text-muted-foreground">
            Extra allowance shown in a second tone above your target before the bar turns red (0 to disable)
          </p>
        </div>
      </div>
    </ExpandableSettingsSection>
  );
}
