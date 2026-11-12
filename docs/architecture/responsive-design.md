# Responsive Design Strategy

The rules themselves are stated once, in [layout-law.md](layout-law.md). This page explains the model behind them.

TKA supports small phones, tablets, ordinary desktop windows, and wide
high-density displays. This is the current architecture reference for responsive
composition.

## The model

Responsive design has four independent concerns:

1. **Logical size**: controls and type use CSS pixels and `rem`. A wider viewport does not imply a more distant viewer.
2. **Composition**: available inline space can change columns, rails, gutters, and content bands.
3. **Reading**: text fills its box at normal size. A line that runs too long is fixed by the arrangement, never by a width cap or bigger type.
4. **Presentation distance**: larger viewing-distance UI is an explicit mode, not something inferred from viewport width or device-pixel ratio.

Windows display scaling and browser zoom already map logical CSS pixels to a comfortable physical size. A 3840×2160 panel at 150% scaling commonly exposes about 2560×1440 CSS pixels. Do not magnify that viewport again.

## Typography roles

Typography is stable across desktop widths. Use the global role tokens from `src/app.css` rather than redefining them inside a large-screen query.

| Role                | Token                 | Default         |
| ------------------- | --------------------- | --------------- |
| Compact metadata    | `--font-size-compact` | 0.75rem / 12px  |
| Secondary UI        | `--font-size-sm`      | 0.875rem / 14px |
| Primary UI and body | `--font-size-base`    | 1rem / 16px     |
| Emphasized UI       | `--font-size-lg`      | 1.125rem / 18px |
| Section heading     | `--font-size-xl`      | 1.25rem / 20px  |

Essential UI copy should not fall below 14px. Supplementary metadata may use 12px. Browser zoom scales these roles; viewport width does not.

## Who owns a responsive decision

- Use **container queries** when a component is reacting to the space its parent gives it. Examples: card columns, a detail pane, or a rail that becomes a mobile card list.
- Use **media queries** when the viewport changes the page shell or input model. Examples: the app sidebar, safe-area padding, or a full-screen mobile modal.
- Use bounded `clamp()` values for geometry that genuinely benefits from small fluid adjustment. Do not use viewport-driven `font-size` or redefine global type tokens to magnify a subtree.

The 1680px and 2600px thresholds are composition vocabulary, not scale modes. They may add a column, widen a capped content band, or reveal an auxiliary rail. They must not make the same control or sentence larger solely because the canvas is wider.

## Public and editorial pages

Public pages use one capped shell variable, `--shell-w`, for composition. Full-bleed backgrounds may span the viewport while authored content remains in the shell.

Editorial copy fills the width of its assigned shell, section, or grid column. Do not add a second character-count cap to paragraphs inside that space. When that width would make lines too long, change the arrangement: add a column or put a figure beside the text. Do not enlarge the type. Feature grids and visual showcases may use separate columns without increasing root type size.

## Authenticated app

The app keeps the standard 16px root at every desktop width. Responsive rules may recompose the workspace but may not create a second large-screen typography system.

Workspace artifacts such as a stage, pictograph, timeline, or map can use container-relative geometry when the artifact itself benefits from more room. Keep its controls, labels, dialogs, and surrounding prose on the global UI roles.

## Mobile

Mobile and desktop keep functional parity while allowing different layouts. Use the owning shell or component's actual constraint, not one universal mobile breakpoint. Keep safe areas, readable type, and the tap sizes in [layout-law.md](layout-law.md) even when controls reflow or become full-screen.

## Modals

Use `BaseModal` and the size variants in `modal-tokens.css` before adding custom widths. Modal size controls the content band; it does not authorize a local type ramp. Components inside a modal should react to the modal body with container queries.

Merged from [MODAL_SIZING_STRATEGY.md](../archive/swarm-2026-10-14/MODAL_SIZING_STRATEGY.md) (original directory: `docs/`) on 2026-10-14.

Content requirements and safe viewport bounds constrain both width and height.
A wide but short viewport may need stacked panels or tabs rather than the layout
chosen from width alone. Keep the content reachable when the ideal arrangement
does not fit. The current implementation reference is
`src/lib/shared/foundation/ui/modal/modal-tokens.css`; use its variants and safe
bounds before adding a layout-specific exception.

## Verification matrix

Every responsive visual change is checked at the sizes on the device list in [layout-law.md](layout-law.md). That page holds the only list.

Also check 200% browser zoom for keyboard reachability, clipping, and reflow. Verification records the CSS viewport and computed root font size so a physical panel resolution is never mistaken for a CSS layout width.

## Known-good owners

- `ReleaseNotesTab.svelte`: desktop rail plus container-driven mobile history cards, with stable type roles
- `BaseModal.svelte` and `modal-tokens.css`: modal sizing and mobile fallback
- `public-editorial.css`: public editorial shell and text styles
- `SequenceViewerShell.svelte`: an artifact shell whose visual workspace can grow without magnifying generic UI
