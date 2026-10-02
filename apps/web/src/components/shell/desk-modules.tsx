"use client";

import { memo, useEffect, useRef, useState, type ComponentType } from "react";
import { TodayGadget } from "@/components/home/today-gadget";
import { LiquidsCard } from "@/components/liquids-card";
import { FoodSaltCard } from "@/components/food-salt-card";
import { BloodPressureCard } from "@/components/blood-pressure-card";
import { WeightCard } from "@/components/weight-card";
import { UrinationCard } from "@/components/urination-card";
import { DefecationCard } from "@/components/defecation-card";
import type { ModuleId } from "@/lib/desk-modules";

/** Today switches to its wide layout (dated columns, a row per metric) from this width. */
export const TODAY_WIDE_PX = 640;

/**
 * Today in a window: the phone layout in a narrow window, the wide one once
 * there is room. The layout is a prop of the gadget, so the window's width
 * is measured rather than left to CSS.
 */
function TodayBody() {
  const ref = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setWide(el.clientWidth >= TODAY_WIDE_PX);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} data-wide={wide}>
      <TodayGadget wide={wide} />
    </div>
  );
}

/**
 * Module id -> the content of its window: the same card Home shows on a
 * phone, under the same `#section-…` id. The card's own frame and title are
 * dropped by CSS (`.wd-module` in ward-desktop.css); the window has them.
 */
const BODIES: Record<ModuleId, ComponentType> = {
  today: TodayBody,
  liquids: () => (
    <div id="section-water">
      <LiquidsCard />
    </div>
  ),
  food: () => (
    <div id="section-food-salt">
      <FoodSaltCard />
    </div>
  ),
  bp: () => (
    <div id="section-bp">
      <BloodPressureCard />
    </div>
  ),
  weight: () => (
    <div id="section-weight">
      <WeightCard />
    </div>
  ),
  wee: () => (
    <div id="section-urination">
      <UrinationCard />
    </div>
  ),
  bowel: () => (
    <div id="section-defecation">
      <DefecationCard />
    </div>
  ),
};

/**
 * A module window's content. Dragging or resizing the window renders the
 * frame on every pointer move; the content does not depend on any of that.
 */
export const ModuleBody = memo(function ModuleBody({ id }: { id: ModuleId }) {
  const Body = BODIES[id];
  return (
    <div className="wd-module">
      <Body />
    </div>
  );
});
