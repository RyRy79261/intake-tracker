"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useUserProfile, useSaveProfile } from "@/hooks/use-profile-queries";

/**
 * Disclaimer body — shared between the first-time consent prompt and the
 * informational re-open. Rendered as the dialog's accessible description.
 */
function DisclaimerBody() {
  return (
    <DialogDescription className="space-y-2 pt-1 text-left">
      <span className="block">
        Turning this on shares the conditions saved in your profile with the AI
        when it generates insights. Enabling it is your consent to include that
        data.
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
 * Opt-in toggle for sharing medical conditions with AI insights. The first
 * time it is switched on, a consent dialog appears — confirming the dialog is
 * the opt-in. After consent the toggle flips directly. Rendered on both the
 * profile page and in Settings → Privacy & Security.
 */
export function AiInsightsConsentToggle() {
  const profile = useUserProfile();
  const { mutate: save } = useSaveProfile();
  const [dialog, setDialog] = useState<null | "consent" | "info">(null);

  const enabled = profile.shareConditionsWithAI;
  const hasConsented = profile.aiInsightsConsentAt !== null;

  const handleToggle = (next: boolean) => {
    // First enable ever → the dialog is the consent gate; don't save yet.
    if (next && !hasConsented) {
      setDialog("consent");
      return;
    }
    save({ shareConditionsWithAI: next });
  };

  const confirmConsent = () => {
    save({ shareConditionsWithAI: true, aiInsightsConsentAt: Date.now() });
    setDialog(null);
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="share-conditions-ai" className="text-sm">
              Share conditions with AI insights
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
              ? "Your conditions are included when generating AI insights."
              : "Your conditions stay on this device and are not sent to the AI."}
          </p>
        </div>
        <Switch
          id="share-conditions-ai"
          checked={enabled}
          onCheckedChange={handleToggle}
        />
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
                ? "Share conditions with AI?"
                : "About AI insights"}
            </DialogTitle>
            <DisclaimerBody />
          </DialogHeader>
          {dialog === "consent" ? (
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button onClick={confirmConsent}>Enable insights</Button>
            </DialogFooter>
          ) : (
            <Button onClick={() => setDialog(null)}>Got it</Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
