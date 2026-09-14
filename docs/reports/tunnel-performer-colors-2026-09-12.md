# Tunnel performer colors

Implemented on `codex/performer-colors` in `C:/tka-performer-colors`.
The user explicitly requested merge with the incomplete browser pass documented below.

## Behavior

- Each performer can inherit the tunnel palette, use two exact hexadecimal
  colors, or share one hue and saturation with separate left/right lightness.
- Authored overrides use performer IDs. The controller resolves them into dense
  stage order for rendering, including formation copies and sparse stage arms.
- Snapshot validation, local view state, and the existing public payload carry
  the override map. Capture clones the map rather than retaining live state.
- Prop textures, trail colors, LEDs, prop-matched effects, roster swatches,
  speed swatches, and export consume the resolved palette.
- Outdated asynchronous texture loads cannot overwrite the newest shade on the
  base performer or its additional layers.
- The existing color picker's hex pattern now preserves its quantifier in the
  rendered HTML, so valid six-digit hex values pass native validation.

## Evidence

55 focused tests passed across these suites:

- `tests/unit/tunnel-performer-colors.test.ts`
- `src/lib/shared/sequence-viewer/tunnel/tunnel-prop-colors.test.ts`
- `src/lib/shared/sequence-viewer/tunnel/__tests__/tunnel-snapshot.test.ts`
- `src/lib/shared/animation-engine/services/__tests__/prop-type-manager.tunnel-hand-colors.test.ts`
- `src/lib/shared/animation-engine/services/canvas2d/__tests__/canvas-2d-image-loader.prop-crossfade.test.ts`
- `src/lib/shared/video-export/services/offscreen-export-renderer.layers.test.ts`
- `src/lib/features/tunnel-collection/domain/__tests__/tunnel-public-revision.test.ts`

Final `npm run check`: zero errors and zero warnings.
`git diff --check`: clean.

A separate read-only review found sparse-arm roster indexing and stale primary
texture loads. Both were corrected; the primary race test failed before the fix
and passed afterward.

Chrome DevTools MCP exercised the real settings component and animation canvas
in a temporary local fixture. Performer 1 produced left `#8080ff`, right
`#000080`; performer 2 independently produced left `#80ff80`, right `#008000`.
Restoring a serialized controller state restored performer 2's pair. Editing its
left hex value to `#123abc` preserved its right color and performer 1's pair.
The corrected native hex input reported `checkValidity() === true`.

Desktop and mobile screenshots were observed. Widths 375 and 960 reported no
horizontal overflow, a 320px controls panel, and a 16px root font. Screenshot
capture subsequently timed out, including with a separate task browser and
settings-only fixture. The remaining viewport captures, 200% zoom check,
shipping-route interaction, and actual exported-frame comparison remain open.
No claim of full browser or video-output verification is made.

## Remaining work

Complete the browser pass through the shipping tunnel route. Local integration uses the
repository's guarded finish command from the primary checkout:

`npm run wt:finish -- codex/performer-colors --route /create/tunnel`

The temporary fixture and MCP bridge were removed, and task-owned server,
bridge, and browser processes were stopped. Automatic approval review rejected
deleting the temporary `.color-chrome` profile, so that untracked directory
was preserved outside the worktree at `C:/tka-performer-colors-browser-profile`.
