import { logAudit } from "@/lib/audit";
import { apiFetch } from "@/lib/api-fetch";
import type { SubstanceLookupResponse } from "@/lib/substance-lookup-schema";
import type { VoiceParseResponse } from "@/lib/voice-types";
import type { AnalyticsInsightsRequest } from "@intake/ai-prompts/analytics-insights";
import type { VoiceMedication } from "@intake/ai-prompts/voice-parse";

/**
 * The one client adapter for the app's AI routes.
 *
 * `aiClient.call(route, body)` sends the request through apiFetch (base URL
 * and Bearer token on Android), stops it at the route's own time limit, and
 * answers with a Result instead of a Response: the parsed body, or an
 * {@link AiError} with a code the UI can act on, the route's wording, and
 * whether the user can fall back to entering the values by hand. Callers
 * never read a Response, so a non-JSON body, a dropped connection, a cancel
 * and a timeout each come back as a code rather than a throw.
 *
 * The request and response types are the routes' contract ({@link AiRoutes});
 * the server task specs check their responses against the same types.
 *
 * PRIVACY: auth travels as the Neon Auth cookie (or the Bearer token on
 * Android) and is checked server-side by withAuth; the API key never leaves
 * the server; well-formed PII is redacted on the server before any prompt.
 */

// ── Contract ─────────────────────────────────────────────────────────────

/** POST /api/ai/parse */
export interface ParseResponse {
  water: number | null;
  /** Sodium in mg (the field name predates the sodium-only rule). */
  salt: number | null;
  measurement_type: "sodium";
  sugar: number | null;
  potassium: number | null;
  is_drink: boolean;
  caffeine_mg: number | null;
  abv_percent: number | null;
  reasoning?: string;
}

export interface MedicineStrengthOption {
  label: string;
  compounds: { name: string; strength: number }[];
}

/** POST /api/ai/medicine-search */
export interface MedicineSearchResult {
  brandNames: string[];
  localAlternatives: string[];
  genericName: string;
  dosageStrengths: string[];
  /** Active ingredient names — length ≥ 2 marks a combination drug. */
  activeIngredients: string[];
  /** Per-marketed-strength breakdown of each active ingredient's mg. */
  strengthOptions: MedicineStrengthOption[];
  commonIndications: string[];
  foodInstruction: "before" | "after" | "none";
  foodNote?: string | undefined;
  pillColor: string;
  pillShape: string;
  pillDescription: string;
  drugClass: string;
  visualIdentification?: string | undefined;
  contraindications: string[];
  warnings: string[];
  isGenericFallback: boolean;
  /** False when no web search returned results: colour and shape are blank. */
  appearanceVerified?: boolean;
}

export interface InteractionItem {
  substance: string;
  medication: string;
  severity: "AVOID" | "CAUTION" | "OK";
  description: string;
}

/** POST /api/ai/interaction-check */
export interface InteractionResult {
  interactions: InteractionItem[];
  drugClass?: string;
  summary?: string;
}

interface ActivePrescription {
  genericName: string;
  drugClass?: string;
}

export type InteractionCheckBody =
  | { mode: "conflict"; newMedication: string; activePrescriptions: ActivePrescription[] }
  | { mode: "lookup"; substance: string; activePrescriptions: ActivePrescription[] };

/** One substance named in a spoken interaction question. */
export interface VoiceInteractionSubstance {
  /** The words as transcribed. */
  heard: string;
  /** The corrected generic name. */
  name: string;
  /** The brand the user said, if any. */
  brand?: string;
  /** The name is a best guess from unclear speech. */
  unsure: boolean;
}

/** POST /api/ai/voice-interactions */
export interface VoiceInteractionsResult {
  substances: VoiceInteractionSubstance[];
  /** Substances past the per-question limit, left out. */
  overCap?: number;
  /** A short note when the question was not clear. */
  note?: string;
}

/** POST /api/ai/medicine-about (normalised by lib/medicine-about). */
export interface MedicineAboutResponse {
  drugClass: string;
  compounds: {
    name: string;
    drugClass: string;
    forText: string;
    howItWorks: string;
    sideEffects: string[];
  }[];
  warnings: { risk: string; whatToDo: string }[];
  contraindications: string[];
  foodInstruction: "before" | "after" | "none";
  foodNote: string;
  pillDescription: string;
  visualIdentification: string;
}

export interface TitrationWarningsBody {
  // `undefined` is allowed: JSON leaves the field out.
  prescriptions: {
    genericName: string;
    currentDosage?: string | undefined;
    newDosage?: string | undefined;
    newSchedule?: string[] | undefined;
    newTotalDaily?: string | undefined;
    frequency?: string | undefined;
  }[];
  otherMedications?: { genericName: string }[];
  title?: string;
}

export interface NutrientFinding {
  nutrient: string;
  status: "high" | "low" | "balanced";
  detail: string;
  exampleFoods: string[];
}

/** POST /api/ai/nutrient-analysis */
export interface NutrientAnalysisResult {
  summary: string;
  findings: NutrientFinding[];
  caveats: string[];
}

export interface NutrientAnalysisBody {
  windowDays: number;
  focus?: string;
  foods: { description: string; grams?: number }[];
  conditions?: string[];
  medications?: {
    name: string;
    phaseType: "maintenance" | "titration" | "prn";
    dose: string;
    frequency: string;
    daysOnPhase: number;
  }[];
}

/** POST /api/analytics/insights */
export interface InsightsResponse {
  narrative: string;
  observations: string[];
  generatedAt: number;
}

/**
 * Every AI route the client calls: its request body, its response, and the
 * route's `maxDuration` in seconds (the client stops a call 5 s after it,
 * by which time the server has answered with its own JSON 504 or the
 * platform has cut the function off). `ai-client.test.ts` checks each
 * `maxDuration` against the route file.
 */
export interface AiRoutes {
  "/api/ai/parse": { body: { input: string }; result: ParseResponse };
  "/api/ai/medicine-search": {
    body: { query: string; country?: string };
    result: MedicineSearchResult;
  };
  "/api/ai/substance-lookup": {
    body: { query: string; type: "caffeine" | "alcohol" };
    result: SubstanceLookupResponse;
  };
  "/api/ai/interaction-check": { body: InteractionCheckBody; result: InteractionResult };
  "/api/ai/medicine-about": {
    body: { genericName: string; compounds?: string[] };
    result: MedicineAboutResponse;
  };
  "/api/ai/titration-warnings": { body: TitrationWarningsBody; result: { warnings: string[] } };
  "/api/ai/nutrient-analysis": { body: NutrientAnalysisBody; result: NutrientAnalysisResult };
  "/api/ai/voice-parse": {
    body: {
      transcript: string;
      now?: unknown;
      kind?: "food" | "caffeine" | "alcohol";
      medications?: VoiceMedication[];
    };
    result: VoiceParseResponse;
  };
  "/api/ai/voice-interactions": {
    body: { transcript: string; medications?: string[] };
    result: VoiceInteractionsResult;
  };
  "/api/ai/voice-transcribe": { body: FormData; result: { text: string } };
  "/api/analytics/insights": { body: AnalyticsInsightsRequest; result: InsightsResponse };
  "/api/analytics/insights/deep": {
    body: AnalyticsInsightsRequest;
    result: { jobId: string; startedAt?: number; status?: string };
  };
}

export type AiRoute = keyof AiRoutes;

/**
 * Each route's exported `maxDuration`, in seconds. Null: the route sets
 * none (a quick hand-off), and the client sets no limit of its own.
 */
export const AI_ROUTE_MAX_DURATION_S: Record<AiRoute, number | null> = {
  "/api/ai/parse": 60,
  "/api/ai/medicine-search": 130,
  "/api/ai/substance-lookup": 60,
  "/api/ai/interaction-check": 60,
  "/api/ai/medicine-about": 60,
  "/api/ai/titration-warnings": 60,
  "/api/ai/nutrient-analysis": 90,
  "/api/ai/voice-parse": 60,
  "/api/ai/voice-interactions": 60,
  "/api/ai/voice-transcribe": null,
  "/api/analytics/insights": 90,
  "/api/analytics/insights/deep": null,
};

/** How long after the route's maxDuration the client gives up. */
export const CLIENT_GRACE_MS = 5_000;

/** The client's limit for one call to `route`, or null for none. */
export function aiTimeoutMs(route: AiRoute): number | null {
  const seconds = AI_ROUTE_MAX_DURATION_S[route];
  return seconds === null ? null : seconds * 1000 + CLIENT_GRACE_MS;
}

// ── Result ───────────────────────────────────────────────────────────────

/**
 * Codes an AiError carries. The server's codes come first (see the error
 * table in app/api/ai/_shared/ai-task.ts); the client adds OFFLINE,
 * NETWORK, CANCELLED, BAD_RESPONSE, and HTTP_<status> for a reply that
 * names no code.
 */
export type AiErrorCode =
  | "NO_AI_KEY"
  | "INVALID_KEY"
  | "KEY_UNREADABLE"
  | "AI_REFUSED"
  | "SEARCH_REQUIRED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "AI_TIMEOUT"
  | "AI_BAD_OUTPUT"
  | "RESPONSE_TRUNCATED"
  | "AI_INCOMPLETE"
  | "AI_FAILED"
  | "OFFLINE"
  | "NETWORK"
  | "CANCELLED"
  | "BAD_RESPONSE"
  | `HTTP_${number}`
  | (string & {});

export interface AiError {
  code: AiErrorCode;
  /** Text for the user: the route's own wording when it sent one. */
  message: string;
  /** The user can carry on by entering the values by hand. */
  fallbackToManual: boolean;
}

export type AiResult<T> = { ok: true; data: T } | { ok: false; error: AiError };

/**
 * Codes whose route message tells the user what to do next (add or fix a
 * key, enter it by hand, wait). For any other code a caller may show its own
 * wording instead; `aiErrorText` does that.
 */
export const ACTIONABLE_CODES: ReadonlySet<string> = new Set([
  "NO_AI_KEY",
  "KEY_UNREADABLE",
  "INVALID_KEY",
  "AI_REFUSED",
  "SEARCH_REQUIRED",
]);

export const isActionable = (error: AiError) => ACTIONABLE_CODES.has(error.code);

/** The route's message for an actionable code, else the caller's `fallback`. */
export const aiErrorText = (error: AiError, fallback: string) =>
  isActionable(error) ? error.message : fallback;

const MESSAGES: Record<string, string> = {
  OFFLINE: "You are offline. Connect to the internet and try again.",
  NETWORK: "Could not reach the AI service. Try again.",
  CANCELLED: "Cancelled.",
  AI_TIMEOUT: "The AI took too long to respond. Try again.",
  RATE_LIMITED: "Too many requests. Wait a minute and try again.",
  BAD_RESPONSE: "The AI service sent an answer the app could not read. Try again.",
};
const GENERIC = "The AI service did not answer. Try again later.";

const offline = () => typeof navigator !== "undefined" && navigator.onLine === false;

function fail(code: AiErrorCode, message?: string, fallbackToManual = false): AiResult<never> {
  return {
    ok: false,
    error: { code, message: message || MESSAGES[code] || GENERIC, fallbackToManual },
  };
}

/** The code a reply means: its own, else one implied by the status. */
function codeFor(status: number, code: unknown): AiErrorCode {
  if (typeof code === "string" && code !== "") return code;
  if (status === 429) return "RATE_LIMITED";
  if (status === 504) return "AI_TIMEOUT";
  return `HTTP_${status}`;
}

export interface AiCallOptions {
  /** Aborting it answers CANCELLED. */
  signal?: AbortSignal;
  /** Defaults to {@link aiTimeoutMs}: the route's maxDuration plus a grace. */
  timeoutMs?: number | null;
}

async function call<R extends AiRoute>(
  route: R,
  body: AiRoutes[R]["body"],
  { signal, timeoutMs = aiTimeoutMs(route) }: AiCallOptions = {},
): Promise<AiResult<AiRoutes[R]["result"]>> {
  if (offline()) return fail("OFFLINE");
  if (signal?.aborted) return fail("CANCELLED");

  const controller = new AbortController();
  let timedOut = false;
  const timer =
    timeoutMs === null
      ? undefined
      : setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    let response: Response;
    try {
      response = await apiFetch(route, {
        method: "POST",
        ...(body instanceof FormData
          ? { body }
          : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
        signal: controller.signal,
      });
    } catch {
      if (timedOut) return fail("AI_TIMEOUT");
      if (signal?.aborted) return fail("CANCELLED");
      return fail(offline() ? "OFFLINE" : "NETWORK");
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      if (timedOut) return fail("AI_TIMEOUT");
      if (signal?.aborted) return fail("CANCELLED");
      json = undefined;
    }
    // A cancel that lands after the reply still wins: the caller has moved on.
    if (signal?.aborted) return fail("CANCELLED");

    const obj = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : null;
    if (!response.ok) {
      const code = codeFor(response.status, obj?.code);
      const message = typeof obj?.error === "string" ? obj.error.trim() : "";
      return fail(code, message, obj?.fallbackToManual === true);
    }
    if (!obj) return fail("BAD_RESPONSE");
    return { ok: true, data: obj as AiRoutes[R]["result"] };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export const aiClient = { call };

// ── Food / drink parse ───────────────────────────────────────────────────

export interface ParsedIntake {
  water: number | null; // ml
  valueMg: number | null; // mg of sodium OR salt — measurementType says which
  measurementType: "sodium" | "salt";
  sugarG: number | null; // total sugars in grams
  potassiumMg: number | null; // potassium in mg (elemental K+)
  isDrink: boolean; // consumed as a liquid — logged as a drink, not a meal
  caffeineMg: number | null; // caffeine in mg for the portion
  abvPercent: number | null; // alcohol by volume, %
  reasoning?: string;
}

/**
 * Parse a food or drink description with AI. Throws with the route's
 * message on failure (the Food card shows a toast and keeps manual entry).
 * Every request is audit logged.
 */
export async function parseIntakeWithAI(input: string): Promise<ParsedIntake> {
  logAudit("ai_parse_request");
  const result = await aiClient.call("/api/ai/parse", { input });
  if (!result.ok) {
    logAudit("ai_parse_error", result.error.message);
    throw new Error(result.error.message);
  }
  logAudit("ai_parse_success");
  const r = result.data;
  return {
    water: r.water,
    valueMg: r.salt,
    measurementType: r.measurement_type,
    sugarG: r.sugar,
    potassiumMg: r.potassium ?? null,
    isDrink: r.is_drink === true,
    caffeineMg: r.caffeine_mg ?? null,
    abvPercent: r.abv_percent ?? null,
    ...(r.reasoning !== undefined && { reasoning: r.reasoning }),
  };
}
