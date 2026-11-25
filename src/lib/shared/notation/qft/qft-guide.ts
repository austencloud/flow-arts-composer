/**
 * The eight canonical moves, in the order the 2011 guide teaches them.
 *
 * Each entry pairs a restored animation with the knob values that reproduce the
 * same move. Aspect ratios are the extracted crops' real proportions, written by
 * scripts/extract-qft-frames.mjs — several of these drawings are markedly tall
 * or wide, and each card is shaped to fit its own.
 *
 * No pull-quotes. The moves are stated in their own terms — every `spec` is a
 * fact about the knob values that produce the move, which is what a reader
 * needs. The sources are credited by link in SOURCES below; that is attribution,
 * not commentary.
 */

import type { QftKnobs } from "./qft-model";
import {
  createPendulumTrajectory,
  trajectoryFromKnobs,
  type QftTrajectory,
} from "@tka/shape-domain";

export interface GuideMove {
  id: string;
  title: string;
  /** Frame directory under /notation/qft/frames/. */
  stem: string;
  /** The crop's own proportions, e.g. "421/265". */
  aspect: string;
  knobs: QftKnobs;
  pendulum?: boolean;
  /** The canonical motion owner used by the One Surface app. */
  trajectory: QftTrajectory;
  /** Factual label: the knob values that produce this move. */
  spec: string;
}

function defineGuideMove(move: Omit<GuideMove, "trajectory">): GuideMove {
  return {
    ...move,
    trajectory: move.pendulum
      ? createPendulumTrajectory(move.knobs.radius)
      : trajectoryFromKnobs(move.knobs),
  };
}

export const GUIDE_MOVES: GuideMove[] = [
  defineGuideMove({
    id: "static",
    title: "Static spin",
    stem: "static2",
    aspect: "344/389",
    knobs: { radius: 0, downbeats: 1, spin: "inspin" },
    spec: "radius 0 · one prop rotation per hand rotation",
  }),
  defineGuideMove({
    id: "pendulum",
    title: "Pendulum",
    stem: "pendulum",
    aspect: "196/189",
    knobs: { radius: 0, downbeats: 1, spin: "inspin" },
    pendulum: true,
    spec: "radius 0 · the swing never reaches 7, 8 or 1",
  }),
  defineGuideMove({
    id: "extension",
    title: "Extension",
    stem: "extension",
    aspect: "296/298",
    knobs: { radius: 1, downbeats: 1, spin: "inspin" },
    spec: "radius 1 · hand and prop orientations identical",
  }),
  defineGuideMove({
    id: "isolation",
    title: "Isolation",
    stem: "isolationanimated",
    aspect: "191/219",
    knobs: { radius: 0.5, downbeats: 1, spin: "inspin", phase: 4 },
    spec: "radius 0.5 · prop opposite the hand on the compass",
  }),
  defineGuideMove({
    id: "cateye",
    title: "Cateye",
    stem: "cateyeanimated",
    aspect: "124/200",
    knobs: { radius: 0.5, downbeats: 1, spin: "antispin" },
    spec: "radius 0.5 · prop advances one position per step",
  }),
  defineGuideMove({
    id: "triquetra",
    title: "Triquetra",
    stem: "triquetraanimated",
    aspect: "421/265",
    knobs: { radius: 1, downbeats: 2, spin: "antispin" },
    spec: "radius 1 · two prop rotations per hand rotation",
  }),
  defineGuideMove({
    id: "antispin4",
    title: "4-petal antispin",
    stem: "antispindiranimated",
    aspect: "350/488",
    knobs: { radius: 1, downbeats: 3, spin: "antispin" },
    spec: "radius 1 · three prop rotations per hand rotation",
  }),
  defineGuideMove({
    id: "inspin4",
    title: "4-petal inspin",
    stem: "inspindiranimated",
    aspect: "350/486",
    knobs: { radius: 1, downbeats: 5, spin: "inspin" },
    spec: "radius 1 · five prop rotations · same positions as antispin, opposite directions",
  }),
];

/** The four sources, ranked by authority in the sourcing archive. */
export const SOURCES = [
  {
    label: "Charlie Cushing: QfT Tutorial Series",
    href: "https://www.youtube.com/playlist?list=PL45D3844B85CB8D80",
  },
  {
    label: "Drex: A Beginner's Guide to Prop QFT Notation",
    href: "https://www.homeofpoi.com/en/community/forums/topics/932537/A-Beginner-s-Guide-to-Prop-QFT-Notation",
  },
  {
    /* Named as the image source because it is: these frames were pulled from
		   here, and this is the copy that still serves them. */
    label: "Drex: the same guide on his blog, images intact",
    href: "https://drexfactor.com/weirdscience/2011/05/18/beginners_guide_poi_qft_notation",
  },
  {
    label: "Drex: Charlie's QFT instruction videos now easier to watch",
    href: "https://drexfactor.com/weirdscience/2011/11/02/charlies_qft_instruction_videos_now_easier_watch",
  },
];

/*
 * Every date here is one a source actually carries, and no more.
 *
 * The previous version dated Charlie's devising of QfT to 2011, credited the
 * video chapters to November 2011, and put the unanswered forum question in
 * 2022. None of the three is in the archive. What the archive has is two Drex
 * post URLs (2011/05/18 for the guide, 2011/11/02 for the videos write-up) and
 * the statement that a horizontal-plane question went unanswered for eleven
 * years without saying when it was asked. Inferring the rest is how the
 * "Quarters for Transitions" fabrication happened, one layer up.
 *
 * Source: docs/reference/archive/qft-notation/README.md
 */
export const TIMELINE = [
  {
    when: "before 2011",
    what: "Charlie Cushing devises QfT. The guide credits him with it and gives no date.",
  },
  {
    when: "May 2011",
    what: "Drex publishes the write-up on his blog. The same post runs on Home of Poi.",
  },
  {
    when: "Nov 2011",
    what: "Drex posts that Charlie's ten video chapters are easier to watch.",
  },
  {
    when: "since",
    what: "The promised written follow-ups have not been found. A forum question about horizontal-plane moves went unanswered for eleven years. The forum's images stop loading; the blog's still serve.",
  },
];
