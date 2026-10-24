import { userProportionsState } from "@austencloud/scene-3d";
import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { CharacterInstanceState } from "../../state/character-instance-state.svelte.js";
import { normalizeCaptureSequence } from "../../native-capture/capture-score-time.js";
import { toScenePropType } from "../../domain/scene-prop-type.js";
import { composerCaptureStaffLengthCm, composerMotionSignature } from "./composer-motion-cache.js";

/** Both renderers identify motion by the same choreography and performer settings. */
export function composerCaptureRequest(
  performer: CharacterInstanceState,
  fallbackSequence: SequenceData | null,
  propType: PropType,
  effectId: string,
  leftFlipped: boolean,
  rightFlipped: boolean
) {
  const options = {
    character: performer.characterId,
    propType: toScenePropType(propType),
    propBuild: performer.effectivePropBuild,
    effectId,
    leftFlipped,
    rightFlipped,
    effortId: performer.effectiveEffortId,
    captureReachInputPolicy: "viewer" as const,
    handDistance: performer.handDistance,
    staffLengthCm: composerCaptureStaffLengthCm(
      performer.settings.staffLengthCm,
      userProportionsState.staffLengthCm
    ),
    leftPlane: performer.effectiveLeftPlane,
    rightPlane: performer.effectiveRightPlane,
    beatPlaneOverrides: new Map(performer.beatPlaneOverrides),
  };
  const source = performer.loadedSequence ?? fallbackSequence;
  const sequence = source ? normalizeCaptureSequence(source) : null;
  return {
    id: performer.id,
    sequence,
    options,
    signature: sequence ? composerMotionSignature(sequence, options) : "",
  };
}

/** Current-step updates redraw the scene without changing capture inputs. */
export function createComposerCaptureRequestMemo() {
  type Request = ReturnType<typeof composerCaptureRequest>;
  const cache = new WeakMap<CharacterInstanceState, {
    inputs: readonly unknown[];
    request: Request;
  }>();

  return (
    performer: CharacterInstanceState,
    fallbackSequence: SequenceData | null,
    propType: PropType,
    effectId: string,
    leftFlipped: boolean,
    rightFlipped: boolean
  ): Request => {
    const inputs = [
      performer.id,
      performer.loadedSequence ?? fallbackSequence,
      performer.characterId,
      propType,
      performer.effectivePropBuild,
      effectId,
      leftFlipped,
      rightFlipped,
      performer.effectiveEffortId,
      performer.handDistance,
      performer.settings.staffLengthCm,
      userProportionsState.staffLengthCm,
      performer.effectiveLeftPlane,
      performer.effectiveRightPlane,
      performer.beatPlaneOverrides,
    ];
    const previous = cache.get(performer);
    if (
      previous?.inputs.length === inputs.length &&
      inputs.every((value, index) => Object.is(value, previous.inputs[index]))
    ) return previous.request;

    const request = composerCaptureRequest(
      performer,
      fallbackSequence,
      propType,
      effectId,
      leftFlipped,
      rightFlipped
    );
    cache.set(performer, { inputs, request });
    return request;
  };
}
