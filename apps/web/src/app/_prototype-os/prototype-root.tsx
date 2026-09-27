"use client";

// PROTOTYPE (throwaway): 404 OS look for the home screen, switch with ?variant=
// Three variants of the home route "/" in camp-404's 404 OS look, switchable
// via ?variant=A|B|C|D|E|F on the existing route; ?variant=current (or no param)
// is the app as it is. Off on the production deploy: there the param is
// ignored and the switcher never mounts.

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { VariantSwitcher } from "@/app/_prototype-os/switcher";
import { VariantA } from "@/app/_prototype-os/variant-a";
import { VariantB } from "@/app/_prototype-os/variant-b";
import { VariantC } from "@/app/_prototype-os/variant-c";
import { VariantD } from "@/app/_prototype-os/variant-d";
import { VariantE } from "@/app/_prototype-os/variant-e";
import { VariantF } from "@/app/_prototype-os/variant-f";
import { PROTOTYPE_ENABLED, toVariant } from "@/app/_prototype-os/variants";

export function PrototypeHome({ current }: { current: ReactNode }) {
  const params = useSearchParams();
  if (!PROTOTYPE_ENABLED) return <>{current}</>;
  const variant = toVariant(params.get("variant"));
  return (
    <>
      {variant === "current" && current}
      {variant === "A" && <VariantA />}
      {variant === "B" && <VariantB />}
      {variant === "C" && <VariantC />}
      {variant === "D" && <VariantD />}
      {variant === "E" && <VariantE />}
      {variant === "F" && <VariantF />}
      <VariantSwitcher current={variant} />
    </>
  );
}
