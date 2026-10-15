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
