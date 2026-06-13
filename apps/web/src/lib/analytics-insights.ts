// Re-export shim. The analytics-insights schema, prompts (incl. the deep-mode
// prompt), and the buildInsightsPrompt builder moved to @intake/ai-prompts in
// Phase 4a. Existing `@/lib/analytics-insights` importers resolve unchanged.
export * from "@intake/ai-prompts/analytics-insights";
