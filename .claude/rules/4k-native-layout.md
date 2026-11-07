---
paths:
  - "src/**/*.{svelte,css}"
---

# 4K Is Home: Composition, Not Auto-Zoom — ENFORCED

## What 4K Means

TKA must feel composed on a wide display without assuming that screen width is
viewing distance. Windows display scaling and browser zoom already map CSS
pixels to comfortable physical sizes. A 3840×2160 panel at 150% scaling commonly
exposes about 2560×1440 CSS pixels.

| Real setup            | Approximate CSS viewport | Required response                                 |
| --------------------- | ------------------------ | ------------------------------------------------- |
| 4K at 200% OS scaling | 1920×1080                | desktop composition                               |
| 4K at 150% OS scaling | 2560×1440                | wider composition band and optional extra columns |
| 4K at 100% OS scaling | 3840×2160                | native wide-canvas composition                    |

The third setup does not prove the viewer is across the room. If a jam, kiosk,
or TV needs distance-readable UI, that is an explicit presentation mode.

## The Four Independent Concerns

1. **Logical size**: generic UI type and controls use stable CSS-pixel/rem roles.
2. **Composition**: columns, rails, gutters, and content bands respond to space.
3. **Reading measure**: prose keeps a comfortable maximum line length.
4. **Presentation distance**: deliberate magnification belongs to an explicit mode.

Never use one mechanism to impersonate another.

## The Shared Mechanisms

1. **Global typography roles** in `src/app.css` own generic UI type. The root is
   16px at every viewport width; browser zoom remains the user's scale control.
2. **`--shell-w`** in `src/app.css` owns the public composition band. Full-bleed
   backgrounds may span the viewport while authored content uses the band.
3. **Editorial measures** in `editorial-measure.css` own prose, lede, and note
   line length. They are maximums and collapse naturally on small screens.
4. **Container queries** own component-local recomposition. Media queries own
   viewport shell and input-mode changes.

The 1680px and 2600px seams are composition vocabulary, not scale modes. Keep a
large-screen tier when it adds a column, changes grid areas, widens a capped
band, or reveals an auxiliary rail. Remove it when it only enlarges type,
controls, padding, or gaps.

## Surface Rules

- **Authenticated app**: keep the 16px root and global type roles. More canvas
  may reveal more information or workspace, but the same button stays the same
  logical size.
- **Public pages**: use `--shell-w` for page composition and the editorial
  measure tokens for reading. A visual grid may be wide; prose may not stretch
  merely to fill the band.
- **Mobile**: preserve feature parity, touch targets, safe areas, and readable
  type while allowing layout to reflow or become full-screen.
- **Artifacts**: stages, pictographs, maps, timelines, and other visual workspaces
  may scale their content relative to their container. Their surrounding UI and
  prose stay on the global roles.

## Wide-Canvas Composition

1. Use the available canvas intentionally. A capped reading column can sit in a
   generous shell with balanced rail or supporting content.
2. Avoid accidental orphan rows for known fixed item counts. Choose deliberate
   column counts at each composition tier.
3. Keep one authored composition band per page. Smaller reading measures live
   inside that band; they do not create competing page shells.
4. Use vertical space as part of the composition, without enlarging controls to
   consume it.

## Verification

New surfaces and cross-breakpoint layout changes must be verified at these CSS
viewports. A local visual fix that cannot affect responsive composition uses
only the affected tiers and states, as defined by
`visual-verification-mandatory.md`:

- 375×667
- 960×412
- 707×772 (Fold unfolded, upright)
- 820×1180
- 1440×900
- 1920×1080
- 2560×1440
- 3840×2160

For new or responsive layouts, also check 200% browser zoom for reflow,
clipping, keyboard reachability, and dialog access. Record the CSS viewport and
computed root font size in the evidence. A physical monitor resolution is not a
viewport measurement.

## Forbidden

- A viewport-driven root font-size ramp for ordinary app, marketing, legal, or
  settings UI.
- Redefining `--font-size-*` tokens inside a large-screen media or container query.
- Enlarging the same control because `min-width: 1680px` or `2600px` matched.
- Inferring viewing distance from viewport width, device-pixel ratio, or physical
  panel resolution.
- Stretching paragraphs across a wide shell to eliminate empty rail.
- A hard content band that never grows on wide screens unless the surface is a
  deliberate reading or media measure.
- Shipping a new surface or cross-breakpoint layout change without the full
  viewport pass, or a focused visual fix without its affected tiers and states.

## Related

- `docs/architecture/responsive-design.md`
- `no-layout-shift.md`, `never-hand-roll.md`, `verification-protocol.md`
