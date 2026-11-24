// Moving an ad earlier or later in the play order (the ↑ ↓ buttons on the
// dashboard's Running now list). Screens play ads by sort_order, so a move
// is a change of sort_order on as few rows as possible.
//
// `ads` is the list as shown, already in play order. Returns the rows to
// save as [{ id, sort_order }]; empty when the move goes nowhere.
export function moveAd(ads, index, delta) {
  const to = index + delta;
  if (!ads[index] || to < 0 || to >= ads.length || delta === 0) return [];
  const a = ads[index];
  const b = ads[to];

  // Usual case, neighbours with their own numbers: swap the two.
  const numbers = ads.map((ad) => ad.sort_order);
  const distinct =
    numbers.every((n) => Number.isFinite(n)) && new Set(numbers).size === numbers.length;
  if (distinct) {
    return [
      { id: a.id, sort_order: b.sort_order },
      { id: b.id, sort_order: a.sort_order },
    ];
  }

  // Ties or gaps in the numbering (older ads): number the shown list afresh
  // from its lowest value, in the new order, saving only what changed.
  const order = ads.slice();
  [order[index], order[to]] = [order[to], order[index]];
  const start = Math.min(...numbers.filter((n) => Number.isFinite(n)), 0);
  return order
    .map((ad, i) => ({ id: ad.id, sort_order: start + i, was: ad.sort_order }))
    .filter((row) => row.sort_order !== row.was)
    .map(({ id, sort_order }) => ({ id, sort_order }));
}
