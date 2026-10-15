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
