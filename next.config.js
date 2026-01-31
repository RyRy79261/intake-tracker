const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: false,  // Allow manual control via SKIP_WAITING message
  customWorkerDir: 'worker',  // Custom service worker extensions
  disable: process.env.NODE_ENV === 'development'
});

// Content Security Policy for production
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Required for Next.js
      "style-src 'self' 'unsafe-inline'", // Required for Tailwind
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.perplexity.ai https://auth.privy.io https://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.org", // Perplexity API + Privy Auth
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
    value: 'camera=(), microphone=(), geolocation=()'
  }
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = process.env.NODE_ENV === 'development' ? nextConfig : withPWA(nextConfig);
