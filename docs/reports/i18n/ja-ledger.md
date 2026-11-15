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

## R4 — 2026-10-14

- Scope: 852 new batch entries translated; 0 retranslate entries and 0 review entries supplied. Work remained in `E:/worktrees/tka-platform/i18n-ja`, branch `codex/i18n-ja`.
- Apply result: `messages/ja.json: inserted 852, replaced 0, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Gate result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; exit 0, duration 9.20s.
- Scope evidence before this ledger: only `messages/ja.json` changed, with 853 insertions and 1 deletion, net 852 lines. A parsed comparison against HEAD confirmed exactly the 852 batch-owned additions, no existing value changes, and no deleted keys. All output values match the applied catalog.
- Focused checks: placeholder names and occurrence counts and exact markup tag multisets match English; no full-width spaces, multiline values, or added sentence-final punctuation. `git diff --check` passed. The ai-bust HIGH/CRITICAL scan returned `[]`; contextual review preserved source meaning and claims.
- Glossary: sequence uses `シーケンス`, step `ステップ`, beat `ビート`, duration `長さ`, rotation direction `回転方向`, prop `プロップ`, performer `パフォーマー`, timing `タイミング`, library `ライブラリ`, and orientation `向き`. Product names including Flow Arts Composer, Post Studio, TKA, LOOP, and Choreo Cards retain English. Sentences use です・ます; labels omit the copula. Theme and gradient display names are localized, without changing identifiers.
- Post Studio terminology: take is `テイク`, timing mapping is `タイミングの対応付け`, landing is `到達` / `到達点`, playhead is `再生ヘッド`, and a sequence pass is `周目`. The nearby timing source uses numbered landings and `sequenceFrame.pass`; the translations describe arrivals and repeated passes without implying a prop is dropped onto the floor.
- Uncertain terminology: `landing` and `pass` have no glossary entries or native/community review; `到達` / `到達点` and `周目` are contextual choices. The short repeated-arrival labels use `1到達分`. Native review is not claimed.
- No push, merge, primary checkout access, installation, build, dev server, broad check, or other locale edits performed. Branch and worktree are retained for the coordinator, as explicitly requested.

## R5 — 2026-10-14

- Scope: 517 new batch entries completed; 0 retranslate entries and 0 review entries supplied. Work remained in `E:/worktrees/tka-platform/i18n-ja`, branch `codex/i18n-ja`.
- Apply result: `messages/ja.json: inserted 517, replaced 0, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Gate result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; exit 0, duration 18.93s.
- Scope evidence before this ledger: only `messages/ja.json` changed, with exactly 517 insertions and no deletions. A parsed comparison against HEAD confirmed exactly the 517 batch-owned additions, no existing value changes, and exact agreement between output and applied catalog.
- Focused checks: exact placeholder occurrence counts and markup tag multisets match English; no full-width spaces, multiline values, or added sentence-final punctuation. `git diff --check` passed. The ai-bust HIGH/CRITICAL scan returned `[]`. Contextual review checked short labels and source meaning.
- Glossary: sequence uses `シーケンス`, step `ステップ`, prop `プロップ`, placement `ポジション`, library `ライブラリ`, collection `コレクション`, and grid `グリッド`. Navigation follows `クリエイト`, `ブラウズ`, `学習`, `コンポーズ`, `設定`, `受信箱`, and `ログイン` / `ログアウト`. LOOP transforms use `ミラー`, `回転`, `反転`, and `入れ替え`. Sentences use です・ます; labels omit the copula. TKA, LOOP, VTG, Flow Arts Composer, The Kinetic Archive, Choreo Cards, Poi, provider names, key names, and placeholders retain source spelling.
- Two output values intentionally remain English: `module_post` is `Studio`, the Post Studio surface's shortened product label; `nav_ui_your_username` is `your_username`, an example username that looks like data under the explicit batch instruction. Both keys are present in the output and applied catalog.
- Context evidence: `MediaPieceCard.svelte` and `CompositeControls.svelte` use Performance for camera/video content, rendered `パフォーマンス`. `SmartCollectionRuleSummary.svelte` uses Looks in beside `sourceLabel`, rendered `検索対象`. `transform-functions.ts` defines flip as north/south reflection, rendered `上下反転` to distinguish it from invert (`反転`). `module-definitions.ts` identifies `module_post` as the Studio navigation surface.
- Terminology needing native/product confirmation: Flow identity is `フローのプロフィール`; Jump to is `移動先検索`; Realm is `レルム`. The glossary does not prescribe these terms, and no native/community review or canonical Japanese product naming is claimed.
- Experimental-module labels were translated because the explicit R5 batch requires every supplied key, overriding the translation skill's default released-module filter. Only the requested apply script and focused gate were used; no broad validator, installation, build, dev server, push, merge, primary checkout access, or other locale edits were performed. Branch and worktree are retained for the coordinator.

## REV (coordinator, 2026-10-14)

Astra back-translation review: SAMPLE 232 / FLAGGED 2 / 0.86%. Both flags
asked for アルファ/ベータ/ガンマ; dismissed because placement names stay in
Latin script for ja, ru and ko (glossary decision 2026-10-14). No catalog
changes.

## Read-back — 2026-11-13

Every released Japanese string was read back against English, in chunks grouped by key prefix (released = `en.json` keys whose prefix is listed under `released` in `scripts/i18n-released-prefixes.json`).

**Totals**

|                       | Keys                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Released keys         | 9,001 (the brief said 8,996; `en.json` gained 5 released keys before the run ended, and all 5 already had Japanese)               |
| Filled (were missing) | 72                                                                                                                                |
| Changed: off          | 258                                                                                                                               |
| Changed: wrong        | 48                                                                                                                                |
| Left as is            | 8,623                                                                                                                             |
| Still missing         | 0                                                                                                                                 |
| Same as English       | 186, all fixed terms (Latin-script names such as Shape Engine, Codex, VTG, LOOP and Static, placeholders only, or letter strings) |

The full change list is in the translation desk's `runs/ja/changes.json` (378 rows: key, en, before, after, readBack, grade).

**Checks:** `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`: Test Files 1 passed (1), Tests 72 passed (72). `git diff --check` is clean, `ja.json` parses, and every key has the same placeholders, tags and entities as English (0 mismatches, 0 keys missing from `en.json`).

**Term decisions in this pass**

- Turn is 回転 everywhere. Body turn is 体の回転; no ターン is left for turns, including in the Level 1 guide's ボディターン lines. Dual-turns is デュアル回転.
- Effort is 力の加減 (`shape_engine_settings_effort`, Phrase Effort lab). Base motions is 基本モーション (`generator_level_no_turns`).
- Static is Latin in labels, headings and type names. 静止 stays acceptable in running prose.
- Flip is 上下反転. In the LOOP picker, Mirrored is 左右 and Flipped is 上下.
- Step is used for sequence positions where the English means a step: First step, step numbers, step carousel, auto-advance, and step-by-step practice. Beat stays ビート where it is a musical unit: durations, downbeats, BPM and beat sync.
- Swapped is 入れ替え (the guide's print pages had 入替).
- Choreo Card stays singular when the English is singular, and Choreo Cards is used for the module. Garbled renderings チャレオカード and チェロカード were removed.
- Module names: Library ライブラリ, Museum ミュージアム (美術館 removed from Museum tab text), Inbox 受信箱, 3D Studio 3Dスタジオ, Collect コレクト, Terrain Lab 地形ラボ, Stage ステージ.
- Trail is トレイル (残像 replaced in the viewer).
- Buugeng stays Latin, as it already is across settings, site and FAQ. Poi is ポイ in the app and Latin "Poi" on the public site pages; both are left as they are (see Unsure).
- Arc is 弧 and Concave is 凹型. Glyph slots are 上段/下段スロット. Path is 経路, except Motion paths, which stays 軌跡. Construct is 構築.
- Shape Engine solo-flower strings were filled: 花びら{petals}枚のインスピン/アンチスピンフラワー, and clock/counter as 時計回り/反時計回り.

**Unsure**

| Key                                                        | English               | Japanese                               | Read-back                         | Why                                                                                                                    |
| ---------------------------------------------------------- | --------------------- | -------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| auth_escape_tap_menu / auth_escape_choose / auth_escape_or | Tap the / Choose / or | タップする項目 / 選択する項目 / または | item to tap / item to choose / or | These are sentence fragments whose Japanese word order depends on the parts around them. Needs a look on screen.       |
| learn_placement_build                                      | Build a               | 作る                                   | make                              | This is a fragment. Japanese puts the verb last, so the joined sentence may read out of order.                         |
| learn_bridge_and                                           | and                   | 、また                                 | , and also                        | This is a fragment joiner.                                                                                             |
| guide_eightstep_path_apart_title                           | Turning apart first   | 先に離れて反転                         | first move apart and reverse      | 反転 may read as reversal rather than turning. 先に離れて回る is the alternative.                                      |
| shape_engine_over                                          | over                  | 上に                                   | on top                            | This connector between two flowers (left over right) may read literally. I could not see how it is used, so I left it. |
| learn_ui_challenge_choose_the_bridge and other Bridge keys | Bridge                | ブリッジ / つなぎ                      | bridge / link                     | Both renderings are in use. I left them mixed and need a ruling.                                                       |
| effect_deep_look / effect_deep_looks                       | Look                  | ルック                                 | look                              | 見た目 is the plainer choice.                                                                                          |
| guide*l2_st*\* (leading/following)                         | leading / following   | リード / 先行・追従                    | lead / precede-follow             | The Level 2 guide and glyph print pages use リード/フォロー, and the Level 1 guide uses 先行/追従. I left both.        |
| site*prop_poi and other site*\* Poi keys                   | Poi                   | Poi                                    | Poi                               | The site uses Latin script and the app uses ポイ.                                                                      |
| viewer_final_element_earth vs shape_engine_element_earth   | earth                 | 土 / 地                                | earth / ground                    | The two surfaces name the element differently.                                                                         |

**English to its owner**

- These Gamma strings say "right angle" and were left unchanged. Japanese follows the English (直角):
  - browse_audit_hands_right_angle
  - learn_timing_intro_placement_gamma
  - learn_placement_comparison_gamma
  - learn_placement_gamma_geometry
  - pictograph_desc_group_gamma
  - verified_level1_gamma_definition
  - verified_level1_placements_seo_description
  - verified_level1_guide_page_seo_4
- learn_reference_reading_choreo_cards: the English says "Hand Motions" where the card context suggests something else.
- loop_picker_description_mirrored / loop_picker_description_flipped: "vertically/horizontally" is ambiguous about the axis.
- "Beat" used for sequence positions in English. Japanese follows the English with ビート in:
  - learn*trace*\* keys
  - animation_shortcut_next/previous_beat
  - create_record_beat_of
  - guide_caps_figure_beat
  - create*review*\*\_beats
  - effect*deep*_beat_

  If these should say step, the English should change first. Beat # in playback_audit_visual_beat_number became ステップ番号.

- tab_desc_browse_gallery and tab_desc_browse_sequences: the English reads "Browse and browse sequences".
- train_step_advance_tap / train_step_advance_voice: all three advance options read "Tap or Voice" in English.
- train_timed_config_title repeats the description sentence as a title.

**May not fit**

- settings_generate_tour 「生成オプションのツアー」 and settings_replay_generate_tour 「生成オプションのツアーを再表示」 are about as wide as the English but long for a settings row.
- shape_engine_solo_extension 「エクステンション」 is 7 characters wide for "Extension". It is a heading, so it probably fits.
- No other changed short label came out much wider than its English.

## Unreleased features — 2026-11-14

Headless fill of the not-yet-released strings for Ilo, on Austen's rule of 2026-11-14: everything a visitor will eventually see is translated; screens only he uses stay English. Register as before: polite です・ます in sentences, short noun or verb labels for controls, ASCII `...` for ellipses as the catalog does. Read-backs for plain strings were taken from the zh-Hant fill of the same key (same meaning); they are written separately only where the Japanese text differs.

- Keys filled: 747 (arena 43, attribution 14, beta 4, community 20, connect 65, hall 39, mandala 30, poi 41, post 366, premium 45, voice 56, watch 24).
- Left English on purpose: `admin_*`, `moderation_*`, `skel2tka_*`, `scheduler_*`, `gallery_*`, `character_*`. These are tools only Austen uses.
- Existing values were not touched. The change list for Ilo is `E:/tka-languages/runs/unrel/ja/changes.json` (747 entries).

### Term decisions

| English | Japanese |
| --- | --- |
| step (of a sequence) | ステップ (every sequence `beat` count) |
| beat (tapped on a video or a song) | ビート (post tools, where the English means musical beats) |
| Post Studio editor words | トラック (lane/track), レイヤー, 再生ヘッド (playhead), キーフレーム, クロスフェード, トランジション, ピクチャーインピクチャー, スロー (slow mo), 通し (run-through), 内訳ストリップ (breakdown strip), フラッシュ |
| Export (Post Studio) | 書き出し (matches the catalog's plain Export); Mandala keeps エクスポート as the English button is the generic one |
| Arena / Battle | アリーナ / バトル |
| Hall of Shame | 恥の殿堂 |
| Premium / Free | プレミアム / 無料 |
| Poi / poi-legal | ポイ / ポイとして成立 |
| session | セッション |
| Take | テイク |
| Staff | スタッフ |
| Friends | フレンド |
| Clockwise / Counterclockwise | 時計回り / 反時計回り |

### Unsure

| Key | English | Text | Read-back | Why |
| --- | --- | --- | --- | --- |
| `connect_invited_you_to_join` | invited you to join | があなたを招待しています | invites you | The English is a fragment that follows a name and precedes something else; the Japanese word order can't be a true fragment. |
| `connect_is_sharing` | is sharing | が共有中 | is sharing | Same fragment problem; assumes it follows a user name. |
| `post_editor_card_ring` | Ring on beats | ビートでリング | Ring on the beats | Short English; the ring is read as a lit ring that steps with the beat. |
| `post_editor_hook_spoken` | How to say it | 言い方 | Way of saying it | Context (an opening hook's spoken line) is not visible. |
| `post_editor_titles_lit` | Light one letter | 1文字を光らせる | Light up one letter | Assumed to light one letter of the name. |
| `post_editor_split_peel` | Peel | ピール | Peel | Name of a split style; transliterated. |

### English to its owner

- `mandala_copy_count`, `mandala_filter_all`, `poi_lab_beat_count`, `poi_lab_beat_number`, `voice_sessions_days_ago`, `voice_sessions_event_count`, `voice_sessions_hours_ago`, `voice_sessions_minutes_ago`: the English wraps the placeholder in literal quotes (`"{count}" copies`). The quotes were dropped; they look like escaping leftovers.
- `connect_sharing_sequence`: the key says sharing but the English says "Search for users above to invite them." Translated what it says.
- `connect_no_sessions_nearby` and `connect_sessions_appear_automatically` carry the same text. So do `connect_no_friends_yet` and `connect_add_friends_hint`.
- `connect_invited_you_to_join`, `connect_is_sharing`, `premium_user_count_tagline` are sentence fragments that only work in English word order.
- `post_editor_fly_unavailable` says "lane" while the rest of Post Studio says "track". Read as the same thing.

### May not fit

- `post_editor_tool_split_hands`: "左右の手を分ける" is longer than "Split hands" in a tool tab.
- `post_editor_card_qr_caption_placeholder`, `post_editor_lift_*`: Japanese labels with a parenthesis such as "ステップ番号（左から）" are longer than the English.
- `post_editor_tool_panel_lift`: "パネルを持ち上げる" is wider than "Lift panel" in a tool tab.
