# Spanish translation ledger

## R1 — 2026-10-14

- Scope: 1121 translated entries, 3 retranslation entries, 0 review entries. All 1124 required output keys are present. No native-language review was performed.
- Applied with the supplied `apply-batch.js es <output-file> <batch-file>` command. Result: `messages/es.json: inserted 1121, replaced 3, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Gate result: `Test Files  1 passed (1)` and `Tests  66 passed (66)`; duration 7.96s.
- Additional focused checks: all required keys present; placeholder occurrence counts and markup preserved; all values single-line; no usted/ustedes/vosotros/vuestro forms. Result: 0 errors. `git diff --check` passed.
- Catalog diff before this ledger: only `messages/es.json`, 1124 insertions and 3 deletions. One retranslation entry (`browse_grid_box`) already read `Cuadrado`; its required output remains `Cuadrado`.
- Glossary choices: neutral Latin American Spanish with tú and infinitive action labels. Used posición, cuadrícula, pictograma, secuencia, paso, tiempo, vuelta, sentido de giro, intérprete, biblioteca, and prop/props. Box grid is Cuadrado, Diamond is Diamante. Product names, motion category names, coordinates, notation letters, and sequence data remain unchanged. Continuous prose explaining VTG timing uses juntas, alternadas, a un cuarto, misma dirección, and dirección opuesta.
- Other wording choices: Construct → Construir; Assemble → Ensamblar; Shape Matrix → matriz de formas; realization → realización; reversal → inversión; setup → configuración; preset → preajuste; solo choreography → coreografía individual; Hall of Shame → salón de la vergüenza. The glossary does not supply Spanish equivalents for these terms. CW/CCW labels use horario/antihorario, including interradial combinations; hand initials use I/D while grid coordinates remain N/E/S/W.
- Source uncertainty: `create_tour_help_loop_type_bullet_4` describes inversion as Pro↔Anti and Static↔Dash, while `create_action_detail_invert` says base motion types remain unchanged. Both meanings were preserved. This translation run did not establish which description matches runtime behavior.
- Source uncertainty: `create_transform_rewind_aria` describes appending a reversed sequence, while `create_action_help_rewind_fulldesc` describes starting at the end and playing backward. Both meanings were preserved; runtime behavior was not investigated.
- Delivery: committed on the assigned `codex/i18n-es` branch for the coordinator. No integration, push, server, installation, or broad check was run.

## R2 — 2026-10-14

- Scope: 871 translated entries, 0 retranslation entries, 0 review entries. All 871 required output keys are present. Notation names, compass coordinates, shared Spanish words, units, and placeholder-only strings remain identical where appropriate. No native-language review was performed.
- Applied with the supplied `apply-batch.js es <output-file> <batch-file>` command. Result: `messages/es.json: inserted 871, replaced 0, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Gate result: `Test Files  1 passed (1)` and `Tests  66 passed (66)`; duration 6.57s.
- Additional focused checks: 871/871 required keys applied; placeholder occurrence counts and markup preserved; all values single-line; no usted/ustedes/vosotros/vuestro forms; all 2002 preexisting catalog values unchanged. Result: 0 errors. `git diff --check` passed.
- Catalog diff before this ledger: only `messages/es.json`, exactly 871 insertions and 0 deletions.
- Glossary choices: neutral Latin American Spanish with tú and infinitive buttons. Used posición, cuadrícula, pictograma, secuencia, paso for sequence positions, tiempo for musical counts, vuelta for rotation counts, sentido de giro, intérprete, bastón, and prop/props. Box is Cuadrado and Diamond is Diamante. Preserved product names, motion categories (including Static), Prospin/Antispin/Isolation, Alpha/Beta/Gamma, VTG labels, letters, sequence words, and grid coordinates. Timing prose uses juntas, alternadas, a un cuarto, misma dirección, and dirección opuesta.
- Other wording choices without dedicated glossary rows: bridge letter → letra puente; reversal → inversión (consistent with R1); Tap Route → Tocar recorrido; trace → trazar; route → recorrido; deck → baraja; dataframe → tabla de datos. The dataframe source wording and its count of 47 letters were preserved; runtime data was not investigated.
- Wording uncertainty: `learn_trace_sync_feedback` says to bring the hands closer together on beat changes. The key and surrounding synchronization context were interpreted as bringing their timing closer together (`Sincroniza más las manos en los cambios de paso`). This run did not establish whether the source intended physical distance instead.
- Copy review: applied the ai-bust mechanical pre-pass and a meaning/terminology judgment pass. Its only HIGH/CRITICAL finding was the fire emoji in `learn_ui_on_fire`; retained because it is present in the English source. No new marketing claims or copy structure were added.
- Delivery: committed on the assigned `codex/i18n-es` branch for the coordinator. No primary-checkout access, integration, push, server, installation, or broad check was run.

## R3 — 2026-10-14

- Scope: 1107 translated entries, 0 retranslation entries, 0 review entries. All 1107 required output keys are present. No native-language review was performed.
- Applied only with the supplied apply-batch.js command. Initial result: `messages/es.json: inserted 1107, replaced 0, refused 0`. Final result after the contextual Static correction: `messages/es.json: inserted 0, replaced 1107, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final gate result: `Test Files  1 passed (1)` and `Tests  66 passed (66)`; duration 5.34s, exit 0.
- Focused contract review: required/applied 1107/1107; all 2873 preexisting catalog values preserved; placeholder occurrence counts and markup preserved; all values single-line; no usted/ustedes/vosotros/vuestro address forms. Result: 0 errors. Final diff whitespace check passed.
- Catalog diff before this ledger: only messages/es.json, 1108 insertions and 1 deletion. Net addition is exactly 1107 lines; the replaced existing line only gained a comma before appended keys.
- Glossary choices: neutral Latin American Spanish with tú and infinitive action buttons. Used posición, cuadrícula, trayectoria de la mano, secuencia, paso, tiempo, vuelta, intérprete, prop/props, Cuadrado and Diamante. Notation labels, product names, coordinates, user names, units and placeholders retained. LOOP remains the notation name; playback loop is repetición. Mandala's Static/Animated control uses Estático/Animado: source shows this is paused versus animated display, not the Static motion category.
- Other wording choices: Smart Collection → colección inteligente; fork → crear copia; remix → remezclar; preset → preajuste; film → filmación; take → toma; stagger → desfase; reversal → inversión (consistent with R1/R2); showcase → muestra; roster view → vista de lista. Palette labels translated as display names; their identifiers were not changed.
- Naming uncertainty: TKA Core / Core are retained as the named shelf for the founding decks. The glossary has no explicit row for this shelf; whether its short name should instead be localized was not established. Post is retained as shorthand for Post Studio.
- Copy review: used the ai-bust mechanical pre-pass on the output (HIGH/CRITICAL findings: none) and a meaning/terminology judgment pass. Existing quotation marks, arrows, shared Spanish words, names, symbols and placeholder-only values retained where appropriate.
- Delivery: committed on the assigned codex/i18n-es branch for the coordinator. No primary-checkout access, integration, push, server, installation, broad checks or prohibited git commands were used.

## R4 — 2026-10-14

- Scope: 852 translated entries, 0 retranslation entries, 0 review entries. All 852 required output keys are present. No native-language review was performed.
- Applied only with the supplied apply-batch.js command. Result: `messages/es.json: inserted 852, replaced 0, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Gate result: `Test Files  1 passed (1)` and `Tests  66 passed (66)`; duration 7.67s, exit 0.
- Focused contract review: required/applied 852/852; all 3980 preexisting catalog values preserved; placeholder occurrence counts and markup preserved; all values single-line; no usted/ustedes/vosotros/vuestro address forms or Unicode replacement characters. Result: 0 errors. `git diff --check` passed.
- Catalog diff before this ledger: only messages/es.json, 853 insertions and 1 deletion. Net addition is exactly 852 lines; the replaced existing line only gained a comma before appended keys.
- Glossary choices: neutral Latin American Spanish with tú and infinitive action buttons. Used secuencia, paso, tiempo, vuelta, sentido de giro, cuadrícula, intérprete, bastón, clava, prop/props, biblioteca and sincronización. Kept Flow Arts Composer, TKA, LOOP, Post Studio, Choreo Cards, platform names, file formats, units, placeholders and URLs. Identical shared words and platform labels such as Celestial, Coral, Aurora, Video, Tempo, Mandala, Reel and Feed + Reels were retained.
- Other wording choices: setup → configuración; preset → preajuste; take → toma (consistent with R3); caption → texto / texto de la publicación; render → renderizar / renderizado; playhead → cabezal de reproducción; landing → llegada (the instant props reach a position); pass → pasada; map timing → sincronizar. Localized visible theme and gradient names without changing identifiers. Construct → Construir and Assemble → Ensamblar follow R1; Fuse → Fusionar, Tunnel → Túnel, and 3D Studio → Estudio 3D are localized navigation names not covered by the glossary's protected-name list.
- Wording uncertainty: the glossary does not specify landing or pass in the timing editor. Used llegada and pasada from the supplied video/tap and repeated-movement context; native acceptance of those terms has not been established. No runtime behavior was investigated.
- Copy review: used the ai-bust mechanical pre-pass on the output (HIGH/CRITICAL findings: none) and a meaning/terminology judgment pass. Repeated account prompts follow the English source; no additional claims were added.
- Delivery: committed on the assigned codex/i18n-es branch for the coordinator. No primary-checkout access, integration, push, server, installation, broad checks or prohibited git commands were used.

## R5 — 2026-10-14

- Scope: 516 translated entries, 0 retranslation entries, 0 review entries. All 516 required output keys are present. No native-language review was performed.
- Applied only with the supplied apply-batch.js command. Initial result: `messages/es.json: inserted 516, replaced 0, refused 0`. Final result after contextual wording corrections: `messages/es.json: inserted 0, replaced 516, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final gate result: `Test Files  1 passed (1)` and `Tests  66 passed (66)`; duration 11.94s, exit 0.
- Focused contract review: required/applied 516/516; all 4832 preexisting catalog values preserved; placeholder occurrence counts and markup preserved; all values single-line; no usted/ustedes/vosotros/vuestro address forms or Unicode replacement characters. Result: 0 errors. `git diff --check` passed.
- Catalog diff before this ledger: only messages/es.json, exactly 516 insertions and 0 deletions.
- Glossary choices: neutral Latin American Spanish with tú and infinitive action labels. Used prop/props, secuencia, paso, cuadrícula, posición inicial, intérprete, biblioteca, ajustes, Crear, Explorar, Aprender and Componer. Preserved Flow Arts Composer, TKA, LOOP, VTG, Poi, Choreo Cards, placeholders and literal keyboard combinations including Shift/Alt/Ctrl/Delete/Escape. The identifier example your_username remains unchanged.
- Other wording choices: keyboard shortcut → atajo de teclado; preset → preajuste; Smart Collection → colección inteligente; Jump to → Ir a; Hall of Shame → Salón de la vergüenza (consistent with R1); Choreo → Coreografía; Realm → Reino; Studio → Estudio for the source navigation label (the protected full name Post Studio was not present). Flip → voltear, mirror → espejar, invert → invertir, rewind → rebobinar. Shift Start is Desplazar inicio because it is an action rather than the Shift motion category.
- Contextual correction: export_ui_performance → Interpretación. MediaPieceCard.svelte and CompositeControls.svelte use this label for the camera/video performance format, establishing that it refers to an artistic performance rather than computing speed.
- Copy review: used the ai-bust mechanical pre-pass on the output (HIGH/CRITICAL findings: none) and a meaning/terminology judgment pass. The English source defines repeated account prompts and navigation descriptions; no additional product claims were introduced.
- Uncertainty: no unresolved glossary questions. Native acceptance of new navigation wording has not been established.
- Delivery: committed on the assigned codex/i18n-es branch for the coordinator. No primary-checkout access, integration, push, server, installation, broad checks or prohibited git commands were used.

## F1 — 2026-10-14

- Scope: 0 translated entries, 3 retranslated entries, 0 review entries. Formal-address correction only; all other wording preserved.
- Applied only with the supplied apply-batch.js command. Result: `messages/es.json: inserted 0, replaced 3, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Gate result: `Test Files  1 passed (1)` and `Tests  66 passed (66)`; duration 6.47s, exit 0.
- Catalog diff before this ledger: only messages/es.json, exactly 3 insertions and 3 deletions. `git diff --check` passed.
- Glossary choices: section 11 informal tú address; Espere → Espera, Seleccione → Selecciona, Inicie → Inicia. These are sentence prompts, not action buttons. No placeholders or markup changed.
- Uncertainty: none.
- Delivery: committed on the assigned codex/i18n-es branch for the coordinator. No integration or push performed.

## REV (coordinator) — 2026-10-14

- gpt-6-astra review of a sample of this wave flagged a handful of keys (see coordinator notes); all fixes applied.
- Codex restored as a product name where older strings translated it; Double-Staff uses the glossary prop term.
- Gate: `Tests 66 passed (66)`.

## P1 — 2026-10-14

- Scope: 401 translated entries, 0 retranslated entries, 0 review entries. All 401 required output keys are present. This batch contains guide prose and labels; no native-language review was performed.
- Applied only with the supplied apply-batch.js command. Initial result: `messages/es.json: inserted 401, replaced 0, refused 0`. Final result after preserving the split Cross-Shift label: `messages/es.json: inserted 0, replaced 401, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final gate result: `Test Files  1 passed (1)` and `Tests  66 passed (66)`; duration 17.45s, exit 0. Rerun after the final label correction.
- Focused contract review: required/applied 401/401; all 5348 preexisting catalog values preserved; placeholder occurrence counts and markup preserved; all values single-line; no usted/ustedes/vosotros/vuestro address forms or Unicode replacement characters. Result: 0 errors. `git diff --check` passed.
- Catalog diff before this ledger: only messages/es.json, exactly 401 insertions and 0 deletions.
- Glossary choices: neutral Latin American Spanish with tú and infinitive action buttons. Used trayectoria de la mano, cuadrícula, posición, vuelta, sentido horario/antihorario, hacia dentro/hacia fuera, prop/props, bastón doble, clava, Diamante, Cuadrado and Práctica. Preserved The Kinetic Alphabet, Codex, Composer, Zan's Diamond, Shift/Dash/Static/Float/Pro/Anti, Dual-Shift/Cross-Shift/Dual-Dash, Prospin/Inspin/Antispin/Isolation/Extension/Flower and notation data. Cross and Dual remain English because CodexSheet.svelte assembles them with -Shift/-Dash into category labels. Ordinary petal counts use pétalo; no Petal category label occurs in this batch.
- Teaching choices: retained the source sentence and step order, all ratio values and formulas, and the distinction between added prop vueltas and laps around the center. Preserved surrounding spaces in sentence fragments used around links/formulas. Arc/Linear/Concave/Hybrid become Arco/Lineal/Cóncava/Híbrida consistently throughout these guides. Third Order becomes Tercer orden; it is not listed as a protected product name in the glossary.
- Other wording choices: stagger → desfase (consistent with earlier batches); lap → recorrido, to distinguish it from a TKA vuelta; driving styles → estilos de conducción; cat-eye → ojo de gato. These terms have no explicit glossary rows; native acceptance of recorrido and estilos de conducción has not been established. Flower remains English as required, even where a Spanish noun would read more naturally.
- Copy review: used the ai-bust mechanical pre-pass on the output (HIGH/CRITICAL findings: none) and reviewed meaning, terminology and split-label composition against the source. No additional product claims were introduced.
- Delivery: committed on the assigned codex/i18n-es branch for the coordinator. No primary-checkout access, integration, push, server, installation, broad checks or prohibited git commands were used.


## P2 — 2026-10-14

- Scope: 401 translated entries, 0 retranslated entries, 0 review entries. All 401 required keys are present. The supplied batch contains Level 2 teaching prose, printable guide text, navigation and animation controls. No native-language review was performed.
- Applied only with the supplied apply-batch.js command. Initial result: `messages/es.json: inserted 401, replaced 0, refused 0`. Final result after preserving notation expression case and the Extension term: `messages/es.json: inserted 0, replaced 401, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final gate result: `Test Files  1 passed (1)` and `Tests  66 passed (66)`; duration 15.04s, exit 0. Run after the final catalog application.
- Focused contract review: required/applied 401/401; all 5749 preexisting catalog values preserved; placeholder occurrence counts, markup tags and attributes, and pipe-separated notation expressions preserved; all values single-line; no usted/ustedes/vosotros/vuestro address forms or Unicode replacement characters. Result: 0 errors. `git diff --check` passed.
- Catalog diff before this ledger: only messages/es.json, exactly 401 insertions and 0 deletions.
- Glossary choices: neutral Latin American Spanish with tú and infinitive action buttons. Used cuadrícula, posición inicial, trayectoria de la mano, vuelta, sincronización, sentido de giro, prop/props, bastón, Diamante and Cuadrado. Orientations use hacia dentro/hacia fuera throughout, including diagrams and arrow expressions. Preserved The Kinetic Alphabet, TKA, Codex, LOOP placeholders, Shift/Dash/Static/Pro/Anti, Dual-Shift/Cross-Shift/Dual-Dash, Prospin/Antispin/Isolation/Extension, placement names, Greek symbols, code examples and notation names such as S-High-One and Lam-Low-One-Closing. The split Dual-Shifts markup and all supplied class/style attributes remain intact.
- Teaching choices: preserved sentence/step order, emphasis on the same terms, all numbers and turn counts, and the distinction between prop rotation and body turns. Used espacio superior/inferior for high/low slot, mano que guía/sigue for leading/following, cambio de orientación del pulgar for thumb switch, apertura/cierre for opening/closing, espacio negativo for negative space, and Extension lineal for linear extension. Same/Opp remain notation labels for the dots; prose explaining the relationship uses misma dirección/dirección opuesta. Kept the source's abbreviated in-to-in example for a two-switch Dash as hacia dentro → hacia dentro without adding an intermediate orientation.
- Copy review: applied the translation and ai-bust guidance within the explicitly supplied scope. Mechanical HIGH/CRITICAL findings on the output: none. Meaning/terminology review preserved source teaching points and introduced no product claims. The requested apply script and focused gate supersede the translation skill's broader audit/regeneration workflow.
- Uncertainty: the glossary has no explicit rows for high/low slots, thumb switch, leading/following or opening/closing. The choices above follow the supplied lessons; native acceptance has not been established. No unresolved protected-term question remains.
- Delivery: committed on the assigned codex/i18n-es branch for the coordinator. No primary-checkout access, other-worktree access, integration, push, server, installation, broad checks or prohibited git commands were used.

## P3 — 2026-10-14

- Scope: 676 translated entries, 0 retranslated entries, 0 review entries. All 676 required keys are present. The supplied batch contains Shape Engine controls and explanatory text, verified Level 1 lessons, print labels, SEO text and animation controls. No native-language review was performed.
- Applied only with the supplied apply-batch.js command. Initial result: `messages/es.json: inserted 676, replaced 0, refused 0`. Final result: `messages/es.json: inserted 0, replaced 676, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final gate result: `Test Files  1 passed (1)` and `Tests  66 passed (66)`; duration 7.01s, exit 0. Run after the final catalog application.
- Initial gate found six English-only mnemonic captions. Added Spanish meanings alongside the original English phrases consistently across 18 captions, labels and print entries. This keeps the initial-letter mnemonic visible while explaining its meaning: Disco Jam (improvisación disco), Exploding Kitten (gatito explosivo), Fruity Loops (bucles frutales), Magic Potion (poción mágica), Never Quit (nunca te rindas), Open Road (camino abierto). Both subsequent gate runs passed. Final wording also clarifies that Level 4 adds quarter-turn increments.
- Focused contract review: required/applied 676/676; all 6150 preexisting catalog values preserved; placeholder occurrence counts, markup tags and attributes preserved; all values single-line; no usted/ustedes/vosotros/vuestro address forms or Unicode replacement characters. Result: 0 errors. `git diff --check` passed.
- Catalog diff before this ledger: only messages/es.json, exactly 676 insertions and 0 deletions.
- Glossary choices: neutral Latin American Spanish with tú and infinitive action buttons. Used prop/props, bastón, cuadrícula, Diamante/Cuadrado, posición, trayectoria de la mano, vuelta, sincronización and sentido de giro. Used full hacia dentro/hacia fuera in prose and diagram labels. Preserved Shape Engine, The Kinetic Alphabet, Vulcan Tech Gospel, TKA, VTG, LOOP, Codex, Zan's Diamond, placement names, motion categories, flow arts jargon, VTG notation labels, letters and sequence words. LOOP transforms use espejado, rotado and intercambiado. Prose distinguishes static adjectives from the Static category.
- Other terminology choices: ratio → proporción; realization → realización; driving styles → estilos de impulso; hand/prop/full reversal → inversión de la mano/del prop/completa; negative space → espacio negativo; body turn → giro corporal; wall/wheel plane → plano de pared/de rueda. Ratio Playground → espacio de proporciones; Level Matrix → matriz de niveles. Kept Lorq's named 144 Shape Matrix in English. Marked the same teaching terms and retained sentence/step order and supplied class/style attributes.
- Copy review: applied the translate skill's source/placeholder/tone guidance within the supplied batch scope; the requested apply script and focused gate supersede its broader audit, sorting and regeneration workflow. ai-bust mechanical HIGH/CRITICAL findings on the output: none. Meaning and terminology judgment review introduced no product claims.
- Uncertainty: the glossary does not explicitly define realization, driving styles, wall/wheel plane, reversal or the Shape Engine surface names. The translations above follow their supplied context; native acceptance has not been established. Bilingual mnemonic renderings also await native review.
- Delivery: committed on the assigned codex/i18n-es branch for the coordinator. No primary-checkout access, other-worktree access, integration, push, server, installation, broad checks or prohibited git commands were used.

## P4 — 2026-10-14

- Scope: 906 translated entries, 0 retranslated entries, 0 review entries. All 906 required output keys are present. The supplied JSON contains feedback, inbox and visual-effect text; it contains no guide_ or verified_ keys despite the prose-oriented batch description. No native-language review was performed.
- Applied only with the supplied apply-batch.js command. Result: `messages/es.json: inserted 906, replaced 0, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Gate result: `Test Files  1 passed (1)` and `Tests  66 passed (66)`; duration 9.28s, exit 0.
- Focused contract review: required/output/applied 906/906/906; all preexisting catalog values preserved; placeholder occurrence counts and markup preserved; all values single-line; no usted/ustedes/vosotros/vuestro address forms or Unicode replacement characters. Result: 0 errors. `git diff --check` passed.
- Catalog diff before this ledger: only messages/es.json, exactly 906 insertions and 0 deletions.
- Glossary choices: neutral Latin American Spanish with tú and infinitive action buttons. Used bandeja de entrada, biblioteca, ajustes, efecto, secuencia, paso, tiempo, prop/props and bastón. Preserved Flow Arts Composer, placeholders, keyboard keys, image formats, units and notation. Loop is an ordinary playback control here and becomes Bucle; it is not the protected LOOP notation label. Petals refers to the visual particle effect, not the protected Petal flow-arts term, and becomes Pétalos.
- Context checks: effect-ui-label.ts maps effect names and traits to visible translation labels, so those labels were translated without altering any effect identifiers. InkCustomize.svelte establishes that India is an ink palette; its label becomes Tinta china while Sumi stays Sumi. SmokeCustomize.svelte identifies Curl as smoke curl strength; used Curvatura. Preserved legitimate identical Spanish words such as General, Color, Animal, Original and Halo, proper names Tesla/Sumi, and compact time values.
- Other terminology choices: feedback → comentario (report-oriented notification text uses reporte); preset → preajuste; look → aspecto; tracking → seguimiento; afterglow → resplandor residual; drift → deriva; carry → arrastre; hang → suspensión; falloff → atenuación; jitter → vibración; Goo → Baba. Kept source sentence order and all stated error recovery, privacy, access and undo conditions.
- Copy review: used the translate and ai-bust skills within the explicit batch scope. The requested apply script and focused gate supersede broader sorting, regeneration and audit steps. ai-bust mechanical HIGH/CRITICAL findings on the output: none. Meaning and terminology review introduced no product claims.
- Uncertainty: the glossary has no explicit rows for visual-effect terms such as carry, hang, curl, jitter or Goo. The choices above follow their effect context; native acceptance has not been established.
- Delivery: committed on the assigned codex/i18n-es branch for the coordinator. No primary-checkout access, other-worktree access, integration, push, server, installation, broad checks or prohibited git commands were used.


## P5 — 2026-10-14

- Scope: 917 translated entries, 0 retranslated entries, 0 review entries. Required/output/applied: 917/917/917. The actual batch contains practice, public-site/FAQ, onboarding, notifications, shared controls, pictograph descriptions, LOOP, tutorial, animation, tunnel and pattern-strip text; no guide_ or verified_ keys occur. No native-language review was performed.
- Applied only with the supplied apply-batch.js command. Result: `messages/es.json: inserted 917, replaced 0, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Gate result: `Test Files  1 passed (1)` and `Tests  66 passed (66)`; duration 10.26s, exit 0.
- Focused contract review: all 7732 preexisting values preserved; placeholder occurrence counts and markup preserved; all output values single-line; no usted/ustedes/vosotros/vuestro address forms or Unicode replacement characters. Result: 0 errors. No short/title/label/button value exceeds both 24 characters and 1.6 times its English length. `git diff --check` passed.
- Catalog diff before this ledger: only messages/es.json, exactly 917 insertions and 0 deletions.
- Glossary choices: neutral Latin American Spanish with tú and infinitive action buttons; posición, cuadrícula, Diamante/Cuadrado, vuelta, sincronización, trayectoria de la mano, prop/props, bastón, abanico, clava, intérprete, bandeja de entrada and ajustes. Preserved TKA, The Kinetic Alphabet, Composer, Flow Arts Composer, Choreo Cards, LOOP, Codex, Shift/Dash/Static/Float/Pro/Anti, Dual-Shift/Cross-Shift/Dual-Dash, Prospin/Antispin, Alpha/Beta/Gamma, VTG labels as supplied, notation data and placeholders. Normalized lowercase descriptive alpha/beta/gamma to the glossary's placement-name capitalization. Kept Shape Engine as the established product name; generic Shape Matrix controls use matriz de formas consistently with existing catalog controls. Flower remains English in the shape-generator description.
- Context checks: practice auto-advance and animation navigation/count controls refer to sequence positions, so beat becomes paso there; musical tempo remains tiempo/BPM. VisualPane.svelte confirms the Beat # toggle controls step numbers. TrailsPanel.svelte confirms Knob/Bulb identify club ends: pomo/bulbo. Effort domain descriptors establish movement qualities, rendered as esfuerzos. Grid-join labels describe one/two-point separation. Tunnel authored means an independently defined performer with its own choreography, rendered as con coreografía propia; source means fuente and start offset means desfase inicial.
- Pattern-strip choices: singular mano izquierda/derecha subjects use gira/invierte el giro; the plural pasos subject uses duran for hold and tienen duraciones distintas for mixed hold values. The mixed-turn adjective is mixtas. Preserved every repeat interval and step placeholder.
- Copy review: applied translate, testing and ai-bust guidance within the explicit batch scope. The supplied apply script and focused gate supersede broad catalog sorting/regeneration. ai-bust mechanical pre-pass found only eight CRITICAL emoji findings, all copied from fullscreen_prompt_message_1 through _8 in English; retained those source symbols for translation fidelity. No HIGH findings. Meaning review preserved source sentence/step order, recovery instructions, conditions and claims.
- Uncertainty: the glossary does not define effort qualities, club-end knob/bulb, tunnel authored performers or generic Shape Matrix controls; the choices above follow source context but have no native acceptance evidence. pattern-strip-display.ts currently localizes several sentence fragments only when locale is de, so these Spanish entries alone do not activate that runtime localization. Runtime changes are outside this worker's authorized paths and were not made.
- Delivery: committed on the assigned codex/i18n-es branch for the coordinator. No primary-checkout access, other-worktree access, integration, push, server, installation, broad checks or prohibited git commands were used.

## REV (coordinator, 2026-10-14)

Astra back-translation review of the P batches: SAMPLE 172 / FLAGGED 5 /
2.9%. Applied two fixes (Composer intro, inbox "moved to original message").
Dismissed three flags asking for English "Petal": counted petals translate
normally under the 2026-10-14 glossary decision.

## Z1 — 2026-10-14

- Scope: 5 translated entries, 11 retranslated entries, 0 review entries (16 total). Retranslations follow the new English, removing the superseded claims about prop rotation and mirrored words. No native-language review was performed.
- Applied only with the supplied apply-batch.js command. Result: `messages/es.json: inserted 5, replaced 11, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Gate result: `Test Files  1 passed (1)` and `Tests  66 passed (66)`; duration 37.27s, exit 0.
- Catalog diff before this ledger: only messages/es.json, 16 insertions and 11 deletions, matching 5 new and 11 replaced keys. `git diff --check` passed.
- Glossary choices: preserved Zan's Diamond, Zan Moore, Shift and Dash. Used cuadrícula Diamante for the named grid and diamante for its shape; trayectoria, tiempo, paso, variación, props and Práctica follow the glossary. Generic playback loop becomes bucle. Labels remain single-line; the collection action uses the infinitive Abrir. Prose addresses the reader with tú.
- Uncertainty: none regarding glossary terms; native acceptance has not been established.
- Delivery: assigned codex/i18n-es branch for the coordinator; no integration or push. The explicit batch apply/gate instructions supersede the translate skill's general catalog rewrite and regeneration workflow.
