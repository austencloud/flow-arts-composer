#pragma once

#include "CoreMinimal.h"

struct FPoseContext;

/** World intent translated into a body action. Performance remains the animation owner while active. */
enum class EFlowFestBodyActivity : uint8
{
    None,
    Carry,
    Eat,
    FloorRest
};

struct FFlowFestActivityPoseRequest
{
    EFlowFestBodyActivity Activity = EFlowFestBodyActivity::None;
    /** Seconds since this action began. Eating repeats every 4.8 seconds. */
    float ElapsedSeconds = 0.f;
    /** Rest exits during the final 1.1 seconds before route motion may resume. */
    float ExitSecondsRemaining = -1.f;
    /** Blend from locomotion to the action, supplied by the animation owner. */
    float Weight = 0.f;
};

struct FLOWARTSRUNTIME_API FFlowFestActivityPose
{
    static constexpr float RestDescentSeconds = 1.1f;
    static constexpr float RestRiseSeconds = 1.1f;
    static constexpr float EatCycleSeconds = 4.8f;

    /** Deterministic phase weights so body and held meal share one clock. */
    static float SeatedWeight(const FFlowFestActivityPoseRequest& Request);
    static float BiteWeight(float ElapsedSeconds);
    /** Pose is applied after locomotion and ground correction, before final prop clearance. */
    static void Apply(FPoseContext& Output, const FFlowFestActivityPoseRequest& Request);
};
