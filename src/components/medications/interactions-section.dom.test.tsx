// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";

const mockUseAuthGate = vi.fn();
const mockUsePrescriptions = vi.fn();

vi.mock("@/components/auth-guard", () => ({
  useAuthGate: () => mockUseAuthGate(),
}));
vi.mock("@/hooks/use-medication-queries", () => ({
  usePrescriptions: () => mockUsePrescriptions(),
}));
vi.mock("@/hooks/use-interaction-check", () => ({
  useRefreshInteractions: () => ({ refresh: vi.fn(), isRefreshing: false }),
}));

import { InteractionsSection } from "./interactions-section";
import { renderWithProviders } from "@/__tests__/react-test-utils";
import type { Prescription } from "@/lib/db";

const baseRx: Prescription = {
  id: "p_1",
  brandName: "Brand",
  genericName: "Generic",
  indication: "test",
  isActive: true,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

describe("InteractionsSection — gating", () => {
  beforeEach(() => {
    mockUseAuthGate.mockReset();
    mockUsePrescriptions.mockReset();
    mockUsePrescriptions.mockReturnValue([baseRx]);
  });

  it("with stored data: shows interactions + Refresh button when gate is open", () => {
    mockUseAuthGate.mockReturnValue(true);
    const rx: Prescription = {
      ...baseRx,
      contraindications: ["Avoid grapefruit"],
      warnings: ["Caution: drowsiness"],
    };

    renderWithProviders(<InteractionsSection prescription={rx} />);

    expect(screen.getByText("Avoid grapefruit")).toBeInTheDocument();
    expect(screen.getByText("Caution: drowsiness")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /refresh|add more/i })
    ).toBeInTheDocument();
  });

  it("with stored data + gate closed: keeps stored data, hides Refresh button", () => {
    // The user can still see what was already fetched, but can't kick a
    // new AI lookup. This is a deliberate trade-off — historical data is
    // local-only at this point.
    mockUseAuthGate.mockReturnValue(false);
    const rx: Prescription = {
      ...baseRx,
      contraindications: ["Avoid grapefruit"],
    };

    renderWithProviders(<InteractionsSection prescription={rx} />);

    expect(screen.getByText("Avoid grapefruit")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /refresh|add more/i })
    ).not.toBeInTheDocument();
  });

  it("no stored data + gate closed: renders nothing (no empty AI-only state)", () => {
    mockUseAuthGate.mockReturnValue(false);

    const { container } = renderWithProviders(
      <InteractionsSection prescription={baseRx} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("no stored data + gate open: shows the empty state with a Refresh CTA", () => {
    mockUseAuthGate.mockReturnValue(true);

    renderWithProviders(<InteractionsSection prescription={baseRx} />);

    expect(screen.getByText(/no interaction data yet/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /refresh|add more/i })
    ).toBeInTheDocument();
  });
});
