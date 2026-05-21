"use client";

import { useState, useEffect } from "react";
import { Bug, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { NumericInput } from "@/components/ui/numeric-input";
import { ReportBugDialog } from "@/components/report-bug-dialog";
import { useSettings } from "@/hooks/use-settings";
import { useToast } from "@/hooks/use-toast";
import { requestMotionPermission } from "@/hooks/use-shake-gesture";
import {
  validateAndSave,
  incrementSetting,
  decrementSetting,
} from "@/lib/settings-helpers";

export function ReportBugSection() {
  const [open, setOpen] = useState(false);
  const settings = useSettings();
  const { toast } = useToast();

  const [thresholdInput, setThresholdInput] = useState(
    settings.shakeThreshold.toString(),
  );
  const [joltsInput, setJoltsInput] = useState(
    settings.shakeRequiredJolts.toString(),
  );

  useEffect(() => {
    setThresholdInput(settings.shakeThreshold.toString());
    setJoltsInput(settings.shakeRequiredJolts.toString());
  }, [settings.shakeThreshold, settings.shakeRequiredJolts]);

  const handleShakeToggle = async (checked: boolean) => {
    if (!checked) {
      settings.setShakeToReportEnabled(false);
      return;
    }
    const result = await requestMotionPermission();
    if (result === "denied") {
      toast({
        title: "Motion access blocked",
        description:
          "Allow motion & orientation access for this site to use shake-to-report.",
        variant: "destructive",
      });
      return;
    }
    settings.setShakeToReportEnabled(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
        <Bug className="w-4 h-4" />
        <h3 className="font-semibold">Report a bug</h3>
      </div>
      <div className="space-y-3 pl-6">
        <p className="text-sm text-muted-foreground">
          Found a problem, or have an idea? File it on GitHub directly from the
          app. Environment info and recent error logs are attached
          automatically, with personal data removed first.
        </p>
        <Button size="sm" className="gap-2" onClick={() => setOpen(true)}>
          <Bug className="h-4 w-4" />
          Report a bug
        </Button>

        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="space-y-0.5">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Smartphone className="h-3.5 w-3.5" />
              Shake to report
            </p>
            <p className="text-xs text-muted-foreground">
              Give your device a shake to open this dialog from anywhere.
            </p>
          </div>
          <Switch
            checked={settings.shakeToReportEnabled}
            onCheckedChange={handleShakeToggle}
          />
        </div>

        {settings.shakeToReportEnabled && (
          <>
            <div className="space-y-2">
              <Label htmlFor="shake-threshold">Shake sensitivity</Label>
              <NumericInput
                id="shake-threshold"
                value={thresholdInput}
                onChange={setThresholdInput}
                onBlur={() =>
                  validateAndSave(
                    thresholdInput,
                    8,
                    40,
                    settings.shakeThreshold,
                    settings.setShakeThreshold,
                    setThresholdInput,
                  )
                }
                min={8}
                max={40}
                step={1}
                onIncrement={() =>
                  incrementSetting(
                    settings.shakeThreshold,
                    1,
                    40,
                    settings.setShakeThreshold,
                    setThresholdInput,
                  )
                }
                onDecrement={() =>
                  decrementSetting(
                    settings.shakeThreshold,
                    1,
                    8,
                    settings.setShakeThreshold,
                    setThresholdInput,
                  )
                }
              />
              <p className="text-xs text-muted-foreground">
                Jolt strength needed to register a shake (8-40). Lower = more
                sensitive.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="shake-jolts">Jolts required</Label>
              <NumericInput
                id="shake-jolts"
                value={joltsInput}
                onChange={setJoltsInput}
                onBlur={() =>
                  validateAndSave(
                    joltsInput,
                    2,
                    8,
                    settings.shakeRequiredJolts,
                    settings.setShakeRequiredJolts,
                    setJoltsInput,
                  )
                }
                min={2}
                max={8}
                step={1}
                onIncrement={() =>
                  incrementSetting(
                    settings.shakeRequiredJolts,
                    1,
                    8,
                    settings.setShakeRequiredJolts,
                    setJoltsInput,
                  )
                }
                onDecrement={() =>
                  decrementSetting(
                    settings.shakeRequiredJolts,
                    1,
                    2,
                    settings.setShakeRequiredJolts,
                    setJoltsInput,
                  )
                }
              />
              <p className="text-xs text-muted-foreground">
                How many jolts within ~0.8s open the dialog (2-8). Higher =
                fewer accidental triggers.
              </p>
            </div>
          </>
        )}
      </div>
      <ReportBugDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
