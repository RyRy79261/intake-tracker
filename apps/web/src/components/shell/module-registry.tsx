"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { TodayGadget } from "@/components/home/today-gadget";
import { LiquidsCard } from "@/components/liquids-card";
import { FoodSaltCard } from "@/components/food-salt-card";
import { BloodPressureCard } from "@/components/blood-pressure-card";
import { WeightCard } from "@/components/weight-card";
import { EstimateTrackerCard } from "@/components/estimate-tracker-card";
import { DESK_MODULES, MODULE_IDS, type DeskModule, type ModuleId } from "@/lib/desk-modules";

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

/** The card of each module, inside its section (Today is not a card). */
const CARDS: Record<Exclude<ModuleId, "today">, ComponentType> = {
  liquids: LiquidsCard,
  food: FoodSaltCard,
  bp: BloodPressureCard,
  weight: WeightCard,
  wee: () => <EstimateTrackerCard tracker="urination" />,
  bowel: () => <EstimateTrackerCard tracker="defecation" />,
};

export interface ModuleEntry extends DeskModule {
  /**
   * What the module shows: for a card, the card inside its `sectionId`
   * element (on Home and in its desk window alike); for Today, the gadget
   * that picks its layout from the window's width.
   */
  Body: ComponentType;
}

function sectionBody(id: Exclude<ModuleId, "today">): ComponentType {
  const Card = CARDS[id];
  const sectionId = DESK_MODULES[id].sectionId ?? undefined;
  function Section() {
    return (
      <div id={sectionId}>
        <Card />
      </div>
    );
  }
  Section.displayName = `ModuleSection(${id})`;
  return Section;
}

/**
 * The module registry, in Home order: the desk renders each `Body` in its
 * window, Home renders the cards (the modules with a `sectionId`) under the
 * Today gadget, and the quick links jump to those same sections.
 */
export const MODULES: readonly ModuleEntry[] = MODULE_IDS.map((id) => ({
  ...DESK_MODULES[id],
  Body: id === "today" ? TodayBody : sectionBody(id),
}));

export const MODULES_BY_ID = Object.fromEntries(MODULES.map((m) => [m.id, m])) as Record<ModuleId, ModuleEntry>;

/** The modules that are cards with a section on Home (all but Today). */
export const HOME_CARDS: readonly ModuleEntry[] = MODULES.filter((m) => m.sectionId !== null);
