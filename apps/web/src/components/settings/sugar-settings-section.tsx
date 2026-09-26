"use client";

import { useState, useEffect } from "react";
import { Label } from "@intake/ui/label";
import { Candy } from "lucide-react";
import { NumericInput } from "@intake/ui/numeric-input";
import { useSettings } from "@/hooks/use-settings";
import { useSettingsStore } from "@/stores/settings-store";
import { validateAndSave, incrementSetting, decrementSetting } from "@intake/core/settings";
import { ExpandableSettingsSection } from "@/components/settings/expandable-settings-section";
import { SettingFieldMessage, useFieldMessages } from "@/components/settings/setting-field-message";

export function SugarSettingsSection() {
  const settings = useSettings();
  const [messages, setMessage] = useFieldMessages<"limit" | "extended">();
  const [limitInput, setLimitInput] = useState(settings.sugarLimit.toString());
  const [extendedInput, setExtendedInput] = useState(settings.sugarExtendedBuffer.toString());

  useEffect(() => {
    setLimitInput(settings.sugarLimit.toString());
    setExtendedInput(settings.sugarExtendedBuffer.toString());
  }, [settings.sugarLimit, settings.sugarExtendedBuffer]);

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
            onChange={(v) => { setLimitInput(v); setMessage("limit", null); }}
            onBlur={() => setMessage("limit", validateAndSave(limitInput, 5, 500, settings.sugarLimit, settings.setSugarLimit, setLimitInput, () => useSettingsStore.getState().sugarLimit))}
            min={5}
            max={500}
            step={5}
            onIncrement={() => incrementSetting(settings.sugarLimit, 5, 500, settings.setSugarLimit, setLimitInput)}
            onDecrement={() => decrementSetting(settings.sugarLimit, 5, 5, settings.setSugarLimit, setLimitInput)}
          />
          <SettingFieldMessage message={messages.limit} />
          <p className="text-xs text-muted-foreground">
            Your daily total-sugar intake limit (5-500)
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sugar-extended">Extended Buffer (g)</Label>
          <NumericInput
            id="sugar-extended"
            value={extendedInput}
            onChange={(v) => { setExtendedInput(v); setMessage("extended", null); }}
            onBlur={() => setMessage("extended", validateAndSave(extendedInput, 0, 500, settings.sugarExtendedBuffer, settings.setSugarExtendedBuffer, setExtendedInput, () => useSettingsStore.getState().sugarExtendedBuffer))}
            min={0}
            max={500}
            step={5}
            onIncrement={() => incrementSetting(settings.sugarExtendedBuffer, 5, 500, settings.setSugarExtendedBuffer, setExtendedInput)}
            onDecrement={() => decrementSetting(settings.sugarExtendedBuffer, 5, 0, settings.setSugarExtendedBuffer, setExtendedInput)}
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
