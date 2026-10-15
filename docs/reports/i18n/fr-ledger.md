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
