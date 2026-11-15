# Traditional Chinese translation ledger

## Read-back — 2026-11-13

Headless read-back of every released string for Ilo, approved by Austen on
2026-11-13. The audience is zh-TW and zh-HK. The register is Taiwan software
Traditional Chinese with 你 (never 您), full-width ，。：；！？ punctuation and
「」 quotes.

- Released keys in total: 8,996 (the en.json keys whose prefix is listed in
  `scripts/i18n-released-prefixes.json`).
- Filled: 8,996. The catalog held only `$schema` before this run, so every
  key is new.
- Changed (off or wrong): 1,091. Of these, 1,018 corrected the machine draft
  (the zh Simplified catalog converted with OpenCC to Taiwan phrasing, then
  run through rule passes), and 73 were missing from zh and were translated
  from the English.
- Left as is: 7,905 (the draft read back correctly after the rule passes).
- Contract test: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`
  gave `Test Files  1 passed (1)`, `Tests  72 passed (72)`.
- Also checked: the JSON parses, `{placeholder}` sets match English on every
  key, markup is limited to the English tags plus strong/em/br, there is no
  ASCII "..." and no 您, there is no half-width punctuation next to Chinese
  characters, and `git diff --check` is clean. A character-level OpenCC check
  flagged 58 strings. All of them were OpenCC's own preferences (臺 for 台,
  瞭解 for 了解) or correct words (圓周, 組合, 只影響, 干擾, and 手表示 meaning
  "the hand shows"). None needed a change.
- The change list for Ilo is `E:/tka-languages/runs/zh-Hant/changes.json`
  (8,996 entries).

### Term decisions

- Required Taiwan words are used throughout: 設定, 預設 (default only;
  Presets = 預設組合, Setups = 設定組合), 影片, 螢幕, 檔案, 儲存, 載入, 選單,
  使用者, 登入／登出, 程式, 軟體, 網路, 資料, 介面, 建構, 支援, 連結, 訊息,
  搜尋, 列印, 預覽, 視窗, 帳號, 圖示, 範本, 物件, 品質, 解析度.
- Library (the user's own) = 收藏庫. A bare 庫 does not read as a library in
  Taiwan, and 資料庫 means database. Favorites = 收藏.
- Turn Pattern = 轉數規律, never 模式 ("pattern" in Create is never "mode").
  Duration and direction patterns = 時長規律 and 旋轉方向規律. Movement
  patterns = 花式. The Arrange tab = 排列.
- Effort is Laban effort: 力效. Base Motions = 基礎動作 (plain motions with no
  turns). Level = 等級, Type = 類型.
- Step = 步 everywhere. 拍 stays only where the English deliberately counts
  musical beats (Zan's Diamond, CAPs). The Beat # label = 步序號. Half-beat
  shortcuts = 半步／整步.
- Take = 錄影 (a filmed video take). Playground = 沙盒 (a sandbox area; 實驗場 replaced).
- Grid rows = 列 and columns = 欄 (Taiwan; mainland 行/列 reads the other way
  round). Joined grid = 聯結網格. Mirror = 鏡像 (OpenCC gave 映象).
- Flower = 花形, petals = 瓣, Extension = 延伸, Motion paths = 動作路徑, hand
  path = 手部路徑, Timing = 節奏時機, Reversal = 換向.
- Prospin, Antispin, Inspin, Isolation, Float, Shift, Dash, Cross-Shift and
  the placement names stay Latin, as in zh. Zan's Diamond keeps its English
  name.
- Account = 帳號, email = 電子郵件, follow = 追蹤, publish = 發布, collection
  = 合輯, gallery (browse) = 作品集, 3D gallery rooms = 展廳, inbox = 收件匣,
  remix = 重混, trails = 軌跡, visuals = 視覺作品, hoop = 呼拉圈, tutorial =
  教學, QR code = QR 碼, Pages (Facebook) = 粉絲專頁, profile = 個人檔案.
- Spacing: one space between Chinese and Latin words or `{placeholders}`, and
  none between Chinese characters or before 「.
- The termbase gained a `zh-Hant` value beside every `zh` value, and the
  glossary gained a Traditional Chinese note in each per-language section.

### Unsure

| Key                                                                               | English                                     | zh-Hant                        | Read-back                                    | Why                                                                                                                                                  |
| --------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_construct_no_pictographs_prefix`, `create_construct_no_pictographs_suffix` | "No pictographs in" … "match these settings." | 在 … 中沒有符合這些設定的象形圖。 | "In [module] there are no pictographs that match these settings." | The sentence is split around a module name. Chinese needs 在…中沒有…, so the prefix holds only 在. It reads right only if the UI joins the pieces with the name in between. |
| `viewer_ui_post`                                                                  | Post                                        | 發布                           | Publish                                      | It may be the Post Studio name rather than the verb. Kept as the verb.                                                                              |
| `site_faq_try_props`                                                              | Try props in the spinner                    | 在無限播放器中試試道具         | Try props in the infinite player             | "Spinner" is read as the landing page's Infinite LOOPs player. That is an inference.                                                                  |
| `guide_eightstep_turns_back`                                                      | Left, back                                  | 左手，回程                     | Left hand, return leg                        | The label's context is not visible. It is read as the left hand's turns on the way back.                                                             |

### English to its owner

Gamma "right angle" strings, left as the English says them (直角). 直角 does
not appear in any other key.

- `browse_audit_hands_right_angle`: gamma described as hands at a right angle.
- `learn_timing_intro_placement_gamma`, `learn_placement_comparison_gamma`,
  `learn_placement_gamma_geometry`: gamma described as a right angle.
- `pictograph_desc_group_gamma`: "gamma (right angle)".
- `verified_level1_gamma_definition`, `verified_level1_placements_seo_description`,
  `verified_level1_guide_page_seo_4`: gamma described as a right angle.
- `guide_ratios_ends_level1` also says "at right angles", about antispin
  cat-eyes, not gamma. It is kept as written.

Other English problems:

- `tab_desc_browse_gallery`, `tab_desc_browse_sequences`: read "Browse and
  browse sequences" (a doubled word). Translated as 瀏覽序列.
- `train_step_advance_tap`, `train_step_advance_voice`,
  `train_step_advance_both`: all three read "Tap or Voice".
- `train_timed_config_title`: repeats the description sentence instead of
  giving a title.
- `shape_engine_pictographs_calibration`: "Level 4 pictograph are" (should be
  plural).

### May not fit

- `share_reel`: "Reel" became "Reel 短影片", about three times as wide.
- `browse_audit_chip_group_added`: "Added" became "新增時間", a chip about 60%
  wider.

### Not done

- The `zh-Hant` entry in the contract test's released-coverage floor stays at
  0. That test file is outside this run's allowed files.

## Unreleased features — 2026-11-14

Headless fill of the not-yet-released strings for Ilo, on Austen's rule of 2026-11-14: everything a visitor will eventually see is translated; screens only he uses stay English. Register as before: Taiwan software Traditional Chinese, 你 (never 您), full-width punctuation, Taiwan words (影片, 檔案, 設定, 儲存).

- Keys filled: 778 (arena 43, attribution 14, beta 4, clip 14, community 20, connect 65, duet 12, hall 39, mandala 30, poi 41, post 366, premium 45, viewer3d 5, voice 56, watch 24).
- Left English on purpose: `admin_*`, `moderation_*`, `skel2tka_*`, `scheduler_*`, `gallery_*`, `character_*`. These are tools only Austen uses.
- Existing values were not touched. The change list for Ilo is `E:/tka-languages/runs/unrel/zh-Hant/changes.json` (778 entries).

### Term decisions

| English | zh-Hant |
| --- | --- |
| step (of a sequence) | 步 (every sequence `beat` count: arena, connect, clip, poi_lab, watch) |
| beat (tapped on a video or a song) | 拍點 (post tools, where the English means musical beats) |
| Post Studio editor words | 時間軸, 軌道 (lane/track), 圖層 (layer), 播放指標 (playhead), 關鍵影格 (keyframe), 交叉淡化 (crossfade), 轉場 (transition), 子母畫面 (picture in picture), 慢動作 (slow mo), 完整演練 (run-through), 分解條 (breakdown strip), 閃光 (flash) |
| Arena / Battle | 競技場 / 對戰 |
| Hall of Shame | 恥辱殿堂 |
| Premium / Free | 進階版 / 免費版 (matches the catalog's 進階版) |
| Poi | Poi (kept as the catalog does) |
| session (Connect) | 連線; (voice practice) 練習記錄 |
| Take | 錄影 |
| Staff | 棍 |
| Clockwise / Counterclockwise | 順時針 / 逆時針 |

### Unsure

| Key | English | Text | Read-back | Why |
| --- | --- | --- | --- | --- |
| `post_editor_tap_beats` | Tap beats | 點拍點 | Tap beat points | Could mean steps instead of music beats; read as music beats because the hint talks about a video. |
| `post_editor_hook_spoken` | How to say it | 怎麼說 | How to say it | Context (an opening hook's spoken line) is not visible. |
| `post_editor_card_ring` | Ring on beats | 隨拍點亮圈 | A ring that lights on the beats | Short English; the ring is read as a lit ring that steps with the beat. |
| `post_editor_titles_lit` | Light one letter | 點亮一個字母 | Light up one letter | Assumed to light one letter of the name. |
| `post_timeline_channel_curve` | {channel} curve from {start} to {end}, {curve} | {channel}曲線，從 {start} 到 {end}，{curve} | {channel} curve from {start} to {end}, {curve} | {channel} is assumed to be a noun label, so no space was put around it. |
| `connect_seek_position` | Seek position | 跳到指定位置 | Jump to a position | Read as the label of a playback slider. |

### English to its owner

- `mandala_copy_count`, `mandala_filter_all`, `poi_lab_beat_count`, `poi_lab_beat_number`, `voice_sessions_days_ago`, `voice_sessions_event_count`, `voice_sessions_hours_ago`, `voice_sessions_minutes_ago`: the English wraps the placeholder in literal quotes (`"{count}" copies`). The quotes were dropped; they look like escaping leftovers.
- `connect_sharing_sequence`: the key says sharing but the English says "Search for users above to invite them." Translated what it says.
- `connect_no_sessions_nearby` and `connect_sessions_appear_automatically` carry the same text. So do `connect_no_friends_yet` and `connect_add_friends_hint`.
- `premium_user_count_tagline` is a fragment that must follow {count}. Word order may break in other layouts.
- `post_editor_fly_unavailable` says "lane" while the rest of Post Studio says "track". Read as the same thing.
- `premium_faq_a_refund`: the address support@tka.com is kept as written.

### May not fit

- `post_editor_card_ring`: "隨拍點亮圈" is about twice as wide as "Ring on beats" in a narrow control row.
- `post_editor_fly_unavailable`, `post_editor_lift_hint`, `post_editor_tutorial_hint`: hint text, about as long as English; check small hint areas.
