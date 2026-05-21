"use client";

import { useEffect, useState } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import {
  useShakeGesture,
  requestMotionPermission,
  motionPermissionNeeded,
} from "@/hooks/use-shake-gesture";
import { ReportBugDialog } from "@/components/report-bug-dialog";

/**
 * Mounted once globally. Shaking the device opens the bug-report / feature-
 * request dialog. Shake detection pauses while the dialog is already open.
 */
export function ShakeToReport() {
  const enabled = useSettingsStore((s) => s.shakeToReportEnabled);
  const threshold = useSettingsStore((s) => s.shakeThreshold);
  const requiredJolts = useSettingsStore((s) => s.shakeRequiredJolts);
  const [open, setOpen] = useState(false);

  useShakeGesture({
    enabled: enabled && !open,
    onShake: () => setOpen(true),
    threshold,
    requiredJolts,
  });

  // iOS 13+ gates `devicemotion` behind a permission prompt that must be
  // triggered by a user gesture. The settings toggle requests it on an
  // explicit opt-in, but the feature also ships enabled by default — so on
  // iOS we request it once on the first interaction after the app loads.
  useEffect(() => {
    if (!enabled || !motionPermissionNeeded()) return;
    const onFirstGesture = () => {
      void requestMotionPermission();
    };
    window.addEventListener("pointerdown", onFirstGesture, { once: true });
    return () => window.removeEventListener("pointerdown", onFirstGesture);
  }, [enabled]);

  if (!enabled && !open) return null;

  return <ReportBugDialog open={open} onOpenChange={setOpen} defaultType="bug" />;
}
