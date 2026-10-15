/**
 * Per-prop copy for /notation/props. Each entry says what carries over from
 * double staff and where that prop reaches the edge of the notation. Keep
 * claims to what the notation and the player actually do: no planned
 * features, and no lineage claims about other systems (see the About page).
 */

export const PROP_KEYS = ["staves", "clubs", "fans", "buugeng", "poi"] as const;
export type PropKey = (typeof PROP_KEYS)[number];

export interface PropEntry {
  label: string;
  /** The one physical fact the translation turns on. */
  kind: string;
  /** Prop type id the demo player draws. */
  propType: string;
  /** Caption under the demo while this prop is picked. */
  note: string;
  paragraphs: string[];
}

export const PROPS: Record<PropKey, PropEntry> = {
  staves: {
    label: "Staves",
    kind: "Two visible ends",
    propType: "staff",
    note: "both ends of each staff stay visible",
    paragraphs: [
      "The Kinetic Alphabet began on paper with a red pen and a blue pen. A pen works like a small staff, with two visible ends, so the notation was built around double staff and every other prop is read by translating from it.",
      "Each staff has a thumb end and a pinky end. Hold the thumb end at center during an isolation and the pinky end performs an extension at the same time. One staff shows both the vertical-flower and horizontal-flower antispin that a one-ended prop has to choose between.",
      "A fan or club visibly points in one of eight directions. A staff radiating from center makes those eight look like four. Orientation does not change the letter, so the reduced detail makes patterns easier to tell apart while learning.",
      "Staff lessons keep the thumb and pinky ends as fixed references, without finger spinning or grip changes. Other props use both, and the notation allows them.",
    ],
  },
  clubs: {
    label: "Clubs",
    kind: "One visible end",
    propType: "club",
    note: "one club per hand follows the staff pattern",
    paragraphs: [
      "One club in each hand, held throughout. To read a club pictograph, imagine the pinky end of the staff is invisible. The club follows the staff's thumb end, and the grid, letters, and timing stay the same.",
      "With one end, isolation and extension become separate moves with the same geometry. A club's antispin reads as a vertical or a horizontal flower depending on its orientation through the pattern. VTG calls these vertical antispin and horizontal antispin. The mandalas below show the difference.",
    ],
  },
  fans: {
    label: "Fans",
    kind: "One visible end and a flat face",
    propType: "fan",
    note: "the staff pattern played with two fans",
    paragraphs: [
      "Fans read like clubs. Hide the staff's pinky end and the fan follows the thumb end. Its flat face makes that direction easy to see.",
      "A fan's leaves form a plane, and the notation assumes that plane matches the plane of the movement. During a fold the fan leaves that plane and comes back with the hand turned from front to back. The Kinetic Alphabet does not encode hand orientation yet, so it cannot fully write folds.",
    ],
  },
  buugeng: {
    label: "Buugeng",
    kind: "Two curved ends",
    propType: "buugeng",
    note: "both curved ends follow the staff positions",
    paragraphs: [
      "Buugeng have two visible ends, so staff notation carries over, including the isolation and antispin relationships, the grid positions, and the timing of each letter.",
      "Buugeng curve around the body, and many artists turn them with their fingers, so some patterns may be awkward to finger spin. The fixed thumb reference is a staff teaching method. Buugeng spinners can change grip while following the same positions and turns.",
    ],
  },
  poi: {
    label: "Poi",
    kind: "A head on a tether",
    propType: "poi",
    note: "a real poi cannot stop still on the held beats",
    paragraphs: [
      "Partly. Poi can follow patterns whose rotation stays fairly steady. Holds, hard reversals, and abrupt speed changes are out of reach, because the head hangs from a tether and keeps moving with swing and gravity. The player can hold a poi still. A spinner can't.",
      "The Kinetic Alphabet measures each orientation radially, from the prop toward the performer's center. Vulcan Tech Gospel (VTG) measures from the downbeat at the bottom of the circle, a reference that follows a prop swinging under gravity. VTG's four timing and direction categories line up with the timing and direction of the Type 1 letters, so poi spinners who know split-same and tog-opposite can already read that part of the alphabet.",
    ],
  },
};

export function isPropKey(value: string): value is PropKey {
  return (PROP_KEYS as readonly string[]).includes(value);
}
