"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, useScroll, useMotionValueEvent } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IntakeCard } from "@/components/intake-card";
import { FoodCalculator } from "@/components/food-calculator";
import { VoiceInput } from "@/components/voice-input";
import { AuthGuard } from "@/components/auth-guard";
import { WeightCard } from "@/components/weight-card";
import { BloodPressureCard } from "@/components/blood-pressure-card";
import { Button } from "@/components/ui/button";
import { useIntake } from "@/hooks/use-intake-queries";
import { useSettings } from "@/hooks/use-settings";
import { usePinProtected } from "@/hooks/use-pin-gate";
import { Droplets, History, Settings, Lock } from "lucide-react";

function HomeContent() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);
  const waterIntake = useIntake("water");
  const saltIntake = useIntake("salt");
  const settings = useSettings();
  const { showLockedUI } = usePinProtected();

  // Scroll detection for hiding/showing header
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (current) => {
    const previous = scrollY.getPrevious() ?? 0;
    // Hide when scrolling down and not at top
    setHeaderHidden(current > previous && current > 50);
  });

  // Handle hydration mismatch for localStorage
  useEffect(() => {
    setMounted(true);
  }, []);

  // Prefetch routes for faster navigation
  useEffect(() => {
    router.prefetch("/settings");
    router.prefetch("/history");
  }, [router]);

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
      <motion.header
        className="sticky top-0 z-40 -mx-4 px-4 py-4 mb-2 bg-gradient-to-b from-slate-50 to-slate-50/95 dark:from-slate-950 dark:to-slate-950/95 backdrop-blur-sm flex items-center justify-between"
        animate={{ y: headerHidden ? "-100%" : 0 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Intake Tracker</h1>
          <p className="text-sm text-muted-foreground">
            Daily budget tracking
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="shrink-0 relative" asChild>
            <Link href="/history">
              <History className="w-5 h-5" />
              {showLockedUI && <Lock className="w-3 h-3 absolute -top-0.5 -right-0.5 text-amber-500" />}
              <span className="sr-only">History</span>
            </Link>
          </Button>
          <Button variant="ghost" size="icon" className="shrink-0 relative" asChild>
            <Link href="/settings">
              <Settings className="w-5 h-5" />
              {showLockedUI && <Lock className="w-3 h-3 absolute -top-0.5 -right-0.5 text-amber-500" />}
              <span className="sr-only">Settings</span>
            </Link>
          </Button>
        </div>
      </motion.header>

        {/* Intake Cards */}
        <div className="space-y-4 mb-6">
          <IntakeCard
            type="water"
            dailyTotal={waterIntake.dailyTotal}
            rollingTotal={waterIntake.rollingTotal}
            limit={settings.waterLimit}
            increment={settings.waterIncrement}
            onConfirm={(amount, timestamp, note) => handleAddWater(amount, "manual", timestamp, note)}
            isLoading={waterIntake.isLoading}
          />

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

        {/* Additional Input Methods */}
        <div className="flex gap-3 mb-6">
          <FoodCalculator onAddWater={handleAddWater} />
          <VoiceInput onAddWater={handleAddWater} onAddSalt={handleAddSalt} />
        </div>

        {/* Health Measurements */}
        <div className="space-y-4 mb-6">
          <WeightCard />
          <BloodPressureCard />
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
