// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/auth-guard", () => ({
  useAuth: () => ({
    ready: true,
    authenticated: true,
    user: { email: "owner@example.com" },
  }),
}));
vi.mock("@/lib/sign-out", () => ({ handleSignOut: vi.fn() }));
vi.mock("@/components/settings/delete-account-dialog", () => ({
  DeleteAccountDialog: () => null,
}));

import { AccountSection } from "@/components/settings/account-section";

/**
 * Sign Out sits next to the destructive Delete Account, so neither may drop
 * below the Button default (h-11, the 44px tap target).
 */
describe("AccountSection actions", () => {
  it("keeps Sign Out and Delete Account at the 44px Button height", () => {
    render(<AccountSection showDeleteAccount />);

    for (const name of ["Sign Out", "Delete Account"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveClass("h-11");
      expect(button).not.toHaveClass("h-10");
    }
  });
});
