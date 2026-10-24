#include "FlowFestStancePlan.h"

bool FFlowFestStancePlan::InitializeGroundedSupport(const FFlowFestStancePose& Pose,
    const TArray<FVector> (&FootSurfaces)[2], double MaxAdjustmentCm, FString* Error)
{
    const auto Fail=[&](const FString& Reason)
    {
        if (Error) *Error=Reason;
        return false;
    };
    if (!Pose.IsValid() || !bGroundValidated || GroundOrigin.ContainsNaN() ||
        GroundNormal.ContainsNaN() || !FMath::IsNearlyEqual(GroundNormal.SizeSquared(),1.,1.e-4) ||
        GroundNormal.Z<.996 || !FMath::IsFinite(MaxAdjustmentCm) || MaxAdjustmentCm<=0. ||
        !FMath::IsFinite(GroundContactToleranceCm) || GroundContactToleranceCm<=0. ||
        MaxAdjustmentCm>2.5*GroundContactToleranceCm+1.e-6)
        return Fail(TEXT("Invalid measured grounding inputs"));

    FTransform Anchors[2];
    double Gaps[2], SoleOffsets[2];
    FVector Probes[2][TerrainProbeCount];
    for (int32 Side=0; Side<2; ++Side)
    {
        if (FootSurfaces[Side].IsEmpty()) return Fail(TEXT("Empty weighted foot surface"));
        const FTransform& Original=Pose.Components[Pose.End[Side]];
        double Extrema[TerrainProbeCount]={TNumericLimits<double>::Max(),-TNumericLimits<double>::Max(),
            TNumericLimits<double>::Max(),-TNumericLimits<double>::Max(),TNumericLimits<double>::Max()};
        for (const FVector& Surface : FootSurfaces[Side])
        {
            if (Surface.ContainsNaN()) return Fail(TEXT("Nonfinite weighted foot surface"));
            // These probes must stay in the captured foot frame. Recomputing them
            // against the lowered anchor would cancel the measured correction.
            const FVector Local=Original.InverseTransformPosition(Surface);
            const double Height=FVector::DotProduct(Surface-GroundOrigin,GroundNormal);
            if (Local.ContainsNaN() || !FMath::IsFinite(Height))
                return Fail(TEXT("Invalid weighted foot projection"));
            if (Local.X<Extrema[0]) { Extrema[0]=Local.X; Probes[Side][0]=Local; }
            if (Local.X>Extrema[1]) { Extrema[1]=Local.X; Probes[Side][1]=Local; }
            if (Local.Y<Extrema[2]) { Extrema[2]=Local.Y; Probes[Side][2]=Local; }
            if (Local.Y>Extrema[3]) { Extrema[3]=Local.Y; Probes[Side][3]=Local; }
            if (Height<Extrema[4]) { Extrema[4]=Height; Probes[Side][4]=Local; }
        }
        Gaps[Side]=Extrema[4];
        if (FMath::Abs(Gaps[Side])>MaxAdjustmentCm)
            return Fail(FString::Printf(TEXT("Foot %d needs %.6f cm grounding, beyond %.6f cm bound"),
                Side,Gaps[Side],MaxAdjustmentCm));
        Anchors[Side]=Original;
        Anchors[Side].AddToTranslation(-GroundNormal*Gaps[Side]);
        SoleOffsets[Side]=FVector::DotProduct(Anchors[Side].GetLocation()-GroundOrigin,GroundNormal);
        if (!FMath::IsFinite(SoleOffsets[Side]) || SoleOffsets[Side]<-.5 || SoleOffsets[Side]>25.)
            return Fail(TEXT("Grounded foot bone outside supported sole-offset range"));
    }
    // Move the hips with the more lowered foot, avoiding extra downward leg
    // reach. Unequal corrections still require exact IK and weighted-skin checks.
    const FVector BodyOffset=-GroundNormal*FMath::Max(Gaps[0],Gaps[1]);
    if (BodyOffset.ContainsNaN() || BodyOffset.Size()>MaxAdjustmentCm+1.e-6)
        return Fail(TEXT("Neutral grounding exceeds its measured bound"));
    for (int32 Side=0; Side<2; ++Side)
    {
        InitialFeet[Side]=Anchors[Side];
        FootSoleOffsetCm[Side]=SoleOffsets[Side];
        for (int32 Probe=0; Probe<TerrainProbeCount; ++Probe)
            FootTerrainProbesLocal[Side][Probe]=Probes[Side][Probe];
    }
    NeutralBodyOffsetCm=BodyOffset;
    bFootTerrainProbesValid=true;
    if (Error) Error->Reset();
    return true;
}
