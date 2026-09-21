// Purpose: Triage normalized French public-procurement notices against a company profile.
import { readFile } from "node:fs/promises";
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
