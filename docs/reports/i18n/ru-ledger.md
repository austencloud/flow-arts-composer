## R1 — 2026-10-14

- Batch: R1. Added 1121 keys; retranslated 0; review entries 0 (both optional batch sections are empty).
- Apply: `messages/ru.json: inserted 1121, replaced 0, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; duration 18.48s.
- Before ledger creation, catalog diff: 1122 insertions, 1 deletion, only `messages/ru.json`; the former last entry receives a comma. `git diff --check` passed.
- Output audit: 1121 keys, 0 placeholder-multiplicity or multiline issues.
- Glossary: lowercase вы; infinitive action labels; последовательность, позиция, шаг, доля, оборот, реквизит. Grid labels use Ромб and Квадрат. Category names, LOOP, brand names, Beta, point identifiers, numeric values, and notation remain unchanged. Generic counters use forms such as «Шагов: {count}».
- Other choices: Tunnel → туннель; Shape Matrix → матрица форм; setup → набор настроек; reversals → смена направления. CW/CCW UI labels use по часовой / против часовой.
- Uncertain: the glossary does not define Construct and Assemble surface names; both use сборка in context. A native/product reviewer should confirm whether these surfaces need distinct Russian names.
- Uncertain: named rhythm-template labels are translated descriptively; no native review or live UI inspection was performed in this scoped catalog run.
- Source fidelity: retained the English help text's differing descriptions of inversion and rewind rather than reconciling product behavior. No independent behavior claim is made.
