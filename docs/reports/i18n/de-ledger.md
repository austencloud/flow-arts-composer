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
