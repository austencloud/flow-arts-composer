> Archived 2026-10-14: Matching scope is recorded in `docs/superpowers/specs/shipped/2026-07-26-profile-as-stage-design.md`.

# Profile as a Stage — Handoff (2026-07-26)

## Mission

The creator profile renders every sequence the same way — a static
`PropAwareThumbnail` at whatever prop the viewer happens to have set — so a
large library reads as a spreadsheet. Meanwhile the app already saves 3D
scenes, tunnels, and mandalas that each carry their own presentation snapshot,
and nothing on the profile reads them.

The design turns the profile into three bands — **Showcase / Collections /
Archive** — where each artifact renders in its own medium, live when it is on
screen. Sequences stay raw notation; the presentation config lives in the
collection entries that already store it.

Design spec: `docs/superpowers/specs/2026-07-26-profile-as-stage-design.md`

**Your job:** build `Scene3DPreview.svelte` and wire it into the scene tile.
Everything it depends on is landed. Start at Loose end #1.

## Done — verified

### 1. Design spec — `4e8f951fd3`

`docs/superpowers/specs/2026-07-26-profile-as-stage-design.md`. Records the
architecture, the seven decisions Austen made, and the risks.

### 2. Test harness — `d359170251`

`src/routes/test/profile-stage/` — three files: `+page.svelte`,
`ArtifactTile.svelte`, `live-slots.svelte.ts`. Real components over real
Firestore data, not a mockup.

Evidence, `evaluate_script` against `https://localhost:5173/test/profile-stage`
in Chrome DevTools MCP:

```json
{"tiles":170,"bands":["Showcase","Collections","Archive"],
 "counts":["4","46","504"],
 "subbands":["3D scenes 1","Tunnels 4","Mandalas 41"]}
```

The liveness coordinator grants and revokes tokens on scroll — measured after
scrolling to the Archive band:

```json
{"live":11,"readout":["sequence − 6/6 +","mandala − 5/8 +",
 "scene − 0/0 +","tunnel − 0/0 +","archive shown − 120/504 +"]}
```

Two defects found by screenshot and fixed in the same commit:

- The layout `SegmentedControl` rendered **1656px wide** for two short labels
  (the `width: 100%` failure in `visual-verification-mandatory.md`). Measured
  1656 → **152** after wrapping it in a `width: max-content` container.
- A real saved scene is named `FΨFΨFΨFΨ — 3D scene`. The tile now simplifies
  per whitespace token, measured `"FΨ — 3D scene"`. **The stored name is still
  wrong** — see Loose end #5.

Viewport sweep, all measured via `evaluate_script`, no horizontal overflow at
any width: 1920 (band 1720, rail 95), 2560 (band 2253, rail 149), 3840 (band
2600, rail 615), 1440 (band 1325), 820×1180 (band 754), 960×412, 375×667.
Screenshots read at 1920, 3840, 375, and 960×412.

### 3. Live tunnel tiles — `8b87d5264e`

A tunnel tile mounts `TunnelDetailPreview` when it holds a live token, poster
otherwise. No new rendering code — that component already existed and already
sandboxes itself per-instance.

Evidence after scrolling the Tunnels subband into view:

```json
{"tunnelTiles":5,"liveTunnels":2,"canvasesInLiveTunnels":[2,2],
 "readout":["tunnel − 2/2 +", ...]}
```

Screenshot confirms it: the two live tunnels render with full trail glow and
their own pause button; the two posters below are visibly flat and dim.

### 4. The viewer-3d construction seam — `d475ed1fce`

**This is the unlock for your work.** `createViewer3DState(seed?)` accepts a
`Viewer3DStateSeed`. Seeded fields win over localStorage and nothing is
written back, so a seeded viewer is self-contained. Threaded through all six
construction points: render mode, camera, ocean variant, default prop, nav
mode, effect toggles, performers. Plus `seededBackgroundType`, which
`Viewer3DScene` now prefers over `settingsService.settings.backgroundType`.

Evidence: `npm run check:fast` → **5 errors, 0 in the two touched files**
(the 5 are pre-existing: `InAppBrowserPrompt`, `PronunciationRecorder`, and
others untouched by this work). The app boots `/create/construct` with **zero
console errors** — `list_console_messages` filtered to `error` returned none.

## Believed done — unverified

**The 3D viewer pane itself still mounts.** `viewer-3d-state.svelte.ts` is a
core shared file. Existing callers pass no seed, so every `seeded()` falls
through to its storage loader and behavior should be identical — but I only
verified that the app boots and Create renders. I never opened a sequence in
the viewer's 3D pane. **Do this before trusting the seam.** Open any sequence,
switch to the 3D animation pane, confirm the avatar and environment render.

## In flight

Nothing. All four commits are on `main` and my paths are clean
(`git status --short` over `src/routes/test/profile-stage`,
`src/lib/shared/3d/state`, `src/lib/shared/3d/components/Viewer3DScene.svelte`
returns empty).

Other sessions have uncommitted work across the tree. **Commit with explicit
pathspec** (`commit-only-your-own-changes.md`) — the index is shared.

## Loose ends (ranked)

### 1. Resolve the auto-orbit seam, then build `Scene3DPreview.svelte`

Austen's ask, verbatim (2026-07-26): *"it'd be great if maybe the 3D scene
could show a matic camera that continually moves around the central avatar."*

`autoOrbitPreset` already exists
(`src/lib/shared/sequence-viewer/camera-choreography/presets/auto-orbit.ts`) —
orbits the primary performer at fixed radius, one revolution over the sequence
duration, CCW. `OrbitControls.svelte` separately has `autoRotate` /
`autoRotateSpeed` (line ~111).

**The open question I did not resolve:** neither is reachable from outside
`Viewer3DCanvas`. The choreography state is constructed internally via
`createViewerCameraPlayerState`, and `Viewer3DCanvas` exposes no autorotate
prop. So the orbit is either (a) seeded through the choreography state the same
way the rest of the seed works, or (b) a small new prop on `Viewer3DCanvas`
down to `OrbitControls`. **Look at this first** — it decides whether step 1 is
a one-line seed or another small seam. Seeding `activeCameraPreset:
"auto-orbit"` alone is a guess; I did not test it.

Then the component. Model it on
`src/lib/features/tunnel-collection/components/TunnelDetailPreview.svelte` —
same shape, and read its header comment first; it explains the per-instance
seam pattern better than this doc can.

Build the seed from `Collected3DScene.snapshot`. `applyScene3DLook`
(`src/lib/features/scene-3d-collection/services/open-3d-scene.ts:40`) is your
field-by-field map from snapshot to `Viewer3DPersistConfig` — including the
`isGroupSaved` packing-list mask. Copy the mapping; do **not** call it (it
writes globals).

Then `setViewer3DContext(state)` and mount `Viewer3DCanvas`
(`sequenceData`, `currentStep`, `isPlaying`, `bpm`, prop types).
`Viewer3DCanvas`'s own header states the contract: *"the parent must have
called setViewer3DContext() before mounting this component."*

**No `captureSettingsCheckpoint`, no `revertSettingsCheckpoint`, no Undo
toast.** A seeded viewer writes nothing, so there is nothing to undo. That is
the entire point of commit `d475ed1fce`.

### 2. Wire it into the scene tile, lift the budget off 0

`ArtifactTile.svelte` — add a `scene` prop and a `medium === "scene"` branch
mirroring the tunnel branch exactly (poster resting state, `<Crossfade key={live}
fill>`, `LazyMount` when live). Then in `live-slots.svelte.ts`, raise
`DEFAULT_BUDGETS.scene` off `0` and update the comment, which currently
explains why it is 0.

### 3. Verify N > 1 live scenes actually work

The whole argument for the seam was that localStorage is a single global slot
and concurrent seeders race. **Prove the fix:** render two scene tiles live at
once with different backgrounds and confirm each keeps its own. If they do,
the next question — GPU cost of N WebGL contexts, and whether a scissored
multi-viewport renderer is needed — becomes measurable for the first time.
Austen only has **one** saved 3D scene, so you will need to duplicate an entry
or seed a second from a different snapshot to test this at all.

### 4. Three layout defects the harness exposed, all unfixed

- **Type does not scale at 4K.** Root font measured **16px at 3840**. The
  lockstep ramp in `src/app.css` is scoped to `html:has(.mkt-shell)` and
  `html:has(.legal-container)` — marketing and legal only. The profile is an
  app page. See `4k-native-layout.md`.
- **Sparse subbands strand rows.** One 3D scene in an 8-column grid at 3840
  leaves seven empty tracks; four tunnels leave four. Splitting Collections by
  medium causes this. **A single mixed Collections grid would fix it and is
  closer to what Austen described** — varying media interleaved, not three thin
  type-segregated rows. Not yet put to him as a decision.
- **Square tiles break on short viewports.** At 960×412 a showcase tile
  measured **416px tall in a 412px viewport** — one tile, clipped. At 1440,
  `fitColumns` avoids an orphan by dropping the 4-item showcase to 2 columns,
  inflating tiles to **625px**. The showcase likely wants a fixed-size scroll
  strip, which today's `ProfileShowcase` already does.

### 5. Repair the stored scene name

At least one `scene-3d-collection` entry is named `FΨFΨFΨFΨ — 3D scene`. The
harness works around it at display time; the data is still wrong. See
`.claude/rules/simplified-word-display.md`. A sweep over
`users/{uid}/scene-3d-collection` names through `simplifyRepeatedWord` would
fix it at the source.

### 6. Not started, from the spec

Collection `visibility` field + Firestore rules (`firestore.rules:483`, `:491`,
`:499` are all `allow read: if isOwner(userId)`); folding `/profile` into the
creator profile; replacing the real `ProfileTabs` — the harness is a test route
and has not touched the shipping profile at all.

## Decisions already made

All from Austen on 2026-07-26. Do not re-litigate.

| Question | Decision |
|---|---|
| Does saving a sequence capture presentation config? | **No.** Sequences stay raw. The profile surfaces collections. |
| Front door | **Sectioned:** Showcase → Collections → Archive |
| Liveness | **Live whenever visible**, tiered per medium |
| Live 3D tiles | **Shared renderer with scissored viewports** (deferred — see Loose end #3) |
| Archive tiles | **Animate 2D pictograph playback** on visible |
| Collection visibility | **Per-entry `private \| unlisted \| public`, default private** |
| `/profile` account card | **Fold into the creator profile** |
| 3D preview scope | **Seam first, then the preview** |
| Preview background | **The scene's own background, inside the tile only** |

That last one is why `seededBackgroundType` exists: the only way to set the 3D
environment used to be `settingsService.updateSetting("backgroundType", …)`,
which repaints the entire page.

## Gotchas

**I was wrong about the blocker, and the correction matters.** I first told
Austen live 3D was blocked on the absence of a WebGL context pool. It is not.
The first blocker was that `createViewer3DState()` took no arguments and
`applyScene3DLook` "applied" a scene by writing the user's localStorage for a
fresh mount to read. Destructive, and single-slot. GPU cost is a *later*
question that only becomes askable once two viewers can coexist — which is
Loose end #3. Do not start with the renderer.

**The mandala tip bug was fixed by another session mid-work — commit
`465099c817`, "fix(mandala): trace the tip the trail actually draws from".**
Austen reported the mandala trace not coinciding with the prop, worst on
triads. My diagnosis was that `MANDALA_STANDARD_TIP_DX = 120` ignores real prop
geometry. That is true but was **not the dominant cause**. The real bug: the
trail picked its tip index off `getTipPoints` (override list) while the mandala
looked that index up in `getTipPointsBaseline` (baseline list), and the two
order a prop's arms differently — triad and bigtriad disagree by **120°**,
torch/bigtorch and bigclub by **180°**. 14 props affected. So the mandala came
out *rotated*, not merely mis-sized. Already fixed; do not re-fix.

**Still open from that thread:** `MANDALA_STANDARD_TIP_DX` remains the default
in `mandala-geometry-calculator.ts:575` whenever no `tipOverrides` are passed,
so gallery and collection mandalas still draw at a fixed radius rather than the
prop's real one. That is a *size* question, far less visible than the rotation
was, and it is a **product decision, not a bug** — changing it reshapes all 41
of Austen's saved mandalas and anything already printed on cards. Standardizing
was deliberate so mandalas stay comparable across props. Ask before touching.

**`AnimatorCanvas` cannot play a sequence by itself.** The spec's original
claim to "reuse `AnimatorCanvas` directly, not `InlineAnimationPlayer`" is
wrong: `AnimatorCanvas` takes already-computed `blueProp`/`redProp` states and
needs a driving playback stack. `InlineAnimationPlayer` is what wires
`AnimationPlaybackController` + `SequenceAnimationOrchestrator` +
`AnimationStateManager` + `AnimationLoop`. The harness uses
`InlineAnimationPlayer` with `chrome: "minimal"` (the documented
embedded/showcase idiom — see `feedback_minimal_player_chrome`).

**`LazyMount` alone cannot express a revocable budget.** It keeps its child
mounted forever after first activation, so a revoked token would leave the
animation loop running off screen. The tile wraps it in `<Crossfade key={live}
fill>` so the flip actually unmounts. Keep that if you copy the pattern.

**`activate-when-near` is one-shot** (activate, never revoke), which is why
`live-slots.svelte.ts` runs its own `IntersectionObserver` rather than reusing
it. That was a deliberate choice, not an oversight.

**Two `svelte-check` runs were already going in other sessions**, so per
`resource-budget.md` I used `npm run check:fast` (a different, lighter binary)
throughout. Check the machine before starting a third:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'svelte-check' }
```

**Reaching a real 3840 viewport** needs Chrome launched with
`--force-device-scale-factor=1`, and `resize_page` (page dimensions), not
`resize_window`. Below ~500px the OS window clamps — use
`mcp__chrome-devtools__emulate` with `375x667x2,mobile,touch` instead.
Switching to mobile emulation **re-boots the app**, so wait for `.tile` to
reappear before measuring.

**The harness reads Austen's own Firestore data** and requires him signed in.
Current shape: 504 sequences, 1 3D scene, 4 tunnels, 41 mandalas. A signed-out
browser shows the empty state, not a bug.

**Collection entries are `$state` proxies.** `structuredClone` inside
`createEffectsConfigState` throws `DataCloneError` on them —
`TunnelDetailPreview` calls `$state.snapshot(tunnel)` once on entry for exactly
this reason. `Scene3DPreview` will need the same.

## Expert-agent note

No expert `.md` was updated. The mandala/trail index divergence is
`prop-positioning-expert` territory and is durable canon worth recording there
— but the session that actually made that change (`465099c817`) owns it, and
this session only diagnosed it. Flagging rather than writing into an expert
file from second-hand knowledge (`expert-routing.md` Rule 2). Worth confirming
that session updated it.
