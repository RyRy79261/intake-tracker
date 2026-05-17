// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockUseAuthGate = vi.fn();
vi.mock("@/components/auth-guard", () => ({
  useAuthGate: () => mockUseAuthGate(),
}));
// VoicePanel is only rendered inside the Sheet when open=true, so we
// don't need to drive it here — stub to keep the test focused.
vi.mock("@/components/experimental/voice-panel", () => ({
  VoicePanel: () => null,
}));

import { VoiceLaunchBar } from "./voice-launch-bar";

describe("VoiceLaunchBar — auth gating", () => {
  beforeEach(() => {
    mockUseAuthGate.mockReset();
  });

  it("renders the mic launch button when authGate is open", () => {
    mockUseAuthGate.mockReturnValue(true);

    render(<VoiceLaunchBar hidden={false} hasQuickNav={false} />);

    // The bar has a single button (open the voice panel).
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders nothing when authGate is closed (signed out OR not approved)", () => {
    mockUseAuthGate.mockReturnValue(false);

    const { container } = render(
      <VoiceLaunchBar hidden={false} hasQuickNav={false} />
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
