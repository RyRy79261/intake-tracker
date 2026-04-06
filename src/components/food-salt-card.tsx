"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Utensils } from "lucide-react";
import { cn, formatAmount } from "@/lib/utils";
import { CARD_THEMES } from "@/lib/card-themes";
import { useIntake } from "@/hooks/use-intake-queries";
import { useSettings } from "@/hooks/use-settings";
import { FoodSection } from "@/components/food-salt/food-section";

export function FoodSaltCard() {
  const saltIntake = useIntake("salt");
  const settings = useSettings();
  const { dailyTotal, rollingTotal } = saltIntake;
  const limit = settings.saltLimit;
  const progressPercent =
    limit > 0 ? Math.min((dailyTotal / limit) * 100, 100) : 0;
  const isOverLimit = limit > 0 && dailyTotal > limit;

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
              Food + Sodium
            </span>
          </div>
          <div className="text-right">
            <p
              className={cn(
                "text-sm font-medium",
                isOverLimit
                  ? "text-red-600 dark:text-red-400"
                  : "text-foreground"
              )}
            >
              {formatAmount(dailyTotal, "mg")} / {formatAmount(limit, "mg")}
            </p>
            <p className="text-xs text-muted-foreground">today (sodium)</p>
            <p className="text-xs text-muted-foreground/70">
              24h: {formatAmount(rollingTotal, "mg")}
            </p>
          </div>
        </div>

        {/* Sodium progress bar */}
        <div className="mb-4">
          <Progress
            value={progressPercent}
            className="h-3"
            indicatorClassName={cn(
              isOverLimit ? CARD_THEMES.salt.progressOverLimit : CARD_THEMES.salt.progressGradient
            )}
          />
        </div>

        {/* Food section */}
        <FoodSection />
      </CardContent>
    </Card>
  );
}
