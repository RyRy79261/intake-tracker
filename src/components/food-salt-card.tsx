"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Utensils } from "lucide-react";
import { cn, formatAmount } from "@/lib/utils";
import { CARD_THEMES } from "@/lib/card-themes";
import { useIntake } from "@/hooks/use-intake-queries";
import { useSettings } from "@/hooks/use-settings";
import { FoodSection } from "@/components/food-salt/food-section";
import { computeTwoStageProgress } from "@/lib/progress-utils";

export function FoodSaltCard() {
  const saltIntake = useIntake("salt");
  const sugarIntake = useIntake("sugar");
  const settings = useSettings();
  const { dailyTotal, rollingTotal } = saltIntake;
  const limit = settings.saltLimit;
  const saltProgress = computeTwoStageProgress(
    dailyTotal,
    limit,
    settings.saltExtendedBuffer
  );

  const sugarDaily = sugarIntake.dailyTotal;
  const sugarRolling = sugarIntake.rollingTotal;
  const sugarLimit = settings.sugarLimit;
  const sugarProgress = computeTwoStageProgress(
    sugarDaily,
    sugarLimit,
    settings.sugarExtendedBuffer
  );

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
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium text-muted-foreground">
              Sodium
            </span>
            <div className="text-right">
              <p
                className={cn(
                  "text-sm font-medium",
                  saltProgress.isOverExtended
                    ? "text-red-600 dark:text-red-400"
                    : saltProgress.isOverTarget
                      ? "text-orange-600 dark:text-orange-400"
                      : "text-foreground"
                )}
              >
                {formatAmount(dailyTotal, "mg")} / {formatAmount(limit, "mg")}
              </p>
              <p className="text-xs text-muted-foreground/70">
                24h: {formatAmount(rollingTotal, "mg")}
              </p>
            </div>
          </div>
          <Progress
            value={saltProgress.isOverExtended ? 100 : saltProgress.primaryPct}
            extendedValue={saltProgress.isOverExtended ? 0 : saltProgress.extendedPct}
            className="h-3"
            indicatorClassName={
              saltProgress.isOverExtended
                ? CARD_THEMES.salt.progressOverLimit
                : CARD_THEMES.salt.progressGradient
            }
            extendedIndicatorClassName={CARD_THEMES.salt.progressExtended}
            aria-label="Sodium intake today, as a percentage of the daily limit"
          />
        </div>

        {/* Sugar total + progress bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium text-muted-foreground">
              Sugar
            </span>
            <div className="text-right">
              <p
                className={cn(
                  "text-sm font-medium",
                  sugarProgress.isOverExtended
                    ? "text-red-600 dark:text-red-400"
                    : sugarProgress.isOverTarget
                      ? "text-orange-600 dark:text-orange-400"
                      : "text-foreground"
                )}
              >
                {formatAmount(sugarDaily, "g")} / {formatAmount(sugarLimit, "g")}
              </p>
              <p className="text-xs text-muted-foreground/70">
                24h: {formatAmount(sugarRolling, "g")}
              </p>
            </div>
          </div>
          <Progress
            value={sugarProgress.isOverExtended ? 100 : sugarProgress.primaryPct}
            extendedValue={sugarProgress.isOverExtended ? 0 : sugarProgress.extendedPct}
            className="h-3"
            indicatorClassName={
              sugarProgress.isOverExtended
                ? CARD_THEMES.sugar.progressOverLimit
                : CARD_THEMES.sugar.progressGradient
            }
            extendedIndicatorClassName={CARD_THEMES.sugar.progressExtended}
            aria-label="Sugar intake today, as a percentage of the daily limit"
          />
        </div>

        {/* Food section */}
        <FoodSection />
      </CardContent>
    </Card>
  );
}
