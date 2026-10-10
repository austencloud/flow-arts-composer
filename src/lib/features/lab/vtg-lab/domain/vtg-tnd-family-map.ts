import type { VTGMode } from "#lib/features/learn/domain/constants/vtg-experience-data.js";

/**
 * The 6 VTG modes map 1:1 to the 6 TnD families used by the deck releaser
 * (deck-composer FAMILY_ORDER). Timing (1st letter) + direction (2nd letter):
 *   S=split, T=together, Q=quarter | S=same, O=opposite.
 */
export const VTG_MODE_TO_TND_FAMILY: Record<VTGMode, string> = {
  SS: "split-same",
  TS: "tog-same",
  SO: "split-opp",
  TO: "tog-opp",
  QS: "quarter-same",
  QO: "quarter-opp",
};
