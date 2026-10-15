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

## R2 — 2026-10-14

- Batch: R2, `batch-R2.json`; 871 translated keys, 0 retranslation entries, 0 review entries.
- Apply result: `messages/fr.json: inserted 871, replaced 0, refused 0`.
- Catalog diff before ledger: `messages/fr.json | 871`; 871 insertions, 0 deletions (net +871 lines). No other repository files changed.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Result: `Test Files 1 passed (1)`; `Tests 66 passed (66)`; duration 7.82s; exit 0.
- Glossary: informal `tu`; infinitive action buttons; Diamond = `Diamant`, Box = `Carré`; placement = `position`; hand path = `trajectoire de la main`; timing = `timing`; downbeat = `temps fort`; prop = `accessoire`; staff = `bâton`; step = `étape`; turn = `tour`. Alpha/Beta/Gamma, Shift/Dash/Static/Pro/Anti, Prospin/Antispin/Isolation, VTG labels and product names are retained. Compass identifiers and placeholders are unchanged.
- Context choices: trace-route beat counters and errors use `étape` because they indicate sequence positions. Thumb orientations use `vers l’intérieur` / `vers l’extérieur`. Dataframe in `learn_place_1_5_description` is rendered as `tableau de données`, preserving the supplied source claim without independently verifying the letter count.
- Terms not specified in the glossary: word bridge = `lettre de liaison` (short form `liaison`); Tap Route = `Parcours par touches`; bloom in game/challenge names = `floraison`. These choices have not had native review.
- Legitimately identical values include Alpha, Beta, Gamma, Prospin, Antispin, Shift, Dash, Static, Codex, N/E/S/W, Type 1, Premium, Animation, Direction, Rotation, Positions, Rotations, Points, Mandalas, Orientations, Score and placeholder/unit-only labels.
- No primary-checkout access, integration, push, dependency installation, broad checks or dev server was performed. This worktree and branch are retained for coordinator integration.
