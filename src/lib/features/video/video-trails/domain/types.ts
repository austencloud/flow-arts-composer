import type { TrailMode } from "#lib/shared/animation-engine/domain/types/trail-types.js";
import { DEFAULT_GLARE_WEIGHT } from "#lib/shared/animation-engine/domain/led-photometry.js";

export interface DetectedEndpoint {
  x: number;
  y: number;
  brightness: number;
  confidence: number;
  propIndex: 0 | 1;
  tipIndex: number;
  frameIndex: number;
}

export interface DetectionConfig {
  threshold: number;
  sensitivity: number;
  colorWeights: { r: number; g: number; b: number };
  minArea: number;
  maxEndpoints: number;
}

export interface DetectorCapabilities {
  supportsLive: boolean;
  supportsOcclusion: boolean;
  requiresGPU: boolean;
}

export interface DetectorRegistration {
  id: string;
  name: string;
  description: string;
  version: string;
  containerKey: string;
  capabilities: DetectorCapabilities;
}

export interface EndpointCorrection {
  propIndex: 0 | 1;
  tipIndex: number;
  detected: { x: number; y: number; confidence: number } | null;
  corrected: { x: number; y: number } | null;
  status: "accepted" | "corrected" | "occluded" | "interpolated";
  occlusionCause?: string;
}

export interface CorrectionFrame {
  frameIndex: number;
  timestamp: number;
  endpoints: EndpointCorrection[];
  metadata: {
    correctedBy: string;
    correctedAt: string;
    sourceDetector: string;
    notes?: string;
  };
}

export interface TrainingPair {
  frame: { width: number; height: number; dataUrl: string };
  detected: DetectedEndpoint[];
  corrected: EndpointCorrection[];
  metadata: CorrectionFrame["metadata"];
}

export interface FireEffectConfig {
  enabled: boolean;
  intensity: number;
  flameHeight: number;
  colorBlend: number;
  preset: "white-gas" | "charcoal";
}

export interface LedEffectConfig {
  enabled: boolean;
  /** Glare falloff shape, GLARE_WEIGHT_MIN - GLARE_WEIGHT_MAX. Replaces the
   *  former glowRadius/bloom pair: emitter size is now derived from LED pitch,
   *  not authored, and the veil is one camera property of the whole frame. */
  glare: number;
  patternId: string;
  color: string;
  brightness: number;
}

export interface TrailEffectConfig {
  enabled: boolean;
  mode: TrailMode;
  length: number;
  fade: number;
  width: number;
  glow: boolean;
  color: { left: string; right: string };
}

export interface CharcoalEffectConfig {
  enabled: boolean;
  gravity: number;
  burstThreshold: number;
}

export interface EffectConfig {
  fire: FireEffectConfig;
  led: LedEffectConfig;
  trails: TrailEffectConfig;
  charcoal: CharcoalEffectConfig;
}

export interface VideoSource {
  type: "file" | "camera" | "sequence";
  url: string;
  originalFileName?: string;
  duration: number;
  resolution: { width: number; height: number };
  frameCount: number;
  fps: number;
}

export type ExportPhase = "idle" | "preparing" | "recording" | "encoding" | "complete" | "error";

export interface ExportState {
  phase: ExportPhase;
  progress?: number;
  blob?: Blob;
  error?: string;
}

export interface ExportConfig {
  format: "mp4" | "webm";
  resolution: { width: number; height: number };
  fps: number;
  bitrate: number;
}

export interface VideoExportRecord {
  id: string;
  exportedAt: string;
  format: "mp4" | "webm";
  resolution: { width: number; height: number };
  effectsApplied: string[];
  fileSize: number;
  blobUrl?: string;
}

export interface VideoTrailsProject {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;

  source: {
    type: "file" | "camera" | "sequence";
    originalFileName?: string;
    duration: number;
    resolution: { width: number; height: number };
    frameCount: number;
    fps: number;
  };

  detection: {
    detectorId: string;
    config: DetectionConfig;
    results: Record<number, DetectedEndpoint[]>;
    corrections: Record<number, EndpointCorrection[]>;
    trainingDataExported: boolean;
  };

  effects: EffectConfig;
  exports: VideoExportRecord[];

  attachments: {
    sequenceId?: string;
    actId?: string;
    showId?: string;
  };

  thumbnail: string;
}

export type VideoTrailsView = "workspace" | "detection-studio" | "library";

export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
  threshold: 0.7,
  sensitivity: 1.0,
  colorWeights: { r: 0.2126, g: 0.7152, b: 0.0722 },
  minArea: 4,
  maxEndpoints: 4,
};

export const DEFAULT_EFFECT_CONFIG: EffectConfig = {
  fire: { enabled: false, intensity: 1.0, flameHeight: 1.0, colorBlend: 0.5, preset: "white-gas" },
  led: { enabled: false, glare: DEFAULT_GLARE_WEIGHT, patternId: "solid", color: "#ffffff", brightness: 1.0 },
  trails: { enabled: true, mode: "fade" as TrailMode, length: 60, fade: 0.95, width: 3, glow: true, color: { left: "#4a90d9", right: "#d94a4a" } },
  charcoal: { enabled: false, gravity: 50, burstThreshold: 500 },
};

export const DETECTOR_REGISTRY: DetectorRegistration[] = [
  {
    id: "led-threshold-v1",
    name: "LED Threshold",
    description: "Detects bright points via luminance thresholding. Best for LED props in dark environments.",
    version: "1.0.0",
    containerKey: "ledThresholdDetector",
    capabilities: { supportsLive: true, supportsOcclusion: false, requiresGPU: false },
  },
  {
    id: "color-match-v1",
    name: "Color Match",
    description: "Detects endpoints by matching specific colors. Works in varied lighting.",
    version: "1.0.0",
    containerKey: "colorEndpointDetector",
    capabilities: { supportsLive: true, supportsOcclusion: false, requiresGPU: false },
  },
];
