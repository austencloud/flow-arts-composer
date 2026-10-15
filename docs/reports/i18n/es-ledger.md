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
