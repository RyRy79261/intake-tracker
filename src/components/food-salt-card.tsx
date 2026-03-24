"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Utensils } from "lucide-react";
import { cn } from "@/lib/utils";
import { CARD_THEMES } from "@/lib/card-themes";
import { formatDateTime } from "@/lib/date-utils";
import { useEatingRecords } from "@/hooks/use-eating-queries";
import { FoodSection } from "@/components/food-salt/food-section";
import { SaltSection } from "@/components/food-salt/salt-section";

export function FoodSaltCard() {
  const recentEatings = useEatingRecords(5);
  const latestEating = recentEatings?.[0];

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all duration-300 bg-gradient-to-br",
        CARD_THEMES.eating.gradient,
        CARD_THEMES.eating.border
      )}
    >
      <CardContent className="p-6">
        {/* Card header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={cn("p-2 rounded-lg", CARD_THEMES.eating.iconBg)}>
              <Utensils
                className={cn("w-5 h-5", CARD_THEMES.eating.iconColor)}
              />
            </div>
            <span className="font-semibold text-lg uppercase tracking-wide">
              Food + Salt
            </span>
          </div>
          {latestEating ? (
            <p className="text-xs text-muted-foreground">
              {formatDateTime(latestEating.timestamp)}
            </p>
          ) : null}
        </div>

        {/* Food section */}
        <FoodSection />

        {/* Section divider */}
        <div className="border-t border-border/50 my-4" />

        {/* Salt section */}
        <SaltSection />
      </CardContent>
    </Card>
  );
}
