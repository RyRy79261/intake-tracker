// PROTOTYPE (throwaway): 404 OS look for the home screen, switch with ?variant=
// Six variants of the home route "/" (F the existing look as apps; A-C in camp-404's 404 OS look, D-E a
// calm clinical app-with-windows skin), plus the
// app as it is today ("current", the default). All use the real cards.

export const VARIANTS = [
  { key: "current", name: "Current app" },
  { key: "F", name: "Existing look, as apps" },
  { key: "A", name: "Phone desktop" },
  { key: "B", name: "Window stack" },
  { key: "C", name: "Terminal" },
  { key: "D", name: "Medical OS" },
  { key: "E", name: "Widget board" },
] as const;

export type VariantKey = (typeof VARIANTS)[number]["key"];

export function toVariant(raw: string | null): VariantKey {
  return VARIANTS.find((v) => v.key === raw)?.key ?? "current";
}

/** Vercel previews and local builds show the prototype; production never. */
export const PROTOTYPE_ENABLED =
  process.env.NEXT_PUBLIC_VERCEL_ENV !== "production";
