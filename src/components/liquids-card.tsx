"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { CARD_THEMES } from "@/lib/card-themes";
import { Droplets, Coffee, Wine } from "lucide-react";
import { WaterTab } from "@/components/liquids/water-tab";
import { BeverageTab } from "@/components/liquids/beverage-tab";
import { PresetTab } from "@/components/liquids/preset-tab";
import { useIntake } from "@/hooks/use-intake-queries";
import { useSettings } from "@/hooks/use-settings";
import { cn, formatAmount } from "@/lib/utils";

const TAB_THEMES = {
  water: CARD_THEMES.water,
  beverage: CARD_THEMES.water,
  coffee: CARD_THEMES.caffeine,
  alcohol: CARD_THEMES.alcohol,
} as const;

type TabKey = keyof typeof TAB_THEMES;

const TAB_ICONS = {
  water: Droplets,
  beverage: Droplets,
  coffee: Coffee,
  alcohol: Wine,
} as const;

export function LiquidsCard() {
  const [activeTab, setActiveTab] = useState<string>("water");
  const waterIntake = useIntake("water");
  const settings = useSettings();

  const theme = TAB_THEMES[activeTab as TabKey] ?? TAB_THEMES.water;
  const Icon = TAB_ICONS[activeTab as TabKey] ?? TAB_ICONS.water;

  const isOverLimit =
    settings.waterLimit > 0 && waterIntake.dailyTotal > settings.waterLimit;

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all duration-300",
        `bg-gradient-to-br ${theme.gradient} ${theme.border}`
      )}
    >
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={cn("p-2 rounded-lg", theme.iconBg)}>
              <Icon className={cn("w-5 h-5", theme.iconColor)} />
            </div>
            <span className="font-semibold text-lg uppercase tracking-wide">
              Liquids
            </span>
          </div>

          {/* Right side header content - changes per tab */}
          {activeTab === "water" && (
            <div className="text-right">
              <p
                className={cn(
                  "text-sm font-medium",
                  isOverLimit
                    ? "text-red-600 dark:text-red-400"
                    : "text-foreground"
                )}
              >
                {formatAmount(waterIntake.dailyTotal, "ml")} /{" "}
                {formatAmount(settings.waterLimit, "ml")}
              </p>
              <p className="text-xs text-muted-foreground">today</p>
              <p className="text-xs text-muted-foreground/70">
                24h: {formatAmount(waterIntake.rollingTotal, "ml")}
              </p>
            </div>
          )}
        </div>

        {/* Tab Strip */}
        <Tabs
          defaultValue="water"
          value={activeTab}
          onValueChange={setActiveTab}
        >
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="water" className="text-xs">
              Water
            </TabsTrigger>
            <TabsTrigger value="beverage" className="text-xs">
              Beverage
            </TabsTrigger>
            <TabsTrigger value="coffee" className="text-xs">
              Coffee
            </TabsTrigger>
            <TabsTrigger value="alcohol" className="text-xs">
              Alcohol
            </TabsTrigger>
          </TabsList>

          {/* Water Tab */}
          <TabsContent
            value="water"
            forceMount
            className="data-[state=inactive]:hidden mt-4"
          >
            <WaterTab />
          </TabsContent>

          {/* Beverage Tab */}
          <TabsContent
            value="beverage"
            forceMount
            className="data-[state=inactive]:hidden mt-4"
          >
            <BeverageTab />
          </TabsContent>

          {/* Coffee Tab */}
          <TabsContent
            value="coffee"
            forceMount
            className="data-[state=inactive]:hidden mt-4"
          >
            <PresetTab tab="coffee" />
          </TabsContent>

          {/* Alcohol Tab */}
          <TabsContent
            value="alcohol"
            forceMount
            className="data-[state=inactive]:hidden mt-4"
          >
            <PresetTab tab="alcohol" />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
