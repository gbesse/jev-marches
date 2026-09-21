// Purpose: Provide a validated Jev HTTP client and a deterministic offline test double.
const MODEL = "jev-1.13.0";

function validProbability(value) {
  return typeof value === "number" && value >= 0 && value <= 1;
}

function validate(response, questions, model) {
  if (!response || response.model !== model || !response.answers)
    throw new Error("Invalid Jev response or model mismatch");
  for (const [id, question] of Object.entries(questions)) {
    const answer = response.answers[id];
    if (!answer || answer.type !== question.type)
      throw new Error(`Invalid answer for ${id}`);
    if (question.type === "noul" && !validProbability(answer.noul))
      throw new Error("Invalid noul probability");
    if (question.type === "choice") {
      if (
        !(answer.choice in question.criteria) ||
        !validProbability(answer.confidence)
      )
        throw new Error("Invalid choice answer");
      for (const key of Object.keys(question.criteria))
        if (!validProbability(answer.probabilities?.[key]))
          throw new Error("Invalid choice probability");
    }
    if (question.type === "score") {
      if (
        !Number.isInteger(answer.score) ||
        answer.score < 0 ||
        answer.score >= question.criteria.length ||
        !validProbability(answer.confidence)
      )
        throw new Error("Invalid score answer");
      for (let index = 0; index < question.criteria.length; index += 1)
        if (!validProbability(answer.probabilities?.[String(index)]))
          throw new Error("Invalid score probability");
    }
  }
  return response;
}

function retryDelay(response, attempt) {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.min(seconds * 1000, 30_000)
    : 100 * 2 ** attempt;
}

export function createJevClient({
  apiKey = process.env.TYPESAFE_API_KEY,
  endpoint = "https://api.typesafe.ai/v1/systemone",
  model = MODEL,
  timeoutMs = 30_000,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey) throw new Error("Set TYPESAFE_API_KEY");
  const url = new URL(endpoint);
  if (
    url.protocol !== "https:" &&
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error("Jev endpoint must use HTTPS");
  return {
    async decide({ state, questions, signal }) {
      const body = JSON.stringify({ model, state, questions });
      if (Math.ceil(body.length / 4) > 24_000)
        throw new Error(
          "State and questions exceed the 24,000 token estimate budget",
        );
      for (let attempt = 0; attempt < 3; attempt += 1) {
        let response;
        try {
          const timeout = AbortSignal.timeout(timeoutMs);
          response = await fetchImpl(url, {
            method: "POST",
            redirect: "error",
            signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
            headers: {
              authorization: `Bearer ${apiKey}`,
              "content-type": "application/json",
            },
            body,
          });
        } catch (error) {
          if (signal?.aborted || attempt === 2) throw error;
          await new Promise((resolve) =>
            setTimeout(resolve, 100 * 2 ** attempt),
          );
          continue;
        }
        if (!response.ok) {
          if (![429, 529].includes(response.status) || attempt === 2)
            throw new Error(`Jev HTTP ${response.status}`);
          await new Promise((resolve) =>
            setTimeout(resolve, retryDelay(response, attempt)),
          );
          continue;
        }
        return validate(await response.json(), questions, model);
      }
      throw new Error("Jev retry budget exhausted");
    },
  };
}

export function createFakeProvider(responder) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async decide(request) {
      calls += 1;
      return validate(
        await responder(request, calls),
        request.questions,
        MODEL,
      );
    },
  };
}
