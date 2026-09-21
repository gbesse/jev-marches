// Purpose: Make one opt-in real Jev request with synthetic data and print its metered usage.
import { createJevClient } from '../src/jev.mjs';

const client = createJevClient();
const response = await client.decide({
  state: { message: 'La facture indique un double prélèvement.' },
  questions: {
    topic: {
      type: 'choice',
      instructions: 'Choose the topic of this synthetic French customer message.',
      criteria: {
        billing: 'Billing, payment, invoice, or refund',
        technical: 'Technical incident or software failure',
      },
    },
  },
});

console.log(JSON.stringify({ answers: response.answers, usage: response.usage }, null, 2));
