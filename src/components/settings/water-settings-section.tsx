"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Droplets } from "lucide-react";
import { NumericInput } from "@/components/ui/numeric-input";
import { useSettings } from "@/hooks/use-settings";
import { validateAndSave, incrementSetting, decrementSetting } from "@/lib/settings-helpers";

export function WaterSettingsSection() {
  const settings = useSettings();
  const [incrementInput, setIncrementInput] = useState(settings.waterIncrement.toString());
  const [limitInput, setLimitInput] = useState(settings.waterLimit.toString());

  useEffect(() => {
    setIncrementInput(settings.waterIncrement.toString());
    setLimitInput(settings.waterLimit.toString());
  }, [settings.waterIncrement, settings.waterLimit]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400">
        <Droplets className="w-4 h-4" />
        <h3 className="font-semibold">Water Settings</h3>
      </div>
      <div className="space-y-3 pl-6">
        <div className="space-y-2">
          <Label htmlFor="water-increment">Increment (ml)</Label>
          <NumericInput
            id="water-increment"
            value={incrementInput}
            onChange={setIncrementInput}
            onBlur={() => validateAndSave(incrementInput, 10, 1000, settings.waterIncrement, settings.setWaterIncrement, setIncrementInput)}
            min={10}
            max={1000}
            step={10}
            onIncrement={() => incrementSetting(settings.waterIncrement, 10, 1000, settings.setWaterIncrement, setIncrementInput)}
            onDecrement={() => decrementSetting(settings.waterIncrement, 10, 10, settings.setWaterIncrement, setIncrementInput)}
          />
          <p className="text-xs text-muted-foreground">
            Amount added with each +/- tap (10-1000)
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="water-limit">Daily Limit (ml)</Label>
          <NumericInput
            id="water-limit"
            value={limitInput}
            onChange={setLimitInput}
            onBlur={() => validateAndSave(limitInput, 100, 10000, settings.waterLimit, settings.setWaterLimit, setLimitInput)}
            min={100}
            max={10000}
            step={100}
            onIncrement={() => incrementSetting(settings.waterLimit, 100, 10000, settings.setWaterLimit, setLimitInput)}
            onDecrement={() => decrementSetting(settings.waterLimit, 100, 100, settings.setWaterLimit, setLimitInput)}
          />
          <p className="text-xs text-muted-foreground">
            Your daily water intake target (100-10000)
          </p>
        </div>
      </div>
    </div>
  );
}
