// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useInteractionCheck,
  useRefreshInteractions,
  type InteractionResult,
} from "@/hooks/use-interaction-check";

const { apiFetchSpy, mutateAsyncSpy } = vi.hoisted(() => ({
  apiFetchSpy: vi.fn(),
  mutateAsyncSpy: vi.fn(async () => {}),
}));
vi.mock("@/lib/api-fetch", () => ({ apiFetch: apiFetchSpy }));
vi.mock("@/hooks/use-medication-queries", () => ({
  useUpdatePrescription: () => ({ mutateAsync: mutateAsyncSpy }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ibuprofenOnBisoprolol: InteractionResult = {
  interactions: [
    {
      substance: "ibuprofen",
      medication: "bisoprolol",
      severity: "CAUTION",
      description: "May blunt the BP-lowering effect.",
    },
  ],
};

const ibuprofenOnWarfarin: InteractionResult = {
  interactions: [
    ...ibuprofenOnBisoprolol.interactions,
    {
      substance: "ibuprofen",
      medication: "warfarin",
      severity: "AVOID",
      description: "Raises bleeding risk.",
    },
  ],
};

describe("useInteractionCheck (lookup cache)", () => {
  beforeEach(() => {
    localStorage.clear();
    apiFetchSpy.mockReset();
  });

  it("does not serve a cached result once the active prescriptions change", async () => {
    apiFetchSpy
      .mockResolvedValueOnce(jsonResponse(ibuprofenOnBisoprolol))
      .mockResolvedValueOnce(jsonResponse(ibuprofenOnWarfarin));
    const { result } = renderHook(() => useInteractionCheck());

    await act(async () => {
      await result.current.check({
        mode: "lookup",
        substance: "ibuprofen",
        activePrescriptions: [{ genericName: "bisoprolol" }],
      });
    });

    // Warfarin was started: the cached bisoprolol-only answer must not be used.
    await act(async () => {
      await result.current.check({
        mode: "lookup",
        substance: "ibuprofen",
        activePrescriptions: [
          { genericName: "bisoprolol" },
          { genericName: "warfarin" },
        ],
      });
    });

    expect(apiFetchSpy).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual(ibuprofenOnWarfarin);
    expect(result.current.cachedAt).toBeNull();
  });

  it("serves a cached result for the same prescriptions and exposes its timestamp", async () => {
    apiFetchSpy.mockResolvedValueOnce(jsonResponse(ibuprofenOnBisoprolol));
    const { result } = renderHook(() => useInteractionCheck());

    await act(async () => {
      await result.current.check({
        mode: "lookup",
        substance: "ibuprofen",
        activePrescriptions: [{ genericName: "Bisoprolol" }],
      });
    });
    expect(result.current.cachedAt).toBeNull();

    await act(async () => {
      await result.current.check({
        mode: "lookup",
        substance: " Ibuprofen ",
        activePrescriptions: [{ genericName: "bisoprolol" }],
      });
    });

    expect(apiFetchSpy).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(ibuprofenOnBisoprolol);
    expect(typeof result.current.cachedAt).toBe("number");
  });
});

describe("useRefreshInteractions", () => {
  beforeEach(() => {
    apiFetchSpy.mockReset();
    mutateAsyncSpy.mockClear();
  });

  it("surfaces the server's error message instead of failing silently", async () => {
    apiFetchSpy.mockResolvedValueOnce(
      jsonResponse(
        {
          error: "No anthropic API key configured. Add one in Settings → AI features.",
          code: "NO_AI_KEY",
        },
        402,
      ),
    );
    const { result } = renderHook(() => useRefreshInteractions());

    let returned: unknown;
    await act(async () => {
      returned = await result.current.refresh("rx-1", "bisoprolol", [
        { genericName: "warfarin" },
      ]);
    });

    expect(returned).toBeNull();
    expect(result.current.error).toMatch(/Add one in Settings/);
    expect(mutateAsyncSpy).not.toHaveBeenCalled();
  });
});
