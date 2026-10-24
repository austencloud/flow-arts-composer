import type { Direction } from '../domain/museum-grid-types';

export interface ManualPlacement {
  id: string;
  objectDefId: string;
  tileX: number;
  tileY: number;
  wallFacing: Direction | null;
  yaw: number;
}

/**
 * Manual placements keyed by room ID. Written by the editor save action.
 * The geometry builder reads this at build time to merge with auto-placed objects.
 */
export const MANUAL_PLACEMENTS: Record<string, ManualPlacement[]> = {
  "egyptian": [
    { id: "egyptian-modern-fixture-1775532654513", objectDefId: "modern-fixture", tileX: 2, tileY: 12, wallFacing: "east", yaw: 1.5708 },
    { id: "egyptian-modern-fixture-1775532655873", objectDefId: "modern-fixture", tileX: 13, tileY: 3, wallFacing: "south", yaw: 0.0000 },
    { id: "egyptian-modern-fixture-1775532661166", objectDefId: "modern-fixture", tileX: 3, tileY: 5, wallFacing: "east", yaw: 1.5708 },
    { id: "egyptian-modern-fixture-1775532667228", objectDefId: "modern-fixture", tileX: 15, tileY: 3, wallFacing: "south", yaw: 0.0000 },
    { id: "egyptian-gallery-fixture-1775532701876", objectDefId: "gallery-fixture", tileX: 3, tileY: 34, wallFacing: "east", yaw: 1.5708 },
    { id: "egyptian-futuristic-fixture-1775532710360", objectDefId: "futuristic-fixture", tileX: 3, tileY: 38, wallFacing: "east", yaw: 1.5708 },
    { id: "egyptian-institutional-fixture-1775547046692", objectDefId: "institutional-fixture", tileX: 25, tileY: 3, wallFacing: "south", yaw: 0.0000 },
    { id: "egyptian-institutional-fixture-1775547048142", objectDefId: "institutional-fixture", tileX: 23, tileY: 3, wallFacing: "south", yaw: 0.0000 },
    { id: "egyptian-institutional-fixture-1775547051675", objectDefId: "institutional-fixture", tileX: 26, tileY: 3, wallFacing: "south", yaw: 0.0000 },
    { id: "egyptian-institutional-fixture-1775547052658", objectDefId: "institutional-fixture", tileX: 20, tileY: 3, wallFacing: "south", yaw: 0.0000 },
    { id: "egyptian-institutional-fixture-1775547053469", objectDefId: "institutional-fixture", tileX: 24, tileY: 3, wallFacing: "south", yaw: 0.0000 },
    { id: "egyptian-institutional-fixture-1775547055161", objectDefId: "institutional-fixture", tileX: 3, tileY: 18, wallFacing: "east", yaw: 1.5708 },
    { id: "egyptian-institutional-fixture-1775547074047", objectDefId: "institutional-fixture", tileX: 7, tileY: 3, wallFacing: "south", yaw: 0.0000 },
    { id: "egyptian-modern-fixture-1775547079571", objectDefId: "modern-fixture", tileX: 32, tileY: 10, wallFacing: "west", yaw: -1.5708 },
    { id: "egyptian-digital-fixture-1775547186429", objectDefId: "digital-fixture", tileX: 32, tileY: 3, wallFacing: "south", yaw: 0.0000 },
    { id: "egyptian-digital-fixture-1775547191997", objectDefId: "digital-fixture", tileX: 32, tileY: 6, wallFacing: "west", yaw: -1.5708 },
    { id: "egyptian-digital-fixture-1775547199969", objectDefId: "digital-fixture", tileX: 29, tileY: 3, wallFacing: "south", yaw: 0.0000 },
    { id: "egyptian-modern-fixture-1775547286295", objectDefId: "modern-fixture", tileX: 5, tileY: 44, wallFacing: "north", yaw: 3.1416 },
    { id: "egyptian-modern-fixture-1775547293488", objectDefId: "modern-fixture", tileX: 32, tileY: 11, wallFacing: "west", yaw: -1.5708 },
    { id: "egyptian-modern-fixture-1775547303816", objectDefId: "modern-fixture", tileX: 32, tileY: 16, wallFacing: "west", yaw: -1.5708 },
    { id: "egyptian-renaissance-fixture-1775547395925", objectDefId: "renaissance-fixture", tileX: 19, tileY: 3, wallFacing: "south", yaw: 0.0000 },
    { id: "egyptian-renaissance-fixture-1775547404557", objectDefId: "renaissance-fixture", tileX: 16, tileY: 3, wallFacing: "south", yaw: 0.0000 },
    { id: "egyptian-gallery-fixture-1775547489163", objectDefId: "gallery-fixture", tileX: 18, tileY: 3, wallFacing: "south", yaw: 0.0000 },
    { id: "egyptian-retail-fixture-1775547547665", objectDefId: "retail-fixture", tileX: 14, tileY: 3, wallFacing: "south", yaw: 0.0000 },
    { id: "egyptian-retail-fixture-1775547562707", objectDefId: "retail-fixture", tileX: 11, tileY: 3, wallFacing: "south", yaw: 0.0000 },
    { id: "egyptian-retail-fixture-1775547675077", objectDefId: "retail-fixture", tileX: 32, tileY: 4, wallFacing: "west", yaw: -1.5708 },
  ],
  // The Room of Collaboration's 23 wall fixtures went with its tile walls:
  // the forest is its envelope now, and with nothing to hang on they floated
  // in the dark while the forest loaded.
};
