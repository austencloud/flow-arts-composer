// Construct tutorial, take 1. Copy to
// <feature root>/construct-tutorial/captures/construct-tutorial.capture.mjs
// and run:
//   node scripts/feature-video/capture.mjs --feature construct-tutorial \
//     --capture construct-tutorial [--origin https://localhost:5186]
//
// Same recipe as the Generate tutorial's take 3: a 1920 by 1080 page at a
// device scale of 2, so the walkthrough's push-ins stay sharp. The page is
// laid out as a desktop (mobile: false). Every wait after a click is the
// time its bubble needs on screen; see walkthrough.json beside this file.
//
// Every label below was checked against the running app on 2026-10-22 at
// 1920 by 1080, signed out. Nothing in the take writes anywhere: the Save
// dialog is cancelled and the Share menu is left open, since Copy link
// would create a short code.
//
// `click` finds buttons, links, inputs and radios by label. The step cells,
// the step editor's controls, Play and the Sequence Actions button are other
// elements with an aria-label, so they go through `pick` with a selector.
//
// TKA_CAPTURE_DRY=1 records the same clicks at scale 1 with short holds,
// to check the labels before the real take.

const DRY = process.env.TKA_CAPTURE_DRY === "1";
const pace = DRY ? 0.25 : 1;
// Scale 2 gave 15 frames a second on the laptop that made take 1 (scale 1
// gave 30), so TKA_CAPTURE_SCALE=1.5 is the pilot's fallback for a slow
// screencast. The walkthrough caps its zoom at the take's scale.
const SCALE = DRY ? 1 : Number(process.env.TKA_CAPTURE_SCALE || 2);
const BUBBLE_MS = 3600 * pace;
const MORPH_MS = 1800; // start placement flying into the workspace
const OPTIONS_MS = 1200; // the option picker refilling after a step
const PLAY_MS = DRY ? 3000 : 9000;

const option = (letter) =>
  `[data-testid="option-card"][data-letter="${letter}"]`;
const labelled = (label) => `[aria-label="${label}"]`;

export default {
  id: "construct-tutorial",
  url: "/create/construct",
  viewport: {
    width: 1920,
    height: 1080,
    deviceScaleFactor: SCALE,
    mobile: false,
  },
  ready: "!!document.querySelector('[data-testid=\"start-placement-picker\"]')",
  settleMs: 2500,
  async run(director) {
    const { click, pick, wait, shot } = director;
    // A panel or dialog the app loads on first use can take longer than a
    // bubble's hold to appear on a cold dev server (take 2 lost the Mirror
    // button that way), so a click that follows one is retried for a while
    // before it counts as missing.
    const retrying =
      (act) =>
      async (...args) => {
        for (let attempt = 1; ; attempt += 1) {
          try {
            return await act(...args);
          } catch (error) {
            if (attempt >= 12 || !/Missing visible target/.test(String(error)))
              throw error;
            await wait(700);
          }
        }
      };
    const clickReady = retrying(click);
    const pickReady = retrying(pick);
    // A fresh profile gets the "New to Construct?" offer. Decline it before
    // the recording starts so the video opens on the picker alone.
    try {
      await click("Not now");
      await wait(600);
    } catch {
      // No offer on this profile: nothing to decline.
    }
    // The clicks and holds below take about two minutes at full pace; the
    // shot ends soon after the last one so the take has no long tail.
    await shot("construct-tutorial", DRY ? 75 : 130, async () => {
      // Start
      await wait(1500);
      await pick(
        '[data-testid="start-placement-picker"] [data-ghost-label="α"]'
      );
      await wait(MORPH_MS + BUBBLE_MS * 2);

      // Options
      await pick(option("A"), 0);
      await wait(OPTIONS_MS + BUBBLE_MS * 2);
      await pick(option("B"), 0);
      await wait(OPTIONS_MS + BUBBLE_MS);

      // Levels
      await click("Level 1: Base Motions");
      await wait(BUBBLE_MS);
      await click("Level 2: Whole Turns");
      await wait(BUBBLE_MS * 2);
      await pick('[aria-label="Left turns"] button', 1); // the "1" button
      await wait(BUBBLE_MS);
      await pick(option("C"), 0);
      await wait(OPTIONS_MS + BUBBLE_MS);
      await click("Level 3: Half Turns, Floats");
      await wait(BUBBLE_MS);

      // Edit
      await pickReady(labelled("Step 2 Pictograph"));
      await wait(BUBBLE_MS);
      await pickReady(labelled("Add half a turn: Left"));
      await wait(BUBBLE_MS);
      // The label carries the current direction, which the turn edit above
      // may have changed, so match its start only.
      await pick('[aria-label^="Toggle Left rotation"]');
      await wait(BUBBLE_MS);
      await pick(labelled("Close step editor"));
      await wait(800);
      await click("Undo");
      await wait(BUBBLE_MS);

      // Play
      await pickReady(labelled("Play sequence"));
      await wait(PLAY_MS);
      await pickReady(labelled("Stop playback and return to card"));
      await wait(800);

      // Actions
      await pickReady(labelled("Sequence Actions"));
      await wait(BUBBLE_MS);
      await pickReady(labelled("Mirror Sequence: flip left and right"));
      await wait(BUBBLE_MS);
      await clickReady("Back to workspace");
      await wait(800);

      // Save and share
      await clickReady("Save to Library");
      await wait(BUBBLE_MS * 2);
      await clickReady("Cancel");
      await wait(800);
      await clickReady("Share sequence");
      await wait(BUBBLE_MS);
    });
  },
};
