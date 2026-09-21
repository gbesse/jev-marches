// Purpose: Verify transport retry boundaries and strict response validation.
import test from "node:test";
import assert from "node:assert/strict";
import { createJevClient } from "../src/jev.mjs";

const request = {
  state: { text: "synthetic" },
  questions: {
    decision: {
      type: "choice",
      instructions: "Choose one.",
      criteria: { yes: "Yes", no: "No" },
    },
  },
};

function answer(model = "jev-1.13.0") {
  return {
    model,
    answers: {
      decision: {
        type: "choice",
        choice: "yes",
        probabilities: { yes: 0.9, no: 0.1 },
        confidence: 0.9,
      },
    },
    usage: { input_tokens: 10, output_tokens: 0 },
  };
}

test("rejects a returned model mismatch", async () => {
  const client = createJevClient({
    apiKey: "test",
    endpoint: "http://127.0.0.1/jev",
    fetchImpl: async () => new Response(JSON.stringify(answer("other-model"))),
  });
  await assert.rejects(client.decide(request), /model mismatch/);
});

test("does not retry an ordinary provider error", async () => {
  let calls = 0;
  const client = createJevClient({
    apiKey: "test",
    endpoint: "http://localhost/jev",
    fetchImpl: async () => {
      calls += 1;
      return new Response("", { status: 500 });
    },
  });
  await assert.rejects(client.decide(request), /HTTP 500/);
  assert.equal(calls, 1);
});

test("retries a documented overload response", async () => {
  let calls = 0;
  const client = createJevClient({
    apiKey: "test",
    endpoint: "http://localhost/jev",
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? new Response("", { status: 529 })
        : new Response(JSON.stringify(answer()));
    },
  });
  assert.equal((await client.decide(request)).answers.decision.choice, "yes");
  assert.equal(calls, 2);
});
