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
