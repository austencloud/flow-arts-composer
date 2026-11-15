# German translation ledger

## D1 — 2026-10-14

- Batch: D1; 41 new keys translated; 143 retranslate entries processed (128 corrected, 15 unchanged); no separate review entries. Output contains all 184 required keys.
- Apply result: `messages/de.json: inserted 41, replaced 143, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`.
- Catalog diff before this ledger: only `messages/de.json`; 169 insertions, 128 deletions, net +41 lines. Focused batch audit confirmed exact placeholder counts and markup preservation, single-line values, and no out-of-batch edits.
- Glossary choices: informal du/dein for user address; Gitter including compounds and genitive Gitters; Level including Level-Matrix, with necessary gender and pronoun agreement. Existing retranslate wording otherwise preserved. New navigation labels include Labor, Kunst, Poi-Labor, Pranger, and Bibliothek; shared German loanwords Admin, Arena, Community, Studio, Mandala, Moderation, and Video remain natural German labels.
- False positives preserved: `learn_timing_examples_opposite_caption`, `create_tour_help_duration_rhythm_full_desc`, `shape_engine_independence_prose`, `shape_engine_source_after`, `browse_verified_card_remove_failed`, `browse_verified_handoff_copy`, `guide_l2_topic_double_turn_dashes_description`, `guide_paths_third_order_concave`, `guide_l2_type5_slots`, `verified_level1_base_letters_4`, `verified_level1_base_letters_8`, `verified_level1_examples_cccc_57`, `verified_level1_words_312`, `guide_l2_print_glyphspadspage_1`, and `guide_l2_print_sandtpage_6`. Their Sie/Ihre forms refer to objects, letters, or other third-person subjects, not formal user address.
- Uncertain/inherited glossary conflicts: existing retranslate strings include translated The Kinetic Alphabet and Box/Diamond names (for example `verified_level1_grid_sheet_intro`), and “Zans Diamant” in `guide_zans_path_figure`. These were retained because D1 explicitly requires all wording beyond address/Gitter/Level corrections to remain unchanged. No new translation uncertainty; no native review performed.

## D2 — 2026-10-14

- Batch: D2; review only. All 337 entries reviewed: 28 corrected, 309 retained. No new keys or retranslate entries.
- Apply result: `messages/de.json: inserted 0, replaced 28, refused 0`.
- Gate: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`.
- Result: `Test Files  1 passed (1)`; `Tests  66 passed (66)`; exit 0.
- Catalog diff before this ledger: only `messages/de.json`; 28 insertions, 28 deletions, net zero lines, matching 28 changed review entries. Focused audit confirmed batch membership, exact placeholder counts, single-line values, no added markup, and no other catalog changes.
- Glossary choices: Diamond → Raute; Box → Quadrat; Type → Typ; Double Staff → Doppelstab; Turns → Drehungen. Codex and all motion/placement/VTG names remain English, including plural Shifts/Dashes and the Cross/Dual fragments that assemble protected motion names. Level, Timing, Tempo, Variation, notation data, units, symbols, and placeholder-only values remain unchanged.
- UI wording: TAP → TIPPEN; the practice action Start → Starten; playback action Pause → Pausieren. Sequence-position Start and timeline-duration Pause labels remain natural German nouns. Performance → Auftritt matches existing Auftritt labels. Screenshot labels use Bildschirmfoto; Glyphs → Glyphen; Opening / Closing → Öffnen / Schließen; Codex Pages → Codex-Seiten.
- Retained natural German words and established loanwords include Name, Filter, Status, Feedback, Community, Shop, Downloads, Export, Countdown, Remix, Animation, Navigation, Mandala, Premium, optional, and standard color/effect labels. Effect identifiers, prop/build names, pronoun values, and sequence data were not rewritten.
- Copy review: ai-bust mechanical pass on the output JSON returned `[]` at HIGH threshold; judgment pass found no new filler or structural prose issues.
- Uncertain: the glossary does not specify Cat Dog/Catdog or Moon LED; retained the existing technical/build labels. It does not specify localization of the they/them pronoun preset; retained that identity value without inventing a German equivalent. PADS remains an acronym without an established expansion in the glossary. Lorq Nichols’ heading uses the descriptive translation 144-Formen-Matrix; no established German title or native review was verified.
- Existing glossary conflicts in adjacent values (such as Diamond/Box prose and other English Turn labels) are outside D2's permitted keys and remain unchanged.

## G1 (coordinator) — 2026-10-14

- 40 existing keys corrected to the glossary by the coordinator: diamond grid is Raute and box is Quadrat (replacing Diamant, Diamantgitter, Diamond-Modus, Box-Modus); The Kinetic Alphabet and Codex stay English (replacing Kinetisches Alphabet and Kodex); Zan's Diamond stays a proper name (replacing Zans Diamant).
- `effect_deep_option_diamond` keeps Diamant: it names an effect shape, not the grid.
- Gate: `Test Files  1 passed (1)`; `Tests  66 passed (66)`.

## REV (coordinator) — 2026-10-14

- gpt-6-astra review of a 69-key sample flagged 5 (7.2%); all 5 fixes applied.
- Sweeps from the findings: Handweg to Handpfad (glossary section 3, 9 keys); Double-Staff to Doppelstab in the two FAQ answers.
- Gate: `Tests  66 passed (66)`.

## Read-back — 2026-11-13

- Scope: every released key (prefix listed in `released` in `scripts/i18n-released-prefixes.json`) read back from German into English and compared with the English source, in 37 chunks of up to 250 keys grouped by prefix.
- Released keys: 9138. Filled: 175 (all previously missing released keys, including the new keys from the hardcoded sweep). Changed: 619 (581 off, 38 wrong). Left as is: 8344.
- Outside the released set: `mandala_undo` filled as „Rückgängig“, because `PropPlacementGrid.svelte` now calls it on an audited surface and the contract test's fallback check failed on it for German. No other unreleased key was touched. `messages/de.json` contains a duplicate unreleased key (`post_editor_split_hint`); the apply step edited lines in place so both copies are unchanged.
- Contract test: `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts` → `Tests  4 failed | 68 passed (72)`. All German checks pass, including "does not silently fall back to English". The four failures are the es, fr, it and pt released-coverage floors (`8936 of 9138 released keys`, under 0.98); those catalogs lack the new English keys and are outside this run.
- `git diff --check` clean; JSON parses; placeholders, tags and entities match English in every changed value. Full change list with read-backs: `E:/tka-languages/runs/de/changes.json`.

### Term decisions

- Effort (Shape Engine, guide paths, viewer, Phrase Effort lab) = Dynamik, replacing Aufwand and Anstrengung. Effort names use the German Laban set: Gleiten, Tupfen, Drücken, Stoßen, plus Elastisch, Federn, Ausholen.
- Base Motions (`generator_level_no_turns`) = Grundbewegungen (already correct).
- Staff = Stab, Stäbe, Stabende, Stabposition; double staff = Doppelstab. The termbase lists `de: "Staff"`, but glossary section 9 and the D2/REV ledger entries say Stab and Doppelstab, and the catalog used Stab in 46 strings against 19 leftover „Staff“. Followed the glossary; the termbase row should be updated to match.
- Placement = Position everywhere (Startposition, Endposition, Handposition); „Platzierung“ and „Startplatzierung“ retired.
- Hand path = Handpfad (Handbahn, Handweg and Handbewegung retired in that sense). Sequence = Sequenz (Folge retired for sequences). Prop = das Requisit (feminine Requisite and stray „Prop“ fixed).
- Step: a position in a sequence is Schritt, including where English says beat (viewer arrow keys, trace routes, share overlays, Shape Matrix tip). Musical counts keep Beat or Zählzeiten (16-count sequences).
- Orientation chips: CW/CCW written out with the glossary section 4 short words, Mit / Gegen, and Mit·Innen, Mit·Außen, Gegen·Innen, Gegen·Außen for the six `create_action_orientation_*_short` keys. Rotation-template sentences spell out im / gegen den Uhrzeigersinn. No CW, CCW, UZ or GUZ remains in released German.
- Mirrored = links-rechts spiegeln; Flipped = oben-unten (Umgeklappt as a label, Kippen as a short verb). LOOP labels follow glossary section 7: Rotiert, Getauscht, Invertiert, Halbiert, Geviertelt („gedreht/vertauscht“ kept only for plain prose such as „um 180° gedreht“).
- Invert = Invertieren; Extend = Verlängern; Rewind = Zurückspulen (the transform replaces the sequence with its reverse; „Rückwärts anhängen“ said it appends, which was wrong).
- Grid point letters stay Latin (N, E, S, W, NE …), replacing German O, NO, SO. Grid = Gitter (Schrittgitter replaces Schrittraster). TKA Level = Level (Stufe/Ebene retired in that sense; Ebene for layers and Stufenweise for the staircase stay).
- Static, Dual-Shift, Dual-Dash stay English as labels (Doppel-Shift and Doppel-Dash retired). Timing & Direction prose uses the German chip words zusammen, versetzt, viertelversetzt, gleichsinnig, gegensinnig; the six `pictograph_desc_timing_*` screen-reader strings now use the VTG labels (Split-Same-Timing).
- The Kinetic Alphabet keeps „The“ in prose („von The Kinetic Alphabet“); guide titles read „Leitfaden zu The Kinetic Alphabet“. Guide (product surface) = Leitfaden; „Handbuch“ retired. Walkthroughs such as the Construct tutorial keep Anleitung.
- Browse = Durchsuchen; Entdecken only for the Explore tab. Library = Bibliothek, collection = Sammlung. Creators module = Kreative; browse filters keep Ersteller („Nach Ersteller“, „Unbekannter Ersteller“), which reads better in the singular. Visuals = Visualisierungen. Shape Matrix = Formenmatrix. Choreo Card = Choreo-Karte. Performer = Performer (tunnel „Person“ retired). Hall of Shame = Pranger. Smart Collection = intelligente Sammlung. Game combo = Serie. Jump to = Schnellnavigation.
- Auth nudge and prompt bodies had dropped the English closing line; restored as „Kostenlos, in etwa zehn Sekunden.“
- Gamma: no new „rechter Winkel“. The gamma start chip reads Nebeneinander (hands adjacent) and the alpha chip Auseinander.

### Unsure

| Key                                                                                               | English                          | German                                               | Read-back                                 | Why                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_ui_orientation_clock_short` (and the other seven orientation chips)                       | CW / CCW·In …                    | Mit / Gegen·Innen …                                  | With / Against-in …                       | Glossary section 4 short words. They are German, but „Mit“ alone may not read as clockwise without the icon; the alternative „Im UZS“ is an abbreviation. |
| `browse_grid_skewed`                                                                              | Skewed                           | Gemischt                                             | Mixed                                     | Glossary maps Mixed/Skewed grid to Gemischtes Gitter; key unused in `src`.                                                                                |
| `browse_collections_founding_book_name`                                                           | Classic Book Variations          | Klassische Buch-Variationen                          | Classic book variations                   | „Book“ is the original TKA book; no settled German term.                                                                                                  |
| `browse_collections_founding_book_description`                                                    | … with the book reversal …       | … der Buch-Umkehrung …                               | … the book reversal …                     | Same: „book reversal“ has no settled German term.                                                                                                         |
| `create_ui_loop`                                                                                  | Loop                             | LOOP                                                 | LOOP                                      | Settings chip for the LOOP feature; German had „Schleife“.                                                                                                |
| `create_ui_location`                                                                              | Location                         | Punkt                                                | Point                                     | One hand's grid location in the start-placement editor; Position is taken by placement.                                                                   |
| `create_tour_help_tnd_tip`                                                                        | … each beat lands on.            | … jeder Schritt landet.                              | … each step lands on.                     | Read beat as a sequence position.                                                                                                                         |
| `create_transform_extend`                                                                         | Extend                           | Verlängern                                           | Lengthen                                  | Tool completes the sequence back to its start; Ergänzen also fits. Chosen for the glossary term.                                                          |
| `create_review_public_tunnels_open_in_browse_so_the_published_revision_and_creator_stay_explicit` | Public tunnels open in Browse …  | Öffentliche Tunnel öffnen sich unter Durchsuchen …   | Public tunnels open under Browse …        | Read Browse as the module, not the Explore tab.                                                                                                           |
| `effect_deep_tune_anything`                                                                       | Tune anything to create          | Passe etwas an, um eine eigene Variante zu erstellen | Adjust something to make your own variant | No direct use found in `src`.                                                                                                                             |
| `guide_paths_effort`                                                                              | Effort                           | Dynamik                                              | Movement quality                          | Assumed the Shape Engine effort setting.                                                                                                                  |
| `guide_ratios_origins_before`                                                                     | … Lorq Nichols, who publishes as | … Lorq Nichols, bekannt als                          | … Lorq Nichols, known as                  | Split sentence around a link; „bekannt als“ keeps the second half grammatical.                                                                            |
| `learn_trace_location_center`                                                                     | center                           | Zentrum                                              | centre                                    | Fits „im {location}“; „nach Zentrum“ in the travels template is still bare.                                                                               |
| `pictograph_desc_timing_split_same` (and five siblings)                                           | Split-Same timing                | Split-Same-Timing                                    | Split-Same timing                         | Screen-reader text; prose („versetzt, gleiche Richtung“) would also be defensible.                                                                        |
| `pictograph_placement_aiming` (and the placement prompts)                                         | Aiming the {noun}                | Ausrichten: {noun}                                   | Aiming: {noun}                            | Inserted nouns mix genders, so the prompts use „Verb: noun“ frames.                                                                                       |
| `pictograph_placement_move_left`                                                                  | Move left                        | Links verschieben                                    | Move to the left                          | English is equally ambiguous.                                                                                                                             |
| `shape_engine_mode_opp_short`                                                                     | Opp                              | Gegen                                                | Opposite                                  | Replaces the abbreviation „Gegenl.“.                                                                                                                      |
| `shape_engine_solo_anti`                                                                          | {petals}-petal antispin flower   | Antispin-Flower mit {petals} Blättern                | Antispin flower with {petals} petals      | Flower stays Latin per glossary, but other Shape Engine strings call the drawn shapes Blüten. One of the two should give way.                             |
| `share_studio_deep_beat_carousel`                                                                 | Beat carousel                    | Schritt-Karussell                                    | Step carousel                             | Read beat as the sequence's step pictographs.                                                                                                             |
| `shared_controls_clear`                                                                           | Clear                            | Aufheben (unchanged)                                 | Cancel / lift                             | One key serves „clear the sequence“ and „clear selection“.                                                                                                |
| `tunnel_loop_steps`                                                                               | Loop length: {count} steps       | Zykluslänge: {count} Schritte                        | Cycle length: {count} steps               | The tunnel's repeat cycle, not the LOOP system.                                                                                                           |
| `viewer_ui_flip`                                                                                  | flip                             | Kippen                                               | Tip over                                  | Was identical to Mirror; „Oben-unten spiegeln“ is clearer but long.                                                                                       |
| `viewer_ui_effort_name_anticipation`                                                              | Anticipation                     | Ausholen                                             | Wind-up                                   | Animation-principle sense; „Antizipation“ is the literal term.                                                                                            |

### English to its owner

- `browse_audit_hands_right_angle`, `learn_timing_intro_placement_gamma`, `learn_placement_comparison_gamma`, `learn_placement_gamma_geometry`, `pictograph_desc_group_gamma`, `verified_level1_gamma_definition`, `verified_level1_placements_seo_description`, `verified_level1_guide_page_seo_4`: gamma described as a right angle; Austen describes it as hands adjacent. German left as it was.
- `loop_picker_description_mirrored`, `loop_picker_description_flipped`: English says vertically / horizontally, which reads both ways; the transforms swap left-right and top-bottom.
- `create_ui_loop`: „Loop“ in lower case for the LOOP chip.
- `guide_l2_print_twoturnsshiftspage_2`: „has 2 thumb switch“ should be „switches“.
- `shape_engine_pictographs_calibration`: „Level 4 pictograph are“ should be „pictographs are“.
- `learn_ui_learning_letters`: titled Learning Letters but teaches the six Alpha/Beta words.
- `learn_reference_reading_choreo_cards`: reference title reads „Hand Motions“, apparently copied from the hand-motions entry.
- `shared_controls_clear`: one key for two different actions; worth splitting.
- `tab_desc_browse_gallery`, `tab_desc_browse_sequences`: „Browse and browse sequences“.
- `train_step_advance_tap`, `train_step_advance_voice`: both read „Tap or Voice“, same as the combined option.
- `train_timed_config_title`: title repeats the description sentence.
- `verified_level1_examples_cccc_54`: „after the second B“ in the CCCC section; probably C.

### May not fit

- `create_rotation_template_alternating_cw_first`
- `create_rotation_template_alternating_ccw_first`
- `create_rotation_template_first_half_ccw`
- `create_action_orientation_counterIn_short`
- `create_action_orientation_counterOut_short`
- `shared_controls_level_5`
- `tab_browse_your_visuals`
- `tab_lab_voice`
- `viewer_ui_pill_continuous_short`

## Unreleased features — 2026-11-14

- Keys filled: 365 (arena 41, beta 4, community 19, connect 64, hall_of_shame 39, mandala 30, poi_lab 40, premium 45, voice_sessions 56, watch 24; counts approximate to the prefix groups of the chunks). Register unchanged: informal du.
- Left in English on purpose (tools only Austen uses): admin, moderation, skel2tka, scheduler, gallery, character.
- The chunks contained no post_*, viewer3d, attribution, clip or duet keys; nothing was filled for them.
- Catalog order: the apply tool writes in en.json key order, so about 144 existing lines moved in the diff (reorder noise, no text changed).

### Term decisions

| English | German |
| --- | --- |
| beat / step | Schritt |
| prop | Requisit |
| Hall of Shame | Pranger (matches existing tab labels) |
| Poi Lab / poi-legal | Poi-Labor / Poi-tauglich |
| matchup / Battle | Duell |
| session | Sitzung |
| practitioners | Praktizierende |
| Ø for "Avg" | Ø |

### Unsure

| key | English | German | read-back | why |
| --- | --- | --- | --- | --- |
| arena_leaderboard_biggest_movers | Biggest movers | Größte Aufsteiger | Biggest risers | "movers" can also fall |
| arena_battle_key_left/right | Left / Right | Links / Rechts | Left / Right | unclear whether keyboard keys or sides |
| voice_sessions_t2_promotion | T2 Promotion Candidates | T2-Beförderungskandidaten | Candidates for moving up from T2 | internal tier wording |
| voice_sessions_copy_for_ai | Copy for AI | Für KI kopieren | Copy for AI | fine, flagged only because dev-facing |
| premium_cta_unlock | Unlock Unlimited Creation | Unbegrenzt erstellen freischalten | Unlock unlimited creating | marketing tone |

### English to its owner

- Several strings wrap placeholders in literal quote marks: `mandala_copy_count`, `mandala_filter_all`, `poi_lab_beat_count`, `poi_lab_beat_number`, `voice_sessions_*_ago`, `voice_sessions_event_count`. German keeps them as „{count}“; they look like an escaping slip.
- `connect_sharing_sequence` says "Search for users above to invite them." (key name suggests a different message).
- `premium_faq_a_refund` hard-codes support@tka.com.
- `connect_*_beat`, `arena_label_beats`, `poi_lab_beat_*`, `watch_card_beats` say "beat" while the project prefers "step"; translated as Schritt.

### May not fit

- hall_of_shame_gate_disclaimer, hall_of_shame_header_warning (longer than English)
- voice_sessions_t2_promotion, voice_sessions_collapse, voice_sessions_expand (button-sized)
- premium_cta_unlock, premium_sticky_cta_button (button)
- arena_battle_random_click_to_choose, mandala_symmetry_folds
