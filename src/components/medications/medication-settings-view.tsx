"use client";

import { useState } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { useDoseReminderToggle } from "@/hooks/use-push-schedule-sync";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Bell, Check, ChevronsUpDown, Clock, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

// ISO 3166-1 countries sorted alphabetically
const COUNTRIES: { value: string; label: string; flag: string }[] = [
  { value: "", label: "Not Specified (Global Search)", flag: "🌐" },
  { value: "AF", label: "Afghanistan", flag: "🇦🇫" },
  { value: "AL", label: "Albania", flag: "🇦🇱" },
  { value: "DZ", label: "Algeria", flag: "🇩🇿" },
  { value: "AD", label: "Andorra", flag: "🇦🇩" },
  { value: "AO", label: "Angola", flag: "🇦🇴" },
  { value: "AG", label: "Antigua and Barbuda", flag: "🇦🇬" },
  { value: "AR", label: "Argentina", flag: "🇦🇷" },
  { value: "AM", label: "Armenia", flag: "🇦🇲" },
  { value: "AU", label: "Australia", flag: "🇦🇺" },
  { value: "AT", label: "Austria", flag: "🇦🇹" },
  { value: "AZ", label: "Azerbaijan", flag: "🇦🇿" },
  { value: "BS", label: "Bahamas", flag: "🇧🇸" },
  { value: "BH", label: "Bahrain", flag: "🇧🇭" },
  { value: "BD", label: "Bangladesh", flag: "🇧🇩" },
  { value: "BB", label: "Barbados", flag: "🇧🇧" },
  { value: "BY", label: "Belarus", flag: "🇧🇾" },
  { value: "BE", label: "Belgium", flag: "🇧🇪" },
  { value: "BZ", label: "Belize", flag: "🇧🇿" },
  { value: "BJ", label: "Benin", flag: "🇧🇯" },
  { value: "BT", label: "Bhutan", flag: "🇧🇹" },
  { value: "BO", label: "Bolivia", flag: "🇧🇴" },
  { value: "BA", label: "Bosnia and Herzegovina", flag: "🇧🇦" },
  { value: "BW", label: "Botswana", flag: "🇧🇼" },
  { value: "BR", label: "Brazil", flag: "🇧🇷" },
  { value: "BN", label: "Brunei", flag: "🇧🇳" },
  { value: "BG", label: "Bulgaria", flag: "🇧🇬" },
  { value: "BF", label: "Burkina Faso", flag: "🇧🇫" },
  { value: "BI", label: "Burundi", flag: "🇧🇮" },
  { value: "CV", label: "Cabo Verde", flag: "🇨🇻" },
  { value: "KH", label: "Cambodia", flag: "🇰🇭" },
  { value: "CM", label: "Cameroon", flag: "🇨🇲" },
  { value: "CA", label: "Canada", flag: "🇨🇦" },
  { value: "CF", label: "Central African Republic", flag: "🇨🇫" },
  { value: "TD", label: "Chad", flag: "🇹🇩" },
  { value: "CL", label: "Chile", flag: "🇨🇱" },
  { value: "CN", label: "China", flag: "🇨🇳" },
  { value: "CO", label: "Colombia", flag: "🇨🇴" },
  { value: "KM", label: "Comoros", flag: "🇰🇲" },
  { value: "CG", label: "Congo", flag: "🇨🇬" },
  { value: "CR", label: "Costa Rica", flag: "🇨🇷" },
  { value: "HR", label: "Croatia", flag: "🇭🇷" },
  { value: "CU", label: "Cuba", flag: "🇨🇺" },
  { value: "CY", label: "Cyprus", flag: "🇨🇾" },
  { value: "CZ", label: "Czechia", flag: "🇨🇿" },
  { value: "DK", label: "Denmark", flag: "🇩🇰" },
  { value: "DJ", label: "Djibouti", flag: "🇩🇯" },
  { value: "DM", label: "Dominica", flag: "🇩🇲" },
  { value: "DO", label: "Dominican Republic", flag: "🇩🇴" },
  { value: "EC", label: "Ecuador", flag: "🇪🇨" },
  { value: "EG", label: "Egypt", flag: "🇪🇬" },
  { value: "SV", label: "El Salvador", flag: "🇸🇻" },
  { value: "GQ", label: "Equatorial Guinea", flag: "🇬🇶" },
  { value: "ER", label: "Eritrea", flag: "🇪🇷" },
  { value: "EE", label: "Estonia", flag: "🇪🇪" },
  { value: "SZ", label: "Eswatini", flag: "🇸🇿" },
  { value: "ET", label: "Ethiopia", flag: "🇪🇹" },
  { value: "FJ", label: "Fiji", flag: "🇫🇯" },
  { value: "FI", label: "Finland", flag: "🇫🇮" },
  { value: "FR", label: "France", flag: "🇫🇷" },
  { value: "GA", label: "Gabon", flag: "🇬🇦" },
  { value: "GM", label: "Gambia", flag: "🇬🇲" },
  { value: "GE", label: "Georgia", flag: "🇬🇪" },
  { value: "DE", label: "Germany", flag: "🇩🇪" },
  { value: "GH", label: "Ghana", flag: "🇬🇭" },
  { value: "GR", label: "Greece", flag: "🇬🇷" },
  { value: "GD", label: "Grenada", flag: "🇬🇩" },
  { value: "GT", label: "Guatemala", flag: "🇬🇹" },
  { value: "GN", label: "Guinea", flag: "🇬🇳" },
  { value: "GW", label: "Guinea-Bissau", flag: "🇬🇼" },
  { value: "GY", label: "Guyana", flag: "🇬🇾" },
  { value: "HT", label: "Haiti", flag: "🇭🇹" },
  { value: "HN", label: "Honduras", flag: "🇭🇳" },
  { value: "HU", label: "Hungary", flag: "🇭🇺" },
  { value: "IS", label: "Iceland", flag: "🇮🇸" },
  { value: "IN", label: "India", flag: "🇮🇳" },
  { value: "ID", label: "Indonesia", flag: "🇮🇩" },
  { value: "IR", label: "Iran", flag: "🇮🇷" },
  { value: "IQ", label: "Iraq", flag: "🇮🇶" },
  { value: "IE", label: "Ireland", flag: "🇮🇪" },
  { value: "IL", label: "Israel", flag: "🇮🇱" },
  { value: "IT", label: "Italy", flag: "🇮🇹" },
  { value: "JM", label: "Jamaica", flag: "🇯🇲" },
  { value: "JP", label: "Japan", flag: "🇯🇵" },
  { value: "JO", label: "Jordan", flag: "🇯🇴" },
  { value: "KZ", label: "Kazakhstan", flag: "🇰🇿" },
  { value: "KE", label: "Kenya", flag: "🇰🇪" },
  { value: "KI", label: "Kiribati", flag: "🇰🇮" },
  { value: "KW", label: "Kuwait", flag: "🇰🇼" },
  { value: "KG", label: "Kyrgyzstan", flag: "🇰🇬" },
  { value: "LA", label: "Laos", flag: "🇱🇦" },
  { value: "LV", label: "Latvia", flag: "🇱🇻" },
  { value: "LB", label: "Lebanon", flag: "🇱🇧" },
  { value: "LS", label: "Lesotho", flag: "🇱🇸" },
  { value: "LR", label: "Liberia", flag: "🇱🇷" },
  { value: "LY", label: "Libya", flag: "🇱🇾" },
  { value: "LI", label: "Liechtenstein", flag: "🇱🇮" },
  { value: "LT", label: "Lithuania", flag: "🇱🇹" },
  { value: "LU", label: "Luxembourg", flag: "🇱🇺" },
  { value: "MG", label: "Madagascar", flag: "🇲🇬" },
  { value: "MW", label: "Malawi", flag: "🇲🇼" },
  { value: "MY", label: "Malaysia", flag: "🇲🇾" },
  { value: "MV", label: "Maldives", flag: "🇲🇻" },
  { value: "ML", label: "Mali", flag: "🇲🇱" },
  { value: "MT", label: "Malta", flag: "🇲🇹" },
  { value: "MH", label: "Marshall Islands", flag: "🇲🇭" },
  { value: "MR", label: "Mauritania", flag: "🇲🇷" },
  { value: "MU", label: "Mauritius", flag: "🇲🇺" },
  { value: "MX", label: "Mexico", flag: "🇲🇽" },
  { value: "FM", label: "Micronesia", flag: "🇫🇲" },
  { value: "MD", label: "Moldova", flag: "🇲🇩" },
  { value: "MC", label: "Monaco", flag: "🇲🇨" },
  { value: "MN", label: "Mongolia", flag: "🇲🇳" },
  { value: "ME", label: "Montenegro", flag: "🇲🇪" },
  { value: "MA", label: "Morocco", flag: "🇲🇦" },
  { value: "MZ", label: "Mozambique", flag: "🇲🇿" },
  { value: "MM", label: "Myanmar", flag: "🇲🇲" },
  { value: "NA", label: "Namibia", flag: "🇳🇦" },
  { value: "NR", label: "Nauru", flag: "🇳🇷" },
  { value: "NP", label: "Nepal", flag: "🇳🇵" },
  { value: "NL", label: "Netherlands", flag: "🇳🇱" },
  { value: "NZ", label: "New Zealand", flag: "🇳🇿" },
  { value: "NI", label: "Nicaragua", flag: "🇳🇮" },
  { value: "NE", label: "Niger", flag: "🇳🇪" },
  { value: "NG", label: "Nigeria", flag: "🇳🇬" },
  { value: "KP", label: "North Korea", flag: "🇰🇵" },
  { value: "MK", label: "North Macedonia", flag: "🇲🇰" },
  { value: "NO", label: "Norway", flag: "🇳🇴" },
  { value: "OM", label: "Oman", flag: "🇴🇲" },
  { value: "PK", label: "Pakistan", flag: "🇵🇰" },
  { value: "PW", label: "Palau", flag: "🇵🇼" },
  { value: "PA", label: "Panama", flag: "🇵🇦" },
  { value: "PG", label: "Papua New Guinea", flag: "🇵🇬" },
  { value: "PY", label: "Paraguay", flag: "🇵🇾" },
  { value: "PE", label: "Peru", flag: "🇵🇪" },
  { value: "PH", label: "Philippines", flag: "🇵🇭" },
  { value: "PL", label: "Poland", flag: "🇵🇱" },
  { value: "PT", label: "Portugal", flag: "🇵🇹" },
  { value: "QA", label: "Qatar", flag: "🇶🇦" },
  { value: "RO", label: "Romania", flag: "🇷🇴" },
  { value: "RU", label: "Russia", flag: "🇷🇺" },
  { value: "RW", label: "Rwanda", flag: "🇷🇼" },
  { value: "KN", label: "Saint Kitts and Nevis", flag: "🇰🇳" },
  { value: "LC", label: "Saint Lucia", flag: "🇱🇨" },
  { value: "VC", label: "Saint Vincent and the Grenadines", flag: "🇻🇨" },
  { value: "WS", label: "Samoa", flag: "🇼🇸" },
  { value: "SM", label: "San Marino", flag: "🇸🇲" },
  { value: "ST", label: "Sao Tome and Principe", flag: "🇸🇹" },
  { value: "SA", label: "Saudi Arabia", flag: "🇸🇦" },
  { value: "SN", label: "Senegal", flag: "🇸🇳" },
  { value: "RS", label: "Serbia", flag: "🇷🇸" },
  { value: "SC", label: "Seychelles", flag: "🇸🇨" },
  { value: "SL", label: "Sierra Leone", flag: "🇸🇱" },
  { value: "SG", label: "Singapore", flag: "🇸🇬" },
  { value: "SK", label: "Slovakia", flag: "🇸🇰" },
  { value: "SI", label: "Slovenia", flag: "🇸🇮" },
  { value: "SB", label: "Solomon Islands", flag: "🇸🇧" },
  { value: "SO", label: "Somalia", flag: "🇸🇴" },
  { value: "ZA", label: "South Africa", flag: "🇿🇦" },
  { value: "KR", label: "South Korea", flag: "🇰🇷" },
  { value: "SS", label: "South Sudan", flag: "🇸🇸" },
  { value: "ES", label: "Spain", flag: "🇪🇸" },
  { value: "LK", label: "Sri Lanka", flag: "🇱🇰" },
  { value: "SD", label: "Sudan", flag: "🇸🇩" },
  { value: "SR", label: "Suriname", flag: "🇸🇷" },
  { value: "SE", label: "Sweden", flag: "🇸🇪" },
  { value: "CH", label: "Switzerland", flag: "🇨🇭" },
  { value: "SY", label: "Syria", flag: "🇸🇾" },
  { value: "TW", label: "Taiwan", flag: "🇹🇼" },
  { value: "TJ", label: "Tajikistan", flag: "🇹🇯" },
  { value: "TZ", label: "Tanzania", flag: "🇹🇿" },
  { value: "TH", label: "Thailand", flag: "🇹🇭" },
  { value: "TL", label: "Timor-Leste", flag: "🇹🇱" },
  { value: "TG", label: "Togo", flag: "🇹🇬" },
  { value: "TO", label: "Tonga", flag: "🇹🇴" },
  { value: "TT", label: "Trinidad and Tobago", flag: "🇹🇹" },
  { value: "TN", label: "Tunisia", flag: "🇹🇳" },
  { value: "TR", label: "Turkey", flag: "🇹🇷" },
  { value: "TM", label: "Turkmenistan", flag: "🇹🇲" },
  { value: "TV", label: "Tuvalu", flag: "🇹🇻" },
  { value: "UG", label: "Uganda", flag: "🇺🇬" },
  { value: "UA", label: "Ukraine", flag: "🇺🇦" },
  { value: "AE", label: "United Arab Emirates", flag: "🇦🇪" },
  { value: "GB", label: "United Kingdom", flag: "🇬🇧" },
  { value: "US", label: "United States", flag: "🇺🇸" },
  { value: "UY", label: "Uruguay", flag: "🇺🇾" },
  { value: "UZ", label: "Uzbekistan", flag: "🇺🇿" },
  { value: "VU", label: "Vanuatu", flag: "🇻🇺" },
  { value: "VA", label: "Vatican City", flag: "🇻🇦" },
  { value: "VE", label: "Venezuela", flag: "🇻🇪" },
  { value: "VN", label: "Vietnam", flag: "🇻🇳" },
  { value: "YE", label: "Yemen", flag: "🇾🇪" },
  { value: "ZM", label: "Zambia", flag: "🇿🇲" },
  { value: "ZW", label: "Zimbabwe", flag: "🇿🇼" },
];

function CountryCombobox({
  value,
  onValueChange,
  placeholder = "Select a country",
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  const selected = COUNTRIES.find((c) => c.value === value);
  // Normalize old "UK"/"none" values
  const displayLabel = selected
    ? selected.value
      ? `${selected.flag} ${selected.label}`
      : selected.label
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search countries..." />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {COUNTRIES.map((country) => (
                <CommandItem
                  key={country.value || "__global__"}
                  value={country.label}
                  onSelect={() => {
                    onValueChange(country.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === country.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {country.value ? `${country.flag} ${country.label}` : country.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function MedicationSettingsView() {
  const primaryRegion = useSettingsStore((s) => s.primaryRegion);
  const setPrimaryRegion = useSettingsStore((s) => s.setPrimaryRegion);
  const secondaryRegion = useSettingsStore((s) => s.secondaryRegion);
  const setSecondaryRegion = useSettingsStore((s) => s.setSecondaryRegion);
  const timeFormat = useSettingsStore((s) => s.timeFormat);
  const setTimeFormat = useSettingsStore((s) => s.setTimeFormat);
  const doseRemindersEnabled = useSettingsStore((s) => s.doseRemindersEnabled);
  const reminderFollowUpCount = useSettingsStore((s) => s.reminderFollowUpCount);
  const setReminderFollowUpCount = useSettingsStore((s) => s.setReminderFollowUpCount);
  const reminderFollowUpInterval = useSettingsStore((s) => s.reminderFollowUpInterval);
  const setReminderFollowUpInterval = useSettingsStore((s) => s.setReminderFollowUpInterval);

  const { handleToggle: handleToggleReminders, toggling: togglingReminders, supported: notificationsSupported } = useDoseReminderToggle();

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h2 className="text-xl font-semibold mb-2">Medication Settings</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Configure preferences that apply to your prescriptions and search results.
        </p>
      </div>

      {/* Dose Reminders Section */}
      <div className="space-y-4 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Bell className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          <h3 className="font-medium">Dose Reminders</h3>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="dose-reminders-toggle">Enable Reminders</Label>
            <p className="text-[13px] text-muted-foreground">
              {notificationsSupported
                ? "Get push notifications when medications are due"
                : "Notifications not supported in this browser"}
            </p>
          </div>
          <Switch
            id="dose-reminders-toggle"
            checked={doseRemindersEnabled}
            onCheckedChange={handleToggleReminders}
            disabled={!notificationsSupported || togglingReminders}
          />
        </div>

        {doseRemindersEnabled && (
          <>
            <div className="space-y-1.5">
              <Label>Follow-up reminders</Label>
              <p className="text-[13px] text-muted-foreground mb-2">
                Additional reminders if dose not confirmed
              </p>
              <Select
                value={String(reminderFollowUpCount)}
                onValueChange={(v) => setReminderFollowUpCount(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">None</SelectItem>
                  <SelectItem value="1">1 follow-up</SelectItem>
                  <SelectItem value="2">2 follow-ups</SelectItem>
                  <SelectItem value="3">3 follow-ups</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {reminderFollowUpCount > 0 && (
              <div className="space-y-1.5">
                <Label>Reminder interval</Label>
                <Select
                  value={String(reminderFollowUpInterval)}
                  onValueChange={(v) => setReminderFollowUpInterval(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">Every 5 minutes</SelectItem>
                    <SelectItem value="10">Every 10 minutes</SelectItem>
                    <SelectItem value="15">Every 15 minutes</SelectItem>
                    <SelectItem value="20">Every 20 minutes</SelectItem>
                    <SelectItem value="30">Every 30 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        )}
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          <h3 className="font-medium">Display</h3>
        </div>

        <div className="space-y-1.5 mb-4">
          <Label>Time Format</Label>
          <Select value={timeFormat} onValueChange={(v) => setTimeFormat(v as "12h" | "24h")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">24-hour (14:00)</SelectItem>
              <SelectItem value="12h">12-hour (2:00 PM)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Globe className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          <h3 className="font-medium">Localization</h3>
        </div>

        <div className="space-y-1.5 mb-4">
          <Label>Primary Region</Label>
          <p className="text-[13px] text-muted-foreground mb-2">
            This is used by the AI to search for local brand names and alternatives when adding a new medication.
          </p>
          <CountryCombobox value={primaryRegion} onValueChange={setPrimaryRegion} />
        </div>

        <div className="space-y-1.5">
          <Label>Secondary Region (Optional)</Label>
          <p className="text-[13px] text-muted-foreground mb-2">
            Used as a fallback for finding medication alternatives.
          </p>
          <CountryCombobox value={secondaryRegion} onValueChange={setSecondaryRegion} />
        </div>
      </div>
    </div>
  );
}
