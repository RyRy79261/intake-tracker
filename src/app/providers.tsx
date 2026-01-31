"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { PinGateProvider } from "@/hooks/use-pin-gate";
import { ErrorBoundary } from "@/components/error-boundary";

export function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    // If Privy is not configured, render children without auth
    // This allows the app to work in development without Privy setup
    return (
      <ErrorBoundary>
        <PinGateProvider>{children}</PinGateProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <PrivyProvider
        appId={appId}
        config={{
          // Login methods to show in the modal
          loginMethods: ["email", "google"],
          // Appearance customization
          appearance: {
            theme: "light",
            accentColor: "#0ea5e9", // Sky blue to match water theme
            logo: "/icons/icon-192.svg",
            showWalletLoginFirst: false,
          },
          // Embedded wallet config (optional - for web3 features)
          embeddedWallets: {
            ethereum: {
              createOnLogin: "off", // Don't create wallets for this app
            },
          },
        }}
      >
        <PinGateProvider>{children}</PinGateProvider>
      </PrivyProvider>
    </ErrorBoundary>
  );
}
