"use client";

import { useState } from "react";
import { HeartPulse, Plus, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  useUserProfile,
  useSaveProfile,
  MAX_CONDITIONS,
  MAX_CONDITION_LENGTH,
} from "@/hooks/use-profile-queries";
import { AiInsightsConsentToggle } from "@/components/profile/ai-insights-consent-toggle";

/**
 * Profile section for user-reported medical conditions. The conditions stay on
 * the device and back up / cloud-sync with the rest of the data. They reach
 * the AI only when the user opts in via the consent toggle.
 */
export function MedicalContextSection() {
  const profile = useUserProfile();
  const { mutate: save } = useSaveProfile();
  const { toast } = useToast();
  const [draft, setDraft] = useState("");

  const conditions = profile.conditions;

  const addCondition = () => {
    const value = draft.trim();
    if (!value) return;
    if (conditions.length >= MAX_CONDITIONS) {
      toast({
        title: "Limit reached",
        description: `You can add up to ${MAX_CONDITIONS} conditions.`,
        variant: "destructive",
      });
      return;
    }
    if (conditions.some((c) => c.toLowerCase() === value.toLowerCase())) {
      setDraft("");
      return;
    }
    save({ conditions: [...conditions, value] });
    setDraft("");
  };

  const removeCondition = (target: string) => {
    save({ conditions: conditions.filter((c) => c !== target) });
  };

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">
        Medical context
      </h2>

      <Card className="bg-white/80 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
        <CardHeader className="pt-3 pb-1 px-3">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <HeartPulse className="w-4 h-4 text-rose-500" />
            Conditions
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Conditions you add stay on this device unless you turn on sharing
            below. They give AI insights clinical context — for example, why
            your sodium and fluid limits matter, and which trends are worth
            watching.
          </p>

          {conditions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {conditions.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs"
                >
                  {c}
                  <button
                    type="button"
                    aria-label={`Remove ${c}`}
                    onClick={() => removeCondition(c)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No conditions added yet.
            </p>
          )}

          <div className="flex gap-2">
            <Input
              value={draft}
              maxLength={MAX_CONDITION_LENGTH}
              placeholder="e.g. HFrEF, idiopathic dilated cardiomyopathy"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCondition();
                }
              }}
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="shrink-0"
              aria-label="Add condition"
              onClick={addCondition}
              disabled={!draft.trim()}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="pt-3 border-t space-y-4">
            <AiInsightsConsentToggle
              field="shareConditionsWithAI"
              label="Share conditions with AI insights"
              noun="conditions"
            />
            <AiInsightsConsentToggle
              field="shareMedicationsWithAI"
              label="Share medications with AI insights"
              noun="medications"
            />
            <p className="text-xs text-muted-foreground">
              Sharing medications sends your active prescriptions — name, dose,
              frequency, and how long the current titration or maintenance
              phase has run. Manage medications on the Medications page.
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
