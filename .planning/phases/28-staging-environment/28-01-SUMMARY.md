# Plan 28-01 Summary: Disable Service Worker on Non-Production Environments

**Status:** Complete
**Duration:** ~2 min

## What was built

Added VERCEL_ENV gate to prevent service worker generation and registration on staging/preview Vercel deployments.

## Changes

### next.config.js
- Added `&& process.env.VERCEL_ENV !== 'preview'` to the next-pwa conditional (line 4)
- Service worker is now only generated when both NODE_ENV is production AND VERCEL_ENV is not preview

### src/hooks/use-service-worker.ts
- Added staging guard in `registerServiceWorker()` — returns early with error message on non-production environments
- Added staging guard in `useEffect` — prevents SW registration and actively unregisters any existing SW on non-production environments

## Key Files

### Created
(none)

### Modified
- `next.config.js` — Build-time PWA disable for staging
- `src/hooks/use-service-worker.ts` — Client-side registration guard

## Verification
- `pnpm typecheck` passes
- `pnpm lint` passes
- `pnpm build` passes
- `grep "VERCEL_ENV !== 'preview'" next.config.js` matches
- `grep -c "NEXT_PUBLIC_VERCEL_ENV" src/hooks/use-service-worker.ts` returns 2

## Self-Check: PASSED
