"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  Bell,
  Cloud,
  Loader2,
  LogIn,
  Pill,
  Sparkles,
  TestTube,
  User,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type AuthDialogVariant = "ai" | "push" | "expired" | "general";

interface RequireAuthContextValue {
  requireAuth: (variant?: AuthDialogVariant) => Promise<boolean>;
  notifyExpired: () => Promise<boolean>;
}

const RequireAuthContext = createContext<RequireAuthContextValue | null>(null);

interface DialogState {
  open: boolean;
  variant: AuthDialogVariant;
}

const noopContext: RequireAuthContextValue = {
  requireAuth: async () => true,
  notifyExpired: async () => true,
};

export function AuthRequiredProvider({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return (
      <RequireAuthContext.Provider value={noopContext}>
        {children}
      </RequireAuthContext.Provider>
    );
  }
  return <PrivyAuthRequiredProvider>{children}</PrivyAuthRequiredProvider>;
}

function PrivyAuthRequiredProvider({ children }: { children: React.ReactNode }) {
  const { authenticated, login, logout } = usePrivy();
  const [state, setState] = useState<DialogState>({ open: false, variant: "general" });
  const resolverRef = useRef<((success: boolean) => void) | null>(null);
  // Tracks whether we've observed `authenticated === false` since the resolver
  // was attached. Without this, the auto-resolve effect can fire on a stale
  // `authenticated === true` render right after notifyExpired() opens the
  // dialog (Privy's logout() does not synchronously flip the hook state).
  const seenUnauthenticatedRef = useRef(false);
  // When Sign In is tapped we close our dialog ourselves so its focus trap
  // and pointer-events lock don't block the Privy modal opening on top.
  // This flag tells handleOpenChange that the close was internal and the
  // pending promise should stay attached until auth actually completes.
  const loginPendingRef = useRef(false);

  const closeWith = useCallback((success: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    seenUnauthenticatedRef.current = false;
    setState((prev) => ({ ...prev, open: false }));
    resolve?.(success);
  }, []);

  useEffect(() => {
    if (!resolverRef.current) return;
    if (!authenticated) {
      seenUnauthenticatedRef.current = true;
      return;
    }
    if (seenUnauthenticatedRef.current) {
      closeWith(true);
    }
  }, [authenticated, closeWith]);

  const requireAuth = useCallback(
    (variant: AuthDialogVariant = "general") => {
      if (authenticated) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        resolverRef.current?.(false);
        // We've already verified authenticated is false; the gate is open.
        seenUnauthenticatedRef.current = true;
        resolverRef.current = resolve;
        setState({ open: true, variant });
      });
    },
    [authenticated]
  );

  const notifyExpired = useCallback(async () => {
    try {
      await logout();
    } catch {
      // best-effort — Privy may already be in a bad state
    }
    return new Promise<boolean>((resolve) => {
      resolverRef.current?.(false);
      // Wait for an actual flip to unauthenticated before allowing auto-resolve.
      seenUnauthenticatedRef.current = false;
      resolverRef.current = resolve;
      setState({ open: true, variant: "expired" });
    });
  }, [logout]);

  const value = useMemo<RequireAuthContextValue>(
    () => ({ requireAuth, notifyExpired }),
    [requireAuth, notifyExpired]
  );

  const handleOpenChange = (open: boolean) => {
    if (open) return;
    if (loginPendingRef.current) {
      // We closed the dialog ourselves to hand off to Privy; the resolver
      // stays attached and the authenticated-watching useEffect will fire
      // once login completes.
      loginPendingRef.current = false;
      return;
    }
    closeWith(false);
  };

  const handleSignIn = useCallback(() => {
    loginPendingRef.current = true;
    setState((prev) => ({ ...prev, open: false }));
    login();
  }, [login]);

  return (
    <RequireAuthContext.Provider value={value}>
      {children}
      <AuthRequiredDialog
        open={state.open}
        variant={state.variant}
        onOpenChange={handleOpenChange}
        onSignIn={handleSignIn}
      />
    </RequireAuthContext.Provider>
  );
}

export function useRequireAuth(): RequireAuthContextValue {
  const ctx = useContext(RequireAuthContext);
  return ctx ?? noopContext;
}

interface VariantContent {
  icon: LucideIcon;
  iconClass: string;
  title: string;
  description: string;
  features?: { icon: LucideIcon; label: string; comingSoon?: boolean }[];
}

const VARIANT_CONTENT: Record<AuthDialogVariant, VariantContent> = {
  ai: {
    icon: Sparkles,
    iconClass: "text-orange-500",
    title: "Sign in to use AI features",
    description: "AI-powered parsing and lookups need a verified account.",
    features: [
      { icon: Sparkles, label: "Food & drink AI parsing" },
      { icon: TestTube, label: "Substance lookup" },
      { icon: Pill, label: "Medicine search & interactions" },
    ],
  },
  push: {
    icon: Bell,
    iconClass: "text-teal-500",
    title: "Sign in to enable reminders",
    description: "Push notifications need a verified account so we can deliver them across your devices.",
  },
  expired: {
    icon: AlertCircle,
    iconClass: "text-amber-500",
    title: "Your session expired",
    description: "Sign in again to keep using AI features and reminders.",
  },
  general: {
    icon: User,
    iconClass: "text-primary",
    title: "Sign in",
    description: "Sign in to unlock cloud features. Your local data stays on this device.",
    features: [
      { icon: Sparkles, label: "AI food, drink & medicine parsing" },
      { icon: Bell, label: "Medication reminders" },
      { icon: Cloud, label: "Cloud sync", comingSoon: true },
    ],
  },
};

interface AuthRequiredDialogProps {
  open: boolean;
  variant: AuthDialogVariant;
  onOpenChange: (open: boolean) => void;
  onSignIn: () => void;
}

function AuthRequiredDialog({ open, variant, onOpenChange, onSignIn }: AuthRequiredDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const content = VARIANT_CONTENT[variant];
  const Icon = content.icon;

  useEffect(() => {
    if (!open) setSubmitting(false);
  }, [open]);

  const handleSignIn = () => {
    setSubmitting(true);
    try {
      onSignIn();
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="items-center text-center">
          <div
            className={cn(
              "mx-auto mb-2 p-3 rounded-full bg-primary/10 w-fit",
              variant === "expired" && "bg-amber-500/10"
            )}
          >
            <Icon className={cn("w-6 h-6", content.iconClass)} />
          </div>
          <DialogTitle>{content.title}</DialogTitle>
          <DialogDescription>{content.description}</DialogDescription>
        </DialogHeader>

        {content.features && content.features.length > 0 && (
          <ul className="space-y-2 my-2">
            {content.features.map((feature) => {
              const FeatureIcon = feature.icon;
              return (
                <li
                  key={feature.label}
                  className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                >
                  <FeatureIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="flex-1">{feature.label}</span>
                  {feature.comingSoon && (
                    <span className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground bg-background border rounded px-1.5 py-0.5">
                      Soon
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-xs text-center text-muted-foreground">
          Local data stays on this device. Signing in only enables online features.
        </p>

        <div className="space-y-2 mt-2">
          <Button
            onClick={handleSignIn}
            disabled={submitting}
            className="w-full gap-2"
            size="lg"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogIn className="w-4 h-4" />
            )}
            Sign In
          </Button>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="w-full"
          >
            Not now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
