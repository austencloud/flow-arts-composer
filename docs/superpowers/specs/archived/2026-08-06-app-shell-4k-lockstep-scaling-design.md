# App Shell 4K Lockstep Scaling

**Date:** 2026-08-06  
**Status:** Superseded on 2026-08-27; do not implement
**Origin:** [Gallery + Library Shared Filter Workspace handoff](../2026-08-06-gallery-library-shared-workspace-handoff.md)

> This proposal treated viewport width as a proxy for viewing distance. It was
> superseded by [Logical-Pixel Responsive Composition](2026-08-27-logical-pixel-responsive-composition-design.md),
> which keeps the app root at 16px and uses wide viewports for composition.

## Outcome

Give the authenticated application the existing 16px to 24px root-font ramp
used by the public site. The ramp starts at a 1680px-wide CSS viewport, reaches
24px at 3840px, and only runs when the viewport is at least 45rem tall.

The selector must be scoped to `html:has(.tka-app)`. A universal `html` rule
would also catch guide artboards, standalone tools, and test pages with
their own scale policies.

## Current evidence

- `src/app.css` applies the shared curve to `.mkt-shell` and
  `.legal-container`. The height-gated copy applies only to `.qft-app`.
- `MainApplication.svelte` mounts one unique `.tka-app` root around the app
  shell. `MainInterface.svelte` is mounted inside it after the initial loading
  state.
- The formula already in production is
  `clamp(16px, calc(16px + (100vw - 1680px) * 8 / 2160), 24px)`.
- The browse handoff's five-file workaround list is incomplete for a universal
  root rule. A source audit found 22 feature/shared files with a
  `min-width: 2600px` tier. Several contain type and spacing bumps written
  because the app root stayed at 16px.
- `src/routes/test/sequence-combinator/+page.svelte`, omitted from the
  handoff's list, applies `zoom: 1.5` at 2600px. A universal root ramp would
  multiply that test page. The `.tka-app` boundary leaves it alone.

## Design decision

Extend the existing height-gated full-screen-app rule:

```css
@media (min-width: 1680px) and (min-height: 45rem) {
  html:has(.qft-app),
  html:has(.tka-app) {
    font-size: clamp(16px, calc(16px + (100vw - 1680px) * 8 / 2160), 24px);
  }
}
```

Keep the marketing and legal rule width-only. Those pages scroll and can grow
taller. The application, QfT, canvases, split panes, drawers, and creation
workspaces fit themselves to the viewport, so the height guard stays on their
root scale.

Media-query `rem` units resolve from the initial font metrics. The 45rem guard
therefore remains a stable 720 CSS pixels even after the root font changes.

### Why `.tka-app`

The app path is:

```text
[...appPath]/+page.svelte
  -> AppShellLoader.svelte
  -> MainApplication.svelte
  -> .tka-app
  -> MainInterface.svelte
  -> active feature module
```

`.tka-app` is unique in current source and surrounds app chrome, feature
modules, drawers, and overlays. It excludes these independently owned roots:

- `.mkt-shell` and `.legal-container`
- `.guide-layout` and fixed-inch guide/print artboards
- `.qft-app`
- `/endless-spinner`
- `/test/*` pages, including effect-grid and sequence-combinator
- public sequence and QR routes

## Standards basis

- [`clamp()`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/clamp)
  and viewport-relative lengths are established CSS features for bounded fluid
  sizing.
- [CSS Values and Units Level 4](https://drafts.csswg.org/css-values-4/)
  defines root-relative lengths, viewport lengths, and comparison functions.
- [Selectors Level 4](https://drafts.csswg.org/selectors/#relational)
  defines `:has()` as the relational selector already used by the existing
  ramp.
- The [`height` media feature](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/height)
  supports the minimum-height guard.
- [WCAG 2.2 resize-text guidance](https://www.w3.org/WAI/WCAG22/Understanding/resize-text)
  requires 200% text enlargement without lost content or functionality. The
  browser-zoom pass remains part of verification.

No new component, utility, or package is needed. This reuses the root-ramp
mechanism already owned by `src/app.css`.

## Reconciliation scope

### Known direct compensation to remove or retune

These files state that their local scale exists because the app root does not
ramp:

| File | Existing compensation | Intended treatment |
|---|---|---|
| `src/lib/features/creators/components/CreatorsPanel.svelte` | Container-driven child font ramp plus local `em` font tokens | Remove the local multiplier and consume root `rem` tokens |
| `src/lib/features/creators/components/UserProfilePanel.svelte` | `font-size: clamp(1rem, 0.62cqi, 1.5rem)` plus local `em` font tokens | Remove the panel multiplier and token shadowing |
| `src/lib/features/lab/tabs/combinator/CombinatorLab.svelte` | Scale-only 2600px tier for type, controls, and step size | Remove or reduce scale declarations; keep real recomposition |

### 2600px tiers to audit in the app shell

Do not delete these blocks mechanically. Keep rules that change composition,
grid count, available width, or fixed pixel floors. Remove or retune rem-based
type and spacing bumps that only compensated for a 16px root.

| Surface | Candidate files |
|---|---|
| Browse | `src/lib/features/browse/gallery-home/CategoryTile.svelte`; `src/lib/features/browse/collections/components/SmartCollectionBuilderSheet.svelte` |
| Create | `src/lib/features/create/construct/start-position-picker/components/BuildStartPosition.svelte`; `PictographGrid.svelte`; `StartPositionPicker.svelte`; `src/lib/features/create/construct/tutorial/components/ConstructGuideEntry.svelte`; `src/lib/features/create/generate/components/CardBasedSettingsContainer.svelte`; `GenerateEmptyState.svelte`; `src/lib/features/create/shared/components/StandardWorkspaceLayout.svelte` |
| Shared controls | `src/lib/shared/pictograph/grid/components/PropPlacementGrid.svelte`; `src/lib/shared/components/LevelSelector.svelte`; `src/lib/shared/attract/components/GhostPointer.svelte`; `ThoughtCaption.svelte` |
| Settings and admin | `src/lib/shared/settings/components/WhatsNewModal.svelte`; `src/lib/shared/settings/components/tabs/ProfileTab.svelte`; `src/lib/features/admin/components/AdminAccountControls.svelte`; `AdminProfileMetadataEditor.svelte`; `ProfileAdminSection.svelte`; `UserActivityAnalytics.svelte`; `UserDetailModal.svelte` |
| Choreo card | `src/lib/features/choreo-card/components/scan-activity/ScanActivityTab.svelte` |

The audit rule is declaration-level:

- Keep a tier that recomposes columns or gives a large viewport more usable
  width.
- Keep pixel values that are true touch floors, borders, or source-resolution
  limits.
- Convert a pixel value when it represents an element that should follow the
  root scale.
- Remove a type or spacing bump when the root ramp now supplies the same
  multiplier.
- Measure before and after when intent is mixed in one block.

### Explicit exclusions

Leave these local ramps in place because the scoped selector does not reach
them:

- `src/routes/test/effect-grid/+page.svelte`
- `src/routes/endless-spinner/+page.svelte`
- `src/routes/test/sequence-combinator/+page.svelte`
- QfT and Poi test-page root ramps
- guide root scaling in `guide.css`

Also leave `ShopComingSoon.svelte` and `SpinnerModeToggle.svelte` alone. They
consume an existing route root ramp and do not create another multiplier.

## Implementation plan

1. Add a focused CSS contract test that locks the `.tka-app` selector, the
   1680px to 3840px curve, and the 45rem height guard.
2. Add `.tka-app` to the existing full-screen-app selector in `src/app.css`.
3. Remove or retune the three documented in-app multipliers.
4. Audit the candidate 2600px blocks declaration by declaration. Preserve
   composition rules and reconcile scale-only rules.
5. Run the computed-style and screenshot matrix. Fix overflow, clipping,
   undersized fixed-pixel elements, and overgrown controls found in the frames.
6. Run the focused contract test, affected unit suites, one machine-wide
   `npm run check`, and the full test suite if shared-component edits warrant
   it.

## Verification contract

### Computed root size

For an app route at normal browser zoom:

| Viewport | Expected root font |
|---|---:|
| 1440 x 900 | 16px |
| 1920 x 1080 | 16.89px |
| 2560 x 1440 | 19.26px |
| 3840 x 2160 | 24px |
| 960 x 412 | 16px |
| 3840 x 719 | 16px |
| 3840 x 720 | 24px |

The 3840 x 719/720 pair proves the height guard directly. The required
960 x 412 frame remains useful for narrow-screen composition, but its width is
already below the 1680px ramp seam.

### Visual matrix

Use Chrome DevTools MCP with a task-owned tab and the existing
`https://localhost:5173` server. Assert `innerWidth`, `innerHeight`, root font
size, and `scrollWidth <= innerWidth` before each screenshot.

Run the full seven-viewport table from
`.claude/rules/visual-verification-mandatory.md` on these representative app
surfaces:

- `/create/construct` and `/create/generate`
- `/browse/gallery` and `/browse/library`
- `/learn/concepts`
- `/museum/play`
- `/train/practice`

Run 1920 x 1080, 2560 x 1440, 3840 x 2160, and 3840 x 719 checks on the local
compensation surfaces:

- `/creators`, including one creator profile
- `/lab/combinator`
- `/settings/profile`, including What's New when reachable without changing
  account state
- the smart-collection builder
- start-position selection in Construct

Each frame must be checked for clipped chrome, controls wider than their
content, stranded grid rows, dead space, internal scroller loss, unreadable
fixed-pixel glyphs, and canvas or notation content running under footers.

At 200% browser zoom, verify that content and controls remain reachable on one
representative workspace and one modal.

## Risks and controls

| Risk | Control |
|---|---|
| A local 4K tier multiplies the new root | Reconciliation audit plus 2560/3840 measurements |
| Full-window surfaces lose vertical room | 45rem guard plus 3840 x 719/720 boundary check |
| Fixed pixel elements stay visually small | Sample px values in affected 4K blocks and convert only semantic scale values |
| A rem-based container query changes its effective threshold | Record the active query state at 1920, 2560, and 3840 before accepting the frame |
| Root scaling causes horizontal overflow | `scrollWidth <= innerWidth` on every required viewport |
| Browser zoom loses content | 200% zoom reachability check |
| Parallel work is overwritten | Recheck `git status`; do not edit any dirty candidate file until its owner lands or clears it |

## Current checkout conflict

`src/lib/features/create/shared/components/StandardWorkspaceLayout.svelte` is
currently modified by another session. Its uncommitted change is outside the
2600px CSS block, but project rules treat the file as owned by that session.
Implementation must leave it untouched until the overlap clears. The dirty
`effect-grid/+page.svelte` file is outside this scoped design.

## Acceptance criteria

- App routes compute the expected root sizes at the width and height boundaries.
- Public, guide, print, QfT, and standalone test-route scale policies do not
  change.
- The three documented in-app multipliers no longer compound the root.
- Scale-only 2600px declarations have been reconciled on every sampled app
  surface; structural 4K composition remains.
- No horizontal overflow appears in the required viewport matrix.
- Fixed-height workspaces keep their controls and content reachable.
- Browser zoom to 200% loses no content or functionality in the sampled
  workspace and modal.
- Focused tests, typecheck, and any affected suites pass.
- Browser screenshots, computed-style output, and test output provide the
  completion evidence.
