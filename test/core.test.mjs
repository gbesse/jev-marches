// Objectif : vérifier les règles déterministes et les décisions sémantiques soumises à revue.
import test from "node:test";
import assert from "node:assert/strict";
import {
  BOAMP_API,
  prefilter,
  assessNotice,
  buildOpportunityRadar,
  decidePursuit,
  fetchBoampNotices,
} from "../src/index.mjs";
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
test("hard gates reject geography, contract type, lead time and explicit buyers without a model call", () => {
  const notice = {
    id: "1",
    title: "Nettoyage",
    buyer: "Ville exemple",
    deadline: "2026-02-01T00:00:00.000Z",
    departments: ["75"],
    contractTypes: ["SERVICES"],
  };
  const now = new Date("2026-01-15T00:00:00.000Z");
  assert.equal(
    prefilter(notice, { minimumLeadDays: 30 }, now).reason,
    "insufficient_lead_time",
  );
  assert.equal(
    prefilter(notice, { departments: ["69"] }, now).reason,
    "geography_out_of_scope",
  );
  assert.equal(
    prefilter(notice, { contractTypes: ["TRAVAUX"] }, now).reason,
    "contract_type_out_of_scope",
  );
  assert.equal(
    prefilter(notice, { excludedBuyers: ["VILLE EXEMPLE"] }, now).reason,
    "buyer_excluded",
  );
});
test("scores eligible notice", async () => {
  const p = createFakeProvider(() => ({
    model: "jev-1.13.0",
    answers: {
      fit: {
        type: "score",
        score: 2.8,
        probabilities: { 0: 0, 1: 0, 2: 0.2, 3: 0.8 },
        legend: { 0: "a", 1: "b", 2: "c", 3: "d" },
        confidence: 0.84,
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
  const result = await assessNotice({ id: "1", title: "x" }, {}, p);
  assert.equal(result.fit, 2.8);
  assert.equal(result.fitConfidence, 0.84);
  assert.equal(result.fitProbability, 0.84);
  assert.deepEqual(result.fitDistribution, { 0: 0, 1: 0, 2: 0.2, 3: 0.8 });
  assert.equal(result.fitStrongProbability, 1);
  assert.equal(result.fitWeakProbability, 0);
  assert.equal(result.blockerProbability, 1);
});

test("turns assessments into conservative pursue, investigate and ignore actions", () => {
  assert.equal(
    decidePursuit({ eligible: false, reason: "deadline_passed" }).status,
    "ignore",
  );
  assert.equal(
    decidePursuit({
      eligible: true,
      fit: 2.8,
      fitConfidence: 0.47,
      fitStrongProbability: 0.96,
      blocker: "none",
      blockerProbability: 0.95,
    }).status,
    "pursue",
  );
  assert.equal(
    decidePursuit({
      eligible: true,
      fit: 0.8,
      fitConfidence: 0.6,
      fitWeakProbability: 0.95,
      blocker: "qualification",
      blockerProbability: 0.8,
    }).status,
    "ignore",
  );
  assert.equal(
    decidePursuit({
      eligible: true,
      fit: 2.8,
      fitConfidence: 0.4,
      blocker: "none",
    }).status,
    "investigate",
  );
});

test("builds a ranked evidence-linked radar and never exceeds its call budget", async () => {
  let calls = 0;
  const provider = createFakeProvider(({ state }) => {
    calls++;
    const strong = state.notice.id === "strong";
    return {
      model: "jev-1.13.0",
      answers: {
        fit: {
          type: "score",
          score: strong ? 2.9 : 1.8,
          probabilities: strong
            ? { 0: 0, 1: 0, 2: 0.1, 3: 0.9 }
            : { 0: 0.1, 1: 0.2, 2: 0.7, 3: 0 },
          legend: { 0: "a", 1: "b", 2: "c", 3: "d" },
          confidence: strong ? 0.9 : 0.7,
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
      usage: { input_tokens: 100, output_tokens: 0 },
    };
  });
  const base = {
    title: "Avis",
    buyer: "Ville",
    deadline: "2026-12-01T00:00:00.000Z",
    departments: ["75"],
    contractTypes: ["SERVICES"],
    sourceUrl: "https://www.boamp.fr/pages/avis/",
    source: "BOAMP · DILA",
  };
  const radar = await buildOpportunityRadar(
    [
      { ...base, id: "expired", deadline: "2020-01-01" },
      { ...base, id: "strong" },
      { ...base, id: "budgeted" },
    ],
    { departments: ["75"], capabilities: "Nettoyage" },
    provider,
    { maxCalls: 1, now: new Date("2026-01-01"), maxResults: 5 },
  );
  assert.equal(calls, 1);
  assert.deepEqual(radar.budget, { maxCalls: 1, usedCalls: 1 });
  assert.deepEqual(radar.counts, { pursue: 1, investigate: 1, ignore: 1 });
  assert.equal(radar.opportunities[0].noticeId, "strong");
  assert.equal(radar.opportunities[0].status, "pursue");
  assert.match(radar.opportunities[0].evidence.sourceUrl, /boamp\.fr/);
  assert.equal(radar.opportunities[1].reason, "budget_exhausted");
});

test("keeps the batch actionable when one provider call fails", async () => {
  const provider = { decide: async () => { throw new Error("temporary outage"); } };
  const radar = await buildOpportunityRadar(
    [{ id: "provider-failure", title: "Avis à reprendre" }],
    { capabilities: "Conseil" },
    provider,
    { maxCalls: 1, now: new Date("2026-01-01") },
  );
  assert.deepEqual(radar.budget, { maxCalls: 1, usedCalls: 1 });
  assert.equal(radar.usage.requests, 1);
  assert.equal(radar.decisions[0].status, "investigate");
  assert.equal(radar.decisions[0].reason, "provider_error");
  assert.deepEqual(radar.decisions[0].assessment.providerError, {
    name: "Error",
    status: null,
  });
});

const apiRecord = (overrides = {}) => ({
  id: "26_93322",
  idweb: "26-93322",
  objet: "Fourniture et distribution de colis",
  dateparution: "2026-09-29",
  datelimitereponse: "2026-11-13T11:00:00+00:00",
  nomacheteur: "Collectivité publique",
  code_departement: ["75", "92"],
  descripteur_code: ["184"],
  descripteur_libelle: ["Logistique"],
  nature_libelle: "Avis de marché",
  url_avis: "https://www.boamp.fr/pages/avis/?q=idweb:26-93322",
  type_marche: ["SERVICES"],
  ...overrides,
});

test("fetches and normalizes newest notices from the official BOAMP API", async () => {
  let request;
  const notices = await fetchBoampNotices({
    limit: 2,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(
        JSON.stringify({
          results: [apiRecord(), apiRecord(), apiRecord({ id: "x", idweb: "26-2", objet: "Maintenance informatique", url_avis: null })],
        }),
      );
    },
  });
  assert.equal(request.url.origin + request.url.pathname, BOAMP_API);
  assert.equal(request.url.searchParams.get("limit"), "2");
  assert.equal(request.url.searchParams.get("order_by"), "dateparution desc");
  assert.equal(notices.length, 2);
  assert.deepEqual(notices[0], {
    id: "26-93322",
    kind: "procurement-notice",
    title: "Fourniture et distribution de colis",
    text: "Fourniture et distribution de colis\nAcheteur: Collectivité publique\nDescripteurs: Logistique\nCPV: 184\nType: SERVICES\nDépartements: 75, 92\nDate limite: 2026-11-13T11:00:00.000Z",
    buyer: "Collectivité publique",
    departments: ["75", "92"],
    descriptors: ["Logistique"],
    cpv: ["184"],
    contractTypes: ["SERVICES"],
    deadline: "2026-11-13T11:00:00.000Z",
    date: "2026-09-29T00:00:00.000Z",
    sourceUrl: "https://www.boamp.fr/pages/avis/?q=idweb:26-93322",
    source: "BOAMP · DILA",
  });
  assert.match(notices[1].sourceUrl, /^https:\/\/www\.boamp\.fr/);
});

test("rejects unsafe BOAMP links, invalid envelopes and bad limits", async () => {
  await assert.rejects(
    fetchBoampNotices({
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            results: [apiRecord({ url_avis: "https://example.com/phishing" })],
          }),
        ),
    }),
    /non-official link/,
  );
  await assert.rejects(
    fetchBoampNotices({
      fetchImpl: async () => new Response(JSON.stringify({ records: [] })),
    }),
    /invalid result envelope/,
  );
  await assert.rejects(fetchBoampNotices({ limit: 0 }), /between 1 and 100/);
});
