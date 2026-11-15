# Korean translation ledger

## R1 (2026-10-14)

- Scope: 1,121 new catalog keys, 1 retranslation (`assembly_box`), 0 review entries. All assigned entries are present, including legitimate unchanged notation, numbers, and placeholder-only strings.
- Initial apply: `messages/ko.json: inserted 1121, replaced 1, refused 0`.
- Final apply after wording review: `messages/ko.json: inserted 0, replaced 1122, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; duration 22.00s. Exit 0.
- Additional checks: exact placeholder multiplicities and markup preserved; every output value is one line; parsed catalog diff confirms exactly 1,121 new keys and only `assembly_box` replaced, with no removals. Before this ledger, `git diff --stat` reported only `messages/ko.json`, 1,123 insertions and 2 deletions (net +1,121); `git diff --check` passed.
- Glossary: 해요체 sentences and noun labels; Box = 박스; Diamond = 다이아몬드; placement = 위치; sequence = 시퀀스; step = 단계; beat = 비트; prop = 프롭; turn = 회전. LOOP transforms use 미러, 회전, 반전, 교체, 반사, 2등분/4등분, 확장. Static, Shift, Dash, Float, Pro, Anti and LOOP remain English. Following the worker brief, Beta remains English even though the glossary allows a Korean placement transliteration.
- VTG labels remain exactly as supplied in English, including the six display values with spaces (Quarter Same/Opposite, Split Same/Opposite, Together Same/Opposite). Explanatory timing prose uses 함께, 엇갈림, 1/4 엇갈림, 같은 방향, 반대 방향. Compass point data stays Latin; spelled-out directions translate.
- Phrase review: the split Construct empty-state message was checked at its Svelte call site. The solo-hand placeholders use 왼/오른 with 손 supplied by the surrounding message, also checked at its call site.
- ai-bust review: removed source-derived em dashes. Its two remaining HIGH parallel-fragment findings span separate JSON entries (save failures and Mirror/Flip help). These are consistent translations of separate source messages, not repeated prose within one UI passage; retained after judgment review. No invented claims or narrator copy added.
- Uncertainty: `create_action_help_invert_fulldesc` says rotation directions and motion types change, while `create_action_detail_invert` says base motion types remain unchanged. Both source meanings were preserved; translation does not establish which behavior is correct.
- Uncertainty: the glossary has no specific terms for Shape Matrix realization (모양 행렬 구현), tunnel (터널), or authored performer count (작성된 퍼포머 수). These are provisional Korean choices, without native review.
- Uncertainty: the split LOOP hint keys have no source call site found by exact-key search in `src`; their standalone translations preserve selection and settings instructions, but their rendered composition could not be established.
- Delivery: committed only in the assigned `codex/i18n-ko` worktree for coordinator integration. No primary checkout access, merge, push, installation, server, build, or broad check was performed.

## R2 (2026-10-14)

- Scope: 871 new catalog keys, 0 retranslation entries, 0 review entries. All assigned keys are present. Sixteen values legitimately match English: placement names, compass-point letters, motion category names, preserved product/notation labels, and placeholder-only or comparison labels.
- Initial apply: `messages/ko.json: inserted 871, replaced 0, refused 0`.
- Final apply after composition review: `messages/ko.json: inserted 0, replaced 871, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; duration 9.97s. Exit 0.
- Focused audit: exactly 871 additions; no existing catalog values changed or removed; exact placeholder names and multiplicities; exact markup tags; every output value is one line. Before this ledger, `git diff --stat` reported only `messages/ko.json`, 871 insertions. `git diff --check` passed.
- Glossary: sentences use 해요체 and short labels use noun phrases. Diamond = 다이아몬드; Box = 박스; placement = 위치; prop = 프롭; sequence = 시퀀스; pictograph = 픽토그램; turn = 회전. Sequence positions, including the tracing game's beat-index controls, use 단계; musical beats use 비트. Explanatory timing uses 함께, 엇갈림, 1/4 엇갈림, 같은 방향, 반대 방향. VTG labels, Shift, Dash, Static, Pro, Anti, Dual-Shift, Codex, Composer, TKA, and product names stay English. Alpha/Beta/Gamma remain English under the explicit worker brief, which overrides the glossary's optional Korean placement transliterations. Standalone lowercase alpha/beta values retain source case.
- Technique names: Prospin = 프로스핀; Antispin = 안티스핀; Isolation = 아이솔레이션, using the glossary's permission for Korean community loanwords. Staff = 스태프. Bridge letter = 연결 문자; hand/outer points = 손 지점/바깥 지점; Tap Route = 경로 탭하기; haptics = 햅틱; coverage = 경로 완주율; mandala = 만다라.
- Composition review: checked the direction intro/examples/board call sites and removed redundant 방향 from wrapper strings because their translated arguments already contain it. Checked rotation feedback's sentence-valued meaning argument, staff quiz answer prefixes, placement construction prompt, and joined bridge-failure clauses. Wrapper punctuation and label phrasing preserve Korean ordering without source changes.
- ai-bust review: removed source-derived em dashes and unnecessary arrows in prose. The mechanical pass reported the source's fire emoji and six parallel-fragment findings spanning separate JSON entries. Retained the source emoji for translation fidelity; retained the separate score/paused-state messages because they are independent source messages, not one repetitive prose passage. This review does not establish native-language acceptance.
- Uncertainty: `learn_place_1_8_name` says “Sequences & Reversals”; no glossary entry establishes whether this title specifically means hand-path, prop-spin, or full-time reversal. Used the general 시퀀스와 방향 전환 rather than restricting it to prop spin.
- Uncertainty: the glossary does not establish Korean terms for bridge letter, Tap Route, negative space (네거티브 스페이스), tracing coverage, or mandala. The choices above are provisional and have not had native review.
- Delivery: committed only in the assigned `codex/i18n-ko` worktree for coordinator integration. No primary checkout access, push, merge, installation, dev server, full build, broad check, or catalog-validator rewrite was performed.

## R3 (2026-10-14)

- Scope: 1,119 new catalog keys translated; 0 retranslation entries; 0 review entries. All assigned keys are present. Proper names, notation, formats, and placeholder-only labels legitimately remain identical where appropriate.
- Initial apply: `messages/ko.json: inserted 1119, replaced 0, refused 0`.
- Final apply after wording and accessibility review: `messages/ko.json: inserted 0, replaced 1119, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; duration 7.07s. Exit 0.
- Focused audit: exactly 1,119 additions; no existing catalog values changed or removed; exact placeholder names and multiplicities; exact markup tags; all output values single-line. Before appending this ledger, `git diff --stat` showed only `messages/ko.json`, 1,120 insertions and 1 deletion (net +1,119). `git diff --check` passed.
- Glossary: sentences use 해요체; short labels use noun phrases. Grid = 그리드; Box = 박스; Diamond = 다이아몬드; placement = 위치; sequence = 시퀀스; pictograph = 픽토그램; step = 단계; beat = 비트; turn = 회전; prop = 프롭. Counters follow numbers: {count}개, {count}장, {count}명, {count}회. LOOP transforms use 미러, 회전, 교체, 반전, 2등분/4등분. Static and Shift retain category names. Product names, FPS, TnD, and notation stay English.
- Placement names remain English under the explicit batch brief, overriding the glossary's optional Korean transliterations. The combined Alpha, beta, gamma label preserves source case. Smart Collection = 스마트 컬렉션; composition = 작품; formation = 대형; tunnel = 터널; mandala = 만다라. Match-all and match-any conditions remain distinct as 모두 일치 and 하나라도 일치.
- Context review: `viewer_final_to` is an arrow's accessibility label between start/end placement glyphs in PlacementGlyph.svelte, translated 종료 위치로. The Effort section in TunnelMotionSettings.svelte explicitly describes within-beat acceleration/deceleration; 강약 is used for its short label. ProfileHeroSection.svelte describes Catdog as one identity made from two props; retained Catdog rather than inventing an established Korean term.
- Uncertainty: the glossary supplies no Korean equivalent for Catdog; its established Korean community usage could not be established. Catdog remains English.
- Uncertainty: Effort (강약), formation (대형), tunnel (터널), and named palette display labels are provisional Korean wording without native review. Palette labels are translated as display text; no effect identifiers or data were changed.
- Delivery: committed only in the assigned codex/i18n-ko worktree for coordinator integration. No primary checkout access, other worktree access, push, merge, installation, dev server, full build, broad check, or catalog-validator rewrite was performed.

## R4 (2026-10-14)

- Scope: 852 new catalog keys translated; 0 retranslation entries; 0 review entries. Every assigned key is present.
- Initial apply: `messages/ko.json: inserted 852, replaced 0, refused 0`.
- Final apply after phrase review: `messages/ko.json: inserted 0, replaced 852, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; duration 7.57s. Exit 0.
- Focused checks: exact batch coverage, placeholder names and multiplicities, markup, and single-line values verified. Parsed catalog comparison confirms exactly 852 additions, zero changes to existing values, and zero removals. Before this ledger, `git diff --stat` showed only messages/ko.json, 853 insertions and 1 deletion (net +852); `git diff --check` passed.
- Glossary: 해요체 sentences and noun labels; sequence = 시퀀스; step = 단계; musical beat = 비트; prop = 프롭; pictograph = 픽토그램; turn = 회전; timing = 타이밍; tempo = 템포. Rotated LOOP = 회전 LOOP. Product names, providers, URLs, formats, placeholders, and notation remain unchanged. Counters follow numbers: {count}개, {count}회. Fuse, Tunnel, Assemble, Construct, 3D Studio, and Post Studio stay English as named tools or surfaces.
- Appearance display names are translated (Ember = 불씨, Cosmic = 우주, Ocean = 바다, Forest = 숲, Void = 공허); identifiers were not changed. Credit = 크레딧; footer = 하단 문구; take = 테이크; landing = 도착/도착 지점; pass = 반복; mapping = 매핑.
- Composition review: OfflineLocalDataSection.svelte displays used storage, then settings_offline_of, then total storage. Used `/` to preserve that fixed numeric order naturally. Frame-progress `share_studio_of` also uses `/`. The Post Studio timing keys had no matching Svelte call sites found by exact-key search; standalone meanings were preserved, but rendered phrase composition could not be established.
- ai-bust mechanical review: 16 HIGH parallel-fragment findings, all spanning independent JSON entries (mostly error/retry messages and paired card/video account requirements); no other HIGH or CRITICAL categories. Retained after judgment review because these are separate source messages requiring consistent Korean wording, not a repeated passage.
- Uncertainty: the glossary does not establish Korean terms for Post Studio take (테이크), landing (도착/도착 지점), pass (반복), or timing mapping (타이밍 매핑). These are provisional and have not had native review.
- Uncertainty: appearance display names and named tools outside the glossary lack native review. Tool names remain English to avoid inventing established Korean names.
- Uncertainty: the source `{seconds}` timing-error values do not establish whether the placeholder already includes a unit. Preserved the placeholder without appending a guessed unit. Post Studio suffix/fragment composition could not be verified from matching Svelte call sites.
- Delivery: committed only in the assigned codex/i18n-ko worktree for coordinator integration. No primary checkout or other worktree access, push, merge, installation, dev server, full build, broad check, or catalog-validator rewrite was performed.

## R5 (2026-10-14)

- Scope: 653 new catalog keys translated; 0 retranslation entries; 0 review entries. All assigned keys are present. Nine values legitimately match English: Choreo Cards, Studio, 3D Studio, Assemble, Construct, Fuse, Tunnel, Codex, and the data-like username example your_username.
- Apply: `messages/ko.json: inserted 653, replaced 0, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; duration 6.32s. Exit 0.
- Focused checks: exact batch coverage, placeholder names and multiplicities, markup, and single-line values verified. Parsed comparison against HEAD confirms exactly 653 additions, zero changes to existing values, and zero removals. Before this ledger, `git diff --stat` showed only messages/ko.json with 653 insertions. `git diff --check` passed.
- Glossary: sentences use 해요체; short labels use noun phrases. Sequence = 시퀀스; step = 단계; placement = 위치; prop = 프롭; hand path = 손 경로; pictograph = 픽토그램; library = 라이브러리; collection = 컬렉션; Compose = 작곡. LOOP transforms use 미러, 회전, 반전, 교체, 2등분/4등분. Counters follow numbers, including {count}개 and {total}개 중 {completed}개. Jump to = 바로 이동 throughout navigation and keyboard UI. Product names, notation, providers, keyboard key names/combinations, placeholders, and data remain intact. Tika display labels use the glossary's TIKA spelling. Zeta and Eta stay English under the worker brief, consistent with previous placement-name decisions.
- Consistency: retained Assemble, Construct, Fuse, Tunnel, and 3D Studio as named tools, following R4; Studio remains the source's shortened product-surface name. Composition = 작품; smart collection = 스마트 컬렉션; tunnel in descriptive prose = 터널; flow identity = 플로우 정체성.
- Context review: MediaPieceCard.svelte uses export_ui_performance for a camera/video performance format, so Performance = 공연 rather than computer performance. SmartCollectionRuleSummary.svelte uses library_ui_looks_in as the source label above sourceLabel, translated 검색 위치. Flip = 뒤집기 stays distinct from Invert = 반전; step navigation and add/delete controls use 단계 rather than musical 비트.
- ai-bust mechanical review: `python .agents/skills/ai-bust/ai_bust.py --json --min-severity HIGH <out-R5.json>` returned `[]`, exit 0. Source-derived em dash removed from the export-lock notice. Judgment review kept independent source labels and error messages consistent without adding claims.
- Uncertainty: the glossary does not establish Korean terms for flow identity (플로우 정체성), command palette (명령 팔레트), prop drawer (프롭 서랍), or Realm (세계). These are provisional UI translations without native review. Named tools retain English in line with the earlier ledger.
- Delivery: committed only in the assigned codex/i18n-ko worktree for coordinator integration. No primary checkout or other worktree access, push, merge, installation, dev server, full build, broad check, or catalog-validator rewrite was performed.

## REV (coordinator, 2026-10-14)

Astra back-translation review: SAMPLE 240 / FLAGGED 4 / 1.7%. Applied all four
fixes (visual builder tab hint, Continuous option name, missing particle after
{hand}, map intro meaning).

## Read-back — 2026-11-13

- Scope: 9,138 released keys (prefixes in `scripts/i18n-released-prefixes.json`), read in 40 chunks of about 250 keys grouped by prefix. Each present value was read back into English and graded right, off or wrong.
- Result: 214 filled (all keys that were missing, including the new hardcoded-sweep keys); 403 changed (382 off, 21 wrong); 8,521 left as is. Full change list with before, after and read-back: `E:/tka-languages/runs/ko/changes.json`.
- Contract test: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts` → `Tests  5 failed | 67 passed (72)`. Every ko check passes. The five failures are outside Korean: "does not silently fall back to English" lists 107 keys, all missing from `de.json`; "released-prefix coverage above the ratchet floor" fails for es, fr, it and pt (8,936 of 9,138, below 0.98) because of the new English keys. None of those files is touched here.
- Other checks: JSON parses and keeps its key order and 2-space format; placeholders, markup tags and entities match English on every changed value; values are single-line; no em dashes added; `git diff --check` clean.

### Term decisions

- Effort in the Laban sense (Shape Engine, viewer, animation menu, phrase lab, guide paths) is 에포트 everywhere. 성능 (performance), 강약 and 난이도 (difficulty) were wrong for it and are replaced. The difficulty sort in Browse stays 난이도 because it does mean difficulty.
- Base Motions (Generate level) is 기본 동작, per glossary section 5; 무회전 ("no turns") is gone.
- Orientation chips (`create_ui_orientation_clock_short`, `_counter_short`, the six `create_action_orientation_*_short`) read 시계 방향 / 반시계 방향 with 안쪽/바깥쪽; no CW/CCW anywhere in ko.
- `loop_picker_description_mirrored` = 좌우 (left-right), `_flipped` = 상하 (top-bottom), following the code; the English says vertically/horizontally.
- Prospin, Antispin, Inspin, Isolation, Extension and Flower stay in hangul (프로스핀, 안티스핀, 인스핀, 아이솔레이션, 익스텐션, 플라워). The run brief lists them among labels kept in Latin, but its rule covers labels the termbase keeps in Latin, and the ko termbase and glossary section 1 pin the hangul loanwords, which about 60 strings already use. Static, Float, Shift, Dash, Hash, Pro, Anti, Alpha, Beta, Gamma and LOOP stay Latin.
- Named tools Construct and Assemble go back to Latin (some strings had 구성, 조립); Poi, Triad and Buugeng back to Latin.
- Pinned terms enforced: letter 문자 (not 글자), grid 그리드 (not 격자), variation 변형 (not 변화), prop 프롭 (not 소품), Type N 유형 N, step 단계 wherever a sequence position is meant (not 스텝 or 비트), negative space 네거티브 스페이스, Shape Matrix 셰이프 매트릭스 (not 모양 행렬), color 색상.
- Sentences in 합니다체 (all creators\_\* prose, some auth and settings strings) moved to 해요체.
- Whole Turns stays 전체 회전 (glossary section 3). A reviewer proposed 정수 회전 (whole-number turns) for the Level 2 names; not applied, listed here for Ilo since 전체 회전 can also read as "full rotation".
- Creator is not pinned: the catalog mixes 크리에이터, 창작자 and 제작자. Only the two creators tab labels changed (to 크리에이터, matching their descriptions); prose is untouched. Needs a pin.
- Spelled-out VTG descriptions (`pictograph_desc_timing_*`, e.g. "Split-Opposite timing") stay Korean prose (엇갈림·반대 방향 타이밍); the hyphenated short labels stay English as before.
- Gamma strings that say "right angle" are left exactly as they were (see English to its owner). No new 직각 was introduced.

### Unsure

| Key                                            | English                                                                               | Korean                                                                        | Read-back                                                                                        | Why                                                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `browse_collections_founding_book_description` | The base motions at one turn, with the book reversal — both props reverse every step. | 1회전 기본 동작에 북 방향 전환을 적용했어요. 두 프롭이 매 단계 방향을 바꿔요. | Base motions at one turn with the book reversal applied. Both props change direction every step. | No pinned Korean for 'book reversal'; used 북 방향 전환 (book as a name). Em dash in EN replaced by a sentence break.                                                               |
| `browse_collections_films_title`               | Films                                                                                 | 필름                                                                          | Films                                                                                            | Chose 필름 to keep Films distinct from Videos (영상); confirm what Films holds.                                                                                                     |
| `export_ui_performance`                        | Performance                                                                           | 공연                                                                          | Performance (a show)                                                                             | key unused in src; cannot tell if it means a staged performance or speed/quality. Left as is.                                                                                       |
| `library_look_trail_loop_clear`                | Loop-clear trail                                                                      | 루프마다 지워지는 트레일                                                      | Trail that clears every loop                                                                     | inferred from TrailMode.LOOP_CLEAR; assumes the trail wipes at each loop of the animation                                                                                           |
| `viewer_ui_inherit`                            | Inherit                                                                               | 기본값 따르기                                                                 | Follow the default                                                                               | tunnel performer color mode; assumed 'inherit' means use the performer's normal colors                                                                                              |
| `viewer_ui_effort_name_anticipation`           | Anticipation                                                                          | 예비 동작                                                                     | Preparatory move                                                                                 | animation-principle name; 예비 동작 is the usual Korean term but a loanword (앤티시페이션) is possible                                                                              |
| `settings_buugeng_pair_mirrored`               | Mirrored                                                                              | 거울상                                                                        | Mirror-image                                                                                     | Left as is: Buugeng chirality pair describes mirror-image shapes. Pinned term for Mirrored is 미러; switch to 미러 if the pin should cover this too (also affects the pair hint).   |
| `train_total_beats`                            | Total Beats                                                                           | 총 단계 수                                                                    | Total steps                                                                                      | Unsure whether this stat counts sequence steps or musical beats; other train strings render beat as 단계. Use 총 비트 수 if it is a musical count.                                  |
| `pictograph_placement_aiming`                  | Aiming the {noun}                                                                     | {noun} 방향 맞추는 중                                                         | Setting the {noun} direction                                                                     | Rendered aim as 방향 맞추기 (pointing the prop) and phrased to avoid a particle after {noun}, which is a runtime prop/hand name; check that reads well with the actual noun strings |
| `shape_engine_over`                            | over                                                                                  | ×                                                                             | crossed with                                                                                     | Used between left and right flower labels in a screen-reader crossing announcement; × chosen over 위, check it is read acceptably by Korean screen readers (alternative: 대)        |
| `shape_engine_trace_this`                      | Trace this                                                                            | 이걸로 따라 그리기                                                            | Trace with this one                                                                              | Button on a realization card that traces it in the mirror view; meaning of trace inferred from call site                                                                            |
| `fullscreen_prompt_message_2`                  | Enter the Studio 🎯                                                                   | Studio 입장 🎯                                                                | Enter the Studio                                                                                 | unclear whether "Studio" here is the named tool or a generic workspace; if generic, 스튜디오 입장 was fine                                                                          |

### English to its owner

- `browse_audit_hands_right_angle`: Gamma described as hands forming a right angle; left unchanged per brief (KO still says 직각).
- `learn_ui_challenge_chain_the_beats`: Title says 'Beats' but the challenge traces 3 steps; Austen prefers 'step'. Consider 'Chain the Steps'.
- `learn_timing_intro_placement_gamma`: EN says 'A right angle apart' for gamma; left as is per brief (KO mirrors it with 직각).
- `learn_placement_comparison_gamma`: EN says 'A right angle apart' for gamma; left as is per brief (KO mirrors it with 직각).
- `learn_placement_gamma_geometry`: EN says 'a right angle' for gamma; left as is per brief (KO mirrors it with 직각).
- `learn_reference_reading_choreo_cards`: EN value is 'Hand Motions' though the key is the Reading a Choreo Card reference; check it isn't a copy-paste slip.
- `viewer_beats_count`: Shows stepCount but EN says 'beats'; Austen prefers 'steps'.
- `viewer_ui_how_each_beat_speeds_up_and_slows_down`: Effort hint says 'each beat' where it means each step.
- `tab_desc_browse_gallery`: English reads 'Browse and browse sequences' (duplicated verb)
- `tab_desc_browse_sequences`: English reads 'Browse and browse sequences' (duplicated verb)
- `tab_desc_browse_visuals`: Description just repeats the tab name 'Visuals'; same for drafts, saved, your_visuals, your_videos, following descriptions
- `train_step_advance_tap`: English says 'Tap or Voice' for the tap-only option; should likely be 'Tap'
- `train_step_advance_voice`: English says 'Tap or Voice' for the voice-only option; should likely be 'Voice'
- `train_timed_config_title`: Title duplicates the description sentence; likely should be 'Timed Mode Settings'
- `train_auto_advance`: Uses 'beat' where the app means a step; Korean uses 단계
- `pictograph_desc_group_gamma`: EN still says "gamma (right angle)"; left as is per gamma rule
- `shape_engine_pictographs_calibration`: EN grammar: "Level 4 pictograph are" should be "pictographs are"
- `playback_audit_visual_progress_bar_in_word_header`: Key name says word header but EN now says downloaded videos and display-only players; translated the EN
- `guide_topic_dual_shifts_switching_lead`: EN uses lowercase "gamma" as the placement name; should be Gamma
- `loop_picker_description_mirrored`: "Mirrors placements vertically" is ambiguous; code swaps left and right. Suggest "Mirrors placements left to right".
- `loop_picker_description_flipped`: "Mirrors placements horizontally" is ambiguous; code swaps north and south. Suggest "Flips placements top to bottom".
- `verified_level1_gamma_definition`: Gamma described as "form a right angle"; left as is per brief
- `verified_level1_placements_seo_description`: Gamma described as "form a right angle"; left as is per brief
- `verified_level1_guide_page_seo_4`: Gamma described as "form a right angle"; left as is per brief
- `verified_level1_seo_fallback_description`: Code concatenates `${title} ${fallback}`; the EN fragment "in The Kinetic Alphabet, ..." cannot take a Korean particle after the title. A full template with {title} would read better.
- `browse_audit_hands_right_angle`, `learn_timing_intro_placement_gamma`, `learn_placement_comparison_gamma`, `learn_placement_gamma_geometry`, `pictograph_desc_group_gamma`, `verified_level1_gamma_definition`, `verified_level1_placements_seo_description`, `verified_level1_guide_page_seo_4`: gamma described as a right angle; Austen wants "hands adjacent". Korean left as is until the English changes.

### May not fit

- `playback_audit_visual_progress_bar_in_word_header`

## Unreleased features — 2026-11-14

Headless fill of the not-yet-released strings for Ilo, on Austen's rule of 2026-11-14: everything a visitor will eventually see is translated; screens only he uses stay English. Register as before: friendly polite 해요체, ASCII `...` for ellipses as the catalog does. Read-backs for plain strings were taken from the zh-Hant fill of the same key (same meaning); they are written separately only where the Korean text differs.

- Keys filled: 747 (arena 43, attribution 14, beta 4, community 20, connect 65, hall 39, mandala 30, poi 41, post 366, premium 45, voice 56, watch 24).
- Left English on purpose: `admin_*`, `moderation_*`, `skel2tka_*`, `scheduler_*`, `gallery_*`, `character_*`. These are tools only Austen uses.
- Existing values were not touched. The change list for Ilo is `E:/tka-languages/runs/unrel/ko/changes.json` (747 entries).

### Term decisions

| English | Korean |
| --- | --- |
| step (of a sequence) | 단계 (every sequence `beat` count) |
| beat (tapped on a video or a song) | 비트 (post tools, where the English means musical beats) |
| Post Studio editor words | 트랙 (lane/track), 레이어, 재생 헤드 (playhead), 키프레임, 크로스페이드, 전환 (transition), 화면 속 화면 (picture in picture), 슬로 모션, 통 시연 (run-through), 분해 스트립 (breakdown strip), 플래시 |
| Arena / Battle | 아레나 / 배틀 |
| Hall of Shame | 수치의 전당 |
| Premium / Free | 프리미엄 / 무료 |
| Poi | Poi (kept as the catalog does) |
| session | 세션 |
| Take | 테이크 |
| Staff | 스태프 |
| Friends | 친구 |
| Clockwise / Counterclockwise | 시계 방향 / 반시계 방향 |

### Unsure

| Key | English | Text | Read-back | Why |
| --- | --- | --- | --- | --- |
| `connect_invited_you_to_join` | invited you to join | 님이 초대했어요 | invited you | Fragment that follows a name; the Korean particle attaches to the name. |
| `connect_is_sharing` | is sharing | 님이 공유 중 | is sharing | Same fragment problem. |
| `post_editor_card_ring` | Ring on beats | 비트에 맞춰 링 | Ring in time with the beats | Short English; the ring is read as a lit ring that steps with the beat. |
| `post_editor_hook_spoken` | How to say it | 말하는 방식 | Way of speaking | Context (an opening hook line) is not visible. |
| `post_editor_titles_lit` | Light one letter | 글자 하나 빛내기 | Make one letter glow | Assumed to light one letter of the name. |
| `post_editor_split_peel` | Peel | 필 | Peel | Name of a split style; transliterated, reads oddly alone. |

### English to its owner

- `mandala_copy_count`, `mandala_filter_all`, `poi_lab_beat_count`, `poi_lab_beat_number`, `voice_sessions_days_ago`, `voice_sessions_event_count`, `voice_sessions_hours_ago`, `voice_sessions_minutes_ago`: the English wraps the placeholder in literal quotes (`"{count}" copies`). The quotes were dropped; they look like escaping leftovers.
- `connect_sharing_sequence`: the key says sharing but the English says "Search for users above to invite them." Translated what it says.
- `connect_no_sessions_nearby` and `connect_sessions_appear_automatically` carry the same text. So do `connect_no_friends_yet` and `connect_add_friends_hint`.
- `connect_invited_you_to_join`, `connect_is_sharing`, `premium_user_count_tagline` are sentence fragments that only work in English word order.
- `post_editor_fly_unavailable` says "lane" while the rest of Post Studio says "track". Read as the same thing.

### May not fit

- `post_editor_tool_split_hands`, `post_editor_tool_panel_lift`, `post_editor_tool_fly`: longer than the English in a tool tab.
- `post_editor_lift_step_across`, `post_editor_lift_step_down`, `post_editor_card_qr_left`, `post_editor_card_qr_top`: the parenthesis form is longer than the English.
