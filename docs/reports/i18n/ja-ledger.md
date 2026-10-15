# Japanese translation ledger

## R1 — 2026-10-14

- Scope: 1,121 batch keys translated, 1 existing key retranslated, 0 review entries supplied. Work stayed in `E:/worktrees/tka-platform/i18n-ja`, branch `codex/i18n-ja`.
- Initial apply: `messages/ja.json: inserted 1121, replaced 1, refused 0`.
- Final apply after wording review: `messages/ja.json: inserted 0, replaced 1122, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Gate result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`. Repeated after final wording changes.
- Scope evidence before this ledger: only `messages/ja.json` changed, with 1,123 insertions and 2 deletions (net 1,121 lines). A comparison against HEAD confirmed exactly the 1,121 new batch keys and the one correction changed.
- Focused checks: placeholder names and occurrence counts preserved; markup preserved; no full-width spaces; short labels remain single-line; `git diff --check` passed. The ai-bust HIGH/CRITICAL pre-pass returned `[]` for the output file.
- Glossary: `assembly_box` is exactly `ボックス`. Grids use `ダイヤモンド` / `ボックス`, placement uses `ポジション`, orientation uses `向き`, turns use `回転`, duration uses `長さ`, step uses `ステップ`, and beat uses `ビート`. LOOP transforms use `ミラー`, `回転`, `反転`, `入れ替え`, `反射`, `4分割`, and `2分割`.
- Voice: sentences use です・ます; controls use short labels. Motion categories, LOOP, product names, Beta placement names, compass codes, numeric examples, and placeholder-only strings retain their source spelling. Orientation compounds use forms such as `時計回り・内向き`.
- Context review: the split empty-state prefix/suffix encloses the intervening accessible type name in parentheses, producing a complete Japanese sentence without changing source components. The LOOP hint also remains readable around its intervening control.
- Terminology requiring community/native confirmation: `Choppy` is `メリハリ`, `Realization` is `具体的な動き`, and `Tunnel` is `トンネル`; the glossary does not define these. No native review is claimed. `Classic 3` is rendered `クラシック3`; the exact product grouping was not independently established, so the translation adds no interpretation of it.
- Source uncertainty preserved: the LOOP-type explanation describes inversion as Pro/Anti and Static/Dash interchange, while the action-detail explanation says base motion types remain unchanged. Both translations follow their own English source; this batch does not establish which behavioral description is authoritative.
- No push, integration, installation, build, dev server, broad check, or other locale edits performed.
