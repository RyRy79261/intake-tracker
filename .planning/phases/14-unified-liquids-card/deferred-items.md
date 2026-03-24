# Deferred Items - Phase 14

## Pre-existing Build Issues (discovered during 14-02 execution)

1. **insights-tab.tsx type errors** - `dismissInsight` and `isDismissed` properties not on `Settings & SettingsActions` type in `src/components/analytics/insights-tab.tsx` (lines 48-49). Causes `pnpm build` to fail. Not introduced by phase 14 changes.

2. **settings-store.ts import warnings** - `obfuscateApiKey` and `deobfuscateApiKey` attempted import from `@/lib/security` but not exported. Runtime warning during build. Not blocking but should be cleaned up.
