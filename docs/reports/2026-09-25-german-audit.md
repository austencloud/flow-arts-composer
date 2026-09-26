# German interface audit — September 25, 2026

## Result

This pass adds 1,584 German messages and corrects 46 existing translations. Each added message also has an English source entry. It covers the main creation, browsing, viewing, sharing, settings, feedback, and learning controls described below. It does not establish complete German coverage of every route or native-speaker approval of the wording.

The repeated visible omissions had several causes: hardcoded component text, display labels taken directly from saved data, English defaults captured before a locale change, and nested controls that had not been included in earlier passes. Labels are now translated at display time while canonical filter values, effect identifiers, sequence data, user names, and user-written titles remain intact.

## Areas changed

| Area                               | Coverage in this pass                                                                                                                                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Creation                           | LOOP names and explanations, extension prompts, loading/error states, shared placement and parameter controls. Rechecked the existing Formen/Formengenerator entry labels.                                           |
| Browse and library                 | Filter editors, saved filter chips, smart collection builder, collection controls, section navigation, result counts, thumbnail descriptions, playback buttons, variations, and prop names.                          |
| Viewer and playback                | View names, transport menus, tempo and playback modes, source controls, effects and customization controls, download labels, pictograph accessibility labels, and the end marker.                                    |
| Sharing and Post Studio            | Destination controls, handoff instructions, render errors, post acts, captions, takes, timing instructions, transport, and canvas labels. Canonical default act titles are translated without rewriting user titles. |
| Settings, authentication, feedback | Prop controls, photo/authentication errors, feedback forms and status labels, dates, and account prompts.                                                                                                            |
| Learning                           | Motion/grid/word interactions, Trace Paths and Word Bridges controls and feedback, guide entry page and sidebar.                                                                                                     |
| Shared interface                   | Startup splash, page titles, dialogs, searches, selection tools, keyboard, progress indicators, and empty/error states.                                                                                              |

## Verification

- All 60 tests passed across eight focused suites: locale selection, reactive German display helpers, authentication errors, post handoff, Trace Paths state, startup splash handoff, timing summaries, and timing keys.
- Regression checks cover browser-language versus saved-language priority, switching English → German → English, startup status text, and preserving saved values and user content while changing display language.
- All 147 changed Svelte components compiled. The 36 compiler warnings also occur in the original versions; this pass introduced no new compiler warnings.
- New/changed translation keys have matching English and German placeholders. Literal translation references in changed source files resolve. Generated translation types were refreshed.
- Direct browser inspection used the task worktree at `http://127.0.0.1:5191`. Checked German settings navigation/language selection, creation methods and generator controls, browsing filters/results, and the AKEJ sequence viewer with playback and sharing controls. Desktop viewer labels fit the inspected 1280 × 720 layout.
- Guest account prompts prevented browser inspection of account-only prop controls. Those paths received source/compiler checks; authenticated end-to-end behavior is not claimed.
- No deployment, publication, upload, or visitor message was performed.

## Known remaining gaps

1. **Long guide content and exported documents.** Guide navigation is translated, but the Level 1 `_pages`/`_sections`, Level 2 `_data` and topic pages, ratio/motion-path articles, codex content, and PDFs still need a dedicated prose pass. Their hardcoded content is not measured by catalog key counts.
2. **Other feature catalogs.** At audit time 717 English keys have no German entry. The largest groups are `tab` (133), `moderation` (68), `connect` (65), `skel2tka` (60), and `voice` (56); the remainder includes premium, arena, poi, hall, gallery, mandala, module, admin, watch, community, and beta. These counts indicate missing catalog coverage, not proof that every key is reachable by this visitor.
3. **Sidebar dependency accessibility text.** `@austencloud/sidebar` 1.0.1 contains hardcoded labels such as “Main navigation”, “Go to home”, “Pin sidebar open”, and “Collapse sidebar to rail”, with no localization prop for these strings. Visible application navigation is translated. Fixing the remaining labels needs a change to that dependency; installed package files were not patched.
4. **Language quality review.** These are AI-generated translations. A German-speaking flow artist should review terminology and natural phrasing, especially LOOP transformations, timing, and movement descriptions.

Native-speaker feedback can now focus on wording and terminology in the improved main flows. The outstanding guide/dependency/feature coverage above should remain explicit when describing the app's translation status.
