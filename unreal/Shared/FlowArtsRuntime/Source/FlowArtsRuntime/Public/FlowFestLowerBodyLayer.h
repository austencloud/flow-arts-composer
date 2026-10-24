#pragma once

#include "CoreMinimal.h"

class UAnimSequence;
struct FPoseContext;

// Phrase stage: an opt-in lower body for a performer who walks, turns or stands while the
// captured routine keeps playing from the spine up. The legs and hips come from a native
// locomotion clip (Walk or Idle, or a blend of the two), the spine is re-aimed so the upper
// body keeps the captured routine's exact component-space pose, and two-bone IK puts each
// ankle on its planned footprint. Planted feet are pinned to world points, so they cannot
// slide; the caller plans when and where each foot lifts and lands. Disabled by default:
// nothing changes for a body that never calls UFlowFestAnimInstance::SetLowerBodyLayer.
struct FLOWARTSRUNTIME_API FFlowFestLowerBodyLayer
{
    bool bEnabled = false;
    /** Locomotion clips (native motion names such as Walk and Idle) and their clip times. */
    FName Motions[2] = {TEXT("Idle"), TEXT("Walk")};
    float MotionTimes[2] = {0.f, 0.f};
    /** Weight of Motions[1] against Motions[0]. */
    float MotionBlend = 0.f;
    /** The actor's yaw in degrees (Unreal yaw about +Z). The native clips face this way. */
    float BodyYawDegrees = 0.f;
    /** World ground point under each ankle (0 = performer-left), its yaw, swing lift and toe pitch. */
    FVector FootGround[2] = {FVector::ZeroVector, FVector::ZeroVector};
    float FootYawDegrees[2] = {0.f, 0.f};
    float FootLiftCm[2] = {0.f, 0.f};
    float FootPitchDegrees[2] = {0.f, 0.f};
    /** World offset of the hips (weight shift, soft knees) and the pelvis yaw in degrees. */
    FVector PelvisOffsetCm = FVector::ZeroVector;
    float PelvisYawDegrees = 0.f;
    // body response (2026-10-23): the captured upper body turns with the hips by UpperYawDegrees
    // (about the hips, so the waist does not twist) and the chest by ChestYawDegrees on top. With
    // bHoldHands, two-bone IK then puts each hand back on its captured grip (the grid frame), with
    // the captured elbow as the pole; the grips follow PelvisOffsetCm less HandsStayCm, the part
    // of the offset the staffs do not follow. All zero or false: the layer is unchanged.
    float UpperYawDegrees = 0.f;
    float ChestYawDegrees = 0.f;
    bool bHoldHands = false;
    FVector HandsStayCm = FVector::ZeroVector;
};

/** What the last evaluation did, for probes and tests. */
struct FLOWARTSRUNTIME_API FFlowFestLowerBodyLayerResult
{
    bool bApplied = false;
    /** Extra hip drop (cm, world) the IK needed to reach both footprints. */
    float PelvisDropCm = 0.f;
    /** Ankle distance from its target after IK (cm, world); non-zero only when out of reach. */
    float ReachErrorCm[2] = {0.f, 0.f};
    /** body response (2026-10-23): hand distance from its held grip after IK (cm, world); -1 when not held. */
    float HandHoldErrorCm[2] = {-1.f, -1.f};
};

namespace FlowFestLowerBodyLayer
{
/**
 * Applies the layer to an evaluated pose. MotionClips are the resolved Motions; Reference is
 * the character's Idle clip, whose first frame defines a flat, forward foot and ankle height.
 * MeshToWorld and MeshPresentation are the body mesh's world and actor-relative transforms.
 * Returns false (pose untouched) when a required bone or clip is missing.
 */
FLOWARTSRUNTIME_API bool Apply(FPoseContext& Output, const FFlowFestLowerBodyLayer& Layer,
    const UAnimSequence* const (&MotionClips)[2], const UAnimSequence* Reference,
    const FTransform& MeshToWorld, const FTransform& MeshPresentation,
    FFlowFestLowerBodyLayerResult& Result);
}
