"use client";

import { useSettingsStore } from "@/stores/settings-store";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Globe } from "lucide-react";

export function MedicationSettingsView() {
  const country = useSettingsStore((s) => s.medicationCountry);
  const setCountry = useSettingsStore((s) => s.setMedicationCountry);

  const COUNTRIES = [
    { value: "", label: "Not Specified (Global Search)" },
    { value: "US", label: "United States" },
    { value: "UK", label: "United Kingdom" },
    { value: "CA", label: "Canada" },
    { value: "AU", label: "Australia" },
    { value: "ZA", label: "South Africa" },
    { value: "DE", label: "Germany" },
    { value: "FR", label: "France" },
    { value: "IT", label: "Italy" },
    { value: "ES", label: "Spain" },
    { value: "BR", label: "Brazil" },
    { value: "IN", label: "India" },
    { value: "CN", label: "China" },
    { value: "JP", label: "Japan" },
    { value: "KR", label: "Japan" },
  ];

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h2 className="text-xl font-semibold mb-2">Medication Settings</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Configure preferences that apply to your prescriptions and search results.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Globe className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          <h3 className="font-medium">Localization</h3>
        </div>
        
        <div className="space-y-1.5">
          <Label>Country / Region</Label>
          <p className="text-[13px] text-muted-foreground mb-2">
            This is used by the AI to search for local brand names and alternatives when adding a new medication.
          </p>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger>
              <SelectValue placeholder="Select a country" />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.value || "none"} value={c.value || "none"}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
