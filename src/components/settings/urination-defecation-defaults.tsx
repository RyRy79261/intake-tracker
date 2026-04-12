"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Droplets } from "lucide-react";
import { useSettings } from "@/hooks/use-settings";
import { ExpandableSettingsSection } from "@/components/settings/expandable-settings-section";

export function UrinationDefecationDefaults() {
  const settings = useSettings();

  return (
    <ExpandableSettingsSection
      icon={Droplets}
      label="Bathroom Defaults"
      iconColorClass="text-rose-600 dark:text-rose-400"
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <Label>Urination default amount</Label>
          <Select
            value={settings.urinationDefaultAmount}
            onValueChange={(v) =>
              settings.setUrinationDefaultAmount(v as "small" | "medium" | "large")
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="small">Small</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="large">Large</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Pre-selected amount when opening the urination details dialog
          </p>
        </div>
        <div className="space-y-2">
          <Label>Defecation default amount</Label>
          <Select
            value={settings.defecationDefaultAmount}
            onValueChange={(v) =>
              settings.setDefecationDefaultAmount(v as "small" | "medium" | "large")
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="small">Small</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="large">Large</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Pre-selected amount when opening the defecation details dialog
          </p>
        </div>
      </div>
    </ExpandableSettingsSection>
  );
}
