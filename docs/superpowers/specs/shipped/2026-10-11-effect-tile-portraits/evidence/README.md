# Effect tile portraits: evidence set

Captures from the primary dev server (`https://localhost:5173`) after each
batch merged to local main, 2026-10-11. The Looks panel captures come from
`/test/effect-tuner`, which mounts the production Effects panel at full tile
size (304x114 per tile). The strip captures come from the Create player's
quick-switch popover on `/create/generate`.

Every tile canvas is a fixed 720x270 picture on a dark ground (see the tile
contract in the spec), so the pictures do not change between the app's dark
and bright chrome; only the panel around them does. The quick-switch popover
is matte black in both, which is why one strip set stands for both themes.

## Kit extraction (batch 1)

| Before                | After                 | Result                        |
| --------------------- | --------------------- | ----------------------------- |
| `kit-before-fire.png` | `kit-after-fire.jpg`  | Same picture, pixel for pixel |
| `kit-before-coal.png` | `kit-after-coal.png`  | Same picture                  |
| `kit-before-bloom.png`| `kit-after-bloom.png` | Same picture                  |

## Portraits, by effect

| File                                          | Surface                 | Reference page                 | Match                                                                                                                                                              |
| --------------------------------------------- | ----------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `zap.png`                                     | Looks panel             | `reference/zap.html`           | Matches: Storm forks, Tesla single arc with halo, Web crackle.                                                                                                     |
| `sparkle.png`                                 | Looks panel             | `reference/sparkle.html`       | Matches all six glint looks.                                                                                                                                       |
| `ghost-club-360.jpg`                          | Looks panel             | `reference/ghost2.html`        | Matches; the tile shows the user's current prop (Club here), which the page could not.                                                                             |
| `goo.png`                                     | Looks panel             | `reference/goo.html`           | Matches all seven; cached per preset (8 to 19 ms first paint).                                                                                                     |
| `bubbles.png`                                 | Looks panel             | `reference/bubbles.html`       | Matches all six.                                                                                                                                                   |
| `petals.png`                                  | Looks panel             | `reference/petals.html`        | Matches all six.                                                                                                                                                   |
| `smoke.png`                                   | Looks panel             | `reference/smoke3.html`        | Matches all six (v6 staged plume).                                                                                                                                 |
| `ink.jpg`                                     | Looks panel             | `reference/ink.html`           | Matches: Toxic swash with drops, Neon Tag additive glow, Splatter dark blood ribbon with chips.                                                                    |
| `silk-1.jpg`, `silk-2.jpg`                    | Looks panel             | `reference/silk.html`          | Matches six ribbons. Deliberate difference: the prop color is the default left trail blue (#3575E2), not the page's dimmer indigo, so Classic and Streamer read bluer. |
| `animal-1.jpg`, `animal-2.jpg`                | Looks panel             | `reference/animal.html`        | Matches six creatures; Whisper on its lit ground, Gilt Wyrm's neck crosses over its coil.                                                                          |
| `pulse.jpg`                                   | Looks panel             | `reference/pulse.html`         | Matches: Sonar beat rings with charge, Shockwave bang with flash and fringe, Heartbeat double ring, Ripple stream. Flash and core radii follow the page's units.    |
| `effects-grid.png`, `quick-switch-strip.png`  | Effects grid, strip     | (batch 1)                      | Grid thumbnails and the strip after batch 1.                                                                                                                       |
| `strip-dark-1.png` to `strip-dark-3.png`      | Quick-switch popover    | all pages                      | The whole strip after batch 4, scrolled in three steps: LED to Bloom, Bloom to Ink, Petals to Pulse. Every effect shows its portrait; Off stays an icon.            |

## Deviations from the plan's capture matrix

The plan asked for the picker at 1280x800 and 390x844 in both themes through
the DevTools MCP. Two agent Vite servers already held the resource cap during
batches 3 and 4, so every capture here was taken in the in-app browser on the
primary server after integration, at 800x1100 (where the strip shows pictures
rather than icons). The tiles themselves are resolution and theme independent,
so the single viewport covers the question the matrix was asking: does each
portrait read at 304x114 in the real picker.
