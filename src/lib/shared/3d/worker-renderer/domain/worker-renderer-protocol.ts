import type { SceneEffectTipSource3D } from "../../effects/scene-effects/scene-effect-source-3d";
import { QualityTier, TIER_CONFIGS } from "../../effects/types";
import type { StripPattern } from "$lib/shared/poi/domain/strip-pattern";
import type { EffectType } from "$lib/shared/animation-engine/domain/types/tip-effect-types";
import type {
  Animal3DParams,
  Bloom3DParams,
  Bubbles3DParams,
  Charcoal3DParams,
  Fire3DParams,
  Goo3DParams,
  Ink3DParams,
  Led3DParams,
  Petals3DParams,
  Pulse3DParams,
  Silk3DParams,
  Smoke3DParams,
  Sparkles3DParams,
  Trails3DParams,
} from "$lib/shared/effects/translators/webgl3d-types";
import type {
  CanonicalWorkerPropType,
  WorkerPropBuild,
} from "../worlds/props/worker-prop-factory-types";
import type {
  LateralGait,
  ScheduledGaitTimingSample,
  TerminalStepPlan,
  TurnRequest,
} from "@austencloud/scene-3d";

export type WorkerEnvironmentKey =
  | "ocean"
  | "rainbow"
  | "void"
  | "winter"
  | "celestial"
  | "cosmic"
  | "forest"
  | "blossom"
  | "autumn"
  | "ember";

export interface WorkerViewport {
  width: number;
  height: number;
  dpr: number;
}

/**
 * Hidden replacement scenes compile and upload against one physical pixel.
 * Their requested viewport is retained for camera framing and restored before
 * the first handoff frame. This keeps background preparation from rasterizing
 * dozens of full-size prime frames beside the scene the user is watching.
 */
export const WORKER_PREPARATION_VIEWPORT = {
  width: 1,
  height: 1,
  dpr: 1,
} as const satisfies WorkerViewport;

export interface WorkerCameraSnapshot {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  fov: number;
  /** Exact rendered orientation, including viewer roll when present. */
  quaternion?: WorkerQuaternion;
  up?: WorkerVector3;
}

export type WorkerVector3 = readonly [number, number, number];
export type WorkerQuaternion = readonly [number, number, number, number];

/**
 * Prop visuals the renderer-neutral worker factory reproduces exactly. Keep
 * this clone-safe protocol list pinned to that factory with a contract test;
 * importing the factory's runtime module here would pull every prop model and
 * material implementation into the application bundle just to validate a
 * string.
 */
export const WORKER_PERFORMER_PROP_TYPES = [
  "staff",
  "simple_staff",
  "bigstaff",
  "staff_v2",
  "club",
  "bigclub",
  "fan",
  "bigfan",
  "triad",
  "bigtriad",
  "minihoop",
  "bighoop",
  "fractalgeng",
  "triquetra",
  "triquetra2",
  "eightrings",
  "bigeightrings",
  "contactball",
  "bigcontactball",
  "quiad",
  "torch",
  "bigtorch",
  "poi",
  "buugeng",
  "bigbuugeng",
  "chicken",
  "bigchicken",
  "guitar",
  "ukulele",
  "sword",
  "sickles",
  "trigeng",
  "doublestar",
  "bigdoublestar",
  "doublecontactball",
  "bigdoublecontactball",
  "capsule_baton",
  "fire_double_staff",
  "hand",
] as const satisfies readonly CanonicalWorkerPropType[];

export type WorkerPerformerPropType =
  (typeof WORKER_PERFORMER_PROP_TYPES)[number];

const WORKER_PERFORMER_PROP_TYPE_SET = new Set<string>(
  WORKER_PERFORMER_PROP_TYPES
);

export function isWorkerPerformerPropType(
  value: string
): value is WorkerPerformerPropType {
  return WORKER_PERFORMER_PROP_TYPE_SET.has(value);
}

/**
 * Structured-clone-safe form of the already-resolved choreography state.
 *
 * The application remains the authority for Choreo timing and plane math.
 * Workers receive final transforms, so this renderer boundary cannot change
 * what a card or sequence means.
 */
export interface WorkerPropSnapshot {
  centerPathAngle: number;
  staffRotationAngle: number;
  plane: string;
  /** PerformerRig's hand group translation, resolved by the application. */
  handAnchor: WorkerVector3;
  /** Buugeng-family chirality, applied at the correction group. */
  flipped: boolean;
  worldPosition: WorkerVector3;
  worldRotation: WorkerQuaternion;
  gripType?: string;
}

export interface WorkerStanceSegments {
  spine1Rad: number;
  spine2Rad: number;
  headLagRad: number;
}

export interface WorkerPerformerBadgeSnapshot {
  index: number;
  color: string;
  opacity: number;
  selected: boolean;
}

export interface WorkerSelectionMarkerSnapshot {
  groundPosition: WorkerVector3;
  color: number;
  selected: boolean;
  allPerformersSelected: boolean;
  present: boolean;
  pulsePhase: number;
  hovered: boolean;
  dragging: boolean;
}

export interface WorkerTipEffectDecision {
  propIndex: 0 | 1;
  tipIndex: 0 | 1;
  effect: EffectType;
}

export interface WorkerPooledEffectConfigs {
  sparkles?: Sparkles3DParams;
  goo?: Goo3DParams;
  bubbles?: Bubbles3DParams;
  petals?: Petals3DParams;
  smoke?: Smoke3DParams;
  ink?: Ink3DParams;
  silk?: Silk3DParams;
  animal?: Animal3DParams;
  pulse?: Pulse3DParams;
  bloom?: Bloom3DParams;
  fire?: Fire3DParams;
  charcoal?: Charcoal3DParams;
}

/**
 * Clone-safe decisions already resolved by the application.
 *
 * The worker may turn these decisions into renderer coordinates, but it may
 * not choose an effect, interpret a card, translate user-facing settings, or
 * advance the Choreo clock. That keeps worker rendering incapable of changing
 * what the sequence means.
 */
export interface WorkerPerformerEffectIntent {
  playing: boolean;
  sampledAtMs: number;
  currentStep: number;
  totalSteps: number;
  seamlesslyLoopable: boolean;
  qualityTier: WorkerEffectQualityTier;
  propBuild: WorkerPropBuild;
  tips: readonly WorkerTipEffectDecision[];
  trails: Trails3DParams;
  led: Led3DParams;
  pooled: WorkerPooledEffectConfigs;
}

export interface WorkerPerformerLocomotionSnapshot {
  isMoving: boolean;
  moveSpeed: number;
  moveDirection: { x: number; z: number };
  lateralGait: LateralGait;
  gaitTimingSample: ScheduledGaitTimingSample | null;
  terminalStepPlan: TerminalStepPlan | null;
  turnRequest: TurnRequest | null;
}

/** The colors the application paints the "blue" and "red" prop hands in. */
export interface WorkerPropHandColors {
  blue: string;
  red: string;
}

export interface WorkerPerformerSnapshot {
  id: string;
  avatarId: string;
  position: WorkerVector3;
  facingAngle: number;
  avatarHeightCm: number;
  groundY: number;
  staffLength: number;
  staffThickness: number;
  propBuild: WorkerPropBuild;
  /** Absent means the props' authored palette. */
  handColors?: WorkerPropHandColors | null;
  leftPropType: WorkerPerformerPropType;
  rightPropType: WorkerPerformerPropType;
  leftProp: WorkerPropSnapshot | null;
  rightProp: WorkerPropSnapshot | null;
  stanceYaw: number;
  stanceSegments: WorkerStanceSegments | null;
  spinePitchOffset: number;
  badge?: WorkerPerformerBadgeSnapshot | null;
  selectionMarker?: WorkerSelectionMarkerSnapshot | null;
  effectIntent?: WorkerPerformerEffectIntent | null;
  locomotion?: WorkerPerformerLocomotionSnapshot | null;
}

export type WorkerEffectQualityTier = "high" | "medium" | "low";

export interface WorkerRenderQualityConfig {
  composerEnabled: boolean;
  tierBloom: boolean;
  enableShadows: boolean;
  bloomResolutionScale: number;
  bloomLevels: number;
}

/**
 * Mirrors the interactive viewer's quality gates without giving the worker a
 * second quality policy. Ocean keeps its authored post-processing on medium
 * and high; low remains composer-free just like ScenePostProcessing.
 */
export function resolveWorkerRenderQuality(
  tier: WorkerEffectQualityTier,
  isOcean: boolean
): WorkerRenderQualityConfig {
  const tierConfig = TIER_CONFIGS[tier as QualityTier];
  const tierBloom = tierConfig.enableBloom;
  return {
    composerEnabled: (isOcean && tier !== QualityTier.LOW) || tierBloom,
    tierBloom,
    enableShadows: tierConfig.enableShadows,
    bloomResolutionScale: tierConfig.bloomResolutionScale,
    bloomLevels: tierConfig.bloomLevels,
  };
}

export interface WorkerTrailEffectConfig {
  maxPoints: number;
  width: number;
  color: string;
  opacity: number;
  rainbow: boolean;
  qualityTier: WorkerEffectQualityTier;
  mode: "fade" | "loop_clear" | "persistent";
  fadeDuration: number;
  emissiveStrength: number;
}

export interface WorkerTrailEffectFrame {
  renderer: "trail";
  sourceId: string;
  sampleSequence: number;
  enabled: boolean;
  position: WorkerVector3;
  config: WorkerTrailEffectConfig;
}

export interface WorkerLedTipFrame {
  position: WorkerVector3;
  r: number;
  g: number;
  b: number;
  brightness: number;
  velocity: WorkerVector3;
  speed: number;
}

export interface WorkerLedEffectFrame {
  renderer: "led";
  sourceId: string;
  sampleSequence: number;
  enabled: boolean;
  qualityTier: WorkerEffectQualityTier;
  sampledAtSeconds: number;
  tips: readonly WorkerLedTipFrame[];
}

export interface WorkerPovEffectFrame {
  renderer: "pov";
  sourceId: string;
  sampleSequence: number;
  enabled: boolean;
  qualityTier: WorkerEffectQualityTier;
  ledCount: number;
  staffAxis: WorkerVector3;
  staffCenter: WorkerVector3;
  staffHalfLength: number;
  frameIndex: number;
  pattern: StripPattern;
  sampledAtSeconds: number;
  brightness: number;
  persistenceDuration: number;
}

export interface WorkerMoonFanEffectFrame {
  renderer: "moon-fan";
  sourceId: string;
  sampleSequence: number;
  enabled: boolean;
  worldCenter: WorkerVector3;
  worldRotation: WorkerQuaternion;
  ledColors: readonly { r: number; g: number; b: number }[];
  brightness: number;
  scale: number;
}

/**
 * Final renderer inputs produced from the worker performer's exact rig and prop
 * transforms. Typed arrays inside StripPattern remain structured-clone-safe.
 */
export type WorkerImperativeEffectFrame =
  | WorkerTrailEffectFrame
  | WorkerLedEffectFrame
  | WorkerPovEffectFrame
  | WorkerMoonFanEffectFrame;

/**
 * Worker-collected renderer output. The application never authors these
 * world-space coordinates; it sends WorkerPerformerEffectIntent instead.
 */
export interface WorkerSceneEffectsSnapshot {
  playing: boolean;
  sources: readonly SceneEffectTipSource3D[];
  imperative?: readonly WorkerImperativeEffectFrame[];
}

export type WorkerRendererProgressPhase =
  | "renderer"
  | "assets"
  | "construct"
  | "performer"
  | "compile"
  | "prime"
  | "finalize"
  | "preflight"
  | "first-frame";

export interface WorkerRendererProgramMetric {
  label: string;
  durationMs: number;
}

export interface WorkerPerformerDiagnostics {
  count: number;
  renderables: number;
  visibleRenderables: number;
  effectivelyVisibleRenderables: number;
  layerMasks: readonly number[];
  rootVisible: boolean;
  rootLayerMask: number;
  materialOpacity: readonly [number, number] | null;
  boundsCenter: WorkerVector3 | null;
  boundsSize: WorkerVector3 | null;
  projectedCenter: WorkerVector3 | null;
}

export interface WorkerRendererBootMetrics {
  warmReuse?: boolean;
  retainedRuntimeBytes?: number;
  retainedRuntimeCount?: number;
  cacheCandidateBytes?: number;
  cacheSkipReason?: string;
  acceptedAt: number;
  rendererReadyAt: number;
  environmentReadyAt: number;
  performerReadyAt: number;
  worldReadyAt: number;
  compiledAt: number;
  primedAt: number;
  finalizedAt: number;
  preflightedAt: number;
  firstFrameAt: number;
  rendererMs: number;
  environmentMs: number;
  performerMs: number;
  worldMs: number;
  compileMs: number;
  primeMs: number;
  primeTargets: number;
  finalizeCompileMs: number;
  preflightMs: number;
  firstRenderMs: number;
  presentationWaitMs: number;
  confirmationRenderMs: number;
  firstFrameWaitMs: number;
  firstFrameMs: number;
  compileTargets: readonly WorkerRendererProgramMetric[];
  memoryAfterCompile: WorkerRendererMemoryMetric;
  memoryAfterPrime: WorkerRendererMemoryMetric;
  memoryAfterFinalize: WorkerRendererMemoryMetric;
  memoryAfterPreflight: WorkerRendererMemoryMetric;
  memoryAfterFirstRender: WorkerRendererMemoryMetric;
  performers: WorkerPerformerDiagnostics;
  geometries: number;
  textures: number;
  programs: number;
}

export interface WorkerRendererMemoryMetric {
  geometries: number;
  textures: number;
  programs: number;
}

export interface InitializeWorkerRendererMessage {
  type: "initialize";
  requestId: number;
  canvas: OffscreenCanvas;
  environment: WorkerEnvironmentKey;
  viewport: WorkerViewport;
  camera: WorkerCameraSnapshot;
  qualityTier: WorkerEffectQualityTier;
  performers: readonly WorkerPerformerSnapshot[];
  effects?: WorkerSceneEffectsSnapshot;
  reducedMotion?: boolean;
  retainSceneCache?: boolean;
}

export interface SwitchWorkerRendererEnvironmentMessage {
  type: "switch-environment";
  requestId: number;
  environment: WorkerEnvironmentKey;
  reducedMotion?: boolean;
  /** Prepare a hidden replacement without requiring a visible-frame poster. */
  backgroundPreparation?: boolean;
}

export interface PosterReadyWorkerRendererMessage {
  type: "poster-ready";
  requestId: number;
}

export interface PrefetchWorkerEnvironmentMessage {
  type: "prefetch-environment";
  requestId: number;
  environment: WorkerEnvironmentKey;
}

export interface LivePresentedWorkerRendererMessage {
  type: "live-presented";
  requestId: number;
}

export interface ResizeWorkerRendererMessage {
  type: "resize";
  requestId: number;
  viewport: WorkerViewport;
}

export interface CameraWorkerRendererMessage {
  type: "camera";
  requestId: number;
  camera: WorkerCameraSnapshot;
}

export interface VisibilityWorkerRendererMessage {
  type: "visibility";
  requestId: number;
  visible: boolean;
}

export interface PerformersWorkerRendererMessage {
  type: "performers";
  requestId: number;
  performers: readonly WorkerPerformerSnapshot[];
}

export interface EffectsWorkerRendererMessage {
  type: "effects";
  requestId: number;
  effects: WorkerSceneEffectsSnapshot;
}

export interface QualityWorkerRendererMessage {
  type: "quality";
  requestId: number;
  qualityTier: WorkerEffectQualityTier;
}

export interface PointerWorkerRendererMessage {
  type: "pointer";
  requestId: number;
  action: "move" | "down" | "leave";
  ndcX: number;
  ndcY: number;
}

export interface DisposeWorkerRendererMessage {
  type: "dispose";
  requestId: number;
}

export type WorkerRendererInMessage =
  | InitializeWorkerRendererMessage
  | PrefetchWorkerEnvironmentMessage
  | SwitchWorkerRendererEnvironmentMessage
  | PosterReadyWorkerRendererMessage
  | LivePresentedWorkerRendererMessage
  | ResizeWorkerRendererMessage
  | CameraWorkerRendererMessage
  | PerformersWorkerRendererMessage
  | EffectsWorkerRendererMessage
  | QualityWorkerRendererMessage
  | PointerWorkerRendererMessage
  | VisibilityWorkerRendererMessage
  | DisposeWorkerRendererMessage;

export interface WorkerRendererBootingMessage {
  type: "booting";
  requestId: number;
  environment: WorkerEnvironmentKey;
  acceptedAt: number;
}

export interface WorkerRendererProgressMessage {
  type: "progress";
  requestId: number;
  phase: WorkerRendererProgressPhase;
  fraction: number;
}

export interface WorkerRendererFirstFrameMessage {
  type: "first-frame";
  requestId: number;
  environment: WorkerEnvironmentKey;
  metrics: WorkerRendererBootMetrics;
}

export interface WorkerRendererPosterMessage {
  type: "poster";
  requestId: number;
  environment: WorkerEnvironmentKey;
  bitmap: ImageBitmap;
}

export interface WorkerRendererFrameMessage {
  type: "frame";
  requestId: number;
  environment: WorkerEnvironmentKey;
  frame: number;
  renderedAt: number;
  deltaMs: number;
}

export interface WorkerRendererErrorMessage {
  type: "error";
  requestId: number;
  environment: WorkerEnvironmentKey | null;
  message: string;
  stack?: string;
}

export interface WorkerRendererContextLostMessage {
  type: "context-lost";
  requestId: number;
  environment: WorkerEnvironmentKey | null;
}

export interface WorkerRendererDisposedMessage {
  type: "disposed";
  requestId: number;
}

export interface WorkerRendererInteractionMessage {
  type: "interaction";
  requestId: number;
  environment: WorkerEnvironmentKey;
  hover: boolean;
  chime: { frequencyHz: number; pan: number } | null;
}

export type WorkerRendererOutMessage =
  | WorkerRendererBootingMessage
  | WorkerRendererProgressMessage
  | WorkerRendererPosterMessage
  | WorkerRendererFirstFrameMessage
  | WorkerRendererFrameMessage
  | WorkerRendererErrorMessage
  | WorkerRendererContextLostMessage
  | WorkerRendererInteractionMessage
  | WorkerRendererDisposedMessage;

export function isWorkerRendererOutMessage(
  value: unknown
): value is WorkerRendererOutMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { type?: unknown; requestId?: unknown };
  return (
    typeof candidate.requestId === "number" &&
    (candidate.type === "booting" ||
      candidate.type === "progress" ||
      candidate.type === "poster" ||
      candidate.type === "first-frame" ||
      candidate.type === "frame" ||
      candidate.type === "error" ||
      candidate.type === "context-lost" ||
      candidate.type === "interaction" ||
      candidate.type === "disposed")
  );
}

export function clampWorkerViewport(viewport: WorkerViewport): WorkerViewport {
  return {
    width: Math.max(1, Math.round(viewport.width)),
    height: Math.max(1, Math.round(viewport.height)),
    dpr: Math.max(0.5, Math.min(2, viewport.dpr)),
  };
}
