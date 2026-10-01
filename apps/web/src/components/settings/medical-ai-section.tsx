"use client";

import { HeartPulse } from "lucide-react";
import { AiInsightsConsentToggle } from "@/components/profile/ai-insights-consent-toggle";
import { SubHead, helpClass, plainboxClass } from "@/components/settings/settings-kit";

/**
 * Settings → Privacy & Security entry for the medical-conditions AI opt-in.
 * Mirrors the toggle on the profile page so consent is always reachable.
 */
export function MedicalAiSection() {
  return (
    <div className="flex flex-col gap-2.5">
      <SubHead icon={HeartPulse}>Medical conditions &amp; AI</SubHead>
      <div className={plainboxClass}>
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
      </div>
      <p className={helpClass}>
        Add or remove the conditions themselves on your Profile page.
        Medications come from your Medications page.
      </p>
    </div>
  );
}
