"use client";

import { useState } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { useShakeGesture } from "@/hooks/use-shake-gesture";
import { ReportBugDialog } from "@/components/report-bug-dialog";

/**
 * Mounted once globally. Shaking the device opens the bug-report / feature-
 * request dialog. Shake detection pauses while the dialog is already open.
 */
export function ShakeToReport() {
  const enabled = useSettingsStore((s) => s.shakeToReportEnabled);
  const [open, setOpen] = useState(false);

  useShakeGesture({
    enabled: enabled && !open,
    onShake: () => setOpen(true),
  });

  if (!enabled && !open) return null;

  return <ReportBugDialog open={open} onOpenChange={setOpen} defaultType="bug" />;
}
