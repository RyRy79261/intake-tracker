// ESM config — required because @serwist/turbopack ships ESM-only.
import path from "node:path";
import { createRequire } from "node:module";
import { withSerwist } from "@serwist/turbopack";

const require = createRequire(import.meta.url);
// Single source of truth for the app version is the monorepo root package.json
// (release-please manages it there); NEXT_PUBLIC_APP_VERSION derives from it.
const packageJson = require("../../package.json");

// Service-worker registration (see layout.tsx) is enabled only on the
// production web deploy. Preview/dev/Capacitor all report a non-"production"
// NEXT_PUBLIC_VERCEL_ENV, which disables <SerwistProvider>.
const isVercelPreview = process.env.VERCEL_ENV === "preview";
const isCapacitorBuild = !!process.env.CAPACITOR_BUILD;

// Content Security Policy — relaxed on preview deploys to allow Vercel's
// toolbar (vercel.live injects server-side HTML that needs its client script).
const cspDirectives = [
  "default-src 'self'",
  isVercelPreview
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://vercel.live https://vercel.com"
    : "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:" + (isVercelPreview ? " https://vercel.live https://vercel.com" : ""),
  "font-src 'self' data:" + (isVercelPreview ? " https://vercel.live" : ""),
  "connect-src 'self' https://api.anthropic.com https://*.neon.tech" + (isVercelPreview ? " https://vercel.live https://vercel.com wss://ws-us3.pusher.com" : ""),
  "frame-src 'self'" + (isVercelPreview ? " https://vercel.live" : ""),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspDirectives.join("; ") },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: isCapacitorBuild ? "export" : undefined,
  reactStrictMode: true,
  // Internal @intake/* packages are consumed as raw TS source (JIT). Grows as
  // core, ui, ai-prompts are extracted in later phases.
  transpilePackages: ["@intake/core", "@intake/db", "@intake/types"],
  // Pin the Turbopack root to the monorepo root so module resolution + the
  // version require above are scoped correctly (silences the inferred-root warning).
  turbopack: {
    root: path.resolve(import.meta.dirname, "../.."),
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    NEXT_PUBLIC_GIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA || "local",
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV || "development",
  },
  async rewrites() {
    // MCP custom connector: OAuth metadata is required to live at
    // /.well-known/* (RFC 8414 + RFC 9728) but Next.js's app router does not
    // route dotted folders. Rewrite to non-dotted internal paths.
    const mcpWellKnown = [
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/mcp/well-known/oauth-authorization-server",
      },
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/mcp/well-known/oauth-protected-resource",
      },
    ];
    // Retire the old next-pwa worker: the active SW now lives at
    // /serwist/sw.js. Any request to the legacy /sw.js URL (from previously
    // installed clients or stale cached HTML) gets a self-destructing worker
    // that clears caches and unregisters itself.
    return [
      ...mcpWellKnown,
      { source: "/sw.js", destination: "/sw-kill.js" },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default withSerwist(nextConfig);
