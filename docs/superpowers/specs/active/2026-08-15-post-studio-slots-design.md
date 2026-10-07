---
status: active
value: null
effort: null
remaining: "Verify Post Studio Slots — Design against the current Post Studio Slots — Design runtime and acceptance criteria before resuming implementation. Prior recorded remainder: Reconcile the three unchecked slot-phase items and workspace-wide timing bar against current Post Studio, then verify."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Post Studio Slots — Design

**Status:** active · **Date:** 2026-08-15 · **Iteration:** 2 of Post Studio

## The problem

Post Studio presents a post as a choice among four named templates. That is not
what a post is. Austen (2026-08-15):

> that template is animation on top and choreo card on bottom. Or alternatively
> the second template would be performance on top and choreo card on bottom. or
> alternatively we could have performance on top and animation on bottom. In
> other words we should be able to pick these things incredibly simply and
> incredibly easily but right now I can't even select the top or bottom and
> click my delete key and remove it.

A post is **two stacked slots**, each holding a media source. The four presets in
`post-studio-presets.ts` are four frozen samples of that space. With three source
types there are 9 two-slot pairs plus 3 full-frame singles; four are reachable,
and Performance-over-Animation — one of the three Austen named — is not among
them.

Delete does nothing because the verb does not exist. Regions carry an `onclick`
that selects (`PostStudioPreview.svelte:177`) and there is no keydown handler
anywhere in the post-studio folder. The state exposes `selectRegion` /
`selectRole` but no `setSlotSource`, `clearSlot`, or `swapSlots`. Selection only
decides which settings the inspector shows.

Two behaviours in the current build are invisible and unasked-for:

- `performance-breakdown` crossfades Performance into Animation from 44% to 56%
  inside the top region (`post-studio-presets.ts:222`). Nothing in the UI says so.
- `selectRole` searches other presets for one containing the clicked role and
  switches to it, so clicking a source in the rail can rearrange the layout
  without announcing it.

## Decisions (locked 2026-08-15)

| Question | Decision |
|---|---|
| Slot count | Fixed at two. An empty slot collapses the other to full frame. |
| Time-sliced slots | Keep and generalise. A slot is a track of 1..N clips with crossfades. |
| Media types | All six in wave one: Animation, Performance, Choreo card, Tunnel, 3D view, Mandala. |
| Two 3D slots | Not allowed. Choosing 3D for one slot removes it as an option for the other. |
| Saved layouts | Survive as derived output, not as the source of truth. |

## The model

**A slot is a track.** It holds one or more clips in time order, with crossfades
at the seams. One clip spanning the full duration is the default case, not a
special case.

This needs no new engine work. `fractionVisualClip(id, role, region, start, end)`
plus a `crossfade` transition is exactly what `performance-breakdown` already
does. Austen's example — top slot Animation throughout, bottom slot Animation
then Choreo card — is the same call with different arguments.

The editor for it already exists and is already the right shape: the Advanced
timing panel renders a lane per region with draggable clip edges, and was
promoted to full workspace width in `28062c02d9`.

### Region normalisation

Region ids today are per-preset (`motion`, `card`, `performance`). They normalise
to two canonical ids:

- `top` — rect `{x:0, y:0, width:1, height:split}`
- `bottom` — rect `{x:0, y:split, width:1, height:1-split}`

`split` defaults to 0.56 and is draggable. One slot empty → the surviving slot
takes `{0,0,1,1}`. Both empty is invalid; the last slot cannot be cleared.

Migration runs on preset load: sort regions by `y`, reassign ids to `top`/
`bottom`, rewrite every clip's `regionId`. This covers the four built-ins and any
preset already saved to Firestore.

### Source registry

Roles are currently declared ad hoc in `post-studio-presets.ts`. They move to a
registry of six:

| key | label | renderMode | capture | seekable |
|---|---|---|---|---|
| `animation` | Animation | `sequence-animation` | canvas walk | yes |
| `performance` | Performance | `external-media` | `<video>` | yes |
| `card` | Choreo card | `choreo-card` | html-to-image | per beat |
| `tunnel` | Tunnel | `tunnel` | canvas walk | yes, needs wrapper |
| `scene3d` | 3D view | `scene-3d` | canvas walk (WebGL) | yes |
| `mandala` | Mandala | `mandala` | pure renderer | no, static |

### What each new type costs

Verified 2026-08-15 against the source, not assumed.

**Mandala.** No WebGL. `SequenceMandala.svelte` declares a `currentStep` prop and
never reads it — the mandala is a whole-sequence fingerprint, one still image,
not a frame at a time. Its render target flips between `<svg>` and `<canvas>`
depending on whether it is animating, so DOM capture is unreliable. The pure
functions (`calculateMandalaGeometry`, `renderMandalaToCanvas`) are already used
headless in a Web Worker by `mandala-export.worker.ts`. Bind those directly into
an offscreen canvas and treat the layer as a still.

**Tunnel.** Canvas2D. `tunnel-poster.ts:48` already walks every `<canvas>` in a
container and composites via `drawImage`, which is the compositor's existing
branch. `TunnelArtView` runs its own RAF clock and cannot be seeked;
`AnimatorCanvas` underneath accepts `currentStep` and `virtualTime` (the video
exporter drives it that way). Needs a seekable wrapper in place of the
self-driving view.

**3D view.** `Viewer3DCanvas` already sets `preserveDrawingBuffer: true` and
takes a float `currentStep`, and `capture-3d-scene.ts` plus
`export-coordinator.svelte.ts:377` are working capture paths. The cost is
bootstrap: a Svelte context installed before mount (`setViewer3DContext` +
`viewer.enter3D`), a required avatar/performer, hardware tier detection, and
async scene features behind a 15-second gate. It is not a component that can be
casually mounted in a preview slot.

## Interaction

The preview is the picker. The Layouts rail and the Sources rail are deleted.

- Click a region → selected, with a full-element ring. Not a left-edge bar
  (`no-left-edge-accent-bar.md`).
- `Delete` / `Backspace` on a selected slot → clears it; the survivor goes full
  frame.
- An empty slot shows the six source targets. Choosing one fills it.
- Swap moves top ↔ bottom.
- A second clip in time is added from the timeline lane, which already exists.
- 3D is greyed out in one slot while the other holds it.

## Fat to cut

Three identical eyebrow-over-title double headers on one screen: `TEMPLATES /
Layouts`, `MEDIA / Sources`, `SELECTED LAYER / Animation`. The same pattern was
removed from Timing in `28062c02d9` and left standing three times elsewhere.
Also: prose under each template restating its own thumbnail, "Used in this
layout ✓" restating the preview, "Ready to render this layout." as a status
line, and "Select a region to edit" — a hint that exists only because direct
manipulation was never wired. In the inspector, Look/Placement → a five-item
rail → a "VISIBILITY" header is three nav levels to reach a toggle.

## Phases

- [x] **P1 — Slot model.** Regions normalise to `top`/`bottom` on load
      (`post-studio-slots.ts`, applied in `adoptPreset`). Verbs `setSlotSource`,
      `clearSlot`, `swapSlots`, `setSlotSplit` on composition state, plus
      `slotOccupancy` and the `slotAccepts` one-3D-at-a-time gate. `selectRole`
      no longer switches presets behind the user's back. Six-source registry
      (`POST_STUDIO_SOURCES`) with `renderMode`, `defaultFit`, `isStill`,
      `exclusive`; three new `MediaSourceKind` values and a
      `linked-sequence-derived` role resolution. No UI change — 21/21 unit tests
      in `tests/unit/post-studio-slots.test.ts`, `npm run check` 0/0, and all
      four presets verified live at `/test/post-studio` holding their exact
      original geometry (0.56 · 0.6 · full · full) with zero console errors.

      One deliberate change beyond the ledger: region *labels* now come from the
      occupying source rather than the position, so the preview's accessible
      names stayed "Animation" / "Choreo card" instead of degrading to "Top" /
      "Bottom". The role labels shortened to match ("Sequence animation" →
      "Animation") since they now name a slot and a chooser option.
- [x] **P2 — Direct manipulation.** Each slot carries a chip naming its source;
      the chip is a menu of all six sources plus Remove, with 3D disabled in one
      slot while the other holds it. `Delete`/`Backspace` on a selected slot
      clears it (handler on the region surface, not the document, so it cannot
      fire from a text field). A swap control straddles the seam; the collapsed
      single shows an "Add {slot} slot" chooser on the edge the new slot appears
      on. Selection is a full-element ring.

      Both rails are gone. `PostStudioPresetPicker.svelte` and
      `PostStudioSourcePanel.svelte` are deleted — Sources restated what the
      preview shows and its only verb (`requestSource` on a missing role) was
      already on the region click path, and Layouts became a shortcut rather
      than the way a post is built, so it is one menu behind the preset name the
      top bar already displayed. The workspace is two columns; the mobile
      "Layout" tab went with the rail.

      Two things the frames caught that the code did not: the canvas column was
      taking every spare pixel (1123px holding a 395px frame), so surplus past
      `frame + matting` now goes to the inspector up to a share of the
      workspace; and the scale tiers were declared on `.studio-body` only, which
      left the new top-bar control at 12px on a 3840 screen — they now land on
      every direct child. Chips drop to icon-only on a wide-short stage where a
      named chip is wider than the whole 112px frame.

      Evidence: 21/21 unit tests, `svelte-check` 0/0, zero console errors, and
      screenshots at 1920 / 3840 / 1440 / 960×412 / 375×667. Skipped 2560 —
      it sits between two verified tiers with no seam of its own.
- [x] **P2b — Presets removed entirely.** Austen, seeing the Layouts menu
      (2026-08-15): *"I think we should just have the ability to pick the top
      thing and the bottom thing rather than giving us 4 presets. Top or bottom
      can be anyone of our regular media types."* Correct — two chips reach
      every pairing, so a four-template list is a second, narrower way to say
      the same thing. The menu, the saved-layout repository wiring, the save
      form, and the `presetName` / `layouts` props on the top bar are gone.
      `POST_STUDIO_PRESETS` survives as test fixtures; the studio boots into
      `DEFAULT_POST_LAYOUT` (animation over card) and is edited from there.

      The top bar was a four-track grid built to seat a preset name beside the
      ready pill. With the name gone a 1fr track wrapped one small pill — 805px
      of dead air at 1920, 3101px at 3840 once the slack moved to the title. It
      is now flex: identity left, state and actions hard right, slack in
      between, and the three tiers no longer redeclare columns.

      Three `media-composition-state` tests still asserted the pre-P1 contract
      (`selectRole` switching presets behind the user; region ids `performance`
      / `card`) and were failing. Updated to the normalised `top` / `bottom`
      ids and to selection-is-only-selection.

      Evidence: `svelte-check` 0/0, 70/70 unit tests across
      `tests/unit/post-studio-slots.test.ts` + `tests/unit/media-composition`,
      zero console errors, screenshots at 1920 / 3840 / 1440 / 960×412 /
      375×667 (2560 skipped as above).
- [~] **P3 — Source registry + three new modes.** Registry of six done in P1.
      Mandala and Tunnel now render live in a slot; 3D still does not.

      Austen (2026-08-15): *"When I select the tunnel or the mandala it should
      not say Click to choose a source it should already know because I'm
      already in there showing the sequence I want to show."* Right — the three
      sequence-derived roles had no binding at all, so `bindingForRole` returned
      nothing and the slot fell through to the generic chooser prompt. They bind
      off the open sequence now and resolve `ready` with it.

      Mandala: `PostStudioMandalaLayer` drives `renderMandalaFrameToCanvas` (the
      export worker's own renderer) off the composition playhead, at the
      viewer's defaults — arc, aurora flow, 5s breath, 90°/ref-period — so a
      post matches the Art pane it came from. Tunnel: `PostStudioTunnelLayer`
      mounts `TunnelArtView` with its own controller and a two-field playback
      shim; it self-clocks off the studio tempo, which is right for the preview.
      Seeking it frame-exactly is P4's problem, not the preview's.

      `hasReadyLayer` in the preview listed render modes by name, so every new
      source type shipped a slot that drew its media AND told the user it was
      missing. It uses the same `!== "external-media"` rule the layer renders
      by.

      3D is honest instead of wrong: status `missing` with "3D preview is not
      wired up yet", which surfaces as "3D view needed" in the top bar and
      disables Render — so a blank 3D slot cannot be exported. The context
      bootstrap (`setViewer3DContext` + `viewer.enter3D`, avatar, 15s gate) is
      what remains of this phase.

      Evidence: `svelte-check` 0/0, 70/70 unit tests, zero console errors, and
      live at `/test/post-studio` — Mandala breathing and morphing with the
      playhead at 0:05.9, Tunnel's kaleidoscope with spectrum arms at 0:04.8,
      and Tunnel-over-Mandala (a pairing no preset could reach) both rendering
      at 0:14.8.
- [x] **P3b — Art controls in the inspector.** Austen (2026-08-15): *"We need
      access to all of the ability to modify the tunnel in Mandala just like we
      have in the sequence viewer when we have selected it as the chosen
      layer."*

      The viewer's own `ArtSettingsPanel` now renders in the inspector when the
      selected layer is Tunnel or Mandala — the same component, unmodified in
      behavior. What made that possible is ownership: `PostStudioArtControllers`
      (`post-studio-art-context.svelte.ts`) builds both controllers in
      `PostStudio.svelte`, above both the slot that draws the art and the
      inspector that steers it, so a Look change lands on the instance the
      canvas is reading. That is `ArtPane`'s pattern, not a new one. Tunnel
      activation is refcounted (`retainTunnel`) because either slot can be a
      tunnel and both can be at once.

      `PostStudioMandalaLayer` dropped its hand-rolled `MandalaFrameSpec` and
      mounts the viewer's `MandalaPane`, so the slot and the controls are one
      renderer. Consequence, deliberate: the mandala self-clocks now instead of
      scrubbing with the playhead — same as the tunnel, and P4 owns
      frame-exact seeking for both.

      Export is suppressed in the studio (`showExport={false}`, new on
      `ArtSettingsPanelProps`): the studio's Render button makes the post, and
      an "Export MP4" of one layer inside it is a second, quieter answer to the
      same question. The mandala's Download section goes with it — its
      resolution / fps / loop-count steer a render Post Studio never performs.
      `ArtPane` doesn't pass the prop, so the viewer is unchanged.

      `PostStudioInspector` had enumerated the modes that HAVE settings, which
      meant every new source type shipped without its controls until someone
      remembered the list. It excludes the two that have none instead
      (`external-media`, `scene-3d`).

      Evidence: `svelte-check` 0/0, 49/49 `tests/unit/media-composition`, zero
      console messages, and live at `/test/post-studio` — Pinwheel applied from
      the inspector redraws the slot as a 16-prop spectrum kaleidoscope; the
      mandala stack reads Speed / Shape / Spin / Colors / Weight / Depth with
      no Download; screenshots at 1920 / 2560 / 3840 / 375×667.

      Not a bug, recorded so it isn't re-investigated: a tunnel paused at 0:00
      draws two props. The renderer receives all 7 additional layers at that
      frame (measured) — step 1 is the sequence's start pose, where the rotated
      copies coincide. Paused at any later frame it holds the full ring. The
      viewer never shows this because its tunnel auto-plays.
- [x] **P3c — Post Studio becomes a viewer surface; presets become templates.**
      Austen (2026-08-16), on reaching the studio through Share → a small
      button: *"the post studio isn't even a drawer it's a full screen
      experience that you have to X out of which isn't even consistent with the
      rest of our patterns ... this back button that goes back to share which
      itself is a modal not even a destination."* Plus the "Ready" pill that
      "means absolutely nothing", "even timing" next to Timing, and the word in
      the top-left instead of top-centre.

      The root cause was ownership, not chrome: the studio sat on the
      distribute side of the compose/distribute line. The viewer already owns
      every other way a sequence becomes an artifact — card export, video
      export, tunnel, mandala, practice — and already hands finished renders
      out to Share through `artShareVideo`. So `post-studio` joined
      `VIEWER_MODE_OPTIONS` and the shell grew a `showPostStudio` body branch
      beside the video gallery. Four complaints die structurally:
      the viewer header owns the centred word and the close, the content rail
      owns going back, and `PostStudioTopBar.svelte` is deleted in favour of
      `PostStudioActionBar.svelte` (render/download only). "Ready" was the
      `{:else}` of the missing-sources warning — it announced the absence of a
      problem. "Even timing" was the label for `tempo-grid`, which is what you
      get when there is no performance to align to, so it was permanently on
      and permanently uninformative; the chip now appears only when alignment
      is a fact. `post-studio` is deliberately NOT a `ContentType` (it cannot
      be half a split pane) and is deliberately absent from `loadViewerMode`'s
      whitelist (opening a sequence must never drop you into an editor).

      `PostStudioPane.svelte` needed the same rendered card the share sheet was
      producing, so that pipeline moved to `card-preview-state.svelte.ts` and
      `PostShareSheet` migrated onto it — one owner, two consumers, per
      `never-hand-roll.md`. The sheet now links to the studio and closes.

      Presets: saved captions were raw global literals, and `removeCustomPreset`
      had zero call sites repo-wide. Austen: *"I have this Dpsi preset that I
      created but why would I want that for a different sequence that isn't D
      PSI."* They are stored as templates now (`{word}` / `{link}`) and the chip
      carries an X. `FilterChipBase` was extended with `aria-pressed` on its
      duo-main button rather than forked (`chip-primitives.md`).

      Caught in browser verification, not by types: naive substring replacement
      templatised "Amazing A run" as "{word}m{word}zing {word} run". TKA words
      are short — one letter is normal — so the word is matched only on Unicode
      letter/digit boundaries. `\b` is ASCII-defined and fires mid-Ψ, so it is
      not usable here. Covered by `caption-presets.test.ts` (9 cases).

      Evidence: 0 errors from `svelte-check` and `tsc --noEmit`; 9/9 caption
      tests, 38/38 relevant shell-contract tests; screenshots at 1920 / 2560 /
      3840 / 1440×900 / 820×1180 / 960×412 / 375×667.

      Composition still owed to P6, seen in those frames: at 3840 the stage
      column holds ~1700px the height-capped 9:16 preview cannot use, and the
      action bar carries one right-aligned button across the full width. 2560
      is the best tier. 960×412 survives but the preview is too small to judge.
- [ ] **P4 — Compositor branches.** `tunnel`, `scene-3d`, `mandala` capture paths
      in `post-studio-frame-compositor.ts`. Verify an actual export of each.
- [ ] **P5 — Multi-clip tracks.** `appendClipToSlot`, `removeClip`, crossfade at
      seams, edited from the timeline lane.
- [ ] **P6 — Trim.** The three double headers, the prose, the status filler, the
      inspector's nav depth.

## Verification

Every phase carries evidence in the same message per `verification-protocol.md`.
Visual phases (P2, P6) are screenshotted at 1920 / 2560 / 3840 / 1440 / 960×412 /
375×667 per `visual-verification-mandatory.md`. P4 is not done until a rendered
export of each of the six source types has been produced and looked at.

## Related

- `28062c02d9` — timing promoted to a workspace-wide bar (the multi-clip editor)
- `.claude/rules/no-left-edge-accent-bar.md`, `never-hand-roll.md`,
  `visual-verification-mandatory.md`, `no-layout-shift.md`
