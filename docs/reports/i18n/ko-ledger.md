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
