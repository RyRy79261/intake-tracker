// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockAuthGate, mockPrescriptions, mockInventory, apiFetchSpy, mutateAsyncSpy } = vi.hoisted(() => ({
  mockAuthGate: vi.fn(() => true),
  mockPrescriptions: vi.fn(),
  mockInventory: vi.fn(() => [] as unknown[]),
  apiFetchSpy: vi.fn(),
  mutateAsyncSpy: vi.fn(async (_: unknown) => {}),
}));

vi.mock("@/components/auth-guard", () => ({ useAuthGate: () => mockAuthGate() }));
vi.mock("@/lib/api-fetch", () => ({ apiFetch: apiFetchSpy }));
vi.mock("@/hooks/use-medication-queries", () => ({
  usePrescriptions: () => mockPrescriptions(),
  useInventoryForPrescription: () => mockInventory(),
  useUpdatePrescription: () => ({ mutateAsync: mutateAsyncSpy }),
}));

import { AboutMedicineView } from "@/components/medications/about-medicine-view";
import { renderWithProviders } from "@/__tests__/react-test-utils";
import { makeInventoryItem, makePrescription } from "@/__tests__/fixtures/db-fixtures";
import type { Prescription } from "@/lib/db";

const CHECKED = new Date(2026, 8, 20, 12).getTime();

const info = {
  fetchedAt: new Date(2026, 8, 28, 12).getTime(),
  drugClass: "ACE inhibitor (a medicine that makes blood vessels wider).",
  compounds: [
    {
      name: "Ramipril",
      drugClass: "ACE inhibitor (a medicine that makes blood vessels wider)",
      forText: "High blood pressure and heart failure.",
      howItWorks: "It relaxes your blood vessels.",
      sideEffects: ["Dry cough", "Dizziness"],
    },
  ],
  warnings: [{ risk: "Your face or throat can swell.", whatToDo: "Get emergency help immediately." }],
  contraindications: ["Do not take it if you are pregnant."],
  foodInstruction: "none" as const,
  foodNote: "You can take it with or without food.",
  pillDescription: "Capsule or tablet.",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let rx: Prescription;
let furo: Prescription;

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => value });
}

beforeEach(() => {
  mockAuthGate.mockReturnValue(true);
  rx = makePrescription({ id: "rx-ra", genericName: "Ramipril" });
  furo = makePrescription({ id: "rx-fu", genericName: "Furosemide" });
  mockPrescriptions.mockImplementation(() => [rx, furo]);
  mockInventory.mockReturnValue([]);
  apiFetchSpy.mockReset();
  mutateAsyncSpy.mockClear();
  setOnline(true);
});

afterEach(() => setOnline(true));

function renderView(p: Prescription = rx, onBack = vi.fn()) {
  return { onBack, ...renderWithProviders(<AboutMedicineView prescription={p} onBack={onBack} />) };
}

describe("AboutMedicineView — empty states", () => {
  it("signed in, nothing stored: offers the AI lookup and says what is sent", () => {
    renderView();
    expect(screen.getByRole("heading", { name: "About this medicine" })).toBeInTheDocument();
    expect(screen.getByText("Look up this medicine with AI")).toBeInTheDocument();
    expect(screen.getByText(/It sends only the name: Ramipril/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check interactions" })).toBeEnabled();
    expect(screen.getByText(/AI information can be wrong/)).toBeInTheDocument();
  });

  it("signed out, nothing stored: no lookup, a sign-in link instead", () => {
    mockAuthGate.mockReturnValue(false);
    renderView();
    expect(screen.getByText("No information stored yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth");
    expect(screen.queryByRole("button", { name: /Look up with AI/ })).toBeNull();
    expect(screen.getByText(/No interaction check stored/)).toBeInTheDocument();
  });

  it("no other active prescriptions: the check button says so and is disabled", () => {
    mockPrescriptions.mockImplementation(() => [rx]);
    renderView();
    expect(screen.getByText("You have no other active prescriptions to check against.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add more prescriptions to check interactions" })).toBeDisabled();
  });

  it("Back returns to the Rx grid", async () => {
    const user = userEvent.setup();
    const { onBack } = renderView();
    await user.click(screen.getByRole("button", { name: "Back to Rx" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("AboutMedicineView — stored information", () => {
  it("renders every section of a stored answer, normalising pulled nulls", () => {
    rx = {
      ...rx,
      // A pulled row: nulls where a local write left fields out.
      medicineInfo: { ...info, visualIdentification: null, compounds: [{ ...info.compounds[0]!, howItWorks: null }] } as never,
    };
    mockInventory.mockReturnValue([
      makeInventoryItem("rx-ra", { brandName: "Tritace", strength: 5, unit: "mg", visualIdentification: "HMN 5" }),
    ]);
    renderView();

    expect(screen.getByText(/Updated 28 Sep 2026/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(screen.getByText("What it is")).toBeInTheDocument();
    expect(screen.getByText("High blood pressure and heart failure.")).toBeInTheDocument();
    expect(screen.queryByText("How it works")).toBeNull();
    expect(screen.getByText("Dry cough")).toBeInTheDocument();
    expect(screen.getByText("Your face or throat can swell.")).toBeInTheDocument();
    expect(screen.getByText("Get emergency help immediately.")).toBeInTheDocument();
    expect(screen.getByText("Do not take it if you are pregnant.")).toBeInTheDocument();
    expect(screen.getByText("You can take it with or without food.")).toBeInTheDocument();
    expect(screen.getByText("Tritace")).toBeInTheDocument();
    expect(screen.getByText(/marked HMN 5/)).toBeInTheDocument();
  });

  it("a combination shows one card per compound", () => {
    rx = {
      ...rx,
      genericName: "Sacubitril/Valsartan",
      medicineInfo: {
        ...info,
        compounds: [
          { ...info.compounds[0]!, name: "Sacubitril" },
          { ...info.compounds[0]!, name: "Valsartan" },
        ],
      },
    };
    renderView();
    expect(screen.getByText("2 compounds in each tablet")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sacubitril" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Valsartan" })).toBeInTheDocument();
  });

  it("signed out with a stored answer: shows it, but no Refresh", () => {
    mockAuthGate.mockReturnValue(false);
    rx = { ...rx, medicineInfo: info };
    renderView();
    expect(screen.getByText("High blood pressure and heart failure.")).toBeInTheDocument();
    expect(screen.getByText("Sign in to refresh")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
  });
});

describe("AboutMedicineView — lookup", () => {
  it("loading, then saves the answer on the prescription", async () => {
    const user = userEvent.setup();
    let resolve!: (r: Response) => void;
    apiFetchSpy.mockReturnValueOnce(new Promise<Response>((r) => { resolve = r; }));
    renderView();

    await user.click(screen.getByRole("button", { name: /Look up with AI/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Looking up Ramipril");
    const [url, init] = apiFetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/ai/medicine-about");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ genericName: "Ramipril" });

    await act(async () => resolve(jsonResponse({ ...info, fetchedAt: undefined })));
    await waitFor(() => expect(mutateAsyncSpy).toHaveBeenCalledTimes(1));
    const saved = mutateAsyncSpy.mock.calls[0]![0] as { id: string; updates: { medicineInfo: { fetchedAt: number } } };
    expect(saved.id).toBe("rx-ra");
    expect(saved.updates.medicineInfo.fetchedAt).toBeGreaterThan(0);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("Refresh re-runs the lookup for a stored answer", async () => {
    const user = userEvent.setup();
    rx = { ...rx, medicineInfo: info };
    apiFetchSpy.mockResolvedValueOnce(jsonResponse(info));
    renderView();

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(mutateAsyncSpy).toHaveBeenCalledTimes(1));
  });

  it("Cancel aborts the request and stores nothing", async () => {
    const user = userEvent.setup();
    let signal: AbortSignal | undefined;
    apiFetchSpy.mockImplementationOnce((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise((_, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });
    renderView();

    await user.click(screen.getByRole("button", { name: /Look up with AI/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(signal?.aborted).toBe(true);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mutateAsyncSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Look up with AI/ })).toBeInTheDocument();
  });

  it("offline: says so without calling the route", async () => {
    const user = userEvent.setup();
    setOnline(false);
    renderView();

    await user.click(screen.getByRole("button", { name: /Look up with AI/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("You are offline");
    expect(apiFetchSpy).not.toHaveBeenCalled();
  });

  it("a route failure shows an error and keeps the lookup button", async () => {
    const user = userEvent.setup();
    apiFetchSpy.mockResolvedValueOnce(jsonResponse({ error: "AI service unavailable" }, 502));
    renderView();

    await user.click(screen.getByRole("button", { name: /Look up with AI/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The AI service did not answer");
    expect(screen.getByRole("button", { name: /Look up with AI/ })).toBeInTheDocument();
    expect(mutateAsyncSpy).not.toHaveBeenCalled();
  });

  it("no match: points at the generic name", async () => {
    const user = userEvent.setup();
    apiFetchSpy.mockResolvedValueOnce(jsonResponse({ error: "none", code: "NOT_FOUND" }, 404));
    renderView();

    await user.click(screen.getByRole("button", { name: /Look up with AI/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/No information was found for “Ramipril”/);
  });
});

describe("AboutMedicineView — interactions", () => {
  const check = {
    checkedAt: CHECKED,
    medications: ["Furosemide"],
    summary: "You can take these together, but take care.",
    rows: [
      { medication: "Furosemide", severity: "CAUTION" as const, description: "Both lower blood pressure." },
    ],
  };

  it("shows the stored rows and checked date; not stale while the list matches", () => {
    rx = { ...rx, interactionCheck: check };
    renderView();
    expect(screen.getByText(check.summary)).toBeInTheDocument();
    expect(screen.getByText("Checked 20 Sep 2026")).toBeInTheDocument();
    expect(screen.getByText("With Furosemide")).toBeInTheDocument();
    expect(screen.getByText("CAUTION")).toBeInTheDocument();
    expect(screen.queryByText("Your medicines changed")).toBeNull();
    expect(screen.getByRole("button", { name: "Check interactions again" })).toBeInTheDocument();
  });

  it("stale banner when the other active prescriptions changed", () => {
    rx = { ...rx, interactionCheck: check };
    const spiro = makePrescription({ id: "rx-sp", genericName: "Spironolactone" });
    mockPrescriptions.mockImplementation(() => [rx, furo, spiro]);
    renderView();
    expect(screen.getByText("Your medicines changed")).toBeInTheDocument();
  });

  it("a Not assessed row is labelled NOT ASSESSED, not CAUTION", () => {
    rx = {
      ...rx,
      interactionCheck: {
        ...check,
        rows: [{ medication: "Furosemide", severity: "CAUTION", description: "Not assessed: no result.", notAssessed: true }],
      },
    };
    renderView();
    expect(screen.getByText("NOT ASSESSED")).toBeInTheDocument();
    expect(screen.queryByText("CAUTION")).toBeNull();
  });

  it("checking stores the structured result and the legacy strings", async () => {
    const user = userEvent.setup();
    apiFetchSpy.mockResolvedValueOnce(
      jsonResponse({
        interactions: [
          { substance: "Ramipril", medication: "Furosemide", severity: "CAUTION", description: "Both lower blood pressure." },
        ],
        drugClass: "ACE inhibitor",
        summary: "Take care.",
      }),
    );
    renderView();

    await user.click(screen.getByRole("button", { name: "Check interactions" }));
    await waitFor(() => expect(mutateAsyncSpy).toHaveBeenCalledTimes(1));
    const { updates } = mutateAsyncSpy.mock.calls[0]![0] as {
      updates: { interactionCheck: { medications: string[]; rows: unknown[] }; warnings: string[]; contraindications: string[] };
    };
    expect(updates.interactionCheck.medications).toEqual(["Furosemide"]);
    expect(updates.interactionCheck.rows).toHaveLength(1);
    expect(updates.warnings).toEqual(["Drug class: ACE inhibitor", "Furosemide: Both lower blood pressure."]);
    expect(updates.contraindications).toEqual([]);
  });

  it("offline check: says so", async () => {
    const user = userEvent.setup();
    setOnline(false);
    renderView();
    await user.click(screen.getByRole("button", { name: "Check interactions" }));
    expect(screen.getByRole("alert")).toHaveTextContent("You are offline");
    expect(apiFetchSpy).not.toHaveBeenCalled();
  });

  it("an older flat-string check still shows until the next check", () => {
    rx = { ...rx, contraindications: ["Furosemide: old text"], warnings: [] };
    renderView();
    expect(screen.getByText("Furosemide: old text")).toBeInTheDocument();
  });
});
