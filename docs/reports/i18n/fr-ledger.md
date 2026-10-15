# French translation ledger

## R1 — 2026-10-14

- Batch: R1, `batch-R1.json`; 1,121 translated keys, 3 retranslation entries, 0 review entries.
- Apply result: `messages/fr.json: inserted 1121, replaced 3, refused 0`.
- Catalog diff before ledger: `messages/fr.json | 1127`; 1,124 insertions, 3 deletions (net +1,121 lines). No other repository files changed.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Result: `Test Files 1 passed (1)`; `Tests 66 passed (66)`; duration 8.38s; exit 0.
- Glossary: informal `tu`; infinitive action buttons; Box grid = `Carré`, Diamond = `Diamant`; Level = `Niveau`; placement = `position`; turn = `tour`; prop = `accessoire`; variation = `variante`; performer = `artiste`. Motion categories, Flower, Buugeng, LOOP and product names retain their English names. Orientation labels use `horaire`, `antihoraire`, `intérieur`, `extérieur`; compass point identifiers remain unchanged.
- Navigation choices: Construct = `Construire`, Generate = `Générer`, Assemble = `Assembler`; authored performer counts = `artistes définis`; cast = `distribution`. These surfaces and authorship terms are not explicitly specified in the glossary and have not had native review.
- Source uncertainty: rewind help describes playing the sequence backwards, while its action accessibility text describes appending the reversed sequence. Each translation preserves its own English source; actual behavior was not established in this translation-only task.
- Source uncertainty: inversion descriptions vary between exchanging motion types (including Static/Dash) and leaving base motion types unchanged. Each translation preserves the supplied source rather than resolving that behavior.
- `browse_grid_box` already had `Carré` in the batch metadata; all three required retranslation entries were submitted as `Carré`.
- Identical French/English words (Options, Orientation, Public, Type, Simple, Style, Direction, Actions, Positions, Rotation, Notes, Action), brands, numeric values, compass identifiers and placeholder-only strings remain legitimately identical.
- No review batch was supplied. No primary-checkout access, integration, push, dependency installation, broad checks or dev server was performed; this branch is retained for the coordinator.
