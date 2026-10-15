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
