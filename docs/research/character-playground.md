# Character playground

`/test/character-playground` replaces the retired Avatar Bake Off. Old links redirect, preserving the chosen character when its file is available.

The route mounts the shared `Viewer3DFullscreen` workspace with isolated, seeded viewer state. That owner supplies the canvas, `SceneControlWorkspace`, performer management, formations, camera controls, complete scene/environment picker, `UnifiedTimeline`, and tempo controls. The host adds the creator through the workspace's existing inspector and compact mobile sheet slots. It does not maintain a separate scene toolbar or a list of six sequence choices.

## Creator controls

The local creator has bounded, real MPFB inputs: feminine or masculine body presentation; young adult, middle age, or older adult; height, weight, muscle, proportions, and face variation; plus six verified hair assets and three presentation-matched outfit assets. Hair and clothes are allowlists, never client-provided asset paths. Skin remains automatically selected from MPFB's matching official system texture because its current asset naming couples texture race and presentation; the UI does not misrepresent that as an independent skin-tone control.

`POST /test/character-playground/generate` still accepts an empty body for the old random-generation flow. A JSON body must exactly match the bounded creator contract. The server writes that object into the generation job and passes only that file path to the runner. The runner validates it again before Blender starts. `generation.json` records both requested and resolved controls; the intake-compatible provenance source note repeats the resolved controls and seed for reproduction.

`SequencePickerModal` opens the existing community/library browser. It applies sequences through `viewer.loadSequenceScoped`, including the shared undo history and multi-selection behavior. The app's `AnimationPlaybackController` supplies the fractional playhead with ephemeral animation and visibility state. A verified combination fixture is only the initial sequence. Changes from either sequence picker update the same viewer state and playback controller.

Saved local characters use the existing `PerformerCharacterPicker`, including keyboard selection, loading feedback and live previews. `character-catalog-context.ts` lets this host add an availability-checked, reactive local catalog alongside deployed characters, including the default X-Bot used by Add performer. Other hosts retain their existing catalog source. Dynamic registration still feeds the package's GLB loader. The calibrated palm attachment selects the main-thread renderer because local definitions are not shipped to the worker catalog.

## Local MPFB generation

Randomize runs Blender locally, then routes the result through `character-intake.mjs` for normalization, optimization, rig checks, provenance and staging. The current cast keeps playing during generation. A successful character replaces the selected performers through the shared edit owner and remains in the local manifest. If selection changes while generation runs, the result is saved in the picker without replacing the newly selected performer. Missing models and rejected Marcus entries stay out of this host's picker.

`scripts/characters/mpfb-proof.py --seed <integer>` uses MPFB's randomization service for adult body macros and symmetric facial targets. It selects fitted clothing, skin and hair from the official CC0 system assets. It preserves the proof's finger bone-roll correction and bakes evaluated shape keys before applying export masks. The seed, macros, detail targets and chosen assets are recorded in `generation.json`; the editable Blender source is saved alongside the raw GLB.

The generation endpoint is restricted to development, loopback clients, local hostnames and same-origin POST requests. It accepts no client paths or shell commands. A filesystem lock permits one generation across tabs, HMR and task servers. Blender has a two-minute timeout; ordinary failures release the lock and leave the current character usable.

Defaults use the existing installation at `E:/3D-Models/mpfb-proof-20260908`. Override with `MPFB_HOME`, `MPFB_SOURCE`, `MPFB_ASSETS`, `MPFB_OUTPUT` and `BLENDER_BIN` when using another installation. Output defaults to `<MPFB_HOME>/playground`; runtime GLBs and the intake manifest remain under ignored `static/models/avatars/bakeoff` for compatibility with the intake pipeline. These are local evaluation files, not deployed assets.

If the entire dev server is forcibly killed during generation, inspect `playground/generation.lock` and its recorded job directory before removing a stale lock. Do not remove the lock while its Blender process is still running.

## Scope of the result

The playground enables the rig's existing palm attachment (`weldGrip`) through the production viewer. The older attachment clamped corrections to six centimeters, which left a visible gap on some generated bodies. This opt-in follows the achieved palm and knuckle line and requires the main-thread renderer. Other viewer hosts retain their existing setting.

Randomization varies geometry, facial proportions, presentation, skin, hair and outfits. This is the authored MakeHuman mesh and rig pipeline, not an AI image-to-mesh service. Finger bones are present and bend toward the palm, but precise thumb and staff contact still need refinement. Generation does not automatically promote a character into the production catalog.

## Thumb frame correction

The original MPFB conversion gave the thumb the same flexion plane as the four fingers. The runtime's staff pose therefore curled it away from the index side of the grip. `mpfb-proof.py` now gives the three thumb joints a mirrored quarter-turn in their rest frames, before clothes and export copies are created. Joint locations and body proportions remain unchanged. New generation records identify this as `handFrameVersion: 2`.

This correction belongs to the MPFB exporter. It does not change the shared runtime pose presets or the MetaPerson and Mixamo assets. Candidate model URLs include the intake SHA-256 so repaired files invalidate the loader cache while keeping their character IDs and saved links.

For a regenerated character, run `node --import tsx scripts/characters/verify-mpfb-grip.mjs <previous.glb> <repaired.glb>`. The check uses the runtime `FingerAnimator` and staff pose, verifies all 52 rest joint positions, checks thumb proximity to the curled index finger relative to palm size, and checks bilateral symmetry. It measures joints, not skin collision or pressure on the shaft.

The verifier also accepts a single MPFB GLB. Local generation runs this absolute grip check after Blender exports and before intake can stage the character. Its output is saved as `grip-verification.json` in the generation job; a failing grip leaves the catalog unchanged. This catches complete finger rigs whose thumb frames still point away from the staff.

Seeds 1, 7 and 1617475689 passed this comparison: distal-thumb-to-index-joint distance fell from 68–82 mm to 12–14 mm. The real playground was inspected with fire staffs, extended and bent arms, and mixed spinning examples. The sideways thumb extension is corrected; exact skin contact, clothing deformation at deep bends, and arbitrary body/prop combinations still require visual evaluation. The candidate and generation suites now pass 28 tests, and the full Svelte check reports no errors or warnings.

All eleven MPFB models staged at the time of repair (the proof and ten seeded characters) were regenerated and passed the same comparison. Original GLBs and manifest entries are backed up under `E:/3D-Models/mpfb-proof-20260908/playground/grip-v2-backup`; the new editable sources and intake reports are in adjacent `grip-v2-*` job folders. Unrelated character entries were preserved while a generation lock protected each staging update.

The later long-shirt character, seed 519002568, was generated before that exporter fix reached the primary checkout and missed the original repair pass. A subsequent audit of all sixteen staged MPFB characters found it was the only remaining failure. It was regenerated from the same seed with version 2 frames: all 52 rest joints stayed unchanged, bilateral thumb-to-index distance fell by 82%, and both hands curled inward in the real playground. The screenshot supplied with URL seed 1722140014 showed this older long-shirt character; 1722140014 itself is the short-top character and passed the grip check. Close-up comparison at step 3.317, original asset/manifest backup, and editable repair source are retained under `E:/3D-Models/mpfb-proof-20260908/playground/thumb-contact`. The old export fails the new single-file gate, and the repaired export passes it. Precise skin contact remains a separate visual judgment.

## Original playground verification, September 8, 2026

- 27 focused tests pass for candidate availability, rejected entries and generation request boundaries, concurrency and failure cleanup. `npm run check` reports no errors or warnings.
- Seeds 1, 7 and 42 were generated through the CLI; seed 2120506931 was created and selected through the browser's Randomize button in 10.6 seconds. Each passed intake and retained all 30 finger bones.
- Browser inspection exercised playback, pause, half speed, sequence switching, character switching, grid visibility and hand/body framing. The initial floating-prop defect reproduced in this viewer and the existing palm attachment removed the visible gap.
- All seven prescribed CSS viewport sizes reported no horizontal overflow and controls retained 44px targets. The in-app browser's emulated screenshots showed stale compositor fragments outside the current layout, so those captures do not establish pixel-perfect rendering at every size. Normal viewport inspection was used to judge the character and grip. Temporary viewport and page-scale overrides were cleared.

## Shared workspace verification, September 8, 2026

- Replaced the custom controls with the fullscreen scene owner. Browser checks loaded the actual 593-sequence community gallery, selected AKEJ for a second performer, changed BPM to 90, and switched Forest to Void through the ten-environment picker.
- Randomize created seed 1324700290 and applied it through the scoped edit owner. A second generation, seed 1966878994, completed after performer selection changed: the original performer stayed intact and the result appeared in the picker. Both retain editable sources and intake reports; new generation uses hand frame version 2.
- Found and corrected two shared integration defects: loop-off now reaches the parent animation clock, and the canvas transport no longer covers compact scene sheets. Verified actual playback stops with looping disabled and the generator sheet button receives pointer hits. Existing character-owned loop behavior is preserved.
- The personal badge appears only on Austen's MetaPerson. Generated characters have no misleading “You” badge, and the picker retains a keyboard entry point even when an active character is outside a host catalog.
- All seven prescribed CSS viewport sizes measured no horizontal overflow and no native selects. Phone, short landscape and laptop captures establish usable control composition. Large emulated captures repeat compositor tiles beyond the host view; a scaled capture exposed the complete 4K composition, but this remains a capture limitation, not a clean pixel-level pass at every large tier. An 800×450 CSS viewport exercised the reflow equivalent of doubling the normal 1600×900 view; actual browser zoom was not changed. Reduced-motion mode and the real sequence modal were exercised. Overrides were cleared.
- 50 focused tests pass across candidate availability, generation boundaries, playback adapter, scene layout and catalog boundaries. The full Svelte check reports zero errors and warnings. Screenshots and viewport measurements are retained under `E:/3D-Models/mpfb-proof-20260908/playground/workspace-verification`.
