/**
 * Every client call to the app's own API must go through apiFetch().
 *
 * The Android build is a static export served from https://localhost with the
 * api/ routes stashed out, so a bare `fetch("/api/...")` hits the WebView's
 * asset server instead of the real backend — and carries no Bearer token.
 * apiFetch() prefixes NEXT_PUBLIC_API_BASE_URL and attaches the token.
 *
 * Static analysis only: scans source files, imports nothing.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, resolve } from "path";

const SRC = resolve(__dirname, "..");

// Files allowed to call fetch("/api/...") directly:
//   - api-fetch.ts is the wrapper itself.
//   - the native-auth bridge page runs on the real web origin (in the Custom
//     Tab after the OAuth return, reading the session cookie), never in the
//     WebView.
const ALLOWED = new Set([
  "lib/api-fetch.ts",
  "app/native-auth/bridge/page.tsx",
]);

const BARE_API_FETCH = /\bfetch\(\s*[`'"]\/api\//;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      out.push(...sourceFiles(full));
    } else if (
      /\.(ts|tsx)$/.test(name) &&
      !/\.(test|spec)\.(ts|tsx)$/.test(name)
    ) {
      out.push(full);
    }
  }
  return out;
}

describe("client API calls", () => {
  it("never call fetch('/api/...') directly outside api-fetch.ts", () => {
    const offenders = sourceFiles(SRC)
      .map((f) => relative(SRC, f))
      .filter((rel) => !ALLOWED.has(rel))
      .filter((rel) => BARE_API_FETCH.test(readFileSync(join(SRC, rel), "utf-8")));

    expect(offenders).toEqual([]);
  });
});
