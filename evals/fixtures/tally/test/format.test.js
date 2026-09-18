import assert from "node:assert/strict";
import test from "node:test";

import { formatSummary } from "../lib/format.js";

test("summary line", () => {
  assert.equal(formatSummary([1, 2, 3, 4]), "n=4 mean=2.5 p50=2.5");
});
