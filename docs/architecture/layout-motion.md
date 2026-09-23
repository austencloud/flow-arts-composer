# Layout motion

Layout motion is an interaction contract, not decoration. It connects two
states so the eye can follow what moved, appeared, disappeared, or changed
size. Flow Arts Composer prevents meaningless movement and animates meaningful movement.

## One system, shared owners

| Geometry change                                          | Owner                                    | Why                                                                            |
| -------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| True content swap                                        | `Crossfade.svelte`                       | Holds both states in one box; `animateHeight` carries a material height change |
| One element enters/leaves normal flow                    | `growFade()`                             | Animates the element's own box and opacity                                     |
| Flex workspace panel enters/leaves or changes allocation | `PanelGroup.svelte` + `flexPresence()`   | Moves the neighbouring panels on the same clock as the entering/leaving panel  |
| Keyed list reorder                                       | Svelte `animate:flip` + `flipDuration()` | Svelte already owns stable keyed geometry                                      |
| Several surviving elements recompose                     | `createLayoutMotion()`                   | Captures old rectangles and animates survivors across grids or keyed families  |
| A content-sized dialog changes its natural height        | `BaseModal` with `animateSize`           | Keeps the dialog frame continuous without scaling or remounting its contents   |

Small non-reflowing overlays use `flyFade()` or `popIn()`. Route/module
navigation keeps using the native view-transition rules in the app CSS.

All JavaScript durations come from `DURATION` in
`shared/transitions/transitions.ts`. CSS uses the matching
`--transition-*` tokens in `src/app.css`. The helpers in `motion.ts` collapse
their duration when the user prefers reduced motion.

## Decision order

1. Ask whether the movement communicates anything.
2. If it does not, reserve geometry. A label, counter, image, or spinner should
   not move its neighbours simply because its content changed.
3. If it does, choose the narrowest owner from the table.
4. Check interruption. A second click halfway through must continue from the
   visible frame, not jump to an old endpoint.
5. Check reduced motion and direct manipulation. Dragging follows the pointer;
   reduced motion reaches the final state immediately.

## Structural panels

`PanelGroup` writes `flex-grow`, `flex-shrink`, and `flex-basis` separately so
those allocations can transition. A fixed dock changes `flex-basis`; an editor
changes `flex-grow`; mount/unmount uses `flexPresence`. Resize-handle slots use
`growFade`, and direct pointer drag temporarily disables easing so the divider
does not lag behind the hand.

Feature code supplies panel definitions and state only:

```svelte
<PanelGroup direction="vertical" panels={workspacePanels} bind:sizes />
```

Do not animate the same panel again inside its feature. Child content may fade
or crossfade, but `PanelGroup` owns the structural allocation.

## Multi-element recomposition

`createLayoutMotion()` is the generic FLIP owner. It tracks stable dataset keys,
captures rectangles before Svelte updates the DOM, and plays after the update.
It intentionally keeps the historical `layout-flip.ts` file path and deprecated
grid-named aliases so existing imports remain source-compatible.

Use it when survivors change tracks, columns, sizes, or element families. Do
not use it for a single conditional row or for pointer-driven movement.

## Verification

Content-sized dialogs opt into `BaseModal.animateSize`; the shared
`createIntrinsicHeightMotion()` controller owns their height. A CSS transition
on `height: fit-content` does not animate a content change when the declared
height value stays the same. Do not add a feature-local observer or layer a
second CSS height transition over the controller. Keep width changes with the
existing shell owner and leave direct pointer resizing immediate.
The frame keeps its measured height between observations; its nonshrinking
content wrapper remains the independent source of natural geometry. Clear the
owned height on teardown, not between transitions. Observe both the OS setting
and the app's `data-motion-preference` setting, including changes mid-animation.

Outgoing `Crossfade` layers remain painted during their outro but become inert
and hidden from assistive technology. Rapid reversal must restore only the
current controls. Heavy live cards and video players retain their existing
lifetime; a settings change is not a reason to remount their rendering subtree.

For every structural change:

- exercise the trigger in a real browser;
- observe the old state, motion path, and final state;
- trigger it again before the first transition finishes;
- verify `prefers-reduced-motion: reduce`;
- check the required responsive viewports from
  `visual-verification-mandatory.md` and confirm that controls do not resize
  their neighbours while labels/icons swap;
- check for console errors.

For intrinsic resizing, sample frames after the actual input. Require heights
between the two endpoints and test interruption, settlement, and viewport
containment. Final screenshots, declarations of `transition`, and intercepting
an `animate()` call cannot establish that the visible dialog moved correctly.

The source contract test keeps the routing rule, canonical exports, shared
PanelGroup integration, and Stage's single mounted timeline connected.
