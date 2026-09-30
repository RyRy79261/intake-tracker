"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@intake/ui/button";
import { Input } from "@intake/ui/input";
import { useToast } from "@intake/ui/use-toast";
import {
  useUserProfile,
  useSaveProfile,
  MAX_CONDITIONS,
  MAX_CONDITION_LENGTH,
} from "@/hooks/use-profile-queries";
import { usePrescriptions } from "@/hooks/use-medication-queries";
import { AiInsightsConsentToggle } from "@/components/profile/ai-insights-consent-toggle";
import { ProfileSec, kvClass } from "@/components/profile/profile-sec";

/**
 * Profile Health and AI sections: user-reported medical conditions, the active
 * prescriptions (read-only), and the AI-sharing opt-ins. The conditions back up
 * and cloud-sync with the rest of the data (so the copy must not say they stay
 * on the device). They reach the AI only when the user opts in via the
 * consent toggle.
 */
export function MedicalContextSection({
  signedIn = true,
}: {
  /** Signed out: AI features are unavailable, so the AI block says so. */
  signedIn?: boolean;
} = {}) {
  const profile = useUserProfile();
  const prescriptions = usePrescriptions();
  const activeMeds = prescriptions.filter((rx) => rx.isActive);
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
    <>
      <section aria-labelledby="profile-health" data-domain="meds">
        <ProfileSec id="profile-health">Health</ProfileSec>
        <dl className={kvClass}>
          <dt>Conditions</dt>
          <dd>
            {conditions.length > 0 ? (
              <ul className="flex flex-wrap gap-x-1.5 gap-y-2">
                {conditions.map((c) => (
                  <li
                    key={c}
                    className="inline-flex min-h-9 max-w-full items-center border border-line pl-2.5 text-sm"
                  >
                    <span className="min-w-0 break-words">{c}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${c}`}
                      onClick={() => removeCondition(c)}
                      className="-my-1 flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-muted-foreground">
                No conditions added yet.
              </span>
            )}
          </dd>
          <dt>Medications</dt>
          <dd>
            {activeMeds.length > 0 ? (
              activeMeds.map((rx) => (
                <span key={rx.id} className="block">
                  {rx.genericName}
                </span>
              ))
            ) : (
              <span className="text-muted-foreground">None active</span>
            )}
          </dd>
        </dl>

        <div className="mt-2.5 flex gap-2">
          <Input
            value={draft}
            maxLength={MAX_CONDITION_LENGTH}
            aria-label="Add a condition"
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
        <p className="mt-2 text-[0.8125rem] text-muted-foreground">
          Conditions you add back up and sync with the rest of your data.
          They are not sent to the AI unless you turn on sharing below;
          then they give AI insights clinical context — for example, why
          your sodium and fluid limits matter, and which trends are worth
          watching.
        </p>
      </section>

      <section aria-labelledby="profile-ai" data-domain="ai">
        <ProfileSec id="profile-ai">AI</ProfileSec>
        {!signedIn && (
          <p className="py-1.5 text-[0.8125rem] text-muted-foreground">
            Sign in to use AI features. These choices apply once you do.
          </p>
        )}
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
        <p className="mt-1 text-[0.8125rem] text-muted-foreground">
          Sharing medications sends your active prescriptions — name, dose,
          frequency, and how long the current titration or maintenance
          phase has run. Manage medications on the Medications page.
        </p>
      </section>
    </>
  );
}
