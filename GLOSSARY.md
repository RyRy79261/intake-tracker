# Glossary

Domain words used in code, reviews and plans. Use these names exactly.

**Drink**: one thing the user drank. It is stored as one water row (intake `type: "water"`) with the full drink volume, plus any caffeine or alcohol record and any sugar, sodium or potassium rows. All rows share one `groupId` and one time. The Drink module (`apps/web/src/lib/drink-service.ts`) is the only code that logs, edits or deletes a drink.

**Drink group**: the rows of one drink. A group is a drink when it has exactly one live water row and no live meal (eating) row. No field marks it; the Drink module decides.

**Dose**: a caffeine or alcohol record with no water row, for example a caffeine pill or a voice "caffeine" item with no volume. A dose is not a drink.

**Meal water**: the water content of a meal, stored as a water row in the meal's group. Its time moves the whole meal; its other values belong to the Food card.

**Strength**: the amount of a substance per volume of a drink. When a drink's volume changes, its strength stays the same, so caffeine, sugar, sodium and potassium change with the volume. ABV is already a strength.

**Logical day**: a day in the user's zone that starts at `dayStartHour` (default 02:00), so a drink at 01:30 counts toward the evening before. `packages/core/src/logical-day.ts`.

**Daily Totals**: today's (and this week's) total per metric against its target, from `packages/core/src/daily-totals.ts`. The Today gadget, the Liquids header, the Food card and the MCP today summary all show its output. A record dated after now does not count yet.

**Target status**: where a total sits against its target. `ok` at or under the target, `extended` past it but inside the buffer, `over` past target + buffer (or past the target with no buffer), `none` with no target. Past the target the app shows the buffer used against the buffer's size ("200 / 500 ml extra").

**AI task**: one server-side Claude request type, such as a food parse or an interaction check. Each AI route declares an AI task spec (request schema, prompt, result tool, tier, token budget, search rule) in its `task.ts`; the AI task module (`apps/web/src/app/api/ai/_shared/ai-task.ts`) runs it and answers every failure from one error table.

**Tier**: how much model an AI task gets (`quality` or `premium`). The tier policy in the AI task module turns it into the model, the effort and the request rules.

**Voice item**: one thing a voice log holds: a blood pressure reading, a weight, water, sodium, food, a caffeine or alcohol drink, a urination or a defecation. The voice item contract (`packages/core/src/voice-items.ts`) is the one place that says each kind's fields, units, ranges and which are required; the route's Zod schema, the parse tool's fields, the item types and the review check are built from it.

**Parsed entry**: a voice item, or the Food card's detail form, about to be saved. The parsed-entry logger (`apps/web/src/lib/parsed-entry-service.ts`) is the only code that turns one into records: it picks the records, tags their source, rounds amounts to whole numbers and applies the sugar and potassium trackers. Drinks go through the Drink module.
