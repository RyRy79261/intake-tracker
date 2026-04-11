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

export function UrinationDefecationDefaults() {
  const settings = useSettings();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
        <Droplets className="w-4 h-4" />
        <h3 className="font-semibold">Bathroom Defaults</h3>
      </div>
      <div className="space-y-3 pl-6">
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
    </div>
  );
}
