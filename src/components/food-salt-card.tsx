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
  const sugarIntake = useIntake("sugar");
  const settings = useSettings();
  const { dailyTotal, rollingTotal } = saltIntake;
  const limit = settings.saltLimit;
  const progressPercent =
    limit > 0 ? Math.min((dailyTotal / limit) * 100, 100) : 0;
  const isOverLimit = limit > 0 && dailyTotal > limit;

  const sugarDaily = sugarIntake.dailyTotal;
  const sugarRolling = sugarIntake.rollingTotal;
  const sugarLimit = settings.sugarLimit;
  const sugarProgressPercent =
    sugarLimit > 0 ? Math.min((sugarDaily / sugarLimit) * 100, 100) : 0;
  const isOverSugarLimit = sugarLimit > 0 && sugarDaily > sugarLimit;

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
        <div className="flex items-center gap-2 mb-4">
          <div className={cn("p-2 rounded-lg", CARD_THEMES.eating.iconBg)}>
            <Utensils
              className={cn("w-5 h-5", CARD_THEMES.eating.iconColor)}
            />
          </div>
          <span className="font-semibold text-lg uppercase tracking-wide">
            Food
          </span>
        </div>

        {/* Sodium total + progress bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Sodium
            </span>
            <div className="text-right">
              <span
                className={cn(
                  "text-sm font-medium",
                  isOverLimit
                    ? "text-red-600 dark:text-red-400"
                    : "text-foreground"
                )}
              >
                {formatAmount(dailyTotal, "mg")} / {formatAmount(limit, "mg")}
              </span>
              <span className="text-xs text-muted-foreground/70 ml-2">
                24h: {formatAmount(rollingTotal, "mg")}
              </span>
            </div>
          </div>
          <Progress
            value={progressPercent}
            className="h-3"
            indicatorClassName={cn(
              isOverLimit ? CARD_THEMES.salt.progressOverLimit : CARD_THEMES.salt.progressGradient
            )}
          />
        </div>

        {/* Sugar total + progress bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Sugar
            </span>
            <div className="text-right">
              <span
                className={cn(
                  "text-sm font-medium",
                  isOverSugarLimit
                    ? "text-red-600 dark:text-red-400"
                    : "text-foreground"
                )}
              >
                {formatAmount(sugarDaily, "g")} / {formatAmount(sugarLimit, "g")}
              </span>
              <span className="text-xs text-muted-foreground/70 ml-2">
                24h: {formatAmount(sugarRolling, "g")}
              </span>
            </div>
          </div>
          <Progress
            value={sugarProgressPercent}
            className="h-3"
            indicatorClassName={cn(
              isOverSugarLimit
                ? CARD_THEMES.sugar.progressOverLimit
                : CARD_THEMES.sugar.progressGradient
            )}
          />
        </div>

        {/* Food section */}
        <FoodSection />
      </CardContent>
    </Card>
  );
}
