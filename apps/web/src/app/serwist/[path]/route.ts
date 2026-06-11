// Serwist Turbopack route handler. Bundles src/app/sw.ts with esbuild and
// serves it (with the Service-Worker-Allowed: / scope header) at
// /serwist/sw.js. `dynamic: "force-static"` + generateStaticParams mean the
// worker is emitted as a static asset at build time, so this also works under
// `output: "export"` (the Capacitor build).
import { createSerwistRoute } from "@serwist/turbopack";

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    swSrc: "src/app/sw.ts",
    // Use the native esbuild binary (installed via optional platform deps)
    // rather than esbuild-wasm.
    useNativeEsbuild: true,
  });
