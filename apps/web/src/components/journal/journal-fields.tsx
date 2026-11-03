"use client";

/**
 * The optional details of a journal entry (kind, intensity, body place),
 * shared by the Journal composer and the voice review row, the safety
 * notices, and the review row's editor for the `journal_entry` voice kind.
 */
import { useId } from "react";
import { Activity, AlertTriangle, CalendarCheck, Eye, Info, type LucideIcon } from "lucide-react";
import { Button } from "@intake/ui/button";
import { Input } from "@intake/ui/input";
import { Label } from "@intake/ui/label";
import { Textarea } from "@intake/ui/textarea";
import type { VoiceItemOf } from "@intake/core/voice-items";
import {
  JOURNAL_FINDING_MAX,
  JOURNAL_KINDS,
  JOURNAL_WORDS_MAX,
  KIND_LABEL,
  journalNotices,
  parsePlaceList,
  severityWord,
  type JournalNotice,
} from "@intake/core/journal";
import type { JournalEntryKind } from "@intake/types/records";
import { cn } from "@/lib/utils";
import { optOnClass as SEG_ON } from "@/components/domain-scope";
import { BodyPlaceCombobox } from "@/components/journal/body-place-combobox";
import { useOnBloodThinners } from "@/hooks/use-journal-queries";

export interface JournalDetails {
  severity: number | null;
  places: string[];
  kind: JournalEntryKind;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

/**
 * 0-10 slider (LOINC 72514-3: 0 = none, 10 = worst imaginable). Not rated
 * until touched: the thumb sits faded at 0 and the first tap or drag sets the
 * value. "Clear" goes back to not rated.
 */
export function IntensitySlider({
  value,
  onChange,
  disabled,
  id,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  disabled?: boolean | undefined;
  id?: string | undefined;
}) {
  const rated = value !== null;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm" aria-live="polite">
          {rated ? (
            <>
              <b className="num">{value}</b>
              <span className="text-muted-foreground">
                {" "}/ 10 · {value === 0 ? "none" : value === 10 ? "worst imaginable" : severityWord(value)}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">Not rated. Tap or drag to rate.</span>
          )}
        </span>
        {rated && !disabled && (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onChange(null)}>
            Clear
          </Button>
        )}
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={10}
        step={1}
        disabled={disabled}
        value={value ?? 0}
        aria-valuetext={rated ? `${value} out of 10` : "Not rated"}
        onChange={(e) => onChange(Number(e.target.value))}
        // Unrated, the native value is 0, so keys that stay at 0 fire no
        // change event: they rate 0 here instead.
        onKeyDown={(e) => {
          if (!rated && ["Home", "ArrowLeft", "ArrowDown", "PageDown"].includes(e.key)) onChange(0);
        }}
        // A tap on the faded thumb at 0 changes nothing, so it would not rate 0 otherwise.
        onPointerUp={(e) => {
          if (!rated) onChange(Number(e.currentTarget.value));
        }}
        className="block w-full"
        style={{ accentColor: "hsl(var(--d, var(--fg)))", height: 28, opacity: rated ? 1 : 0.45 }}
      />
      <div className="num flex justify-between px-1 text-xs text-muted-foreground" aria-hidden="true">
        {Array.from({ length: 11 }, (_, n) => (
          <span key={n}>{n}</span>
        ))}
      </div>
    </div>
  );
}

/** Felt: a sensation. Seen: something visible. Happened: an event. */
const KIND_ICON: Record<JournalEntryKind, LucideIcon> = { symptom: Activity, sign: Eye, event: CalendarCheck };

/** Felt / Seen / Happened: three short words, so toggle buttons like Position on the BP card. */
export function KindToggle({
  value,
  onChange,
  disabled,
  compact,
}: {
  value: JournalEntryKind;
  onChange: (next: JournalEntryKind) => void;
  disabled?: boolean | undefined;
  /** Icon above the word, for narrow places such as a voice review row. */
  compact?: boolean | undefined;
}) {
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Kind">
      {JOURNAL_KINDS.map((k) => {
        const Icon = KIND_ICON[k];
        return (
          <Button
            key={k}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-pressed={value === k}
            className={cn(
              "min-w-0 gap-1.5",
              compact && "h-auto flex-col gap-0.5 px-1 py-1.5 text-xs",
              value === k && cn(SEG_ON, "before:hidden"),
            )}
            onClick={() => onChange(k)}
          >
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
            {KIND_LABEL[k]}
          </Button>
        );
      })}
    </div>
  );
}

/** Kind, intensity and body place. Intensity and place are optional. */
export function JournalDetailFields({
  value,
  onChange,
  disabled,
  idPrefix,
  stacked,
}: {
  value: JournalDetails;
  onChange: (next: JournalDetails) => void;
  disabled?: boolean | undefined;
  idPrefix: string;
  /** Narrow places such as a voice review row. */
  stacked?: boolean | undefined;
}) {
  return (
    <div className="space-y-3">
      <Field label="Kind">
        <KindToggle value={value.kind} onChange={(kind) => onChange({ ...value, kind })} disabled={disabled} compact={stacked} />
      </Field>
      <Field label="Intensity, 0–10" htmlFor={`${idPrefix}-severity`}>
        <IntensitySlider
          id={`${idPrefix}-severity`}
          value={value.severity}
          onChange={(severity) => onChange({ ...value, severity })}
          disabled={disabled}
        />
      </Field>
      {/* Full width: its labels ("Shin or calf, right") are long. */}
      <Field label="Body place" htmlFor={`${idPrefix}-place`}>
        <BodyPlaceCombobox
          id={`${idPrefix}-place`}
          value={value.places}
          onChange={(places) => onChange({ ...value, places })}
          disabled={disabled}
        />
      </Field>
    </div>
  );
}

/** The safety notices for an entry. They never block saving. */
export function JournalNotices({ notices }: { notices: readonly JournalNotice[] }) {
  if (notices.length === 0) return null;
  return (
    <div className="space-y-1.5" data-testid="journal-notices">
      {notices.map((n) => (
        <p
          key={n.text}
          role={n.level === "urgent" ? "alert" : undefined}
          className={cn(
            "flex items-start gap-1.5 border px-2.5 py-2 text-xs leading-snug",
            n.level === "urgent"
              ? "border-destructive bg-destructive/10 font-medium text-destructive"
              : "border-line bg-muted/50 text-muted-foreground",
          )}
        >
          {n.level === "urgent" ? (
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>{n.text}</span>
        </p>
      ))}
    </div>
  );
}

type JournalItem = VoiceItemOf<"journal_entry">;

/** The voice review row's editor for a `journal_entry` item. */
export function JournalEntryFields({
  item,
  onChange,
  disabled,
}: {
  item: JournalItem;
  onChange: (next: JournalItem) => void;
  disabled?: boolean | undefined;
}) {
  const rowId = `voice-journal-${useId().replace(/:/g, "")}`;
  const onBloodThinners = useOnBloodThinners();
  const details: JournalDetails = {
    severity: item.severity ?? null,
    places: parsePlaceList(item.places),
    kind: item.entryKind,
  };
  const setDetails = (d: JournalDetails) => {
    const { severity: _s, places: _p, ...rest } = item;
    onChange({
      ...rest,
      entryKind: d.kind,
      ...(d.severity !== null && { severity: d.severity }),
      ...(d.places.length > 0 && { places: d.places.join(",") }),
    });
  };
  const notices = journalNotices(
    { finding: item.finding, words: item.words, severity: details.severity, places: details.places },
    { onBloodThinners },
  );
  return (
    <div className="space-y-3">
      <JournalNotices notices={notices} />
      <Field label="Title" htmlFor={`${rowId}-finding`}>
        <Input
          id={`${rowId}-finding`}
          disabled={disabled}
          maxLength={JOURNAL_FINDING_MAX}
          value={item.finding}
          onChange={(e) => onChange({ ...item, finding: e.target.value })}
        />
      </Field>
      <Field label="Your words" htmlFor={`${rowId}-words`}>
        <Textarea
          id={`${rowId}-words`}
          disabled={disabled}
          rows={2}
          maxLength={JOURNAL_WORDS_MAX}
          value={item.words}
          onChange={(e) => onChange({ ...item, words: e.target.value })}
        />
      </Field>
      <JournalDetailFields value={details} onChange={setDetails} disabled={disabled} idPrefix={rowId} stacked />
    </div>
  );
}
