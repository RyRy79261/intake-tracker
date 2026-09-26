import { describe, it, expect } from "vitest";
import { readAiErrorMessage } from "@/lib/ai-error-message";

describe("readAiErrorMessage", () => {
  it("returns the server's actionable message", async () => {
    const res = new Response(
      JSON.stringify({
        error: "No anthropic API key configured. Add one in Settings → AI features.",
        code: "NO_AI_KEY",
      }),
      { status: 402 },
    );
    expect(await readAiErrorMessage(res, "Lookup failed")).toMatch(
      /Add one in Settings/,
    );
  });

  it("falls back when the body has no error text", async () => {
    expect(
      await readAiErrorMessage(new Response("{}", { status: 500 }), "Lookup failed"),
    ).toBe("Lookup failed");
  });

  it("falls back on a non-JSON body", async () => {
    expect(
      await readAiErrorMessage(new Response("<html>", { status: 502 }), "Lookup failed"),
    ).toBe("Lookup failed");
  });
});
