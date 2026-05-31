# 18 — Medication Inventory

**Files covered:**
- `src/components/medications/inventory-item-view-drawer.tsx` (the drawer UI: Details / Stock / Manage tabs, transaction rows)
- `src/lib/inventory-service.ts` (CRUD, stock adjustment, transaction edit/delete, stock recalculation)
- `src/lib/medication-builders.ts` (`buildInventory`, `buildTransaction`)
- `src/lib/db.ts` (`InventoryItem`, `InventoryTransaction`, `PillShape`, `CompoundStrength`, audit action types)
- `src/hooks/use-medication-queries.ts` (React Query / live-query hooks for the above)
- `src/components/medications/compound-card-expanded.tsx` (medicine list row with stock text + Low badge — the drawer's entry point)
- Related: `src/lib/dose-log-service.ts` (auto-`consumed` transactions on dose-take), `src/lib/medication-ui-utils.ts` (`formatPillCount`, `getEffectivePhase`), `src/lib/compound-utils.ts` (`isCombo`, `formatCompoundShort/Full`)

**Purpose:** Tracks the physical pill stock for each medicine brand under a prescription: how many pills remain, how many days of supply that represents, when supply is low, and a full ledger of refills/consumption/adjustments. Lets the user log refills, edit/delete past transactions, set the "active" brand that doses deduct from, and archive/delete a brand.

---

## Features

- **Per-brand inventory item.** Each prescription can have multiple `InventoryItem`s (one per pill brand/box). Each carries its own stock, strength, pill appearance, refill thresholds, active flag, and archived flag.
- **Current stock readout.** Shows `currentStock` in pills as a large number (default `0` when undefined). Stock is event-sourced — it is the sum of all non-deleted `InventoryTransaction.amount` values for the item.
- **Estimated days of supply.** Computed live from the prescription's effective phase schedules:
  - `dailyDosage = Σ schedule.dosage × (schedule.daysOfWeek.length / 7)` across all schedules of the effective phase.
  - `dailyPills = dailyDosage / item.strength`.
  - `daysLeft = floor(currentStock / dailyPills)`.
  - If there is no effective phase, no schedules, `item.strength <= 0`, or `dailyPills <= 0`, days-left is `Infinity`, rendered as `∞`.
- **Low-supply badge.** In the medicine list row (compound-card-expanded), a brand shows a `Low` badge (amber) when `refillAlertPills` is defined AND `stock <= refillAlertPills` AND `stock >= 0`.
- **Negative-stock indication.** Stock below 0 is allowed (no clamp) and is rendered in red with medium weight in the list row.
- **Fractional stock formatting.** Whole-number stock renders as `N pills`; fractional stock renders via `formatPillCount` (e.g. `¼ tablet`, `1½ tablets`, `0.1 tablets`).
- **Transaction ledger / history.** Newest-first list of all non-deleted transactions, each showing type label, signed amount (green for positive, red for negative), optional note, and the transaction date.
- **Log refill.** Add a positive-stock transaction (type `refill`) with an amount and optional note; updates `currentStock` and appends to the ledger.
- **Edit a transaction.** Inline-edit the amount and/or note of `refill` or `adjusted` transactions; stock is recalculated from the full transaction set on save.
- **Delete a transaction.** Soft-delete a `refill`/`adjusted` transaction (sets `deletedAt`); stock recalculated excluding it. Requires confirm dialog.
- **Active-brand designation.** Exactly one brand per prescription should be `isActive`; only the active brand's stock is auto-deducted when doses are taken. Setting a brand active deactivates the previously active one.
- **Archive / unarchive a brand.** Archiving hides the brand from the active list but keeps history; archiving an active brand also clears its `isActive`.
- **Permanent delete.** An archived brand can be permanently soft-deleted (sets `deletedAt`), closing the drawer.
- **Pill identity display.** Shows brand name, per-pill strength (or per-pill compound split for combos), pill color (capitalized), pill shape (capitalized + `PillIcon`), and optional markings/visual-identification text.
- **Current dosing summary.** Shows whether the prescription's effective phase is `titration` or `maintenance`, and the dose unit.
- **Auto-consumption from dose logs.** Outside this drawer, taking a dose writes a `consumed` transaction (negative amount, linked via `doseLogId`) against the active inventory item and decrements stock — visible afterward in this ledger.
- **Stock recalculation engine.** `recalculateAllStock()` re-derives every item's cached `currentStock` from its transactions, tracks drift, writes a `stock_recalculated` audit log; `initStockRecalculation()` runs it fire-and-forget on app launch. `recalculateStockForItem(id)` does one item.
- **Audit trail.** Every mutation writes an `auditLogs` entry: `inventory_added`, `inventory_adjusted` (also used for transaction update/delete and stock adjust), `inventory_deleted`, `stock_recalculated`.
- **Sync.** Every write enqueues the affected row(s) into the sync queue and calls `schedulePush()` to mirror to Neon Postgres.

---

## User actions & interactions

**Entry point (medicine list row, compound-card-expanded):**
- **Tap a medicine row** → opens the `InventoryItemViewDrawer` for that brand. Row shows pill icon, brand name, `Active` badge (if active), strength/compound, stock text, `Low` badge (if low), chevron.

**Drawer header:**
- Shows `{brandName} {strength}{unit}` (or compound short form), and a subtitle: `For {genericName}` + ` · Active brand`/` · Not active` + ` · Archived` (if archived).

**Tab navigation (3 tabs, default = Details):**
- **Details** tab — read-only pill identity + current dosing.
- **Stock** tab — current stock, est. supply, refill form, history.
- **Manage** tab — active-brand, archive, delete.

**Stock tab actions:**
- **Type a refill amount** (number input, default `30`, `step="any"`, parsed via `parseFloat`, falls back to `0` on invalid).
- **Type an optional note** (text input, placeholder "Optional note...").
- **Tap "Add"** → calls `adjustStock(itemId, amount, note?, "refill")`. Disabled while pending or when `refillAmount <= 0`. On success resets amount to `30` and clears note. Shows spinner while pending, `+`-plus icon otherwise.
- **Tap edit (pencil) on a transaction row** (only `refill`/`adjusted`) → switches that row into inline edit mode pre-filled with current amount + note.
  - In edit mode: edit amount (number, `step="any"`) and note; **tap "Save"** (teal, spinner while pending) → `updateInventoryTransaction`; **tap "Cancel"** (X) → discards, exits edit mode.
- **Tap delete (trash) on a transaction row** (only `refill`/`adjusted`) → `window.confirm("Delete this transaction? Stock will be recalculated.")`; on confirm → `deleteInventoryTransaction`. Spinner replaces trash icon while pending.

**Manage tab actions:**
- **Tap "Set as active brand"** (only shown when `!isActive && !isArchived`) → deactivates any other active non-archived sibling, then sets this one active. Spinner while pending; otherwise `CheckCircle2` + label.
- **Tap "Archive"/"Unarchive"** → toggles `isArchived`; archiving an active brand also sets `isActive: false`. Button is `destructive` variant when archiving, `outline` when unarchiving. Icons: `Archive` / `ArchiveRestore`.
- **Tap "Delete Permanently"** (only shown when archived) → `confirm("Permanently delete this medicine? This cannot be undone.")`; on confirm → `deleteInventoryItem`, then closes the drawer.
- **Swipe down / tap scrim / drawer close** → `onOpenChange(false)`.

---

## States & presentations

- **Default (Stock tab).** Stock card (left: count in pills; right: est. supply in days), refill form, history list (if any).
- **Loading / pending (per action).** Buttons show `Loader2` spinner and are disabled while their mutation `isPending`: refill Add, transaction Save, transaction Delete (trash → spinner), Set-active, Archive/Unarchive, Delete-Permanently.
- **Live re-resolution.** The drawer re-resolves the item from the live `useInventoryForPrescription` query each render so stock/active/archive stay current after edits even if a stale snapshot was passed in.
- **Empty — no medicines.** List shows "No medicines added yet".
- **Empty — no transactions.** The History section is omitted entirely (rendered only when `transactions.length > 0`).
- **Empty — no schedule.** Details tab shows "No active schedule for this prescription." Est. supply shows `∞`.
- **Not-active brand.** Stock tab shows an info callout: "This brand is not active, so its stock is not deducted when doses are taken. Set it as the active brand from the Manage tab." Header subtitle reads `· Not active`. Manage tab shows the "Set as active brand" block.
- **Active brand.** Header subtitle `· Active brand`; list-row shows emerald `Active` badge; Manage tab hides the "Set as active brand" block.
- **Archived brand.** Header subtitle appends `· Archived`; Manage shows `Unarchive` (outline) + `Delete Permanently` (destructive).
- **Low-supply.** List-row shows amber `Low` badge when `stock <= refillAlertPills` and `stock >= 0`.
- **Negative stock.** Stock text in red/medium weight in the list row; still allowed and displayed (no clamp). Est. supply still computed.
- **Fractional stock.** Rendered with fraction words/glyphs (`½ tablet`, `1¼ tablets`) instead of `N pills`.
- **Transaction edit mode.** Row becomes a 2-input panel (amount + note) with Cancel/Save; non-editable types (`consumed`, `initial`) never enter this state and show no edit/delete buttons.
- **Titration vs maintenance pill.** Details "Current Dosing" badge: amber "On titration" vs blue "Maintenance".
- **Success.** Refill resets the form to `30` / empty note; transaction edit collapses back to the read row; permanent delete closes the drawer. No toast surfaced in this component (mutations resolve silently).
- **Offline / syncing.** Writes complete locally against Dexie immediately; sync queue + `schedulePush()` mirror later — UI is not blocked by network state.

---

## Enums, options & configurable values

- **Tabs:** `details` (label "Details"), `inventory` (label "Stock"), `manage` (label "Manage"). Default tab: `details`.
- **`InventoryTransaction.type`:** `"refill" | "consumed" | "adjusted" | "initial"`.
  - Row labels: `refill` → "Refill", `consumed` → "Consumed", `initial` → "Initial", else → "Adjusted".
  - Editable types: `refill`, `adjusted` only.
- **`PillShape`:** `"round" | "oval" | "capsule" | "diamond" | "tablet"`.
- **`adjustStock` type param:** `"refill" | "consumed" | "adjusted"`; default when omitted is `delta > 0 ? "refill" : "consumed"`.
- **Refill amount input:** default `30`, `step="any"`, must be `> 0` to enable Add.
- **`refillAlertPills`** (optional): low-supply threshold in pills. **`refillAlertDays`** (optional): refill-alert threshold in days (stored; set in the add-medication wizard).
- **Effective-phase resolution order** (`getEffectivePhase`): active titration phase → maintenance phase → first phase with `status === "active"`.
- **Phase type badge:** `titration` ("On titration", amber) / `maintenance` ("Maintenance", blue).
- **Rounding precision:** stock rounded to 4 decimals — `Math.round(x * 10000) / 10000`.
- **Drift threshold (recalc):** an item counts as drifted when `|oldStock - newStock| > 0.001`.
- **Audit action types:** `inventory_added`, `inventory_adjusted`, `inventory_deleted`, `stock_recalculated`.
- **`formatPillCount` glyphs:** `0.25 → ¼`, `0.5 → ½`, `0.75 → ¾` (singular "tablet" for these); whole+frac combine (e.g. `1½ tablets`); other fractions fall back to decimal string.
- **Amount color coding:** positive amount → emerald/green with `+` prefix; non-positive → red.
- **Refill button color:** teal-600 (hover teal-700). Save button: teal-600.

---

## Data model touched

**`InventoryItem`** (`db.ts`, table `inventoryItems`):
- `id`, `prescriptionId`, `brandName`
- `currentStock?` (number; deprecated cache, kept authoritative for display; event-sourced from transactions)
- `strength` (number — the pill-math denominator; for combos = sum of `compounds`)
- `compounds?` (`CompoundStrength[]` — per-pill combo breakdown; descriptive only)
- `unit` (string, e.g. "mg")
- `pillShape` (`PillShape`), `pillColor` (string, hex/name), `visualIdentification?` (markings)
- `refillAlertDays?`, `refillAlertPills?`
- `isActive` (bool), `isArchived?` (bool)
- `createdAt`, `updatedAt`, `deletedAt` (number|null — soft-delete), `deviceId`, `timezone`

**`InventoryTransaction`** (`db.ts`, table `inventoryTransactions`):
- `id`, `inventoryItemId`, `timestamp` (number)
- `amount` (signed number), `note?`
- `type` (enum above), `doseLogId?` (links a `consumed` tx to its dose)
- `createdAt`, `updatedAt`, `deletedAt` (soft-delete), `deviceId`, `timezone`

**Reads:** inventory items for a prescription (`getInventoryForPrescription`), active item (`getActiveInventoryForPrescription`), all items/active items, transactions for an item (newest-first via `sortBy("timestamp")` then `.reverse()`), effective phase + its schedules.
**Writes:** add/update/delete inventory item; adjustStock (item + transaction); update/delete transaction (recalcs item stock); recalc engines. All writes also append to `auditLogs` and enqueue to `_syncQueue`.
**Cross-feature:** `dose-log-service.ts` writes `consumed` transactions and decrements active-item stock on dose-take. `prescription-service.ts` seeds an `"initial"`/refill `"Initial stock"` transaction when a prescription is created with `currentStock > 0`. Server mirror in `src/db/schema.ts` (must stay field-parity).

---

## Validation, edge cases & business rules

- **Negative stock allowed.** `adjustStock` intentionally has no `Math.max(0, …)` clamp ("Negative stock allowed per user decision"). Negative values display in red.
- **Refill requires positive amount.** Add button disabled when `refillAmount <= 0`. Invalid number inputs coerce to `0` via `parseFloat(...) || 0`.
- **Event-sourced stock is source of truth.** `currentStock` is a cache: on transaction edit/delete it is recomputed as the sum of all non-deleted transactions (the edited amount substituted for the edited row; deleted row excluded). `recalculateAllStock` periodically reconciles cache vs derived and logs drift.
- **4-decimal rounding** applied to every computed stock to avoid float drift.
- **Single active brand.** Setting active deactivates the prior active non-archived sibling first (two sequential awaited updates). Archiving an active brand auto-clears `isActive`.
- **Activate only when eligible.** "Set as active brand" shown only when `!isActive && !isArchived`.
- **Permanent delete gated.** Only offered for archived items; double-guarded by `confirm()`.
- **Transaction edit/delete confirms.** Delete uses `window.confirm`; both only available for `refill`/`adjusted` (system-generated `consumed`/`initial` rows are immutable here).
- **Days-of-supply guards.** Returns `∞` unless there's an effective phase, ≥1 schedule, `strength > 0`, and `dailyPills > 0`; uses `Math.floor` (whole days, rounds down). Per-schedule weekly proration via `daysOfWeek.length / 7`.
- **Low badge precondition.** `refillAlertPills` must be set; suppressed for negative stock (`stock >= 0` required).
- **Stale-snapshot safety.** Drawer re-resolves the live item by id; falls back to the passed `item` if not found in the live list. Returns `null` (renders nothing) when `item` is null.
- **Note trimming.** Refill note trimmed; empty trimmed note is omitted from the payload (not stored as empty string).
- **Soft-delete semantics.** Deletes set `deletedAt` and enqueue a `"delete"` sync op; reads filter `deletedAt === null`.
- **Timezone/deviceId** stamped on every transaction/item via `syncFields()`.

---

## Sub-components / variants

- **`InventoryItemViewDrawer`** — top-level bottom drawer (`max-h-[90dvh]`, scrollable) hosting the three tabs; renders header with brand/strength/status.
- **`DetailsTab`** — read-only pill identity card (icon, strength/compound, color, shape, markings) + "Current Dosing" titration/maintenance summary.
- **`InventoryTab`** — current-stock + est-supply card, not-active info callout, "Log Refill" form, "History" transaction list.
- **`TransactionRow`** — single ledger row with read mode (type label, signed colored amount, note, date, edit/delete buttons for editable types) and inline edit mode (amount + note inputs, Save/Cancel).
- **`ManageTab`** — "Active Brand" block (conditional), "Archive Medicine" block (Archive/Unarchive), and conditional "Delete Permanently".
- **`PillIcon`** — renders the pill silhouette from `pillShape` + `pillColor` (sizes 40 in Details, 24 in list row).
- **Compound helpers** — `isCombo`, `formatCompoundShort`, `formatCompoundFull` render combination-tablet strengths (e.g. `49/51mg`).
- **`formatPillCount`** — fractional pill → human-readable tablets string.
- **`getEffectivePhase`** — selects the phase used for dose-unit and days-of-supply math.
