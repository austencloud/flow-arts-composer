/**
 * card-anatomy-legend
 *
 * The "What's on the Card" copy — front and back — shared by the product
 * pages' "how it works" sections and the click-to-explain modal that opens
 * from a Choreo Card fan. Single source so the surfaces can never drift.
 * Card-agnostic wording (it describes the sequence generically), so the same
 * rows explain any card the reader clicks on.
 */

export interface CardAnatomyLegendItem {
  /** Region id — matches CardAnatomy's front-region keys and back selectors. */
  readonly id: string;
  readonly term: string;
  readonly text: string;
}

export const FRONT_LEGEND: readonly CardAnatomyLegendItem[] = [
  { id: "word", term: "The word", text: "The sequence's word, spelled in TKA letters." },
  {
    id: "start",
    term: "Start",
    text: "The start placement: where the sequence starts and ends.",
  },
  { id: "steps", term: "The steps", text: "The sequence itself, step by step, as pictographs." },
  {
    id: "mandalas",
    term: "Mandalas",
    text: "The mandalas that show in blue and red what the sequence looks like when performed.",
  },
  {
    id: "qr",
    term: "QR code",
    text: "Scan it to immediately visualize this sequence with any prop at any speed, save it to your personal catalog, and open practice mode.",
  },
];

export const BACK_LEGEND: readonly CardAnatomyLegendItem[] = [
  {
    id: "turn",
    term: "Turn pattern",
    text: "How many extra rotations the sequence carries, and whether there's a pattern in that too.",
  },
  {
    id: "reversal",
    term: "Reversal pattern",
    text: "A simple glyph showing whether the props alternate spin direction over the course of the pattern.",
  },
  {
    id: "mandala",
    term: "Combined mandala",
    text: "A combination of the two mandalas. The purple represents where they overlap.",
  },
  {
    id: "looptype",
    term: "LOOP type",
    text: "The LOOP type of the sequence.",
  },
  {
    id: "difficulty",
    term: "Difficulty",
    text: "The difficulty level. The Kinetic Alphabet is built into clear tiers of difficulty.",
  },
  {
    id: "startpos",
    term: "Start placement",
    text: "Shows you where the sequence starts and ends, and the prop that sequence is using on that card.",
  },
  { id: "stepcount", term: "Step count", text: "The number of steps in the sequence." },
];
