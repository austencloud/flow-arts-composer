/**
 * Drives the two LOOP execution paths over one seed.
 *
 *   APP    — `src/lib/features/create/generate/circular/services/*`
 *            via `loopExecutorSelector` (the module singleton the app's
 *            `SequenceExtender` and `LOOPValidator` construct from). Reached
 *            in production by the spell/extend flow.
 *
 *   ENGINE — `@tka/sequence-engine`'s `loopExecutorSelector.getExecutor()`,
 *            which converts LOOPType+Period through `loopSpecFromLegacy` and
 *            runs `executeLOOPSpec`. Reached in production by fresh generation
 *            (`generation-orchestrator` → `SequenceBuilder.applyLoop`) and by
 *            MCP.
 *
 * Both entry points take `[startPositionStep, ...seedSteps]` and return the
 * full extended sequence, so they are directly comparable. Neither call
 * includes the downstream stages (`closeOrientationCycle`,
 * letter re-derivation, `reduceToMinimalLoop`) — those are deliberately out of
 * frame here because Phase 3 of the unification spec swaps exactly this layer.
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { loopExecutorSelector as appSelector } from "$lib/features/create/generate/circular/services/loop-executor-selector";
import {
  LOOPType as AppLOOPType,
  Period as AppPeriod,
} from "$lib/shared/foundation/domain/models/generation/circular-models";
import {
  loopExecutorSelector as engineSelector,
} from "@tka/sequence-engine/loop";
import {
  LOOPType as EngineLOOPType,
  Period as EnginePeriod,
} from "@tka/sequence-engine/loop";

import { cloneSeed } from "./canonical-fixtures";

export { AppLOOPType, AppPeriod, EngineLOOPType, EnginePeriod };

export type ExecutionOutcome =
  | { readonly kind: "ok"; readonly steps: StepData[] }
  | { readonly kind: "threw"; readonly message: string };

/**
 * The app→engine LOOPType translation, mirroring
 * `generation-orchestrator.mapLoopTypeToEngine`. Only `strict_rewound`
 * differs in spelling; everything else shares its string value.
 */
export function toEngineLoopType(appType: AppLOOPType): EngineLOOPType {
  if (appType === AppLOOPType.STRICT_REWOUND) return EngineLOOPType.REWOUND;
  const match = Object.values(EngineLOOPType).find((v) => v === String(appType));
  if (!match) {
    throw new Error(`No engine LOOPType for app LOOPType "${appType}"`);
  }
  return match;
}

export function toEnginePeriod(period: AppPeriod): EnginePeriod {
  return period === AppPeriod.QUARTERED
    ? EnginePeriod.QUARTERED
    : EnginePeriod.HALVED;
}

function attempt(run: () => StepData[]): ExecutionOutcome {
  try {
    return { kind: "ok", steps: run() };
  } catch (error) {
    return {
      kind: "threw",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function runApp(
  seed: StepData[],
  loopType: AppLOOPType,
  period: AppPeriod
): ExecutionOutcome {
  return attempt(() =>
    appSelector.getExecutor(loopType).executeLOOP(cloneSeed(seed), period)
  );
}

export function runEngine(
  seed: StepData[],
  loopType: AppLOOPType,
  period: AppPeriod
): ExecutionOutcome {
  return attempt(
    () =>
      engineSelector
        .getExecutor(toEngineLoopType(loopType))
        .executeLOOP(
          cloneSeed(seed) as never,
          toEnginePeriod(period) as never
        ) as unknown as StepData[]
  );
}

/** Every LOOP type the app's selector claims to support, in enum order. */
export const APP_SUPPORTED_LOOP_TYPES: readonly AppLOOPType[] = [
  AppLOOPType.ROTATED,
  AppLOOPType.MIRRORED,
  AppLOOPType.FLIPPED,
  AppLOOPType.SWAPPED,
  AppLOOPType.INVERTED,
  AppLOOPType.SWAPPED_INVERTED,
  AppLOOPType.ROTATED_INVERTED,
  AppLOOPType.MIRRORED_SWAPPED,
  AppLOOPType.MIRRORED_INVERTED,
  AppLOOPType.ROTATED_SWAPPED,
  AppLOOPType.MIRRORED_ROTATED,
  AppLOOPType.MIRRORED_INVERTED_ROTATED,
  AppLOOPType.MIRRORED_SWAPPED_INVERTED,
  AppLOOPType.ROTATED_SWAPPED_INVERTED,
  AppLOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED,
  AppLOOPType.STRICT_REWOUND,
];
