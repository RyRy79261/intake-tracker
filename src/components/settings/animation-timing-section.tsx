"use client";

import { useState, useEffect } from "react";
import { Timer } from "lucide-react";
import { Label } from "@/components/ui/label";
import { NumericInput } from "@/components/ui/numeric-input";
import { useSettings } from "@/hooks/use-settings";
import { validateAndSave, incrementSetting, decrementSetting } from "@/lib/settings-helpers";

export function AnimationTimingSection() {
  const settings = useSettings();
  const [scrollDurationInput, setScrollDurationInput] = useState(settings.scrollDurationMs.toString());
  const [autoHideDelayInput, setAutoHideDelayInput] = useState(settings.autoHideDelayMs.toString());
  const [barTransitionInput, setBarTransitionInput] = useState(settings.barTransitionDurationMs.toString());

  useEffect(() => {
    setScrollDurationInput(settings.scrollDurationMs.toString());
    setAutoHideDelayInput(settings.autoHideDelayMs.toString());
    setBarTransitionInput(settings.barTransitionDurationMs.toString());
  }, [settings.scrollDurationMs, settings.autoHideDelayMs, settings.barTransitionDurationMs]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
        <Timer className="w-4 h-4" />
        <h3 className="font-semibold">Animation Timing</h3>
      </div>
      <div className="space-y-3 pl-6">
        {/* Scroll Speed */}
        <div className="space-y-2">
          <Label htmlFor="scroll-duration">Scroll Speed (ms)</Label>
          <NumericInput
            id="scroll-duration"
            value={scrollDurationInput}
            onChange={setScrollDurationInput}
            onBlur={() => validateAndSave(scrollDurationInput, 100, 1000, settings.scrollDurationMs, settings.setScrollDurationMs, setScrollDurationInput)}
            min={100}
            max={1000}
            step={50}
            onIncrement={() => incrementSetting(settings.scrollDurationMs, 50, 1000, settings.setScrollDurationMs, setScrollDurationInput)}
            onDecrement={() => decrementSetting(settings.scrollDurationMs, 50, 100, settings.setScrollDurationMs, setScrollDurationInput)}
          />
          <p className="text-xs text-muted-foreground">How fast the page scrolls to a section (100-1000)</p>
        </div>

        {/* Auto-Hide Delay */}
        <div className="space-y-2">
          <Label htmlFor="auto-hide-delay">Auto-Hide Delay (ms)</Label>
          <NumericInput
            id="auto-hide-delay"
            value={autoHideDelayInput}
            onChange={setAutoHideDelayInput}
            onBlur={() => validateAndSave(autoHideDelayInput, 0, 2000, settings.autoHideDelayMs, settings.setAutoHideDelayMs, setAutoHideDelayInput)}
            min={0}
            max={2000}
            step={100}
            onIncrement={() => incrementSetting(settings.autoHideDelayMs, 100, 2000, settings.setAutoHideDelayMs, setAutoHideDelayInput)}
            onDecrement={() => decrementSetting(settings.autoHideDelayMs, 100, 0, settings.setAutoHideDelayMs, setAutoHideDelayInput)}
          />
          <p className="text-xs text-muted-foreground">Delay before header/footer hide after scrolling (0-2000)</p>
        </div>

        {/* Bar Transition Speed */}
        <div className="space-y-2">
          <Label htmlFor="bar-transition">Bar Transition Speed (ms)</Label>
          <NumericInput
            id="bar-transition"
            value={barTransitionInput}
            onChange={setBarTransitionInput}
            onBlur={() => validateAndSave(barTransitionInput, 50, 500, settings.barTransitionDurationMs, settings.setBarTransitionDurationMs, setBarTransitionInput)}
            min={50}
            max={500}
            step={50}
            onIncrement={() => incrementSetting(settings.barTransitionDurationMs, 50, 500, settings.setBarTransitionDurationMs, setBarTransitionInput)}
            onDecrement={() => decrementSetting(settings.barTransitionDurationMs, 50, 50, settings.setBarTransitionDurationMs, setBarTransitionInput)}
          />
          <p className="text-xs text-muted-foreground">How fast header/footer slide in and out (50-500)</p>
        </div>
      </div>
    </div>
  );
}
