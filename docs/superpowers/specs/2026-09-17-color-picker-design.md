# Prop color picker redesign

Date: 2026-09-17. Surface: `LabeledColorPairPicker` and every caller.

## Problem

The preset strip in `LabeledColorPairPicker` is `repeat(auto-fit, minmax(44px, 1fr))`
over 16 presets. Any container width that does not divide 16 leaves a stranded
row (14 + 2 at the settings-tab width). The presets are an unordered set of
Tailwind colors with six near-duplicates, so even a full row reads as noise.
Fine-tuning is the OS-native `<input type="color">`, which looks nothing like
the app and has no keyboard model. There is no way to see the chosen pair on the
actual prop while picking.

## Ownership record (never-hand-roll)

Search terms: color picker, color pair, prop colors, swatch, preset, hex,
eyedropper, hue, `onchange(hand, value)`, `LabeledColorPairPicker`,
`ProfileColorPicker`, `ColorOverridePicker`, `ClipAppearanceSection`.

Closest matches: `LabeledColorPairPicker` (canonical pair owner, four
consumers), `ProfileColorPicker` (single color, same `COLOR_PRESETS`),
`ColorOverridePicker` (test route, takes `presets`), `ClipAppearanceSection`
(local six-color list, out of scope).

Decision: **extend the owner.** `LabeledColorPairPicker` stays the pair-color
capability. The saturation/value area, hue slider, drag, touch, and slider
keyboard semantics come from the maintained MIT package
`svelte-awesome-color-picker@4.1.3` (Svelte 5 native, released May 2026),
composed inline. Nothing in this spec creates a second picker.

`COLOR_PRESETS` keeps its `{ hex, name }` shape so `ProfileColorPicker` and
the character playground keep working; they gain the new palette for free.

## Swatch matrix

`scripts/generate-color-presets.mjs` writes
`src/lib/shared/ui/color-presets.ts`. It runs once by hand; the output is
committed. The generator converts OKLCH to sRGB (Ottosson's published
matrices) and reduces chroma until the color fits the sRGB gamut, so every hue
in a row lands at the same perceived lightness.

- 12 hues, 30° apart, starting at 25° so red, orange, yellow, green, cyan,
  blue, violet, and pink each get a column.
- 4 rows, in this order: light (L 0.82, C 0.11), vivid (L 0.66, C 0.22 before
  gamut clip), deep (L 0.48, C 0.16), neutral (12 greys from white L 1.00 to
  black L 0.00, evenly spaced in L).
- 48 swatches. 48 divides by 12, 8, and 6, so the grid never ends on a short
  row at any of the three column counts below.
- Each entry: `{ hex, name, row }` where `row` is `"light" | "vivid" | "deep" |
  "neutral"` and `name` is e.g. `"Light red"`, `"Red"`, `"Deep red"`,
  `"White"`, `"Grey 80"`, `"Black"`.
- `COLOR_PRESET_COLUMNS = 12` is exported alongside.

Unit test (`tests/unit/color-presets.test.ts`): 48 entries, all
`#rrggbb` lowercase, all unique, rows appear in the fixed order with 12 each,
first neutral is `#ffffff`, last is `#000000`.

## Component

`LabeledColorPairPicker` keeps its props (`left`, `right`, `leftLabel`,
`rightLabel`, `groupLabel`, `onchange`) and adds:

- `preview?: Snippet<[{ left: string; right: string }]>`: rendered above the
  gradient bar when provided. Callers that already show the art (tunnel,
  mandala) pass nothing.

Layout, top to bottom:

1. Preview slot (optional).
2. Gradient bar (existing).
3. Controls row: `[Left prop] [swap] [Right prop]`,
   `grid-template-columns: minmax(0,1fr) auto minmax(0,1fr)`. The swap button
   is a 44px icon button (`fas fa-right-left`), `aria-label="Swap left and
   right colors"`, and calls a new optional `onswap: () => void` prop once.
   Two sequential `onchange` calls would not do: several callers rebuild the
   whole pair from a snapshot that is stale by the second call. The button
   only renders when `onswap` is provided. Under the existing 19rem container
   query the row stacks and the swap button centers between the two controls.
4. Editor (when a hand is being edited, same toggle as today), a grid with two
   areas:
   - **Swatches**: the swatch block is its own inline-size container.
     `grid-template-columns: repeat(var(--cols), minmax(0,1fr))` with
     `--cols: 12` at or above 33rem of swatch-block width, `8` from 22rem,
     `6` below. Gap 4px. Those thresholds keep every swatch at 40px or wider
     (6 cols at the 19rem sidebar floor is 44px). Each swatch is a `button`
     with `aria-pressed`, `title={name}`, `aria-label="{hand label}: {name}"`,
     square via `aspect-ratio: 1`, the check mark on the pressed one. The
     current 44px minimum goes away; the matrix sizes to its columns.
   - **Fine tune**: `ColorPicker` from `svelte-awesome-color-picker` with
     `isDialog={false}`, `isAlpha={false}`, `isTextInput={false}`,
     `sliderDirection="horizontal"`, `hex={value}`, `onInput` forwarding
     `hex` to `onchange(hand, hex)`. A local `BareWrapper.svelte` (a plain
     `div` that renders children) replaces the library's bordered popup
     wrapper via `components={{ wrapper: BareWrapper }}`. The fine-tune
     column is an inline-size container and sets `--picker-width: 100cqi`,
     `--picker-height: 160px`, `--slider-width: 14px`, `--picker-radius:
     10px`, `--focus-color: var(--theme-text)`, and the `--cp-*` colors from
     the `--theme-*` tokens.
   - Below the fine-tune area: the hex field (existing validation and blur
     reset) and, when `"EyeDropper" in window`, an eyedropper button
     (`fas fa-eye-dropper`, `aria-label="Pick a color from the screen"`) that
     opens `new EyeDropper().open()` and forwards `sRGBHex` lowercased; an
     `AbortError` is ignored. When the API is absent, the existing "More
     colors" native-input button stays as the fallback. Never both.
   - The editor is its own inline-size container. At or above 52rem it is
     two columns: swatches `minmax(0, 1fr)`, fine tune `16rem`, gap 12px,
     which leaves the swatch block at least 33rem wide (12 columns). Below
     that it stacks, swatches first.

All interactive elements keep the existing focus-visible outline. No new
theme variables; only `--theme-*` tokens and the library's documented vars.

## Callers

- `PrimaryPropColorSettings` gains `leftPropType` and `rightPropType` props
  and passes a `preview` snippet that renders `PropCompositionPreview` with
  `pairedGlyph`, `darkBackground={darkMode}`, `propType={leftPropType}`,
  `rightPropType`, and `colors={{ left, right }}`. `PropTypeTab` passes
  `selectedLeftPropType` / `selectedRightPropType`. The other three
  `PrimaryPropColorSettings` callers pass nothing and get no preview.
- `TunnelColorSettings` (both pickers) and `MandalaCategoryControl` pass an
  `onswap` that writes both hands from one snapshot.
- `/test/sidebar-props`: passes a preview snippet using the first family and
  gains a width toggle (`SegmentedControl`: Full / 30rem / 19rem) that wraps
  the picker in a max-width box, so every column count (12 / 8 / 6) is
  reachable on one page.

## Tests

`LabeledColorPairPicker.svelte.test.ts` (vitest-browser-svelte, same harness
as `SegmentedControl.svelte.test.ts`):

- opening a hand and clicking a swatch calls `onchange` with that hand and hex;
- the pressed swatch matches the current value;
- swap calls `onswap` once; without `onswap` there is no swap button;
- ArrowRight on the hue slider fires `onchange` with a valid hex;
- a valid hex typed in the field fires `onchange`; an invalid one does not;
- no axe violations with the editor open.

## Verification

Full visual pass (shared primitive geometry) on `/test/sidebar-props` at the
seven contract tiers, plus the real settings surface (prop tab) at 375, 1440,
and 2560 wide. Check: no stranded swatch row at any width, 44px touch targets
on controls, hue drag and arrow keys move the value, eyedropper button appears
in Chromium, console clean. Screenshots go in the verification evidence.

## Out of scope

`ClipAppearanceSection`'s local six-color list, `ProfileColorPicker` layout,
alpha, saved custom swatches, and harmony suggestions.
