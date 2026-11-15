# Arabic translation ledger

## Read-back — 2026-11-13

Every released key in `messages/ar.json` was read against `messages/en.json`,
graded right, off or wrong, and fixed where off or wrong. Missing keys were
filled. The per-key record (English, before, after, my English read-back,
grade) is kept outside the repo in the run notes for Ilo.

| Count                          | Keys                                                        |
| ------------------------------ | ----------------------------------------------------------- |
| Released total                 | 9138                                                        |
| Filled (were missing)          | 215                                                         |
| Changed: off                   | 281                                                         |
| Changed: wrong                 | 77                                                          |
| Left as is (right)             | 8565                                                        |
| Still missing                  | 0                                                           |
| Same as English after the pass | 176 (brand and product names, letter codes, units, numbers) |

Contract test (`tests/unit/i18n-catalog-contract.test.ts`): 67 passed,
5 failed. All 5 are outside Arabic. The English-fallback check fails only on
107 keys missing from `de.json`, which is expected. The other four are the
es, fr, it and pt coverage floors (`8936 of 9138` for the first reported),
which this branch does not touch. Every Arabic check passes. `git diff --check`
is clean, the JSON parses, and placeholders, tags and entities match English
in every changed key.

### Term decisions

- Effort (Laban movement quality) = طابع الحركة. The old الجهد / الجهود
  (physical exertion) is gone from the released keys. The Laban effort names
  are انزلاق (Glide), ربتة (Dab), ضغط (Press), لكمة (Punch), مرن (Elastic),
  ارتداد (Bounce) and تهيّؤ (Anticipation).
- Flow arts = فنون الحركة everywhere. All 45 strings that said فنون التدفق
  were changed, including every "Flow Arts Notation Guide" SEO title.
- Notation = التدوين. الترميز was left in only one place, `export_encoding`
  (video encoding), where it is correct.
- Pictograph = رمز تصويري. رسم توضيحي and الرسوم التوضيحية no longer appear.
- Mode = وضع and pattern = نمط. Mode strings that said نمط were moved to وضع
  (grid mode, the four timing-and-direction modes, Quarter-Opp / Quarter-Same,
  performer colour mode). Style is now أسلوب, so that نمط is used only for
  pattern. Flower shapes are أشكال Flower, not أنماط Flower.
- Mirror = عكس, Flip = قلب, Invert = عكس الدوران. Fixed in
  `create_review_invert`, `create_ui_invert_when`, `tunnel_invert`,
  `viewer_ui_invert`, the action-help names and the keyboard help. Mirror
  labels that said مرآة / انعكاس are now عكس. A camera mirror keeps مرآة,
  because there it is a real mirror.
- LOOP transforms follow the termbase: Mirrored معكوس, Flipped رأسًا على عقب,
  Inverted مقلوب. The LOOP picker descriptions keep قلب for "invert" so they
  stay consistent with مقلوب.
- Mirrored = left-right and Flipped = top-bottom, spelled out in
  `loop_picker_description_mirrored` and `_flipped` and the transform
  descriptions.
- CW / CCW: every orientation chip uses مع العقارب / عكس العقارب. Sentences
  say مع عقارب الساعة / عكس عقارب الساعة. No CW or CCW is left in any Arabic
  value.
- Latin terms with a capital: Static, Float, Gamma, Alpha, Beta, Antispin,
  Prospin, Inspin, Extension, Flower, Dash, Shift and LOOP stay Latin wherever
  they name the term. This covers labels, headings, Codex type names and guide
  prose such as "executes a Dash" and "from Alpha to Gamma". Where English uses
  "static" as a plain adjective ("the other hand remains static"), the Arabic
  keeps ثابت / ثابتة. The slot codes `(static|static)` and `(dash|dash)` are
  copied from English as they are.
- Base Motions = الحركات الأساسية. Take = لقطة (filmed take). The "takes"
  strings that said مقطع / المقاطع were changed. Playground = sandbox: ساحة
  is kept, read as a sandbox.
- Compositions = التركيبات, replacing مؤلفات. Download = تنزيل. Render =
  إنشاء, replacing عرض in the viewer render strings. Combo = كومبو, one word
  for all the trainer combo strings.
- Period = التقسيم (how a LOOP is divided). Digits are Western. `_other`
  plurals use the Arabic plural.
- Arrows: some guide print strings use ← and others →, as in the existing
  text. They were left as found. Which way arrows should point in RTL is
  Ilo's call.

### Unsure

| Key                                                                                                | English                                               | My text                                    | Read-back                                                                       | Why                                                                                                                 |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `animation_menu_efforts`, `guide_paths_effort`, `shape_engine_settings_effort`, `viewer_ui_effort` | Efforts / Effort                                      | طابع الحركة                                | movement quality                                                                | No settled Arabic Laban term. This one is descriptive, not a literal. The plural menu label uses the same singular. |
| `viewer_ui_effort_name_dab`, `_anticipation`                                                       | Dab / Anticipation                                    | ربتة / تهيّؤ                               | a light pat / getting ready                                                     | Laban names, chosen by meaning                                                                                      |
| `create_tour_help_period_name`, `generator_period`, `create_deep_rotation_period`                  | Period / Rotation period                              | التقسيم / تقسيم الدوران                    | the division / division of the rotation                                         | "Period" here means how the sequence is cut before the return. A literal دورة would clash with Turn.                |
| `generator_loop_flipped`, `browse_audit_chip_flipped`                                              | Flipped                                               | رأسًا على عقب                              | upside down                                                                     | Termbase form, but long for a chip                                                                                  |
| `browse_collections_founding_book_description`                                                     | The base motions at one turn, with the book reversal… | …مع عكس الاتجاه على طريقة الكتاب…          | with the reversal done the book's way                                           | "Book reversal" is a named technique with no Arabic equivalent                                                      |
| `browse_collections_founding_*_name`                                                               | TKA 1: Learning Letters, etc.                         | TKA 1: تعلّم الحروف, etc.                  | Learning letters / Writing words / Speaking sentences / Classic book variations | Deck titles are product names. Translated for now; they may need to stay English.                                   |
| `browse_ui_no_filters_yet_pick_one_on_the_left`                                                    | No filters yet. Pick one on the left.                 | لا توجد فلاتر بعد. اختر واحدًا من القائمة. | No filters yet. Pick one from the list.                                         | "On the left" was dropped because the panel mirrors in RTL                                                          |
| `library_look_trail_loop_clear`                                                                    | Loop-clear trail                                      | أثر يُمسح كل دورة                          | a trail cleared every cycle                                                     | English is terse. The meaning is inferred.                                                                          |
| `pictograph_placement_move_left`, `_right`                                                         | Move left / Move right                                | حرّك اليسرى / حرّك اليمنى                  | move the left one / the right one                                               | Read as moving the left or right prop (the edit buttons in PropPlacementGrid), not as a direction                   |
| `shared_fan_build_day`                                                                             | DoodleGrip Day                                        | DoodleGrip تدريب                           | DoodleGrip practice                                                             | "Day" fans are the unlit practice build. Kept as written.                                                           |
| `tab_browse_following`, `tab_desc_browse_following`                                                | Following                                             | المتابَعون                                 | people you follow                                                               | Could also mean a feed of followed work                                                                             |

### English to its owner

| Key                                                                                                                                                                                                                                                                                               | What is unclear                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `browse_audit_hands_right_angle`, `learn_timing_intro_placement_gamma`, `learn_placement_comparison_gamma`, `learn_placement_gamma_geometry`, `pictograph_desc_group_gamma`, `verified_level1_gamma_definition`, `verified_level1_placements_seo_description`, `verified_level1_guide_page_seo_4` | Gamma described as a "right angle". The Arabic is left as it is (زاوية قائمة), per the brief.                                                                                                                   |
| `verified_level1_lt3_dash_letters_206`, `_207`                                                                                                                                                                                                                                                    | "β→γ: Sig Dash, Del Dash" and "α→γ: The Dash, Om Dash" contradict `lt2_wxyz_196`/`197` (Sigma/Delta are α→γ, Theta/Omega β→γ). "The Dash" probably means Theta Dash. The Arabic follows the English as written. |
| `guide_eightstep_turns_back`                                                                                                                                                                                                                                                                      | "Left, back" is unclear                                                                                                                                                                                         |
| `learn_place_1_5_description`                                                                                                                                                                                                                                                                     | "dataframe letters" is developer jargon                                                                                                                                                                         |
| `loop_picker_description_mirrored`, `_flipped`                                                                                                                                                                                                                                                    | "vertically" and "horizontally" are ambiguous. The Arabic says left-right and top-bottom.                                                                                                                       |
| `tab_desc_browse_gallery`, `tab_desc_browse_sequences`                                                                                                                                                                                                                                            | "Browse and browse sequences" repeats a word                                                                                                                                                                    |
| `train_step_advance_tap`, `train_step_advance_voice`                                                                                                                                                                                                                                              | All three advance options read "Tap or Voice"                                                                                                                                                                   |
| `train_timed_config_title`                                                                                                                                                                                                                                                                        | Same text as its description                                                                                                                                                                                    |
| `tab_desc_browse_visuals` … `_following`                                                                                                                                                                                                                                                          | Each description repeats its tab label                                                                                                                                                                          |

### May not fit

- `create_action_orientation_clock_short`, `_counter_short`, `_clockIn_short`,
  `_clockOut_short`, `_counterIn_short`, `_counterOut_short`
- `create_ui_orientation_clock_short`, `create_ui_orientation_counter_short`
- `shape_engine_orientation_clock`, `shape_engine_orientation_counter`
- `create_action_hand_left_short`, `create_action_hand_right_short`
- `generator_loop_flipped`, `browse_audit_chip_flipped`
- `guide_companion_rotate_cw`, `guide_companion_rotate_ccw`
- `create_action_help_invert_name`, `create_workspace_history_invert`,
  `create_review_invert`, `tunnel_invert`, `viewer_ui_invert`
- `animation_menu_efforts`, `guide_paths_effort`,
  `shape_engine_settings_effort`, `viewer_ui_effort`
- `tab_browse_saved`

## Unreleased features — 2026-11-14

Headless fill of the not-yet-released strings for Ilo, on Austen's rule of 2026-11-14: everything a visitor will eventually see is translated; screens only he uses stay English. Modern Standard Arabic as before: masculine imperative for actions, plural-neutral counts such as «الخطوات: {count}», catalog product names (Poi, Reels, Choreo Card) kept Latin. Read-backs for plain strings were taken from the zh-Hant fill of the same key (same meaning); they are written separately only where the Arabic text differs.

- Keys filled: 747 (arena 43, attribution 14, beta 4, community 20, connect 65, hall 39, mandala 30, poi 41, post 366, premium 45, voice 56, watch 24).
- Left English on purpose: `admin_*`, `moderation_*`, `skel2tka_*`, `scheduler_*`, `gallery_*`, `character_*`. These are tools only Austen uses.
- Existing values were not touched. The change list for Ilo is `E:/tka-languages/runs/unrel/ar/changes.json` (747 entries).

### Term decisions

| English | Arabic |
| --- | --- |
| step (of a sequence) | خطوة (every sequence beat count) |
| beat (tapped on a video or a song) | خطوة in post tools; إيقاع الأغنية for the song beat |
| Post Studio editor words | مسار/طبقة، مؤشر التشغيل (playhead)، إطار مفتاحي، تلاشٍ متقاطع، صورة داخل صورة، حركة بطيئة، الأداء الكامل، وميض |
| Hall of Shame | قاعة العار |
| Premium / Free | مميز / مجاني |
| Take | لقطة |
| Staff | عصا (pl. عصيّ) |
| Choreo Card | kept English as the catalog does |
| Clockwise / Counterclockwise | مع اتجاه عقارب الساعة / عكس اتجاه عقارب الساعة |

### Unsure

| Key | English | Text | Read-back | Why |
| --- | --- | --- | --- | --- |
| `connect_invited_you_to_join` | invited you to join | يدعوك إلى الانضمام | invites you to join | Fragment after a name; the name sits in another element. |
| `connect_is_sharing` | is sharing | يشارك | shares | Same fragment problem; masculine form assumed. |
| `post_editor_card_ring` | Ring on beats | حلقة عند الخطوات | Ring at the steps | Short English; read as a lit ring that steps with the beat. |
| `post_editor_hook_spoken` | How to say it | طريقة النطق | How to pronounce it | Context (an opening hook line) is not visible. |
| `voice_sessions_*pattern*` | Pattern Analysis, Unresolved Patterns | تحليل الأنماط، الأنماط غير المحلولة | pattern analysis | pattern means a regex-like voice command pattern. |
| `post_editor_titles_land` | Land on card | الهبوط على البطاقة | Landing on the card | Assumed to mean the title name lands on the card. |

### English to its owner

- `mandala_copy_count`, `mandala_filter_all`, `poi_lab_beat_count`, `poi_lab_beat_number`, `voice_sessions_days_ago`, `voice_sessions_event_count`, `voice_sessions_hours_ago`, `voice_sessions_minutes_ago`: the English wraps the placeholder in literal quotes (`"{count}" copies`). The quotes were dropped; they look like escaping leftovers.
- `connect_sharing_sequence`: the key says sharing but the English says "Search for users above to invite them." Translated what it says.
- `connect_no_sessions_nearby` and `connect_sessions_appear_automatically` carry the same text. So do `connect_no_friends_yet` and `connect_add_friends_hint`.
- `connect_invited_you_to_join`, `connect_is_sharing`, `premium_user_count_tagline` are sentence fragments that only work in English word order.
- `post_editor_fly_unavailable` says "lane" while the rest of Post Studio says "track". Read as the same thing.

### May not fit

- Arabic is longer than English in several tool tabs: `post_editor_tool_fly` (الطيران إلى التالي), `post_editor_tool_split_hands` (فصل اليدين), `post_editor_tool_panel_lift` (رفع اللوحة).
- `post_editor_lift_in_here`, `post_editor_lift_out_here`, `post_editor_split_close_here`: about twice the English length.
