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

## REV (coordinator) — 2026-10-14

- gpt-6-astra review of a sample of this wave flagged a handful of keys (see coordinator notes); all fixes applied.
- Codex restored as a product name where older strings translated it; Double-Staff uses the glossary prop term.
- Gate: `Tests 66 passed (66)`.

## P1 — 2026-10-14

- Batch: P1, `batch-P1.json`; 401 translated keys, 0 retranslated keys, 0 review entries. The supplied batch contains only `guide_*` keys, despite the broader teaching/effect/inbox description in the brief.
- Initial apply: `messages/fr.json: inserted 401, replaced 0, refused 0`.
- Final apply after strict Petal terminology and neutral rotation wording corrections: `messages/fr.json: inserted 0, replaced 401, refused 0`.
- Catalog diff before ledger: only `messages/fr.json` changed; 401 insertions, 0 deletions. All 401 supplied keys added, all previous catalog values unchanged, every output value applied.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final result: `Test Files 1 passed (1)`; `Tests 66 passed (66)`; duration 23.43s; exit 0.
- Focused checks: exact placeholder multiplicity preserved, single-line values, no vous/votre/vos forms, no added markup, and `git diff --check` passed.
- Glossary: informal `tu`; infinitive buttons; Box = `Carré`, Diamond = `Diamant`, hand path = `trajectoire de la main`, prop = `accessoire`, staff = `bâton`, double staff = `bâton double`, club = `massue`, turn = `tour`, step = `étape`, beat = `temps`, Practice = `Entraînement`. Running orientation text and orientation labels use `vers l'intérieur` / `vers l'extérieur`; rotation senses are `horaire` / `antihoraire`.
- Section 1 names retained: The Kinetic Alphabet, Codex, Composer, TKA, Zan's Diamond, Pro/Anti/Shift/Dash/Static/Float, Prospin/Antispin/Inspin/Isolation/Extension/Flower/Petal, Alpha/Beta/Gamma and Poi. Flower and Petal remain English even in explanatory prose under the glossary's explicit never-translate rule.
- Codex `Dual`, `Cross`, `-Shift` and `-Dash` segments retained: CodexSheet combines those segments into the protected Dual-Shift/Cross-Shift/Dual-Dash category names. Existing names and data, including Austen Cloud, Lorq Nichols and Spin Science, remain unchanged.
- Legitimately identical values: protected names and notation, French cognates such as Animation, Arc, Concave, Effort, Horizontal, Vertical and Sources, and the placeholder-only `{style}, {petals}` label (31 values altogether).
- Context verification: RatioSwapMotion supplies `une fois` / `deux fois` for `{hand}` and `{prop}`; the accessibility sentence uses `la main parcourt son cercle {hand}` and `l'accessoire tourne {prop}` so those substitutions read correctly. Split prose fragments keep boundary spaces and link insertion positions.
- Terms outside the glossary, without native review: spin ratio = `rapport de rotation`, lap = `tour de circuit`, cat-eye = `œil de chat`, third order = `troisième ordre`, stagger = `décalage`, leading/following = `en avance` / `qui suit`, glyph = `glyphe`, slots = `emplacements`. Product/community terminology for these choices remains unconfirmed.
- Source ambiguity: the Static 2-turn description says to use negative space or a turn, without identifying what turns. French uses the neutral `une rotation`; no claim that the performer turns on themselves is added.
- Prose review: ai-bust mechanical pass on the output returned `[]` at HIGH/CRITICAL severity. Judgment pass preserved the source teaching sequence and factual statements; no native review or independent confirmation of source mathematics/history was performed.
- No primary-checkout access, other-worktree access, integration, push, dependency installation, broad checks or dev server performed. Branch and worktree remain for the coordinator.

## P2 — 2026-10-14

- Batch: P2, `batch-P2.json`; 401 translated keys, 0 retranslated keys, 0 review entries. All supplied keys are guide text and controls; no effect or inbox keys occur in this batch.
- Initial apply: `messages/fr.json: inserted 401, replaced 0, refused 0`.
- Final apply after neutral rotation wording and exact Dual-Shifts label corrections: `messages/fr.json: inserted 0, replaced 401, refused 0`.
- Catalog diff before ledger: only `messages/fr.json` changed; 401 insertions, 0 deletions. All 401 batch keys added, all previous values unchanged, and every output value applied.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final result: `Test Files 1 passed (1)`; `Tests 66 passed (66)`; duration 10.05s; exit 0. Initial gate also passed 66 tests before the final wording corrections.
- Focused checks: exact placeholder multiplicity and HTML tag/attribute multiplicity preserved; all values single-line; no vous/votre/vos forms; `git diff --check` passed.
- Glossary choices: informal `tu`; infinitive action buttons; prop = `accessoire`, staff = `bâton`, hand path = `trajectoire de la main`, centric placement = `position centrée`, step = `étape`, turn = `tour`, Box = `Carré`, Diamond = `Diamant`. All orientation prose and labels use full `vers l’intérieur` / `vers l’extérieur`; rotation senses use `horaire` / `antihoraire`.
- Protected categories, brands, placements, VTG labels, letters, code examples, symbols, class/style attributes and colors retained. Parenthesized notation pairs keep their original lowercase, e.g. `(pro|pro)` and `(dash|dash)`. The split highlighted source label `Dual` + `-Shifts` is preserved exactly. Letter/type labels legitimately identical to English remain present because all batch keys are required.
- Teaching choices outside the glossary: high/low slots = `emplacements du haut et du bas`; leading/following = `main qui mène` / `main qui suit`; opening/closing = `ouverture` / `fermeture`; thumb/pinky ends = `extrémité côté pouce/auriculaire`; Same-dots/Opp-dots = `points de même sens et de sens opposés`; negative space = `espace négatif`. Spoken glyph modifiers such as High-One are translated as Haut-Un, while letters and code parameters remain intact. No native/community review was available for these terms.
- Source ambiguity preserved: Dash examples count two thumb switches while showing only `(in → in)`, and two-turn Dash examples retain their abbreviated `(in → out)` endpoint notation. These are source teaching examples, not independently verified calculations; their counts and arrow sequences are unchanged in translation.
- Source ambiguity preserved: the static two-turn guidance says to use negative space or a turn without identifying what turns. Those sentences use neutral `l’espace négatif ou une rotation`; no body turn is inferred there. The separate staff-marking sentence explicitly mentions body turns and is translated accordingly.
- Prose review: ai-bust mechanical pass returned `[]` at HIGH/CRITICAL severity. Judgment review preserved the source teaching sequence, emphasis and steps; repeated runtime/print descriptions reflect the supplied variants. No independent confirmation of source technical claims or native review is claimed.
- No primary-checkout access, other-worktree access, integration, push, dependency installation, broad checks or dev server performed. Branch and worktree remain for the coordinator.

## P3 — 2026-10-14

- Batch: P3, `batch-P3.json`; 676 translated keys, 0 retranslated keys, 0 review entries. The supplied batch contains Shape Engine and verified Level 1 text; no effect or inbox keys occur in this batch.
- Initial apply: `messages/fr.json: inserted 676, replaced 0, refused 0`.
- Final apply: `messages/fr.json: inserted 0, replaced 676, refused 0`.
- Catalog diff before ledger: only `messages/fr.json` changed; 676 insertions, 0 deletions. Exact scope check confirmed all 676 batch keys added, all previous values unchanged, and every output value applied.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final result: `Test Files 1 passed (1)`; `Tests 66 passed (66)`; duration 8.46s; exit 0.
- Initial gate: 65 passed, 1 failed because six highlighted mnemonic phrases were identical to English. Fixed in the output file, reapplied through the supplied script, and reran the unchanged test successfully.
- Focused checks: exact placeholder and HTML tag/attribute multiplicity preserved; all values single-line; no vous/votre/vos forms; `git diff --check` passed.
- Glossary: informal `tu`, infinitive action buttons, prop = `accessoire`, staff = `bâton`, double staff = `bâton double`, hand path = `trajectoire de la main`, turn = `tour`, step = `étape`, musical count = `temps`, Box = `Carré`, Diamond = `Diamant`. Full orientation phrases `vers l’intérieur` / `vers l’extérieur` are used throughout, including print labels.
- Protected brands, motion categories, VTG labels, placements, letters, sequence words, CSS classes, style attributes and hex colors retained. Split highlighted category segments such as `Dual` + `-Shifts` and `Cross` + `-Shifts` keep the source spelling and emphasis. Legitimately identical values are protected notation, names, numerical labels and French cognates (99 values after corrections).
- Mnemonics: retained Disco Jam, Exploding Kitten, Fruity Loops, Magic Potion, Never Quit and Open Road to preserve their DJ/EK/FL/MP/NQ/OR initials, adding consistent French meanings in parentheses in all label, highlighted and print variants. These are teaching mnemonics rather than translated sequence words.
- Terms outside the glossary, without native/community review: negative space = `espace négatif`, body turns = `rotations du corps`, wall plane = `plan frontal`, wheel plane = `plan latéral`, hand/prop/full reversal = `inversion de main/d’accessoire/complète`, thumb/pinky end = `extrémité côté pouce/auriculaire`, leading/following = `meneuse/suiveuse`, realization = `réalisation`, driving styles = `styles de mouvement`. French mnemonic glosses also remain unreviewed.
- Source discrepancy preserved: the Type 3 letter labels pair beta→gamma with Sig Dash/Del Dash and alpha→gamma with The Dash/Om Dash, whereas the Type 2 labels pair alpha→gamma with Sigma/Delta and beta→gamma with Theta/Omega. No notation correction or independent verification was attempted in this translation-only batch.
- Shape Engine historical attributions, numerical claims and teaching calculations are translated from the supplied English, not independently established facts. No native review is claimed.
- Prose review using the ai-bust skill: mechanical pass returned `[]` at HIGH/CRITICAL severity; judgment review preserved teaching steps and emphasis, with repeated print/SEO variants reflecting the source.
- No primary-checkout access, other-worktree access, integration, push, dependency installation, broad checks or dev server performed. Branch and worktree remain for the coordinator as instructed.

## P4 — 2026-10-14

- Batch: P4, `batch-P4.json`; 906 translated keys, 0 retranslated keys, 0 review entries. The actual batch contains 211 feedback, 296 inbox and 399 effect keys, with no guide or verified lesson keys despite the generic teaching-prose brief.
- Apply result: `messages/fr.json: inserted 906, replaced 0, refused 0`.
- Catalog diff before ledger: only `messages/fr.json` changed; 906 insertions, 0 deletions. Exact comparison confirms every supplied key added, every previous catalog value unchanged, and every output value applied.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Result: `Test Files 1 passed (1)`; `Tests 66 passed (66)`; duration 9.84s; exit 0.
- Focused checks: exact batch coverage, placeholder multiplicity and markup parity preserved; all values single-line; no vous/votre/vos forms; Unicode decoding and `git diff --check` passed.
- Glossary: informal `tu`; infinitive action buttons; prop = `accessoire`, staff = `bâton`, step = `étape`, beat = `temps`, Library = `Bibliothèque`, Viewer = `visionneuse`, Inbox = `boîte de réception`, effect = `effet`. Flow Arts Composer, file formats, technical units and placeholders are retained.
- Effect names and option strings are display labels mapped through `src/lib/shared/animation-engine/components/effects-panel/effect-ui-label.ts`, so their visible words are translated while keys, identifiers and source lookup strings remain untouched. Visual petals become `pétales`; they are particles, not the protected flow-arts Petal category. Loop in playback options becomes `Boucle`, distinct from the protected notation acronym LOOP.
- Terms outside the glossary, without native/community review: effect look = `rendu`, tuning = `réglages` / `ajuster`, carry = `entraînement`, curl = `tourbillonnement`, hang = `suspension`, falloff = `atténuation`, streak/trail = `traînée`, chase = `chenillard`, outbox = `boîte d’envoi`, claim = `attribution`. These are translation choices, not established community terminology; carry/curl/hang are especially context-sensitive.
- Effect preset names use descriptive French (for example Banked Ember = `Braise couvante`, Fairy Dust = `Poussière de fée`, Inchworm = `Chenille arpenteuse`). Tesla and Sumi are retained. Native review of these creative display names remains outstanding.
- Legitimately identical values include French cognates and loans (Description, Messages, Conversations, Collection, Image, Flash, Capsule, Champagne, Dragon, Glacial, Jungle, Mode, Palette, Plasma, Satin, Sonar, Style, Original, Source, Animal, Halo, Royal, Serpent, Supernova) and technical/proper labels Admin, Bug(s), Type, Destination, Notifications, LED, Tesla and Sumi.
- Prose review using the ai-bust skill: mechanical pass returned `[]` at HIGH/CRITICAL severity. Judgment review preserved notification outcomes, permission distinctions and failure/retry instructions, with repeated labels kept consistent. No native review is claimed.
- No primary-checkout access, other-worktree access, integration, push, dependency installation, broad checks or dev server performed. Branch and worktree remain for the coordinator as instructed.

## P5 — 2026-10-14

- Batch: P5, `batch-P5.json`; 917 translated keys, 0 retranslated keys, 0 review entries. Actual content covers training, site/FAQ copy, onboarding, Composer demos, notifications, pictograph descriptions, shared controls, playback, LOOP/bridge controls, tutorials, colors, animation, tunnels and pattern strips. No guide or verified lesson keys occur in this batch.
- Initial apply: `messages/fr.json: inserted 917, replaced 0, refused 0`.
- Final apply after conjugating pattern sentence verbs: `messages/fr.json: inserted 0, replaced 917, refused 0`.
- Catalog diff before ledger: only `messages/fr.json` changed; 917 insertions, 0 deletions. Exact comparison confirmed all supplied keys added, all previous values unchanged, and every output value applied.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final result: `Test Files 1 passed (1)`; `Tests 66 passed (66)`; duration 7.59s; exit 0. The initial gate also passed all 66 tests before the sentence verb adjustment.
- Focused checks: exact batch coverage, placeholder multiplicity, HTML tag/attribute parity, single-line values, no vous/votre/vos forms, valid Unicode and `git diff --check` passed.
- Glossary: informal `tu`; infinitive action buttons; Box = `Carré`, Diamond = `Diamant`, prop = `accessoire`, placement = `position`, step = `étape`, beat = `temps`, turn = `tour`, performer = `artiste`, library = `bibliothèque`, mirrored = `Miroir`, reflection = `réflexion`. In the training auto-advance keys, English beat means sequence step and becomes `étape` per section 8. Brand names and motion/placement/VTG labels retain the glossary forms, including Alpha/Beta/Gamma, Prospin/Antispin, Shift, Dash, Float, Static and Split-Same/Split-Opp/Tog-Same/Tog-Opp/Quarter-Same/Quarter-Opp.
- Terms outside the glossary, without native/community review: bridge letter = `lettre de liaison`, trail = `traînée`, glyph = `glyphe`, grid join = `jonction des grilles`, knob/bulb (club ends) = `pommeau`/`bulbe`, authored performer = `artiste créé`, Shape Matrix = `matrice de formes`. FAQ factual and software availability claims are translated from the supplied English, not independently verified.
- Source/runtime limitation observed: `src/lib/shared/create/components/pattern-strip/pattern-strip-display.ts` currently localizes sentence subjects, verbs, amounts, connectors and masks only when `getLocale() === "de"`. The French catalog entries are supplied, with conjugated verbs for sentence use, but enabling those French runtime paths is outside this translation-only scope. No source files changed.
- Legitimately identical values (29): protected product/prop names, notation and the placeholder-only `{count}` value; French cognates/loans including Mode, Score, Tempo, Visible, Notation, Animation, Canon, Notifications, Messages, Module, Action, Efforts, Orange, Cyan, Violet, Magenta, Turbulence, Public, Max and Flow. `Pro → Arc · Anti → Concave` uses protected categories and French-identical geometry labels.
- Prose review using ai-bust: mechanical pass reported eight CRITICAL emoji findings, all on the eight `fullscreen_prompt_message_*` entries and all copied from the corresponding English source. Retained for source fidelity under the translation brief; no added emoji or other HIGH/CRITICAL findings. Judgment review preserved FAQ points, tutorial steps, error/retry instructions and source distinctions. No native review is claimed.
- No primary-checkout access, other-worktree access, integration, push, dependency installation, broad checks or dev server performed. Branch and worktree remain for the coordinator as instructed.

## REV (coordinator, 2026-10-14)

Astra back-translation review of the P batches: SAMPLE 172 / FLAGGED 2 /
1.2%. Applied the single-turn wording fix. Dismissed the request to write the
Petals effect as "Petal": effect names describe real flower petals and
translate normally.

## P6 - 2026-10-14

- Batch: P6, `batch-P6.json`; 0 translated keys, 21 retranslated keys, 0 review entries.
- Apply result: `messages/fr.json: inserted 0, replaced 21, refused 0`.
- Catalog diff before ledger: only `messages/fr.json` changed; 21 insertions, 21 deletions. Exact comparison verified that only the 21 batch values changed and only petal words changed; all other text is preserved.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Result: `Test Files 1 passed (1)`; `Tests 66 passed (66)`; duration 32.89s; exit 0.
- Glossary: followed the coordinator's explicit 2026-10-14 clarification overriding the glossary's older protected Petal entry. Ordinary nouns use masculine `pétale` / `pétales`, with singular `demi-pétale`, `aucun pétale` and `{count} pétale`; plural counts use `pétales`. Existing masculine articles and adjectives already agree. Flower and every other word remain unchanged; initial label capitalization is preserved.
- Uncertain: none. No native review is claimed.
- `git diff --check` passed. No primary-checkout access, other-worktree access, integration, push, dependency installation, broad checks or dev server performed. Branch and worktree remain for the coordinator as instructed.

## Z1 - 2026-10-14

- Batch: Z1, `batch-Z1.json`; 5 translated keys, 11 retranslated keys, 0 review entries. Retranslations follow the new English from the Zan's Diamond guide rewrite.
- Apply result: `messages/fr.json: inserted 5, replaced 11, refused 0`.
- Catalog diff before ledger: only `messages/fr.json` changed; 16 insertions, 11 deletions. Exact comparison confirmed that precisely the 16 batch entries changed, every output value was applied, and all values are single-line.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Result: `Test Files 1 passed (1)`; `Tests 66 passed (66)`; duration 26.49s; exit 0.
- Glossary: Zan's Diamond and Zan Moore remain unchanged; motion types remain Shift and Dash, including in prose. Diamond grid = `grille Diamant`; the geometric diamond in prose = `diamant`; hand path = `trajectoire` / `trajectoire pour une main`; beat = `temps`; step = `étape`; variation = `variante`; prop = `accessoire`; Practice = `Entraînement`. Informal singular address is retained and the collection button uses the infinitive `Ouvrir`.
- Wording: `en avance` describes a hand's lead along the path; `à rebours` describes reversing its direction. The new text preserves the odd/even lead distinction, eight possible starting steps, and the distinction between 23 derived variants and 24 total versions. Removed source claims about prop rotation and mirror images were not retained.
- Prose review with ai-bust: mechanical HIGH/CRITICAL scan returned `[]`; judgment review preserved the new source's meaning and counts. `git diff --check` passed.
- Uncertain: none. No native review is claimed. Source factual claims were translated as supplied, not independently verified.
- No primary-checkout access, other-worktree access, integration, push, dependency installation, broad checks or dev server performed. Branch and worktree remain for the coordinator as instructed.

## Read-back — 2026-11-13

- Scope: every key of `messages/en.json` whose prefix is in `released` (`scripts/i18n-released-prefixes.json`): **9,138 released keys**, read back in 43 chunks grouped by prefix.
- Filled: **202** (the missing keys, including the new keys from the hardcoded sweep). Changed: **270** (off 235, wrong 35). Left as is: **8,666**.
- Full change list with before, after, read-back and grade: `E:/tka-languages/runs/fr/changes.json` (outside the repo, for Ilo).
- Contract test: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts` → `Tests 4 failed | 68 passed (72)`. Every French check passes. The four failures are outside French: the English-fallback check lists 107 keys, all in `de` (expected outside the German run), and the es, it and pt released-coverage floors (8,936 of 9,138, under 0.98), which come from the new sweep keys those catalogs do not have yet. This run did not touch those files.
- Checks: JSON parses, `git diff --check` clean, every placeholder, tag and entity in a changed value matches English, no vous/votre/vos left in released French, no CW/CCW letters left in released French.

### Term decisions

- Glossary over termbase: `scripts/i18n-termbase.json` lists fr Prop, Staff, Losange and trajet, while the glossary (which says it comes first) and the catalog use accessoire, bâton, Diamant and trajectoire de la main. Kept the glossary forms and moved the few strays (Losange, Prop, Trajet) to them. Ilo should align the termbase fr column.
- Base Motions = Mouvements de base (`generator_level_no_turns`, was Sans tours). The Base level blurb keeps "Sans tours" because the English there says "No turns".
- Effort (Shape Engine, viewer) stays Effort, the usual French Laban term. The missing Laban effort names: Glide = Glisser, Dab = Tapoter, Press = Presser, Punch = Frapper; Elastic = Élastique, Bounce = Rebond, Anticipation = Anticipation.
- Orientation chips were already French (Horaire, Antihoraire, Horaire·intérieur and so on); no CW/CCW letters remain.
- Mirrored = échanger gauche et droite, Flipped = échanger haut et bas (`loop_picker_description_mirrored` / `_flipped`), not vertical/horizontal.
- LOOP labels set to the glossary forms Miroir / Pivoté / Inversé / Échangé where some had nouns (Rotation, Échange).
- Latin labels restored where they had been translated: Cross-Shift (was Déplacement croisé), Shape Engine (was Moteur de formes), Zeta, Eta, Choreo Cards.
- step = étape whenever "beat" means a position in the sequence (Post Studio overlays, viewer counts, Practice totals). temps stays where beat is a musical count (Compose tap tempo, rhythm help, viewer shortcut). Practice uses both, and Ilo may want one rule there.
- Following (creator) = Abonné (was Suivant, "Next"). Spell tab = Épeler (was Invoquer, "cast a spell"). Ink swatch India = Encre de Chine (was Inde, the country).
- vous forms found in auth, feedback, settings and guide strings moved to tu.
- Four Level 1 guide keys (`verified_level1_hm_gamma_98`, `_101`, `_102`, `verified_level1_hm_type2_116`) had sentences shifted between neighbouring keys; each now matches its own English.
- Templates that take a location or noun (`{point}`, `{location}`, pictograph placement nouns) were reworded so the inserted French word reads right without gender agreement.
- Spacing: 784 older values use a plain space before : ; ! ?. Changed values use U+00A0. The older ones were not churned, so a mechanical pass is left for later.
- Lowercase pro/anti/antispin in the Level 1 pool captions follows the English; left alone (case only).

### Unsure

| Key                                     | English                                    | French                                            | Read-back                                           | Why                                                                                                                                                                             |
| --------------------------------------- | ------------------------------------------ | ------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `browse_grid_skewed`                    | Skewed                                     | Mixte                                             | Mixed                                               | Glossary pairs Mixed/Skewed grid = grille mixte; generator_level_skewed already says Grille mixte. If the chip means a skewed (oblique) grid, Oblique would be the alternative. |
| `browse_collections_founding_book_name` | Classic Book Variations                    | Variantes Book classiques                         | Classic Book variants                               | 'Book' is a named TKA reversal pattern; kept in English as a proper name. Translate as 'livre' only if the owner prefers.                                                       |
| `browse_collections_founding_tka3_name` | TKA 3: Speaking Sentences                  | TKA 3 : Parler en phrases                         | TKA 3: Speak in sentences                           | Deck title; chose parallel infinitives with Apprendre les lettres / Écrire des mots. learn_concept_words_alpha_beta_name carries the same TKA 1 title and should match.         |
| `color_value_custom`                    | Custom                                     | Personnalisée                                     | Customized (fem.)                                   | Assumed it qualifies couleur.                                                                                                                                                   |
| `guide_eightstep_path_ahead_title`      | Left hand ahead                            | Main gauche en avance                             | Left hand early                                     | Read as timing (quarter-box paths), not spatial position; old text said devant/derrière (in front/behind)                                                                       |
| `library_look_trail_loop_clear`         | Loop-clear trail                           | Traînée effacée à chaque boucle                   | Trail erased at each loop                           | Assumed the trail clears when the animation loops; longer than EN.                                                                                                              |
| `pictograph_placement_move_left`        | Move left                                  | Côté gauche                                       | Left side                                           | Visible label inside the 'Move {left prop}' button; means move the left one, not move leftward. Used a side label to avoid gender agreement between accessoire and main.        |
| `pictograph_placement_move_right`       | Move right                                 | Côté droit                                        | Right side                                          | Same as move_left.                                                                                                                                                              |
| `shape_engine_trace_this`               | Trace this                                 | Tracer cette forme                                | Trace this shape                                    | Key not found in src; assumed it refers to the shown flower/shape.                                                                                                              |
| `shape_engine_solo_anti_mode`           | {petals}-petal {mode}-mode antispin flower | Flower Antispin à {petals} pétales en mode {mode} | Antispin Flower with {petals} petals in {mode} mode | Assumed {mode} is the grid mode (box/diamond); key not found in src.                                                                                                            |
| `tab_browse_saved`                      | Saved work                                 | Créations enregistrées                            | Saved creations                                     | Saved work is generic; chose créations over a stiff literal                                                                                                                     |
| `tab_stage_editor`                      | Stage                                      | Plateau                                           | Stage floor                                         | Scène is already taken by tab_stage_scene; Plateau keeps the two tabs distinct                                                                                                  |
| `viewer_detail_flow`                    | Flow                                       | Fluidité                                          | Fluidity                                            | mandala colour-mode chip (Solid / Flow); left unchanged, but a shorter adjective like Fluide may read better beside Uni                                                         |
| `viewer_ui_pill_continuous_short`       | Cont.                                      | Cont.                                             | Continuous (abbreviated)                            | assumed short for continu/continuous; same abbreviation works in French                                                                                                         |

### English to its owner

- `browse_audit_hands_right_angle`: Gamma described as a right angle; left unchanged per brief (Austen wants 'hands adjacent').
- `create_ui_loop`: EN says 'Loop' but the Spell settings section holds LOOP components; French now shows LOOP. EN may want the capitals too.
- `create_tour_help_tnd_tip`: EN says 'each beat' for a sequence position; French uses étape (step) per the step-over-beat rule.
- `create_deep_loop_cannot_split`: EN says 'beats' for sequence positions; French uses étapes.
- `create_deep_loop_flipped_description`: EN says '(horizontal axis)'; brief prefers top/bottom wording. French follows EN, left unchanged.
- `create_action_help_flip_fulldesc`: EN describes Flip as 'vertically' / 'vertical variations'; brief prefers top/bottom wording. French follows EN, left unchanged.
- `create_action_detail_mirror`: EN says 'Flips horizontally' for Mirror; French follows EN.
- `guide_l2_open_close_intro`: Gamma explained via the 90° angle; left as is per the gamma rule
- `guide_l2_print_openingclosingpage_0`: Same 90° angle wording for Gamma; left as is
- `guide_l2_print_twoturnsshiftspage_2`: EN typo: '2 thumb switch' should be 'switches'
- `landing_spinner_mode_selection`: 'Spinner Mode Selection' is internal-sounding for an aria label; French kept as 'Sélection du mode spinner'.
- `learn_timing_intro_placement_gamma`: Gamma described as 'A right angle apart'; left as 'À angle droit' per brief.
- `learn_placement_comparison_gamma`: Gamma described as 'A right angle apart'; left as 'À angle droit' per brief.
- `learn_placement_gamma_geometry`: Gamma described as 'a right angle'; left as is per brief.
- `learn_reference_reading_choreo_cards`: EN says 'Hand Motions' for the Reading a Choreo Card reference; looks like a copy error.
- `learn_placement_build`: Fragment 'Build a' + placement name + 'placement' cannot follow French word order; current 'Construire une' left.
- `pictograph_desc_group_gamma`: Gamma described as 'right angle'; left as 'Gamma (angle droit)' per brief.
- `prop_pair_which_hand`: Key name says which_hand but EN text is about which props; translated the text.
- `tab_desc_browse_gallery`: EN says 'Browse and browse sequences' (duplicated word)
- `tab_desc_browse_sequences`: EN says 'Browse and browse sequences' (duplicated word)
- `tab_browse_collections`: key name says collections but EN says Library; translated EN as Bibliothèque
- `tab_desc_browse_visuals`: description just repeats the tab label; same for drafts/saved/your_visuals/your_videos/following descs
- `train_step_advance_tap`: EN is 'Tap or Voice' for tap, voice and both options; tap/voice should probably say just Tap / Voice
- `train_step_advance_voice`: EN is 'Tap or Voice', same as the both option
- `train_timed_config_title`: EN title repeats the description sentence; FR follows EN
- `verified_level1_gamma_definition`: gamma described as right angle; left unchanged per brief
- `verified_level1_placements_seo_description`: gamma described as right angle; left unchanged per brief
- `verified_level1_guide_page_seo_4`: gamma described as right angle; left unchanged per brief

### May not fit

- `generator_loop_all_four`
- `library_look_trail_loop_clear`
- `module_hand_paths`
- `playback_audit_visual_progress_bar_in_word_header`
- `shape_engine_mode_same`
- `shape_engine_mode_opposite`
- `tab_browse_saved`
- `tab_choreo_card_print_prep`

## Unreleased features — 2026-11-14

- Keys filled: 729 (arena 43, community 20, connect 65, hall 39, mandala 30, poi 41, premium 45, voice 56, watch 24, post 366). Informal `tu`, infinitive-free imperative labels as in the existing catalog.
- Left English on purpose (tools only Austen uses): admin, moderation, skel2tka, scheduler, gallery, character.
- Applying in en.json key order moved 72 existing lines in `messages/fr.json` (diff shows 72 deletions, all re-added elsewhere); no existing value changed.

| Term | Decision |
| --- | --- |
| step (sequence) | étape |
| beat (music / tapped beat in Post Studio, crop, card ring) | temps |
| timeline / track or lane / layer | timeline / piste / calque |
| playhead | tête de lecture |
| keyframe | image clé |
| take (filmed video) | prise |
| crossfade / dissolve / fade through black | fondu enchaîné / fondu / fondu par le noir |
| canvas | canevas |
| peek strip, breakdown | bande, décomposition |
| Train module | Entraînement (matches `module_train`) |
| Hall of Shame, Reels | kept in English as proper names |
| counterclockwise / clockwise | sens antihoraire / sens horaire |

### Unsure

| Key | English | French | Read-back | Why |
| --- | --- | --- | --- | --- |
| `hall_of_shame_gate_title` (and `_title`, `_enter`) | Hall of Shame | Hall of Shame | Hall of Shame | Treated as a feature name; translate if the owner prefers |
| `hall_of_shame_cat_*` | Creative / Crude / Profanity | Créatives / Grossières / Vulgaires | Inventive / Coarse / Vulgar | Feminine plural agrees with séquences |
| `post_editor_split_peel` | Peel | Décollage | Peeling off | Style name of a split effect; meaning guessed |
| `post_editor_split_spread` | Spread | Écartement | Spacing apart | Same |
| `post_editor_tool_fly` / `post_editor_fly_run` | Fly into next | Envol vers le suivant | Flight to the next one | Effect name |
| `post_editor_titles_lit` | Light one letter | Éclairer une lettre | Light up a letter | Assumed a highlight effect on one letter |
| `post_editor_card_ring*` | Ring on beats | Anneau sur les temps | Ring on the beats | Visual ring on a card, assumed |
| `post_editor_lift_*` | Lift panel | Remonter le panneau | Raise the panel | Reads as raising the canvas |
| `post_stage_3d_shot_orbit` | Circle around | Tour complet | Full circle | Camera orbit |
| `post_stage_3d_scene` | Scene | Décor | Setting | Scène would collide with stage (scène 3D) |
| `post_editor_hook_spoken` | How to say it | Comment le dire | How to pronounce it | Meaning of the field unclear |
| `post_editor_tool_look` | Look | Aspect | Appearance | Short tool tab label |
| `post_editor_split*` | Split hands | Séparer les mains | Separate the hands | Feature name |
| `mandala_n_fold` | {count}-fold | Ordre {count} | Order {count} | Symmetry order |
| `watch_title` | Watch | Regarder | Watch | Page title; could stay Watch |

### English to its owner

- `arena_*`, `poi_lab_beat_*`, `connect_*beat*`: EN says beats for sequence positions; French uses étapes.
- `mandala_copy_count`, `mandala_filter_all`, `poi_lab_beat_count`, `poi_lab_beat_number`, `voice_sessions_days_ago`/`hours_ago`/`minutes_ago`, `voice_sessions_event_count`: EN wraps the placeholder in literal quotes (for example `"{count}" beats`), which looks like an extraction slip; French drops the quotes.
- `arena_battle_sign_in_required` etc.: EN says Battle in `arena_stats_empty`; French calls the tab Duel throughout, check against the tab name.
- `connect_beat_of`, `connect_*_beat`: EN uses Beat for sequence steps.
- `connect_sharing_sequence`: text says "Search for users above to invite them", does not match the key name.
- `connect_sessions_found`: no plural form in EN ("{count} session found"); French has the same singular form.
- `premium_faq_a_refund`, `premium_cta_price_amount`: support address and dollar price are hardcoded.
- `premium_early_access_message`: copy mentions "active development".
- `post_editor_card_ring_at`, `post_editor_split_*`: field labels in sentence fragments ("Every", "Leaves at") depend on layout.

### May not fit

- `post_editor_tool_split_hands`
- `post_editor_split_stays_apart`
- `post_editor_lift_step_across`
- `post_editor_lift_step_down`
- `post_editor_lift_in_here`
- `post_editor_lift_out_here`
- `post_editor_titles_park`
- `post_editor_card_qr_exit`
- `post_editor_card_ring_song_beat`
- `post_curve_preset_ease_in_out`
- `post_stage_3d_default_value`
- `post_editor_use_omega_template`
- `premium_cta_unlock`
- `premium_cta_cancel_note`
