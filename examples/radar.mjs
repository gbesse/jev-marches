// Objectif : produire une inbox Marchés Radar complète sans réseau ni appel payant.
import assert from "node:assert/strict";
import {
  buildOpportunityRadar,
  renderOpportunityRadar,
} from "../src/index.mjs";
import { createFakeProvider } from "../src/jev.mjs";

const provider = createFakeProvider(({ state }) => {
  const relevant = state.notice.id === "api-ville";
  return {
    model: "jev-1.13.0",
    answers: {
      fit: {
        type: "score",
        score: relevant ? 2.85 : 1.6,
        probabilities: relevant
          ? { 0: 0.01, 1: 0.03, 2: 0.06, 3: 0.9 }
          : { 0: 0.1, 1: 0.3, 2: 0.5, 3: 0.1 },
        legend: { 0: "nul", 1: "faible", 2: "plausible", 3: "fort" },
        confidence: relevant ? 0.9 : 0.5,
      },
      blocker: {
        type: "choice",
        choice: "none",
        probabilities: {
          none: 0.94,
          deadline: 0.01,
          qualification: 0.01,
          geography: 0.01,
          capacity: 0.01,
          unknown: 0.02,
        },
        confidence: 0.92,
      },
    },
    usage: { input_tokens: 180, output_tokens: 0 },
  };
});

const base = {
  kind: "procurement-notice",
  buyer: "Ville de démonstration",
  deadline: "2099-12-31T12:00:00.000Z",
  departments: ["75"],
  contractTypes: ["SERVICES"],
  source: "BOAMP · démonstration hors ligne",
  sourceUrl: "https://www.boamp.fr/pages/avis/",
};
const radar = await buildOpportunityRadar(
  [
    {
      ...base,
      id: "api-ville",
      title: "Développement et maintenance d’API territoriales",
      text: "Conception, développement et maintenance d’API Node.js.",
      descriptors: ["Informatique", "API"],
    },
    {
      ...base,
      id: "route",
      title: "Réfection d’une route départementale",
      text: "Travaux de voirie et terrassement.",
      descriptors: ["Travaux routiers"],
    },
    {
      ...base,
      id: "late",
      title: "Audit de sécurité urgent",
      text: "Audit de sécurité.",
      deadline: "2020-01-01T00:00:00.000Z",
      descriptors: ["Cybersécurité"],
    },
  ],
  {
    capabilities:
      "Développement d’API Node.js, intégration de données et maintenance applicative.",
    departments: ["75", "92"],
    contractTypes: ["SERVICES"],
    minimumLeadDays: 14,
  },
  provider,
  { maxCalls: 2, now: new Date("2026-10-04T00:00:00.000Z") },
);

assert.deepEqual(radar.counts, { pursue: 1, investigate: 1, ignore: 1 });
assert.equal(radar.budget.usedCalls, 2);
console.log(renderOpportunityRadar(radar, { companyName: "API Démo" }));
