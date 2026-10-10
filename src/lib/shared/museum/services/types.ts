/**
 * Co-exported types from retired interface contracts.
 */

import type { ExhibitSlot } from "#lib/shared/museum/domain/museum-types.js";


export interface InteractionTarget {
  slot: ExhibitSlot;
  distance: number;
}


export interface MuseumMetadata {
  name: string;
  createdAt: number;
  updatedAt: number;
  isPublic: boolean;
}
