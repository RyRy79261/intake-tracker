// Native build prep: stamp the Android version from the ROOT package.json, then
// copy the @intake/web static export into the android project and refresh native
// plugins. Run AFTER the web export exists (`pnpm --filter @intake/web cap:export`).
//
//   pnpm --filter @intake/web cap:export   # -> apps/web/out
//   pnpm --filter @intake/native sync      # -> version.properties + cap sync
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // apps/native/scripts
const nativeDir = join(here, '..'); // apps/native
const repoRoot = join(here, '..', '..', '..'); // monorepo root

// Version is the single source of truth in the ROOT package.json (release-please
// owns it). apps/web + apps/native are 0.0.0 and must NOT be used here.
const { version } = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const [major, minor, patch] = version.split('.').map(Number);
// versionCode = major*10000 + minor*100 + patch (matches android-release.yml).
const versionCode = major * 10000 + minor * 100 + patch;
writeFileSync(
  join(nativeDir, 'android', 'app', 'version.properties'),
  `VERSION_NAME=${version}\nVERSION_CODE=${versionCode}\n`,
);
console.log(`version.properties -> VERSION_NAME=${version} VERSION_CODE=${versionCode}`);

// Copies webDir (../web/out) into android/app/src/main/assets/public and updates
// the native plugin gradle. Resolves the Capacitor CLI from apps/native.
execSync('npx cap sync android', { stdio: 'inherit', cwd: nativeDir });
