"use client";

import { HeartPulse } from "lucide-react";
import { AiInsightsConsentToggle } from "@/components/profile/ai-insights-consent-toggle";

/**
 * Settings → Privacy & Security entry for the medical-conditions AI opt-in.
 * Mirrors the toggle on the profile page so consent is always reachable.
 */
export function MedicalAiSection() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
        <HeartPulse className="w-4 h-4" />
        <h3 className="font-semibold">Medical conditions & AI</h3>
      </div>
      <div className="p-3 rounded-lg border space-y-4">
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
      <p className="text-xs text-muted-foreground">
        Add or remove the conditions themselves on your Profile page.
        Medications come from your Medications page.
      </p>
    </div>
  );
}
