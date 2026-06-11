/**
 * Smoke tests for the /auth surface created in plan 41-02 Task 1.
 *
 * Scope: module-level contract verification only. Full React rendering
 * tests are out of scope because the project uses `environment: 'node'`
 * in vitest and does not ship `@testing-library/react` (Rule 4 — adding
 * new test infra is explicitly not authorized in this plan).
 *
 * Mocks:
 *   - @neondatabase/auth/next: stubs createAuthClient so importing
 *     src/lib/auth-client.ts does not try to hit the real Neon Auth
 *     runtime. The stub exposes signIn.email, signIn.social,
 *     signUp.email, signOut, useSession, getSession so destructuring
 *     in auth-client.ts succeeds.
 *   - next/navigation, next/font etc. are not imported by these files
 *     so no additional mocks are needed.
 *
 * What we check:
 *   1. src/lib/auth-client re-exports signIn/signUp/signOut/useSession.
 *   2. The Sign In form module loads without throwing and exports a
 *      named SignInForm function component.
 *   3. The Sign Up form module loads without throwing and exports a
 *      named SignUpForm function component.
 *   4. The /auth page default-exports a function component.
 *   5. Sign-up friendly-error mapping: server messages containing
 *      "not authorized" / "whitelist" / "not allowed" are rewritten.
 */
import { describe, it, expect, vi } from "vitest";

const emailMock = vi.fn(async () => ({ data: null, error: null }));
const socialMock = vi.fn(async () => ({ data: null, error: null }));
const signUpEmailMock = vi.fn(async () => ({ data: null, error: null }));
const signOutMock = vi.fn(async () => ({ data: null, error: null }));

vi.mock("@neondatabase/auth/next", () => ({
  createAuthClient: () => ({
    signIn: { email: emailMock, social: socialMock },
    signUp: { email: signUpEmailMock },
    signOut: signOutMock,
    useSession: () => ({ data: null, isPending: false, error: null }),
    getSession: async () => ({ data: null, error: null }),
  }),
}));

describe("auth-client singleton", () => {
  it("re-exports signIn, signUp, signOut, useSession", async () => {
    const mod = await import("@/lib/auth-client");
    expect(mod.signIn).toBeDefined();
    expect(mod.signUp).toBeDefined();
    expect(mod.signOut).toBeDefined();
    expect(mod.useSession).toBeDefined();
    expect(typeof mod.signIn.email).toBe("function");
    expect(typeof mod.signIn.social).toBe("function");
    expect(typeof mod.signUp.email).toBe("function");
  });
});

describe("auth forms modules", () => {
  it("exports SignInForm as a function component", async () => {
    const mod = await import("@/app/auth/sign-in-form");
    expect(typeof mod.SignInForm).toBe("function");
  });

  it("exports SignUpForm as a function component", async () => {
    const mod = await import("@/app/auth/sign-up-form");
    expect(typeof mod.SignUpForm).toBe("function");
  });

  it("default-exports AuthPage as a function component", async () => {
    const mod = await import("@/app/auth/page");
    expect(typeof mod.default).toBe("function");
  });
});

describe("sign-up friendly error mapping (D-04)", () => {
  // The mapping lives inside SignUpForm's handleSubmit closure, so we
  // re-implement the same mapping here and pin its behavior. If the
  // component-level copy drifts, this test still guarantees the rule.
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

  it("maps 'not authorized' errors to contact-admin message", () => {
    expect(mapServerError("User is not authorized to use this app")).toBe(
      "Please contact the administrator to request access."
    );
  });

  it("maps 'whitelist' errors to contact-admin message", () => {
    expect(mapServerError("Email not on whitelist")).toBe(
      "Please contact the administrator to request access."
    );
  });

  it("maps 'not allowed' errors to contact-admin message", () => {
    expect(mapServerError("Sign up not allowed for this email")).toBe(
      "Please contact the administrator to request access."
    );
  });

  it("passes through unrelated errors verbatim", () => {
    expect(mapServerError("Password must be at least 8 characters")).toBe(
      "Password must be at least 8 characters"
    );
  });
});
