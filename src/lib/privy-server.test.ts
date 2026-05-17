import { describe, it, expect } from "vitest";
import { classifyUser } from "./privy-server";

describe("classifyUser", () => {
  describe("no allow-list configured", () => {
    it("approves any authenticated user when both lists empty", () => {
      const result = classifyUser("u_1", "alice@example.com", [], [], []);
      expect(result).toEqual({
        success: true,
        userId: "u_1",
        email: "alice@example.com",
      });
    });

    it("approves wallet-only user when both lists empty", () => {
      const result = classifyUser("u_2", undefined, ["0xabc"], [], []);
      expect(result).toEqual({
        success: true,
        userId: "u_2",
        wallet: "0xabc",
      });
    });

    it("includes only the first wallet when multiple linked", () => {
      const result = classifyUser(
        "u_3",
        undefined,
        ["0xabc", "0xdef"],
        [],
        []
      );
      expect(result.wallet).toBe("0xabc");
    });

    it("omits email field when user has neither email nor wallet", () => {
      const result = classifyUser("u_4", undefined, [], [], []);
      expect(result).toEqual({ success: true, userId: "u_4" });
    });
  });

  describe("email allow-list", () => {
    it("approves when user's email matches", () => {
      const result = classifyUser(
        "u_1",
        "alice@example.com",
        [],
        ["alice@example.com"],
        []
      );
      expect(result).toEqual({
        success: true,
        userId: "u_1",
        email: "alice@example.com",
      });
    });

    it("denies with not-whitelisted reason when email missing from list", () => {
      const result = classifyUser(
        "u_1",
        "bob@example.com",
        [],
        ["alice@example.com"],
        []
      );
      expect(result.success).toBe(false);
      expect(result.reason).toBe("not-whitelisted");
      expect(result.error).toContain("not authorized");
    });

    it("denies when user has no email and email list is set", () => {
      const result = classifyUser(
        "u_1",
        undefined,
        [],
        ["alice@example.com"],
        []
      );
      expect(result.success).toBe(false);
      expect(result.reason).toBe("not-whitelisted");
    });
  });

  describe("wallet allow-list", () => {
    it("approves when any of user's wallets matches", () => {
      const result = classifyUser(
        "u_1",
        undefined,
        ["0xother", "0xallowed"],
        [],
        ["0xallowed"]
      );
      expect(result).toEqual({
        success: true,
        userId: "u_1",
        wallet: "0xallowed",
      });
    });

    it("denies when none of user's wallets match", () => {
      const result = classifyUser(
        "u_1",
        undefined,
        ["0xa", "0xb"],
        [],
        ["0xc"]
      );
      expect(result.success).toBe(false);
      expect(result.reason).toBe("not-whitelisted");
    });
  });

  describe("both lists set", () => {
    it("approves via email even if wallets don't match", () => {
      const result = classifyUser(
        "u_1",
        "alice@example.com",
        ["0xbad"],
        ["alice@example.com"],
        ["0xgood"]
      );
      expect(result.success).toBe(true);
      expect(result.email).toBe("alice@example.com");
    });

    it("approves via wallet when email doesn't match", () => {
      const result = classifyUser(
        "u_1",
        "bob@example.com",
        ["0xgood"],
        ["alice@example.com"],
        ["0xgood"]
      );
      expect(result.success).toBe(true);
      expect(result.wallet).toBe("0xgood");
    });

    it("denies when neither email nor any wallet match", () => {
      const result = classifyUser(
        "u_1",
        "bob@example.com",
        ["0xbad"],
        ["alice@example.com"],
        ["0xgood"]
      );
      expect(result.success).toBe(false);
      expect(result.reason).toBe("not-whitelisted");
    });
  });
});
