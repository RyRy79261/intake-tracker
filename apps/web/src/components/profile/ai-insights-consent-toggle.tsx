"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@intake/ui/button";
import { Label } from "@intake/ui/label";
import { Switch } from "@intake/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@intake/ui/dialog";
import {
  useUserProfile,
  useSaveProfile,
  type ProfileUpdates,
} from "@/hooks/use-profile-queries";

type ToggleField = "shareConditionsWithAI" | "shareMedicationsWithAI";

interface Props {
  /** Which profile opt-in this toggle controls. */
  field: ToggleField;
  /** Toggle label text. */
  label: string;
  /** Short noun for the data being shared, e.g. "conditions", "medications". */
  noun: string;
}

/** Build a typed single-field update without an unsafe computed-key cast. */
function fieldUpdate(field: ToggleField, value: boolean): ProfileUpdates {
  return field === "shareConditionsWithAI"
    ? { shareConditionsWithAI: value }
    : { shareMedicationsWithAI: value };
}

/**
 * Disclaimer body — shared between the first-time consent prompt and the
 * informational re-open. Rendered as the dialog's accessible description.
 */
function DisclaimerBody({ noun }: { noun: string }) {
  return (
    <DialogDescription className="space-y-2 pt-1 text-left">
      <span className="block">
        Turning this on shares your {noun} with the AI when it generates
        insights. Enabling it is your consent to include that data.
      </span>
      <span className="block">
        AI insights are only an attempt to guess what your data might mean —
        they can, and sometimes will, be wrong. They are meant to help you
        understand your tracking and prepare for a consultation with your
        doctor.
      </span>
      <span className="block">
        They are not a diagnosis and never replace a qualified medical
        professional. Always discuss any concerns, and any action you might
        take, with your healthcare provider.
      </span>
    </DialogDescription>
  );
}

/**
 * Opt-in toggle for sharing a category of medical data with AI insights. The
 * first time the user enables any sharing toggle, a consent dialog appears —
 * the dialog is the opt-in. Consent is recorded once (`aiInsightsConsentAt`)
 * and covers every sharing toggle thereafter. Rendered on the profile page and
 * in Settings → Privacy & Security.
 */
export function AiInsightsConsentToggle({ field, label, noun }: Props) {
  const profile = useUserProfile();
  const { mutate: save } = useSaveProfile();
  const [dialog, setDialog] = useState<null | "consent" | "info">(null);

  const enabled = profile[field];
  // Nullish check: both null and a missing (undefined) field mean "not yet
  // consented" — `!== null` alone would let an undefined value bypass the gate.
  const hasConsented = profile.aiInsightsConsentAt != null;
  const inputId = `toggle-${field}`;

  const handleToggle = (next: boolean) => {
    // First enable ever → the dialog is the consent gate; don't save yet.
    if (next && !hasConsented) {
      setDialog("consent");
      return;
    }
    save(fieldUpdate(field, next));
  };

  const confirmConsent = () => {
    save({ ...fieldUpdate(field, true), aiInsightsConsentAt: Date.now() });
    setDialog(null);
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <Label htmlFor={inputId} className="text-sm">
              {label}
            </Label>
            <button
              type="button"
              aria-label="About AI insights"
              onClick={() => setDialog("info")}
              className="text-muted-foreground hover:text-foreground"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {enabled
              ? `Your ${noun} are included when generating AI insights.`
              : `Your ${noun} stay on this device and are not sent to the AI.`}
          </p>
        </div>
        <Switch id={inputId} checked={enabled} onCheckedChange={handleToggle} />
      </div>

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === "consent"
                ? `Share ${noun} with AI?`
                : "About AI insights"}
            </DialogTitle>
            <DisclaimerBody noun={noun} />
          </DialogHeader>
          {dialog === "consent" ? (
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button onClick={confirmConsent}>Enable insights</Button>
            </DialogFooter>
          ) : (
            <DialogFooter className="gap-2">
              <Button onClick={() => setDialog(null)}>Got it</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
