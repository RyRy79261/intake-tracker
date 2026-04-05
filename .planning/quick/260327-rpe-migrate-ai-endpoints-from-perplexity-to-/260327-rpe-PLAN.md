---
phase: quick
plan: 260327-rpe
type: execute
wave: 1
depends_on: []
files_modified:
  - .env.local
  - .planning/todos/pending/2026-03-16-migrate-ai-endpoints-from-perplexity-to-anthropic-claude.md
  - .planning/todos/done/2026-03-16-migrate-ai-endpoints-from-perplexity-to-anthropic-claude.md
autonomous: true
requirements: [cleanup-perplexity-migration]

must_haves:
  truths:
    - "No Perplexity references remain in runtime code or env config"
    - "ANTHROPIC_API_KEY is present in .env.local for AI endpoints to function"
    - "Todo is archived as done"
  artifacts:
    - path: ".env.local"
      provides: "Clean env config with ANTHROPIC_API_KEY, no Perplexity references"
    - path: ".planning/todos/done/2026-03-16-migrate-ai-endpoints-from-perplexity-to-anthropic-claude.md"
      provides: "Archived todo"
  key_links: []
---

<objective>
Clean up remaining Perplexity references after completed migration to Anthropic Claude.

Purpose: The code migration from Perplexity to Anthropic Claude is already complete across all 5 AI
API routes (parse, medicine-search, substance-enrich, substance-lookup, titration-warnings). They all
use `_shared/claude-client.ts` with the Anthropic SDK. However, `.env.local` still has the dead
`PERPLEXITY_API_KEY` and is missing `ANTHROPIC_API_KEY`, and the todo file is still in pending/.

Output: Clean .env.local, archived todo, verified build.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/app/api/ai/_shared/claude-client.ts
@.planning/todos/pending/2026-03-16-migrate-ai-endpoints-from-perplexity-to-anthropic-claude.md

NOTE: The Perplexity-to-Claude migration is ALREADY COMPLETE in code. All 5 API routes already use
the Anthropic SDK via `_shared/claude-client.ts`. The `perplexity.ts` file no longer exists. The
`voice-input.tsx` and `parsed-intake-display.tsx` files referenced in the todo no longer exist.
The settings store already migrates away `perplexityApiKey` in its persist migration. This plan
handles only the remaining cleanup artifacts.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Clean up .env.local and archive todo</name>
  <files>.env.local, .planning/todos/done/2026-03-16-migrate-ai-endpoints-from-perplexity-to-anthropic-claude.md</files>
  <action>
1. Edit `.env.local`:
   - Remove lines 9-10 (the `# Perplexity` comment and `PERPLEXITY_API_KEY=pplx-...` line)
   - Add an `# Anthropic` section with `ANTHROPIC_API_KEY=` placeholder (user will fill in their key)
   - Place the new section where the Perplexity section was (between the `NEXT_PUBLIC_LOCAL_AGENT_MODE` line and `# Whitelist` line)

2. Move the todo file from pending to done:
   ```bash
   mv .planning/todos/pending/2026-03-16-migrate-ai-endpoints-from-perplexity-to-anthropic-claude.md \
      .planning/todos/done/2026-03-16-migrate-ai-endpoints-from-perplexity-to-anthropic-claude.md
   ```

3. Verify no remaining Perplexity references in src/ (except the settings-store.ts persist migration which correctly deletes the old key -- that is fine to keep as it handles existing user data):
   ```bash
   grep -ri "perplexity\|pplx" src/ --include="*.ts" --include="*.tsx" | grep -v "settings-store.ts"
   ```
   Should return empty.

4. Verify build still passes:
   ```bash
   pnpm build
   ```
  </action>
  <verify>
    <automated>grep -ri "perplexity\|pplx" src/ --include="*.ts" --include="*.tsx" | grep -v "settings-store.ts" | wc -l</automated>
  </verify>
  <done>
    - .env.local has ANTHROPIC_API_KEY placeholder, no PERPLEXITY_API_KEY
    - Todo moved to .planning/todos/done/
    - Zero Perplexity references in src/ (except settings-store migration, which is correct)
    - pnpm build passes
  </done>
</task>

</tasks>

<verification>
- `grep -ri "perplexity\|pplx" .env.local` returns nothing
- `grep "ANTHROPIC_API_KEY" .env.local` returns the new placeholder line
- `.planning/todos/done/2026-03-16-migrate-ai-endpoints-from-perplexity-to-anthropic-claude.md` exists
- `.planning/todos/pending/2026-03-16-migrate-ai-endpoints-from-perplexity-to-anthropic-claude.md` does NOT exist
- `pnpm build` succeeds
</verification>

<success_criteria>
All Perplexity artifacts cleaned up. ANTHROPIC_API_KEY present in env config. Todo archived. Build green.
</success_criteria>

<output>
After completion, create `.planning/quick/260327-rpe-migrate-ai-endpoints-from-perplexity-to-/260327-rpe-SUMMARY.md`
</output>
