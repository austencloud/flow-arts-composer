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
