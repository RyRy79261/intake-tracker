/**
 * Smoke tests for the rewritten auth-guard, auth-button, account-section,
 * and providers.tsx from plan 41-02 Task 2.
 *
 * Scope: module-level contract verification plus direct `useAuth()` hook
 * exercising via a mock of `@/lib/auth-client`. We cannot render JSX in
 * this project (vitest `environment: node`, `@testing-library/react` is
 * not a dep). Instead we:
 *
 *   1. Mock `@/lib/auth-client` so `useSession()` returns whatever the
 *      test case wants.
 *   2. Import `useAuth` from the guard and call it directly — hooks are
 *      plain functions as long as they do not call other React hooks
 *      that need a fiber. `useAuth` only calls `useSession()`, which is
 *      our mock and returns a plain object.
 *   3. Verify the wrapper objects against the contract the plan pinned
 *      in its <behavior> block.
 *
 * Tests 1-3 cover the three useAuth branches (authenticated,
 * unauthenticated, pending). Tests 4-6 cover module-export contracts for
 * AuthButton, AccountSection, AuthGuard, and the simplified Providers
 * stack (zero Privy / PIN imports).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type SessionUser = { id: string; email?: string; name?: string };
type SessionResult = {
  data: { user: SessionUser } | null;
  isPending: boolean;
  error: null;
};

const sessionMock = vi.fn<() => SessionResult>(() => ({
  data: null,
  isPending: false,
  error: null,
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => sessionMock(),
  signOut: vi.fn(async () => ({ data: null, error: null })),
  signIn: { email: vi.fn(), social: vi.fn() },
  signUp: { email: vi.fn() },
  getSession: vi.fn(async () => ({ data: null, error: null })),
  authClient: {},
}));

// Prevent actual next-themes / react-query etc. from blowing up when
// providers.tsx is imported — they are pure client modules but we only
// verify the export shape, not execute them.
vi.mock("@tanstack/react-query", () => ({
  QueryClient: class {
    constructor(_opts?: unknown) {}
  },
  QueryClientProvider: ({ children }: { children: unknown }) => children,
}));

vi.mock("next-themes", () => ({
  ThemeProvider: ({ children }: { children: unknown }) => children,
}));

vi.mock("@/components/error-boundary", () => ({
  ErrorBoundary: ({ children }: { children: unknown }) => children,
}));

vi.mock("@/lib/inventory-service", () => ({
  initStockRecalculation: vi.fn(),
}));

vi.mock("@/hooks/use-timezone-detection", () => ({
  useTimezoneDetection: () => ({
    dialogOpen: false,
    oldTimezone: null,
    newTimezone: null,
    isRecalculating: false,
    handleConfirm: vi.fn(),
    handleDismiss: vi.fn(),
  }),
}));

vi.mock("@/components/medications/timezone-change-dialog", () => ({
  TimezoneChangeDialog: () => null,
}));

describe("useAuth hook (Neon Auth)", () => {
  beforeEach(() => {
    sessionMock.mockReset();
  });

  it("returns ready/authenticated/user when session is present", async () => {
    sessionMock.mockReturnValue({
      data: {
        user: { id: "user-1", email: "owner@example.test", name: "Owner" },
      },
      isPending: false,
      error: null,
    });

    const { useAuth } = await import("@/components/auth-guard");
    const result = useAuth();

    expect(result.ready).toBe(true);
    expect(result.authenticated).toBe(true);
    expect(result.user).toEqual({
      id: "user-1",
      email: "owner@example.test",
      name: "Owner",
    });
  });

  it("returns unauthenticated when session data is null", async () => {
    sessionMock.mockReturnValue({
      data: null,
      isPending: false,
      error: null,
    });

    const { useAuth } = await import("@/components/auth-guard");
    const result = useAuth();

    expect(result.ready).toBe(true);
    expect(result.authenticated).toBe(false);
    expect(result.user).toBeNull();
  });

  it("returns ready=false while session is pending", async () => {
    sessionMock.mockReturnValue({
      data: null,
      isPending: true,
      error: null,
    });

    const { useAuth } = await import("@/components/auth-guard");
    const result = useAuth();

    expect(result.ready).toBe(false);
    expect(result.authenticated).toBe(false);
    expect(result.user).toBeNull();
  });
});

describe("module export contracts", () => {
  it("auth-guard exports useAuth and AuthGuard function component", async () => {
    const mod = await import("@/components/auth-guard");
    expect(typeof mod.useAuth).toBe("function");
    expect(typeof mod.AuthGuard).toBe("function");
  });

  it("auth-button exports AuthButton function component", async () => {
    const mod = await import("@/components/auth-button");
    expect(typeof mod.AuthButton).toBe("function");
  });

  it("account-section exports AccountSection function component", async () => {
    const mod = await import("@/components/settings/account-section");
    expect(typeof mod.AccountSection).toBe("function");
  });

  it("providers.tsx exports Providers function component", async () => {
    const mod = await import("@/app/providers");
    expect(typeof mod.Providers).toBe("function");
  });
});

describe("Privy removal guarantees (plan 41-02 success_criteria)", () => {
  it("providers.tsx source contains zero @privy-io references", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(
      new URL("../app/providers.tsx", import.meta.url),
      "utf8"
    );
    expect(src).not.toContain("@privy-io");
    expect(src).not.toContain("PinGateProvider");
  });

  it("auth-guard.tsx source contains zero @privy-io references", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(
      new URL("../components/auth-guard.tsx", import.meta.url),
      "utf8"
    );
    expect(src).not.toContain("@privy-io");
  });

  it("auth-button.tsx source contains zero @privy-io references", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(
      new URL("../components/auth-button.tsx", import.meta.url),
      "utf8"
    );
    expect(src).not.toContain("@privy-io");
  });

  it("account-section.tsx source contains zero @privy-io references", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(
      new URL("../components/settings/account-section.tsx", import.meta.url),
      "utf8"
    );
    expect(src).not.toContain("@privy-io");
  });
});
