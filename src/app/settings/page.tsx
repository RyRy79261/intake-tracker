"use client";

import { Button } from "@/components/ui/button";
import { Accordion } from "@/components/ui/accordion";
import { RotateCcw, Activity, Palette, Pill, Database, Shield, Bug } from "lucide-react";
import { useSettings } from "@/hooks/use-settings";
import { useToast } from "@/hooks/use-toast";
import { useScrollHide } from "@/hooks/use-scroll-hide";
import { AppHeader } from "@/components/app-header";
import { AuthGuard } from "@/components/auth-guard";
import { DebugPanel } from "@/components/debug-panel";
import { AboutDialog } from "@/components/about-dialog";
import { SettingsAccordionGroup } from "@/components/settings/settings-accordion-group";
import { AccountSection } from "@/components/settings/account-section";
import { DaySettingsSection } from "@/components/settings/day-settings-section";
import { WaterSettingsSection } from "@/components/settings/water-settings-section";
import { SaltSettingsSection } from "@/components/settings/salt-settings-section";
import { WeightSettingsSection } from "@/components/settings/weight-settings-section";
import { AppearanceSection } from "@/components/settings/appearance-section";
import { QuickNavSection } from "@/components/settings/quick-nav-section";
import { DataManagementSection } from "@/components/settings/data-management-section";
import { PermissionsSection } from "@/components/settings/permissions-section";
import { AppUpdatesSection } from "@/components/settings/app-updates-section";
import { SubstanceSettingsSection } from "@/components/settings/substance-settings-section";
import { UrinationDefecationDefaults } from "@/components/settings/urination-defecation-defaults";
import { MedicationSettingsSection } from "@/components/settings/medication-settings-section";
import { AnimationTimingSection } from "@/components/settings/animation-timing-section";
import { StorageInfoSection } from "@/components/settings/storage-info-section";

function SettingsContent() {
  const settings = useSettings();
  const { toast } = useToast();

  const barTransitionSec = settings.barTransitionDurationMs / 1000;
  const { isHidden } = useScrollHide({
    scrollDurationMs: settings.scrollDurationMs,
    autoHideDelayMs: settings.autoHideDelayMs,
  });

  const handleResetToDefaults = () => {
    settings.resetToDefaults();
    toast({
      title: "Settings reset",
      description: "All settings have been restored to defaults",
    });
  };

  return (
    <>
      <AppHeader
        headerHidden={isHidden}
        transitionDuration={barTransitionSec}
      />

      <Accordion type="single" collapsible defaultValue="tracking" className="pb-8">
        <SettingsAccordionGroup value="tracking" icon={Activity} label="Tracking" iconColorClass="text-indigo-600 dark:text-indigo-400">
          <DaySettingsSection />
          <WaterSettingsSection />
          <SaltSettingsSection />
          <WeightSettingsSection />
          <SubstanceSettingsSection />
          <UrinationDefecationDefaults />
        </SettingsAccordionGroup>

        <SettingsAccordionGroup value="customization" icon={Palette} label="Customization" iconColorClass="text-cyan-600 dark:text-cyan-400">
          <AppearanceSection />
          <QuickNavSection />
          <AnimationTimingSection />
        </SettingsAccordionGroup>

        <SettingsAccordionGroup value="medication" icon={Pill} label="Medication" iconColorClass="text-teal-600 dark:text-teal-400">
          <MedicationSettingsSection />
        </SettingsAccordionGroup>

        <SettingsAccordionGroup value="data-storage" icon={Database} label="Data & Storage" iconColorClass="text-amber-600 dark:text-amber-400">
          <StorageInfoSection />
          <DataManagementSection />
        </SettingsAccordionGroup>

        <SettingsAccordionGroup value="privacy-security" icon={Shield} label="Privacy & Security" iconColorClass="text-emerald-600 dark:text-emerald-400">
          <AccountSection />
          <PermissionsSection />
        </SettingsAccordionGroup>

        <SettingsAccordionGroup value="debug" icon={Bug} label="Debug" iconColorClass="text-slate-600 dark:text-slate-400">
          <DebugPanel />
          <AppUpdatesSection />
        </SettingsAccordionGroup>
      </Accordion>

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
  return (
    <AuthGuard>
      <SettingsContent />
    </AuthGuard>
  );
}
