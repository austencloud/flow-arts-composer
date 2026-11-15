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

## REV (coordinator, 2026-10-14)

Astra back-translation review: SAMPLE 231 / FLAGGED 7 / 3.0%. Applied the
four wording fixes (viewer resize label, performer color label, turn-pattern
preset name, "thumbs stay in" phrasing). Dismissed three flags asking for
Альфа/Бета: the coordinator kept placement names in Latin script for ru, ja
and ko to match all 31 existing catalog strings; the glossary now says so.

## Read-back — 2026-11-13

- Scope: every released key (en.json keys whose prefix is in `released` in `scripts/i18n-released-prefixes.json`). Each Russian string was read back into English and graded against its English source.
- Released total: 9138. Filled (missing, now translated): 214. Changed: 323 (off 282, wrong 41). Left as is: 8601.
- After the pass: 0 released keys missing; placeholders, tags and entities match English on every released key. 207 values remain identical to English; all are fixed terms, product names, Latin termbase labels, format strings made only of placeholders, or data examples (`form_placeholder_email`, `nav_ui_your_username`).
- Contract test: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts` → `Tests  5 failed | 67 passed (72)`. No ru test fails. The fallback test fails only on 107 keys missing from de.json (expected). The other four failures are the released-coverage floor for es, fr, it and pt (`8936 of 9138 released keys`, floor 0.98); those catalogs are not touched by this change.
- `git diff --check` is clean and `messages/ru.json` parses.
- Per-key change list (key, English, before, after, read-back, grade): `E:/tka-languages/runs/ru/changes.json`.

### Term decisions

- Effort → «Характер движения» (short «Характер»), never усилие. Effort names (Laban-style): Скольжение, Касание, Давление, Удар, Упругость, Отскок, Замах.
- Base Motions → «Базовые движения». Pattern is never «режим»: turn/reversal patterns → «шаблон», guide prose keeps паттерн/схема.
- step → шаг (sequence position); beat → доля only for a musical count. Counts use «Шагов: {count}».
- take → дубль. Playground → «Песочница»; Ratio Playground → «Песочница соотношений».
- preset → «пресет» (share, settings, viewer), not шаблон.
- Orientation chips → «по часовой» / «против часовой», never CW/CCW.
- Loop picker: mirrored = left-right, flipped = top-bottom.
- Latin labels kept: Static, Float, Gamma, Alpha, Beta, Dash, Shift, LOOP, Pro, Anti, Book, Poi, Choreo Cards, Tika, Austen Cloud. Prospin/Antispin keep the existing Cyrillic проспин/антиспин in running prose, per the termbase note.
- Timing modes: Split → «Вразнобой», Quarter → «Сдвиг на четверть», Same/Opposite → «Одинаково»/«Противоположно». Halved/quartered → Пополам/На четверти. Swapped → «Замена рук».
- Mirror (verb) → Отразить; Rewind → «В обратном порядке»; Generate → Сгенерировать; Reversal → смена направления.
- placement → позиция; Exposure → Экспозиция; account → аккаунт; Follow → Подписаться; Creators → Авторы; Timeline → «Шкала времени»; Visuals → Визуализации; Skewed → Смешанная.
- combo → «серия»; trail → «След» (replaces «Шлейф»).
- negative space → «отрицательное пространство» (all негативн- forms converted).
- bridge letter → «переходная буква». 3D Studio → «3D-студия». module_compose → «Композиция».
- Create tabs: Construct → «Построить», Generate → «Сгенерировать», Spell → «По буквам», Shape → «Shape». Stage → «Постановка».
- "Flow arts" in SEO titles → «флоу-искусств» (39 keys converted from флоу-арта or Latin).
- Placement prompts use colon phrasing to avoid case agreement («Разместите: {noun}», «Размещено: {prop}, точка {point}.»).
- Flower solo labels → «Цветок Antispin/Inspin, лепестков: {petals}».

### Unsure

| Key | English | Russian | Read-back | Why |
| --- | --- | --- | --- | --- |
| guide_eightstep_turns_back | Left, back | Левая, назад | Left, back | No context for what "back" refers to (likely the left hand's return leg); kept literal and short |
| library_look_trail_loop_clear | Loop-clear trail | След до конца цикла | Trail until the end of the loop | Assumed the trail clears each time the animation loop restarts |
| shape_engine_trace_this | Trace this | Нарисовать след | Draw the trace | Button context not seen; could mean start a live trace of the flower |
| viewer_ui_effort_name_anticipation | Anticipation | Замах | Wind-up | Animation term for the preparatory move; «Подготовка» is the other candidate |
| viewer_ui_effort_name_dab | Dab | Касание | Light touch | Laban effort name; the termbase has no settled Russian term |

### English to its owner

- browse_audit_hands_right_angle: gamma still described as "right angle" (hands adjacent is the current wording). Russian left as is.
- learn_timing_intro_placement_gamma: "A right angle apart." Russian left as is.
- learn_placement_comparison_gamma: "A right angle apart". Russian left as is.
- learn_placement_gamma_geometry: "a right angle". Russian left as is.
- pictograph_desc_group_gamma: "gamma (right angle)". Russian left as is.
- verified_level1_gamma_definition: "the hands form a right angle". Russian left as is.
- verified_level1_placements_seo_description: ends "in Gamma they form a right angle". Russian left as is.
- verified_level1_guide_page_seo_4: ends "in Gamma they form a right angle". Russian left as is.
- learn_reference_reading_choreo_cards: reads "Hand Motions" for the Reading a Choreo Card link; looks copied from learn_reference_hand_motions_intro. Translated as written.
- loop_picker_description_mirrored / loop_picker_description_flipped: English says "vertically" / "horizontally", which reads opposite to left-right / top-bottom. Russian follows left-right / top-bottom.
- module_write and module_choreo: both English labels read "Choreo", so two modules show the same name.
- English drifted from its own Russian on: verified_level1_hm_gamma_98, _101, _102, verified_level1_hm_type2_116, playback_audit_visual_progress_bar_in_word_header, tab_browse_collections, tab_desc_browse_collections, tab_desc_settings_profile, tab_desc_stage_editor, tab_desc_toys_third_order, train_journey_subtitle. Russian now follows the current English.

### May not fit

- loop_picker_description_mirrored
- loop_picker_description_flipped
- module_desc_stage
- tab_create_generate
- tab_create_construct

No native review or live UI inspection was done in this run.

## Unreleased features — 2026-11-14

Headless fill of the not-yet-released strings for Ilo, on Austen's rule of 2026-11-14: everything a visitor will eventually see is translated; screens only he uses stay English. Register as before: lowercase вы, infinitive action labels, number-independent counts such as «Шагов: {count}», ASCII `...` for ellipses as the catalog does. Read-backs for plain strings were taken from the zh-Hant fill of the same key (same meaning); they are written separately only where the Russian text differs.

- Keys filled: 747 (arena 43, attribution 14, beta 4, community 20, connect 65, hall 39, mandala 30, poi 41, post 366, premium 45, voice 56, watch 24).
- Left English on purpose: `admin_*`, `moderation_*`, `skel2tka_*`, `scheduler_*`, `gallery_*`, `character_*`. These are tools only Austen uses.
- Existing values were not touched. The change list for Ilo is `E:/tka-languages/runs/unrel/ru/changes.json` (747 entries).

### Term decisions

| English | Russian |
| --- | --- |
| step (of a sequence) | шаг (every sequence `beat` count) |
| beat (tapped on a video or a song) | доля (post tools, where the English means musical beats) |
| Post Studio editor words | дорожка (lane/track), слой, маркер воспроизведения (playhead), ключевой кадр, кроссфейд, переход, картинка в картинке, замедленно (slow mo), полный прогон (run-through), полоса разбора (breakdown strip), вспышка |
| Arena / Battle | арена / битва |
| Hall of Shame | Доска позора (termbase) |
| Premium / Free | Премиум / Бесплатно |
| Poi | poi / Poi (kept Latin as the catalog does) |
| session | сессия |
| Take | дубль |
| Staff | посох |
| Friends | друзья |
| Choreo card | Choreo Card (kept English as the catalog does) |
| Clockwise / Counterclockwise | по часовой стрелке / против часовой стрелки |

### Unsure

| Key | English | Text | Read-back | Why |
| --- | --- | --- | --- | --- |
| `connect_invited_you_to_join` | invited you to join | приглашает вас присоединиться | invites you to join | Fragment that follows a name; gender and case of the name are unknown. |
| `connect_is_sharing` | is sharing | делится | shares | Same fragment problem. |
| `post_editor_card_ring` | Ring on beats | Кольцо по долям | Ring by the beats | Short English; the ring is read as a lit ring that steps with the beat. |
| `post_editor_hook_spoken` | How to say it | Как это сказать | How to say it | Context (an opening hook line) is not visible. |
| `voice_sessions_*pattern*` | Pattern Analysis, Unresolved Patterns | Анализ шаблонов, Неразобранные шаблоны | Template analysis, unparsed templates | `pattern` here means a regex-like voice command pattern; шаблон chosen over узор. |
| `post_editor_titles_land` | Land on card | Посадить на карточку | Land (put) on the card | Assumed to mean the title name lands on the card. |

### English to its owner

- `mandala_copy_count`, `mandala_filter_all`, `poi_lab_beat_count`, `poi_lab_beat_number`, `voice_sessions_days_ago`, `voice_sessions_event_count`, `voice_sessions_hours_ago`, `voice_sessions_minutes_ago`: the English wraps the placeholder in literal quotes (`"{count}" copies`). The quotes were dropped; they look like escaping leftovers.
- `connect_sharing_sequence`: the key says sharing but the English says "Search for users above to invite them." Translated what it says.
- `connect_no_sessions_nearby` and `connect_sessions_appear_automatically` carry the same text. So do `connect_no_friends_yet` and `connect_add_friends_hint`.
- `connect_invited_you_to_join`, `connect_is_sharing`, `premium_user_count_tagline` are sentence fragments that only work in English word order.
- `post_editor_fly_unavailable` says "lane" while the rest of Post Studio says "track". Read as the same thing.

### May not fit

- Russian is longer than English in several tool tabs and labels: `post_editor_tool_fly` (Пролёт в следующий), `post_editor_tool_panel_lift` (Поднять панель), `post_editor_tool_split_hands` (Разделить руки).
- `post_editor_lift_in_here`, `post_editor_lift_out_here`, `post_editor_split_close_here`: roughly twice as long as the English.
