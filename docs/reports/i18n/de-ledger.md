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
