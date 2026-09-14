import {
  createStaffObject,
  type StaffObject,
} from "@austencloud/scene-3d/worker";
import { Group } from "three";
import {
  createFanModelWorkerProp,
  createRegistryWorkerProp,
  REGISTRY_WORKER_PROP_TYPES,
  resolveWorkerPropModel,
} from "./worker-gltf-props";
import {
  createProceduralWorkerProp,
  PROCEDURAL_WORKER_PROP_TYPES,
} from "./worker-procedural-props";
import type {
  CanonicalWorkerPropType,
  WorkerPropFactoryOptions,
  WorkerPropFactoryResult,
  WorkerPropVisual,
} from "./worker-prop-factory-types";
import { CANONICAL_PROP_TYPE } from "./worker-prop-factory-types";

export const EXACT_WORKER_PROP_TYPES = [
  CANONICAL_PROP_TYPE.STAFF,
  CANONICAL_PROP_TYPE.SIMPLESTAFF,
  CANONICAL_PROP_TYPE.BIGSTAFF,
  CANONICAL_PROP_TYPE.STAFF2,
  ...PROCEDURAL_WORKER_PROP_TYPES,
  ...REGISTRY_WORKER_PROP_TYPES,
  CANONICAL_PROP_TYPE.HAND,
] as const;

const EXACT_WORKER_PROP_TYPE_SET = new Set<string>(EXACT_WORKER_PROP_TYPES);

export function isExactWorkerPropType(
  value: string
): value is CanonicalWorkerPropType {
  return EXACT_WORKER_PROP_TYPE_SET.has(value);
}

function staffVisual(staff: StaffObject): WorkerPropVisual {
  return {
    root: staff.root,
    source: "staff",
    setState: (state) => staff.setState(state),
    dispose: () => staff.dispose(),
  };
}

function createHandVisual(layer: number): WorkerPropVisual {
  const root = new Group();
  root.name = "worker-prop-hand";
  root.layers.set(layer);
  return {
    root,
    source: "hand",
    setState() {},
    dispose() {
      root.removeFromParent();
      root.clear();
    },
  };
}

function missingLoader(
  options: WorkerPropFactoryOptions,
  modelUrl: string
): WorkerPropFactoryResult {
  return {
    ok: false,
    propType: options.propType,
    reason: "model-loader-required",
    detail: `Exact ${options.propType} rendering requires ${modelUrl}`,
  };
}

/**
 * Build the exact canonical visual for one already-resolved prop type.
 *
 * The application remains responsible for deciding which prop a performer
 * owns. This boundary only turns that final choice into the same Three.js
 * object Prop3D displays, without importing Svelte or Threlte into a worker.
 */
export async function createWorkerPropVisual(
  options: WorkerPropFactoryOptions
): Promise<WorkerPropFactoryResult> {
  if (!isExactWorkerPropType(options.propType)) {
    return {
      ok: false,
      propType: options.propType,
      reason: "unsupported-prop-type",
      detail: `No exact worker renderer exists for ${options.propType}`,
    };
  }

  if (options.propType === CANONICAL_PROP_TYPE.HAND) {
    return { ok: true, visual: createHandVisual(options.layer ?? 0) };
  }

  if (
    options.propType === CANONICAL_PROP_TYPE.STAFF ||
    options.propType === CANONICAL_PROP_TYPE.SIMPLESTAFF ||
    options.propType === CANONICAL_PROP_TYPE.STAFF2 ||
    options.propType === CANONICAL_PROP_TYPE.BIGSTAFF
  ) {
    return {
      ok: true,
      visual: staffVisual(
        createStaffObject({
          color: options.color,
          length: options.length,
          thickness: options.thickness,
          layer: options.layer,
        })
      ),
    };
  }

  const model = resolveWorkerPropModel(options.propType);
  if (model) {
    if (!options.loadModel) return missingLoader(options, model.entry.modelUrl);
    const visual = await createRegistryWorkerProp(options, model);
    return visual
      ? { ok: true, visual }
      : missingLoader(options, model.entry.modelUrl);
  }

  if (
    (options.propType === CANONICAL_PROP_TYPE.FAN ||
      options.propType === CANONICAL_PROP_TYPE.BIGFAN) &&
    options.build.fanBuild !== "pictograph"
  ) {
    const modelUrl =
      options.build.fanBuild === "flat-grip"
        ? "/models/props/fan-flat-grip.glb"
        : "/models/props/fan.glb";
    if (!options.loadModel) return missingLoader(options, modelUrl);
    const visual = await createFanModelWorkerProp(
      options,
      options.propType === CANONICAL_PROP_TYPE.BIGFAN ? 1.4 : 1
    );
    return visual ? { ok: true, visual } : missingLoader(options, modelUrl);
  }

  const procedural = createProceduralWorkerProp(options);
  if (procedural) return { ok: true, visual: procedural };

  return {
    ok: false,
    propType: options.propType,
    reason: "unsupported-prop-type",
    detail: `No exact worker renderer exists for ${options.propType}`,
  };
}

export type {
  CanonicalWorkerPropType,
  WorkerPropBuild,
  WorkerPropColor,
  WorkerPropFactoryFailureReason,
  WorkerPropFactoryOptions,
  WorkerPropFactoryResult,
  WorkerPropModelLoader,
  WorkerPropVisual,
  WorkerPropVisualSource,
} from "./worker-prop-factory-types";
export { CANONICAL_PROP_TYPE } from "./worker-prop-factory-types";
