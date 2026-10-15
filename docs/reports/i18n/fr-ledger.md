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

## R3 — 2026-10-14

- Batch: R3, `batch-R3.json`; 1,107 translated keys, 0 retranslation entries, 0 review entries.
- Initial apply: `messages/fr.json: inserted 1107, replaced 0, refused 0`.
- Final apply after punctuation review: `messages/fr.json: inserted 0, replaced 1107, refused 0`.
- Catalog diff before ledger: `messages/fr.json | 1109`; 1,108 insertions, 1 deletion (net +1,107 lines). Only the catalog changed before this ledger update.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final result: `Test Files 1 passed (1)`; `Tests 66 passed (66)`; duration 5.80s; exit 0.
- Focused scope verification: all 1,107 batch keys are added, all previous catalog values are unchanged, and every output value is applied. Placeholder multiplicity, markup parity and single-line values checked. No vous forms.
- Glossary: informal tu; infinitive action buttons; Box = Carré, Diamond = Diamant; placement = position; hand path = trajectoire de la main; step = étape; beat = temps; turn = tour; prop = accessoire; performer = artiste; variation = variante. Alpha/Beta/Gamma, Static, Shift, LOOP, Post Studio and Flow Arts Composer are retained.
- Transform labels: Mirrored = Miroir, Rotated = Pivoté, Swapped = Échangé, Inverted = Inversé; Rotated Halved/Quartered = Pivoté en moitiés/en quarts. Joined grids = grilles conjointes, following the glossary's conjoined-grid vocabulary.
- Context choices not specified in the glossary: Smart Collection = collection intelligente, fork = dériver, flipped = retourné, rewound = à rebours, practice ramp = progression d'entraînement, Creep = Progressif, Staircase = Par paliers. Flow in the render settings = Fluidité. These choices have not had native review.
- Uncertain naming: TKA Core/Core retained as the founding-deck label; the glossary does not establish whether Core is a translatable label or a product name. Stage is rendered as Scène and Arrange as Arrangement; these surface names are not specified in the glossary.
- Legitimately identical values include French cognates (Animation, Performances, Effort, Mode, Tempo, Arc, Concave, copies, Format, Formation, Normal, Tunnel, instance, Saturation, Collections, Image, Notes, Public, air, Compositions), notation/product names, A–Z, FPS, Full HD and placeholder-only labels.
- Prose review: ai-bust mechanical pass on the batch output returned no HIGH/CRITICAL findings after replacing seven source-style em dashes with sentence punctuation. Judgment pass preserved source meaning and avoided added claims.
- No primary-checkout access, integration, push, dependency installation, broad checks or dev server was performed. This worktree and branch remain for the coordinator.
