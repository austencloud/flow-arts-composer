# Simplified Chinese (mainland) translation ledger (`messages/zh.json`)

## Read-back — 2026-11-13

- Scope: every released key (prefix in `released` of `scripts/i18n-released-prefixes.json`): 8,996 keys, read in 36 chunks of about 250 grouped by prefix. Only `messages/zh.json` changed. Traditional readers have their own catalog; this one stays mainland usage.
- Filled: 73 missing keys translated.
- Changed: 315 present strings (286 off, 29 wrong). Total edits: 388.
- Left as is: 8,608 strings graded right, including 172 that equal the English because they are fixed terms (Shift, Dash, Static, Alpha, Prospin, LOOP, Codex, Poi, VTG labels, compass points, letters, numbers, placeholder-only strings, prop product names).
- Contract test: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`: `Test Files  1 passed (1)`, `Tests  72 passed (72)`.
- Other checks: JSON parses; every released key present; placeholders, tags and entities match English in all 8,996 released keys; `git diff --check` clean.
- Register: 你 throughout. All 23 strings that used 您 now use 你 (glossary section 11). Short labels stay noun or verb phrases; full-width punctuation in Chinese sentences.

### Term decisions

- **Effort** (Laban effort in Shape Engine settings, the viewer, the animation lab and the guide): 力效 everywhere. Replaced 性能消耗 (`shape_engine_settings_effort`), 力度 (`viewer_ui_effort` and the long viewer detail string) and 用力 (`guide_paths_effort`).
- **Base Motions** (Generate level): 基础动作, per glossary section 5. `generator_level_no_turns` was 无转.
- **pattern** is no longer 模式 anywhere it means pattern (模式 stays for "mode"). Three renderings by meaning:
  - 规律 for a rule-like arrangement across a sequence: Turn pattern 转数规律, Duration pattern 时长规律, rotation direction pattern 旋转方向规律, the pattern tools, the Type 1 spin patterns in Learn, and the saved/template patterns of the rotation-direction panel (`create_review_save_pattern` 保存规律, `create_review_loading_patterns`, `create_ui_patterns`, `create_ui_your_patterns`, `create_ui_delete_pattern`, `create_ui_pattern_name_optional`). The source shows that panel (`RotationDirectionView`, `SavedPatternList`, `SaveModePanel`, `TemplatePatternGrid`) saves rotation-direction patterns, so it uses the same word as the other pattern tools, not a separate "movement pattern" word.
  - 组合 for LOOP extension and closing patterns (`create_extend_end` 收尾组合, `create_ui_no_extension_patterns_available_for_this_sequence`, `create_action_help_extend_fulldesc`, `create_audit_bridge_added`).
  - 花式 for a named spinning pattern a person teaches (Zan's Diamond, Gage DeMello's patterns, the guide*caps essay and `guide_hub_three_levels*\*`); 图案 for a drawn visual shape (effect patterns, POV pattern, drawn loops).
- **Static / Dash**: both are category labels and stay Latin together. `create_option_toggle_left_spin` and `create_option_toggle_right_spin` now read `Dash/Static`; prose keeps the adjective 静止.
- **step** 步 for a sequence position; `create_workspace_history_update_step` was clipped to 更新步 and now reads 更新这一步. 步骤 kept only for instruction steps.
- **turn** 转 / 转数 for the TKA turn count; 旋转 left where it means prop rotation or spin.
- **take** 录像 for a filmed video take.
- **Product name**: `auth_signup_subtitle` said TKA where English says Flow Arts Composer; fixed.
- "spinner" (a person) has no settled catalog word; `module_desc_connect` uses 流动艺术玩家. Logged as unsure.
- "setup" is split across the catalog (配置 in create_tour and create_deep, 预设 in create_ui, 设置 in auth nudges). Not unified in this pass; it needs one decision.

### Unsure

| Key                                      | English                                                                                           | Text                                                       | Read-back                                     | Why                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `browse_unknown`                         | By                                                                                                | 作者                                                       | By (author)                                   | Key name says unknown but English is By; translated the English.                              |
| `browse_audit_each_sequences_own`        | Each sequence’s own                                                                               | 每个序列各自的道具                                         | Each sequence's own props                     | English omits the noun; props inferred from neighbouring keys.                                |
| `create_tour_card_preset_header`         | SETUPS                                                                                            | 配置                                                       | Setups                                        | Unchanged; "setup" is split across the catalog and needs one decision.                        |
| `create_construct_no_pictographs_prefix` | No pictographs in                                                                                 | 在                                                         | In                                            | Assumes the middle part is a letter-type noun placed between prefix and suffix.               |
| `create_pattern_apply`                   | Apply pattern                                                                                     | 应用规律                                                   | Apply pattern                                 | Panel not traced in source; chose 规律 because it sits beside the rotation templates.         |
| `create_action_failed_save_pattern`      | Failed to save pattern                                                                            | 保存规律失败                                               | Failed to save pattern                        | Used only in RotationDirectionView, so 规律.                                                  |
| `guide_hub_three_levels_title`           | Three Ways to Name a Pattern                                                                      | 命名一个花式的三种方式                                     | Three ways to name a pattern                  | Matches the guide_caps essay this card links to (描述花式的三种方式).                         |
| `guide_eightstep_screen_steps`           | Steps                                                                                             | 步                                                         | Steps                                         | Tab beside Hands/Spin; assumed sequence steps, not instructions.                              |
| `guide_eightstep_turns_back`             | Left, back                                                                                        | 左手，回程                                                 | Left hand, return leg                         | Terse English; read as the left hand on the doubling-back leg.                                |
| `landing_spinner_mode_selection`         | Spinner Mode Selection                                                                            | 播放模式选择                                               | Playback mode selection                       | "Spinner" names the landing animation component; chose a neutral player term.                 |
| `learn_card_anatomy_reversal_text`       | A simple glyph showing whether the props alternate spin direction over the course of the pattern. | 一个简单的字形，显示道具在整个序列中是否交替改变旋转方向。 | …over the whole sequence.                     | "the pattern" rendered as the sequence; no pattern word reads naturally there.                |
| `module_desc_connect`                    | Sync with nearby spinners                                                                         | 与附近的流动艺术玩家同步                                   | Sync with nearby flow artists                 | No settled catalog word for "spinner".                                                        |
| `profile_pronouns_placeholder`           | e.g., they/them                                                                                   | 例如：TA                                                   | e.g., TA                                      | TA is the common written neutral pronoun.                                                     |
| `pronoun_preset_they_them`               | they/them                                                                                         | TA                                                         | TA                                            | Presets localized to 他/她/TA; keep English if profiles show English pronouns to all viewers. |
| `settings_background_intro`              | Choose the moving backdrop for your composer.                                                     | 为你的 Composer 选择动态背景。                             | Choose the moving backdrop for your Composer. | Lowercase "composer" may mean the workspace generically.                                      |
| `shape_engine_against`                   | against                                                                                           | 对                                                         | against / versus                              | Unchanged; ambiguous without the sentence the fragment joins.                                 |
| `shape_engine_solo_pro`                  | {petals}-petal inspin flower                                                                      | {petals} 瓣 Inspin Flower                                  | {petals}-petal inspin flower                  | Key says pro, English says inspin; followed English.                                          |
| `viewer_ui_motion_both`                  | Left · Right                                                                                      | 左手 · 右手                                                | Left hand · Right hand                        | Assumed hand-motion visibility options; if screen sides, use 左 · 右.                         |

### English to its owner

- Gamma described as "right angle" (left as is, per brief; Austen wants "hands adjacent"): `browse_audit_hands_right_angle`, `guide_ratios_ends_level1`, `learn_timing_intro_placement_gamma`, `learn_placement_comparison_gamma`, `learn_placement_gamma_geometry`, `pictograph_desc_group_gamma`, `verified_level1_gamma_definition`, `verified_level1_placements_seo_description`, `verified_level1_guide_page_seo_4`.
- `browse_unknown`: key name suggests "Unknown" but the value is "By".
- `guide_eightstep_turns_back`: "Left, back" is unclear out of context.
- `learn_reference_reading_choreo_cards`: reference title for Reading a Choreo Card is "Hand Motions"; looks copied from the hand-motions entry.
- `shape_engine_pictographs_calibration`: "Level 4 pictograph are" (number mismatch).
- `tab_desc_browse_gallery`, `tab_desc_browse_sequences`: "Browse and browse sequences" (duplicated verb).
- `site_faq_try_props`: "the spinner" is unclear (3D preview or the app?); translated literally as 旋转器.
- `train_step_advance_tap`, `train_step_advance_voice`: both read "Tap or Voice"; probably "Tap" and "Voice".
- `train_timed_config_title`: title repeats the description sentence.
- `verified_level1_examples_cccc_54`: "after the second B" sits in the CCCC section, which has no B.
- `verified_level1_lt3_dash_letters_206`, `verified_level1_lt3_dash_letters_207`: directions look swapped against `_196` / `_197`; "The Dash" reads as "the dash".

### May not fit

None found. Chinese labels came out at or under the English width.

## Unreleased features — 2026-11-14

Headless fill of the not-yet-released strings for Ilo, on Austen's rule of 2026-11-14: everything a visitor will eventually see is translated; screens only he uses stay English. Register as before: mainland Simplified Chinese, 你 (never 您), full-width punctuation, “” quotes. Read-backs for plain strings were taken from the zh-Hant fill of the same key (same meaning); they are written separately only where the Simplified text differs.

- Keys filled: 747 (arena 43, attribution 14, beta 4, community 20, connect 65, hall 39, mandala 30, poi 41, post 366, premium 45, voice 56, watch 24).
- Left English on purpose: `admin_*`, `moderation_*`, `skel2tka_*`, `scheduler_*`, `gallery_*`, `character_*`. These are tools only Austen uses.
- Existing values were not touched. The change list for Ilo is `E:/tka-languages/runs/unrel/zh/changes.json` (747 entries).

### Term decisions

| English | zh (Simplified) |
| --- | --- |
| step (of a sequence) | 步 (every sequence `beat` count: arena, connect, poi_lab, watch) |
| beat (tapped on a video or a song) | 拍点 (post tools, where the English means musical beats) |
| Post Studio editor words | 时间轴, 轨道 (lane/track), 图层 (layer), 播放头 (playhead), 关键帧 (keyframe), 交叉淡化 (crossfade), 转场 (transition), 画中画 (picture in picture), 慢动作 (slow mo), 完整演练 (run-through), 分解条 (breakdown strip), 闪光 (flash) |
| Arena / Battle | 竞技场 / 对战 |
| Hall of Shame | 耻辱殿堂 |
| Premium / Free | 高级版 / 免费版 (matches the catalog's 高级版) |
| Poi | Poi (kept as the catalog does) |
| session (Connect) | 会话; (voice practice) 练习记录 |
| Take | 录像 |
| Staff | 棍 |
| Clockwise / Counterclockwise | 顺时针 / 逆时针 |

### Unsure

| Key | English | Text | Read-back | Why |
| --- | --- | --- | --- | --- |
| `post_editor_tap_beats` | Tap beats | 点拍点 | Tap beat points | Could mean steps instead of music beats; read as music beats because the hint talks about a video. |
| `post_editor_hook_spoken` | How to say it | 怎么说 | How to say it | Context (an opening hook's spoken line) is not visible. |
| `post_editor_card_ring` | Ring on beats | 随拍点亮圈 | A ring that lights on the beats | Short English; the ring is read as a lit ring that steps with the beat. |
| `post_editor_titles_lit` | Light one letter | 点亮一个字母 | Light up one letter | Assumed to light one letter of the name. |
| `post_timeline_channel_curve` | {channel} curve from {start} to {end}, {curve} | {channel}曲线，从 {start} 到 {end}，{curve} | {channel} curve from {start} to {end}, {curve} | {channel} is assumed to be a noun label, so no space was put around it. |
| `connect_seek_position` | Seek position | 跳转到指定位置 | Jump to a position | Read as the label of a playback slider. |

### English to its owner

- `mandala_copy_count`, `mandala_filter_all`, `poi_lab_beat_count`, `poi_lab_beat_number`, `voice_sessions_days_ago`, `voice_sessions_event_count`, `voice_sessions_hours_ago`, `voice_sessions_minutes_ago`: the English wraps the placeholder in literal quotes (`"{count}" copies`). The quotes were dropped; they look like escaping leftovers.
- `connect_sharing_sequence`: the key says sharing but the English says "Search for users above to invite them." Translated what it says.
- `connect_no_sessions_nearby` and `connect_sessions_appear_automatically` carry the same text. So do `connect_no_friends_yet` and `connect_add_friends_hint`.
- `premium_user_count_tagline` is a fragment that must follow {count}. Word order may break in other layouts.
- `post_editor_fly_unavailable` says "lane" while the rest of Post Studio says "track". Read as the same thing.

### May not fit

- `post_editor_card_ring`: "随拍点亮圈" is about twice as wide as "Ring on beats" in a narrow control row.
- `post_editor_fly_unavailable`, `post_editor_lift_hint`, `post_editor_tutorial_hint`: hint text, about as long as English; check small hint areas.
