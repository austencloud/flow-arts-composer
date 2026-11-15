# Brazilian Portuguese translation ledger

## R1 — 2026-10-14

- Batch: `batch-R1.json`; 1,121 translated keys, 3 retranslation entries, 0 review entries.
- Applied exclusively through the supplied `apply-batch.js` script using `out-R1.json`.
- Apply result: `messages/pt.json: inserted 1121, replaced 3, refused 0`.
- `browse_grid_box` was already `Quadrado`; the other two Box labels were corrected from `Caixa`. There are 1,123 actual added/changed values.
- Catalog diff before this ledger: only `messages/pt.json`; 1,124 insertions, 3 deletions (net +1,121 lines).
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; exit 0.
- Focused output inspection: no missing batch keys, multiline values, Unicode replacement characters, or changed catalog values outside the batch.
- Glossary choices: Brazilian Portuguese with você and infinitive action labels; posição, trajetória da mão, volta, sentido de rotação, grade, Quadrado, Diamante, passo, batida, andamento, props, performer, quiralidade. Motion categories and protected product/notation names remain English. Compass point identifiers remain unchanged; spelled-out compass directions translate. Descriptive timing phrases translate, while protected hyphenated VTG labels remain English. Construct and Assemble are rendered Construir and Montar; transformations use Espelhar, Virar, Inverter, Rotacionar, Trocar and Rebobinar.
- Uncertain: `authored`/`most authored`/`not authored` in performer and formation UI have no glossary entry. Rendered as performers included in creation / more performers included / not individually created; exact domain distinction needs review.
- Uncertain: `bookends` in rhythmic accents is rendered `extremidades`; the source does not establish the exact accented beat positions.
- Uncertain: Shape Matrix `realization` is rendered `realização`; no established Portuguese term is supplied by the glossary.
- Uncertain: `Tunnel` is rendered `túnel`; the glossary does not establish whether this feature name should be protected English.
- No native-speaker review performed. No primary checkout access, dependency installation, broad checks, server, integration, or push performed.

## R2 — 2026-10-14

- Batch: `batch-R2.json`; 871 translated entries, 0 retranslation entries, 0 review entries. Protected names, notation, symbols, and language-neutral templates retain their source values where appropriate.
- Applied exclusively through the supplied `apply-batch.js` script using `out-R2.json`.
- Apply result: `messages/pt.json: inserted 871, replaced 0, refused 0`.
- Catalog diff before this ledger: only `messages/pt.json`; 871 insertions, 0 deletions (net +871 lines).
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; exit 0.
- Focused inspection: all 871 batch entries are present, exactly 871 catalog additions belong to this batch, and no existing values changed. Placeholder names and occurrence counts and markup tags match English; no multiline values or Unicode replacement characters.
- Glossary choices: Brazilian Portuguese with você and infinitive action labels; grade, Quadrado, Diamante, posição, trajetória da mão, volta, sentido de rotação, props, performer, bastão, timing and tempo forte. Sequence positions use passo even where English uses beat. Motion categories, placement names, products, VTG labels and compass identifiers retain English; spelled-out directions translate, with intercardinal rendered colateral. Pro/Anti and Alpha/Beta capitalization follows glossary names in explanatory prose.
- Uncertain: bridge/bridge letter has no glossary entry. The challenge title uses ponte; explanatory text and technical labels use ligação/letra de ligação to describe the connecting function naturally. Native terminology review remains needed.
- Uncertain: Tap Route has no glossary entry; rendered Trajeto por toques consistently as the accessible interaction mode. It is not among the protected product names.
- Uncertain: blooms in challenge names has no glossary entry; rendered florescimentos, keeping it distinct from the protected motion term Flower.
- Uncertain: dataframe is retained as a technical loanword in `learn_place_1_5_description`; the source does not establish a preferred Portuguese domain term.
- No native-speaker review performed. No primary checkout access, dependency installation, broad checks, server, integration, or push performed.

## R3 — 2026-10-14

- Batch: `batch-R3.json`; 1,107 translated entries, 0 retranslation entries, 0 review entries. Protected names, loanwords, notation, and language-neutral templates retain their source values where appropriate.
- Applied exclusively through the supplied `apply-batch.js` script using `out-R3.json`.
- Apply result: `messages/pt.json: inserted 1107, replaced 0, refused 0`.
- Catalog diff before this ledger: only `messages/pt.json`; 1,108 insertions, 1 deletion (net +1,107 lines; the previous final entry gains a comma).
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; exit 0.
- Focused inspection: exactly 1,107 catalog additions, all belonging to this batch; no existing catalog values changed. All output values match the applied catalog. Placeholder names and occurrence counts match English; no added markup tags, multiline values, or Unicode replacement characters. `git diff --check` passed.
- Glossary choices: Brazilian Portuguese with você and infinitive action labels; posição, grade, Quadrado, Diamante, passo, volta, andamento, trajetória da mão, props, performer and timing. Placement names, compass point identifiers, protected product names and Shift remain English. Repetition controls use repetição, while notation uses LOOP. Smart Collection is coleção inteligente; Fork is criar versão; Flip/Flipped are virar/virado, consistent with the earlier transformation vocabulary. Post navigation uses Post Studio.
- Source context: `viewer_ui_static` is the paused/static mandala display option opposite Animated in `MandalaCategoryControl.svelte`, so it is Estático, not the protected TKA motion category Static. `viewer_ui_start` labels a starting position in step numbers and card settings, so it is Início. Linear shifts is movimentos Shift lineares.
- Uncertain: TKA Core / Core are shelf navigation labels in `WorkShelfRail.svelte`, rendered Núcleo TKA / Núcleo. The glossary does not establish whether Core should be protected as a named deck group; native terminology review remains needed.
- No native-speaker review performed. No primary checkout access, dependency installation, broad checks, server, integration, or push performed.

## R4 — 2026-10-14

- Batch: `batch-R4.json`; 852 translated entries, 0 retranslation entries, 0 review entries. Shared Portuguese words, platform terms and glossary loanwords retain identical values where appropriate.
- Applied exclusively through the supplied `apply-batch.js` script using `out-R4.json`.
- Initial apply result: `messages/pt.json: inserted 852, replaced 0, refused 0`.
- Final apply result after two wording adjustments: `messages/pt.json: inserted 0, replaced 852, refused 0`.
- Catalog diff before this ledger: only `messages/pt.json`; 853 insertions, 1 deletion (net +852 lines; the previous final entry gains a comma).
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; exit 0.
- Focused inspection: exactly 852 catalog additions, all belonging to this batch; no existing values changed. All output values match the applied catalog. Placeholder names and counts and markup tags match English; no multiline values or Unicode replacement characters. `git diff --check` passed.
- Glossary choices: Brazilian Portuguese with você and infinitive action labels; salvar, passo for sequence positions, volta, sentido de rotação, andamento, grade, props, performer and timing. Composer, Post Studio, Flow Arts Composer, TKA, LOOP and Choreo Cards remain protected names. Fuse / Assemble / Tunnel use Fundir / Montar / Túnel, consistent with existing Portuguese navigation. Card uses cartão; frame uses quadro; keyframe uses quadro-chave. The source dollar symbol remains unchanged in `$10/mês`; no currency conversion or currency identity is assumed.
- Uncertain: Post Studio take / landing / playhead have no glossary entries. Rendered tomada / chegada / cursor de reprodução; chegada describes each prop's arrival at the target pose. Native terminology review remains needed.
- Uncertain: full account in `share_meta_account_required` is rendered conta completa. The source does not establish its exact distinction from other signed-in account types.
- No native-speaker review performed. No primary checkout access, dependency installation, broad checks, server, integration, or push performed.

## R5 — 2026-10-14

- Batch: `batch-R5.json`; 517 translated entries, 0 retranslation entries, 0 review entries. Admin, Arena, Mandala and Prop retain identical values as shared labels or glossary loanwords.
- Applied exclusively through the supplied `apply-batch.js` script using `out-R5.json`.
- Apply result: `messages/pt.json: inserted 517, replaced 0, refused 0`.
- Catalog diff before this ledger: only `messages/pt.json`; 517 insertions, 0 deletions (net +517 lines).
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; exit 0.
- Focused inspection: 517 output keys match all 517 batch keys and applied values. Placeholder names and occurrence counts match English; no multiline values or Unicode replacement characters. `git diff --check` passed. The ai-bust mechanical pass at HIGH severity returned `[]`; manual review preserved short navigation labels and direct wording.
- Glossary choices: Brazilian Portuguese with você and infinitive action labels; salvar, passo for sequence positions, posição inicial, sequência, coleção, biblioteca and props. Flow Arts Composer, TKA, LOOP, Choreo Cards, Poi and VTG remain protected names. Studio navigation uses Post Studio. Shift in keyboard combinations, Ctrl, Alt, Escape and Delete remain key names. Shift Start is the action Deslocar início rather than the motion category Shift. Flip / Mirror / Invert / Rewind use Virar / Espelhar / Inverter / Rebobinar, consistent with earlier batches.
- Source context: `export_ui_performance` identifies the camera/performance-video format in `MediaPieceCard.svelte` and `CompositeControls.svelte`, so it is Apresentação rather than computer desempenho. `library_ui_looks_in` introduces the source scope in `SmartCollectionRuleSummary.svelte`, rendered Buscar em. `nav_ui_your_username` is a placeholder in both username editors, rendered seu_usuario rather than treated as an actual username. Realm / Collect use Reino / Colecionar, matching existing module labels.
- Uncertain: flow identity and prop preset have no glossary entries; rendered identidade no flow and preset de props. Native terminology review remains needed.
- No native-speaker review performed. No primary checkout access, dependency installation, broad checks, server, integration, or push performed.

## G1 (coordinator) — 2026-10-14

- 4 older keys restored Codex as a product name (was códice): learn_back_to_codex, tab_choreo_card_codex, tab_desc_choreo_card_codex, tab_learn_codex.
- Gate: `Tests  66 passed (66)`.

## REV (coordinator) — 2026-10-14

- gpt-6-astra review of a sample of this wave flagged a handful of keys (see coordinator notes); all fixes applied.
- Codex restored as a product name where older strings translated it; Double-Staff uses the glossary prop term.
- Gate: `Tests 66 passed (66)`.

## P1 — 2026-10-14

- Batch: `batch-P1.json`; 401 translated entries, 0 retranslation entries, 0 review entries. Protected names, loanwords, and language-neutral templates retain identical values where appropriate.
- Applied exclusively through the supplied `apply-batch.js` script using `out-P1.json`.
- Initial apply result: `messages/pt.json: inserted 401, replaced 0, refused 0`.
- Final apply result after checking the inserted Shape Engine name in sentence fragments: `messages/pt.json: inserted 0, replaced 401, refused 0`.
- Catalog diff before this ledger: only `messages/pt.json`; 401 insertions, 0 deletions (net +401 lines).
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; exit 0.
- Focused inspection: exactly 401 catalog additions, all belonging to this batch; no existing catalog values changed. All output values match the applied catalog. Placeholder names and occurrence counts and markup match English; no multiline values or Unicode replacement characters. `git diff --check` passed. The ai-bust mechanical pass at HIGH severity returned `[]`; manual review preserved the source teaching points and step order.
- Glossary choices: Brazilian Portuguese with você and infinitive action labels; posição, grade, Quadrado, Diamante, trajetória da mão, volta, sentido de rotação, bastão and props. Motion categories, placement names, protected products, Zan's Diamond, Prospin/Antispin/Inspin, Isolation/Extension and Flower/Petal stay English, with Flowers/Petals for plurals. Orientations use full para dentro / para fora in prose and labels. Sequence positions use passo; musical counts use batida. Spin ratio uses proporção de rotação; hand cycle uses ciclo da mão; lap uses circuito to distinguish a circuit around the center from the counted prop volta.
- Source context: `src/lib/shared/shape-matrix/app/shape-engine-identity.ts` supplies the literal Shape Engine to the ratios page; the split attribution and explanation strings use masculine agreement around that name. Third Order is rendered Terceira Ordem, and motion-path options use Arco, Linear, Côncava and Híbrida consistently within the guide.
- Uncertain: driving style / carrier path have no glossary entries; rendered estilo de condução / trajetória de suporte. Cat-eye is olho de gato and triquetra is triquetra. Native terminology review remains needed.
- Uncertain: turn in the source phrase negative space or a turn is not defined more precisely; rendered giro without assuming which body part turns. Thumb switch is troca de polegar; the glossary does not specify a Portuguese technical term.
- No native-speaker review performed. No primary checkout access, dependency installation, broad checks, server, integration, or push performed.

## P2 — 2026-10-14

- Batch: `batch-P2.json`; 401 translated entries, 0 retranslation entries, 0 review entries. Protected Static labels retain identical source values where appropriate.
- Applied exclusively through the supplied `apply-batch.js` script using `out-P2.json`.
- Apply result: `messages/pt.json: inserted 401, replaced 0, refused 0`.
- Catalog diff before this ledger: only `messages/pt.json`; 401 insertions, 0 deletions (net +401 lines).
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; exit 0.
- Focused inspection: all 401 batch keys are present and match the applied catalog; exactly 401 catalog additions belong to this batch, and no existing values changed. Placeholder names and occurrence counts and all markup tags/attributes match the source. No multiline values or Unicode replacement characters. `git diff --check` passed. The ai-bust mechanical pass at HIGH severity returned `[]`; manual review preserved teaching points, step order, and emphasized terms.
- Glossary choices: Brazilian Portuguese with você and infinitive action labels; posição, trajetória da mão, volta, sentido de rotação, ponto central, posição cêntrica, bastão, props and timing. Orientations use full para dentro / para fora throughout, including arrow progressions. Motion categories, placement names, protected product names, VTG labels and notation remain English. Shift/Dash are kept singular as category labels even when the English heading pluralizes them. Prospin, Antispin, Isolation and Extension remain English; linear extension is Extension linear. Opening/closing is abertura/fechamento; high/low slots are espaços superior/inferior. Thumb switch uses troca de polegar, consistent with P1. Same/Opp dots are described as pontos de mesma direção / de direções opostas; code parameters s, o, op and cl are preserved.
- Uncertain: leading/following has no Portuguese glossary entry; rendered mão que vai à frente / mão que segue. Native terminology review remains needed.
- Uncertain: high/low slots and opening/closing have no glossary entries; superior/inferior and abertura/fechamento describe their source meaning without establishing an officially reviewed Portuguese technical term.
- Uncertain: turn in negative space or a turn does not specify a body part. Rendered giro, consistent with P1, without assuming which body part turns. Where the source explicitly says body turns, rendered voltas do corpo.
- No native-speaker review performed. No primary checkout access, dependency installation, broad checks, server, integration, or push performed.

## P3 — 2026-10-14

- Batch: `batch-P3.json`; 676 translated entries, 0 retranslation entries, 0 review entries. Of the 676 entries, 82 retain identical source values because they are protected names, notation, numbers, or language-neutral templates.
- Applied exclusively through the supplied `apply-batch.js` script using `out-P3.json`.
- Apply result: `messages/pt.json: inserted 676, replaced 0, refused 0`.
- Catalog diff before this ledger: only `messages/pt.json`; 676 insertions, 0 deletions (net +676 lines).
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; exit 0.
- Focused inspection: all 676 batch keys match the output and applied catalog; exactly 676 new keys belong to this batch, with all existing catalog values unchanged. Placeholder names and occurrence counts and all markup tags/attributes match English. No multiline values or Unicode replacement characters. `git diff --check` passed. The ai-bust mechanical pass at HIGH severity returned `[]`; manual review preserved teaching steps, examples, and highlighted terms.
- Glossary choices: Brazilian Portuguese with você and infinitive action labels; grade, quadrado, diamante, posição, trajetória da mão, volta, sentido de rotação, bastão, props, performer and timing. Sequence positions use passo; musical counts use batida. Orientations use full para dentro / para fora, including captions and print labels. Placement names, VTG labels, motion categories, protected products, sequence words and letters remain English. Prospin, Antispin, Isolation, Flower and Petal remain English; plural Flowers/Petals follows the existing P1 convention. LOOP transforms use espelhado, rotacionado and trocado.
- Mnemonic choice: DJ/EK/FL/MP/NQ/OR phrases retain their English mnemonic alongside a literal Portuguese gloss in the teaching examples, preserving the initial-letter association without inventing replacement mnemonics. Standalone print phrase keys translate the English meaning. No fact or notation corrections were inferred from the source.
- Uncertain: driving styles, realization, crossing and phase have no glossary entries; rendered estilos de condução, realização, cruzamento and fase. Shape Engine remains its existing product name; Level Matrix / Ratio Playground use matriz de níveis / área de proporções. Native terminology review remains needed.
- Uncertain: wall plane / wheel plane, finger-spinning, and hand/prop/full reversals have no glossary entries. Rendered plano de parede / plano de roda, girar o bastão entre os dedos, and reversão da mão / do prop / completa. Leading/following uses mão que lidera / mão que segue. English mnemonic retention with Portuguese glosses needs native pedagogical review.
- No native-speaker review performed. No primary checkout access, dependency installation, broad checks, server, integration, or push performed.

## P4 — 2026-10-14

- Batch: `batch-P4.json`; 906 translated entries (399 effect, 211 feedback, 296 inbox), 0 retranslation entries, 0 review entries. Twenty entries legitimately match English through shared Portuguese words, loanwords, technical terms, or proper names.
- Applied exclusively through the supplied `apply-batch.js` script using `out-P4.json`.
- Apply result: `messages/pt.json: inserted 906, replaced 0, refused 0`.
- Catalog diff before this ledger: only `messages/pt.json`; 906 insertions, 0 deletions (net +906 lines).
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; exit 0.
- Focused inspection: all 906 batch keys match the output and applied catalog; exactly 906 new keys belong to this batch, with all existing catalog values unchanged. Placeholder names and occurrence counts and all markup tags/attributes match English. No multiline values or Unicode replacement characters. `git diff --check` passed. The ai-bust mechanical pass at HIGH severity returned `[]`; manual review preserved direct wording, short labels, and sentence order.
- Glossary choices: Brazilian Portuguese with você, infinitive action labels, salvar, sequência, coleção, biblioteca, caixa de entrada, visualizador, bastão and props. Sequence positions use passo; musical counts use batida. Flow Arts Composer remains the product name. Effect trail uses rastro consistently, preset uses predefinição, afterglow uses resplendor, and velocity threshold uses the full limiar de velocidade.
- Source context: `src/lib/shared/animation-engine/components/effects-panel/effect-ui-label.ts` explicitly localizes display copy while preserving effect option values and presets. Consequently effect and preset display labels are translated, while code identifiers, Tesla, LED and Sumi remain unchanged. Pétalas describes the visual particles rather than the protected flow-arts term Petal.
- Source limitations: `feedback_needs_info_hint` contains only the fragment `details below.`. `feedback_no_status_feedback`, `feedback_priority_title` and `feedback_lane_title` receive parameters at their call sites that are absent from their English values. Translations preserve the supplied English text and placeholder sets; no missing content or parameters were invented.
- Uncertain: creative preset names have no reviewed Portuguese glossary entries. Cold gas-blue burn uses chama azul-gás fria; Gilt Wyrm uses serpente dourada; Banked Ember uses brasa abafada. Native terminology review remains needed.
- No native-speaker review performed. No primary checkout access, dependency installation, broad checks, server, integration, or push performed. Changes remain on the assigned worker branch for coordinator integration, as requested.

## P5 — 2026-10-14

- Batch: `batch-P5.json`; 917 translated entries, 0 retranslation entries, 0 review entries. Protected names, notation and language-neutral templates retain identical values where appropriate.
- Applied exclusively through the supplied `apply-batch.js` script using `out-P5.json`.
- Initial apply result: `messages/pt.json: inserted 917, replaced 0, refused 0`.
- Final apply result after terminology review: `messages/pt.json: inserted 0, replaced 917, refused 0`.
- Catalog diff before this ledger: only `messages/pt.json`; 917 insertions, 0 deletions (net +917 lines).
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; exit 0. The initial gate also passed before the terminology corrections.
- Focused inspection: all 917 batch keys match the output and applied catalog; exactly 917 new keys belong to this batch, with all existing catalog values unchanged. Placeholder names and occurrence counts and markup tags match English. No multiline values or Unicode replacement characters. `git diff --check` passed.
- Glossary choices: Brazilian Portuguese with você and infinitive action labels; posição, grade, Quadrado, Diamante, volta, bastão, props, performer and timing. Sequence positions use passo; musical counts use batida. Protected products, placement names, motion categories and VTG labels remain English. Shape Engine retains the existing product name. Reversal uses reversão, consistent with previous batches; inverted LOOP transforms use invertido. Trail uses rastro; preset uses predefinição. Shape Matrix uses matriz de formas; motion paths uses trajetórias de movimento.
- Source scope: the actual supplied P5 keys cover training, site and FAQ, onboarding, Composer demonstrations, notifications, pictograph descriptions, shared controls, playback, LOOP selection, tutorials, colors, animation, tunnels and pattern strips. They are not primarily guide*/verified* teaching keys as the briefing description suggests. The exact supplied batch was translated without adding other keys.
- Uncertain: knob / bulb have no reviewed Portuguese glossary entries; rendered pomo / bulbo for prop-end tracking labels. Native terminology review remains needed.
- Uncertain: authored performers uses performers com coreografia própria, and stage position frame uses referencial de posição no palco. These source UI terms have no glossary definitions; no additional behavior was assumed.
- Uncertain: 1 point across / 2 points across uses 1 ponto de distância / 2 pontos de distância. The English does not specify an axis or explicitly say whether this is shared-point count; no axis was invented. Shape Matrix uses matriz de formas, but this surface name has no explicit glossary entry.
- No native-speaker review performed. No primary checkout access, dependency installation, broad checks, server, integration, or push performed. Changes remain on the assigned worker branch for coordinator integration, as requested.

## REV (coordinator, 2026-10-14)

Astra back-translation review of the P batches: SAMPLE 172 / FLAGGED 3 /
1.7%. Applied all three fixes (single-turn wording, authored performers,
Shift as the motion name).

## P6 — 2026-10-14

- Batch: `batch-P6.json`; 0 translated entries, 21 retranslated entries, 0 review entries. Terminology correction only.
- Applied exclusively through the supplied `apply-batch.js` script using `out-P6.json`.
- Apply result: `messages/pt.json: inserted 0, replaced 21, refused 0`.
- Catalog diff before this ledger: only `messages/pt.json`; 21 insertions, 21 deletions (21 corrected keys; net 0 lines).
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; exit 0.
- Glossary choice: the coordinator's explicit 2026-10-14 P6 instruction supersedes the glossary's older protected Petal entry. Ordinary singular/plural nouns use pétala/pétalas, with Pétala at the start of labels. Existing feminine agreement (meia, uma, duas, alinhadas, Mesmas) already fits and needs no changes. Flower/Flowers remains exactly as supplied.
- Focused inspection: exactly the 21 retranslation keys changed. Reversing only the Petal/Petals substitutions reproduces every original string, confirming that all other wording, placeholders, punctuation, markup and protected names are unchanged. `git diff --check` passed.
- Uncertain: none. No native-speaker review performed.
- Changes remain on the assigned worker branch for coordinator integration. No primary checkout access, install, broad checks, dev server, integration or push performed.

## Z1 — 2026-10-14

- Batch: `batch-Z1.json`; 5 translated entries, 11 retranslated entries, 0 review entries. Retranslations follow the new English for the rewritten Zan's Diamond guide.
- Applied exclusively through the supplied `apply-batch.js` script using `out-Z1.json`.
- Apply result: `messages/pt.json: inserted 5, replaced 11, refused 0`.
- Catalog diff before this ledger: only `messages/pt.json`; 16 insertions, 11 deletions (16 batch keys; net +5 lines). `git diff --check` passed.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; exit 0.
- Glossary choices: Zan's Diamond and Zan Moore stay unchanged; motion types stay Shift and Dash. Diamond grid uses grade Diamante, with diamante for the geometric shape in prose. Hand path uses trajetória da mão; timing counts use batida; sequence steps use passo. Props stays props; Practice uses Treinar. Ordinary repeating loops use ciclo. Action text uses Abrir a coleção.
- Removed explanations about prop rotation and mirrored words because they are absent from the new English; no claims were added. Placeholders {name} and {n} remain unchanged.
- Uncertain: none. No native-speaker review performed.
- Changes remain on the assigned worker branch for coordinator integration. No primary checkout access, install, broad checks, dev server, integration or push performed.

## Read-back — 2026-11-13

Every released string (prefix in `released` in `scripts/i18n-released-prefixes.json`) was read against its English and graded right, off or wrong. Fixes went through a script that keeps key order and 2-space JSON. The full change list, with a read-back for every changed string, is in the translation desk's `runs/pt/changes.json`.

- Released keys: 9,138. Filled: 202. Changed: 315 (282 off, 33 wrong). Left as is: 8,621. No released key is missing or empty now.
- Contract test: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts` gives `Tests  4 failed | 68 passed (72)`. All six pt tests pass. The fallback test fails only on 107 de.json keys, as expected. The es, fr and it released-coverage ratchets also fail (8936 of 9138 is under their 0.98 floor); those catalogs were not touched here.
- `git diff --check` is clean, `messages/pt.json` parses, and placeholders and tags match English on every changed key (checked by the apply script and the contract test).

### Term decisions

- Turn stays volta (glossary and catalog use), not the termbase's giro. Body turns are giros do corpo.
- Diamond stays Diamante or diamante, not the termbase's Losango. Box is Quadrado.
- Prop is prop everywhere. Acessório, adereço and objeto were replaced, and none remain in released strings.
- Hand path is trajetória da mão. Rota and percurso were replaced.
- Step, not beat, for a position in a sequence: Passo nº, Números dos passos, Carrossel de passos, Total de passos, and the animation shortcuts. Batida stays where the English counts musical or timing beats (BPM, durations in beats, effect intervals, 16-count sequences) and in the CAPs and Zan's Diamond prose (see Unsure).
- Take is tomada. Effort is esforço (Laban). Pattern is never modo. Playground is Área de exploração; Ratio Playground is Área de proporções.
- Placement is posição. Preset is predefinição. Rotate is Rotacionar. Spin ratios are Proporções de rotação. Setup steps are Etapa.
- Nível N and Tipo N take a capital. "The Kinetic Alphabet" takes "de" ("uma ideia de The Kinetic Alphabet"), never "do The".
- Latin labels stay Latin with a capital: Static, Float, Gamma, Alpha, Beta, Antispin, Prospin, Inspin, Extension, Flower, Dash, Shift, LOOP. VTG mode names (Split-Same, Quarter-Opp and the rest) stay English.
- Orientation chips are spelled out (horário, anti-horário). No CW or CCW remains in released Portuguese.
- `loop_picker_description_mirrored` reads left-right and `_flipped` reads top-bottom.
- Screen-reader lines that put a noun into a slot use the colon form, so no article or gender agreement is needed ("Posicione: {prop}.", "Ocultar movimento: {hand}").
- Choreo Cards, Post Studio, Shape Engine, Composer and Flow Arts Composer stay as names. Physical deck cards are cartas; on-screen cards are cartões.

### Unsure

| Key | English | Portuguese | Read-back | Why |
| --- | --- | --- | --- | --- |
| `browse_collections_founding_book_name` | Classic Book Variations | Variações clássicas do livro | Classic variations from the book | "Book" may be a proper name (the printed TKA book) and might need a capital or a title. |
| `browse_collections_founding_book_description` | The base motions at one turn, with the book reversal — both props reverse every step. | Os movimentos base com uma volta e a reversão do livro: os dois props invertem o sentido a cada passo. | The base motions with one turn and the book reversal: both props reverse direction every step. | Same as above: "book reversal" may be a named term. |
| `create_workspace_history_spell_loop` | Apply spell loop | Aplicar repetição da palavra | Apply the word's repetition | "Spell loop" is unclear in English. I read it as repeating the spelled word. |
| `generator_period_halved` | Halved | Pela metade | By half | Halved and Quartered use "Pela metade" and "Em quartos". A native speaker may prefer another short form. |
| `guide_zans_*`, CAPs prose | (beats) | batida | beat | Kept batida because the English counts beats on purpose there. The step rule could be argued for these lines. |
| `learn_staff_cardinal_E`, `learn_staff_cardinal_W` (also N, S, `learn_ui_cardinal_directions`, `learn_staff_outer_end`) | E, W | E, W | E, W | Kept the English letters to match the grid labels. Portuguese compass letters would be L and O. |
| `pictograph_placement_announce_place` and the other placement announcements | Place the {prop}. | Posicione: {prop}. | Place: {prop}. | Neutral colon form chosen because the slot noun's gender is unknown. It reads a little clipped. |
| `tab_create_shape_engine` | Shape | Shape | Shape | Kept as part of the Shape Engine name. The old "Moldar" (to mould) misread it. "Formas" is the other option. |
| `viewer_ui_effort_name_glide`, `_dab`, `_press`, `_punch` | Glide, Dab, Press, Punch | Deslizar, Pontuar, Pressionar, Socar | Glide, Dab, Press, Punch | Laban effort actions use the usual Portuguese Laban verbs. Elastic, Bounce and Anticipation (Elástico, Quique, Antecipação) are animation terms, not Laban. |
| `shape_engine_trace_this` | Trace this | Traçar | Trace | The object of "this" is not clear from the code, so the verb stands alone. |
| `shape_engine_ratio_playground` | Ratio Playground | Área de proporções | Ratio area | Matches the existing catalog. It loses some of the sandbox sense. |
| `tutorial_back_card` | Back to card | Voltar à carta | Back to the card | Left as is. If this card is on screen rather than printed, it should be cartão. |
| `share_studio_deep_summary_missed` | {count} missed | {count} perdidas | {count} missed (landings) | Feminine agreement assumes the missed things are landings (chegadas). |
| SEO titles (`guide_*_seo_title`, `verified_level1_guide_page_seo_*`) | Flow Arts Notation Guide | Guia de notação de flow arts | Flow arts notation guide | SEO titles keep "flow arts" while site copy says "artes de flow". Left as is because the titles may target the English search term. |

### English to its owner

- `learn_timing_intro_placement_gamma`, `learn_placement_comparison_gamma`, `pictograph_desc_group_gamma`, `browse_audit_hands_right_angle`, `learn_placement_gamma_geometry`, `verified_level1_gamma_definition`, `verified_level1_placements_seo_description`, `verified_level1_guide_page_seo_4`: the English describes Gamma as a "right angle". The Portuguese mirrors it (ângulo reto) and was left unchanged.
- `feedback_needs_info_hint`: the English is a sentence fragment.
- `learn_play`: one key serves the games header ("Play" as in games) and the play-animation label. These need two keys.
- `learn_reference_reading_choreo_cards`: says "Hand Motions" where the page's term differs.
- `shape_engine_pictographs_calibration`: "Level 4 pictograph are" needs a plural noun.
- `tab_desc_browse_gallery`, `tab_desc_browse_sequences`: "Browse and browse sequences" repeats a word.
- `train_step_advance_tap`, `train_step_advance_voice`, `train_step_advance_both`: all three say "Tap or Voice".
- `train_timed_config_title`: repeats the description sentence instead of being a title.
- `site_faq_try_props`: "Try props in the spinner". "Spinner" probably means the viewer.
- `shape_engine_solo_pro`, `shape_engine_solo_pro_mode`: the keys say pro but the English says inspin. Worth a check that inspin is intended.

### May not fit

- `create_action_orientation_clockIn_short`, `create_action_orientation_clockOut_short`, `create_action_orientation_counterIn_short`, `create_action_orientation_counterOut_short`
- `create_ui_orientation_counter_short`, `create_controls_ccw_short`
- `pictograph_placement_move_left`, `pictograph_placement_move_right`
- `tab_hand_paths_hand_path_builder` (Construtor de trajetórias da mão)
- `tab_choreo_card_print_prep` (Preparo de impressão)
- `tab_retro_history`, `tab_retro_timeline`
- `share_video_carousel_off` (Desligado)

## Unreleased features — 2026-11-14

- Keys filled: 747 (arena 43, attribution 14, beta 4, community 20, connect 65, hall_of_shame 39, mandala 30, poi_lab 41, premium 45, voice_sessions 56, watch 24, post_* 366). Missing count for wanted prefixes is now 0. Register unchanged: Brazilian Portuguese, você, infinitive action labels.
- Left English on purpose (tools only Austen uses): admin, moderation, skel2tka, scheduler, gallery, character.

### Term decisions

| English | Portuguese | Note |
| --- | --- | --- |
| beat (step of a sequence) | passo | connect_*beat*, arena/poi/watch counts |
| beat (song beat, tapped) | batida | Post Studio, matches `clip_beats` |
| track / lane | faixa | layer = camada |
| playhead | indicador (de reprodução) | short in buttons |
| keyframe | quadro-chave | as in R4 |
| crossfade | fusão cruzada | |
| picture in picture | imagem em imagem | |
| card | cartão | Choreo Card kept |
| take | Take | filmed take, loanword |
| hook (tunnel) | gancho | |
| Hall of Shame, Poi Lab, Watch, Reels, Flash | kept English | names |

### Unsure

| key | English | text | read-back | why |
| --- | --- | --- | --- | --- |
| post_curve_preset_overshoot | Overshoot | Ultrapassagem | Going past the target | no settled term |
| post_editor_split_peel/spring | Peel / Spring | Descascar / Mola | Peel off / Spring | effect names |
| post_editor_look_breakdown | Breakdown | Detalhamento | Detailed split | strip name |
| hall_of_shame_cat_* | Creative / Crude | Criativas / Grosseiras | Creative / Coarse | gender agrees with sequências |
| post_editor_tutorial_hint | "move 1" | movimento 1 | move 1 | source wording unclear |

### English to its owner

- `mandala_copy_count`, `mandala_filter_all`, `poi_lab_beat_count`, `poi_lab_beat_number`, `voice_sessions_*_ago`, `voice_sessions_event_count`: values wrap the placeholder in literal straight quotes (`"{count}"`); kept as-is, they will show quotes to visitors.
- `connect_sessions_found` has only a singular form.
- `post_editor_hook_spoken`: "How to say it" is unclear without context.

### May not fit

- `post_editor_tool_fly`, `post_editor_tool_split_hands`, `post_editor_tool_panel_lift`, `post_editor_titles_park`, `post_editor_lift_step_across/down`, `post_stage_3d_spacing`, `post_curve_preset_ease_in_out`, `arena_battle_random_click_to_choose`, `premium_cta_unlock`, `premium_sticky_cta_button`.
