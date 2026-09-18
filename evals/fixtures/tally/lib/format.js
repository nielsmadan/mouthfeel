import { mean, median } from "./stats.js";

export function formatSummary(values) {
  return `n=${values.length} mean=${round(mean(values))} p50=${round(median(values))}`;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
