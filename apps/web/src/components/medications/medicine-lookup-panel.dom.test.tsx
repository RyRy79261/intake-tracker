// @vitest-environment jsdom
import { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as AuthGuardMod from "@/components/auth-guard";

const gate = vi.fn(() => true);
vi.mock("@/components/auth-guard", async (importActual) => {
  const actual = await importActual<typeof AuthGuardMod>();
  return { ...actual, useAuthGate: () => gate() };
});

import {
  MedicineLookupPanel,
  useMedicineLookup,
  type ApplyContext,
} from "@/components/medications/medicine-lookup-panel";
import type { LookupGroup } from "@/components/medications/medicine-lookup";

const ENTRESTO = {
  brandNames: ["Entresto", "Vymada"],
  localAlternatives: [],
  genericName: "Sacubitril/valsartan",
  dosageStrengths: ["50 mg", "100 mg"],
  activeIngredients: ["Sacubitril", "Valsartan"],
  strengthOptions: [
    { label: "50 mg", compounds: [{ name: "Sacubitril", strength: 24 }, { name: "Valsartan", strength: 26 }] },
    { label: "100 mg", compounds: [{ name: "Sacubitril", strength: 49 }, { name: "Valsartan", strength: 51 }] },
  ],
  commonIndications: ["Heart failure"],
  foodInstruction: "none",
  pillColor: "yellow",
  pillShape: "oval",
  pillDescription: "Yellow oval tablet",
  drugClass: "ARNI",
  contraindications: ["Angioedema"],
  warnings: ["Low blood pressure"],
  isGenericFallback: false,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** A fetch that never answers but rejects when its request is aborted. */
function hangingFetch() {
  const signals: AbortSignal[] = [];
  const fn = vi.fn((_url: string, init?: RequestInit) => {
    const signal = init?.signal ?? undefined;
    if (signal) signals.push(signal);
    return new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener("abort", () =>
        reject(new DOMException("The operation was aborted.", "AbortError")),
      );
    });
  });
  return { fn, signals };
}

function Host({
  groups = ["names", "strength", "appearance", "indication", "food"],
  compact = false,
  fallbackQuery = "",
  unavailable,
  showSignIn = false,
  timeoutMs,
  onApply = () => {},
}: {
  groups?: LookupGroup[];
  compact?: boolean;
  fallbackQuery?: string;
  unavailable?: Partial<Record<LookupGroup, string>>;
  showSignIn?: boolean;
  timeoutMs?: number;
  onApply?: (ctx: ApplyContext) => void;
}) {
  const lookup = useMedicineLookup(timeoutMs ? { timeoutMs } : {});
  return (
    <MedicineLookupPanel
      lookup={lookup}
      groups={groups}
      compact={compact}
      fallbackQuery={fallbackQuery}
      showSignIn={showSignIn}
      onApply={onApply}
      {...(unavailable && { unavailable })}
    />
  );
}

async function lookUp(user: ReturnType<typeof userEvent.setup>, q: string) {
  await user.type(screen.getByLabelText("Medicine name or brand"), q);
  await user.click(screen.getByRole("button", { name: "Look up with AI" }));
}

describe("MedicineLookupPanel", () => {
  beforeEach(() => {
    gate.mockReturnValue(true);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("signed out: shows the sign-in notice and never offers a lookup", () => {
    gate.mockReturnValue(false);
    const fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);
    render(<Host showSignIn />);
    expect(screen.getByText("Sign in to use AI lookup")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth");
    expect(screen.queryByLabelText("Medicine name or brand")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /look up/i })).not.toBeInTheDocument();
  });

  it("signed out without showSignIn (dialog hosts): notice only", () => {
    gate.mockReturnValue(false);
    render(<Host compact />);
    expect(screen.getByText("Sign in to use AI lookup")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
  });

  it("busy: shows the query, then Cancel aborts the request and returns to idle", async () => {
    const { fn, signals } = hangingFetch();
    vi.stubGlobal("fetch", fn);
    const user = userEvent.setup();
    render(<Host />);
    await lookUp(user, "Entresto");

    expect(await screen.findByText("Looking up “Entresto”")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/up to a minute/);
    // The AI box keeps the ai colour inside the teal Medications window.
    expect(screen.getByTestId("medicine-lookup")).toHaveAttribute("data-domain", "ai");
    expect(fn).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fn.mock.calls[0]![1]!.body)) as { query: string };
    expect(body.query).toBe("Entresto");
    expect(signals[0]!.aborted).toBe(false);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(signals[0]!.aborted).toBe(true);
    expect(await screen.findByRole("button", { name: "Look up with AI" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("error: a failed reply shows a plain message and Try again", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Failed to process request" }, 502)));
    const user = userEvent.setup();
    render(<Host />);
    await lookUp(user, "Entresto");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The AI service did not answer. Try again later, or enter the details from the box.",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("error: a missing AI key shows the route's instruction", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({ error: "No anthropic API key configured. Add one in Settings → AI features.", code: "NO_AI_KEY" }, 402),
      ),
    );
    const user = userEvent.setup();
    render(<Host />);
    await lookUp(user, "Entresto");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Add one in Settings/);
  });

  it("timeout: a route 504 and a request that never answers both say it took too long", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "slow", code: "AI_TIMEOUT" }, 504)));
    const user = userEvent.setup();
    const { unmount } = render(<Host />);
    await lookUp(user, "Entresto");
    expect(await screen.findByRole("alert")).toHaveTextContent(/took too long and stopped/);
    unmount();

    const { fn, signals } = hangingFetch();
    vi.stubGlobal("fetch", fn);
    render(<Host timeoutMs={40} />);
    await lookUp(user, "Entresto");
    expect(await screen.findByRole("alert")).toHaveTextContent(/took too long and stopped/);
    expect(signals[0]!.aborted).toBe(true);
  });

  it("offline: says so without sending a request", async () => {
    const fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const user = userEvent.setup();
    render(<Host />);
    await lookUp(user, "Entresto");
    expect(await screen.findByRole("alert")).toHaveTextContent(/You are offline/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("empty query: asks for a name", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole("button", { name: "Look up with AI" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Type a medicine name or brand to look up.");
  });

  it("no match: explains, and Search again clears it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ brandNames: [], genericName: "", activeIngredients: [] })));
    const user = userEvent.setup();
    render(<Host />);
    await lookUp(user, "Zzzqx");
    expect(await screen.findByText("No match found")).toBeInTheDocument();
    expect(screen.getByText("for “Zzzqx”")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Search again" }));
    expect(screen.getByLabelText("Medicine name or brand")).toHaveValue("");
  });

  it("result: pick a strength, untick a group, apply the rest, then collapse to a summary", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(ENTRESTO)));
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(<Host onApply={onApply} />);
    await lookUp(user, "Entresto");

    expect(await screen.findByText("Found: Sacubitril/valsartan")).toBeInTheDocument();
    // Two strengths and none named in the query: strength waits on a pick.
    const strength = screen.getByRole("checkbox", { name: /^Strength/ });
    expect(strength).toHaveAttribute("aria-checked", "false");
    expect(strength).toHaveAttribute("aria-disabled", "true");
    expect(strength).toHaveTextContent("Pick a strength first");

    await user.click(screen.getByRole("radio", { name: /100 mg/ }));
    expect(screen.getByRole("checkbox", { name: /^Strength/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: /Name and brand/ })).toHaveTextContent("Entresto 100");

    await user.click(screen.getByRole("checkbox", { name: /What it is for/ }));
    expect(screen.getByRole("checkbox", { name: /What it is for/ })).toHaveAttribute("aria-checked", "false");

    await user.click(screen.getByRole("button", { name: "Apply to form" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const ctx = onApply.mock.calls[0]![0] as ApplyContext;
    expect(ctx.groups).toEqual(["names", "strength", "appearance", "food"]);
    expect(ctx.option?.label).toBe("100 mg");

    expect(screen.getByText("Filled in from AI lookup")).toBeInTheDocument();
    expect(
      screen.getByText("Name and brand, strength, shape and colour, food instruction. Check each field against your box."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show result" }));
    expect(screen.getByText("Found: Sacubitril/valsartan")).toBeInTheDocument();
  });

  it("compact: looks up the form's name, offers one group and 'Use this'", async () => {
    const fetchFn = vi.fn(async () => json(ENTRESTO));
    vi.stubGlobal("fetch", fetchFn);
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(<Host compact groups={["appearance"]} fallbackQuery="Entresto" onApply={onApply} />);

    expect(screen.queryByLabelText("Medicine name or brand")).not.toBeInTheDocument();
    expect(screen.getByText("Entresto")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Look up with AI" }));
    const call = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect((JSON.parse(String(call[1].body)) as { query: string }).query).toBe("Entresto");

    expect(await screen.findByText("Shape, colour and markings:")).toBeInTheDocument();
    // Details stay folded until asked for.
    expect(screen.queryByText("Brands")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show all details" }));
    expect(screen.getByText("Brands")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Use this" }));
    expect((onApply.mock.calls[0]![0] as ApplyContext).groups).toEqual(["appearance"]);
  });

  it("a group unticked on the first step can still be used on a later single-group step", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(ENTRESTO)));
    const onApply = vi.fn();
    const user = userEvent.setup();
    // The wizard shares one lookup across its steps and swaps the groups.
    function Steps() {
      const lookup = useMedicineLookup();
      const [later, setLater] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setLater(true)}>Next step</button>
          <MedicineLookupPanel
            lookup={lookup}
            groups={later ? ["appearance"] : ["names", "strength", "appearance"]}
            compact={later}
            fallbackQuery="Entresto"
            onApply={onApply}
          />
        </>
      );
    }
    render(<Steps />);
    await lookUp(user, "Entresto 100");
    await user.click(await screen.findByRole("checkbox", { name: /Shape, colour and markings/ }));
    await user.click(screen.getByRole("button", { name: "Apply to form" }));
    expect((onApply.mock.calls[0]![0] as ApplyContext).groups).toEqual(["names", "strength"]);

    await user.click(screen.getByRole("button", { name: "Next step" }));
    await user.click(screen.getByRole("button", { name: "Show result" }));
    // One group: no checkbox to tick again, so it must be usable as it is.
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    const use = screen.getByRole("button", { name: "Use this" });
    expect(use).toBeEnabled();
    await user.click(use);
    expect((onApply.mock.calls[1]![0] as ApplyContext).groups).toEqual(["appearance"]);
  });

  it("compact with no name yet: the lookup is disabled", () => {
    render(<Host compact groups={["appearance"]} />);
    expect(screen.getByText(/Enter the medicine name on step 1 first/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Look up with AI" })).toBeDisabled();
  });

  it("explains groups this host can't fill in", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(ENTRESTO)));
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(
      <Host
        groups={["generic", "compounds", "indication", "food"]}
        unavailable={{ food: "Set the food instruction on the Schedule tab" }}
        onApply={onApply}
      />,
    );
    await lookUp(user, "Entresto");
    const food = await screen.findByRole("checkbox", { name: /Food instruction/ });
    expect(food).toHaveAttribute("aria-disabled", "true");
    expect(food).toHaveTextContent("Set the food instruction on the Schedule tab");
    await user.click(food);
    expect(food).toHaveAttribute("aria-checked", "false");
    await user.click(screen.getByRole("radio", { name: /50 mg/ }));
    await user.click(screen.getByRole("button", { name: "Apply to form" }));
    await waitFor(() => expect(onApply).toHaveBeenCalled());
    expect((onApply.mock.calls[0]![0] as ApplyContext).groups).toEqual(["generic", "compounds", "indication"]);
  });
});
