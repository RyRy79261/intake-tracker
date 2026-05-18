const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const API_DIR = path.join(__dirname, '..', 'src', 'app', 'api');
const API_STASH = path.join(__dirname, '..', 'src', 'app', '_api-server-only');
const MIDDLEWARE = path.join(__dirname, '..', 'src', 'middleware.ts');
const MIDDLEWARE_STASH = path.join(__dirname, '..', 'src', 'middleware.ts.bak');

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

const pkg = require(path.join(__dirname, '..', 'package.json'));
const versionParts = pkg.version.split('.');
const versionCode = parseInt(versionParts[0]) * 10000 + parseInt(versionParts[1]) * 100 + parseInt(versionParts[2]);
const versionPropsPath = path.join(__dirname, '..', 'android', 'app', 'version.properties');
fs.writeFileSync(versionPropsPath, `VERSION_NAME=${pkg.version}\nVERSION_CODE=${versionCode}\n`);

stash();
try {
  execSync('npx next build', { stdio: 'inherit', env: process.env });
} finally {
  restore();
}
