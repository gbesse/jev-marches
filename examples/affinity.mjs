// Inspect the cheap deterministic retrieval score before any Jev budget is spent.
import assert from 'node:assert/strict';
import { candidateAffinity } from '../src/index.mjs';

const profile = { capabilities: 'Maintenance des ascenseurs dans les bâtiments publics' };
const titleMatch = candidateAffinity({ title: 'Maintenance des ascenseurs', descriptors: [], text: '' }, profile);
const bodyOnly = candidateAffinity({ title: 'Prestations diverses', descriptors: [], text: 'Maintenance des ascenseurs' }, profile);
const unrelated = candidateAffinity({ title: 'Fourniture de mobilier', descriptors: [], text: 'Bureaux et chaises' }, profile);
assert.ok(titleMatch > bodyOnly);
assert.ok(bodyOnly > unrelated);
console.log(JSON.stringify({ synthetic: true, titleMatch, bodyOnly, unrelated, modelCalls: 0 }, null, 2));
