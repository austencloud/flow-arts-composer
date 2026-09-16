/**
 * Lossless Step + MotionView bridge — SCRIPT/TEST-ONLY since 2026-07-02.
 *
 * The runtime app no longer needs any bridge: `StepData` extends canonical
 * `Step` (and `MotionData` extends `Motion`) by declaration. This adapter
 * remains for the migration parity scripts: it pairs a LEAN canonical `Step`
 * with a per-hand `MotionView` side-channel carrying every view field, so
 * `StepData -> StepWithView -> StepData` is byte-identical on every
 * fingerprint (proven by scripts/migrations/step-roundtrip-parity.ts, 0
 * drift over the corpus + risk fixtures). The lossy sibling (step-bridge.ts
 * `stepToStepData`) is the negative control's deliberately-broken bridge.
 */
import type { Motion, Step } from "@tka/tka-types";
import { createMotionData, type MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { MotionView } from "$lib/shared/pictograph/shared/domain/models/motion-view";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { stepDataToStep, motionToMotionData } from "./step-bridge";

/** A canonical `Step` paired with the per-hand view fields lean `Motion` drops. */
export interface StepWithView {
  readonly step: Step;
  readonly view: { readonly left: MotionView; readonly right: MotionView };
}

/** Extract the view-layer fields off a fat `MotionData` into a `MotionView`. */
export function motionDataToMotionView(md: MotionData): MotionView {
  return {
    isVisible: md.isVisible,
    propType: md.propType,
    arrowLocation: md.arrowLocation,
    gridMode: md.gridMode,
    arrowPlacementData: md.arrowPlacementData,
    propPlacementData: md.propPlacementData,
    handPath: md.handPath ?? null,
    skewSteps: md.skewSteps ?? null,
    skewDir: md.skewDir ?? null,
    pathShape: md.pathShape,
  };
}

/** Rebuild a fat `MotionData` losslessly from a lean `Motion` + its `MotionView`. */
export function motionWithViewToMotionData(m: Motion, view: MotionView, color: HandSide): MotionData {
  return createMotionData({
    ...motionToMotionData(m, color), // structural fields (motionType, locations, orientations, turns, plane, prefloat)
    ...(view.isVisible !== undefined && { isVisible: view.isVisible }),
    ...(view.propType !== undefined && { propType: view.propType }),
    ...(view.arrowLocation !== undefined && { arrowLocation: view.arrowLocation }),
    ...(view.gridMode !== undefined && { gridMode: view.gridMode }),
    ...(view.arrowPlacementData !== undefined && { arrowPlacementData: view.arrowPlacementData }),
    ...(view.propPlacementData !== undefined && { propPlacementData: view.propPlacementData }),
    handPath: view.handPath ?? null,
    skewSteps: view.skewSteps ?? null,
    skewDir: view.skewDir ?? null,
    pathShape: view.pathShape,
  });
}

/** Forward: `StepData` -> canonical `Step` + the per-hand view side-channel. */
export function stepDataToStepWithView(sd: StepData): StepWithView {
  const left = sd.motions[HandSide.LEFT];
  const right = sd.motions[HandSide.RIGHT];
  if (!left || !right) {
    throw new Error(`stepDataToStepWithView: step ${sd.stepNumber} (${sd.id}) is missing a motion`);
  }
  return {
    step: stepDataToStep(sd),
    view: { left: motionDataToMotionView(left), right: motionDataToMotionView(right) },
  };
}

/**
 * Reverse: canonical `Step` + view side-channel -> `StepData`, LOSSLESS on the
 * motion fields every fingerprint reads. Reversal flags default to false (the
 * hydrate pipeline's processReversals refills them, exactly as the app does
 * today) and the V2 identity hash excludes them anyway.
 */
export function stepWithViewToStepData({ step, view }: StepWithView): StepData {
  return createStepData({
    id: step.id,
    letter: (step.letter ?? undefined) as StepData["letter"],
    startPlacement: step.startPlacement ?? undefined,
    endPlacement: step.endPlacement ?? undefined,
    stepNumber: step.stepNumber,
    duration: step.duration,
    ...(step.gridMode !== undefined && { gridMode: step.gridMode as StepData["gridMode"] }),
    ...(step.isBlank !== undefined && { isBlank: step.isBlank }),
    motions: {
      [HandSide.LEFT]: motionWithViewToMotionData(step.motions.left, view.left, HandSide.LEFT),
      [HandSide.RIGHT]: motionWithViewToMotionData(step.motions.right, view.right, HandSide.RIGHT),
    },
  });
}
