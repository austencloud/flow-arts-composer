/**
 * Abstracts access to pictograph variation data.
 * MCP server and app each provide their own implementation.
 */

import type { PictographData } from "../constraints/types.js";

export interface IVariationProvider {
  getVariations(
    letter: string,
    placement: string,
    gridMode: string,
  ): PictographData[];

  getAllVariations(gridMode: string): PictographData[];
}
