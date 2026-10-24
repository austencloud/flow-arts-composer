# Release Media Standard

Set by Austen on 2026-10-21, after the 0.49.0 draft shipped page screenshots
and two fans parked far apart. The aim is that people want to watch the
example and understand the change from it before reading a word.

## What earns an example

- Only headline changes get one. Everything else stays text.
- Never promote a page that exists for search or reference. The Props page
  (`/notation/props`) is one: keep it out of release notes entirely.

## What the example shows

- **The feature doing its job, not the page it lives on.** Bake it with the
  app's own renderers (`/test/release-media`, the 3D viewer takes), never a
  screenshot of a scrolling page.
- **A story, not a still.** One idea told as a short arc that loops cleanly:
  simple to rich (a hand path, then a prop on it, then a tunnel), one to many
  (a single fan multiplied into a sculpture), before to after, or flat to 3D.
  Every take in a story shares one sequence and one clock, so a cross-fade
  carries the same motion straight on.
- **Compose the frame.** Props form a shape: a ring, a tunnel, a sculpture.
  Never two props parked at the edges with empty space between them.
- **Show the app at its best.** Dark stage, an effect that suits the subject,
  trails or the tunnel where they help. No grid or glyphs unless the change is
  about them.
- **A screen only for a layout change**, and then it is a recording: the
  whole changed area in view, nothing cut off at the frame edge, no browser
  chrome, motion (live tiles playing, a prop switch) where the screen has it.

## Words

- The note text explains, in one sentence. The clip carries at most a short
  label that orients the viewer (an effect name, "Hands", "Poi", "Tunnel").

## Format

- Square by default: it fills the What's New frame and the email column.
  16:10 only for a screen recording.
- 720 to 1040 px source, 8 to 16 seconds, a seamless loop.
- Each example ships as an MP4 (app), a GIF (email, under about 4 MB) and a
  JPG poster. `scripts/release-media-grid.mjs` and
  `scripts/release-media-scenes.mjs` hold the recipes, so a clip can be
  rebaked when the app changes.

## Review

- Austen sees every clip before upload, in the real What's New through
  `/test/release-notes-preview`. Uploading to R2 is a publish and needs his
  yes.
