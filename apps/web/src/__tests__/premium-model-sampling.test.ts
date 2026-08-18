/**
 * Sampling-parameter guard for `CLAUDE_MODELS.premium` requests.
 *
 * Claude Opus 4.7 and later removed `temperature` / `top_p` / `top_k`:
 * setting any of them to a non-default value returns a **400**, so the
 * request fails outright instead of being nudged toward determinism. Note
 * `temperature: 0` is a non-default value — "deterministic" is exactly the
 * setting that breaks.
 *
 * This shipped as a silent, total outage of every Opus-backed feature.
 * `/api/analytics/insights/deep` sent `temperature: 0.3`, so the batch
 * entry errored before the model ran and deep analysis failed 100% of the
 * time (issue #331); medicine-search, interaction-check and
 * titration-warnings each sent `temperature: 0` and 400'd the same way. The
 * Sonnet-backed routes were untouched, which is why only the Opus features
 * looked broken.
 *
 * A source scan rather than a per-route runtime test: the failure mode is
 * "someone adds `temperature` back to a request that names the premium
 * model", and that is a property of the source. It parses with the
 * TypeScript compiler rather than matching text, so a brace inside a
 * string or a template literal in the request can't shift what the scan
 * thinks the object literal is. Sonnet/Haiku routes still accept sampling
 * parameters and are deliberately not covered.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import ts from "typescript";

const SRC = path.resolve(process.cwd(), "src");

/** Parameters Opus 4.7+ rejects outright. */
const REJECTED_PARAMS = ["temperature", "top_p", "top_k"];

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

/** `model: CLAUDE_MODELS.premium` — the property that marks a request. */
function namesPremiumModel(prop: ts.ObjectLiteralElementLike): boolean {
  if (!ts.isPropertyAssignment(prop)) return false;
  if (propertyName(prop) !== "model") return false;
  const value = prop.initializer;
  return (
    ts.isPropertyAccessExpression(value) &&
    value.name.text === "premium" &&
    ts.isIdentifier(value.expression) &&
    value.expression.text === "CLAUDE_MODELS"
  );
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

/** Every object literal in the file whose `model` is the premium model. */
function premiumRequestLiterals(
  source: ts.SourceFile,
): ts.ObjectLiteralExpression[] {
  const found: ts.ObjectLiteralExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isObjectLiteralExpression(node) &&
      node.properties.some(namesPremiumModel)
    ) {
      found.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("premium-model requests omit removed sampling parameters", () => {
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

  it("finds the premium-model call sites it is meant to guard", () => {
    const found = parsed.filter(
      ({ source }) => premiumRequestLiterals(source).length > 0,
    );
    // A rename that silently empties this scan would make the suite pass
    // while guarding nothing.
    expect(found.length).toBeGreaterThanOrEqual(4);
  });

  it("never passes temperature, top_p or top_k with the premium model", () => {
    const violations: string[] = [];

    for (const { file, source } of parsed) {
      for (const literal of premiumRequestLiterals(source)) {
        for (const prop of literal.properties) {
          const name = propertyName(prop);
          if (name && REJECTED_PARAMS.includes(name)) {
            violations.push(
              `${path.relative(SRC, file)} passes ${name} to a premium-model request`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
