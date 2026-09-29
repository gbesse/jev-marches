// Purpose: Fetch official BOAMP notices and triage them against a company profile.
import { readFile } from "node:fs/promises";

export const BOAMP_API =
  "https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records";

const strings = (value) =>
  (Array.isArray(value) ? value : value == null ? [] : [value])
    .map(String)
    .filter(Boolean);

function officialNoticeUrl(record) {
  const fallback = `https://www.boamp.fr/pages/avis/?q=idweb:${encodeURIComponent(record.idweb ?? record.id)}`;
  const url = new URL(record.url_avis || fallback);
  if (
    url.protocol !== "https:" ||
    !(url.hostname === "boamp.fr" || url.hostname.endsWith(".boamp.fr"))
  )
    throw new TypeError("BOAMP record contains a non-official link");
  return url.href;
}

/** Fetch the newest notices from the open, official BOAMP/DILA API and normalize the fields used for triage. */
export async function fetchBoampNotices({
  limit = 20,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
} = {}) {
  if (!(Number.isInteger(limit) && limit >= 1 && limit <= 100))
    throw new TypeError("limit must be an integer between 1 and 100");
  if (typeof fetchImpl !== "function")
    throw new TypeError("fetchImpl must be a function");
  const url = new URL(BOAMP_API);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("order_by", "dateparution desc");
  url.searchParams.set(
    "select",
    "id,idweb,objet,dateparution,datelimitereponse,nomacheteur,code_departement,descripteur_code,descripteur_libelle,nature_libelle,url_avis,type_marche",
  );
  const response = await fetchImpl(url, {
    headers: {
      accept: "application/json",
      "user-agent": "jev-marches/0.2 (+https://github.com/gbesse/jev-marches)",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`BOAMP API unavailable (${response.status})`);
  const body = await response.json();
  if (!Array.isArray(body.results))
    throw new Error("BOAMP API returned an invalid result envelope");
  const seen = new Set();
  const notices = [];
  for (const record of body.results) {
    const id = String(record.idweb ?? record.id ?? "").trim();
    const title = String(record.objet ?? "").replace(/\s+/g, " ").trim();
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    const deadline = record.datelimitereponse
      ? new Date(record.datelimitereponse)
      : null;
    const published = record.dateparution ? new Date(record.dateparution) : null;
    if (deadline && Number.isNaN(deadline.valueOf())) continue;
    const buyer = String(record.nomacheteur ?? "").trim() || null;
    const departments = strings(record.code_departement);
    const descriptors = strings(record.descripteur_libelle);
    const contractTypes = strings(record.type_marche);
    notices.push({
      id,
      kind: "procurement-notice",
      title: title.slice(0, 2_000),
      text: [
        title,
        buyer ? `Acheteur: ${buyer}` : null,
        descriptors.length ? `Descripteurs: ${descriptors.join(", ")}` : null,
        contractTypes.length ? `Type: ${contractTypes.join(", ")}` : null,
        departments.length ? `Départements: ${departments.join(", ")}` : null,
        deadline ? `Date limite: ${deadline.toISOString()}` : null,
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 20_000),
      buyer,
      departments,
      descriptors,
      contractTypes,
      deadline: deadline?.toISOString() ?? null,
      date:
        published && !Number.isNaN(published.valueOf())
          ? published.toISOString()
          : null,
      sourceUrl: officialNoticeUrl(record),
      source: "BOAMP · DILA",
    });
  }
  if (!notices.length) throw new Error("BOAMP API returned no usable notice");
  return notices;
}

export function prefilter(notice, profile, now = new Date()) {
  if (!notice?.id || !notice?.title)
    throw new TypeError("notice needs id and title");
  if (notice.deadline) {
    const deadline = new Date(notice.deadline);
    if (Number.isNaN(deadline.valueOf()))
      throw new TypeError("notice.deadline must be an ISO date");
    if (deadline <= now) return { eligible: false, reason: "deadline_passed" };
  }
  if (
    profile.cpv?.length &&
    notice.cpv?.length &&
    !notice.cpv.some((x) => profile.cpv.includes(x))
  )
    return { eligible: false, reason: "cpv_out_of_scope" };
  return { eligible: true };
}
export async function assessNotice(notice, profile, provider, options = {}) {
  const pre = prefilter(notice, profile, options.now || new Date());
  if (!pre.eligible)
    return { noticeId: notice.id, ...pre, deterministic: true };
  const r = await provider.decide({
    state: { notice, company: profile },
    questions: {
      fit: {
        type: "score",
        instructions:
          "Score whether this company can credibly deliver the public contract based only on stated capabilities and constraints.",
        criteria: [
          "No credible fit",
          "Weak fit with major gaps",
          "Plausible fit needing review",
          "Strong fit",
        ],
      },
      blocker: {
        type: "choice",
        instructions: "Identify the main stated obstacle to bidding.",
        criteria: {
          none: "No clear blocker",
          deadline: "Insufficient time",
          qualification: "Required qualification is missing",
          geography: "Delivery geography is incompatible",
          capacity: "Contract scale exceeds capacity",
          unknown: "Documents do not establish the answer",
        },
      },
    },
  });
  const f = r.answers.fit,
    b = r.answers.blocker;
  return {
    noticeId: notice.id,
    eligible: true,
    fit: f.score,
    fitProbability: f.probabilities[String(f.score)],
    blocker: b.choice,
    review:
      Math.min(f.confidence, b.confidence) < (options.minConfidence ?? 0.8) ||
      b.choice === "unknown",
    usage: r.usage,
    deterministic: false,
  };
}
export async function rankNotices(notices, profile, provider, options = {}) {
  const rows = [];
  for (const n of notices)
    rows.push(await assessNotice(n, profile, provider, options));
  return rows.sort((a, b) => (b.fit ?? -1) - (a.fit ?? -1));
}
export async function runCli(argv, io = console) {
  if (argv.length !== 2)
    throw new Error("Usage: jev-marches <notices.json> <profile.json>");
  const [n, p] = await Promise.all(
    argv.map(async (f) => JSON.parse(await readFile(f, "utf8"))),
  );
  io.log(
    JSON.stringify(
      n.map((x) => prefilter(x, p)),
      null,
      2,
    ),
  );
}
