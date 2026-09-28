import { t } from "$lib/shared/i18n/i18n.svelte.js";
import { z } from "zod";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  DEFAULT_CONFIG,
  copyModulators,
  effectiveSpeed,
  generateCopyOps,
  imageCount,
  type CopyOp,
  type TunnelConfig,
} from "./tunnel-config";
import type { Flower } from "$lib/shared/shape-matrix/domain/flower-signature";
import type { VtgMode } from "$lib/shared/shape-matrix/services/shape-matrix-realizations";
import {
  cloneTunnelStage,
  createExplicitTunnelStage,
  createLegacyTunnelStage,
  fitTunnelStageToFormation,
  type TunnelStage,
} from "./tunnel-stage";

export const TUNNEL_COMPOSITION_VERSION = 2;
export const MAX_AUTHORED_TUNNEL_PERFORMERS = 8;
export const MAX_TUNNEL_CYCLE_STEPS = 256;

export interface ShapeMatrixTunnelSourceProvenance {
  kind: "shape-matrix-realization";
  version: 1;
  baseSequenceId: string;
  mode: VtgMode;
  /** Present when prop-first selection rephased the realization. */
  propMode?: VtgMode;
  leftFlower: Flower;
  rightFlower: Flower;
}

/** The complete generator recipe that produced an embedded performer source.
 * The sequence remains the performed source of truth; this versioned snapshot
 * explains how it was made and lets the creator restore the same controls. */
export interface GeneratorTunnelSourceProvenance {
  kind: "generator-recipe";
  version: 1;
  setup: {
    config: Record<string, unknown>;
    startEndOptions: Record<string, unknown> | null;
  };
}

/** Library provenance deliberately records only what the picker actually knew.
 * Older/ad-hoc sources remain `unknown` rather than being presented as public
 * or personal without evidence. */
export interface LibraryTunnelSourceProvenance {
  kind: "library-sequence";
  version: 1;
  sequenceId: string;
  scope: "personal" | "public" | "unknown";
}

export type TunnelSourceProvenance =
  | ShapeMatrixTunnelSourceProvenance
  | GeneratorTunnelSourceProvenance
  | LibraryTunnelSourceProvenance;

export interface IndependentTunnelSource {
  kind: "independent";
  sequence: SequenceData;
  sourceSequenceId?: string;
  provenance?: TunnelSourceProvenance;
}

export interface DerivedTunnelSource {
  kind: "derived";
  performerId: string;
  transforms: CopyOp[];
}

export type TunnelPerformerSource =
  | IndependentTunnelSource
  | DerivedTunnelSource;

export interface TunnelPerformerTiming {
  stepOffset: number;
  speed: number;
}

export interface TunnelPerformer {
  id: string;
  label: string;
  source: TunnelPerformerSource;
  timing: TunnelPerformerTiming;
}

export interface TunnelComposition {
  version: number;
  id: string;
  name: string;
  performers: TunnelPerformer[];
  /** The visible cast. Formation supplies positions; stage says who occupies them. */
  stage: TunnelStage;
  formation: TunnelConfig;
  createdAt: number;
  updatedAt: number;
}

/** Existing collection identity to preserve when the viewer saves changes. */
export interface TunnelSaveTarget {
  id: string;
  name: string;
}

export interface TunnelCompositionValidation {
  valid: boolean;
  errors: string[];
}

export interface TunnelLayerPlan {
  stageInstanceId: string;
  arm: number;
  performerId: string;
  performerLabel: string;
  authoredPerformerIndex: number;
  sequence: SequenceData;
  /** Transforms that define this performer's choreography relative to its source. */
  sourceOps: CopyOp[];
  /** Transforms that place the resolved performer on this formation arm. */
  formationOps: CopyOp[];
  ops: CopyOp[];
  stepOffset: number;
  speed: number;
}

const CopyOpSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("rotate"), amount: z.number() }),
  z.object({ kind: z.literal("mirror") }),
  z.object({ kind: z.literal("flip") }),
  z.object({ kind: z.literal("invert") }),
  z.object({ kind: z.literal("rewind") }),
]);

// SequenceData is deliberately open at this boundary. Its hydrated motion
// payload evolves independently, while a tunnel only needs a stable identity
// and a non-empty steps array to preserve a performer's choreography.
const TunnelSequenceSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    word: z.string(),
    steps: z.array(z.any()),
  })
  .passthrough()
  // Identity at runtime; it only restates the openness above as the type the
  // rest of the module works with.
  .transform((value): SequenceData => value as unknown as SequenceData);

const TunnelConfigSchema = z.object({
  fold: z.number(),
  mirror: z.boolean(),
  flip: z.boolean(),
  invert: z.boolean(),
  echo: z.boolean(),
  staggerSteps: z.number(),
  speedOverrides: z.record(z.string(), z.number()),
});

const RotatingFlowerSchema = z.object({
  style: z.enum(["pro", "anti"]),
  turns: z.number(),
  ori: z.enum(["in", "out"]),
  grid: z.enum(["diamond", "box"]),
  petals: z.number().int().nonnegative(),
});

const FloatFlowerSchema = z.object({
  style: z.literal("float"),
  turns: z.literal("fl"),
  ori: z.enum(["in", "out", "clock", "counter"]),
  grid: z.literal("diamond"),
  petals: z.literal(0),
});

const FlowerSchema = z.discriminatedUnion("style", [
  RotatingFlowerSchema,
  FloatFlowerSchema,
]);

export const TunnelSourceProvenanceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("shape-matrix-realization"),
    version: z.literal(1),
    baseSequenceId: z.string().min(1),
    mode: z.enum(["SS", "TS", "QS", "SO", "TO", "QO"]),
    propMode: z.enum(["SS", "TS", "QS", "SO", "TO", "QO"]).optional(),
    leftFlower: FlowerSchema,
    rightFlower: FlowerSchema,
  }),
  z.object({
    kind: z.literal("generator-recipe"),
    version: z.literal(1),
    setup: z.object({
      config: z.record(z.string(), z.unknown()),
      startEndOptions: z.record(z.string(), z.unknown()).nullable(),
    }),
  }),
  z.object({
    kind: z.literal("library-sequence"),
    version: z.literal(1),
    sequenceId: z.string().min(1),
    scope: z.enum(["personal", "public", "unknown"]),
  }),
]);

const TunnelPerformerSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  source: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("independent"),
      sequence: TunnelSequenceSchema,
      sourceSequenceId: z.string().optional(),
      provenance: TunnelSourceProvenanceSchema.optional(),
    }),
    z.object({
      kind: z.literal("derived"),
      performerId: z.string().min(1),
      transforms: z.array(CopyOpSchema),
    }),
  ]),
  timing: z.object({
    stepOffset: z.number().finite(),
    speed: z.number().positive().finite(),
  }),
});

const TunnelStageSchema = z.object({
  instances: z
    .array(
      z.object({
        id: z.string().min(1),
        performerId: z.string().min(1),
        arm: z.number().int().nonnegative(),
      })
    )
    .min(1),
});

const TunnelCompositionEnvelopeSchema = z.object({
  version: z.number().int().positive(),
  id: z.string().min(1),
  name: z.string().min(1),
  performers: z
    .array(TunnelPerformerSchema)
    .min(1)
    .max(MAX_AUTHORED_TUNNEL_PERFORMERS),
  stage: TunnelStageSchema.optional(),
  formation: TunnelConfigSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
});

type TunnelCompositionEnvelope = z.infer<
  typeof TunnelCompositionEnvelopeSchema
>;

/** Materialize the old implicit round-robin cast without changing its picture. */
export function migrateTunnelComposition(
  composition: TunnelCompositionEnvelope | TunnelComposition
): TunnelComposition {
  const performers = composition.performers.map(clonePerformer);
  const formation = cloneConfig(composition.formation);
  return {
    ...composition,
    version: TUNNEL_COMPOSITION_VERSION,
    performers,
    stage: composition.stage
      ? cloneTunnelStage(composition.stage)
      : createLegacyTunnelStage(
          performers.map((performer) => performer.id),
          formation
        ),
    formation,
  };
}

export const TunnelCompositionSchema =
  TunnelCompositionEnvelopeSchema.transform((composition) =>
    migrateTunnelComposition(composition)
  );

function randomId(prefix: string): string {
  const token =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${token}`;
}

export function createIndependentTunnelPerformer(
  sequence: SequenceData,
  index: number,
  label = `Performer ${index + 1}`,
  source: {
    sourceSequenceId?: string;
    provenance?: TunnelSourceProvenance;
  } = {}
): TunnelPerformer {
  return {
    id: randomId("performer"),
    label,
    source: {
      kind: "independent",
      sequence,
      ...(source.sourceSequenceId
        ? { sourceSequenceId: source.sourceSequenceId }
        : sequence.id
          ? { sourceSequenceId: sequence.id }
          : {}),
      ...(source.provenance ? { provenance: source.provenance } : {}),
    },
    timing: { stepOffset: 0, speed: 1 },
  };
}

export function createDerivedTunnelPerformer(
  performerId: string,
  index: number,
  transforms: CopyOp[],
  label = `Performer ${index + 1}`
): TunnelPerformer {
  return {
    id: randomId("performer"),
    label,
    source: { kind: "derived", performerId, transforms: [...transforms] },
    timing: { stepOffset: 0, speed: 1 },
  };
}

export function createTunnelComposition(
  performers: TunnelPerformer[],
  options: {
    id?: string;
    name?: string;
    formation?: TunnelConfig;
    stage?: TunnelStage;
    /** Reconstruct every generated arm for a pre-creator one-source tunnel. */
    legacyGeneratedStage?: boolean;
    now?: number;
  } = {}
): TunnelComposition {
  const now = options.now ?? Date.now();
  const formation = cloneConfig(options.formation ?? DEFAULT_CONFIG);
  const clonedPerformers = performers.map(clonePerformer);
  const performerIds = clonedPerformers.map((performer) => performer.id);
  return {
    version: TUNNEL_COMPOSITION_VERSION,
    id: options.id ?? randomId("tunnel"),
    name: options.name ?? "Untitled tunnel",
    performers: clonedPerformers,
    stage: options.stage
      ? cloneTunnelStage(options.stage)
      : options.legacyGeneratedStage
        ? createLegacyTunnelStage(performerIds, formation)
        : createExplicitTunnelStage(performerIds, formation),
    formation,
    createdAt: now,
    updatedAt: now,
  };
}

/** The real lineage id for the primary authored source, with the mounted
 * sequence as the fallback for legacy or ad-hoc viewer compositions. */
export function primaryTunnelSourceSequenceId(
  composition: TunnelComposition | null | undefined,
  fallbackSequenceId: string
): string {
  const independent = composition?.performers.find(
    (performer) => performer.source.kind === "independent"
  );
  if (independent?.source.kind !== "independent") return fallbackSequenceId;
  return (
    independent.source.sourceSequenceId ||
    independent.source.sequence.id ||
    fallbackSequenceId
  );
}

export function cloneTunnelComposition(
  composition: TunnelComposition
): TunnelComposition {
  return {
    ...composition,
    performers: composition.performers.map(clonePerformer),
    stage: cloneTunnelStage(composition.stage),
    formation: cloneConfig(composition.formation),
  };
}

function clonePerformer(performer: TunnelPerformer): TunnelPerformer {
  return {
    ...performer,
    source:
      performer.source.kind === "independent"
        ? {
            ...performer.source,
            ...(performer.source.provenance
              ? {
                  provenance: cloneSourceProvenance(
                    performer.source.provenance
                  ),
                }
              : {}),
          }
        : {
            ...performer.source,
            transforms: performer.source.transforms.map((op) => ({ ...op })),
          },
    timing: { ...performer.timing },
  };
}

function cloneSourceProvenance(
  provenance: TunnelSourceProvenance
): TunnelSourceProvenance {
  if (provenance.kind === "shape-matrix-realization") {
    return {
      ...provenance,
      leftFlower: { ...provenance.leftFlower },
      rightFlower: { ...provenance.rightFlower },
    };
  }
  if (provenance.kind === "generator-recipe") {
    return {
      ...provenance,
      setup: JSON.parse(
        JSON.stringify(provenance.setup)
      ) as GeneratorTunnelSourceProvenance["setup"],
    };
  }
  return { ...provenance };
}

function cloneConfig(config: TunnelConfig): TunnelConfig {
  return { ...config, speedOverrides: { ...config.speedOverrides } };
}

export function validateTunnelComposition(
  composition: TunnelComposition
): TunnelCompositionValidation {
  const parsed = TunnelCompositionSchema.safeParse(composition);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((issue) => issue.message),
    };
  }
  const normalized = parsed.data;
  const errors: string[] = [];

  const ids = new Set<string>();
  for (const performer of normalized.performers) {
    if (ids.has(performer.id)) {
      errors.push(`Performer id "${performer.id}" is duplicated.`);
    }
    ids.add(performer.id);
  }

  for (const performer of normalized.performers) {
    if (
      performer.source.kind === "derived" &&
      !ids.has(performer.source.performerId)
    ) {
      errors.push(
        `${performer.label} derives from a performer that is not in this tunnel.`
      );
    }
  }

  const cycle = findRelationshipCycle(normalized.performers);
  if (cycle.length > 0) {
    errors.push(`Performer relationship cycle: ${cycle.join(" -> ")}.`);
  }

  const cycleSteps = tunnelCompositionCycleSteps(normalized);
  if (cycleSteps > MAX_TUNNEL_CYCLE_STEPS) {
    errors.push(
      `This cast needs a ${cycleSteps}-step cycle; the supported ceiling is ${MAX_TUNNEL_CYCLE_STEPS}.`
    );
  }

  const stageIds = new Set<string>();
  const occupiedArms = new Set<number>();
  const stagedPerformerIds = new Set<string>();
  const formationSlots = imageCount(normalized.formation);
  for (const instance of normalized.stage.instances) {
    if (stageIds.has(instance.id)) {
      errors.push(`Stage instance id "${instance.id}" is duplicated.`);
    }
    stageIds.add(instance.id);
    if (!ids.has(instance.performerId)) {
      errors.push(
        `Stage instance "${instance.id}" references a performer that is not in this tunnel.`
      );
    }
    stagedPerformerIds.add(instance.performerId);
    if (instance.arm < 0 || instance.arm >= formationSlots) {
      errors.push(
        `Stage instance "${instance.id}" uses position ${instance.arm + 1}, but this formation has ${formationSlots}.`
      );
    }
    if (occupiedArms.has(instance.arm)) {
      errors.push(`Formation position ${instance.arm + 1} is occupied twice.`);
    }
    occupiedArms.add(instance.arm);
  }

  for (const performer of normalized.performers) {
    if (!stagedPerformerIds.has(performer.id)) {
      errors.push(`${performer.label} has no stage instance.`);
    }
  }

  if (normalized.stage.instances.length > formationSlots) {
    errors.push(
      `The formation has ${formationSlots} positions for ${normalized.stage.instances.length} stage instances.`
    );
  }

  return { valid: errors.length === 0, errors };
}

function findRelationshipCycle(performers: TunnelPerformer[]): string[] {
  const byId = new Map(
    performers.map((performer) => [performer.id, performer])
  );
  const visited = new Set<string>();
  const active: string[] = [];

  function visit(id: string): string[] {
    if (active.includes(id)) {
      const start = active.indexOf(id);
      return [...active.slice(start), id];
    }
    if (visited.has(id)) return [];

    visited.add(id);
    active.push(id);
    const performer = byId.get(id);
    if (performer?.source.kind === "derived") {
      const cycle = visit(performer.source.performerId);
      if (cycle.length > 0) return cycle;
    }
    active.pop();
    return [];
  }

  for (const performer of performers) {
    const cycle = visit(performer.id);
    if (cycle.length > 0) {
      return cycle.map((id) => byId.get(id)?.label ?? id);
    }
  }
  return [];
}

interface ResolvedSource {
  sequence: SequenceData;
  ops: CopyOp[];
}

function resolveSources(
  performers: TunnelPerformer[]
): Map<string, ResolvedSource> {
  const byId = new Map(
    performers.map((performer) => [performer.id, performer])
  );
  const resolved = new Map<string, ResolvedSource>();
  const resolving = new Set<string>();

  function resolve(id: string): ResolvedSource {
    const cached = resolved.get(id);
    if (cached) return cached;
    if (resolving.has(id)) {
      throw new Error("Cannot resolve a cyclic tunnel performer relationship.");
    }

    const performer = byId.get(id);
    if (!performer) {
      throw new Error(`Tunnel performer "${id}" does not exist.`);
    }

    resolving.add(id);
    const source: ResolvedSource =
      performer.source.kind === "independent"
        ? { sequence: performer.source.sequence, ops: [] }
        : (() => {
            const parent = resolve(performer.source.performerId);
            return {
              sequence: parent.sequence,
              ops: [...parent.ops, ...performer.source.transforms],
            };
          })();
    resolving.delete(id);
    resolved.set(id, source);
    return source;
  }

  for (const performer of performers) resolve(performer.id);
  return resolved;
}

export function resolveTunnelLayerPlans(
  composition: TunnelComposition,
  formation: TunnelConfig = composition.formation
): TunnelLayerPlan[] {
  const migrated = migrateTunnelComposition({ ...composition, formation });
  const fittedStage = fitTunnelStageToFormation(migrated.stage, formation);
  if (!fittedStage) {
    throw new Error(
      `The formation has ${imageCount(formation)} positions for ${migrated.stage.instances.length} stage instances.`
    );
  }
  const normalized = { ...migrated, stage: fittedStage };
  const validation = validateTunnelComposition(normalized);
  if (!validation.valid) {
    throw new Error(validation.errors.join(" "));
  }

  const sources = resolveSources(normalized.performers);
  const formationOps: CopyOp[][] = [[], ...generateCopyOps(formation)];
  const modulators = copyModulators(formation);
  const performerIndex = new Map(
    normalized.performers.map((performer, index) => [performer.id, index])
  );

  return fittedStage.instances.map((instance) => {
    const arm = instance.arm;
    const authoredPerformerIndex = performerIndex.get(instance.performerId)!;
    const performer = normalized.performers[authoredPerformerIndex]!;
    const source = sources.get(performer.id)!;
    const mod =
      arm === 0
        ? { staggerSteps: 0, speed: effectiveSpeed(formation, 0) }
        : (modulators[arm - 1] ?? { staggerSteps: 0, speed: 1 });

    return {
      stageInstanceId: instance.id,
      arm,
      performerId: performer.id,
      performerLabel: performer.label,
      authoredPerformerIndex,
      sequence: source.sequence,
      sourceOps: [...source.ops],
      formationOps: [...(formationOps[arm] ?? [])],
      ops: [...source.ops, ...(formationOps[arm] ?? [])],
      stepOffset: performer.timing.stepOffset + mod.staggerSteps,
      speed: performer.timing.speed * mod.speed,
    };
  });
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) [x, y] = [y, x % y];
  return x || 1;
}

function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.abs((a / gcd(a, b)) * b);
}

function performerCycleSteps(stepCount: number, speed: number): number {
  if (stepCount <= 0) return 1;
  // Tunnel speeds use quarter increments. Expressing the rate over four keeps
  // the loop calculation exact for 0.25x, 0.5x, 1x, 2x, and 4x.
  const numerator = Math.max(1, Math.round(speed * 4));
  return (4 * stepCount) / gcd(numerator, 4 * stepCount);
}

export function tunnelCompositionCycleSteps(
  composition: TunnelComposition
): number {
  const independent = composition.performers.filter(
    (
      performer
    ): performer is TunnelPerformer & {
      source: IndependentTunnelSource;
    } => performer.source.kind === "independent"
  );
  return independent.reduce(
    (cycle, performer) =>
      lcm(
        cycle,
        performerCycleSteps(
          performer.source.sequence.steps.length,
          performer.timing.speed
        )
      ),
    1
  );
}

export function tunnelLayerCycleSteps(
  layers: readonly Pick<TunnelLayerPlan, "sequence" | "speed">[]
): number {
  return layers.reduce(
    (cycle, layer) =>
      lcm(cycle, performerCycleSteps(layer.sequence.steps.length, layer.speed)),
    1
  );
}

export function copyOpsLabel(ops: CopyOp[]): string {
  if (ops.length === 0) return t("tunnel_copy");
  return ops
    .map((op) => {
      switch (op.kind) {
        case "rotate":
          return t("tunnel_rotate_degrees", { degrees: op.amount * 45 });
        case "mirror":
          return t("tunnel_mirror");
        case "flip":
          return t("tunnel_flip");
        case "invert":
          return t("tunnel_invert");
        case "rewind":
          return t("tunnel_rewind");
      }
    })
    .join(" + ");
}
