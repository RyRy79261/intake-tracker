/**
 * The data each MCP tool exposes, in words a user can consent to.
 *
 * `registerReadOnlyTools` registers exactly the tools named here (its tool
 * names are typed as `McpToolName`), and the OAuth consent screen lists
 * `consentDataCategories()`. A new tool therefore can't ship without a
 * consent line, and the screen can't under-state what is shared.
 *
 * Kept free of query/DB imports so the authorize route can load it cheaply.
 */
export const MCP_TOOL_CONSENT = {
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

export type McpToolName = keyof typeof MCP_TOOL_CONSENT;

export const MCP_TOOL_NAMES = Object.keys(MCP_TOOL_CONSENT) as McpToolName[];

/** One line per exposed data category, in registration order. */
export function consentDataCategories(): string[] {
  return Array.from(new Set(Object.values(MCP_TOOL_CONSENT)));
}
