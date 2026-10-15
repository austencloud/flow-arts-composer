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

## R4 — 2026-10-14

- Batch: R4, `batch-R4.json`; 852 translated keys, 0 retranslation entries, 0 review entries.
- Apply result: `messages/fr.json: inserted 852, replaced 0, refused 0`.
- Catalog diff before ledger: `messages/fr.json | 854`; 853 insertions, 1 deletion (net +852 lines). Only the catalog changed before this ledger update.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Result: `Test Files 1 passed (1)`; `Tests 66 passed (66)`; duration 7.97s; exit 0.
- Focused scope verification: all 852 batch keys added, every previous catalog value unchanged, every output value applied. Placeholder multiplicity, markup parity, single-line values and absence of vous/votre/vos checked.
- Glossary: informal `tu`; infinitive action buttons; step = `étape`; beat = `temps`; prop = `accessoire`; staff = `bâton`; club = `massue`; performer = `artiste`; grid = `grille`; timing = `timing`; Rotated LOOPs = `LOOP pivotés`. Flow Arts Composer, TKA, LOOP, Post Studio, Choreo Card(s), platform brands, placeholders and technical identifiers are retained.
- Navigation follows earlier batches: Construct = `Construire`, Generate = `Générer`, Assemble = `Assembler`, Fuse = `Fusionner`, Tunnel = `Tunnel`; 3D Studio = `Studio 3D`. These additional surface names are not specified in the glossary and have not had native review.
- Post Studio terminology outside the glossary: take = `prise`, map timing = `caler le timing`, tap = `appui` or the action `marquer`, landing = `arrivée`, move = `mouvement`, pass = `passage`, playhead = `tête de lecture`. Landing is interpreted from the supplied description of props reaching positions; no independent behavior or native terminology review was performed.
- Theme and avatar gradient labels are translated as display labels (for example Ember = `Braise`, Pride = `Fierté`, Void = `Vide`); their keys and identifiers are unchanged. No native review was available.
- Legitimately identical values: Style, Standard, Reel, Story, Timing, Tempo, Animation, Mandala and `Version {version}`.
- Prose review: ai-bust mechanical pass on the batch output returned no HIGH/CRITICAL findings. Judgment pass preserved source meaning, concise labels and the source's playful guest-limit prompts.
- No primary-checkout access, integration, push, dependency installation, broad checks or dev server was performed. This worktree and branch remain for the coordinator.

## R5 — 2026-10-14

- Batch: R5, `batch-R5.json`; 517 translated keys, 0 retranslation entries, 0 review entries.
- Initial apply: `messages/fr.json: inserted 517, replaced 0, refused 0`.
- Final apply after singular agreement correction: `messages/fr.json: inserted 0, replaced 517, refused 0`.
- Catalog diff before ledger: `messages/fr.json | 517`; 517 insertions, 0 deletions. Only the catalog changed before this ledger update.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final result: `Test Files 1 passed (1)`; `Tests 66 passed (66)`; duration 9.79s; exit 0.
- Focused scope verification: all 517 batch keys added, every previous catalog value unchanged, every output value applied. Placeholder multiplicity, markup parity, single-line values and absence of vous/votre/vos checked. `git diff --check` passed.
- Glossary: informal `tu`; infinitive action buttons; prop = `accessoire`; step = `étape`; placement = `position`; performer = `artiste`; library = `bibliothèque`. TKA, LOOP, Flow Arts Composer, Choreo Cards, platform names, keyboard combinations and placeholders are retained. Motion-independent Shift Start is `Décaler le départ`; the Shift key in combinations stays English.
- Navigation and settings terms outside the glossary: Jump to = `Aller à`, Smart Collection = `collection intelligente` (consistent with R3), command palette = `palette de commandes`, prop preset = `préréglage d’accessoires`, flow identity = `identité de flow`, quick feedback = `retour rapide`. No native review was available.
- Source context: `nav_ui_your_username` is a form placeholder in UsernameEditor and InstagramUsernameEditor, not an actual user identifier, so it becomes `ton_identifiant`. `landing_spinner_generated` names one history entry without a sequence word and uses singular `Générée`. Neither source data nor user names were translated.
- Uncertain naming: `keyboard_context_realm` is rendered as `Royaume`; the glossary does not establish whether Realm is a product name or a translatable navigation label. Native/product naming review remains outstanding.
- Legitimately identical values: Notation, Admin, Studio, Mandala, Art, Collections, Tunnel, Navigation, Animation, Performance, Image and Actions.
- Prose review: ai-bust mechanical pass on the batch output returned no HIGH/CRITICAL findings. Judgment pass preserved source meaning and concise UI phrasing; repeated shortcut descriptions serve consistent commands rather than prose templates.
- No primary-checkout access, integration, push, dependency installation, broad checks or dev server was performed. This worktree and branch remain for the coordinator.

## F1 — 2026-10-14

- Batch: F1, `batch-F1.json`; 0 translated keys, 18 retranslated keys, 0 reviewed keys. Formality correction only.
- Apply result: `messages/fr.json: inserted 0, replaced 18, refused 0`.
- Catalog diff before ledger: only `messages/fr.json` changed; 18 insertions, 18 deletions (18 existing values replaced, no key additions).
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Result: `Test Files 1 passed (1)`; `Tests 66 passed (66)`; duration 7.16s; exit 0.
- Glossary: section 11 informal `tu`, with corresponding verb and possessive forms. Account action links use infinitives `Se connecter` and `S'inscrire`. Example email uses neutral `nom@exemple.com`. Existing wording, punctuation and meaning otherwise preserved.
- Existing source discrepancies preserved by this formality-only scope: `feedback_group_feedback_desc` describes notification when feedback is taken into account rather than the English status changes and replies; `feedback_notification_prefs_subtitle` describes choosing notifications rather than delivery and alert types. These are established text differences, not resolved in F1.
- Uncertain glossary terms: none.
- No primary-checkout access, integration, push, dependency installation, broad checks or dev server performed. Branch and worktree remain for the coordinator.
