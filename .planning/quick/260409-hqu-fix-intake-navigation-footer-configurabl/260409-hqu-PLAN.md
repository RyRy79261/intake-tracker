---
quick_id: 260409-hqu
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/quick-nav-defaults.ts
  - src/stores/settings-store.ts
  - src/components/quick-nav-footer.tsx
  - src/components/settings/quick-nav-section.tsx
autonomous: false
requirements:
  - D-01 # 6 root-card footer items (Liquids, Food & Salt, BP, Weight, Urination, Defecation)
  - D-02 # Remove caffeine/alcohol from footer; keep CARD_THEMES untouched
  - D-03 # Drag library: shadcn sortable if available, else motion Reorder (CHOSEN: motion — shadcn sortable NOT in registry)
  - D-04 # Persistence: quickNavItems array in settings-store with enabled+order
  - D-05 # Settings UI: new "Quick Navigation" item list with drag handle + Switch
  - D-06 # Footer hides entirely when zero items enabled
  - D-07 # Migration: existing users get default array on first load

must_haves:
  truths:
    - "Footer shows only the 6 root-card items by default (Liquids, Food & Salt, BP, Weight, Urination, Defecation)"
    - "Footer no longer shows Caffeine or Alcohol icons"
    - "User can toggle any footer item off in Settings > Quick Navigation and it disappears from the footer"
    - "User can drag-reorder footer items in Settings and the footer reflects the new order"
    - "Footer settings (order + enabled state) persist across page refresh via localStorage"
    - "Footer hides entirely (returns null) when zero items are enabled"
    - "CARD_THEMES still contains caffeine/alcohol (used by LiquidsCard tabs) and is not mutated"
  artifacts:
    - path: "src/lib/quick-nav-defaults.ts"
      provides: "DEFAULT_QUICK_NAV_ITEMS constant (6 root items, all enabled)"
      exports: ["DEFAULT_QUICK_NAV_ITEMS", "QuickNavItem"]
    - path: "src/stores/settings-store.ts"
      provides: "quickNavItems field, setter, migration v5"
      contains: "quickNavItems"
    - path: "src/components/quick-nav-footer.tsx"
      provides: "Footer reads from settings.quickNavItems, filters enabled, preserves order"
      contains: "quickNavItems"
    - path: "src/components/settings/quick-nav-section.tsx"
      provides: "New item list with motion Reorder.Group + per-row Switch"
      contains: "Reorder.Group"
  key_links:
    - from: "src/stores/settings-store.ts"
      to: "src/lib/quick-nav-defaults.ts"
      via: "defaultSettings.quickNavItems imports DEFAULT_QUICK_NAV_ITEMS"
      pattern: "DEFAULT_QUICK_NAV_ITEMS"
    - from: "src/components/quick-nav-footer.tsx"
      to: "src/stores/settings-store.ts"
      via: "useSettings().quickNavItems"
      pattern: "quickNavItems"
    - from: "src/components/settings/quick-nav-section.tsx"
      to: "src/stores/settings-store.ts"
      via: "setQuickNavItems setter called from drag end + Switch onCheckedChange"
      pattern: "setQuickNavItems"
---

<objective>
Fix the intake navigation footer so it shows only the 6 root-card items on the main intake screen,
and add a configurable "Quick Navigation" item list in Settings that lets the user drag-reorder
and toggle individual items on/off. Currently the footer iterates all `CARD_THEMES` keys, which
includes `caffeine`, `alcohol`, `water`, `salt`, and `eating` — 9 items, several of which are
not root cards on the page. The fix narrows the footer to the 6 root cards and persists a
user-editable item list (`quickNavItems`) in the settings store.

Purpose: Keep the footer focused on what the user actually uses on the main screen, and give
them control over order/visibility without the maintenance cost of a bespoke order system per item.
Output: Updated footer, new `quickNavItems` field in settings-store with migration, and a new
drag-and-toggle item list in the existing Quick Navigation settings section.

**Drag library decision (D-03):** The planner verified via `npx shadcn@latest search @shadcn -q "sortable"`
and `npx shadcn@latest view @shadcn/sortable` that **no `sortable` component exists in the official shadcn
registry**. Falling back to **`motion/react`** `Reorder.Group` + `Reorder.Item` (already installed via
`motion@^12.29.2`, no new dependency, consistent with the footer's existing use of `motion`).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/quick/260409-hqu-fix-intake-navigation-footer-configurabl/260409-hqu-CONTEXT.md
@./CLAUDE.md

# Current implementation (must be modified)
@src/components/quick-nav-footer.tsx
@src/lib/card-themes.ts
@src/stores/settings-store.ts
@src/app/page.tsx
@src/components/settings/quick-nav-section.tsx
@src/components/ui/switch.tsx

<interfaces>
<!-- Key types the executor needs. No codebase exploration required. -->

From `src/lib/card-themes.ts`:
```typescript
export type CardThemeKey = keyof typeof CARD_THEMES;
// Keys: "water" | "salt" | "weight" | "bp" | "eating" | "urination" | "defecation" | "caffeine" | "alcohol"
// Each entry has: label, icon (LucideIcon), iconBg, iconColor, sectionId
```

From `src/app/page.tsx` (confirms root card sections on main screen, in visual order):
1. `section-water`      → LiquidsCard      → theme key: "water"    → label "Liquids" (override)
2. `section-food-salt`  → FoodSaltCard     → theme key: "eating"   → label "Food & Salt" (override)
3. `section-bp`         → BloodPressureCard → theme key: "bp"       → label "Blood Pressure"
4. `section-weight`     → WeightCard       → theme key: "weight"   → label "Weight"
5. `section-urination`  → UrinationCard    → theme key: "urination" → label "Urination"
6. `section-defecation` → DefecationCard   → theme key: "defecation" → label "Defecation"

**Label overrides needed** because CARD_THEMES labels don't match the on-screen card titles:
- `water` theme label is "Water" → footer should say "Liquids" (matches LiquidsCard)
- `eating` theme label is "Eating" → footer should say "Food & Salt" (matches FoodSaltCard)
The sectionId in CARD_THEMES already matches: `water.sectionId="section-water"`, `eating.sectionId="section-food-salt"`.

From `src/stores/settings-store.ts`:
```typescript
// Current persist version is 4. New field requires version 5 + migration.
// Zustand persist already wired; follow the existing migrate() pattern.
interface Settings { /* ... */ }
const defaultSettings: Settings = { /* ... */ };
```

From `motion` (v12) — drag-reorder API:
```typescript
import { Reorder } from "motion/react";
// <Reorder.Group axis="y" values={items} onReorder={setItems}>
//   {items.map(item => <Reorder.Item key={item.id} value={item}>...</Reorder.Item>)}
// </Reorder.Group>
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add quickNavItems to settings-store with defaults and migration</name>
  <files>
    - src/lib/quick-nav-defaults.ts (NEW)
    - src/stores/settings-store.ts (MODIFY)
  </files>
  <action>
    Per D-01, D-04, D-07:

    **Step 1 — Create `src/lib/quick-nav-defaults.ts`:**

    ```typescript
    import type { CardThemeKey } from "@/lib/card-themes";

    export interface QuickNavItem {
      /** CardThemeKey the item references for icon/color. */
      id: CardThemeKey;
      /** When false, item is hidden from the footer but kept in settings list. */
      enabled: boolean;
    }

    /**
     * Default footer items — one per root card visible on the main intake screen.
     * Order matches the visual order in src/app/page.tsx (top-to-bottom).
     * NOTE: "water" theme is used for the Liquids root card; "eating" theme for the
     * Food & Salt root card. Label overrides for these two keys are applied in
     * quick-nav-footer.tsx so the footer reads "Liquids" / "Food & Salt".
     */
    export const DEFAULT_QUICK_NAV_ITEMS: QuickNavItem[] = [
      { id: "water", enabled: true },      // Liquids
      { id: "eating", enabled: true },     // Food & Salt
      { id: "bp", enabled: true },         // Blood Pressure
      { id: "weight", enabled: true },     // Weight
      { id: "urination", enabled: true },  // Urination
      { id: "defecation", enabled: true }, // Defecation
    ];

    /** Labels overridden for the footer to match on-screen card titles. */
    export const QUICK_NAV_LABEL_OVERRIDES: Partial<Record<CardThemeKey, string>> = {
      water: "Liquids",
      eating: "Food & Salt",
    };
    ```

    **Step 2 — Update `src/stores/settings-store.ts`:**
    - Import `DEFAULT_QUICK_NAV_ITEMS` and `QuickNavItem` from `@/lib/quick-nav-defaults`.
    - Re-export `QuickNavItem` type for convenience: `export type { QuickNavItem } from "@/lib/quick-nav-defaults";`
    - Add to `Settings` interface (place immediately after `quickNavOrder`):
      ```typescript
      // Quick Nav configurable item list (order + enabled state per item)
      quickNavItems: QuickNavItem[];
      ```
    - Add to `SettingsActions` interface:
      ```typescript
      setQuickNavItems: (items: QuickNavItem[]) => void;
      ```
    - Add to `defaultSettings` (immediately after `quickNavOrder`): `quickNavItems: DEFAULT_QUICK_NAV_ITEMS,`
    - Add action inside the `create` body:
      ```typescript
      setQuickNavItems: (items) => set({ quickNavItems: items }),
      ```
    - Bump persist `version: 4` → `version: 5`.
    - Add migration in the `migrate` function (append at end, before the final return):
      ```typescript
      if (version < 5) {
        // D-07: New quickNavItems field. Seed existing users with defaults.
        state.quickNavItems = DEFAULT_QUICK_NAV_ITEMS;
      }
      ```

    Do NOT modify any other existing fields. Keep the existing `showQuickNav` and `quickNavOrder` fields untouched — they remain valid controls orthogonal to the new item list.
  </action>
  <verify>
    <automated>pnpm lint 2>&1 | grep -E "(quick-nav-defaults|settings-store)" || pnpm tsc --noEmit 2>&1 | grep -E "(quick-nav-defaults|settings-store)" || echo "OK: no type/lint errors in modified files"</automated>
  </verify>
  <done>
    - `src/lib/quick-nav-defaults.ts` exists and exports `DEFAULT_QUICK_NAV_ITEMS`, `QuickNavItem`, `QUICK_NAV_LABEL_OVERRIDES`
    - `src/stores/settings-store.ts` has `quickNavItems` field (default = 6 root items, all enabled) and `setQuickNavItems` setter
    - Persist version bumped to 5 with migration seeding `quickNavItems` for pre-v5 users
    - `pnpm lint` passes with no new errors in the two modified files
  </done>
</task>

<task type="auto">
  <name>Task 2: Rewrite quick-nav-footer to read from settings and render configured items</name>
  <files>
    - src/components/quick-nav-footer.tsx (MODIFY)
  </files>
  <action>
    Per D-01, D-02, D-06:

    Rewrite the component so it:
    1. Reads `quickNavItems` from `useSettings()` (via the existing `useSettings` hook — the footer already consumes `settings.showQuickNav` from `page.tsx`; pass `quickNavItems` through as a prop instead so the footer stays a pure presentational component, OR import `useSettings` directly — **match whatever the existing footer does for consistency**. Currently the footer receives `order` as a prop, so follow the same pattern: add a `quickNavItems: QuickNavItem[]` prop).
    2. Removes `buildSectionItems()` and the `SECTION_ITEMS` constant entirely. Do NOT iterate `CARD_THEMES` wholesale anymore.
    3. Builds the render list by mapping `quickNavItems` → `{ theme = CARD_THEMES[item.id] }`, filtering out `enabled === false`.
    4. Applies `QUICK_NAV_LABEL_OVERRIDES` (imported from `@/lib/quick-nav-defaults`) so `water` shows "Liquids" and `eating` shows "Food & Salt" — fall back to `theme.label` for everything else.
    5. Returns `null` when the filtered list is empty (D-06).
    6. Continues to apply the existing `order === "rtl"` reverse logic AFTER filtering (so RTL reversal works against the user's configured order).
    7. Keeps all existing styling, `motion.footer` wrapper, `hidden` prop behavior, and click handler wiring unchanged.

    Update `src/app/page.tsx` to pass `quickNavItems={settings.quickNavItems}` alongside the existing props. Remove the `settings.showQuickNav && ...` guard ONLY if it still makes sense — actually, **keep it**. `showQuickNav` is the master toggle; `quickNavItems` is the per-item list. Both must be respected: if `showQuickNav` is false OR all items disabled, footer is hidden.

    Concrete new prop shape:
    ```typescript
    interface QuickNavFooterProps {
      hidden: boolean;
      order: "ltr" | "rtl";
      transitionDuration?: number;
      quickNavItems: QuickNavItem[]; // NEW
      onScrollTo: (sectionId: string) => void;
    }
    ```

    Inside the component, replace the old `orderedSections` useMemo with:
    ```typescript
    const orderedSections = useMemo(() => {
      const enabled = quickNavItems
        .filter((item) => item.enabled)
        .map((item) => {
          const theme = CARD_THEMES[item.id];
          return {
            id: theme.sectionId,
            icon: theme.icon,
            label: QUICK_NAV_LABEL_OVERRIDES[item.id] ?? theme.label,
            iconColor: theme.iconColor,
            bgColor: theme.iconBg,
          };
        });
      return order === "rtl" ? enabled.reverse() : enabled;
    }, [quickNavItems, order]);

    if (orderedSections.length === 0) return null;
    ```

    Do NOT touch `CARD_THEMES` — caffeine/alcohol themes are still used by LiquidsCard tabs (verified in `src/components/liquids-card.tsx` consumers).
  </action>
  <verify>
    <automated>pnpm lint 2>&1 | grep -E "quick-nav-footer" || pnpm tsc --noEmit 2>&1 | grep -E "(quick-nav-footer|page\.tsx)" || echo "OK: no type/lint errors in footer"</automated>
  </verify>
  <done>
    - `quick-nav-footer.tsx` no longer imports or iterates `Object.keys(CARD_THEMES)`; it maps over `quickNavItems` prop instead
    - Footer returns `null` when no items are enabled
    - Label overrides applied: water→"Liquids", eating→"Food & Salt"
    - `src/app/page.tsx` passes `quickNavItems={settings.quickNavItems}` prop
    - `pnpm lint` and `pnpm tsc --noEmit` produce no new errors
    - Default behavior (fresh localStorage): footer shows 6 items in order Defecation/Urination/Weight/BP/Food & Salt/Liquids (RTL default), no caffeine/alcohol
  </done>
</task>

<task type="auto">
  <name>Task 3: Add drag-reorder + enable/disable item list to Quick Navigation settings section</name>
  <files>
    - src/components/settings/quick-nav-section.tsx (MODIFY)
  </files>
  <action>
    Per D-05:

    Extend the existing `QuickNavSection` component by inserting a new subsection ABOVE the existing "Icon Order" select and animation timings — place it immediately after the "Quick Nav Footer" on/off button (around line 51), inside the `{settings.showQuickNav && (<>...</>)}` conditional so it only shows when the footer is enabled.

    Required imports (add to existing imports at top of file):
    ```typescript
    import { Reorder } from "motion/react";
    import { GripVertical } from "lucide-react";
    import { Switch } from "@/components/ui/switch";
    import { CARD_THEMES } from "@/lib/card-themes";
    import { QUICK_NAV_LABEL_OVERRIDES } from "@/lib/quick-nav-defaults";
    import { cn } from "@/lib/utils";
    ```

    New subsection markup (insert after the Quick Nav Footer on/off row, inside the `{settings.showQuickNav && ...}` block, before the "Icon Order" select):

    ```tsx
    <div className="space-y-2">
      <Label>
        <span className="flex items-center gap-1.5">
          <GripVertical className="w-3.5 h-3.5" />
          Footer Items
        </span>
      </Label>
      <p className="text-xs text-muted-foreground">
        Drag to reorder. Toggle to show/hide in the footer.
      </p>
      <Reorder.Group
        axis="y"
        values={settings.quickNavItems}
        onReorder={settings.setQuickNavItems}
        className="flex flex-col gap-1.5 rounded-lg border bg-background/50 p-2"
      >
        {settings.quickNavItems.map((item) => {
          const theme = CARD_THEMES[item.id];
          const Icon = theme.icon;
          const label = QUICK_NAV_LABEL_OVERRIDES[item.id] ?? theme.label;
          return (
            <Reorder.Item
              key={item.id}
              value={item}
              className={cn(
                "flex items-center gap-3 rounded-md border bg-card px-2 py-1.5",
                "cursor-grab active:cursor-grabbing touch-none select-none",
                !item.enabled && "opacity-50"
              )}
            >
              <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className={cn("p-1 rounded", theme.iconBg)}>
                <Icon className={cn("w-3.5 h-3.5", theme.iconColor)} />
              </div>
              <span className="flex-1 text-sm font-medium">{label}</span>
              <Switch
                checked={item.enabled}
                onCheckedChange={(checked) => {
                  const next = settings.quickNavItems.map((i) =>
                    i.id === item.id ? { ...i, enabled: checked } : i
                  );
                  settings.setQuickNavItems(next);
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </Reorder.Item>
          );
        })}
      </Reorder.Group>
    </div>
    ```

    **Important notes:**
    - `touch-none` on the Reorder.Item is required for mobile drag to work with motion.
    - `onPointerDown` stopPropagation on the Switch is critical — without it the Switch click initiates a drag instead of toggling.
    - Use `cn()` with conditional `opacity-50` for disabled visual state (do NOT write manual template literal ternaries per project's shadcn conventions).
    - Do NOT introduce `space-y-*` classes — use `flex flex-col gap-*` per shadcn styling rules.
    - Do NOT remove or restructure the existing "Icon Order" select or animation timings inputs — only insert the new subsection.

    **Claude's discretion (per CONTEXT.md):** Skip the optional "Reset to default" button for now — keeps scope tight and the existing "Reset to Defaults" at the bottom of the settings page already covers it.
  </action>
  <verify>
    <automated>pnpm lint 2>&1 | grep -E "quick-nav-section" || pnpm tsc --noEmit 2>&1 | grep -E "quick-nav-section" || echo "OK: no type/lint errors in settings section"</automated>
  </verify>
  <done>
    - `QuickNavSection` renders a new "Footer Items" list using `Reorder.Group` from `motion/react`
    - Each row shows drag handle, themed icon, label (with water→Liquids / eating→Food & Salt overrides), and Switch
    - Dragging a row calls `setQuickNavItems` with the new order
    - Toggling a Switch calls `setQuickNavItems` with updated `enabled` flag; clicking the Switch does NOT initiate a drag
    - Disabled rows visually dim (opacity-50)
    - Existing "Icon Order" select and animation timings are untouched
    - `pnpm lint` passes
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Verify footer + settings behavior end-to-end</name>
  <what-built>
    - Footer now shows only the 6 root-card items (Liquids, Food & Salt, BP, Weight, Urination, Defecation) — no more caffeine/alcohol
    - New `quickNavItems` field in settings-store with default and v5 migration
    - New drag-reorder + Switch list in Settings > Quick Navigation > Footer Items
    - Footer hides entirely when zero items are enabled
  </what-built>
  <how-to-verify>
    1. `pnpm dev` and open http://localhost:3000 on a fresh browser profile (or clear `intake-tracker-settings` in localStorage)
    2. Confirm footer shows exactly 6 icons: Liquids, Food & Salt, Blood Pressure, Weight, Urination, Defecation (RTL order by default, so rightmost = Liquids)
    3. Confirm Caffeine and Alcohol are NOT in the footer
    4. Tap each footer icon — should scroll to the correct card
    5. Navigate to /settings → Quick Navigation section → "Footer Items" list should show 6 rows in order: Liquids, Food & Salt, Blood Pressure, Weight, Urination, Defecation
    6. Drag "Weight" above "Blood Pressure" — verify the footer on / updates immediately (go back to main page)
    7. Toggle "Defecation" Switch OFF in settings — verify Defecation disappears from the footer on /
    8. Toggle all 6 Switches OFF — verify the footer disappears entirely (returns null)
    9. Refresh the page — verify order and enabled state persist (check localStorage `intake-tracker-settings` has `quickNavItems` array and `version: 5`)
    10. (Optional) Open DevTools Application > Local Storage, manually edit a v4-shaped state to remove `quickNavItems`, reload — verify migration seeds the defaults
    11. Confirm LiquidsCard tabs (caffeine/alcohol) still work correctly — CARD_THEMES should be unmutated
  </how-to-verify>
  <resume-signal>Type "approved" if all checks pass, or describe any issues found</resume-signal>
</task>

</tasks>

<verification>
Overall phase checks:
- `pnpm lint` passes with no new warnings
- `pnpm tsc --noEmit` passes with no new type errors
- Manual UAT in the human-verify checkpoint above confirms all 6 must-have truths
</verification>

<success_criteria>
- Footer default state matches the 6 root cards (D-01, D-02)
- `quickNavItems` persists across refresh (D-04)
- Drag-reorder works via `motion/react` `Reorder` (D-03)
- Enable/disable via Switch works (D-05)
- Footer hides when all items disabled (D-06)
- Migration v4→v5 seeds defaults for existing users (D-07)
- `CARD_THEMES` unmodified (caffeine/alcohol still available for LiquidsCard tabs)
</success_criteria>

<output>
After completion, create `.planning/quick/260409-hqu-fix-intake-navigation-footer-configurabl/260409-hqu-SUMMARY.md`
</output>
