// Only load next-pwa in production to avoid ajv@8 polluting the module cache
// during lint/dev (which breaks ESLint's ajv@6)
// Also skip on Vercel preview/staging deploys to prevent stale SW caching
const withPWA = process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV !== 'preview'
  ? require('next-pwa')({
      dest: 'public',
      register: true,
      skipWaiting: true,
      customWorkerDir: 'worker',
    })
  : (config) => config;

// Content Security Policy — relaxed on preview deploys to allow Vercel's
// toolbar (vercel.live injects server-side HTML that needs its client script).
const isVercelPreview = process.env.VERCEL_ENV === 'preview';

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
  {
    key: 'Content-Security-Policy',
    value: cspDirectives.join('; ')
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

const packageJson = require('./package.json');

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
