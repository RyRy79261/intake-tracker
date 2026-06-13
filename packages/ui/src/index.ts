/**
 * @intake/ui — shared shadcn/ui primitives + design-system tokens (Tailwind v4).
 *
 * Primitives are also exposed as granular subpaths (e.g. `@intake/ui/button`),
 * which is how apps/web imports them (via the @/components/ui/* shims). This
 * flat barrel is the package-level convenience surface.
 */
export { cn } from "./lib/utils";

export * from "./components/accordion";
export * from "./components/alert-dialog";
export * from "./components/badge";
export * from "./components/button";
export * from "./components/card";
export * from "./components/checkbox";
export * from "./components/collapsible";
export * from "./components/command";
export * from "./components/dialog";
export * from "./components/drawer";
export * from "./components/inline-edit";
export * from "./components/input";
export * from "./components/label";
export * from "./components/numeric-input";
export * from "./components/popover";
export * from "./components/progress";
export * from "./components/scroll-area";
export * from "./components/select";
export * from "./components/sheet";
export * from "./components/skeleton";
export * from "./components/switch";
export * from "./components/tabs";
export * from "./components/textarea";
export * from "./components/toast";
export * from "./components/toaster";

export * from "./hooks/use-toast";
export * from "./hooks/use-now-tick";
