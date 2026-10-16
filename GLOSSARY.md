# Glossary

Domain words used in code, reviews and plans. Use these names exactly.

**Drink**: one thing the user drank. It is stored as one water row (intake `type: "water"`) with the full drink volume, plus any caffeine or alcohol record and any sugar, sodium or potassium rows. All rows share one `groupId` and one time. The Drink module (`apps/web/src/lib/drink-service.ts`) is the only code that logs, edits or deletes a drink.

**Drink group**: the rows of one drink. A group is a drink when it has exactly one live water row and no live meal (eating) row. No field marks it; the Drink module decides.

**Dose**: a caffeine or alcohol record with no water row, for example a caffeine pill or a voice "caffeine" item with no volume. A dose is not a drink.

**Meal water**: the water content of a meal, stored as a water row in the meal's group. Its time moves the whole meal; its other values belong to the Food card.

**Strength**: the amount of a substance per volume of a drink. When a drink's volume changes, its strength stays the same, so caffeine, sugar, sodium and potassium change with the volume. ABV is already a strength.

**AI task**: one server-side Claude request type, such as a food parse or an interaction check. Each AI route declares an AI task spec (request schema, prompt, result tool, tier, token budget, search rule) in its `task.ts`; the AI task module (`apps/web/src/app/api/ai/_shared/ai-task.ts`) runs it and answers every failure from one error table.

**Tier**: how much model an AI task gets (`quality` or `premium`). The tier policy in the AI task module turns it into the model, the effort and the request rules.
