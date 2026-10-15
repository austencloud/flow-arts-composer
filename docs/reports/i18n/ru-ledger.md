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


## R2 — 2026-10-14

- Batch: R2. Translated 871 keys; retranslated 0; reviewed 0. The batch has no retranslate or review section.
- Initial apply: `messages/ru.json: inserted 871, replaced 0, refused 0`.
- Final apply after one wording refinement: `messages/ru.json: inserted 0, replaced 871, refused 0`. The script reapplies the complete output; these replacements are not a separate retranslation batch.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; duration 14.39s. The initial gate also passed all 66 tests.
- Before the ledger update, catalog diff: only `messages/ru.json`, exactly 871 insertions. `git diff --check` passed.
- Final output audit: all 871 keys present and equal to their applied catalog values; placeholder multiplicity and markup match English; every value is one line.
- Glossary: lowercase вы, infinitive action labels, последовательность, позиция, траектория руки, тайминг, оборот, реквизит, пиктограмма. Diamond/Box use Ромб/Квадрат. Sequence positions use шаг; musical downbeats use сильная доля. Counts use number-independent constructions such as «Переходов: {count}».
- Placement names stay Alpha/Beta/Gamma under the explicit worker brief, which takes precedence over the glossary's optional Russian spellings. Shift/Dash/Static, Pro/Anti, Dual-Shift, VTG labels, Codex, Composer, Choreo Card(s), and point identifiers remain English. Prospin/Antispin use the permitted проспин/антиспин loanwords.
- Other choices: bridge letter → переходная буква; Tap Route → Касания, with the tapping behavior explained in its description; reversal pattern → схема реверсов. Dynamic values are not inflected or translated.
- Writing review: the ai-bust mechanical pass flagged em dashes, the source's fire emoji, and apparent parallel fragments across separate JSON entries. These were assessed in context; normal Russian grammar, source tone, and independent feedback messages were retained. This English-oriented scan does not establish native Russian quality.
- Uncertain: negative space → негативное пространство. The glossary does not define this flow-arts term; its preferred Russian community wording needs native review. The source meaning is retained without adding an unsupported definition.
- Uncertain: bridge letter → переходная буква and reversal → реверс are contextual choices outside the glossary's explicit rows; native/product terminology review is still needed.
- No native review or live UI inspection was performed in this scoped catalog run. No source claims about notation or product behavior were independently verified.
