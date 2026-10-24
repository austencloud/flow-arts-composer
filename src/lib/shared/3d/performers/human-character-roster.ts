import type { CharacterId } from "../domain/character-model";

/**
 * The characters that read as ordinary people. The deployed catalog also
 * holds the Mixamo mannequins (x-bot, y-bot), Remy, and creature models:
 * ch10 is a zombie (decayed skin reads as a charred body), ch34 a green plant
 * creature, ch44 near-black with glowing accents. ch26 is not in the jam's
 * roster either. A crowd meant to look real draws only from this list.
 *
 * Copied from the Flow Fest jam's festival roster
 * (flow-fest-living-fire-jam.ts, FlowFestFestivalAvatarId), which made the
 * same cut first.
 */
export const HUMAN_CHARACTER_IDS: readonly CharacterId[] = [
  "ch01",
  "ch07",
  "ch12",
  "ch18",
  "ch21",
  "ch22",
  "ch24",
  "ch41",
  "ch42",
];

/**
 * A human character for a stable key, the same one every time: a string
 * hash (FNV-1a) into the roster.
 */
export function humanCharacterFor(key: string): CharacterId {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return HUMAN_CHARACTER_IDS[(hash >>> 0) % HUMAN_CHARACTER_IDS.length]!;
}
