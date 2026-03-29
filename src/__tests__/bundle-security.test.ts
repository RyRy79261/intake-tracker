/**
 * Bundle security scan — verifies no API keys or secrets leak into the client bundle.
 *
 * IMPORTANT: This test requires a build first (`pnpm build`).
 * Run with: pnpm vitest run src/__tests__/bundle-security.test.ts
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const staticDir = path.resolve(process.cwd(), ".next/static");
const hasBuildArtifacts = fs.existsSync(staticDir);

function getAllFilesRecursive(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFilesRecursive(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function readBundleContents(staticDir: string): string {
  const files = getAllFilesRecursive(staticDir).filter(
    (f) => f.endsWith(".js") || f.endsWith(".css")
  );
  return files.map((f) => fs.readFileSync(f, "utf-8")).join("\n");
}

describe.skipIf(!hasBuildArtifacts)("client bundle security", () => {

  it("client bundle should not contain API key patterns", () => {
    const content = readBundleContents(staticDir);

    // Anthropic API key prefix
    expect(content).not.toMatch(/sk-ant-[a-zA-Z0-9]{20,}/);

    // OpenAI-style secret key prefix
    expect(content).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);

    // Env var names that should never appear in client code
    expect(content).not.toContain("ANTHROPIC_API_KEY");
    expect(content).not.toContain("PRIVY_APP_SECRET");

    // Neon/Postgres connection strings (D-06)
    expect(content).not.toMatch(/postgres(ql)?:\/\/[^\s'"]+/);
  });

  it("client bundle should not contain sensitive env var values", () => {
    const content = readBundleContents(staticDir);

    // These server-only env var names should not leak
    expect(content).not.toContain("ALLOWED_EMAILS");
    expect(content).not.toContain("DATABASE_URL");
    expect(content).not.toContain("ALLOW_DEV_FALLBACK");

    // Neon-specific env var names (D-06)
    expect(content).not.toContain("NEON_DATABASE_URL");
    expect(content).not.toContain("NEON_API_KEY");
  });
});
