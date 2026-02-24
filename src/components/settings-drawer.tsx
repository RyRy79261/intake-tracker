"use client";

import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { RotateCcw } from "lucide-react";
import { useSettings } from "@/hooks/use-settings";
import { usePinProtected } from "@/hooks/use-pin-gate";
import { useToast } from "@/hooks/use-toast";
import { DebugPanel } from "./debug-panel";
import { CustomizationPanel } from "./customization-panel";
import { AboutDialog } from "./about-dialog";

// Section components
import { AccountSection } from "./settings/account-section";
import { DaySettingsSection } from "./settings/day-settings-section";
import { WaterSettingsSection } from "./settings/water-settings-section";
import { SaltSettingsSection } from "./settings/salt-settings-section";
import { AppearanceSection } from "./settings/appearance-section";
import { QuickNavSection } from "./settings/quick-nav-section";
import { AiIntegrationSection } from "./settings/ai-integration-section";
import { DataManagementSection } from "./settings/data-management-section";
import { MedicationSettingsSection } from "./settings/medication-settings-section";
import { PrivacySecuritySection } from "./settings/privacy-security-section";
import { PermissionsSection } from "./settings/permissions-section";
import { AppUpdatesSection } from "./settings/app-updates-section";

interface SettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDrawer({ open, onOpenChange }: SettingsDrawerProps) {
  const settings = useSettings();
  const { requirePin } = usePinProtected();
  const { toast } = useToast();

  // Handle open change with PIN protection
  const handleOpenChange = useCallback(async (newOpen: boolean) => {
    if (newOpen) {
      const unlocked = await requirePin();
      if (unlocked) {
        onOpenChange(true);
      }
    } else {
      onOpenChange(false);
    }
  }, [requirePin, onOpenChange]);

  const handleResetToDefaults = () => {
    settings.resetToDefaults();
    toast({
      title: "Settings reset",
      description: "All settings have been restored to defaults",
    });
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange} direction="right">
      <DrawerContent direction="right" className="h-full flex flex-col">
        {/* Fixed Header */}
        <DrawerHeader className="border-b shrink-0">
          <DrawerTitle>Settings</DrawerTitle>
          <DrawerDescription>
            Configure your intake tracker preferences
          </DrawerDescription>
        </DrawerHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            <AccountSection />
            <DaySettingsSection />
            <WaterSettingsSection />
            <SaltSettingsSection />
            <AppearanceSection />
            <QuickNavSection />
            <AiIntegrationSection />
            <DataManagementSection />
            <MedicationSettingsSection />
            <PrivacySecuritySection />
            <PermissionsSection />
            <AppUpdatesSection />

            {/* Customization Panel */}
            <div className="pt-4 border-t">
              <CustomizationPanel />
            </div>

            {/* Debug Panel */}
            <div className="pt-4 border-t">
              <DebugPanel />
            </div>

            {/* Reset & About */}
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
        </div>
      </DrawerContent>
    </Drawer>
  );
}
