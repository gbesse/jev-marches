// Objectif : vérifier les règles déterministes et les décisions sémantiques soumises à revue.
import test from "node:test";
import assert from "node:assert/strict";
import {
  BOAMP_API,
  prefilter,
  assessNotice,
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
    text: "Fourniture et distribution de colis\nAcheteur: Collectivité publique\nDescripteurs: Logistique\nType: SERVICES\nDépartements: 75, 92\nDate limite: 2026-11-13T11:00:00.000Z",
    buyer: "Collectivité publique",
    departments: ["75", "92"],
    descriptors: ["Logistique"],
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
