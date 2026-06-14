"use client";

import { useEffect, useState } from "react";
import { BarChart3, Cloud, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@intake/ui/dialog";
import { Button } from "@intake/ui/button";
import { useSettingsStore } from "@/stores/settings-store";

/**
 * One-time introduction shown the first time a user opens the analytics page.
 * Explains what local analytics offer and what CloudSync adds. Intentionally
 * has no shortcut to enable CloudSync — that stays in Settings.
 */
export function AnalyticsIntroDialog() {
  const seen = useSettingsStore((s) => s.analyticsIntroSeen);
  const setSeen = useSettingsStore((s) => s.setAnalyticsIntroSeen);

  // Avoid an SSR/hydration flash before the persisted store has settled.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const open = mounted && !seen;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setSeen(true); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Your analytics</DialogTitle>
          <DialogDescription>
            A quick look at what this page can do.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="flex gap-3">
            <BarChart3 className="w-5 h-5 shrink-0 text-sky-600 dark:text-sky-400 mt-0.5" />
            <div>
              <p className="font-medium">On this device</p>
              <p className="text-muted-foreground text-xs mt-0.5">
                A summary of your key metrics, blood pressure and weight trends,
                fluid balance, and pre-built correlations — all computed
                privately on your device from your logged records.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Cloud className="w-5 h-5 shrink-0 text-violet-600 dark:text-violet-400 mt-0.5" />
            <div>
              <p className="font-medium flex items-center gap-1.5">
                With CloudSync
                <Sparkles className="w-3.5 h-3.5 text-violet-500" />
              </p>
              <p className="text-muted-foreground text-xs mt-0.5">
                If you enable CloudSync, your data is also analysed on the
                server — unlocking AI-enhanced analytics and deeper,
                predefined analytic queries that go beyond what runs locally.
              </p>
              <p className="text-muted-foreground text-xs mt-1.5">
                CloudSync is optional and can be enabled any time from the
                Settings page.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => setSeen(true)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
