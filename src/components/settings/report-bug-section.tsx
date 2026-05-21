"use client";

import { useState } from "react";
import { Bug, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ReportBugDialog } from "@/components/report-bug-dialog";
import { useSettings } from "@/hooks/use-settings";
import { useToast } from "@/hooks/use-toast";
import { requestMotionPermission } from "@/hooks/use-shake-gesture";

export function ReportBugSection() {
  const [open, setOpen] = useState(false);
  const settings = useSettings();
  const { toast } = useToast();

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
      </div>
      <ReportBugDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
