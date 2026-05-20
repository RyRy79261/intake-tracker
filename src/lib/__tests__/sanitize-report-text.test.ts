import { describe, it, expect } from "vitest";
import { sanitizeReportText } from "../security";

describe("sanitizeReportText", () => {
  it("returns empty string for empty or non-string input", () => {
    expect(sanitizeReportText("")).toBe("");
    // @ts-expect-error — exercising the runtime guard
    expect(sanitizeReportText(null)).toBe("");
    // @ts-expect-error — exercising the runtime guard
    expect(sanitizeReportText(undefined)).toBe("");
  });

  it("redacts email addresses", () => {
    expect(sanitizeReportText("contact me at jane.doe@example.com please")).toBe(
      "contact me at [email] please",
    );
  });

  it("redacts phone numbers", () => {
    expect(sanitizeReportText("call +27 12 345 6789")).toContain("[phone]");
    expect(sanitizeReportText("call 123-456-7890")).toContain("[phone]");
  });

  it("redacts a 13-digit SA ID number and credit cards", () => {
    expect(sanitizeReportText("id 9001015009087")).toBe("id [id-number]");
    expect(sanitizeReportText("card 1234 5678 9012 3456")).toBe("card [card]");
  });

  it("redacts date-of-birth-like patterns", () => {
    expect(sanitizeReportText("born 1990-01-15")).toBe("born [date]");
    expect(sanitizeReportText("born 15/01/1990")).toBe("born [date]");
  });

  it("preserves newlines in multi-line text", () => {
    const input = "line one\nline two\nline three";
    expect(sanitizeReportText(input)).toBe(input);
  });

  it("respects the maxLength argument", () => {
    expect(sanitizeReportText("abcdefghij", 4)).toBe("abcd");
  });

  it("does not impose the 500-char cap that sanitizeForAI uses", () => {
    const long = "x".repeat(3000);
    expect(sanitizeReportText(long).length).toBe(3000);
  });
});
