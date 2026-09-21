# About / Composer fusion verification

2026-09-21. Worktree: `E:/tka-about-composer-fusion`.
Branch: `codex/about-composer-fusion`. Implementation is not yet integrated.

## September 21 owner-feedback revision

The changes below supersede the initial implementation/evidence recorded later
in this document. They are live on the same 5174 preview, not on main/5173.

- Corrected the mandala guide's backing-pixel/logical-pixel conversion. The
  painter applies DPR exactly once, even when a late-mounted overlay has a
  different backing size from the prop renderer. Late attachment also sizes the
  overlay to the current render frame. The hero remains the original size.
- Removed the background timer. The picker is labelled `Theme:` and only changes
  the environment on a visitor's selection.
- Added one shared, page-local prop pair with the canonical PropSelectionSheet.
  Hero, Build, Generate and tunnel use it. The 3D scene retains its independent,
  native performer controls; the gallery retains its own existing prop control.
- Put Build and Generate behind one canonical segmented control. Both remain
  mounted so switching modes preserves work. Inactive playback and the hidden
  construction attract act pause. Sequence words sit over their workspaces;
  redundant panel captions are removed. Both players use the same trail preset.
- Replaced the cramped play-phase buttons with PanelButton and made Generate a
  centered primary action. The construction attract act still locates and
  presses the real Build another button.
- Centered and shortened the TKA bridge and section headings. Guide/history/FAQ
  and creator links use the existing button-link treatment.
- Removed the extra 3D effects strip, the double-staff scope paragraph, and the
  biography's grant paragraph/announcement link. Native performer Effects and
  the authentic creator photograph remain.
- Increased the gallery to 88rem on desktop and 56rem at the compact breakpoint.
  At the observed desktop density, its 1,183px internal viewport fits complete
  first and second rows (424px and 446px plus their gap).

### Revision checks

- `npm run check`: 0 errors, 0 warnings after the revision.
- 27 tests passed across six focused files: presentation state (5), presentation
  viewer isolation (1), construct attract act (5), mandala prop alignment (8),
  guide crossfade/pixel conversion (7), and late overlay attachment (1).
  The scale regression exercises DPR 1, 1.2, 2 and 3. The test runner emits the
  existing multiple-Three.js-instance warning; no test failed.
- Svelte components and changed tests formatted; engine files retain their
  existing surrounding style to avoid an unrelated formatting rewrite.
- Browser interaction: took over Build, changed `BC` to `BCA`, played it, switched
  modes and returned without losing it. Generation produced a new 16-count
  sequence. The carried sequence reached the tunnel. The canonical prop drawer
  changed the hero and tunnel to fans. Ocean remained selected while scrolling
  and working with the demos. These controls did not write the page's prop choice
  to global settings.
- Native 3D performer Effects opens its existing color-coded picker. The separate
  strip is absent. Tunnel count and arrangement controls measure approximately
  48px high; the prop trigger is approximately 50px high.
- Direct native-desktop and phone visual inspection performed. The corrected
  hero's guide follows the tip/trail geometry; phone Build choices and Generate
  action are reachable. A discovered tablet overlap between the stacked player
  and action was corrected by increasing the shared stage at that breakpoint.

Final geometry checks (not seven visual approvals):

| CSS viewport | Horizontal overflow | Player-to-footer clearance |
| --- | --- | --- |
| 375 x 667 | 0 | 16px |
| 960 x 412 | 0 | 16px |
| 820 x 1180 | 0 | 16px |
| 1440 x 900 | 0 | 16px |
| 1920 x 1080 | 0 | 16px |
| 2560 x 1440 | 0 | 16px |
| 3840 x 2160 | 0 | 16px |

Fresh screenshots in the evidence directory below use `revision-final-*` and
`revision-phone-*`. The phone Generate action has its own
`revision-phone-generate-action.webp` frame. Frames are scrolled crops; they do
not prove off-screen content. Earlier `revision-*` frames without `final` include
intermediate geometry and should not be treated as final desktop evidence.

A separate screenshot reviewer found one non-blocking concern: the canonical
glowing clear control is visually prominent on the phone Build panel. It remains
the product's existing ClearSequenceButton, with its accessible name, rather
than a new page-specific control. The reviewer could not assess off-screen
controls; the parent separately inspected the phone Generate action and live
native 3D controls. This is limited visual judgment, not an AI-authorship score
or owner approval. Calibration remains NOT CALIBRATED.

The wide-capture and actual 200% zoom limitations below still prevent a complete
visual gate. Phone emulation renders correctly through raw screenshot capture,
but locator clicks in that emulated viewport do not reliably land; interaction
checks therefore use the native viewport, not a claim of tested phone touch.

## Initial implementation (historical)

Both public routes render one `ComposerExperience.svelte`, with their original
route-specific SEO and structured data retained. The existing live hero,
background cycle, construction, generation, tunnel, 3D, gallery, lazy mounts,
sequence ownership, reduced-motion behavior, and capability gates remain.
TKA context precedes construction; scope follows the 3D output; the authentic
creator photograph and factual authorship/grant/contact information close it.
The 2022 date describes TKA's creation, not the application's creation.

## Passed evidence

- `npm run check`: 0 errors and 0 warnings before the final link-grouping-only
  correction; rerun required with the final integration gate.
- Two focused Vitest files: `composer-presentation-state.test.ts` (5 tests),
  `composer-presentation-viewer-isolation.test.ts` (1 test): all 6 passed.
- Prettier checks on all four changed Svelte files and `git diff --check` pass.
- About and Composer metadata compared with their pre-extraction versions;
  original IDs, types, values, feature list, offer, breadcrumbs, and TKA
  disambiguation remain.
- Browser: hero resolves from loading to animated notation; background selection
  changes the actual environment. Manual gamma placement followed by Add M
  produces `Current word: M` and the generator's carried word `M`. Generation
  produces a 16-step result. Tunnel and supported 3D render and animate. Public
  gallery loads actual sequence cards (610 in this observed session).
- Phone: 375x667, no horizontal overflow, uncropped portrait and readable story,
  visible keyboard link focus. Reduced-motion media yields `scroll-behavior:
  auto`. Phone and short landscape hide the 3D viewer and show its explicit
  capability note.
- Seven CSS viewport measurements: 375x667, 960x412, 820x1180, 1440x900,
  1920x1080, 2560x1440, 3840x2160. All have one main, one h1, zero horizontal
  overflow, approximately 44px minimum new-link height, and original portrait
  aspect ratio. These are geometry evidence, not seven visual passes.
- Native desktop captures: CSS1600x900, browser zoom80%, DPR1.2. Directly
  observed hero, notation/build, tunnel, 3D, scope, real gallery, creator.

## Aesthetic review

VR-1, research checked 2026-09-21; reviewer NOT CALIBRATED. Separate reviewer
received the owner's full-fusion requirement and actual desktop frames. It
supported project specificity, hierarchy, real evidence, craft, and product
continuity. It identified detached notation links as a grouping concern. The
links now sit directly under their explanation, alongside the heading; the
parent inspected that correction in the browser. This is scoped professional
judgment, not owner approval or a validated authorship detector.

Screenshots are in the task-owned external evidence directory:
`C:/Users/Austen/.codex/visualizations/2026/09/21/01a0c19d-9d73-7a21-a1c4-4c2b282c9483/fusion`.
Use `desktop-notation-build-corrected.webp` for the final bridge; the earlier
bridge image is retained only as before-correction evidence. Individual frames
are scrolled crops, not claims of absent off-screen content.

## Remaining gate and exact tool limitation

The full visual matrix and actual 200% browser-zoom check remain unassessed.
The selected in-app browser duplicates or crops captures that extend beyond its
native compositor area. Attempts with device metrics, viewport scaling, clip
scaling, lower DPR, and visible-size changes did not yield reliable complete
wide captures. Direct CDP captures at real phone DPR1.5 work; ordinary browser
screenshots misleadingly shrink that phone into the native desktop canvas.
Do not classify those capture defects as application layout failures, and do
not treat the geometry table as visual approval.

The user approved the separate project-owned test Chrome on the follow-up turn.
The dedicated profile launched on9222, but is not connected to the browser
runtime: the supported extension diagnostic reports its browser extension is
not installed. The runtime's only connected Chrome is profile `Austen`, which
was not used. No personal browser, external data, or accounts were changed.
Port5173 was not restarted or replaced. The earlier HTTPS5174 Vite preview was
stopped before that turn ended.

The branch was brought current with local main on the follow-up turn and both
focused Vitest files passed again (6 tests). Development-server slots were
initially occupied by other tasks, so a local production build was attempted.
A slot then freed up; the task-owned build (PID91788) was stopped and the normal
worktree preview started. No build was deployed.

## Live delivery preview

- URL: `https://localhost:5174/about` (also `/composer`).
- Worktree: `E:/tka-about-composer-fusion`.
- Detached task-owned Node/Vite PID104116; port5174, IPv6 HTTPS.
- Started 2026-09-21 14:13 America/Chicago, with `TKA_VITE_PORT=5174` and strict
  port selection. Port5173 remains untouched.
- Logs: `.fusion-preview.out.log` and `.fusion-preview.err.log` in the worktree.
- HTTP200 and actual rendered DOM confirmed the fused page, including all demos,
  TKA bridge, scope, and creator story. The in-app tab is marked as a deliverable.
- Keep this preview alive for Austen's review. It reserves one agent-owned Vite
  slot. Stop it only after successful integration supersedes it or Austen
  finishes the task. Verify PID/command identity before stopping it.

This delivery follows the updated repository lifecycle permitting persistent
worktree previews; incomplete wide-screen/200% verification is still not a pass.

After the remaining visual checks, bring the branch current with local main,
repeat only invalidated checks, and use the guarded project finish workflow:
`npm run wt:finish -- codex/about-composer-fusion --route /about` from the primary
checkout. Do not claim the updated page is on5173 until that integration succeeds.
