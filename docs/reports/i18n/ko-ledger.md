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
