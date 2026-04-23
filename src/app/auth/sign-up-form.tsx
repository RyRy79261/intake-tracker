"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUp } from "@/lib/auth-client";

/**
 * Email/password sign-up form with whitelist-aware error handling (D-04).
 *
 * When Neon Auth returns an error indicating the user is not authorized,
 * we map it to a friendly contact-admin message instead of the raw server
 * string. Visual layout matches the login-04 shadcn block.
 */
export function SignUpForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function mapServerError(message: string): string {
    const lower = message.toLowerCase();
    if (
      lower.includes("not authorized") ||
      lower.includes("whitelist") ||
      lower.includes("not allowed")
    ) {
      return "Please contact the administrator to request access.";
    }
    return message;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
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
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const result = await signUp.email({
        email: email.trim(),
        password,
        name: name.trim() || email.trim(),
        callbackURL: "/",
      });
      if (result && "error" in result && result.error) {
        setError(mapServerError(result.error.message ?? "Sign up failed"));
        setLoading(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign up failed";
      setError(mapServerError(msg));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Create an account</h1>
        <p className="text-balance text-sm text-muted-foreground">
          Start tracking your health data on Intake Tracker
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="signup-name">Name (optional)</Label>
        <Input
          id="signup-name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
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
        <Label htmlFor="signup-password">Password</Label>
        <Input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="signup-confirm-password">Confirm password</Label>
        <Input
          id="signup-confirm-password"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={loading}
        />
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Creating account..." : "Create account"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/auth" className="underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}
