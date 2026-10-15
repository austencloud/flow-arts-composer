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
- Source scope: the actual supplied P5 keys cover training, site and FAQ, onboarding, Composer demonstrations, notifications, pictograph descriptions, shared controls, playback, LOOP selection, tutorials, colors, animation, tunnels and pattern strips. They are not primarily guide_/verified_ teaching keys as the briefing description suggests. The exact supplied batch was translated without adding other keys.
- Uncertain: knob / bulb have no reviewed Portuguese glossary entries; rendered pomo / bulbo for prop-end tracking labels. Native terminology review remains needed.
- Uncertain: authored performers uses performers com coreografia própria, and stage position frame uses referencial de posição no palco. These source UI terms have no glossary definitions; no additional behavior was assumed.
- Uncertain: 1 point across / 2 points across uses 1 ponto de distância / 2 pontos de distância. The English does not specify an axis or explicitly say whether this is shared-point count; no axis was invented. Shape Matrix uses matriz de formas, but this surface name has no explicit glossary entry.
- No native-speaker review performed. No primary checkout access, dependency installation, broad checks, server, integration, or push performed. Changes remain on the assigned worker branch for coordinator integration, as requested.
