import type { ReversalType } from "../types/reversal.js";

export const REVERSAL_DEFINITION = "Directional changes in TKA sequences where hands and/or props change their path or rotation direction." as const;

export const REVERSAL_TYPES: Record<string, ReversalType> = {
  handReversal: {
    description: "Hand returns to point it came from previously",
    propBehavior: "Prop continues direction without changing",
    rotationEffect: "Changes prospin to antispin and vice-versa (relative to center point)",
    notation: "No special notation required",
    transitions: {
      prospinToAntispin: true,
      antispinToProspin: true,
    },
  },
  propReversal: {
    description: "Hand continues to next point while prop reverses direction",
    propBehavior: "Prop changes rotation direction",
    rotationEffect: "Changes prospin to antispin and vice-versa",
    notation: "R/R added in corresponding color between pictographs",
    transitions: {
      prospinToAntispin: true,
      antispinToProspin: true,
    },
  },
  fullReversal: {
    description: "Both prop and hand retrace their paths to the previous placement",
    propBehavior: "Prop reverses direction",
    handBehavior: "Hand returns to previous point",
    notation: "R/R indicates prop reversal component",
    transitions: {
      prospinToProspin: true,
      antispinToAntispin: true,
    },
  },
} as const satisfies Record<string, ReversalType>;

export const REVERSAL_NOTATION = {
  propReversalMarking: {
    symbol: "R/R",
    color: "Corresponding hand color (red/blue)",
    placement: "Between pictographs where reversal occurs",
    purpose: "Indicate something unusual happening",
  },
  handReversal: {
    marking: "None required",
    reason: "Least disruptive and most common",
  },
} as const;
