// Objectif : réunir les scénarios synthétiques existants dans un rapport JSON partageable.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const examples = new URL('.', import.meta.url);
const scenarios = [
  ['principal', 'demo.mjs'],
  ['limite_deterministe', 'cas-limite.mjs'],
];
const results = [];
for (const [name, file] of scenarios) {
  const run = spawnSync(process.execPath, [fileURLToPath(new URL(file, examples))], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (run.error || run.status !== 0) {
    const detail = run.error?.message ?? (run.stderr.trim() || `code ${run.status}`);
    throw new Error(`${name}: ${detail}`);
  }
  results.push({ scenario: name, output: run.stdout.trim() });
}
console.log(JSON.stringify({ source: 'probabilites synthetiques, aucun appel Jev', scenarios: results }, null, 2));
