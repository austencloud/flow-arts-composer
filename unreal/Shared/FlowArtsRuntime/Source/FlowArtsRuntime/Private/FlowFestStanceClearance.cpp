#include "FlowArtsArmClearance.h"

namespace
{
TArray<FFlowArtsClearanceCapsule> MapProps(const TArray<FFlowArtsClearanceCapsule>& Props,
    const FTransform& Frame)
{
    auto Result=Props;
    for (auto& Capsule : Result)
    {
        Capsule.Start=Frame.TransformPosition(Capsule.Start);
        Capsule.End=Frame.TransformPosition(Capsule.End);
    }
    return Result;
}
}

bool FFlowArtsArmClearancePreparationSnapshot::PlaceBody(const FTransform& BodyDelta,
    const FFlowArtsClearanceArm* PositionedArms, const TArray<FTransform>& PosedComponents,
    FFlowArtsArmClearancePreparationSnapshot& Out) const
{
    if (!bValid || !RebuildSkin || !PositionedArms || BodyDelta.ContainsNaN() ||
        !BodyDelta.GetScale3D().Equals(FVector::OneVector,1.e-8)) return false;
    for (int32 Side=0; Side<2; ++Side)
        if (PositionedArms[Side].Upper.ContainsNaN() || PositionedArms[Side].Elbow.ContainsNaN() ||
            PositionedArms[Side].Wrist.ContainsNaN() || PositionedArms[Side].Clavicle.ContainsNaN()) return false;
    auto Result=*this;
    auto& G=Result.Geometry;
    G.PreparedSeed=nullptr;
    const FQuat R=BodyDelta.GetRotation(), RI=R.Inverse();
    G.bHasPreparedHandTargets=true;
    for (int32 Side=0; Side<2; ++Side)
    {
        G.PreparedHandTargets[Side]=Geometry.Arms[Side].Wrist;
        G.Arms[Side]=PositionedArms[Side];
    }
    G.BodyCapsules=MapProps(G.BodyCapsules,BodyDelta);
    for (auto& Hull : G.TorsoHulls)
    {
        for (auto& Plane : Hull.Planes)
        {
            Plane.Normal=R.RotateVector(Plane.Normal);
            Plane.OffsetCm+=FVector::DotProduct(Plane.Normal,BodyDelta.GetTranslation());
        }
        for (auto& Vertex : Hull.Vertices) Vertex=BodyDelta.TransformPosition(Vertex);
        for (auto& Edge : Hull.EdgeDirections) Edge=R.RotateVector(Edge);
    }
    G.TorsoPivot=BodyDelta.TransformPosition(G.TorsoPivot);
    G.FixedHip=BodyDelta.TransformPosition(G.FixedHip);
    G.Neck=BodyDelta.TransformPosition(G.Neck);
    G.Head=BodyDelta.TransformPosition(G.Head);
    G.SourceTorsoRotation=(R*G.SourceTorsoRotation*RI).GetNormalized();
    G.SourceHeadRotation=(R*G.SourceHeadRotation).GetNormalized();
    G.AddedTorsoPitch=(R*G.AddedTorsoPitch*RI).GetNormalized();
    if (!RebuildSkin(PosedComponents,G)) return false;
    // Preparation snapshots intentionally have no mutable witness collectors or search objective.
    G.SnapshotSkinnedContacts=nullptr;
    G.EvaluateSkinnedContacts=nullptr;
    G.EvaluateSkinnedPropContacts=nullptr;
    Out=MoveTemp(Result);
    return true;
}
