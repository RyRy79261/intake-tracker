# Phase 36: Neon DB + Vercel Integration Understanding - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 36-neon-db-vercel-integration-understanding
**Areas discussed:** Research scope, Output format, Future intent, Current pain points

---

## Research Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Env var injection mechanics | How Vercel's Neon integration auto-populates DATABASE_URL and POSTGRES_* vars | |
| Branch DB lifecycle | How Neon branches map to Vercel environments, when branches are created/destroyed | ✓ |
| Full integration audit | Both above plus connection pooling, serverless driver behavior | |

**User's choice:** Branch DB lifecycle
**Notes:** User clarified they want to understand both preview deploy branches AND staging/prod structure.

| Option | Description | Selected |
|--------|-------------|----------|
| Preview deploy branches | Automatic branch-per-preview-deploy lifecycle | |
| Staging/prod structure | How staging/main Neon branches relate to Vercel environments | |
| Both | Full picture — preview branches AND staging/prod structure | ✓ |

**User's choice:** Both

| Option | Description | Selected |
|--------|-------------|----------|
| Integration installed | Connected Neon to Vercel via marketplace integration | ✓ |
| Manual setup | Manually copied env vars into Vercel | |
| Not sure | Don't remember the mechanism | |

**User's choice:** Integration installed

**Additional context:** User clarified the design intent was: Neon auto-creates branch DBs for git branches, and staging branch triggers Neon DB to "reset from parent" when updated.

---

## Output Format

| Option | Description | Selected |
|--------|-------------|----------|
| Architecture diagram + doc | Written document with diagram showing branch relationships and lifecycle | ✓ |
| Runbook / how-it-works | Operational runbook with step-by-step Neon branch states | |
| Decision record | ADR-style document | |
| Just CONTEXT.md | No separate deliverable | |

**User's choice:** Architecture diagram + doc

| Option | Description | Selected |
|--------|-------------|----------|
| docs/architecture/neon-vercel.md | Permanent reference doc in repo | ✓ |
| .planning/phases/36-*/ | Planning artifact | |
| You decide | Claude picks | |

**User's choice:** docs/architecture/neon-vercel.md

---

## Future Intent

**Key revelation:** User thought data was already migrated to NeonDB — discovered only push notifications use it. This reframed the discussion.

**User's stated direction:**
- Default storage should be NeonDB (cloud-first), not IndexedDB
- Replace Privy with Neon Auth (E2E testing is the motivator)
- App must still work offline — IndexedDB as cache/buffer, sync when reconnected
- Settings toggle for local-only vs cloud mode
- No additional services — direct Neon sync preferred over Dexie Cloud
- Architecture doc should cover how both PWA and future Android app share the same NeonDB backend

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, include migration path | Architecture doc covers current state AND migration strategy | ✓ |
| Current state only | Focus on existing integration | |
| Light mention only | Note future intent briefly | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, include Android path | Cover how both PWA and Android share NeonDB backend | ✓ |
| Web only for now | Focus on PWA sync only | |
| Light mention | Note Android access is enabled | |

| Option | Description | Selected |
|--------|-------------|----------|
| Last-write-wins | Simple timestamp-based resolution | |
| Research conflict strategies | Compare approaches and recommend | ✓ |
| You decide | Claude picks | |

---

## Current Pain Points

| Option | Description | Selected |
|--------|-------------|----------|
| Env var confusion | ~15 Neon/Postgres env vars with unclear purposes | ✓ |
| Branch behavior unclear | Not confident preview/staging DBs work as expected | |
| No issues currently | Nothing broken, just don't understand the setup | ✓ |

**User's notes:** "I have no way to figure out if this is set up properly"

| Option | Description | Selected |
|--------|-------------|----------|
| Verify live | Use browser automation to check dashboards | ✓ |
| Document how to verify | Write checklist steps only | |
| Both | Check via APIs, document manual checks | |

**User's choice:** Verify live — use browser automation to inspect Neon and Vercel dashboards

---

## Claude's Discretion

- Diagram format and tooling
- Conflict resolution comparison depth
- Migration path structure

## Deferred Ideas

- Full cloud sync implementation — future milestone
- Privy removal / Neon Auth migration — future milestone
- Android app development — future milestone
- Server-side schema creation for 16 Dexie tables — future milestone
- Local-only/cloud Settings toggle — future milestone
