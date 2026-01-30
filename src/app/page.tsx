"use client";

import { useCallback, useEffect, useState } from "react";
import { IntakeCard } from "@/components/intake-card";
import { FoodCalculator } from "@/components/food-calculator";
import { VoiceInput } from "@/components/voice-input";
import { SettingsSheet } from "@/components/settings-sheet";
import { HistorySheet } from "@/components/history-sheet";
import { AuthButton } from "@/components/auth-button";
import { AuthGuard } from "@/components/auth-guard";
import { useIntake } from "@/hooks/use-intake";
import { useSettings } from "@/hooks/use-settings";
import { Droplets } from "lucide-react";

function HomeContent() {
  const [mounted, setMounted] = useState(false);
  const waterIntake = useIntake("water");
  const saltIntake = useIntake("salt");
  const settings = useSettings();

  // Handle hydration mismatch for localStorage
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleAddWater = useCallback(
    async (amount: number, source: string = "manual", timestamp?: number) => {
      await waterIntake.addRecord(amount, source, timestamp);
    },
    [waterIntake]
  );

  const handleAddSalt = useCallback(
    async (amount: number, source: string = "manual", timestamp?: number) => {
      await saltIntake.addRecord(amount, source, timestamp);
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
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Intake Tracker</h1>
          <p className="text-sm text-muted-foreground">
            Rolling 24-hour monitoring
          </p>
        </div>
        <div className="flex items-center gap-2">
          <HistorySheet />
          <AuthButton />
          <SettingsSheet />
        </div>
      </header>

        {/* Intake Cards */}
        <div className="space-y-4 mb-6">
          <IntakeCard
            type="water"
            currentTotal={waterIntake.total}
            limit={settings.waterLimit}
            increment={settings.waterIncrement}
            onConfirm={(amount, timestamp) => handleAddWater(amount, "manual", timestamp)}
            isLoading={waterIntake.isLoading}
          />

          <IntakeCard
            type="salt"
            currentTotal={saltIntake.total}
            limit={settings.saltLimit}
            increment={settings.saltIncrement}
            onConfirm={(amount, timestamp) => handleAddSalt(amount, "manual", timestamp)}
            isLoading={saltIntake.isLoading}
          />
        </div>

        {/* Additional Input Methods */}
        <div className="flex gap-3">
          <FoodCalculator onAddWater={handleAddWater} />
          <VoiceInput onAddWater={handleAddWater} onAddSalt={handleAddSalt} />
        </div>

      {/* Footer */}
      <footer className="mt-8 text-center text-xs text-muted-foreground">
        <p>Track your intake to maintain heart health</p>
        <p className="mt-1">
          Water: max 1L/day • Salt: max 1500mg/day
        </p>
      </footer>
    </>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-4 py-6 max-w-lg">
        <AuthGuard>
          <HomeContent />
        </AuthGuard>
      </div>
    </main>
  );
}
