"use client";

import { useEffect, useRef, useState } from "react";
import { WeightCard } from "@/components/weight-card";
import { BloodPressureCard } from "@/components/blood-pressure-card";
import { TodayGadget } from "@/components/home/today-gadget";
import { UrinationCard } from "@/components/urination-card";
import { DefecationCard } from "@/components/defecation-card";
import { LiquidsCard } from "@/components/liquids-card";
import { FoodSaltCard } from "@/components/food-salt-card";
import { Droplets } from "lucide-react";
import { useIsDesktop } from "@/hooks/use-shell-mode";

/** The gap under each card in the desktop masonry. */
const HOME_GUTTER_PX = 16;

/**
 * Home: the Today gadget over a scroll of the module cards; on the desktop
 * (1024px or more with a mouse) the same cards as a masonry. The shell renders
 * it under the windows on every window route, so it stays mounted while
 * windows open and close.
 */
export function HomePageBody() {
  const [mounted, setMounted] = useState(false);
  const desktop = useIsDesktop();
  const rootRef = useRef<HTMLDivElement>(null);

  // Desktop masonry (see `.wd-home` in ward-desktop.css): the grid's rows are
  // 1px tall, so each card spans its own height plus the gutter under it.
  // The cards stay where they are in the tree, so switching layout keeps
  // whatever was typed into them.
  useEffect(() => {
    const root = rootRef.current;
    if (!desktop || !mounted || !root || typeof ResizeObserver === "undefined") return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(":scope > .wc-today, :scope > .wc-mods > *"));
    const place = (el: HTMLElement) => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h > 0) el.style.gridRowEnd = `span ${h + HOME_GUTTER_PX}`;
    };
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) place(e.target as HTMLElement);
    });
    for (const el of items) {
      place(el);
      ro.observe(el);
    }
    return () => {
      ro.disconnect();
      for (const el of items) el.style.gridRowEnd = "";
    };
  }, [desktop, mounted]);

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
    <div
      ref={rootRef}
      className={desktop ? "wd-home" : "flex flex-col gap-2.5 pb-3"}
      data-layout={desktop ? "desktop" : "phone"}
    >
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
