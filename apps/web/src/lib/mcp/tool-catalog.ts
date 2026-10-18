/**
 * The data each MCP tool exposes or changes, in words a user can consent to.
 *
 * `registerReadOnlyTools` and `registerWriteTools` register exactly the tools
 * named here (their tool names are typed as `McpToolName`), and the OAuth
 * consent screen lists `consentDataCategories()` and, when the write scope is
 * asked for, `consentWriteActions()`. A new tool therefore can't ship without
 * a consent line, and the screen can't under-state what is shared or changed.
 *
 * Kept free of query/DB imports so the authorize route can load it cheaply.
 */
export const MCP_READ_TOOL_CONSENT = {
  get_today_summary:
    "Today's intake totals, latest blood pressure and weight, and today's dose status",
  query_intake_history: "Water, sodium, sugar and potassium intake history",
  query_weight_history: "Weight history",
  query_blood_pressure_history: "Blood pressure and heart rate history",
  query_eating_history: "Food log history",
  query_substance_history: "Caffeine and alcohol history",
  query_urination_history: "Urination history",
  list_medications: "Active medications, dosing phases and schedules",
  list_titration_plans:
    "Titration plans, including their clinical notes and warnings",
  list_recent_doses: "Medication dose logs",
  get_inventory_status: "Medication inventory and refill thresholds",
} as const;

export const MCP_WRITE_TOOL_CONSENT = {
  log_food: "Log meals you ate, with their water, sodium, sugar and potassium",
  log_drink: "Log drinks, with their caffeine, alcohol, sodium, sugar and potassium",
  delete_logged_entry: "Remove a meal or drink that Claude logged (never one you logged)",
} as const;

export const MCP_TOOL_CONSENT = {
  ...MCP_READ_TOOL_CONSENT,
  ...MCP_WRITE_TOOL_CONSENT,
} as const;

export type McpReadToolName = keyof typeof MCP_READ_TOOL_CONSENT;
export type McpWriteToolName = keyof typeof MCP_WRITE_TOOL_CONSENT;
export type McpToolName = keyof typeof MCP_TOOL_CONSENT;

export const MCP_TOOL_NAMES = Object.keys(MCP_TOOL_CONSENT) as McpToolName[];

/** One line per exposed data category, in registration order. */
export function consentDataCategories(): string[] {
  return Array.from(new Set(Object.values(MCP_READ_TOOL_CONSENT)));
}

/** One line per change the write scope allows. */
export function consentWriteActions(): string[] {
  return Object.values(MCP_WRITE_TOOL_CONSENT);
}
