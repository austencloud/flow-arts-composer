#include "FlowFestAnimInstance.h"
#include "FlowFestPropComponent.h"

#include "Animation/AnimNodeBase.h"
#include "Animation/AnimSequence.h"
#include "Animation/AnimationPoseData.h"
#include "AnimationRuntime.h"
#include "Animation/Skeleton.h"
#include "TwoBoneIK.h"
#include "BonePose.h"
#include "Components/SkeletalMeshComponent.h"

void UFlowFestAnimInstance::Configure(const TMap<FName, TObjectPtr<UAnimSequence>>& InMotions,
    const FString& InCharacterFolder)
{
    MotionClips.Empty(); MotionNames.Empty(); MotionTimes.Empty(); MotionRates.Empty(); MotionTargetRates.Empty(); MotionWeights.Empty();
    CharacterFolderPath = InCharacterFolder;
    IdleGripFamily = NAME_None;
    IdleGripClip = nullptr;
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
    PerformanceProfile = NAME_None;
    OutgoingPerformanceClips.Empty();
    OutgoingPerformanceTimes.Empty();
    OutgoingPerformanceWeights.Empty();
    OutgoingPerformanceRates.Empty();
    OutgoingPerformanceLoops.Empty();
    OutgoingPerformanceProfiles.Empty();
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

void UFlowFestAnimInstance::StartPerformance(UAnimSequence* Clip, bool bLoop, FName Profile)
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
        OutgoingPerformanceProfiles.Add(PerformanceProfile);
    }
    // An interrupted A -> B -> A switch can find A still fading out. Resume
    // that exact clip and clock instead of evaluating two copies of A on
    // opposite sides of B in a sequential skeletal rotation blend. Besides
    // avoiding a one-frame pose jump, this preserves its existing blend weight.
    float ResumedTime = 0.f;
    float ResumedWeight = 0.f;
    for (int32 Index = OutgoingPerformanceClips.Num() - 1; Index >= 0; --Index)
    {
        if (OutgoingPerformanceClips[Index] != Clip || OutgoingPerformanceProfiles[Index] != Profile)
            continue;
        ResumedTime = OutgoingPerformanceTimes[Index];
        ResumedWeight = OutgoingPerformanceWeights[Index];
        OutgoingPerformanceClips.RemoveAt(Index);
        OutgoingPerformanceTimes.RemoveAt(Index);
        OutgoingPerformanceWeights.RemoveAt(Index);
        OutgoingPerformanceRates.RemoveAt(Index);
        OutgoingPerformanceLoops.RemoveAt(Index);
        OutgoingPerformanceProfiles.RemoveAt(Index);
        break;
    }
    PerformanceClip = Clip;
    PerformanceProfile = Profile;
    PerformanceTime = ResumedTime;
    PerformanceWeight = ResumedWeight;
    PerformanceRate = 1.f;
    bPerformanceLoop = bLoop;
    bPerformanceTarget = true;
}

void UFlowFestAnimInstance::SetGripSource(UFlowFestPropComponent* Prop)
{
    GripSource = Prop;
    IdleGripFamily = NAME_None;
    IdleGripClip = nullptr;
}

void UFlowFestAnimInstance::UpdateIdleGripClip()
{
    if (!GripSource.IsValid() || !GripSource->HasVisibleGrip()) return;
    FString Family = GripSource->GetPropId().ToString().ToLower();
    int32 Colon = INDEX_NONE;
    if (Family.FindChar(TEXT(':'), Colon)) Family.LeftInline(Colon);
    if (Family.IsEmpty() || FName(*Family) == IdleGripFamily) return;
    IdleGripFamily = FName(*Family);
    // The web applies SQUARE to every equipped prop, then calibrates finger
    // contact against that family's geometry. Use a settled authored frame
    // from the matching rig and family for idle and travel only.
    const FString Name = FString::Printf(TEXT("A_Flow_P_%s_A"), *Family);
    const FString Path = FString::Printf(TEXT("%s/%s.%s"), *CharacterFolderPath, *Name, *Name);
    UAnimSequence* Clip = LoadObject<UAnimSequence>(nullptr, *Path);
    const USkeletalMeshComponent* Mesh = GetSkelMeshComponent();
    IdleGripClip = Clip && Mesh && Mesh->GetSkeletalMeshAsset() &&
        Clip->GetSkeleton() == Mesh->GetSkeletalMeshAsset()->GetSkeleton() && Clip->GetPlayLength() >= 4.f
        ? Clip : nullptr;
    if (!IdleGripClip)
        UE_LOG(LogTemp, Error, TEXT("Missing or mismatched Flow Fest grip capture: %s"), *Path);
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

bool UFlowFestAnimInstance::GetOutgoingPerformanceSample(int32 Index, float& Seconds, float& Weight, FName& Profile) const
{
    if (!OutgoingPerformanceTimes.IsValidIndex(Index)) return false;
    Seconds = OutgoingPerformanceTimes[Index];
    Weight = OutgoingPerformanceWeights[Index];
    Profile = OutgoingPerformanceProfiles[Index];
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
    const float MotionAlpha = 1.f - FMath::Exp(-Dt / .18f);
    // Source wrist paths can move sharply at a routine switch. Give the
    // incoming and outgoing performance poses time to meet at the grip.
    const float PerformanceAlpha = 1.f - FMath::Exp(-Dt / .30f);
    for (int32 Index = 0; Index < MotionWeights.Num(); ++Index)
    {
        const float Goal = MotionNames[Index] == TargetMotion && !bPerformanceTarget ? 1.f : 0.f;
        MotionWeights[Index] = FMath::Lerp(MotionWeights[Index], Goal, MotionAlpha);
    }
    PerformanceWeight = FMath::Lerp(PerformanceWeight, bPerformanceTarget ? 1.f : 0.f, PerformanceAlpha);
    for (int32 Index = OutgoingPerformanceWeights.Num() - 1; Index >= 0; --Index)
    {
        OutgoingPerformanceWeights[Index] *= 1.f - PerformanceAlpha;
        if (OutgoingPerformanceWeights[Index] < .0001f)
        {
            OutgoingPerformanceClips.RemoveAt(Index);
            OutgoingPerformanceTimes.RemoveAt(Index);
            OutgoingPerformanceWeights.RemoveAt(Index);
            OutgoingPerformanceRates.RemoveAt(Index);
            OutgoingPerformanceLoops.RemoveAt(Index);
            OutgoingPerformanceProfiles.RemoveAt(Index);
        }
    }
    if (!bPerformanceTarget && PerformanceWeight < .0001f)
    {
        PerformanceWeight = 0.f;
        PerformanceClip = nullptr;
        PerformanceTime = 0.f;
    }
    // Locomotion and performance have different response times. Keep their
    // combined blend normalized so the pose never gains or loses influence.
    float TotalWeight = PerformanceWeight;
    for (const float Weight : MotionWeights) TotalWeight += Weight;
    for (const float Weight : OutgoingPerformanceWeights) TotalWeight += Weight;
    if (TotalWeight > SMALL_NUMBER)
    {
        const float InvTotal = 1.f / TotalWeight;
        PerformanceWeight *= InvTotal;
        for (float& Weight : MotionWeights) Weight *= InvTotal;
        for (float& Weight : OutgoingPerformanceWeights) Weight *= InvTotal;
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
    Source->UpdateIdleGripClip();
    // UE calls proxy PreUpdate before NativeUpdateAnimation. Advance here so
    // the pose evaluated this tick and the prop sampled after mesh tick agree.
    Source->Advance(DeltaSeconds);
    Clips.Reset(); bMotionSamples.Reset(); Times.Reset(); Weights.Reset();
    IdleGripClip = Source->GripSource.IsValid() && Source->GripSource->HasVisibleGrip()
        ? Source->IdleGripClip.Get() : nullptr;
    for (int32 Index = 0; Index < Source->MotionClips.Num(); ++Index)
    {
        const float Weight = Source->MotionWeights[Index];
        if (Weight <= 0.0001f) continue;
        Clips.Add(Source->MotionClips[Index].Get());
        bMotionSamples.Add(true);
        Times.Add(Source->MotionTimes[Index]);
        Weights.Add(Weight);
    }
    for (int32 Index = 0; Index < Source->OutgoingPerformanceClips.Num(); ++Index)
    {
        Clips.Add(Source->OutgoingPerformanceClips[Index].Get());
        bMotionSamples.Add(false);
        Times.Add(Source->OutgoingPerformanceTimes[Index]);
        Weights.Add(Source->OutgoingPerformanceWeights[Index]);
    }
    if (Source->PerformanceClip && Source->PerformanceWeight > .0001f)
    {
        Clips.Add(Source->PerformanceClip.Get());
        bMotionSamples.Add(false);
        Times.Add(Source->PerformanceTime);
        Weights.Add(Source->PerformanceWeight);
    }
    FootCorrectionCm[0] = Source->FootCorrectionCm[0];
    FootCorrectionCm[1] = Source->FootCorrectionCm[1];
    MeshToWorld = Source->GetSkelMeshComponent()
        ? Source->GetSkelMeshComponent()->GetComponentTransform() : FTransform::Identity;
    bCapturedWristsValid = false;
    // Local-bone rotation blends can bow a wrist far outside the path between
    // two authored hand samples. Follow the weighted captured wrist path for
    // a fully performing body, including interrupted routine changes. The
    // same proxy clock drives both the body and prop root before evaluation.
    float MotionWeight = 0.f;
    for (float Weight : Source->MotionWeights) MotionWeight += Weight;
    const float PerformanceWeight = Source->PerformanceWeight + Source->GetOutgoingPerformanceWeight();
    if (Source->PerformanceClip && PerformanceWeight > .99f && MotionWeight < .01f)
    {
        if (const UFlowFestPropComponent* Prop = Source->GripSource.Get())
        {
            FVector LeftSum = FVector::ZeroVector, RightSum = FVector::ZeroVector;
            float SampledWeight = 0.f;
            const auto Add = [&Prop, &LeftSum, &RightSum, &SampledWeight]
                (FName Profile, float Time, float Weight)
            {
                if (Weight < .001f) return;
                FVector Left, Right;
                if (!Prop->SampleCapturedWrists(Profile, Time, Left, Right)) return;
                LeftSum += Left * Weight;
                RightSum += Right * Weight;
                SampledWeight += Weight;
            };
            for (int32 Index = 0; Index < Source->OutgoingPerformanceClips.Num(); ++Index)
                Add(Source->OutgoingPerformanceProfiles[Index], Source->OutgoingPerformanceTimes[Index],
                    Source->OutgoingPerformanceWeights[Index]);
            Add(Source->PerformanceProfile, Source->PerformanceTime, Source->PerformanceWeight);
            if (SampledWeight > PerformanceWeight - .001f && SampledWeight > .99f)
            {
                CapturedWristComponent[0] = MeshToWorld.InverseTransformPosition(LeftSum / SampledWeight);
                CapturedWristComponent[1] = MeshToWorld.InverseTransformPosition(RightSum / SampledWeight);
                if (Source->GetOutgoingPerformanceWeight() > .05f && bLastCapturedWristsValid)
                {
                    // A newly selected routine can put its hand far from the
                    // outgoing pose. Limit the first steps of that source
                    // path so the attached prop and wrist travel together.
                    const float MaxStepCm = FMath::Max(1.f, DeltaSeconds * 300.f);
                    for (int32 Hand = 0; Hand < 2; ++Hand)
                    {
                        const FVector Delta = CapturedWristComponent[Hand] - LastCapturedWristComponent[Hand];
                        CapturedWristComponent[Hand] = LastCapturedWristComponent[Hand] + Delta.GetClampedToMaxSize(MaxStepCm);
                    }
                }
                LastCapturedWristComponent[0] = CapturedWristComponent[0];
                LastCapturedWristComponent[1] = CapturedWristComponent[1];
                bLastCapturedWristsValid = true;
                bCapturedWristsValid = true;
            }
        }
    }
    if (!bCapturedWristsValid) bLastCapturedWristsValid = false;
}

bool FFlowFestAnimProxy::Evaluate(FPoseContext& Output)
{
    if (Clips.IsEmpty())
    {
        Output.ResetToRefPose();
        return true;
    }
    FPoseContext GripPose(Output);
    if (IdleGripClip)
    {
        GripPose.ResetToRefPose();
        FAnimationPoseData GripData(GripPose);
        IdleGripClip->GetAnimationPose(GripData, FAnimExtractContext(4.f, false));
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
        if (IdleGripClip && bMotionSamples[Index])
        {
            const FBoneContainer& Bones = Output.Pose.GetBoneContainer();
            const USkeleton* SkeletonAsset = Bones.GetSkeletonAsset();
            if (SkeletonAsset)
            {
                const FReferenceSkeleton& Reference = SkeletonAsset->GetReferenceSkeleton();
                static const TArray<FName> FingerBones = []
                {
                    TArray<FName> Names;
                    for (const TCHAR* Side : {TEXT("Left"), TEXT("Right")})
                        for (const TCHAR* Finger : {TEXT("Thumb"), TEXT("Index"), TEXT("Middle"), TEXT("Ring"), TEXT("Pinky")})
                            for (int32 Joint = 1; Joint <= 3; ++Joint)
                                Names.Add(FName(*FString::Printf(TEXT("%sHand%s%d"), Side, Finger, Joint)));
                    return Names;
                }();
                for (const FName BoneName : FingerBones)
                {
                    const int32 SkeletonIndex = Reference.FindBoneIndex(BoneName);
                    if (SkeletonIndex == INDEX_NONE) continue;
                    const FCompactPoseBoneIndex BoneIndex = Bones.GetCompactPoseIndexFromSkeletonIndex(SkeletonIndex);
                    if (BoneIndex.GetInt() == INDEX_NONE) continue;
                    Sample.Pose[BoneIndex].SetRotation(GripPose.Pose[BoneIndex].GetRotation());
                }
            }
        }
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
    if (bCapturedWristsValid)
    {
        CorrectHand(Output, TEXT("LeftArm"), TEXT("LeftForeArm"), TEXT("LeftHand"), CapturedWristComponent[0]);
        CorrectHand(Output, TEXT("RightArm"), TEXT("RightForeArm"), TEXT("RightHand"), CapturedWristComponent[1]);
    }
    return true;
}

void FFlowFestAnimProxy::CorrectHand(FPoseContext& Output, FName UpperName, FName ElbowName,
    FName HandName, const FVector& Target)
{
    const FBoneContainer& Bones = Output.Pose.GetBoneContainer();
    const USkeleton* SkeletonAsset = Bones.GetSkeletonAsset();
    if (!SkeletonAsset) return;
    const FReferenceSkeleton& Reference = SkeletonAsset->GetReferenceSkeleton();
    const int32 UpperSkeleton = Reference.FindBoneIndex(UpperName);
    const int32 ElbowSkeleton = Reference.FindBoneIndex(ElbowName);
    const int32 HandSkeleton = Reference.FindBoneIndex(HandName);
    if (UpperSkeleton == INDEX_NONE || ElbowSkeleton == INDEX_NONE || HandSkeleton == INDEX_NONE) return;
    const FCompactPoseBoneIndex Upper = Bones.GetCompactPoseIndexFromSkeletonIndex(UpperSkeleton);
    const FCompactPoseBoneIndex Elbow = Bones.GetCompactPoseIndexFromSkeletonIndex(ElbowSkeleton);
    const FCompactPoseBoneIndex Hand = Bones.GetCompactPoseIndexFromSkeletonIndex(HandSkeleton);
    if (Upper.GetInt() == INDEX_NONE || Elbow.GetInt() == INDEX_NONE || Hand.GetInt() == INDEX_NONE) return;
    FCSPose<FCompactPose> ComponentPose;
    ComponentPose.InitPose(Output.Pose);
    FTransform UpperTransform = ComponentPose.GetComponentSpaceTransform(Upper);
    FTransform ElbowTransform = ComponentPose.GetComponentSpaceTransform(Elbow);
    FTransform HandTransform = ComponentPose.GetComponentSpaceTransform(Hand);
    if (FVector::DistSquared(HandTransform.GetLocation(), Target) < .01f) return;
    const FVector JointTarget = ElbowTransform.GetLocation();
    AnimationCore::SolveTwoBoneIK(UpperTransform, ElbowTransform, HandTransform,
        JointTarget, Target, false, 1.0, 1.0);
    ComponentPose.SetComponentSpaceTransform(Upper, UpperTransform);
    ComponentPose.SetComponentSpaceTransform(Elbow, ElbowTransform);
    ComponentPose.SetComponentSpaceTransform(Hand, HandTransform);
    FCSPose<FCompactPose>::ConvertComponentPosesToLocalPosesSafe(ComponentPose, Output.Pose);
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
