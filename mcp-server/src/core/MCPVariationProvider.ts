/**
 * MCP Variation Provider
 *
 * Wraps the MCP server's PictographData[] (loaded from CSV at startup)
 * into the IVariationProvider interface expected by the shared sequence engine.
 *
 * The MCP server pre-loads all pictograph variations per grid mode into a flat array.
 * This provider indexes them for fast lookup by letter + placement.
 */

import type { IVariationProvider } from "@tka/sequence-engine/generation";

// The engine's PictographData (from generation/constraints/types.ts) has the same shape
// as the MCP's PictographData. We use the engine's type for the interface contract.
import type { PictographData } from "@tka/sequence-engine/generation";

export class MCPVariationProvider implements IVariationProvider {
  private readonly byLetterAndPlacement = new Map<string, PictographData[]>();
  private readonly allByGridMode = new Map<string, PictographData[]>();

  constructor(allPictographs: PictographData[], gridMode: string) {
    // Index by letter + startPlacement for fast variation lookup
    for (const p of allPictographs) {
      const key = `${p.letter}:${p.startPlacement}`;
      let bucket = this.byLetterAndPlacement.get(key);
      if (!bucket) {
        bucket = [];
        this.byLetterAndPlacement.set(key, bucket);
      }
      bucket.push(p);
    }

    this.allByGridMode.set(gridMode, allPictographs);
  }

  getVariations(
    letter: string,
    placement: string,
    _gridMode: string,
  ): PictographData[] {
    const key = `${letter}:${placement}`;
    return this.byLetterAndPlacement.get(key) ?? [];
  }

  getAllVariations(_gridMode: string): PictographData[] {
    // Return the first (and typically only) stored set
    for (const variations of this.allByGridMode.values()) {
      return variations;
    }
    return [];
  }
}
