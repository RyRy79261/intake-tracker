"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUp } from "@/lib/auth-client";

/**
 * Email/password sign-up form with whitelist-aware error handling (D-04).
 *
 * When Neon Auth returns an error indicating the user is not authorized
 * (whitelist rejection surfaces via the withAuth HOF on the first protected
 * call, but we also catch server-side messages containing "not authorized"
 * / "whitelist"), we map it to a friendly contact-admin message instead of
 * the raw server string.
 *
 * Password rules are left to Neon Auth defaults (Better Auth ≥ 8 chars). The
 * local form only validates presence + confirm-password match.
 */
export function SignUpForm() {
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
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign up failed";
      setError(mapServerError(msg));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
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
      <div className="space-y-2">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
        />
      </div>
      <div className="space-y-2">
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
      <div className="space-y-2">
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
    </form>
  );
}
