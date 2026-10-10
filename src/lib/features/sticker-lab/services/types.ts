/**
 * Co-exported types from retired interface contracts.
 */

import type { MandalaPaths } from "#lib/shared/mandala/domain/mandala-types.js";


export interface StickerMandalaLookup {
  /** Return pre-computed MandalaPaths for a primitive key (shapeHash in v2). */
  getPaths(primitiveKey: string): MandalaPaths | null;
}


export interface StickerMandalaLookup {
  /** Return pre-computed MandalaPaths for a primitive key (shapeHash in v2). */
  getPaths(primitiveKey: string): MandalaPaths | null;
}
