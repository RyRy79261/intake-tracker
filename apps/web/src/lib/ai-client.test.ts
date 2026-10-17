/**
 * The typed client AI adapter at its interface: aiClient.call(route, body)
 * against a stubbed network, answering a Result. One place for every way an
 * AI call can fail on the client: the route's error codes, a reply with no
 * code, a non-JSON body, a dropped connection, offline, cancel and timeout.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, resolve } from "path";
import {
  ACTIONABLE_CODES,
  AI_ROUTE_MAX_DURATION_S,
  aiClient,
  aiErrorText,
  aiTimeoutMs,
  CLIENT_GRACE_MS,
  type AiRoute,
} from "@/lib/ai-client";
import { LOOKUP_TIMEOUT_MS } from "@/components/medications/medicine-lookup-panel";

const SRC = resolve(__dirname, "..");
const API = resolve(SRC, "app/api");

/** A route file's exported maxDuration, in seconds (null when it has none). */
function routeMaxDuration(route: string): number | null {
  const source = readFileSync(resolve(API, route.replace(/^\/api\//, ""), "route.ts"), "utf8");
  const match = /export const maxDuration = (\d+);/.exec(source);
  return match ? Number(match[1]) : null;
}

const fetchMock = vi.fn<typeof fetch>();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("aiClient.call", () => {
  it("POSTs the body as JSON and answers the parsed result", async () => {
    fetchMock.mockResolvedValueOnce(json({ warnings: ["Dizziness"] }));
    const result = await aiClient.call("/api/ai/titration-warnings", {
      prescriptions: [{ genericName: "bisoprolol" }],
    });
    expect(result).toEqual({ ok: true, data: { warnings: ["Dizziness"] } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/ai/titration-warnings");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(init?.body as string)).toEqual({ prescriptions: [{ genericName: "bisoprolol" }] });
  });

  it("sends FormData as is, without a JSON content type", async () => {
    fetchMock.mockResolvedValueOnce(json({ text: "two coffees" }));
    const form = new FormData();
    form.append("audio", new Blob(["x"]), "clip.webm");
    const result = await aiClient.call("/api/ai/voice-transcribe", form);
    expect(result).toEqual({ ok: true, data: { text: "two coffees" } });
    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.body).toBe(form);
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
  });

  it("passes the route's code, wording and manual fallback through", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ error: "The AI declined. Enter the details manually.", code: "AI_REFUSED", fallbackToManual: true }, 422),
    );
    const result = await aiClient.call("/api/ai/parse", { input: "x" });
    expect(result).toEqual({
      ok: false,
      error: { code: "AI_REFUSED", message: "The AI declined. Enter the details manually.", fallbackToManual: true },
    });
  });

  it.each([
    [429, "RATE_LIMITED"],
    [504, "AI_TIMEOUT"],
    [500, "HTTP_500"],
  ])("names a %i reply with no code %s", async (status, code) => {
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status }));
    const result = await aiClient.call("/api/ai/parse", { input: "x" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(code);
      expect(result.error.message).not.toBe("");
      expect(result.error.fallbackToManual).toBe(false);
    }
  });

  it("answers BAD_RESPONSE for a 200 that is not a JSON object", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not json", { status: 200 }));
    const result = await aiClient.call("/api/ai/parse", { input: "x" });
    expect(result).toMatchObject({ ok: false, error: { code: "BAD_RESPONSE" } });
  });

  it("answers NETWORK for a dropped connection", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const result = await aiClient.call("/api/ai/parse", { input: "x" });
    expect(result).toMatchObject({ ok: false, error: { code: "NETWORK" } });
  });

  it("answers OFFLINE without a request when the device is offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const result = await aiClient.call("/api/ai/parse", { input: "x" });
    expect(result).toMatchObject({ ok: false, error: { code: "OFFLINE" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers CANCELLED when the caller aborts", async () => {
    const hang = (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    fetchMock.mockImplementationOnce(hang);
    const controller = new AbortController();
    const pending = aiClient.call("/api/ai/parse", { input: "x" }, { signal: controller.signal });
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, error: { code: "CANCELLED" } });
  });

  it("stops at the route's maxDuration plus the grace, not before, and answers AI_TIMEOUT", async () => {
    vi.useFakeTimers();
    let aborted = false;
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const pending = aiClient.call("/api/ai/medicine-search", { query: "aspirin" });
    await vi.advanceTimersByTimeAsync(130_000);
    expect(aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(CLIENT_GRACE_MS);
    expect(await pending).toMatchObject({ ok: false, error: { code: "AI_TIMEOUT" } });
  });
});

describe("ACTIONABLE_CODES", () => {
  it("shows the route's wording only for codes that say what to do", () => {
    const keyError = { code: "NO_AI_KEY", message: "Add a key in Settings.", fallbackToManual: false };
    const upstream = { code: "AI_FAILED", message: "Failed to process request", fallbackToManual: false };
    expect(aiErrorText(keyError, "Try again later.")).toBe("Add a key in Settings.");
    expect(aiErrorText(upstream, "Try again later.")).toBe("Try again later.");
    expect([...ACTIONABLE_CODES].sort()).toEqual(
      ["AI_REFUSED", "INVALID_KEY", "KEY_UNREADABLE", "NO_AI_KEY", "SEARCH_REQUIRED"].sort(),
    );
  });
});

describe("client time limits", () => {
  it.each(Object.keys(AI_ROUTE_MAX_DURATION_S) as AiRoute[])(
    "%s: the client's maxDuration matches the route file",
    (route) => {
      expect(AI_ROUTE_MAX_DURATION_S[route]).toBe(routeMaxDuration(route));
    },
  );

  it("waits past the route's own limit on every timed route", () => {
    for (const route of Object.keys(AI_ROUTE_MAX_DURATION_S) as AiRoute[]) {
      const seconds = routeMaxDuration(route);
      if (seconds === null) expect(aiTimeoutMs(route)).toBeNull();
      else expect(aiTimeoutMs(route)).toBeGreaterThan(seconds * 1000);
    }
  });

  // #415 gave the medicine lookup a 120 s deadline inside a 130 s function,
  // but the lookup panel still stopped waiting at 95 s, so a slow lookup the
  // server would have answered was shown as "took too long".
  it("the medicine lookup waits longer than the route may run", () => {
    expect(LOOKUP_TIMEOUT_MS).toBeGreaterThan(routeMaxDuration("/api/ai/medicine-search")! * 1000);
  });
});

describe("AI call sites", () => {
  function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name === "__tests__" || name === "node_modules" || name === "api") continue;
        out.push(...sourceFiles(full));
      } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name)) {
        out.push(full);
      }
    }
    return out;
  }

  it("all go through aiClient: no apiFetch to an AI route anywhere else", () => {
    // The insights job poll is a plain GET with its own keep-polling rules.
    const RAW = /apiFetch\(\s*[`'"]\/api\/(ai\/|analytics\/insights["'`/](?!jobs))/;
    const offenders = sourceFiles(SRC)
      .map((f) => relative(SRC, f))
      .filter((rel) => rel !== "lib/ai-client.ts")
      .filter((rel) => RAW.test(readFileSync(join(SRC, rel), "utf8")));
    expect(offenders).toEqual([]);
  });
});
