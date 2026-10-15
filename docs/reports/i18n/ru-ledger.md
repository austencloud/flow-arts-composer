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


## R3 — 2026-10-14

- Batch: R3. Translated 1107 keys; retranslated 0; reviewed 0. The batch has no retranslate or review section.
- Initial apply: `messages/ru.json: inserted 1107, replaced 0, refused 0`.
- Final apply after contextual wording refinements: `messages/ru.json: inserted 0, replaced 1107, refused 0`. Reapplying the full output does not represent an additional retranslation batch.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; duration 10.05s. The initial gate also passed all 66 tests.
- Before this ledger update, only `messages/ru.json` changed: 1108 insertions and 1 deletion, including the comma on the former last entry. `git diff --check` passed.
- Final output audit: exactly 1107 batch keys; every output value equals its applied catalog value; all pre-existing catalog values remain unchanged. Placeholder multiplicity and markup match English; every value is one line.
- Glossary: lowercase вы; infinitive action labels; последовательность, позиция, шаг, оборот, реквизит, пиктограмма, тайминг. Diamond/Box use Ромб/Квадрат; joined grids use сопряжённые сетки. Numeric messages use number-independent constructions such as «Совпадений: {count}» and «Добавлено карточек: {count}».
- Placement names remain Alpha/Beta/Gamma under the explicit worker brief. Product names, Latin A–Z, point identifiers, formats, placeholders, and dynamic user data remain unchanged. LOOP transforms use Зеркальный, Повёрнутый, Инвертированный, С перестановкой, Пополам, На четверти.
- Context checks: `viewer_ui_static` is a mandala static/animated display choice, not the Static motion category, so it uses Статичный. Mandala stroke weight uses Толщина; export fidelity uses Качество. These meanings were checked in MandalaCategoryControl.svelte. Generated-instance labels use «экз.» to remain grammatical after any count.
- Other choices: Smart Collection → умная коллекция; Fork → создать ответвление; Creep → плавный рост; Staircase → ступени. Palette display names are translated; no internal identifiers were changed.
- Writing review: ai-bust mechanical and judgment passes completed. Em dashes were removed. Three remaining HIGH parallel-fragment findings span independent JSON messages (delete failures, card-scan failures, and export announcements); consistent UI phrasing was retained. This English-oriented scan does not establish native Russian quality.
- Uncertain: the glossary does not define Smart Collection, Effort, Creep, or Staircase. The contextual choices умная коллекция, усилие, плавный рост, and ступени need native/product terminology review.
- Uncertain: Catdog is retained in English as a mixed-prop community term; ProfileHeroSection.svelte confirms the paired-prop context, but the preferred Russian community name is not established by the glossary.
- No native review or live UI inspection was performed in this scoped catalog run. Notation and product-behavior claims were translated from the supplied English without independent verification.


## R4 — 2026-10-14

- Batch: R4. Translated 852 keys; retranslated 0; reviewed 0. The batch has no retranslate or review section.
- Initial apply: `messages/ru.json: inserted 852, replaced 0, refused 0`.
- Final apply after five wording refinements: `messages/ru.json: inserted 0, replaced 852, refused 0`. Reapplying the complete output does not represent additional retranslation work.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; duration 11.20s. The initial gate also passed all 66 tests.
- Before this ledger update, only `messages/ru.json` changed: 853 insertions and 1 deletion, including the comma on the former final entry. `git diff --check` passed.
- Output audit: exactly 852 batch keys; every output value matches its applied catalog value; placeholders and markup match English with multiplicity; every value is one line; all pre-existing catalog values remain unchanged.
- Glossary: lowercase вы; infinitive action buttons; последовательность, шаг, оборот, реквизит, пиктограмма, исполнитель, тайминг. TKA, LOOP, Flow Arts Composer, Post Studio, Choreo Card(s), provider names, formats, and placeholders remain unchanged. Reel/Reels are retained as Instagram format labels. Counts use number-independent phrasing, including «Доступно: {count}», «Нажатий: {count}», and «Пропущено: {count}».
- Other choices: take → дубль; render → отрисовка; landing → завершение движения; playhead → курсор воспроизведения; footer → подвал; professional account → профессиональный аккаунт. Theme and gradient display names are translated, without changing identifiers.
- Writing review: ai-bust mechanical and judgment passes completed. Removed em dashes; final CRITICAL scan returned `[]`. The 16 HIGH findings join independent JSON messages (mostly retry instructions), so consistent source-faithful UI wording was retained. This English-oriented scan does not establish native Russian quality.
- Uncertain: the glossary does not define Post Studio's landing, take, or playhead terminology. The contextual choices завершение движения, дубль, and курсор воспроизведения need native/product terminology review; landing is rendered as a movement endpoint rather than an unsupported physical drop or catch.
- Uncertain: Construct, Assemble, Fuse, and Tunnel are not defined by the glossary. This batch uses построение, сборка, слияние, and туннель respectively; distinct surface names need product review. Generic setup uses настройка in this batch.
- No native review or live UI inspection was performed in this scoped catalog run. Product behavior and notation claims were translated from the supplied English without independent verification.

## R5 — 2026-10-14

- Batch: R5. Translated 517 keys; retranslated 0; reviewed 0. The batch has no retranslate or review section.
- Initial apply: `messages/ru.json: inserted 517, replaced 0, refused 0`.
- Final apply after wording and context refinements: `messages/ru.json: inserted 0, replaced 517, refused 0`. Reapplying the complete output does not represent additional retranslation work.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; duration 8.48s. The initial gate also passed all 66 tests.
- Before this ledger update, only `messages/ru.json` changed: exactly 517 insertions. `git diff --check` passed.
- Output audit: exactly 517 batch keys; every output value matches its applied catalog value; placeholders and markup match English with multiplicity; every value is one line; all pre-existing catalog values remain unchanged.
- Glossary: lowercase вы; infinitive action buttons; последовательность, шаг, позиция, реквизит, коллекция, библиотека. Product names, TKA, LOOP, Poi, provider names, keyboard key names, and placeholders remain unchanged. Numeric messages use number-independent constructions such as «Сочетаний: {count}» and «Непрочитанных уведомлений: {count}».
- Data exception: `nav_ui_your_username` remains `your_username`, a data-like username example. It is the sole value identical to English in this batch and is included in the 517 required output keys.
- Context check: `export_ui_performance` means Выступление, confirmed by the camera/video placeholder and performance format selector in MediaPieceCard.svelte and CompositeControls.svelte.
- Other choices: Jump to → Перейти к; Keyboard shortcuts → Сочетания клавиш; Flow identity → профиль исполнителя; Smart Collection → умная коллекция, consistent with R3. Choreo → Хореография; Realm → Мир; prop preset → набор реквизита. Transform action labels use Отразить зеркально, Перевернуть, Инвертировать, Сдвинуть начало, and Обратить порядок.
- Writing review: ai-bust mechanical and judgment passes completed. Removed em dashes and UI semicolons. Final mechanical HIGH/CRITICAL scan returned `[]`. Assessment: clean for these checks; this English-oriented scan does not establish native Russian quality.
- Uncertain: the glossary does not define Flow identity, Realm, Collect, or prop preset. Contextual choices профиль исполнителя, Мир, Коллекционирование, and набор реквизита need native/product terminology review. No glossary-approved Russian names were established for these labels.
- No native review or live UI inspection was performed in this scoped catalog run. Product behavior claims were translated from the supplied English without independent verification beyond the stated Performance context check.
