import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type {
  LOOPType,
  Period,
} from "#lib/shared/foundation/domain/models/generation/circular-models.js";

export interface CompoundPattern {
  isCompound: true;
  quarteredTransformations: string[];
  halvedTransformations: string[];
  description: string;
}

export interface LOOPDetectionResult {
  isCircular: boolean;
  loopType: LOOPType | null;
  period: Period | null;
  confidence: "strict" | "probable" | "accidental";
  compoundPattern?: CompoundPattern;
}

export interface ILOOPDetector {
  detectLOOPType(sequence: SequenceData): LOOPDetectionResult;
  batchDetect(sequences: SequenceData[]): Promise<LOOPDetectionResult[]>;
  isCircular(sequence: SequenceData): boolean;
}
