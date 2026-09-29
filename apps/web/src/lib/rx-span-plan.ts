/**
 * Which Rx cards span both columns of the 2-column grid (port of the
 * prototype's `spanPlan`).
 *
 * - The expanded card always spans.
 * - When the expanded card would have sat in the right column, the card on
 *   its left is left alone on its row, so it spans too (no half-empty row).
 * - Every other card takes one column; an odd last card simply sits alone.
 *
 * Returns one boolean per id, in order.
 */
export function rxSpanPlan(ids: readonly string[], expandedId: string | null): boolean[] {
  const out = ids.map(() => false);
  let col = 0;
  ids.forEach((id, i) => {
    if (expandedId !== null && id === expandedId) {
      if (col === 1) out[i - 1] = true;
      out[i] = true;
      col = 0;
    } else {
      col = col ? 0 : 1;
    }
  });
  return out;
}
