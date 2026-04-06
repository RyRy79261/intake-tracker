# Phase 39: Preset Save-and-Log Label Fix - Research

**Researched:** 2026-04-06
**Status:** Complete

## Research Question

What do we need to know to plan the fix for preset save-and-log creating entries with `preset:manual` instead of `preset:{uuid}`?

## Root Cause Analysis

### The Bug

In `src/components/liquids/preset-tab.tsx`, `handleSaveAndLog` (line 299) calls `addPreset(...)` which internally generates a UUID via `crypto.randomUUID()` at line 267 of `settings-store.ts`. However, `addLiquidPreset` does NOT return the generated ID. The function signature is:

```typescript
addLiquidPreset: (preset: Omit<LiquidPreset, "id">) => void;
```

Immediately after calling `addPreset(...)`, `handleSaveAndLog` calls `buildComposableEntry()` (line 314). Inside `buildComposableEntry` (line 205-273), the `source` field is constructed as:

```typescript
source: `preset:${selectedPresetId ?? "manual"}`
```

During the AI lookup flow, `selectedPresetId` is `null` because:
1. `handleAiLookup` (line 167) explicitly calls `setSelectedPresetId(null)` at line 170
2. No code sets `selectedPresetId` to the new preset's ID after `addPreset` returns

Result: every save-and-log entry gets `source: "preset:manual"`.

### Label Resolution Path

`getLiquidTypeLabel` in `src/lib/utils.ts` (line 52-82):
- `preset:manual` returns `null` (line 78) -- so these entries show no label in history
- `preset:{uuid}` looks up the preset by ID and returns its name (lines 79-82)

All history views (water-tab, record-row, history-drawer, records-tab) already handle `preset:{uuid}` correctly from Phase 37 fixes.

## Fix Options

### Option 1: Return ID from store action (Recommended)

Change `addLiquidPreset` to return the generated UUID:

```typescript
// Current (void return)
addLiquidPreset: (preset: Omit<LiquidPreset, "id">) => void;

// Fixed (returns string)
addLiquidPreset: (preset: Omit<LiquidPreset, "id">) => string;
```

Implementation:
```typescript
addLiquidPreset: (preset) => {
  const id = crypto.randomUUID();
  set((state) => ({
    liquidPresets: [...state.liquidPresets, { ...preset, id }],
  }));
  return id;
},
```

Then in `handleSaveAndLog`:
```typescript
const newId = addPreset({...});
// Use newId for building the entry
```

**Pros:** Minimal change, type-safe, no race conditions
**Cons:** Changes Zustand action return type (but no other callers use the return value)

### Option 2: Pre-generate UUID before calling store

Generate UUID in the component, pass it as part of the preset:

```typescript
const newId = crypto.randomUUID();
addPreset({ ...presetData, id: newId }); // But current type is Omit<..., "id">
```

**Cons:** Requires changing the `Omit<LiquidPreset, "id">` type to allow optional `id`, more surface area

### Option 3: Set selectedPresetId after addPreset

Find the newly added preset by matching name/tab/volume, set selectedPresetId, then call buildComposableEntry.

**Cons:** Fragile -- relies on exact matching; race conditions if presets share names

### Recommendation

Option 1 is cleanest. It requires exactly 2 file changes with minimal surface area.

## Orphaned Code Analysis

### Sodium Preset Exports

After Phase 34 deleted `salt-section.tsx`, the following are orphaned:

**In `settings-store.ts`:**
- `sodiumPresets: SodiumPreset[]` (interface field, line 68)
- `addSodiumPreset` action (interface line 116, impl lines 281-287)
- `deleteSodiumPreset` action (interface line 117, impl lines 288-291)
- `sodiumPresets: DEFAULT_SODIUM_PRESETS` (default value, line 158)
- `SodiumPreset` type re-export (line 10)
- `DEFAULT_SODIUM_PRESETS` import (line 8)

**In `constants.ts`:**
- `SodiumPreset` interface (lines 83-88)
- `DEFAULT_SODIUM_PRESETS` array (lines 90-94)

**Migration concern:** The Zustand persist migration (version < 4, line 332-334) sets `state.sodiumPresets = DEFAULT_SODIUM_PRESETS`. This migration already ran for all existing users upgrading to version 4. Removing the field from defaults does NOT affect existing persisted state -- Zustand `persist` only applies defaults for keys not in storage. The migration code can remain as a no-op safety net (it assigns to a key that will just be ignored), or it can be cleaned up.

**Safe to remove from settings-store.ts:**
- `SodiumPreset` type re-export
- `sodiumPresets` from Settings interface
- `addSodiumPreset` and `deleteSodiumPreset` from SettingsActions interface
- `sodiumPresets` from defaultSettings
- `addSodiumPreset` and `deleteSodiumPreset` implementations
- `DEFAULT_SODIUM_PRESETS` and `SodiumPreset` imports

**Keep in constants.ts:** The `SodiumPreset` interface and `DEFAULT_SODIUM_PRESETS` can stay in constants.ts for now -- they're inert exports that don't affect bundle size meaningfully and may be useful if sodium presets are reintroduced.

## Integration Points

| Component | File | How it connects |
|-----------|------|----------------|
| `buildComposableEntry` | preset-tab.tsx:205-273 | Sets `source` and `groupSource` fields |
| `addLiquidPreset` | settings-store.ts:263-269 | Generates UUID, stores preset |
| `getLiquidTypeLabel` | utils.ts:52-82 | Resolves `preset:{id}` to name |
| `RecentEntriesList` | water-tab.tsx:218-242 | Renders label from getLiquidTypeLabel |
| `useAddComposableEntry` | use-composable-entry.ts | Writes intake/substance records to Dexie |

## Validation Architecture

### Testable Assertions

1. **Unit test:** `addLiquidPreset` returns a valid UUID string
2. **Integration test:** After `handleSaveAndLog`, the created IntakeRecord has `source` matching `preset:{uuid}` where uuid matches the new preset's ID
3. **UI test:** New entry appears in recent entries list with the preset name as label
4. **Negative test:** The entry source is NOT `preset:manual` after save-and-log

### Existing Test Coverage

- E2E tests in `e2e/` cover intake logging but not specifically the save-and-log preset flow
- No unit tests exist for `addLiquidPreset` return value (it currently returns void)

## RESEARCH COMPLETE
