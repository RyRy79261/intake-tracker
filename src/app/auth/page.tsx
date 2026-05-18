import { AuthShell } from "./auth-shell";
import { SignInForm } from "./sign-in-form";

/**
 * The single sign-in surface for the app. Middleware (src/middleware.ts)
 * redirects every unauthenticated page request here. Uses the login-04
 * two-column shadcn layout via `AuthShell`.
 */
export default function AuthPage() {
  return (
    <AuthShell>
      <SignInForm />
    </AuthShell>
  );
}
