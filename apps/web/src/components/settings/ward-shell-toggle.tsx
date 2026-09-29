"use client";

import { Label } from "@intake/ui/label";
import { Switch } from "@intake/ui/switch";
import { useSettingsStore } from "@/stores/settings-store";

/**
 * Debug switch for the Ward Console shell (staged rollout). Device-only:
 * the setting is never synced.
 */
export function WardShellToggle() {
  const wardShell = useSettingsStore((s) => s.wardShell);
  const setWardShell = useSettingsStore((s) => s.setWardShell);

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2">
      <div className="space-y-0.5">
        <Label htmlFor="ward-shell-toggle">Ward Console shell (preview)</Label>
        <p className="text-xs text-muted-foreground">
          New top bar and bottom bar. This device only.
        </p>
      </div>
      <Switch id="ward-shell-toggle" checked={wardShell} onCheckedChange={setWardShell} />
    </div>
  );
}
