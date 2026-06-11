/**
 * Single source of truth for the GitHub issue label taxonomy.
 *
 * Consumed by:
 *   - scripts/setup-github-labels.ts — creates/updates these labels in the repo
 *   - src/app/api/bug-report/route.ts — applies a subset to issues it files
 *
 * The `namespace: value` naming is deliberate: a triage agent can split on
 * ":" to parse type / priority / area deterministically rather than guessing
 * from free text.
 */

export interface GithubLabel {
  name: string;
  /** 6-digit hex, no leading "#". */
  color: string;
  description: string;
}

export const GITHUB_LABELS: readonly GithubLabel[] = [
  // type: — what the issue is (exactly one)
  { name: "type: bug", color: "d73a4a", description: "Something is broken" },
  { name: "type: feature", color: "0e8a16", description: "New capability" },
  { name: "type: enhancement", color: "a2eeef", description: "Improvement to something that exists" },
  { name: "type: docs", color: "0075ca", description: "Documentation only" },
  { name: "type: chore", color: "fef2c0", description: "Refactor, deps, tooling, tests" },
  { name: "type: question", color: "d876e3", description: "Support or clarification" },

  // status: — workflow state
  { name: "needs-triage", color: "e99695", description: "Entry state — not yet categorised" },
  { name: "status: needs-info", color: "d4c5f9", description: "Waiting on the reporter" },
  { name: "status: in-progress", color: "c2e0c6", description: "Actively being worked" },
  { name: "status: blocked", color: "b60205", description: "Cannot proceed yet" },
  { name: "status: wontfix", color: "e6e6e6", description: "Acknowledged, will not action" },
  { name: "status: duplicate", color: "cfd3d7", description: "Tracked elsewhere" },

  // priority: — assigned at triage
  { name: "priority: critical", color: "b60205", description: "Data loss, crash, or security" },
  { name: "priority: high", color: "d93f0b", description: "Major feature broken" },
  { name: "priority: medium", color: "fbca04", description: "Noticeable, has a workaround" },
  { name: "priority: low", color: "0e8a16", description: "Minor or cosmetic" },

  // area: — app domain
  { name: "area: intake", color: "c5def5", description: "Water / salt / health-metric tracking" },
  { name: "area: medications", color: "c5def5", description: "Prescriptions, phases, doses, inventory" },
  { name: "area: history", color: "c5def5", description: "Analytics and charts" },
  { name: "area: ai", color: "c5def5", description: "AI parsing and voice features" },
  { name: "area: auth", color: "c5def5", description: "Authentication and accounts" },
  { name: "area: sync", color: "c5def5", description: "Cloud sync" },
  { name: "area: offline-pwa", color: "c5def5", description: "Service worker, offline, install" },
  { name: "area: data", color: "c5def5", description: "Dexie / IndexedDB schema and migrations" },
  { name: "area: ui", color: "c5def5", description: "Layout, styling, components" },
  { name: "area: settings", color: "c5def5", description: "App configuration" },

  // agent: — auto-triage / auto-pickup scaffolding
  { name: "agent: ready", color: "5319e7", description: "Triaged and scoped — safe for an autonomous agent to implement" },
  { name: "agent: in-progress", color: "8a63d2", description: "An agent is working it (has an open PR)" },
  { name: "needs-human", color: "f9d0c4", description: "Requires human judgment — agents skip" },
  { name: "auto-triaged", color: "ededed", description: "Triage was performed by an agent" },

  // source: — provenance
  { name: "source: in-app", color: "1d76db", description: "Filed via the in-app reporter — has sanitized env info and logs attached" },
] as const;

/** Labels the in-app reporter applies to a new bug issue. */
export const BUG_ISSUE_LABELS = ["type: bug", "needs-triage", "source: in-app"] as const;

/** Labels the in-app reporter applies to a new feature-request issue. */
export const FEATURE_ISSUE_LABELS = ["type: feature", "needs-triage", "source: in-app"] as const;
