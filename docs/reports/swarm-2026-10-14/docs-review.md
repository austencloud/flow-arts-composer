# Documentation review decision ledger

Date: 2026-10-14. Worker: codex/swarm-docs-review. Reviewed worktree baseline: `46285ef0cc50a1028f589f4af3f12ffe5755cc9c`.

## Scope and evidence boundary

Observation: the initial inventory contained **261 Markdown files**, **64,172 lines**, and **3,877,006 characters**, excluding `docs/superpowers/**`. Every file body was loaded for the static review, and `git log -1 --format='%cs %h' -- <file>` was collected for each input. This ledger adds one Markdown file: the final disposition inventory therefore contains **262 files and 262 rows**. The self-row has no previous change date; its creation is the commit delivering this review.

Observation: automated checks examined **3,677 literal path-reference occurrences**. **319** did not resolve under the initial lookup rules. These are candidates, not 319 defects: they include upstream SpiroAnim paths, local-only assets, generated output, root-relative prose and proposed owners. The UPDATE sections distinguish confirmed stale references from those cases. Root `npm/pnpm run` commands were compared with `package.json`; the only missing root script names extracted were `tika:opus-review`, `tika:curate` and `tika:analyze`.

Observation: **658 inline identifier samples** were searched in repository source using a lexical declaration scan; **298** had declaration candidates. Imports, re-exports, object fields, package-owned classes and examples need contextual interpretation. This scan was a locator, not semantic proof. Decisive owner changes were checked with focused `rg`, source reads and Git history, including `git log -S` for topic views, lesson naming and save ownership. Historical result lines quoted from old reports are not tests executed by this worker.

Inference boundary: KEEP means no actionable contradiction was established in this static review, or that an explicitly dated source/design/approval record remains worth keeping. It does not certify every external fact, current runtime behavior, benchmark, provider version, private-machine asset, dashboard state or acceptance gate. Research source links and external quotations were retained as dated evidence; they were not re-browsed. No package install, app check/build, runtime test, dev server, remote-data mutation, integration or push was performed. Only this ledger is changed.

Proposal boundary: ARCHIVE preserves a superseded or completed record; it never means delete. MERGE is a consolidation recommendation, not an executed merge. Creative plans without runtime implementation stay as plans until Austen decides whether they remain live. Dated reports with unresolved actions stay available; an old report's failure is not automatically a current production defect.

## Summary

| Verdict | Files |
| --- | ---: |
| KEEP | 171 |
| UPDATE | 58 |
| ARCHIVE | 26 |
| MERGE | 7 |
| **Total** | **262** |

| Directory | KEEP | UPDATE | ARCHIVE | MERGE | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| docs/ (root) | 3 | 8 | 2 | 2 | 15 |
| docs/adr/ | 2 | 2 | 0 | 0 | 4 |
| docs/architecture/ | 25 | 13 | 1 | 1 | 40 |
| docs/audits/ | 3 | 0 | 2 | 0 | 5 |
| docs/design/ | 3 | 0 | 0 | 0 | 3 |
| docs/development/ | 2 | 0 | 0 | 0 | 2 |
| docs/diagnostics/ | 0 | 0 | 3 | 0 | 3 |
| docs/features/ | 0 | 1 | 0 | 0 | 1 |
| docs/flowkemon/ | 25 | 0 | 0 | 0 | 25 |
| docs/learn/ | 9 | 4 | 0 | 1 | 14 |
| docs/museum/ | 6 | 5 | 1 | 0 | 12 |
| docs/performance/ | 1 | 0 | 5 | 0 | 6 |
| docs/reference/ | 40 | 16 | 5 | 3 | 64 |
| docs/reports/ | 28 | 3 | 4 | 0 | 35 |
| docs/research/ | 8 | 3 | 2 | 0 | 13 |
| docs/specs/ | 11 | 3 | 1 | 0 | 15 |
| docs/tutorial-video-voiceover/ | 5 | 0 | 0 | 0 | 5 |

Summary rows and the numbered capability samples below are not disposition rows. Only the per-directory tables are counted in the inventory check.

## Per-directory dispositions

### docs/ (root)

| File | Last change | Verdict | One-line reason |
| --- | --- | --- | --- |
| `docs/about-page-three-versions.md` | 2026-08-27 da97059534 | ARCHIVE | Observation: three copy variants and comparative critique are a historical writing exercise; current naming/copy authority is docs/reference/ai-writing-guide.md. |
| `docs/contributor-onboarding.md` | 2026-03-09 1a34990c9d | UPDATE | Observation: install, domain, server and verification instructions predate the current contributor contract. |
| `docs/DESTINATIONS-VISION.md` | 2026-07-12 f3ec57857c | UPDATE | Observation: destination vision has no current implementation/status boundary and includes the retired endless-world destination. |
| `docs/FEEDBACK-WORKFLOW.md` | 2026-07-12 f3ec57857c | UPDATE | Observation: command references at lines 446–447 no longer exist. Sample reference at line 448: `scripts/release.js` exists. |
| `docs/I18N-IMPLEMENTATION.md` | 2026-10-10 a97b743f05 | MERGE | Inference: practical usage duplicates docs/I18N-SYSTEM.md; retain the latter as the single guide. Sample reference at line 61: `src/lib/shared/i18n/i18n.svelte.ts` exists. |
| `docs/I18N-SYSTEM.md` | 2026-10-10 a97b743f05 | UPDATE | Observation: obsolete language-picker/CI paths and key totals conflict with current files. Sample reference at line 197: `src/lib/shared/i18n/i18n-types.ts` exists. |
| `docs/LOOP-SYSTEM.md` | 2026-07-27 9464ac63f0 | UPDATE | Observation: opening expansion of LOOP is wrong in the current domain source. |
| `docs/MATHEMATICAL-FOUNDATIONS.md` | 2026-01-14 7797cba26c | KEEP | Observation: explanatory mathematical model; canonical Type 1/grouping definitions remain available in packages/domain and sequence-engine. |
| `docs/MODAL_SIZING_STRATEGY.md` | 2026-01-31 71bc9babac | MERGE | Observation: January target architecture duplicates current responsive guidance and conflicts with modal tokens. |
| `docs/museum-3d-session-2026-04-04.md` | 2026-04-05 ae9486361f | ARCHIVE | Observation: April session snapshot cites removed contracts/implementations paths; current camera owner is packages/camera-3d and museum services are flattened. |
| `docs/OFFLINE-FIRST-ARCHITECTURE.md` | 2026-09-02 9cc20cdfd2 | KEEP | Observation: corrected hand-rolled SW/partial-roadmap account agrees with static/sw.js (tka-v3); absent SVG manifest is explicitly build-generated/gitignored. Sample reference at line 21: `src/lib/shared/auth/firebase.ts` exists. |
| `docs/RTL-MIGRATION.md` | 2026-07-12 f3ec57857c | UPDATE | Observation: blanket locale flip claim omits public-page language pinning; CSS transform-origin example needs correction. |
| `docs/TIKA-IMPROVEMENT-ARCHITECTURE.md` | 2026-01-16 fc858abbe2 | UPDATE | Observation: January draft names a removed owner and three nonexistent npm scripts. |
| `docs/TRANSCRIPTION-PIPELINE.md` | 2026-02-10 134300e708 | KEEP | Observation: proposed external research pipeline, templates and estimates; no claim established that its illustrative archive is in this repository. |
| `docs/UNIFIED-SCALE-SYSTEM.md` | 2026-01-31 71bc9babac | UPDATE | Observation: meter-scale principle survives, but the claimed local scale owner is absent. |

### docs/adr/

| File | Last change | Verdict | One-line reason |
| --- | --- | --- | --- |
| `docs/adr/001-json-based-i18n.md` | 2026-01-18 7a488fa643 | UPDATE | Observation: accepted JSON decision remains, but future-considerations claims have been overtaken. Sample reference at line 180: `scripts/validate-i18n.cjs` exists. |
| `docs/adr/002-app-naming-history.md` | 2026-07-12 f3ec57857c | KEEP | Observation: naming decision matches package.json description and ai-writing-guide.md; past identifiers/claims are explicitly historical. |
| `docs/adr/003-level-1-base-float-classification.md` | 2026-04-18 48ee3a2414 | UPDATE | Observation: accepted prefloat rule survives; four owner paths are stale. Sample reference at line 75: `packages/sequence-engine/src/generation/builder/SequenceBuilder.ts` exists. |
| `docs/adr/004-opening-closing-display-decision.md` | 2026-04-20 0f42b0e13d | KEEP | Observation: parser and roundtrip test paths exist; no later rendering decision reversing data-only op/cl was established. Sample reference at line 12: `src/lib/shared/pictograph/tka-glyph/utils/turn-tuple-parser.ts` exists. |

### docs/architecture/

| File | Last change | Verdict | One-line reason |
| --- | --- | --- | --- |
| `docs/architecture/agent-efficiency-preservation.md` | 2026-09-22 c99f5f82a0 | KEEP | Observation: September routing-change record agrees with AGENTS.md obligations; AGENTS.md and config/read are root/API references, not local missing files. |
| `docs/architecture/browse-analytics-taxonomy.md` | 2026-08-23 d3f2c97684 | KEEP | Observation: browse-events.ts still emits browse_destination_entered; pre-Explore baseline is explicitly dated. Sample reference at line 4: `src/lib/shared/analytics/browse-events.ts` exists. |
| `docs/architecture/browse-route-evidence-manifest.md` | 2026-08-23 d3f2c97684 | KEEP | Observation: dated Phase 0B routing baseline and listed owners exist; no claim of implemented Explore/You migration. Sample reference at line 35: `src/routes/watch/[...path]/+page.ts` exists. |
| `docs/architecture/canonical-capabilities.md` | 2026-10-13 e6133c497b | UPDATE | Observation: Crossfade row points to removed local component; 30-owner sample below checks register reachability. Sample reference at line 9: `src/lib/shared/background/shared/background-canvas-resolution.ts` exists. |
| `docs/architecture/canonical-learning-experience.md` | 2026-10-12 f509ece610 | UPDATE | Observation: latest product amendment survives; convergence-note link is relative to the wrong directory. Sample reference at line 32: `src/lib/shared/guide-topics/grid-topic.ts` exists. |
| `docs/architecture/celestial-sky-citadel.md` | 2026-09-08 f831597ccd | KEEP | Observation: authoring scripts/runtime model paths exist; dated measurements are artifact-specific, not a new benchmark. Sample reference at line 12: `scripts/build-celestial-citadel.py` exists. |
| `docs/architecture/contact-correct-evidence/keyframe-timeline-review.md` | 2026-09-21 14090594fc | KEEP | Observation: retained dated acceptance/review evidence for Grip Lab; source route exists and missing gates remain explicit. |
| `docs/architecture/contact-correct-performers-evidence.md` | 2026-09-21 fb2cb244dd | KEEP | Observation: contact lab remains an experiment; package.json still declares test:contact-lab-acceptance, not a full acceptance claim. |
| `docs/architecture/contact-correct-performers-implementation-review.md` | 2026-09-20 fdea1e41e9 | KEEP | Observation: unresolved physical acceptance remains explicit; later contact evidence does not certify discontinuity/skin-clearance acceptance. |
| `docs/architecture/contact-correct-performers-plan-review.md` | 2026-09-20 fdea1e41e9 | UPDATE | Observation: pending-only header omits subsequent implementation/review evidence. |
| `docs/architecture/contact-correct-performers.md` | 2026-09-20 fdea1e41e9 | UPDATE | Observation: pending plan is useful, but status should point to later implemented lab checkpoint. Sample reference at line 26: `src/lib/shared/3d/collision/upper-body-stance-planner.ts` exists. |
| `docs/architecture/crossfade-primitive.md` | 2026-10-12 ab7d5429c9 | UPDATE | Observation: Crossfade package migration is documented correctly; component-test reference resolves to a missing sibling. Sample reference at line 12: `src/lib/shared/components/DualSourceCrossfade.svelte` exists. |
| `docs/architecture/edit-history-shortcuts.md` | 2026-08-06 b053a648c2 | KEEP | Observation: register-edit-history-shortcuts.ts and native button selectors retain the described shared shortcut contract. Sample reference at line 29: `src/lib/shared/keyboard/domain/edit-history-shortcut-target.ts` exists. |
| `docs/architecture/escape-routing.md` | 2026-08-06 d81d2f332a | KEEP | Observation: ownership contract remains a current reference; no later reversal established. |
| `docs/architecture/film-director-research-canon.md` | 2026-09-04 cfdf1d071d | KEEP | Observation: source-indexed research separates adopted/prototype/shipped states; dated external findings remain historical evidence. Sample reference at line 77: `src/routes/test/film-director/_lib/director-camera-track.ts` exists. |
| `docs/architecture/firestore-cost-anatomy.md` | 2026-09-27 1ee8ab4e62 | KEEP | Observation: invoice/fix anatomy is a dated historical record with current rules pointer, not a current billing forecast. Sample reference at line 64: `scripts/fetch-feedback.js` exists. |
| `docs/architecture/guide-single-source.md` | 2026-09-15 48050b5010 | MERGE | Observation: July online end-state is superseded by October one-topic/three-view decision. Sample reference at line 35: `src/lib/features/learn/guide/GuideTab.svelte` exists. |
| `docs/architecture/history-archive.md` | 2026-09-05 41a2fea9c0 | KEEP | Observation: /history and archive-ledger/notation catalog presentation owners remain; historical scope explicitly avoids exhaustive/inventorship claims. |
| `docs/architecture/in-app-browser-path.md` | 2026-09-15 48050b5010 | ARCHIVE | Observation: file itself says SUPERSEDED 2026-07-22; old InAppBrowserPrompt path is absent. |
| `docs/architecture/landing-analytics-taxonomy.md` | 2026-09-28 8fd716728a | UPDATE | Observation: ready-to-implement status and eliminated-function assertions conflict with current analytics owner. Sample reference at line 24: `src/lib/shared/analytics/services/posthog.ts` exists. |
| `docs/architecture/layout-motion.md` | 2026-10-07 1af5941aab | UPDATE | Observation: motion owners remain; visual-verification link points at absent sibling. Sample reference at line 22: `src/lib/shared/transitions/transitions.ts` exists. |
| `docs/architecture/locomotion-research-canon.md` | 2026-09-24 d7f337004c | UPDATE | Observation: adopted-method ledger remains useful; leg geometry owner reference is absent. Sample reference at line 58: `src/lib/shared/3d/locomotion/destination-walk-plan.ts` exists. |
| `docs/architecture/loop-execution.md` | 2026-09-22 8e2070ea59 | KEEP | Observation: engine extension ownership agrees with complete-loop-extension.ts and replaces older app-executor migration proposals. |
| `docs/architecture/performer-contact-review.md` | 2026-09-27 6c615a0a84 | KEEP | Observation: dated measurements, landed early steps and remaining physical/contact plan remain explicit; no broad acceptance claimed. Sample reference at line 260: `packages/` exists. |
| `docs/architecture/performer-grid-styles.md` | 2026-10-10 0221d35856 | UPDATE | Observation: header says steps 2–6 not started while step 5 is documented and defined in code. Sample reference at line 28: `src/lib/shared/3d/domain/performer-reach-measurements.ts` exists. |
| `docs/architecture/procedural-engine.md` | 2026-08-25 8d84df820c | UPDATE | Observation: shared engine survives; archive consumer and realm directory are retired. Sample reference at line 3: `src/lib/shared/3d/procedural-engine/` exists. |
| `docs/architecture/product-analytics-coverage.md` | 2026-09-01 a50a7b01b9 | KEEP | Observation: September 1 dated coverage ledger, not a live census; canonical posthog.ts path exists. Sample reference at line 4: `src/lib/shared/analytics/services/posthog.ts` exists. |
| `docs/architecture/release-module-gate.md` | 2026-07-23 e78fb78465 | KEEP | Observation: scripts/lib/release-module-gate.mjs and matching unit test remain; visibility filtering is a current contract. Sample reference at line 6: `scripts/lib/release-module-gate.mjs` exists. |
| `docs/architecture/responsive-design.md` | 2026-09-24 23cfcb016a | KEEP | Observation: current token/geometry separation agrees with modal-tokens.css and named composition owners. Sample reference at line 20: `src/app.css` exists. |
| `docs/architecture/save-paths.md` | 2026-03-10 3e772c03f8 | UPDATE | Observation: independent-UI-write claim and container language contradict actual library save service. |
| `docs/architecture/save-shortcut.md` | 2026-08-06 4094b41473 | KEEP | Observation: save-shortcut-target.ts still selects button[data-save-shortcut]; user-visible action remains the shared shortcut target. Sample reference at line 28: `src/lib/shared/keyboard/domain/save-shortcut-target.ts` exists. |
| `docs/architecture/scene-boot-cost.md` | 2026-09-04 e4d8f36451 | UPDATE | Observation: retained dated measurements remain useful; closing memory/rule links are broken. Sample reference at line 24: `src/lib/shared/3d/scene-boot/boot-profiler.ts` exists. |
| `docs/architecture/scene-design-brief.md` | 2026-09-05 b4709be04e | KEEP | Observation: accepted shared scene brief remains directly routed by AGENTS.md; no contradictory new approval requirement established. |
| `docs/architecture/SEQUENCE-COMPARISON-ENGINE.md` | 2026-09-15 48050b5010 | KEEP | Observation: explicitly architectural design; src/lib/shared/comparison/services/types.ts exists and placementSimilarity remains a documented implementation field. |
| `docs/architecture/sequence-viewer-shell.md` | 2026-09-01 e0e5f4ce06 | KEEP | Observation: current shared sequence viewer shell and /sequence route owners exist; host-specific contract remains distinct from old /q rendering. |
| `docs/architecture/sharing-export-experience.md` | 2026-09-27 51c6225f15 | KEEP | Observation: research/decision boundary is explicit and current share sheet/service owners exist. Sample reference at line 228: `src/lib/shared/share/components/PostShareSheet.svelte` exists. |
| `docs/architecture/tunnel-looks.md` | 2026-09-05 81988ebb90 | UPDATE | Observation: primitive decision survives; seven closing guidance references resolve to the wrong directory. Sample reference at line 125: `src/routes/test/tunnel-looks/` exists. |
| `docs/architecture/url-state.md` | 2026-08-08 4f10027aba | KEEP | Observation: URL parameter ownership remains current and distinguishes path/query/persisted channels. |
| `docs/architecture/visual-design-canon.md` | 2026-10-12 ab7d5429c9 | KEEP | Observation: current design authority includes the October package-motion amendment and is routed by AGENTS.md. Sample reference at line 172: `packages/render-core` exists. |
| `docs/architecture/visual-review.md` | 2026-09-21 3254148430 | KEEP | Observation: current review contract states read-only scope and evidence limits; linked canon/verification references resolve. |

### docs/audits/

| File | Last change | Verdict | One-line reason |
| --- | --- | --- | --- |
| `docs/audits/2026-07-16-public-pages-audit.md` | 2026-07-16 ab5e456ee4 | KEEP | Observation: Level 2 diagrams/guide content actions remain in report; later route/layout changes require reconciliation before any fix. |
| `docs/audits/2026-07-19-assemble-tab-audit.md` | 2026-09-27 45031e43b5 | KEEP | Observation: data-model seam/C1–C3 findings are dated but not individually closed here; September update does not establish all actions done. Sample reference at line 3: `src/lib/features/assemble-lab` exists. |
| `docs/audits/2026-08-16-repo-janitor-cruft-audit.md` | 2026-08-16 cec63a45ee | ARCHIVE | Observation: August filesystem/knip census is superseded by September inventories and this review; never treat its deletion suggestions as current authorization. |
| `docs/audits/2026-09-05-cruft-sweep-judgment-queue.md` | 2026-09-05 fd561f6d51 | KEEP | Observation: queue explicitly needs product rulings on sync/video/merch owner islands; no current retirement decision established. Sample reference at line 3: `src/lib` exists. |
| `docs/audits/2026-09-05-scripts-inventory.md` | 2026-09-05 f0c24c4e9b | ARCHIVE | Observation: dated 898-script census includes deliberately deleted Tier A entries and many now-absent paths; current package.json is execution authority. |

### docs/design/

| File | Last change | Verdict | One-line reason |
| --- | --- | --- | --- |
| `docs/design/visual-calibration/round-01/round.md` | 2026-09-21 a528db25f6 | KEEP | Observation: calibration study explicitly lacks complete acceptance/owner preference; unresolved calibration must not be archived as finished. |
| `docs/design/visual-calibration/round-02/brief.md` | 2026-09-21 7ddb38b712 | KEEP | Observation: calibration study explicitly lacks complete acceptance/owner preference; unresolved calibration must not be archived as finished. Sample reference at line 99: `src/routes/(public)/about/+page.svelte` exists. |
| `docs/design/visual-calibration/round-02/record.md` | 2026-09-21 7ddb38b712 | KEEP | Observation: calibration study explicitly lacks complete acceptance/owner preference; unresolved calibration must not be archived as finished. |

### docs/development/

| File | Last change | Verdict | One-line reason |
| --- | --- | --- | --- |
| `docs/development/phone-review.md` | 2026-09-13 db69c1d9e5 | KEEP | Observation: developer runbook names current route/scripts and scoped local bridge behavior; no external mutation or server startup executed. |
| `docs/development/post-studio-manifest-bridge.md` | 2026-10-11 dc80268d85 | KEEP | Observation: developer runbook names current route/scripts and scoped local bridge behavior; no external mutation or server startup executed. Sample reference at line 113: `scripts/feature-video/music-import.mjs` exists. |

### docs/diagnostics/

| File | Last change | Verdict | One-line reason |
| --- | --- | --- | --- |
| `docs/diagnostics/2026-09-09-pictograph-color-parity.md` | 2026-09-09 efae8a98e5 | ARCHIVE | Observation: September 9 correction/verification snapshot at efae8a98e5; current prop/color owners are source, not this old inventory. |
| `docs/diagnostics/2026-09-09-prop-render-audit.md` | 2026-09-09 60ddd3f910 | ARCHIVE | Observation: September 9 correction/verification snapshot at 60ddd3f910; current prop/color owners are source, not this old inventory. |
| `docs/diagnostics/2026-09-09-sidebar-prop-pair.md` | 2026-09-09 cdd657a92a | ARCHIVE | Observation: September 9 correction/verification snapshot at cdd657a92a; current prop/color owners are source, not this old inventory. |

### docs/features/

| File | Last change | Verdict | One-line reason |
| --- | --- | --- | --- |
| `docs/features/deep-linking.md` | 2026-07-12 f3ec57857c | UPDATE | Observation: current URL ownership replaced the old utility/store and beat-based examples. |

### docs/flowkemon/

| File | Last change | Verdict | One-line reason |
| --- | --- | --- | --- |
| `docs/flowkemon/creatures/001-stavvy.md` | 2026-05-13 99aac022d0 | KEEP | Observation: fictional design entry agrees with matching numbered creature entry in creatures/roster.md; no Flowkemon implementation was found in src/packages, so runtime delivery is not established. |
| `docs/flowkemon/creatures/002-orbelle.md` | 2026-05-13 99aac022d0 | KEEP | Observation: fictional design entry agrees with matching numbered creature entry in creatures/roster.md; no Flowkemon implementation was found in src/packages, so runtime delivery is not established. |
| `docs/flowkemon/creatures/003-hoopla.md` | 2026-05-13 99aac022d0 | KEEP | Observation: fictional design entry agrees with matching numbered creature entry in creatures/roster.md; no Flowkemon implementation was found in src/packages, so runtime delivery is not established. |
| `docs/flowkemon/creatures/004-klubba.md` | 2026-05-13 99aac022d0 | KEEP | Observation: fictional design entry agrees with matching numbered creature entry in creatures/roster.md; no Flowkemon implementation was found in src/packages, so runtime delivery is not established. |
| `docs/flowkemon/creatures/005-flare.md` | 2026-05-13 99aac022d0 | KEEP | Observation: fictional design entry agrees with matching numbered creature entry in creatures/roster.md; no Flowkemon implementation was found in src/packages, so runtime delivery is not established. |
| `docs/flowkemon/creatures/006-levvi.md` | 2026-05-13 99aac022d0 | KEEP | Observation: fictional design entry agrees with matching numbered creature entry in creatures/roster.md; no Flowkemon implementation was found in src/packages, so runtime delivery is not established. |
| `docs/flowkemon/creatures/007-ropey.md` | 2026-05-13 99aac022d0 | KEEP | Observation: fictional design entry agrees with matching numbered creature entry in creatures/roster.md; no Flowkemon implementation was found in src/packages, so runtime delivery is not established. |
| `docs/flowkemon/creatures/008-diablo.md` | 2026-05-13 99aac022d0 | KEEP | Observation: fictional design entry agrees with matching numbered creature entry in creatures/roster.md; no Flowkemon implementation was found in src/packages, so runtime delivery is not established. |
| `docs/flowkemon/creatures/009-ribbini.md` | 2026-05-13 99aac022d0 | KEEP | Observation: fictional design entry agrees with matching numbered creature entry in creatures/roster.md; no Flowkemon implementation was found in src/packages, so runtime delivery is not established. |
| `docs/flowkemon/creatures/010-baton.md` | 2026-05-13 99aac022d0 | KEEP | Observation: fictional design entry agrees with matching numbered creature entry in creatures/roster.md; no Flowkemon implementation was found in src/packages, so runtime delivery is not established. |
| `docs/flowkemon/creatures/011-dragonstik.md` | 2026-05-13 99aac022d0 | KEEP | Observation: fictional design entry agrees with matching numbered creature entry in creatures/roster.md; no Flowkemon implementation was found in src/packages, so runtime delivery is not established. |
| `docs/flowkemon/creatures/012-buugen.md` | 2026-05-13 99aac022d0 | KEEP | Observation: fictional design entry agrees with matching numbered creature entry in creatures/roster.md; no Flowkemon implementation was found in src/packages, so runtime delivery is not established. |
| `docs/flowkemon/creatures/013-meteora.md` | 2026-05-13 99aac022d0 | KEEP | Observation: fictional design entry agrees with matching numbered creature entry in creatures/roster.md; no Flowkemon implementation was found in src/packages, so runtime delivery is not established. |
| `docs/flowkemon/creatures/014-crysta.md` | 2026-05-13 99aac022d0 | KEEP | Observation: fictional design entry agrees with matching numbered creature entry in creatures/roster.md; no Flowkemon implementation was found in src/packages, so runtime delivery is not established. |
| `docs/flowkemon/creatures/015-sabre.md` | 2026-05-13 99aac022d0 | KEEP | Observation: fictional design entry agrees with matching numbered creature entry in creatures/roster.md; no Flowkemon implementation was found in src/packages, so runtime delivery is not established. |
| `docs/flowkemon/creatures/016-chukka.md` | 2026-05-13 99aac022d0 | KEEP | Observation: fictional design entry agrees with matching numbered creature entry in creatures/roster.md; no Flowkemon implementation was found in src/packages, so runtime delivery is not established. |
| `docs/flowkemon/creatures/017-triadi.md` | 2026-05-13 99aac022d0 | KEEP | Observation: fictional design entry agrees with matching numbered creature entry in creatures/roster.md; no Flowkemon implementation was found in src/packages, so runtime delivery is not established. |
| `docs/flowkemon/creatures/018-cyrus.md` | 2026-05-13 99aac022d0 | KEEP | Observation: fictional design entry agrees with matching numbered creature entry in creatures/roster.md; no Flowkemon implementation was found in src/packages, so runtime delivery is not established. |
| `docs/flowkemon/creatures/019-fyr.md` | 2026-05-13 99aac022d0 | KEEP | Observation: fictional design entry agrees with matching numbered creature entry in creatures/roster.md; no Flowkemon implementation was found in src/packages, so runtime delivery is not established. |
| `docs/flowkemon/creatures/020-glowr.md` | 2026-05-13 99aac022d0 | KEEP | Observation: fictional design entry agrees with matching numbered creature entry in creatures/roster.md; no Flowkemon implementation was found in src/packages, so runtime delivery is not established. |
| `docs/flowkemon/creatures/021-puppetta.md` | 2026-05-13 99aac022d0 | KEEP | Observation: fictional design entry agrees with matching numbered creature entry in creatures/roster.md; no Flowkemon implementation was found in src/packages, so runtime delivery is not established. |
| `docs/flowkemon/creatures/022-oxbow.md` | 2026-05-13 99aac022d0 | KEEP | Observation: fictional design entry agrees with matching numbered creature entry in creatures/roster.md; no Flowkemon implementation was found in src/packages, so runtime delivery is not established. |
| `docs/flowkemon/creatures/023-whippa.md` | 2026-05-13 99aac022d0 | KEEP | Observation: fictional design entry agrees with matching numbered creature entry in creatures/roster.md; no Flowkemon implementation was found in src/packages, so runtime delivery is not established. |
| `docs/flowkemon/creatures/024-windja.md` | 2026-05-13 99aac022d0 | KEEP | Observation: fictional design entry agrees with matching numbered creature entry in creatures/roster.md; no Flowkemon implementation was found in src/packages, so runtime delivery is not established. |
| `docs/flowkemon/creatures/roster.md` | 2026-05-13 99aac022d0 | KEEP | Observation: fictional design entry agrees with 24-file creature inventory; no Flowkemon implementation was found in src/packages, so runtime delivery is not established. |

### docs/learn/

| File | Last change | Verdict | One-line reason |
| --- | --- | --- | --- |
| `docs/learn/concept-status.md` | 2026-09-08 96d17d8340 | UPDATE | Observation: tracker uses retired hand-positions identity and stale integration/lesson status. |
| `docs/learn/concepts-convergence-notes.md` | 2026-09-04 a8c8ad0906 | MERGE | Observation: single-surface June scratchpad is superseded by canonical-learning-experience.md and October topic views. Sample reference at line 20: `src/lib/features/learn/components/interactive/GridConceptExperience.svelte` exists. |
| `docs/learn/copy-reviews/dual-shifts-alpha-beta.md` | 2026-09-04 00b978b7f5 | KEEP | Observation: retained copy-approval/evidence record; implemented or closed-gate status is explicit and does not grant new prose approval. |
| `docs/learn/copy-reviews/gamma-motion.md` | 2026-09-04 00b978b7f5 | KEEP | Observation: retained copy-approval/evidence record; implemented or closed-gate status is explicit and does not grant new prose approval. |
| `docs/learn/copy-reviews/grid.md` | 2026-09-03 aa121964be | KEEP | Observation: retained copy-approval/evidence record; implemented or closed-gate status is explicit and does not grant new prose approval. Sample reference at line 15: `src/lib/features/learn/domain/concepts.ts` exists. |
| `docs/learn/copy-reviews/hand-motions-intro.md` | 2026-10-12 e24e4d1202 | KEEP | Observation: retained copy-approval/evidence record; implemented or closed-gate status is explicit and does not grant new prose approval. Sample reference at line 29: `src/routes/(public)/guide/level-1/_pages/HandMotionsPage.svelte` exists. |
| `docs/learn/copy-reviews/hand-positions.md` | 2026-09-05 4cdabd648c | UPDATE | Observation: approval history remains valuable; current title/owner reference uses retired terminology/path. |
| `docs/learn/copy-reviews/letter-codex-intro.md` | 2026-09-04 00b978b7f5 | KEEP | Observation: retained copy-approval/evidence record; implemented or closed-gate status is explicit and does not grant new prose approval. |
| `docs/learn/copy-reviews/motion-paths.md` | 2026-09-27 1c68349e67 | KEEP | Observation: retained copy-approval/evidence record; implemented or closed-gate status is explicit and does not grant new prose approval. |
| `docs/learn/copy-reviews/words-alpha-beta.md` | 2026-09-04 00b978b7f5 | KEEP | Observation: retained copy-approval/evidence record; implemented or closed-gate status is explicit and does not grant new prose approval. Sample reference at line 81: `src/routes/(public)/guide/level-1/_data/content/words.content.ts` exists. |
| `docs/learn/hand-positions-ux-audit.md` | 2026-09-08 96d17d8340 | UPDATE | Observation: historical interaction evidence remains; hand-positions owner/identity has changed. |
| `docs/learn/interaction-research.md` | 2026-03-09 3c50b9062d | KEEP | Observation: dated learning-interaction research, not a current neuroscience efficacy certification. |
| `docs/learn/teacher-brief.md` | 2026-09-08 96d17d8340 | KEEP | Observation: retrieval index explicitly defers current facts/approval to registry and later user direction; does not certify a lesson. |
| `docs/learn/teacher-pilot.md` | 2026-09-14 9296d471b0 | UPDATE | Observation: pilot table presents a September pending merge as current delivery state. |

### docs/museum/

| File | Last change | Verdict | One-line reason |
| --- | --- | --- | --- |
| `docs/museum/devlog/2026-01-27-creation-session.md` | 2026-09-27 1ee8ab4e62 | KEEP | Observation: preserved creative/research source, not proof of a completed runtime; museum product scope remains Austen's decision. |
| `docs/museum/museum-layout.md` | 2026-03-06 22a471021a | ARCHIVE | Observation: opening explicitly retires Wing 1–8/Austen Wing/three-door endings and keeps this only as spatial history. |
| `docs/museum/plaques/lascaux-tablets.md` | 2026-01-27 e5942e6d99 | UPDATE | Observation: plaque text is creative source; Wing 1 location belongs to the retired numbered layout. |
| `docs/museum/README.md` | 2026-09-27 6d3c98ed1e | UPDATE | Observation: declared source-of-truth and two supporting links are absent. |
| `docs/museum/stanley-parable-reference.md` | 2026-03-04 1742a9be0e | KEEP | Observation: dated source/design research; no claim that UE5 production or external learning plan is complete. |
| `docs/museum/story-audit-march-2026.md` | 2026-03-04 1742a9be0e | KEEP | Observation: dated narrative critique retains unresolved creative/Steam-scope questions; ratings are original judgments, not current measurements. |
| `docs/museum/tka-os/design.md` | 2026-01-27 e5942e6d99 | UPDATE | Observation: Wing 5 premise and routes are proposed, not an established current feature. |
| `docs/museum/v1-shippable-scope.md` | 2026-07-12 f3ec57857c | UPDATE | Observation: draft depends on absent story bible and disagrees with README's platform premise. Sample reference at line 23: `src/routes/1989` exists. |
| `docs/museum/vertical-slice-research.md` | 2026-03-09 3c50b9062d | KEEP | Observation: dated source/design research; no claim that UE5 production or external learning plan is complete. |
| `docs/museum/vessels.md` | 2026-03-06 22a471021a | KEEP | Observation: already states Vessel reincarnation retired and figures are Scribes; agrees with README's retirement account. |
| `docs/museum/vtg-wing.md` | 2026-01-27 e5942e6d99 | UPDATE | Observation: still useful attribution intent; named-wing placement belongs to retired museum layout. |
| `docs/museum/water-exhibit-archive/INDEX.md` | 2026-08-11 cb7ec92150 | KEEP | Observation: requested retained failure/attempt archive; rejected grayboxes are labelled, so no claim of current visual acceptance. |

### docs/performance/

| File | Last change | Verdict | One-line reason |
| --- | --- | --- | --- |
| `docs/performance/2026-09-08-construct-pass-3.md` | 2026-09-08 52c1336306 | ARCHIVE | Observation: dated implementation/measurement snapshot; October vendor split is the later startup result, not a current performance guarantee. |
| `docs/performance/2026-09-08-startup-audit.md` | 2026-09-15 48050b5010 | ARCHIVE | Observation: dated implementation/measurement snapshot; October vendor split is the later startup result, not a current performance guarantee. |
| `docs/performance/2026-09-08-startup-pass-2.md` | 2026-09-08 c14599f3a0 | ARCHIVE | Observation: dated implementation/measurement snapshot; October vendor split is the later startup result, not a current performance guarantee. |
| `docs/performance/2026-09-13-startup-boot-graph.md` | 2026-10-07 a3c19102ea | ARCHIVE | Observation: dated implementation/measurement snapshot; October vendor split is the later startup result, not a current performance guarantee. |
| `docs/performance/2026-10-07-create-dev-startup.md` | 2026-10-07 5489133fbc | ARCHIVE | Observation: completed method-chooser lazy-load report; CreateModule remains code authority and current measurements require a fresh run. |
| `docs/performance/2026-10-07-vendor-chunk-split.md` | 2026-10-07 a3c19102ea | KEEP | Observation: latest chunk-repair evidence still records unfinished throttled readiness (107 pending scripts median); no refreshed benchmark established. |

### docs/reference/

| File | Last change | Verdict | One-line reason |
| --- | --- | --- | --- |
| `docs/reference/2026-09-25-worktree-consolidation.md` | 2026-09-25 b38fdf935c | ARCHIVE | Observation: dated local integration inventory; completed recoveries are recorded in its Results and b38fdf935c. |
| `docs/reference/agent-browser-profile.md` | 2026-08-28 dd7ec7836e | KEEP | Observation: agent-owned identity/session boundaries remain consistent with AGENTS.md; no personal-browser substitution implied. |
| `docs/reference/ai-writing-guide.md` | 2026-09-13 f8e32d41e2 | KEEP | Observation: Flow Arts Composer/TKA naming and prose rules agree with current AGENTS.md and package.json. |
| `docs/reference/archive/qft-notation/README.md` | 2026-09-27 1ee8ab4e62 | UPDATE | Observation: attribution/source archive remains useful; catalog-design pointer moved to archived specs. |
| `docs/reference/ascii-rendering-techniques.md` | 2026-03-04 b1b3066513 | KEEP | Observation: renderer technique reference, not a live benchmark or delivery claim; source renderer symbols remain available. |
| `docs/reference/audit-rubric.md` | 2026-06-14 faf09b5939 | UPDATE | Observation: two evaluator/fixer paths are absent; styling pointer is ambiguous. Sample reference at line 9: `scripts/collect-evidence.cjs` exists. |
| `docs/reference/autumn-meshy-image-prompts.md` | 2026-06-22 7afbf8d000 | ARCHIVE | Observation: June concept-generation exercise predates the current authored Autumn contract in docs/specs/2026-09-01-autumn-horizon-continuity.md. |
| `docs/reference/avatar-hand-retargeting.md` | 2026-09-01 64c6a25e6e | KEEP | Observation: reference-transform/grip contract remains useful and explicitly distinguishes bone naming from deformed contact proof. |
| `docs/reference/avatar-realism-audit-2026-08-16.md` | 2026-08-18 ae9cdeb82b | KEEP | Observation: historical realism findings retain physical-acceptance actions; later performer-contact-review.md supersedes measured baselines, not full acceptance. Sample reference at line 6: `src/lib/shared/3d/` exists. |
| `docs/reference/bridge-free-words.md` | 2026-02-25 1eba93749a | MERGE | Inference: dated word list overlaps the larger docs/reference/tka-valid-words.md; preserve unique family explanation in the latter. |
| `docs/reference/camera-framing-math.md` | 2026-05-23 e580b4153e | KEEP | Observation: geometric reference separates box/sphere assumptions; no contradictory current framing rule established. |
| `docs/reference/cloud-rendering-research.md` | 2026-05-21 41c1d1f16f | KEEP | Observation: May Canvas 2D cloud research, not a statement that runtime implements volumetric raymarching; retain as dated source material. |
| `docs/reference/component-testing.md` | 2026-06-29 24e94012f4 | UPDATE | Observation: worked-example path moved; fixed suite-size/E2E statement is obsolete. |
| `docs/reference/compositional-axes.md` | 2026-03-12 d536cf0d3f | KEEP | Observation: seven-axis conceptual model; no claim that each axis is a completed UI feature. |
| `docs/reference/desktop-offline-bundle.md` | 2026-09-02 9cc20cdfd2 | KEEP | Observation: bundle scripts and desktop data owners exist; asset completeness remains gated by named verification commands, not tested here. Sample reference at line 21: `scripts/desktop-asset-bundle.mjs` exists. |
| `docs/reference/error-boundaries.md` | 2026-10-10 a97b743f05 | KEEP | Observation: earned-boundary guidance remains consistent with AGENTS.md and current error handlers. |
| `docs/reference/facebook-login-e2e-checklist.md` | 2026-06-22 5d8d62b727 | KEEP | Observation: auth-providers.config.ts:12 still sets FACEBOOK_LOGIN_ENABLED=false; external setup/verification remains open. Sample reference at line 4: `src/lib/shared/auth/services/auth-providers.config.ts` exists. |
| `docs/reference/fan-letter-relations.md` | 2026-08-02 8790a6a88e | KEEP | Observation: source-preservation archive explicitly separates fan vocabulary from current TKA encoding limits. |
| `docs/reference/film-director-capability-matrix.md` | 2026-09-02 5233f0cbd8 | UPDATE | Observation: directives owner moved; current-matrix paths must be reconciled. Sample reference at line 31: `src/routes/test/film-director/_lib/resolve-film-director-spec.ts` exists. |
| `docs/reference/fish-ecosystem-research.md` | 2026-05-21 fbf4ca8448 | KEEP | Observation: dated biomechanics/model-source research, not current package/licensing clearance. |
| `docs/reference/float-float-naming-analysis.md` | 2026-09-05 e1e3ae91ac | ARCHIVE | Observation: file explicitly says RESOLVED 2026-04-18 and superseded by ADR 003. |
| `docs/reference/flow-arts-research-sources.md` | 2026-09-04 e9c55d747f | KEEP | Observation: source bibliography preserves February provenance and later provenance-ledger pointers; no live URL audit claimed. |
| `docs/reference/flow-arts-theory-ecosystem.md` | 2026-09-05 e1e3ae91ac | KEEP | Observation: attributed comparative research remains distinct from current implementation and later provenance ledgers. |
| `docs/reference/gated-pages-deploy.md` | 2026-08-04 2d73794110 | KEEP | Observation: web-ci.yml and gated deploy workflow exist; external dashboard state was not inspected. |
| `docs/reference/google-merchant-center-setup.md` | 2026-07-17 fa3fa3801b | UPDATE | Observation: shelved external task remains open; resume spec moved to backlog. Sample reference at line 155: `src/routes/+page.svelte` exists. |
| `docs/reference/halved-loop-type-compatibility.md` | 2026-05-27 125fc75b35 | KEEP | Observation: diamond-grid theorem is explicitly scoped; no contradiction with engine type/placement tables established. |
| `docs/reference/human-generator-license-finding.md` | 2026-09-03 31e76b1916 | KEEP | Observation: dated NO-SHIP finding is a retained licensing boundary; proportion-sweep output is explicitly gitignored/local-evaluation. Sample reference at line 104: `scripts/characters/proportion-sweep-spec.mjs` exists. |
| `docs/reference/ignis-protocol.md` | 2026-04-12 06dbb7474a | UPDATE | Observation: static wire research survives; adapter/proposal paths are stale. |
| `docs/reference/instagram-login-e2e-checklist.md` | 2026-08-09 4b6ae658ce | KEEP | Observation: auth-providers.config.ts:19 still sets INSTAGRAM_LOGIN_ENABLED=false; real Meta setup remains an uncompleted external gate. Sample reference at line 4: `src/lib/shared/auth/services/auth-providers.config.ts` exists. |
| `docs/reference/letter-gap-families.md` | 2026-09-23 195717d904 | KEEP | Observation: source-backed family synthesis remains scoped to canonical diamond/box data; historical sweep is not rerun. Sample reference at line 78: `scripts/combinator-research/letter-group.mjs` exists. |
| `docs/reference/meta-posting-e2e-checklist.md` | 2026-08-12 25646cd0bb | KEEP | Observation: meta-publish.ts exists; explicit external setup/live verification gates remain distinct from sign-in. Sample reference at line 15: `src/lib/shared/share/services/meta-publish.ts` exists. |
| `docs/reference/moonlight-client-setup.md` | 2026-08-04 ef4c4cf36a | UPDATE | Observation: historical machine runbook has a moved handoff pointer and cannot establish current host availability. |
| `docs/reference/negative-space-and-wall-plane-reach.md` | 2026-09-24 6c8caf09cb | UPDATE | Observation: retained domain interview has an outdated nothing-encoded-in-repository assertion. |
| `docs/reference/ocean-architecture-research-2026.md` | 2026-05-26 a8f9c38d71 | KEEP | Observation: dated architecture survey, not a claim every cited recommendation is adopted. |
| `docs/reference/ocean-scene-research.md` | 2026-05-20 a3ecd2d91c | KEEP | Observation: May scene reference collection remains research; external repo/link currency was not checked. |
| `docs/reference/ocean-seabed-research.md` | 2026-05-22 2c0a4f73b8 | KEEP | Observation: dated terrain technique survey; preserve its performance figures as source claims, not new measured budgets. |
| `docs/reference/offline-persistence-audit-2026-06-30.md` | 2026-07-01 19ef671717 | ARCHIVE | Observation: June baseline is superseded by corrected OFFLINE-FIRST-ARCHITECTURE.md and September offline-cache report; preserve provenance on move. |
| `docs/reference/order-fulfillment-runbook.md` | 2026-07-16 374d98ece5 | KEEP | Observation: scoped fulfillment test and releaser code exist; this review executes no order/purchase/remote mutation. Sample reference at line 38: `src/lib/features/store/domain/loop-config.ts` exists. |
| `docs/reference/physical-card-instrumentation.md` | 2026-09-23 1799b348aa | UPDATE | Observation: physical-card contract remains prospective; precursor spec moved to backlog. |
| `docs/reference/poi-legality.md` | 2026-07-30 1b13462a88 | UPDATE | Observation: retained partial-domain ledger has three moved spec/handoff links. Sample reference at line 47: `src/lib/features/levels/poi-lab/services/poi-constraint-validator.ts` exists. |
| `docs/reference/pronunciation-recording-guide.md` | 2026-07-19 58e2ed8f24 | KEEP | Observation: recording contract and all-human-or-speech fallback remain a scoped current reference; actual recorded media was not accessed. |
| `docs/reference/reversal-patterns.md` | 2026-05-27 a88d177ad1 | UPDATE | Observation: opening confuses two colored hands with two performers. |
| `docs/reference/scan-card-perf-budget.md` | 2026-08-01 8a0b1de5a3 | KEEP | Observation: explicit performance target plus dated samples; not a fresh current-device benchmark. |
| `docs/reference/scene-design-examples.md` | 2026-09-05 b4709be04e | KEEP | Observation: historical proof images explicitly dated/pinned to 1c90c9de64; no claim of current scene visuals. |
| `docs/reference/seo-content-roadmap.md` | 2026-07-09 6999d3e4af | UPDATE | Observation: notation-only-redirect claim and spec path are obsolete. |
| `docs/reference/seo-measurement-runbook.md` | 2026-07-22 3842f8f864 | KEEP | Observation: measurement scripts/package commands remain; experiment contract does not claim external access/setup is finished. |
| `docs/reference/seo-offpage-action-kit.md` | 2026-07-22 3842f8f864 | KEEP | Observation: proposed outreach kit retains current review-before-send boundary; no outreach completion inferred. |
| `docs/reference/seo-winning-strategy.md` | 2026-07-22 3842f8f864 | UPDATE | Observation: strategy remains useful; four design/plan links no longer resolve. |
| `docs/reference/sequence-generation-guide.md` | 2026-09-27 6d3c98ed1e | KEEP | Observation: canonical tool/bridge owner guidance remains current; no generation or external library mutation executed. |
| `docs/reference/skew-notation.md` | 2026-09-23 195717d904 | KEEP | Observation: source synthesis labels interpretation and later implementation; legacy desktop path is an external archive source, not a missing app owner. Sample reference at line 208: `src/lib/shared/pictograph/skew/skewed-frame-letter.ts` exists. |
| `docs/reference/styling-guide.md` | 2026-09-01 0428e32aa0 | KEEP | Observation: token hierarchy complements the current visual canon and responsive ownership; no later reversal established. Sample reference at line 38: `src/lib/shared/settings/utils/background-theme-calculator.ts` exists. |
| `docs/reference/tika-testing.md` | 2026-02-22 1da0bb6878 | UPDATE | Observation: test entrypoints exist but two reference owner/scenario paths are obsolete. Sample reference at line 27: `scripts/tika/reports/` exists. |
| `docs/reference/timing-direction-history.md` | 2026-09-08 e4f9df0f16 | KEEP | Observation: attributed historical-source dossier explicitly separates provenance from modern implementation. |
| `docs/reference/timing-direction-reference-audit.md` | 2026-09-05 d1b37cbb2c | ARCHIVE | Observation: September 5 local implementation audit; ongoing provenance authority is timing-direction-history.md and its dated follow-up. |
| `docs/reference/tka-valid-words.md` | 2026-05-27 0296dba12d | UPDATE | Observation: generated list is historical; terminology counts the start cell as a performed beat. |
| `docs/reference/tka-vtg-relationship.md` | 2026-09-08 e4f9df0f16 | KEEP | Observation: dated attributed comparison includes later provenance corrections; implementation and source claims remain labelled. |
| `docs/reference/visual-design-evidence.md` | 2026-09-21 3254148430 | KEEP | Observation: dated evidence ledger states research/calibration limits and points to current review contract. |
| `docs/reference/visual-review-calibration.md` | 2026-09-21 7ddb38b712 | KEEP | Observation: NOT CALIBRATED status agrees with round-02 record (owner preference not recorded); do not invent completed calibration. |
| `docs/reference/vtg-accuracy-audit.md` | 2026-03-17 9d45e46263 | MERGE | Inference: March issue list overlaps attribution/final audit; retain docs/reference/vtg-final-audit.md as the outcome record. Sample reference at line 4: `packages/vtg-domain/src/data/` exists. |
| `docs/reference/vtg-attribution-audit.md` | 2026-03-17 9d45e46263 | MERGE | Inference: March conditional issue record overlaps vtg-accuracy-audit.md and the final audit. Sample reference at line 4: `packages/vtg-domain/src/data/` exists. |
| `docs/reference/vtg-final-audit.md` | 2026-03-17 9d45e46263 | KEEP | Observation: final outcome separates elemental model/VTG and preserves source uncertainty; package data remains available. Sample reference at line 4: `packages/vtg-domain` exists. |
| `docs/reference/vtg-release-history.md` | 2026-09-08 7a777888c0 | KEEP | Observation: dated evidence dossier corrects never-published claim and separates documents/apps/announcements. |
| `docs/reference/wikidata-item-draft.md` | 2026-07-14 fed56d557d | KEEP | Observation: unsent external draft explicitly names notability constraints; publication/current Wikidata state unestablished. |
| `docs/reference/worktree-automerge.md` | 2026-08-31 a133ec1004 | UPDATE | Observation: no-preview-final-handoff assertion conflicts with current lifecycle contract. |

### docs/reports/

| File | Last change | Verdict | One-line reason |
| --- | --- | --- | --- |
| `docs/reports/2026-09-25-german-audit.md` | 2026-09-27 036688e9be | UPDATE | Observation: historical coverage snapshot survives; current catalog gap is 739 rather than audit-time 717. |
| `docs/reports/foldable-overlay-audit-2026-09-05.md` | 2026-09-15 48050b5010 | KEEP | Observation: remaining AdminTwoPanelLayout sizing, account-only overlays and physical Fold keyboard/touch checks are explicit; incomplete device gates are not finished actions. Sample reference at line 60: `src/routes/test/flow-fest-sim/FlowFestUtilityDrawer.svelte` exists. |
| `docs/reports/gallery-carousel-wrap-2026-09-12.md` | 2026-09-15 48050b5010 | KEEP | Observation: loop rail correction retains unverified short-card morph/rail orientations and uniform-duration preview; keep those actions visible. Sample reference at line 30: `src/lib/shared/browse/components/hover-preview/CardHoverPreviewLayer.svelte` exists. |
| `docs/reports/opus-batch-2026-09-12/accessibility-audit.md` | 2026-09-13 172e71a11a | KEEP | Observation: Remaining MotionColorChips browser-test/accessible-name gap and device validation; report distinguishes fixes from incomplete gates. Sample reference at line 61: `src/lib/shared/keyboard/domain/models/__tests__/keyboard-event-drawer-scope.test.ts` exists. |
| `docs/reports/opus-batch-2026-09-12/animation-clock-audit.md` | 2026-09-15 48050b5010 | UPDATE | Observation: C1 boundary-remainder defect is fixed in current controller; other follow-ups remain. Sample reference at line 26: `src/` exists. |
| `docs/reports/opus-batch-2026-09-12/audio-clock-lifecycle.md` | 2026-09-12 a4933a3762 | KEEP | Observation: Unfixed SoundPlayer assets/init/disposal and dead Record-tab/latency decisions; sound-player.ts still points at /sounds/pop.mp3. Sample reference at line 3: `src/lib/shared/audio` exists. |
| `docs/reports/opus-batch-2026-09-12/camera-resource-lifecycle.md` | 2026-09-13 a7be605256 | KEEP | Observation: Reported TrainModePanel camera/model ordering and grid-mode restart races still require mounted camera proof; retain reported-not-fixed section. Sample reference at line 49: `src/lib/shared/train/services/camera-manager.ts` exists. |
| `docs/reports/opus-batch-2026-09-12/collection-integrity.md` | 2026-09-13 32c61f1a23 | ARCHIVE | Observation: report records all ten reproduced defects fixed; its remaining reorder note is explicitly unused-code history, not a delivered-product action. |
| `docs/reports/opus-batch-2026-09-12/desktop-bridge-reliability.md` | 2026-09-13 ba416a6d46 | KEEP | Observation: Native OAuth listener lifetime/nonce/concurrency follow-ups remain unaccepted; no native/runtime verification performed here. Sample reference at line 18: `src/lib/shared/desktop/tauri-auth-bridge.ts` exists. |
| `docs/reports/opus-batch-2026-09-12/export-reliability.md` | 2026-09-13 5a4627feb1 | KEEP | Observation: Offscreen-init cleanup and encoder initialization/cancel UI follow-ups remain; old Compose export path needs owner reconciliation. Sample reference at line 3: `src/lib/shared/video-export` exists. |
| `docs/reports/opus-batch-2026-09-12/fire-prop-cleanup.md` | 2026-09-13 ac562134fe | KEEP | Observation: Bloom look defect remains a separate unfixed appearance action; renderer still defaults bloomStrength to 0.08. Sample reference at line 60: `src/lib/shared/animation-engine/domain/types/prop-tip-points.ts` exists. |
| `docs/reports/opus-batch-2026-09-12/firestore-cost.md` | 2026-09-13 1401e304ec | KEEP | Observation: Read-only H0–H4 fanout/listener findings remain unclosed; conversation-mappers.ts still refreshes absent usernames. Sample reference at line 472: `src/lib/shared/library/services/collection-manager.ts` exists. |
| `docs/reports/opus-batch-2026-09-12/fuse-correctness.md` | 2026-09-15 48050b5010 | KEEP | Observation: two fixes have browser proof, but report explicitly does not certify the pre-existing centric fallback/domain semantics. Sample reference at line 3: `src/lib/features/fuse` exists. |
| `docs/reports/opus-batch-2026-09-12/guest-save-isolation.md` | 2026-09-13 e52f46c900 | ARCHIVE | Observation: identity/write/side-effect fences are recorded fixed; rejected unscoped retry is not an unresolved action. |
| `docs/reports/opus-batch-2026-09-12/inbox-concurrency.md` | 2026-09-13 67e5c3829d | KEEP | Observation: Shared messaging H4 remains explicitly unfixed; conversation-mappers.ts:139–170 preserves undefined-username loop condition. Sample reference at line 3: `src/lib/shared/inbox` exists. |
| `docs/reports/opus-batch-2026-09-12/inverted-generation.md` | 2026-09-15 48050b5010 | KEEP | Observation: Length-4 composite feasibility and overlay-label domain decisions remain; do not infer acceptance from float-field correction. Sample reference at line 26: `src/lib/shared/create/services/loop-type-utils.ts` exists. |
| `docs/reports/opus-batch-2026-09-12/learn-progress-integrity.md` | 2026-09-13 cfb5e74a9e | KEEP | Observation: TIKA map write/denominator follow-ups remain; tika-progress-writer.ts:115 still builds concepts.${id} keys. Sample reference at line 4: `src/lib/features/learn` exists. |
| `docs/reports/opus-batch-2026-09-12/notification-state-integrity.md` | 2026-09-13 48c3396842 | KEEP | Observation: Permission-denied resubscription policy and unused notification-state owner need decisions; current occurrence is not production incidence proof. Sample reference at line 22: `src/lib/shared/notifications` exists. |
| `docs/reports/opus-batch-2026-09-12/offline-cache-reliability.md` | 2026-09-13 4efa5e76ed | KEEP | Observation: Build-stamped cache/SWR lifetime policy remains open; static/sw.js:6 still uses fixed tka-v3. Sample reference at line 21: `src/` exists. |
| `docs/reports/opus-batch-2026-09-12/persistence-roundtrip-audit.md` | 2026-09-15 48050b5010 | KEEP | Observation: P1–P6 are proposals, including createdAt semantics and legal turn range; sequence-data.ts retains birthday/createdAt declarations. Sample reference at line 60: `scripts/generate-loop-audit-fixtures.mjs` exists. |
| `docs/reports/opus-batch-2026-09-12/recording-session-integrity.md` | 2026-09-13 2a5a6ac189 | KEEP | Observation: Natural/cap finish notification, cached URL cleanup and recording-product behavior remain unfixed in report. Sample reference at line 3: `src/lib/shared/video-record` exists. |
| `docs/reports/opus-batch-2026-09-12/security-rules-audit.md` | 2026-09-13 93ce2995b9 | KEEP | Observation: F1–F6 need policy/remediation triage; 52 runtime probes explicitly unexecuted, so historical static checks are not deployed-policy proof. Sample reference at line 60: `scripts/update-rtdb-rules.mjs` exists. |
| `docs/reports/opus-batch-2026-09-12/sequence-engine-parity.md` | 2026-09-15 48050b5010 | ARCHIVE | Observation: September app-executor migration proposal is superseded by engine ownership/compatibility in docs/architecture/loop-execution.md (8e2070ea59). |
| `docs/reports/opus-batch-2026-09-12/server-input-validation-audit.md` | 2026-09-13 3f003f34d0 | KEEP | Observation: S2/S3 remain source-visible: withRateLimit.ts:58 uses pathname; qr-video PUT uses origin/rate limit without authentication. Sample reference at line 108: `src/hooks.server.ts` exists. |
| `docs/reports/opus-batch-2026-09-12/settings-sync-integrity.md` | 2026-09-13 50537411fd | KEEP | Observation: Reset-key removal, offline merge/drain and syncFromFirebase write-slot bypass follow-ups remain; no fresh live sync verification. Sample reference at line 21: `src/lib/shared/settings/state/settings-state.svelte.ts` exists. |
| `docs/reports/opus-batch-2026-09-12/shared-link-routing.md` | 2026-09-13 c191dfb343 | KEEP | Observation: Legacy mixed-case codes and null-versus-fetch-failure messaging remain product/owner decisions; same-route claim needs reconciliation. Sample reference at line 20: `src/lib/shared/navigation/services/sequence-encoder.ts` exists. |
| `docs/reports/opus-batch-2026-09-12/spec-reconciliation.md` | 2026-09-13 6341a71497 | KEEP | Observation: Fuse overflow/live-draft and scene rail visibility clauses need explicit supersession decisions; queue state must be re-read before implementation. Sample reference at line 38: `scripts/spec-drift-detector.cjs` exists. |
| `docs/reports/opus-batch-2026-09-12/startup-performance.md` | 2026-10-07 a3c19102ea | ARCHIVE | Observation: report itself names October 7 vendor-chunk-split.md as later implementation/measurements. |
| `docs/reports/opus-batch-2026-09-12/svg-asset-contract-audit.md` | 2026-09-15 48050b5010 | KEEP | Observation: F1–F7 art/loader/fallback proposals remain unclosed; retained .fails tests must be reconciled against current owners. Sample reference at line 25: `src/lib/shared/render/core/__tests__/prop-placement.test.ts` exists. |
| `docs/reports/opus-batch-2026-09-12/thumbnail-performance.md` | 2026-09-15 48050b5010 | KEEP | Observation: Static/cloud tier, IDB operations and sequence-load time bounds remain evidence-only; device/session telemetry remains open. Sample reference at line 28: `scripts/trim-deploy-assets.js` exists. |
| `docs/reports/opus-batch-2026-09-12/undo-redo-integrity.md` | 2026-09-15 48050b5010 | UPDATE | Observation: F1 async-extension phantom-history examples were corrected by the later September 28 pass; other actions need reconciliation. Sample reference at line 3: `src/lib/shared/history/command-stack.svelte.ts` exists. |
| `docs/reports/quick-viewer-prop-selection-mInuRET1U8F8LKscgRPy.md` | 2026-09-15 48050b5010 | KEEP | Observation: prop-refresh browser behavior remains unverified in report; Not merged is a September snapshot, not current branch status proof. Sample reference at line 29: `src/lib/features/create/shared/state/managers/prop-type-sync-manager.svelte.ts` exists. |
| `docs/reports/swarm-2026-10-14/docs-review.md` | 2026-10-14 (new ledger; no prior change) | KEEP | Observation: this dated review retains unresolved actions and proposed moves; it is the swarm's decision ledger. |
| `docs/reports/tunnel-performer-colors-2026-09-12.md` | 2026-09-12 1bf5d24886 | KEEP | Observation: shipping-route/export frame/viewport checks remain explicit; no current evidence establishes that final browser pass completed. Sample reference at line 26: `src/lib/shared/sequence-viewer/tunnel/tunnel-prop-colors.test.ts` exists. |
| `docs/reports/undo-coverage-2026-09-28.md` | 2026-09-29 b5d79af8f8 | KEEP | Observation: museum nonfixture history/unknown-room persistence action remains; remote collection scan Undo was not executed. |

### docs/research/

| File | Last change | Verdict | One-line reason |
| --- | --- | --- | --- |
| `docs/research/avatar-source-bakeoff-2026-08-28.md` | 2026-08-29 547bc421e3 | ARCHIVE | Observation: dated bake-off decision retained as history; character-playground.md explicitly replaces retired Avatar Bake Off. |
| `docs/research/caps-archive/MANIFEST.md` | 2026-07-19 98cf175e7a | UPDATE | Observation: attribution/licensing archive survives; notation destination spec moved to archived. |
| `docs/research/caps-archive/thread-transcript.md` | 2026-07-19 98cf175e7a | KEEP | Observation: retained dated research/fixture record; remote data and source claims were not independently re-executed. |
| `docs/research/character-playground.md` | 2026-09-13 27608ac1f2 | KEEP | Observation: current /test/character-playground route and generator controls exist; unavailable bakeoff assets are local-only/evaluation history. |
| `docs/research/formation-presets-research.md` | 2026-05-19 4ae4582b31 | KEEP | Observation: retained dated research/fixture record; remote data and source claims were not independently re-executed. |
| `docs/research/mpfb-proof-2026-09-08.md` | 2026-09-13 22b09dff2e | UPDATE | Observation: local evaluation record offers the retired bake-off URL as its principal entrypoint. Sample reference at line 28: `scripts/characters/verify-mpfb-materials.mjs` exists. |
| `docs/research/qr-reuse-verification.md` | 2026-09-08 61508eb499 | KEEP | Observation: dated verification retains four excluded legacy records/18 unresolved cell slots; remote readiness needs reconciliation, not assumed completion. Sample reference at line 46: `src/lib/features/library/services/warm-all-scan-cells.ts` exists. |
| `docs/research/spiroanim/bridge.md` | 2026-09-01 b4527e1363 | KEEP | Observation: src/router/index.ts and QUERY_STRING_FORMAT.md are expressly upstream SpiroAnim sources; absent FAC paths are not broken local owners. |
| `docs/research/spiroanim/kyle-v11-third-order-decode.md` | 2026-09-04 4deb68853d | KEEP | Observation: retained dated research/fixture record; remote data and source claims were not independently re-executed. |
| `docs/research/spiroanim/README.md` | 2026-09-15 48050b5010 | UPDATE | Observation: transcription artifacts remain; Eight Step and poi-legality links are ambiguous/broken. Sample reference at line 123: `scripts/transcribe-spiroanim-qst.ts` exists. |
| `docs/research/spiroanim/third-order-tip-tracing.md` | 2026-09-05 a9474d0dbc | KEEP | Observation: upstream thirdOrder.ts/Vue paths are explicitly SpiroAnim references; FAC shared world-trajectory owner remains separately named. Sample reference at line 52: `src/lib/shared/mandala` exists. |
| `docs/research/staff-turn-preparation-study.md` | 2026-09-13 1cf26d7bf5 | KEEP | Observation: offline study explicitly says no runtime planner adopted; preserve negative/result limits. |
| `docs/research/stage-locomotion-research.md` | 2026-08-28 d630bae3d4 | ARCHIVE | Observation: opening labels it historical survey and directs current decisions to locomotion-research-canon.md. |

### docs/specs/

| File | Last change | Verdict | One-line reason |
| --- | --- | --- | --- |
| `docs/specs/2026-04-16-notation-search-strategy.md` | 2026-09-15 48050b5010 | KEEP | Observation: explicitly PROPOSED search-mode design; current completion not established. |
| `docs/specs/2026-09-01-autumn-horizon-continuity.md` | 2026-09-28 6945385a3c | KEEP | Observation: current proof contract names existing authoring/runtime owners and distinguishes geometry from visual acceptance. Sample reference at line 16: `scripts/build-autumn-environment.py` exists. |
| `docs/specs/2026-09-13-generate-tutorial-video-spec.md` | 2026-09-13 dbc5566b6c | KEEP | Observation: wordless pilot modular plan retains deferred fixture/account policy; distinct from legacy spoken notation tutorials. Sample reference at line 20: `scripts/demo-capture/browser-director.mjs` exists. |
| `docs/specs/comment-noise-retirement.md` | 2026-08-27 da7f57660d | ARCHIVE | Observation: header and August results say implemented/verified at da7f57660d; historical April stripping-script proposal is not an open action. |
| `docs/specs/durable-message-delivery.md` | 2026-08-22 8df57e6821 | KEEP | Observation: messaging product promise and ownership remain useful; no silent-draft-loss acceptance inferred from tests alone. |
| `docs/specs/enterprise-ceremony-retirement.md` | 2026-05-29 28f3290a5d | UPDATE | Observation: May inventory/progress is historical and retains names removed by later refactors. Sample reference at line 374: `scripts/import-case-scan.cjs` exists. |
| `docs/specs/firestore-data-access-layer.md` | 2026-10-10 a97b743f05 | UPDATE | Observation: universal no-runtime-validation claim conflicts with current repository schema boundaries. Sample reference at line 60: `src/lib/shared/firestore/` exists. |
| `docs/specs/god-component-decomposition.md` | 2026-06-02 b1c5fd725b | UPDATE | Observation: measured target inventory has removed/moved component paths and an unresolved policy draft. Sample reference at line 52: `src/lib/shared/sequence-viewer/components/ChoreoCard.svelte` exists. |
| `docs/specs/naming-convention-enforcement.md` | 2026-05-03 85659b24ca | KEEP | Observation: draft explicitly dates its May filename/lint baseline; ongoing choices are not a claim the migration is complete. Sample reference at line 100: `src/lib/features/voice-sessions/` exists. |
| `docs/specs/studio-compose-consolidation.md` | 2026-10-10 33e6a69d45 | KEEP | Observation: October approved Studio brief/verification record with current Studio/Arrange owners; no later reversal established. |
| `docs/specs/studio-project-library.md` | 2026-10-10 12cdafc8af | KEEP | Observation: October approved Studio brief/verification record with current Studio/Arrange owners; no later reversal established. |
| `docs/specs/tka-village-expansion-spec.md` | 2026-04-06 9962ab9422 | KEEP | Observation: village engine/systems/LLM providers and tests exist; April proposal remains design intent, not proof every ranked feature shipped. |
| `docs/specs/tka-village-headless-spec.md` | 2026-04-06 9962ab9422 | KEEP | Observation: village engine/systems/LLM providers and tests exist; April proposal remains design intent, not proof every ranked feature shipped. |
| `docs/specs/tka-village-llm-spec.md` | 2026-04-06 681e09b21e | KEEP | Observation: village engine/systems/LLM providers and tests exist; April proposal remains design intent, not proof every ranked feature shipped. |
| `docs/specs/tka-village-visual-spec.md` | 2026-04-06 9962ab9422 | KEEP | Observation: village engine/systems/LLM providers and tests exist; April proposal remains design intent, not proof every ranked feature shipped. |

### docs/tutorial-video-voiceover/

| File | Last change | Verdict | One-line reason |
| --- | --- | --- | --- |
| `docs/tutorial-video-voiceover/Curriculum-Roadmap.md` | 2026-07-16 bce355c7bf | KEEP | Observation: footage-derived versus draft status is explicit; record/edit and embodied review remain open, distinct from wordless Generate demo. |
| `docs/tutorial-video-voiceover/HANDOFF.md` | 2026-07-16 dd0a498e79 | KEEP | Observation: SPEC.md/media workspace is expressly local-only on D:, not promised in-repo content; unfinished recording/editing remains explicit. |
| `docs/tutorial-video-voiceover/Voiceover-Scripts-Advanced.md` | 2026-07-16 dd0a498e79 | KEEP | Observation: footage-derived versus draft status is explicit; record/edit and embodied review remain open, distinct from wordless Generate demo. |
| `docs/tutorial-video-voiceover/Voiceover-Scripts-Next.md` | 2026-09-15 48050b5010 | KEEP | Observation: footage-derived versus draft status is explicit; record/edit and embodied review remain open, distinct from wordless Generate demo. |
| `docs/tutorial-video-voiceover/Voiceover-Scripts.md` | 2026-07-15 b5ae7e584a | KEEP | Observation: footage-derived versus draft status is explicit; record/edit and embodied review remain open, distinct from wordless Generate demo. |

## Canonical capability register: 30 spread entries

Observation: shorthand `shared/` and `features/` references were resolved under `src/lib/`, and `routes/` under `src/`. The 30 sampled entries span document lines 9–683: **29 owner paths exist, one does not**. Path existence checks ownership reachability, not behavior correctness. The extra route-relative `presentation-guardrails.md` reference is qualified separately below.

1. Line 9: `src/lib/shared/background/shared/background-canvas-resolution.ts` — PRESENT.
2. Line 17: `packages/sequence-engine/src/loop/execution/complete-loop-extension.ts` — PRESENT.
3. Line 29: `src/lib/shared/3d/performers/isolation-keyframes.ts` — PRESENT.
4. Line 54: `src/lib/shared/3d/collision/body-clearance.ts` — PRESENT.
5. Line 79: `src/lib/shared/share/components/PostShareSheet.svelte` — PRESENT.
6. Line 92: `src/lib/shared/share/services/post-handoff.ts` — PRESENT.
7. Line 109: `src/lib/shared/settings/components/tabs/prop-type/PropGrid.svelte` — PRESENT.
8. Line 135: `packages/render-composition/src/hand-colors.ts` — PRESENT.
9. Line 151: `packages/sequence-engine/src/generation/prop-relationship.ts` — PRESENT.
10. Line 156: `packages/render-core/src/calculations/grid-join-layout.ts` — PRESENT.
11. Line 166: `src/lib/shared/3d/services/grid-join-3d.ts` — PRESENT.
12. Line 202: `src/lib/shared/grid-join/join-slide.svelte.ts` — PRESENT.
13. Line 259: `src/lib/shared/shape-matrix/app/components/TurnNotationControls.svelte` — PRESENT.
14. Line 271: `src/lib/shared/ui/components/LabeledColorPairPicker.svelte` — PRESENT.
15. Line 279: `src/lib/shared/3d/components/Viewer3DFullscreen.svelte` — PRESENT.
16. Line 317: `src/lib/shared/transitions/results-morph.ts` — PRESENT.
17. Line 336: `src/lib/features/create/construct/start-placement-picker/services/start-placement-morph.ts` — PRESENT.
18. Line 368: `src/lib/shared/post-studio-plugin/` — PRESENT.
19. Line 388: `src/lib/shared/timeline/TimeRuler.svelte` — PRESENT.
20. Line 400: `scripts/post-project.mjs` — PRESENT.
21. Line 428: `scripts/feature-video/music-import.mjs` — PRESENT.
22. Line 446: `src/lib/shared/post-studio-plugin/item-kinds.ts` — PRESENT.
23. Line 467: `src/lib/shared/transitions/ws-ease.ts` — PRESENT.
24. Line 567: `src/lib/shared/3d/worker-renderer/` — PRESENT.
25. Line 572: `src/lib/shared/components/Crossfade.svelte` — MISSING; Crossfade is now re-exported by src/lib/shared/transitions/motion.ts from @austencloud/motion.
26. Line 578: `packages/render-composition/src/sequence-card-pipeline.ts` — PRESENT.
27. Line 591: `src/lib/shared/3d/locomotion/destination-walk-plan.ts` — PRESENT.
28. Line 606: `src/routes/(public)/composer/_glide/` — PRESENT.
29. Line 639: `src/lib/shared/auth/loaded-auth.ts` — PRESENT.
30. Line 683: `src/lib/shared/transitions/build-sequence.ts` — PRESENT.

Observation: line 606's owner directory `src/routes/(public)/composer/_glide/` exists. Its prose says “that route's presentation-guardrails.md”; the actual file is `src/routes/(public)/composer/presentation-guardrails.md`. Treat the failed architecture-relative lookup as an ambiguous reference, not a second removed capability. The confirmed removed owner is Crossfade, backed by `6de7881545` (2026-10-12).

## Specific UPDATE and MERGE proposals

### docs/adr/001-json-based-i18n.md — UPDATE

Observation: accepted JSON decision remains, but future-considerations claims have been overtaken.

- Proposal: Future Considerations says locale fallback chains are unimplemented and all locales complete. i18n.svelte.ts:150–158 and 355–378 implement regional→base→English fallback. Current English/German difference is 739 keys; complete translation coverage is false.
- Proposal: Retain the accepted JSON architecture and historical benchmark table. Mark the 1,398-key count as historical (currently 9,590 English keys). The recorded decision date 2025-01-15 differs from first available 2026 history; actual decision date remains unestablished, so do not silently change it.

### docs/adr/003-level-1-base-float-classification.md — UPDATE

Observation: accepted prefloat rule survives; four owner paths are stale.

- Proposal: Line 76 TurnManager.ts → src/lib/features/create/generate/shared/services/turn-manager.ts (setTurns, line 38); line 77 TurnsHandler.ts → src/lib/features/create/shared/services/step-operations/turns-handler.ts (updateStepTurns, line 41).
- Proposal: Line 78 TurnPatternManager.ts → src/lib/shared/create/services/turn-pattern-manager.ts; line 98 TurnColorInterpreter.ts → src/lib/shared/pictograph/tka-glyph/services/turn-color-interpreter.ts (interpretTurnColors, line 75). The named feedback_level1_base_float_classification.md is not beside this ADR; identify its intended source before adding a link.

### docs/architecture/canonical-capabilities.md — UPDATE

Observation: Crossfade row points to removed local component; 30-owner sample below checks register reachability.

- Proposal: Line 572 names shared/components/Crossfade.svelte. It is absent after 6de7881545 (2026-10-12, refactor(motion): the Composer's owners come from @austencloud/motion). src/lib/shared/transitions/motion.ts:15–25 re-exports Crossfade from that package; update the register to this app-facing owner.
- Proposal: Line 606's presentation-guardrails.md is explicitly that route's document. It exists at src/routes/(public)/composer/presentation-guardrails.md; qualify the path to avoid a false docs/architecture-relative lookup. This is path clarity, not removed capability.

### docs/architecture/canonical-learning-experience.md — UPDATE

Observation: latest product amendment survives; convergence-note link is relative to the wrong directory.

- Proposal: Line 88 links concepts-convergence-notes.md relative to docs/architecture; actual file is docs/learn/concepts-convergence-notes.md. Fix the destination, preserving the October 10 amendment recorded by d10b836adf.
- Proposal: The current experience registry uses hand-placements, with merge-learning-progress.ts retaining a legacy hand-positions alias. Any references intended as current lesson IDs should follow the registry; earlier terminology remains historical.

### docs/architecture/contact-correct-performers-plan-review.md — UPDATE

Observation: pending-only header omits subsequent implementation/review evidence.

- Proposal: Opening says disposition is pending plan revision. docs/architecture/contact-correct-performers-implementation-review.md records a later implemented candidate and rejection; contact-correct-performers-evidence.md records the September 21 experiment. Add a dated disposition/link to those records, retaining original blockers as history. Do not replace it with accepted/shipped.

### docs/architecture/contact-correct-performers.md — UPDATE

Observation: pending plan is useful, but status should point to later implemented lab checkpoint.

- Proposal: Opening architecture-and-plan status omits September 21 implementation evidence. Link contact-correct-performers-evidence.md and the implementation review; preserve physical acceptance as incomplete. Existing code in src/routes/test/grip-lab does not by itself approve production contact behavior.

### docs/architecture/crossfade-primitive.md — UPDATE

Observation: Crossfade package migration is documented correctly; component-test reference resolves to a missing sibling.

- Proposal: Line 125 links component-test-discipline.md under docs/architecture, where it does not exist. Current guidance is .claude/rules/component-test-discipline.md; docs/reference/component-testing.md is the how-to. Do not restore the removed local Crossfade component—the opening already uses #lib/shared/transitions/motion.js.

### docs/architecture/guide-single-source.md — MERGE

Observation: July online end-state is superseded by October one-topic/three-view decision.

- Proposal: Survivor: docs/architecture/canonical-learning-experience.md. Preserve faithful print/PDF-source constraints and tracker provenance there; preserve the old plan as archived history.
- Proposal: Current text requires a faithful GuideReader sheet-to-reflow end state and eventual retirement of all _sections after parity. canonical-learning-experience.md records October 10 topic-owned Read/Learn/Play views and legacy-page coexistence. A generic deletion of _sections is not implied by that later decision; any remaining page migrations must be individually reconciled.

### docs/architecture/landing-analytics-taxonomy.md — UPDATE

Observation: ready-to-implement status and eliminated-function assertions conflict with current analytics owner.

- Proposal: Opening status is design, ready to implement. src/lib/shared/analytics/landing-events.ts implements typed wrappers and is the current owner, not absent src/routes/landing/landing-analytics.ts (lines 331/365). Reconcile event-by-event rather than declare the full design shipped.
- Proposal: Section 1 says trackDemoVisible/trackVideoPlay/trackBackgroundChange stay dead. All three are currently exported in landing-events.ts:102,133,139. Existence does not prove call-site reachability, but the documented eliminated-function claim needs an explicit disposition. Build now invokes scripts/upload-sourcemaps.js in package.json; the old proposed inline CLI chain is not the actual build command.

### docs/architecture/layout-motion.md — UPDATE

Observation: motion owners remain; visual-verification link points at absent sibling.

- Proposal: Line 100's visual-verification-mandatory.md is relative to docs/architecture; real contract is .claude/rules/visual-verification-mandatory.md. Current shared motion import owner is src/lib/shared/transitions/motion.ts, with primitives from @austencloud/motion.

### docs/architecture/locomotion-research-canon.md — UPDATE

Observation: adopted-method ledger remains useful; leg geometry owner reference is absent.

- Proposal: Line 81 names src/lib/services/leg-geometry.ts; this path is absent, and no same-basename replacement was found in src/packages. Identify the current scene-3d package geometry source or mark the historical path explicitly; do not invent a new owner.
- Proposal: Last verified header says 2026-08-28 while the document includes September 3 and September 6 shipped/measured entries. Clarify whether the header dates external research or the code contract; the current verification date was not established by this review.

### docs/architecture/performer-grid-styles.md — UPDATE

Observation: header says steps 2–6 not started while step 5 is documented and defined in code.

- Proposal: Lines 3–5 say only step 1 is done and steps 2–6 not started. Groundwork step 5 explicitly says Built on 2026-09-28; body-clearance.ts defines buildBodyClearanceTrack:758 and sampleBodyClearanceTrack:845. Header must report the lab-only implementation, with real stepping/production adoption still open.
- Proposal: Line 179's src/lib/config/formation-presets.ts is absent; current owner is src/lib/features/stage/state/formation-presets.ts. Keep its spacing rule labelled proposed until implemented.

### docs/architecture/procedural-engine.md — UPDATE

Observation: shared engine survives; archive consumer and realm directory are retired.

- Proposal: Line 29 lists src/lib/features/archive/ArchiveDestination.svelte, absent after 37cf8e7551 (2026-06-20, remove kinetic-archive module, redirect /archive to /museum). Remove it from current destination owners or label it historical.
- Proposal: Line 43 refers to features/realm/, which is absent. Preserve the shared procedural-engine ownership and current campground/hannons-camp/museum consumers rather than revive a destination from old naming.

### docs/architecture/save-paths.md — UPDATE

Observation: independent-UI-write claim and container language contradict actual library save service.

- Proposal: The text says LibrarySaveService writes through SequencePersister and never calls LibraryRepository. src/lib/features/library/services/library-save-service.ts:540 calls libraryRepository.saveSequenceWithMetadata(sequence, metadata). This is a load-bearing false boundary claim.
- Proposal: The cited create SequencePersister is a local workspace-state persistence owner, not the library Firestore writer described here. library-save-service.ts routes library saves through the repository. Replace container/IBrowseLoader account with current getter and IPublicIndexSyncer wiring; src/lib/shared/library/services/create-lazy-public-index-syncer.ts is an existing adapter, not a recreated container.

### docs/architecture/scene-boot-cost.md — UPDATE

Observation: retained dated measurements remain useful; closing memory/rule links are broken.

- Proposal: Lines 354–355 reference missing docs/architecture/no-assumption-without-evidence.md and docs/architecture/memory/reference_scene_boot_cost_measured.md. The real rule is .claude/rules/no-assumption-without-evidence.md; the personal-memory source location is unestablished. The later worker amendment already distinguishes September main-thread measurements from worker timings.

### docs/architecture/tunnel-looks.md — UPDATE

Observation: primitive decision survives; seven closing guidance references resolve to the wrong directory.

- Proposal: Lines 87,129–131 reference chip-primitives.md, never-hand-roll.md, no-checkboxes.md, no-layout-shift.md, effects-earn-their-slot.md, visualization-routing.md as architecture siblings. These names exist under .claude/rules, not docs/architecture. Use explicit relative destinations to those rules; do not archive the primitive contract.

### docs/contributor-onboarding.md — UPDATE

Observation: install, domain, server and verification instructions predate the current contributor contract.

- Proposal: Lines 10–15 direct a contributor to npm install and tkascribe.com. package.json declares pnpm@10.28.0 and Flow Arts Composer; AGENTS.md reserves the primary checkout/server and requires task worktrees. Replace setup with the current pnpm/worktree lifecycle and tkaflowarts.com, after checking collaborator authentication separately.
- Proposal: Lines 154–156 suggest starting a server on 5174 and running the full check locally. Current AGENTS.md routes heavy gates through scripts/d2-run.ps1 and requires a resource-gated free-port preview. Port 5173 must be preserved.

### docs/DESTINATIONS-VISION.md — UPDATE

Observation: destination vision has no current implementation/status boundary and includes the retired endless-world destination.

- Proposal: Distinguish proposed Stage/Gallery experience from implemented capabilities. The realm directory no longer exists; docs/architecture/procedural-engine.md points at the current shared engine, and src/lib/features/stage/state/formation-presets.ts remains the Stage formation owner. Do not imply the Endless World is a currently shipped destination. Product decision needed on its continued scope.

### docs/features/deep-linking.md — UPDATE

Observation: current URL ownership replaced the old utility/store and beat-based examples.

- Proposal: Examples import $shared/navigation/utils and compare sequence.beats; current imports use #lib aliases, src/lib/shared/navigation/services/sequence-encoder.ts, and SequenceData.steps/startPosition.
- Proposal: Use docs/architecture/url-state.md and browse-route-evidence-manifest.md for current path/query ownership. The claim that the URL is always a complete up-to-date inline sequence must be scoped to actual UrlSyncer/encoder modes; modern /sequence and /q routes resolve identifiers and prepared artifacts separately.

### docs/FEEDBACK-WORKFLOW.md — UPDATE

Observation: command references at lines 446–447 no longer exist.

- Proposal: Replace .claude/commands/fb.md and .claude/commands/release.md with .agents/skills/fb/SKILL.md and .agents/skills/release/SKILL.md, after resolving exact destinations. The five-status explanation is historical workflow guidance, not evidence that every release follows the old batch process; scripts/fetch-feedback.js and scripts/release.js remain the code authorities.

### docs/I18N-IMPLEMENTATION.md — MERGE

Inference: practical usage duplicates docs/I18N-SYSTEM.md; retain the latter as the single guide.

- Proposal: Survivor: docs/I18N-SYSTEM.md. Move unique practical examples there, retain ADR 001 separately, then archive this duplicate after approval.
- Proposal: Line 18 says 1,398 keys; messages/en.json currently contains 9,590 top-level keys (Python json.load count). Line 86 names absent LanguageTab.svelte; current control is src/lib/shared/settings/components/tabs/preferences/LanguagePreference.svelte. Preserve the distinction between total keys and translation coverage.

### docs/I18N-SYSTEM.md — UPDATE

Observation: obsolete language-picker/CI paths and key totals conflict with current files.

- Proposal: Line 489 points at absent src/lib/shared/settings/components/tabs/LanguageTab.svelte; current picker is src/lib/shared/settings/components/tabs/preferences/LanguagePreference.svelte. Line 619 names absent .github/workflows/ci.yml; actual web workflow is .github/workflows/web-ci.yml.
- Proposal: Historical performance results and the January 2025 migration date cannot be independently reproduced from this review. Keep them explicitly historical; do not present 1,398 keys or complete locale coverage as current. Counts are en=9,590, de=8,862, English keys absent from German=739. Regional fallback exists in i18n.svelte.ts:150–158, 355–378.

### docs/learn/concept-status.md — UPDATE

Observation: tracker uses retired hand-positions identity and stale integration/lesson status.

- Proposal: The current experience registry has conceptId hand-placements and loads interactive/placements/PlacementsConceptExperience.svelte (registry:44–50); merge-learning-progress.ts maps legacy hand-positions to it. Rename current lesson ID/title in the tracker, preserving dated review notes.
- Proposal: Header says Last updated 2026-09-04 although rows include September 8 and October follow-ups elsewhere. Reconcile live availability/reviewStatus against concept-experience-registry.ts, especially hand-motions-intro rebuilt October 11–12; old Primary pending merge observations are snapshots, not current integration status.
- Proposal: git log -S hand-placements on registry returns 48050b5010, 2026-09-15, two-hand position→placement rename. Do not mark any built lesson confirmed without recorded Austen acceptance.

### docs/learn/concepts-convergence-notes.md — MERGE

Observation: single-surface June scratchpad is superseded by canonical-learning-experience.md and October topic views.

- Proposal: Survivor: docs/architecture/canonical-learning-experience.md. Preserve uniquely useful rejected interaction patterns and teaching rationale; retire the competing June end-state.
- Proposal: Line 141 references absent interactive/positions/PositionsConceptExperience.svelte. Current owner is interactive/placements/PlacementsConceptExperience.svelte, and the old pending quiz claim must be reconciled with that state before carrying it forward.

### docs/learn/copy-reviews/hand-positions.md — UPDATE

Observation: approval history remains valuable; current title/owner reference uses retired terminology/path.

- Proposal: Line 36 references absent src/routes/(public)/guide/level-1/_data/content/hand-positions.content.ts. Current lesson owner is src/lib/features/learn/components/interactive/placements/PlacementsConceptExperience.svelte; locate current topic prose separately.
- Proposal: Preserve September 5 approvals verbatim as history. Add a current-name/ID note: Hand Placements, hand-placements. The 1.2s progression remains defined by placement-experience-state.svelte.ts:24; prior explicit Next workflow is not the final interaction.

### docs/learn/hand-positions-ux-audit.md — UPDATE

Observation: historical interaction evidence remains; hand-positions owner/identity has changed.

- Proposal: Add a historical-title/current-owner note referencing hand-placements and interactive/placements/PlacementsConceptExperience.svelte. The current PLACEMENT_SUCCESS_HOLD_MS=1200 preserves the automatic-progression behavior; do not reintroduce manual-only practice from older sections.
- Proposal: Integration and hands-on-review states described in September remain dated observations, not proof they are currently blocked. The registry still marks the lesson built, not confirmed.

### docs/learn/teacher-pilot.md — UPDATE

Observation: pilot table presents a September pending merge as current delivery state.

- Proposal: Pilot row at line 76 says the September Hand Positions follow-up awaits integration and is not live. Current registry and placements owner contain that experience; the rename commit 48050b5010 followed the report. Qualify this as the September observation, link current availability, and leave correction counts/actual user acceptance unknown.
- Proposal: Do not infer that the teacher pilot measured an outcome just because a lesson landed. Opening No outcome has been measured remains the honest boundary.

### docs/LOOP-SYSTEM.md — UPDATE

Observation: opening expansion of LOOP is wrong in the current domain source.

- Proposal: Line 3 expands LOOP as Continuous Assembly Pattern. packages/sequence-engine/src/loop/loop-types.ts:2 and validation/LOOPValidator.ts:4 define Linked Orbital Offset Pattern. CAP and LOOP must stay distinct.
- Proposal: Future-work statement about specifying composition order must be reconciled with current engine LOOPSpec/execution ownership in docs/architecture/loop-execution.md; do not treat the old flat detection taxonomy as the execution contract.

### docs/MODAL_SIZING_STRATEGY.md — MERGE

Observation: January target architecture duplicates current responsive guidance and conflicts with modal tokens.

- Proposal: Survivor: docs/architecture/responsive-design.md, with implementation references to src/lib/shared/foundation/ui/modal/modal-tokens.css. Preserve only still-applicable content-first and viewport-safety rationale.
- Proposal: The ban on hardcoded max widths is not the current token contract: modal-tokens.css:22–27 defines 360px, 480px, 640px and bounded vw sizes. The example src/lib/shared/modals/utils/modal-layout.ts is absent; do not document its getLayoutMode helper as implemented.

### docs/museum/plaques/lascaux-tablets.md — UPDATE

Observation: plaque text is creative source; Wing 1 location belongs to the retired numbered layout.

- Proposal: Opening assigns the plaque to Wing 1. museum-layout.md:6 and README.md explicitly retire that numbered wing system. Preserve the exhibit text, label its spatial placement historical, and seek a current placement only after the missing story/layout authority is resolved.

### docs/museum/README.md — UPDATE

Observation: declared source-of-truth and two supporting links are absent.

- Proposal: story-bible.md, gift-shop.md and real-story.md are absent under docs/museum (lines 12–14,24,29–30). A lookup of tracked docs found no story-bible.md; the present repository cannot establish that source's location. Identify the actual story source before continuing lore production.
- Proposal: Engine line still asserts UE5/Steam plus TKA Scribe handoff, while the repo has src/lib/features/museum/MuseumModule.svelte and v1-shippable-scope.md proposes a text-only slice. Add an explicit current-vs-proposed product/platform decision; do not replace UE5 ambition with a claim it is cancelled.

### docs/museum/tka-os/design.md — UPDATE

Observation: Wing 5 premise and routes are proposed, not an established current feature.

- Proposal: Opening locates the CRT in retired Wing 5 and uses TKA Scribe as the present app. Add a historical/proposed boundary, retain intentionally retro fictional naming where needed, and use current product naming for real handoffs.
- Proposal: /retro or /tka-os is offered as a route choice near line 341. No matching current route was found in the route inventory; keep it a proposal rather than a promised destination.

### docs/museum/v1-shippable-scope.md — UPDATE

Observation: draft depends on absent story bible and disagrees with README's platform premise.

- Proposal: Line 5 makes absent docs/museum/story-bible.md the North Star/source of truth. Locate that source and record whether the text-only build order or README's UE5/Steam scope currently leads. No platform cancellation/adoption is established by this tree.

### docs/museum/vtg-wing.md — UPDATE

Observation: still useful attribution intent; named-wing placement belongs to retired museum layout.

- Proposal: README.md calls this partly superseded; museum-layout.md retires wing numbering. Keep the VTG acknowledgment/anti-misattribution requirements, but mark room/wing-specific production instructions historical pending current story placement.

### docs/reference/archive/qft-notation/README.md — UPDATE

Observation: attribution/source archive remains useful; catalog-design pointer moved to archived specs.

- Proposal: Opening references docs/superpowers/specs/2026-07-26-notation-catalog-design.md. Existing destination is docs/superpowers/specs/archived/2026-07-26-notation-catalog-design.md (rg --files). Retain the sourcing/uncertainty archive; a spec's archive location does not invalidate its quoted sources.

### docs/reference/audit-rubric.md — UPDATE

Observation: two evaluator/fixer paths are absent; styling pointer is ambiguous.

- Proposal: References .claude/agents/audit-evaluator.md and .claude/agents/audit-fixer.md do not resolve. No replacement agent files were established; route readers to the current workflow without claiming these agents still exist. The instructed audit/UI pipeline skills were not read.
- Proposal: Closing styling.md reference is not docs/reference/styling.md; docs/reference/styling-guide.md is the existing reference. Grade thresholds are policy choices, not proof of code quality; preserve them as historical rubric until the coordinator reconciles the current workflow.

### docs/reference/bridge-free-words.md — MERGE

Inference: dated word list overlaps the larger docs/reference/tka-valid-words.md; preserve unique family explanation in the latter.

- Proposal: Survivor: docs/reference/tka-valid-words.md. Retain the bridge-family explanation and corpus provenance; archive this smaller list only after reconciling word membership.
- Proposal: Both files call letter-count+1 the beat count, counting a start state as a beat. Current SequenceData represents startPosition separately from steps. Explain start cell versus performed steps instead of changing domain counts by inference. Lists are dated generated corpora, not current guarantees for every engine constraint.

### docs/reference/component-testing.md — UPDATE

Observation: worked-example path moved; fixed suite-size/E2E statement is obsolete.

- Proposal: Line 26 points to src/lib/shared/3d/components/controls/SegmentedControl.svelte.test.ts; current example is src/lib/shared/ui/components/SegmentedControl.svelte.test.ts.
- Proposal: The opening calls E2E not built yet and fixes the jsdom suite at 378 tests. package.json already declares test:e2e, tests/config/vitest.e2e.config.ts, and many more focused suites; describe the layers without a timeless count. Do not equate that Vitest/auth-emulator command with a proven whole-app Playwright suite.
- Proposal: Retain the component-suite nonblocking statement: web-ci.yml:254–255 still runs test:components:ci with continue-on-error. Point no-checkboxes.md to .claude/rules/no-checkboxes.md and component-test design to docs/superpowers/specs/shipped/2026-06-29-component-test-layer-design.md.

### docs/reference/film-director-capability-matrix.md — UPDATE

Observation: directives owner moved; current-matrix paths must be reconciled.

- Proposal: Line 30 names src/routes/test/film-director/_lib/directives.ts; current owner is src/lib/features/film-director/domain/directives.ts. Existing compatibility schema remains at src/routes/test/film-director/_lib/film-director-schema.ts; distinguish it from the moved domain owner.
- Proposal: Line 531 references src/lib/shared/3d/components/controls/PropPopover.svelte, absent with no exact-basename replacement found. Identify current prop workspace owner before offering the old control as reachable. The matrix is dated v4; this review does not certify all current speakable axes.

### docs/reference/google-merchant-center-setup.md — UPDATE

Observation: shelved external task remains open; resume spec moved to backlog.

- Proposal: Opening points to docs/superpowers/specs/2026-07-17-merchant-product-image-pipeline-design.md. Current destination is docs/superpowers/specs/backlog/2026-07-17-merchant-product-image-pipeline-design.md.
- Proposal: Do not turn SHELVED into completed from shop code alone. Merchant dashboard state and real product-image readiness were not accessed; Austen must decide whether to resume.

### docs/reference/ignis-protocol.md — UPDATE

Observation: static wire research survives; adapter/proposal paths are stale.

- Proposal: Line 8's implementations/OpenPixelPoiAdapter.ts moved to src/lib/features/poi/services/open-pixel-poi-adapter.ts. The proposed implementations/IgnisPixelAdapter.ts is absent; do not call it a delivered adapter. Wire-level capture remains explicitly pending.
- Proposal: Design now resides at docs/superpowers/specs/backlog/someday/2026-04-08-led-strip-pattern-engine-design.md, plan at docs/superpowers/plans/backlog/someday/2026-04-10-led-strip-pattern-engine.md.

### docs/reference/moonlight-client-setup.md — UPDATE

Observation: historical machine runbook has a moved handoff pointer and cannot establish current host availability.

- Proposal: Reference docs/superpowers/specs/2026-07-19-remote-4090-workstation-laptop-handoff.md is absent; the preserved record is docs/superpowers/handoffs/2026-07-19-remote-4090-workstation-laptop-handoff.md.
- Proposal: Keep commands as a dated setup record, not proof that machine addresses, credentials or installed software remain current. Those machine-specific facts were not inspected because the brief confines this worker to the worktree.

### docs/reference/negative-space-and-wall-plane-reach.md — UPDATE

Observation: retained domain interview has an outdated nothing-encoded-in-repository assertion.

- Proposal: Opening says nothing in the repository currently encodes it. canonical-capabilities.md and contact-correct-performers-evidence.md document isolation keyframes, Grip Lab teaching channels and relaxed grip inputs; current body-clearance.ts encodes a further body-offset experiment. Narrow the assertion to the still-open pocket/turn mapping, crossed-weave/depth rules and Level 3 maps. Preserve Austen's source quotations as historical primary evidence.

### docs/reference/physical-card-instrumentation.md — UPDATE

Observation: physical-card contract remains prospective; precursor spec moved to backlog.

- Proposal: Referenced docs/superpowers/specs/2026-07-27-official-card-production-ledger-design.md is absent. Current path is docs/superpowers/specs/backlog/2026-07-27-official-card-production-ledger-design.md. Keep precursor and full v1 status distinct; code existence is not evidence printed cards carry all v1 IDs.

### docs/reference/poi-legality.md — UPDATE

Observation: retained partial-domain ledger has three moved spec/handoff links.

- Proposal: Momentum handoff is now docs/superpowers/handoffs/2026-07-18-poi-momentum-simulator-brainstorm-handoff.md. Matrix and filtering specs now reside in docs/superpowers/specs/shipped/2026-07-19-poi-legal-matrix-design.md and shipped/2026-07-17-poi-legal-composer-filtering-design.md.
- Proposal: Preserve its uncertainty about dynamic transitions. docs/research/spiroanim/README.md adds a later measured transcription corpus; update the later-evidence pointer without asserting the corpus proves all transitions physically executable.

### docs/reference/reversal-patterns.md — UPDATE

Observation: opening confuses two colored hands with two performers.

- Proposal: Overview says TKA sequences describe two performers, one red and one blue. Current canonical sequence model has one performer with blue/left and red/right motions per step (packages/tka-types sequence/hand domain). Use two hands/props, while multi-performer choreography remains a separate stage composition.
- Proposal: Where tables say red/blue performer, replace the entity term consistently without changing reversal pattern mathematics. Any further domain corrections require canonical data, not model recall.

### docs/reference/seo-content-roadmap.md — UPDATE

Observation: notation-only-redirect claim and spec path are obsolete.

- Proposal: Opening says /notation is a 301 to /guide/level-1. Current src/routes/(public)/notation/+page.ts:12 redirects it to /history; individual /notation/* destination pages remain. The old +page.server.ts owner is absent. Update both the target and route-owner reference.
- Proposal: The SEO overhaul spec is now docs/superpowers/specs/shipped/2026-07-09-seo-overhaul-design.md. Bare tka-domain.md is not docs/reference/tka-domain.md; actual rule is .claude/rules/tka-domain.md. Keyword estimates remain July research, not validated current demand.

### docs/reference/seo-winning-strategy.md — UPDATE

Observation: strategy remains useful; four design/plan links no longer resolve.

- Proposal: Use docs/superpowers/specs/shipped/2026-07-16-flow-arts-software-seo-design.md and docs/superpowers/specs/audits/2026-07-16-seo-a-plus-plan.md instead of missing root/sibling paths. Preserve dated research assumptions and do not claim current ranking/AI citations.

### docs/reference/tika-testing.md — UPDATE

Observation: test entrypoints exist but two reference owner/scenario paths are obsolete.

- Proposal: src/lib/features/tika/services/implementations/TikaToolExecutor.ts moved to services/tika-tool-executor.ts. evaluation/scenarios/beginner-scenarios.ts is absent; point to the actual scenario sources discovered by the evaluation scripts rather than invent a replacement.
- Proposal: Retain package.json tika:evaluate/tika:opus and scripts/tika/test-run.mjs when present. A runnable HTTP example is not proof of current endpoint authentication or signed-in access.

### docs/reference/tka-valid-words.md — UPDATE

Observation: generated list is historical; terminology counts the start cell as a performed beat.

- Proposal: Opening defines beat count=letter count+1. Current sequence model separates startPosition from performed steps. State that the extra item is a displayed opening/start cell, and identify the exact generated corpus before treating 1,137 as current admissible words.
- Proposal: Keep generation date and list provenance. This static review did not regenerate the Google/dwyl word corpus or certify every word under current generator constraints.

### docs/reference/vtg-accuracy-audit.md — MERGE

Inference: March issue list overlaps attribution/final audit; retain docs/reference/vtg-final-audit.md as the outcome record.

- Proposal: Survivor: docs/reference/vtg-final-audit.md, retaining unique source citations/unresolved factual questions from this issue inventory. Both changed at 9d45e46263 on 2026-03-17; their early findings must not be treated as current defects after the final structural fix.

### docs/reference/vtg-attribution-audit.md — MERGE

Inference: March conditional issue record overlaps vtg-accuracy-audit.md and the final audit.

- Proposal: Survivor: docs/reference/vtg-final-audit.md. Preserve unique attribution citations and remaining uncertainties, then archive the duplicate initial-pass report. The final audit records separation of elemental model from VTG; do not revive the earlier conflation.

### docs/reference/worktree-automerge.md — UPDATE

Observation: no-preview-final-handoff assertion conflicts with current lifecycle contract.

- Proposal: Normal finish says a worktree preview is never the final handoff. Current AGENTS.md and .claude/rules/worktree-workflow.md expressly allow a verified live task-worktree preview when guarded integration is blocked. Update this absolute prohibition.
- Proposal: Keep the read-only diagnostic/retired batch-apply boundary. This swarm brief forbids this worker from running wt:finish or touching the primary checkout; that task exception does not rewrite the general lifecycle.

### docs/reports/2026-09-25-german-audit.md — UPDATE

Observation: historical coverage snapshot survives; current catalog gap is 739 rather than audit-time 717.

- Proposal: Known remaining gaps records 717 English keys without German at audit time. Preserve that dated fact and append current counts: en=9,590, de=8,862, English keys absent from German=739. A changed key count is coverage drift, not proof each missing key is reachable.
- Proposal: Guide prose, dependency accessibility wording and native-speaker review remain open. The @austencloud/sidebar 1.0.1 assertion is an audit-time package observation; this worker did not inspect/update installed packages through the shared node_modules junction.

### docs/reports/opus-batch-2026-09-12/animation-clock-audit.md — UPDATE

Observation: C1 boundary-remainder defect is fixed in current controller; other follow-ups remain.

- Proposal: C1 states every loop drops frame remainder. animation-playback-controller.ts:713–747 now computes boundaryOverrun and preserves it modulo loopBody. Focused loop-wrap-overrun.test.ts exists. Mark C1 superseded by the current owner/history rather than keep an open fix proposal.
- Proposal: C2 hidden-tab/lap policy, step-mode duration choice and seek/paused/start-blank findings still require individual reconciliation; this static check does not certify all eight findings closed.

### docs/reports/opus-batch-2026-09-12/undo-redo-integrity.md — UPDATE

Observation: F1 async-extension phantom-history examples were corrected by the later September 28 pass; other actions need reconciliation.

- Proposal: F1 lists appendBridge/applyLoop/applyOrientationRepeat as unconditional pre-await snapshot pushes. Current sequence-actions-orchestrator.ts:163–168,202–207,233–238 records snapshots within successful changed-result branches; undo-coverage-2026-09-28.md explicitly records failed/unchanged-operation fixes.
- Proposal: Link the later coverage report and mark those specific triggers superseded. Do not claim every F1 trigger or F4 editor-coverage item closed without tracing their own owners; museum nonfixture/unknown-room persistence actions remain in the later report.

### docs/research/caps-archive/MANIFEST.md — UPDATE

Observation: attribution/licensing archive survives; notation destination spec moved to archived.

- Proposal: Opening spec path is now docs/superpowers/specs/archived/2026-07-19-notation-caps-destination-design.md. Keep NOT CLEARED FOR PUBLICATION and attribution status; existence of downloaded images does not grant publication rights.

### docs/research/mpfb-proof-2026-09-08.md — UPDATE

Observation: local evaluation record offers the retired bake-off URL as its principal entrypoint.

- Proposal: Line 97 gives /test/avatar-bakeoff as the bake-off entry; character-playground.md states this route is retired/replaced and old links redirect. Link /test/character-playground with compatible candidate state, keeping the old URL only for historical reproduction.
- Proposal: Opening notes 2026-09-14 despite last Git change 2026-09-13. This review cannot establish whether the note date or commit clock is wrong; preserve the discrepancy explicitly rather than invent a corrected date. Local E:/3D-Models assets were not accessed.

### docs/research/spiroanim/README.md — UPDATE

Observation: transcription artifacts remain; Eight Step and poi-legality links are ambiguous/broken.

- Proposal: Line 22's docs/EIGHT_STEP.md is an upstream SpiroAnim document if so intended; qualify its upstream repository/revision rather than imply it exists under FAC docs.
- Proposal: Relative poi-legality.md links at lines 159/173 resolve to absent docs/research/spiroanim/poi-legality.md; local authority is docs/reference/poi-legality.md. Preserve corpus quantities as dated generated-artifact claims; do not equate letter resolution with physical legality.

### docs/RTL-MIGRATION.md — UPDATE

Observation: blanket locale flip claim omits public-page language pinning; CSS transform-origin example needs correction.

- Proposal: Opening says the entire interface automatically flips on every RTL selection. src/routes/+layout.svelte:230 pins public pages to siteCopyLocale(), and i18n.svelte.ts:184–205 implements pinned document language. Scope automatic RTL to unpinned application content.
- Proposal: The transform-origin: start top example is not a valid physical transform-origin value. Use a real left/right origin selected by [dir] (or an established project equivalent); logical spacing properties do not imply logical transform-origin keywords. Browser-support percentages are dated 2025 estimates, not verified current coverage.

### docs/specs/enterprise-ceremony-retirement.md — UPDATE

Observation: May inventory/progress is historical and retains names removed by later refactors.

- Proposal: Header and Not started section describe phases 5–6 as unstarted; git log for old library-save-service path records dbe27ec03a (2026-05-03, Phase 5b dissolve remaining class singletons), while current code mixes retained classes and function owners (e.g. turn-manager.ts and turns-handler.ts). This does not establish total completion, but the phase status needs reconciliation rather than a global not-started claim.
- Proposal: scripts/ceremony-audit.json is absent. Residual interface/class/file counts are May snapshots, not current counts; regenerate only in a separately authorized implementation audit and preserve measured date.

### docs/specs/firestore-data-access-layer.md — UPDATE

Observation: universal no-runtime-validation claim conflicts with current repository schema boundaries.

- Proposal: Problem says all 20 repositories cast raw data without runtime validation. src/lib/features/tika/services/tika-session-repository.ts imports domain/models/tika-session-schemas; current repository names also differ from the PascalCase inventory. Narrow this to measured unvalidated boundaries instead of asserting 20/20 today.
- Proposal: 3,130 optional chains and 20-repository counts are a May 3 baseline; no current causal proof establishes that boundary casts explain all optional chaining. Proposed src/lib/shared/firestore/ CRUD modules must stay labelled proposed, not current canonical owners.

### docs/specs/god-component-decomposition.md — UPDATE

Observation: measured target inventory has removed/moved component paths and an unresolved policy draft.

- Proposal: Line 53 UnifiedCameraController moved to packages/camera-3d/src/lib/components/UnifiedCameraController.svelte. Line 60 src/lib/features/loop-labeler/components/LOOPLabelerModule.svelte is absent; do not schedule decomposition of the old path.
- Proposal: never-hand-roll.md is a .claude/rules reference, not docs/specs sibling. Disease scores/line counts are dated June measurements; three bottom decisions are still proposals until ratified.

### docs/TIKA-IMPROVEMENT-ARCHITECTURE.md — UPDATE

Observation: January draft names a removed owner and three nonexistent npm scripts.

- Proposal: Replace src/lib/features/learn/tika/ with actual src/lib/features/tika/ ownership when describing existing code. Proposed new files must be labelled proposed.
- Proposal: package.json has tika:evaluate and tika:opus, but not tika:opus-review (line 299), tika:curate (312), or tika:analyze (324). Do not offer those workflow commands as runnable.
- Proposal: The Haiku-only runtime table is stale as implementation documentation. src/lib/features/tika/domain/tika-model-catalog.ts defines Haiku, Sonnet and DeepSeek options. Token cost numbers are January assumptions and were not validated against providers.

### docs/UNIFIED-SCALE-SYSTEM.md — UPDATE

Observation: meter-scale principle survives, but the claimed local scale owner is absent.

- Proposal: Line 11 calls src/lib/shared/3d-core/scale/scale-constants.ts the single source of truth; that path is absent. src/lib/shared/3d/physics/player-controller.ts:17 imports SCALE from @austencloud/scene-3d; packages/camera-3d/src/lib/constants.ts carries camera movement values.
- Proposal: The conversion table contains retired realm and 3d-core owners. Treat it as the January migration record, not a map of today's files. plane-transforms.ts:17–35 explicitly retains meter units and GRID_RADIUS_3D=0.52; do not infer that all current constants share one local file.

## Verification record

Observation: initial command `rg --files docs --glob "*.md" --glob "!docs/superpowers/**"` returned 261 inputs. Final count/coverage and whitespace results are recorded after execution below.

Observation: final verification passed with the exact commands and result lines below. The literal `rg` command includes this new ledger, so the inventory and disposition count are both 262 (261 original inputs + this ledger).

```powershell
rg --files docs --glob "*.md" --glob "!docs/superpowers/**" | Measure-Object -Line
# Lines: 262

@'
import re, subprocess
from collections import Counter
from pathlib import Path

ledger = Path("docs/reports/swarm-2026-10-14/docs-review.md")
result = subprocess.run(
    ["rg", "--files", "docs", "--glob", "*.md", "--glob", "!docs/superpowers/**"],
    capture_output=True, text=True, check=True,
)
files = [p.replace("\\", "/") for p in result.stdout.splitlines()]
body = ledger.read_text(encoding="utf-8")
pattern = r"^\| " + chr(96) + r"(docs/[^" + chr(96) + r"]+\.md)" + chr(96) + r" \| ([^|]+) \| (KEEP|UPDATE|ARCHIVE|MERGE) \|"
rows = re.findall(pattern, body, re.M)
paths = [row[0] for row in rows]
missing = sorted(set(files) - set(paths))
extra = sorted(set(paths) - set(files))
duplicates = sorted(p for p, n in Counter(paths).items() if n > 1)
detail_missing = [p for p, _, verdict in rows if verdict in ("UPDATE", "MERGE") and "### " + p + " — " + verdict not in body]
print("Inventory files:", len(files))
print("Disposition rows:", len(rows))
print("Missing:", len(missing), "Extra:", len(extra), "Duplicates:", len(duplicates))
print("UPDATE/MERGE sections missing:", len(detail_missing))
print("Verdicts:", dict(sorted(Counter(row[2] for row in rows).items())))
assert len(files) == len(rows) == 262
assert not (missing or extra or duplicates or detail_missing)
assert len(re.findall(r"^\d+\. Line \d+:", body, re.M)) == 30
assert "\r" not in body
print("PASS: inventory coverage, verdict sections, 30 register samples and line endings")
'@ | python -
```

```text
Inventory files: 262
Disposition rows: 262
Missing: 0 Extra: 0 Duplicates: 0
UPDATE/MERGE sections missing: 0
Verdicts: {'ARCHIVE': 26, 'KEEP': 171, 'MERGE': 7, 'UPDATE': 58}
PASS: inventory coverage, verdict sections, 30 register samples and line endings
```

Observation: the first staged whitespace check reported an extra blank line at EOF; it was removed. Final `git diff --cached --check -- docs/reports/swarm-2026-10-14/docs-review.md` completed with no output and exit 0. Commit validation checks the changed path list and worktree status, without any integration.

The Git history/date collector ran one `git log -1 --format='%cs %h' -- <file>` per input; every collected result appears in the disposition tables. Selected history evidence:

- `git log -8 --format='%cs %h %s' -- src/lib/shared/components/Crossfade.svelte`: includes `2026-10-12 6de7881545 refactor(motion): the Composer's owners come from @austencloud/motion`.
- `git log -5 --format='%cs %h %s' -S 'one topic, three views' -- docs`: includes `2026-10-10 d10b836adf docs(learn): record the one-topic, three-views decision`.
- `git log -4 --format='%cs %h %s' -S 'hand-placements' -- src/lib/features/learn/domain/concept-experience-registry.ts`: `2026-09-15 48050b5010 refactor(domain): rename the two-hand "position" concept to "placement"`.
- `git log -3 --format='%cs %h %s' -- src/lib/features/archive/ArchiveDestination.svelte src/lib/features/realm`: includes `2026-06-20 37cf8e7551 refactor(archive): remove kinetic-archive module, redirect /archive to /museum`.
- `git log -5 --format='%cs %h %s' -S 'saveSequenceWithMetadata(sequence, metadata)' -- src/lib/features/library/services/library-save-service.ts`: `2026-05-28 c8d1f0008b refactor(library): flatten dirs + kebab rename`.

Observation: an initial whole-corpus JSON tool result was truncated; it was replaced by 15-file batches. An initial identifier scan outlived its uncaptured tool session and was stopped (task-owned PID 108296); the replacement scan completed and returned the 658-sample inventory. Neither scan wrote files. These tooling failures do not represent app-test failures.

## Proposed moves

Proposal: run only after approval and after creating the destination parents. Commands below preserve directory structure under `docs/archive/swarm-2026-10-14/`. Only ARCHIVE verdicts are unconditional archive candidates; MERGE source moves wait until unique content and provenance have been incorporated into the named survivor. Relative links and inbound references must be repaired by the coordinator in a separately owned change. No move was run by this worker.

- git mv "docs/about-page-three-versions.md" "docs/archive/swarm-2026-10-14/about-page-three-versions.md"
- git mv "docs/architecture/in-app-browser-path.md" "docs/archive/swarm-2026-10-14/architecture/in-app-browser-path.md"
- git mv "docs/audits/2026-08-16-repo-janitor-cruft-audit.md" "docs/archive/swarm-2026-10-14/audits/2026-08-16-repo-janitor-cruft-audit.md"
- git mv "docs/audits/2026-09-05-scripts-inventory.md" "docs/archive/swarm-2026-10-14/audits/2026-09-05-scripts-inventory.md"
- git mv "docs/diagnostics/2026-09-09-pictograph-color-parity.md" "docs/archive/swarm-2026-10-14/diagnostics/2026-09-09-pictograph-color-parity.md"
- git mv "docs/diagnostics/2026-09-09-prop-render-audit.md" "docs/archive/swarm-2026-10-14/diagnostics/2026-09-09-prop-render-audit.md"
- git mv "docs/diagnostics/2026-09-09-sidebar-prop-pair.md" "docs/archive/swarm-2026-10-14/diagnostics/2026-09-09-sidebar-prop-pair.md"
- git mv "docs/museum-3d-session-2026-04-04.md" "docs/archive/swarm-2026-10-14/museum-3d-session-2026-04-04.md"
- git mv "docs/museum/museum-layout.md" "docs/archive/swarm-2026-10-14/museum/museum-layout.md"
- git mv "docs/performance/2026-09-08-construct-pass-3.md" "docs/archive/swarm-2026-10-14/performance/2026-09-08-construct-pass-3.md"
- git mv "docs/performance/2026-09-08-startup-audit.md" "docs/archive/swarm-2026-10-14/performance/2026-09-08-startup-audit.md"
- git mv "docs/performance/2026-09-08-startup-pass-2.md" "docs/archive/swarm-2026-10-14/performance/2026-09-08-startup-pass-2.md"
- git mv "docs/performance/2026-09-13-startup-boot-graph.md" "docs/archive/swarm-2026-10-14/performance/2026-09-13-startup-boot-graph.md"
- git mv "docs/performance/2026-10-07-create-dev-startup.md" "docs/archive/swarm-2026-10-14/performance/2026-10-07-create-dev-startup.md"
- git mv "docs/reference/2026-09-25-worktree-consolidation.md" "docs/archive/swarm-2026-10-14/reference/2026-09-25-worktree-consolidation.md"
- git mv "docs/reference/autumn-meshy-image-prompts.md" "docs/archive/swarm-2026-10-14/reference/autumn-meshy-image-prompts.md"
- git mv "docs/reference/float-float-naming-analysis.md" "docs/archive/swarm-2026-10-14/reference/float-float-naming-analysis.md"
- git mv "docs/reference/offline-persistence-audit-2026-06-30.md" "docs/archive/swarm-2026-10-14/reference/offline-persistence-audit-2026-06-30.md"
- git mv "docs/reference/timing-direction-reference-audit.md" "docs/archive/swarm-2026-10-14/reference/timing-direction-reference-audit.md"
- git mv "docs/reports/opus-batch-2026-09-12/collection-integrity.md" "docs/archive/swarm-2026-10-14/reports/opus-batch-2026-09-12/collection-integrity.md"
- git mv "docs/reports/opus-batch-2026-09-12/guest-save-isolation.md" "docs/archive/swarm-2026-10-14/reports/opus-batch-2026-09-12/guest-save-isolation.md"
- git mv "docs/reports/opus-batch-2026-09-12/sequence-engine-parity.md" "docs/archive/swarm-2026-10-14/reports/opus-batch-2026-09-12/sequence-engine-parity.md"
- git mv "docs/reports/opus-batch-2026-09-12/startup-performance.md" "docs/archive/swarm-2026-10-14/reports/opus-batch-2026-09-12/startup-performance.md"
- git mv "docs/research/avatar-source-bakeoff-2026-08-28.md" "docs/archive/swarm-2026-10-14/research/avatar-source-bakeoff-2026-08-28.md"
- git mv "docs/research/stage-locomotion-research.md" "docs/archive/swarm-2026-10-14/research/stage-locomotion-research.md"
- git mv "docs/specs/comment-noise-retirement.md" "docs/archive/swarm-2026-10-14/specs/comment-noise-retirement.md"

Proposal: the following moves are conditional on completing each MERGE above.

- git mv "docs/architecture/guide-single-source.md" "docs/archive/swarm-2026-10-14/architecture/guide-single-source.md"
- git mv "docs/I18N-IMPLEMENTATION.md" "docs/archive/swarm-2026-10-14/I18N-IMPLEMENTATION.md"
- git mv "docs/learn/concepts-convergence-notes.md" "docs/archive/swarm-2026-10-14/learn/concepts-convergence-notes.md"
- git mv "docs/MODAL_SIZING_STRATEGY.md" "docs/archive/swarm-2026-10-14/MODAL_SIZING_STRATEGY.md"
- git mv "docs/reference/bridge-free-words.md" "docs/archive/swarm-2026-10-14/reference/bridge-free-words.md"
- git mv "docs/reference/vtg-accuracy-audit.md" "docs/archive/swarm-2026-10-14/reference/vtg-accuracy-audit.md"
- git mv "docs/reference/vtg-attribution-audit.md" "docs/archive/swarm-2026-10-14/reference/vtg-attribution-audit.md"

## Open questions for Austen

- Product decision: is Flowkemon still live, and where should its 24-creature design roster be maintained? Observation: 24 identity files and roster agree, but no Flowkemon runtime files were found under src/packages.
- Product/source decision: where is the current museum story bible, and does the next delivery target the text-only v1 slice, the web museum, or the UE5/Steam vision? Retired numbered-wing locations must not guide new production without a current layout.
- Product decision: which contact/grid experiments should leave the labs, and what chest turn, stepping and variable-ring behavior is approved? Performer-grid-styles.md still contains explicit open choices.
- Product decision: should legacy Endless World, unwired Record, sound feedback, device-sync/video/merch islands and unused notification state remain planned work? Their historical reviews are not deletion authorization.
- Product/domain decisions: inverted overlay labelling/minimum lengths, step-mode duration/lap policy, learning-progress denominator, createdAt semantics and legal wire-decoder turn range remain explicitly unresolved in retained reports.
- Product/security decisions: authenticated QR-video writes, public content-hash convergence/cache ownership and notification permission-denied recovery need owner decisions; current static findings do not establish deployed rules or provider configuration.
- Approval/review: archive/consolidation moves and broken-link repairs are proposals. Native German terminology review, real Meta login/posting gates, physical-device camera/Fold checks, Tunnel export proof and calibration owner preference remain unverified acceptance work.
- External task decision: resume or leave shelved Merchant Center/Wikidata/SEO outreach work. This review neither inspected those signed-in accounts nor authorized publication or communications.
