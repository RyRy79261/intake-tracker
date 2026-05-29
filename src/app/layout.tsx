import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "@/app/globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/app/providers";
import { UpdateNotification } from "@/components/update-notification";
import { SwipeNav } from "@/components/swipe-nav";
import { AppHeader } from "@/components/app-header";
import { HomeFloatingBars } from "@/components/home-floating-bars";
import { MedicationsFloatingBars } from "@/components/medications-floating-bars";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

// Inline watchdog: detects a previous page-load that never reached React's
// mount effect (PWA splash hang, broken precache, etc.) and redirects to
// /recover.html, which unregisters SWs + clears caches. Mount-success
// signal lives in providers.tsx; key is removed there on hydration.
const BOOT_WATCHDOG = `(function(){try{var k='itrk:bootState',n=Date.now(),r=localStorage.getItem(k),p=r?JSON.parse(r):null;if(p&&typeof p.startedAt==='number'&&n-p.startedAt>12000&&n-p.startedAt<86400000){localStorage.removeItem(k);location.replace('/recover.html?return='+encodeURIComponent(location.pathname+location.search));return;}localStorage.setItem(k,JSON.stringify({startedAt:n}));}catch(e){}})();`;

// Visible loading shell rendered before React hydrates. Guarantees first
// paint so Android dismisses the WebAPK splash even if app JS fails to
// boot, and reveals a manual reset link after 8s as a last resort.
const BOOT_SHELL_CSS = `
#__boot_shell{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f5f7fa;color:#1f2937;font-family:system-ui,-apple-system,sans-serif;transition:opacity 200ms ease-out}
@media (prefers-color-scheme:dark){#__boot_shell{background:#111827;color:#e5e7eb}}
html.app-booted #__boot_shell{opacity:0;pointer-events:none}
#__boot_shell .label{font-size:15px;opacity:.7}
#__boot_shell .spinner{width:22px;height:22px;border:3px solid rgba(127,127,127,.2);border-top-color:#3b82f6;border-radius:50%;animation:itrk-spin .8s linear infinite;margin-top:18px}
@keyframes itrk-spin{to{transform:rotate(360deg)}}
#__boot_shell .recover{display:none;margin-top:28px;padding:10px 16px;border:1px solid rgba(127,127,127,.4);border-radius:8px;background:transparent;color:inherit;font:inherit;text-decoration:none}
#__boot_shell.show-recover .recover{display:inline-block}
`;

const BOOT_SHELL_FALLBACK_TIMER = `setTimeout(function(){var s=document.getElementById('__boot_shell');if(s&&!document.documentElement.classList.contains('app-booted'))s.classList.add('show-recover');},8000);`;

export const metadata: Metadata = {
  title: "Intake Tracker",
  description:
    "A comprehensive personal medical tracker for logging hydration, nutrition, vitals, and medications.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Intake Tracker",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Shrink the layout when the on-screen keyboard opens so bottom-sheet
  // drawers reflow above it instead of being covered.
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fa" },
    { media: "(prefers-color-scheme: dark)", color: "#111827" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <script dangerouslySetInnerHTML={{ __html: BOOT_WATCHDOG }} />
        <style dangerouslySetInnerHTML={{ __html: BOOT_SHELL_CSS }} />
      </head>
      <body className={`${outfit.variable} font-sans antialiased`}>
        <div id="__boot_shell" aria-hidden="true">
          <div className="label">Loading…</div>
          <div className="spinner" />
          <a className="recover" href="/recover.html">Reset app</a>
        </div>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SHELL_FALLBACK_TIMER }} />
        <Providers>
          <main className="min-h-screen overflow-x-clip bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
            <div className="container mx-auto max-w-lg px-4 pt-6">
              <AppHeader />
            </div>
            <SwipeNav>{children}</SwipeNav>
            <HomeFloatingBars />
            <MedicationsFloatingBars />
          </main>
        </Providers>
        <UpdateNotification />
        <Toaster />
      </body>
    </html>
  );
}
