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
