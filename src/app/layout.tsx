import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "./providers";
import { UpdateNotification } from "@/components/update-notification";
import { SwipeNav } from "@/components/swipe-nav";
import { AppHeader } from "@/components/app-header";
import { HomeFloatingBars } from "@/components/home-floating-bars";
import { MedicationsFloatingBars } from "@/components/medications-floating-bars";

const outfit = Outfit({ 
  subsets: ["latin"],
  variable: "--font-outfit",
});

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
      </head>
      <body className={`${outfit.variable} font-sans antialiased`}>
        <Providers>
          <main className="min-h-screen overflow-x-hidden bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
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
