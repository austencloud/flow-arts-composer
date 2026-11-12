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
3. **Reading**: text fills its box at normal size. A line that runs too long is
   fixed by the arrangement, never by a width cap or bigger type.
4. **Presentation distance**: deliberate magnification belongs to an explicit mode.

Never use one mechanism to impersonate another.

## The Shared Mechanisms

1. **Global typography roles** in `src/app.css` own generic UI type. The root is
   16px at every viewport width; browser zoom remains the user's scale control.
2. **`--shell-w`** in `src/app.css` owns the public composition band. Full-bleed
   backgrounds may span the viewport while authored content uses the band.
3. **Arrangement** owns line length. Text fills the column it is given. When a
   column would make lines too long, the screen gains a second column or a
   figure beside the text. There is no paragraph width cap.
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
- **Public pages**: use `--shell-w` for page composition. Text fills its
  column. On a wide band, add a column or a figure so no line runs too long
  and no blank strip is left beside the text.
- **Mobile**: preserve feature parity, safe areas, readable type, and the tap
  sizes in `docs/architecture/layout-law.md` while allowing layout to reflow
  or become full-screen.
- **Artifacts**: stages, pictographs, maps, timelines, and other visual workspaces
  may scale their content relative to their container. Their surrounding UI and
  prose stay on the global roles.

## Wide-Canvas Composition

1. Use the available canvas intentionally. On a wide shell, text shares the
   band with a second column, a figure, or supporting content.
2. Avoid accidental orphan rows for known fixed item counts. Choose deliberate
   column counts at each composition tier.
3. Keep one authored composition band per page. Columns live inside that
   band; they do not create competing page shells.
4. Use vertical space as part of the composition, without enlarging controls to
   consume it.

## Verification

New surfaces and cross-breakpoint layout changes must be verified at every
size on the device list in `docs/architecture/layout-law.md`. A local visual
fix that cannot affect responsive composition uses only the affected tiers and
states, as defined by `visual-verification-mandatory.md`.

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
- One column of text stretched across a wide shell, or a paragraph capped
  narrower than its box. Rearrange instead.
- A hard content band that never grows on wide screens unless the surface is a
  deliberate media size.
- Shipping a new surface or cross-breakpoint layout change without the full
  viewport pass, or a focused visual fix without its affected tiers and states.

## Related

- `docs/architecture/layout-law.md` (every layout rule in one line, and the
  device list)
- `docs/architecture/responsive-design.md`
- `no-layout-shift.md`, `never-hand-roll.md`, `verification-protocol.md`
