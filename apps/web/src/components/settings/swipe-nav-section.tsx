"use client";

import { useState, useEffect } from "react";
import { Hand } from "lucide-react";
import { Label } from "@intake/ui/label";
import { NumericInput } from "@intake/ui/numeric-input";
import { useSettings } from "@/hooks/use-settings";
import { validateAndSave, incrementSetting, decrementSetting } from "@intake/core/settings";

export function SwipeNavSection() {
  const settings = useSettings();
  const [distanceInput, setDistanceInput] = useState(settings.swipeNavDistanceThresholdPct.toString());
  const [velocityInput, setVelocityInput] = useState(settings.swipeNavVelocityThreshold.toString());

  useEffect(() => {
    setDistanceInput(settings.swipeNavDistanceThresholdPct.toString());
    setVelocityInput(settings.swipeNavVelocityThreshold.toString());
  }, [settings.swipeNavDistanceThresholdPct, settings.swipeNavVelocityThreshold]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400">
        <Hand className="w-4 h-4" />
        <h3 className="font-semibold">Swipe Navigation</h3>
      </div>
      <div className="space-y-3 pl-6">
        <div className="space-y-2">
          <Label htmlFor="swipe-distance-threshold">Distance Threshold (% of width)</Label>
          <NumericInput
            id="swipe-distance-threshold"
            value={distanceInput}
            onChange={setDistanceInput}
            onBlur={() =>
              validateAndSave(
                distanceInput,
                10,
                60,
                settings.swipeNavDistanceThresholdPct,
                settings.setSwipeNavDistanceThresholdPct,
                setDistanceInput,
              )
            }
            min={10}
            max={60}
            step={1}
            onIncrement={() =>
              incrementSetting(
                settings.swipeNavDistanceThresholdPct,
                1,
                60,
                settings.setSwipeNavDistanceThresholdPct,
                setDistanceInput,
              )
            }
            onDecrement={() =>
              decrementSetting(
                settings.swipeNavDistanceThresholdPct,
                1,
                10,
                settings.setSwipeNavDistanceThresholdPct,
                setDistanceInput,
              )
            }
          />
          <p className="text-xs text-muted-foreground">
            How far you must drag (as % of screen width) to commit the page change (10-60). Lower = more sensitive.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="swipe-velocity-threshold">Flick Velocity (px/s)</Label>
          <NumericInput
            id="swipe-velocity-threshold"
            value={velocityInput}
            onChange={setVelocityInput}
            onBlur={() =>
              validateAndSave(
                velocityInput,
                100,
                2000,
                settings.swipeNavVelocityThreshold,
                settings.setSwipeNavVelocityThreshold,
                setVelocityInput,
              )
            }
            min={100}
            max={2000}
            step={50}
            onIncrement={() =>
              incrementSetting(
                settings.swipeNavVelocityThreshold,
                50,
                2000,
                settings.setSwipeNavVelocityThreshold,
                setVelocityInput,
              )
            }
            onDecrement={() =>
              decrementSetting(
                settings.swipeNavVelocityThreshold,
                50,
                100,
                settings.setSwipeNavVelocityThreshold,
                setVelocityInput,
              )
            }
          />
          <p className="text-xs text-muted-foreground">
            Minimum flick speed that commits regardless of distance (100-2000). Lower = lighter flicks.
          </p>
        </div>
      </div>
    </div>
  );
}
