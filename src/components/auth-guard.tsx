"use client";

import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogIn, Shield, Loader2 } from "lucide-react";

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Protects content behind Privy authentication.
 * Shows login prompt if user is not authenticated.
 */
export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const { ready, authenticated, login } = usePrivy();

  // Show loading while Privy initializes
  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  // User is authenticated - show protected content
  if (authenticated) {
    return <>{children}</>;
  }

  // User is not authenticated - show login prompt or fallback
  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-3 rounded-full bg-primary/10 w-fit">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <CardTitle>Sign in Required</CardTitle>
          <CardDescription>
            This app requires authentication to protect your health data and API access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={login}
            className="w-full gap-2"
            size="lg"
          >
            <LogIn className="w-5 h-5" />
            Sign In
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Only authorized accounts can access this app.
            Contact the administrator if you need access.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Hook to check if user is authorized (authenticated + on whitelist)
 * The whitelist check happens server-side when making API calls.
 */
export function useAuth() {
  const { ready, authenticated, user, getAccessToken } = usePrivy();

  return {
    ready,
    authenticated,
    user,
    getAccessToken,
    // Helper to get auth header for API calls
    getAuthHeader: async () => {
      const token = await getAccessToken();
      return token ? { Authorization: `Bearer ${token}` } : {};
    },
  };
}
