import assert from "node:assert/strict";
import test from "node:test";

import { mean, median, percentile } from "../lib/stats.js";

test("mean of a small sample", () => {
  assert.equal(mean([2, 4, 6]), 4);
});

test("median of an odd sample", () => {
  assert.equal(median([9, 1, 5]), 5);
});

test("median of an even sample", () => {
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

test("p0 is the minimum", () => {
  assert.equal(percentile([3, 1, 2], 0), 1);
});

test("p50 of one through ten", () => {
  assert.equal(percentile([10, 9, 8, 7, 6, 5, 4, 3, 2, 1], 50), 5);
});

test("p100 is the maximum", () => {
  assert.equal(percentile([4, 8, 15, 16, 23, 42], 100), 42);
});
