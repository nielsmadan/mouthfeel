export const RATING_LABEL = { good: "👍", meh: "😐", bad: "👎", agree: "✓ agreed with Claude" };

export function ratingLabel(rating) {
  return Object.prototype.hasOwnProperty.call(RATING_LABEL, rating) ? RATING_LABEL[rating] : rating;
}

export function stripHistory(item) {
  const copy = Object.assign({}, item);
  delete copy.history;
  return copy;
}

// Feedback saved before the entry's current reply was generated belongs to an
// older output: shown as a read-only comment, never prefilled for editing.
export function feedbackParts(saved, ranAt) {
  const row = saved || {};
  const history = Array.isArray(row.history) ? row.history : [];
  const hasContent = Boolean(row.text || row.rating);
  const stale = Boolean(hasContent && row.updatedAt && ranAt && row.updatedAt < ranAt);
  const past = stale ? history.concat([stripHistory(row)]) : history;
  return { past, current: stale ? {} : row, stale };
}

export function noteIsStale(noteAt, ranAt) {
  return Boolean(noteAt && ranAt && noteAt < ranAt);
}
