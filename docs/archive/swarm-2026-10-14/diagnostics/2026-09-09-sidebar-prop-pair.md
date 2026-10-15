# Sidebar prop pairs

The desktop footer and mobile/side navigation now show both selected props,
using the saved primary colors, fan build, model look and applicable chirality.
Mixed prop selections keep separate slots. The existing Prop Button Lab tunes
the same composition renderer; its saved overrides still take precedence.

Fan artwork is cropped to its painted window and arranged as an outward-facing,
diagonally offset pair. Alpha coverage is strengthened at icon size so the thin
spokes and flat grips stay visible without changing the chosen colors.

Review route: `/test/sidebar-props`. Shipping surface: `/create` navigation.

Verified with Chrome DevTools in the dedicated agent browser:

- Inspected 375×667, 960×412, 820×1180, 1440×900, 1920×1080, 2560×1440 and
  3840×2160. The glyph stayed 40×40, with no horizontal overflow.
- Mounted the production SidebarFooter in collapsed and expanded states using
  local fixture settings. Both images resolved to `fan-flat-grip.svg`; their
  SVG colors were exactly `#36d6c5` and `#ff8dba`. The button remained 44×44.
- Clicking the production button set the existing prop drawer's open state.
- Switched between Pictograph and Flat Grip Fire using the picker. Both image
  sources changed and the glyph dimensions stayed fixed.
- Changed only the left color to orange using the picker. The left filter
  became `#f97316`; the right remained `#ff8dba`.
- 16 focused tests passed across primary colors, render appearance and tile/glyph
  artwork. Svelte check reported zero errors and zero warnings.

An additional existing chirality contract suite had two failures because it
expects chirality markup inside BentoPropGrid, which now delegates to PropGrid.
That file is unchanged by this task; the other 17 assertions passed.

## Family and variant refinement

The gallery now shows all 40 active prop types across 19 registry families,
expanded to 50 choices by the six fan builds for both fan sizes. Each choice
has an enlarged preview and actual 36px mobile and 40px sidebar glyphs. Shared
controls expose both colors, artwork mode, buugeng grip and fan covers.

Compact recipes give clubs an upright V, torches and swords a crossing pose,
buugengs parallel curves, and double stars/eight rings separate vertical pairs.
Hands and three-part shapes have more separation. Single contact balls retain
two distinct circles; double-contact variants retain four. Existing staff
crosses and the fan arrangement remain. Variant recipes now take precedence
over base-family defaults, so torches, trigengs and double-contact variants
keep their intended poses. Saved lab overrides remain intact.

Navigation crops remove invisible artwork and unused canvas from 16 notation
variants. Big Fan's notation artwork uses its own canvas, while physical fan
builds retain their measured crop. Oppositely oriented model captures receive
a navigation-only rotation. Model silhouettes get slightly stronger alpha
coverage; the fire staff uses its equivalent vector silhouette because the
capture's thin shaft disappears at 36px. Picker and choreography artwork are
unchanged.

Verification: inspected every gallery choice in pictograph and model modes,
all six fan builds, covered fans, and flipped buugeng grips using Chrome DevTools.
The seven viewport sizes listed above each rendered 50 cards without horizontal
overflow. Also inspected mobile cards and 200% CSS zoom. No browser console
errors. The focused artwork and composition suites passed all 24 tests; Svelte
check reported zero errors and warnings.

## Change Prop picker parity

The account-backed picker now passes primary colors into its production grid.
Family and variant tiles use the same paired renderer as navigation, including
fan builds, artwork crops, saved arrangements and each hand's chirality. The
former duplicate grid renderer is now a thin adapter to that shared owner.
Metadata-only pickers retain their neutral presentation.

A picker governing one Cat Dog hand previews one prop in that hand's color.
The A/B controls also use the shared cropped artwork and exact custom color,
replacing their baked blue image and approximate red hue filter.

Verified the production PropGrid with disposable local fixture state at
1440x1100 and 375x812. Family drill-down and Torch/Trigeng selection worked;
changing left green to orange changed tile and chirality colors while right
remained red. Left/right modes rendered one corresponding hand per tile.
Paired mode rendered both, and the grip controls updated the chosen silhouette.
No horizontal overflow or browser console errors. All 28 focused color,
composition and artwork tests passed, and Svelte check was clean.

## Detail-preserving color correction

The shared alpha flood and dilation introduced above erased guitar accents and
expanded the double star's outline. Paired vector previews now use the canonical
SVG color transformer, preserving original paths, cutouts, white strings and fan
wick materials. Custom colors change the painted body or fan frame. Larger
picker artwork has no edge-strengthening filter; only fans at 40px or smaller
receive extra alpha coverage for their fine spokes, without dilation.

Captured model previews use a color matrix based on the capture palette instead
of an alpha silhouette. It preserves neutral details and edge alpha while
recoloring chromatic paint. The existing poses, crop windows, selected builds
and per-hand settings remain in use.

Verified the production PropGridButton with guitar, ukulele, chicken, both
double stars and flat-grip fans at 1440x1000 and 375x812, alongside 36px and 40px
navigation previews. Strings, cutouts and separate star interiors are visible.
Changing left green to orange preserved right red; all 36 fixture images loaded
and there was no horizontal overflow or browser console warning/error. Also
inspected gallery vectors, fan builds and model guitar/star/ring previews.
All 35 focused color, composition and artwork tests passed.
