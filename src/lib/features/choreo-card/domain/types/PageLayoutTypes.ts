/**
 * Page Layout Type Aliases
 *
 * Type aliases and utility types for page layout functionality.
 * Separated from interfaces for clean architecture.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

// Type aliases only
export type WordCardPaperSize = "A4" | "Letter" | "Legal" | "A3" | "Tabloid";
export type PageOrientation = "portrait" | "landscape";
export type WordCardLayoutMode = "optimal" | "fixed" | "custom";
export type OptimizationGoal =
  | "maximize_card_size"
  | "minimize_pages"
  | "balanced";

/**
 * Print preview page containing sequences
 */
export interface PrintPreviewPage {
  id: string;
  sequences: SequenceData[];
  isEmpty: boolean;
}
