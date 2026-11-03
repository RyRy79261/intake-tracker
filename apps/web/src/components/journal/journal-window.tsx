"use client";

/**
 * The Journal window: a written medical logbook. Log (write an entry, read
 * the entries by day) and Printout (a dated table to hand a doctor, saved as
 * a PDF on the device).
 *
 * Built from the Metrics window's layout (wm, wm-tabs, wm-stack, wm-day,
 * wm-rec) and the Home cards' pieces (ModuleCard, SubToggle, the collapsible
 * time input). Voice entries come from Hold to talk, through the shared voice
 * review (`journal_entry` items).
 */
import { useMemo, useState, type CSSProperties } from "react";
import { Calendar, Check, ChevronsUpDown, FileDown, NotebookPen, Trash2 } from "lucide-react";
import { Button } from "@intake/ui/button";
import { Label } from "@intake/ui/label";
import { Textarea } from "@intake/ui/textarea";
import { Input } from "@intake/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@intake/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@intake/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@intake/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@intake/ui/command";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@intake/ui/alert-dialog";
import { useToast } from "@intake/ui/use-toast";
import {
  JOURNAL_FINDING_MAX,
  JOURNAL_WORDS_MAX,
  KIND_LABEL,
  PRINT_PERIOD_DAYS,
  findingCounts,
  journalNotices,
  placeLabel,
  printRows,
  rapidWeightGainNotice,
  severityWord,
  suggestJournalDetails,
  titleFromWords,
} from "@intake/core/journal";
import { logicalDayKey, logicalDayStart, shiftDayKey } from "@intake/core/logical-day";
import { ModuleCard } from "@/components/home/module-card";
import { SubToggle } from "@/components/domain-scope";
import { CollapsibleTimeInputControlled } from "@/components/collapsible-time-input";
import { useAuth } from "@/components/auth-guard";
import { JournalDetailFields, JournalNotices, type JournalDetails } from "@/components/journal/journal-fields";
import {
  useAddJournalEntry,
  useDeleteJournalEntry,
  useJournalEntries,
  useOnBloodThinners,
  useRecentWeights,
} from "@/hooks/use-journal-queries";
import { journalTimeText, saveJournalPDF } from "@/lib/journal-pdf";
import { domainColor } from "@/lib/domain-colors";
import { dateTimeLocalToTimestamp, getCurrentDateTimeLocal } from "@/lib/date-utils";
import { getDeviceTimezone } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings-store";
import type { JournalEntry } from "@/lib/db";

const EMPTY_DETAILS: JournalDetails = { severity: null, places: [], kind: "symptom" };

/* ------------------------------------------------------------------ */
/* Composer                                                            */

function Composer() {
  const { toast } = useToast();
  const add = useAddJournalEntry();
  const onBloodThinners = useOnBloodThinners();
  const [words, setWords] = useState("");
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [details, setDetails] = useState<JournalDetails>(EMPTY_DETAILS);
  const [touched, setTouched] = useState<{ severity?: true; places?: true; kind?: true }>({});
  const [showDetails, setShowDetails] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [customTime, setCustomTime] = useState(getCurrentDateTimeLocal());
  const weights = useRecentWeights(Date.now());

  // As you write, fill in what the words say, on the device, but never over
  // a field you set yourself.
  const onWords = (text: string) => {
    setWords(text);
    const found = suggestJournalDetails(text);
    if (!titleTouched) setTitle(found.finding ?? "");
    setDetails((d) => ({
      severity: touched.severity ? d.severity : found.severity,
      places: touched.places ? d.places : found.places,
      kind: touched.kind ? d.kind : found.kind,
    }));
  };
  const onDetails = (next: JournalDetails) => {
    setTouched((t) => ({
      ...t,
      ...(next.severity !== details.severity && { severity: true as const }),
      ...(next.places !== details.places && { places: true as const }),
      ...(next.kind !== details.kind && { kind: true as const }),
    }));
    setDetails(next);
  };

  const trimmed = words.trim();
  const finalTitle = title.trim() || titleFromWords(trimmed);
  const summary = [
    details.severity !== null && `${details.severity}/10`,
    details.places.length > 0 && details.places.map(placeLabel).join("; "),
    trimmed && KIND_LABEL[details.kind],
  ]
    .filter(Boolean)
    .join(" · ");
  const timestamp = showTime ? dateTimeLocalToTimestamp(customTime) : Date.now();
  const notices = trimmed
    ? [
        ...journalNotices({ finding: finalTitle, words: trimmed, ...details }, { onBloodThinners }),
        ...[rapidWeightGainNotice(weights, timestamp)].filter((n) => n !== null),
      ]
    : [];

  const reset = () => {
    setWords("");
    setTitle("");
    setTitleTouched(false);
    setDetails(EMPTY_DETAILS);
    setTouched({});
    setShowDetails(false);
    setShowTime(false);
    setCustomTime(getCurrentDateTimeLocal());
  };

  const save = async () => {
    try {
      await add.mutateAsync({
        words: trimmed,
        finding: finalTitle,
        kind: details.kind,
        places: details.places,
        severity: details.severity,
        timestamp,
        timePrecision: "exact",
        source: "manual",
      });
      toast({ title: "Added to your journal", description: finalTitle, variant: "success" });
      reset();
    } catch (e) {
      toast({
        title: "Could not add the entry",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <ModuleCard domain="journal" icon={NotebookPen} title="New entry" data-testid="journal-composer">
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="journal-words" className="text-[0.8125rem] text-muted-foreground">
            What did you notice?
          </Label>
          <Textarea
            id="journal-words"
            rows={3}
            maxLength={JOURNAL_WORDS_MAX}
            placeholder="e.g. Pain in my left knee, about a four, worse on the stairs."
            value={words}
            onChange={(e) => onWords(e.target.value)}
          />
        </div>

        <JournalNotices notices={notices} />

        <div className="space-y-2">
          <SubToggle expanded={showDetails} onToggle={() => setShowDetails((v) => !v)}>
            {showDetails || !summary ? "Details" : `Details · ${summary}`}
          </SubToggle>
          {showDetails && (
            <div className="space-y-3 border border-line bg-muted/50 p-3">
              <div className="space-y-1">
                <Label htmlFor="journal-title" className="text-xs text-muted-foreground">
                  Title (what a doctor reads first)
                </Label>
                <Input
                  id="journal-title"
                  value={title}
                  maxLength={JOURNAL_FINDING_MAX}
                  placeholder={titleFromWords(trimmed) || "e.g. Knee pain"}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setTitleTouched(true);
                  }}
                />
              </div>
              <JournalDetailFields value={details} onChange={onDetails} idPrefix="journal-new" />
            </div>
          )}
          <CollapsibleTimeInputControlled
            id="journal-time"
            label="When did this happen?"
            value={customTime}
            onChange={setCustomTime}
            expanded={showTime}
            onToggle={() => setShowTime((v) => !v)}
          />
        </div>

        <Button className="w-full" disabled={!trimmed || add.isPending} onClick={() => void save()}>
          Add to journal
        </Button>
      </div>
    </ModuleCard>
  );
}

/* ------------------------------------------------------------------ */
/* Log                                                                 */

const DAY_LABEL: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" };

function dayLabel(key: string, todayKey: string): string {
  if (key === todayKey) return "Today";
  if (key === shiftDayKey(todayKey, -1)) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 12).toLocaleDateString(undefined, DAY_LABEL);
}

function EntryRow({ e, onDelete }: { e: JournalEntry; onDelete: () => void }) {
  const meta = [
    e.severity !== null && `${e.severity}/10 ${severityWord(e.severity)}`,
    e.places.length > 0 && e.places.map(placeLabel).join("; "),
    KIND_LABEL[e.kind],
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="wm-rec items-start" style={{ "--c": domainColor("journal") } as CSSProperties} data-testid="journal-entry">
      <div className="main items-start">
        <span className="tm w-12 pt-0.5">{e.timePrecision === "day" ? "All day" : journalTimeText(e)}</span>
        <span className="tx">
          <span className="lb">{e.finding}</span>
          <span className="text-sm leading-snug">{e.words}</span>
          <span className="text-xs text-muted-foreground">{meta}</span>
        </span>
      </div>
      <button type="button" className="wm-ibtn" onClick={onDelete} aria-label={`Delete ${e.finding}`} title="Delete entry">
        <Trash2 />
      </button>
    </div>
  );
}

function LogList({ entries }: { entries: readonly JournalEntry[] }) {
  const { toast } = useToast();
  const remove = useDeleteJournalEntry();
  const [pending, setPending] = useState<JournalEntry | null>(null);
  const dayStartHour = useSettingsStore((s) => s.dayStartHour);
  const tz = getDeviceTimezone();
  const todayKey = logicalDayKey(Date.now(), dayStartHour, tz);
  const days = useMemo(() => {
    const map = new Map<string, JournalEntry[]>();
    for (const e of entries) {
      const key = logicalDayKey(e.timestamp, dayStartHour, tz);
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return [...map.entries()];
  }, [entries, dayStartHour, tz]);

  const confirmDelete = async () => {
    if (!pending) return;
    try {
      await remove.mutateAsync(pending.id);
      toast({ title: "Entry deleted" });
    } catch {
      toast({ title: "Could not delete the entry", variant: "destructive" });
    }
    setPending(null);
  };

  if (entries.length === 0) {
    return (
      <div className="wm-empty rec">
        <NotebookPen aria-hidden="true" />
        <p>Nothing in your journal yet. Write what you noticed above, or use Hold to talk.</p>
      </div>
    );
  }

  return (
    <>
      {days.map(([key, list]) => (
        <div key={key} className="min-w-0">
          <h3 className="wm-day">
            <Calendar aria-hidden="true" />
            <span>{dayLabel(key, todayKey)}</span>
            <span className="wm-cnt">{list.length === 1 ? "1 entry" : `${list.length} entries`}</span>
          </h3>
          <div className="wm-list">
            {list.map((e) => (
              <EntryRow key={e.id} e={e} onDelete={() => setPending(e)} />
            ))}
          </div>
        </div>
      ))}
      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{pending?.finding}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              Its words are wiped from this device and from your cloud copy. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Printout                                                            */

function TitleFilter({
  all,
  value,
  onChange,
}: {
  all: readonly { finding: string; count: number }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id="journal-print-titles"
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-10 w-full justify-between px-3 font-normal"
        >
          <span className="truncate">{value.length === 0 ? "All titles" : value.join(", ")}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Search titles…" />
          <CommandList>
            <CommandEmpty>No title found.</CommandEmpty>
            <CommandGroup>
              {all.map(({ finding, count }) => (
                <CommandItem
                  key={finding}
                  value={finding}
                  onSelect={() => onChange(value.includes(finding) ? value.filter((v) => v !== finding) : [...value, finding])}
                >
                  <Check className={cn("mr-2 h-4 w-4", value.includes(finding) ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1">{finding}</span>
                  <span className="num text-xs text-muted-foreground">{count}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function Printout({ entries }: { entries: readonly JournalEntry[] }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [days, setDays] = useState<string>("14");
  const [titles, setTitles] = useState<string[]>([]);
  const dayStartHour = useSettingsStore((s) => s.dayStartHour);
  const tz = getDeviceTimezone();
  const toMs = Date.now();
  // The period starts at the start of the logical day `days - 1` days ago.
  const fromMs = logicalDayStart(shiftDayKey(logicalDayKey(toMs, dayStartHour, tz), -(Number(days) - 1)), dayStartHour, tz);
  const all = findingCounts(entries);
  const rows = printRows(entries, fromMs, toMs, titles);
  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const name = user?.name && user.name !== user.email ? user.name : null;

  const save = () => {
    try {
      saveJournalPDF({ rows, fromMs, toMs, name, timeZone: tz, printedAt: toMs });
    } catch {
      toast({ title: "Could not make the PDF", variant: "destructive" });
    }
  };

  let lastDay = "";
  return (
    <>
      <div className="wm-card" style={{ "--c": domainColor("journal") } as CSSProperties}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="journal-print-period" className="text-xs text-muted-foreground">
              Period
            </Label>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger id="journal-print-period" className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRINT_PERIOD_DAYS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    Last {d} days
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="journal-print-titles" className="text-xs text-muted-foreground">
              Titles
            </Label>
            <TitleFilter all={all} value={titles} onChange={setTitles} />
          </div>
        </div>
        <Button className="mt-3 w-full gap-2" data-domain="journal" onClick={save}>
          <FileDown className="h-4 w-4" aria-hidden="true" />
          Save as PDF · {rows.length} {rows.length === 1 ? "entry" : "entries"}
        </Button>
      </div>

      {/* The page as printed: black on white, whatever the app theme. */}
      <div className="border border-line bg-white p-4 text-[11px] text-[#14161F] shadow-sm" aria-label="Printout preview" data-testid="journal-printout">
        <div className="flex items-baseline justify-between gap-2 border-b-2 border-[#14161F] pb-1.5">
          <span className="text-base font-semibold">Symptom and event log</span>
          <span className="num text-[10px] text-[#4A4D5A]">
            {fmtDate(fromMs)} – {fmtDate(toMs)}
          </span>
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-[#4A4D5A]">
          <span>{name ?? ""}</span>
          <span>Printed {fmtDate(toMs)}</span>
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[#14161F] text-left text-[9px] uppercase tracking-[0.05em] text-[#4A4D5A]">
                <th className="py-1 pr-2 font-semibold">Date</th>
                <th className="py-1 pr-2 font-semibold">Time</th>
                <th className="py-1 pr-2 font-semibold">Entry, in the patient&apos;s words</th>
                <th className="py-1 pr-2 font-semibold">Where</th>
                <th className="py-1 font-semibold">0–10</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const key = logicalDayKey(e.timestamp, dayStartHour, tz);
                const show = key !== lastDay;
                lastDay = key;
                return (
                  <tr key={e.id} className="border-b border-[#C9C6BD] align-top">
                    <td className="num whitespace-nowrap py-1.5 pr-2">
                      {show ? new Date(e.timestamp).toLocaleDateString(undefined, { day: "2-digit", month: "short" }) : ""}
                    </td>
                    <td className="num whitespace-nowrap py-1.5 pr-2">{journalTimeText(e)}</td>
                    <td className="py-1.5 pr-2">
                      <span className="block font-semibold">{e.finding}</span>
                      <span className="block italic text-[#4A4D5A]">&ldquo;{e.words}&rdquo;</span>
                    </td>
                    <td className="py-1.5 pr-2">{e.places.length ? e.places.map(placeLabel).join("; ") : "–"}</td>
                    <td className="num py-1.5">{e.severity ?? "–"}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-center text-[#4A4D5A]">
                    No entries in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 border-t border-[#C9C6BD] pt-1.5 text-[9.5px] text-[#4A4D5A]">
          Intensity: 0 = none, 10 = worst imaginable. &ldquo;–&rdquo; = not rated, no time, or no body place. &ldquo;~&rdquo; =
          approximate time. Times are local time ({tz}). Self-recorded in Intake Tracker; not clinical findings.
        </p>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Window                                                              */

export function JournalWindowBody() {
  const entries = useJournalEntries();
  const [tab, setTab] = useState("log");
  return (
    <div className="wm" data-testid="journal-body" data-domain="journal">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Journal" className="wm-tabs sticky top-0 z-[2] flex h-auto w-full overflow-hidden bg-panel">
          <TabsTrigger value="log" className="min-w-0 flex-1 px-1">
            Log
          </TabsTrigger>
          <TabsTrigger value="printout" className="min-w-0 flex-1 px-1">
            Printout
          </TabsTrigger>
        </TabsList>
        <TabsContent value="log" className="wm-stack mt-0">
          <Composer />
          {entries && <LogList entries={entries} />}
        </TabsContent>
        <TabsContent value="printout" className="wm-stack mt-0">
          <Printout entries={entries ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
