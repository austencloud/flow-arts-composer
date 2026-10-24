#include "FlowFestActivityPose.h"

#include "Animation/AnimNodeBase.h"
#include "Animation/Skeleton.h"
#include "BonePose.h"
#include "TwoBoneIK.h"

namespace
{
float Ease(float Value)
{
    const float T = FMath::Clamp(Value, 0.f, 1.f);
    return T * T * (3.f - 2.f * T);
}

FCompactPoseBoneIndex Bone(const FBoneContainer& Bones, FName Name)
{
    const USkeleton* Skeleton = Bones.GetSkeletonAsset();
    if (!Skeleton) return FCompactPoseBoneIndex(INDEX_NONE);
    const int32 SkeletonIndex = Skeleton->GetReferenceSkeleton().FindBoneIndex(Name);
    return SkeletonIndex == INDEX_NONE ? FCompactPoseBoneIndex(INDEX_NONE)
        : Bones.GetCompactPoseIndexFromSkeletonIndex(SkeletonIndex);
}

bool Has(const FCompactPoseBoneIndex Index)
{
    return Index.GetInt() != INDEX_NONE;
}

void GatherSubtree(FCSPose<FCompactPose>& Pose, const FBoneContainer& Bones,
    int32 Root, bool bIncludeRoot, TArray<FCompactPoseBoneIndex>& Indices,
    TArray<FTransform>& Original)
{
    const USkeleton* Skeleton = Bones.GetSkeletonAsset();
    if (!Skeleton || Root == INDEX_NONE) return;
    const FReferenceSkeleton& Ref = Skeleton->GetReferenceSkeleton();
    for (int32 SkeletonIndex = Root; SkeletonIndex < Ref.GetNum(); ++SkeletonIndex)
    {
        int32 Ancestor = SkeletonIndex;
        while (Ancestor != INDEX_NONE && Ancestor != Root)
            Ancestor = Ref.GetParentIndex(Ancestor);
        if (Ancestor != Root || (!bIncludeRoot && SkeletonIndex == Root)) continue;
        const FCompactPoseBoneIndex Compact = Bones.GetCompactPoseIndexFromSkeletonIndex(SkeletonIndex);
        if (!Has(Compact)) continue;
        Indices.Add(Compact);
        Original.Add(Pose.GetComponentSpaceTransform(Compact));
    }
}

void Reach(FCSPose<FCompactPose>& Pose, const FBoneContainer& Bones,
    FName UpperName, FName MiddleName, FName EndName,
    const FVector& Goal, const FVector& BendToward, float Weight)
{
    const FCompactPoseBoneIndex Upper = Bone(Bones, UpperName);
    const FCompactPoseBoneIndex Middle = Bone(Bones, MiddleName);
    const FCompactPoseBoneIndex End = Bone(Bones, EndName);
    if (!Has(Upper) || !Has(Middle) || !Has(End) || Weight <= .001f) return;
    FTransform UpperXf = Pose.GetComponentSpaceTransform(Upper);
    FTransform MiddleXf = Pose.GetComponentSpaceTransform(Middle);
    FTransform EndXf = Pose.GetComponentSpaceTransform(End);
    const FTransform OldEnd = EndXf;
    TArray<FCompactPoseBoneIndex> Children;
    TArray<FTransform> OldChildren;
    if (const USkeleton* Skeleton = Bones.GetSkeletonAsset())
        GatherSubtree(Pose, Bones, Skeleton->GetReferenceSkeleton().FindBoneIndex(EndName),
            false, Children, OldChildren);
    const FVector Effector = FMath::Lerp(EndXf.GetLocation(), Goal, Weight);
    const FVector JointTarget = MiddleXf.GetLocation() + BendToward * Weight;
    AnimationCore::SolveTwoBoneIK(UpperXf, MiddleXf, EndXf,
        JointTarget, Effector, false, 1.0, 1.0);
    Pose.SetComponentSpaceTransform(Upper, UpperXf);
    Pose.SetComponentSpaceTransform(Middle, MiddleXf);
    Pose.SetComponentSpaceTransform(End, EndXf);
    // Keep toes and fingers attached to their solved foot/hand. FCSPose caches
    // component transforms, so simply changing End would otherwise stretch them.
    for (int32 Index = 0; Index < Children.Num(); ++Index)
        Pose.SetComponentSpaceTransform(Children[Index],
            OldChildren[Index].GetRelativeTransform(OldEnd) * EndXf);
}

void RotateHand(FCSPose<FCompactPose>& Pose, const FBoneContainer& Bones,
    FName HandName, const FQuat& Desired, float Weight)
{
    const FCompactPoseBoneIndex Hand = Bone(Bones, HandName);
    if (!Has(Hand) || Weight <= .001f) return;
    const FVector Pivot = Pose.GetComponentSpaceTransform(Hand).GetLocation();
    const FQuat Rotation = FQuat::Slerp(FQuat::Identity, Desired, FMath::Clamp(Weight, 0.f, 1.f)).GetNormalized();
    const USkeleton* Skeleton = Bones.GetSkeletonAsset();
    if (!Skeleton) return;
    TArray<FCompactPoseBoneIndex> Indices;
    TArray<FTransform> Original;
    GatherSubtree(Pose, Bones, Skeleton->GetReferenceSkeleton().FindBoneIndex(HandName),
        true, Indices, Original);
    for (int32 Index = 0; Index < Indices.Num(); ++Index)
    {
        FTransform Xf = Original[Index];
        Xf.SetLocation(Pivot + Rotation.RotateVector(Xf.GetLocation() - Pivot));
        Xf.SetRotation(Rotation * Xf.GetRotation());
        Pose.SetComponentSpaceTransform(Indices[Index], Xf);
    }
}

void AimFingerAt(FCSPose<FCompactPose>& Pose, const FBoneContainer& Bones,
    FName HandName, FName FingerTipName, const FVector& Contact, float Weight)
{
    const FCompactPoseBoneIndex Hand = Bone(Bones, HandName);
    const FCompactPoseBoneIndex FingerTip = Bone(Bones, FingerTipName);
    if (!Has(Hand) || !Has(FingerTip) || Weight <= .001f) return;
    const FVector Pivot = Pose.GetComponentSpaceTransform(Hand).GetLocation();
    const FVector Finger = Pose.GetComponentSpaceTransform(FingerTip).GetLocation() - Pivot;
    const FVector TowardContact = Contact - Pivot;
    if (Finger.IsNearlyZero() || TowardContact.IsNearlyZero()) return;
    RotateHand(Pose, Bones, HandName,
        FQuat::FindBetweenNormals(Finger.GetSafeNormal(), TowardContact.GetSafeNormal()), Weight);
}

void LevelBowlFinger(FCSPose<FCompactPose>& Pose, const FBoneContainer& Bones,
    FName FirstName, FName SecondName, FName ThirdName, FName TipName, float Weight,
    const FVector& LevelDirection = FVector::ZeroVector)
{
    const FName Names[] = { FirstName, SecondName, ThirdName, TipName };
    FCompactPoseBoneIndex Joints[4];
    for (int32 Index = 0; Index < 4; ++Index)
        Joints[Index] = Bone(Bones, Names[Index]);
    if (!Has(Joints[0]) || !Has(Joints[1]) || !Has(Joints[2])) return;
    // Some rigs end at joint 3; keep the same palm support on those hands.
    const int32 JointCount = Has(Joints[3]) ? 4 : 3;
    FVector AlongPalm = LevelDirection.IsNearlyZero()
        ? Pose.GetComponentSpaceTransform(Joints[1]).GetLocation()
            - Pose.GetComponentSpaceTransform(Joints[0]).GetLocation()
        : LevelDirection;
    if (LevelDirection.IsNearlyZero()) AlongPalm.Z = 0.f;
    if (!AlongPalm.Normalize()) return;
    const USkeleton* Skeleton = Bones.GetSkeletonAsset();
    if (!Skeleton) return;
    for (int32 Segment = 0; Segment < JointCount - 1; ++Segment)
    {
        const FVector Pivot = Pose.GetComponentSpaceTransform(Joints[Segment]).GetLocation();
        const FVector Current = Pose.GetComponentSpaceTransform(Joints[Segment + 1]).GetLocation() - Pivot;
        if (Current.IsNearlyZero()) continue;
        // A little downturn at the distal joint cups the far edge of the bowl.
        const FVector Desired = (AlongPalm - FVector::ZAxisVector
            * (Segment == JointCount - 2 ? .12f : 0.f)).GetSafeNormal();
        const FQuat Rotation = FQuat::Slerp(FQuat::Identity,
            FQuat::FindBetweenNormals(Current.GetSafeNormal(), Desired), Weight).GetNormalized();
        TArray<FCompactPoseBoneIndex> Indices;
        TArray<FTransform> Original;
        GatherSubtree(Pose, Bones, Skeleton->GetReferenceSkeleton().FindBoneIndex(Names[Segment]),
            true, Indices, Original);
        for (int32 Index = 0; Index < Indices.Num(); ++Index)
        {
            FTransform Xf = Original[Index];
            Xf.SetLocation(Pivot + Rotation.RotateVector(Xf.GetLocation() - Pivot));
            Xf.SetRotation(Rotation * Xf.GetRotation());
            Pose.SetComponentSpaceTransform(Indices[Index], Xf);
        }
    }
}

void SupportBowl(FCSPose<FCompactPose>& Pose, const FBoneContainer& Bones,
    const FVector& Forward, const FVector& Up, float Weight)
{
    const FCompactPoseBoneIndex Wrist = Bone(Bones, TEXT("LeftHand"));
    const FCompactPoseBoneIndex Middle = Bone(Bones, TEXT("LeftHandMiddle1"));
    const FCompactPoseBoneIndex Index = Bone(Bones, TEXT("LeftHandIndex1"));
    const FCompactPoseBoneIndex Pinky = Bone(Bones, TEXT("LeftHandPinky1"));
    if (!Has(Wrist) || !Has(Middle) || !Has(Index) || !Has(Pinky) || Weight <= .001f) return;
    const FVector Finger = (Pose.GetComponentSpaceTransform(Middle).GetLocation()
        - Pose.GetComponentSpaceTransform(Wrist).GetLocation()).GetSafeNormal();
    const FVector Across = Pose.GetComponentSpaceTransform(Index).GetLocation()
        - Pose.GetComponentSpaceTransform(Pinky).GetLocation();
    const FVector PalmNormal = FVector::CrossProduct(Finger, Across).GetSafeNormal();
    if (Finger.IsNearlyZero() || PalmNormal.IsNearlyZero()) return;
    const FQuat PointForward = FQuat::FindBetweenNormals(Finger, Forward);
    const FVector RotatedPalm = PointForward.RotateVector(PalmNormal);
    const FQuat PalmUp = FQuat::FindBetweenNormals(RotatedPalm, Up);
    RotateHand(Pose, Bones, TEXT("LeftHand"), PalmUp * PointForward, Weight);
    LevelBowlFinger(Pose, Bones, TEXT("LeftHandIndex1"), TEXT("LeftHandIndex2"),
        TEXT("LeftHandIndex3"), TEXT("LeftHandIndex4"), Weight);
    LevelBowlFinger(Pose, Bones, TEXT("LeftHandMiddle1"), TEXT("LeftHandMiddle2"),
        TEXT("LeftHandMiddle3"), TEXT("LeftHandMiddle4"), Weight);
    LevelBowlFinger(Pose, Bones, TEXT("LeftHandRing1"), TEXT("LeftHandRing2"),
        TEXT("LeftHandRing3"), TEXT("LeftHandRing4"), Weight);
    LevelBowlFinger(Pose, Bones, TEXT("LeftHandPinky1"), TEXT("LeftHandPinky2"),
        TEXT("LeftHandPinky3"), TEXT("LeftHandPinky4"), Weight);
}

void RestPalmOnThigh(FCSPose<FCompactPose>& Pose, const FBoneContainer& Bones,
    FName HandName, FName MiddleName, FName IndexName, FName PinkyName,
    const FVector& FingerDirection, const FVector& PalmDown, float Weight)
{
    const FCompactPoseBoneIndex Hand = Bone(Bones, HandName);
    const FCompactPoseBoneIndex Middle = Bone(Bones, MiddleName);
    const FCompactPoseBoneIndex Index = Bone(Bones, IndexName);
    const FCompactPoseBoneIndex Pinky = Bone(Bones, PinkyName);
    if (!Has(Hand) || !Has(Middle) || !Has(Index) || !Has(Pinky) || Weight <= .001f) return;
    const FVector Finger = (Pose.GetComponentSpaceTransform(Middle).GetLocation()
        - Pose.GetComponentSpaceTransform(Hand).GetLocation()).GetSafeNormal();
    const FVector Across = Pose.GetComponentSpaceTransform(Index).GetLocation()
        - Pose.GetComponentSpaceTransform(Pinky).GetLocation();
    const FVector PalmNormal = FVector::CrossProduct(Finger, Across).GetSafeNormal();
    if (Finger.IsNearlyZero() || PalmNormal.IsNearlyZero()) return;
    const FQuat PointForward = FQuat::FindBetweenNormals(Finger, FingerDirection);
    const FQuat PointPalmDown = FQuat::FindBetweenNormals(
        PointForward.RotateVector(PalmNormal), PalmDown);
    RotateHand(Pose, Bones, HandName, PointPalmDown * PointForward, Weight);
}

void MoveSubtree(FCSPose<FCompactPose>& Pose, const FBoneContainer& Bones,
    FName RootName, const FVector& Delta)
{
    const USkeleton* Skeleton = Bones.GetSkeletonAsset();
    if (!Skeleton) return;
    const int32 Root = Skeleton->GetReferenceSkeleton().FindBoneIndex(RootName);
    if (Root == INDEX_NONE) return;
    TArray<FCompactPoseBoneIndex> Indices;
    TArray<FTransform> Original;
    GatherSubtree(Pose, Bones, Root, true, Indices, Original);
    // Cache the entire hierarchy before writing its parent. FCSPose lazily
    // derives uncached children from the parent, which would double the move.
    for (int32 Index = 0; Index < Indices.Num(); ++Index)
    {
        FTransform Transform = Original[Index];
        Transform.AddToTranslation(Delta);
        Pose.SetComponentSpaceTransform(Indices[Index], Transform);
    }
}
}

float FFlowFestActivityPose::SeatedWeight(const FFlowFestActivityPoseRequest& Request)
{
    if (Request.Activity != EFlowFestBodyActivity::FloorRest) return 0.f;
    const float Descend = Ease(Request.ElapsedSeconds / RestDescentSeconds);
    const float Rise = Request.ExitSecondsRemaining < 0.f ? 1.f
        : Ease(Request.ExitSecondsRemaining / RestRiseSeconds);
    return FMath::Clamp(Request.Weight, 0.f, 1.f) * FMath::Min(Descend, Rise);
}

float FFlowFestActivityPose::BiteWeight(float ElapsedSeconds)
{
    const float Phase = FMath::Fmod(FMath::Max(0.f, ElapsedSeconds), EatCycleSeconds);
    // Scoop, bring to mouth, hold for a bite, then return to the bowl.
    if (Phase < 1.0f) return 0.f;
    if (Phase < 1.9f) return Ease((Phase - 1.0f) / .9f);
    if (Phase < 2.6f) return 1.f;
    if (Phase < 3.5f) return 1.f - Ease((Phase - 2.6f) / .9f);
    return 0.f;
}

void FFlowFestActivityPose::Apply(FPoseContext& Output, const FFlowFestActivityPoseRequest& Request)
{
    if (Request.Activity == EFlowFestBodyActivity::None || Request.Weight <= .001f) return;
    const FBoneContainer& Bones = Output.Pose.GetBoneContainer();
    const FCompactPoseBoneIndex Hips = Bone(Bones, TEXT("Hips"));
    const FCompactPoseBoneIndex Head = Bone(Bones, TEXT("Head"));
    const FCompactPoseBoneIndex LeftFoot = Bone(Bones, TEXT("LeftFoot"));
    const FCompactPoseBoneIndex RightFoot = Bone(Bones, TEXT("RightFoot"));
    const FCompactPoseBoneIndex LeftKneeBone = Bone(Bones, TEXT("LeftLeg"));
    const FCompactPoseBoneIndex RightKneeBone = Bone(Bones, TEXT("RightLeg"));
    if (!Has(Hips) || !Has(LeftFoot) || !Has(RightFoot)) return;
    if (Request.Activity == EFlowFestBodyActivity::FloorRest &&
        (!Has(LeftKneeBone) || !Has(RightKneeBone))) return;

    FCSPose<FCompactPose> Pose;
    Pose.InitPose(Output.Pose);
    const FVector OriginalLeftFoot = Pose.GetComponentSpaceTransform(LeftFoot).GetLocation();
    const FVector OriginalRightFoot = Pose.GetComponentSpaceTransform(RightFoot).GetLocation();
    FTransform Pelvis = Pose.GetComponentSpaceTransform(Hips);
    const float LegHeight = Pelvis.GetLocation().Z - FMath::Min(OriginalLeftFoot.Z, OriginalRightFoot.Z);
    if (LegHeight <= 1.f) return;
    const float BodyScale = FMath::Clamp(LegHeight / 90.f, .55f, 1.65f);
    const FVector Forward = FVector::YAxisVector;
    const FVector Up = FVector::ZAxisVector;
    const FVector Side = FVector::XAxisVector;
    const float W = FMath::Clamp(Request.Weight, 0.f, 1.f);
    const float Seat = SeatedWeight(Request);
    if (Seat > .001f)
    {
        // Move the entire body subtree; moving Hips alone leaves every child
        // cached in standing component space and only stretches the spine.
        // The hips settle close to ground while the feet slide forward into
        // a seated V, with knees bent above the thighs.
        // The joint remains above the ground while the underside of the
        // pelvis skin settles at the planted sole level.
        const float Drop = LegHeight * .91f * Seat;
        MoveSubtree(Pose, Bones, TEXT("Hips"), -Up * Drop - Forward * 13.f * BodyScale * Seat);
        Pelvis = Pose.GetComponentSpaceTransform(Hips);
        const FVector LeftKnee = Pose.GetComponentSpaceTransform(LeftKneeBone).GetLocation();
        const FVector RightKnee = Pose.GetComponentSpaceTransform(RightKneeBone).GetLocation();
        const FVector LeftKneeSeat = Pelvis.GetLocation() + Forward * 35.f * BodyScale
            + Side * 17.f * BodyScale + Up * 12.f * BodyScale;
        const FVector RightKneeSeat = Pelvis.GetLocation() + Forward * 35.f * BodyScale
            - Side * 17.f * BodyScale + Up * 12.f * BodyScale;
        Reach(Pose, Bones, TEXT("LeftUpLeg"), TEXT("LeftLeg"), TEXT("LeftFoot"),
            OriginalLeftFoot + Forward * 47.f * BodyScale * Seat + Side * 4.f * BodyScale * Seat,
            (LeftKneeSeat - LeftKnee) * Seat, 1.f);
        Reach(Pose, Bones, TEXT("RightUpLeg"), TEXT("RightLeg"), TEXT("RightFoot"),
            OriginalRightFoot + Forward * 47.f * BodyScale * Seat - Side * 4.f * BodyScale * Seat,
            (RightKneeSeat - RightKnee) * Seat, 1.f);
    }

    Pelvis = Pose.GetComponentSpaceTransform(Hips);
    const FVector Center = Pelvis.GetLocation();
    if (Request.Activity == EFlowFestBodyActivity::FloorRest)
    {
        // Follow each thigh as the leg IK settles, so the wrists and palms
        // stay over the thighs on rigs with different hip and knee spacing.
        const float KneeMidHeight = .5f * (
            Pose.GetComponentSpaceTransform(LeftKneeBone).GetLocation().Z +
            Pose.GetComponentSpaceTransform(RightKneeBone).GetLocation().Z);
        const FVector RestFinger = (Forward + Up * .36f).GetSafeNormal();
        const FVector RestPalmDown = (Forward * .36f - Up).GetSafeNormal();
        const auto RestArm = [&](FName UpperLegName, FName KneeName,
            FName ArmName, FName ElbowName, FName HandName,
            FName MiddleName, FName IndexName, FName PinkyName, float Sign)
        {
            const FCompactPoseBoneIndex UpperLeg = Bone(Bones, UpperLegName);
            const FCompactPoseBoneIndex Knee = Bone(Bones, KneeName);
            if (!Has(UpperLeg) || !Has(Knee)) return;
            const FVector Hip = Pose.GetComponentSpaceTransform(UpperLeg).GetLocation();
            const FVector KneePosition = Pose.GetComponentSpaceTransform(Knee).GetLocation();
            const float ThighLength = FVector::Distance(Hip, KneePosition);
            // The thick upper surface is above the thigh joint line. Follow
            // an uneven knee rise so both palms clear the actual raised leg.
            const FVector Goal = FMath::Lerp(Hip, KneePosition, .55f)
                + Up * (.44f * ThighLength
                    + .5f * (KneePosition.Z - KneeMidHeight));
            Reach(Pose, Bones, ArmName, ElbowName, HandName, Goal,
                Side * Sign * 9.f * BodyScale, Seat);
            RestPalmOnThigh(Pose, Bones, HandName, MiddleName, IndexName,
                PinkyName, RestFinger, RestPalmDown, Seat);
            const FString Prefix = HandName.ToString();
            for (const TCHAR* Finger : { TEXT("Index"), TEXT("Middle"),
                TEXT("Ring"), TEXT("Pinky") })
            {
                const FString Base = Prefix + Finger;
                LevelBowlFinger(Pose, Bones, FName(*(Base + TEXT("1"))),
                    FName(*(Base + TEXT("2"))), FName(*(Base + TEXT("3"))),
                    FName(*(Base + TEXT("4"))), Seat, RestFinger);
            }
        };
        RestArm(TEXT("LeftUpLeg"), TEXT("LeftLeg"), TEXT("LeftArm"),
            TEXT("LeftForeArm"), TEXT("LeftHand"), TEXT("LeftHandMiddle1"),
            TEXT("LeftHandIndex1"), TEXT("LeftHandPinky1"), 1.f);
        RestArm(TEXT("RightUpLeg"), TEXT("RightLeg"), TEXT("RightArm"),
            TEXT("RightForeArm"), TEXT("RightHand"), TEXT("RightHandMiddle1"),
            TEXT("RightHandIndex1"), TEXT("RightHandPinky1"), -1.f);
    }
    else if (Request.Activity == EFlowFestBodyActivity::Carry)
    {
        // Size the carrying space from the arms rather than leg height. Wider
        // shoulders and shorter arms need their own lateral room; a fixed hip
        // offset pulled those elbows against the torso on otherwise valid rigs.
        const auto CarryArm = [&](FName UpperName, FName ElbowName, FName HandName, float Sign)
        {
            const FCompactPoseBoneIndex Upper = Bone(Bones, UpperName);
            const FCompactPoseBoneIndex Elbow = Bone(Bones, ElbowName);
            const FCompactPoseBoneIndex Hand = Bone(Bones, HandName);
            if (!Has(Upper) || !Has(Elbow) || !Has(Hand)) return;
            const FVector ShoulderPosition = Pose.GetComponentSpaceTransform(Upper).GetLocation();
            const FVector ElbowPosition = Pose.GetComponentSpaceTransform(Elbow).GetLocation();
            const FVector HandPosition = Pose.GetComponentSpaceTransform(Hand).GetLocation();
            const float UpperLength = FVector::Distance(ShoulderPosition, ElbowPosition);
            const float ArmLength = UpperLength + FVector::Distance(ElbowPosition, HandPosition);
            if (UpperLength <= 1.f || ArmLength <= 2.f) return;
            const float ShoulderOffset = FMath::Max(0.f,
                FVector::DotProduct(ShoulderPosition - Center, Side) * Sign);
            const FVector Goal = Center + Forward * (.30f * ArmLength)
                + Side * Sign * (ShoulderOffset + .22f * ArmLength)
                + Up * (.05f * ArmLength);
            // A relaxed outward bend keeps the upper arm off the shirt while
            // the forearm descends to the grip beside and ahead of the hip.
            const FVector Pole = ShoulderPosition + Forward * (.24f * UpperLength)
                + Side * Sign * (.25f * UpperLength) - Up * (.85f * UpperLength);
            Reach(Pose, Bones, UpperName, ElbowName, HandName, Goal, Pole - ElbowPosition, W);
            // Natural attachments map the prop shaft to the palm's transverse
            // axis. Control that axis here instead of inheriting idle wrist roll.
            const FString HandPrefix = HandName.ToString();
            const FCompactPoseBoneIndex Middle = Bone(Bones, FName(*(HandPrefix + TEXT("Middle1"))));
            const FCompactPoseBoneIndex Index = Bone(Bones, FName(*(HandPrefix + TEXT("Index1"))));
            const FCompactPoseBoneIndex Pinky = Bone(Bones, FName(*(HandPrefix + TEXT("Pinky1"))));
            if (!Has(Middle) || !Has(Index) || !Has(Pinky)) return;
            const FVector Along = (Pose.GetComponentSpaceTransform(Middle).GetLocation()
                - Pose.GetComponentSpaceTransform(Hand).GetLocation()).GetSafeNormal();
            FVector Across = Pose.GetComponentSpaceTransform(Index).GetLocation()
                - Pose.GetComponentSpaceTransform(Pinky).GetLocation();
            Across -= Along * FVector::DotProduct(Across, Along);
            if (Along.IsNearlyZero() || !Across.Normalize()) return;
            // Fix both axes of the hand frame. Choosing the nearest sign of
            // Up flips the grip by half a turn when gait moves Across through
            // horizontal, while the shaft remains rigidly attached to it.
            const FVector CarryFinger = (Forward * .96f - Side * Sign * .28f).GetSafeNormal();
            const FQuat PointFinger = FQuat::FindBetweenNormals(Along, CarryFinger);
            const FVector TurnedAcross = PointFinger.RotateVector(Across);
            const float Roll = FMath::Atan2(
                FVector::DotProduct(CarryFinger, FVector::CrossProduct(TurnedAcross, Up)),
                FVector::DotProduct(TurnedAcross, Up));
            const FQuat StandShaft(CarryFinger, Roll);
            RotateHand(Pose, Bones, HandName, StandShaft * PointFinger, W);
        };
        CarryArm(TEXT("LeftArm"), TEXT("LeftForeArm"), TEXT("LeftHand"), 1.f);
        CarryArm(TEXT("RightArm"), TEXT("RightForeArm"), TEXT("RightHand"), -1.f);
    }
    else if (Request.Activity == EFlowFestBodyActivity::Eat)
    {
        // Keep the bowl near the midline so the scooping arm need not cross
        // the chest from the opposite shoulder.
        const FVector Bowl = Center + Forward * 33.f * BodyScale + Side * 7.f * BodyScale + Up * 24.f * BodyScale;
        // The imported Head joint is close to the jaw/ear line. A point above
        // it reaches the eyes; a small downward offset reaches the mouth.
        const FVector Mouth = Has(Head) ? Pose.GetComponentSpaceTransform(Head).GetLocation()
            + Forward * 11.f * BodyScale - Up * 2.f * BodyScale
            : Center + Forward * 15.f * BodyScale + Up * 68.f * BodyScale;
        const float Bite = BiteWeight(Request.ElapsedSeconds);
        const FCompactPoseBoneIndex LeftHand = Bone(Bones, TEXT("LeftHand"));
        const FCompactPoseBoneIndex BowlPalm = Bone(Bones, TEXT("LeftHandMiddle1"));
        const float PalmLength = Has(LeftHand) && Has(BowlPalm)
            ? FVector::Distance(Pose.GetComponentSpaceTransform(LeftHand).GetLocation(),
                Pose.GetComponentSpaceTransform(BowlPalm).GetLocation())
            : 10.f * BodyScale;
        const FCompactPoseBoneIndex LeftElbow = Bone(Bones, TEXT("LeftForeArm"));
        const FCompactPoseBoneIndex LeftShoulder = Bone(Bones, TEXT("LeftArm"));
        // Leave room for the upper-arm skin beside the rib cage while keeping
        // the elbow below its shoulder. The wrist still supports the same bowl.
        const FVector LeftBend = Has(LeftElbow) && Has(LeftShoulder)
            ? Pose.GetComponentSpaceTransform(LeftShoulder).GetLocation()
                + Forward * 8.f * BodyScale + Side * 22.f * BodyScale
                - Up * 23.f * BodyScale
                - Pose.GetComponentSpaceTransform(LeftElbow).GetLocation()
            : Side * 13.f * BodyScale;
        Reach(Pose, Bones, TEXT("LeftArm"), TEXT("LeftForeArm"), TEXT("LeftHand"),
            Bowl - Forward * PalmLength, LeftBend, W);
        SupportBowl(Pose, Bones, Forward, Up, W);
        const FCompactPoseBoneIndex RightHand = Bone(Bones, TEXT("RightHand"));
        const FCompactPoseBoneIndex BiteTip = Bone(Bones, TEXT("RightHandIndex3"));
        const FVector BowlContact = Has(BowlPalm)
            ? Pose.GetComponentSpaceTransform(BowlPalm).GetLocation()
            : Bowl - Up * 10.f * BodyScale;
        const FVector Finger = Has(RightHand) && Has(BiteTip)
            ? Pose.GetComponentSpaceTransform(BiteTip).GetLocation()
                - Pose.GetComponentSpaceTransform(RightHand).GetLocation()
            : -Up * 14.f * BodyScale;
        // The food sits above the bowl center: 2 cm attachment lift, 2.8 cm
        // food center offset, and about 2 cm food radius. Touch its upper
        // surface rather than passing the fingertip through the bowl.
        const FVector ScoopContact = BowlContact + Up * 6.9f;
        // Reach across the near rim from a wrist on the eater's right. A
        // mostly forward finger left that wrist on the far side of the bowl
        // and forced the elbow upward beside the face.
        const FVector ScoopFinger = (Forward * .45f + Side * .8f - Up * .4f).GetSafeNormal() * Finger.Size();
        const FVector ScoopWrist = ScoopContact - ScoopFinger;
        // Approach from the eater's right, in front of and below the mouth.
        // This keeps the forearm outside the chest while the fingertip still
        // lands on the authored bite point.
        const FVector BiteFinger = (-Forward * .4f + Side * .55f + Up * .733f).GetSafeNormal() * Finger.Size();
        const FVector BiteWrist = Mouth - BiteFinger;
        const FCompactPoseBoneIndex RightElbow = Bone(Bones, TEXT("RightForeArm"));
        const FCompactPoseBoneIndex RightShoulder = Bone(Bones, TEXT("RightArm"));
        const FVector RightBend = Has(RightElbow) && Has(RightShoulder)
            ? Pose.GetComponentSpaceTransform(RightShoulder).GetLocation()
                + Forward * 9.f * BodyScale - Side * 22.f * BodyScale
                - Up * 23.f * BodyScale
                - Pose.GetComponentSpaceTransform(RightElbow).GetLocation()
            : -Side * 13.f * BodyScale;
        Reach(Pose, Bones, TEXT("RightArm"), TEXT("RightForeArm"), TEXT("RightHand"),
            FMath::Lerp(ScoopWrist, BiteWrist, Bite),
            RightBend, W);
        AimFingerAt(Pose, Bones, TEXT("RightHand"), TEXT("RightHandIndex3"),
            FMath::Lerp(ScoopContact, Mouth, Bite), W);
    }
    FCSPose<FCompactPose>::ConvertComponentPosesToLocalPosesSafe(Pose, Output.Pose);
}
