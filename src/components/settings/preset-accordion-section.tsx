"use client";

import { useRef } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Droplets, Coffee, Wine, UtensilsCrossed, X } from "lucide-react";
import { useSettingsStore, type LiquidPreset } from "@/stores/settings-store";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

function getPresetColorClass(preset: LiquidPreset): string {
  if (preset.caffeinePer100ml && preset.alcoholPer100ml) return "text-orange-500";
  if (preset.caffeinePer100ml) return "text-caffeine";
  if (preset.alcoholPer100ml) return "text-alcohol";
  return "text-foreground";
}

function formatSubstances(preset: LiquidPreset): string {
  const parts: string[] = [];
  parts.push(`${preset.defaultVolumeMl}ml`);
  if (preset.caffeinePer100ml) parts.push(`${preset.caffeinePer100ml}mg caff/100ml`);
  if (preset.alcoholPer100ml) parts.push(`${preset.alcoholPer100ml}std alc/100ml`);
  if (preset.saltPer100ml) parts.push(`${preset.saltPer100ml}mg salt/100ml`);
  return parts.join(" · ");
}

interface PresetSectionConfig {
  key: string;
  title: string;
  icon: LucideIcon;
  headerColor: string;
  filter: (p: LiquidPreset) => boolean;
}

const SECTIONS: PresetSectionConfig[] = [
  {
    key: "water",
    title: "Water Presets",
    icon: Droplets,
    headerColor: "text-foreground",
    filter: (p) => p.tab === "beverage" && !p.caffeinePer100ml && !p.alcoholPer100ml,
  },
  {
    key: "coffee",
    title: "Coffee Presets",
    icon: Coffee,
    headerColor: "text-caffeine",
    filter: (p) => p.tab === "coffee",
  },
  {
    key: "alcohol",
    title: "Alcohol Presets",
    icon: Wine,
    headerColor: "text-alcohol",
    filter: (p) => p.tab === "alcohol",
  },
  {
    key: "food",
    title: "Food & Beverage Presets",
    icon: UtensilsCrossed,
    headerColor: "text-foreground",
    filter: (p) => p.tab === "beverage" && !!(p.caffeinePer100ml || p.alcoholPer100ml),
  },
];

export function PresetAccordionSection() {
  const liquidPresets = useSettingsStore((s) => s.liquidPresets);
  const deleteLiquidPreset = useSettingsStore((s) => s.deleteLiquidPreset);
  const addLiquidPreset = useSettingsStore((s) => s.addLiquidPreset);
  const { toast } = useToast();
  const deletedRef = useRef<Omit<LiquidPreset, "id"> | null>(null);

  function handleDelete(preset: LiquidPreset) {
    const { id: _id, ...presetData } = preset;
    deletedRef.current = presetData;
    deleteLiquidPreset(preset.id);
    toast({
      title: "Preset deleted",
      description: preset.name,
      action: (
        <button
          className="text-xs font-medium underline"
          onClick={() => {
            if (deletedRef.current) {
              addLiquidPreset(deletedRef.current);
              deletedRef.current = null;
            }
          }}
        >
          Undo
        </button>
      ),
    });
  }

  return (
    <Accordion type="multiple" className="w-full">
      {SECTIONS.map((section) => {
        const Icon = section.icon;
        const presets = liquidPresets.filter(section.filter);

        return (
          <AccordionItem key={section.key} value={section.key}>
            <AccordionTrigger className={cn("text-sm", section.headerColor)}>
              <span className="flex items-center gap-2">
                <Icon className="w-4 h-4" />
                {section.title}
                <span className="text-xs text-muted-foreground font-normal">
                  ({presets.length})
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              {presets.length === 0 ? (
                <div className="py-3 text-center">
                  <p className="text-xs font-medium text-muted-foreground">No presets</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Add presets from the main dashboard cards.
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {presets.map((preset) => (
                    <div
                      key={preset.id}
                      className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-sm font-medium truncate", getPresetColorClass(preset))}>
                          {preset.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {formatSubstances(preset)}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(preset);
                        }}
                        className="shrink-0 p-1.5 rounded-md text-destructive hover:bg-destructive/10 transition-colors"
                        title={`Delete ${preset.name}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
