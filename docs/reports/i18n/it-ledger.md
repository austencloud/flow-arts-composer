# Italian translation ledger

## 2026-10-14 — R1

- Scope: 1121 translated keys, 3 retranslate entries, 0 review entries.
- Applied exclusively through the supplied apply-batch.js and out-R1.json.
- Initial apply: `messages/it.json: inserted 1121, replaced 3, refused 0`.
- Final apply after clarifying the Continue filter explanation: `messages/it.json: inserted 0, replaced 1124, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; duration 7.77s.
- Before adding this ledger, the diff contained only messages/it.json: 1124 insertions, 3 deletions, net 1121 lines. `git diff --check` passed.
- Glossary: Box is Quadrato in all three retranslate entries and new grid prose. The existing browse_grid_box already read Quadrato and remains so. Diamond is Diamante; prop is attrezzo; placement is posizione; sequence position is passo; musical count is battito; turn is giro. Tu address and imperative buttons throughout.
- Kept TKA categories including Shift, Dash, Static, Float, Pro and Anti, Flower terminology, LOOP, product names, notation letters, compass-point codes and placeholders. Translated spelled-out compass directions. Used orario/antiorario for rotation and interno/esterno in compact orientation labels.
- Other wording: Construct → Costruisci; Assemble → Assembla; setup → configurazione; pattern → schema; Mirror → Specchia; Flip → Ribalta; Rewind → Riavvolgi. Preserved Hall of Shame as a named destination absent from the glossary.
- Text review: ai-bust mechanical pass on the batch output reported no HIGH/CRITICAL findings; manually reviewed translations against the English source and glossary.
- Uncertain: the glossary does not specify Construct, Assemble or Hall of Shame localization. The choices above are provisional pending native/product review. No native reviewer participated in this run.
- Delivery: committed on codex/i18n-it for the coordinator. No integration, push, dev server, installation, build or broad type-check was run.

## 2026-10-14 - R2

- Scope: 871 translated keys, 0 retranslate entries, 0 review entries; all supplied keys completed.
- Applied exclusively through the supplied apply-batch.js with out-R2.json and batch-R2.json.
- Apply result: `messages/it.json: inserted 871, replaced 0, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; duration 11.30s.
- Before appending this section, `git diff --stat` showed only messages/it.json: 871 insertions, 0 deletions. Confirmed all preexisting catalog values unchanged and exactly the 871 batch keys added. Placeholders (including occurrence counts), markup tags and single-line values checked against the supplied source.
- Glossary: Box -> Quadrato; Diamond -> Diamante; placement -> posizione; hand path -> percorso della mano; prop -> attrezzo; staff -> bastone; pictograph -> pittogramma; sequence positions -> passo; turn -> giro; downbeat -> battere; timing remains timing. Tu address and second-person imperative buttons throughout.
- Preserved notation names, letters and data: Alpha/Beta/Gamma, Pro/Anti, Shift/Dash/Static, Prospin/Antispin/Isolation, Split-Same/Tog-Same/Quarter-Opp/Quarter-Same, TKA, VTG, LOOP, Codex, Composer, Flow Arts Composer, Choreo Cards, compass-point codes and every placeholder. Normalized category and placement capitalization in prose where English used lowercase names.
- Other wording: Tap Route -> Tocca il percorso; bridge letter -> lettera ponte; streak -> serie; game Bloom/Blooms -> fioritura/fioriture; hold -> sosta or resta, according to context. Reversal -> inversione where the source describes spin-direction changes.
- Text review: ai-bust mechanical pass on out-R2.json finished with `[]` (no HIGH/CRITICAL findings) after replacing source em dashes with colons and expressing the fire feedback without the emoji. Manually reviewed meaning, glossary terms and button phrasing.
- Uncertain: the glossary does not specify Tap Route, bridge letter, game Bloom/Blooms, or reversal; choices above are provisional pending native/product review. Kept the technical loanword dataframe in learn_place_1_5_description because the English explicitly uses it; no independent claim about the data model was established. No native reviewer participated in this run.
- Delivery: committed on codex/i18n-it for coordinator integration. No primary checkout access, integration, push, installation, dev server, build, broad type-check or prohibited validator was run.

## 2026-10-14 - R3

- Scope: 1107 translated keys, 0 retranslate entries, 0 review entries; all supplied keys completed.
- Applied exclusively through the supplied apply-batch.js with out-R3.json and batch-R3.json.
- Apply result: `messages/it.json: inserted 1107, replaced 0, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; duration 6.95s.
- Before appending this section, `git diff --stat` showed only messages/it.json: 1108 insertions, 1 deletion, net 1107 lines. Confirmed exactly the 1107 batch keys added and all preexisting catalog values unchanged. Placeholder names and occurrence counts, markup restrictions and single-line values checked against the supplied source. `git diff --check` passed.
- Glossary: Box -> Quadrato; Diamond -> Diamante; joined grids -> griglie congiunte; placement -> posizione; prop -> attrezzo; hand path -> percorso della mano; sequence position -> passo; musical count -> battito; turn -> giro. Tu address and second-person imperative buttons throughout. Kept Static and Shift category labels, Alpha/Beta/Gamma, LOOP, Post Studio, Flow Arts Composer, compass-point codes and all placeholders.
- Playback loop -> ripetizione, distinct from notation LOOP. Smart Collection -> raccolta intelligente. Visuals -> creazioni visive. Fork -> Crea copia; Remix -> Rielabora; Mirror -> Specchia; Flip -> Ribalta; mirrored -> speculare; rotated -> ruotato; swapped -> scambiato; inverted -> invertito; rewound -> riavvolto. Matched the R1 Mirror/Flip verbs.
- Retained legitimate Italian loanwords and notation-only strings identical to English (for example Account, Video, Tunnel, performer, FPS, Alpha and parameter-only labels). Preserved TKA Core as a collection/product name; localized the separate short Core label as Base. Palette display labels were translated where they have an Italian equivalent; no identifiers or keys were changed.
- Text review: ai-bust mechanical pass on out-R3.json finished with `[]` (no HIGH/CRITICAL findings), after replacing source em dashes with ordinary punctuation. Manually reviewed meaning, terminology consistency and compact labels.
- Uncertain: the glossary does not specify Stage, Creep, Effort, Smart Collection, Visuals or Fork. Used Scena, Aumento graduale, Sforzo, raccolta intelligente, creazioni visive and Crea copia respectively; these choices are provisional pending native/product review. The glossary does not establish whether the short Core shelf label must remain branded; retained TKA Core and used Base only for the standalone short label. No native reviewer participated in this run.
- Delivery: committed on codex/i18n-it for coordinator integration. No primary checkout access, integration, push, installation, dev server, build, broad type-check or prohibited validator was run.

## 2026-10-14 - R4

- Scope: 852 translated keys, 0 retranslate entries, 0 review entries; all supplied keys completed.
- Applied exclusively through the supplied apply-batch.js with out-R4.json and batch-R4.json.
- Apply result: `messages/it.json: inserted 852, replaced 0, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; duration 9.72s.
- Before appending this section, `git diff --stat` showed only messages/it.json: 853 insertions, 1 deletion, net 852 lines. Confirmed exactly the 852 batch keys added and all preexisting catalog values unchanged. Placeholder names and occurrence counts, markup restrictions and single-line values checked against the supplied source. `git diff --check` passed.
- Glossary: tu address and second-person imperative buttons; sequence positions -> passi; prop -> attrezzo; performer and timing retained. Preserved LOOP, TKA, Flow Arts Composer, Composer, Post Studio, Choreo Cards/Choreo Card, platform names, file formats, URLs and all placeholders. Rotated LOOP prose -> LOOP ruotati.
- Matched existing navigation and tool labels: Construct -> Costruisci; Assemble -> Assembla; Fuse -> Unisci; Tunnel retained; Turn Pattern -> Schema di giri; Choose Start -> Scegli inizio; Rewind -> Riavvolgi. Setup -> configurazione; pattern -> schema. Theme and gradient display labels localized without changing identifiers. Legitimate Italian loanwords identical to English remain, including Account, Video, Reel, Standard, Cinema, Neon, Aurora, Timing, Rendering, Tempo and Mandala; Pride retained as the theme name.
- Post Studio wording: take -> ripresa; landing -> arrivo (the props reaching their destination, not a physical landing on the floor); tap -> tocco; map timing -> mappa il timing; move -> movimento; pass -> passaggio; held -> in sosta; playhead -> cursore di riproduzione. Used griglia for the timing grid and passo for sequence positions in the beat carousel. Rendering actions -> Genera, with rendering retained for progress states. Footer -> piè di pagina; caption -> didascalia; preset -> preimpostazione.
- Text review: ai-bust mechanical pass on out-R4.json reported `clean: no mechanical tells found` at HIGH severity and above. Manually reviewed meaning, glossary terms, existing navigation labels and compact labels. Short labels remain single-line; Condividi and Indietro use the standard Italian labels despite being longer than Share and Back.
- Uncertain: the glossary does not define Post Studio take, landing, held, move, pass, or timing-map terminology. The choices above are provisional pending native/product review, particularly arrivo for landing and in sosta for held animation. The glossary does not establish whether theme display names must stay English; followed the existing R3 approach of translating display labels while preserving identifiers. No native reviewer participated in this run.
- Delivery: committed on codex/i18n-it for coordinator integration. No primary checkout access, integration, push, installation, dev server, build, broad type-check or prohibited validator was run.

## 2026-10-14 - R5

- Scope: 516 translated keys, 0 retranslate entries, 0 review entries; all supplied keys completed.
- Applied exclusively through the supplied apply-batch.js with out-R5.json and batch-R5.json.
- Initial apply: `messages/it.json: inserted 516, replaced 0, refused 0`.
- Final apply after aligning terminology with earlier Italian batches: `messages/it.json: inserted 0, replaced 516, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; duration 12.91s.
- Before appending this section, `git diff --stat` showed only messages/it.json: 516 insertions, 0 deletions. Confirmed exactly the 516 batch keys added and all preexisting catalog values unchanged. Checked placeholder names and occurrence counts, markup and single-line values against the batch source. `git diff --check` passed.
- Glossary: tu address and second-person imperative buttons; prop -> attrezzo; collection -> raccolta; library -> libreria; sequence positions -> passi; placement -> posizione; clockwise/counterclockwise -> orario/antiorario; performer retained. Preserved TKA, LOOP, Flow Arts Composer, Choreo Cards, platform names, shortcut key names and placeholders.
- Matched earlier Italian batches: Mirror -> Specchia; Flip -> Ribalta; Rewind -> Riavvolgi; Smart Collection -> raccolta intelligente; Visuals -> creazioni visive; preset -> preimpostazione. Hall of Shame retained as the existing named destination. Studio retained for the abbreviated Post Studio module label. Retained the data-like example your_username unchanged.
- Other wording: Jump to -> Vai a; flow identity -> identità nelle flow arts; Realm -> Reame; prop skill -> abilità con un attrezzo. Kept Home, Arena, Mandala, Video and Tunnel where the Italian label is legitimately identical to English. Translated all supplied module and tab keys under the explicit batch scope.
- Uncertain: the glossary does not define Jump to, flow identity, Realm or prop skill; choices above are provisional pending native/product review. It does not explicitly establish Hall of Shame as a protected brand; retained it for consistency with earlier batches. No native reviewer participated in this run.
- Delivery: committed on codex/i18n-it for coordinator integration. No primary checkout access, integration, push, installation, dev server, build, broad type-check or prohibited validator was run.

## REV (coordinator) — 2026-10-14

- gpt-6-astra review of a 233-key sample flagged 8 (3.4%); all fixes applied, plus the same thumb-end fix in learn_staff_thumb_end_mark.
- Full In/Out orientation labels now match the glossary (Verso l’interno, Verso l’esterno); Codex restored as a product name; Double-Staff uses bastone doppio.
- Gate: `Tests 66 passed (66)`.

## 2026-10-14 - P1

- Scope: 401 translated keys, 0 retranslate entries, 0 review entries; all supplied keys completed. The actual batch contains guide keys (hub, Codex, Level 2, motion paths, Zan's Diamond, Prospin and spin ratios).
- Applied exclusively through the supplied apply-batch.js with out-P1.json and batch-P1.json.
- Initial apply: `messages/it.json: inserted 401, replaced 0, refused 0`.
- Final apply after reviewing stitched sentences: `messages/it.json: inserted 0, replaced 401, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; duration 15.24s.
- Before this ledger addition, `git diff --stat` showed only messages/it.json: 401 insertions, 0 deletions. Confirmed all 401 batch keys present, preexisting catalog values unchanged, matching placeholder names and occurrence counts, matching markup and single-line values. `git diff --check` passed.
- Glossary: tu address and second-person imperative actions; Level -> Livello; turn -> giro; prop -> attrezzo; staff/double staff -> bastone/bastone doppio; hand path -> percorso della mano; Box -> Quadrato; Diamond -> Diamante; musical beat -> battito; sequence step -> passo; Practice -> Pratica. Full orientation phrases verso l'interno/verso l'esterno throughout. Preserved TKA, The Kinetic Alphabet, Codex, Composer, Zan's Diamond, Shift/Dash/Static/Float/Pro/Anti, Prospin/Antispin/Inspin/Isolation/Extension/Flower, Alpha/Beta/Gamma, letters, notation examples and placeholders. Ordinary geometric petal counts use petalo/petali.
- Path labels: Arc -> Arco; Concave -> Concavo; Linear -> Lineare; Hybrid -> Ibrido; Shape Matrix -> matrice delle forme; Third Order -> Terzo ordine. Motion -> Movimento; Playback -> Riproduzione; Prop tips -> Punte degli attrezzi; Effort -> Sforzo, consistent with earlier batches.
- Checked the ratios page's split strings against their call sites. Shape Engine is the inserted runtime name, so adjoining articles and participles are masculine. Split sentences around inline section links retain the teaching point and grammatical Italian, including moving the below reference before the link.
- Text review: ai-bust mechanical pass on final out-P1.json returned `[]` at HIGH severity and above. Manually reviewed source meaning, glossary categories, numerical teaching steps and compact labels.
- Uncertain: no glossary entries for stagger, lap, glyph slots, flower carrier, cat-eye or driving styles. Used sfasamento, passaggio (to distinguish laps from TKA giri), spazi superiore/inferiore, percorso portante, occhio di gatto and stili di conduzione. These choices await native/product review. The source phrase negative space or a turn is ambiguous about the kind of turn; retained spazio negativo o un giro without adding a body-turn claim. No native reviewer participated in this run.
- Delivery: committed on codex/i18n-it for coordinator integration. No primary checkout access, integration, push, installation, dev server, build, broad type-check or prohibited validator was run.

## 2026-10-14 - P2

- Scope: 401 translated keys, 0 retranslate entries, 0 review entries; all supplied keys completed. The actual batch contains Level 2 guide prose, the printable guide, grid and placement explanations, runtime controls and the animation companion.
- Applied exclusively through the supplied apply-batch.js with out-P2.json and batch-P2.json.
- Initial apply: `messages/it.json: inserted 401, replaced 0, refused 0`.
- Final apply after terminology review: `messages/it.json: inserted 0, replaced 401, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; duration 18.90s.
- Before this ledger addition, `git diff --stat` showed only messages/it.json: 401 insertions, 0 deletions. Confirmed exactly the 401 batch keys added, all preexisting values unchanged, identical placeholder names and counts, identical markup tags and attributes/counts, and single-line values. `git diff --check` passed.
- Glossary: tu address and second-person imperative actions; Level -> Livello; Type -> Tipo; turn -> giro; prop -> attrezzo; staff -> bastone; hand path -> percorso della mano; Box -> Quadrato; Diamond -> Diamante; placement -> posizione; centric -> centrico. Full orientation phrases verso l'interno/verso l'esterno, including diagrams and arrow sequences. Preserved TKA, The Kinetic Alphabet, Codex, LOOP placeholders, Alpha/Beta/Gamma, Split-Same/Tog-Same/Split-Opp/Tog-Opp, Shift/Dash/Static/Pro/Anti, Prospin/Antispin/Isolation/Extension, letters, code parameters, notation tuples, CSS attributes and colors. Static/Shift titles legitimately remain identical to English.
- Matched P1 glyph terminology: spazi superiore/inferiore. Leading/following -> mano che precede/mano che segue; opening/closing -> apertura/chiusura. Described Same/Opp dots as points for the same/opposite direction while preserving s/o parameters. Thumb end/pinky end -> estremita sul lato del pollice/mignolo, distinguishing staff ends from fingers. Linear extension -> Extension lineare to preserve the protected flow arts term.
- Controls: Mirror -> Specchia; Hand Swap -> Scambia le mani; Revert -> Ripristina; Reset -> Reimposta; Remix -> Ricombina; staged steps -> passi preparati; animation companion -> animazione di supporto. Compact labels stay single-line.
- Text review: ai-bust mechanical pass on final out-P2.json returned `[]` at HIGH severity and above. Manually reviewed meaning, teaching-step order, orientation phrases, emphasis and compact labels.
- Uncertain: the glossary does not define opening/closing, leading/following, Same/Opp dot terminology, staged steps, animation companion or Remix; the choices above await native/product review. As in P1, the source phrase negative space or a turn does not establish the kind of turn; retained spazio negativo o un giro without adding a body-turn claim. Preserved the source's turn counts and in/out examples, including compressed in-to-in examples, without inferring intermediate states. No native reviewer participated in this run.
- Delivery: committed on codex/i18n-it for coordinator integration. No primary checkout access, integration, push, installation, dev server, build, broad type-check or prohibited validator was run.


## 2026-10-14 - P3

- Scope: 676 translated batch entries, 0 retranslate entries, 0 review entries; all supplied keys completed. Actual contents: 239 Shape Engine keys and 437 verified Level 1 guide keys, including print labels, SEO and animation controls.
- Applied exclusively through the supplied apply-batch.js with out-P3.json and batch-P3.json.
- Initial apply: `messages/it.json: inserted 676, replaced 0, refused 0`.
- Final apply after text review: `messages/it.json: inserted 0, replaced 676, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Initial result: 65 passed, 1 failed. Six markup-bearing mnemonic phrases were identical to English. Added Italian glosses consistently to their caption, inline and print versions while keeping the English initials mnemonic visible; did not change the test.
- Final result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; duration 9.22s.
- Before this ledger addition, `git diff --stat` showed only messages/it.json: 676 insertions, 0 deletions. Confirmed exactly the 676 batch keys added, all preexisting catalog values unchanged, matching placeholder names/counts and markup tags/attributes/counts, and all values single-line. `git diff --check` passed.
- Glossary: tu address and second-person imperative actions; Level -> Livello; Type -> Tipo; Box -> Quadrato; Diamond -> Diamante; turn -> giro; prop -> attrezzo; staff/double staff -> bastone/bastone doppio; placement -> posizione; hand path -> percorso della mano; sequence position -> passo; musical count -> battito. Full orientation phrases verso l'interno/verso l'esterno, including print diagrams. Preserved TKA, The Kinetic Alphabet, LOOP, Codex, Shape Engine, Spin Science, named matrix titles, Zan's Diamond, motion categories, flow arts jargon, VTG labels, placement names, letters, sequence words, placeholders, CSS attributes and colors.
- Transform terms: Mirrored -> speculare; Rotated -> ruotato; Swapped -> scambiato. Aligned earlier batches: Effort -> Sforzo; driving styles -> stili di conduzione; thumb/pinky end -> estremita sul lato del pollice/mignolo; leading/following -> mano che precede/segue; opening/closing -> apertura/chiusura. Geometric petal count -> petali, as in P1; retained Flower/Isolation/Prospin/Antispin as jargon.
- Mnemonic glosses: Disco Jam (jam da discoteca), Exploding Kitten (gattino esplosivo), Fruity Loops (anelli alla frutta), Magic Potion (pozione magica), Never Quit (non mollare mai), Open Road (strada aperta). These phrases teach DJ/EK/FL/MP/NQ/OR initials, so the English phrase remains alongside its translation rather than losing the letter association.
- Text review: ai-bust mechanical pass on final out-P3.json returned `[]` at HIGH severity and above. Manually reviewed source meaning, teaching-step order, emphasis, orientation phrases and compact labels. No native reviewer participated.
- Uncertain: the glossary does not define wall plane/wheel plane, negative space, hand/prop/full reversals, realization or Ratio Playground. Used piano frontale/piano della ruota, spazio negativo, inversione della mano/dell'attrezzo/completa, realizzazione and area rapporti; these await native/product review. The bilingual mnemonic presentation also awaits product review. Source teaching claims and ratios were preserved without independently validating them.
- Delivery: committed on codex/i18n-it for coordinator integration. No primary checkout or other worktree accessed, integration, push, installation, dev server, build, broad type-check or prohibited validator run.
