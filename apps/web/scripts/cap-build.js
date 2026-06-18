const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Stash the server-only api/ routes + middleware OUTSIDE apps/web during the
// static export. Next's `output: export` can't emit route handlers, and Next's
// type-check phase covers every .ts under apps/web (tsconfig include is
// **/*.ts) — so a stash kept inside apps/web would still be type-checked, and
// the moved routes' `@/app/api/...` imports would dangle. Parking them at the
// repo root (outside apps/web's tsconfig) sidesteps both.
const API_DIR = path.join(__dirname, '..', 'src', 'app', 'api');
const API_STASH = path.join(__dirname, '..', '..', '..', '.cap-api-stash');
const MIDDLEWARE = path.join(__dirname, '..', 'src', 'middleware.ts');
const MIDDLEWARE_STASH = path.join(__dirname, '..', '..', '..', '.cap-middleware-stash.ts');

function stash() {
  if (fs.existsSync(API_DIR)) fs.renameSync(API_DIR, API_STASH);
  if (fs.existsSync(MIDDLEWARE)) fs.renameSync(MIDDLEWARE, MIDDLEWARE_STASH);
}

function restore() {
  if (fs.existsSync(API_STASH)) fs.renameSync(API_STASH, API_DIR);
  if (fs.existsSync(MIDDLEWARE_STASH)) fs.renameSync(MIDDLEWARE_STASH, MIDDLEWARE);
}

process.env.CAPACITOR_BUILD = '1';
if (!process.env.NEXT_PUBLIC_API_BASE_URL) {
  process.env.NEXT_PUBLIC_API_BASE_URL = 'https://intake-tracker.ryanjnoble.dev';
}

// This script lives in apps/web/scripts and builds the Next app in apps/web.
// It ONLY produces the static export (apps/web/out). The Android version
// stamping (version.properties) and `cap sync` now live in @intake/native
// (apps/native/scripts/sync.mjs), run after this export completes.
const appDir = path.join(__dirname, '..'); // apps/web

stash();
try {
  // next build must run in apps/web (where next.config.mjs lives); output:export
  // (gated by CAPACITOR_BUILD) emits the static site to apps/web/out.
  execSync('npx next build', { stdio: 'inherit', env: process.env, cwd: appDir });
} finally {
  restore();
}
