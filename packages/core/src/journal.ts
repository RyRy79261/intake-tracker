/**
 * The medical journal's domain rules: body places, kind labels, the intensity
 * words, the safety notices shown before an entry is saved, and the rows a
 * doctor's printout holds. Pure: callers pass the time and the context.
 *
 * Shape of an entry: SOCRATES (the clinical symptom history) with only the
 * parts that apply. Site = places, Severity = 0-10 (LOINC 72514-3), Time =
 * timestamp and precision, everything else stays in the person's own words.
 */
import type { JournalEntryKind, JournalTimePrecision } from "@intake/types/records";

// ─── Body places ─────────────────────────────────────────────────────────

export interface BodyPlace {
  id: string;
  name: string;
  group: "Head and neck" | "Body" | "Arms" | "Legs" | "Whole body";
  /** Takes the person's own left or right ("-l" / "-r"). */
  sided?: true;
}

/** Where on the body. Sided places take "-l" / "-r": the person's own side. */
export const BODY_PLACES: readonly BodyPlace[] = [
  { id: "head", name: "Head", group: "Head and neck" },
  { id: "eyes", name: "Eyes", group: "Head and neck" },
  { id: "ears", name: "Ears", group: "Head and neck" },
  { id: "nose", name: "Nose and sinuses", group: "Head and neck" },
  { id: "throat", name: "Mouth and throat", group: "Head and neck" },
  { id: "neck", name: "Neck", group: "Head and neck" },
  { id: "chest", name: "Chest", group: "Body" },
  { id: "abdomen", name: "Stomach area", group: "Body" },
  { id: "upperback", name: "Upper back", group: "Body" },
  { id: "lowerback", name: "Lower back", group: "Body" },
  { id: "pelvis", name: "Hips and groin", group: "Body" },
  { id: "armpit", name: "Armpit", group: "Arms", sided: true },
  { id: "shoulder", name: "Shoulder", group: "Arms", sided: true },
  { id: "arm", name: "Arm", group: "Arms", sided: true },
  { id: "hand", name: "Hand or wrist", group: "Arms", sided: true },
  { id: "thigh", name: "Thigh", group: "Legs", sided: true },
  { id: "knee", name: "Knee", group: "Legs", sided: true },
  { id: "lowerleg", name: "Shin or calf", group: "Legs", sided: true },
  { id: "foot", name: "Foot or ankle", group: "Legs", sided: true },
  { id: "skin", name: "Skin, all over", group: "Whole body" },
  { id: "whole", name: "Whole body", group: "Whole body" },
];

export interface PlaceOption {
  id: string;
  label: string;
  group: BodyPlace["group"];
}

/** Every pickable place id: unsided places once, sided places as left and right. */
export const PLACE_OPTIONS: readonly PlaceOption[] = BODY_PLACES.flatMap((p) =>
  p.sided
    ? [
        { id: `${p.id}-l`, label: `${p.name}, left`, group: p.group },
        { id: `${p.id}-r`, label: `${p.name}, right`, group: p.group },
      ]
    : [{ id: p.id, label: p.name, group: p.group }],
);

const PLACE_BY_ID = new Map(PLACE_OPTIONS.map((o) => [o.id, o]));

/** The groups in display order. */
export const PLACE_GROUPS: readonly BodyPlace["group"][] = [...new Set(BODY_PLACES.map((p) => p.group))];

export const isPlaceId = (id: string): boolean => PLACE_BY_ID.has(id);

/**
 * "Knee, left" for "knee-l"; "Knee, which side?" for a sided place named
 * without a side; an unknown id is shown as it is.
 */
export function placeLabel(id: string): string {
  const known = PLACE_BY_ID.get(id)?.label;
  if (known) return known;
  const bare = BODY_PLACES.find((p) => p.sided && p.id === id);
  return bare ? `${bare.name}, which side?` : id;
}

/** The place's base id: "knee" for "knee-l". */
export function basePlace(id: string): string {
  return id.replace(/-[lr]$/, "");
}

/** A sided place named without a side ("knee"): it needs one before saving. */
export function isPlaceMissingSide(id: string): boolean {
  return BODY_PLACES.some((p) => p.sided && p.id === id);
}

/** Split the voice parser's comma list ("knee-l, eyes") into place ids. */
export function parsePlaceList(text: string | undefined | null): string[] {
  return [...new Set((text ?? "").split(",").map((s) => s.trim()).filter(Boolean))];
}

// ─── Labels ──────────────────────────────────────────────────────────────

export const JOURNAL_KINDS: readonly JournalEntryKind[] = ["symptom", "sign", "event"];

/** What the kind buttons say: something felt, seen, or that happened. */
export const KIND_LABEL: Record<JournalEntryKind, string> = {
  symptom: "Felt",
  sign: "Seen",
  event: "Happened",
};

export const JOURNAL_TIME_PRECISIONS: readonly JournalTimePrecision[] = ["exact", "approx", "day"];

/** Limits shared by the form, the voice parser and the backup schema. */
export const JOURNAL_WORDS_MAX = 500;
export const JOURNAL_FINDING_MAX = 60;

/** A title from the words when none was given: the first 40 characters, cut at a word. */
export function titleFromWords(words: string): string {
  const flat = words.trim().replace(/\s+/g, " ");
  if (flat.length <= 40) return flat;
  const cut = flat.slice(0, 40);
  const space = cut.lastIndexOf(" ");
  return `${(space > 20 ? cut.slice(0, space) : cut).replace(/[,.;:]$/, "")}…`;
}

/**
 * The label for a 0-10 rating. The cut points (1-3 mild, 4-6 moderate,
 * 7-10 severe) are a common convention, not a standard; they are shown as
 * words only and never stored.
 */
export function severityWord(n: number): "none" | "mild" | "moderate" | "severe" {
  if (n <= 0) return "none";
  if (n <= 3) return "mild";
  if (n <= 6) return "moderate";
  return "severe";
}

// ─── Safety notices ──────────────────────────────────────────────────────

export interface JournalNotice {
  /** urgent = call 112 now; info = worth telling your doctor or heart team. */
  level: "urgent" | "info";
  text: string;
}

export interface JournalNoticeContext {
  /** An anticoagulant or antiplatelet is on the active medication list. */
  onBloodThinners: boolean;
}

/** Anticoagulants and antiplatelets, by generic name (lower case). */
const BLOOD_THINNERS = [
  "apixaban", "rivaroxaban", "edoxaban", "dabigatran",
  "warfarin", "phenprocoumon", "acenocoumarol",
  "heparin", "enoxaparin", "dalteparin", "tinzaparin", "fondaparinux",
  "clopidogrel", "prasugrel", "ticagrelor",
  "acetylsalicylic acid", "aspirin",
];

/** Whether a medicine's generic name is an anticoagulant or antiplatelet. */
export function isBloodThinner(genericName: string): boolean {
  const name = genericName.toLowerCase();
  return BLOOD_THINNERS.some((drug) => name.includes(drug));
}

const has = (text: string, re: RegExp) => re.test(text);

/**
 * The notices to show for an entry before it is saved. A notice never blocks
 * saving and never names a cause; it exists for the few entries where only
 * filing them would be the wrong response.
 *
 * Basis: thunderclap or worst-ever headache and new focal neurological
 * symptoms are red flags for a secondary cause (Practical Neurology,
 * "Ruling out secondary headache"); bleeding from the gut or bladder is an
 * emergency on blood thinners; new ankle swelling is a heart-failure warning
 * sign (Heart Failure Matters, ESC HFA).
 */
export function journalNotices(
  entry: { finding: string; words: string; severity: number | null; places: readonly string[] },
  ctx: JournalNoticeContext,
): JournalNotice[] {
  const text = `${entry.finding} ${entry.words}`.toLowerCase();
  const out: JournalNotice[] = [];

  const headache = has(text, /head ?ache|migraine/) || (entry.places.includes("head") && has(text, /pain|hurt|pound|throb/));
  if (headache && (has(text, /\bsudden|out of nowhere|thunderclap|worst\b/) || (entry.severity ?? 0) >= 9)) {
    out.push({
      level: "urgent",
      text: ctx.onBloodThinners
        ? "A sudden or worst-ever headache on blood thinners needs urgent care. Call 112."
        : "A sudden or worst-ever headache needs urgent care. Call 112.",
    });
  }

  if ((has(text, /chest/) || entry.places.includes("chest")) && has(text, /pain|pressure|tight|squeez|crush/)) {
    out.push({ level: "urgent", text: "Chest pain or pressure needs urgent care. Call 112." });
  }

  // Stroke signs (FAST): sudden or one-sided weakness or numbness, a
  // drooping face, trouble speaking, sudden loss of vision. General tiredness
  // ("feeling weak") or a leg gone numb from sitting is not one of them.
  const weakOrNumb = has(text, /\bweak|\bnumb/);
  if (
    (weakOrNumb && has(text, /\bsudden|one side|left side|right side|half (of )?my (body|face)/)) ||
    has(text, /slurred|can'?t speak|trouble speaking|words (came out|come out) wrong|face (is |was )?droop|droop(y|ing) face|lost (my |the )?vision|vision loss|blind in one eye|went blind/)
  ) {
    out.push({
      level: "urgent",
      text: "Sudden weakness or numbness on one side, a drooping face, trouble speaking or loss of vision needs urgent care. Call 112.",
    });
  }

  if (has(text, /black (stool|poo|poop)|tarry|blood in (my )?(urine|stool|pee|poo|poop)|(vomit|throw)(ed|ing)? (up )?blood|cough(ed|ing)? (up )?blood/)) {
    out.push({
      level: "urgent",
      text: ctx.onBloodThinners
        ? "Bleeding from the gut or bladder on blood thinners needs urgent care. Call 112."
        : "Blood in vomit, stool or urine, or black stool, needs urgent care. Call 112.",
    });
  }

  if (ctx.onBloodThinners && has(text, /bruis/)) {
    out.push({
      level: "info",
      text: "Bruising is common on blood thinners. Tell your doctor about large, many or unexplained bruises, or bleeding that does not stop.",
    });
  }

  const legPlace = entry.places.some((p) => ["foot", "lowerleg"].includes(basePlace(p)));
  if (has(text, /swell|swollen|puffy/) && (legPlace || has(text, /ankle|feet|foot|leg/))) {
    out.push({
      level: "info",
      text: "New ankle or leg swelling can be fluid building up. If you have heart failure, call your heart team.",
    });
  }

  return out;
}

/**
 * Heart-failure self-care: a gain of more than 2 kg within 3 days is worth a
 * call to the heart team (Heart Failure Matters). `weights` are any readings;
 * only the 3 days up to `at` count.
 */
export function rapidWeightGainNotice(
  weights: readonly { timestamp: number; weight: number }[],
  at: number,
): JournalNotice | null {
  const from = at - 3 * 24 * 60 * 60 * 1000;
  const window = weights.filter((w) => w.timestamp >= from && w.timestamp <= at).sort((a, b) => a.timestamp - b.timestamp);
  if (window.length < 2) return null;
  const latest = window[window.length - 1]!.weight;
  const lowest = Math.min(...window.slice(0, -1).map((w) => w.weight));
  if (latest - lowest <= 2) return null;
  return {
    level: "info",
    text: `Your weight is up ${(latest - lowest).toFixed(1)} kg in 3 days. A gain of more than 2 kg in 3 days is worth a call to your heart team.`,
  };
}

// ─── Printout ────────────────────────────────────────────────────────────

/** The periods the doctor's printout offers, in days. */
export const PRINT_PERIOD_DAYS = [7, 14, 30, 90] as const;

/** Printout rows: live entries inside [fromMs, toMs], oldest first, optionally only some titles. */
export function printRows<E extends { timestamp: number; finding: string; deletedAt: number | null }>(
  entries: readonly E[],
  fromMs: number,
  toMs: number,
  findings: readonly string[] = [],
): E[] {
  return entries
    .filter(
      (e) =>
        e.deletedAt === null &&
        e.timestamp >= fromMs &&
        e.timestamp <= toMs &&
        (findings.length === 0 || findings.includes(e.finding)),
    )
    .sort((a, b) => a.timestamp - b.timestamp);
}

/** Distinct titles, most used first (ties alphabetical), for the printout filter. */
export function findingCounts(entries: readonly { finding: string; deletedAt: number | null }[]): { finding: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    if (e.deletedAt !== null || !e.finding) continue;
    counts.set(e.finding, (counts.get(e.finding) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([finding, count]) => ({ finding, count }))
    .sort((a, b) => b.count - a.count || a.finding.localeCompare(b.finding));
}

// ─── Typed-entry suggestions ─────────────────────────────────────────────
//
// The composer fills in a title, kind, place and rating as you type, from the
// words alone, on the device: nothing typed is sent anywhere to do it. It is
// a suggestion; a field the person sets is never overwritten. Spoken entries
// get the same fields from the voice parser instead.

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/** Words that name a place, checked in order; the first match wins. */
const PLACE_WORDS: readonly (readonly [RegExp, string])[] = [
  [/arm ?pit/, "armpit"], [/\bknee/, "knee"], [/\b(shin|calf)/, "lowerleg"], [/\bthigh/, "thigh"], [/\blegs?\b/, "lowerleg"],
  [/\b(foot|feet|ankles?|toes?)\b/, "foot"], [/\b(hand|wrist|fingers?)\b/, "hand"], [/\bshoulder/, "shoulder"], [/\barms?\b|elbow/, "arm"],
  [/\beyes?\b/, "eyes"], [/\bears?\b/, "ears"], [/post ?nasal|sinus|\bnose\b/, "nose"], [/throat|mouth/, "throat"], [/\bneck\b/, "neck"],
  [/\bchest\b/, "chest"], [/stomach|belly|abdomen|tummy/, "abdomen"], [/lower back/, "lowerback"], [/upper back/, "upperback"], [/\bhead/, "head"],
];

export interface JournalSuggestion {
  finding: string | null;
  kind: JournalEntryKind;
  places: string[];
  severity: number | null;
}

/** A title, kind, place and 0-10 rating suggested from typed words. */
export function suggestJournalDetails(text: string): JournalSuggestion {
  const t = text.toLowerCase();

  let kind: JournalEntryKind = "symptom";
  if (/\bwoke\b|\bslept\b|overslept|\bnap\b|\bfell\b|tripped/.test(t)) kind = "event";
  if (/bruis|rash|swell|swollen|\bbump|\blump|\bcut\b|scab|\bspots?\b/.test(t)) kind = "sign";

  const side = /\bleft\b/.test(t) ? "l" : /\bright\b/.test(t) ? "r" : null;
  const places: string[] = [];
  let named: string | null = null;
  for (const [re, id] of PLACE_WORDS) {
    if (!re.test(t)) continue;
    named = id;
    const sided = BODY_PLACES.find((p) => p.id === id)?.sided;
    if (!sided) places.push(id);
    else if (side) places.push(`${id}-${side}`);
    if (id === "nose" && /post ?nasal/.test(t)) places.push("throat");
    break;
  }

  const rated =
    t.match(/\b(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:\/|out of)\s*(?:10|ten)\b/) ??
    t.match(/\b(?:about |around |like |maybe )?an? (one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b(?!\s*(?:am|pm|o'?clock|hours?|minutes?|days?|times?))/);
  const raw = rated?.[1];
  const value = raw === undefined ? null : (NUMBER_WORDS[raw] ?? Number(raw));
  const severity = value !== null && Number.isInteger(value) && value >= 0 && value <= 10 ? value : null;

  // The place named, even when its side was not said ("my armpit").
  const region = named ? (BODY_PLACES.find((p) => p.id === named)?.name ?? "") : "";
  const finding =
    /woke up late|overslept|slept in/.test(t) ? "Woke up late"
    : /post ?nasal drip/.test(t) ? "Postnasal drip"
    : /nause|felt sick|feel sick/.test(t) ? "Nausea"
    : /head ?ache|migraine/.test(t) ? "Headache"
    : /bruis/.test(t) ? "Bruise"
    : /rash/.test(t) ? "Rash"
    : /swell|swollen/.test(t) ? "Swelling"
    : /dizz|lighthead/.test(t) ? "Dizziness"
    : /eyes? (feel|are|look)/.test(t) ? "Eyes feel strange"
    : /sensation|tingl/.test(t) ? `${region || "Body"} sensation`
    : /pain|ache|hurts?\b|sore/.test(t) ? (region ? `${region} pain` : "Pain")
    : null;

  return { finding, kind, places, severity };
}
