"use client";

import { useState } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { useDoseReminderToggle } from "@/hooks/use-push-schedule-sync";
import { useAuth, useAuthGate } from "@/components/auth-guard";
import { Button } from "@intake/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@intake/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@intake/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@intake/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Seg, SubHead, Tog, flabelClass, helpClass } from "@/components/settings/settings-kit";
import {
  LATE_WINDOW_ALWAYS,
  LATE_WINDOW_NEVER,
  LATE_WINDOW_OPTIONS,
  REMINDER_PERIOD_OPTIONS,
  reminderRepeatCount,
} from "@intake/core/dose-rules";

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
  id,
  value,
  onValueChange,
  placeholder = "Select a country",
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  const selected = COUNTRIES.find((c) => c.value === value);
  const displayLabel = selected
    ? selected.value
      ? `${selected.flag} ${selected.label}`
      : selected.label
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-11 w-full justify-between border-muted-foreground px-2.5 text-[0.9375rem] font-normal"
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
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

const TIME_FORMATS = [
  ["24h", "24h"],
  ["12h", "12h"],
] as const;

const FOLLOW_UP_INTERVALS = [5, 10, 15, 20, 30] as const;

/** The late window choices: minutes, then "Always ask" (0) and "Never ask" (-1). */
const LATE_WINDOWS: ReadonlyArray<readonly [number, string]> = [
  ...LATE_WINDOW_OPTIONS.map((m) => [m, `${m} minutes`] as const),
  [LATE_WINDOW_ALWAYS, "Always ask"],
  [LATE_WINDOW_NEVER, "Never ask"],
];

function deviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/** "08:30, 08:40, 08:50, 09:00": the reminders of an 08:30 dose. */
function reminderTimes(every: number, period: number): string {
  const times: string[] = [];
  for (let k = 0; k <= reminderRepeatCount(every, period); k++) {
    const m = 8 * 60 + 30 + k * every;
    times.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return times.join(", ");
}

/**
 * Settings › Medications: the regions for medicine search, the time format,
 * dose reminders with their follow-up reminders, and the home timezone.
 * Moved here from the Medications page's Settings tab; the store keys (and
 * so what syncs) are unchanged.
 */
export function MedicationPrefsSection() {
  const primaryRegion = useSettingsStore((s) => s.primaryRegion);
  const setPrimaryRegion = useSettingsStore((s) => s.setPrimaryRegion);
  const secondaryRegion = useSettingsStore((s) => s.secondaryRegion);
  const setSecondaryRegion = useSettingsStore((s) => s.setSecondaryRegion);
  const timeFormat = useSettingsStore((s) => s.timeFormat);
  const setTimeFormat = useSettingsStore((s) => s.setTimeFormat);
  const doseRemindersEnabled = useSettingsStore((s) => s.doseRemindersEnabled);
  const reminderPeriodMinutes = useSettingsStore((s) => s.reminderPeriodMinutes);
  const setReminderPeriodMinutes = useSettingsStore((s) => s.setReminderPeriodMinutes);
  const lateWindowMinutes = useSettingsStore((s) => s.lateWindowMinutes);
  const setLateWindowMinutes = useSettingsStore((s) => s.setLateWindowMinutes);
  const askSkipReason = useSettingsStore((s) => s.askSkipReason);
  const setAskSkipReason = useSettingsStore((s) => s.setAskSkipReason);
  const reminderFollowUpInterval = useSettingsStore((s) => s.reminderFollowUpInterval);
  const setReminderFollowUpInterval = useSettingsStore((s) => s.setReminderFollowUpInterval);
  const homeTimezone = useSettingsStore((s) => s.homeTimezone);

  const {
    handleToggle: handleToggleReminders,
    toggling: togglingReminders,
    supported: notificationsSupported,
    isNative: nativeReminders,
    enabled: remindersEnabled,
  } = useDoseReminderToggle();
  const { authenticated: isSignedIn } = useAuth();
  // Native reminders are device-local and work signed out; web push needs auth.
  const showReminders = useAuthGate() || nativeReminders;

  const device = deviceTimezone();

  let reminderNote: string;
  if (!notificationsSupported) reminderNote = "Notifications are not supported in this browser";
  else if (remindersEnabled) reminderNote = "A reminder at the dose time, repeated until the reminder period ends";
  else if (nativeReminders) reminderNote = "A notification on this device when a dose is due";
  else if (!isSignedIn && !doseRemindersEnabled) reminderNote = "Sign in to turn on push reminders across devices";
  else reminderNote = "Push notifications when a dose is due";

  return (
    <>
      <SubHead>Medicine search</SubHead>
      <div>
        <label htmlFor="set-region" className={flabelClass}>
          Region
        </label>
        <CountryCombobox id="set-region" value={primaryRegion} onValueChange={setPrimaryRegion} />
        <p className={`${helpClass} mt-1`}>
          Used for local brand names and alternatives in medicine search.
        </p>
      </div>

      <div>
        <label htmlFor="set-region-2" className={flabelClass}>
          Second region (optional)
        </label>
        <CountryCombobox id="set-region-2" value={secondaryRegion} onValueChange={setSecondaryRegion} />
        <p className={`${helpClass} mt-1`}>A fallback for finding alternatives.</p>
      </div>

      <SubHead>Time &amp; reminders</SubHead>
      <div>
        <span className={flabelClass}>Time format</span>
        <Seg label="Time format" value={timeFormat} options={TIME_FORMATS} onChange={setTimeFormat} />
      </div>

      {showReminders ? (
        <>
          <Tog
            id="dose-reminders-toggle"
            label="Dose reminders"
            description={reminderNote}
            checked={remindersEnabled}
            onCheckedChange={handleToggleReminders}
            disabled={!notificationsSupported || togglingReminders}
          />
          {remindersEnabled && (
            <div>
              <label htmlFor="set-follow-every" className={flabelClass}>
                Remind me every
              </label>
              <Select
                value={String(reminderFollowUpInterval)}
                onValueChange={(v) => setReminderFollowUpInterval(Number(v))}
              >
                <SelectTrigger id="set-follow-every" className="h-11 border-muted-foreground text-[0.9375rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOLLOW_UP_INTERVALS.map((v) => (
                    <SelectItem key={v} value={String(v)}>
                      {v} minutes
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </>
      ) : (
        <p className={helpClass}>Sign in to turn on dose reminders.</p>
      )}

      <div>
        <label htmlFor="set-reminder-period" className={flabelClass}>
          Reminder period
        </label>
        <Select
          value={String(reminderPeriodMinutes)}
          onValueChange={(v) => setReminderPeriodMinutes(Number(v))}
        >
          <SelectTrigger id="set-reminder-period" className="h-11 border-muted-foreground text-[0.9375rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REMINDER_PERIOD_OPTIONS.map((v) => (
              <SelectItem key={v} value={String(v)}>
                {v} minutes
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className={`${helpClass} mt-1`} data-testid="reminder-period-help">
          Reminders repeat until this time after the dose. Then a dose you have not marked is Missed.
          An 08:30 dose: {reminderTimes(reminderFollowUpInterval, reminderPeriodMinutes)}.
        </p>
      </div>

      <div>
        <label htmlFor="set-late-window" className={flabelClass}>
          Late window
        </label>
        <Select value={String(lateWindowMinutes)} onValueChange={(v) => setLateWindowMinutes(Number(v))}>
          <SelectTrigger id="set-late-window" className="h-11 border-muted-foreground text-[0.9375rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LATE_WINDOWS.map(([v, l]) => (
              <SelectItem key={v} value={String(v)}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className={`${helpClass} mt-1`}>
          Ask for the time taken when you take a dose later than this.
        </p>
      </div>

      <Tog
        id="ask-skip-reason-toggle"
        label="Ask me every time"
        description="Ask why when you skip a dose."
        checked={askSkipReason}
        onCheckedChange={setAskSkipReason}
      />

      <SubHead>Home timezone</SubHead>
      <div>
        <p className="font-mono text-[0.9375rem]" data-testid="home-timezone">
          {homeTimezone ?? (device ? `${device} (this device)` : "Same as this device")}
        </p>
        <p className={`${helpClass} mt-1`}>
          Dose times stay on home time when you travel. It changes when you confirm the travel prompt.
        </p>
      </div>
    </>
  );
}
