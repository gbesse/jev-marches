# Journal des modifications assistées par IA

## 0.2.2 — 2026-09-29

- Documentation, métadonnées et parcours contributeur entièrement francisés.
- Noms de l’API publique conservés pour assurer la compatibilité.

## 2026-09-29 — 0.2.1

- Preserve Jev's continuous expected 0–3 fit score and use the explicit answer confidence instead of incorrectly
  looking up a fractional score as a probability-map category key.
- Relaxed the local transport validator from integer-only scores to finite scores bounded by the declared scale and
  added a fractional-score regression.

## 2026-09-29 — 0.2.0

- Added bounded ingestion from the official open BOAMP/DILA API.
- Normalizes current procurement notices into the existing triage contract, validates official evidence links, removes
  duplicate identifiers and exposes an injectable fetcher for deterministic downstream testing.
- Added public types, live-source validation instructions and explicit tender-document boundaries.

## 2026-09-21 — 0.1.0

Created the first public alpha around one bounded French-domain decision. Added a validated pinned Jev client, an offline fake, deterministic safeguards, tests, CI, documentation, and a synthetic demo. No live Jev request or domain accuracy benchmark was run.