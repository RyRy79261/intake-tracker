#!/usr/bin/env tsx
/**
 * Create or update the GitHub issue label taxonomy on the repository.
 *
 * Idempotent: existing labels are patched to match (colour + description),
 * missing labels are created. Labels NOT in the catalogue are left untouched.
 *
 * Prerequisites:
 *   GITHUB_TOKEN  — a fine-grained PAT with "Issues: read and write" on the
 *                   target repo (the same token the bug reporter uses).
 *
 * Usage:
 *   GITHUB_TOKEN=github_pat_xxx pnpm tsx scripts/setup-github-labels.ts
 *   # optional override (defaults to RyRy79261/intake-tracker):
 *   GITHUB_REPO=owner/name GITHUB_TOKEN=... pnpm tsx scripts/setup-github-labels.ts
 */
import { Octokit } from "@octokit/rest";
import { GITHUB_LABELS } from "../src/lib/github-labels";

const DEFAULT_REPO = "RyRy79261/intake-tracker";

async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN env var is required");
  }

  const repoSlug = process.env.GITHUB_REPO || DEFAULT_REPO;
  const [owner, repo] = repoSlug.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid GITHUB_REPO "${repoSlug}" — expected "owner/name"`);
  }

  const octokit = new Octokit({ auth: token });

  // Existing labels (paginated — a repo can have >100).
  const existing = new Set<string>();
  for await (const { data } of octokit.paginate.iterator(
    octokit.rest.issues.listLabelsForRepo,
    { owner, repo, per_page: 100 },
  )) {
    for (const label of data) existing.add(label.name);
  }

  let created = 0;
  let updated = 0;
  for (const label of GITHUB_LABELS) {
    if (existing.has(label.name)) {
      await octokit.rest.issues.updateLabel({
        owner,
        repo,
        name: label.name,
        color: label.color,
        description: label.description,
      });
      updated++;
      console.log(`  updated  ${label.name}`);
    } else {
      await octokit.rest.issues.createLabel({
        owner,
        repo,
        name: label.name,
        color: label.color,
        description: label.description,
      });
      created++;
      console.log(`  created  ${label.name}`);
    }
  }

  console.log(
    `\nDone — ${repoSlug}: ${created} created, ${updated} updated, ${GITHUB_LABELS.length} total.`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
