"use client";

import { useState } from "react";
import { HeartPulse, Info, Plus, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useUserProfile,
  useSaveProfile,
  MAX_CONDITIONS,
  MAX_CONDITION_LENGTH,
} from "@/hooks/use-profile-queries";

/**
 * Profile section for user-reported medical conditions. The conditions stay on
 * the device and only reach the AI when the user opts in — at which point the
 * disclaimer dialog is shown so the limits of AI insights are explicit.
 */
export function MedicalContextSection() {
  const profile = useUserProfile();
  const { mutate: save } = useSaveProfile();
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);

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

  const handleShareToggle = (next: boolean) => {
    save({ shareConditionsWithAI: next });
    // Surface the disclaimer the moment sharing becomes active.
    if (next) setDisclaimerOpen(true);
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
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-7 w-7"
              aria-label="About medical context and AI insights"
              onClick={() => setDisclaimerOpen(true)}
            >
              <Info className="w-4 h-4 text-muted-foreground" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Conditions you add stay on this device. When sharing is on, they
            give AI insights clinical context — for example, why your sodium
            and fluid limits matter, and which trends are worth watching.
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

          <div className="flex items-center justify-between gap-3 pt-3 border-t">
            <div className="space-y-0.5">
              <Label htmlFor="share-conditions-ai" className="text-sm">
                Share with AI insights
              </Label>
              <p className="text-xs text-muted-foreground">
                Include these conditions when generating AI insights.
              </p>
            </div>
            <Switch
              id="share-conditions-ai"
              checked={profile.shareConditionsWithAI}
              onCheckedChange={handleShareToggle}
            />
          </div>
        </CardContent>
      </Card>

      <Dialog open={disclaimerOpen} onOpenChange={setDisclaimerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>About AI insights</DialogTitle>
            <DialogDescription className="space-y-2 pt-1 text-left">
              <span className="block">
                Sharing your conditions helps the AI frame your tracked data.
                But its insights are only an attempt to guess what might be
                going on — they can, and sometimes will, be wrong.
              </span>
              <span className="block">
                AI insights are meant to help you better understand your data
                and prepare for a consultation with your doctor. They are not a
                diagnosis and never replace a qualified medical professional.
              </span>
              <span className="block">
                Always discuss any concerns — and any action you might take —
                with your healthcare provider.
              </span>
            </DialogDescription>
          </DialogHeader>
          <Button onClick={() => setDisclaimerOpen(false)}>Got it</Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
