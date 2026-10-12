import type { GuideBlock } from "../guide-content-blocks";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import {
  DUAL_SHIFT_MODES,
  dualShiftSteps,
} from "#lib/shared/guide-topics/dual-shifts-topic.js";

/**
 * Verbatim prose lifted from _pages/Type1AlphaBetaPage.svelte (Austen's words -
 * never AI-written). The four loops come from the shared Dual-Shifts record
 * the Guide web page also reads, so one owner holds every pictograph.
 */

// Start + 4 real pictographs per mode. Type1AlphaBetaPage's PICTO_FLAGS keep
// showReversals off, so the steps are used directly - no bakeReversals needed.
const [SPLIT_SAME, TOG_SAME, SPLIT_OPP, TOG_OPP] = DUAL_SHIFT_MODES.map(
  (mode) => dualShiftSteps(mode) as unknown as PictographData[]
);

/** HAND props - matching Type1AlphaBetaPage's PICTO_FLAGS. */
const RENDER = { propType: PropType.HAND } as const;

const SEQ_WORDS = [
  "α→α Split-Same",
  "β→β Tog-Same",
  "α↔β Split-Opp",
  "α↔β Tog-Opp",
];

export const hmType1Content: GuideBlock[] = [
  { kind: "heading", level: 1, text: "Type 1 Dual-Shifts: Alpha and Beta" },
  {
    kind: "prose",
    html:
      'When both hands move to adjacent locations, it’s called a <span class="cy">Dual</span><span class="pu">-Shift</span>.<br>' +
      'Our first <span class="cy">Dual</span><span class="pu">-Shifts</span> correspond to the four modes of time/direction: SS, TS, SO, TO.<br>' +
      "You can determine the start position by looking at the non-pointed end of the arrow.",
  },
  { kind: "heading", level: 2, text: "Split-Same" },
  {
    kind: "pictographGroup",
    items: SPLIT_SAME!,
    flowCols: 5,
    layout: "strip",
    stepLabels: ["Start", "1", "2", "3", "4"],
    card: true,
    render: RENDER,
    caption: SEQ_WORDS[0],
  },
  { kind: "heading", level: 2, text: "Tog-Same" },
  {
    kind: "pictographGroup",
    items: TOG_SAME!,
    flowCols: 5,
    layout: "strip",
    stepLabels: ["Start", "1", "2", "3", "4"],
    card: true,
    render: RENDER,
    caption: SEQ_WORDS[1],
  },
  {
    kind: "prose",
    html:
      "The Kinetic Alphabet puts focus on simultaneous motions between<br>" +
      "two positions, relative to the center point.<br>" +
      'Let’s try another type of <span class="cy">Dual</span><span class="pu">-Shift</span>.<br>' +
      "What happens when we move between α and β?",
  },
  { kind: "heading", level: 2, text: "Split-Opp" },
  {
    kind: "pictographGroup",
    items: SPLIT_OPP!,
    flowCols: 5,
    layout: "strip",
    stepLabels: ["Start", "1", "2", "3", "4"],
    card: true,
    render: RENDER,
    caption: SEQ_WORDS[2],
  },
  { kind: "heading", level: 2, text: "Tog-Opp" },
  {
    kind: "pictographGroup",
    items: TOG_OPP!,
    flowCols: 5,
    layout: "strip",
    stepLabels: ["Start", "1", "2", "3", "4"],
    card: true,
    render: RENDER,
    caption: SEQ_WORDS[3],
  },
  {
    kind: "prose",
    html: "Notice that it can be either <em>Split-Opp</em> or <em>Tog-Opp</em> depending on start position.",
  },
  {
    kind: "prose",
    html: '<strong>Practice using <span class="cy">Dual</span><span class="pu">-Shifts</span> to travel between Alpha and Beta in each mode.</strong>',
  },
];
