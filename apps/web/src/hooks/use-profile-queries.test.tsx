// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";

import { useUserProfile, useSaveProfile } from "@/hooks/use-profile-queries";
import { makeTestQueryClient } from "@/__tests__/react-test-utils";
import { seedDatabase } from "@/__tests__/fixtures/scenarios";
import { makeUserProfile } from "@/__tests__/fixtures/db-fixtures";
import { db } from "@/lib/db";

function wrapper({ children }: { children: ReactNode }) {
  const client = makeTestQueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useUserProfile", () => {
  it("returns a blank profile when no profile row exists", () => {
    const { result } = renderHook(() => useUserProfile(), { wrapper });
    expect(result.current.id).toBe("");
    expect(result.current.conditions).toEqual([]);
  });

  it("surfaces the seeded profile's conditions once the live query resolves", async () => {
    await seedDatabase({
      userProfile: [
        makeUserProfile({
          conditions: ["Hypertension", "Type 2 Diabetes"],
          shareConditionsWithAI: true,
        }),
      ],
    });

    const { result } = renderHook(() => useUserProfile(), { wrapper });

    await waitFor(() =>
      expect(result.current.conditions).toEqual([
        "Hypertension",
        "Type 2 Diabetes",
      ]),
    );
    expect(result.current.shareConditionsWithAI).toBe(true);
    expect(result.current.id).not.toBe("");
  });
});

describe("useSaveProfile", () => {
  it("upserts the profile to IndexedDB and normalizes conditions", async () => {
    const { result } = renderHook(() => useSaveProfile(), { wrapper });

    await result.current.mutateAsync({
      conditions: ["  Asthma  ", "asthma", "Migraine"],
      shareConditionsWithAI: true,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const rows = await db.userProfile.toArray();
    expect(rows).toHaveLength(1);
    // normalizeConditions trims and dedupes case-insensitively.
    expect(rows[0]!.conditions).toEqual(["Asthma", "Migraine"]);
    expect(rows[0]!.shareConditionsWithAI).toBe(true);
    expect(result.current.data?.conditions).toEqual(["Asthma", "Migraine"]);
  });

  it("updates an existing profile row in place rather than creating a new one", async () => {
    await seedDatabase({
      userProfile: [makeUserProfile({ conditions: ["Hypertension"] })],
    });

    const { result } = renderHook(() => useSaveProfile(), { wrapper });

    await result.current.mutateAsync({ shareMedicationsWithAI: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const rows = await db.userProfile.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.shareMedicationsWithAI).toBe(true);
    // Untouched fields are preserved.
    expect(rows[0]!.conditions).toEqual(["Hypertension"]);
  });
});
