import { MUSEUM_WALK_ROOMS } from "../data/museum-walk";

export interface RoomPickerEntry {
  id: string;
  name: string;
  theme: string;
}

/**
 * The rooms the picker offers, derived from the walk itself.
 *
 * This list used to be hand-maintained, and it drifted: it named `vulcan-cave`,
 * a placeholder the authored cave replaced and that museum-walk strips out, so
 * selecting it isolated to zero rooms and crashed the grid builder. It also
 * offered none of the eleven cave chambers, so there was no way to jump
 * straight to the Drowned Gallery, the First Fire, or the Root Terrace.
 *
 * Deriving from `MUSEUM_WALK_ROOMS` makes both faults impossible: the picker
 * can only ever offer rooms that exist, and a new chamber appears the moment it
 * joins the walk. Order follows the walk, so the caves group together at the end.
 */
export const ROOM_PICKER_ROOMS: RoomPickerEntry[] = MUSEUM_WALK_ROOMS.map(
  (room) => ({ id: room.id, name: room.name, theme: room.theme })
);
