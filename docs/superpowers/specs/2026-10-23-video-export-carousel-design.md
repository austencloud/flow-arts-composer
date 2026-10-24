# Beat carousel in downloaded videos

Approved by Austen on 2026-10-23.

## What it does

The Download video sheet (PostShareSheet's Video tab) and the viewer's Export page get a Carousel row with five visible choices: Off, Above, Below, Left and Right. Any choice but Off renders the app's spotlight beat carousel into the MP4 on that side of the animation. The current beat is large, its neighbours shrink and fade, and the row slides into each beat as it plays.

- The choice is saved with the other video settings (`ExportOptionsState.videoCarousel`).
- Beat dots replace the progress bar while a carousel is on.
- Cards follow the video's dark or light setting.
- The workspace sheet's live preview shows the real `StepStrip` on the chosen side, following the preview's playback.
- 3D takes, Tunnel videos and Post Studio renders are unchanged; the row is hidden for 3D.

## Frame

The card (word header over the animation square) keeps its size. The band adds 0.26 of the square on the chosen side (`VIDEO_CAROUSEL_BAND_RATIO`), so the frame grows: a 1080p video is 812 by 1080 with the band above or below, and wider than tall with it beside. `layoutVideoCarouselFrame` places the card and band in output pixels; they tile the frame without overlap.

## Position

The carousel follows the engine's beat convention: [0, 1) is the start pose and [k, k+1) is beat k in flight. Repeats count on, so the row never rewinds between passes. A video that ends on a hold or replays from the start pose settles on its last beat instead of sliding toward a next pass (`videoCarouselPosition`).

## Painter

`beat-carousel-painter` gains an orientation (vertical bands transpose the horizontal layout) and a palette. Post Studio keeps its `studio` palette; the video uses `dark` or `light`.

## Tests

`tests/unit/video-export/video-carousel.test.ts` covers the placements, frame sizes, tiling, band side, position and the compositor's band layer. `tests/unit/media-composition/beat-carousel-layout.test.ts` covers the vertical layout.
