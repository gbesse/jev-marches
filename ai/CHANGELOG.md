# Journal des modifications assistées par IA

## 0.2.3 — 2026-09-29

- Ajout d’un exemple exécutable, lisible et directement copiable dans le README.
- Données synthétiques françaises, fournisseur Jev simulé et assertion de non-régression.

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

Création de la première version alpha publique autour d’une décision bornée du domaine français. Ajout d’un client Jev validé et épinglé, d’un fournisseur simulé hors ligne, de garde-fous déterministes, de tests, de la CI, de la documentation et d’une démonstration synthétique. Aucun appel Jev réel ni banc de précision métier n’a été exécuté.