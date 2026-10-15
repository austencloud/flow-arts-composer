#include "FlowFestAnimInstance.h"

#include "Animation/AnimNodeBase.h"
#include "Animation/AnimSequence.h"
#include "Animation/AnimationPoseData.h"
#include "AnimationRuntime.h"
#include "Animation/Skeleton.h"
#include "TwoBoneIK.h"
#include "BonePose.h"
#include "Components/SkeletalMeshComponent.h"

void UFlowFestAnimInstance::Configure(const TMap<FName, TObjectPtr<UAnimSequence>>& InMotions)
{
    MotionClips.Empty(); MotionNames.Empty(); MotionTimes.Empty(); MotionRates.Empty(); MotionTargetRates.Empty(); MotionWeights.Empty();
    for (const auto& Pair : InMotions)
    {
        MotionNames.Add(Pair.Key);
        MotionClips.Add(Pair.Value);
        MotionTimes.Add(0.f);
        MotionRates.Add(1.f);
        MotionTargetRates.Add(1.f);
        MotionWeights.Add(Pair.Key == TEXT("Idle") ? 1.f : 0.f);
    }
    TargetMotion = TEXT("Idle");
    PerformanceClip = nullptr;
    OutgoingPerformanceClips.Empty();
    OutgoingPerformanceTimes.Empty();
    OutgoingPerformanceWeights.Empty();
    OutgoingPerformanceRates.Empty();
    OutgoingPerformanceLoops.Empty();
    PerformanceTime = 0.f;
    PerformanceWeight = 0.f;
    PerformanceRate = 1.f;
    bPerformanceTarget = false;
}

bool UFlowFestAnimInstance::SetMotion(FName Name)
{
    if (!MotionNames.Contains(Name)) return false;
    if (Name != TargetMotion && (Name == TEXT("Jump") || Name == TEXT("Land")))
    {
        const int32 Index = MotionNames.IndexOfByKey(Name);
        if (MotionTimes.IsValidIndex(Index)) MotionTimes[Index] = 0.f;
    }
    TargetMotion = Name;
    return true;
}

void UFlowFestAnimInstance::SetMotionRate(FName Name, float Rate)
{
    const int32 Index = MotionNames.IndexOfByKey(Name);
    if (MotionTargetRates.IsValidIndex(Index) && FMath::IsFinite(Rate))
        MotionTargetRates[Index] = FMath::Clamp(Rate, .55f, 2.4f);
}

void UFlowFestAnimInstance::SetMotionTime(FName Name, float Seconds)
{
    const int32 Index = MotionNames.IndexOfByKey(Name);
    if (MotionTimes.IsValidIndex(Index) && MotionClips.IsValidIndex(Index) && MotionClips[Index] && FMath::IsFinite(Seconds))
        MotionTimes[Index] = FMath::Clamp(Seconds, 0.f, MotionClips[Index]->GetPlayLength());
}

float UFlowFestAnimInstance::GetMotionRate(FName Name) const
{
    const int32 Index = MotionNames.IndexOfByKey(Name);
    return MotionRates.IsValidIndex(Index) ? MotionRates[Index] : 0.f;
}

float UFlowFestAnimInstance::GetMotionTime(FName Name) const
{
    const int32 Index = MotionNames.IndexOfByKey(Name);
    return MotionTimes.IsValidIndex(Index) ? MotionTimes[Index] : 0.f;
}

void UFlowFestAnimInstance::StartPerformance(UAnimSequence* Clip, bool bLoop)
{
    // Keep the outgoing pose alive across StopPerformance/StartPerformance in
    // the same frame. The next clip starts at zero weight, so a routine switch
    // has a real source pose to fade from even when locomotion is fully faded.
    if (PerformanceClip && PerformanceWeight > .0001f)
    {
        OutgoingPerformanceClips.Add(PerformanceClip);
        OutgoingPerformanceTimes.Add(PerformanceTime);
        OutgoingPerformanceWeights.Add(PerformanceWeight);
        OutgoingPerformanceRates.Add(PerformanceRate);
        OutgoingPerformanceLoops.Add(bPerformanceLoop);
    }
    PerformanceClip = Clip;
    PerformanceTime = 0.f;
    PerformanceWeight = 0.f;
    PerformanceRate = 1.f;
    bPerformanceLoop = bLoop;
    bPerformanceTarget = true;
}

void UFlowFestAnimInstance::StopPerformance()
{
    bPerformanceTarget = false;
    TargetMotion = TEXT("Idle");
}

void UFlowFestAnimInstance::SetPerformancePhase(float NormalizedPhase)
{
    if (bPerformanceTarget && PerformanceClip && FMath::IsFinite(NormalizedPhase))
        PerformanceTime = FMath::Frac(FMath::Max(0.f, NormalizedPhase)) * PerformanceClip->GetPlayLength();
}

void UFlowFestAnimInstance::SetPerformanceRate(float Rate)
{
    if (FMath::IsFinite(Rate)) PerformanceRate = FMath::Clamp(Rate, .5f, 1.75f);
}

float UFlowFestAnimInstance::GetMotionWeight(FName Name) const
{
    const int32 Index = MotionNames.IndexOfByKey(Name);
    return MotionWeights.IsValidIndex(Index) ? MotionWeights[Index] : 0.f;
}

float UFlowFestAnimInstance::GetOutgoingPerformanceWeight() const
{
    float Sum = 0.f;
    for (const float Weight : OutgoingPerformanceWeights) Sum += Weight;
    return Sum;
}

bool UFlowFestAnimInstance::GetOutgoingPerformanceSample(int32 Index, float& Seconds, float& Weight) const
{
    if (!OutgoingPerformanceTimes.IsValidIndex(Index)) return false;
    Seconds = OutgoingPerformanceTimes[Index];
    Weight = OutgoingPerformanceWeights[Index];
    return true;
}

void UFlowFestAnimInstance::SetFootCorrection(float LeftCm, float RightCm)
{
    FootCorrectionCm[0] = FMath::Clamp(LeftCm, -12.f, 14.f);
    FootCorrectionCm[1] = FMath::Clamp(RightCm, -12.f, 14.f);
}

void UFlowFestAnimInstance::Advance(float DeltaSeconds)
{
    const float Dt = FMath::Clamp(DeltaSeconds, 0.f, .1f);
    // All channels have continuous, independent clocks. A newly selected gait
    // never snaps a pose back to its first frame while its weight is rising.
    for (int32 Index = 0; Index < MotionClips.Num(); ++Index)
    {
        MotionRates[Index] = FMath::Lerp(MotionRates[Index], MotionTargetRates[Index], 1.f - FMath::Exp(-Dt / .12f));
        if (const UAnimSequence* Clip = MotionClips[Index])
        {
            const float Length = Clip->GetPlayLength();
            if (Length > SMALL_NUMBER)
            {
                const bool bOneShot = MotionNames[Index] == TEXT("Jump") || MotionNames[Index] == TEXT("Land");
                MotionTimes[Index] = bOneShot
                    ? FMath::Min(MotionTimes[Index] + Dt * MotionRates[Index], Length)
                    : FMath::Fmod(MotionTimes[Index] + Dt * MotionRates[Index], Length);
            }
        }
    }
    if (PerformanceClip)
    {
        const float Length = PerformanceClip->GetPlayLength();
        if (Length > SMALL_NUMBER)
            PerformanceTime = bPerformanceLoop
                ? FMath::Fmod(PerformanceTime + Dt * PerformanceRate, Length)
                : FMath::Min(PerformanceTime + Dt * PerformanceRate, Length);
    }
    for (int32 Index = 0; Index < OutgoingPerformanceClips.Num(); ++Index)
    {
        const float Length = OutgoingPerformanceClips[Index]->GetPlayLength();
        if (Length > SMALL_NUMBER)
            OutgoingPerformanceTimes[Index] = OutgoingPerformanceLoops[Index]
                ? FMath::Fmod(OutgoingPerformanceTimes[Index] + Dt * OutgoingPerformanceRates[Index], Length)
                : FMath::Min(OutgoingPerformanceTimes[Index] + Dt * OutgoingPerformanceRates[Index], Length);
    }
    // A finite response time creates true per-bone pose blends, including
    // interrupted transitions, rather than swapping PlayAnimation assets.
    const float Alpha = 1.f - FMath::Exp(-Dt / .18f);
    for (int32 Index = 0; Index < MotionWeights.Num(); ++Index)
    {
        const float Goal = MotionNames[Index] == TargetMotion && !bPerformanceTarget ? 1.f : 0.f;
        MotionWeights[Index] = FMath::Lerp(MotionWeights[Index], Goal, Alpha);
    }
    PerformanceWeight = FMath::Lerp(PerformanceWeight, bPerformanceTarget ? 1.f : 0.f, Alpha);
    for (int32 Index = OutgoingPerformanceWeights.Num() - 1; Index >= 0; --Index)
    {
        OutgoingPerformanceWeights[Index] *= 1.f - Alpha;
        if (OutgoingPerformanceWeights[Index] < .0001f)
        {
            OutgoingPerformanceClips.RemoveAt(Index);
            OutgoingPerformanceTimes.RemoveAt(Index);
            OutgoingPerformanceWeights.RemoveAt(Index);
            OutgoingPerformanceRates.RemoveAt(Index);
            OutgoingPerformanceLoops.RemoveAt(Index);
        }
    }
    if (!bPerformanceTarget && PerformanceWeight < .0001f)
    {
        PerformanceWeight = 0.f;
        PerformanceClip = nullptr;
        PerformanceTime = 0.f;
    }
}

FAnimInstanceProxy* UFlowFestAnimInstance::CreateAnimInstanceProxy()
{
    return new FFlowFestAnimProxy(this);
}

void UFlowFestAnimInstance::DestroyAnimInstanceProxy(FAnimInstanceProxy* InProxy)
{
    delete static_cast<FFlowFestAnimProxy*>(InProxy);
}

void FFlowFestAnimProxy::PreUpdate(UAnimInstance* Instance, float DeltaSeconds)
{
    FAnimInstanceProxy::PreUpdate(Instance, DeltaSeconds);
    UFlowFestAnimInstance* Source = CastChecked<UFlowFestAnimInstance>(Instance);
    // UE calls proxy PreUpdate before NativeUpdateAnimation. Advance here so
    // the pose evaluated this tick and the prop sampled after mesh tick agree.
    Source->Advance(DeltaSeconds);
    Clips.Reset(); Times.Reset(); Weights.Reset();
    for (int32 Index = 0; Index < Source->MotionClips.Num(); ++Index)
    {
        const float Weight = Source->MotionWeights[Index];
        if (Weight <= 0.0001f) continue;
        Clips.Add(Source->MotionClips[Index].Get());
        Times.Add(Source->MotionTimes[Index]);
        Weights.Add(Weight);
    }
    for (int32 Index = 0; Index < Source->OutgoingPerformanceClips.Num(); ++Index)
    {
        Clips.Add(Source->OutgoingPerformanceClips[Index].Get());
        Times.Add(Source->OutgoingPerformanceTimes[Index]);
        Weights.Add(Source->OutgoingPerformanceWeights[Index]);
    }
    if (Source->PerformanceClip && Source->PerformanceWeight > .0001f)
    {
        Clips.Add(Source->PerformanceClip.Get());
        Times.Add(Source->PerformanceTime);
        Weights.Add(Source->PerformanceWeight);
    }
    FootCorrectionCm[0] = Source->FootCorrectionCm[0];
    FootCorrectionCm[1] = Source->FootCorrectionCm[1];
    MeshToWorld = Source->GetSkelMeshComponent()
        ? Source->GetSkelMeshComponent()->GetComponentTransform() : FTransform::Identity;
}

bool FFlowFestAnimProxy::Evaluate(FPoseContext& Output)
{
    if (Clips.IsEmpty())
    {
        Output.ResetToRefPose();
        return true;
    }
    // Blend every active source in local bone space. Sequential normalized
    // weighted blending is algebraically equivalent to the full weighted sum.
    float Accumulated = 0.f;
    for (int32 Index = 0; Index < Clips.Num(); ++Index)
    {
        FPoseContext Sample(Output);
        Sample.ResetToRefPose();
        FAnimationPoseData SampleData(Sample);
        Clips[Index]->GetAnimationPose(SampleData, FAnimExtractContext(Times[Index], false));
        const float Weight = Weights[Index];
        if (Accumulated <= SMALL_NUMBER)
        {
            Output.Pose = MoveTemp(Sample.Pose);
            Output.Curve = MoveTemp(Sample.Curve);
            Output.CustomAttributes = MoveTemp(Sample.CustomAttributes);
            Accumulated = Weight;
        }
        else
        {
            FAnimationPoseData OutputData(Output);
            FAnimationRuntime::BlendTwoPosesTogetherInPlace(OutputData, SampleData,
                Accumulated / (Accumulated + Weight));
            Accumulated += Weight;
        }
    }
    if (FMath::Abs(FootCorrectionCm[0]) > .05f)
        CorrectFoot(Output, TEXT("LeftUpLeg"), TEXT("LeftLeg"), TEXT("LeftFoot"), FootCorrectionCm[0]);
    if (FMath::Abs(FootCorrectionCm[1]) > .05f)
        CorrectFoot(Output, TEXT("RightUpLeg"), TEXT("RightLeg"), TEXT("RightFoot"), FootCorrectionCm[1]);
    return true;
}

void FFlowFestAnimProxy::CorrectFoot(FPoseContext& Output, FName UpperName, FName KneeName, FName FootName, float CorrectionCm)
{
    const FBoneContainer& Bones = Output.Pose.GetBoneContainer();
    const USkeleton* SkeletonAsset = Bones.GetSkeletonAsset();
    if (!SkeletonAsset) return;
    const FReferenceSkeleton& Reference = SkeletonAsset->GetReferenceSkeleton();
    const int32 UpperSkeleton = Reference.FindBoneIndex(UpperName);
    const int32 KneeSkeleton = Reference.FindBoneIndex(KneeName);
    const int32 FootSkeleton = Reference.FindBoneIndex(FootName);
    if (UpperSkeleton == INDEX_NONE || KneeSkeleton == INDEX_NONE || FootSkeleton == INDEX_NONE) return;
    const FCompactPoseBoneIndex Upper = Bones.GetCompactPoseIndexFromSkeletonIndex(UpperSkeleton);
    const FCompactPoseBoneIndex Knee = Bones.GetCompactPoseIndexFromSkeletonIndex(KneeSkeleton);
    const FCompactPoseBoneIndex Foot = Bones.GetCompactPoseIndexFromSkeletonIndex(FootSkeleton);
    if (Upper.GetInt() == INDEX_NONE || Knee.GetInt() == INDEX_NONE || Foot.GetInt() == INDEX_NONE) return;
    FCSPose<FCompactPose> ComponentPose;
    ComponentPose.InitPose(Output.Pose);
    FTransform UpperTransform = ComponentPose.GetComponentSpaceTransform(Upper);
    FTransform KneeTransform = ComponentPose.GetComponentSpaceTransform(Knee);
    FTransform FootTransform = ComponentPose.GetComponentSpaceTransform(Foot);
    const FVector Effector = FootTransform.GetLocation() + MeshToWorld.InverseTransformVector(FVector(0, 0, CorrectionCm));
    // Preserve the authored knee bend direction and limb length while the
    // sole follows the terrain. Never stretch limbs to chase a bad probe.
    const FVector JointTarget = KneeTransform.GetLocation();
    AnimationCore::SolveTwoBoneIK(UpperTransform, KneeTransform, FootTransform,
        JointTarget, Effector, false, 1.0, 1.0);
    ComponentPose.SetComponentSpaceTransform(Upper, UpperTransform);
    ComponentPose.SetComponentSpaceTransform(Knee, KneeTransform);
    ComponentPose.SetComponentSpaceTransform(Foot, FootTransform);
    FCSPose<FCompactPose>::ConvertComponentPosesToLocalPosesSafe(ComponentPose, Output.Pose);
}
