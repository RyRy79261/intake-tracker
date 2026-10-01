// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const auth = { authenticated: true };
vi.mock("@/components/auth-guard", () => ({
  useAuth: () => ({
    ready: true,
    authenticated: auth.authenticated,
    user: auth.authenticated ? { id: "u1", email: "a@b.c", name: "A" } : null,
  }),
  useAuthGate: () => auth.authenticated,
}));

const keys = { anthropic: true, groq: true };
vi.mock("@/hooks/use-ai-keys", () => ({
  useApiKeyStatus: () => ({
    data: {
      anthropic: { configured: keys.anthropic },
      groq: { configured: keys.groq },
    },
  }),
}));

const apiFetch = vi.fn();
vi.mock("@/lib/api-fetch", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  isCapacitorMode: () => false,
}));

vi.mock("@/lib/bug-report", () => ({
  collectEnvironmentInfo: () =>
    Promise.resolve([
      { label: "App version", value: "1.38.0" },
      { label: "Timezone", value: "Africa/Johannesburg" },
    ]),
  collectRecentErrorLogs: () =>
    Promise.resolve([{ timestamp: "2026-09-29T08:00:00Z", message: "boom" }]),
}));

vi.mock("@/components/voice/voice-recorder", () => ({
  VoiceRecorder: () => <button type="button">Record</button>,
}));

import { ReportBugDialog } from "@/components/report-bug-dialog";
import { renderWithProviders } from "@/__tests__/react-test-utils";

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) };
}

async function openDialog(onOpenChange = vi.fn()) {
  renderWithProviders(<ReportBugDialog open onOpenChange={onOpenChange} />);
  const dialog = await screen.findByRole("dialog", { name: "Report a bug" });
  // Diagnostics load asynchronously; the count appears once they have.
  await within(dialog).findByText(/env fields/);
  return dialog;
}

describe("ReportBugDialog", () => {
  beforeEach(() => {
    auth.authenticated = true;
    keys.anthropic = true;
    keys.groq = true;
    apiFetch.mockReset();
    push.mockReset();
  });
  afterEach(cleanup);

  it("switches between bug and feature wording", async () => {
    const user = userEvent.setup();
    const dialog = await openDialog();
    const group = within(dialog).getByRole("radiogroup", { name: "Report type" });
    expect(within(group).getByRole("radio", { name: "Bug" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(dialog).getByLabelText("What went wrong?")).toBeInTheDocument();

    await user.click(within(group).getByRole("radio", { name: "Feature" }));

    expect(
      screen.getByRole("dialog", { name: "Request a feature" }),
    ).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: "Feature" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      within(dialog).getByLabelText("What would you like to see?"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/as a feature request/)).toBeInTheDocument();
  });

  it("swaps the Dictate button for the recorder box", async () => {
    const user = userEvent.setup();
    const dialog = await openDialog();
    expect(within(dialog).queryByTestId("bug-dictation")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Dictate instead" }));

    const box = within(dialog).getByTestId("bug-dictation");
    expect(within(box).getByText(/words are added to the text above/)).toBeInTheDocument();
    expect(within(box).getByRole("button", { name: "Record" })).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Dictate instead" }),
    ).not.toBeInTheDocument();
  });

  it("hides dictation and Improve with AI when signed out", async () => {
    auth.authenticated = false;
    const dialog = await openDialog();
    expect(
      within(dialog).queryByRole("button", { name: "Dictate instead" }),
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Improve with AI/)).not.toBeInTheDocument();
    // The rest of the form still works signed out.
    expect(within(dialog).getByRole("button", { name: "Submit report" })).toBeInTheDocument();
    expect(within(dialog).getByTestId("bug-manual-box")).toBeInTheDocument();
  });

  it("shows Improve with AI, on by default, when signed in with a key", async () => {
    const dialog = await openDialog();
    expect(within(dialog).getByRole("switch", { name: /Improve with AI/ })).toBeChecked();
  });

  it("opens and closes the attached-diagnostics disclosure", async () => {
    const user = userEvent.setup();
    const dialog = await openDialog();
    const toggle = within(dialog).getByRole("button", { name: /What will be attached/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("(2 env fields, 1 log entries)");
    expect(within(dialog).queryByTestId("bug-diagnostics")).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const diag = within(dialog).getByTestId("bug-diagnostics");
    expect(within(diag).getByText("Timezone")).toBeInTheDocument();
    expect(within(diag).getByText("Africa/Johannesburg")).toBeInTheDocument();
    expect(diag).toHaveTextContent("1 recent error-log entry will be attached");

    await user.click(toggle);
    expect(within(dialog).queryByTestId("bug-diagnostics")).not.toBeInTheDocument();
  });

  it("files the report: Filing… while busy, then the issue number", async () => {
    const user = userEvent.setup();
    let resolve!: (v: unknown) => void;
    apiFetch.mockImplementation(() => new Promise((r) => (resolve = r)));
    const dialog = await openDialog();

    const submit = within(dialog).getByRole("button", { name: "Submit report" });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText("What went wrong?"), "It broke");
    expect(submit).toBeEnabled();

    await user.click(submit);

    const busy = await within(dialog).findByRole("button", { name: "Filing…" });
    expect(busy).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    const [url, init] = apiFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/bug-report");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ type: "bug", description: "It broke", useAi: true });

    resolve(jsonResponse({ url: "https://github.com/o/r/issues/412", number: 412 }));

    const done = await screen.findByRole("dialog", { name: "Report filed" });
    expect(within(done).getByText(/was created on GitHub/)).toHaveTextContent(
      "Issue #412 was created on GitHub.",
    );
    expect(within(done).getByRole("link", { name: /View issue #412/ })).toHaveAttribute(
      "href",
      "https://github.com/o/r/issues/412",
    );
  });

  it("sends useAi false when signed out", async () => {
    const user = userEvent.setup();
    auth.authenticated = false;
    apiFetch.mockResolvedValue(jsonResponse({ url: "https://x/1", number: 1 }));
    const dialog = await openDialog();
    await user.type(within(dialog).getByLabelText("What went wrong?"), "x");
    await user.click(within(dialog).getByRole("button", { name: "Submit report" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const body = JSON.parse(String((apiFetch.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.useAi).toBe(false);
  });

  it("Open the manual closes the dialog and goes to /help", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const dialog = await openDialog(onOpenChange);
    await user.click(within(dialog).getByRole("button", { name: "Open the manual" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(push).toHaveBeenCalledWith("/help");
  });
});
