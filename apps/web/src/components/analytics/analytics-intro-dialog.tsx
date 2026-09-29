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
      <DialogContent className="wm-dialog w-[calc(100%-24px)] border-line sm:max-w-md">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle>Your analytics</DialogTitle>
          <DialogDescription>
            A quick look at what this page can do.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="wm-ib">
            <BarChart3 className="text-water" aria-hidden="true" />
            <div>
              <h3>On this device</h3>
              <p>
                A summary of your key metrics, blood pressure and weight trends,
                fluid balance, and pre-built correlations — all computed
                privately on your device from your logged records.
              </p>
            </div>
          </div>

          <div className="wm-ib">
            <Cloud className="text-ai" aria-hidden="true" />
            <div>
              <h3>
                With CloudSync
                <Sparkles className="h-4 w-4 text-ai" aria-hidden="true" />
              </h3>
              <p>
                If you enable CloudSync, your data is also analysed on the
                server — unlocking AI-enhanced analytics and deeper,
                predefined analytic queries that go beyond what runs locally.
              </p>
              <p>
                CloudSync is optional and can be enabled any time from the
                Settings page.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button className="w-full" onClick={() => setSeen(true)}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
