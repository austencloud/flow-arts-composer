---
status: active
value: 3
effort: M
remaining: "Re-audit the 90-control telemetry ledger against the current /q resolver and shared /sequence host before wiring any missing events."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# /q Scan Page — Analytics Instrumentation Ledger

> **ROUTING UPDATE — 2026-08-28.** `/q` now owns resolution and the one
> physical-scan write, then replaces itself with `/sequence`. Viewer-control,
> practice, export, and exit instrumentation lives in the shared shell and the
> scan-origin `/sequence` host. The historical line references below describe
> the pre-consolidation inventory and must be re-audited against those owners
> before implementing any remaining item.

Generated 2026-07-20 from the qr-scan-telemetry-remediation workflow inventory pass.
Source incident: card SJJ6 scanned 2026-07-20 19:40 UTC, Fort Smith/Austin geo, iPhone.

Foundation fixes (identity, resolution, SSR deck attribution, analytics init) land first.
This ledger is phase 2: wiring every control through the shared base-property helper.

Base props on every event: short_code, sequence_word, deck_id, deck_name, is_authenticated, device_id, scan_session_id

## Summary

- Controls found: **90**
- Already tracked: **6**
- Untracked (to wire): **84**
- Lifecycle milestones: **19**
- Consolidated event taxonomy: **75** events

## Controls to instrument

| # | Control | File:line | Event |
|---|---|---|---|
| 1 | Error screen: "Try Again" (offline reload) | `src/routes/q/[code]/QScanPage.svelte:720` | `scan_error_retry_clicked` |
| 2 | Error screen: "Browse Sequences" link → /browse/gallery | `src/routes/q/[code]/QScanPage.svelte:729` | `scan_error_exit_clicked` |
| 3 | Error screen: "Create Your Own" link → /create | `src/routes/q/[code]/QScanPage.svelte:733` | `scan_error_exit_clicked` |
| 4 | Page-level ExportTakeover: Cancel | `src/routes/q/[code]/QScanPage.svelte:782` | `viewer_export_cancelled` |
| 5 | Page-level ExportTakeover: Retry | `src/routes/q/[code]/QScanPage.svelte:783` | `viewer_export_retried` |
| 6 | ExportTakeover: Close (error state) | `src/lib/shared/video-export/components/ExportTakeover.svelte:108` | `viewer_export_cancelled` |
| 7 | ExportTakeover: Retry (error state) | `src/lib/shared/video-export/components/ExportTakeover.svelte:109` | `viewer_export_retried` |
| 8 | ExportTakeover: Cancel (in-progress) | `src/lib/shared/video-export/components/ExportTakeover.svelte:128` | `viewer_export_cancelled` |
| 9 | Header: Exit Practice | `src/lib/shared/sequence-viewer/components/SequenceViewerShell.svelte:383` | `viewer_practice_exited` |
| 10 | Header: Practice (icon-only, compact chrome) | `src/lib/shared/sequence-viewer/components/SequenceViewerShell.svelte:400` | `viewer_practice_entered` |
| 11 | Header: Favorite toggle (gated) | `src/lib/shared/sequence-viewer/components/SequenceViewerShell.svelte:407` | `viewer_favorite_toggled` |
| 12 | Header: Save sequence (gated) | `src/lib/shared/sequence-viewer/components/SequenceViewerShell.svelte:417` | `viewer_save_clicked` |
| 13 | Header: Practice (labeled, wide chrome) | `src/lib/shared/sequence-viewer/components/SequenceViewerShell.svelte:436` | `viewer_practice_entered` |
| 14 | Header: MotionVisibilityToggle (narrow popover trigger) | `src/lib/shared/sequence-viewer/components/MotionVisibilityToggle.svelte:63` | `viewer_motion_visibility_opened` |
| 15 | Motion chips: Blue / Red motion toggle | `src/lib/shared/sequence-viewer/components/MotionVisibilityToggle.svelte:101` | `viewer_motion_visibility_toggled` |
| 16 | Header: Copy for Claude (admin only) | `src/lib/shared/sequence-viewer/components/SequenceViewerShell.svelte:451` | `viewer_copy_data_clicked` |
| 17 | Header title = overflow-menu trigger (open/close) | `src/lib/shared/sequence-viewer/components/ViewerOverflowMenu.svelte:280` | `viewer_menu_opened` |
| 18 | Header: Show/Hide export settings sidebar | `src/lib/shared/sequence-viewer/components/SequenceViewerShell.svelte:483` | `viewer_export_sidebar_toggled` |
| 19 | Header: Close viewer (on /q → goto gallery) | `src/lib/shared/sequence-viewer/components/SequenceViewerShell.svelte:494` | `viewer_closed` |
| 20 | Overflow menu item: Favorite / Unfavorite | `src/lib/shared/sequence-viewer/components/ViewerOverflowMenu.svelte:160` | `viewer_favorite_toggled` |
| 21 | Overflow menu item: Save | `src/lib/shared/sequence-viewer/components/ViewerOverflowMenu.svelte:168` | `viewer_save_clicked` |
| 22 | Overflow menu item: Open TKA (openAppHref, /q-only funnel exit) | `src/lib/shared/sequence-viewer/components/ViewerOverflowMenu.svelte:187` | `qr_open_app_clicked` |
| 23 | Overflow menu item: Copy Data (admin) | `src/lib/shared/sequence-viewer/components/ViewerOverflowMenu.svelte:195` | `viewer_copy_data_clicked` |
| 24 | Overflow menu item: See it in the Guide (/q-only, → seeInGuide) | `src/lib/shared/sequence-viewer/components/ViewerOverflowMenu.svelte:202` | `qr_open_guide_clicked` |
| 25 | Overflow menu item: Upload Video (logged-in + VIDEO_UPLOAD_ENABLED) | `src/lib/shared/sequence-viewer/components/ViewerOverflowMenu.svelte:219` | `viewer_video_upload_opened` |
| 26 | Overflow menu item: Make Public / Make Private (owner) | `src/lib/shared/sequence-viewer/components/ViewerOverflowMenu.svelte:242` | `viewer_publish_toggled` |
| 27 | Overflow menu item: Delete (owner) | `src/lib/shared/sequence-viewer/components/ViewerOverflowMenu.svelte:250` | `viewer_delete_requested` |
| 28 | Overflow menu backdrop dismiss | `src/lib/shared/sequence-viewer/components/ViewerOverflowMenu.svelte:301` | `viewer_menu_dismissed` |
| 29 | Content rail: mode buttons (Side by Side / 2D / 3D / Card / Mandala / Tunnel) | `src/lib/shared/sequence-viewer/components/ViewerContentRail.svelte:120` | `viewer_mode_changed` |
| 30 | Content rail: drag-resize handle | `src/lib/shared/sequence-viewer/components/ViewerContentRail.svelte:151` | `viewer_rail_resized` |
| 31 | Content rail: double-click collapse/expand | `src/lib/shared/sequence-viewer/components/ViewerContentRail.svelte:157` | `viewer_rail_resized` |
| 32 | Mobile bottom bar: mode NavButtons | `src/lib/shared/sequence-viewer/components/ViewerModeBottomBar.svelte:44` | `viewer_mode_changed` |
| 33 | Animation canvas: tap/click body to play-pause | `src/lib/shared/animation-engine/components/AnimatorCanvas.svelte:316` | `viewer_playback_toggled` |
| 34 | Animation canvas: corner play/pause button (cornerToggle) | `src/lib/shared/animation-engine/components/AnimatorCanvas.svelte:503` | `viewer_playback_toggled` |
| 35 | Animation canvas: long-press → canvas context menu | `src/lib/shared/animation-engine/components/AnimatorCanvas.svelte:294` | `viewer_canvas_menu_opened` |
| 36 | Animation canvas: right-click → canvas context menu | `src/lib/shared/animation-engine/components/AnimatorCanvas.svelte:496` | `viewer_canvas_menu_opened` |
| 37 | Animation canvas: progress line seek / scrub | `src/lib/shared/animation-engine/components/AnimatorCanvas.svelte:624` | `viewer_seeked` |
| 38 | Split pane: pane-close (exit focus mode), 2D pane | `src/lib/shared/sequence-viewer/components/ViewerSplitPane.svelte:457` | `viewer_pane_unfocused` |
| 39 | Split pane: pane-close (exit focus mode), 3D pane | `src/lib/shared/sequence-viewer/components/ViewerSplitPane.svelte:409` | `viewer_pane_unfocused` |
| 40 | Split pane: pane-close (exit focus mode), card pane | `src/lib/shared/sequence-viewer/components/ViewerSplitPane.svelte:665` | `viewer_pane_unfocused` |
| 41 | Choreo card: step-cell click (seek to step) | `src/lib/shared/sequence-viewer/components/CardGridLayout.svelte:83` | `viewer_step_clicked` |
| 42 | Choreo card: QR center play badge → 2D + play | `src/lib/shared/sequence-viewer/components/CardGridLayout.svelte:224` | `qr_play_badge_clicked` |
| 43 | Choreo card: right-click / long-press → card context menu | `src/lib/shared/sequence-viewer/components/ChoreoCard.svelte:1692` | `viewer_card_menu_opened` |
| 44 | Card context menu: Pictograph visibility entries + Card section (Re-render / Send to / Sticker Lab / columns) | `src/lib/shared/sequence-viewer/components/choreo-card-context-menu/ChoreoCardContextMenuHost.svelte:46` | `viewer_card_menu_item_selected` |
| 45 | Card export panel (desktop): Header master toggle | `src/lib/shared/sequence-viewer/components/ExportImagePanel.svelte:357` | `card_export_option_changed` |
| 46 | Card export panel (desktop): Word / Level / LOOP chips | `src/lib/shared/sequence-viewer/components/ExportImagePanel.svelte:362` | `card_export_option_changed` |
| 47 | Card export panel (desktop): Footer master + Name / Notes / Date chips | `src/lib/shared/sequence-viewer/components/ExportImagePanel.svelte:379` | `card_export_option_changed` |
| 48 | Card export panel (desktop): Pictograph master + Grid / TKA / TnD / Positions / Non-radial chips | `src/lib/shared/sequence-viewer/components/ExportImagePanel.svelte:401` | `card_export_option_changed` |
| 49 | Card export panel (desktop): Info Cell segmented (QR / Mandala / None) | `src/lib/shared/sequence-viewer/components/ExportImagePanel.svelte:436` | `card_export_option_changed` |
| 50 | Card export panel (desktop): QR Code chip | `src/lib/shared/sequence-viewer/components/ExportImagePanel.svelte:451` | `card_export_option_changed` |
| 51 | Card export panel (desktop): Mandala chip | `src/lib/shared/sequence-viewer/components/ExportImagePanel.svelte:463` | `card_export_option_changed` |
| 52 | Card export panel (desktop): Start Show / Top Row / Left Column | `src/lib/shared/sequence-viewer/components/ExportImagePanel.svelte:475` | `card_export_option_changed` |
| 53 | Card export panel (desktop): Columns chips (Auto / N) | `src/lib/shared/sequence-viewer/components/ExportImagePanel.svelte:499` | `card_export_option_changed` |
| 54 | Card export panel (desktop): Theme Light / Dark | `src/lib/shared/sequence-viewer/components/ExportImagePanel.svelte:511` | `card_export_option_changed` |
| 55 | Card export panel (mobile dock): Labels / Pictograph / Format tabs | `src/lib/shared/sequence-viewer/components/ExportImagePanel.svelte:233` | `card_export_tab_opened` |
| 56 | Animation export panel: section pills (effects / props / effort / playback / display / export) | `src/lib/shared/animation-panel/components/AnimationPanel.svelte:124` | `video_export_tab_opened` |
| 57 | Animation export panel: FPS 30 / 60 / 120 | `src/lib/shared/animation-panel/components/AnimationPanel.svelte:414` | `video_export_option_changed` |
| 58 | Animation export panel: Resolution 720 / 1080 / 4K / 8K | `src/lib/shared/animation-panel/components/AnimationPanel.svelte:432` | `video_export_option_changed` |
| 59 | Animation export panel: Quality Standard / Cinema | `src/lib/shared/animation-panel/components/AnimationPanel.svelte:455` | `video_export_option_changed` |
| 60 | Animation export panel: Start Hold / End Hold | `src/lib/shared/animation-panel/components/AnimationPanel.svelte:470` | `video_export_option_changed` |
| 61 | Animation export panel: Loops stepper −/+ | `src/lib/shared/animation-panel/components/AnimationPanel.svelte:488` | `video_export_option_changed` |
| 62 | Animation export panel: Cancel export | `src/lib/shared/animation-panel/components/AnimationPanel.svelte:547` | `viewer_export_cancelled` |
| 63 | Video preview: play overlay | `src/lib/shared/sequence-viewer/components/VideoPreviewPanel.svelte:91` | `video_preview_played` |
| 64 | Video preview: Replay | `src/lib/shared/sequence-viewer/components/VideoPreviewPanel.svelte:109` | `video_preview_played` |
| 65 | Video preview: Save / Share the exported MP4 | `src/lib/shared/sequence-viewer/components/VideoPreviewPanel.svelte:118` | `viewer_export_saved` |
| 66 | Video preview: Done / dismiss | `src/lib/shared/sequence-viewer/components/VideoPreviewPanel.svelte:127` | `video_preview_dismissed` |
| 67 | Practice setup: preset segmented (Creep / Staircase / Custom) | `src/lib/shared/sequence-viewer/components/PracticeSetupBar.svelte:83` | `practice_preset_selected` |
| 68 | Practice setup: Start practice (hero CTA) | `src/lib/shared/sequence-viewer/components/PracticeSetupBar.svelte:88` | `practice_started` |
| 69 | Practice setup: ramp config gear popover | `src/lib/shared/sequence-viewer/components/PracticeSetupBar.svelte:100` | `practice_config_opened` |
| 70 | Practice cockpit: play / pause | `src/lib/shared/sequence-viewer/components/PracticeBar.svelte:143` | `viewer_playback_toggled` |
| 71 | Practice cockpit: Slower (−Y BPM) | `src/lib/shared/sequence-viewer/components/PracticeBar.svelte:163` | `practice_level_stepped` |
| 72 | Practice cockpit: BPM readout → tempo popover | `src/lib/shared/sequence-viewer/components/PracticeBar.svelte:177` | `practice_bpm_popover_opened` |
| 73 | Practice cockpit: Faster (+Y BPM) | `src/lib/shared/sequence-viewer/components/PracticeBar.svelte:201` | `practice_level_stepped` |
| 74 | Practice cockpit: Hold / resume climb | `src/lib/shared/sequence-viewer/components/PracticeBar.svelte:217` | `practice_hold_toggled` |
| 75 | Practice cockpit: metronome Sound / Muted | `src/lib/shared/sequence-viewer/components/PracticeBar.svelte:229` | `practice_metronome_toggled` |
| 76 | Practice cockpit: AR camera Mirror toggle | `src/lib/shared/sequence-viewer/components/PracticeBar.svelte:241` | `practice_mirror_toggled` |
| 77 | Practice cockpit: Stop (back to setup) | `src/lib/shared/sequence-viewer/components/PracticeBar.svelte:255` | `practice_stopped` |
| 78 | Delete confirm dialog: Confirm / Cancel | `src/lib/shared/sequence-viewer/components/SequenceViewerShell.svelte:770` | `viewer_delete_resolved` |
| 79 | Sign-in sheet: primary action (Google / Continue in browser) | `src/lib/shared/sequence-viewer/components/SignInSheet.svelte:73` | `scan_signin_attempted` |
| 80 | Sign-in sheet: close button | `src/lib/shared/sequence-viewer/components/SignInSheet.svelte:68` | `scan_signin_dismissed` |
| 81 | Sign-in sheet: backdrop dismiss | `src/lib/shared/sequence-viewer/components/SignInSheet.svelte:59` | `scan_signin_dismissed` |
| 82 | Keyboard: Space toggles playback | `src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte:977` | `viewer_playback_toggled` |
| 83 | Keyboard: Escape closes viewer / exits fullscreen | `src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte:967` | `viewer_closed` |
| 84 | DEAD SEAM: ctx.openSignInPrompt (the documented "/q header account chip") has zero consumers — no sign-in chip is rendered on /q, and no qr_signin_from_chip event exists anywhere in src | `src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte:1156` | `scan_signin_chip_clicked` |

## Already tracked (verify props, do not duplicate)

| Control | File:line | Event |
|---|---|---|
| Header: Remix (on /q → openInComposer) | `src/lib/shared/sequence-viewer/components/SequenceViewerShell.svelte:427` | `qr_open_composer` |
| Overflow menu item: Remix (on /q → openInComposer) | `src/lib/shared/sequence-viewer/components/ViewerOverflowMenu.svelte:171` | `qr_open_composer` |
| Card export panel (desktop): Download Card button | `src/lib/shared/sequence-viewer/components/ExportImagePanel.svelte:530` | `qr_download_gated` |
| Card export panel (mobile dock): trailing Share/Download trigger | `src/lib/shared/sequence-viewer/components/ExportImagePanel.svelte:216` | `qr_download_gated` |
| Animation export panel: Export / Download Animation button | `src/lib/shared/animation-panel/components/AnimationPanel.svelte:641` | `qr_download_gated` |
| Native share / clipboard copy (ctx.handleShare) | `src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte:912` | `viewer_shared` |

## Lifecycle milestones

| Milestone | Event | Why |
|---|---|---|
| Scan resolve pipeline stages (start → shortcode-resolved → hydrated → card-mount) | `scan_resolve_stage` | markScan() already instruments these four checkpoints but the marks are never sent to PostHog. The 19:40:43 incident is invisible in analytics precisely because resolve timing/outcome is untracked; emitting them turns every scan into a measurable funnel with a fail stage. |
| Short-code resolution FAILED (client) | `scan_resolve_failed` | QScanPage.svelte:543 sets pageState error when resolveShortCode returns null. Today this only surfaces as a console $exception string, which is why root-causing SJJ6 required log archaeology. Needs a first-class event carrying which source was tried (Firebase / R2 snapshot / committed static) and why each missed. |
| SSR shortcode meta lookup failed (deck_id/deck_name null) | `scan_meta_lookup_failed` | +page.server.ts:41 swallows Firestore admin failures in a bare catch, so meta silently stays all-null. The real SJJ6 card_scanned carried deck_id NULL even though shortcodes/SJJ6 has deckId "004" — every deck-attribution metric is silently undercounting and nothing reports it. |
| Error screen shown to the user | `scan_error_shown` | QScanPage.svelte:700 renders either "You're offline" or "This sequence isn't available". Which variant a scanner saw is the single most important field for triaging a bad card, and it is currently unrecorded. |
| Offline detected at failure time / auto-retry on reconnect | `scan_offline_detected` | failedWhileOffline is computed at QScanPage.svelte:542 and handleBackOnline (:104) silently reloads. Card scans happen at jams on bad mobile networks — separating connectivity failures from broken codes changes the fix entirely. |
| Word-glyph loader painted (first meaningful paint of the scanned word) | `scan_loader_painted` | QScanPage.svelte:509 sets glyphsReady. This is the moment the scanner sees their word instead of dots — the perceived-speed metric for the whole card product. |
| Viewer ready / card mounted | `scan_viewer_ready` | QScanPage.svelte:647 flips pageState to playing. Gives time-to-interactive per scan, joinable to device and network from the same session. |
| Playback actually started (first frame moving) | `scan_playback_started` | The orchestrator auto-plays after a cell-readiness poll (SequenceViewerOrchestrator.svelte:675-684), so "they pressed play" and "the animation ran" are different facts. Only the latter proves the scan delivered its payload; it must carry whether the start was automatic or user-initiated. |
| First loop completed | `scan_loop_completed` | A LOOP-deck card's whole value is the loop reading cleanly. Loop-1 completion is the cleanest "the scanner actually watched it" signal and the natural denominator for every downstream action rate. |
| Dwell heartbeats at 10s / 30s / 60s / 180s | `scan_dwell` | A scan that bounces in 4s and one that holds for 3 minutes are opposite outcomes and currently identical in PostHog. Discrete milestone events survive the $pageleave loss that already cost this session's data. |
| Page exit with total dwell + terminal state | `scan_exited` | $pageleave fired at 19:40:44.602 with no duration and no context. A beforeunload/visibilitychange event carrying dwell_ms, viewer_mode, loops_completed and whether playback ever started is what makes exits interpretable. |
| Session identity reset (reload minted a new distinct_id + session_id) | `scan_session_continued` | The incident's reload split one human scan across two PostHog identities, breaking every funnel join. A scan_session_id persisted in sessionStorage and stamped on every event survives reloads and re-stitches the visit. |
| Viewer mode dwell (how long in Side-by-Side vs Card vs 2D vs Mandala vs Tunnel) | `viewer_mode_dwell` | Mode SWITCHES are clicks, but time-in-mode is the behavior signal — it tells you which pane a scanner actually consumes and whether Side-by-Side is the right /q landing (startInSplit at SequenceViewerShell.svelte:251). |
| Pane focus depth instead of scroll depth | `viewer_pane_focused` | The /q page has overflow:hidden and height:100dvh (QScanPage.svelte:797-807) — it does not scroll, so scroll-depth is meaningless here. The equivalent engagement gradient is focusing a pane (onFocusPane at ViewerSplitPane) and opening export/practice chrome. |
| Orientation / viewport class change | `scan_orientation_changed` | QScanPage.svelte:436-438 already listens for resize and flips isViewerMobile at 768; SequenceViewerShell.svelte:151 tracks isLandscapeMobile. Phone rotation on a scan changes the entire layout, and layout-dependent drop-off is otherwise unattributable. |
| 3D unavailable / downgraded to 2D | `scan_3d_unavailable` | SequenceViewerOrchestrator.svelte:571 silently downgrades a wanted-3D mode when webgl2 is missing or the viewport is too small, and viewer-modes.ts:49 hides the option entirely. Scanners on phones never see 3D and nothing records that the option was withheld. |
| Gated download replayed after sign-in | `scan_gated_action_replayed` | The funnel's payoff step. auth-action-queue.svelte.ts:192 replays the queued download once auth lands; without an event the conversion from qr_download_gated to a delivered file is unmeasurable. |
| Export completed / failed with duration | `viewer_export_completed` | QScanPage.svelte:299 shares or downloads the blob and :300 swallows failures into a console.error. Export is the heaviest thing a scanner can ask for; success rate and duration by device belong in the taxonomy. |
| PWA install prompt offered / accepted | `scan_install_prompt` | A scanner who installs is the highest-value outcome a physical card can produce. No beforeinstallprompt handler exists in this route today, so this is net-new instrumentation, not a wiring gap. |

## Consolidated event taxonomy

| Event | Fires when | Props (beyond base) |
|---|---|---|
| `__base_properties__` | Merged into EVERY event below by a new buildScanEventProps() helper wrapping the existing captureEvent (src/lib/shared/analytics/services/posthog.ts:166). Do not invent a parallel capture path. surface distinguishes the /q route from the in-app drawer, because SequenceViewerShell is shared verbatim by both hosts (sequence-viewer-shell.md contract) — instrumenting the shell instruments both surfaces, and without surface the two datasets merge silently. deck_id/deck_name must fall back to the CLIENT-resolved shortcode doc when the SSR meta is null (+page.server.ts:41 swallows lookup failures — this is why the real SJJ6 scan logged deck_id NULL). | short_code, sequence_word, deck_id, deck_name, is_authenticated, device_id, scan_session_id, surface, step_count, viewer_mode, render_mode, is_mobile |
| `card_scanned` | ALREADY EXISTS — QScanPage.svelte:587, fired once per genuine scan after resolve+hydrate. Keep the name and the geo props; extend it with the shared base set and add ms_to_ready + deck-id fallback. | country, city, ms_to_ready, print_id, prop_seed, was_offline_at_start |
| `qr_open_composer` | ALREADY EXISTS — QScanPage.svelte:378, fired by Remix from both the header button and the overflow menu. Add source to tell the two entry points apart. | source |
| `qr_download_gated` | ALREADY EXISTS — QScanPage.svelte:350, fired only when a guest requests an export. Extend to fire for BOTH gated and ungated requests with a was_gated flag, so the denominator (all download intents) is visible, not just the blocked ones. | export_kind, was_gated, layout, fps, resolution, loop_count |
| `scan_app_opened` | ALREADY EXISTS — scan-attribution.ts:18, fired in the main app when arriving with ?from=scan&code=. Stamp scan_session_id so the /q session and the app session join. | short_code, scan_session_id, destination |
| `qr_signin_from_chip` | DOES NOT EXIST — grep across src returns zero hits, and the control it names is gone: no sign-in chip is rendered by SequenceViewerShell, and ctx.openSignInPrompt (SequenceViewerOrchestrator.svelte:1156) has no consumers. Either delete the dead seam or re-add the chip; do not build a taxonomy assuming this event. |  |
| `scan_resolve_stage` | At each markScan checkpoint in QScanPage.svelte (:432, :539, :556, :648). One event per stage with cumulative ms. | stage, ms_since_start, glyphs_ready |
| `scan_resolve_failed` | QScanPage.svelte:543 (null sequence) and :656 (thrown). The event the SJJ6 incident needed and did not have. | failure_kind, was_offline, tried_firebase, tried_r2_snapshot, tried_static_fallback, ms_to_failure, error_message |
| `scan_meta_lookup_failed` | +page.server.ts:41 catch block. Emit server-side (or thread a flag to the client) so silent deck-attribution loss becomes visible. | error_message |
| `scan_error_shown` | QScanPage.svelte:700 when the error branch renders. | error_kind, message, was_offline |
| `scan_offline_detected` | QScanPage.svelte:542/:655 when navigator.onLine is false at failure, and again in handleBackOnline (:104) on reconnect-triggered reload. | phase, auto_retried |
| `scan_error_retry_clicked` | QScanPage.svelte:720 Try Again. | error_kind, ms_since_error |
| `scan_error_exit_clicked` | QScanPage.svelte:729 and :733 — the two escape hatches on the error screen. | destination, error_kind |
| `scan_loader_painted` | QScanPage.svelte:509 once loadGlyphsByLetter resolves and glyphsReady flips true. | ms_since_start, letter_count |
| `scan_viewer_ready` | QScanPage.svelte:647 when pageState becomes playing. | ms_since_start, start_mode |
| `scan_playback_started` | First transition of playback.isPlayingLocal to true. started_by separates the orchestrator's auto-play (SequenceViewerOrchestrator.svelte:681) from a real user gesture. | started_by, ms_since_ready, bpm |
| `scan_loop_completed` | Each time currentStep wraps past the final step. Cap at loop_index <= 5 then sample, so a card left running overnight doesn't flood the project. | loop_index, bpm, ms_since_playback_start |
| `scan_dwell` | Timer milestones at 10 / 30 / 60 / 180 seconds after scan_viewer_ready. Discrete events, not a duration on exit — they survive the $pageleave loss seen in this incident. | seconds, viewer_mode, is_playing, loops_completed, interactions_so_far |
| `scan_exited` | visibilitychange hidden + beforeunload (dedup by scan_session_id). | dwell_ms, viewer_mode_at_exit, loops_completed, playback_ever_started, interaction_count, reached_terminal_state |
| `scan_session_continued` | On mount when a scan_session_id already exists in sessionStorage for this short code — i.e. a reload. Re-stitches the split identity that made the 19:40:44 reload unreadable. | reload_index, previous_distinct_id |
| `scan_orientation_changed` | QScanPage.svelte:436 resize listener, when the isViewerMobile / landscape class actually flips (not on every resize tick). | orientation, viewport_width, viewport_height, is_mobile_after |
| `scan_3d_unavailable` | SequenceViewerOrchestrator.svelte:571 downgrade, and when viewer-modes.ts:49 filters the 3D option out of the rail. | reason, webgl2_available, viewport_fits_3d |
| `scan_install_prompt` | beforeinstallprompt captured and on the user's choice. Net-new — no handler exists on this route today. | action |
| `scan_signin_attempted` | SignInSheet.svelte:73 primary action. | reason, webview_mode, method |
| `scan_signin_dismissed` | SignInSheet.svelte:68 close and :59 backdrop. | reason, dismiss_method, ms_open |
| `scan_gated_action_replayed` | auth-action-queue.svelte.ts:172 replayPendingAction, per replayed type. Closes the qr_download_gated funnel. | action_type, ms_since_gate |
| `qr_play_badge_clicked` | CardGridLayout.svelte:224 .qr-play-hit — the /q-specific affordance that jumps from the card to 2D playback. | was_playing, viewer_mode_before |
| `qr_open_app_clicked` | ViewerOverflowMenu.svelte:187, the Open TKA item the shell adds only when openAppHref is set (i.e. only on /q). | destination, source |
| `qr_open_guide_clicked` | ViewerOverflowMenu.svelte:202 → QScanPage.svelte:390 seeInGuide. | guide_slug, guide_cell_key, step_count |
| `viewer_mode_changed` | ViewerContentRail.svelte:120 and ViewerModeBottomBar.svelte:44. One event for both switchers; control distinguishes rail vs bottom bar. | mode, previous_mode, control, webgl2_available |
| `viewer_mode_dwell` | On leaving a mode, with the time spent in it. The behavior signal the click event alone cannot give. | mode, dwell_ms, entered_via |
| `viewer_playback_toggled` | Canvas tap (AnimatorCanvas.svelte:316), corner button (:503), practice cockpit (PracticeBar.svelte:143), and the Space key (SequenceViewerOrchestrator.svelte:977). One event, control tells them apart. | next_state, control, pointer_type, current_step, bpm |
| `viewer_seeked` | Progress-line seek and scrub-end (AnimatorCanvas.svelte:624-632, threaded via ViewerSplitPane.svelte:506-508). Fire once on scrub end, not per pointermove. | control, from_step, to_step, was_scrub, step_count |
| `viewer_step_clicked` | Choreo-card step cell and start cell (CardGridLayout.svelte:83, clickableStart at ViewerSplitPane.svelte:547). | step_index, step_count, is_start_cell, was_playing |
| `viewer_pane_focused` | ViewerSplitPane onFocusPane (wired to ctx.enterEditMode, SequenceViewerShell.svelte:561). The scroll-depth substitute for a non-scrolling page. | pane, viewer_mode |
| `viewer_pane_unfocused` | The three pane-close buttons: ViewerSplitPane.svelte:409, :457, :665. | pane, focus_duration_ms |
| `viewer_menu_opened` | ViewerOverflowMenu.svelte:280 toggle — the header title IS the trigger, so this also measures whether scanners discover the menu at all. | item_count, has_motion_row, chrome |
| `viewer_menu_dismissed` | ViewerOverflowMenu.svelte:301 backdrop / Escape / Tab close, with whether an item was chosen first. | dismiss_method, item_selected |
| `viewer_favorite_toggled` | SequenceViewerShell.svelte:407 header button and ViewerOverflowMenu.svelte:160 menu item; was_gated reflects invokeGatedAction's guest path (auth-action-queue.svelte.ts:76). | source, next_state, was_gated |
| `viewer_save_clicked` | SequenceViewerShell.svelte:417 and ViewerOverflowMenu.svelte:168. | source, was_gated |
| `viewer_publish_toggled` | ViewerOverflowMenu.svelte:242 (owner-only, gated by buildHeaderActions in viewer-actions.ts:71). | next_state, was_gated |
| `viewer_delete_requested` | ViewerOverflowMenu.svelte:250 opens the confirm dialog. | source |
| `viewer_delete_resolved` | SequenceViewerShell.svelte:770 DeleteConfirmDialog onConfirm / onCancel. | confirmed |
| `viewer_video_upload_opened` | ViewerOverflowMenu.svelte:219 — only reachable when logged in AND VIDEO_UPLOAD_ENABLED. | source |
| `viewer_copy_data_clicked` | SequenceViewerShell.svelte:451 header button and ViewerOverflowMenu.svelte:195 menu item. Admin-only — filter it out of product dashboards. | source |
| `viewer_shared` | ALREADY PARTIALLY EXISTS as logShareAction("sequence_share"/"link_copy") at SequenceViewerOrchestrator.svelte:920 and :929, which routes through captureEvent via posthog-activity-logger.ts:65. Keep that path; just add the shared base props so scan shares are joinable. | share_method, succeeded |
| `viewer_motion_visibility_opened` | MotionVisibilityToggle.svelte:63 (narrow popover trigger only). | source |
| `viewer_motion_visibility_toggled` | MotionVisibilityToggle.svelte:101 chips and the same chips inside the overflow menu (ViewerOverflowMenu.svelte:307). | hand, next_state, source |
| `viewer_rail_resized` | ViewerContentRail.svelte:151 drag end (onPointerUp, :71) and :157 double-click. Fire on commit, never per pointermove. | width_px, method |
| `viewer_canvas_menu_opened` | AnimatorCanvas.svelte:294 long-press and :496 right-click. | open_method |
| `viewer_card_menu_opened` | ChoreoCard.svelte:1692 right-click / :1699 long-press → ChoreoCardContextMenuHost. | open_method, is_export_mode |
| `viewer_card_menu_item_selected` | ChoreoCardContextMenuHost.svelte:46 composed entries — Pictograph visibility toggles plus the Card section (columns, Re-render, Send to, Sticker Lab). | section, item_id, next_state |
| `viewer_export_sidebar_toggled` | SequenceViewerShell.svelte:483 sliders button (desktop, non-card exports only). | next_state, export_kind |
| `card_export_tab_opened` | ExportImagePanel.svelte:233 mobile ControlDock tabs (Labels / Pictograph / Format). | tab, previous_tab |
| `card_export_option_changed` | ONE event for every card-export setting rather than 20 event names — desktop rows ExportImagePanel.svelte:357-526 and the identical mobile chips :247-322. group+option+value keeps it queryable. | group, option, value, layout, step_count, can_qr |
| `video_export_tab_opened` | AnimationPanel.svelte:124 handlePillSelect — effects / props / effort / playback / display / export. | tab, previous_tab, layout |
| `video_export_option_changed` | ONE event for FPS (AnimationPanel.svelte:414), resolution (:432), quality (:455), start/end hold (:470), and the loops stepper (:488). | option, value, direction, render_mode |
| `viewer_export_completed` | QScanPage.svelte:299 after shareOrDownloadBlob resolves, and the failure path at :300. The success/failure counterpart to qr_download_gated. | export_kind, succeeded, duration_ms, delivery, error_message, fps, resolution, loop_count |
| `viewer_export_cancelled` | QScanPage.svelte:782, ExportTakeover.svelte:108/:128, AnimationPanel.svelte:547. | export_kind, phase, progress_pct |
| `viewer_export_retried` | QScanPage.svelte:783 and ExportTakeover.svelte:109. | export_kind, previous_error |
| `viewer_export_saved` | VideoPreviewPanel.svelte:118 Save/Share of a finished MP4 (a second, distinct delivery gesture from the export itself). | export_kind, delivery |
| `video_preview_played` | VideoPreviewPanel.svelte:91 overlay and :109 Replay. | action |
| `video_preview_dismissed` | VideoPreviewPanel.svelte:127 Done. | saved_before_dismiss |
| `viewer_practice_entered` | SequenceViewerShell.svelte:400 (compact) and :436 (labeled). Both force the split view first (SequenceViewerOrchestrator.svelte:1169). | source, chrome, viewer_mode_before |
| `viewer_practice_exited` | SequenceViewerShell.svelte:383 Exit Practice. | source, practice_running, practice_duration_ms, bpm_at_exit |
| `practice_preset_selected` | PracticeSetupBar.svelte:83 segmented control. | preset, increment, rounds_per_level |
| `practice_config_opened` | PracticeSetupBar.svelte:100 gear popover, and the Custom preset path (:61) that opens the same popover. | open_method |
| `practice_started` | PracticeSetupBar.svelte:88 Start practice. | preset, start_bpm, target_bpm, target_enabled, increment, rounds_per_level |
| `practice_level_stepped` | PracticeBar.svelte:163 Slower and :201 Faster. | direction, increment, bpm_after, at_floor, at_ceiling |
| `practice_bpm_popover_opened` | PracticeBar.svelte:177 BPM readout button. | bpm |
| `practice_hold_toggled` | PracticeBar.svelte:217. | next_state, bpm |
| `practice_metronome_toggled` | PracticeBar.svelte:229. | next_state |
| `practice_mirror_toggled` | PracticeBar.svelte:241 — also the only camera-permission surface on /q, so a denial here is worth capturing. | next_state, camera_permission |
| `practice_stopped` | PracticeBar.svelte:255 Stop. | bpm_at_stop, loops_completed, levels_climbed, reached_target, run_duration_ms |
| `viewer_closed` | SequenceViewerShell.svelte:494 close button and the Escape key (SequenceViewerOrchestrator.svelte:967). On /q both navigate to /browse/gallery?from=scan, which then fires the existing scan_app_opened — join them on scan_session_id. | destination, dwell_ms, viewer_mode_at_close, control |
