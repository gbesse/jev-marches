// Purpose: Verify deterministic public-contract filters and scoring.
import test from "node:test";
import assert from "node:assert/strict";
import { prefilter, assessNotice } from "../src/index.mjs";
import { createFakeProvider } from "../src/jev.mjs";
test("rejects expired notices", () =>
  assert.equal(
    prefilter(
      { id: "1", title: "x", deadline: "2020-01-01" },
      {},
      new Date("2026-01-01"),
    ).reason,
    "deadline_passed",
  ));
test("rejects an invalid deadline", () =>
  assert.throws(
    () => prefilter({ id: "1", title: "x", deadline: "not-a-date" }, {}),
    /ISO date/,
  ));
test("scores eligible notice", async () => {
  const p = createFakeProvider(() => ({
    model: "jev-1.13.0",
    answers: {
      fit: {
        type: "score",
        score: 2,
        probabilities: { 0: 0, 1: 0.1, 2: 0.8, 3: 0.1 },
        legend: { 0: "a", 1: "b", 2: "c", 3: "d" },
        confidence: 0.8,
      },
      blocker: {
        type: "choice",
        choice: "none",
        probabilities: {
          none: 1,
          deadline: 0,
          qualification: 0,
          geography: 0,
          capacity: 0,
          unknown: 0,
        },
        confidence: 1,
      },
    },
    usage: { input_tokens: 1, output_tokens: 0 },
  }));
  assert.equal((await assessNotice({ id: "1", title: "x" }, {}, p)).fit, 2);
});
