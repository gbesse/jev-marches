# Jev Marchés

**Triage French public procurement notices for a company capability profile.**

[![Tests](https://github.com/gbesse/jev-marches/actions/workflows/test.yml/badge.svg)](https://github.com/gbesse/jev-marches/actions/workflows/test.yml) [MIT](LICENSE) · Node.js 22+ · Public alpha

Jev Marchés deterministically rejects expired or out-of-scope notices, then ranks the remaining notices by fit and identifies the main bid blocker for review.

## Try it in 30 seconds

```sh
git clone https://github.com/gbesse/jev-marches.git
cd jev-marches
npm install
npm run demo
```

The demo uses synthetic fixture probabilities and makes no network call. They are examples, not measured Jev performance.

## Call real Jev

```sh
export TYPESAFE_API_KEY=...
node -e "import('./src/jev.mjs').then(({createJevClient}) => console.log(Boolean(createJevClient())))"
```

Real requests are paid and sent to `https://api.typesafe.ai/v1/systemone`. The model is pinned to `jev-1.13.0`, response types and model identity are validated, redirects are rejected, and state above the conservative 24,000-token estimate is refused.

An opt-in `TYPESAFE_API_KEY=... node scripts/live-smoke.mjs` command makes one synthetic request and prints usage. It is never run by CI.

## How it decides

The library keeps identifiers, dates, arithmetic and thresholds in ordinary code. Jev receives only the bounded semantic question shown in [docs/how-it-decides.md](docs/how-it-decides.md). Low-confidence results are marked for review; callers own every resulting action.

## Boundaries

It does not download tender documents, prepare bids, or provide legal advice. BOAMP ingestion is exposed as an adapter contract and the first release accepts normalized JSON notices.

Jev is strongest in English; French cases need evaluation on representative labels. It can read instructions literally, struggle with negations, dates and arithmetic, and degrade with irrelevant state. This project makes no live quality benchmark claim.

## Validation

`npm run check`, `npm run typecheck`, `npm test`, and `npm run demo` run locally and in CI on Node.js 22 and 24.

## Related projects

- [DecisionPacks](https://github.com/gbesse/decisionpacks) for versioned decision contracts
- [Semantic Watch](https://github.com/gbesse/semantic-watch) for state transitions
- [Meaning Diff](https://github.com/gbesse/meaning-diff) for semantic change review

Independent project; not affiliated with TypeSafe AI. See the [Jev API documentation](https://docs.typesafe.ai/api) and [jev-1.13 model limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13).
