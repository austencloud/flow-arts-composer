import {
  setKeyframe,
  type PostItem,
  type PostProject,
} from "@austencloud/video-editor/core";
import {
  createEmptyPostProject,
  editContext,
  ringStepSeconds,
  type PostCardRing,
} from "#lib/shared/post-studio-plugin/index.js";
import {
  TITLES_HOOK_BOX,
  TITLES_PARK_LEFT,
  TITLES_PARK_TOP,
  landTitlesOnCard,
  parkedSize,
} from "#lib/shared/media-composition/domain/post-project-edits.js";

const ANIMATION_ID = "card-ending-animation";
const CARD_ID = "card-ending-card";
const TITLES_ID = "card-ending-titles";

/** The animation plays to here, and the card takes over. */
export const CARD_ENDING_CARD_START = 4;
/** The card stays this long, with the QR landed for the last seconds. */
const CARD_SECONDS = 16;
/** The pictographs on the harness's 16-count card. */
const CARD_STEPS = 16;
/** The ring, in seconds from the card's start: on from 5 s, every 0.75 s. */
const RING: PostCardRing = { at: 5 - CARD_ENDING_CARD_START, every: 0.75 };
/** The QR leaves this long after the ring reaches the last pictograph. */
const QR_AFTER_LAST_STEP = 0.5;
const CARD_BOX = { x: 0.05, y: 0.18, width: 0.9, height: 0.64 };
/**
 * Where the card draws its header word, as shares of its box. This is an
 * estimate so the harness opens already landed; pressing Land on card at
 * 4 s in the harness measures the drawn card and writes the exact spot.
 */
const ESTIMATED_WORD = { x: 0.3, y: 0.012, width: 0.4, height: 0.05 };
/** A scan link so the card shows a QR without minting one. */
const QR_URL = "https://tka.run/";

/**
 * The card's ending in one post: the live animation to 4 s, then the card
 * cascading in, a gold ring stepping through its pictographs from 5 s, its
 * QR flying out with a caption half a second after the ring reaches the last
 * pictograph, and a titles name pair parked top left from the start that
 * lands on the card's header at 4 s. Never loads or saves the creator's
 * draft.
 */
export function cardEndingFixture(sequenceId: string): PostProject {
  const end = CARD_ENDING_CARD_START + CARD_SECONDS;
  const lastStep = ringStepSeconds(RING, RING.every!, CARD_STEPS - 1);
  const shared = {
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    anchor: null,
    fill: false,
  };
  const animation = {
    ...shared,
    id: ANIMATION_ID,
    kind: "animation",
    start: 0,
    duration: CARD_ENDING_CARD_START,
    box: { x: 0, y: 0, width: 1, height: 1 },
    overlay: true,
  } as PostItem;
  const card = {
    ...shared,
    id: CARD_ID,
    kind: "card",
    start: CARD_ENDING_CARD_START,
    duration: CARD_SECONDS,
    box: CARD_BOX,
    qrUrl: QR_URL,
    cardAppearance: { darkMode: true, showQRCode: true, showMandala: true },
    enter: { style: "cascade" },
    ring: RING,
    qrExit: { at: lastStep + QR_AFTER_LAST_STEP, caption: "Scan to try it" },
  } as PostItem;
  // Parked from the first frame: one box key holds it top left.
  const parked = {
    x: TITLES_PARK_LEFT,
    y: TITLES_PARK_TOP,
    ...parkedSize(TITLES_HOOK_BOX),
  };
  const titles = setKeyframe(
    {
      ...shared,
      id: TITLES_ID,
      kind: "titles",
      start: 0,
      duration: end,
      box: { x: 0, y: 0, width: 1, height: 1 },
      spoken: "omega, lambda-dash, X, J",
      leave: "stay",
    } as PostItem,
    "box",
    0,
    parked
  );
  const project: PostProject = {
    ...createEmptyPostProject({ sequenceId, now: 0 }),
    tracks: [
      { id: "main", hidden: false, locked: false, items: [] },
      {
        id: "card-ending-animation-track",
        hidden: false,
        locked: false,
        items: [animation],
      },
      {
        id: "card-ending-card-track",
        hidden: false,
        locked: false,
        items: [card],
      },
      {
        id: "card-ending-titles-track",
        hidden: false,
        locked: false,
        items: [titles],
      },
    ],
  };
  // The real Land on card edit writes the glide, the quiet line and the
  // card's hand-off.
  return landTitlesOnCard(
    project,
    TITLES_ID,
    CARD_ID,
    CARD_ENDING_CARD_START,
    ESTIMATED_WORD,
    editContext(0)
  );
}
