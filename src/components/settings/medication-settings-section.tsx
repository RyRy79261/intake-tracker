"use client";

import { useSettingsStore } from "@/stores/settings-store";
import { Pill } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const COUNTRIES = [
  { value: "US", label: "United States" },
  { value: "UK", label: "United Kingdom" },
  { value: "CA", label: "Canada" },
  { value: "AU", label: "Australia" },
  { value: "DE", label: "Germany" },
  { value: "ZA", label: "South Africa" },
  { value: "Other", label: "Other" },
];

export function MedicationSettingsSection() {
  const { userCountry, setUserCountry } = useSettingsStore();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400">
        <Pill className="w-4 h-4" />
        <h3 className="font-semibold">Medication</h3>
      </div>
      
      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-sm font-medium">User Country</Label>
          <Select value={userCountry || "US"} onValueChange={setUserCountry}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select Country" />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Used to find local medication alternatives in search results.
          </p>
        </div>
      </div>
    </div>
  );
}