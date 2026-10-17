# Glossary

Domain words used in code, reviews and plans. Use these names exactly.

**Drink**: one thing the user drank. It is stored as one water row (intake `type: "water"`) with the full drink volume, plus any caffeine or alcohol record and any sugar, sodium or potassium rows. All rows share one `groupId` and one time. The Drink module (`apps/web/src/lib/drink-service.ts`) is the only code that logs, edits or deletes a drink.

**Drink group**: the rows of one drink. A group is a drink when it has exactly one live water row and no live meal (eating) row. No field marks it; the Drink module decides.

**Dose**: a caffeine or alcohol record with no water row, for example a caffeine pill or a voice "caffeine" item with no volume. A dose is not a drink.

**Meal water**: the water content of a meal, stored as a water row in the meal's group. Its time moves the whole meal; its other values belong to the Food card.

**Strength**: the amount of a substance per volume of a drink. When a drink's volume changes, its strength stays the same, so caffeine, sugar, sodium and potassium change with the volume. ABV is already a strength.

**Estimate tracker**: a log of events that have a time, an optional amount estimate (small, medium, large) and an optional note. Urination and defecation are the two estimate trackers. Each one is a config in `apps/web/src/lib/estimate-trackers.ts` (table, amounts, labels, default amount setting); one service, one set of hooks, one card and one edit dialog serve both.

**Module**: one of the intake blocks on Home: Today, Liquids, Food, Blood Pressure, Weight, Urination, Defecation. The module list (`apps/web/src/lib/desk-modules.ts`, with each module's content in `components/shell/module-registry.tsx`) sets their order, section ids and quick-link labels for Home, the quick links and the desk windows.

**Voice item**: one thing a voice log holds: a blood pressure reading, a weight, water, sodium, food, a caffeine or alcohol drink, a urination or a defecation. The voice item contract (`packages/core/src/voice-items.ts`) is the one place that says each kind's fields, units, ranges and which are required; the route's Zod schema, the parse tool's fields, the item types and the review check are built from it.

**Parsed entry**: a voice item, or the Food card's detail form, about to be saved. The parsed-entry logger (`apps/web/src/lib/parsed-entry-service.ts`) is the only code that turns one into records: it picks the records, tags their source, rounds amounts to whole numbers and applies the sugar and potassium trackers. Drinks go through the Drink module.
