// Phrase stage: the opt-in lower-body layer. See FlowFestLowerBodyLayer.h.
#include "FlowFestLowerBodyLayer.h"

#include "Animation/AnimNodeBase.h"
#include "Animation/AnimSequence.h"
#include "Animation/AnimationPoseData.h"
#include "Animation/Skeleton.h"
#include "AnimationRuntime.h"
#include "BonePose.h"
#include "TwoBoneIK.h"

namespace
{
FCompactPoseBoneIndex FindBone(const FBoneContainer& Bones, const FReferenceSkeleton& Reference, const TCHAR* Name)
{
    const int32 SkeletonIndex = Reference.FindBoneIndex(FName(Name));
    return SkeletonIndex == INDEX_NONE ? FCompactPoseBoneIndex(INDEX_NONE)
        : Bones.GetCompactPoseIndexFromSkeletonIndex(SkeletonIndex);
}

void Sample(FPoseContext& Pose, const UAnimSequence* Clip, float Seconds)
{
    Pose.ResetToRefPose();
    if (!Clip) return;
    FAnimationPoseData Data(Pose);
    Clip->GetAnimationPose(Data, FAnimExtractContext(double(FMath::Clamp(Seconds, 0.f, Clip->GetPlayLength())), false));
}

FVector Flat(const FVector& V, const FVector& Up) { return (V - Up * FVector::DotProduct(V, Up)).GetSafeNormal(); }
}

namespace FlowFestLowerBodyLayer
{
bool Apply(FPoseContext& Output, const FFlowFestLowerBodyLayer& Layer,
    const UAnimSequence* const (&MotionClips)[2], const UAnimSequence* Reference,
    const FTransform& MeshToWorld, const FTransform& MeshPresentation,
    FFlowFestLowerBodyLayerResult& Result)
{
    Result = {};
    if (!Layer.bEnabled || !MotionClips[0] || !Reference) return false;
    const FBoneContainer& Bones = Output.Pose.GetBoneContainer();
    const USkeleton* SkeletonAsset = Bones.GetSkeletonAsset();
    if (!SkeletonAsset) return false;
    const FReferenceSkeleton& RefSkeleton = SkeletonAsset->GetReferenceSkeleton();
    const FCompactPoseBoneIndex Hips = FindBone(Bones, RefSkeleton, TEXT("Hips"));
    const FCompactPoseBoneIndex Spine = FindBone(Bones, RefSkeleton, TEXT("Spine"));
    const FCompactPoseBoneIndex UpLeg[2] = {FindBone(Bones, RefSkeleton, TEXT("LeftUpLeg")), FindBone(Bones, RefSkeleton, TEXT("RightUpLeg"))};
    const FCompactPoseBoneIndex Knee[2] = {FindBone(Bones, RefSkeleton, TEXT("LeftLeg")), FindBone(Bones, RefSkeleton, TEXT("RightLeg"))};
    const FCompactPoseBoneIndex Foot[2] = {FindBone(Bones, RefSkeleton, TEXT("LeftFoot")), FindBone(Bones, RefSkeleton, TEXT("RightFoot"))};
    for (const FCompactPoseBoneIndex Index : {Hips, Spine, UpLeg[0], UpLeg[1], Knee[0], Knee[1], Foot[0], Foot[1]})
        if (Index.GetInt() == INDEX_NONE) return false;
    if (Output.Pose.GetParentBoneIndex(Spine) != Hips) return false;

    // The captured routine's pose, kept for the upper body.
    FCSPose<FCompactPose> Before;
    Before.InitPose(Output.Pose);
    const FTransform HipsBefore = Before.GetComponentSpaceTransform(Hips);
    const FTransform SpineBefore = Before.GetComponentSpaceTransform(Spine);
    // body response (2026-10-23): the captured arms and grips, for holding the hands on the staffs.
    const TCHAR* const ArmNames[2][3] = {{TEXT("LeftArm"), TEXT("LeftForeArm"), TEXT("LeftHand")}, {TEXT("RightArm"), TEXT("RightForeArm"), TEXT("RightHand")}};
    FCompactPoseBoneIndex Arm[2][3] = {{FCompactPoseBoneIndex(INDEX_NONE), FCompactPoseBoneIndex(INDEX_NONE), FCompactPoseBoneIndex(INDEX_NONE)},
        {FCompactPoseBoneIndex(INDEX_NONE), FCompactPoseBoneIndex(INDEX_NONE), FCompactPoseBoneIndex(INDEX_NONE)}};
    FTransform ElbowBefore[2], GripBefore[2];
    if (Layer.bHoldHands)
        for (int32 Side = 0; Side < 2; ++Side)
        {
            for (int32 Joint = 0; Joint < 3; ++Joint) Arm[Side][Joint] = FindBone(Bones, RefSkeleton, ArmNames[Side][Joint]);
            if (Arm[Side][2].GetInt() == INDEX_NONE || Arm[Side][1].GetInt() == INDEX_NONE || Arm[Side][0].GetInt() == INDEX_NONE) continue;
            ElbowBefore[Side] = Before.GetComponentSpaceTransform(Arm[Side][1]);
            GripBefore[Side] = Before.GetComponentSpaceTransform(Arm[Side][2]);
        }

    // Locomotion for the hips and legs: one clip, or two blended in local space.
    FPoseContext Lower(Output);
    Sample(Lower, MotionClips[0], Layer.MotionTimes[0]);
    const float Blend = MotionClips[1] ? FMath::Clamp(Layer.MotionBlend, 0.f, 1.f) : 0.f;
    if (Blend > .001f)
    {
        FPoseContext Second(Output);
        Sample(Second, MotionClips[1], Layer.MotionTimes[1]);
        if (Blend >= .999f) Lower.Pose = MoveTemp(Second.Pose);
        else
        {
            FAnimationPoseData LowerData(Lower), SecondData(Second);
            FAnimationRuntime::BlendTwoPosesTogetherInPlace(LowerData, SecondData, 1.f - Blend);
        }
    }
    FPoseContext RefPose(Output);
    Sample(RefPose, Reference, 0.f);
    FCSPose<FCompactPose> RefComponent;
    RefComponent.InitPose(RefPose.Pose);

    // Hips rotation and both legs (everything below each upper leg) come from locomotion.
    TArray<bool, TInlineAllocator<128>> Legs;
    Legs.SetNumZeroed(Output.Pose.GetNumBones());
    for (const FCompactPoseBoneIndex Index : Output.Pose.ForEachBoneIndex())
    {
        const FCompactPoseBoneIndex Parent = Output.Pose.GetParentBoneIndex(Index);
        Legs[Index.GetInt()] = Index == UpLeg[0] || Index == UpLeg[1] || (Parent.GetInt() != INDEX_NONE && Legs[Parent.GetInt()]);
        if (Legs[Index.GetInt()]) Output.Pose[Index] = Lower.Pose[Index];
    }
    Output.Pose[Hips].SetRotation(Lower.Pose[Hips].GetRotation());

    const FVector Up = MeshToWorld.InverseTransformVectorNoScale(FVector::UpVector).GetSafeNormal();
    const auto Direction = [&MeshToWorld, &Up](float YawDegrees)
    {
        const float Radians = FMath::DegreesToRadians(YawDegrees);
        return Flat(MeshToWorld.InverseTransformVectorNoScale(FVector(FMath::Cos(Radians), FMath::Sin(Radians), 0.f)), Up);
    };
    const FVector BodyForward = Direction(Layer.BodyYawDegrees);
    const FQuat PelvisTurn = FQuat::FindBetweenNormals(BodyForward, Direction(Layer.PelvisYawDegrees));
    const FVector OffsetBase = MeshToWorld.InverseTransformVector(Layer.PelvisOffsetCm);
    // body response (2026-10-23): the whole upper body turns about the hips with them.
    const bool bUpperTurn = !FMath::IsNearlyZero(Layer.UpperYawDegrees, .01f);
    const FQuat UpperTurn = bUpperTurn ? FQuat::FindBetweenNormals(BodyForward, Direction(Layer.BodyYawDegrees + Layer.UpperYawDegrees)) : FQuat::Identity;
    // Hips at the routine's height plus the requested offset; the spine keeps the routine's
    // exact component pose, moved only by that offset, so hands and grips stay where captured.
    const auto Place = [&](FCSPose<FCompactPose>& Pose, const FVector& Offset)
    {
        Pose.InitPose(Output.Pose);
        FTransform HipsNow = Pose.GetComponentSpaceTransform(Hips);
        HipsNow.SetRotation((PelvisTurn * HipsNow.GetRotation()).GetNormalized());
        HipsNow.SetTranslation(HipsBefore.GetTranslation() + Offset);
        Pose.SetComponentSpaceTransform(Hips, HipsNow);
        FTransform SpineNow = SpineBefore;
        SpineNow.SetTranslation(SpineBefore.GetTranslation() + Offset);
        if (bUpperTurn) // body response (2026-10-23)
        {
            SpineNow.SetRotation((UpperTurn * SpineBefore.GetRotation()).GetNormalized());
            SpineNow.SetTranslation(HipsBefore.GetTranslation() + Offset + UpperTurn.RotateVector(SpineBefore.GetTranslation() - HipsBefore.GetTranslation()));
        }
        Pose.SetComponentSpaceTransform(Spine, SpineNow);
    };

    // Ankle targets: the footprint, the reference ankle height above the actor's ground, the lift.
    const FVector GroundOrigin = MeshPresentation.InverseTransformPosition(FVector::ZeroVector);
    FVector Target[2];
    FQuat FootRotation[2];
    for (int32 Side = 0; Side < 2; ++Side)
    {
        const FTransform RefFoot = RefComponent.GetComponentSpaceTransform(Foot[Side]);
        const float AnkleHeight = FVector::DotProduct(RefFoot.GetTranslation() - GroundOrigin, Up);
        Target[Side] = MeshToWorld.InverseTransformPosition(Layer.FootGround[Side] + FVector(0, 0, Layer.FootLiftCm[Side])) + Up * AnkleHeight;
        const FVector Forward = Direction(Layer.FootYawDegrees[Side]);
        const FQuat Yaw = FQuat::FindBetweenNormals(BodyForward, Forward);
        const FVector Lateral = FVector::CrossProduct(Up, Forward).GetSafeNormal();
        const FQuat Pitch(Lateral, FMath::DegreesToRadians(Layer.FootPitchDegrees[Side]));
        FootRotation[Side] = (Pitch * Yaw * RefFoot.GetRotation()).GetNormalized();
    }

    // Drop the hips just enough for both legs to reach (the low point of a walking stride).
    FCSPose<FCompactPose> Trial;
    Place(Trial, OffsetBase);
    float Drop = 0.f;
    for (int32 Side = 0; Side < 2; ++Side)
    {
        const FVector Hip = Trial.GetComponentSpaceTransform(UpLeg[Side]).GetTranslation();
        const float Reach = .995f * (FVector::Distance(Hip, Trial.GetComponentSpaceTransform(Knee[Side]).GetTranslation()) +
            FVector::Distance(Trial.GetComponentSpaceTransform(Knee[Side]).GetTranslation(), Trial.GetComponentSpaceTransform(Foot[Side]).GetTranslation()));
        const FVector ToTarget = Target[Side] - Hip;
        const float Vertical = FVector::DotProduct(ToTarget, Up);
        const float Horizontal = (ToTarget - Up * Vertical).Size();
        if (Horizontal < Reach) Drop = FMath::Max(Drop, -Vertical - FMath::Sqrt(Reach * Reach - Horizontal * Horizontal));
    }
    const float WorldScale = MeshToWorld.GetScale3D().Z;
    Drop = FMath::Clamp(Drop, 0.f, 20.f / FMath::Max(WorldScale, KINDA_SMALL_NUMBER));
    Result.PelvisDropCm = Drop * WorldScale;

    FCSPose<FCompactPose> Component;
    Place(Component, OffsetBase - Up * Drop);
    for (int32 Side = 0; Side < 2; ++Side)
    {
        FTransform UpperLeg = Component.GetComponentSpaceTransform(UpLeg[Side]);
        FTransform Shin = Component.GetComponentSpaceTransform(Knee[Side]);
        FTransform Ankle = Component.GetComponentSpaceTransform(Foot[Side]);
        // Knees bend toward the foot's own forward.
        const FVector Pole = (UpperLeg.GetTranslation() + Target[Side]) * .5f + Direction(Layer.FootYawDegrees[Side]) * 60.f;
        AnimationCore::SolveTwoBoneIK(UpperLeg, Shin, Ankle, Pole, Target[Side], false, 1.0, 1.0);
        Ankle.SetRotation(FootRotation[Side]);
        Component.SetComponentSpaceTransform(UpLeg[Side], UpperLeg);
        Component.SetComponentSpaceTransform(Knee[Side], Shin);
        Component.SetComponentSpaceTransform(Foot[Side], Ankle);
        Result.ReachErrorCm[Side] = FVector::Distance(Ankle.GetTranslation(), Target[Side]) * WorldScale;
    }
    // body response (2026-10-23): the chest keeps part of the turn back (half at each of Spine1
    // and Spine2), then each hand returns to its captured grip, moved only by the offset the
    // staffs follow, bending the elbow toward where the capture had it.
    if (!FMath::IsNearlyZero(Layer.ChestYawDegrees, .01f))
    {
        const FQuat Half = FQuat::FindBetweenNormals(BodyForward, Direction(Layer.BodyYawDegrees + .5f * Layer.ChestYawDegrees));
        for (const TCHAR* Name : {TEXT("Spine1"), TEXT("Spine2")})
        {
            const FCompactPoseBoneIndex Chest = FindBone(Bones, RefSkeleton, Name);
            if (Chest.GetInt() == INDEX_NONE) continue;
            FTransform ChestNow = Component.GetComponentSpaceTransform(Chest);
            ChestNow.SetRotation((Half * ChestNow.GetRotation()).GetNormalized());
            Component.SetComponentSpaceTransform(Chest, ChestNow);
        }
    }
    if (Layer.bHoldHands)
    {
        const FVector Follow = OffsetBase - MeshToWorld.InverseTransformVector(Layer.HandsStayCm) - Up * Drop;
        for (int32 Side = 0; Side < 2; ++Side)
        {
            if (Arm[Side][2].GetInt() == INDEX_NONE || Arm[Side][1].GetInt() == INDEX_NONE || Arm[Side][0].GetInt() == INDEX_NONE) continue;
            FTransform Upper = Component.GetComponentSpaceTransform(Arm[Side][0]);
            FTransform Elbow = Component.GetComponentSpaceTransform(Arm[Side][1]);
            FTransform Hand = Component.GetComponentSpaceTransform(Arm[Side][2]);
            const FVector Grip = GripBefore[Side].GetTranslation() + Follow;
            AnimationCore::SolveTwoBoneIK(Upper, Elbow, Hand, ElbowBefore[Side].GetTranslation() + Follow, Grip, false, 1.0, 1.0);
            Hand.SetRotation(GripBefore[Side].GetRotation());
            Component.SetComponentSpaceTransform(Arm[Side][0], Upper);
            Component.SetComponentSpaceTransform(Arm[Side][1], Elbow);
            Component.SetComponentSpaceTransform(Arm[Side][2], Hand);
            Result.HandHoldErrorCm[Side] = FVector::Distance(Hand.GetTranslation(), Grip) * WorldScale;
        }
    }
    FCSPose<FCompactPose>::ConvertComponentPosesToLocalPosesSafe(Component, Output.Pose);
    Result.bApplied = true;
    return true;
}
}
