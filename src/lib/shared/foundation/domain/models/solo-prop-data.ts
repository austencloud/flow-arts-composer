import type {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { HandPathData } from "./hand-path-data";
import type { SoloPropStepData } from "./solo-prop-step-data";
import type { AuthoredHand } from "./authored-hand";

export interface SoloPropData {
  readonly id: string;
  readonly steps: readonly SoloPropStepData[];
  readonly startLocation: GridLocation;
  readonly startOrientation: Orientation;

  // Content-addressable identity
  readonly contentHash: string;

  // Compositional: every solo prop contains its hand path
  readonly handPath: HandPathData;

  // Derived query fields (delegated from hand path + own data)
  readonly length: number;
  readonly bigrams: readonly string[];
  readonly impliedGridMode: GridMode;

  // Metadata
  readonly name?: string;
  /**
   * The hand used when this choreography was authored or last saved.
   * Presentation only: it is deliberately excluded from contentHash.
   */
  readonly authoredHand?: AuthoredHand;
  readonly author?: string;
  readonly notes?: string;
  readonly thumbnails?: readonly string[];
  readonly dateCreated?: Date;
  readonly ownerId?: string;
  readonly ownerDisplayName?: string;
}
