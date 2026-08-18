"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@intake/ui/button";
import { Input } from "@intake/ui/input";
import { Label } from "@intake/ui/label";
import { Capacitor } from "@capacitor/core";
import { signIn, useSession } from "@/lib/auth-client";
import { isCapacitorMode } from "@/lib/api-fetch";
import { safeCallbackUrl, signInReturnTarget } from "@/lib/auth-callback";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackURL = safeCallbackUrl(searchParams.get("callbackURL"));
  const { data: session, isPending: sessionPending } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Auto-forward when the user lands here with an active session AND a
  // pending callbackURL. This is the second half of the API-route flow:
  // returnTarget() deliberately sends the OAuth return trip back to this
  // page (so the session verifier gets exchanged), and this effect then
  // carries the user on to the real destination. It also covers a social
  // sign-in that returns to the originating page (/auth?callbackURL=…)
  // instead of unwrapping the callbackURL value itself — without it the
  // user would just see the sign-in form again despite being authenticated.
  useEffect(() => {
    if (sessionPending) return;
    if (!session?.user) return;
    if (callbackURL === "/") return;
    // Hard navigation: callbackURL may be an API route (e.g. the MCP
    // authorize endpoint), which router.push won't reach.
    window.location.replace(callbackURL);
  }, [sessionPending, session, callbackURL]);

  /**
   * Where Neon Auth should drop the browser once sign-in completes. For a
   * page destination that is `callbackURL` itself; for an API route (the
   * MCP authorize endpoint) it is this page, which then forwards via the
   * effect above once the session exists.
   */
  function returnTarget(): string {
    if (typeof window === "undefined") return callbackURL;
    return signInReturnTarget(callbackURL, window.location);
  }

  async function handleEmailSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    if (!password) {
      setError("Password is required");
      return;
    }

    setLoading(true);
    try {
      const result = await signIn.email({
        email: email.trim(),
        password,
        callbackURL: returnTarget(),
      });
      if (result && "error" in result && result.error) {
        setError(result.error.message ?? "Sign in failed");
      } else if (isCapacitorMode()) {
        router.replace(callbackURL);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError(null);
    setLoading(true);
    try {
      if (Capacitor.isNativePlatform()) {
        // Native app: open the hosted Google flow in the system browser (Google
        // blocks OAuth in the WebView). The App Link return — handled by
        // initNativeAuthReturn — claims the session and reloads, so we just stop
        // the spinner once the Custom Tab is open.
        const { startNativeGoogleSignIn } = await import("@/lib/native-auth-return");
        await startNativeGoogleSignIn();
        setLoading(false);
        return;
      }
      // NOT `callbackURL` — an API-route destination has to be reached
      // via this page so the session verifier can be exchanged. See
      // signInReturnTarget().
      await signIn.social({ provider: "google", callbackURL: returnTarget() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign in failed");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleEmailSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="text-balance text-sm text-muted-foreground">
          Sign in to your Intake Tracker account
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="signin-email">Email</Label>
        <Input
          id="signin-email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="grid gap-2">
        <div className="flex items-center">
          <Label htmlFor="signin-password">Password</Label>
          <Link
            href="/auth/forgot-password"
            className="ml-auto text-sm underline-offset-2 hover:underline"
          >
            Forgot your password?
          </Link>
        </div>
        <Input
          id="signin-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
        />
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Signing in..." : "Sign In"}
      </Button>

      <div className="relative text-center text-sm">
        <div className="absolute inset-0 top-1/2 border-t" aria-hidden />
        <span className="relative z-10 bg-card px-2 text-muted-foreground">
          Or continue with
        </span>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={handleGoogleSignIn}
        disabled={loading}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className="mr-2 h-4 w-4"
          aria-hidden
        >
          <path
            d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
            fill="currentColor"
          />
        </svg>
        Continue with Google
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/auth/sign-up" className="underline underline-offset-4">
          Sign up
        </Link>
      </p>
    </form>
  );
}
