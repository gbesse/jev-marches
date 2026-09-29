# AI change log

## 2026-09-29 — 0.2.0

- Added bounded ingestion from the official open BOAMP/DILA API.
- Normalizes current procurement notices into the existing triage contract, validates official evidence links, removes
  duplicate identifiers and exposes an injectable fetcher for deterministic downstream testing.
- Added public types, live-source validation instructions and explicit tender-document boundaries.

## 2026-09-21 — 0.1.0

Created the first public alpha around one bounded French-domain decision. Added a validated pinned Jev client, an offline fake, deterministic safeguards, tests, CI, documentation, and a synthetic demo. No live Jev request or domain accuracy benchmark was run.
