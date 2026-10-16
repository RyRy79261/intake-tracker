# Glossary

Domain words used in code, reviews and plans. Use these names exactly.

**Drink**: one thing the user drank. It is stored as one water row (intake `type: "water"`) with the full drink volume, plus any caffeine or alcohol record and any sugar, sodium or potassium rows. All rows share one `groupId` and one time. The Drink module (`apps/web/src/lib/drink-service.ts`) is the only code that logs, edits or deletes a drink.

**Drink group**: the rows of one drink. A group is a drink when it has exactly one live water row and no live meal (eating) row. No field marks it; the Drink module decides.

**Dose**: a caffeine or alcohol record with no water row, for example a caffeine pill or a voice "caffeine" item with no volume. A dose is not a drink.

**Meal water**: the water content of a meal, stored as a water row in the meal's group. Its time moves the whole meal; its other values belong to the Food card.

**Strength**: the amount of a substance per volume of a drink. When a drink's volume changes, its strength stays the same, so caffeine, sugar, sodium and potassium change with the volume. ABV is already a strength.

**Synced write**: one change to synced tables, made through `syncedWrite` (`apps/web/src/lib/synced-write.ts`). It stamps `updatedAt`, queues each row it touches with the op the row stands for, retires a tombstone's lifecycle flag, writes audit entries as synced rows, and schedules a push. Services describe the change; they never queue rows themselves.

**Tombstone**: a soft-deleted row (`deletedAt` set). It stays in the table so the deletion syncs, is queued as a "delete", and has its lifecycle flag retired (`isActive: false`, `enabled: false`, or a running status set to `cancelled`).
