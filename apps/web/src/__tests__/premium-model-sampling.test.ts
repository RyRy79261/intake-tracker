/**
 * Request-parameter guard for every `CLAUDE_MODELS.*` request.
 *
 * Claude Opus 4.7 and later, and Claude Sonnet 5, removed `temperature` /
 * `top_p` / `top_k`: setting any of them to a non-default value returns a
 * **400**, so the request fails outright instead of being nudged toward
 * determinism. Note `temperature: 0` is a non-default value — "deterministic"
 * is exactly the setting that breaks. The premium (Opus 5.5) and quality
 * (Sonnet 5) tiers are both on that request surface now, so the scan covers
 * every tier. The fast tier (Haiku 4.5) still accepts sampling parameters,
 * but nothing depends on them there and one rule is easier to keep than a
 * per-tier exception that goes stale on the next id bump.
 *
 * This shipped as a silent, total outage of every Opus-backed feature.
 * `/api/analytics/insights/deep` sent `temperature: 0.3`, so the batch
 * entry errored before the model ran and deep analysis failed 100% of the
 * time (issue #331); medicine-search, interaction-check and
 * titration-warnings each sent `temperature: 0` and 400'd the same way. The
 * Sonnet-backed routes were untouched then, which is why only the Opus
 * features looked broken — and why they are covered now that Sonnet 5 has
 * the same rule.
 *
 * Claude Opus 5.5 also rejects a forced `tool_choice` (`{type: "tool"}` or
 * `{type: "any"}`) with a 400. Premium requests use `auto` with `strict`
 * tools and a retry when no call comes back (see `_shared/claude-call.ts`).
 *
 * A source scan rather than a per-route runtime test: the failure mode is
 * "someone adds `temperature` back to a request", and that is a property of
 * the source. It parses with the TypeScript compiler rather than matching
 * text, so a brace inside a string or a template literal in the request
 * can't shift what the scan thinks the object literal is.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import ts from "typescript";
import { CLAUDE_MODELS } from "@intake/ai-prompts/models";

const SRC = path.resolve(process.cwd(), "src");

/** Parameters the current Opus and Sonnet models reject outright. */
const REJECTED_PARAMS = ["temperature", "top_p", "top_k"];

/** `tool_choice` types Claude Opus 5.5 rejects. */
const FORCED_TOOL_CHOICE_TYPES = ["tool", "any"];

/** Smallest `max_tokens` that leaves room for default adaptive thinking. */
const MIN_THINKING_MAX_TOKENS = 4096;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.includes(".test.")
    ) {
      out.push(full);
    }
  }
  return out;
}

/**
 * `model: CLAUDE_MODELS.<tier>` — the property that marks a request. Returns
 * the tier, or null when the property doesn't name a registry model.
 */
function modelTier(prop: ts.ObjectLiteralElementLike): string | null {
  if (!ts.isPropertyAssignment(prop)) return null;
  if (propertyName(prop) !== "model") return null;
  const value = prop.initializer;
  if (
    ts.isPropertyAccessExpression(value) &&
    ts.isIdentifier(value.expression) &&
    value.expression.text === "CLAUDE_MODELS"
  ) {
    return value.name.text;
  }
  return null;
}

/** Static name of a property, covering `x`, `"x"` and `["x"]` forms. */
function propertyName(prop: ts.ObjectLiteralElementLike): string | null {
  const name = prop.name;
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name)) {
    const expr = name.expression;
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
      return expr.text;
    }
  }
  return null;
}

interface RequestLiteral {
  literal: ts.ObjectLiteralExpression;
  tier: string;
}

/**
 * Every object literal in the file that is an API *request* on a registry
 * model, with the tier it names.
 *
 * `model: CLAUDE_MODELS.<tier>` alone is not enough: `recordUsage({...})`
 * carries the same property for attribution, and flagging those would put
 * the scan on usage bookkeeping rather than on the request it's meant to
 * guard. A request is what also carries `max_tokens` or `messages`.
 */
function requestLiterals(source: ts.SourceFile): RequestLiteral[] {
  const found: RequestLiteral[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const tier = node.properties.map(modelTier).find((t) => t !== null);
      const isRequest = node.properties.some((prop) => {
        const name = propertyName(prop);
        return name === "max_tokens" || name === "messages";
      });
      if (tier && isRequest) found.push({ literal: node, tier });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** The `type` of a `tool_choice: { type: "..." }` literal, if static. */
function toolChoiceType(prop: ts.ObjectLiteralElementLike): string | null {
  if (!ts.isPropertyAssignment(prop)) return null;
  let value: ts.Expression = prop.initializer;
  while (ts.isAsExpression(value) || ts.isSatisfiesExpression(value)) {
    value = value.expression;
  }
  if (!ts.isObjectLiteralExpression(value)) return "<dynamic>";
  for (const inner of value.properties) {
    if (propertyName(inner) !== "type" || !ts.isPropertyAssignment(inner)) continue;
    let init: ts.Expression = inner.initializer;
    while (ts.isAsExpression(init)) init = init.expression;
    if (ts.isStringLiteral(init)) return init.text;
    return "<dynamic>";
  }
  return "<dynamic>";
}

describe("Claude requests only pass parameters the pinned models accept", () => {
  const parsed = sourceFiles(SRC).map((file) => ({
    file,
    source: ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    ),
  }));

  it("pins the current model ids", () => {
    expect(CLAUDE_MODELS).toEqual({
      fast: "claude-haiku-4-5-20251001",
      quality: "claude-sonnet-5",
      premium: "claude-opus-5-5",
    });
  });

  it("finds the call sites it is meant to guard", () => {
    const all = parsed.flatMap(({ source }) => requestLiterals(source));
    // A rename that silently empties this scan would make the suite pass
    // while guarding nothing.
    expect(all.filter((r) => r.tier === "premium").length).toBeGreaterThanOrEqual(4);
    expect(all.filter((r) => r.tier === "quality").length).toBeGreaterThanOrEqual(4);
  });

  it("never passes temperature, top_p or top_k to any Claude request", () => {
    const violations: string[] = [];

    for (const { file, source } of parsed) {
      for (const { literal, tier } of requestLiterals(source)) {
        for (const prop of literal.properties) {
          // A spread carries no property name, so a name-based check skips
          // it — and `...{ temperature: 0 }` would sail straight past the
          // one thing this guard exists to catch. Fail closed: a spread in
          // a request has to be inlined to stay checkable.
          if (ts.isSpreadAssignment(prop)) {
            violations.push(
              `${path.relative(SRC, file)} spreads into a ${tier}-model request, which this scan cannot verify — inline the parameters`,
            );
            continue;
          }
          const name = propertyName(prop);
          if (name && REJECTED_PARAMS.includes(name)) {
            violations.push(
              `${path.relative(SRC, file)} passes ${name} to a ${tier}-model request`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("never forces tool_choice on a premium-model request", () => {
    const violations: string[] = [];

    for (const { file, source } of parsed) {
      for (const { literal, tier } of requestLiterals(source)) {
        if (tier !== "premium") continue;
        for (const prop of literal.properties) {
          if (propertyName(prop) !== "tool_choice") continue;
          const type = toolChoiceType(prop);
          if (type === null) continue;
          if (type === "<dynamic>" || FORCED_TOOL_CHOICE_TYPES.includes(type)) {
            violations.push(
              `${path.relative(SRC, file)} passes tool_choice ${type} to a premium-model request`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  // Sonnet 5 and Opus 5.5 run adaptive thinking when `thinking` is omitted,
  // and those tokens share `max_tokens` with the answer. A budget sized for
  // Sonnet 4.6 — thinking-off by default — can cut a forced tool call off
  // mid-JSON, and a route calling `messages.create` directly (rather than
  // `_shared/claude-call.ts`, which retries a truncation with a bigger
  // budget) then fails the whole request.
  it(`gives quality and premium requests at least ${MIN_THINKING_MAX_TOKENS} max_tokens`, () => {
    const violations: string[] = [];

    for (const { file, source } of parsed) {
      for (const { literal, tier } of requestLiterals(source)) {
        if (tier !== "quality" && tier !== "premium") continue;
        for (const prop of literal.properties) {
          if (propertyName(prop) !== "max_tokens" || !ts.isPropertyAssignment(prop)) continue;
          // Only a literal budget is checkable; a computed one is left alone.
          if (!ts.isNumericLiteral(prop.initializer)) continue;
          const value = Number(prop.initializer.text.replace(/_/g, ""));
          if (value < MIN_THINKING_MAX_TOKENS) {
            const line = source.getLineAndCharacterOfPosition(prop.getStart()).line + 1;
            violations.push(
              `${path.relative(SRC, file)}:${line} sets max_tokens ${value} on a ${tier}-model request`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
