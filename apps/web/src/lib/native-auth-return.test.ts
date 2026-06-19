// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api-fetch", () => ({
  apiFetch: vi.fn(),
  saveAuthToken: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));
vi.mock("@capacitor/browser", () => ({
  Browser: { close: vi.fn().mockResolvedValue(undefined) },
}));

import { handleNativeAuthReturn } from "@/lib/native-auth-return";
import { apiFetch, saveAuthToken } from "@/lib/api-fetch";

const mockApiFetch = vi.mocked(apiFetch);
const mockSave = vi.mocked(saveAuthToken);

const DONE = "https://intake-tracker.ryanjnoble.dev/auth/native-done";

function jsonRes(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { replace: vi.fn() },
  });
});

describe("handleNativeAuthReturn", () => {
  it("ignores URLs that are not the native-done path", async () => {
    expect(await handleNativeAuthReturn(`${DONE.replace("native-done", "history")}`)).toBe(false);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("ignores a malformed URL", async () => {
    expect(await handleNativeAuthReturn("not a url")).toBe(false);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("ignores native-done without a code", async () => {
    expect(await handleNativeAuthReturn(DONE)).toBe(false);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("claims the code, stores the token, and reloads", async () => {
    mockApiFetch.mockResolvedValue(jsonRes(200, { token: "sess-xyz" }));
    const ok = await handleNativeAuthReturn(`${DONE}?code=abc123`);
    expect(ok).toBe(true);
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/native-auth/claim",
      expect.objectContaining({ method: "POST" }),
    );
    expect(mockSave).toHaveBeenCalledWith("sess-xyz");
    expect(window.location.replace).toHaveBeenCalledWith("/");
  });

  it("does not store a token or reload when the claim fails", async () => {
    mockApiFetch.mockResolvedValue(jsonRes(400, { error: "invalid_grant" }));
    const ok = await handleNativeAuthReturn(`${DONE}?code=bad`);
    expect(ok).toBe(false);
    expect(mockSave).not.toHaveBeenCalled();
    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it("does not store a token when the response has no token", async () => {
    mockApiFetch.mockResolvedValue(jsonRes(200, {}));
    expect(await handleNativeAuthReturn(`${DONE}?code=x`)).toBe(false);
    expect(mockSave).not.toHaveBeenCalled();
  });
});
