"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Accordion } from "@/components/ui/accordion";
import { RotateCcw, Activity, Palette, Pill, Database, Shield, Bug, Download, Sparkles, MessageSquare, BookOpen } from "lucide-react";
import { useSettings } from "@/hooks/use-settings";
import { useToast } from "@/hooks/use-toast";
import { DebugPanel } from "@/components/debug-panel";
import { AboutDialog } from "@/components/about-dialog";
import { SettingsAccordionGroup } from "@/components/settings/settings-accordion-group";
import { AccountSection } from "@/components/settings/account-section";
import { DaySettingsSection } from "@/components/settings/day-settings-section";
import { WaterSettingsSection } from "@/components/settings/water-settings-section";
import { SaltSettingsSection } from "@/components/settings/salt-settings-section";
import { SugarSettingsSection } from "@/components/settings/sugar-settings-section";
import { PotassiumSettingsSection } from "@/components/settings/potassium-settings-section";
import { WeightSettingsSection } from "@/components/settings/weight-settings-section";
import { AppearanceSection } from "@/components/settings/appearance-section";
import { QuickNavSection } from "@/components/settings/quick-nav-section";
import { DataManagementSection } from "@/components/settings/data-management-section";
import { PermissionsSection } from "@/components/settings/permissions-section";
import { MedicalAiSection } from "@/components/settings/medical-ai-section";
import { AppUpdatesSection } from "@/components/settings/app-updates-section";
import { LiquidPresetsSection } from "@/components/settings/liquid-presets-section";
import { UrinationDefecationDefaults } from "@/components/settings/urination-defecation-defaults";
import { MedicationSettingsSection } from "@/components/settings/medication-settings-section";
import { AnimationTimingSection } from "@/components/settings/animation-timing-section";
import { SwipeNavSection } from "@/components/settings/swipe-nav-section";
import { StorageInfoSection } from "@/components/settings/storage-info-section";
import { AiKeysSection } from "@/components/settings/ai-keys-section";
import { ReportBugSection } from "@/components/settings/report-bug-section";
import { HelpSection } from "@/components/settings/help-section";
import { ReportBugDialog } from "@/components/report-bug-dialog";

/** Set by the ErrorBoundary crash screen before it navigates here. */
const CRASH_REPORT_KEY = "intake-tracker:crash-report";

function SettingsContent() {
  const settings = useSettings();
  const { toast } = useToast();
  const [crash, setCrash] = useState<{ open: boolean; description: string }>({
    open: false,
    description: "",
  });

  // If we arrived here from the crash screen's "Report this problem" button,
  // open the report dialog pre-filled with the caught error.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CRASH_REPORT_KEY);
      if (!raw) return;
      sessionStorage.removeItem(CRASH_REPORT_KEY);
      const parsed = JSON.parse(raw) as { message?: string; stack?: string };
      const description = [
        "Reporting a crash.",
        parsed.message ? `\n\nError: ${parsed.message}` : "",
        parsed.stack ? `\n\n${parsed.stack}` : "",
      ].join("");
      setCrash({ open: true, description });
    } catch {
      // Malformed / unavailable sessionStorage — nothing to restore.
    }
  }, []);

  const handleResetToDefaults = () => {
    settings.resetToDefaults();
    toast({
      title: "Settings reset",
      description: "All settings have been restored to defaults",
    });
  };

  return (
    <>
      <div className="pb-6">
        <AccountSection />
      </div>

      <Accordion type="single" collapsible className="pb-8">
        <SettingsAccordionGroup value="ai-features" icon={Sparkles} label="AI features" iconColorClass="text-amber-600 dark:text-amber-400">
          <AiKeysSection />
        </SettingsAccordionGroup>

        <SettingsAccordionGroup value="data-storage" icon={Database} label="Data & Storage" iconColorClass="text-amber-600 dark:text-amber-400">
          <StorageInfoSection />
          <DataManagementSection />
        </SettingsAccordionGroup>

        <SettingsAccordionGroup value="tracking" icon={Activity} label="Tracking" iconColorClass="text-indigo-600 dark:text-indigo-400">
          <DaySettingsSection />
          <WaterSettingsSection />
          <SaltSettingsSection />
          <SugarSettingsSection />
          <PotassiumSettingsSection />
          <WeightSettingsSection />
          <LiquidPresetsSection />
          <UrinationDefecationDefaults />
        </SettingsAccordionGroup>

        <SettingsAccordionGroup value="customization" icon={Palette} label="Customization" iconColorClass="text-cyan-600 dark:text-cyan-400">
          <AppearanceSection />
          <QuickNavSection />
          <AnimationTimingSection />
          <SwipeNavSection />
        </SettingsAccordionGroup>

        <SettingsAccordionGroup value="medication" icon={Pill} label="Medication" iconColorClass="text-teal-600 dark:text-teal-400">
          <MedicationSettingsSection />
        </SettingsAccordionGroup>

        <SettingsAccordionGroup value="privacy-security" icon={Shield} label="Privacy & Security" iconColorClass="text-emerald-600 dark:text-emerald-400">
          <PermissionsSection />
          <MedicalAiSection />
        </SettingsAccordionGroup>

        <SettingsAccordionGroup value="system" icon={Download} label="System" iconColorClass="text-sky-600 dark:text-sky-400">
          <AppUpdatesSection />
        </SettingsAccordionGroup>

        <SettingsAccordionGroup value="help" icon={BookOpen} label="Help & Manual" iconColorClass="text-sky-600 dark:text-sky-400">
          <HelpSection />
        </SettingsAccordionGroup>

        <SettingsAccordionGroup value="feedback" icon={MessageSquare} label="Feedback" iconColorClass="text-rose-600 dark:text-rose-400">
          <ReportBugSection />
        </SettingsAccordionGroup>

        <SettingsAccordionGroup value="debug" icon={Bug} label="Debug" iconColorClass="text-slate-600 dark:text-slate-400">
          <DebugPanel />
        </SettingsAccordionGroup>
      </Accordion>

      <ReportBugDialog
        open={crash.open}
        onOpenChange={(open) => setCrash((c) => ({ ...c, open }))}
        defaultType="bug"
        defaultDescription={crash.description}
      />

      <div className="pt-4 border-t space-y-2">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={handleResetToDefaults}
        >
          <RotateCcw className="w-4 h-4" />
          Reset to Defaults
        </Button>
        <AboutDialog />
      </div>
    </>
  );
}

export default function SettingsPage() {
  return <SettingsContent />;
}
