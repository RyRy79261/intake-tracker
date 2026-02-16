"use client";

import { useCallback, useEffect, useState } from "react";
import { IntakeCard } from "@/components/intake-card";
import { FoodCalculator } from "@/components/food-calculator";
import { VoiceInput } from "@/components/voice-input";
import { AuthGuard } from "@/components/auth-guard";
import { WeightCard } from "@/components/weight-card";
import { BloodPressureCard } from "@/components/blood-pressure-card";
import { AppHeader } from "@/components/app-header";
import { QuickNavFooter } from "@/components/quick-nav-footer";
import { SettingsDrawer } from "@/components/settings-drawer";
import { HistoryDrawer } from "@/components/history-drawer";
import { HistoricalGraph } from "@/components/historical-graph";
import { EatingCard } from "@/components/eating-card";
import { UrinationCard } from "@/components/urination-card";
import { DefecationCard } from "@/components/defecation-card";
import { useIntake } from "@/hooks/use-intake-queries";
import { useSettings } from "@/hooks/use-settings";
import { usePinProtected } from "@/hooks/use-pin-gate";
import { useScrollHide } from "@/hooks/use-scroll-hide";
import { cn } from "@/lib/utils";
import { Droplets } from "lucide-react";

function HomeContent() {
  const [mounted, setMounted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [foodCalcOpen, setFoodCalcOpen] = useState(false);
  const [voiceInputOpen, setVoiceInputOpen] = useState(false);
  const waterIntake = useIntake("water");
  const saltIntake = useIntake("salt");
  const settings = useSettings();
  const { showLockedUI } = usePinProtected();

  const barTransitionSec = settings.barTransitionDurationMs / 1000;
  const { isHidden, handleQuickNav } = useScrollHide({
    scrollDurationMs: settings.scrollDurationMs,
    autoHideDelayMs: settings.autoHideDelayMs,
  });

  // Handle hydration mismatch for localStorage
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleAddWater = useCallback(
    async (amount: number, source: string = "manual", timestamp?: number, note?: string) => {
      await waterIntake.addRecord(amount, source, timestamp, note);
    },
    [waterIntake]
  );

  const handleAddSalt = useCallback(
    async (amount: number, source: string = "manual", timestamp?: number, note?: string) => {
      await saltIntake.addRecord(amount, source, timestamp, note);
    },
    [saltIntake]
  );

  // Show loading state during hydration
  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Droplets className="w-6 h-6 animate-pulse" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header - hides on scroll down, shows on scroll up */}
      <AppHeader
        headerHidden={isHidden}
        showLockedUI={showLockedUI}
        onHistoryClick={() => setHistoryOpen(true)}
        onSettingsClick={() => setSettingsOpen(true)}
        transitionDuration={barTransitionSec}
      />

      {/* Settings Drawer */}
      <SettingsDrawer open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* History Drawer */}
      <HistoryDrawer open={historyOpen} onOpenChange={setHistoryOpen} />

      {/* Historical Graph - almost full width */}
      <div className="-mx-3 mb-6 px-1">
        <HistoricalGraph />
      </div>

      {/* Intake Cards */}
      <div className="space-y-4 mb-6">
        <div id="section-water">
          <IntakeCard
            type="water"
            dailyTotal={waterIntake.dailyTotal}
            rollingTotal={waterIntake.rollingTotal}
            limit={settings.waterLimit}
            increment={settings.waterIncrement}
            onConfirm={(amount, timestamp, note) => handleAddWater(amount, "manual", timestamp, note)}
            onConfirmWithSource={(amount, source, timestamp, note) => handleAddWater(amount, source, timestamp, note)}
            isLoading={waterIntake.isLoading}
          />
        </div>

        <div id="section-salt">
          <IntakeCard
            type="salt"
            dailyTotal={saltIntake.dailyTotal}
            rollingTotal={saltIntake.rollingTotal}
            limit={settings.saltLimit}
            increment={settings.saltIncrement}
            onConfirm={(amount, timestamp, note) => handleAddSalt(amount, "manual", timestamp, note)}
            isLoading={saltIntake.isLoading}
          />
        </div>
      </div>

      {/* Additional Input Methods */}
      <div className="flex gap-3 mb-6">
        <FoodCalculator
          onAddWater={handleAddWater}
          open={foodCalcOpen}
          onOpenChange={setFoodCalcOpen}
        />
        <VoiceInput
          onAddWater={handleAddWater}
          onAddSalt={handleAddSalt}
          open={voiceInputOpen}
          onOpenChange={setVoiceInputOpen}
        />
      </div>

      {/* Health Measurements */}
      <div className="space-y-4 mb-6">
        <div id="section-weight">
          <WeightCard />
        </div>
        <div id="section-bp">
          <BloodPressureCard />
        </div>
      </div>

      {/* Eating & Urination - bottom of main content */}
      <div className="space-y-4 mb-6">
        <div id="section-eating">
          <EatingCard />
        </div>
        <div id="section-urination">
          <UrinationCard />
        </div>
        <div id="section-defecation">
          <DefecationCard />
        </div>
      </div>

      {/* Footer info */}
      <footer className={cn("mt-8 text-center text-xs text-muted-foreground", settings.showQuickNav ? "pb-28" : "pb-6")}>
        <p>Track your intake to maintain heart health</p>
        <p className="mt-1">
          Water: max 1L/day · Salt: max 1500mg/day
        </p>
      </footer>

      {/* Quick Nav Footer */}
      {settings.showQuickNav && (
        <QuickNavFooter
          hidden={isHidden}
          order={settings.quickNavOrder}
          utilityOrder={settings.utilityOrder}
          transitionDuration={barTransitionSec}
          onScrollTo={handleQuickNav}
          onOpenFoodCalculator={() => setFoodCalcOpen(true)}
          onOpenVoiceInput={() => setVoiceInputOpen(true)}
        />
      )}
    </>
  );
}

export default function Home() {
  return (
    <AuthGuard>
      <HomeContent />
    </AuthGuard>
  );
}
