/**
 * Every structured-result tool sent to the quality (Claude Sonnet 5.5) and
 * premium (Claude Opus 5.5) models is `strict: true`, and its schema stays
 * inside what strict mode accepts.
 *
 * Both models reject a forced `tool_choice` with a 400, so the routes send
 * `auto`. `strict` is what then keeps the arguments schema-valid — and a
 * strict tool whose schema uses something outside the supported subset is
 * rejected when the request is made (a 400 on every call, so the whole
 * feature is down). That is a property of the definitions, so it is checked
 * here rather than found in production.
 *
 * The rules, from Anthropic's structured-outputs documentation:
 *   - every object sets `additionalProperties: false`;
 *   - no `minimum` / `maximum` / `multipleOf`, no `minLength` / `maxLength`,
 *     no `maxItems`, and `minItems` only 0 or 1;
 *   - per request, at most 24 optional parameters (every property not named
 *     in its object's `required`) and at most 16 parameters with a union
 *     type (`anyOf` or a type array such as `["number", "null"]`).
 *
 * Each route declares one strict tool (web_search is a server tool and takes
 * no `strict`), so the per-request limits are checked per tool.
 */
import { describe, it, expect } from "vitest";
import { PARSE_RESULT_TOOL } from "@intake/ai-prompts/parse";
import { PARSE_TOOL } from "@intake/ai-prompts/voice-parse";
import { SUBSTANCE_LOOKUP_TOOL } from "@intake/ai-prompts/substance-lookup";
import { NUTRIENT_ANALYSIS_TOOL } from "@intake/ai-prompts/nutrient-analysis";
import { FAST_INSIGHT_TOOL } from "@intake/ai-prompts/analytics-insights";
import { MEDICINE_SEARCH_TOOL } from "@intake/ai-prompts/medicine-search";
import { MEDICINE_ABOUT_TOOL } from "@intake/ai-prompts/medicine-about";
import { INTERACTION_CHECK_TOOL } from "@intake/ai-prompts/interaction-check";
import { TITRATION_WARNINGS_TOOL } from "@intake/ai-prompts/titration-warnings";

const MAX_OPTIONAL_PARAMETERS = 24;
const MAX_UNION_PARAMETERS = 16;

const UNSUPPORTED_KEYWORDS = [
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "maxItems",
  "uniqueItems",
  "patternProperties",
];

type Schema = Record<string, unknown>;

interface Audit {
  problems: string[];
  optional: number;
  unions: number;
}

function isObject(value: unknown): value is Schema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Walk a schema, collecting strict-mode violations and the counted totals. */
function audit(schema: Schema, at: string, out: Audit): void {
  for (const keyword of UNSUPPORTED_KEYWORDS) {
    if (keyword in schema) out.problems.push(`${at}: "${keyword}" is not supported`);
  }
  if ("minItems" in schema && schema.minItems !== 0 && schema.minItems !== 1) {
    out.problems.push(`${at}: minItems must be 0 or 1`);
  }
  if (Array.isArray(schema.type) || Array.isArray(schema.anyOf)) out.unions++;

  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.includes("object")) {
    if (schema.additionalProperties !== false) {
      out.problems.push(`${at}: object without additionalProperties: false`);
    }
    const properties = isObject(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : null;
    if (!required) out.problems.push(`${at}: object without a required array`);
    for (const name of required ?? []) {
      if (!(name in properties)) out.problems.push(`${at}: requires unknown property "${name}"`);
    }
    for (const [name, child] of Object.entries(properties)) {
      if (!required?.includes(name)) out.optional++;
      if (isObject(child)) audit(child, `${at}.${name}`, out);
    }
  }
  if (isObject(schema.items)) audit(schema.items, `${at}[]`, out);
  for (const branch of Array.isArray(schema.anyOf) ? schema.anyOf : []) {
    if (isObject(branch)) audit(branch, `${at}|anyOf`, out);
  }
}

const QUALITY_TOOLS = [
  PARSE_RESULT_TOOL,
  PARSE_TOOL,
  SUBSTANCE_LOOKUP_TOOL,
  NUTRIENT_ANALYSIS_TOOL,
  FAST_INSIGHT_TOOL,
];
const PREMIUM_TOOLS = [
  MEDICINE_SEARCH_TOOL,
  MEDICINE_ABOUT_TOOL,
  INTERACTION_CHECK_TOOL,
  TITRATION_WARNINGS_TOOL,
];

describe.each([
  ["quality", QUALITY_TOOLS],
  ["premium", PREMIUM_TOOLS],
] as const)("%s-tier result tools are valid strict tools", (_tier, tools) => {
  it.each(tools.map((tool) => [tool.name, tool] as const))("%s", (_name, tool) => {
    expect((tool as { strict?: boolean }).strict).toBe(true);

    const result: Audit = { problems: [], optional: 0, unions: 0 };
    audit(tool.input_schema as Schema, tool.name, result);

    expect(result.problems).toEqual([]);
    expect(result.optional).toBeLessThanOrEqual(MAX_OPTIONAL_PARAMETERS);
    expect(result.unions).toBeLessThanOrEqual(MAX_UNION_PARAMETERS);
  });
});

describe("voice-parse tool", () => {
  // The per-item fields are optional by design (one flat object covers every
  // kind), which puts this tool closest to the optional-parameter limit. A
  // new per-item field is fine; one that tips it over is a 400 on every
  // voice log, so the headroom is pinned where a change will be seen.
  it("keeps headroom under the optional-parameter limit", () => {
    const result: Audit = { problems: [], optional: 0, unions: 0 };
    audit(PARSE_TOOL.input_schema as Schema, PARSE_TOOL.name, result);
    expect(result.optional).toBe(20);
    expect(PARSE_TOOL.input_schema.required).toEqual(["items", "reasoning"]);
  });

  it("closes the per-item object, which strict mode requires of every object", () => {
    const item = PARSE_TOOL.input_schema.properties.items.items;
    expect(item.additionalProperties).toBe(false);
    expect(item.required).toEqual(["kind"]);
  });
});
