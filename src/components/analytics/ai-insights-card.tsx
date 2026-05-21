"use client";

import { formatDistanceToNow } from "date-fns";
import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useSettingsStore } from "@/stores/settings-store";
import { useInsightsStore } from "@/stores/insights-store";
import { useGenerateInsights, NotEnoughDataError } from "@/hooks/use-insights";
import { useUserProfile } from "@/hooks/use-profile-queries";
import { insightsRange, INSIGHTS_WINDOW_DAYS } from "@/lib/analytics-snapshot";

/**
 * On-demand AI summary of the last 30 days of tracked data. Generation is
 * user-triggered (a button) and the latest result is cached locally.
 */
export function AiInsightsCard() {
  const waterGoalMl = useSettingsStore((s) => s.waterLimit);
  const sodiumLimitMg = useSettingsStore((s) => s.saltLimit);
  const lastResult = useInsightsStore((s) => s.lastResult);
  const setResult = useInsightsStore((s) => s.setResult);
  const profile = useUserProfile();
  const { toast } = useToast();
  const { mutate, isPending } = useGenerateInsights();

  const personalised =
    profile.shareConditionsWithAI && profile.conditions.length > 0;

  const generate = () => {
    mutate(
      {
        range: insightsRange(),
        goals: { waterGoalMl, sodiumLimitMg },
        ...(personalised && { conditions: profile.conditions }),
      },
      {
        onSuccess: setResult,
        onError: (error) => {
          toast({
            title:
              error instanceof NotEnoughDataError
                ? "Not enough data"
                : "Couldn't generate insights",
            description: error.message,
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Card className="bg-white/80 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
      <CardHeader className="pt-3 pb-1 px-3">
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-violet-500" />
          AI Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-3">
        {lastResult ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-700 dark:text-slate-200">
              {lastResult.narrative}
            </p>
            {lastResult.observations.length > 0 && (
              <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                {lastResult.observations.map((observation, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span aria-hidden className="text-violet-500">
                      &bull;
                    </span>
                    <span>{observation}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              Generated{" "}
              {formatDistanceToNow(lastResult.generatedAt, { addSuffix: true })}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Generate an AI summary of your last {INSIGHTS_WINDOW_DAYS} days of
            tracked data.
          </p>
        )}

        <Button
          variant={lastResult ? "outline" : "default"}
          size="sm"
          className="w-full"
          onClick={generate}
          disabled={isPending}
        >
          {isPending
            ? "Analysing…"
            : lastResult
              ? "Regenerate"
              : "Generate insights"}
        </Button>

        {personalised && (
          <p className="text-[11px] text-muted-foreground">
            Personalised with the conditions in your profile.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
