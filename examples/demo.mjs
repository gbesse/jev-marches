// Purpose: Demonstrate public-contract triage with synthetic notices.
import { rankNotices } from "../src/index.mjs";
import { createFakeProvider } from "../src/jev.mjs";
const p = createFakeProvider(() => ({
  model: "jev-1.13.0",
  answers: {
    fit: {
      type: "score",
      score: 3,
      probabilities: { 0: 0.01, 1: 0.04, 2: 0.15, 3: 0.8 },
      legend: { 0: "none", 1: "weak", 2: "plausible", 3: "strong" },
      confidence: 0.8,
    },
    blocker: {
      type: "choice",
      choice: "none",
      probabilities: {
        none: 0.9,
        deadline: 0.02,
        qualification: 0.02,
        geography: 0.02,
        capacity: 0.02,
        unknown: 0.02,
      },
      confidence: 0.9,
    },
  },
  usage: { input_tokens: 130, output_tokens: 0 },
}));
console.log(
  await rankNotices(
    [
      {
        id: "BOAMP-DEMO-1",
        title: "Build a municipal API",
        cpv: ["72000000"],
        deadline: "2099-12-31",
      },
    ],
    { capabilities: ["API development"], cpv: ["72000000"] },
    p,
  ),
);
