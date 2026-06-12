import { describe, it, expect } from "vitest";
import {
  obfuscateApiKey,
  deobfuscateApiKey,
  sanitizeNumericInput,
  sanitizeTextInput,
  isSecureContext,
  sanitizeForAI,
  sanitizeReportText,
} from "@/lib/security";

describe("obfuscateApiKey / deobfuscateApiKey", () => {
  it("returns empty string for empty input", () => {
    expect(obfuscateApiKey("")).toBe("");
    expect(deobfuscateApiKey("")).toBe("");
  });

  it("round-trips a key back to the original", () => {
    const key = "sk-ant-api03-abcDEF123_xyz";
    const obf = obfuscateApiKey(key);
    expect(deobfuscateApiKey(obf)).toBe(key);
  });

  it("prefixes obfuscated output with obf:", () => {
    expect(obfuscateApiKey("secret")).toMatch(/^obf:/);
  });

  it("produces output that differs from the plaintext", () => {
    const key = "my-secret-key";
    expect(obfuscateApiKey(key)).not.toContain(key);
  });

  it("passes through values lacking the obf: prefix unchanged", () => {
    expect(deobfuscateApiKey("plain-key")).toBe("plain-key");
  });
});

describe("sanitizeNumericInput", () => {
  it("parses numeric strings", () => {
    expect(sanitizeNumericInput("42")).toBe(42);
  });

  it("returns min for NaN input", () => {
    expect(sanitizeNumericInput("not-a-number", 5)).toBe(5);
  });

  it("returns min for Infinity", () => {
    expect(sanitizeNumericInput(Infinity, 3)).toBe(3);
  });

  it("clamps to the max boundary", () => {
    expect(sanitizeNumericInput(500, 0, 100)).toBe(100);
  });

  it("clamps to the min boundary", () => {
    expect(sanitizeNumericInput(-10, 0, 100)).toBe(0);
  });

  it("rounds to an integer without precision", () => {
    expect(sanitizeNumericInput(3.7)).toBe(4);
  });

  it("rounds to the given decimal precision", () => {
    expect(sanitizeNumericInput(0.123, 0, 100, 2)).toBe(0.12);
  });
});

describe("sanitizeTextInput", () => {
  it("returns empty string for falsy input", () => {
    expect(sanitizeTextInput("")).toBe("");
  });

  it("strips HTML tags", () => {
    expect(sanitizeTextInput("<b>hello</b>")).toBe("hello");
  });

  it("removes script tags content markup", () => {
    expect(sanitizeTextInput('<script>alert(1)</script>safe')).toBe(
      "alert(1)safe",
    );
  });

  it("drops an unterminated tag (no '<...' survives)", () => {
    // The linear scan removes "<" through the next ">" or, lacking one, the
    // remainder — so an unclosed "<script" cannot survive (complete sanitizer).
    expect(sanitizeTextInput("keep<script")).toBe("keep");
    expect(sanitizeTextInput("a<<b")).toBe("a");
  });

  it("handles many '<' without pathological slowdown (no ReDoS)", () => {
    // A naive /<[^>]*>/g backtracks O(n^2) here; the linear scan is O(n).
    const result = sanitizeTextInput("<".repeat(100000));
    expect(result).toBe("");
    expect(result).not.toMatch(/<[^>]*>/);
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeTextInput("  spaced  ")).toBe("spaced");
  });

  it("truncates to maxLength", () => {
    expect(sanitizeTextInput("abcdef", 3)).toBe("abc");
  });
});

describe("isSecureContext", () => {
  it("returns true when window is undefined (server)", () => {
    expect(isSecureContext()).toBe(true);
  });
});

describe("sanitizeForAI", () => {
  it("redacts email addresses", () => {
    expect(sanitizeForAI("contact me at john.doe@example.com")).toContain(
      "[email]",
    );
  });

  it("redacts international phone numbers", () => {
    expect(sanitizeForAI("call +27 12 345 6789 now")).toContain("[phone]");
  });

  it("redacts US phone numbers", () => {
    expect(sanitizeForAI("123-456-7890")).toBe("[phone]");
  });

  it("redacts credit card numbers", () => {
    expect(sanitizeForAI("card 1234 5678 9012 3456")).toContain("[card]");
  });

  it("redacts ISO dates", () => {
    expect(sanitizeForAI("born 1990-05-15")).toContain("[date]");
  });

  it("redacts 13-digit SA ID numbers", () => {
    expect(sanitizeForAI("id 9001015009087")).toContain("[id-number]");
  });

  it("leaves clean text untouched", () => {
    expect(sanitizeForAI("I drank two glasses of water")).toBe(
      "I drank two glasses of water",
    );
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeForAI("")).toBe("");
  });

  it("trims and caps at 500 chars", () => {
    const result = sanitizeForAI("  " + "x".repeat(600) + "  ");
    expect(result.length).toBe(500);
  });
});

describe("sanitizeReportText", () => {
  it("returns empty string for falsy input", () => {
    expect(sanitizeReportText("")).toBe("");
  });

  it("preserves newlines", () => {
    expect(sanitizeReportText("line1\nline2")).toBe("line1\nline2");
  });

  it("redacts PII inside multi-line text", () => {
    const out = sanitizeReportText("error log\nuser a@b.com\nstack");
    expect(out).toContain("[email]");
    expect(out).toContain("error log");
  });

  it("respects the larger default length budget", () => {
    expect(sanitizeReportText("y".repeat(600)).length).toBe(600);
  });

  it("caps at the provided maxLength", () => {
    expect(sanitizeReportText("z".repeat(100), 10).length).toBe(10);
  });
});
