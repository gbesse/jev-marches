# Benchmark Marchés Radar v1

Ce benchmark garde la politique `pursue` / `investigate` / `ignore` reproductible et révisable. Son jeu versionné contient douze cas synthétiques et lisibles : quatre adéquations fortes, trois inadéquations sémantiques, un cas ambigu et quatre exclusions déterministes.

## Résultat de référence

Exécution Jev réelle du 4 octobre 2026 avec `jev-1.13.0` :

- exactitude : 12/12 ;
- précision des décisions `pursue` : 100 % ;
- taux de faux `ignore` : 0 % ;
- appels Jev : 8, les quatre exclusions déterministes n’en consomment aucun ;
- jetons d’entrée : 5 987.

La première politique, fondée sur la seule probabilité de la classe dominante, obtenait 8/12. La version publiée somme la masse des classes compatibles : `P(fit ≥ plausible)` pour poursuivre et `P(fit ≤ faible)` pour ignorer. Elle conserve les cas intermédiaires en investigation et ne fabrique aucune probabilité d’attribution.

## Reproduire

```sh
npm run benchmark:offline
TYPESAFE_API_KEY=... npm run benchmark
```

Le mode hors ligne dérive volontairement ses réponses des libellés attendus. Il vérifie le harnais et les seuils, pas la qualité du modèle.

## Limite

Douze cas évidents ne constituent ni un échantillon représentatif des avis BOAMP, ni une validation commerciale. L’étape suivante est un jeu gelé d’avis réels, annoté à l’aveugle par des praticiens, puis un suivi prospectif des décisions réellement ouvertes, qualifiées et soumissionnées.
