import type { GridLocation, GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

export interface HandPathData {
  readonly id: string;
  readonly locations: readonly GridLocation[];

  // Content-addressable identity
  readonly contentHash: string;

  // Derived query fields (denormalized for Firestore)
  readonly startLocation: GridLocation;
  readonly endLocation: GridLocation;
  readonly length: number;
  readonly bigrams: readonly string[];
  readonly uniqueLocations: readonly GridLocation[];
  readonly impliedGridMode: GridMode;
  readonly isClosed: boolean;

  // Metadata (when saved as independent artifact)
  readonly name?: string;
  readonly author?: string;
  readonly notes?: string;
  readonly thumbnails?: readonly string[];
  readonly dateCreated?: Date;
  readonly ownerId?: string;
  readonly ownerDisplayName?: string;
}
