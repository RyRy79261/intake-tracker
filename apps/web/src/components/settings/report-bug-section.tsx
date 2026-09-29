"use client";

import { useState, useEffect } from "react";
import { Bug, ChevronDown } from "lucide-react";
import { Button } from "@intake/ui/button";
import { Label } from "@intake/ui/label";
import { NumericInput } from "@intake/ui/numeric-input";
import { ReportBugDialog } from "@/components/report-bug-dialog";
import { SubHead, Tog, helpClass } from "@/components/settings/settings-kit";
import { domainColor } from "@/lib/domain-colors";
import { cn } from "@/lib/utils";
import { useSettings } from "@/hooks/use-settings";
import { useToast } from "@intake/ui/use-toast";
import { requestMotionPermission } from "@/hooks/use-shake-gesture";
import {
  validateAndSave,
  incrementSetting,
  decrementSetting,
} from "@intake/core/settings";

export function ReportBugSection() {
  const [open, setOpen] = useState(false);
  const [sensOpen, setSensOpen] = useState(false);
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
    <>
      <SubHead icon={Bug} color={domainColor("bp")}>
        Report a bug
      </SubHead>
      <p className={helpClass}>
        Found a problem, or have an idea? File it on GitHub directly from the
        app. Environment info and recent error logs are attached
        automatically, with personal data removed first.
      </p>
      <Button className="self-start" onClick={() => setOpen(true)}>
        <Bug className="h-4 w-4" />
        Report a bug
      </Button>

      <Tog
        id="set-shake"
        label="Shake to report"
        description="Give your device a shake to open this dialog from anywhere."
        checked={settings.shakeToReportEnabled}
        onCheckedChange={(v) => void handleShakeToggle(v)}
      />

      {settings.shakeToReportEnabled && (
        <div>
          <button
            type="button"
            aria-expanded={sensOpen}
            aria-controls="shake-sensitivity"
            onClick={() => setSensOpen((o) => !o)}
            className="flex min-h-11 w-full items-center gap-2 text-left text-sm font-medium"
          >
            Shake sensitivity
            <ChevronDown aria-hidden="true" className={cn("ml-auto h-4 w-4", sensOpen && "rotate-180")} />
          </button>
          {sensOpen && (
          <div id="shake-sensitivity" className="flex flex-col gap-3 border-l-2 border-line pl-2.5">
            <div className="space-y-2">
              <Label htmlFor="shake-threshold">Jolt threshold</Label>
              <NumericInput
                id="shake-threshold"
                value={thresholdInput}
                onChange={setThresholdInput}
                onBlur={() =>
                  validateAndSave(
                    thresholdInput,
                    4,
                    20,
                    settings.shakeThreshold,
                    settings.setShakeThreshold,
                    setThresholdInput,
                  )
                }
                min={4}
                max={20}
                step={1}
                onIncrement={() =>
                  incrementSetting(
                    settings.shakeThreshold,
                    1,
                    20,
                    settings.setShakeThreshold,
                    setThresholdInput,
                  )
                }
                onDecrement={() =>
                  decrementSetting(
                    settings.shakeThreshold,
                    1,
                    4,
                    settings.setShakeThreshold,
                    setThresholdInput,
                  )
                }
              />
              <p className={helpClass}>
                Movement strength needed to register a shake (4-20). Lower =
                more sensitive.
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
              <p className={helpClass}>
                How many jolts within ~0.8s open the dialog (2-8). Higher =
                fewer accidental triggers.
              </p>
            </div>
          </div>
          )}
        </div>
      )}
      <ReportBugDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
