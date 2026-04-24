// Only load next-pwa in production to avoid ajv@8 polluting the module cache
// during lint/dev (which breaks ESLint's ajv@6)
// Also skip on Vercel preview/staging deploys to prevent stale SW caching
const packageJson = require('./package.json');
const defaultRuntimeCaching = require('next-pwa/cache');

// Default next-pwa cache TTLs are 24h for HTML/JS/CSS/images, which would
// expire mid-trip during extended offline use. Hold runtime caches for 30
// days so the app keeps working offline for at least ~2.5 weeks. Precached
// build assets (chunks under /_next/static) are revision-based and don't
// expire — these overrides only affect runtime-cached entries.
const OFFLINE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days
const CROSS_ORIGIN_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

// Caches whose freshness we extend for offline use. Excludes the API cache
// because stale API responses are usually wrong (we'd rather fail clearly).
const EXTENDED_CACHES = new Set([
  'google-fonts-stylesheets',
  'static-font-assets',
  'static-image-assets',
  'next-image',
  'static-audio-assets',
  'static-video-assets',
  'static-js-assets',
  'static-style-assets',
  'next-data',
  'static-data-assets',
  'others',
]);

const runtimeCaching = defaultRuntimeCaching.map((entry) => {
  const cacheName = entry.options && entry.options.cacheName;
  let options = entry.options;

  if (EXTENDED_CACHES.has(cacheName)) {
    options = {
      ...options,
      expiration: {
        ...(options.expiration || {}),
        maxAgeSeconds: OFFLINE_MAX_AGE_SECONDS,
      },
    };
  } else if (cacheName === 'cross-origin') {
    options = {
      ...options,
      expiration: {
        ...(options.expiration || {}),
        maxAgeSeconds: CROSS_ORIGIN_MAX_AGE_SECONDS,
      },
    };
  }

  // Trim the navigation network-first timeout from the default 10s to 3s so
  // offline launches surface the cached page (or fallback) quickly instead
  // of hanging on a doomed fetch. Targets the same-origin "others" rule
  // that matches HTML page navigations.
  if (cacheName === 'others') {
    options = { ...options, networkTimeoutSeconds: 3 };
  }

  return options === entry.options ? entry : { ...entry, options };
});

// Static App Router pages whose HTML we precache so a fresh PWA install can
// load them offline immediately, without first having to refresh each page
// over the network. Keep this list aligned with the static (○) routes in
// `pnpm build` output; dynamic routes can't be precached here.
const PRECACHED_PAGES = ['/', '/medications', '/history', '/analytics', '/settings'];

// Bust the precache when the deployed commit changes so users pick up new
// HTML on each release; falls back to the package version for local builds.
const precacheRevision = process.env.VERCEL_GIT_COMMIT_SHA || packageJson.version;

const additionalManifestEntries = PRECACHED_PAGES.map((url) => ({
  url,
  revision: precacheRevision,
}));

const withPWA = process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV !== 'preview'
  ? require('next-pwa')({
      dest: 'public',
      register: true,
      skipWaiting: true,
      customWorkerDir: 'worker',
      runtimeCaching,
      // Backfill the runtime "others" cache on App Router link navigations so
      // a later refresh of that page hits the cache. Without this, tapping a
      // link only stores the RSC payload, leaving the bare URL uncached.
      cacheOnFrontEndNav: true,
      // Precache the static page HTML so the PWA works offline on first launch
      // even before the user has visited each page online.
      additionalManifestEntries,
      // Precaches /offline and serves it when navigation requests fail and
      // nothing matched in the runtime cache (e.g. first offline visit to a
      // page the user hasn't opened before).
      fallbacks: {
        document: '/offline',
      },
    })
  : (config) => config;

// Content Security Policy for production
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // 'unsafe-eval' is required for Next.js dev mode; could be conditionally removed for production in future
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Required for Next.js
      "style-src 'self' 'unsafe-inline'", // Required for Tailwind
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.anthropic.com https://*.privy.io https://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.org", // Anthropic Claude API + Privy Auth
      "frame-src 'self' https://auth.privy.io", // Privy login modal
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(self), geolocation=()'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  }
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    NEXT_PUBLIC_GIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV || 'development',
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = withPWA(nextConfig);
