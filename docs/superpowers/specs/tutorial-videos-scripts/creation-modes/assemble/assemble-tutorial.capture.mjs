// Assemble tutorial, take 1. Copy to
// <feature root>/assemble-tutorial/captures/assemble-tutorial.capture.mjs
// and run:
//   node scripts/feature-video/capture.mjs --feature assemble-tutorial \
//     --capture assemble-tutorial --profile <signed-in capture profile>
//
// Same recipe as the Generate tutorial's take 3 (1920 by 1080 at scale 2,
// desktop layout). Grid points are <circle role="button"> elements whose
// accessible name changes with the phase: "Set Left start at North" before
// the first step, then "Move Left prop to East". Each click animates one hop
// and the points are disabled until it lands, so every move waits for it.
//
// Labels marked CONFIRM were read from the code, not from a running page.

const BUBBLE_MS = 3600;
const HOP_MS = 1400; // one hop of the prop, plus the phase returning to building

export default {
  id: "assemble-tutorial",
  url: "/create/assemble",
  viewport: { width: 1920, height: 1080, deviceScaleFactor: 2, mobile: false },
  ready:
    "!!document.querySelector('[aria-label=\"Visual sequence builder grid\"]')",
  settleMs: 2500,
  async run(director) {
    const { click, pick, wait, shot } = director;
    await shot("assemble-tutorial", 170, async () => {
      // Grid
      await wait(1500);
      await click("Grid: Diamond");
      await wait(BUBBLE_MS * 2);
      // CONFIRM: the popover's Diamond option; the chip has the same visible text.
      await pick(
        '[role="dialog"] button, [role="menu"] button, .grid-mode-picker button',
        0
      );
      await wait(800);

      // Left hand
      await click("Set Left start at North");
      await wait(HOP_MS + BUBBLE_MS * 2);
      await click("Move Left prop to East");
      await wait(HOP_MS + BUBBLE_MS * 2);
      await click("Move Left prop to South");
      await wait(HOP_MS + 600);
      await click("Move Left prop to West");
      await wait(HOP_MS + BUBBLE_MS);

      // Right hand
      // CONFIRM: the radio's visible text is "Right hand"; its aria-label carries a step count.
      await click("Right hand");
      await wait(BUBBLE_MS);
      await click("Set Right start at South");
      await wait(HOP_MS + BUBBLE_MS);
      await click("Move Right prop to West");
      await wait(HOP_MS + BUBBLE_MS);
      await click("Move Right prop to North");
      await wait(HOP_MS + 600);

      // Turns
      await click("Turn settings: CW 0");
      await wait(BUBBLE_MS);
      // CONFIRM: the "1" option and the "CCW" option inside the turn popover.
      await pick('[aria-label="Turn count and rotation direction"] button', 4);
      await wait(BUBBLE_MS);
      await pick('[aria-label="Turn count and rotation direction"] button', 1);
      await wait(BUBBLE_MS);
      await click("Move Right prop to East");
      await wait(HOP_MS + BUBBLE_MS);

      // Complete
      await click("Complete");
      await wait(BUBBLE_MS);
      await click("Open sequence viewer");
      await wait(9000);
      // CONFIRM: the viewer's close control.
      await click("Close");
      await wait(800);
      await click("Save to Library");
      await wait(BUBBLE_MS);
    });
  },
};
