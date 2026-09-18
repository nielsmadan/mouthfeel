export function mean(values) {
  assertSample(values);
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function median(values) {
  assertSample(values);
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function percentile(values, p) {
  assertSample(values);
  if (p < 0 || p > 100) throw new RangeError(`percentile out of range: ${p}`);
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[rank];
}

function assertSample(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new RangeError("empty sample");
  }
}
