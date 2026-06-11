"use client";

import { useEffect, useState } from "react";
import { WeightCard } from "@/components/weight-card";
import { BloodPressureCard } from "@/components/blood-pressure-card";
import { TextMetrics } from "@/components/text-metrics";
import { UrinationCard } from "@/components/urination-card";
import { DefecationCard } from "@/components/defecation-card";
import { useSettings } from "@/hooks/use-settings";
import { LiquidsCard } from "@/components/liquids-card";
import { FoodSaltCard } from "@/components/food-salt-card";
import { cn } from "@/lib/utils";
import { Droplets } from "lucide-react";

function HomeContent() {
  const [mounted, setMounted] = useState(false);
  const settings = useSettings();

  useEffect(() => {
    setMounted(true);
  }, []);

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
      <div className="mb-6">
        <TextMetrics />
      </div>

      <div className="space-y-4 mb-6">
        <div id="section-water">
          <LiquidsCard />
        </div>

        <div id="section-food-salt">
          <FoodSaltCard />
        </div>
      </div>

      <div className="space-y-4 mb-6">
        <div id="section-bp">
          <BloodPressureCard />
        </div>
        <div id="section-weight">
          <WeightCard />
        </div>
      </div>

      <div className="space-y-4 mb-6">
        <div id="section-urination">
          <UrinationCard />
        </div>
        <div id="section-defecation">
          <DefecationCard />
        </div>
      </div>

      <footer className={cn("mt-8 text-center text-xs text-muted-foreground", settings.showQuickNav ? "pb-28" : "pb-6")}>
        <p>Track your intake to maintain heart health</p>
        <p className="mt-1">
          Water: max 1L/day · Sodium: max 1500mg/day
        </p>
      </footer>
    </>
  );
}

export default function Home() {
  return <HomeContent />;
}
