"use client";

import { useState, useEffect } from "react";
import { Label } from "@intake/ui/label";
import { Droplets } from "lucide-react";
import { NumericInput } from "@intake/ui/numeric-input";
import { useSettings } from "@/hooks/use-settings";
import { useSettingsStore } from "@/stores/settings-store";
import { validateAndSave, incrementSetting, decrementSetting } from "@intake/core/settings";
import { ExpandableSettingsSection } from "@/components/settings/expandable-settings-section";
import { SettingFieldMessage, useFieldMessages } from "@/components/settings/setting-field-message";

export function WaterSettingsSection() {
  const settings = useSettings();
  const [messages, setMessage] = useFieldMessages<"increment" | "limit" | "extended">();
  const [incrementInput, setIncrementInput] = useState(settings.waterIncrement.toString());
  const [limitInput, setLimitInput] = useState(settings.waterLimit.toString());
  const [extendedInput, setExtendedInput] = useState(settings.waterExtendedBuffer.toString());

  useEffect(() => {
    setIncrementInput(settings.waterIncrement.toString());
    setLimitInput(settings.waterLimit.toString());
    setExtendedInput(settings.waterExtendedBuffer.toString());
  }, [settings.waterIncrement, settings.waterLimit, settings.waterExtendedBuffer]);

  return (
    <ExpandableSettingsSection
      icon={Droplets}
      label="Water Settings"
      iconColorClass="text-sky-600 dark:text-sky-400"
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="water-increment">Increment (ml)</Label>
          <NumericInput
            id="water-increment"
            value={incrementInput}
            onChange={(v) => { setIncrementInput(v); setMessage("increment", null); }}
            onBlur={() => setMessage("increment", validateAndSave(incrementInput, 10, 1000, settings.waterIncrement, settings.setWaterIncrement, setIncrementInput, () => useSettingsStore.getState().waterIncrement))}
            min={10}
            max={1000}
            step={10}
            onIncrement={() => incrementSetting(settings.waterIncrement, 10, 1000, settings.setWaterIncrement, setIncrementInput)}
            onDecrement={() => decrementSetting(settings.waterIncrement, 10, 10, settings.setWaterIncrement, setIncrementInput)}
          />
          <SettingFieldMessage message={messages.increment} />
          <p className="text-xs text-muted-foreground">
            Amount added with each +/- tap (10-1000)
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="water-limit">Daily Limit (ml)</Label>
          <NumericInput
            id="water-limit"
            value={limitInput}
            onChange={(v) => { setLimitInput(v); setMessage("limit", null); }}
            onBlur={() => setMessage("limit", validateAndSave(limitInput, 100, 10000, settings.waterLimit, settings.setWaterLimit, setLimitInput, () => useSettingsStore.getState().waterLimit))}
            min={100}
            max={10000}
            step={100}
            onIncrement={() => incrementSetting(settings.waterLimit, 100, 10000, settings.setWaterLimit, setLimitInput)}
            onDecrement={() => decrementSetting(settings.waterLimit, 100, 100, settings.setWaterLimit, setLimitInput)}
          />
          <SettingFieldMessage message={messages.limit} />
          <p className="text-xs text-muted-foreground">
            Your daily water intake target (100-10000)
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="water-extended">Extended Buffer (ml)</Label>
          <NumericInput
            id="water-extended"
            value={extendedInput}
            onChange={(v) => { setExtendedInput(v); setMessage("extended", null); }}
            onBlur={() => setMessage("extended", validateAndSave(extendedInput, 0, 10000, settings.waterExtendedBuffer, settings.setWaterExtendedBuffer, setExtendedInput, () => useSettingsStore.getState().waterExtendedBuffer))}
            min={0}
            max={10000}
            step={100}
            onIncrement={() => incrementSetting(settings.waterExtendedBuffer, 100, 10000, settings.setWaterExtendedBuffer, setExtendedInput)}
            onDecrement={() => decrementSetting(settings.waterExtendedBuffer, 100, 0, settings.setWaterExtendedBuffer, setExtendedInput)}
          />
          <SettingFieldMessage message={messages.extended} />
          <p className="text-xs text-muted-foreground">
            Extra allowance shown in a second tone above your target before the bar turns red (0 to disable)
          </p>
        </div>
      </div>
    </ExpandableSettingsSection>
  );
}
