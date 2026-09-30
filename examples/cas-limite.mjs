// Cas limite : une échéance dépassée est filtrée avant toute décision Jev.
import assert from "node:assert/strict";
import { prefilter } from "../src/index.mjs";

const resultat = prefilter(
  {
    id: "BOAMP-EXPIRE",
    title: "Maintenance informatique",
    deadline: "2026-01-15",
  },
  { capabilities: ["Maintenance informatique"] },
  new Date("2026-09-30"),
);
assert.equal(resultat.eligible, false);
assert.equal(resultat.reason, "deadline_passed");
console.log(JSON.stringify(resultat, null, 2));
