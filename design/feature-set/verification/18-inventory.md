# Verification — 18-inventory

**Verdict:** minor-gaps  ·  checked 78 claims, verified 75.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | "`prescription-service.ts` seeds an `\"initial\"`/refill `\"Initial stock\"` transaction when a prescription is created with `currentStock > 0`" (line 136). The `"initial"` alternative is misleading. | Seed transaction is created with type `"refill"` (note `"Initial stock"`) — never type `"initial"`. No code path ever writes a `type: "initial"` transaction. | `prescription-service.ts:98` (`buildTransaction(inventory.id, input.currentStock, "refill", now, "Initial stock")`) |
| low | "Editable types: `refill`, `adjusted` only" / `consumed`/`initial` rows are "system-generated"/"immutable" (lines 99, 149, 87). Implies `initial` is a real, occurring transaction type that rows render. | `type: "initial"` exists in the union (`db.ts:262`) and the row label maps it to "Initial" (`inventory-item-view-drawer.tsx:295`), but no service ever produces an `initial` transaction. The "Initial" label and its non-editability are dead branches in practice. Not wrong about behavior, but the doc presents `initial` as a live state. | `db.ts:262`; `inventory-item-view-drawer.tsx:295`; no producer anywhere in `src/lib` |
| low | "**Note trimming.** Refill note trimmed; empty trimmed note is omitted… Transaction edit… note" — doc groups refill + edit note handling (lines 62, 153). | Refill form trims (`refillNote.trim()`) and omits empty (`inventory-item-view-drawer.tsx:211-212`). Transaction EDIT does NOT trim — it uses raw truthiness `editNote ? { note: editNote } : {}` (`:249`), so a whitespace-only edit note would be stored. Doc's "trimmed" wording only holds for the refill path. | `inventory-item-view-drawer.tsx:211-212` (trim) vs `:249` (no trim on edit) |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| medium | **`BrandSwitchPicker` is a second path to set the active brand** (deactivate current, activate selected), reached via the "Switch Brand" button on the expanded card. The doc treats Manage-tab "Set as active brand" as the only active-switch UI and only names the button in passing. | `brand-switch-picker.tsx:36,48,56`; entry button `compound-card-expanded.tsx:257-267` |
| low | **`untakeDose`/`skipDose`/`rescheduleDose` write reversing `consumed` transactions** that RESTORE stock (positive amount, `+pillsConsumed`), not only the negative deduction on take. Doc line 37 only mentions the negative `consumed` deduction on dose-take. | `dose-log-service.ts:356-376` (untake), `:425-445` (skip from taken), `:496-516` (reschedule from taken) |
| low | **Inventory sort in the list row:** active brand first, then alphabetical by `brandName`; archived items filtered out of the list entirely. Doc describes the Low/Active/negative rendering but not the sort/archive-filter of the row list. | `compound-card-expanded.tsx:49-55` |
| low | **`getCurrentStock(id)` read-only derivation** (sums all transactions incl. soft-deleted — it does NOT filter `deletedAt`) underlies `recalculateStockForItem`/`recalculateAllStock`. Doc describes the recalc engine but omits that the base derivation sums every transaction without a `deletedAt` filter (unlike the edit/delete recalc paths which DO filter). | `inventory-service.ts:267-275` (no `deletedAt` filter) vs `:186-191`/`:233-235` (filtered) |
| low | **`debug-panel.tsx` exposes a manual "recalculate all stock" trigger** (calls `recalculateAllStock()`), a second invocation site beyond app-launch `initStockRecalculation()`. | `debug-panel.tsx:7,297` |
| low | **`getInventoryTransactions` returns soft-deleted rows too** — the service does NOT filter `deletedAt`; the drawer component filters them out at render (`transactions.filter(tx => tx.deletedAt === null)`). Doc's data-model "Reads" line implies the read is already non-deleted. | `inventory-service.ts:38-46` (no filter); UI filter `inventory-item-view-drawer.tsx:227` |

## Spot-confirmed

- Stock readout `{item.currentStock ?? 0}` large number, default 0; "pills" suffix — `inventory-item-view-drawer.tsx:178`.
- Days-of-supply math exactly as documented: `dailyDosage = Σ dosage × (daysOfWeek.length/7)`, `dailyPills = dailyDosage/strength`, `Math.floor(currentStock/dailyPills)`; `Infinity` (rendered `∞`) unless effectivePhase && schedules.length>0 && strength>0 && dailyPills>0 — `inventory-item-view-drawer.tsx:164-171,182`.
- Low badge: `refillAlertPills !== undefined && stock <= refillAlertPills && stock >= 0`, amber `bg-amber-500` — `compound-card-expanded.tsx:88-91,140-144`.
- Negative stock: no clamp (`adjustStock` comment "Negative stock allowed per user decision"), rendered red+medium in list row — `inventory-service.ts:132-133`; `compound-card-expanded.tsx:92,131-137`.
- Fractional formatting: `isFractional = stock % 1 !== 0` → `formatPillCount` else `N pills` — `compound-card-expanded.tsx:93-96`.
- `formatPillCount` glyphs ¼/½/¾ (singular "tablet"), whole+frac combine, else decimal fallback (e.g. `0.1 tablets`) — `medication-ui-utils.ts:61-83`.
- Refill: `adjustStock(itemId, amount, note?, "refill")`, default `30`, `step="any"`, `parseFloat||0`, disabled when pending or `refillAmount <= 0`, resets to 30/"" on success, teal-600 button, `Plus`/`Loader2` — `inventory-item-view-drawer.tsx:159,196-219`.
- `adjustStock` default type when omitted: `delta > 0 ? "refill" : "consumed"` — `inventory-service.ts:143`.
- Transaction edit recalc substitutes edited amount for the edited row; delete recalc excludes the deleted row; both filter `deletedAt === null`; 4-decimal rounding `Math.round(x*10000)/10000` — `inventory-service.ts:186-196,233-240,274`.
- Delete confirm string `"Delete this transaction? Stock will be recalculated."`; only `refill`/`adjusted` editable (`isEditable`) — `inventory-item-view-drawer.tsx:245,255`.
- Set-active: two sequential awaited updates (deactivate prior active non-archived sibling ≠ self, then activate self) — `inventory-item-view-drawer.tsx:342-350`.
- Archive toggles `isArchived`; archiving an active brand also sets `isActive:false`; `destructive`/`outline` variants; `Archive`/`ArchiveRestore` icons — `:384-402`.
- Permanent delete only when archived; `confirm("Permanently delete this medicine? This cannot be undone.")` → `deleteInventoryItem` → close drawer — `:404-421`.
- Header: brand + (`formatCompoundShort` for combo else `${strength}${unit}`); subtitle `For {genericName}` + ` · Active brand`/` · Not active` + ` · Archived` — `:46-55`.
- Tabs `details`/`inventory`/`manage` labelled "Details"/"Stock"/"Manage", default `details` — `:59-65`.
- Not-active callout text verbatim — `:186-191`.
- Titration vs maintenance badge: "On titration" (amber) / "Maintenance" (blue) keyed on `effectivePhase.type === "titration"`; "Doses are measured in {unit}"; else "No active schedule for this prescription." — `:131-147`.
- `PillShape = "round"|"oval"|"capsule"|"diamond"|"tablet"` — `db.ts:136`.
- `InventoryTransaction.type = "refill"|"consumed"|"adjusted"|"initial"`; `doseLogId?` links consumed tx — `db.ts:262-263`.
- Audit actions `inventory_added`/`inventory_adjusted`/`inventory_deleted`/`stock_recalculated` all in `AuditAction` union — `db.ts:43,50,51,52`; `inventory_adjusted` reused for item update, adjustStock, tx update, tx delete — `inventory-service.ts:88,150,199,243`.
- Drift threshold `Math.abs(oldStock - newStock) > 0.001` — `inventory-service.ts:320`.
- `initStockRecalculation()` fire-and-forget on launch in providers — `providers.tsx:58`.
- Auto-consumption on take: active item, `-pillsConsumed`, `type:"consumed"`, `doseLogId`, decrements stock — `dose-log-service.ts:276-303`.
- PillIcon sizes 40 (Details) / 24 (list row) — `inventory-item-view-drawer.tsx:96`; `compound-card-expanded.tsx:108`.
- Live re-resolution: `siblings.find(i => i.id === item.id) ?? item`; returns `null` when `item` null — `inventory-item-view-drawer.tsx:37-39`.
- Empty-medicines "No medicines added yet" — `compound-card-expanded.tsx:83`.
- History omitted when `transactions.length === 0` — `inventory-item-view-drawer.tsx:223`.
- Amount color: `amount > 0` → emerald + `+`, else red — `:296-297`.
- Sync: every mutation `enqueueInsideTx` + `schedulePush()`; soft-delete enqueues `"delete"` op — `inventory-service.ts:107,159,226,251`.
- Server mirror tables `inventoryItems`/`inventoryTransactions` present — `db/schema.ts:442,536`.
- `refillAlertDays`/`refillAlertPills` set in add-medication wizard — `add-medication-wizard.tsx:289-290,309-310`.

## Low-confidence / could-not-verify

- Doc line 8 calls the hooks "React Query / live-query hooks": reads use Dexie `useLiveQuery`, mutations use TanStack `useMutation` — accurate as worded, just worth flagging the split (`use-medication-queries.ts:78-132` reads vs `:268-299` mutations). Not an inaccuracy.
- Doc line 89 "No toast surfaced in this component (mutations resolve silently)" — confirmed no toast import in the drawer; cannot rule out a global toast fired elsewhere in the mutation chain, but none observed in `inventory-service.ts`.
