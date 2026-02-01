"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider } from "@privy-io/react-auth";
import { ThemeProvider, useTheme } from "next-themes";
import { PinGateProvider } from "@/hooks/use-pin-gate";
import { ErrorBoundary } from "@/components/error-boundary";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60, // 1 minute
        refetchOnWindowFocus: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    // Browser: make a new query client if we don't already have one
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

// Wrapper component that uses theme context to configure Privy
function PrivyProviderWithTheme({ 
  appId,
  clientId,
  children 
}: { 
  appId: string;
  clientId?: string;
  children: React.ReactNode 
}) {
  const { resolvedTheme } = useTheme();

  return (
    <PrivyProvider
      appId={appId}
      clientId={clientId}
      config={{
        // Login methods to show in the modal
        loginMethods: ["email", "google"],
        // Appearance customization
        appearance: {
          theme: resolvedTheme === "dark" ? "dark" : "light",
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
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const clientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID;

  if (!appId) {
    // If Privy is not configured, render children without auth
    // This allows the app to work in development without Privy setup
    return (
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <PinGateProvider>{children}</PinGateProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <PrivyProviderWithTheme appId={appId} clientId={clientId}>
            {children}
          </PrivyProviderWithTheme>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
