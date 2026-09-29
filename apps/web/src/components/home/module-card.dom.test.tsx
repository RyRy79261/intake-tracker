// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";

import { WhenLabel } from "@/components/home/module-card";
import { RecentEntriesList } from "@/components/recent-entries-list";
import { useSettingsStore } from "@/stores/settings-store";

/**
 * Home stays mounted all day under the Ward windows, and the Weight/BP cards
 * read through live queries with no clock tick. The day prefix must still
 * appear once the logical-day boundary passes, or a reading from 23:10 looks
 * like it was taken today.
 */
describe("day prefix rolls over at the logical-day boundary", () => {
  const loggedAt = new Date(2026, 8, 27, 23, 10).getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 27, 23, 30));
    useSettingsStore.setState({ dayStartHour: 2 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("WhenLabel gains the Yest prefix without a data change", () => {
    render(
      <span data-testid="when">
        <WhenLabel timestamp={loggedAt} />
      </span>,
    );
    expect(screen.getByTestId("when")).toHaveTextContent(/^23:10$/);

    // 23:30 -> 02:31, past dayStartHour (02:00).
    act(() => {
      vi.advanceTimersByTime(3 * 60 * 60_000 + 60_000);
    });
    expect(screen.getByTestId("when")).toHaveTextContent(/^Yest 23:10$/);
  });

  it("RecentEntriesList rows gain the Yest prefix without a data change", () => {
    render(
      <RecentEntriesList
        records={[{ id: "a", timestamp: loggedAt }]}
        onDelete={() => {}}
        deletingId={null}
      />,
    );
    expect(screen.getByTestId("recent-entry")).not.toHaveTextContent("Yest");

    act(() => {
      vi.advanceTimersByTime(3 * 60 * 60_000 + 60_000);
    });
    expect(screen.getByTestId("recent-entry")).toHaveTextContent("Yest");
  });
});
