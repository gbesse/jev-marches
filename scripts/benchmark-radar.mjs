#!/usr/bin/env node
// Objectif : mesurer le contrat Marchés Radar sur un jeu versionné, avec Jev réel ou un transport synthétique explicite.
import { readFile } from "node:fs/promises";
import { buildOpportunityRadar } from "../src/index.mjs";
import { createFakeProvider, createJevClient } from "../src/jev.mjs";

const offline = process.argv.includes("--offline");
const dataset = JSON.parse(
  await readFile(new URL("../benchmarks/radar-v1.json", import.meta.url), "utf8"),
);

const responseFor = (expected) => ({
  model: "jev-1.13.0",
  answers: {
    fit: {
      type: "score",
      score: expected === "pursue" ? 2.8 : expected === "ignore" ? 0.5 : 1.8,
      probabilities:
        expected === "pursue"
          ? { 0: 0.01, 1: 0.03, 2: 0.12, 3: 0.84 }
          : expected === "ignore"
            ? { 0: 0.7, 1: 0.25, 2: 0.04, 3: 0.01 }
            : { 0: 0.1, 1: 0.25, 2: 0.55, 3: 0.1 },
      legend: { 0: "nul", 1: "faible", 2: "plausible", 3: "fort" },
      confidence: expected === "investigate" ? 0.6 : 0.84,
    },
    blocker: {
      type: "choice",
      choice: expected === "investigate" ? "unknown" : "none",
      probabilities:
        expected === "investigate"
          ? {
              none: 0.2,
              deadline: 0.05,
              qualification: 0.1,
              geography: 0.05,
              capacity: 0.1,
              unknown: 0.5,
            }
          : {
              none: 0.95,
              deadline: 0.01,
              qualification: 0.01,
              geography: 0.01,
              capacity: 0.01,
              unknown: 0.01,
            },
      confidence: expected === "investigate" ? 0.5 : 0.94,
    },
  },
  usage: { input_tokens: 0, output_tokens: 0 },
});

const casesById = new Map(dataset.cases.map((entry) => [entry.id, entry]));
const provider = offline
  ? createFakeProvider(({ state }) => responseFor(casesById.get(state.notice.id).expected))
  : createJevClient();
const results = [];
for (const entry of dataset.cases) {
  const notice = {
    id: entry.id,
    kind: "procurement-notice",
    buyer: "Acheteur public",
    deadline: "2099-12-31T12:00:00.000Z",
    descriptors: [],
    sourceUrl: `https://www.boamp.fr/pages/avis/?q=idweb:${entry.id}`,
    source: "BOAMP · benchmark public",
    ...entry.notice,
  };
  const radar = await buildOpportunityRadar(
    [notice],
    dataset.profiles[entry.profile],
    provider,
    {
      maxCalls: 1,
      maxResults: 1,
      now: new Date("2026-10-04T00:00:00.000Z"),
    },
  );
  const actual = radar.decisions[0].status;
  results.push({
    id: entry.id,
    expected: entry.expected,
    actual,
    correct: actual === entry.expected,
    deterministic: radar.decisions[0].assessment.deterministic,
    fit: radar.decisions[0].assessment.fit ?? null,
    confidence: radar.decisions[0].assessment.fitConfidence ?? 1,
    strongMass: radar.decisions[0].assessment.fitStrongProbability ?? null,
    weakMass: radar.decisions[0].assessment.fitWeakProbability ?? null,
    blocker: radar.decisions[0].assessment.blocker ?? null,
    blockerProbability:
      radar.decisions[0].assessment.blockerProbability ?? null,
    reason: radar.decisions[0].reason,
    requests: radar.usage.requests,
    inputTokens: radar.usage.input_tokens,
  });
}
const positives = results.filter((row) => row.actual === "pursue");
const report = {
  dataset: "radar-v1",
  mode: offline ? "synthetic-contract-check" : "jev-1.13.0",
  caveat: offline
    ? "Les réponses sont dérivées des libellés : ce mode vérifie le harnais, pas la qualité du modèle."
    : "Jeu synthétique de cas évidents ; ce résultat ne mesure pas encore la précision sur le trafic BOAMP réel.",
  cases: results.length,
  accuracy: results.filter((row) => row.correct).length / results.length,
  falseIgnoreRate:
    results.filter((row) => row.expected !== "ignore" && row.actual === "ignore")
      .length / results.filter((row) => row.expected !== "ignore").length,
  pursuePrecision: positives.length
    ? positives.filter((row) => row.expected === "pursue").length /
      positives.length
    : null,
  requests: results.reduce((total, row) => total + row.requests, 0),
  inputTokens: results.reduce((total, row) => total + row.inputTokens, 0),
  results,
};
console.log(JSON.stringify(report, null, 2));
if (results.some((row) => !row.correct)) process.exitCode = 2;
