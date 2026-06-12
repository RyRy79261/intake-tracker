/**
 * @intake/ai-prompts — the single home for the app's AI prompt/tool artifacts.
 *
 * Pure and SDK-free: depends only on @intake/types + zod. The Anthropic SDK
 * client, API-key vault, usage tracker, and route-level zod request/response
 * validation deliberately stay in apps/web so this package never drags the SDK
 * (or `server-only`/the DB) into the consumers — including the client bundle,
 * which transitively imports the analytics-insights schemas.
 *
 * The model registry and analytics-insights module are re-exported flat. The
 * per-route prompt/tool modules are namespaced because several share the
 * `SYSTEM_PROMPT` name; import them directly via their subpaths
 * (e.g. `@intake/ai-prompts/parse`) at the call sites.
 */
export * from "./models";
export * from "./analytics-insights";

export * as parse from "./parse";
export * as medicineSearch from "./medicine-search";
export * as substanceLookup from "./substance-lookup";
export * as substanceEnrich from "./substance-enrich";
export * as interactionCheck from "./interaction-check";
export * as nutrientAnalysis from "./nutrient-analysis";
export * as titrationWarnings from "./titration-warnings";
export * as voiceParse from "./voice-parse";
