import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import { useSettingsStore, type Settings } from "@/stores/settings-store";
import { seedDatabase, type SeedSpec } from "@/__tests__/fixtures/scenarios";

/**
 * Builds a QueryClient with retries disabled and no caching so each test
 * starts clean. Use a fresh client per test to avoid bleed.
 */
export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

interface WrapperOptions {
  queryClient?: QueryClient;
}

export function renderWithProviders(
  ui: ReactNode,
  options: WrapperOptions & Omit<RenderOptions, "wrapper"> = {}
) {
  const { queryClient = makeTestQueryClient(), ...renderOptions } = options;

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return {
    queryClient,
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  };
}

interface FixturesOptions
  extends WrapperOptions,
    Omit<RenderOptions, "wrapper"> {
  /** Fixture rows to bulk-insert into the test database before rendering. */
  seed?: SeedSpec;
  /** Settings-store overrides applied on top of the default settings. */
  settings?: Partial<Settings>;
}

/**
 * Renders a component the way the real app would see it: a scoped React Query
 * client, the settings store reset to a known baseline, and the test database
 * pre-seeded with fixtures. This lets a self-fetching component (a dashboard
 * card, a list view) run its real hooks against real data — no per-hook
 * mocking required.
 *
 * `await` it: seeding the database is asynchronous.
 */
export async function renderWithFixtures(
  ui: ReactNode,
  options: FixturesOptions = {}
) {
  const { seed, settings, queryClient, ...renderOptions } = options;

  // The settings store persists to localStorage and survives between tests in
  // a file, so reset it to defaults for a deterministic starting point.
  useSettingsStore.getState().resetToDefaults();
  if (settings) useSettingsStore.setState(settings);

  if (seed) await seedDatabase(seed);

  return renderWithProviders(ui, {
    ...renderOptions,
    ...(queryClient ? { queryClient } : {}),
  });
}
