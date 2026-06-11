import { Suspense } from "react";
import { AuthShell } from "@/app/auth/auth-shell";
import { SignInForm } from "@/app/auth/sign-in-form";

/**
 * The single sign-in surface for the app. Middleware (src/middleware.ts)
 * redirects every unauthenticated page request here. Uses the login-04
 * two-column shadcn layout via `AuthShell`.
 *
 * SignInForm calls `useSearchParams()` to honour a `?callbackURL=` query
 * param (used by the MCP authorize route to return the user here after
 * Google sign-in). Next.js 14 requires that hook to be inside a Suspense
 * boundary so the page can still be statically prerendered.
 */
export default function AuthPage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <SignInForm />
      </Suspense>
    </AuthShell>
  );
}
