# Hero LOOP badge: register the LOOP display resolver for public hosts

Date: 2026-10-25. Status: approved by Austen ("Yes, wire the LOOP display
resolver into the hero so CAP, flower and Zan's rolls show their LOOP badge").

## Problem

The landing hero (`SequenceHeroDemo.svelte`) never shows a LOOP badge, even
for CAP, flower and Zan's Diamond rolls that carry one everywhere else. The
header slot for it is reserved (the reversal glyph sits beside an empty gap),
which reads as a missing element.

Cause, confirmed live on `/`: `AnimatorCanvas.svelte` derives `loopDisplay`
through `tryGetLoopDisplayResolver()`, and that returns null on the public
landing. The resolver is registered only by
`src/lib/shared/composition-root/index.ts`, which `+layout.svelte` imports in
app mode. The sequence viewer page patches the same gap itself
(`SequenceViewerPage.svelte` onMount registers the detector and the resolver).

The resolver read is a plain module variable, not reactive. Registering it
after the canvas has derived once would not light the badge until the next
sequence change, so the registration must land before the first player mounts.

## Design

1. **One registration piece in the composition root.** New file
   `src/lib/shared/composition-root/register-loop-display.ts` exporting
   `registerLoopDisplay(): void`. It does exactly what `index.ts` does today
   for LOOP display: `registerLoopDetector(loopDetector)`,
   `registerLoopDisplayResolver(resolveLoopDisplay)`,
   `registerLoopDisplayCacheClearer(clearLoopDisplayCache)`. Calling it twice
   is harmless (each register just reassigns), so app mode and the hero can
   both call it. `index.ts` calls `registerLoopDisplay()` instead of its three
   inline lines. The composition root is the one place `shared/` may import
   from `features/` (the eslint boundary rule ignores it), which is why the
   piece lives there and not in `landing/`. `worker-loop-display-resolver.ts`
   stays as is: workers have no detector consumer.

2. **The hero loads it before the player.** In `SequenceHeroDemo.svelte`, the
   `LazyMount` loader for `InlineAnimationPlayer` becomes a `Promise.all` of
   the registration import and the player import, calling
   `registerLoopDisplay()` from the first before resolving to the player
   module. The player, and the `AnimatorCanvas` inside it, therefore mounts
   with the resolver already in place, and the first roll's `loopDisplay`
   derivation sees it. The landing bundle is unchanged: both imports are
   dynamic and fire only when the hero becomes active, which LazyMount already
   gates. The loader keeps returning `Promise<{ default: Component }>`.

3. **Nothing changes in AnimatorCanvas, WordHeader or the glyphs.** The badge
   slot already appears when `loopComponents` is non-null. The sequence viewer
   page's own registration is left alone (out of scope; it could later call
   the shared piece).

Bundle note: the registration pulls `loop-detector`, the choreo-card
`sequence-to-entry-converter`, `loop-type-utils` and `canonical-json` into the
hero's lazy chunk. That is the same code every badge surface already runs; it
loads after first paint, in parallel with the player chunk.

## Testing

- Unit (vitest, project config): `register-loop-display.test.ts` beside the
  new file. Before the call, `tryGetLoopDisplayResolver()` is null in a fresh
  module graph (use `vi.resetModules()` and dynamic imports so the shared
  registry starts empty); after `registerLoopDisplay()`, it returns a function
  and `getLoopDetector()` returns the detector. Calling it a second time does
  not throw.
- Reviewer's browser check after integration, on `https://localhost:5173/`:
  `tryGetLoopDisplayResolver()` is non-null once the hero player has loaded,
  and a CAP, flower or Zan's roll shows a LOOP badge at the header's top
  right, with the reversal glyph beside it. Rolls without LOOP components
  (plain mixed generated) still show no badge.
