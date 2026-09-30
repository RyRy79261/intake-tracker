"use client";

import { useEffect, useState } from "react";
import { WeightCard } from "@/components/weight-card";
import { BloodPressureCard } from "@/components/blood-pressure-card";
import { TodayGadget } from "@/components/home/today-gadget";
import { UrinationCard } from "@/components/urination-card";
import { DefecationCard } from "@/components/defecation-card";
import { LiquidsCard } from "@/components/liquids-card";
import { FoodSaltCard } from "@/components/food-salt-card";
import { Droplets } from "lucide-react";
import { useIsDesktop } from "@/hooks/use-shell-mode";

/**
 * Home: the Today gadget over a scroll of the module cards; on the desktop
 * (1024px or more with a mouse) the same cards on a grid. The shell renders
 * it under the windows on every window route, so it stays mounted while
 * windows open and close.
 */
export function HomePageBody() {
  const [mounted, setMounted] = useState(false);
  const desktop = useIsDesktop();

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
    <div className={desktop ? "wd-home" : "flex flex-col gap-2.5 pb-3"} data-layout={desktop ? "desktop" : "phone"}>
      <TodayGadget wide={desktop} />
      <div className="wc-mods">
        <div id="section-water">
          <LiquidsCard />
        </div>
        <div id="section-food-salt">
          <FoodSaltCard />
        </div>
        <div id="section-bp">
          <BloodPressureCard />
        </div>
        <div id="section-weight">
          <WeightCard />
        </div>
        <div id="section-urination">
          <UrinationCard />
        </div>
        <div id="section-defecation">
          <DefecationCard />
        </div>
      </div>
    </div>
  );
}
