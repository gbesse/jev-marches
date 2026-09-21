# How it decides

Jev Marchés deterministically rejects expired or out-of-scope notices, then ranks the remaining notices by fit and identifies the main bid blocker for review.

The exact question and criteria live beside the call in [src/index.mjs](../src/index.mjs), making review and version control straightforward. Dates, identifiers, arithmetic, candidate generation, thresholds and state transitions remain code-owned. Synthetic demo probabilities are illustrative. Calibrate review thresholds on representative human labels before operational use.
