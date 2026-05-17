import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";

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
