---
status: active
value: 4
effort: XS
remaining: "Code is complete and live (7bbabbf45, 2026-08-08). Only the spec's own step 3-5 browser proof is unrecorded: inspect the viewer at 1920x1080, 2560x1440, 3840x2160, 1440x900, 820x1180, 960x412 and 375x667, measure the header centre slot and action-group bounds, and exercise the word menu, More menu, Share menu, export transitions and Close. Do NOT re-implement any of this document."
depends_on: "external: a browser session on the shared authenticated Chrome DevTools target"
plan_path: ""
tags: [sequence-viewer, header, responsive, verification-only]
last_triaged: 2026-09-13
---

# Sequence Viewer Header Identity

**Status:** IMPLEMENTED 2026-08-08 in `7bbabbf45` (_feat(viewer): art settings
split, header identity, escape ownership_). Only the seven-viewport visual proof
under "Verification" below is unrecorded. This header previously read "Approved
for implementation on 2026-08-08", which made the spec a rebuild hazard — an
agent taking it at its word would have rewritten live chrome. Corrected
2026-09-13 during spec reconciliation.

> **Do not implement this document.** Read it as the record of a shipped
> decision. The one open item is verification, not code.

**Reconciliation evidence (2026-09-13):** all twelve files under "Planned files"
exist. `7bbabbf45` created `WordActionMenu.svelte` (258 lines), rewrote
`ViewerHeader.svelte` (+988), and cut `SequenceViewerPage.svelte` by 527 lines —
the `/sequence/[id]` migration to `SequenceViewerShell` this design calls for.
In `ViewerHeader.svelte` today: `WordHeader` is composed from the animation
engine (line 12), `FULL_CHROME_MIN_WIDTH = 1080` and
`LABELLED_CHROME_MIN_WIDTH = 1840` are the two density tiers this spec names
(lines 134-135), Favorite carries `aria-pressed` (line 258), and Practice /
Exit Practice, Remix and Favorite are the primary row. `WordActionMenu.svelte`
offers exactly "Copy word" (line 75) and "Read aloud" (line 81).

**Surfaces:** Viewer drawer, QR viewer, and `/sequence/[id]`

## Problem

The center of the viewer header currently names whichever tool is open. It can
read `Sequence Viewer`, `Animation Export`, or `Record Scene` while the same
sequence remains on screen. That makes the header identity unstable and gives
secondary workflow state the most prominent position.

The actions around that title also use several visual languages. Favorite,
Save, Remix, Share, and Close differ in shape, color, borders, and density. The
header mixes primary actions, owner management, navigation, and developer
clipboard tooling at equal weight. The title itself also doubles as the
sequence action menu, mixing word actions with document and management actions.

## Decision

The centered identity is the full simplified TKA word. It uses the animation
engine's existing WordHeader behavior, including active-letter highlighting,
and does not change when the user switches views or opens an export workflow.

Inside the sequence viewer, the live 2D canvas suppresses its duplicate DOM
word band. The animation export pipeline keeps its independent word-header
visibility setting, so the word can still be baked into exported video without
appearing twice in the viewer.

Selecting the word opens only word actions:

- Copy word
- Read aloud

More is reserved for compact widths, where frequent actions no longer fit.
Desktop keeps a four-action primary row: Favorite, Save, Remix, and Practice.
Motion visibility collapses to one utility control. Owner management remains
direct but icon-only. Guide moves to the content rail, and developer clipboard
tooling does not appear in customer viewer chrome.

The action row uses one 44px control grammar. Neutral actions share the same
surface, border, radius, icon weight, focus ring, and hover treatment. State is
shown with semantic color. Share remains the primary action. Close remains a
neutral utility action and gains an error-colored hover state.

## Header hierarchy

| Area   | Contents                                                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Left   | Back or Exit Practice when supplied by the host; otherwise the four primary actions, then eligible contextual utilities after a divider |
| Center | Full TKA word with active-letter highlighting and a small disclosure indicator for word actions                                         |
| Right  | Account entry when applicable, export settings when applicable, Share, and Close                                                        |
| Rail   | Host-specific contextual navigation such as See it in the Guide on full desktop                                                         |

Export and recording state belongs inside the body and export controls. The
word remains the header identity throughout those workflows.

## Responsive behavior

### Full desktop, 1840 CSS px and wider

The four primary actions show an icon and label. Contextual utilities stay
icon-only with tooltips and accessible names. Make Public or Make Private and
Delete exist only for an exact owned library record. A signed-in account avatar
is the Flow Arts Composer launch action, so a second launch button is omitted.
Guide is pinned to the content rail instead of competing with sequence actions.

### Desktop, 1080 through 1839 CSS px

The same eligible actions remain direct, but all use icon-only controls with
tooltips and accessible names. Motion visibility remains one control that opens
the existing Left and Right chips.

### Compact, below 1080 CSS px

Practice, Share, More, and Close remain direct when they apply. Favorite,
Save, Remix, visibility, Guide, and management actions move into More. A guest
may also see Open Flow Arts Composer there. A full account does not because its
avatar already owns that destination.
The word stays centered as long as the physical controls leave a usable center
slot. On the narrowest account-enabled layout, the word glyph may reduce in
width but does not change to a workflow title.

## Stable states

- Favorite keeps a heart icon. The selected state uses the semantic favorite
  color and `aria-pressed`.
- Save keeps a bookmark icon. It switches immediately to Saving with a spinner,
  then remains in place as a disabled Saved state after persistence succeeds.
- Remix uses the shared neutral action surface.
- Practice uses the shared neutral action surface. Exit Practice is the strong
  state because it replaces the row while practice is active.
- Motion visibility uses one neutral trigger. Blue and red appear only inside
  the control because they identify the two motions, not separate actions.
- Visibility uses semantic success color only while the sequence is public.
- Delete stays neutral until hover or focus reveals its destructive state.
- Share uses the existing shared ShareActionMenu behavior and the same geometry
  as the other header actions.
- Close uses the same neutral geometry, with an error-colored hover state.

## Ownership and reuse evidence

Search terms included `Copy word`, `Read aloud`, `WordLabel`,
`getPronunciationPlayer`, `WordHeader`, `wordHeader`, `highlightedStepIndex`,
`ShareActionMenu`, `header-action-btn`, `Copy Data`, and `Make Private`.

- Extend the workspace `WordLabel` word-action behavior into
  `src/lib/shared/choreo-card/components/WordActionMenu.svelte`. Both the
  workspace label and viewer header compose that owner. Clipboard,
  pronunciation, long press, right click, error reporting, and menu semantics
  stay in one place.
- Extend `src/lib/shared/sequence-viewer/components/ViewerHeader.svelte` as the
  presentation owner for viewer header chrome. It composes
  `ViewerOverflowMenu`, `ShareActionMenu`, `MotionVisibilityToggle`, and
  `buildHeaderActions` instead of reproducing their behavior.
- Extend the animation engine's `WordHeader.svelte` with a chrome presentation.
  ViewerHeader composes that owner for glyph loading, repeated-word
  simplification, entrance motion, and active-letter highlighting. The live
  canvas uses its existing `hideHeader` seam; export visibility state is not
  changed.
- Keep `SequenceViewerShell.svelte` as the owner of the overall viewer chrome.
  The header is an internal section composed by the shell.
- Keep `Copy Data` in existing admin and inspection surfaces. The sequence
  viewer does not wire the Claude clipboard helper into its share state.
- Migrate `/sequence/[id]` to `SequenceViewerShell` so it no longer imports and
  assembles viewer internals. Route-only SEO context and swipe dismissal pass
  through narrow shell seams.

This follows current toolbar guidance: frequent actions remain visible,
overflow is used when actions do not fit, and overflow items keep text labels.
The word and More controls follow the ARIA menu-button disclosure pattern.

References:

- [Fluent 2 Toolbar usage](https://fluent2.microsoft.design/components/web/react/core/toolbar/usage)
- [WAI-ARIA Menu Button Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/)

## Planned files

- `src/lib/shared/choreo-card/components/WordActionMenu.svelte`
- `src/lib/features/create/shared/workspace-panel/sequence-display/components/WordLabel.svelte`
- `src/lib/shared/sequence-viewer/components/ViewerHeader.svelte`
- `src/lib/shared/sequence-viewer/components/ViewerOverflowMenu.svelte`
- `src/lib/shared/sequence-viewer/components/MotionVisibilityToggle.svelte`
- `src/lib/shared/sequence-viewer/components/ViewerContentRail.svelte`
- `src/lib/shared/sequence-viewer/components/SequenceViewerShell.svelte`
- `src/lib/shared/sequence-viewer/state/viewer-shell-share-state.svelte.ts`
- `src/lib/shared/composition-root/register-library-repository.ts`
- `src/routes/q/[code]/QScanPage.svelte`
- `src/routes/sequence/[id]/SequenceViewerPage.svelte`
- `tests/unit/sequence-viewer-shell-contract.test.ts`
- Focused component tests for the shared word actions

## Risks

- A centered word can collide with asymmetric action groups. The header uses
  equal outer grid tracks and explicit density tiers, then viewport
  verification checks the center slot.
- Dynamic labels can shift neighboring controls. Ghost sizing or reserved
  widths cover feedback and visibility labels.
- Moving word actions can regress pointer or keyboard access. Existing
  workspace tests continue through the new shared owner and focused tests cover
  click, right click, long press, clipboard, and pronunciation.
- The legacy route currently owns swipe and fullscreen behavior. Its migration
  preserves those host behaviors through shell props and keeps its loading,
  SEO, URL, and handoff logic in the route.

## Verification

1. Run the focused word-action and shell-contract tests with the repository
   Vitest configuration.
2. Run the project type check after the shared-symbol refactor.
3. Use the shared authenticated Chrome DevTools target and inspect the viewer
   at 1920x1080, 2560x1440, 3840x2160, 1440x900, 820x1180, 960x412, and
   375x667.
4. Measure the header center, action-group bounds, control sizes, and horizontal
   overflow. Capture WebP screenshots and inspect each frame.
5. Verify the word menu, More menu, direct desktop actions, Share menu, export
   transitions, and Close behavior without changing the browser window size.
