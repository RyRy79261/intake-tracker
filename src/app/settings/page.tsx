"use client";

import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { useSettings } from "@/hooks/use-settings";
import { useToast } from "@/hooks/use-toast";
import { useScrollHide } from "@/hooks/use-scroll-hide";
import { AppHeader } from "@/components/app-header";
import { AuthGuard } from "@/components/auth-guard";
import { DebugPanel } from "@/components/debug-panel";
import { PresetAccordionSection } from "@/components/settings/preset-accordion-section";
import { AboutDialog } from "@/components/about-dialog";
import { AccountSection } from "@/components/settings/account-section";
import { DaySettingsSection } from "@/components/settings/day-settings-section";
import { WaterSettingsSection } from "@/components/settings/water-settings-section";
import { SaltSettingsSection } from "@/components/settings/salt-settings-section";
import { WeightSettingsSection } from "@/components/settings/weight-settings-section";
import { AppearanceSection } from "@/components/settings/appearance-section";
import { QuickNavSection } from "@/components/settings/quick-nav-section";
import { DataManagementSection } from "@/components/settings/data-management-section";
import { PrivacySecuritySection } from "@/components/settings/privacy-security-section";
import { PermissionsSection } from "@/components/settings/permissions-section";
import { AppUpdatesSection } from "@/components/settings/app-updates-section";

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

      <div className="space-y-6 pb-8">
        <AccountSection />
        <DaySettingsSection />
        <WaterSettingsSection />
        <SaltSettingsSection />
        <WeightSettingsSection />
        <AppearanceSection />
        <QuickNavSection />
        <DataManagementSection />
        <PrivacySecuritySection />
        <PermissionsSection />
        <AppUpdatesSection />

        <div className="pt-4 border-t">
          <h3 className="text-sm font-semibold mb-3">Presets</h3>
          <PresetAccordionSection />
        </div>

        <div className="pt-4 border-t">
          <DebugPanel />
        </div>

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
