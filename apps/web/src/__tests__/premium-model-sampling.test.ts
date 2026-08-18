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
 * model", and that is a property of the source. Sonnet/Haiku routes still
 * accept sampling parameters and are deliberately not covered.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

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

/**
 * Object literals that name the premium model, sliced from `{` to the
 * matching `}`. Brace counting (not a regex) so a nested `tools: [...]` or
 * `messages: [{...}]` can't end the slice early and hide a parameter
 * declared after it.
 */
function premiumRequestLiterals(code: string): string[] {
  const literals: string[] = [];
  const marker = /model:\s*CLAUDE_MODELS\.premium/g;
  let m: RegExpExecArray | null;

  while ((m = marker.exec(code)) !== null) {
    // Walk back to the `{` that opens this literal.
    let start = m.index;
    while (start > 0 && code[start] !== "{") start -= 1;

    let depth = 0;
    let end = start;
    for (let i = start; i < code.length; i += 1) {
      if (code[i] === "{") depth += 1;
      else if (code[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    literals.push(code.slice(start, end + 1));
  }
  return literals;
}

/** Strip comments so the explanatory notes don't read as violations. */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("premium-model requests omit removed sampling parameters", () => {
  const files = sourceFiles(SRC);

  it("finds the premium-model call sites it is meant to guard", () => {
    const withPremium = files.filter((f) =>
      /model:\s*CLAUDE_MODELS\.premium/.test(fs.readFileSync(f, "utf8")),
    );
    // A rename that silently empties this scan would make the suite pass
    // while guarding nothing.
    expect(withPremium.length).toBeGreaterThanOrEqual(4);
  });

  it("never passes temperature, top_p or top_k with the premium model", () => {
    const violations: string[] = [];

    for (const file of files) {
      const code = stripComments(fs.readFileSync(file, "utf8"));
      for (const literal of premiumRequestLiterals(code)) {
        for (const param of REJECTED_PARAMS) {
          if (new RegExp(`(^|[^\\w.])${param}\\s*:`).test(literal)) {
            violations.push(
              `${path.relative(SRC, file)} passes ${param} to a premium-model request`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
