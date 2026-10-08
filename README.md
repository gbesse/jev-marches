# Jev Marchés

**Trie les avis de marchés publics français selon les capacités déclarées d’une entreprise.**

[![Tests](https://github.com/gbesse/jev-marches/actions/workflows/test.yml/badge.svg)](https://github.com/gbesse/jev-marches/actions/workflows/test.yml) [MIT](LICENSE) · Node.js 22+ · v0.3.5 · Documentation française

Jev Marchés récupère et normalise les avis récents depuis l’API ouverte BOAMP/DILA. **Marchés Radar** transforme ensuite la veille en une liste bornée d’actions `pursue`, `investigate` ou `ignore`, avec motif, source officielle et budget Jev explicite.

## Démarrage rapide

```sh
git clone https://github.com/gbesse/jev-marches.git
cd jev-marches
npm install
npm run demo
```

La démonstration utilise uniquement des données et probabilités synthétiques. Elle n’effectue aucun appel réseau et ne constitue pas une mesure de qualité de Jev.

## Marchés Radar

```js
import {
  buildOpportunityRadar,
  fetchBoampNotices,
  renderOpportunityRadar,
} from "@gbesse/jev-marches";
import { createJevClient } from "@gbesse/jev-marches/jev";

const notices = await fetchBoampNotices({ limit: 20 });
const radar = await buildOpportunityRadar(
  notices,
  {
    capabilities: ["Développement d’API", "Cybersécurité"],
    departments: ["75", "92"],
    contractTypes: ["SERVICES"],
    minimumLeadDays: 10,
  },
  createJevClient(),
  { maxCalls: 12, maxResults: 5 },
);

console.log(renderOpportunityRadar(radar, { companyName: "Mon entreprise" }));
```

Le radar applique d’abord les contraintes certaines — échéance, délai disponible, CPV, géographie, type de marché, acheteurs exclus et montant maximal. Il classe ensuite les avis éligibles par affinité lexicale déterministe afin de consacrer le budget Jev aux meilleurs candidats. La politique utilise la masse de probabilité complète des classes d’adéquation, pas une fausse « probabilité de gagner ».

Chaque rapport conserve toutes les décisions pour l’audit, mais ne présente que les meilleures actions effectivement évaluées dans `opportunities`. `maxCalls` borne strictement le coût : les avis au-delà du budget sont comptés dans `budget.deferredNotices`, restent auditables avec le motif `budget_exhausted` et ne polluent jamais la liste actionnable.

Une intégration incrémentale peut passer ses évaluations inchangées dans `previousAssessments`. Elles sont validées, marquées `reused: true`, comptées dans `budget.reusedNotices` et ne consomment ni appel ni jeton. Le rapprochement entre une source actuelle et une évaluation antérieure reste sous la responsabilité de l’appelant ; chaque preuve expose une empreinte SHA-256 du contenu décisionnel de l’avis.

## Exemple exécutable

Cet exemple classe un avis BOAMP synthétique pour une société qui développe des API. Il utilise un fournisseur Jev simulé : aucune clé API ni connexion réseau n’est nécessaire. L’assertion intégrée fait échouer la commande si le comportement attendu change.

Le code complet de [`examples/demo.mjs`](examples/demo.mjs) est directement copiable :

```js
// Objectif : démontrer la frontière de décision sans appel réseau.
import assert from "node:assert/strict";
import { rankNotices } from "../src/index.mjs";
import { createFakeProvider } from "../src/jev.mjs";
const p = createFakeProvider(() => ({
  model: "jev-1.13.0",
  answers: {
    fit: {
      type: "score",
      score: 3,
      probabilities: { 0: 0.01, 1: 0.04, 2: 0.15, 3: 0.8 },
      legend: { 0: "none", 1: "weak", 2: "plausible", 3: "strong" },
      confidence: 0.8,
    },
    blocker: {
      type: "choice",
      choice: "none",
      probabilities: {
        none: 0.9,
        deadline: 0.02,
        qualification: 0.02,
        geography: 0.02,
        capacity: 0.02,
        unknown: 0.02,
      },
      confidence: 0.9,
    },
  },
  usage: { input_tokens: 130, output_tokens: 0 },
}));
const resultat = await rankNotices(
  [
    {
      id: "BOAMP-DEMO-1",
      title: "Développement d’une API municipale",
      cpv: ["72000000"],
      deadline: "2099-12-31",
    },
  ],
  { capabilities: ["Développement d’API"], cpv: ["72000000"] },
  p,
);
assert.equal(resultat[0].fit, 3);
console.log(JSON.stringify(resultat, null, 2));
```

Lancez-le avec :

```sh
npm run demo:principal
```

Résultat à repérer : `fit: 3`.

### Cas limite à tester

Un avis dont la date limite est dépassée est écarté localement. Le code se trouve dans [`examples/cas-limite.mjs`](examples/cas-limite.mjs).

```sh
npm run demo:limite
```

Résultat à repérer : `eligible: false · reason: deadline_passed`. La commande `npm run demo` exécute les exemples de classement, de frontière et de radar complet.

## Utilisation de la bibliothèque

Importez les fonctions métier depuis `@gbesse/jev-marches`. Fournissez soit `createJevClient()` depuis l’export `./jev`, soit `createFakeProvider()` pour les tests hors ligne.

Les noms de l’API JavaScript restent stables pour préserver la compatibilité avec les versions précédentes. La documentation, les exemples et les explications destinées aux utilisateurs sont en français.

## Frontière de décision

Les échéances, départements, types de contrats et exclusions explicites restent déterministes. Jev évalue l’adéquation sémantique à un profil déclaré. Le classement produit une file de revue, jamais une décision de soumission.

La question exacte envoyée à Jev est versionnée dans [`src/index.mjs`](src/index.mjs). Les identifiants, dates, calculs, filtres, seuils et transitions d’état restent gérés par du code ordinaire.

## Sources

- [https://www.boamp.fr/pages/api-boamp/](https://www.boamp.fr/pages/api-boamp/)
- [https://github.com/gbesse/decision-solver](https://github.com/gbesse/decision-solver)

Conservez l’attribution amont, les identifiants d’origine, les URL de source et les dates de récupération avec chaque enregistrement dérivé.

## Appels Jev réels

Les appels réels sont facultatifs et payants. Le client fixe le modèle `jev-1.13.0`, valide l’identité du modèle et toutes les probabilités, refuse les redirections, ne retente que les erreurs réseau et les réponses HTTP 429/529, puis bloque les requêtes dépassant une estimation prudente de 24 000 jetons.

```sh
TYPESAFE_API_KEY=... node scripts/live-smoke.mjs
```

Le benchmark versionné s’exécute sans réseau avec `npm run benchmark:offline`, ou avec Jev réel via `npm run benchmark` lorsque `TYPESAFE_API_KEY` est chargé dans l’environnement. Le contrôle réel du 4 octobre 2026 obtient 12/12 sur le petit jeu synthétique de cas évidents, avec zéro faux `ignore` et 5 987 jetons d’entrée. Ce résultat vérifie la calibration de la politique ; il ne prétend pas mesurer la précision sur le trafic BOAMP réel. Voir [`docs/radar-benchmark.md`](docs/radar-benchmark.md).

N’envoyez jamais de secret, de donnée personnelle ni de dossier sensible non expurgé. Évaluez le comportement sur un jeu représentatif de cas français avant tout usage opérationnel.

## Parcours comparatif

`npm run demo:parcours` produit un rapport JSON partageable pour **jev-marches** : le scénario principal et la frontière déterministe. Chaque scénario garde sa sortie propre et échoue si son assertion ne passe plus. Les données et probabilités sont synthétiques ; aucun appel Jev n’est effectué.

Cette vue permet de comparer rapidement les chemins de décision et de choisir quel exemple adapter à vos propres données sourcées.

## Validation

```sh
npm run check
npm run typecheck
npm test
npm run demo
npm run benchmark:offline
```

La CI exécute ces vérifications sous Node.js 22 et 24.

Projet indépendant, sans affiliation avec TypeSafe AI ni avec l’administration française. Consultez la [documentation de l’API Jev](https://docs.typesafe.ai/api) et les [limites du modèle](https://docs.typesafe.ai/model-jaggedness/jev-1.13).

## October 2026 improvement · Amélioration d’octobre 2026 · Mejora de octubre de 2026

Run `npm run demo:affinity` to inspect how title, body and unrelated matches receive different deterministic retrieval scores before any model call.

Exécutez `npm run demo:affinity` pour voir les scores de recherche déterministes d’un titre, d’un corps de texte et d’un avis sans rapport, avant tout appel au modèle.

Ejecute `npm run demo:affinity` para ver las puntuaciones deterministas de un título, un texto y un aviso no relacionado antes de llamar al modelo.
