/**
 * Page Layout Models
 *
 * Interface definitions for printable page layout functionality including page dimensions,
 * paper sizes, margins, grid calculations, and print specifications.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type {
  OptimizationGoal,
  PageOrientation,
  WordCardPaperSize,
} from "../types/PageLayoutTypes";


export interface PageDimensions {
  width: number;
  height: number;
}

export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WordCardGridConfig {
  rows: number;
  columns: number;
  spacing: number;
  cardWidth: number;
  cardHeight: number;
}

export interface Page {
  id: string;
  sequences: SequenceData[];
  layout: WordCardGridConfig;
  pageNumber: number;
  paperSize: WordCardPaperSize;
  orientation: PageOrientation;
  margins: PageMargins;
}


export interface PaperSpecification {
  name: WordCardPaperSize;
  dimensions: PageDimensions;
  displayName: string;
  description: string;
}

export interface PrintConfig {
  paperSize: WordCardPaperSize;
  orientation: PageOrientation;
  margins: PageMargins;
  dpi: number;
  enablePageNumbers: boolean;
  enableHeader: boolean;
  enableFooter: boolean;
  headerText?: string;
  barterText?: string;
}


export interface LayoutCalculationRequest {
  paperSize: WordCardPaperSize;
  orientation: PageOrientation;
  margins?: PageMargins;
  cardAspectRatio?: number;
  cardCount: number;
  sequenceCount?: number;
  preferredCardsPerPage?: number;
}

export interface LayoutCalculationResult {
  isOptimal: boolean;
  gridConfig: WordCardGridConfig;
  pageConfig: PageLayoutConfig;
  utilization: number;
}

export interface GridCalculationOptions {
  minCardsPerPage: number;
  maxCardsPerPage: number;
  preferSquareLayout: boolean;
  prioritizeCardSize: boolean;
  allowPartialLastPage: boolean;
}


export interface PageLayoutConfig {
  printConfig: PrintConfig;
  gridOptions: GridCalculationOptions;
  sequencesPerPage: number;
  enableOptimization: boolean;
}

export interface PageCreationOptions {
  layout: PageLayoutConfig;
  sequences: SequenceData[];
  startPageNumber: number;
  enableEmptyPages: boolean;
  emptyPageMessage?: string;
}


export interface DPIConfig {
  screenDPI: number;
  printDPI: number;
  scaleFactor: number;
}

export type DPIConfiguration = DPIConfig;

export interface MeasurementUnit {
  name: string;
  pointsPerUnit: number;
  displayName: string;
}


export interface LayoutValidationError {
  code: string;
  message: string;
  field?: string;
  severity: "error" | "warning" | "info";
}

export interface LayoutValidationWarning {
  code: string;
  message: string;
  suggestion?: string;
  severity?: "warning" | "info";
}

export interface LayoutValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}


export interface LayoutOptimizationRequest {
  goal: OptimizationGoal;
  constraints: {
    minCardSize?: PageDimensions;
    maxPages?: number;
    preferredAspectRatio?: number;
  };
  weights: {
    cardSizeWeight: number;
    pageCountWeight: number;
    utilizationWeight: number;
  };
}


export interface GridLayout {
  columns: number;
  rows: number;
  cardWidth: number;
  cardHeight: number;
  spacing: number;
  totalWidth: number;
  totalHeight: number;
}

export interface LayoutRecommendation {
  layout: GridLayout;
  score: number;
  description: string;
  pros: string[];
  cons: string[];
}
