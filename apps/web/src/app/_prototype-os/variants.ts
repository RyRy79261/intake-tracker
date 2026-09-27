// PROTOTYPE (throwaway): 404 OS look for the home screen, switch with ?variant=
// Three variants of the home route "/" in camp-404's 404 OS look, plus the
// app as it is today ("current", the default). All use the real cards.

export const VARIANTS = [
  { key: "current", name: "Current app" },
  { key: "A", name: "Phone desktop" },
  { key: "B", name: "Window stack" },
  { key: "C", name: "Terminal" },
] as const;

export type VariantKey = (typeof VARIANTS)[number]["key"];

export function toVariant(raw: string | null): VariantKey {
  return VARIANTS.find((v) => v.key === raw)?.key ?? "current";
}

/** Vercel previews and local builds show the prototype; production never. */
export const PROTOTYPE_ENABLED =
  process.env.NEXT_PUBLIC_VERCEL_ENV !== "production";
