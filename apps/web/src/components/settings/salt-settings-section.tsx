"use client";

import { useState, useEffect } from "react";
import { Label } from "@intake/ui/label";
import { Sparkles } from "lucide-react";
import { NumericInput } from "@intake/ui/numeric-input";
import { useSettings } from "@/hooks/use-settings";
import { useSettingsStore } from "@/stores/settings-store";
import { validateAndSave, incrementSetting, decrementSetting } from "@intake/core/settings";
import { ExpandableSettingsSection } from "@/components/settings/expandable-settings-section";
import { SettingFieldMessage, useFieldMessages } from "@/components/settings/setting-field-message";

export function SaltSettingsSection() {
  const settings = useSettings();
  const [messages, setMessage] = useFieldMessages<"limit" | "extended">();
  const [limitInput, setLimitInput] = useState(settings.saltLimit.toString());
  const [extendedInput, setExtendedInput] = useState(settings.saltExtendedBuffer.toString());

  useEffect(() => {
    setLimitInput(settings.saltLimit.toString());
    setExtendedInput(settings.saltExtendedBuffer.toString());
  }, [settings.saltLimit, settings.saltExtendedBuffer]);

  return (
    <ExpandableSettingsSection
      icon={Sparkles}
      label="Sodium Settings"
      iconColorClass="text-amber-600 dark:text-amber-400"
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="salt-limit">Daily Limit (mg)</Label>
          <NumericInput
            id="salt-limit"
            value={limitInput}
            onChange={(v) => { setLimitInput(v); setMessage("limit", null); }}
            onBlur={() => setMessage("limit", validateAndSave(limitInput, 100, 10000, settings.saltLimit, settings.setSaltLimit, setLimitInput, () => useSettingsStore.getState().saltLimit))}
            min={100}
            max={10000}
            step={100}
            onIncrement={() => incrementSetting(settings.saltLimit, 100, 10000, settings.setSaltLimit, setLimitInput)}
            onDecrement={() => decrementSetting(settings.saltLimit, 100, 100, settings.setSaltLimit, setLimitInput)}
          />
          <SettingFieldMessage message={messages.limit} />
          <p className="text-xs text-muted-foreground">
            Your daily sodium intake limit (100-10000)
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="salt-extended">Extended Buffer (mg)</Label>
          <NumericInput
            id="salt-extended"
            value={extendedInput}
            onChange={(v) => { setExtendedInput(v); setMessage("extended", null); }}
            onBlur={() => setMessage("extended", validateAndSave(extendedInput, 0, 10000, settings.saltExtendedBuffer, settings.setSaltExtendedBuffer, setExtendedInput, () => useSettingsStore.getState().saltExtendedBuffer))}
            min={0}
            max={10000}
            step={100}
            onIncrement={() => incrementSetting(settings.saltExtendedBuffer, 100, 10000, settings.setSaltExtendedBuffer, setExtendedInput)}
            onDecrement={() => decrementSetting(settings.saltExtendedBuffer, 100, 0, settings.setSaltExtendedBuffer, setExtendedInput)}
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
