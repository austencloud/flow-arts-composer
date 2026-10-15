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

## R2 — 2026-10-14

- Scope: 871 new batch entries; 0 retranslate entries and 0 review entries supplied. Work remained in `E:/worktrees/tka-platform/i18n-ja`, branch `codex/i18n-ja`.
- Initial apply: `messages/ja.json: inserted 871, replaced 0, refused 0`.
- Final apply after fragment review: `messages/ja.json: inserted 0, replaced 871, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Gate result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`. Repeated after final wording changes, with the same result.
- Scope evidence before this ledger: only `messages/ja.json` changed, with exactly 871 insertions and 0 deletions. All 871 batch keys were absent from HEAD before applying.
- Focused checks: all placeholder names and occurrence counts match; exact markup tag multisets match; no full-width spaces; all values remain single-line; `git diff --check` passed.
- Glossary: grids use `ダイヤモンド` / `ボックス`; placement uses `ポジション`; hand path uses `ハンドパス`; orientation uses `向き`; timing uses `タイミング`; together/split/quarter use `同時` / `交互` / `4分の1ずれ`. Sentences use polite です・ます forms, while labels omit the copula. Prospin/Antispin/Isolation use `プロスピン` / `アンチスピン` / `アイソレーション`.
- Placement names Alpha/Beta/Gamma remain English, following the explicit batch instruction over the glossary's optional Japanese forms. Motion category names, VTG labels, notation letters, compass codes, Codex, TIKA, Composer, The Kinetic Alphabet, and Flow Arts Composer remain English. Thirteen entries intentionally match English: notation/category/product names, a placeholder-only label, and a title composed entirely of protected terms.
- Fragment review: bridge failure fragments use clauses that connect to the surrounding reason sentence; the joining fragment uses `、また`. Bridge uses `つなぎ`, reversal uses `回転方向の逆転`, and Tap Route uses `タップルート` consistently in this batch.
- Writing review: applied the ai-bust mechanical and contextual passes. The HIGH/CRITICAL pre-pass flagged only the fire emoji in `learn_ui_on_fire`; it was retained because it appears in the English source. No new emoji or unsupported claims were added.
- Uncertain terminology: Coverage is `網羅率` in the trace result, and bridge is `つなぎ`; neither has a glossary entry or native review. The English source's `dataframe` in `learn_place_1_5_description` is rendered `データフレーム` without claiming what that implementation term means for learners. No native review is claimed.
- No push, merge, primary checkout access, installation, build, dev server, broad check, or other locale edits performed. Branch and worktree are retained for the coordinator.

## R3 — 2026-10-14

- Scope: 1,107 new batch entries translated; 0 retranslate entries and 0 review entries supplied. Work remained in `E:/worktrees/tka-platform/i18n-ja`, branch `codex/i18n-ja`.
- Initial apply: `messages/ja.json: inserted 1107, replaced 0, refused 0`.
- Final apply after context corrections: `messages/ja.json: inserted 0, replaced 1107, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Final gate result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; exit 0. The initial gate also passed all 66 tests; the gate was repeated after two final label corrections.
- Scope evidence before this ledger: only `messages/ja.json` changed, with 1,108 insertions and 1 deletion, net 1,107 lines. A HEAD comparison confirmed exactly the 1,107 batch-owned added keys and no other catalog value changes. Output values match the applied catalog.
- Focused checks: exact placeholder occurrence counts and markup tag multisets match English; no full-width spaces or multiline values; no added sentence-final punctuation; `git diff --check` passed. The ai-bust HIGH/CRITICAL scan returned `[]` after replacing three source em-dash separators with Japanese punctuation or removing the leading separator. The contextual writing pass preserved source meaning and did not add claims.
- Glossary: sequence uses `シーケンス`, word `ワード`, pictograph `ピクトグラム`, placement `ポジション`, hand path `ハンドパス`, orientation `向き`, prop `プロップ`, turn `回転`, level `レベル`, step `ステップ`, beat `ビート`, and grid `グリッド`. Grids use `ダイヤモンド` / `ボックス`; LOOP transforms use `ミラー`, `回転`, `反転`, `入れ替え`, `2分割`, and `4分割`. Sentences use polite です・ます; short labels omit the copula.
- Placement names Alpha/Beta/Gamma remain English under the explicit batch instruction, which overrides the glossary table's Japanese proposals. Nine values intentionally match English: A–Z, Post, Post Studio, Alpha/beta/gamma, FPS, Alpha, Beta, Gamma, and TKA Core. User names, placeholders, notation, and product names retain source spelling.
- Context evidence: `viewer_ui_static` controls paused versus animated mandalas in `MandalaCategoryControl.svelte`, so it is `静止`, not a translated motion-category name. Its Weight category controls stroke width, so `viewer_ui_weight` is `線の太さ`. `FilterRuleStrip.svelte` maps the In chip to a collection filter, rendered `コレクション内`. `SequenceViewer.svelte` maps Start Pos to start-placement visibility, rendered `開始ポジション`. `tunnel-config.ts` identifies flip as N/S reflection, rendered `上下反転`.
- Terms needing native/community confirmation: Effort is `力の加減`; Catdog is `キャットドッグ`; timing passes are `パス`; Fidelity is `再現度`; Creep is `ゆっくり加速`; Staircase is `段階的加速`. These have no glossary entries. The source hints establish the two acceleration presets' behavior; no native review or established Japanese community usage is claimed.
- Shared-key uncertainty: `viewer_ui_linear` labels both a geometric path and an effort fallback. `直線` follows the path usage; one shared translation cannot express both contexts as specifically as separate keys would. No key or code changes were made.
- No push, merge, primary checkout access, installation, build, dev server, broad check, or other locale edits performed. Branch and worktree are retained for the coordinator.
