import type { RoomEdge, RoomNode } from "../domain/layout-types";

/**
 * Some "rooms" are multi-room suites: the Drowned Gallery spans the water
 * approach, gallery, and grotto, and the gallery graybox only mounts when
 * cave-water-gallery is in the grid. Isolating any water room without its
 * siblings renders a black void, so isolation expands to the whole suite.
 */
export const ROOM_ISOLATION_GROUPS: Record<string, readonly string[]> = {
  "cave-water": ["cave-water", "cave-water-gallery", "cave-water-approach"],
  "cave-water-gallery": [
    "cave-water-gallery",
    "cave-water-approach",
    "cave-water",
  ],
  "cave-water-approach": [
    "cave-water-approach",
    "cave-water-gallery",
    "cave-water",
  ],
};

export interface RoomIsolation {
  rooms: RoomNode[];
  edges: RoomEdge[];
  /** True when the filter named nothing the walk contains. */
  unresolved: boolean;
}

/**
 * Resolve `?room=<id>` into the room and edge lists to build.
 *
 * The fallback is the whole point. `buildMuseumGrid` spawns the visitor in
 * `rooms[0]` and does not guard it, so an empty list throws
 * "Cannot read properties of undefined (reading 'x')" inside a `$derived`,
 * which surfaces as an unhandled rejection on every animation frame and takes
 * the whole module down. A URL is user input: a stale bookmark, a hand-typed
 * id, or a room that has since been renamed must degrade to the full museum,
 * never to a crash loop.
 *
 * This is not hypothetical. `vulcan-cave` was a placeholder the authored cave
 * replaced; museum-walk strips it from the room list, but the room picker kept
 * offering it, so picking "Vulcan Cave" white-screened /museum.
 */
export function resolveRoomIsolation(
  roomFilter: string | null,
  allRooms: RoomNode[],
  allEdges: RoomEdge[]
): RoomIsolation {
  if (!roomFilter) {
    return { rooms: allRooms, edges: allEdges, unresolved: false };
  }

  const groupIds = ROOM_ISOLATION_GROUPS[roomFilter] ?? [roomFilter];
  // Preserve group order: buildMuseumGrid spawns the visitor in rooms[0],
  // which stays the room the URL named.
  const rooms = groupIds.flatMap((id) => allRooms.filter((r) => r.id === id));

  if (rooms.length === 0) {
    return { rooms: allRooms, edges: allEdges, unresolved: true };
  }

  const edges = allEdges.filter(
    (e) => groupIds.includes(e.from) && groupIds.includes(e.to)
  );
  return { rooms, edges, unresolved: false };
}
