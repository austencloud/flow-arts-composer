/**
 * The Archive's audio guide — the first voice.
 *
 * DRAFT. Every line in this file is in-fiction text written for Austen's pass
 * (2026-09-04). Nothing here is final copy.
 *
 * The building's PA plays the recorded tour when the visitor enters a room
 * or walks up to certain exhibits. The tape is K, recorded 1989–1993 as the
 * Archive's narrator: over-prepared and reverent in 1989, looser with asides
 * by 1991, tighter and professional by 1993. The tape ends in the Crumble,
 * where the building did. From K's Gallery on, a second tape plays — the
 * curator's, recorded 2009, the same person fifteen years later.
 *
 * Elements are never spoken. The clinical TnD labels are stamped on the
 * threshold line under the room name instead (`roomStamp`).
 */
import type { VillageMomentKind } from "#lib/features/village/state/village-moments.js";
import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
import { CAVE_MODE_ROOMS } from "./vulcan-cave-floor-plan";

export type NarrationVoice = "guide" | "curator" | "tape";

export interface NarrationCue {
  id: string;
  roomId: string;
  trigger:
    | { kind: "room" }
    | { kind: "exhibit"; refId: string; radiusTiles?: number }
    /** A moment in the room's village sim (village/state/village-moments.ts),
     * heard only while the visitor is in the cue's room. */
    | { kind: "village"; moment: VillageMomentKind };
  /** Stamp shown on the caption bar, e.g. "RECORDED 1989". */
  recorded: string;
  voice: NarrationVoice;
  lines: string[];
  /** Lines that name the sequence the visitor carried in, with `{word}` in
   * place of its word. Spoken instead of `lines` when the word is known; the
   * visitor may carry anything, so these never assume OOGA. */
  carriedLines?: string[];
  draft?: boolean;
}

const D = true;

export const NARRATION_CUES: NarrationCue[] = [
  // ── 1989: over-prepared, reverent, three "please"s ──
  {
    id: "nar-entrance",
    roomId: "entrance",
    trigger: { kind: "room" },
    recorded: "RECORDED 1989",
    voice: "guide",
    draft: D,
    lines: [
      "Welcome to the Kinetic Archive. This recording will accompany you through the collection.",
      "Please remain behind the ropes. Please do not touch the exhibits.",
      "Please do not, under any circumstances, attempt what you see.",
      "Thank you. The first wing is north.",
    ],
  },
  {
    id: "nar-cave-threshold",
    roomId: "cave-threshold",
    trigger: { kind: "room" },
    recorded: "RECORDED 1989",
    voice: "guide",
    draft: D,
    lines: [
      "You are entering the oldest wing. The temperature drop is intentional.",
      "The Order asks that you observe the tablets as artifacts. They are not instructions.",
      "I have been asked to say that twice. They are not instructions.",
      "Tablet OOGA-1 stood in the first case. A replica. The original is held elsewhere.",
      "The figure on the left is holding two implements. The figure on the right is not. The catalog does not say which one carved it.",
    ],
  },
  {
    id: "nar-cave-squeeze",
    roomId: "cave-squeeze",
    trigger: { kind: "room" },
    recorded: "RECORDED 1989",
    voice: "guide",
    draft: D,
    lines: [
      "Mind the walls. The passage narrows to the width of a person carrying nothing.",
      "That is, the Bureau notes, the correct width.",
    ],
  },
  {
    id: "nar-cave-water-approach",
    roomId: "cave-water-approach",
    trigger: { kind: "room" },
    recorded: "RECORDED 1989",
    voice: "guide",
    draft: D,
    lines: ["Ahead, the first chamber. You will hear it before you see it."],
  },
  {
    id: "nar-cave-water-gallery",
    roomId: "cave-water-gallery",
    trigger: { kind: "room" },
    recorded: "RECORDED 1989",
    voice: "guide",
    draft: D,
    lines: [
      "The gallery cases hold three records. Each was found separately, decades apart.",
      "Each shows the same thing. The Division's word for that is 'coincidence.'",
    ],
  },
  {
    id: "nar-cave-water",
    roomId: "cave-water",
    trigger: { kind: "room" },
    recorded: "RECORDED 1989",
    voice: "guide",
    draft: D,
    lines: [
      "Case set one. Two hands moving apart, turning the same way.",
      "The catalog calls this split-time, same-direction. I am told to read the catalog name.",
      "I am not told what it feels like. That isn't on the card.",
    ],
  },
  // ── 1990–91: natural, asides ──
  {
    id: "nar-cave-fire",
    roomId: "cave-fire",
    trigger: { kind: "room" },
    recorded: "RECORDED 1990",
    voice: "guide",
    draft: D,
    lines: [
      "Case set two. The hands part again, and now they turn against each other.",
      "Split-time, opposite-direction. The tablet says, in effect, 'this took longer to learn.'",
    ],
  },
  {
    id: "nar-cave-earth",
    roomId: "cave-earth",
    trigger: { kind: "room" },
    recorded: "RECORDED 1990",
    voice: "guide",
    draft: D,
    lines: [
      "Third chamber. Hands together now, turning together. Together-time, same-direction.",
      "Whoever carved this had done it enough times to stop looking at their hands.",
    ],
  },
  {
    id: "nar-cave-air",
    roomId: "cave-air",
    trigger: { kind: "room" },
    recorded: "RECORDED 1990",
    voice: "guide",
    draft: D,
    lines: [
      "Hands together, turning against each other. Together-time, opposite-direction.",
      "This is the one visitors try in the corridor when they think the guide isn't recording.",
      "The guide is always recording.",
    ],
  },
  {
    id: "nar-cave-sun",
    roomId: "cave-sun",
    trigger: { kind: "room" },
    recorded: "RECORDED 1991",
    voice: "guide",
    draft: D,
    lines: [
      "Quarter turns. The hands share a rotation but not a position. Quarter-time, same-direction.",
      "This chamber was built so the shape could be read from above.",
      "The Order built it, and then roped off the ledge.",
    ],
  },
  {
    id: "nar-cave-moon",
    roomId: "cave-moon",
    trigger: { kind: "room" },
    recorded: "RECORDED 1991",
    voice: "guide",
    draft: D,
    lines: [
      "The last chamber. Quarter-time, opposite-direction. Three cases, not four.",
      "The fourth position is the hole you came in through. That is not a metaphor. Check the floor.",
    ],
  },
  {
    id: "nar-egypt-threshold",
    roomId: "egypt-threshold",
    trigger: { kind: "room" },
    recorded: "RECORDED 1991",
    voice: "guide",
    draft: D,
    lines: [
      "You are leaving the cave. The light ahead is sandstone.",
      "The Order's records begin to have names from here on. So do the people in them.",
    ],
  },
  {
    id: "nar-egyptian",
    roomId: "egyptian",
    trigger: { kind: "room" },
    recorded: "RECORDED 1991",
    voice: "guide",
    draft: D,
    lines: [
      "The Karnak relief. Two figures, one pair of implements, one courtyard.",
      "The Bureau catalog describes the context as 'controlled.' The relief shows a crowd.",
    ],
  },
  {
    id: "nar-renaissance",
    roomId: "renaissance",
    trigger: { kind: "room" },
    recorded: "RECORDED 1991",
    voice: "guide",
    draft: D,
    lines: [
      "The workshop wing. Notebooks, a codex, a figure in a circle.",
      "The Order collected everything Leonardo drew about the hand and filed it under anatomy.",
      "He had filed it under practice.",
    ],
  },
  {
    id: "nar-victorian",
    roomId: "victorian",
    trigger: { kind: "room" },
    recorded: "RECORDED 1992",
    voice: "guide",
    draft: D,
    lines: [
      "Brass, gaslight, patents. The nineteenth century tried to make it a machine.",
      "The machine is in the case. It was discredited. The hands were not.",
    ],
  },
  {
    id: "nar-digital",
    roomId: "digital",
    trigger: { kind: "room" },
    recorded: "RECORDED 1992",
    voice: "guide",
    draft: D,
    lines: [
      "The terminal era. A bulletin board, a team photograph, a machine with a green screen.",
      "Everyone in that photograph was told the project was over.",
      "Some of us kept the tapes.",
    ],
  },
  {
    id: "nar-digital-crt",
    roomId: "digital",
    trigger: { kind: "exhibit", refId: "digital-crt", radiusTiles: 3 },
    recorded: "RECORDED 1992",
    voice: "guide",
    draft: D,
    lines: [
      "The terminal still boots. The Bureau's IT desk lists it as decommissioned.",
      "The IT desk has not been in the room.",
    ],
  },
  {
    id: "nar-vtg",
    roomId: "vtg-wing",
    trigger: { kind: "room" },
    recorded: "RECORDED 1992",
    voice: "guide",
    draft: D,
    lines: [
      "This wing is under renovation. This recording was made after the renovation was announced.",
      "If you are hearing it, the renovation is still under way.",
    ],
  },
  // ── 1992–93: tighter, professional ──
  {
    id: "nar-suppression",
    roomId: "suppression",
    trigger: { kind: "room" },
    recorded: "RECORDED 1992",
    voice: "guide",
    draft: D,
    lines: [
      "The Suppression. You will notice the lighting.",
      "The Order of the Closed Palm is named on the north wall for the first time in this building.",
      "It has been named on my paycheck since 1989. Please read the plaques in order.",
    ],
  },
  {
    id: "nar-bellweather",
    roomId: "suppression",
    trigger: { kind: "exhibit", refId: "supp-bellweather", radiusTiles: 4 },
    recorded: "RECORDED 1993",
    voice: "guide",
    draft: D,
    lines: [
      "The Bellweather report. East wall.",
      "It is in the Archive because someone put it there. The report does not say who.",
    ],
  },
  {
    id: "nar-cross-reference",
    roomId: "cross-reference",
    trigger: { kind: "room" },
    recorded: "RECORDED 1993",
    voice: "guide",
    draft: D,
    lines: [
      "The Cross-Reference Room. The Nomenclature Division has assigned letters to positions since 1947.",
      "The terminal holds the current key. Revision sixty-one.",
      "Apply it to the tablet if you like. The Division is confident about the letters.",
    ],
  },
  {
    id: "nar-xref-console",
    roomId: "cross-reference",
    trigger: { kind: "exhibit", refId: "xref-console", radiusTiles: 3 },
    recorded: "RECORDED 1993",
    voice: "guide",
    draft: D,
    lines: [
      "Terminal three. Six primary forms, two connective forms. The connective forms are dimmed by standard.",
      "The Division has not said what the standard is for.",
    ],
  },
  {
    id: "nar-crumble",
    roomId: "crumble",
    trigger: { kind: "room" },
    recorded: "1993",
    voice: "tape",
    draft: D,
    lines: ["(tape hiss)", "— END OF RECORDED TOUR —"],
  },
  // ── 2009: the curator's tape ──
  {
    id: "nar-gallery",
    roomId: "gallery",
    trigger: { kind: "room" },
    recorded: "RECORDED 2009 · CURATOR",
    voice: "curator",
    draft: D,
    lines: [
      "It's K. Different tape. The old one ran out where the building did.",
      "This room's mine. Everything in it was in a Bureau drawer until 2008.",
      "Take your time.",
    ],
  },
  {
    id: "nar-fear",
    roomId: "fear",
    trigger: { kind: "room" },
    recorded: "RECORDED 2009 · CURATOR",
    voice: "curator",
    draft: D,
    lines: [
      "This is the Order's last room. I left it exactly as I found it.",
      "Every word on these walls was true. That's the part that took me years.",
    ],
  },
  {
    id: "nar-isolation",
    roomId: "isolation",
    trigger: { kind: "room" },
    recorded: "RECORDED 2009 · CURATOR",
    voice: "curator",
    draft: D,
    lines: [
      "Six people, six cubicles. Every one of them is practicing something whole.",
      "Nobody can see anyone else. I built this from a floor plan I found in the Facility 7 office.",
      "It was labeled 'ideal.'",
    ],
  },
  {
    id: "nar-collaboration",
    roomId: "collaboration",
    trigger: { kind: "room" },
    recorded: "RECORDED 2009 · CURATOR",
    voice: "curator",
    draft: D,
    lines: ["Go on. Outside."],
  },
  {
    // Lands as the opening teacher gets up from the lesson for the last time.
    id: "nar-collaboration-passing",
    roomId: "collaboration",
    trigger: { kind: "village", moment: "opening:passing" },
    recorded: "RECORDED 2009 · CURATOR",
    voice: "curator",
    draft: D,
    lines: ["The Order had a name for this room too. I threw it out."],
  },
  // What the visitor carried in and taught at the fire, and what became of it.
  {
    id: "nar-collaboration-taught",
    roomId: "collaboration",
    trigger: { kind: "village", moment: "visitor:taught" },
    recorded: "RECORDED 2009 · CURATOR",
    voice: "curator",
    draft: D,
    lines: ["There. Now it's in two people."],
    carriedLines: ["There. {word} is in two people now."],
  },
  {
    id: "nar-collaboration-passed-on",
    roomId: "collaboration",
    trigger: { kind: "village", moment: "visitor:passed-on" },
    recorded: "RECORDED 2009 · CURATOR",
    voice: "curator",
    draft: D,
    lines: ["They've shown someone else. It isn't only yours now."],
  },
  {
    id: "nar-collaboration-lost",
    roomId: "collaboration",
    trigger: { kind: "village", moment: "visitor:lost" },
    recorded: "RECORDED 2009 · CURATOR",
    voice: "curator",
    draft: D,
    lines: ["Nobody left was doing it. That's how they go."],
  },
  {
    // Plays on coming back to the room, after the village has lived on.
    id: "nar-collaboration-memory-found",
    roomId: "collaboration",
    trigger: { kind: "village", moment: "memory:found" },
    recorded: "RECORDED 2009 · CURATOR",
    voice: "curator",
    draft: D,
    lines: ["You came back. It's still here. They kept it going."],
    carriedLines: ["You came back. They're still doing {word}."],
  },
  {
    id: "nar-collaboration-memory-lost",
    roomId: "collaboration",
    trigger: { kind: "village", moment: "memory:lost" },
    recorded: "RECORDED 2009 · CURATOR",
    voice: "curator",
    draft: D,
    lines: ["You came back. It didn't last. Most don't."],
    carriedLines: ["You came back. {word} didn't last. Most don't."],
  },
  {
    id: "nar-gift-shop",
    roomId: "gift-shop",
    trigger: { kind: "room" },
    recorded: "RECORDED 2009 · CURATOR",
    voice: "curator",
    draft: D,
    lines: [
      "Gift shop. Order-built, 1993, never restocked.",
      "The staffs on the west shelf are free. The door past the register is the exit.",
      "It goes where you'd expect.",
    ],
  },
  {
    id: "nar-construction",
    roomId: "construction-zone",
    trigger: { kind: "room" },
    recorded: "RECORDED 2009 · CURATOR",
    voice: "curator",
    draft: D,
    lines: ["Staff only. You're not staff.", "Neither was I, technically, after 1994."],
  },
];

/**
 * The lines a cue speaks. A cue with `carriedLines` names the carried word
 * when there is one (`descriptor.word` for a sequence brought from outside,
 * shown simplified like every sequence word); without one it falls back to
 * its plain lines.
 */
export function cueLines(cue: NarrationCue, carriedWord?: string): string[] {
  const word = carriedWord ? simplifyRepeatedWord(carriedWord.trim()) : "";
  if (!cue.carriedLines || !word) return cue.lines;
  return cue.carriedLines.map((line) => line.replaceAll("{word}", word));
}

/**
 * The Order's catalog line under each room name on the threshold label. The
 * institution's voice, not K's: wing numbers, holdings, catalog numbers.
 * Cave chambers get their TnD mode stamped from the wing declarations.
 */
const ROOM_STAMPS: Record<string, string> = {
  entrance: "ARCHIVE LOBBY · ADMISSION BY APPOINTMENT · CAT. 0",
  "cave-threshold": "WING 1 · PREHISTORIC HOLDINGS · CAT. 1",
  "cave-squeeze": "WING 1 · PASSAGE · REGULATION WIDTH",
  "cave-water-approach": "WING 1 · APPROACH",
  "cave-water-gallery": "WING 1 · RECORD CASES 1–3",
  "egypt-threshold": "WING 2 · THRESHOLD",
  egyptian: "WING 2 · CLASSICAL HOLDINGS · CAT. 2",
  renaissance: "WING 3 · WORKSHOP HOLDINGS · CAT. 3",
  victorian: "WING 4 · MECHANICAL HOLDINGS · CAT. 4",
  digital: "WING 5 · TERMINAL HOLDINGS · CAT. 5",
  "vtg-wing": "WING 9 · [DATE NOT FOUND]",
  suppression: "WING 6 · BUREAU OF KINETIC CONTAINMENT · CAT. 6",
  "cross-reference": "NOMENCLATURE DIVISION · KEY REV. 61",
  crumble: "— NO CATALOG ENTRY —",
  gallery: "CURATOR'S WING · NOT A BUREAU ROOM",
  fear: "ENDING 1 OF 3 · CONTAINMENT",
  isolation: "ENDING 2 OF 3 · FILED UNDER: IDEAL",
  collaboration: "ENDING 3 OF 3",
  "gift-shop": "RETAIL · CLOSED 1994 · OPEN",
  "construction-zone": "STAFF ONLY · WING 9 PREPARATION",
  // The janitor's closet is Austen's; it gets no stamp.
};

const CATEGORY_STAMP: Record<string, string> = {
  SS: "SPLIT-SAME",
  SO: "SPLIT-OPPOSITE",
  TS: "TOGETHER-SAME",
  TO: "TOGETHER-OPPOSITE",
  QS: "QUARTER-SAME",
  QO: "QUARTER-OPPOSITE",
};

export function roomStamp(roomId: string): string | null {
  const cave = CAVE_MODE_ROOMS.find((room) => room.roomId === roomId);
  if (cave) {
    const category = CATEGORY_STAMP[cave.category] ?? cave.category;
    return `WING 1 · ${category} · ${cave.technicalMode.toUpperCase()}`;
  }
  return ROOM_STAMPS[roomId] ?? null;
}

/** The card beside a cave case: what the Order wrote on it. */
export interface CaveCaseCard {
  roomId: string;
  category: string;
  technicalMode: string;
  /** 1-based case number within the chamber. */
  caseNumber: number;
  caseCount: number;
  sequenceId: string;
}

export function caveCaseCard(performerId: string): CaveCaseCard | null {
  for (const room of CAVE_MODE_ROOMS) {
    const index = room.performerIds.indexOf(performerId);
    if (index < 0) continue;
    return {
      roomId: room.roomId,
      category: CATEGORY_STAMP[room.category] ?? room.category,
      technicalMode: room.technicalMode,
      caseNumber: index + 1,
      caseCount: room.performerIds.length,
      sequenceId: room.sequenceIds[index] ?? "",
    };
  }
  return null;
}
