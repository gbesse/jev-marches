// Objectif : implémenter la frontière de décision métier propre au dépôt.
import { readFile } from "node:fs/promises";

export const BOAMP_API =
  "https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records";

const strings = (value) =>
  (Array.isArray(value) ? value : value == null ? [] : [value])
    .map(String)
    .filter(Boolean);

const normalize = (value) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const STOP_WORDS = new Set([
  "avec",
  "aux",
  "dans",
  "des",
  "les",
  "pour",
  "une",
  "par",
  "sur",
  "service",
  "services",
  "prestation",
  "prestations",
  "marche",
]);

const tokens = (value) =>
  normalize(Array.isArray(value) ? value.join(" ") : value)
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));

const tokenMatches = (left, right) =>
  left === right ||
  (left.length >= 5 && right.length >= 5 &&
    (left.startsWith(right) || right.startsWith(left)));

/** Cheap, deterministic retrieval score used only to decide which eligible notices consume the call budget. */
export function candidateAffinity(notice, profile) {
  const wanted = [
    ...tokens(profile.capabilities),
    ...tokens(profile.activityCode),
  ];
  if (!wanted.length) return 0;
  const groups = [
    [tokens(notice.title), 3],
    [tokens(notice.descriptors), 2],
    [tokens(notice.text), 1],
  ];
  let score = 0;
  for (const wantedToken of new Set(wanted))
    score += Math.max(
      0,
      ...groups.map(([haystack, weight]) =>
        haystack.some((token) => tokenMatches(wantedToken, token)) ? weight : 0,
      ),
    );
  return score / new Set(wanted).size;
}

const overlaps = (left = [], right = []) =>
  left.some((a) =>
    right.some(
      (b) => String(a).startsWith(String(b)) || String(b).startsWith(String(a)),
    ),
  );

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
      "user-agent": "jev-marches/0.3 (+https://github.com/gbesse/jev-marches)",
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
    const cpv = strings(record.descripteur_code);
    const contractTypes = strings(record.type_marche);
    notices.push({
      id,
      kind: "procurement-notice",
      title: title.slice(0, 2_000),
      text: [
        title,
        buyer ? `Acheteur: ${buyer}` : null,
        descriptors.length ? `Descripteurs: ${descriptors.join(", ")}` : null,
        cpv.length ? `CPV: ${cpv.join(", ")}` : null,
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
      cpv,
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
    if (deadline <= now)
      return {
        eligible: false,
        reason: "deadline_passed",
        evidence: { deadline: deadline.toISOString() },
      };
    const leadDays = (deadline.valueOf() - now.valueOf()) / 86_400_000;
    if (
      Number.isFinite(profile.minimumLeadDays) &&
      leadDays < profile.minimumLeadDays
    )
      return {
        eligible: false,
        reason: "insufficient_lead_time",
        evidence: {
          availableDays: Math.max(0, Math.floor(leadDays)),
          requiredDays: profile.minimumLeadDays,
        },
      };
  }
  if (
    profile.cpv?.length &&
    notice.cpv?.length &&
    !overlaps(notice.cpv, profile.cpv)
  )
    return {
      eligible: false,
      reason: "cpv_out_of_scope",
      evidence: { notice: notice.cpv, profile: profile.cpv },
    };
  if (
    profile.departments?.length &&
    !profile.departments.includes("*") &&
    notice.departments?.length &&
    !overlaps(notice.departments, profile.departments)
  )
    return {
      eligible: false,
      reason: "geography_out_of_scope",
      evidence: {
        notice: notice.departments,
        profile: profile.departments,
      },
    };
  if (
    profile.contractTypes?.length &&
    notice.contractTypes?.length &&
    !overlaps(
      notice.contractTypes.map((value) => String(value).toUpperCase()),
      profile.contractTypes.map((value) => String(value).toUpperCase()),
    )
  )
    return {
      eligible: false,
      reason: "contract_type_out_of_scope",
      evidence: {
        notice: notice.contractTypes,
        profile: profile.contractTypes,
      },
    };
  if (
    normalize(notice.buyer) &&
    profile.excludedBuyers?.some((buyer) => {
      const excluded = normalize(buyer);
      return excluded && normalize(notice.buyer).includes(excluded);
    })
  )
    return {
      eligible: false,
      reason: "buyer_excluded",
      evidence: { buyer: notice.buyer },
    };
  if (
    Number.isFinite(profile.maxEstimatedValue) &&
    Number.isFinite(notice.estimatedValue) &&
    notice.estimatedValue > profile.maxEstimatedValue
  )
    return {
      eligible: false,
      reason: "contract_value_too_high",
      evidence: {
        notice: notice.estimatedValue,
        profile: profile.maxEstimatedValue,
      },
    };
  return { eligible: true, evidence: null };
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
  const fitStrongProbability =
    (f.probabilities?.[2] ?? 0) + (f.probabilities?.[3] ?? 0);
  const fitWeakProbability =
    (f.probabilities?.[0] ?? 0) + (f.probabilities?.[1] ?? 0);
  return {
    noticeId: notice.id,
    eligible: true,
    fit: f.score,
    fitConfidence: f.confidence,
    // Kept for 0.1 consumers; a continuous expected score is not a probability-map key.
    fitProbability: f.confidence,
    fitDistribution: f.probabilities,
    fitStrongProbability,
    fitWeakProbability,
    blocker: b.choice,
    blockerProbability: b.probabilities?.[b.choice] ?? b.confidence,
    blockerDistribution: b.probabilities,
    review:
      Math.min(f.confidence, b.confidence) < (options.minConfidence ?? 0.8) ||
      b.choice === "unknown",
    usage: r.usage,
    deterministic: false,
  };
}

export const RADAR_POLICY_VERSION = "opportunity-radar/1.0.0";

/** Convert an assessed notice into an operator-facing action without inventing a probability of winning. */
export function decidePursuit(
  assessment,
  {
    pursueFit = 2.3,
    ignoreFit = 1.25,
    minConfidence = 0.8,
    minDecisionMass = 0.75,
  } = {},
) {
  if (!assessment.eligible)
    return {
      status: "ignore",
      reason: assessment.reason,
      confidence: 1,
    };
  if (assessment.reason === "budget_exhausted")
    return { status: "investigate", reason: assessment.reason, confidence: 0 };
  if (assessment.reason === "provider_error")
    return { status: "investigate", reason: assessment.reason, confidence: 0 };
  const confidence = assessment.fitConfidence ?? 0;
  const fallbackMass = confidence >= minConfidence ? confidence : 0;
  const strongMass = assessment.fitStrongProbability ?? fallbackMass;
  const weakMass = assessment.fitWeakProbability ?? fallbackMass;
  if (
    assessment.fit >= pursueFit &&
    strongMass >= minDecisionMass &&
    assessment.blocker === "none"
  )
    return {
      status: "pursue",
      reason: "strong_fit",
      confidence: strongMass,
    };
  if (
    assessment.fit <= ignoreFit &&
    weakMass >= minDecisionMass
  )
    return { status: "ignore", reason: "weak_fit", confidence: weakMass };
  return {
    status: "investigate",
    reason:
      assessment.blocker === "none"
        ? "uncertain_fit"
        : `blocker_${assessment.blocker}`,
    confidence,
  };
}

function noticeEvidence(notice) {
  return {
    title: notice.title,
    buyer: notice.buyer ?? null,
    deadline: notice.deadline ?? null,
    departments: notice.departments ?? [],
    descriptors: notice.descriptors ?? [],
    contractTypes: notice.contractTypes ?? [],
    sourceUrl: notice.sourceUrl ?? null,
    source: notice.source ?? null,
  };
}

/** Build one auditable daily opportunity inbox under an explicit provider-call budget. */
export async function buildOpportunityRadar(
  notices,
  profile,
  provider,
  {
    maxCalls = 20,
    maxResults = 5,
    now = new Date(),
    minConfidence = 0.8,
    minDecisionMass = 0.75,
    pursueFit = 2.3,
    ignoreFit = 1.25,
  } = {},
) {
  if (!Array.isArray(notices) || notices.length > 100)
    throw new TypeError("notices must be an array of at most 100 items");
  if (!(Number.isInteger(maxCalls) && maxCalls >= 0 && maxCalls <= 100))
    throw new TypeError("maxCalls must be an integer between 0 and 100");
  if (!(Number.isInteger(maxResults) && maxResults >= 1 && maxResults <= 20))
    throw new TypeError("maxResults must be an integer between 1 and 20");
  const rows = [];
  let calls = 0;
  const usage = { input_tokens: 0, output_tokens: 0, requests: 0 };
  const prepared = notices.map((notice, index) => ({
    notice,
    index,
    deterministic: prefilter(notice, profile, now),
    retrievalScore: candidateAffinity(notice, profile),
  }));
  const ordered = [
    ...prepared.filter((item) => !item.deterministic.eligible),
    ...prepared
      .filter((item) => item.deterministic.eligible)
      .sort(
        (left, right) =>
          right.retrievalScore - left.retrievalScore ||
          left.index - right.index,
      ),
  ];
  for (const item of ordered) {
    const { notice, deterministic, retrievalScore } = item;
    let assessment;
    if (!deterministic.eligible) {
      assessment = {
        noticeId: notice.id,
        ...deterministic,
        deterministic: true,
      };
    } else if (calls >= maxCalls) {
      assessment = {
        noticeId: notice.id,
        eligible: true,
        reason: "budget_exhausted",
        retrievalScore,
        deterministic: true,
      };
    } else {
      calls++;
      usage.requests++;
      try {
        assessment = await assessNotice(notice, profile, provider, {
          now,
          minConfidence,
        });
        usage.input_tokens += assessment.usage?.input_tokens ?? 0;
        usage.output_tokens += assessment.usage?.output_tokens ?? 0;
      } catch (error) {
        assessment = {
          noticeId: notice.id,
          eligible: true,
          reason: "provider_error",
          providerError: {
            name: error instanceof Error ? error.name : "Error",
            status: Number.isInteger(error?.status) ? error.status : null,
          },
          deterministic: false,
        };
      }
    }
    rows.push({
      noticeId: notice.id,
      ...decidePursuit(assessment, {
        pursueFit,
        ignoreFit,
        minConfidence,
        minDecisionMass,
      }),
      assessment,
      retrievalScore,
      evidence: noticeEvidence(notice),
    });
  }
  const priority = { pursue: 0, investigate: 1, ignore: 2 };
  rows.sort(
    (left, right) =>
      priority[left.status] - priority[right.status] ||
      (right.assessment.fit ?? -1) - (left.assessment.fit ?? -1) ||
      left.noticeId.localeCompare(right.noticeId),
  );
  const counts = Object.fromEntries(
    ["pursue", "investigate", "ignore"].map((status) => [
      status,
      rows.filter(
        (row) =>
          row.status === status && row.reason !== "budget_exhausted",
      ).length,
    ]),
  );
  return {
    schemaVersion: 1,
    policyVersion: RADAR_POLICY_VERSION,
    generatedAt: new Date(now).toISOString(),
    budget: {
      maxCalls,
      usedCalls: calls,
      deferredNotices: rows.filter(
        (row) => row.reason === "budget_exhausted",
      ).length,
    },
    counts,
    usage,
    opportunities: rows
      .filter(
        (row) =>
          row.status !== "ignore" && row.reason !== "budget_exhausted",
      )
      .slice(0, maxResults),
    decisions: rows,
  };
}

export function renderOpportunityRadar(radar, { companyName = "Entreprise" } = {}) {
  const lines = [
    `# Marchés Radar · ${companyName}`,
    "",
    `${radar.counts.pursue} à poursuivre · ${radar.counts.investigate} à investiguer · ${radar.counts.ignore} ignorés`,
    `Budget Jev : ${radar.budget.usedCalls}/${radar.budget.maxCalls} appels${radar.budget.deferredNotices ? ` · ${radar.budget.deferredNotices} avis différés` : ""} · politique ${radar.policyVersion}`,
    "",
  ];
  if (!radar.opportunities.length)
    lines.push("Aucune opportunité retenue dans cette fenêtre.", "");
  for (const row of radar.opportunities) {
    lines.push(
      `## ${row.status === "pursue" ? "Poursuivre" : "Investiguer"} · ${row.evidence.title}`,
      "",
      `- Motif : ${row.reason}`,
      `- Acheteur : ${row.evidence.buyer ?? "non renseigné"}`,
      `- Échéance : ${row.evidence.deadline ?? "non renseignée"}`,
      ...(Number.isFinite(row.assessment.fit)
        ? [
            `- Adéquation : ${row.assessment.fit.toFixed(2)}/3 · confiance ${((row.assessment.fitConfidence ?? 0) * 100).toFixed(1)} %`,
            `- Frein principal : ${row.assessment.blocker}`,
          ]
        : []),
      row.evidence.sourceUrl
        ? `- Source : [${row.evidence.source ?? "avis officiel"}](${row.evidence.sourceUrl})`
        : `- Source : ${row.evidence.source ?? "non renseignée"}`,
      "",
    );
  }
  lines.push(
    "Décision de prospection à valider humainement ; ce radar ne garantit ni l’éligibilité ni l’attribution d’un marché.",
    "",
  );
  return `${lines.join("\n")}\n`;
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
