# Native performance pictographs

`Content/Data/performance-pictographs.json` is an additive sidecar for the sealed
performance library. It does not change either version 1 bundle or library
schema. Build it only after `performance-library.mjs build` has produced a
verified library:

```powershell
node --import tsx unreal/Shared/Tools/performance-pictographs.mjs build --project unreal/MuseumGame
node unreal/Shared/Tools/performance-pictographs.mjs verify --project unreal/MuseumGame
```

The sidecar has schema `tka-performance-pictographs-v1` and an `entries` array in
the same order as the library. Each entry has `id`, `sequenceSHA256`, and
`steps`. Each step has zero-based `index`, `letter`, `startSeconds`, `endSeconds`,
`image`, and `imageSHA256`. `image` is relative to `Content/Data` and resides
under `Pictographs/`. The start placement is not a timed step and has no image
in this first native picker. Step times are cumulative score durations divided
by the captured library entry's `scoreUnitsPerSecond`; they must end within
0.05 seconds of the clip duration to allow frame rounding.

Images are rendered offscreen from each library entry's complete `sequenceJson`
with the existing MCP `StandaloneRenderer`. This preserves the captured motions,
orientations, turns, grid mode, and prop family. The builder does
not regenerate pictographs by letter or consult the letter CSV. Identical scores
with the same prop family share PNGs even when captured at different rates.
Image paths carry a renderer-style revision so a future appearance change can
be built alongside the current images.

Verify staged package bytes after packaging:

```powershell
node unreal/Shared/Tools/performance-pictographs.mjs verify --project unreal/MuseumGame --packaged-data <package-Content/Data>
```

Verification checks library provenance, every score-derived step and time,
all image hashes, and the staged sidecar and image bytes. A missing or altered
sidecar cannot silently display unrelated notation. Existing native playback
remains available if the optional sidecar is absent.

Both games' package scripts verify the sidecar before cooking and again against
the packaged bytes when it is present. Rendering runs from the repository so it
can use the canonical renderer and its dependencies. Verification needs only
Node and the staged shared tools. For Flow Fest, use its project path in the
same commands. Rebuild pictographs whenever the sealed library changes.
