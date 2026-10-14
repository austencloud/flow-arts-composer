# scripts/ inventory and dead-script audit — 2026-09-05

Method: every tracked file under `scripts/` (898 files) was matched by exact basename
against the full tracked+untracked text corpus of the repository (`package.json` and all
workspace manifests, `.github/workflows/**`, `.claude/**`, `.agents/**`, `AGENTS.md` /
`CLAUDE.md` / `src/AGENTS.md`, `docs/**`, other `scripts/**`, `mcp-server*/**`,
`.vscode/**`, every `.ps1`/`.cmd`/`.sh`, `src-tauri`/`capacitor` config, `wrangler*`,
`firebase.json`, `.gitignore`) plus `C:/Users/Austen/.claude` (settings, skills, agents,
commands, hooks, plans, plugins and the per-project memory files). Zero-reference
candidates older than 60 days were re-checked with an extension-less **stem** pass to
catch `import "./name"` style references, then each header was read before classifying.

| Tier | Meaning | Count |
| --- | --- | --- |
| A | zero references, >=60 days old, header confirms one-shot — **deleted in this commit series** | 33 |
| B | zero references but recent (<60d), or a reusable/protected tool, or referenced only from docs — **kept, reported** | 282 |
| C | referenced somewhere — keep | 583 |

## Tier A — deleted

| File | Last commit | Age (d) | Why |
| --- | --- | --- | --- |
| `scripts/create-test-account.cjs` | 2026-01-03 | 245 | one-shot: create a Google Play reviewer test account |
| `scripts/sync-stripe-customer.cjs` | 2026-01-03 | 245 | header says "One-time script to sync existing Firebase users to Stripe" |
| `scripts/test-proportions.js` | 2026-01-03 | 245 | "Quick test script" with inlined constants, superseded by real tests |
| `scripts/find-sequence-by-id.js` | 2026-01-12 | 236 | ad-hoc Firestore lookup with a hardcoded default sequence id |
| `scripts/find-sequence-by-word.js` | 2026-01-19 | 229 | ad-hoc Firestore lookup with a hardcoded default word |
| `scripts/get-pictograph.js` | 2026-01-12 | 236 | prints instructions for a `/render` route that no longer exists |
| `scripts/mocks/$app-environment.ts` | 2026-01-12 | 236 | superseded duplicate of `scripts/mocks/$app/environment.ts`, which is the path `scripts/tsconfig.json` actually maps |
| `scripts/rename-cap-to-loop.ps1` | 2026-01-14 | 234 | one-shot CAP->LOOP codebase rename, long since completed |
| `scripts/test-import.ts` | 2026-01-14 | 234 | probes which import triggered the DI-container error; the DI container was removed |
| `scripts/test-feedback-race.cjs` | 2026-01-18 | 230 | one-shot verification of a feedback race-condition fix |
| `scripts/add-viewbox-attributes.cjs` | 2026-02-06 | 211 | one-shot patch that added data-viewbox attrs to the arrow sprite |
| `scripts/update-bundled-owners.js` | 2026-02-06 | 211 | one-shot backfill of owner data into the bundled sequence index |
| `scripts/diagnose-dates.cjs` | 2026-02-10 | 207 | one-shot date-field diagnostic (inlined client Firebase config) |
| `scripts/inspect-sequence.js` | 2026-02-19 | 198 | ad-hoc single-document inspection |
| `scripts/harvest-exhibit-design.sh` | 2026-02-20 | 197 | one-shot harvest of exhibit-design tagged museum items |
| `scripts/mkdir-helper.cjs` | 2026-02-20 | 197 | creates one hardcoded Downloads folder |
| `scripts/query-exhibit.js` | 2026-02-20 | 197 | one-shot Firestore query for exhibit-design items |
| `scripts/tika-prompt-test.mjs` | 2026-02-22 | 195 | one-shot TIKA system-prompt experiment |
| `scripts/glyph-comparison.html` | 2026-03-09 | 180 | one-shot visual comparison page for the glyph fusion experiment |
| `scripts/split-glyphs.cjs` | 2026-03-09 | 180 | one-shot glyph-row extraction for the same experiment |
| `scripts/vectorize-glyphs.cjs` | 2026-03-09 | 180 | one-shot vectorization with a hardcoded `F:/Downloads` input path |
| `scripts/reconcile-sequence-counts.cjs` | 2026-03-11 | 178 | header says "One-time migration: reconcile sequenceCount" |
| `scripts/list-missing-images.cjs` | 2026-03-26 | 163 | one-shot festival seed-data check |
| `scripts/patch-festival-images.cjs` | 2026-03-26 | 163 | one-shot patch of imageUrl literals into festival-seed.ts |
| `scripts/patch-festival-screenshots.cjs` | 2026-03-26 | 163 | one-shot patch of screenshot URLs into festival-seed.ts |
| `scripts/_render_rewrite.py` | 2026-05-29 | 99 | one-shot import-path rewrite after the render/services file move |
| `scripts/migrate-decks-to-catalogs.cjs` | 2026-05-31 | 97 | completed `decks/` -> `catalogs/` collection migration |
| `scripts/reset-simple-staff-tip-points.cjs` | 2026-06-04 | 93 | header says "One-off" |
| `scripts/diagnostics/probe-cruft-items.ts` | 2026-06-29 | 68 | read-only probe over a hardcoded list of cruft doc ids |
| `scripts/diagnostics/scan-timestamp-corruption.ts` | 2026-06-29 | 68 | read-only one-shot scan for a repaired sentinel-timestamp corruption |
| `scripts/migrations/dedupe-sequences.ts` | 2026-06-29 | 68 | completed duplicate-sequence migration |
| `scripts/migrations/delete-puppyflower.ts` | 2026-06-29 | 68 | one-shot deletion of one specific sequence |
| `scripts/migrations/kill-sub4-community.ts` | 2026-06-30 | 67 | header says "One-shot" |

## Tier B — zero references, kept
- **3D/Blender asset-authoring or verification script (documented manual pipeline)** — 129 files
- **reusable tool nobody wires up / recent** — 79 files
- **throwaway capture/probe script, but touched <60 days ago** — 27 files
- **migration, but touched <60 days ago** — 9 files
- **reference image/asset used by a sibling build script** — 8 files
- **protected pattern (never-delete list)** — 8 files
- **shared helper module for other scripts** — 8 files
- **TIKA eval report artifacts (data, read by scripts/tika/analyze-results.mjs from the directory)** — 8 files
- **diagnostic probe, but touched <60 days ago** — 6 files


Full list:

Grouped by reason. None of these were deleted.

| File | Last commit | Age (d) |
| --- | --- | --- |
| `scripts/FBX2glTF.exe` | 2026-04-05 | 153 |
| `scripts/_capture-codex.mjs` | 2026-07-17 | 50 |
| `scripts/_capture-content-check.mjs` | 2026-07-17 | 50 |
| `scripts/_capture-debug.mjs` | 2026-07-17 | 50 |
| `scripts/_capture-errors.mjs` | 2026-07-17 | 50 |
| `scripts/_capture-once.mjs` | 2026-07-17 | 50 |
| `scripts/_capture-parity-crop.mjs` | 2026-07-17 | 50 |
| `scripts/_capture-parity-full.mjs` | 2026-07-17 | 50 |
| `scripts/_capture-parity-zoom.mjs` | 2026-07-17 | 50 |
| `scripts/_capture-parity-zoom2.mjs` | 2026-07-17 | 50 |
| `scripts/_capture-scroll.mjs` | 2026-07-17 | 50 |
| `scripts/_crop-box.mjs` | 2026-07-17 | 50 |
| `scripts/_diag-codex.mjs` | 2026-07-17 | 50 |
| `scripts/_dump-cell.mjs` | 2026-07-17 | 50 |
| `scripts/_get-parity-coords.mjs` | 2026-07-17 | 50 |
| `scripts/_send-test-scan-notification.mjs` | 2026-09-01 | 4 |
| `scripts/add-claude-code-context-menu.reg` | 2026-03-31 | 158 |
| `scripts/analyze-buugeng-parts.cjs` | 2026-05-24 | 104 |
| `scripts/analyze-forest-semantic-tree-wave-r2-components.mjs` | 2026-08-14 | 22 |
| `scripts/analyze-generator-conformance.ts` | 2026-07-28 | 39 |
| `scripts/assets/doublestar-grip-reference-crop.png` | 2026-08-23 | 13 |
| `scripts/assets/doublestar-proof/doublestar-front.png` | 2026-08-23 | 13 |
| `scripts/assets/doublestar-proof/doublestar-grip.png` | 2026-08-23 | 13 |
| `scripts/assets/doublestar-proof/doublestar-profile.png` | 2026-08-23 | 13 |
| `scripts/assets/doublestar-proof/doublestar-three-quarter.png` | 2026-08-23 | 13 |
| `scripts/assets/doublestar-reference-bezier-proof.png` | 2026-08-23 | 13 |
| `scripts/assets/doublestar-reference-overlay.png` | 2026-08-23 | 13 |
| `scripts/assets/doublestar-reference-raster.png` | 2026-08-23 | 13 |
| `scripts/audit-deck-reversals.js` | 2026-08-27 | 9 |
| `scripts/audit-generator-conformance.ts` | 2026-08-31 | 5 |
| `scripts/audit-ocean-composition.py` | 2026-08-10 | 26 |
| `scripts/audit-orientation-continuity.js` | 2026-05-31 | 97 |
| `scripts/backfill-deck-release-meta.cjs` | 2026-08-31 | 5 |
| `scripts/backfill-spec-frontmatter-2026-07-25.cjs` | 2026-08-27 | 9 |
| `scripts/batch-download-videos.js` | 2026-01-19 | 229 |
| `scripts/beat-to-step-rename.cjs` | 2026-08-27 | 9 |
| `scripts/blender-export-forest-campsite.py` | 2026-08-10 | 26 |
| `scripts/blender-export-forest-stage.py` | 2026-08-10 | 26 |
| `scripts/blender-extract-ocean-transforms.py` | 2026-05-28 | 100 |
| `scripts/blender/stage_manager.py` | 2026-05-25 | 103 |
| `scripts/build-chicken-model.py` | 2026-08-17 | 19 |
| `scripts/build-doodlegrip-fire-appearance.mjs` | 2026-08-31 | 5 |
| `scripts/build-double-contact-ball-model.py` | 2026-08-14 | 22 |
| `scripts/build-doublestar-model.py` | 2026-08-23 | 13 |
| `scripts/build-earth-root-chasm-graybox.py` | 2026-08-08 | 28 |
| `scripts/build-ember-spatial-grayboxes.py` | 2026-08-28 | 8 |
| `scripts/build-forest-ground-detail.mjs` | 2026-08-12 | 24 |
| `scripts/build-forest-semantic-tree-family-composite.py` | 2026-08-14 | 22 |
| `scripts/build-forest-semantic-tree-family.mjs` | 2026-08-31 | 5 |
| `scripts/build-forest-semantic-tree-wave-r2-composite.py` | 2026-08-14 | 22 |
| `scripts/build-forest-semantic-tree-wave-r2.mjs` | 2026-08-31 | 5 |
| `scripts/build-forest-speedtree-pilot.py` | 2026-08-12 | 24 |
| `scripts/build-guitar-model.py` | 2026-08-23 | 13 |
| `scripts/build-lotus-fan-appearance.mjs` | 2026-08-31 | 5 |
| `scripts/build-museum-lobby-dressing.py` | 2026-08-01 | 35 |
| `scripts/build-ocean-dais.py` | 2026-05-29 | 99 |
| `scripts/build-seraphic-vault-integrated-sanctuaries.py` | 2026-08-10 | 26 |
| `scripts/build-seraphic-vault-phase2-graybox.py` | 2026-08-10 | 26 |
| `scripts/build-sickles-model.py` | 2026-08-23 | 13 |
| `scripts/build-sword-model.py` | 2026-08-23 | 13 |
| `scripts/build-trigeng-model.py` | 2026-08-23 | 13 |
| `scripts/build-winter-tree-lineup-contact-sheet.mjs` | 2026-08-09 | 27 |
| `scripts/build-winter-tree-lineup.py` | 2026-08-09 | 27 |
| `scripts/capture-ember-atmosphere-evidence.mjs` | 2026-08-28 | 8 |
| `scripts/capture-seraphic-vault-gate5.mjs` | 2026-08-10 | 26 |
| `scripts/census-theta-ids.cjs` | 2026-08-23 | 13 |
| `scripts/ceremony-audit.cjs` | 2026-05-01 | 127 |
| `scripts/ceremony-commit-module.sh` | 2026-05-29 | 99 |
| `scripts/check-sky-claims.mjs` | 2026-08-11 | 25 |
| `scripts/compare-shortcodes.ts` | 2026-04-19 | 139 |
| `scripts/compose-store-screenshots.mjs` | 2026-08-10 | 26 |
| `scripts/contact-sheet-ember-columnar-production-slice.mjs` | 2026-08-28 | 8 |
| `scripts/contact-sheet-forest-semantic-tree-family.mjs` | 2026-08-14 | 22 |
| `scripts/contact-sheet-forest-semantic-tree-wave-r2.mjs` | 2026-08-14 | 22 |
| `scripts/debug-beat-structure.cjs` | 2026-08-31 | 5 |
| `scripts/debug-sync-listener.mjs` | 2026-02-23 | 194 |
| `scripts/decimate-meshy-candidate.py` | 2026-08-27 | 9 |
| `scripts/demo-anti-smoosh.ts` | 2026-07-14 | 53 |
| `scripts/derive-forest-natural-tree-assets.mjs` | 2026-08-12 | 24 |
| `scripts/diagnostics/audit-start-positions.ts` | 2026-08-31 | 5 |
| `scripts/diagnostics/celestial-scene-visual-audit.mjs` | 2026-08-09 | 27 |
| `scripts/diagnostics/parity-audit-alert.ts` | 2026-08-08 | 28 |
| `scripts/diagnostics/probe-catalog-source.ts` | 2026-07-26 | 41 |
| `scripts/diagnostics/probe-shortcode-labels.ts` | 2026-07-26 | 41 |
| `scripts/diagnostics/sequence-actions-visual-audit.mjs` | 2026-08-05 | 31 |
| `scripts/diagnostics/verify-startpos-derivation.ts` | 2026-08-31 | 5 |
| `scripts/diff-two-sequences.js` | 2026-08-31 | 5 |
| `scripts/donation-card-back.cjs` | 2026-05-31 | 97 |
| `scripts/donation-card-front.cjs` | 2026-06-01 | 96 |
| `scripts/enumerate-l1-words.cjs` | 2026-08-31 | 5 |
| `scripts/enumerate-tka-words.cjs` | 2026-05-27 | 101 |
| `scripts/export-earth-canyon-blender-plan.ts` | 2026-08-08 | 28 |
| `scripts/extract-buugeng-reference.py` | 2026-08-23 | 13 |
| `scripts/extract-doodlegrip-day-contours.py` | 2026-08-23 | 13 |
| `scripts/extract-doublestar-reference.py` | 2026-08-23 | 13 |
| `scripts/extract-trigeng-reference.py` | 2026-08-23 | 13 |
| `scripts/festival-pack-contact-sheet.mjs` | 2026-08-12 | 24 |
| `scripts/festival-pack-generate-compounds.ts` | 2026-08-31 | 5 |
| `scripts/festival-word-loop-search.ts` | 2026-08-12 | 24 |
| `scripts/fetch-loop-labels.cjs` | 2025-12-31 | 248 |
| `scripts/find-dead-code.ts` | 2026-08-27 | 9 |
| `scripts/forest-natural-tree-lineup.json` | 2026-08-12 | 24 |
| `scripts/forest-natural-tree-optimized-lineup.json` | 2026-08-12 | 24 |
| `scripts/forest-natural-tree-pilot.json` | 2026-08-12 | 24 |
| `scripts/forest-speedtree-pilot-contact-sheet.mjs` | 2026-08-12 | 24 |
| `scripts/forest-tree-regeneration-analyze.py` | 2026-08-10 | 26 |
| `scripts/forest-tree-regeneration-contact-sheet.mjs` | 2026-08-10 | 26 |
| `scripts/forest-tree-regeneration-optimize.mjs` | 2026-08-31 | 5 |
| `scripts/forest-tree-regeneration-render.py` | 2026-08-10 | 26 |
| `scripts/forest-tree-regeneration-verify.mjs` | 2026-08-10 | 26 |
| `scripts/forest-tree-regeneration.mjs` | 2026-08-10 | 26 |
| `scripts/forest-tree-reuse-assets.json` | 2026-08-08 | 28 |
| `scripts/forest_ground_ecosystem.py` | 2026-08-19 | 17 |
| `scripts/generate-arrow-sprite.js` | 2026-01-07 | 241 |
| `scripts/generate-blossom-meshy-from-image.mjs` | 2026-08-23 | 13 |
| `scripts/generate-buugeng-variants.cjs` | 2026-08-27 | 9 |
| `scripts/generate-celestial-meshy-from-image.mjs` | 2026-08-09 | 27 |
| `scripts/generate-cloudbreak-meshy-from-image.mjs` | 2026-08-10 | 26 |
| `scripts/generate-earth-root-observatory-board.ts` | 2026-08-31 | 5 |
| `scripts/generate-ember-meshy-from-image.mjs` | 2026-08-27 | 9 |
| `scripts/generate-ember-meshy-remeshes.mjs` | 2026-08-27 | 9 |
| `scripts/generate-ember-meshy-retextures.mjs` | 2026-08-27 | 9 |
| `scripts/generate-first-fire-gate2-contact-sheet.mjs` | 2026-08-09 | 27 |
| `scripts/generate-first-fire-meshy.mjs` | 2026-08-09 | 27 |
| `scripts/generate-flow-fest-cars-meshy.mjs` | 2026-09-02 | 3 |
| `scripts/generate-forest-campsite-meshy-from-image.mjs` | 2026-08-10 | 26 |
| `scripts/generate-forest-ground-life-from-image.mjs` | 2026-08-08 | 28 |
| `scripts/generate-forest-meshy-from-image.mjs` | 2026-08-08 | 28 |
| `scripts/generate-forest-semantic-tree-family.mjs` | 2026-08-14 | 22 |
| `scripts/generate-forest-semantic-tree-wave-r2.mjs` | 2026-08-14 | 22 |
| `scripts/generate-prop-models.cjs` | 2026-08-27 | 9 |
| `scripts/generate-seraphic-vault-cloudbreak-gate3-review.mjs` | 2026-08-10 | 26 |
| `scripts/generate-seraphic-vault-gate2-coordinates.mjs` | 2026-08-10 | 26 |
| `scripts/generate-seraphic-vault-gate2-review.mjs` | 2026-08-10 | 26 |
| `scripts/generate-seraphic-vault-gate3-review.mjs` | 2026-08-10 | 26 |
| `scripts/generate-seraphic-vault-gate4-review.mjs` | 2026-08-10 | 26 |
| `scripts/generate-seraphic-vault-pivot-board.mjs` | 2026-08-10 | 26 |
| `scripts/generate-splash-screens.mjs` | 2026-08-13 | 23 |
| `scripts/generate-trigrid-dataframe.cjs` | 2026-08-31 | 5 |
| `scripts/generate-user-avatars.js` | 2026-08-31 | 5 |
| `scripts/generate-winter-hearth-meshy.mjs` | 2026-08-10 | 26 |
| `scripts/generate-winter-lodge-meshy7-from-image.mjs` | 2026-08-12 | 24 |
| `scripts/generate-winter-meshy.mjs` | 2026-08-09 | 27 |
| `scripts/generate-winter-settlement-meshy.mjs` | 2026-08-10 | 26 |
| `scripts/geospatial/build_flow_fest_gate3_targets.mjs` | 2026-08-27 | 9 |
| `scripts/geospatial/build_flow_fest_gate4_slice.mjs` | 2026-08-27 | 9 |
| `scripts/geospatial/build_flow_fest_gate5_integration.mjs` | 2026-08-27 | 9 |
| `scripts/geospatial/build_flow_fest_grass_lods.mjs` | 2026-08-28 | 8 |
| `scripts/geospatial/verify_flow_fest_gate2_runtime.py` | 2026-08-27 | 9 |
| `scripts/get-pictograph.sh` | 2026-01-12 | 236 |
| `scripts/ground_life_geometry.py` | 2026-08-23 | 13 |
| `scripts/inspect-duplicates.js` | 2026-08-31 | 5 |
| `scripts/inspect-forest-ground-ecosystem.py` | 2026-08-13 | 23 |
| `scripts/install-ios-tunneld.ps1` | 2026-04-15 | 143 |
| `scripts/lib/firebase-rules-deployment.ts` | 2026-08-05 | 31 |
| `scripts/lib/google-credentials.ts` | 2026-08-05 | 31 |
| `scripts/lib/posthog-hogql.ts` | 2026-08-05 | 31 |
| `scripts/list-completed-feedback.cjs` | 2026-01-16 | 232 |
| `scripts/mandala-census.cjs` | 2026-08-31 | 5 |
| `scripts/measure-forest-foliage-orientation.py` | 2026-08-14 | 22 |
| `scripts/measure-forest-tree-pass.mjs` | 2026-08-31 | 5 |
| `scripts/merge-dais-into-ocean.py` | 2026-05-29 | 99 |
| `scripts/merge-generator-conformance.ts` | 2026-07-28 | 39 |
| `scripts/migrate-theta-ids.cjs` | 2026-08-23 | 13 |
| `scripts/migrations/backfill-message-preview-ids.ts` | 2026-08-01 | 35 |
| `scripts/migrations/backfill-parity-audit-alerts.ts` | 2026-08-08 | 28 |
| `scripts/migrations/delete-reviewed-legacy-solo-shortcode.ts` | 2026-07-28 | 39 |
| `scripts/migrations/delete-reviewed-orphan-public-projection.ts` | 2026-08-08 | 28 |
| `scripts/migrations/migrate-legacy-beats-to-compositional.ts` | 2026-08-31 | 5 |
| `scripts/migrations/migrate-public-user-profiles-v2.ts` | 2026-08-01 | 35 |
| `scripts/migrations/reconcile-showcase-video-associations.ts` | 2026-08-22 | 14 |
| `scripts/migrations/remove-redundant-loop-sequences.ts` | 2026-07-10 | 57 |
| `scripts/migrations/repair-google-review-username.ts` | 2026-08-02 | 34 |
| `scripts/mocks/file-saver.ts` | 2026-01-13 | 235 |
| `scripts/node/NodeJsonCache.ts` | 2026-08-14 | 22 |
| `scripts/node/NodePictographPreparer.ts` | 2026-08-31 | 5 |
| `scripts/node/NodePropSvgLoader.ts` | 2026-08-31 | 5 |
| `scripts/node/app-state-stub.ts` | 2026-08-31 | 5 |
| `scripts/normalize-triad-tip-points.cjs` | 2026-09-01 | 4 |
| `scripts/notify-tester-fuse.mjs` | 2026-08-11 | 25 |
| `scripts/optimize-autumn-runtime-textures.mjs` | 2026-09-01 | 4 |
| `scripts/optimize-celestial-environment.mjs` | 2026-08-10 | 26 |
| `scripts/optimize-drowned-gallery-glb.mjs` | 2026-08-09 | 27 |
| `scripts/optimize-earth-root-chasm-glb.mjs` | 2026-08-08 | 28 |
| `scripts/optimize-first-fire-meshy.mjs` | 2026-08-09 | 27 |
| `scripts/optimize-forest-campsite.mjs` | 2026-08-10 | 26 |
| `scripts/optimize-forest-semantic-tree-family.mjs` | 2026-08-14 | 22 |
| `scripts/optimize-forest-semantic-tree-wave-r2.mjs` | 2026-08-14 | 22 |
| `scripts/optimize-forest-speedtree-pilot.mjs` | 2026-08-12 | 24 |
| `scripts/optimize-forest-stage.mjs` | 2026-08-12 | 24 |
| `scripts/optimize-forest-tree-assets.mjs` | 2026-08-31 | 5 |
| `scripts/optimize-museum-lobby-glb.mjs` | 2026-08-01 | 35 |
| `scripts/optimize-seraphic-vault-production-slice.mjs` | 2026-08-10 | 26 |
| `scripts/parse-instagram-captions.js` | 2026-01-19 | 229 |
| `scripts/patch-autumn-material-sidedness.mjs` | 2026-09-01 | 4 |
| `scripts/prepare-forest-tree-lineup-sources.mjs` | 2026-08-13 | 23 |
| `scripts/process-seraphic-vault-cloud-panorama.mjs` | 2026-08-10 | 26 |
| `scripts/quarter-arrows/measure-legacy.mjs` | 2026-08-23 | 13 |
| `scripts/render-blossom-boards-r3.py` | 2026-08-25 | 11 |
| `scripts/render-blossom-composition-plan.mjs` | 2026-08-23 | 13 |
| `scripts/render-blossom-masterplan-r2.mjs` | 2026-08-23 | 13 |
| `scripts/render-ember-meshy-candidates.py` | 2026-08-27 | 9 |
| `scripts/render-first-fire-pose.py` | 2026-08-10 | 26 |
| `scripts/render-forest-semantic-tree-family.py` | 2026-08-14 | 22 |
| `scripts/render-forest-semantic-tree-wave-r2.py` | 2026-08-14 | 22 |
| `scripts/render-forest-speedtree-pilot.py` | 2026-08-12 | 24 |
| `scripts/render-pictograph-node.js` | 2026-08-31 | 5 |
| `scripts/render-winter-lodge-meshy7-candidate.py` | 2026-08-12 | 24 |
| `scripts/render-winter-settlement-lodge.py` | 2026-08-10 | 26 |
| `scripts/repair-mangled-display-names.cjs` | 2026-08-05 | 31 |
| `scripts/repair-motion-placement.cjs` | 2026-08-31 | 5 |
| `scripts/retexture-forest-meshy.mjs` | 2026-08-27 | 9 |
| `scripts/retune-forest-canopy-lod.py` | 2026-08-17 | 19 |
| `scripts/scan-stateless.mjs` | 2026-05-03 | 125 |
| `scripts/scrape-instagram-captions.js` | 2026-08-27 | 9 |
| `scripts/seed-loop-custom-product.cjs` | 2026-07-10 | 57 |
| `scripts/seed-starter-pack.cjs` | 2026-07-10 | 57 |
| `scripts/seo/cohorts.ts` | 2026-07-22 | 45 |
| `scripts/seo/credentials.ts` | 2026-08-05 | 31 |
| `scripts/seo/dashboard-snapshot.ts` | 2026-07-22 | 45 |
| `scripts/seo/search-console.ts` | 2026-07-20 | 47 |
| `scripts/seo/warehouse.ts` | 2026-07-20 | 47 |
| `scripts/solo-path-diagnostic.ts` | 2026-08-31 | 5 |
| `scripts/start-dev.sh` | 2026-04-30 | 128 |
| `scripts/svelte-runes-mock.ts` | 2026-01-13 | 235 |
| `scripts/test-reversal-boundary-2.cjs` | 2026-08-31 | 5 |
| `scripts/test-reversal-boundary.cjs` | 2026-08-31 | 5 |
| `scripts/test-reversal-cumulative.cjs` | 2026-08-31 | 5 |
| `scripts/test_ocean_substrate.py` | 2026-08-09 | 27 |
| `scripts/texture-dais.py` | 2026-05-29 | 99 |
| `scripts/tika/analyze-results.mjs` | 2026-08-27 | 9 |
| `scripts/tika/reports/eval-1768550833599.json` | 2026-01-16 | 232 |
| `scripts/tika/reports/eval-1768550953168.json` | 2026-01-16 | 232 |
| `scripts/tika/reports/eval-1768643832424.json` | 2026-01-17 | 231 |
| `scripts/tika/reports/eval-1768644169285.json` | 2026-01-25 | 223 |
| `scripts/tika/reports/flagged-1768550833600.md` | 2026-01-16 | 232 |
| `scripts/tika/reports/flagged-1768550953171.md` | 2026-01-16 | 232 |
| `scripts/tika/reports/flagged-1768644169285.md` | 2026-01-17 | 231 |
| `scripts/tika/reports/resolutions (1).json` | 2026-01-21 | 227 |
| `scripts/tika/run-evaluation.mjs` | 2026-08-27 | 9 |
| `scripts/tmp-audit-unknown-users.mjs` | 2026-07-13 | 54 |
| `scripts/tmp-check-christof-counts.mjs` | 2026-07-13 | 54 |
| `scripts/tmp-check-target.mjs` | 2026-07-13 | 54 |
| `scripts/tmp-dump-christof.mjs` | 2026-07-13 | 54 |
| `scripts/tmp-dump-scans.mjs` | 2026-07-13 | 54 |
| `scripts/tmp-fix-christof-gi.mjs` | 2026-08-31 | 5 |
| `scripts/tmp-guide-shot.mjs` | 2026-07-13 | 54 |
| `scripts/tmp-purge-cityless-scans.mjs` | 2026-07-13 | 54 |
| `scripts/tmp-purge-skeleton-users.mjs` | 2026-07-13 | 54 |
| `scripts/tmp-purge-stale-public-index.mjs` | 2026-07-13 | 54 |
| `scripts/tmp-test-tombstone.mjs` | 2026-07-13 | 54 |
| `scripts/tmp-trace-deleted-uid.mjs` | 2026-07-13 | 54 |
| `scripts/tmp-trace-deleted-uid2.mjs` | 2026-07-13 | 54 |
| `scripts/trace-static.mjs` | 2026-05-31 | 97 |
| `scripts/track-search-interest.js` | 2026-02-12 | 205 |
| `scripts/uninstall-ios-tunneld.ps1` | 2026-04-15 | 143 |
| `scripts/update-feedback-status.js` | 2026-08-27 | 9 |
| `scripts/update-rtdb-rules.mjs` | 2026-08-27 | 9 |
| `scripts/update-sequence-owners.js` | 2026-08-27 | 9 |
| `scripts/upload-showcase-video.js` | 2026-01-19 | 229 |
| `scripts/validate-pipeline-corpus.ts` | 2026-08-31 | 5 |
| `scripts/verify-celestial-environment-glb.mjs` | 2026-08-09 | 27 |
| `scripts/verify-double-contact-ball-glb.cjs` | 2026-08-14 | 22 |
| `scripts/verify-doublestar-glb.cjs` | 2026-08-23 | 13 |
| `scripts/verify-earth-root-chasm-glb.mjs` | 2026-08-08 | 28 |
| `scripts/verify-export.cjs` | 2026-03-08 | 181 |
| `scripts/verify-forest-campsite.mjs` | 2026-08-10 | 26 |
| `scripts/verify-forest-ground.mjs` | 2026-08-31 | 5 |
| `scripts/verify-forest-semantic-tree-family.mjs` | 2026-08-14 | 22 |
| `scripts/verify-forest-speedtree-pilot.mjs` | 2026-08-12 | 24 |
| `scripts/verify-forest-stage.mjs` | 2026-08-10 | 26 |
| `scripts/verify-forest-tree-assets.mjs` | 2026-08-12 | 24 |
| `scripts/verify-guitar-glb.cjs` | 2026-08-23 | 13 |
| `scripts/verify-seraphic-vault-phase2-graybox.py` | 2026-08-10 | 26 |
| `scripts/verify-seraphic-vault-production-slice.mjs` | 2026-08-10 | 26 |
| `scripts/verify-sickles-glb.cjs` | 2026-08-23 | 13 |
| `scripts/verify-trigeng-glb.cjs` | 2026-08-23 | 13 |
| `scripts/verify-winter-fire-court-graybox.mjs` | 2026-08-12 | 24 |
| `scripts/video-collection.json` | 2026-01-19 | 229 |
| `scripts/visualize-buugeng-shape.cjs` | 2026-05-24 | 104 |
| `scripts/watch-scans.ts` | 2026-04-19 | 139 |
| `scripts/wipe-reseed-festivals.cjs` | 2026-03-26 | 163 |

## Tier C — referenced

| File | Last commit | Refs | Example referrers |
| --- | --- | --- | --- |
| `scripts/add-humor-pair.cjs` | 2026-08-27 | 4 | `.claude/rules/sequence-generation.md`, `docs/reference/sequence-generation-guide.md`, `docs/superpowers/plans/shipped/2026-04-20-beat-to-step-rename-plan.md` |
| `scripts/agent-profile-credential.ps1` | 2026-08-01 | 2 | `docs/reference/agent-browser-profile.md`, `scripts/provision-agent-profile.ts` |
| `scripts/analyze-ember-lava-reference.py` | 2026-09-03 | 1 | `docs/superpowers/specs/ember-spatial-directions/geology-lava-composition-research.md` |
| `scripts/anti-smoosh-demo.html` | 2026-07-14 | 1 | `scripts/demo-anti-smoosh.ts` |
| `scripts/apply-reversal-pattern.cjs` | 2026-08-31 | 9 | `docs/superpowers/plans/shipped/2026-03-26-reversal-pattern-deck-expansion.md`, `docs/superpowers/plans/shipped/2026-05-28-tnd-reversal-strip.md`, `docs/superpowers/plans/shipped/2026-05-31-mirror-swap-twin-deck.md` |
| `scripts/apply-storage-cors.cjs` | 2026-06-26 | 2 | `package.json`, `~/.claude/projects/E--tka-platform/memory/reference_firebase_storage_cors_localhost_https.md` |
| `scripts/archive-feedback.js` | 2026-08-27 | 4 | `.agents/skills/release/SKILL.md`, `.claude/skills/release/SKILL.md`, `docs/superpowers/plans/shipped/2026-03-22-tka-composer-rename.md` |
| `scripts/assets/buugeng-reference.json` | 2026-08-23 | 2 | `scripts/build-buugeng-model.py`, `scripts/extract-buugeng-reference.py` |
| `scripts/assets/buugeng-reference.svg` | 2026-08-23 | 3 | `scripts/build-buugeng-model.py`, `scripts/extract-buugeng-reference.py`, `scripts/verify-buugeng-glb.cjs` |
| `scripts/assets/doodlegrip-day-contours.json` | 2026-08-23 | 6 | `docs/superpowers/specs/active/2026-08-27-fan-wick-emitters-and-build-gated-effects-design.md`, `docs/superpowers/specs/active/2026-08-30-shared-fan-appearance-2d-design.md`, `scripts/build-fan-model.py` |
| `scripts/assets/doodlegrip-fire-reference.json` | 2026-08-23 | 6 | `docs/superpowers/specs/active/2026-08-27-fan-wick-emitters-and-build-gated-effects-design.md`, `docs/superpowers/specs/active/2026-08-30-shared-fan-appearance-2d-design.md`, `scripts/build-doodlegrip-fire-appearance.mjs` |
| `scripts/assets/doublestar-reference-mask.png` | 2026-08-23 | 1 | `scripts/extract-doublestar-reference.py` |
| `scripts/assets/doublestar-reference-photo.png` | 2026-08-23 | 3 | `scripts/build-doublestar-model.py`, `scripts/extract-doublestar-reference.py`, `scripts/verify-doublestar-glb.cjs` |
| `scripts/assets/doublestar-reference.svg` | 2026-08-23 | 3 | `scripts/build-doublestar-model.py`, `scripts/extract-doublestar-reference.py`, `scripts/verify-doublestar-glb.cjs` |
| `scripts/assets/lotus-fire-reference.json` | 2026-08-28 | 4 | `scripts/build-fan-model.py`, `scripts/build-lotus-fan-appearance.mjs`, `src/lib/shared/3d/effects/prop-build-tip-geometry-3d.ts` |
| `scripts/assets/lotus-fire-reference.svg` | 2026-08-28 | 6 | `docs/superpowers/specs/active/2026-08-30-shared-fan-appearance-2d-design.md`, `scripts/assets/lotus-fire-reference.json`, `scripts/build-fan-model.py` |
| `scripts/assets/moon-fan-reference.json` | 2026-09-01 | 2 | `docs/superpowers/specs/2026-09-03-moon-led-fan-handoff.md`, `scripts/build-fan-model.py` |
| `scripts/assets/sickles-blade-reference.svg` | 2026-08-23 | 1 | `scripts/build-sickles-model.py` |
| `scripts/assets/trigeng-reference.json` | 2026-08-23 | 1 | `scripts/extract-trigeng-reference.py` |
| `scripts/assets/trigeng-reference.svg` | 2026-08-23 | 3 | `scripts/build-trigeng-model.py`, `scripts/extract-trigeng-reference.py`, `scripts/verify-trigeng-glb.cjs` |
| `scripts/audit-css-rtl.cjs` | 2026-08-27 | 1 | `package.json` |
| `scripts/audit-durations.cjs` | 2026-08-15 | 2 | `docs/reference/audit-rubric.md`, `scripts/collect-evidence.cjs` |
| `scripts/audit-first-fire-shell.py` | 2026-08-10 | 2 | `scripts/build-first-fire-graybox.py`, `scripts/optimize-first-fire-graybox-glb.mjs` |
| `scripts/audit-frame-budget.mjs` | 2026-09-03 | 6 | `docs/superpowers/plans/2026-09-04-worktree-retirement-audit.md`, `docs/superpowers/specs/2026-09-03-create-sequence-actions-handoff.md`, `docs/superpowers/specs/2026-09-04-hand-motions-timing-direction-followup-handoff.md` |
| `scripts/audit-reduced-motion.cjs` | 2026-08-15 | 2 | `docs/reference/audit-rubric.md`, `scripts/collect-evidence.cjs` |
| `scripts/audit-static-rotation.js` | 2026-08-31 | 1 | `docs/architecture/firestore-cost-anatomy.md` |
| `scripts/audit-tracker.cjs` | 2026-08-15 | 4 | `.agents/skills/audit/SKILL.md`, `.claude/skills/audit/SKILL.md`, `docs/reference/audit-rubric.md` |
| `scripts/audit-transitions.cjs` | 2026-08-15 | 2 | `docs/reference/audit-rubric.md`, `scripts/collect-evidence.cjs` |
| `scripts/auto-label-loops.cjs` | 2026-08-31 | 7 | `docs/superpowers/handoffs/archived/2026-07-03-loop-detection-audit-handoff.md`, `docs/superpowers/plans/shipped/2026-04-21-sticker-lab-primitive-first.md`, `docs/superpowers/plans/shipped/2026-04-30-loop-detection-foundation-refactor.md` |
| `scripts/autumn-depth-material-grades.mjs` | 2026-08-10 | 4 | `scripts/optimize-autumn-environment.mjs`, `scripts/verify-autumn-environment-performance.mjs`, `tests/unit/3d-autumn/autumn-depth-material-grades.test.ts` |
| `scripts/autumn-ground-layout.json` | 2026-08-10 | 6 | `docs/superpowers/specs/2026-08-10-autumn-ground-treatment-plan.md`, `docs/superpowers/specs/autumn-world-coherence-r1/scene-gates.json`, `scripts/build-autumn-environment.py` |
| `scripts/autumn-hero-material-grades.mjs` | 2026-08-10 | 4 | `scripts/optimize-autumn-environment.mjs`, `scripts/verify-autumn-environment-performance.mjs`, `tests/unit/3d-autumn/autumn-hero-material-grades.test.ts` |
| `scripts/autumn-material-sidedness.mjs` | 2026-09-01 | 3 | `scripts/optimize-autumn-environment.mjs`, `scripts/patch-autumn-material-sidedness.mjs`, `tests/unit/3d-autumn/autumn-optimized-glb-contract.test.ts` |
| `scripts/autumn-meshy-assets.json` | 2026-08-10 | 4 | `docs/superpowers/plans/2026-06-21-enchanted-autumn-dusk.md`, `docs/superpowers/specs/2026-08-06-autumn-living-forest-floor-handoff.md`, `scripts/generate-autumn-meshy.mjs` |
| `scripts/autumn-meshy-images.json` | 2026-06-22 | 3 | `docs/reference/autumn-meshy-image-prompts.md`, `docs/superpowers/specs/active/2026-06-21-enchanted-autumn-dusk-design.md`, `scripts/generate-autumn-meshy-from-image.mjs` |
| `scripts/autumn-mushroom-layout.json` | 2026-08-31 | 3 | `scripts/build-autumn-environment.py`, `src/lib/shared/3d/environments/scenes/autumn/runtime/interaction/autumn-magic-habitat-layout.test.ts`, `src/lib/shared/3d/environments/scenes/autumn/runtime/interaction/autumn-magic-habitat-layout.ts` |
| `scripts/avatar-bakeoff/convert-candidate.py` | 2026-08-28 | 2 | `docs/research/avatar-source-bakeoff-2026-08-28.md`, `scripts/characters/character-tools.mjs` |
| `scripts/backfill-active-prop.cjs` | 2026-08-31 | 1 | `docs/superpowers/specs/active/2026-06-12-canon-prop-creators-redesign.md` |
| `scripts/backfill-missing-user-profiles.cjs` | 2026-08-05 | 1 | `~/.claude/projects/E--tka-platform/memory/reference_signup_profile_provisioning.md` |
| `scripts/backfill-sequence-loop-type.cjs` | 2026-08-22 | 1 | `tests/unit/parity/legacy-script-parity-boundaries.test.ts` |
| `scripts/backfill-shortcode-hash-index.mjs` | 2026-07-05 | 2 | `docs/superpowers/plans/shipped/2026-07-05-shortcode-dup-mint-fix.md`, `docs/superpowers/specs/shipped/2026-07-05-shortcode-dup-mint-fix-design.md` |
| `scripts/batch-upload-instagram-videos.js` | 2026-07-19 | 1 | `docs/superpowers/handoffs/2026-07-18-android-native-fixes-handoff.md` |
| `scripts/beat-pair-detection.cjs` | 2026-08-31 | 1 | `docs/superpowers/specs/shipped/2026-04-30-loop-detection-foundation-refactor.md` |
| `scripts/beat-rename-audit.mjs` | 2026-08-27 | 3 | `docs/superpowers/plans/shipped/2026-04-20-beat-to-step-rename-plan.md`, `docs/superpowers/plans/shipped/2026-04-20-session-handoff.md`, `docs/superpowers/specs/backlog/2026-07-16-beat-to-step-nomenclature-design.md` |
| `scripts/blender-client.py` | 2026-08-06 | 2 | `docs/superpowers/specs/2026-08-06-autumn-living-forest-floor-handoff.md`, `~/.claude/projects/E--tka-platform/memory/reference_blender_threejs_pipeline.md` |
| `scripts/blender-export-autumn-full.py` | 2026-08-06 | 5 | `docs/superpowers/plans/active/2026-08-06-autumn-hero-environment.md`, `docs/superpowers/specs/2026-08-06-autumn-living-forest-floor-handoff.md`, `docs/superpowers/specs/active/2026-08-31-autumn-scene-hardening.md` |
| `scripts/blender-export-blossom-full.py` | 2026-08-23 | 3 | `docs/superpowers/specs/2026-08-23-blossom-scene-rebuild-handoff.md`, `scripts/build-blossom-environment.py`, `scripts/optimize-blossom-glb.mjs` |
| `scripts/blender-export-celestial-full.py` | 2026-08-09 | 1 | `docs/superpowers/specs/seraphic-vault/scene-development.md` |
| `scripts/blender-export-cosmic-full.py` | 2026-07-19 | 1 | `docs/superpowers/handoffs/2026-07-19-cosmic-astral-reliquary-handoff.md` |
| `scripts/blender-export-flora-scene-lean.py` | 2026-05-28 | 1 | `docs/superpowers/specs/shipped/2026-05-28-ocean-stage-glb-design.md` |
| `scripts/blender-export-flora-scene.py` | 2026-05-28 | 1 | `docs/superpowers/specs/shipped/2026-05-28-ocean-stage-glb-design.md` |
| `scripts/blender-export-forest-full.py` | 2026-08-09 | 2 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md`, `docs/superpowers/specs/2026-08-08-canopy-forest-scene-handoff.md` |
| `scripts/blender-export-forest-near-frame.py` | 2026-08-09 | 1 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md` |
| `scripts/blender-export-glb.py` | 2026-05-28 | 5 | `docs/superpowers/specs/2026-08-06-first-fire-torch-procession-handoff.md`, `docs/superpowers/specs/shipped/2026-05-28-ocean-stage-glb-design.md`, `scripts/merge-dais-into-ocean.py` |
| `scripts/blender-export-ocean-composition.py` | 2026-08-10 | 2 | `.gitignore`, `src/lib/shared/3d/environments/scenes/ocean/authored/ocean-flora-url.ts` |
| `scripts/blender-export-ocean-full.py` | 2026-08-09 | 12 | `docs/superpowers/plans/active/2026-08-09-fathom-ocean-world-boundary.md`, `docs/superpowers/plans/shipped/2026-05-29-ocean-flora-hi-variant.md`, `docs/superpowers/specs/active/2026-08-09-fathom-ocean-lighting-palette-handoff.md` |
| `scripts/blender-export-ocean-seabed.py` | 2026-08-09 | 2 | `scripts/blender-export-ocean-full.py`, `scripts/optimize-ocean-seabed.mjs` |
| `scripts/blender-export-placements.py` | 2026-06-22 | 6 | `docs/superpowers/specs/active/2026-08-09-ocean-zone-layout-design.md`, `docs/superpowers/specs/shipped/2026-05-28-ocean-stage-glb-design.md`, `docs/superpowers/specs/shipped/2026-06-22-ocean-save-to-live-design.md` |
| `scripts/blender-export-winter-full.py` | 2026-08-08 | 3 | `docs/superpowers/plans/active/2026-08-08-winter-environment-pass-three.md`, `docs/superpowers/specs/active/2026-08-08-moonlit-winter-hollow-design.md`, `scripts/build-winter-environment.py` |
| `scripts/blender-to-placements.cjs` | 2026-08-27 | 4 | `docs/superpowers/specs/active/2026-08-09-ocean-zone-layout-design.md`, `docs/superpowers/specs/shipped/2026-06-22-ocean-save-to-live-design.md`, `scripts/blender_ocean_autosave_handler.py` |
| `scripts/blender/README.md` | 2026-05-24 | 147 | `docs/museum/devlog/2026-01-27-creation-session.md`, `docs/museum/devlog/2026-01-29-creation-session.ini`, `docs/reference/human-generator-license-finding.md` |
| `scripts/blender/cave_shell.py` | 2026-08-15 | 1 | `scripts/build-drowned-gallery-graybox.py` |
| `scripts/blender/cosmic_setup.py` | 2026-05-24 | 3 | `docs/superpowers/plans/shipped/2026-05-24-blender-cosmic-scene-setup.md`, `docs/superpowers/plans/shipped/2026-05-26-ocean-scene-architecture-redesign.md`, `scripts/blender/README.md` |
| `scripts/blender/ocean_README.md` | 2026-05-26 | 1 | `docs/superpowers/plans/shipped/2026-05-26-ocean-scene-architecture-redesign.md` |
| `scripts/blender/ocean_export_environment.py` | 2026-05-26 | 2 | `docs/superpowers/plans/shipped/2026-05-26-ocean-scene-architecture-redesign.md`, `scripts/blender/ocean_README.md` |
| `scripts/blender/ocean_setup.py` | 2026-05-26 | 4 | `docs/superpowers/plans/shipped/2026-05-26-ocean-scene-architecture-redesign.md`, `docs/superpowers/specs/shipped/2026-05-26-ocean-scene-architecture-design.md`, `scripts/blender/ocean_README.md` |
| `scripts/blender/ocean_sync_to_placements.py` | 2026-05-26 | 3 | `docs/superpowers/plans/shipped/2026-05-26-ocean-scene-architecture-redesign.md`, `scripts/blender/ocean_README.md`, `scripts/blender/ocean_setup.py` |
| `scripts/blender/sync_to_placements.py` | 2026-05-24 | 3 | `docs/superpowers/plans/shipped/2026-05-24-blender-cosmic-scene-setup.md`, `docs/superpowers/plans/shipped/2026-05-26-ocean-scene-architecture-redesign.md`, `scripts/blender/README.md` |
| `scripts/blender_ocean_autosave_handler.py` | 2026-06-22 | 2 | `docs/superpowers/specs/shipped/2026-06-22-ocean-save-to-live-design.md`, `scripts/blender-export-placements.py` |
| `scripts/blossom-masterplan-rules.mjs` | 2026-08-23 | 3 | `docs/superpowers/specs/2026-08-23-blossom-scene-rebuild-handoff.md`, `scripts/render-blossom-masterplan-r2.mjs`, `tests/unit/3d/blossom-masterplan.test.js` |
| `scripts/blossom-meshy-images.json` | 2026-08-23 | 1 | `scripts/generate-blossom-meshy-from-image.mjs` |
| `scripts/blossom-plantfactory-family.json` | 2026-08-23 | 4 | `docs/superpowers/specs/blossom-plantfactory-family-r1/blossom-plantfactory-family-r1.md`, `scripts/plantfactory/blossom_cherry_family_r1.py`, `scripts/render-blossom-composition-plan.mjs` |
| `scripts/build-autumn-environment.py` | 2026-09-01 | 14 | `docs/specs/2026-09-01-autumn-horizon-continuity.md`, `docs/superpowers/plans/active/2026-08-06-autumn-hero-environment.md`, `docs/superpowers/plans/active/2026-08-06-autumn-living-forest-floor.md` |
| `scripts/build-autumn-floor-textures.mjs` | 2026-08-31 | 3 | `docs/superpowers/specs/2026-08-06-autumn-living-forest-floor-handoff.md`, `docs/superpowers/specs/2026-08-10-autumn-ground-treatment-plan.md`, `~/.claude/jobs/c4ed4740/state.json` |
| `scripts/build-avatar-thumbnails.mjs` | 2026-05-30 | 2 | `docs/superpowers/plans/2026-08-18-performer-hub-rethink.md`, `scripts/render-avatar-thumbnails.py` |
| `scripts/build-blossom-environment.py` | 2026-08-25 | 5 | `docs/superpowers/specs/2026-08-23-blossom-scene-rebuild-handoff.md`, `docs/superpowers/specs/blossom-masterplan-r2/blossom-masterplan-r2.json`, `docs/superpowers/specs/blossom-masterplan-r2/blossom-masterplan-r2.md` |
| `scripts/build-blossom-path-albedo.mjs` | 2026-08-25 | 1 | `scripts/build-blossom-environment.py` |
| `scripts/build-buugeng-model.py` | 2026-08-23 | 1 | `docs/superpowers/specs/2026-08-14-buugeng-3d-rebuild-design.md` |
| `scripts/build-capsule-baton-model.py` | 2026-08-18 | 4 | `scripts/build-capsule-baton-svg.py`, `src/lib/shared/3d/domain/scene-prop-catalog.ts`, `src/lib/shared/3d/effects/prop-tip-geometry-3d.ts` |
| `scripts/build-capsule-baton-svg.py` | 2026-08-18 | 2 | `scripts/build-capsule-baton-model.py`, `scripts/capsule-baton-stations.json` |
| `scripts/build-celestial-environment.py` | 2026-08-10 | 7 | `docs/superpowers/specs/seraphic-vault/gate0-canon-audit.md`, `docs/superpowers/specs/seraphic-vault/scene-development.md`, `docs/superpowers/specs/seraphic-vault/seraphic-vault-gate1-report-r1-rejected.json` |
| `scripts/build-cosmic-reliquary.py` | 2026-07-19 | 1 | `docs/superpowers/handoffs/2026-07-19-cosmic-astral-reliquary-handoff.md` |
| `scripts/build-drowned-gallery-graybox.py` | 2026-08-15 | 5 | `docs/superpowers/specs/2026-08-09-drowned-gallery-channels-design.md`, `docs/superpowers/specs/drowned-gallery/2026-09-05-water-wing-production-decision.md`, `docs/superpowers/specs/drowned-gallery/drowned-gallery-production-contract.md` |
| `scripts/build-drowned-gallery-production.py` | 2026-09-05 | 2 | `docs/superpowers/specs/drowned-gallery/2026-09-05-water-wing-production-decision.md`, `src/lib/features/museum/components/game/DrownedGalleryAuthored.svelte` |
| `scripts/build-earth-root-observatory-graybox.py` | 2026-08-08 | 2 | `docs/superpowers/specs/2026-08-08-earth-root-observatory-opus-handoff.md`, `docs/superpowers/specs/earth-root-observatory/earth-root-observatory-production-contract.md` |
| `scripts/build-ember-atmosphere-contact-sheets.mjs` | 2026-09-05 | 1 | `docs/superpowers/specs/ember-spatial-directions/evidence/gate-3-midflank-r5/material-lighting-brief.md` |
| `scripts/build-ember-geology-amendment.py` | 2026-09-04 | 6 | `docs/superpowers/specs/ember-spatial-directions/evidence/gate-1-1-geology-amendment-r2/ember-breached-rift-bench-gate1-1-report.json`, `docs/superpowers/specs/ember-spatial-directions/evidence/gate-1-1-geology-amendment-r3/ember-breached-rift-bench-gate1-1-report.json`, `docs/superpowers/specs/ember-spatial-directions/evidence/gate-1-1-geology-amendment-r4/ember-midflank-fire-pilgrimage-r4-gate1-1-report.json` |
| `scripts/build-ember-geology-graybox.py` | 2026-09-04 | 7 | `docs/superpowers/specs/ember-spatial-directions/evidence/gate-2-geology-graybox-r1/ember-breached-rift-bench-graybox-report.json`, `docs/superpowers/specs/ember-spatial-directions/evidence/gate-2-geology-graybox-r2/ember-breached-rift-bench-r2-graybox-report.json`, `docs/superpowers/specs/ember-spatial-directions/evidence/gate-2-geology-graybox-r3/ember-breached-rift-bench-r3-graybox-report.json` |
| `scripts/build-ember-geology-stage.py` | 2026-09-05 | 1 | `docs/superpowers/specs/ember-spatial-directions/evidence/gate-4-geology-stage-r1/verification.md` |
| `scripts/build-ember-geology-study.py` | 2026-09-04 | 21 | `docs/superpowers/specs/ember-spatial-directions/evidence/gate-1-1-geology-amendment-r2/ember-breached-rift-bench-gate1-1-report.json`, `docs/superpowers/specs/ember-spatial-directions/evidence/gate-1-1-geology-amendment-r3/ember-breached-rift-bench-gate1-1-report.json`, `docs/superpowers/specs/ember-spatial-directions/evidence/gate-1-1-geology-amendment-r4/ember-midflank-fire-pilgrimage-r4-gate1-1-report.json` |
| `scripts/build-ember-lava-flow.py` | 2026-09-05 | 2 | `docs/superpowers/specs/ember-spatial-directions/evidence/gate-4-lava-flow-r1/verification.md`, `docs/superpowers/specs/ember-spatial-directions/evidence/gate-4-lava-flow-r2/verification.md` |
| `scripts/build-ember-lookdev-matrix.py` | 2026-09-05 | 3 | `docs/superpowers/specs/ember-spatial-directions/evidence/gate-3-midflank-r5/material-lighting-brief.md`, `docs/superpowers/specs/ember-spatial-directions/evidence/gate-3-midflank-r5/registered-target-report.json`, `scripts/ember-midflank-lookdev.py` |
| `scripts/build-ember-production-slice.py` | 2026-09-05 | 5 | `docs/superpowers/specs/ember-spatial-directions/evidence/gate-3-surface-r9/ember-r9-surface-target-report.json`, `docs/superpowers/specs/ember-spatial-directions/evidence/gate-4-midflank-r5/runtime-verification.md`, `docs/superpowers/specs/ember-spatial-directions/production-contract.md` |
| `scripts/build-ember-tributaries.py` | 2026-09-05 | 2 | `docs/superpowers/specs/ember-spatial-directions/evidence/gate-4-tributaries-r1/verification.md`, `docs/superpowers/specs/ember-spatial-directions/evidence/gate-4-tributaries-r2/verification.md` |
| `scripts/build-fan-model.py` | 2026-09-01 | 5 | `docs/superpowers/specs/active/2026-08-27-fan-wick-emitters-and-build-gated-effects-design.md`, `src/lib/shared/3d/effects/prop-build-tip-geometry-3d.ts`, `tests/unit/3d-viewer/fan-day-trace.test.ts` |
| `scripts/build-fire-double-staff-model.py` | 2026-08-18 | 4 | `scripts/build-fire-double-staff-svg.py`, `src/lib/shared/3d/domain/scene-prop-catalog.ts`, `src/lib/shared/3d/effects/prop-tip-geometry-3d.ts` |
| `scripts/build-fire-double-staff-svg.py` | 2026-08-18 | 2 | `scripts/build-fire-double-staff-model.py`, `scripts/fire-double-staff-stations.json` |
| `scripts/build-first-fire-gate3-board.mjs` | 2026-08-09 | 1 | `docs/superpowers/plans/active/2026-08-09-first-fire-gate3-visual-target.md` |
| `scripts/build-first-fire-graybox.py` | 2026-08-10 | 5 | `docs/superpowers/specs/2026-08-06-first-fire-torch-procession-handoff.md`, `docs/superpowers/specs/2026-08-08-earth-root-observatory-opus-handoff.md`, `docs/superpowers/specs/2026-08-09-first-fire-cinder-court-navigation-reset-handoff.md` |
| `scripts/build-forest-campsite.py` | 2026-08-10 | 1 | `scripts/blender-export-forest-campsite.py` |
| `scripts/build-forest-environment.py` | 2026-08-19 | 7 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md`, `docs/superpowers/specs/2026-08-08-canopy-forest-scene-handoff.md`, `docs/superpowers/specs/active/2026-08-09-fathom-ocean-world-boundary-design.md` |
| `scripts/build-forest-floor-texture.mjs` | 2026-08-31 | 2 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md`, `scripts/build-forest-environment.py` |
| `scripts/build-forest-ground-life-ecology-contact-sheet.mjs` | 2026-08-08 | 1 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md` |
| `scripts/build-forest-ground-life-ecology.py` | 2026-08-08 | 1 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md` |
| `scripts/build-forest-ground-life-layout-contact-sheet.mjs` | 2026-08-09 | 1 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md` |
| `scripts/build-forest-ground-life-lineup-contact-sheet.mjs` | 2026-08-08 | 1 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md` |
| `scripts/build-forest-ground-life-lineup.py` | 2026-08-08 | 1 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md` |
| `scripts/build-forest-prop-lineup-contact-sheet.mjs` | 2026-08-09 | 1 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md` |
| `scripts/build-forest-prop-lineup.py` | 2026-08-10 | 1 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md` |
| `scripts/build-forest-stage.py` | 2026-08-10 | 1 | `scripts/blender-export-forest-stage.py` |
| `scripts/build-forest-static-prop-contact-sheet.mjs` | 2026-08-09 | 1 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md` |
| `scripts/build-forest-tree-lineup-contact-sheet.mjs` | 2026-08-12 | 1 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md` |
| `scripts/build-forest-tree-lineup.py` | 2026-08-12 | 1 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md` |
| `scripts/build-guide-pdf.mjs` | 2026-06-21 | 2 | `docs/superpowers/specs/shipped/2026-06-21-guide-proof-reprint-loop-design.md`, `package.json` |
| `scripts/build-half-arrow-templates.mjs` | 2026-08-27 | 4 | `assets/half-arrow-templates/README.md`, `package.json`, `scripts/half-arrow-seeds.mjs` |
| `scripts/build-mandala-glyphs.cjs` | 2026-08-31 | 2 | `src/routes/test/mandala-decoder/+page.svelte`, `src/routes/test/mandala-palettes/+page.svelte` |
| `scripts/build-mandala-index.ts` | 2026-08-31 | 4 | `docs/superpowers/plans/shipped/2026-06-22-mandala-decoder.md`, `docs/superpowers/specs/shipped/2026-06-22-mandala-decoder-design.md`, `docs/superpowers/specs/shipped/2026-07-21-shape-matrix-hero-pool-design.md` |
| `scripts/build-ocean-composition.py` | 2026-08-10 | 6 | `.gitignore`, `docs/superpowers/specs/active/2026-08-09-ocean-composition-matrix-design.md`, `scripts/audit-ocean-composition.py` |
| `scripts/build-ocean-terrain.py` | 2026-08-09 | 3 | `docs/superpowers/plans/active/2026-08-09-fathom-ocean-world-boundary.md`, `docs/superpowers/specs/active/2026-08-09-fathom-ocean-world-boundary-design.md`, `scripts/ocean_terrain_profile.py` |
| `scripts/build-og-image.mjs` | 2026-07-20 | 1 | `tests/unit/seo-head-contract.test.ts` |
| `scripts/build-primitive-catalog.cjs` | 2026-08-27 | 3 | `docs/superpowers/plans/shipped/2026-04-21-sticker-lab-primitive-first.md`, `package.json`, `~/.claude/projects/E--tka-platform/memory/project_sticker_lab.md` |
| `scripts/build-pronunciation-manifest.ts` | 2026-07-19 | 3 | `docs/reference/pronunciation-recording-guide.md`, `docs/superpowers/plans/2026-08-16-pronunciation-token-bank.md`, `docs/superpowers/specs/2026-08-16-pronunciation-corpus-design.md` |
| `scripts/build-pronunciation-word-pool.ts` | 2026-08-16 | 1 | `docs/superpowers/plans/2026-08-16-pronunciation-corpus-session.md` |
| `scripts/build-seraphic-vault-production-slice.py` | 2026-08-10 | 2 | `docs/superpowers/specs/seraphic-vault/seraphic-vault-gate4-vertical-slice.md`, `scripts/build-seraphic-vault-integrated-sanctuaries.py` |
| `scripts/build-tka-font.mjs` | 2026-07-06 | 6 | `docs/superpowers/specs/shipped/2026-07-06-tka-letters-font-design.md`, `package.json`, `src/styles/tka-font.css` |
| `scripts/build-tnd-base-words.ts` | 2026-08-27 | 3 | `docs/superpowers/specs/2026-08-12-festival-sample-pack-handoff.md`, `docs/superpowers/specs/shipped/2026-07-21-shape-matrix-hero-pool-design.md`, `package.json` |
| `scripts/build-token-bank.ts` | 2026-08-16 | 3 | `docs/superpowers/plans/2026-08-16-pronunciation-corpus-session.md`, `tools/pronunciation/README.md`, `tools/pronunciation/cut_tokens.py` |
| `scripts/build-traverse-reef.py` | 2026-08-09 | 5 | `docs/museum/water-exhibit-archive/INDEX.md`, `docs/superpowers/specs/active/2026-08-09-trench-gallery-composition-design.md`, `scripts/generate-traverse-reef.py` |
| `scripts/build-traverse-seabed.py` | 2026-08-09 | 1 | `scripts/traverse_seabed.py` |
| `scripts/build-tutorial-content.mjs` | 2026-07-16 | 2 | `docs/superpowers/specs/backlog/2026-07-16-tutorial-planner-design.md`, `src/routes/admin/tutorials/_data/tutorial-scripts.ts` |
| `scripts/build-winter-environment.py` | 2026-08-12 | 9 | `docs/superpowers/plans/active/2026-08-08-winter-environment-pass-three.md`, `docs/superpowers/plans/active/2026-08-09-fathom-ocean-world-boundary.md`, `docs/superpowers/specs/active/2026-08-08-moonlit-winter-hollow-design.md` |
| `scripts/build-winter-fire-court-graybox.py` | 2026-08-12 | 1 | `docs/superpowers/specs/moonlit-winter-hollow/scene-development.md` |
| `scripts/bundle-desktop-thumbnails.cjs` | 2026-08-17 | 1 | `scripts/tauri-build-frontend.cjs` |
| `scripts/capsule-baton-stations.json` | 2026-08-18 | 3 | `scripts/build-capsule-baton-model.py`, `scripts/build-capsule-baton-svg.py`, `scripts/verify-capsule-baton-glb.cjs` |
| `scripts/capture-devices.cjs` | 2026-04-15 | 1 | `scripts/install-ios-tunneld.ps1` |
| `scripts/capture-seraphic-vault-gate4.mjs` | 2026-08-25 | 2 | `scripts/capture-seraphic-vault-gate5.mjs`, `scripts/lib/chrome-cdp.mjs` |
| `scripts/celestial-meshy-images.json` | 2026-08-09 | 1 | `scripts/generate-celestial-meshy-from-image.mjs` |
| `scripts/ceremony-flatten-kebab.cjs` | 2026-05-29 | 3 | `docs/audits/2026-08-16-repo-janitor-cruft-audit.md`, `docs/superpowers/plans/active/2026-05-31-ceremony-phase5-stateless.md`, `docs/superpowers/specs/active/2026-05-31-ceremony-phase5-stateless-isolated-design.md` |
| `scripts/ceremony-inventory.mjs` | 2026-08-27 | 7 | `docs/audits/2026-08-16-repo-janitor-cruft-audit.md`, `docs/superpowers/handoffs/2026-05-31-ceremony-phase5-merge-handoff.md`, `docs/superpowers/plans/active/2026-05-31-ceremony-phase5-stateless.md` |
| `scripts/ceremony-manifest.json` | 2026-08-03 | 8 | `docs/audits/2026-08-16-repo-janitor-cruft-audit.md`, `docs/specs/god-component-decomposition.md`, `docs/superpowers/handoffs/2026-07-30-endless-spinner-rebuild-handoff.md` |
| `scripts/characters/README.md` | 2026-08-31 | 147 | `docs/museum/devlog/2026-01-27-creation-session.md`, `docs/museum/devlog/2026-01-29-creation-session.ini`, `docs/reference/human-generator-license-finding.md` |
| `scripts/characters/blender-proportion-rescale.py` | 2026-09-03 | 2 | `docs/architecture/locomotion-research-canon.md`, `scripts/characters/character-proportion-sweep.mjs` |
| `scripts/characters/character-glb.mjs` | 2026-08-31 | 3 | `scripts/characters/character-intake.mjs`, `scripts/characters/character-proportion-sweep.mjs`, `tests/unit/scripts/character-intake.test.ts` |
| `scripts/characters/character-intake.mjs` | 2026-08-31 | 2 | `package.json`, `tests/unit/scripts/character-intake.test.ts` |
| `scripts/characters/character-proportion-sweep.mjs` | 2026-09-03 | 1 | `package.json` |
| `scripts/characters/character-provenance.mjs` | 2026-08-31 | 2 | `scripts/characters/character-intake.mjs`, `tests/unit/scripts/character-intake.test.ts` |
| `scripts/characters/character-provenance.schema.json` | 2026-08-31 | 1 | `docs/superpowers/specs/2026-08-31-character-intake-pipeline-design.md` |
| `scripts/characters/character-reach-measure.mjs` | 2026-09-03 | 1 | `scripts/characters/character-proportion-sweep.mjs` |
| `scripts/characters/character-tools.mjs` | 2026-08-31 | 2 | `scripts/characters/character-intake.mjs`, `scripts/characters/character-proportion-sweep.mjs` |
| `scripts/characters/mixamo-provenance.example.json` | 2026-08-31 | 1 | `scripts/characters/README.md` |
| `scripts/characters/proportion-sweep-spec.mjs` | 2026-09-03 | 2 | `docs/reference/human-generator-license-finding.md`, `scripts/characters/character-proportion-sweep.mjs` |
| `scripts/check-environment.js` | 2026-08-27 | 1 | `package.json` |
| `scripts/check-lifecycle-analytics-integrity.ts` | 2026-08-23 | 1 | `package.json` |
| `scripts/check-loop-types.cjs` | 2026-02-20 | 1 | `docs/architecture/firestore-cost-anatomy.md` |
| `scripts/check-lore-staleness.cjs` | 2026-08-27 | 1 | `docs/museum/README.md` |
| `scripts/cloudbreak-meshy-images.json` | 2026-08-10 | 1 | `scripts/generate-cloudbreak-meshy-from-image.mjs` |
| `scripts/cloudflare-route-rules.js` | 2026-08-09 | 2 | `scripts/trim-deploy-assets.js`, `tests/unit/cloudflare-route-rules.test.ts` |
| `scripts/codex-6up.cjs` | 2026-05-31 | 1 | `scripts/donation-cards-4up.cjs` |
| `scripts/codex-ask.sh` | 2026-09-04 | 3 | `.claude/rules/model-routing.md`, `~/.claude/projects/E--tka-platform/memory/reference_codex_cli_subagent.md`, `~/.claude/projects/E--tka-platform/memory/reference_fable5_opus5_tuning.md` |
| `scripts/collect-desktop-assets.mjs` | 2026-09-02 | 3 | `.gitignore`, `package.json`, `scripts/tauri-build-frontend.cjs` |
| `scripts/collect-evidence.cjs` | 2026-08-27 | 4 | `.agents/skills/audit/SKILL.md`, `.claude/skills/audit/SKILL.md`, `docs/reference/audit-rubric.md` |
| `scripts/combinator-research/README.md` | 2026-08-05 | 147 | `docs/museum/devlog/2026-01-27-creation-session.md`, `docs/museum/devlog/2026-01-29-creation-session.ini`, `docs/reference/human-generator-license-finding.md` |
| `scripts/combinator-research/by-count.mjs` | 2026-08-05 | 8 | `docs/reference/letter-gap-families.md`, `docs/superpowers/specs/2026-08-05-combinator-stage3-ui-handoff.md`, `docs/superpowers/specs/2026-08-05-sequence-combinator-algebra-handoff.md` |
| `scripts/combinator-research/enumerate.mjs` | 2026-08-27 | 6 | `docs/superpowers/specs/2026-08-05-combinator-stage3-ui-handoff.md`, `scripts/combinator-research/README.md`, `scripts/combinator-research/pair-classes.mjs` |
| `scripts/combinator-research/letter-group.mjs` | 2026-08-31 | 5 | `docs/reference/letter-gap-families.md`, `docs/superpowers/specs/2026-08-05-combinator-stage3-ui-handoff.md`, `scripts/combinator-research/README.md` |
| `scripts/combinator-research/letter-orbits.mjs` | 2026-08-31 | 2 | `docs/reference/letter-gap-families.md`, `scripts/combinator-research/README.md` |
| `scripts/combinator-research/pair-classes.mjs` | 2026-08-27 | 4 | `docs/reference/letter-gap-families.md`, `docs/superpowers/specs/2026-08-05-combinator-stage3-ui-handoff.md`, `scripts/combinator-research/README.md` |
| `scripts/combinator-research/theory-512.mjs` | 2026-08-05 | 6 | `docs/reference/letter-gap-families.md`, `docs/superpowers/specs/2026-08-05-sequence-combinator-algebra-handoff.md`, `scripts/combinator-research/README.md` |
| `scripts/component-inventory.mjs` | 2026-08-27 | 3 | `docs/specs/god-component-decomposition.md`, `docs/superpowers/handoffs/2026-07-18-notation-recompose-handoff.md`, `docs/superpowers/handoffs/archived/2026-07-27-notation-catalog-device-polish-handoff.md` |
| `scripts/component-manifest.json` | 2026-09-03 | 9 | `docs/specs/god-component-decomposition.md`, `docs/superpowers/handoffs/2026-07-18-notation-recompose-handoff.md`, `docs/superpowers/handoffs/archived/2026-07-27-notation-catalog-device-polish-handoff.md` |
| `scripts/condition-forest-plantcatalog-bridge.py` | 2026-08-27 | 1 | `scripts/run-forest-plantcatalog-postexport.ps1` |
| `scripts/contact-sheet-forest-plantcatalog-bridge.mjs` | 2026-08-23 | 1 | `scripts/run-forest-plantcatalog-postexport.ps1` |
| `scripts/cosmic-meshy-assets.json` | 2026-07-19 | 2 | `docs/superpowers/handoffs/2026-07-19-cosmic-astral-reliquary-handoff.md`, `scripts/generate-cosmic-meshy.mjs` |
| `scripts/create-shortcodes-batch.js` | 2026-07-26 | 5 | `.agents/skills/qr/SKILL.md`, `.claude/skills/qr/SKILL.md`, `docs/superpowers/specs/active/2026-07-25-sequence-public-parity-repair-design.md` |
| `scripts/deploy-asset-trim-policy.js` | 2026-08-29 | 2 | `scripts/trim-deploy-assets.js`, `tests/unit/deploy-asset-trim-policy.test.ts` |
| `scripts/desktop-asset-bundle.mjs` | 2026-09-02 | 5 | `docs/reference/desktop-offline-bundle.md`, `scripts/collect-desktop-assets.mjs`, `scripts/verify-desktop-assets.mjs` |
| `scripts/di-migration-progress.sh` | 2026-04-24 | 1 | `docs/superpowers/plans/shipped/2026-04-23-di-module-singleton-migration.md` |
| `scripts/diagnostics/analyze-payload-incomplete-recovery.ts` | 2026-08-31 | 1 | `docs/superpowers/specs/active/2026-07-25-sequence-public-parity-repair-design.md` |
| `scripts/diagnostics/audit-community-min-length.ts` | 2026-06-30 | 3 | `docs/superpowers/specs/shipped/2026-06-30-community-min-length-design.md`, `scripts/migrations/kill-sub4-community.ts`, `~/.claude/projects/E--tka-platform/memory/project_remove_purge_one_count.md` |
| `scripts/diagnostics/audit-sequence-cruft.ts` | 2026-06-29 | 2 | `docs/superpowers/specs/active/2026-07-25-sequence-public-parity-repair-design.md`, `~/.claude/projects/E--tka-platform/memory/project_public_mirror_admin_residual.md` |
| `scripts/diagnostics/audit-sequence-public-parity.ts` | 2026-08-08 | 5 | `docs/superpowers/handoffs/2026-07-27-sequence-parity-repair-handoff.md`, `docs/superpowers/specs/active/2026-07-25-sequence-public-parity-repair-design.md`, `scripts/diagnostics/run-parity-audit.cmd` |
| `scripts/diagnostics/browse-program-census.ts` | 2026-08-23 | 1 | `docs/architecture/firestore-cost-anatomy.md` |
| `scripts/diagnostics/parity-audit-baseline.json` | 2026-07-28 | 5 | `docs/superpowers/handoffs/2026-07-27-sequence-parity-repair-handoff.md`, `docs/superpowers/specs/active/2026-07-25-sequence-public-parity-repair-design.md`, `scripts/diagnostics/analyze-payload-incomplete-recovery.ts` |
| `scripts/diagnostics/probe-float-beat.ts` | 2026-08-31 | 1 | `docs/superpowers/specs/active/2026-07-25-sequence-public-parity-repair-design.md` |
| `scripts/diagnostics/profile-underivable-beats.ts` | 2026-08-31 | 1 | `docs/superpowers/specs/active/2026-07-25-sequence-public-parity-repair-design.md` |
| `scripts/diagnostics/run-parity-audit.cmd` | 2026-07-27 | 2 | `docs/superpowers/handoffs/2026-07-27-sequence-parity-repair-handoff.md`, `docs/superpowers/specs/active/2026-07-25-sequence-public-parity-repair-design.md` |
| `scripts/diagnostics/winter-scene-visual-audit.mjs` | 2026-08-09 | 1 | `docs/superpowers/specs/2026-08-08-winter-gate-3-opus-handoff.md` |
| `scripts/donation-cards-4up.cjs` | 2026-05-31 | 2 | `docs/superpowers/specs/2026-08-11-festival-sample-pack-design.md`, `scripts/festival-pack-9up.cjs` |
| `scripts/ember-meshy-images.json` | 2026-08-27 | 1 | `scripts/generate-ember-meshy-from-image.mjs` |
| `scripts/ember-meshy-remeshes.json` | 2026-08-27 | 1 | `scripts/generate-ember-meshy-remeshes.mjs` |
| `scripts/ember-meshy-retextures.json` | 2026-08-27 | 1 | `scripts/generate-ember-meshy-retextures.mjs` |
| `scripts/ember-midflank-lookdev.py` | 2026-09-05 | 3 | `docs/superpowers/specs/ember-spatial-directions/evidence/gate-3-midflank-r5/material-lighting-brief.md`, `docs/superpowers/specs/ember-spatial-directions/evidence/gate-3-midflank-r5/registered-target-report.json`, `scripts/build-ember-lookdev-matrix.py` |
| `scripts/ember-midflank-production.py` | 2026-09-05 | 1 | `scripts/build-ember-production-slice.py` |
| `scripts/enumerate-deck.cjs` | 2026-08-31 | 20 | `.agents/skills/deck/SKILL.md`, `.agents/skills/kickstarter/SKILL.md`, `.claude/skills/deck/SKILL.md` |
| `scripts/enumerate-l1-deck.cjs` | 2026-08-31 | 3 | `docs/superpowers/plans/shipped/2026-03-25-generalized-loop-deck-enumerator.md`, `docs/superpowers/specs/shipped/2026-03-25-generalized-loop-deck-enumerator-design.md`, `~/.claude/projects/F--tka-platform/memory/MEMORY.md` |
| `scripts/error-telemetry.js` | 2026-08-27 | 3 | `docs/superpowers/plans/shipped/2026-03-10-error-handling-system.md`, `docs/superpowers/specs/backlog/2026-05-23-error-boundary-system-design.md`, `docs/superpowers/specs/shipped/2026-03-10-error-handling-system-design.md` |
| `scripts/export-deck-bundle.cjs` | 2026-08-31 | 6 | `docs/superpowers/plans/shipped/2026-04-26-tauri-desktop-app.md`, `docs/superpowers/specs/shipped/2026-04-26-tauri-desktop-app-design.md`, `package.json` |
| `scripts/export-default-arrow-placements.ts` | 2026-08-14 | 2 | `docs/superpowers/plans/shipped/2026-05-30-editable-default-arrow-positions.md`, `package.json` |
| `scripts/export-drowned-gallery-blender-plan.ts` | 2026-09-05 | 4 | `docs/superpowers/specs/drowned-gallery/2026-09-05-water-wing-production-decision.md`, `scripts/build-drowned-gallery-graybox.py`, `scripts/build-drowned-gallery-production.py` |
| `scripts/export-earth-root-observatory-blender-plan.ts` | 2026-08-08 | 1 | `docs/superpowers/specs/2026-08-08-earth-root-observatory-opus-handoff.md` |
| `scripts/export-first-fire-blender-plan.ts` | 2026-08-09 | 4 | `docs/superpowers/specs/2026-08-06-first-fire-torch-procession-handoff.md`, `docs/superpowers/specs/2026-08-08-earth-root-observatory-opus-handoff.md`, `docs/superpowers/specs/2026-08-09-first-fire-cinder-court-navigation-reset-handoff.md` |
| `scripts/export-gallery-bundle.cjs` | 2026-09-02 | 3 | `docs/architecture/firestore-cost-anatomy.md`, `package.json`, `src/lib/shared/desktop/desktop-data-seeder.ts` |
| `scripts/export-static-snapshot.cjs` | 2026-08-27 | 5 | `docs/superpowers/research/2026-04-14-short-code-audit.md`, `docs/superpowers/specs/active/2026-07-25-sequence-public-parity-repair-design.md`, `docs/superpowers/specs/shipped/2026-04-18-shortcode-durability-roadmap.md` |
| `scripts/feedback-workflow.js` | 2026-07-23 | 1 | `package.json` |
| `scripts/festival-pack-9up.cjs` | 2026-08-12 | 3 | `docs/superpowers/specs/2026-08-11-festival-sample-pack-design.md`, `docs/superpowers/specs/2026-08-12-festival-sample-pack-handoff.md`, `tests/unit/festival-pack-curation.test.ts` |
| `scripts/festival-pack-candidates.ts` | 2026-08-31 | 1 | `scripts/festival-pack-contact-sheet.mjs` |
| `scripts/festival-pack-census.cjs` | 2026-08-12 | 2 | `docs/superpowers/specs/2026-08-12-festival-sample-pack-handoff.md`, `scripts/festival-word-loop-search.ts` |
| `scripts/festival-pack-curate.cjs` | 2026-08-31 | 1 | `tests/unit/festival-pack-curation.test.ts` |
| `scripts/festival-pack-freeze-turn-patterns.ts` | 2026-08-14 | 1 | `scripts/festival-pack-curate.cjs` |
| `scripts/festival-seed-data.cjs` | 2026-03-26 | 2 | `scripts/list-missing-images.cjs`, `scripts/wipe-reseed-festivals.cjs` |
| `scripts/fetch-feedback.js` | 2026-09-03 | 42 | `.agents/skills/done/SKILL.md`, `.agents/skills/fb/SKILL.md`, `.agents/skills/fb/workflow-reference.md` |
| `scripts/fetch-moon-source-assets.mjs` | 2026-08-12 | 1 | `docs/superpowers/specs/moon-observatory/source-asset-package.md` |
| `scripts/fetch-pronunciation-session.mjs` | 2026-08-16 | 2 | `src/lib/features/lab/pronunciation-recorder/services/implementations/CloudCorpusSessionStore.ts`, `tools/pronunciation/README.md` |
| `scripts/fetch-soundscapes.cjs` | 2026-08-27 | 3 | `.gitignore`, `scripts/search-soundscapes.cjs`, `src/lib/features/museum/audio/soundscape-manifest.ts` |
| `scripts/fetch-tika-conversations.cjs` | 2026-01-19 | 4 | `.agents/skills/tika/SKILL.md`, `.agents/skills/tika/grading-reference.md`, `.claude/skills/tika/SKILL.md` |
| `scripts/fetch-voice-sessions.cjs` | 2026-02-08 | 3 | `.agents/skills/voice-review/SKILL.md`, `.claude/skills/voice-review/SKILL.md`, `docs/superpowers/specs/2026-08-04-session-triage-design.md` |
| `scripts/fetch-webview2-runtime.mjs` | 2026-09-02 | 3 | `.gitignore`, `docs/reference/desktop-offline-bundle.md`, `package.json` |
| `scripts/fetch-winter-environment-assets.mjs` | 2026-08-08 | 1 | `docs/superpowers/specs/active/2026-08-08-moonlit-winter-hollow-design.md` |
| `scripts/find-and-delete-duplicates.js` | 2026-08-31 | 1 | `scripts/inspect-duplicates.js` |
| `scripts/fire-double-staff-stations.json` | 2026-08-18 | 3 | `scripts/build-fire-double-staff-model.py`, `scripts/build-fire-double-staff-svg.py`, `scripts/verify-fire-double-staff-glb.cjs` |
| `scripts/firestore-backup.cjs` | 2026-03-14 | 3 | `docs/superpowers/plans/shipped/2026-04-14-firestore-backup-implementation.md`, `docs/superpowers/specs/shipped/2026-03-14-firestore-backup-disaster-recovery-design.md`, `scripts/migrate-theta-ids.cjs` |
| `scripts/firestore-restore.cjs` | 2026-03-14 | 2 | `docs/superpowers/plans/shipped/2026-04-14-firestore-backup-implementation.md`, `docs/superpowers/specs/shipped/2026-03-14-firestore-backup-disaster-recovery-design.md` |
| `scripts/first-fire-meshy-assets.json` | 2026-08-09 | 2 | `scripts/generate-first-fire-meshy.mjs`, `scripts/optimize-first-fire-meshy.mjs` |
| `scripts/fix-tnd-levels.cjs` | 2026-08-31 | 1 | `~/.claude/projects/E--tka-platform/memory/project_tnd_deck_rename.md` |
| `scripts/flow-fest-cars-meshy-assets.json` | 2026-09-02 | 3 | `scripts/generate-flow-fest-cars-meshy.mjs`, `scripts/optimize-flow-fest-cars.mjs`, `~/.claude/projects/E--tka-platform/memory/reference_flow_fest_meshy_cars.md` |
| `scripts/flow-fest-cars-sketchfab-assets.json` | 2026-09-02 | 2 | `scripts/optimize-flow-fest-cars.mjs`, `~/.claude/projects/E--tka-platform/memory/project_flow_fest_car_replacement.md` |
| `scripts/forest-campsite-layout.json` | 2026-08-10 | 12 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md`, `docs/superpowers/specs/moonlit-firefly-forest/scene-development.md`, `docs/superpowers/specs/moonlit-firefly-forest/scene-gates.json` |
| `scripts/forest-campsite-meshy-images.json` | 2026-08-10 | 3 | `scripts/build-forest-campsite.py`, `scripts/generate-forest-campsite-meshy-from-image.mjs`, `scripts/verify-forest-campsite.mjs` |
| `scripts/forest-composition-revision.json` | 2026-08-10 | 9 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md`, `docs/superpowers/specs/moonlit-firefly-forest/scene-gates.json`, `scripts/build-forest-environment.py` |
| `scripts/forest-ground-ecosystem-assets.json` | 2026-08-13 | 3 | `docs/superpowers/specs/moonlit-firefly-forest/evidence/ground-ecosystem-r1/forest-ground-ecosystem-r1-verdict.md`, `scripts/forest-static-prop-layout.json`, `scripts/inspect-forest-ground-ecosystem.py` |
| `scripts/forest-ground-life-ecology.json` | 2026-08-08 | 7 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md`, `scripts/build-forest-ground-life-ecology-contact-sheet.mjs`, `scripts/build-forest-ground-life-ecology.py` |
| `scripts/forest-ground-life-images.json` | 2026-08-08 | 2 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md`, `scripts/generate-forest-ground-life-from-image.mjs` |
| `scripts/forest-ground-life-layout.json` | 2026-08-13 | 6 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md`, `docs/superpowers/specs/active/2026-08-09-ocean-zone-layout-design.md`, `scripts/build-forest-environment.py` |
| `scripts/forest-ground-life-lineup.json` | 2026-08-08 | 4 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md`, `scripts/build-forest-ground-life-lineup-contact-sheet.mjs`, `scripts/build-forest-ground-life-lineup.py` |
| `scripts/forest-ground-materials.json` | 2026-08-13 | 4 | `scripts/build-forest-environment.py`, `scripts/build-forest-floor-texture.mjs`, `scripts/verify-forest-environment-glb.mjs` |
| `scripts/forest-meshy-images.json` | 2026-08-08 | 3 | `scripts/generate-forest-meshy-from-image.mjs`, `scripts/optimize-forest-tree-assets.mjs`, `scripts/verify-forest-tree-assets.mjs` |
| `scripts/forest-meshy-retextures.json` | 2026-08-10 | 1 | `scripts/retexture-forest-meshy.mjs` |
| `scripts/forest-natural-tree-assets.json` | 2026-08-12 | 1 | `docs/superpowers/specs/moonlit-firefly-forest/evidence/tree-diversity-r1/tree-asset-inventory.md` |
| `scripts/forest-path-layout.json` | 2026-08-10 | 11 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md`, `docs/superpowers/specs/moonlit-firefly-forest/scene-development.md`, `docs/superpowers/specs/moonlit-firefly-forest/scene-gates.json` |
| `scripts/forest-plantcatalog-bridge.json` | 2026-09-01 | 12 | `docs/superpowers/specs/2026-08-16-forest-plantcatalog-install-and-proof-handoff.md`, `docs/superpowers/specs/active/2026-09-02-flow-fest-arrival-arc-roadmap.md`, `docs/superpowers/specs/autumn-world-coherence-r1/scene-development.md` |
| `scripts/forest-prop-lineup.json` | 2026-08-17 | 4 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md`, `scripts/build-forest-environment.py`, `scripts/build-forest-prop-lineup.py` |
| `scripts/forest-semantic-tree-family.json` | 2026-08-14 | 8 | `docs/superpowers/specs/moonlit-firefly-forest/evidence/semantic-tree-family-r1/meshy-tasks.json`, `scripts/build-forest-semantic-tree-family-composite.py`, `scripts/build-forest-semantic-tree-family.mjs` |
| `scripts/forest-semantic-tree-wave-r2.json` | 2026-08-14 | 9 | `docs/superpowers/specs/moonlit-firefly-forest/evidence/semantic-tree-wave-r2/meshy-tasks.json`, `scripts/analyze-forest-semantic-tree-wave-r2-components.mjs`, `scripts/build-forest-semantic-tree-wave-r2-composite.py` |
| `scripts/forest-speedtree-pilot.json` | 2026-08-12 | 5 | `scripts/build-forest-speedtree-pilot.py`, `scripts/forest-speedtree-pilot-contact-sheet.mjs`, `scripts/optimize-forest-speedtree-pilot.mjs` |
| `scripts/forest-stage-layout.json` | 2026-08-12 | 4 | `scripts/build-forest-stage.py`, `scripts/forest-composition-revision.json`, `scripts/verify-forest-stage.mjs` |
| `scripts/forest-static-prop-layout.json` | 2026-08-17 | 9 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md`, `docs/superpowers/specs/moonlit-firefly-forest/forest-gate9-verification-report.json`, `scripts/build-forest-environment.py` |
| `scripts/forest-tree-layout.json` | 2026-08-18 | 18 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md`, `docs/superpowers/specs/2026-08-06-autumn-living-forest-floor-handoff.md`, `docs/superpowers/specs/active/2026-08-09-fathom-ocean-world-boundary-design.md` |
| `scripts/forest-tree-lineup.json` | 2026-08-08 | 5 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md`, `scripts/build-forest-tree-lineup-contact-sheet.mjs`, `scripts/build-forest-tree-lineup.py` |
| `scripts/forest-tree-regeneration.json` | 2026-08-10 | 8 | `docs/superpowers/specs/moonlit-firefly-forest/evidence/tree-regeneration/forest-tree-regeneration-meshy6-tasks.json`, `docs/superpowers/specs/moonlit-firefly-forest/evidence/tree-regeneration/forest-tree-regeneration-tasks.json`, `scripts/forest-tree-regeneration-analyze.py` |
| `scripts/forest_ground_life.py` | 2026-08-23 | 1 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md` |
| `scripts/forest_prop_assets.py` | 2026-08-10 | 1 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md` |
| `scripts/generate-autumn-meshy-from-image.mjs` | 2026-08-08 | 2 | `docs/reference/autumn-meshy-image-prompts.md`, `docs/superpowers/specs/active/2026-06-21-enchanted-autumn-dusk-design.md` |
| `scripts/generate-autumn-meshy.mjs` | 2026-08-06 | 3 | `docs/superpowers/plans/2026-06-21-enchanted-autumn-dusk.md`, `docs/superpowers/specs/2026-08-06-autumn-living-forest-floor-handoff.md`, `docs/superpowers/specs/active/2026-06-21-enchanted-autumn-dusk-design.md` |
| `scripts/generate-caps-trochoids.mjs` | 2026-08-03 | 3 | `docs/superpowers/specs/2026-08-01-notation-caps-exhibit-redesign.md`, `docs/superpowers/specs/2026-08-02-notation-caps-4k-density-correction.md`, `~/.claude/projects/E--tka-platform/memory/project_notation_loops_caps.md` |
| `scripts/generate-cosmic-meshy.mjs` | 2026-07-19 | 1 | `docs/superpowers/handoffs/2026-07-19-cosmic-astral-reliquary-handoff.md` |
| `scripts/generate-earth-long-terrace-board.ts` | 2026-08-31 | 2 | `docs/superpowers/plans/2026-08-16-water-wing-playable-graybox.md`, `docs/superpowers/specs/earth-long-terrace/2026-08-08-opus-floor-plan-review.md` |
| `scripts/generate-first-fire-cinder-court-board.ts` | 2026-08-09 | 1 | `docs/superpowers/specs/2026-08-09-first-fire-cinder-court-navigation-reset-handoff.md` |
| `scripts/generate-first-fire-navigation-reset-proposal.mjs` | 2026-08-27 | 1 | `docs/superpowers/specs/first-fire-cinder-court/navigation-reset/README.md` |
| `scripts/generate-grip-poses-from-taxonomy.py` | 2026-03-31 | 1 | `~/.claude/projects/E--tka-platform/memory/project_finger_grip_system.md` |
| `scripts/generate-guide-data.cjs` | 2026-08-31 | 2 | `docs/superpowers/plans/backlog/2026-04-25-level-1-guide-redesign.md`, `docs/superpowers/specs/shipped/2026-04-24-level-1-guide-redesign.md` |
| `scripts/generate-i18n-types.cjs` | 2026-02-06 | 3 | `docs/adr/001-json-based-i18n.md`, `docs/superpowers/specs/shipped/2026-05-23-i18n-adoption-plan-design.md`, `package.json` |
| `scripts/generate-letter-types-json.ts` | 2026-06-17 | 4 | `docs/superpowers/plans/backlog/2026-06-17-tka-explanation-single-source.md`, `tests/unit/domain/letter-types-json-parity.test.ts`, `~/.claude/projects/E--tka-platform/memory/reference_flow_arts_mcp_deploy.md` |
| `scripts/generate-loop-audit-fixtures.mjs` | 2026-08-31 | 6 | `docs/superpowers/plans/shipped/2026-07-12-compositional-loop-p1-p2.md`, `docs/superpowers/specs/shipped/2026-07-03-fable-loop-detection-audit-fixes-design.md`, `packages/sequence-engine/tests/generation/loop-spec-build.test.ts` |
| `scripts/generate-native-env.mjs` | 2026-07-18 | 6 | `.github/workflows/android-build.yml`, `docs/superpowers/handoffs/2026-07-18-android-native-fixes-handoff.md`, `docs/superpowers/plans/shipped/2026-07-29-direct-share-shortcuts.md` |
| `scripts/generate-ocean-composition.py` | 2026-08-10 | 6 | `.gitignore`, `docs/superpowers/specs/active/2026-08-09-ocean-composition-matrix-design.md`, `docs/superpowers/specs/active/2026-08-09-trench-gallery-composition-design.md` |
| `scripts/generate-ocean-placements.cjs` | 2026-08-27 | 2 | `docs/superpowers/specs/active/2026-08-09-ocean-composition-matrix-design.md`, `scripts/generate-ocean-composition.py` |
| `scripts/generate-pictographs.js` | 2026-01-12 | 1 | `src/routes/render-pictographs/+page.svelte` |
| `scripts/generate-qr.mjs` | 2026-08-27 | 4 | `.agents/skills/qr/SKILL.md`, `.claude/skills/qr/SKILL.md`, `docs/superpowers/specs/active/2026-07-25-sequence-public-parity-repair-design.md` |
| `scripts/generate-seraphic-vault-gate1.mjs` | 2026-08-10 | 3 | `docs/superpowers/specs/active/2026-08-09-olive-cloudbreak-celestial-pivot.md`, `docs/superpowers/specs/seraphic-vault/gate0-cloudbreak-canon-audit.md`, `docs/superpowers/specs/seraphic-vault/scene-development.md` |
| `scripts/generate-skewed-dataframe.ts` | 2026-08-31 | 4 | `docs/reference/letter-gap-families.md`, `docs/superpowers/specs/2026-08-05-sequence-combinator-algebra-handoff.md`, `docs/superpowers/specs/2026-08-05-sequence-combinator-redesign-design.md` |
| `scripts/generate-stage-meshy.mjs` | 2026-07-19 | 5 | `docs/superpowers/handoffs/2026-07-19-cosmic-astral-reliquary-handoff.md`, `docs/superpowers/plans/2026-06-21-enchanted-autumn-dusk.md`, `docs/superpowers/specs/active/2026-06-21-enchanted-autumn-dusk-design.md` |
| `scripts/generate-svg-precache-manifest.cjs` | 2026-08-10 | 9 | `.gitignore`, `docs/OFFLINE-FIRST-ARCHITECTURE.md`, `docs/superpowers/plans/active/2026-08-10-landing-performance-plan.md` |
| `scripts/generate-thumbnail-manifest.cjs` | 2026-07-24 | 1 | `package.json` |
| `scripts/generate-traverse-reef.py` | 2026-08-10 | 6 | `docs/museum/water-exhibit-archive/INDEX.md`, `docs/superpowers/specs/active/2026-08-09-trench-gallery-composition-design.md`, `scripts/prepare-traverse-reef-sources.mjs` |
| `scripts/generate-winter-composer-instance-map.mjs` | 2026-08-12 | 1 | `docs/superpowers/specs/active/2026-05-20-scene-composer-design.md` |
| `scripts/geospatial/build_flow_fest_eztree_species.ts` | 2026-09-03 | 3 | `scripts/geospatial/build_flow_fest_tree_lods.mjs`, `src/routes/test/flow-fest-sim/flow-fest-forest-ecology.ts`, `src/routes/test/flow-fest-sim/flow-fest-tree-species.ts` |
| `scripts/geospatial/build_flow_fest_foundation.py` | 2026-08-25 | 3 | `docs/superpowers/specs/active/2026-08-24-flow-fest-sim-design.md`, `~/.claude/plans/act-as-the-final-eager-sun.md`, `~/.claude/plans/perform-a-focused-review-only-snoopy-sunrise.md` |
| `scripts/geospatial/build_flow_fest_gate1_plan.py` | 2026-08-25 | 2 | `docs/superpowers/specs/flow-fest-sim/flow-fest-sim-production-contract.md`, `docs/superpowers/specs/flow-fest-sim/scene-gates.json` |
| `scripts/geospatial/build_flow_fest_gate2_graybox.py` | 2026-08-25 | 2 | `docs/superpowers/specs/flow-fest-sim/evidence/gate-2/gate2-coordinate-manifest.json`, `docs/superpowers/specs/flow-fest-sim/evidence/gate-2/gate2-verification.json` |
| `scripts/geospatial/build_flow_fest_gate6_acceptance.mjs` | 2026-08-27 | 2 | `docs/superpowers/specs/flow-fest-sim/evidence/gate-6/gate6-verification.json`, `docs/superpowers/specs/flow-fest-sim/flow-fest-gate6-acceptance.md` |
| `scripts/geospatial/build_flow_fest_tree_lods.mjs` | 2026-09-03 | 4 | `docs/superpowers/specs/active/2026-09-02-flow-fest-arrival-arc-roadmap.md`, `scripts/geospatial/build_flow_fest_eztree_species.ts`, `src/routes/test/flow-fest-sim/flow-fest-forest-ecology.ts` |
| `scripts/geospatial/extract_flow_fest_forest_grass.mjs` | 2026-08-27 | 1 | `docs/superpowers/specs/flow-fest-sim/evidence/forest-ecology-r1/forest-ecology-verification.json` |
| `scripts/geospatial/flow-fest-site.json` | 2026-08-25 | 2 | `docs/superpowers/specs/active/2026-08-24-flow-fest-sim-design.md`, `scripts/geospatial/build_flow_fest_foundation.py` |
| `scripts/geospatial/flow-fest-source-lock.json` | 2026-08-25 | 5 | `docs/superpowers/specs/active/2026-08-24-flow-fest-sim-design.md`, `docs/superpowers/specs/flow-fest-sim/evidence/gate-2/gate2-coordinate-manifest.json`, `docs/superpowers/specs/flow-fest-sim/flow-fest-sim-production-contract.md` |
| `scripts/geospatial/measure_flow_fest_trees.mjs` | 2026-09-03 | 2 | `scripts/geospatial/build_flow_fest_eztree_species.ts`, `src/routes/test/flow-fest-sim/flow-fest-tree-species.ts` |
| `scripts/geospatial/requirements.txt` | 2026-08-25 | 11 | `scripts/geospatial/build_flow_fest_foundation.py`, `~/.claude/plugins/cache/claude-plugins-official/mcp-server-dev/48aa43517886/skills/build-mcpb/SKILL.md`, `~/.claude/plugins/cache/claude-plugins-official/mcp-server-dev/unknown/skills/build-mcpb/SKILL.md` |
| `scripts/half-arrow-seeds.mjs` | 2026-08-31 | 3 | `assets/half-arrow-templates/README.md`, `scripts/build-half-arrow-templates.mjs`, `scripts/ingest-half-arrows.mjs` |
| `scripts/half-domain-coverage.mjs` | 2026-08-31 | 5 | `.claude/agents/arrow-positioning-expert.md`, `.codex/agents/arrow-positioning-expert.toml`, `docs/superpowers/specs/shipped/2026-07-25-choreo-gorgeous-4k-design.md` |
| `scripts/half-glyph-parity.mjs` | 2026-08-27 | 3 | `.claude/agents/arrow-positioning-expert.md`, `.codex/agents/arrow-positioning-expert.toml`, `src/lib/shared/pictograph/arrow/rendering/services/arrow-path-resolver.ts` |
| `scripts/i18n-localize.cjs` | 2026-08-27 | 2 | `.gitignore`, `~/.claude/projects/E--tka-platform/memory/project_local_llm_translation.md` |
| `scripts/i18n-termbase.json` | 2026-06-20 | 2 | `scripts/i18n-localize.cjs`, `~/.claude/projects/E--tka-platform/memory/project_local_llm_translation.md` |
| `scripts/import-case-scan.cjs` | 2026-05-29 | 2 | `docs/specs/enterprise-ceremony-retirement.md`, `docs/specs/god-component-decomposition.md` |
| `scripts/import-sequence.cjs` | 2026-09-04 | 23 | `.agents/skills/add-to-library/SKILL.md`, `.agents/skills/add-to-library/format-reference.md`, `.agents/skills/deck/SKILL.md` |
| `scripts/import-spiroanim-eight-step.cjs` | 2026-09-04 | 2 | `docs/superpowers/plans/2026-08-30-spiroanim-tka-bridge.md`, `~/.claude/projects/E--tka-platform/memory/project_spiroanim_bridge.md` |
| `scripts/import-spiroanim-qst.cjs` | 2026-09-04 | 1 | `docs/research/spiroanim/README.md` |
| `scripts/ingest-half-arrows.mjs` | 2026-08-27 | 6 | `assets/half-arrow-templates/README.md`, `package.json`, `scripts/build-half-arrow-templates.mjs` |
| `scripts/inject-modulepreload.js` | 2026-05-05 | 2 | `docs/superpowers/plans/shipped/2026-05-05-edge-ssr-migration.md`, `docs/superpowers/plans/shipped/2026-05-05-load-performance-phase-a.md` |
| `scripts/inject-spec-frontmatter.cjs` | 2026-08-27 | 1 | `docs/superpowers/specs/shipped/2026-04-26-queue-skill-and-spec-restructure-design.md` |
| `scripts/inline-landing-critical-css.cjs` | 2026-08-09 | 3 | `docs/superpowers/specs/active/2026-08-09-landing-constrained-network-performance-design.md`, `package.json`, `tests/unit/landing-constrained-performance-contract.test.ts` |
| `scripts/launch-chrome-debug.ps1` | 2026-08-28 | 36 | `.agents/skills/museum-scene-production/references/reviews/2026-08-08-opus.md`, `.claude/rules/visual-verification-mandatory.md`, `.claude/skills/museum-scene-production/references/reviews/2026-08-08-opus.md` |
| `scripts/launchers/icons/tka-platform.ico` | 2026-06-03 | 10 | `agent-hub/KNOWN-ISSUES.md`, `agent-hub/README.md`, `agent-hub/diag/capture-pop.ps1` |
| `scripts/launchers/start-claude.bat` | 2026-05-04 | 6 | `.claude/skills/devfix/SKILL.md`, `agent-hub/install.ps1`, `agent-hub/tests/test_renameall.py` |
| `scripts/legacy-sequence-dates.json` | 2026-01-07 | 1 | `scripts/debug-beat-structure.cjs` |
| `scripts/lib/build-seraphic-vault-cloudbreak-graybox.py` | 2026-08-10 | 1 | `scripts/build-seraphic-vault-phase2-graybox.py` |
| `scripts/lib/character-alpha-modes.mjs` | 2026-09-04 | 2 | `scripts/lib/optimize-character-glb.mjs`, `tests/unit/3d/character-alpha-modes.test.ts` |
| `scripts/lib/chrome-cdp.mjs` | 2026-08-25 | 2 | `scripts/capture-ember-atmosphere-evidence.mjs`, `scripts/capture-seraphic-vault-gate4.mjs` |
| `scripts/lib/cli-auth.js` | 2026-08-27 | 2 | `scripts/fetch-feedback.js`, `scripts/lib/firestore-provider.js` |
| `scripts/lib/cloud-functions-client.js` | 2026-08-05 | 3 | `docs/superpowers/specs/shipped/2026-05-23-dependency-asset-cleanup-design.md`, `scripts/fetch-feedback.js`, `scripts/review-firestore-permission-fix.ts` |
| `scripts/lib/compose-sequence.cjs` | 2026-09-04 | 3 | `docs/superpowers/specs/shipped/2026-05-04-add-to-library-skill-design.md`, `scripts/import-sequence.cjs`, `tests/unit/parity/legacy-script-parity-boundaries.test.ts` |
| `scripts/lib/feedback-claim-session.js` | 2026-07-27 | 2 | `scripts/fetch-feedback.js`, `tests/unit/feedback-claim-session.test.ts` |
| `scripts/lib/feedback-notifier.js` | 2026-08-27 | 1 | `scripts/fetch-feedback.js` |
| `scripts/lib/firestore-provider.js` | 2026-08-27 | 70 | `.agents/skills/qr/SKILL.md`, `.claude/skills/qr/SKILL.md`, `docs/superpowers/plans/2026-08-04-session-triage.md` |
| `scripts/lib/glb-measure.cjs` | 2026-08-17 | 8 | `scripts/build-capsule-baton-model.py`, `scripts/build-fire-double-staff-model.py`, `scripts/characters/character-glb.mjs` |
| `scripts/lib/meshy-image-generator.mjs` | 2026-08-27 | 12 | `scripts/generate-autumn-meshy-from-image.mjs`, `scripts/generate-blossom-meshy-from-image.mjs`, `scripts/generate-celestial-meshy-from-image.mjs` |
| `scripts/lib/meshy-remesh-generator.mjs` | 2026-08-27 | 2 | `scripts/generate-ember-meshy-remeshes.mjs`, `tests/unit/scripts/meshy-image-generator.test.js` |
| `scripts/lib/meshy-retexture-generator.mjs` | 2026-08-27 | 3 | `scripts/generate-ember-meshy-retextures.mjs`, `scripts/retexture-forest-meshy.mjs`, `tests/unit/scripts/meshy-image-generator.test.js` |
| `scripts/lib/meshy-text-generator.mjs` | 2026-08-27 | 4 | `scripts/generate-first-fire-meshy.mjs`, `scripts/generate-flow-fest-cars-meshy.mjs`, `scripts/generate-winter-hearth-meshy.mjs` |
| `scripts/lib/museum-attachments.js` | 2026-08-27 | 2 | `docs/museum/devlog/2026-01-29-creation-session.ini`, `scripts/museum-dev.js` |
| `scripts/lib/museum-firebase.js` | 2026-02-20 | 2 | `scripts/lib/museum-operations.js`, `scripts/museum-dev.js` |
| `scripts/lib/museum-linking.js` | 2026-08-27 | 3 | `docs/museum/devlog/2026-01-29-creation-session.ini`, `scripts/lib/museum-operations.js`, `scripts/museum-dev.js` |
| `scripts/lib/museum-operations.js` | 2026-08-27 | 1 | `scripts/museum-dev.js` |
| `scripts/lib/native-push-deploy-core.mjs` | 2026-09-01 | 4 | `docs/superpowers/specs/active/2026-08-01-native-release-surface-hardening.md`, `scripts/native-push-deploy.mjs`, `scripts/verify-native-release-surface.mjs` |
| `scripts/lib/optimize-character-glb.mjs` | 2026-09-05 | 4 | `scripts/characters/character-intake.mjs`, `scripts/characters/character-proportion-sweep.mjs`, `scripts/optimize-avatars.mjs` |
| `scripts/lib/optimize-gltf-ktx2.mjs` | 2026-09-05 | 1 | `scripts/optimize-ember-production-slice.mjs` |
| `scripts/lib/release-module-gate.mjs` | 2026-07-31 | 5 | `docs/architecture/release-module-gate.md`, `docs/superpowers/specs/backlog/2026-07-28-release-notes-deep-linking-design.md`, `scripts/release.js` |
| `scripts/lib/resolve-rotation-direction.cjs` | 2026-08-31 | 1 | `scripts/seed-tnd-turn-decks.cjs` |
| `scripts/lib/seraphic-vault-cloudbreak-gate1.mjs` | 2026-08-10 | 1 | `scripts/generate-seraphic-vault-gate1.mjs` |
| `scripts/lib/seraphic-vault-cloudbreak-gate2-coordinates.mjs` | 2026-08-10 | 2 | `scripts/generate-seraphic-vault-gate2-coordinates.mjs`, `tests/unit/3d-viewer/seraphic-vault-cloudbreak.test.ts` |
| `scripts/lib/seraphic-vault-cloudbreak-gate2-review.mjs` | 2026-08-10 | 1 | `scripts/generate-seraphic-vault-gate2-review.mjs` |
| `scripts/lib/session-issue-store.ts` | 2026-08-05 | 4 | `.agents/skills/sessions/SKILL.md`, `.claude/skills/sessions/SKILL.md`, `docs/superpowers/plans/2026-08-04-session-triage.md` |
| `scripts/lib/svelte-kit-generated-state.mjs` | 2026-08-31 | 2 | `scripts/svelte-kit-sync-if-needed.mjs`, `tests/unit/scripts/workspace-install-health.test.ts` |
| `scripts/lib/verify-seraphic-vault-cloudbreak-graybox.py` | 2026-08-10 | 1 | `scripts/verify-seraphic-vault-phase2-graybox.py` |
| `scripts/lib/workspace-install-health.mjs` | 2026-08-28 | 2 | `scripts/verify-workspace-install.mjs`, `tests/unit/scripts/workspace-install-health.test.ts` |
| `scripts/lift-turn-arrows.py` | 2026-07-14 | 1 | `src/routes/(public)/guide/level-2/_data/lifted-turn-arrows.ts` |
| `scripts/mandala-prototype.cjs` | 2026-08-31 | 4 | `docs/superpowers/plans/shipped/2026-03-26-sequence-mandala.md`, `src/lib/shared/mandala/services/mandala-geometry-calculator.ts`, `~/.claude/projects/E--tka-platform/memory/project_sequence_mandala.md` |
| `scripts/measure-forest-tree-diversity.mjs` | 2026-08-14 | 1 | `docs/superpowers/specs/moonlit-firefly-forest/evidence/tree-grass-parity-r1/tree-grass-parity-verdict.md` |
| `scripts/measure-ocean-assets.cjs` | 2026-08-10 | 2 | `docs/superpowers/specs/active/2026-08-09-ocean-composition-matrix-design.md`, `scripts/ocean-glb-metrics.cjs` |
| `scripts/measure-ocean-models.cjs` | 2026-08-27 | 3 | `docs/superpowers/specs/active/2026-06-21-enchanted-autumn-dusk-design.md`, `docs/superpowers/specs/active/2026-08-09-ocean-composition-matrix-design.md`, `scripts/ocean-glb-metrics.cjs` |
| `scripts/measure-word-segmentation.ts` | 2026-08-16 | 5 | `docs/superpowers/plans/2026-08-16-pronunciation-corpus-session.md`, `docs/superpowers/plans/2026-08-16-pronunciation-token-bank.md`, `docs/superpowers/specs/2026-08-16-pronunciation-corpus-session-design.md` |
| `scripts/migrate-arrow-placement-frames.ts` | 2026-08-14 | 1 | `package.json` |
| `scripts/migrations/backfill-contenthash-gridmode.ts` | 2026-06-30 | 1 | `~/.claude/projects/E--tka-platform/memory/project_public_mirror_admin_residual.md` |
| `scripts/migrations/backfill-intended-word.cjs` | 2026-01-27 | 1 | `docs/audits/2026-08-16-knip-unused-files.txt` |
| `scripts/migrations/backfill-public-performance-metadata.ts` | 2026-08-20 | 1 | `docs/superpowers/specs/2026-08-20-watch-retirement-and-performance-discovery-design.md` |
| `scripts/migrations/backfill-shortcode-words.ts` | 2026-09-01 | 5 | `docs/superpowers/specs/active/2026-07-25-sequence-public-parity-repair-design.md`, `scripts/diagnostics/audit-sequence-public-parity.ts`, `scripts/migrations/lib/shortcode-derivation.ts` |
| `scripts/migrations/backfill-start-position.ts` | 2026-08-31 | 1 | `~/.claude/projects/E--tka-platform/memory/project_public_mirror_admin_residual.md` |
| `scripts/migrations/build-render-parity-corpus.ts` | 2026-08-31 | 1 | `docs/superpowers/specs/shipped/2026-07-05-stepdata-migration-checkpoint-package.md` |
| `scripts/migrations/collapse-legacy-default-arrow-ids.cjs` | 2026-06-20 | 1 | `docs/audits/2026-08-16-knip-unused-files.txt` |
| `scripts/migrations/data-parity-guard.ts` | 2026-08-31 | 5 | `docs/superpowers/specs/shipped/2026-07-03-fable-stepdata-motion-migration-remainder-design.md`, `scripts/migrations/build-render-parity-corpus.ts`, `scripts/migrations/step-lossy-mutation-test.ts` |
| `scripts/migrations/fix-cruft-quick.ts` | 2026-06-29 | 1 | `~/.claude/projects/E--tka-platform/memory/project_public_mirror_admin_residual.md` |
| `scripts/migrations/fix-empty-words.ts` | 2026-06-29 | 1 | `~/.claude/projects/E--tka-platform/memory/project_public_mirror_admin_residual.md` |
| `scripts/migrations/fix-start-position-letters.ts` | 2026-06-29 | 1 | `~/.claude/projects/E--tka-platform/memory/project_public_mirror_admin_residual.md` |
| `scripts/migrations/fix-wrong-words.ts` | 2026-06-29 | 1 | `~/.claude/projects/E--tka-platform/memory/project_public_mirror_admin_residual.md` |
| `scripts/migrations/lib/risk-fixtures.ts` | 2026-08-31 | 2 | `scripts/migrations/build-render-parity-corpus.ts`, `~/.claude/projects/E--tka-platform/memory/project_stepdata_step_migration.md` |
| `scripts/migrations/lib/shortcode-derivation.ts` | 2026-09-01 | 3 | `docs/superpowers/handoffs/2026-07-27-sequence-parity-repair-handoff.md`, `docs/superpowers/specs/active/2026-07-25-sequence-public-parity-repair-design.md`, `scripts/create-shortcodes-batch.js` |
| `scripts/migrations/lib/view-fields-digest.ts` | 2026-08-31 | 1 | `~/.claude/projects/E--tka-platform/memory/project_stepdata_step_migration.md` |
| `scripts/migrations/publish-missing-public-mirrors.ts` | 2026-08-31 | 4 | `scripts/publish-sequence.cjs`, `scripts/sync-missing-public-sequences.js`, `tests/unit/parity/legacy-script-parity-boundaries.test.ts` |
| `scripts/migrations/rebuild-truncated-shortcode-payloads.ts` | 2026-07-26 | 2 | `docs/superpowers/specs/active/2026-07-25-sequence-public-parity-repair-design.md`, `scripts/migrations/lib/shortcode-derivation.ts` |
| `scripts/migrations/reconcile-sequence-public-projections.ts` | 2026-08-31 | 6 | `docs/superpowers/specs/active/2026-07-25-sequence-public-parity-repair-design.md`, `scripts/backfill-sequence-loop-type.cjs`, `scripts/diagnostics/audit-sequence-public-parity.ts` |
| `scripts/migrations/rehash-content-v2.ts` | 2026-06-30 | 7 | `docs/superpowers/specs/active/2026-06-30-reversal-derivation-reconciliation-findings.md`, `docs/superpowers/specs/active/2026-07-25-sequence-public-parity-repair-design.md`, `docs/superpowers/specs/audits/2026-07-05-content-hash-v2-checkpoint-package.md` |
| `scripts/migrations/relabel-reviewed-shortcode.ts` | 2026-07-27 | 2 | `docs/superpowers/handoffs/2026-07-27-sequence-parity-repair-handoff.md`, `docs/superpowers/specs/active/2026-07-25-sequence-public-parity-repair-design.md` |
| `scripts/migrations/repair-half-applied-loop-mints.ts` | 2026-07-27 | 2 | `docs/superpowers/handoffs/2026-07-27-sequence-parity-repair-handoff.md`, `docs/superpowers/specs/active/2026-07-25-sequence-public-parity-repair-design.md` |
| `scripts/migrations/repair-jyc3ji-rotated-loop.ts` | 2026-07-27 | 2 | `docs/superpowers/handoffs/2026-07-27-sequence-parity-repair-handoff.md`, `docs/superpowers/specs/active/2026-07-25-sequence-public-parity-repair-design.md` |
| `scripts/migrations/repair-mislabeled-loop-tags.ts` | 2026-08-31 | 1 | `~/.claude/projects/E--tka-platform/memory/reference_loop_builder_seam_divergence.md` |
| `scripts/migrations/repair-p9ly-mirrored-rotations.ts` | 2026-07-27 | 3 | `docs/superpowers/handoffs/2026-07-27-sequence-parity-repair-handoff.md`, `docs/superpowers/specs/active/2026-07-25-sequence-public-parity-repair-design.md`, `scripts/diagnostics/parity-audit-baseline.json` |
| `scripts/migrations/repair-timestamp-corruption.ts` | 2026-08-01 | 1 | `~/.claude/projects/E--tka-platform/memory/project_public_mirror_admin_residual.md` |
| `scripts/migrations/resolve-duplicate-public-projection.ts` | 2026-07-26 | 1 | `docs/superpowers/specs/active/2026-07-25-sequence-public-parity-repair-design.md` |
| `scripts/migrations/restore-quarantined-shortcode-payloads.ts` | 2026-08-31 | 3 | `docs/superpowers/handoffs/2026-07-27-sequence-parity-repair-handoff.md`, `docs/superpowers/specs/active/2026-07-25-sequence-public-parity-repair-design.md`, `scripts/diagnostics/parity-audit-baseline.json` |
| `scripts/migrations/retain-media-subject-revisions.ts` | 2026-08-23 | 1 | `docs/superpowers/specs/2026-08-23-browse-phase-3-opus-handoff.md` |
| `scripts/migrations/smoke-v2-fork-safety.ts` | 2026-06-30 | 3 | `docs/superpowers/specs/audits/2026-07-05-content-hash-v2-checkpoint-package.md`, `docs/superpowers/specs/shipped/2026-07-03-fable-content-hash-v2-rollout-execution-design.md`, `~/.claude/projects/E--tka-platform/memory/project_stepdata_step_migration.md` |
| `scripts/migrations/snapshot-public-corpus.ts` | 2026-07-26 | 1 | `docs/superpowers/specs/active/2026-07-25-sequence-public-parity-repair-design.md` |
| `scripts/migrations/step-constructability-check.ts` | 2026-07-01 | 3 | `docs/superpowers/specs/shipped/2026-07-03-fable-stepdata-motion-migration-remainder-design.md`, `docs/superpowers/specs/shipped/2026-07-05-stepdata-migration-checkpoint-package.md`, `~/.claude/projects/E--tka-platform/memory/project_stepdata_step_migration.md` |
| `scripts/migrations/step-lossy-mutation-test.ts` | 2026-08-31 | 4 | `docs/superpowers/specs/shipped/2026-07-03-fable-stepdata-motion-migration-remainder-design.md`, `docs/superpowers/specs/shipped/2026-07-05-stepdata-migration-checkpoint-package.md`, `src/lib/shared/foundation/domain/adapters/step-bridge.ts` |
| `scripts/migrations/step-roundtrip-parity.ts` | 2026-08-31 | 3 | `docs/superpowers/specs/shipped/2026-07-03-fable-stepdata-motion-migration-remainder-design.md`, `src/lib/shared/foundation/domain/adapters/step-view-bridge.ts`, `~/.claude/projects/E--tka-platform/memory/project_stepdata_step_migration.md` |
| `scripts/mocks/$app/environment.ts` | 2026-01-13 | 13 | `docs/reference/film-director-capability-matrix.md`, `docs/superpowers/plans/shipped/2026-06-29-component-test-layer.md`, `docs/superpowers/plans/shipped/2026-07-28-share-target-intake-native.md` |
| `scripts/mocks/$app/navigation.ts` | 2026-01-13 | 7 | `docs/superpowers/plans/shipped/2026-06-29-component-test-layer.md`, `docs/superpowers/specs/shipped/2026-06-29-component-test-layer-design.md`, `tests/config/vitest.components.config.ts` |
| `scripts/moon-source-assets.json` | 2026-08-12 | 2 | `docs/superpowers/specs/moon-observatory/source-asset-package.md`, `scripts/fetch-moon-source-assets.mjs` |
| `scripts/moon-source-assets.lock.json` | 2026-08-12 | 2 | `docs/superpowers/specs/moon-observatory/source-asset-package.md`, `scripts/fetch-moon-source-assets.mjs` |
| `scripts/museum-dev.js` | 2026-08-27 | 12 | `.agents/skills/museum-lore/SKILL.md`, `.agents/skills/museum-scene-production/references/reviews/2026-08-08-opus.md`, `.agents/skills/museum/SKILL.md` |
| `scripts/native-push-deploy.mjs` | 2026-09-01 | 1 | `.husky/pre-push` |
| `scripts/node/NodeArrowSvgLoader.ts` | 2026-08-31 | 1 | `docs/superpowers/specs/backlog/2026-04-04-arrow-tip-z-promotion-design.md` |
| `scripts/node/create-node-pictograph-preparer.ts` | 2026-08-31 | 1 | `scripts/pictograph-cli.ts` |
| `scripts/node/sveltekit-stubs.cjs` | 2026-01-13 | 1 | `docs/audits/2026-08-16-knip-unused-files.txt` |
| `scripts/ocean-asset-facts.json` | 2026-08-10 | 8 | `docs/superpowers/specs/active/2026-08-09-ocean-composition-matrix-design.md`, `docs/superpowers/specs/active/2026-08-09-trench-gallery-composition-design.md`, `scripts/audit-ocean-composition.py` |
| `scripts/ocean-blender-placements.json` | 2026-08-09 | 5 | `docs/superpowers/specs/active/2026-08-09-ocean-composition-matrix-design.md`, `docs/superpowers/specs/shipped/2026-06-22-ocean-save-to-live-design.md`, `scripts/blender-export-placements.py` |
| `scripts/ocean-blender-transforms.json` | 2026-05-28 | 1 | `scripts/blender-extract-ocean-transforms.py` |
| `scripts/ocean-composition.json` | 2026-08-10 | 5 | `scripts/audit-ocean-composition.py`, `scripts/build-ocean-composition.py`, `scripts/generate-ocean-composition.py` |
| `scripts/ocean-composition.svg` | 2026-08-10 | 1 | `scripts/plot-ocean-composition.py` |
| `scripts/ocean-ecology-rules.json` | 2026-08-10 | 5 | `docs/superpowers/specs/active/2026-08-09-ocean-composition-matrix-design.md`, `docs/superpowers/specs/active/2026-08-09-trench-gallery-composition-design.md`, `scripts/generate-ocean-composition.py` |
| `scripts/ocean-glb-metrics.cjs` | 2026-08-27 | 2 | `docs/superpowers/specs/active/2026-08-09-ocean-composition-matrix-design.md`, `scripts/measure-ocean-assets.cjs` |
| `scripts/ocean-zone-layout.json` | 2026-08-10 | 10 | `docs/superpowers/plans/active/2026-08-09-fathom-ocean-world-boundary.md`, `docs/superpowers/specs/active/2026-08-09-fathom-ocean-lighting-palette-handoff.md`, `docs/superpowers/specs/active/2026-08-09-fathom-ocean-world-boundary-design.md` |
| `scripts/ocean_substrate.py` | 2026-08-09 | 1 | `docs/superpowers/specs/active/2026-08-09-ocean-composition-matrix-design.md` |
| `scripts/ocean_terrain_profile.py` | 2026-08-09 | 2 | `docs/superpowers/plans/active/2026-08-09-fathom-ocean-world-boundary.md`, `docs/superpowers/specs/active/2026-08-09-ocean-composition-matrix-design.md` |
| `scripts/ocean_zone_pass3.py` | 2026-08-09 | 4 | `docs/superpowers/plans/active/2026-08-09-fathom-ocean-world-boundary.md`, `docs/superpowers/specs/active/2026-08-09-fathom-ocean-lighting-palette-handoff.md`, `docs/superpowers/specs/active/2026-08-09-fathom-ocean-world-boundary-design.md` |
| `scripts/ocean_zone_recompose.py` | 2026-08-09 | 3 | `docs/superpowers/specs/active/2026-08-09-fathom-ocean-lighting-palette-handoff.md`, `docs/superpowers/specs/active/2026-08-09-fathom-ocean-world-boundary-design.md`, `docs/superpowers/specs/active/2026-08-09-ocean-zone-layout-design.md` |
| `scripts/ocean_zone_refine.py` | 2026-08-09 | 1 | `docs/superpowers/specs/active/2026-08-09-fathom-ocean-lighting-palette-handoff.md` |
| `scripts/offline-sw-e2e.mjs` | 2026-07-02 | 1 | `docs/OFFLINE-FIRST-ARCHITECTURE.md` |
| `scripts/optimize-autumn-environment.mjs` | 2026-09-01 | 7 | `docs/superpowers/plans/active/2026-08-06-autumn-hero-environment.md`, `docs/superpowers/specs/2026-08-06-autumn-living-forest-floor-handoff.md`, `docs/superpowers/specs/2026-08-10-autumn-delivery-contract.md` |
| `scripts/optimize-autumn-meshy.mjs` | 2026-08-06 | 4 | `docs/reference/autumn-meshy-image-prompts.md`, `docs/superpowers/plans/2026-06-21-enchanted-autumn-dusk.md`, `docs/superpowers/specs/2026-08-06-autumn-living-forest-floor-handoff.md` |
| `scripts/optimize-avatars.mjs` | 2026-08-31 | 1 | `~/.claude/projects/E--tka-platform/memory/reference_avatar_optimize_pipeline.md` |
| `scripts/optimize-blossom-glb.mjs` | 2026-08-25 | 2 | `docs/superpowers/specs/2026-08-23-blossom-scene-rebuild-handoff.md`, `scripts/build-blossom-environment.py` |
| `scripts/optimize-cosmic-glb.mjs` | 2026-07-19 | 1 | `docs/superpowers/handoffs/2026-07-19-cosmic-astral-reliquary-handoff.md` |
| `scripts/optimize-earth-root-observatory-glb.mjs` | 2026-08-08 | 1 | `docs/superpowers/specs/2026-08-08-earth-root-observatory-opus-handoff.md` |
| `scripts/optimize-ember-production-slice.mjs` | 2026-09-05 | 3 | `docs/superpowers/specs/ember-spatial-directions/evidence/gate-4-lava-flow-r1/verification.md`, `docs/superpowers/specs/ember-spatial-directions/evidence/gate-4-lava-flow-r2/verification.md`, `docs/superpowers/specs/ember-spatial-directions/evidence/gate-4-midflank-r5/runtime-verification.md` |
| `scripts/optimize-first-fire-graybox-glb.mjs` | 2026-08-10 | 2 | `docs/superpowers/specs/2026-08-06-first-fire-torch-procession-handoff.md`, `docs/superpowers/specs/2026-08-09-first-fire-cinder-court-navigation-reset-handoff.md` |
| `scripts/optimize-flow-fest-cars.mjs` | 2026-09-02 | 2 | `scripts/generate-flow-fest-cars-meshy.mjs`, `~/.claude/projects/E--tka-platform/memory/project_flow_fest_car_replacement.md` |
| `scripts/optimize-forest-environment.mjs` | 2026-08-18 | 1 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md` |
| `scripts/optimize-forest-near-frame.mjs` | 2026-08-17 | 1 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md` |
| `scripts/optimize-forest-plantcatalog-bridge.mjs` | 2026-08-23 | 2 | `docs/superpowers/specs/moonlit-firefly-forest/evidence/plantcatalog-bridge-r1/plantcatalog-bridge-r1-runbook.md`, `scripts/run-forest-plantcatalog-postexport.ps1` |
| `scripts/optimize-ocean-assets.sh` | 2026-05-23 | 3 | `docs/superpowers/plans/shipped/2026-05-22-ocean-performance-optimization.md`, `docs/superpowers/specs/shipped/2026-05-22-ocean-performance-optimization-design.md`, `package.json` |
| `scripts/optimize-ocean-glb.mjs` | 2026-08-14 | 19 | `.gitignore`, `docs/superpowers/plans/active/2026-08-09-fathom-ocean-world-boundary.md`, `docs/superpowers/plans/shipped/2026-05-29-ocean-flora-hi-variant.md` |
| `scripts/optimize-ocean-seabed.mjs` | 2026-08-09 | 2 | `scripts/blender-export-ocean-seabed.py`, `scripts/prepare-ocean-sources.mjs` |
| `scripts/optimize-stage-glb.mjs` | 2026-05-28 | 1 | `docs/superpowers/specs/shipped/2026-05-28-ocean-stage-glb-design.md` |
| `scripts/optimize-stage-meshy.mjs` | 2026-05-29 | 3 | `docs/superpowers/plans/2026-06-21-enchanted-autumn-dusk.md`, `docs/superpowers/specs/active/2026-06-21-enchanted-autumn-dusk-design.md`, `scripts/generate-stage-meshy.mjs` |
| `scripts/optimize-traverse-floor.mjs` | 2026-08-09 | 1 | `scripts/build-traverse-seabed.py` |
| `scripts/optimize-winter-environment.mjs` | 2026-08-12 | 2 | `docs/superpowers/plans/active/2026-08-08-winter-environment-pass-three.md`, `docs/superpowers/specs/active/2026-08-08-moonlit-winter-hollow-design.md` |
| `scripts/pictograph-cli.ts` | 2026-08-31 | 1 | `package.json` |
| `scripts/pictograph.ts` | 2026-08-31 | 4 | `docs/superpowers/plans/active/2026-06-21-personal-museum.md`, `docs/superpowers/specs/active/2026-07-03-fable-real-flow-notation-validation-design.md`, `scripts/audit-generator-conformance.ts` |
| `scripts/plantfactory/blossom_cherry_family_r1.py` | 2026-08-23 | 1 | `docs/superpowers/specs/blossom-plantfactory-family-r1/blossom-plantfactory-family-r1.md` |
| `scripts/plantfactory/forest_plantcatalog_bridge_r1.py` | 2026-08-17 | 2 | `docs/superpowers/specs/2026-08-16-forest-plantcatalog-install-and-proof-handoff.md`, `docs/superpowers/specs/moonlit-firefly-forest/evidence/plantcatalog-bridge-r1/plantcatalog-bridge-r1-runbook.md` |
| `scripts/plot-ocean-composition.py` | 2026-08-09 | 1 | `docs/superpowers/specs/active/2026-08-09-ocean-composition-matrix-design.md` |
| `scripts/posthog-query.cjs` | 2026-08-27 | 6 | `docs/superpowers/plans/shipped/2026-03-23-domain-merge.md`, `docs/superpowers/specs/shipped/2026-03-22-domain-merge-design.md`, `scripts/seo/posthog.ts` |
| `scripts/prepare-ember-lava-simulator-benchmark.py` | 2026-09-04 | 8 | `docs/superpowers/specs/ember-spatial-directions/evidence/gate-1-1-geology-amendment-r2/ember-breached-rift-bench-gate1-1-report.json`, `docs/superpowers/specs/ember-spatial-directions/evidence/gate-1-1-geology-amendment-r3/ember-breached-rift-bench-gate1-1-report.json`, `docs/superpowers/specs/ember-spatial-directions/evidence/gate-1-1-geology-amendment-r4/ember-midflank-fire-pilgrimage-r4-gate1-1-report.json` |
| `scripts/prepare-forest-composition-sources.mjs` | 2026-08-12 | 2 | `docs/superpowers/specs/moonlit-firefly-forest/evidence/tree-diversity-r1/tree-asset-inventory.md`, `scripts/build-forest-environment.py` |
| `scripts/prepare-ocean-sources.mjs` | 2026-08-09 | 3 | `.gitignore`, `docs/superpowers/specs/active/2026-08-09-ocean-composition-matrix-design.md`, `scripts/build-ocean-composition.py` |
| `scripts/prepare-traverse-reef-sources.mjs` | 2026-08-09 | 3 | `docs/museum/water-exhibit-archive/INDEX.md`, `docs/superpowers/specs/active/2026-08-09-trench-gallery-composition-design.md`, `scripts/build-traverse-reef.py` |
| `scripts/probe-zombie-shortcodes.ts` | 2026-05-31 | 1 | `docs/superpowers/specs/shipped/2026-04-18-shortcode-durability-roadmap.md` |
| `scripts/provision-agent-profile.ts` | 2026-08-01 | 1 | `scripts/agent-profile-credential.ps1` |
| `scripts/prune-decks.cjs` | 2026-05-31 | 1 | `~/.claude/projects/E--tka-platform/memory/project_tnd_enumeration_session.md` |
| `scripts/publish-qft-frames.mjs` | 2026-07-27 | 1 | `docs/superpowers/handoffs/2026-07-27-qft-app-visual-handoff.md` |
| `scripts/publish-r2-shortcode-snapshot.ts` | 2026-07-28 | 2 | `docs/superpowers/handoffs/2026-07-27-sequence-parity-repair-handoff.md`, `docs/superpowers/specs/active/2026-07-25-sequence-public-parity-repair-design.md` |
| `scripts/publish-sequence.cjs` | 2026-08-31 | 2 | `package.json`, `tests/unit/parity/legacy-script-parity-boundaries.test.ts` |
| `scripts/quarter-arrows/enumerate-states.mjs` | 2026-08-23 | 1 | `docs/research/quarter-arrows/quarter-turn-state-space.json` |
| `scripts/reactivate-deferred.js` | 2026-08-27 | 2 | `.github/workflows/reactivate-deferred.yml`, `scripts/fetch-feedback.js` |
| `scripts/register-gpu-powerlimit-task.ps1` | 2026-06-20 | 1 | `~/.claude/projects/E--tka-platform/memory/project_local_llm_translation.md` |
| `scripts/reground-ocean-placements.py` | 2026-08-09 | 3 | `docs/superpowers/specs/active/2026-08-09-ocean-composition-matrix-design.md`, `scripts/build-ocean-composition.py`, `scripts/ocean_zone_pass3.py` |
| `scripts/release-hand-path-deck.ts` | 2026-09-05 | 1 | `package.json` |
| `scripts/release-tnd-deck.cjs` | 2026-08-03 | 8 | `.agents/skills/release-deck/SKILL.md`, `.claude/agents/deck-release-expert.md`, `.claude/skills/release-deck/SKILL.md` |
| `scripts/release.js` | 2026-08-27 | 12 | `.agents/skills/release/SKILL.md`, `.claude/skills/release/SKILL.md`, `.github/copilot-instructions.md` |
| `scripts/rename-vtg-to-tnd.cjs` | 2026-05-31 | 1 | `~/.claude/projects/E--tka-platform/memory/project_tnd_enumeration_session.md` |
| `scripts/render-avatar-thumbnails.py` | 2026-05-30 | 3 | `docs/superpowers/plans/2026-08-18-performer-hub-rethink.md`, `scripts/build-avatar-thumbnails.mjs`, `scripts/characters/character-tools.mjs` |
| `scripts/render-ember-lava-simulator-comparison.py` | 2026-09-03 | 1 | `docs/superpowers/specs/ember-spatial-directions/geology-lava-composition-research.md` |
| `scripts/render-forest-plantcatalog-bridge.py` | 2026-08-23 | 1 | `scripts/run-forest-plantcatalog-postexport.ps1` |
| `scripts/render-ocean-composition.py` | 2026-08-09 | 1 | `docs/superpowers/specs/active/2026-08-09-ocean-composition-matrix-design.md` |
| `scripts/repair-broken-start-positions.cjs` | 2026-08-31 | 4 | `scripts/repair-motion-placement.cjs`, `src/lib/shared/foundation/domain/models/letter.ts`, `tests/unit/legacy-letter-alias.test.ts` |
| `scripts/research/build-prop-variant-playground.cjs` | 2026-08-05 | 2 | `docs/audits/2026-08-16-knip-unused-files.txt`, `docs/superpowers/specs/active/2026-08-05-repository-root-cleanup-design.md` |
| `scripts/reseed-all-reversal-decks.cjs` | 2026-05-31 | 1 | `scripts/teardown-tnd-materialized-decks.cjs` |
| `scripts/reseed-tnd-family-variants.cjs` | 2026-05-31 | 2 | `docs/superpowers/plans/shipped/2026-05-28-tnd-family-seed-rework.md`, `docs/superpowers/specs/shipped/2026-05-28-tnd-family-seed-rework-design.md` |
| `scripts/reseed-tnd-trilogy-covers.ts` | 2026-07-10 | 1 | `docs/superpowers/specs/backlog/2026-07-17-merchant-product-image-pipeline-design.md` |
| `scripts/review-firestore-permission-fix.ts` | 2026-08-05 | 1 | `package.json` |
| `scripts/run-forest-plantcatalog-postexport.ps1` | 2026-08-23 | 2 | `docs/superpowers/specs/2026-08-16-forest-plantcatalog-install-and-proof-handoff.md`, `docs/superpowers/specs/moonlit-firefly-forest/evidence/plantcatalog-bridge-r1/plantcatalog-bridge-r1-runbook.md` |
| `scripts/scan-collision-lab.ts` | 2026-08-31 | 5 | `docs/superpowers/plans/backlog/2026-07-13-wall-plane-depth-solver.md`, `docs/superpowers/plans/shipped/2026-07-13-wall-plane-feasibility.md`, `docs/superpowers/specs/shipped/2026-07-13-wall-plane-feasibility-design.md` |
| `scripts/scope-98css.cjs` | 2026-02-26 | 1 | `src/lib/features/retro/win95/styles/98-scoped.css` |
| `scripts/search-soundscapes.cjs` | 2026-04-14 | 4 | `scripts/fetch-soundscapes.cjs`, `src/lib/features/museum/audio/soundscape-candidates.generated.ts`, `src/lib/features/museum/audio/soundscape-manifest.ts` |
| `scripts/seed-default-arrow-placements.ts` | 2026-08-14 | 2 | `docs/superpowers/plans/shipped/2026-05-30-editable-default-arrow-positions.md`, `package.json` |
| `scripts/seed-fuel-sources.js` | 2026-08-27 | 1 | `docs/plans/2026-02-22-fuel-source-fire-impl.md` |
| `scripts/seed-l1-deck.ts` | 2026-08-31 | 5 | `docs/superpowers/specs/archived/2026-03-19-hand-path-purpose-built-data-design.md`, `docs/superpowers/specs/shipped/2026-03-20-vtg-deck-design.md`, `docs/superpowers/specs/shipped/2026-05-29-start-orientation-register-design.md` |
| `scripts/seed-l2-halved-rotated-deck.cjs` | 2026-08-31 | 1 | `~/.claude/projects/E--tka-platform/memory/reference_halved_loop_type_compatibility.md` |
| `scripts/seed-l2-quartered-rotated-deck.cjs` | 2026-08-31 | 1 | `docs/superpowers/specs/shipped/2026-07-08-shop-release-strategy-design.md` |
| `scripts/seed-prop-default-placements.mjs` | 2026-08-14 | 3 | `docs/superpowers/plans/shipped/2026-05-30-per-prop-arrow-defaults.md`, `docs/superpowers/specs/shipped/2026-05-30-per-prop-arrow-defaults-design.md`, `src/lib/shared/pictograph/arrow/positioning/placement/services/arrow-placer.ts` |
| `scripts/seed-prop-geometry-adjustments.ts` | 2026-08-27 | 6 | `.claude/agents/arrow-positioning-expert.md`, `.codex/agents/arrow-positioning-expert.toml`, `docs/superpowers/plans/shipped/2026-05-30-editable-default-arrow-positions.md` |
| `scripts/seed-reversal-decks.cjs` | 2026-08-31 | 11 | `docs/superpowers/plans/shipped/2026-03-26-reversal-pattern-deck-expansion.md`, `docs/superpowers/plans/shipped/2026-05-28-tnd-family-seed-rework.md`, `docs/superpowers/plans/shipped/2026-05-28-tnd-reversal-strip.md` |
| `scripts/seed-store-product.cjs` | 2026-04-01 | 3 | `.agents/skills/kickstarter/SKILL.md`, `.claude/skills/kickstarter/SKILL.md`, `scripts/seed-starter-pack.cjs` |
| `scripts/seed-tnd-asymmetric-decks.cjs` | 2026-08-31 | 4 | `docs/superpowers/plans/shipped/2026-05-29-deck-variation-and-tnd-parameter-model.md`, `docs/superpowers/specs/shipped/2026-05-29-deck-variation-and-tnd-parameter-model-design.md`, `scripts/teardown-tnd-materialized-decks.cjs` |
| `scripts/seed-tnd-deck.ts` | 2026-08-31 | 10 | `docs/superpowers/specs/shipped/2026-05-30-tnd-downbeat-deriver-and-gamma-split-design.md`, `docs/superpowers/specs/shipped/2026-07-21-shape-matrix-hero-pool-design.md`, `scripts/build-tnd-base-words.ts` |
| `scripts/seed-tnd-turn-decks.cjs` | 2026-08-31 | 10 | `.agents/skills/deck/SKILL.md`, `.agents/skills/deck/deck-reference.md`, `.claude/skills/deck/SKILL.md` |
| `scripts/seo/cli.ts` | 2026-07-22 | 1 | `package.json` |
| `scripts/seo/config.ts` | 2026-07-22 | 298 | `.agents/skills/deadcode/SKILL.md`, `.agents/skills/devfix/SKILL.md`, `.agents/skills/museum-scene-production/references/reviews/2026-08-08-opus.md` |
| `scripts/seo/core.ts` | 2026-07-22 | 6 | `docs/architecture/in-app-browser-path.md`, `docs/superpowers/plans/2026-08-04-session-triage.md`, `docs/superpowers/specs/shipped/2026-05-29-mandala-export-experience-design.md` |
| `scripts/seo/posthog.ts` | 2026-07-21 | 18 | `docs/architecture/in-app-browser-path.md`, `docs/architecture/landing-analytics-taxonomy.md`, `docs/architecture/product-analytics-coverage.md` |
| `scripts/seo/provision-posthog-dashboard.ts` | 2026-07-21 | 2 | `package.json`, `scripts/upload-sourcemaps.js` |
| `scripts/seo/scorecard.ts` | 2026-07-22 | 2 | `docs/superpowers/specs/active/2026-07-03-fable-real-flow-notation-validation-design.md`, `src/lib/features/train/prop-tracking-lab/services/tka-pose-classifier.ts` |
| `scripts/seo/tsconfig.json` | 2026-07-20 | 115 | `.claude/hooks/pre-commit-check.cjs`, `.codex/hooks/post-edit-typecheck.cjs`, `.codex/hooks/pre-commit-check.cjs` |
| `scripts/seraphic-vault-cloudbreak-layout.json` | 2026-08-12 | 15 | `docs/superpowers/specs/2026-08-11-olive-cloudbreak-revision-6-handoff.md`, `docs/superpowers/specs/active/2026-08-09-olive-cloudbreak-celestial-pivot.md`, `docs/superpowers/specs/seraphic-vault/gate0-cloudbreak-canon-audit.md` |
| `scripts/seraphic-vault-phase2-layout.json` | 2026-08-09 | 7 | `docs/superpowers/specs/seraphic-vault/scene-development.md`, `docs/superpowers/specs/seraphic-vault/seraphic-vault-gate1-report-r1-rejected.json`, `docs/superpowers/specs/seraphic-vault/seraphic-vault-gate1-report-r2.json` |
| `scripts/service-rename-plan.md` | 2026-01-25 | 1 | `docs/superpowers/plans/shipped/2026-04-14-procedural-world-engine-extraction.md` |
| `scripts/set-admin-claims.js` | 2026-08-27 | 1 | `docs/superpowers/specs/backlog/2026-05-23-firebase-cost-optimization-design.md` |
| `scripts/setup-release-workflow.js` | 2026-07-12 | 2 | `docs/superpowers/plans/shipped/2026-03-22-tka-composer-rename.md`, `package.json` |
| `scripts/shape-fingerprint-test.ts` | 2026-08-31 | 2 | `docs/superpowers/plans/shipped/2026-06-22-mandala-decoder.md`, `docs/superpowers/specs/shipped/2026-06-22-mandala-decoder-design.md` |
| `scripts/show-sequence.mjs` | 2026-08-31 | 5 | `.claude/agents/prop-positioning-expert.md`, `.codex/agents/prop-positioning-expert.toml`, `docs/superpowers/specs/active/2026-07-25-sequence-public-parity-repair-design.md` |
| `scripts/spec-drift-detector.cjs` | 2026-08-27 | 5 | `.agents/skills/queue/SKILL.md`, `.claude/skills/queue/SKILL.md`, `docs/superpowers/handoffs/2026-07-25-spec-triage-handoff.md` |
| `scripts/start-dev-pm2.cjs` | 2026-07-19 | 5 | `docs/superpowers/specs/shipped/2026-08-01-agent-hub-dev-server-control-design.md`, `ecosystem.config.cjs`, `scripts/start-dev.ps1` |
| `scripts/start-dev.ps1` | 2026-08-31 | 16 | `.agents/skills/devfix/SKILL.md`, `.claude/rules/never-start-the-dev-server.md`, `.claude/settings.local.json` |
| `scripts/start-stable-preview.ps1` | 2026-07-22 | 1 | `.vscode/launch.json` |
| `scripts/strip-desktop-assets.cjs` | 2026-08-17 | 4 | `docs/audits/2026-08-16-knip-unused-files.txt`, `docs/superpowers/specs/shipped/2026-05-23-dependency-asset-cleanup-design.md`, `scripts/tauri-build-frontend.cjs` |
| `scripts/strip-noise-comments.mjs` | 2026-08-27 | 4 | `.agents/skills/code-style/SKILL.md`, `.claude/skills/code-style/SKILL.md`, `docs/specs/comment-noise-retirement.md` |
| `scripts/submit-feedback.js` | 2026-08-27 | 7 | `.agents/skills/done/SKILL.md`, `.agents/skills/submitfb/SKILL.md`, `.claude/skills/done/SKILL.md` |
| `scripts/svelte-kit-sync-if-needed.mjs` | 2026-08-31 | 4 | `docs/superpowers/specs/2026-09-03-create-sequence-actions-handoff.md`, `package.json`, `scripts/start-dev.ps1` |
| `scripts/switch-environment.js` | 2025-12-23 | 2 | `package.json`, `scripts/check-environment.js` |
| `scripts/sync-codex-skills.mjs` | 2026-08-22 | 65 | `.agents/skills/add-to-library/SKILL.md`, `.agents/skills/ai-bust/SKILL.md`, `.agents/skills/audit/SKILL.md` |
| `scripts/sync-mcp-data.mjs` | 2026-08-27 | 3 | `mcp-server-pkg/src/shared/server-context.ts`, `~/.claude/projects/E--tka-platform/memory/project_layer_signature.md`, `~/.claude/projects/E--tka-platform/memory/reference_flow_arts_mcp_deploy.md` |
| `scripts/sync-missing-public-sequences.js` | 2026-08-22 | 1 | `tests/unit/parity/legacy-script-parity-boundaries.test.ts` |
| `scripts/sync-role-claims.mjs` | 2026-08-11 | 1 | `scripts/notify-tester-fuse.mjs` |
| `scripts/sync-shortcodes-to-kv.ts` | 2026-05-27 | 1 | `docs/superpowers/specs/active/2026-08-05-repository-root-cleanup-design.md` |
| `scripts/sync-static-thumbnails.cjs` | 2026-07-24 | 7 | `docs/superpowers/specs/active/2026-07-23-gallery-thumbnail-tail-latency-design.md`, `package.json`, `scripts/release.js` |
| `scripts/take-screenshots.ts` | 2026-08-27 | 3 | `.claude/skills/screenshots/SKILL.md`, `docs/superpowers/handoffs/2026-07-18-android-play-store-launch-handoff.md`, `package.json` |
| `scripts/tauri-build-frontend.cjs` | 2026-09-02 | 3 | `.github/workflows/desktop-build.yml`, `docs/reference/desktop-offline-bundle.md`, `src-tauri/tauri.conf.json` |
| `scripts/teardown-tnd-materialized-decks.cjs` | 2026-05-31 | 1 | `docs/superpowers/plans/shipped/2026-05-29-deck-variation-and-tnd-parameter-model.md` |
| `scripts/test-r2-upload.cjs` | 2026-03-15 | 1 | `~/.claude/projects/E--tka-platform/memory/reference_r2_cors_localhost_https.md` |
| `scripts/test-sequence.json` | 2026-03-26 | 3 | `docs/superpowers/plans/shipped/2026-03-26-sequence-mandala.md`, `scripts/mandala-prototype.cjs`, `tests/unit/MandalaGeometryCalculator.test.ts` |
| `scripts/test_ocean_terrain_profile.py` | 2026-08-09 | 2 | `docs/superpowers/plans/active/2026-08-09-fathom-ocean-world-boundary.md`, `scripts/test_ocean_substrate.py` |
| `scripts/tika-validator.ts` | 2026-08-31 | 2 | `docs/reference/tika-testing.md`, `src/lib/features/tika/validation/README.md` |
| `scripts/tika/evaluate.ts` | 2026-02-06 | 3 | `docs/TIKA-IMPROVEMENT-ARCHITECTURE.md`, `docs/reference/tika-testing.md`, `package.json` |
| `scripts/tika/lib/evaluator.mjs` | 2026-01-17 | 1 | `scripts/tika/run-evaluation.mjs` |
| `scripts/tika/lib/stream-client.mjs` | 2026-01-17 | 1 | `scripts/tika/run-evaluation.mjs` |
| `scripts/tika/opus-reviewer.ts` | 2026-08-31 | 3 | `package.json`, `scripts/tika/evaluate.ts`, `scripts/tika/run-evaluation.mjs` |
| `scripts/tika/reports/resolutions.json` | 2026-01-18 | 1 | `src/routes/api/tika/flagged/+server.ts` |
| `scripts/tika/scenarios.json` | 2026-02-10 | 2 | `docs/TIKA-IMPROVEMENT-ARCHITECTURE.md`, `scripts/tika/run-evaluation.mjs` |
| `scripts/tika/test-run.mjs` | 2026-01-16 | 1 | `docs/reference/tika-testing.md` |
| `scripts/tika/verify-chat-live.ts` | 2026-09-04 | 2 | `docs/superpowers/specs/2026-09-04-tika-fable-handoff.md`, `~/.claude/projects/E--tka-platform/memory/reference_live_scripts_anthropic_base_url.md` |
| `scripts/tika/verify-director-live.ts` | 2026-09-05 | 4 | `docs/superpowers/plans/2026-09-05-tika-arrange-verb.md`, `docs/superpowers/specs/2026-09-04-tika-fable-handoff.md`, `~/.claude/projects/E--tka-platform/memory/reference_anthropic_api_credits_exhausted.md` |
| `scripts/tmp-dup-shortcode-audit.mjs` | 2026-07-13 | 3 | `docs/superpowers/plans/shipped/2026-07-05-shortcode-dup-mint-fix.md`, `docs/superpowers/specs/shipped/2026-07-05-shortcode-dup-mint-fix-design.md`, `~/.claude/projects/E--tka-platform/memory/reference_shortcode_dedup_invariant.md` |
| `scripts/trace-create-three.cjs` | 2026-05-30 | 5 | `docs/superpowers/plans/backlog/2026-05-31-sequence-drawer-host-deferral.md`, `docs/superpowers/specs/shipped/2026-05-31-create-module-eager-graph-deferral-design.md`, `src/lib/features/create/shared/components/CreateModule.svelte` |
| `scripts/transcribe-spiroanim-qst.ts` | 2026-09-04 | 1 | `docs/research/spiroanim/README.md` |
| `scripts/transfer-sequence.ts` | 2026-08-31 | 2 | `package.json`, `tests/unit/parity/sequence-transfer.test.ts` |
| `scripts/traverse_seabed.py` | 2026-08-09 | 7 | `docs/superpowers/specs/active/2026-08-09-water-traverse-design.md`, `scripts/build-traverse-seabed.py`, `scripts/generate-traverse-reef.py` |
| `scripts/triage-sessions.ts` | 2026-08-05 | 5 | `.agents/skills/sessions/SKILL.md`, `.claude/skills/sessions/SKILL.md`, `docs/superpowers/plans/2026-08-04-session-triage.md` |
| `scripts/trim-deploy-assets.js` | 2026-08-29 | 11 | `docs/architecture/landing-analytics-taxonomy.md`, `docs/superpowers/plans/active/2026-08-10-landing-performance-plan.md`, `docs/superpowers/specs/2026-08-06-autumn-living-forest-floor-handoff.md` |
| `scripts/tsconfig.json` | 2026-01-13 | 115 | `.claude/hooks/pre-commit-check.cjs`, `.codex/hooks/post-edit-typecheck.cjs`, `.codex/hooks/pre-commit-check.cjs` |
| `scripts/tunnel2-pm2.cjs` | 2026-08-03 | 4 | `docs/superpowers/handoffs/2026-08-03-d2-vscode-launch-handoff.md`, `docs/superpowers/handoffs/2026-08-03-laptop-dev3-tunnel-handoff.md`, `ecosystem.config.cjs` |
| `scripts/tunnel3-pm2.cjs` | 2026-08-03 | 2 | `docs/superpowers/handoffs/2026-08-03-laptop-dev3-tunnel-handoff.md`, `~/.claude/projects/E--tka-platform/memory/reference_machine_naming_d1_d2.md` |
| `scripts/twin-transform.cjs` | 2026-08-31 | 3 | `docs/superpowers/plans/shipped/2026-05-31-mirror-swap-twin-deck.md`, `scripts/enumerate-deck.cjs`, `tests/unit/scripts/twin-transform.test.ts` |
| `scripts/update-spec-frontmatter.cjs` | 2026-04-26 | 1 | `docs/superpowers/specs/shipped/2026-04-26-queue-skill-and-spec-restructure-design.md` |
| `scripts/upload-sourcemaps.js` | 2026-07-21 | 2 | `package.json`, `vite.config.ts` |
| `scripts/validate-i18n-structure.cjs` | 2026-08-27 | 3 | `.husky/pre-commit`, `docs/superpowers/specs/shipped/2026-05-25-i18n-compile-time-keys-design.md`, `package.json` |
| `scripts/validate-i18n.cjs` | 2026-08-27 | 7 | `docs/adr/001-json-based-i18n.md`, `docs/superpowers/specs/shipped/2026-05-23-dependency-asset-cleanup-design.md`, `docs/superpowers/specs/shipped/2026-05-23-i18n-adoption-plan-design.md` |
| `scripts/validate-loop-detection.cjs` | 2026-08-31 | 5 | `docs/superpowers/handoffs/archived/2026-07-03-loop-detection-audit-handoff.md`, `docs/superpowers/plans/shipped/2026-04-30-loop-detection-foundation-refactor.md`, `docs/superpowers/specs/shipped/2026-07-03-fable-loop-detection-audit-fixes-design.md` |
| `scripts/verify-autumn-environment-performance.mjs` | 2026-09-01 | 4 | `docs/superpowers/specs/2026-08-06-autumn-living-forest-floor-handoff.md`, `docs/superpowers/specs/active/2026-08-31-autumn-scene-hardening.md`, `docs/superpowers/specs/autumn-world-coherence-r1/scene-development.md` |
| `scripts/verify-blossom-composition.mjs` | 2026-08-23 | 2 | `docs/superpowers/specs/2026-08-23-blossom-scene-rebuild-handoff.md`, `scripts/build-blossom-environment.py` |
| `scripts/verify-buugeng-glb.cjs` | 2026-08-23 | 1 | `docs/superpowers/specs/2026-08-14-buugeng-3d-rebuild-design.md` |
| `scripts/verify-capsule-baton-glb.cjs` | 2026-08-18 | 3 | `scripts/build-capsule-baton-model.py`, `src/lib/shared/3d/effects/prop-tip-geometry-3d.ts`, `tests/unit/3d-viewer/capsule-baton-3d.test.ts` |
| `scripts/verify-chicken-glb.cjs` | 2026-08-17 | 1 | `scripts/lib/glb-measure.cjs` |
| `scripts/verify-desktop-assets.mjs` | 2026-09-02 | 3 | `docs/reference/desktop-offline-bundle.md`, `package.json`, `scripts/tauri-build-frontend.cjs` |
| `scripts/verify-desktop-gallery-bundle.mjs` | 2026-09-02 | 3 | `package.json`, `scripts/tauri-build-frontend.cjs`, `tests/unit/desktop-asset-bundle.test.js` |
| `scripts/verify-desktop-sequence-bundle.mjs` | 2026-08-31 | 4 | `package.json`, `scripts/export-deck-bundle.cjs`, `scripts/tauri-build-frontend.cjs` |
| `scripts/verify-earth-root-observatory-glb.mjs` | 2026-08-08 | 3 | `.agents/skills/museum-scene-production/references/reviews/2026-08-08-opus.md`, `.claude/skills/museum-scene-production/references/reviews/2026-08-08-opus.md`, `docs/superpowers/specs/2026-08-08-earth-root-observatory-opus-handoff.md` |
| `scripts/verify-fan-glb.cjs` | 2026-09-01 | 1 | `docs/superpowers/specs/active/2026-08-27-fan-wick-emitters-and-build-gated-effects-design.md` |
| `scripts/verify-fire-double-staff-glb.cjs` | 2026-08-18 | 2 | `src/lib/shared/3d/effects/prop-tip-geometry-3d.ts`, `tests/unit/3d-viewer/fire-double-staff-3d.test.ts` |
| `scripts/verify-first-fire-graybox-glb.mjs` | 2026-08-09 | 5 | `docs/superpowers/plans/active/2026-08-09-first-fire-gate3-visual-target.md`, `docs/superpowers/specs/2026-08-06-first-fire-torch-procession-handoff.md`, `docs/superpowers/specs/2026-08-09-first-fire-cinder-court-navigation-reset-handoff.md` |
| `scripts/verify-forest-composition-revision.mjs` | 2026-08-10 | 1 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md` |
| `scripts/verify-forest-environment-glb.mjs` | 2026-08-18 | 3 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md`, `docs/superpowers/specs/2026-08-08-canopy-forest-scene-handoff.md`, `docs/superpowers/specs/moonlit-firefly-forest/evidence/tree-grass-parity-r1/tree-grass-parity-verdict.md` |
| `scripts/verify-forest-ground-life-ecology.mjs` | 2026-08-08 | 1 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md` |
| `scripts/verify-forest-ground-life-layout.mjs` | 2026-08-09 | 1 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md` |
| `scripts/verify-forest-ground-life-lineup.mjs` | 2026-08-08 | 1 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md` |
| `scripts/verify-forest-near-frame.mjs` | 2026-08-13 | 2 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md`, `docs/superpowers/specs/moonlit-firefly-forest/evidence/tree-grass-parity-r1/tree-grass-parity-verdict.md` |
| `scripts/verify-forest-plantcatalog-bridge.mjs` | 2026-08-27 | 3 | `docs/superpowers/specs/2026-08-16-forest-plantcatalog-install-and-proof-handoff.md`, `docs/superpowers/specs/flow-fest-sim/evidence/forest-ecology-r2/forest-ecology-r2-verification.json`, `scripts/run-forest-plantcatalog-postexport.ps1` |
| `scripts/verify-forest-prop-lineup.mjs` | 2026-08-09 | 1 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md` |
| `scripts/verify-forest-semantic-tree-wave-r2.mjs` | 2026-08-14 | 1 | `docs/superpowers/specs/moonlit-firefly-forest/evidence/semantic-tree-wave-r2/semantic-wave-r2-verdict.md` |
| `scripts/verify-forest-tree-lineup.mjs` | 2026-08-12 | 1 | `docs/superpowers/plans/active/2026-08-08-forest-environment-pass-one.md` |
| `scripts/verify-loop-explorer.mjs` | 2026-08-31 | 2 | `docs/superpowers/plans/shipped/2026-07-19-notation-loops-implementation-plan.md`, `~/.claude/projects/E--tka-platform/memory/project_notation_loops_caps.md` |
| `scripts/verify-native-release-surface.mjs` | 2026-08-01 | 6 | `.github/workflows/android-build.yml`, `docs/superpowers/specs/active/2026-08-01-native-release-surface-hardening.md`, `package.json` |
| `scripts/verify-offline-deploy.mjs` | 2026-07-01 | 2 | `.github/workflows/offline-kit-prod-check.yml`, `package.json` |
| `scripts/verify-orientation-domain-loops.mjs` | 2026-08-31 | 1 | `~/.claude/projects/E--tka-platform/memory/project_orientation_domain_loops.md` |
| `scripts/verify-seo.ts` | 2026-07-20 | 2 | `package.json`, `scripts/seo/tsconfig.json` |
| `scripts/verify-sword-glb.cjs` | 2026-08-23 | 2 | `scripts/lib/glb-measure.cjs`, `src/lib/shared/3d/effects/prop-tip-geometry-3d.ts` |
| `scripts/verify-winter-environment-glb.mjs` | 2026-08-12 | 3 | `docs/superpowers/plans/active/2026-08-08-winter-environment-pass-three.md`, `docs/superpowers/specs/2026-08-10-scene-composer-all-scenes-handoff.md`, `docs/superpowers/specs/active/2026-08-08-moonlit-winter-hollow-design.md` |
| `scripts/verify-workspace-install.mjs` | 2026-08-28 | 2 | `package.json`, `scripts/start-dev.ps1` |
| `scripts/water-traverse-reef-layout.json` | 2026-08-09 | 4 | `docs/superpowers/specs/active/2026-08-09-trench-gallery-composition-design.md`, `scripts/generate-traverse-reef.py`, `scripts/water-traverse-reef.json` |
| `scripts/water-traverse-reef.json` | 2026-08-10 | 5 | `docs/superpowers/specs/active/2026-08-09-trench-gallery-composition-design.md`, `scripts/build-traverse-reef.py`, `scripts/generate-traverse-reef.py` |
| `scripts/windows-maintenance/AustenBackup.Common.psm1` | 2026-07-31 | 4 | `scripts/windows-maintenance/Install-AustenBackupTask.ps1`, `scripts/windows-maintenance/Invoke-AustenBackup.ps1`, `scripts/windows-maintenance/Invoke-AustenBackupPrep.ps1` |
| `scripts/windows-maintenance/Install-AustenBackupTask.ps1` | 2026-07-31 | 1 | `scripts/windows-maintenance/README.md` |
| `scripts/windows-maintenance/Invoke-AustenBackup.ps1` | 2026-07-31 | 2 | `docs/superpowers/handoffs/2026-07-31-windows-backup-firmware-handoff.md`, `scripts/windows-maintenance/Install-AustenBackupTask.ps1` |
| `scripts/windows-maintenance/Invoke-AustenBackupPrep.ps1` | 2026-07-31 | 2 | `scripts/windows-maintenance/Install-AustenBackupTask.ps1`, `scripts/windows-maintenance/Start-AustenBackup.ps1` |
| `scripts/windows-maintenance/Invoke-AustenBackupSnapshotStage.ps1` | 2026-07-31 | 2 | `scripts/windows-maintenance/Install-AustenBackupTask.ps1`, `scripts/windows-maintenance/Run-AustenBackupSnapshotStage.cmd` |
| `scripts/windows-maintenance/Invoke-AustenBackupVerification.ps1` | 2026-07-31 | 1 | `scripts/windows-maintenance/Install-AustenBackupTask.ps1` |
| `scripts/windows-maintenance/README.md` | 2026-07-31 | 147 | `docs/museum/devlog/2026-01-27-creation-session.md`, `docs/museum/devlog/2026-01-29-creation-session.ini`, `docs/reference/human-generator-license-finding.md` |
| `scripts/windows-maintenance/Run-AustenBackupSnapshotStage.cmd` | 2026-07-31 | 2 | `scripts/windows-maintenance/Install-AustenBackupTask.ps1`, `scripts/windows-maintenance/Invoke-AustenBackup.ps1` |
| `scripts/windows-maintenance/Start-AustenBackup.ps1` | 2026-07-31 | 2 | `scripts/windows-maintenance/Install-AustenBackupTask.ps1`, `scripts/windows-maintenance/README.md` |
| `scripts/winter-composer-instance-map.json` | 2026-08-12 | 4 | `docs/superpowers/specs/active/2026-05-20-scene-composer-design.md`, `scripts/generate-winter-composer-instance-map.mjs`, `src/lib/shared/3d/environments/scenes/winter/winter-composer-plugin.ts` |
| `scripts/winter-composer-placements.json` | 2026-08-10 | 4 | `docs/superpowers/specs/active/2026-05-20-scene-composer-design.md`, `scripts/build-winter-environment.py`, `src/lib/shared/3d/environments/scenes/winter/winter-composer-plugin.ts` |
| `scripts/winter-composition-gate1-r2.json` | 2026-08-12 | 6 | `docs/superpowers/specs/moonlit-winter-hollow/scene-development.md`, `scripts/build-winter-environment.py`, `scripts/verify-winter-environment-glb.mjs` |
| `scripts/winter-fire-court-graybox-r1.json` | 2026-08-12 | 8 | `docs/superpowers/specs/moonlit-winter-hollow/evidence/fire-court-graybox-r1/winter-fire-court-graybox-r1-report.json`, `docs/superpowers/specs/moonlit-winter-hollow/scene-development.md`, `docs/superpowers/specs/moonlit-winter-hollow/scene-gates.json` |
| `scripts/winter-hearth-meshy-assets.json` | 2026-08-10 | 1 | `scripts/generate-winter-hearth-meshy.mjs` |
| `scripts/winter-hearth-production.json` | 2026-08-12 | 3 | `scripts/build-winter-environment.py`, `scripts/verify-winter-environment-glb.mjs`, `tests/unit/3d-winter/winter-settlement-layout.test.ts` |
| `scripts/winter-lodge-meshy7-images.json` | 2026-08-12 | 1 | `scripts/generate-winter-lodge-meshy7-from-image.mjs` |
| `scripts/winter-lodge-production.json` | 2026-08-12 | 3 | `scripts/build-winter-environment.py`, `scripts/verify-winter-environment-glb.mjs`, `tests/unit/3d-winter/winter-settlement-layout.test.ts` |
| `scripts/winter-meshy-assets.json` | 2026-08-09 | 1 | `scripts/generate-winter-meshy.mjs` |
| `scripts/winter-settlement-layout.json` | 2026-08-12 | 6 | `docs/superpowers/specs/moonlit-winter-hollow/scene-development.md`, `docs/superpowers/specs/moonlit-winter-hollow/scene-gates.json`, `scripts/build-winter-environment.py` |
| `scripts/winter-settlement-meshy-assets.json` | 2026-08-10 | 1 | `scripts/generate-winter-settlement-meshy.mjs` |
| `scripts/winter-tree-layout.json` | 2026-08-10 | 5 | `docs/superpowers/plans/active/2026-08-08-winter-environment-pass-three.md`, `docs/superpowers/specs/2026-08-10-scene-composer-all-scenes-handoff.md`, `docs/superpowers/specs/moonlit-winter-hollow/scene-development.md` |
| `scripts/winter-tree-lineup.json` | 2026-08-09 | 2 | `scripts/build-winter-tree-lineup-contact-sheet.mjs`, `scripts/build-winter-tree-lineup.py` |
| `scripts/wire-ocean-depth-colour.py` | 2026-08-09 | 2 | `docs/superpowers/plans/active/2026-08-09-fathom-ocean-world-boundary.md`, `scripts/blender-export-ocean-seabed.py` |
| `scripts/worker-url-scan.cjs` | 2026-05-29 | 2 | `docs/specs/enterprise-ceremony-retirement.md`, `docs/specs/god-component-decomposition.md` |
| `scripts/worktree-automerge.mjs` | 2026-09-04 | 2 | `package.json`, `tests/unit/scripts/worktree-automerge.test.ts` |
