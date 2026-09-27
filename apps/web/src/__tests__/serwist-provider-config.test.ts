/**
 * SerwistProvider structural check — the root layout must opt out of
 * Serwist's reload-on-reconnect.
 *
 * @serwist/turbopack's SerwistProvider defaults `reloadOnOnline` to true, which
 * reloads the page on every offline -> online flip and discards anything the
 * user was typing. The app is offline-first (Dexie + sync engine), so a
 * reconnect never needs a reload.
 *
 * Run with: pnpm exec vitest run src/__tests__/serwist-provider-config.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

const LAYOUT_PATH = path.resolve(process.cwd(), "src/app/layout.tsx");

let raw: string;

beforeAll(() => {
  raw = fs.readFileSync(LAYOUT_PATH, "utf-8");
});

describe("SerwistProvider in the root layout", () => {
  it("disables the reload on reconnect", () => {
    const provider = raw.match(/<SerwistProvider[\s\S]*?>/);
    expect(provider, "SerwistProvider not found in layout.tsx").not.toBeNull();
    expect(provider![0]).toMatch(/reloadOnOnline=\{false\}/);
  });
});
