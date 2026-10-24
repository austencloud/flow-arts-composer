#include "FlowArtsArmClearance.h"
#include "FlowArtsSkinnedClearance.h"

#include "Animation/AnimInstanceProxy.h"
#include "Animation/AnimNodeBase.h"
#include "BoneContainer.h"
#include "Animation/Skeleton.h"
#include "BonePose.h"
#include "Engine/SkeletalMesh.h"
#include "HAL/PlatformTime.h"
#include "ProfilingDebugging/CpuProfilerTrace.h"
#include "Rendering/SkeletalMeshRenderData.h"
#include "TwoBoneIK.h"
#include "Math/RotationMatrix.h"
#if WITH_DEV_AUTOMATION_TESTS
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Misc/AutomationTest.h"
#include "Misc/FileHelper.h"
#endif

DEFINE_LOG_CATEGORY_STATIC(LogFlowArtsClearance, Log, All);

namespace
{
constexpr int32 PoleSamples = 16;
constexpr float MaxGripErrorCm = 0.01f;

// Search constraints live for this SolvePose only. Surface pairs are evaluated
// against each trial's freshly skinned triangles; they are never certificates.
// Containment uses a local exit plane, which must expire at the next query.
struct FContactSearchConstraints
{
    TArray<FFlowArtsContactWitness> Active;
    void Update(TConstArrayView<FFlowArtsContactWitness> Current)
    {
        Active.RemoveAll([](const FFlowArtsContactWitness& W) { return W.bContainment || W.bOrientedSurface; });
        for (const auto& Contact : Current)
        {
            Active.RemoveAll([&](const FFlowArtsContactWitness& W) {
                return W.Side == Contact.Side && W.UpperTriangleIndex == Contact.UpperTriangleIndex &&
                    W.BodyTriangleIndex == Contact.BodyTriangleIndex && W.bClosedBody == Contact.bClosedBody;
            });
            Active.Add(Contact);
            if (Active.Num() > 32) Active.RemoveAt(0);
        }
    }
};

// Timings are opt-in, inclusive phase totals; normal gameplay does not read the clock.
struct FScopedClearancePhaseTimer
{
    double* Milliseconds;
    double Start;
    explicit FScopedClearancePhaseTimer(double* InMilliseconds)
        : Milliseconds(InMilliseconds), Start(InMilliseconds ? FPlatformTime::Seconds() : 0.) {}
    ~FScopedClearancePhaseTimer()
    { if (Milliseconds) *Milliseconds += (FPlatformTime::Seconds() - Start) * 1000.; }
};

struct FClearancePhaseTiming
{
    bool bEnabled = UE_LOG_ACTIVE(LogFlowArtsClearance, VeryVerbose);
    double Start = bEnabled ? FPlatformTime::Seconds() : 0.;
    double ConsiderMs = 0., RefineMs = 0., CertificateMs = 0., WitnessMs = 0.;
    int32 ConsiderCount = 0, CertificateCount = 0, WitnessCount = 0;
    ~FClearancePhaseTiming()
    {
        if (bEnabled) UE_LOG(LogFlowArtsClearance, VeryVerbose,
            TEXT("PhaseTiming total=%.3fms consider=%.3fms/%d refine=%.3fms certificate=%.3fms/%d witness=%.3fms/%d (inclusive)"),
            (FPlatformTime::Seconds() - Start) * 1000., ConsiderMs, ConsiderCount,
            RefineMs, CertificateMs, CertificateCount, WitnessMs, WitnessCount);
    }
};

struct FContact
{
    int32 Arm = INDEX_NONE;
    int32 Segment = INDEX_NONE;
    int32 Kind = INDEX_NONE;
    int32 Index = INDEX_NONE;
};

struct FArmCandidate
{
    FFlowArtsClearanceArm Arm;
    float BodyWorst = 0.f;
    float BodyTotal = 0.f;
    float NonUpperTorsoWorst = 0.f;
    float NonSkinnedWorst = 0.f;
    float OppositePropWorst = 0.f;
    float HeldPropBodyWorst = 0.f;
    FContact Contact;
    float AuthoredElbowMotionCm = 0.f;
    float PreviousElbowMotionCm = 0.f;
    float PoleDegrees = 0.f;
};

float SegmentDistanceSquared(const FVector& A, const FVector& B, const FVector& C, const FVector& D)
{
    // Closest points on two finite segments, including zero-length capsules.
    const FVector U = B - A;
    const FVector V = D - C;
    const FVector W = A - C;
    const float UU = FVector::DotProduct(U, U);
    const float VV = FVector::DotProduct(V, V);
    const float UV = FVector::DotProduct(U, V);
    const float UW = FVector::DotProduct(U, W);
    const float VW = FVector::DotProduct(V, W);
    if (UU < SMALL_NUMBER && VV < SMALL_NUMBER) return FVector::DistSquared(A, C);
    if (UU < SMALL_NUMBER)
        return FVector::DistSquared(A, C + V * FMath::Clamp(VW / VV, 0.f, 1.f));
    if (VV < SMALL_NUMBER)
        return FVector::DistSquared(A + U * FMath::Clamp(-UW / UU, 0.f, 1.f), C);

    float S = 0.f;
    float T = 0.f;
    const float Denominator = UU * VV - UV * UV;
    if (Denominator > SMALL_NUMBER)
        S = FMath::Clamp((UV * VW - VV * UW) / Denominator, 0.f, 1.f);
    T = FMath::Clamp((UV * S + VW) / VV, 0.f, 1.f);
    S = FMath::Clamp((UV * T - UW) / UU, 0.f, 1.f);
    return FVector::DistSquared(A + U * S, C + V * T);
}

FFlowArtsClearanceCapsule UpperCapsule(const FFlowArtsClearanceArm& Arm)
{
    const FVector Shoulder = Arm.Upper.GetLocation();
    const FVector Elbow = Arm.Elbow.GetLocation();
    // Other arms, props, and the head must see the entire upper arm.
    return {Shoulder, Elbow, Arm.UpperRadiusCm};
}

FFlowArtsClearanceCapsule ForearmCapsule(const FFlowArtsClearanceArm& Arm)
{
    return {Arm.Elbow.GetLocation(), Arm.Wrist.GetLocation(), Arm.ForearmRadiusCm};
}

FFlowArtsClearanceHull HullGeometry(const FFlowArtsClearanceHull& Hull)
{
    FFlowArtsClearanceHull Geometry;
    Geometry.Planes = Hull.Planes;
    // Half-space intersection runs at mesh measurement, never per arm pole.
    for (int32 I = 0; I < Hull.Planes.Num(); ++I)
    for (int32 J = I + 1; J < Hull.Planes.Num(); ++J)
    for (int32 K = J + 1; K < Hull.Planes.Num(); ++K)
    {
        const auto& A = Hull.Planes[I];
        const auto& B = Hull.Planes[J];
        const auto& C = Hull.Planes[K];
        const FVector BC = FVector::CrossProduct(B.Normal, C.Normal);
        const double Determinant = FVector::DotProduct(A.Normal, BC);
        if (FMath::Abs(Determinant) < 0.000001) continue;
        const FVector Point = (BC * A.OffsetCm +
            FVector::CrossProduct(C.Normal, A.Normal) * B.OffsetCm +
            FVector::CrossProduct(A.Normal, B.Normal) * C.OffsetCm) / Determinant;
        bool bInside = true;
        for (const auto& Plane : Hull.Planes)
            if (FVector::DotProduct(Plane.Normal, Point) > Plane.OffsetCm + 0.001)
            { bInside = false; break; }
        if (bInside && !Geometry.Vertices.ContainsByPredicate(
            [&](const FVector& Other) { return Other.Equals(Point, 0.001); }))
            Geometry.Vertices.Add(Point);
    }
    for (int32 I = 0; I < Hull.Planes.Num(); ++I)
    for (int32 J = I + 1; J < Hull.Planes.Num(); ++J)
    {
        const FVector Direction = FVector::CrossProduct(Hull.Planes[I].Normal,
            Hull.Planes[J].Normal).GetSafeNormal();
        if (Direction.IsNearlyZero()) continue;
        int32 SharedVertices = 0;
        for (const FVector& Point : Geometry.Vertices)
            if (FMath::Abs(FVector::DotProduct(Hull.Planes[I].Normal, Point) - Hull.Planes[I].OffsetCm) < 0.002 &&
                FMath::Abs(FVector::DotProduct(Hull.Planes[J].Normal, Point) - Hull.Planes[J].OffsetCm) < 0.002)
                ++SharedVertices;
        if (SharedVertices < 2) continue;
        if (!Geometry.EdgeDirections.ContainsByPredicate([&](const FVector& Other)
            { return FMath::Abs(FVector::DotProduct(Other, Direction)) > 0.999999; }))
            Geometry.EdgeDirections.Add(Direction);
    }
    return Geometry;
}

struct FClearanceBox
{
    FVector Center;
    FVector HalfEdges[3];
    float Depth = TNumericLimits<float>::Max();
};

struct FClearanceAxisSupport
{
    FVector Axis;
    double Min, Max;
};

struct FClearanceHullFaceSupports
{
    TArray<FVector> SourceNormals, SourceVertices;
    TArray<FClearanceAxisSupport> Faces;
    bool Matches(const FFlowArtsClearanceHull& Hull) const
    {
        if (SourceNormals.Num() != Hull.Planes.Num() || SourceVertices.Num() != Hull.Vertices.Num()) return false;
        for (int32 Index = 0; Index < SourceNormals.Num(); ++Index)
            if (SourceNormals[Index] != Hull.Planes[Index].Normal) return false;
        for (int32 Index = 0; Index < SourceVertices.Num(); ++Index)
            if (SourceVertices[Index] != Hull.Vertices[Index]) return false;
        return true;
    }
    void Update(const FFlowArtsClearanceHull& Hull)
    {
        if (Matches(Hull)) return;
        SourceVertices = Hull.Vertices;
        SourceNormals.Reset(Hull.Planes.Num());
        Faces.Reset(Hull.Planes.Num());
        for (const auto& Plane : Hull.Planes)
        {
            SourceNormals.Add(Plane.Normal);
            FClearanceAxisSupport Support;
            Support.Axis = Plane.Normal.GetSafeNormal();
            Support.Min = TNumericLimits<double>::Max(); Support.Max = -Support.Min;
            for (const FVector& Point : Hull.Vertices)
            {
                const double Projection = FVector::DotProduct(Support.Axis, Point);
                Support.Min = FMath::Min(Support.Min, Projection);
                Support.Max = FMath::Max(Support.Max, Projection);
            }
            Faces.Add(Support);
        }
    }
};

// Ranking planes and elbow poles share a torso. Exact geometry equality permits
// reuse across plane translations; changing even one vertex invalidates it.
struct FClearanceTorsoFaceSupports
{
    FClearanceHullFaceSupports Hulls[2];
    void Update(const FFlowArtsArmClearanceInput& Input)
    {
        for (int32 Index = 0; Index < FMath::Min(2, Input.TorsoHulls.Num()); ++Index)
            Hulls[Index].Update(Input.TorsoHulls[Index]);
    }
};

float BoxesHullDepth(TArray<FClearanceBox, TInlineAllocator<3>>& Boxes,
    const FFlowArtsClearanceHull& Hull, float PaddingCm, bool bRankFaceAxesOnly = false,
    const FClearanceHullFaceSupports* FaceSupports = nullptr)
{
    if (Boxes.IsEmpty() || Hull.Vertices.Num() < 4) return TNumericLimits<float>::Max();
    const float Padding = FMath::Max(0.f, PaddingCm);
    const FVector Edges[3] = {Boxes[0].HalfEdges[0].GetSafeNormal(),
        Boxes[0].HalfEdges[1].GetSafeNormal(), Boxes[0].HalfEdges[2].GetSafeNormal()};
    const auto CheckAxis = [&](const FVector& Direction, const FClearanceAxisSupport* Support = nullptr)
    {
        const FVector Axis = Support ? Support->Axis : Direction.GetSafeNormal();
        if (Axis.IsNearlyZero()) return;
        // All tapered slices share one arm rotation. Project the hull once per
        // axis, and use the exact box support function instead of eight corners.
        TArray<FVector2D, TInlineAllocator<3>> BoxIntervals;
        for (const auto& Box : Boxes)
        {
            const double Center = FVector::DotProduct(Axis, Box.Center);
            const double Radius = FMath::Abs(FVector::DotProduct(Axis, Box.HalfEdges[0]))
                + FMath::Abs(FVector::DotProduct(Axis, Box.HalfEdges[1]))
                + FMath::Abs(FVector::DotProduct(Axis, Box.HalfEdges[2]));
            BoxIntervals.Emplace(Center - Radius, Center + Radius);
        }
        double HullMin = TNumericLimits<double>::Max(), HullMax = -HullMin;
        if (Support) { HullMin = Support->Min; HullMax = Support->Max; }
        else for (const FVector& Point : Hull.Vertices)
        {
            const double Projection = FVector::DotProduct(Axis, Point);
            HullMin = FMath::Min(HullMin, Projection);
            HullMax = FMath::Max(HullMax, Projection);
            bool bCanImprove = false;
            for (int32 Index = 0; Index < Boxes.Num(); ++Index)
            {
                if (Boxes[Index].Depth <= 0.f) continue;
                const auto& Interval = BoxIntervals[Index];
                // Partial support intervals only expand as vertices are visited.
                // Once overlap exceeds the best depth for every live slice,
                // remaining vertices cannot make this axis improve the result.
                if (FMath::Min(Interval.Y - HullMin, HullMax - Interval.X)
                    + Padding < Boxes[Index].Depth)
                { bCanImprove = true; break; }
            }
            if (!bCanImprove) return;
        }
        for (int32 Index = 0; Index < Boxes.Num(); ++Index)
        {
            if (Boxes[Index].Depth <= 0.f) continue;
            const auto& Interval = BoxIntervals[Index];
            Boxes[Index].Depth = FMath::Min(Boxes[Index].Depth, static_cast<float>(
                FMath::Min(Interval.Y - HullMin, HullMax - Interval.X) + Padding));
        }
    };
    const auto AllSeparated = [&]()
    {
        for (const auto& Box : Boxes) if (Box.Depth > 0.f) return false;
        return true;
    };
    // Acceptance uses the complete SAT. The explicitly requested ranking
    // surrogate uses only hull face axes and never supplies a collision verdict.
    for (int32 Index = 0; Index < Hull.Planes.Num(); ++Index)
    {
        CheckAxis(Hull.Planes[Index].Normal, FaceSupports ? &FaceSupports->Faces[Index] : nullptr);
        if (AllSeparated()) return 0.f;
    }
    if (!bRankFaceAxesOnly)
    {
        for (int32 I = 0; I < 3; ++I)
        { CheckAxis(FVector::CrossProduct(Edges[(I + 1) % 3], Edges[(I + 2) % 3])); if (AllSeparated()) return 0.f; }
        for (const FVector& HullEdge : Hull.EdgeDirections)
            for (const FVector& BoxEdge : Edges)
            { CheckAxis(FVector::CrossProduct(HullEdge, BoxEdge)); if (AllSeparated()) return 0.f; }
    }
    float Depth = 0.f;
    for (const auto& Box : Boxes) Depth = FMath::Max(Depth, Box.Depth);
    return Depth;
}

FClearanceBox ClearanceBox(const FVector& Origin, const FVector& X, const FVector& Y, const FVector& Z)
{
    FClearanceBox Box;
    Box.HalfEdges[0] = (X - Origin) * .5;
    Box.HalfEdges[1] = (Y - Origin) * .5;
    Box.HalfEdges[2] = (Z - Origin) * .5;
    Box.Center = Origin + Box.HalfEdges[0] + Box.HalfEdges[1] + Box.HalfEdges[2];
    return Box;
}

float BoxHullDepth(const TArray<FVector>& Points, const FFlowArtsClearanceHull& Geometry, float PaddingCm)
{
    if (Points.Num() != 8) return TNumericLimits<float>::Max();
    TArray<FClearanceBox, TInlineAllocator<3>> Boxes;
    Boxes.Add(ClearanceBox(Points[0], Points[1], Points[2], Points[4]));
    return BoxesHullDepth(Boxes, Geometry, PaddingCm);
}

float TorsoUpperPenetration(const FFlowArtsClearanceArm& Arm,
    const FFlowArtsClearanceHull& Hull, float PaddingCm, bool bRankFaceAxesOnly = false,
    const FClearanceHullFaceSupports* FaceSupports = nullptr,
    TArray<FClearanceBox, TInlineAllocator<3>>* PreparedBoxes = nullptr)
{
    if (Arm.UpperTorsoPoints.Num() >= 8 && Hull.Vertices.Num() >= 4)
    {
        TArray<FClearanceBox, TInlineAllocator<3>> LocalBoxes;
        auto& Boxes = PreparedBoxes ? *PreparedBoxes : LocalBoxes;
        if (Boxes.IsEmpty())
        {
            const FVector Location = Arm.Upper.GetLocation();
            const FQuat Rotation = Arm.Upper.GetRotation();
            for (int32 Slice = 0; Slice + 8 <= Arm.UpperTorsoPoints.Num(); Slice += 8)
            {
                const auto Point = [&](int32 Corner)
                { return Location + Rotation.RotateVector(Arm.UpperTorsoPoints[Slice + Corner]); };
                Boxes.Add(ClearanceBox(Point(0), Point(1), Point(2), Point(4)));
            }
        }
        // World geometry is shared by both trunk bands; SAT depth belongs to
        // one hull query and must never carry over from the previous band.
        for (auto& Box : Boxes) Box.Depth = TNumericLimits<float>::Max();
        return BoxesHullDepth(Boxes, Hull, PaddingCm, bRankFaceAxesOnly, FaceSupports);
    }
    auto Capsule = UpperCapsule(Arm);
    Capsule.Start = FMath::Lerp(Capsule.Start, Capsule.End, 0.23f);
    return FFlowArtsArmClearance::HullPenetrationCm(Capsule, Hull, PaddingCm);
}

// Whole-prop/body tests are invariant across elbow candidates for one geometry.
float HeldPropBodyDepth(const FFlowArtsArmClearanceInput& Input,
    const FFlowArtsClearanceCapsule& Prop, int32 Index)
{
    float Depth = Input.TorsoHulls.IsValidIndex(Index)
        ? FFlowArtsArmClearance::HullPenetrationCm(Prop, Input.TorsoHulls[Index], Input.SurfacePaddingCm)
        : Input.TorsoHulls.IsEmpty() && Input.BodyCapsules.IsValidIndex(Index)
            ? FFlowArtsArmClearance::CapsulePenetrationCm(Prop, Input.BodyCapsules[Index], Input.SurfacePaddingCm) : 0.f;
    if (Index == 2 && Input.BodyCapsules.IsValidIndex(Index))
        Depth = FMath::Max(Depth, FFlowArtsArmClearance::CapsulePenetrationCm(
            Prop, Input.BodyCapsules[Index], Input.SurfacePaddingCm));
    return Depth;
}

struct FHeldPropBodyDepths
{
    TArray<float, TInlineAllocator<6>> Sides[2];
    FHeldPropBodyDepths() = default;
    explicit FHeldPropBodyDepths(const FFlowArtsArmClearanceInput& Input)
    {
        for (int32 Side = 0; Side < 2; ++Side)
        {
            Sides[Side].Reserve(Input.HeldPropCapsules[Side].Num() * 3);
            for (const auto& Prop : Input.HeldPropCapsules[Side])
                for (int32 Index = 0; Index < 3; ++Index)
                    Sides[Side].Add(HeldPropBodyDepth(Input, Prop, Index));
        }
    }
};

float RigidHeadPropDepth(const FFlowArtsArmClearanceInput& Geometry)
{
    float Depth = 0.f;
    for (int32 Side = 0; Side < 2; ++Side)
        for (const FFlowArtsClearanceCapsule& Prop : Geometry.HeldPropCapsules[Side])
            if (Geometry.BodyCapsules.IsValidIndex(2))
                Depth = FMath::Max(Depth, FFlowArtsArmClearance::CapsulePenetrationCm(
                    Geometry.BodyCapsules[2], Prop, Geometry.SurfacePaddingCm));
    if (Geometry.TorsoHulls.Num() > 2)
        for (int32 Side = 0; Side < 2; ++Side)
            for (const auto& Prop : Geometry.HeldPropCapsules[Side])
                Depth = FMath::Max(Depth, FFlowArtsArmClearance::HullPenetrationCm(
                    Prop, Geometry.TorsoHulls[2], Geometry.SurfacePaddingCm));
    return Depth;
}


// Solve-local exact numerical geometry reuse. Arm/pose labels never supply a hit.
struct FRigidPropGeometryCache
{
    static constexpr int32 Capacity = 8;
    struct FEntry
    {
        TArray<FFlowArtsClearancePlane> Planes[3];
        TArray<FFlowArtsClearanceCapsule> Bodies, Props[2];
        int32 HullCount = 0;
        float Padding = 0.f, HeadDepth = 0.f;
        FHeldPropBodyDepths Depths;
        bool bDepthsReady = false, bHeadReady = false;
        uint64 Stamp = 0;
    };
    TArray<FEntry, TInlineAllocator<Capacity>> Entries;
    int32 Last = INDEX_NONE, Hits = 0, Misses = 0;
    uint64 Clock = 0;
    template<typename T> static bool Bits(const T& A, const T& B)
    { return FMemory::Memcmp(&A, &B, sizeof(T)) == 0; }
    static bool SameCapsules(const TArray<FFlowArtsClearanceCapsule>& A,
        const TArray<FFlowArtsClearanceCapsule>& B)
    {
        if (A.Num() != B.Num()) return false;
        for (int32 I = 0; I < A.Num(); ++I)
            if (!Bits(A[I].Start, B[I].Start) || !Bits(A[I].End, B[I].End)
                || !Bits(A[I].RadiusCm, B[I].RadiusCm)) return false;
        return true;
    }
    static bool Matches(const FEntry& Entry, const FFlowArtsArmClearanceInput& Geometry)
    {
        if (Entry.HullCount != Geometry.TorsoHulls.Num() || !Bits(Entry.Padding, Geometry.SurfacePaddingCm)
            || !SameCapsules(Entry.Bodies, Geometry.BodyCapsules)) return false;
        for (int32 Side = 0; Side < 2; ++Side)
            if (!SameCapsules(Entry.Props[Side], Geometry.HeldPropCapsules[Side])) return false;
        for (int32 Hull = 0; Hull < FMath::Min(3, Entry.HullCount); ++Hull)
        {
            const auto& A = Entry.Planes[Hull]; const auto& B = Geometry.TorsoHulls[Hull].Planes;
            if (A.Num() != B.Num()) return false;
            for (int32 I = 0; I < A.Num(); ++I)
                if (!Bits(A[I].Normal, B[I].Normal) || !Bits(A[I].OffsetCm, B[I].OffsetCm)) return false;
        }
        return true;
    }
    FEntry& Find(const FFlowArtsArmClearanceInput& Geometry)
    {
        int32 Found = Last;
        if (Found == INDEX_NONE || !Matches(Entries[Found], Geometry))
        {
            Found = INDEX_NONE;
            for (int32 I = 0; I < Entries.Num(); ++I)
                if (I != Last && Matches(Entries[I], Geometry)) { Found = I; break; }
        }
        if (Found != INDEX_NONE) ++Hits;
        else
        {
            ++Misses;
            if (Entries.Num() < Capacity) Found = Entries.AddDefaulted();
            else
            {
                Found = 0;
                for (int32 I = 1; I < Entries.Num(); ++I)
                    if (Entries[I].Stamp < Entries[Found].Stamp) Found = I;
            }
            auto& Entry = Entries[Found];
            Entry.HullCount = Geometry.TorsoHulls.Num(); Entry.Padding = Geometry.SurfacePaddingCm;
            Entry.Bodies = Geometry.BodyCapsules;
            for (int32 Side = 0; Side < 2; ++Side) Entry.Props[Side] = Geometry.HeldPropCapsules[Side];
            for (int32 Hull = 0; Hull < FMath::Min(3, Entry.HullCount); ++Hull)
                Entry.Planes[Hull] = Geometry.TorsoHulls[Hull].Planes;
            Entry.bDepthsReady = Entry.bHeadReady = false;
        }
        Last = Found; Entries[Found].Stamp = ++Clock;
        return Entries[Found];
    }
    const FHeldPropBodyDepths& Body(const FFlowArtsArmClearanceInput& Geometry)
    {
        auto& Entry = Find(Geometry);
        if (!Entry.bDepthsReady) { Entry.Depths = FHeldPropBodyDepths(Geometry); Entry.bDepthsReady = true; }
        return Entry.Depths;
    }
    float Head(const FFlowArtsArmClearanceInput& Geometry)
    {
        auto& Entry = Find(Geometry);
        if (!Entry.bHeadReady) { Entry.HeadDepth = RigidHeadPropDepth(Geometry); Entry.bHeadReady = true; }
        return Entry.HeadDepth;
    }
    ~FRigidPropGeometryCache()
    {
        if (UE_LOG_ACTIVE(LogFlowArtsClearance, VeryVerbose))
            UE_LOG(LogFlowArtsClearance, VeryVerbose, TEXT("RigidPropCache hits=%d misses=%d entries=%d"), Hits, Misses, Entries.Num());
    }
};

void MeasureSide(const FFlowArtsArmClearanceInput& Input, const FFlowArtsClearanceArm& Arm,
    int32 Side, float& Worst, float& Total, FContact& Contact, bool bCertifiedUpperTorsoClear = false, float* NonUpperTorsoWorst = nullptr, bool bRankFaceAxesOnly = false,
    const FHeldPropBodyDepths* HeldPropDepths = nullptr,
    const FClearanceTorsoFaceSupports* TorsoFaceSupports = nullptr,
    bool bCertifiedOppositePropClear = false, float* NonSkinnedWorst = nullptr, float* OppositePropWorst = nullptr,
    bool bCertifiedHeldPropBodyClear = false, float* HeldPropBodyWorst = nullptr,
    uint8 CertifiedSegmentMask = 0, bool bCertifiedForearmBodyClear = false,
    bool bCertifiedForearmHeadClear = false)
{
    Worst = Total = 0.f;
    Contact = FContact();
    bCertifiedUpperTorsoClear &= !!Input.CertifySkinnedUpperTorso && Input.bCanCertifySkinnedUpperTorso;
    bCertifiedOppositePropClear &= !!Input.CertifySkinnedOppositeProps;
    bCertifiedHeldPropBodyClear &= !!Input.CertifySkinnedHeldPropBody;
    bCertifiedForearmBodyClear &= !!Input.CertifyForearmBody;
    bCertifiedForearmHeadClear &= !!Input.CertifyForearmHead;
    if (!Input.CertifySkinnedSegments) CertifiedSegmentMask = 0;
    if (NonUpperTorsoWorst) *NonUpperTorsoWorst = 0.f;
    if (NonSkinnedWorst) *NonSkinnedWorst = 0.f;
    if (OppositePropWorst) *OppositePropWorst = 0.f;
    if (HeldPropBodyWorst) *HeldPropBodyWorst = 0.f;
    const auto Upper = UpperCapsule(Arm);
    const auto Forearm = ForearmCapsule(Arm);
    const auto Accumulate = [&](float Depth, int32 Segment, int32 Kind, int32 Index)
    {
        if (Depth > Worst) { Worst = Depth; Contact = {Side, Segment, Kind, Index}; }
        Total += Depth;
        const bool bCertifiableUpper = Kind == 1 && Segment == 0 && Index < 2 &&
            !!Input.CertifySkinnedUpperTorso && Input.bCanCertifySkinnedUpperTorso;
        if (NonUpperTorsoWorst && !bCertifiableUpper)
            *NonUpperTorsoWorst = FMath::Max(*NonUpperTorsoWorst, Depth);
        const bool bCertifiableForearm = Kind == 1 && Segment == 1 && Index < 2 &&
            !!Input.CertifyForearmBody;
        const bool bCertifiableHead = Kind == 1 && Segment == 1 && Index == 2 &&
            !!Input.CertifyForearmHead;
        if (NonSkinnedWorst && !bCertifiableUpper && !bCertifiableForearm && !bCertifiableHead &&
            !(Kind == 2 && Input.CertifySkinnedOppositeProps) &&
            !(Kind == 4 && Input.CertifySkinnedHeldPropBody))
            *NonSkinnedWorst = FMath::Max(*NonSkinnedWorst, Depth);
        if (OppositePropWorst && Kind == 2) *OppositePropWorst = FMath::Max(*OppositePropWorst, Depth);
        if (HeldPropBodyWorst && Kind == 4) *HeldPropBodyWorst = FMath::Max(*HeldPropBodyWorst, Depth);
    };
    for (int32 Index = 0; Index < Input.BodyCapsules.Num(); ++Index)
    {
        const auto& Body = Input.BodyCapsules[Index];
        // Preserve legacy torso inputs; measured hulls handle their own attachment.
        const auto Exposed = Input.TorsoHulls.IsEmpty() && Index < 2
            ? FFlowArtsClearanceCapsule{FMath::Lerp(Upper.Start, Upper.End, 0.23f), Upper.End, Upper.RadiusCm} : Upper;
        Accumulate(FFlowArtsArmClearance::CapsulePenetrationCm(Exposed, Body, Input.SurfacePaddingCm), 0, 0, Index);
        Accumulate(FFlowArtsArmClearance::CapsulePenetrationCm(Forearm, Body, Input.SurfacePaddingCm), 1, 0, Index);
    }
    TArray<FClearanceBox, TInlineAllocator<3>> PreparedUpperBoxes;
    for (int32 Index = 0; Index < Input.TorsoHulls.Num(); ++Index)
    {
        Accumulate(Index < 2
            ? (bCertifiedUpperTorsoClear ? 0.f : TorsoUpperPenetration(Arm, Input.TorsoHulls[Index], Input.SurfacePaddingCm, bRankFaceAxesOnly,
                TorsoFaceSupports ? &TorsoFaceSupports->Hulls[Index] : nullptr, &PreparedUpperBoxes))
            : FFlowArtsArmClearance::HullPenetrationCm(Upper, Input.TorsoHulls[Index], Input.SurfacePaddingCm), 0, 1, Index);
        Accumulate(((Index < 2 && bCertifiedForearmBodyClear) || (Index == 2 && bCertifiedForearmHeadClear)) ? 0.f :
            FFlowArtsArmClearance::HullPenetrationCm(Forearm, Input.TorsoHulls[Index], Input.SurfacePaddingCm), 1, 1, Index);
    }
    for (int32 Index = 0; !bCertifiedOppositePropClear && Index < Input.HeldPropCapsules[1 - Side].Num(); ++Index)
    {
        const auto& Prop = Input.HeldPropCapsules[1 - Side][Index];
        Accumulate(FFlowArtsArmClearance::CapsulePenetrationCm(Upper, Prop, Input.SurfacePaddingCm), 0, 2, Index);
        Accumulate(FFlowArtsArmClearance::CapsulePenetrationCm(Forearm, Prop, Input.SurfacePaddingCm), 1, 2, Index);
    }
    // A clear arm surface cannot certify the rigid staff attached to that hand.
    // Measure its entire current capsule against both trunk bands, independently
    // of upper-arm or paired-skin verdicts. Candidate geometry already includes
    // the common performance-plane offset exactly once.
    int32 PropDepthIndex = 0;
    for (const auto& Prop : Input.HeldPropCapsules[Side])
        for (int32 Index = 0; Index < 3; ++Index)
        {
            const float Depth = bCertifiedHeldPropBodyClear && Index < 2 ? 0.f :
                HeldPropDepths ? HeldPropDepths->Sides[Side][PropDepthIndex] : HeldPropBodyDepth(Input, Prop, Index);
            ++PropDepthIndex;
            Accumulate(Depth, 2, Index == 2 ? 5 : 4, Index);
        }
}

void Measure(const FFlowArtsArmClearanceInput& Input,
    const FArmCandidate& Left, const FArmCandidate& Right,
    float& Worst, float& Total, FContact& Contact, float* ArmPairWorst = nullptr, bool bCertifiedArmPairClear = false,
    uint8 CertifiedSegmentMask = 0)
{
    if (ArmPairWorst) *ArmPairWorst = 0.f;
    Worst = FMath::Max(Left.BodyWorst, Right.BodyWorst);
    Total = Left.BodyTotal + Right.BodyTotal;
    Contact = Left.BodyWorst >= Right.BodyWorst ? Left.Contact : Right.Contact;
    if (bCertifiedArmPairClear) return;
    if (!Input.CertifySkinnedSegments) CertifiedSegmentMask = 0;
    const FFlowArtsClearanceCapsule Upper[2] = {UpperCapsule(Left.Arm), UpperCapsule(Right.Arm)};
    const FFlowArtsClearanceCapsule Forearm[2] = {ForearmCapsule(Left.Arm), ForearmCapsule(Right.Arm)};
    const auto Accumulate = [&](float Depth, int32 Segment, int32 OtherSegment)
    {
        if (Depth > Worst) { Worst = Depth; Contact = {0, Segment, 3, OtherSegment}; }
        Total += Depth;
        if (ArmPairWorst) *ArmPairWorst = FMath::Max(*ArmPairWorst, Depth);
    };
    Accumulate(FFlowArtsArmClearance::CapsulePenetrationCm(Upper[0], Upper[1], Input.SurfacePaddingCm), 0, 0);
    Accumulate(FFlowArtsArmClearance::CapsulePenetrationCm(Upper[0], Forearm[1], Input.SurfacePaddingCm), 0, 1);
    Accumulate(FFlowArtsArmClearance::CapsulePenetrationCm(Forearm[0], Upper[1], Input.SurfacePaddingCm), 1, 0);
    Accumulate(FFlowArtsArmClearance::CapsulePenetrationCm(Forearm[0], Forearm[1], Input.SurfacePaddingCm), 1, 1);
}

// A cheap contact objective has no exact verdict for its trial pose. Keep a
// gentle gradient for broad contacts that a later full certificate may clear.
double CertifiableProxyGuideCm2(const FFlowArtsArmClearanceInput& Geometry,
    const FFlowArtsClearanceArm* Arms)
{
    double Guide = 0.;
    const auto Add = [&](float Depth) { Guide += FMath::Square(double(FMath::Max(0.f, Depth))); };
    if (Geometry.CertifySkinnedOppositeProps)
        for (int32 Side = 0; Side < 2; ++Side)
            for (const auto& Prop : Geometry.HeldPropCapsules[1 - Side])
                Add(FMath::Max(
                    FFlowArtsArmClearance::CapsulePenetrationCm(UpperCapsule(Arms[Side]), Prop, Geometry.SurfacePaddingCm),
                    FFlowArtsArmClearance::CapsulePenetrationCm(ForearmCapsule(Arms[Side]), Prop, Geometry.SurfacePaddingCm)));
    if (Geometry.CertifySkinnedHeldPropBody)
        for (int32 Side = 0; Side < 2; ++Side)
            for (const auto& Prop : Geometry.HeldPropCapsules[Side])
                Add(FMath::Max(HeldPropBodyDepth(Geometry, Prop, 0), HeldPropBodyDepth(Geometry, Prop, 1)));
    if (Geometry.bCanCertifySkinnedArmPair && Geometry.CertifySkinnedUpperTorso)
    {
        const auto UpperLeft = UpperCapsule(Arms[0]), UpperRight = UpperCapsule(Arms[1]);
        const auto ForearmLeft = ForearmCapsule(Arms[0]), ForearmRight = ForearmCapsule(Arms[1]);
        Add(FMath::Max(FMath::Max(
            FFlowArtsArmClearance::CapsulePenetrationCm(UpperLeft, UpperRight, Geometry.SurfacePaddingCm),
            FFlowArtsArmClearance::CapsulePenetrationCm(UpperLeft, ForearmRight, Geometry.SurfacePaddingCm)),
            FMath::Max(
                FFlowArtsArmClearance::CapsulePenetrationCm(ForearmLeft, UpperRight, Geometry.SurfacePaddingCm),
                FFlowArtsArmClearance::CapsulePenetrationCm(ForearmLeft, ForearmRight, Geometry.SurfacePaddingCm))));
    }
    return Guide;
}

void AddPole(TArray<FArmCandidate>& Candidates, const FFlowArtsClearanceArm& Original,
    const FVector& Pole, const FVector* Previous, const FTransform& TargetWrist)
{
    // Reach/grip failures need only transforms, not a heap copy of the measured
    // torso points. Materialize the complete arm only for an accepted pole.
    FTransform Upper = Original.Upper;
    FTransform Elbow = Original.Elbow;
    FTransform Wrist = Original.Wrist;
    const FVector HardWrist = TargetWrist.GetLocation();
    const FQuat HardRotation = TargetWrist.GetRotation();
    const float UpperLength = FVector::Dist(Upper.GetLocation(), Elbow.GetLocation());
    const float ForearmLength = FVector::Dist(Elbow.GetLocation(), Wrist.GetLocation());
    const float Reach = FVector::Dist(Upper.GetLocation(), HardWrist);
    if (Reach > UpperLength + ForearmLength || Reach < FMath::Abs(UpperLength - ForearmLength)) return;
    AnimationCore::SolveTwoBoneIK(Upper, Elbow, Wrist, Pole, HardWrist,
        false, 1.f, 1.f);
    if (FVector::Dist(Wrist.GetLocation(), HardWrist) > MaxGripErrorCm) return;
    Wrist.SetLocation(HardWrist);
    Wrist.SetRotation(HardRotation);
    FArmCandidate Candidate;
    Candidate.Arm = Original;
    Candidate.Arm.Upper = Upper;
    Candidate.Arm.Elbow = Elbow;
    Candidate.Arm.Wrist = Wrist;
    Candidate.AuthoredElbowMotionCm = FVector::Dist(Elbow.GetLocation(), Original.Elbow.GetLocation());
    Candidate.PreviousElbowMotionCm = Previous
        ? FVector::Dist(Elbow.GetLocation(), *Previous) : Candidate.AuthoredElbowMotionCm;
    Candidates.Add(MoveTemp(Candidate));
}

void BuildCandidates(const FFlowArtsClearanceArm& Arm, const FVector* Previous,
    TArray<FArmCandidate>& Candidates, const FTransform* TargetWrist = nullptr)
{
    // The original pose remains a legal candidate, including its exact finger frame.
    Candidates.Reserve(Candidates.Num() + PoleSamples + (Previous ? 1 : 0) + (TargetWrist ? 0 : 1));
    if (!TargetWrist)
    {
        FArmCandidate Original;
        Original.Arm = Arm;
        Original.PreviousElbowMotionCm = Previous
            ? FVector::Dist(Arm.Elbow.GetLocation(), *Previous) : 0.f;
        Candidates.Add(MoveTemp(Original));
    }

    const FVector Shoulder = Arm.Upper.GetLocation();
    const FTransform& HardWrist = TargetWrist ? *TargetWrist : Arm.Wrist;
    const FVector Wrist = HardWrist.GetLocation();
    const FVector Axis = (Wrist - Shoulder).GetSafeNormal();
    if (Axis.IsNearlyZero()) return;
    FVector Radial = FVector::VectorPlaneProject(Arm.Elbow.GetLocation() - Shoulder, Axis).GetSafeNormal();
    if (Radial.IsNearlyZero())
        Radial = FVector::CrossProduct(Axis, FVector::UpVector).GetSafeNormal();
    if (Radial.IsNearlyZero())
        Radial = FVector::CrossProduct(Axis, FVector::RightVector).GetSafeNormal();
    if (Radial.IsNearlyZero()) return;

    const float Proximal = FVector::DotProduct(Arm.Elbow.GetLocation() - Shoulder, Axis);
    const float PoleRadius = FMath::Max(
        FVector::Dist(Shoulder, Arm.Elbow.GetLocation()),
        FVector::Dist(Arm.Elbow.GetLocation(), Wrist));
    for (int32 Sample = 0; Sample < PoleSamples; ++Sample)
    {
        const FVector Direction = FQuat(Axis, 2.f * PI * Sample / PoleSamples).RotateVector(Radial);
        AddPole(Candidates, Arm, Shoulder + Axis * Proximal + Direction * PoleRadius, Previous, HardWrist);
    }
    if (Previous)
    {
        const FVector PreviousRadial = FVector::VectorPlaneProject(*Previous - Shoulder, Axis).GetSafeNormal();
        if (!PreviousRadial.IsNearlyZero())
            AddPole(Candidates, Arm, Shoulder + Axis * Proximal + PreviousRadial * PoleRadius, Previous, HardWrist);
    }
}

FCompactPoseBoneIndex Bone(const FBoneContainer& Bones, const FReferenceSkeleton& Reference, FName Name)
{
    const int32 SkeletonIndex = Reference.FindBoneIndex(Name);
    return SkeletonIndex == INDEX_NONE ? FCompactPoseBoneIndex(INDEX_NONE)
        : Bones.GetCompactPoseIndexFromSkeletonIndex(SkeletonIndex);
}

bool Has(FCompactPoseBoneIndex BoneIndex) { return BoneIndex.GetInt() != INDEX_NONE; }

bool DescendsFrom(const FReferenceSkeleton& Reference, int32 Child, int32 Ancestor)
{
    if (Child < 0 || Child >= Reference.GetNum() || Ancestor < 0 || Ancestor >= Reference.GetNum()) return false;
    for (int32 Parent = Reference.GetParentIndex(Child); Parent != INDEX_NONE;
         Parent = Reference.GetParentIndex(Parent))
        if (Parent == Ancestor) return true;
    return false;
}

// Solve-local workspace. Only frames read by the current contact witnesses are
// rebuilt; full certification continues through the complete paired-frame adapter.
// One immutable seed per refinement invocation; only torso rotation changes its
// body geometry. Other coordinates may reuse exact transformed arrays.
struct FRefinementGeometryScratch
{
    FFlowArtsArmClearanceInput Geometry;
    FQuat LastRotation = FQuat::Identity;
    bool bValid = false;
    int32 TorsoBuildCount = 0;

    explicit FRefinementGeometryScratch(const FFlowArtsArmClearanceInput& Input) : Geometry(Input) {}

    void Update(const FFlowArtsArmClearanceInput& Input,
        const TArray<FFlowArtsClearanceHull>& SeedHulls,
        const TArray<FFlowArtsClearanceCapsule>& SeedCapsules,
        const FQuat& SeedRotation, const FQuat& Rotation)
    {
        // Exact key: tolerance-based equality could change geometry and rankings.
        if (!bValid || LastRotation.X != Rotation.X || LastRotation.Y != Rotation.Y ||
            LastRotation.Z != Rotation.Z || LastRotation.W != Rotation.W)
        {
            const FQuat Relative = (Rotation * SeedRotation.Inverse()).GetNormalized();
            const FTransform RelativeDelta(Relative, Input.TorsoPivot - Relative.RotateVector(Input.TorsoPivot));
            const FTransform AbsoluteDelta(Rotation, Input.TorsoPivot - Rotation.RotateVector(Input.TorsoPivot));
            Geometry.TorsoHulls = SeedHulls;
            for (auto& Hull : Geometry.TorsoHulls)
            {
                for (FVector& Point : Hull.Vertices) Point = RelativeDelta.TransformPosition(Point);
                for (FVector& Edge : Hull.EdgeDirections) Edge = Relative.RotateVector(Edge);
                for (auto& Plane : Hull.Planes)
                {
                    Plane.Normal = Relative.RotateVector(Plane.Normal);
                    Plane.OffsetCm += FVector::DotProduct(Plane.Normal, RelativeDelta.GetTranslation());
                }
            }
            Geometry.BodyCapsules = SeedCapsules;
            if (Geometry.BodyCapsules.Num() == 3)
            {
                const FVector Neck = AbsoluteDelta.TransformPosition(Input.Neck);
                Geometry.BodyCapsules[0].Start = FMath::Lerp(Input.FixedHip, Neck, .28f);
                Geometry.BodyCapsules[0].End = FMath::Lerp(Input.FixedHip, Neck, .59f);
                Geometry.BodyCapsules[1].Start = Geometry.BodyCapsules[0].End;
                Geometry.BodyCapsules[1].End = FMath::Lerp(Input.FixedHip, Neck, .89f);
                Geometry.BodyCapsules[2].Start = Neck;
                Geometry.BodyCapsules[2].End = AbsoluteDelta.TransformPosition(Input.Head);
            }
            LastRotation = Rotation;
            bValid = true;
            ++TorsoBuildCount;
        }
        // Shared translation is absolute per trial; never accumulate the last shift.
        for (int32 Side = 0; Side < 2; ++Side)
            Geometry.HeldPropCapsules[Side] = Input.HeldPropCapsules[Side];
    }
};

struct FSparseWitnessFrames
{
    TArray<int32> MeshToSkeleton, HandParent, RequiredSkeleton, RequiredMesh;
    TArray<bool> InTorso;
    TArray<FTransform> SkeletonFrames, MeshFrames;
    TArray<FFlowArtsContactWitness> PreviousWitnesses;
    TArray<FFlowArtsPropContactWitness> PreviousPropWitnesses;
    FFlowArtsArmPairContactWitness PreviousArmPairWitness;
    bool bRequiredValid = false;

    void Initialize(int32 SkeletonCount, int32 MeshCount,
        const TArray<int32>& TorsoIndices, const TArray<TPair<int32,int32>>& HandParents,
        const TArray<TPair<int32,int32>>& Remap)
    {
        MeshToSkeleton.Init(INDEX_NONE, MeshCount);
        HandParent.Init(INDEX_NONE, SkeletonCount);
        InTorso.Init(false, SkeletonCount);
        SkeletonFrames.SetNum(SkeletonCount);
        MeshFrames.Init(FTransform::Identity, MeshCount);
        for (int32 Index : TorsoIndices) InTorso[Index] = true;
        for (const auto& Entry : HandParents) HandParent[Entry.Key] = Entry.Value;
        for (const auto& Entry : Remap) MeshToSkeleton[Entry.Key] = Entry.Value;
    }

    bool SetRequiredBones(TConstArrayView<int32> MeshBones)
    {
        RequiredMesh.Reset(); RequiredSkeleton.Reset();
        for (int32 MeshBone : MeshBones)
        {
            if (!MeshToSkeleton.IsValidIndex(MeshBone) || MeshToSkeleton[MeshBone] == INDEX_NONE)
                return bRequiredValid = false;
            RequiredMesh.AddUnique(MeshBone);
            int32 Index = MeshToSkeleton[MeshBone];
            while (Index != INDEX_NONE)
            {
                if (RequiredSkeleton.Contains(Index)) break;
                RequiredSkeleton.Add(Index);
                Index = HandParent[Index];
            }
        }
        // Reference-skeleton order is parent before child, exactly like the full adapter.
        RequiredSkeleton.Sort();
        return bRequiredValid = true;
    }

    bool Prepare(const FFlowArtsSkinnedClearanceData& Skin,
        TConstArrayView<FFlowArtsContactWitness> Witnesses)
    {
        bool bSame = Witnesses.Num() == PreviousWitnesses.Num();
        for (int32 I = 0; bSame && I < Witnesses.Num(); ++I)
        {
            const auto& A = Witnesses[I]; const auto& B = PreviousWitnesses[I];
            bSame = A.Side == B.Side && A.UpperTriangleIndex == B.UpperTriangleIndex &&
                A.BodyTriangleIndex == B.BodyTriangleIndex && A.bClosedBody == B.bClosedBody;
        }
        if (bSame && bRequiredValid) return true;
        PreviousWitnesses.Reset();
        PreviousWitnesses.Append(Witnesses.GetData(), Witnesses.Num());
        TArray<int32, TInlineAllocator<64>> Required;
        for (const auto& Witness : Witnesses)
        {
            const auto& Body = Witness.bClosedBody ? Skin.ClosedBodyTriangles : Skin.TorsoTriangles;
            if (Witness.Side > 1 || !Skin.UpperTriangles[Witness.Side].IsValidIndex(Witness.UpperTriangleIndex) ||
                !Body.IsValidIndex(Witness.BodyTriangleIndex)) return bRequiredValid = false;
            const auto& UpperTriangle = Skin.UpperTriangles[Witness.Side][Witness.UpperTriangleIndex];
            const auto& BodyTriangle = Body[Witness.BodyTriangleIndex];
            for (int32 K = 0; K < 3; ++K)
                for (int32 VertexIndex : {UpperTriangle.Vertices[K], BodyTriangle[K]})
                {
                    if (!Skin.Vertices.IsValidIndex(VertexIndex)) return bRequiredValid = false;
                    const auto& Vertex = Skin.Vertices[VertexIndex];
                    if (Vertex.InfluenceCount < 1 || Vertex.FirstInfluence < 0 ||
                        Vertex.FirstInfluence + Vertex.InfluenceCount > Skin.Influences.Num())
                        return bRequiredValid = false;
                    for (int32 I = Vertex.FirstInfluence; I < Vertex.FirstInfluence + Vertex.InfluenceCount; ++I)
                        Required.AddUnique(Skin.Influences[I].Bone);
                }
        }
        return SetRequiredBones(MakeArrayView(Required.GetData(), Required.Num()));
    }

    bool PrepareProps(const FFlowArtsSkinnedClearanceData& Skin,
        TConstArrayView<FFlowArtsPropContactWitness> Witnesses)
    {
        bool bSame = Witnesses.Num() == PreviousPropWitnesses.Num();
        for (int32 I = 0; bSame && I < Witnesses.Num(); ++I)
        {
            const auto& A = Witnesses[I]; const auto& B = PreviousPropWitnesses[I];
            bSame = A.SurfaceKind == B.SurfaceKind && A.SurfaceSide == B.SurfaceSide &&
                A.PropSide == B.PropSide && A.TriangleIndex == B.TriangleIndex &&
                A.CapsuleIndex == B.CapsuleIndex && A.bContainment == B.bContainment;
        }
        if (bSame && bRequiredValid) return true;
        PreviousPropWitnesses.Reset();
        PreviousPropWitnesses.Append(Witnesses.GetData(), Witnesses.Num());
        TArray<int32,TInlineAllocator<64>> Required;
        for (const auto& W : Witnesses)
        {
            if (W.SurfaceKind > 2 || W.SurfaceSide > 1) return bRequiredValid = false;
            const auto& Triangles = W.SurfaceKind == 0 ? Skin.FullArmTriangles[W.SurfaceSide] :
                W.SurfaceKind == 1 ? Skin.ClosedBodyTriangles : Skin.BodyPropBoundaryTriangles;
            if (!Triangles.IsValidIndex(W.TriangleIndex)) return bRequiredValid = false;
            const FIntVector& T = Triangles[W.TriangleIndex];
            for (int32 K = 0; K < 3; ++K)
            {
                if (!Skin.Vertices.IsValidIndex(T[K])) return bRequiredValid = false;
                const auto& V = Skin.Vertices[T[K]];
                if (V.InfluenceCount < 1 || V.FirstInfluence < 0 ||
                    V.FirstInfluence + V.InfluenceCount > Skin.Influences.Num()) return bRequiredValid = false;
                for (int32 I = V.FirstInfluence; I < V.FirstInfluence + V.InfluenceCount; ++I)
                    Required.AddUnique(Skin.Influences[I].Bone);
            }
        }
        return SetRequiredBones(MakeArrayView(Required.GetData(),Required.Num()));
    }

    bool PrepareArmPair(const FFlowArtsSkinnedClearanceData& Skin,
        const FFlowArtsArmPairContactWitness& Witness)
    {
        if (bRequiredValid && PreviousArmPairWitness.LeftTriangleIndex == Witness.LeftTriangleIndex &&
            PreviousArmPairWitness.RightTriangleIndex == Witness.RightTriangleIndex) return true;
        PreviousArmPairWitness = Witness;
        TArray<int32,TInlineAllocator<64>> Required;
        for (int32 Side = 0; Side < 2; ++Side)
        {
            const int32 TriangleIndex = Side == 0 ? Witness.LeftTriangleIndex : Witness.RightTriangleIndex;
            if (!Skin.FullArmTriangles[Side].IsValidIndex(TriangleIndex)) return bRequiredValid = false;
            const FIntVector& Triangle = Skin.FullArmTriangles[Side][TriangleIndex];
            for (int32 K = 0; K < 3; ++K)
            {
                if (!Skin.Vertices.IsValidIndex(Triangle[K])) return bRequiredValid = false;
                const auto& Vertex = Skin.Vertices[Triangle[K]];
                if (Vertex.InfluenceCount < 1 || Vertex.FirstInfluence < 0 ||
                    Vertex.FirstInfluence + Vertex.InfluenceCount > Skin.Influences.Num())
                    return bRequiredValid = false;
                for (int32 I = Vertex.FirstInfluence; I < Vertex.FirstInfluence + Vertex.InfluenceCount; ++I)
                    Required.AddUnique(Skin.Influences[I].Bone);
            }
        }
        return SetRequiredBones(MakeArrayView(Required.GetData(),Required.Num()));
    }

    void Build(const TArray<FTransform>& AuthoredComponents, const TArray<FTransform>& AuthoredLocals,
        const FFlowArtsClearanceArm* Arms, const int32* Clavicles, const int32* Uppers,
        const int32* Elbows, const int32* Hands, const FTransform& Delta)
    {
        for (int32 Index : RequiredSkeleton)
        {
            FTransform& Frame = SkeletonFrames[Index];
            if (HandParent[Index] != INDEX_NONE)
            {
                Frame = AuthoredLocals[Index] * SkeletonFrames[HandParent[Index]];
                continue;
            }
            Frame = InTorso[Index] ? AuthoredComponents[Index] * Delta : AuthoredComponents[Index];
            for (int32 Side = 0; Side < 2; ++Side)
            {
                if (Arms[Side].bHasClavicle && Index == Clavicles[Side]) Frame = Arms[Side].Clavicle;
                if (Index == Uppers[Side]) Frame = Arms[Side].Upper;
                if (Index == Elbows[Side]) Frame = Arms[Side].Elbow;
                if (Index == Hands[Side]) Frame = Arms[Side].Wrist;
            }
        }
        for (int32 MeshBone : RequiredMesh) MeshFrames[MeshBone] = SkeletonFrames[MeshToSkeleton[MeshBone]];
    }
};

float RadialDistance(const FVector& Point, const FVector& A, const FVector& B,
    float MinFraction, float MaxFraction)
{
    const FVector Axis = B - A;
    const float LengthSquared = Axis.SizeSquared();
    if (LengthSquared < SMALL_NUMBER) return -1.f;
    const float Fraction = FVector::DotProduct(Point - A, Axis) / LengthSquared;
    if (Fraction < MinFraction || Fraction > MaxFraction) return -1.f;
    return FVector::Dist(Point, A + Axis * Fraction);
}
}

#if WITH_DEV_AUTOMATION_TESTS
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsPoleMaterializationTest,
    "FlowArts.Runtime.ArmClearance.PoleMaterialization",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsPoleMaterializationTest::RunTest(const FString& Parameters)
{
    const auto SameTransform = [](const FTransform& A, const FTransform& B)
    {
        return A.GetLocation() == B.GetLocation() && A.GetRotation() == B.GetRotation()
            && A.GetScale3D() == B.GetScale3D();
    };
    for (int32 Index = 0; Index < 96; ++Index)
    {
        FFlowArtsClearanceArm Arm;
        Arm.Upper = FTransform(FQuat(FVector::UpVector, Index * .031), FVector(2., 3., 40.));
        Arm.Elbow = FTransform(FQuat(FVector::RightVector, Index * .017), FVector(5., 8., 20.));
        Arm.Wrist = FTransform(FQuat(FVector::ForwardVector, Index * .013), FVector(1., 2., 0.));
        Arm.UpperRadiusCm = 3.f;
        Arm.ForearmRadiusCm = 2.f;
        for (int32 Point = 0; Point < 24; ++Point) Arm.UpperTorsoPoints.Add(FVector(Point, Point % 3, Point % 5));
        TestEqual(TEXT("Measured three-slice source needs no geometry heap allocation"),
            Arm.UpperTorsoPoints.GetAllocatedSize(), SIZE_T(0));
        FTransform Target = Arm.Wrist;
        Target.AddToTranslation(FVector(Index % 8 * 6., Index % 4, Index % 3));
        const FVector Pole(Index % 7 * 9. - 25., Index % 11 * 5. - 20., 18.);
        const FVector Previous(4., 6., 22.);
        TArray<FArmCandidate> Actual;
        AddPole(Actual, Arm, Pole, &Previous, Target);

        // Original eager-copy implementation, independent of AddPole's new
        // materialization path, including both reach and IK grip rejection.
        FArmCandidate Expected;
        Expected.Arm = Arm;
        auto& Upper = Expected.Arm.Upper;
        auto& Elbow = Expected.Arm.Elbow;
        auto& Wrist = Expected.Arm.Wrist;
        const FVector HardWrist = Target.GetLocation();
        const float UpperLength = FVector::Dist(Upper.GetLocation(), Elbow.GetLocation());
        const float ForearmLength = FVector::Dist(Elbow.GetLocation(), Wrist.GetLocation());
        const float Reach = FVector::Dist(Upper.GetLocation(), HardWrist);
        bool bAccepted = Reach <= UpperLength + ForearmLength && Reach >= FMath::Abs(UpperLength - ForearmLength);
        if (bAccepted)
        {
            AnimationCore::SolveTwoBoneIK(Upper, Elbow, Wrist, Pole, HardWrist, false, 1.f, 1.f);
            bAccepted = FVector::Dist(Wrist.GetLocation(), HardWrist) <= MaxGripErrorCm;
        }
        if (!TestEqual(TEXT("Delayed arm copy preserves pole acceptance"), Actual.Num(), bAccepted ? 1 : 0)) return false;
        if (!bAccepted) continue;
        TestEqual(TEXT("Accepted pole keeps measured corners inline"),
            Actual[0].Arm.UpperTorsoPoints.GetAllocatedSize(), SIZE_T(0));
        Wrist.SetLocation(HardWrist);
        Wrist.SetRotation(Target.GetRotation());
        Expected.AuthoredElbowMotionCm = FVector::Dist(Elbow.GetLocation(), Arm.Elbow.GetLocation());
        Expected.PreviousElbowMotionCm = FVector::Dist(Elbow.GetLocation(), Previous);
        TestTrue(TEXT("Delayed arm copy preserves exact transforms and measured geometry"),
            SameTransform(Actual[0].Arm.Upper, Upper) && SameTransform(Actual[0].Arm.Elbow, Elbow)
            && SameTransform(Actual[0].Arm.Wrist, Wrist) && Actual[0].Arm.UpperTorsoPoints == Arm.UpperTorsoPoints);
        TestEqual(TEXT("Authored motion is bitwise unchanged"), Actual[0].AuthoredElbowMotionCm, Expected.AuthoredElbowMotionCm);
        TestEqual(TEXT("History motion is bitwise unchanged"), Actual[0].PreviousElbowMotionCm, Expected.PreviousElbowMotionCm);
    }
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsPreparedUpperBoxesTest,
    "FlowArts.Runtime.ArmClearance.PreparedUpperBoxes",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsPreparedUpperBoxesTest::RunTest(const FString& Parameters)
{
    FFlowArtsClearanceHull Hulls[2];
    for (int32 Band = 0; Band < 2; ++Band)
    {
        auto& Hull = Hulls[Band];
        const FQuat Rotation(FVector(1., 2., 3.).GetSafeNormal(), Band * .37);
        const FVector Center(0., 0., Band * 18.);
        for (int32 Axis = 0; Axis < 3; ++Axis)
            for (int32 Sign : {-1, 1})
            {
                FVector Normal = FVector::ZeroVector;
                Normal[Axis] = Sign;
                Normal = Rotation.RotateVector(Normal);
                Hull.Planes.Add({Normal, float(9. + FVector::DotProduct(Normal, Center))});
            }
        Hull = HullGeometry(Hull);
        if (!TestTrue(TEXT("Prepared-box fixture has bounded hulls"), Hull.Vertices.Num() >= 4)) return false;
    }
    for (int32 PoseIndex = 0; PoseIndex < 64; ++PoseIndex)
    {
        FFlowArtsClearanceArm Arm;
        Arm.Upper.SetLocation(FVector(PoseIndex % 8 * 4. - 12., PoseIndex % 5 - 2., PoseIndex * .5));
        Arm.Upper.SetRotation(FQuat(FVector(2., -1., 3.).GetSafeNormal(), PoseIndex * .131));
        Arm.Elbow.SetLocation(Arm.Upper.GetLocation() + FVector(0., 0., 30.));
        Arm.UpperRadiusCm = 3.f;
        for (int32 Slice = 0; Slice < 3; ++Slice)
            for (int32 Corner = 0; Corner < 8; ++Corner)
                Arm.UpperTorsoPoints.Add(FVector(
                    (Corner & 1) ? 3. - Slice * .5 : -3. + Slice * .5,
                    (Corner & 2) ? 2. : -2., Slice * 8. + ((Corner & 4) ? 8. : 0.)));
        for (bool bRankOnly : {false, true})
            for (float Padding : {0.f, .3f, 1.f})
            {
                TArray<FClearanceBox, TInlineAllocator<3>> Prepared;
                // Alternate bands repeatedly: a separating first band must not
                // leave zero depth in the next band's otherwise overlapping box.
                for (int32 Query = 0; Query < 4; ++Query)
                {
                    const auto& Hull = Hulls[Query % 2];
                    TArray<FClearanceBox, TInlineAllocator<3>> Reference;
                    for (int32 Slice = 0; Slice < 24; Slice += 8)
                    {
                        const auto Point = [&](int32 Corner) { return Arm.Upper.GetLocation() +
                            Arm.Upper.GetRotation().RotateVector(Arm.UpperTorsoPoints[Slice + Corner]); };
                        Reference.Add(ClearanceBox(Point(0), Point(1), Point(2), Point(4)));
                    }
                    const float Expected = BoxesHullDepth(Reference, Hull, Padding, bRankOnly);
                    const float Actual = TorsoUpperPenetration(Arm, Hull, Padding, bRankOnly, nullptr, &Prepared);
                    if (!TestTrue(TEXT("Prepared SAT boxes retain bitwise depth"),
                        FMemory::Memcmp(&Expected, &Actual, sizeof(float)) == 0)) return false;
                }
            }
        Arm.UpperTorsoPoints.Reset();
        TArray<FClearanceBox, TInlineAllocator<3>> Unused;
        const float Expected = TorsoUpperPenetration(Arm, Hulls[0], .3f);
        const float Actual = TorsoUpperPenetration(Arm, Hulls[0], .3f, false, nullptr, &Unused);
        TestTrue(TEXT("Capsule fallback is bitwise unchanged"), FMemory::Memcmp(&Expected, &Actual, sizeof(float)) == 0);
        TestTrue(TEXT("Capsule fallback does not prepare boxes"), Unused.IsEmpty());
    }
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsContactSearchConstraintsTest,
    "FlowArts.Runtime.ArmClearance.ContactSearchConstraints",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsContactSearchConstraintsTest::RunTest(const FString& Parameters)
{
    FContactSearchConstraints Constraints;
    TArray<FFlowArtsContactWitness> Query = {{0, 2, 3, true}, {1, 4, 5, true, true, -1.}};
    Constraints.Update(Query);
    Query = {{0, 6, 7, true}};
    Constraints.Update(Query);
    TestEqual(TEXT("New contacts retain previous surface guidance, but expire old containment"), Constraints.Active.Num(), 2);
    TestFalse(TEXT("An old exit plane cannot constrain a later candidate"), Constraints.Active.ContainsByPredicate(
        [](const FFlowArtsContactWitness& W) { return W.bContainment; }));
    Constraints.Update(Query);
    TestEqual(TEXT("Repeated query contacts are deduplicated"), Constraints.Active.Num(), 2);
    for (int32 I = 10; I < 50; ++I)
    {
        Query = {{0, I, I, true}};
        Constraints.Update(Query);
    }
    TestEqual(TEXT("Per-solve guidance is bounded"), Constraints.Active.Num(), 32);
    TestEqual(TEXT("Recent contacts survive eviction"), Constraints.Active.Last().UpperTriangleIndex, 49);
    FContactSearchConstraints NextPose;
    TestTrue(TEXT("The next pose starts without previous-frame constraints"), NextPose.Active.IsEmpty());
    FFlowArtsSkinnedClearanceData Skin;
    Skin.ReferenceBoneCount = 1;
    FSparseWitnessFrames EmptyFrames;
    EmptyFrames.Initialize(1, 1, {}, {}, {});
    TestTrue(TEXT("An empty valid contact set prepares without vertex dependencies"),
        EmptyFrames.Prepare(Skin, NextPose.Active));
    TestEqual(TEXT("An empty valid contact set has zero local objective"),
        FFlowArtsSkinnedClearance::EvaluateContactWitnesses(
            Skin, EmptyFrames.MeshFrames, NextPose.Active, .3f), 0.);
    Skin.ReferenceBoneCount = 2;
    TestEqual(TEXT("An empty contact set cannot hide invalid mesh frame coverage"),
        FFlowArtsSkinnedClearance::EvaluateContactWitnesses(
            Skin, EmptyFrames.MeshFrames, NextPose.Active, .3f), TNumericLimits<double>::Max());
    return true;
}

bool FFlowArtsArmClearance::VerifyCertifiableProxyGuide(FString& Error)
{
    FFlowArtsArmClearanceInput Geometry;
    FFlowArtsClearanceArm Arms[2];
    for (int32 Side = 0; Side < 2; ++Side)
    {
        const float X = Side ? 100.f : 0.f;
        Arms[Side].Upper.SetLocation(FVector(X, 0, 0));
        Arms[Side].Elbow.SetLocation(FVector(X, 10, 0));
        Arms[Side].Wrist.SetLocation(FVector(X, 20, 0));
        Arms[Side].UpperRadiusCm = Arms[Side].ForearmRadiusCm = 1.f;
    }
    Geometry.HeldPropCapsules[1].Add({FVector(0, 10, 0), FVector(0, 10, 0), 2.f});
    if (CertifiableProxyGuideCm2(Geometry, Arms) != 0.)
    { Error = TEXT("Unsupported proxy capability entered local guidance"); return false; }
    Geometry.CertifySkinnedOppositeProps = [](const FFlowArtsClearanceArm*, const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&, const TArray<FFlowArtsClearanceCapsule>&, uint8) -> uint8 { return 0; };
    const double Opposite = CertifiableProxyGuideCm2(Geometry, Arms);
    if (Opposite <= 0.) { Error = TEXT("Opposite-prop proxy has no local slope"); return false; }
    Geometry.HeldPropCapsules[1][0] = {FVector(500, 0, 0), FVector(500, 0, 0), 2.f};
    if (CertifiableProxyGuideCm2(Geometry, Arms) != 0.)
    { Error = TEXT("Separated opposite prop retained a local penalty"); return false; }
    Geometry.HeldPropCapsules[1].Reset();
    Geometry.HeldPropCapsules[0].Add({FVector(0, 10, 0), FVector(0, 10, 0), 2.f});
    Geometry.BodyCapsules.Add({FVector(0, 10, 0), FVector(0, 10, 0), 2.f});
    Geometry.BodyCapsules.Add({FVector(500, 0, 0), FVector(500, 0, 0), 2.f});
    Geometry.CertifySkinnedHeldPropBody = [](const FFlowArtsClearanceArm*, const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&, const TArray<FFlowArtsClearanceCapsule>&, uint8) -> uint8 { return 0; };
    if (CertifiableProxyGuideCm2(Geometry, Arms) <= 0.)
    { Error = TEXT("Own-prop body proxy has no local slope"); return false; }
    Geometry.BodyCapsules[0] = {FVector(500, 0, 0), FVector(500, 0, 0), 2.f};
    if (CertifiableProxyGuideCm2(Geometry, Arms) != 0.)
    { Error = TEXT("Separated own-body prop retained a local penalty"); return false; }
    Geometry.HeldPropCapsules[0].Reset();
    Geometry.HeldPropCapsules[1].Reset();
    Geometry.CertifySkinnedUpperTorso = [](const FFlowArtsClearanceArm*, const FQuat&, bool) -> uint8 { return 0; };
    Geometry.bCanCertifySkinnedArmPair = true;
    Arms[1].Upper.SetLocation(FVector(0, 0, 0));
    Arms[1].Elbow.SetLocation(FVector(0, 10, 0));
    Arms[1].Wrist.SetLocation(FVector(0, 20, 0));
    if (CertifiableProxyGuideCm2(Geometry, Arms) <= 0.)
    { Error = TEXT("Arm-pair proxy has no local slope"); return false; }
    Arms[1].Upper.SetLocation(FVector(100, 0, 0));
    Arms[1].Elbow.SetLocation(FVector(100, 10, 0));
    Arms[1].Wrist.SetLocation(FVector(100, 20, 0));
    if (CertifiableProxyGuideCm2(Geometry, Arms) != 0.)
    { Error = TEXT("Separated arm pair retained a local penalty"); return false; }
    return true;
}

bool FFlowArtsArmClearance::VerifyHullFaceSupportReuse(FString& Error)
{
    FFlowArtsClearanceHull BindHull;
    for (int32 X = -1; X <= 1; ++X)
        for (int32 Y = -1; Y <= 1; ++Y)
            for (int32 Z = -1; Z <= 1; ++Z)
                if (X || Y || Z)
                    BindHull.Planes.Add({FVector(X,Y,Z).GetSafeNormal(), float(Z ? 19. : 13.)});
    BindHull = HullGeometry(BindHull);
    if (BindHull.Vertices.Num() < 4) { Error = TEXT("Test hull is unbounded"); return false; }
    FClearanceHullFaceSupports Cached;
    for (int32 PoseIndex = 0; PoseIndex < 8; ++PoseIndex)
    {
        FFlowArtsClearanceHull Hull = BindHull;
        const FQuat Rotation(FVector(1.,2.,3.).GetSafeNormal(), PoseIndex * .17);
        const FVector Translation(PoseIndex * 4., -PoseIndex * 2., 100.);
        for (auto& Point : Hull.Vertices) Point = Rotation.RotateVector(Point) + Translation;
        for (auto& Edge : Hull.EdgeDirections) Edge = Rotation.RotateVector(Edge);
        for (auto& Plane : Hull.Planes)
        {
            Plane.Normal = Rotation.RotateVector(Plane.Normal);
            Plane.OffsetCm += FVector::DotProduct(Plane.Normal, Translation);
        }
        // Repeated geometry reuses exact supports; a sub-tolerance vertex change
        // must invalidate them even though ordinary pose equality may accept it.
        Cached.Update(Hull);
        Cached.Update(Hull);
        Hull.Vertices[0].X += 1.e-9;
        if (Cached.Matches(Hull)) { Error = TEXT("Near geometry reused stale face supports"); return false; }
        Cached.Update(Hull);
        for (int32 ArmIndex = 0; ArmIndex < 64; ++ArmIndex)
        {
            const FQuat ArmRotation(FVector(2.,-1.,3.).GetSafeNormal(), ArmIndex * .131);
            const FVector Center(ArmIndex - 24., ArmIndex % 9 - 4., 90. + ArmIndex * .6);
            for (bool bRankOnly : {false,true})
            {
                TArray<FClearanceBox, TInlineAllocator<3>> Original, Reused;
                for (int32 Slice = 0; Slice < 3; ++Slice)
                {
                    FClearanceBox Box;
                    Box.Center = Center + ArmRotation.RotateVector(FVector(Slice * 5.,0.,0.));
                    Box.HalfEdges[0] = ArmRotation.RotateVector(FVector(5.,0.,0.));
                    Box.HalfEdges[1] = ArmRotation.RotateVector(FVector(0.,2. + Slice,0.));
                    Box.HalfEdges[2] = ArmRotation.RotateVector(FVector(0.,0.,3. - Slice * .5));
                    Original.Add(Box);
                }
                Reused = Original;
                const float Full = BoxesHullDepth(Original, Hull, .3f, bRankOnly);
                const float Fast = BoxesHullDepth(Reused, Hull, .3f, bRankOnly, &Cached);
                if (Full != Fast)
                {
                    Error = FString::Printf(TEXT("Face support result differs pose=%d arm=%d rank=%d old=%.9g new=%.9g"),
                        PoseIndex, ArmIndex, bRankOnly, Full, Fast);
                    return false;
                }
            }
        }
    }
    return true;
}

bool FFlowArtsArmClearance::VerifyCandidateMeasurementReuse(FString& Error)
{
    FFlowArtsArmClearanceInput Input;
    Input.SurfacePaddingCm = .3f;
    Input.BodyCapsules = {{{0.,0.,90.},{0.,0.,115.},12.f},
        {{0.,0.,115.},{0.,0.,145.},15.f},{{0.,0.,150.},{0.,0.,168.},9.f}};
    Input.HeldPropCapsules[0] = {{{-30.,0.,135.},{30.,0.,135.},1.f},
        {{0.,-20.,160.},{0.,20.,160.},2.f}};
    Input.HeldPropCapsules[1] = {{{-25.,12.,110.},{25.,12.,160.},1.5f}};
    FFlowArtsClearanceHull Box;
    for (int32 Axis = 0; Axis < 3; ++Axis)
        for (double Sign : {-1., 1.})
        {
            FVector Normal = FVector::ZeroVector; Normal[Axis] = Sign;
            Box.Planes.Add({Normal, float(Axis == 2 ? 150. : 15.)});
        }
    Box = HullGeometry(Box);
    int32 Cases = 0;
    // Legacy capsules, partial measured geometry, and all three measured bands;
    // every iteration changes props as well as arm pose, invalidating old cache.
    for (int32 HullCount : {0, 1, 3})
        for (int32 Trial = 0; Trial < 5; ++Trial)
        {
            FFlowArtsArmClearanceInput Geometry = Input;
            for (int32 Index = 0; Index < HullCount; ++Index) Geometry.TorsoHulls.Add(Box);
            for (int32 Side = 0; Side < 2; ++Side)
                for (auto& Prop : Geometry.HeldPropCapsules[Side])
                { Prop.Start.X += Trial * 8.; Prop.End.X += Trial * 8.; }
            const FHeldPropBodyDepths Cached(Geometry);
            for (int32 Side = 0; Side < 2; ++Side)
            {
                // Independent original whole-prop loop, retaining the legacy
                // head capsule beside its hull and exact per-prop ordering.
                int32 DepthIndex = 0;
                for (const auto& Prop : Geometry.HeldPropCapsules[Side])
                    for (int32 Index = 0; Index < 3; ++Index)
                    {
                        float Depth = Geometry.TorsoHulls.IsValidIndex(Index)
                            ? HullPenetrationCm(Prop, Geometry.TorsoHulls[Index], Geometry.SurfacePaddingCm)
                            : Geometry.TorsoHulls.IsEmpty() && Geometry.BodyCapsules.IsValidIndex(Index)
                                ? CapsulePenetrationCm(Prop, Geometry.BodyCapsules[Index], Geometry.SurfacePaddingCm) : 0.f;
                        if (Index == 2 && Geometry.BodyCapsules.IsValidIndex(Index))
                            Depth = FMath::Max(Depth, CapsulePenetrationCm(Prop, Geometry.BodyCapsules[Index], Geometry.SurfacePaddingCm));
                        if (Depth != Cached.Sides[Side][DepthIndex++])
                        { Error = TEXT("Cached prop/body depth differs from original loop"); return false; }
                    }
                FFlowArtsClearanceArm Arm;
                Arm.Upper.SetLocation(FVector(Trial * 3., Side ? 20. : -20., 145.));
                Arm.Elbow.SetLocation(FVector(10., Side ? 25. : -25., 120. + Trial));
                Arm.Wrist.SetLocation(FVector(5., Side ? 15. : -15., 95.));
                for (bool bJoint : {false, true})
                    for (bool bCertified : {false, true})
                    {
                        float OldWorst, OldTotal, OldOther, NewWorst, NewTotal, NewOther;
                        FContact OldContact, NewContact;
                        MeasureSide(Geometry, Arm, Side, OldWorst, OldTotal, OldContact, bCertified, &OldOther);
                        if (bJoint) MeasureSide(Geometry, Arm, Side, OldWorst, OldTotal, OldContact, false, &OldOther, true);
                        MeasureSide(Geometry, Arm, Side, NewWorst, NewTotal, NewContact,
                            bJoint ? false : bCertified, &NewOther, bJoint, &Cached);
                        if (OldWorst != NewWorst || OldTotal != NewTotal || OldOther != NewOther
                            || OldContact.Arm != NewContact.Arm || OldContact.Segment != NewContact.Segment
                            || OldContact.Kind != NewContact.Kind || OldContact.Index != NewContact.Index)
                        { Error = TEXT("Single cached measurement changed ranking or contact identity"); return false; }
                        ++Cases;
                    }
            }
        }
    if (Cases != 120) { Error = TEXT("Measurement cases missing"); return false; }
    return true;
}

bool FFlowArtsArmClearance::VerifyRigidPropGeometryReuse(FString& Error)
{
    FFlowArtsArmClearanceInput Base;
    Base.BodyCapsules = {{{0.,0.,90.},{0.,0.,115.},12.f},
        {{0.,0.,115.},{0.,0.,145.},15.f},{{0.,0.,150.},{0.,0.,170.},9.f}};
    Base.HeldPropCapsules[0] = {{{-30.,0.,135.},{30.,0.,135.},1.f},
        {{0.,-20.,160.},{0.,20.,160.},2.f}};
    Base.HeldPropCapsules[1] = {{{-25.,12.,110.},{25.,12.,160.},1.5f}};
    FFlowArtsClearanceHull Box;
    for (int32 Axis = 0; Axis < 3; ++Axis)
        for (double Sign : {-1., 1.})
        {
            FVector Normal = FVector::ZeroVector; Normal[Axis] = Sign;
            Box.Planes.Add({Normal, float(Axis == 2 ? 150. : 15.)});
        }
    Box = HullGeometry(Box);
    const auto Check = [&](FRigidPropGeometryCache& Cache, const FFlowArtsArmClearanceInput& Geometry)
    {
        const FHeldPropBodyDepths Reference(Geometry);
        const auto& Reused = Cache.Body(Geometry);
        for (int32 Side = 0; Side < 2; ++Side)
        {
            if (Reference.Sides[Side].Num() != Reused.Sides[Side].Num()) return false;
            for (int32 Index = 0; Index < Reference.Sides[Side].Num(); ++Index)
                if (!FRigidPropGeometryCache::Bits(Reference.Sides[Side][Index], Reused.Sides[Side][Index])) return false;
            FFlowArtsClearanceArm Arm;
            Arm.Upper.SetLocation(FVector(5., Side ? 20. : -20., 145.));
            Arm.Elbow.SetLocation(FVector(15., Side ? 25. : -25., 120.));
            Arm.Wrist.SetLocation(FVector(5., Side ? 15. : -15., 95.));
            for (bool bCertified : {false, true})
            {
                float OldWorst, OldTotal, OldOther, NewWorst, NewTotal, NewOther;
                FContact OldContact, NewContact;
                MeasureSide(Geometry, Arm, Side, OldWorst, OldTotal, OldContact, bCertified, &OldOther);
                MeasureSide(Geometry, Arm, Side, NewWorst, NewTotal, NewContact, bCertified, &NewOther, false, &Reused);
                if (!FRigidPropGeometryCache::Bits(OldWorst, NewWorst)
                    || !FRigidPropGeometryCache::Bits(OldTotal, NewTotal)
                    || !FRigidPropGeometryCache::Bits(OldOther, NewOther)
                    || OldContact.Arm != NewContact.Arm || OldContact.Segment != NewContact.Segment
                    || OldContact.Kind != NewContact.Kind || OldContact.Index != NewContact.Index) return false;
            }
        }
        return FRigidPropGeometryCache::Bits(RigidHeadPropDepth(Geometry), Cache.Head(Geometry));
    };
    for (int32 HullCount : {0, 1, 3})
    {
        FFlowArtsArmClearanceInput Geometry = Base;
        for (int32 Index = 0; Index < HullCount; ++Index) Geometry.TorsoHulls.Add(Box);
        FRigidPropGeometryCache Cache;
        if (!Check(Cache, Geometry) || !Check(Cache, Geometry) || Cache.Misses != 1)
        { Error = TEXT("Repeated rigid geometry changed a bitwise depth/contact or missed reuse"); return false; }
        // Arms are deliberately absent from the key: their measurements still run fresh.
        Geometry.Arms[0].Elbow.AddToTranslation(FVector(1.,2.,3.));
        if (!Check(Cache, Geometry) || Cache.Misses != 1)
        { Error = TEXT("Arm-only change invalidated invariant rigid geometry"); return false; }
        for (int32 Mutation = 0; Mutation < 13; ++Mutation)
        {
            FFlowArtsArmClearanceInput Changed = Geometry;
            switch (Mutation)
            {
            case 0: Changed.SurfacePaddingCm += .001f; break;
            case 1: Changed.HeldPropCapsules[0][0].Start.X += .001; break;
            case 2: Changed.HeldPropCapsules[1][0].End.Z += .001; break;
            case 3: Changed.HeldPropCapsules[0][0].RadiusCm += .001f; break;
            case 4: Changed.HeldPropCapsules[1].Reset(); break;
            case 5: Changed.BodyCapsules[2].Start.Y += .001; break;
            case 6: Changed.BodyCapsules[2].End.Z += .001; break;
            case 7: Changed.BodyCapsules[2].RadiusCm += .001f; break;
            case 8: Changed.BodyCapsules.RemoveAt(2); break;
            case 9: Changed.TorsoHulls.Add(Box); break;
            case 10:
                if (Changed.TorsoHulls.IsEmpty()) Changed.TorsoHulls.Add(Box);
                Changed.TorsoHulls[0].Planes[0].Normal.Y += .001; break;
            case 11:
                if (Changed.TorsoHulls.IsEmpty()) Changed.TorsoHulls.Add(Box);
                Changed.TorsoHulls[0].Planes[0].OffsetCm += .001f; break;
            case 12:
                if (Changed.TorsoHulls.IsEmpty()) Changed.TorsoHulls.Add(Box);
                Changed.TorsoHulls[0].Planes.RemoveAt(0); break;
            }
            const int32 PreviousMisses = Cache.Misses;
            if (!Check(Cache, Changed) || Cache.Misses != PreviousMisses + 1
                || Cache.Entries.Num() > FRigidPropGeometryCache::Capacity)
            { Error = FString::Printf(TEXT("Rigid dependency %d did not invalidate exactly or changed measurement"), Mutation); return false; }
        }
        if (!Check(Cache, Geometry))
        { Error = TEXT("Eviction/repopulation changed measurements"); return false; }
    }
    return true;
}

bool FFlowArtsArmClearance::VerifyRefinementGeometryReuse(FString& Error)
{
    FFlowArtsArmClearanceInput Input;
    Input.FixedHip = FVector(1., -3., 90.);
    Input.Neck = FVector(2., 4., 150.);
    Input.Head = FVector(3., 5., 169.);
    Input.TorsoPivot = FVector(-2., 3., 112.);
    for (int32 Axis = 0; Axis < 3; ++Axis)
        for (double Sign : {-1., 1.})
        {
            FVector Normal = FVector::ZeroVector; Normal[Axis] = Sign;
            if (Input.TorsoHulls.IsEmpty()) Input.TorsoHulls.AddDefaulted();
            Input.TorsoHulls[0].Planes.Add({Normal, 15.f});
        }
    Input.TorsoHulls[0] = HullGeometry(Input.TorsoHulls[0]);
    Input.BodyCapsules = {{{0.,0.,90.},{0.,0.,110.},10.f},
        {{0.,0.,110.},{0.,0.,145.},13.f},{{0.,0.,150.},{0.,0.,169.},9.f}};
    Input.HeldPropCapsules[0].Add({{-30.,0.,135.},{30.,0.,135.},1.f});
    Input.HeldPropCapsules[1].Add({{0.,-30.,130.},{0.,30.,130.},2.f});
    const FQuat SeedRotation(FVector(1.,2.,3.).GetSafeNormal(), .2);
    const FQuat TurnA(FVector::UpVector, .3);
    const FQuat TurnB = (FQuat(FVector::RightVector, -.4) * TurnA).GetNormalized();
    const FQuat NearA = (FQuat(FVector::RightVector, 1.e-9) * TurnA).GetNormalized();
    const FQuat Turns[] = {TurnA,TurnA,TurnB,TurnB,TurnA,NearA};
    FRefinementGeometryScratch Scratch(Input);
    for (int32 Trial = 0; Trial < UE_ARRAY_COUNT(Turns); ++Trial)
    {
        const FQuat Rotation = Turns[Trial];
        // Independent legacy trial reconstruction: full input copy and unconditionally
        // transformed seed geometry, preserving its arithmetic and operation order.
        FFlowArtsArmClearanceInput Full = Input;
        const FQuat Relative = (Rotation * SeedRotation.Inverse()).GetNormalized();
        const FTransform RelativeDelta(Relative, Input.TorsoPivot - Relative.RotateVector(Input.TorsoPivot));
        const FTransform AbsoluteDelta(Rotation, Input.TorsoPivot - Rotation.RotateVector(Input.TorsoPivot));
        for (auto& Hull : Full.TorsoHulls)
        {
            for (FVector& Point : Hull.Vertices) Point = RelativeDelta.TransformPosition(Point);
            for (FVector& Edge : Hull.EdgeDirections) Edge = Relative.RotateVector(Edge);
            for (auto& Plane : Hull.Planes)
            {
                Plane.Normal = Relative.RotateVector(Plane.Normal);
                Plane.OffsetCm += FVector::DotProduct(Plane.Normal, RelativeDelta.GetTranslation());
            }
        }
        const FVector Neck = AbsoluteDelta.TransformPosition(Input.Neck);
        Full.BodyCapsules[0].Start = FMath::Lerp(Input.FixedHip, Neck, .28f);
        Full.BodyCapsules[0].End = FMath::Lerp(Input.FixedHip, Neck, .59f);
        Full.BodyCapsules[1].Start = Full.BodyCapsules[0].End;
        Full.BodyCapsules[1].End = FMath::Lerp(Input.FixedHip, Neck, .89f);
        Full.BodyCapsules[2].Start = Neck;
        Full.BodyCapsules[2].End = AbsoluteDelta.TransformPosition(Input.Head);
        Scratch.Update(Input, Input.TorsoHulls, Input.BodyCapsules, SeedRotation, Rotation);
        auto& Cached = Scratch.Geometry;
        const FVector Shift(Trial*1.3, -Trial*2.7, Trial*.4);
        for (int32 Side = 0; Side < 2; ++Side)
        {
            for (auto& Prop : Full.HeldPropCapsules[Side]) { Prop.Start += Shift; Prop.End += Shift; }
            for (auto& Prop : Cached.HeldPropCapsules[Side]) { Prop.Start += Shift; Prop.End += Shift; }
            for (int32 Index = 0; Index < Full.HeldPropCapsules[Side].Num(); ++Index)
            {
                const auto& A = Full.HeldPropCapsules[Side][Index];
                const auto& B = Cached.HeldPropCapsules[Side][Index];
                if (A.Start != B.Start || A.End != B.End || A.RadiusCm != B.RadiusCm)
                { Error = TEXT("Prop shift accumulated between trials"); return false; }
            }
        }
        for (int32 Index = 0; Index < Full.BodyCapsules.Num(); ++Index)
        {
            const auto& A = Full.BodyCapsules[Index]; const auto& B = Cached.BodyCapsules[Index];
            if (A.Start != B.Start || A.End != B.End || A.RadiusCm != B.RadiusCm)
            { Error = TEXT("Cached capsule differs"); return false; }
        }
        const auto& A = Full.TorsoHulls[0]; const auto& B = Cached.TorsoHulls[0];
        for (int32 Index = 0; Index < A.Vertices.Num(); ++Index)
            if (A.Vertices[Index] != B.Vertices[Index]) { Error = TEXT("Cached vertex differs"); return false; }
        for (int32 Index = 0; Index < A.EdgeDirections.Num(); ++Index)
            if (A.EdgeDirections[Index] != B.EdgeDirections[Index]) { Error = TEXT("Cached edge differs"); return false; }
        for (int32 Index = 0; Index < A.Planes.Num(); ++Index)
            if (A.Planes[Index].Normal != B.Planes[Index].Normal || A.Planes[Index].OffsetCm != B.Planes[Index].OffsetCm)
            { Error = TEXT("Cached plane differs"); return false; }
        for (const auto& Prop : Full.HeldPropCapsules[0])
            if (HullPenetrationCm(Prop, A, .3f) != HullPenetrationCm(Prop, B, .3f))
            { Error = TEXT("Cached penetration metric differs"); return false; }
    }
    if (Scratch.TorsoBuildCount != 4) { Error = TEXT("Repeated rotations rebuilt or near rotation was reused"); return false; }
    return true;
}

bool FFlowArtsArmClearance::VerifySparseWitnessFrames(const USkeletalMesh* Mesh,
    const FFlowArtsSkinnedClearanceData& Skin, FString& Error)
{
    if (!Mesh) { Error = TEXT("Missing mesh"); return false; }
    const auto& Reference = Mesh->GetRefSkeleton();
    const auto& Locals = Reference.GetRefBonePose();
    TArray<FTransform> Authored; Authored.SetNum(Reference.GetNum());
    TArray<int32> Torso;
    TArray<TPair<int32,int32>> HandParents, Remap;
    const int32 SpineIndex = Reference.FindBoneIndex(TEXT("Spine"));
    const int32 Clavicles[2] = {Reference.FindBoneIndex(TEXT("LeftShoulder")), Reference.FindBoneIndex(TEXT("RightShoulder"))};
    const int32 Uppers[2] = {Reference.FindBoneIndex(TEXT("LeftArm")), Reference.FindBoneIndex(TEXT("RightArm"))};
    const int32 Elbows[2] = {Reference.FindBoneIndex(TEXT("LeftForeArm")), Reference.FindBoneIndex(TEXT("RightForeArm"))};
    const int32 Hands[2] = {Reference.FindBoneIndex(TEXT("LeftHand")), Reference.FindBoneIndex(TEXT("RightHand"))};
    for (int32 Side = 0; Side < 2; ++Side)
        if (Uppers[Side] == INDEX_NONE || Elbows[Side] == INDEX_NONE || Hands[Side] == INDEX_NONE)
        { Error = TEXT("Missing arm bones"); return false; }
    for (int32 Index = 0; Index < Reference.GetNum(); ++Index)
    {
        const int32 Parent = Reference.GetParentIndex(Index);
        Authored[Index] = Parent == INDEX_NONE ? Locals[Index] : Locals[Index] * Authored[Parent];
        if (Index == SpineIndex || DescendsFrom(Reference, Index, SpineIndex)) Torso.Add(Index);
        if (DescendsFrom(Reference, Index, Hands[0]) || DescendsFrom(Reference, Index, Hands[1]))
            HandParents.Add({Index, Parent});
    }
    for (int32 MeshBone = 0; MeshBone < Skin.ReferenceBoneNames.Num(); ++MeshBone)
    {
        const int32 Index = Reference.FindBoneIndex(Skin.ReferenceBoneNames[MeshBone]);
        if (Index != INDEX_NONE) Remap.Add({MeshBone, Index});
    }
    FSparseWitnessFrames Sparse;
    Sparse.Initialize(Reference.GetNum(), Skin.ReferenceBoneCount, Torso, HandParents, Remap);
    TArray<FFlowArtsContactWitness> Witnesses;
    for (int32 Side = 0; Side < 2; ++Side)
    {
        if (Skin.UpperTriangles[Side].IsEmpty() || Skin.TorsoTriangles.IsEmpty())
        { Error = TEXT("Missing witness geometry"); return false; }
        Witnesses.Add({static_cast<uint8>(Side), 0, 0, false});
        const bool bHasClosedBody = !Skin.ClosedBodyTriangles.IsEmpty();
        Witnesses.Add({static_cast<uint8>(Side), Skin.UpperTriangles[Side].Num()-1,
            (bHasClosedBody ? Skin.ClosedBodyTriangles.Num() : Skin.TorsoTriangles.Num())-1, bHasClosedBody});
        if (bHasClosedBody)
            Witnesses.Add({static_cast<uint8>(Side), 0, 0, true, true, Side ? -1. : 1.});
    }
    for (int32 Trial = 0; Trial < 3; ++Trial)
    {
        const FQuat Rotation = (FQuat(FVector::UpVector, .37 * Trial) *
            FQuat(FVector::RightVector, -.21 * Trial)).GetNormalized();
        const FVector Pivot = SpineIndex == INDEX_NONE ? FVector::ZeroVector : Authored[SpineIndex].GetLocation();
        const FTransform Delta(Rotation, Pivot - Rotation.RotateVector(Pivot));
        FFlowArtsClearanceArm Arms[2];
        for (int32 Side = 0; Side < 2; ++Side)
        {
            auto& Arm = Arms[Side];
            Arm.bHasClavicle = Clavicles[Side] != INDEX_NONE && !(Trial == 2 && Side == 1);
            if (Clavicles[Side] != INDEX_NONE) Arm.Clavicle = Authored[Clavicles[Side]] * Delta;
            Arm.Upper = Authored[Uppers[Side]] * Delta;
            Arm.Elbow = Authored[Elbows[Side]] * Delta;
            Arm.Wrist = Authored[Hands[Side]] * Delta;
            for (FTransform* Frame : {&Arm.Clavicle, &Arm.Upper, &Arm.Elbow, &Arm.Wrist})
            {
                Frame->AddToTranslation(FVector(Trial * 1.7, Side * 2.3, -Trial));
                Frame->SetRotation((FQuat(FVector(1.,2.,3.).GetSafeNormal(), .13 * (Trial+Side)) *
                    Frame->GetRotation()).GetNormalized());
            }
        }
        // This is the complete adapter's original operation order, independent of
        // sparse dependency discovery. Include every finger and both clavicle policies.
        TArray<FTransform> Full = Authored;
        for (int32 Index : Torso) Full[Index] = Authored[Index] * Delta;
        for (int32 Side = 0; Side < 2; ++Side)
        {
            if (Arms[Side].bHasClavicle) Full[Clavicles[Side]] = Arms[Side].Clavicle;
            Full[Uppers[Side]] = Arms[Side].Upper;
            Full[Elbows[Side]] = Arms[Side].Elbow;
            Full[Hands[Side]] = Arms[Side].Wrist;
        }
        for (const auto& Entry : HandParents) Full[Entry.Key] = Locals[Entry.Key] * Full[Entry.Value];
        TArray<FTransform> FullMesh; FullMesh.Init(FTransform::Identity, Skin.ReferenceBoneCount);
        for (const auto& Entry : Remap) FullMesh[Entry.Key] = Full[Entry.Value];
        TArray<int32> EveryMappedBone;
        for (const auto& Entry : Remap) EveryMappedBone.Add(Entry.Key);
        if (!Sparse.SetRequiredBones(EveryMappedBone)) { Error = TEXT("Full dependency selection failed"); return false; }
        Sparse.Build(Authored, Locals, Arms, Clavicles, Uppers, Elbows, Hands, Delta);
        for (int32 Bone : EveryMappedBone)
            if (!Sparse.MeshFrames[Bone].Equals(FullMesh[Bone], 1.e-10))
            { Error = FString::Printf(TEXT("Full/sparse frame mismatch bone %d trial %d"), Bone, Trial); return false; }
        // Change the active set and then reuse it, detecting stale dependency caches.
        if (Trial) Witnesses.RemoveAt(0);
        // Clear test scratch so frames from the preceding all-bone comparison
        // cannot hide a missing witness/hand-parent dependency.
        Sparse.SkeletonFrames.Init(FTransform::Identity, Reference.GetNum());
        Sparse.MeshFrames.Init(FTransform::Identity, Skin.ReferenceBoneCount);
        if (!Sparse.Prepare(Skin, Witnesses)) { Error = TEXT("Witness dependency selection failed"); return false; }
        Sparse.Build(Authored, Locals, Arms, Clavicles, Uppers, Elbows, Hands, Delta);
        for (int32 Bone : Sparse.RequiredMesh)
            if (!Sparse.MeshFrames[Bone].Equals(FullMesh[Bone], 1.e-10))
            { Error = TEXT("Witness-only frame differs after scratch reset"); return false; }
        const double FullObjective = FFlowArtsSkinnedClearance::EvaluateContactWitnesses(Skin, FullMesh, Witnesses, .45f);
        const double SparseObjective = FFlowArtsSkinnedClearance::EvaluateContactWitnesses(Skin, Sparse.MeshFrames, Witnesses, .45f);
        if (!FMath::IsFinite(FullObjective) || FullObjective != SparseObjective || !Sparse.Prepare(Skin, Witnesses))
        { Error = TEXT("Full/sparse witness objective differs"); return false; }
        if (Trial == 0 && !Skin.ClosedBodyTriangles.IsEmpty())
        {
            // Isolate the signed containment path with enough padding to make
            // its result nonzero, including the torso triangle dependencies.
            const auto Containment = MakeArrayView(&Witnesses[2], 1);
            const double FullExit = FFlowArtsSkinnedClearance::EvaluateContactWitnesses(
                Skin, FullMesh, Containment, 1000.f);
            const double SparseExit = FFlowArtsSkinnedClearance::EvaluateContactWitnesses(
                Skin, Sparse.MeshFrames, Containment, 1000.f);
            if (!FMath::IsFinite(FullExit) || FullExit <= 0. || FullExit != SparseExit)
            { Error = TEXT("Full/sparse containment exit objective differs"); return false; }
        }
    }
    const FFlowArtsContactWitness Invalid = {0, INDEX_NONE, 0, true};
    if (Sparse.Prepare(Skin, MakeArrayView(&Invalid, 1)))
    { Error = TEXT("Invalid witness was accepted"); return false; }
    return true;
}
#endif

bool FFlowArtsArmClearanceRigEnvelope::IsComplete() const
{
    if (LowerTorsoRadiusCm <= 0.f || UpperTorsoRadiusCm <= 0.f || HeadRadiusCm <= 0.f)
        return false;
    for (int32 Side = 0; Side < 2; ++Side)
        if (UpperRadiusCm[Side] <= 0.f || ForearmRadiusCm[Side] <= 0.f)
            return false;
    for (int32 Count : SampledVertices)
        if (Count < 4) return false;
    return true;
}

bool FFlowArtsArmClearance::MeasureRig(const USkeletalMesh* Mesh,
    FFlowArtsArmClearanceRigEnvelope& OutEnvelope, FString& OutError)
{
    check(IsInGameThread());
    OutError.Reset();
    if (!Mesh)
    {
        OutError = TEXT("No skeletal mesh for arm envelope");
        return false;
    }
    const FSkeletalMeshRenderData* RenderData = Mesh->GetResourceForRendering();
    if (!RenderData || RenderData->LODRenderData.IsEmpty())
    {
        OutError = TEXT("No skeletal mesh LOD render data");
        return false;
    }
    const FSkeletalMeshLODRenderData& LOD = RenderData->LODRenderData[0];
    const FPositionVertexBuffer& Positions = LOD.StaticVertexBuffers.PositionVertexBuffer;
    const FSkinWeightVertexBuffer* Weights = LOD.GetSkinWeightVertexBuffer();
    if (!Weights || !Positions.GetAllowCPUAccess() || !Positions.GetVertexData() ||
        !Weights->GetNeedsCPUAccess() || !Weights->GetDataVertexBuffer()->GetWeightData() ||
        Positions.GetNumVertices() != Weights->GetNumVertices())
    {
        OutError = TEXT("LOD0 bind positions or skin weights are not CPU accessible");
        return false;
    }

    const FReferenceSkeleton& Reference = Mesh->GetRefSkeleton();
    const int32 Upper[2] = {Reference.FindBoneIndex(TEXT("LeftArm")), Reference.FindBoneIndex(TEXT("RightArm"))};
    const int32 Elbow[2] = {Reference.FindBoneIndex(TEXT("LeftForeArm")), Reference.FindBoneIndex(TEXT("RightForeArm"))};
    const int32 Wrist[2] = {Reference.FindBoneIndex(TEXT("LeftHand")), Reference.FindBoneIndex(TEXT("RightHand"))};
    const int32 Hips = Reference.FindBoneIndex(TEXT("Hips"));
    const int32 Neck = Reference.FindBoneIndex(TEXT("Neck"));
    const int32 Head = Reference.FindBoneIndex(TEXT("Head"));
    if (Hips == INDEX_NONE || Neck == INDEX_NONE || Head == INDEX_NONE ||
        Upper[0] == INDEX_NONE || Upper[1] == INDEX_NONE ||
        Elbow[0] == INDEX_NONE || Elbow[1] == INDEX_NONE ||
        Wrist[0] == INDEX_NONE || Wrist[1] == INDEX_NONE)
    {
        OutError = TEXT("Rig lacks normalized arm, trunk, or head bones");
        return false;
    }
    TArray<FTransform> Bind;
    Bind.SetNum(Reference.GetNum());
    for (int32 Index = 0; Index < Reference.GetNum(); ++Index)
    {
        Bind[Index] = Reference.GetRefBonePose()[Index];
        const int32 Parent = Reference.GetParentIndex(Index);
        if (Parent != INDEX_NONE) Bind[Index] = Bind[Index] * Bind[Parent];
    }

    FFlowArtsArmClearanceRigEnvelope Measured;
    const FVector HipPoint = Bind[Hips].GetLocation();
    const FVector NeckPoint = Bind[Neck].GetLocation();
    const FVector HeadPoint = Bind[Head].GetLocation();
    const FVector BindUp = (NeckPoint - HipPoint).GetSafeNormal();
    const FVector BindLateral = FVector::VectorPlaneProject(
        Bind[Upper[1]].GetLocation() - Bind[Upper[0]].GetLocation(), BindUp).GetSafeNormal();
    if (BindUp.IsNearlyZero() || BindLateral.IsNearlyZero())
    {
        OutError = TEXT("Degenerate torso measurement frame");
        return false;
    }
    const FQuat BindFrame = FRotationMatrix::MakeFromXZ(BindLateral, BindUp).ToQuat();
    Measured.BindTrunkLengthCm = FVector::Dist(HipPoint, NeckPoint);
    for (int32 Band = 0; Band < 2; ++Band)
    {
        for (int32 Direction = 0; Direction < 8; ++Direction)
        {
            const float Angle = 2.f * PI * Direction / 8.f;
            // Retain the radial supports and add sloped supports. Every plane
            // encloses every measured vertex in this band, but the cross-section
            // no longer inherits the widest chest/waist at every height.
            for (const float Slope : {0.f, -0.5f, 0.5f, -1.f, 1.f})
                Measured.TorsoBands[Band].Planes.Add({
                    FVector(FMath::Cos(Angle), FMath::Sin(Angle), Slope).GetSafeNormal(),
                    -TNumericLimits<float>::Max()});
        }
        const float Low = Band == 0 ? 0.28f : 0.59f;
        const float High = Band == 0 ? 0.59f : 0.89f;
        Measured.TorsoBands[Band].Planes.Add({FVector::UpVector, High * Measured.BindTrunkLengthCm});
        Measured.TorsoBands[Band].Planes.Add({-FVector::UpVector, -Low * Measured.BindTrunkLengthCm});
    }
    FVector ArmAxis[2], ArmCross[2], ArmDepth[2];
    FBox ArmBounds[2][3];
    for (auto& Side : ArmBounds)
        for (auto& Slice : Side) Slice = FBox(ForceInit);
    for (int32 X = -1; X <= 1; ++X)
        for (int32 Y = -1; Y <= 1; ++Y)
            for (int32 Z = -1; Z <= 1; ++Z)
                if (X || Y || Z)
                    Measured.HeadHull.Planes.Add({FVector(X, Y, Z).GetSafeNormal(), -TNumericLimits<float>::Max()});
    for (int32 Side = 0; Side < 2; ++Side)
    {
        ArmAxis[Side] = (Bind[Elbow[Side]].GetLocation() - Bind[Upper[Side]].GetLocation()).GetSafeNormal();
        ArmCross[Side] = FVector::VectorPlaneProject(BindUp, ArmAxis[Side]).GetSafeNormal();
        ArmDepth[Side] = FVector::CrossProduct(ArmAxis[Side], ArmCross[Side]).GetSafeNormal();
        Measured.BindUpperLengthCm[Side] = FVector::Dist(Bind[Upper[Side]].GetLocation(), Bind[Elbow[Side]].GetLocation());
    }
    const TConstArrayView<FBoneIndexType> UnifiedMap = LOD.GetUnifiedBoneMap();
    for (const FSkelMeshRenderSection& Section : LOD.RenderSections)
    {
        const uint32 EndVertex = FMath::Min(Section.BaseVertexIndex + Section.NumVertices, Positions.GetNumVertices());
        for (uint32 Vertex = Section.BaseVertexIndex; Vertex < EndVertex; ++Vertex)
        {
            uint32 Offset = 0;
            uint32 InfluenceCount = 0;
            Weights->GetVertexInfluenceOffsetCount(Vertex, Offset, InfluenceCount);
            int32 DominantMappedBone = INDEX_NONE;
            uint16 DominantWeight = 0;
            for (uint32 Influence = 0; Influence < InfluenceCount; ++Influence)
            {
                const uint16 Weight = Weights->GetBoneWeight(Vertex, Influence);
                if (Weight <= DominantWeight) continue;
                DominantWeight = Weight;
                DominantMappedBone = static_cast<int32>(Weights->GetBoneIndex(Vertex, Influence));
            }
            if (DominantMappedBone == INDEX_NONE || DominantWeight == 0) continue;
            const TConstArrayView<FBoneIndexType> BoneMap = LOD.HasUnifiedBoneMap()
                ? UnifiedMap : TConstArrayView<FBoneIndexType>(Section.BoneMap);
            if (!BoneMap.IsValidIndex(DominantMappedBone)) continue;
            const int32 DominantBone = BoneMap[DominantMappedBone];
            const FVector Point(Positions.VertexPosition(Vertex));
            for (int32 Side = 0; Side < 2; ++Side)
            {
                if (DominantBone == Upper[Side])
                {
                    const FVector Relative = Point - Bind[Upper[Side]].GetLocation();
                    const float Along = FVector::DotProduct(Relative, ArmAxis[Side]);
                    // Exempt only the shoulder attachment, not the forearm, head,
                    // other arm, or held prop. Retain the exposed mesh dimensions.
                    if (Along >= Measured.BindUpperLengthCm[Side] * 0.23f &&
                        Along <= Measured.BindUpperLengthCm[Side])
                        {
                        const float Fraction = Along / Measured.BindUpperLengthCm[Side];
                        const int32 Slice = FMath::Clamp(FMath::FloorToInt((Fraction - 0.23f) / (0.77f / 3.f)), 0, 2);
                        ArmBounds[Side][Slice] += FVector(Along, FVector::DotProduct(Relative, ArmCross[Side]),
                            FVector::DotProduct(Relative, ArmDepth[Side]));
                    }
                    const float Radius = RadialDistance(Point, Bind[Upper[Side]].GetLocation(),
                        Bind[Elbow[Side]].GetLocation(), 0.15f, 0.85f);
                    if (Radius >= 0.f)
                    {
                        Measured.UpperRadiusCm[Side] = FMath::Max(Measured.UpperRadiusCm[Side], Radius);
                        ++Measured.SampledVertices[Side];
                    }
                }
                if (DominantBone == Elbow[Side])
                {
                    const float Radius = RadialDistance(Point, Bind[Elbow[Side]].GetLocation(),
                        Bind[Wrist[Side]].GetLocation(), 0.15f, 0.85f);
                    if (Radius >= 0.f)
                    {
                        Measured.ForearmRadiusCm[Side] = FMath::Max(Measured.ForearmRadiusCm[Side], Radius);
                        ++Measured.SampledVertices[2 + Side];
                    }
                }
            }
            const FName DominantName = Reference.GetBoneName(DominantBone);
            if (DominantBone == Hips || DominantName.ToString().StartsWith(TEXT("Spine")))
            {
                const float Lower = RadialDistance(Point, HipPoint, NeckPoint, 0.28f, 0.59f);
                const float UpperBody = RadialDistance(Point, HipPoint, NeckPoint, 0.59f, 0.89f);
                const FVector Local = BindFrame.UnrotateVector(Point - HipPoint);
                for (int32 Band = 0; Band < 2; ++Band)
                    if ((Band == 0 ? Lower : UpperBody) >= 0.f)
                        for (int32 Direction = 0; Direction < Measured.TorsoBands[Band].Planes.Num() - 2; ++Direction)
                        {
                            auto& Plane = Measured.TorsoBands[Band].Planes[Direction];
                            Plane.OffsetCm = FMath::Max(Plane.OffsetCm,
                                static_cast<float>(FVector::DotProduct(Plane.Normal, Local)));
                        }
                if (Lower >= 0.f)
                {
                    Measured.LowerTorsoRadiusCm = FMath::Max(Measured.LowerTorsoRadiusCm, Lower);
                    ++Measured.SampledVertices[4];
                }
                if (UpperBody >= 0.f)
                {
                    Measured.UpperTorsoRadiusCm = FMath::Max(Measured.UpperTorsoRadiusCm, UpperBody);
                    ++Measured.SampledVertices[5];
                }
            }
            if (DominantBone == Head)
            {
                const FVector HeadLocal = Bind[Head].GetRotation().UnrotateVector(Point - HeadPoint);
                for (auto& Plane : Measured.HeadHull.Planes)
                    Plane.OffsetCm = FMath::Max(Plane.OffsetCm,
                        static_cast<float>(FVector::DotProduct(Plane.Normal, HeadLocal)));
                const float Radius = RadialDistance(Point, NeckPoint, HeadPoint, 0.05f, 1.35f);
                if (Radius >= 0.f)
                {
                    Measured.HeadRadiusCm = FMath::Max(Measured.HeadRadiusCm, Radius);
                    ++Measured.SampledVertices[6];
                }
            }
        }
    }
    if (!Measured.IsComplete())
    {
        OutError = TEXT("Skin weights did not yield a complete seven-part arm/body envelope");
        return false;
    }
    for (int32 Side = 0; Side < 2; ++Side)
    {
        if (ArmCross[Side].IsNearlyZero())
        {
            OutError = TEXT("Degenerate upper-arm measurement frame");
            return false;
        }
        FBox Whole(ForceInit);
        for (const auto& Slice : ArmBounds[Side]) Whole += Slice;
        if (!Whole.IsValid)
        {
            OutError = TEXT("No exposed upper-arm surface bounds");
            return false;
        }
        for (int32 Slice = 0; Slice < 3; ++Slice)
        {
            // Empty sparse slices retain the whole measured cross-section.
            FBox Bounds = ArmBounds[Side][Slice].IsValid ? ArmBounds[Side][Slice] : Whole;
            // Adjacent slices meet at exact axial boundaries; vertex sampling
            // must not introduce gaps into the enclosing union of boxes.
            Bounds.Min.X = Measured.BindUpperLengthCm[Side] * (0.23f + Slice * (0.77f / 3.f));
            Bounds.Max.X = Measured.BindUpperLengthCm[Side] * (0.23f + (Slice + 1) * (0.77f / 3.f));
            for (int32 Corner = 0; Corner < 8; ++Corner)
            {
                const FVector Point((Corner & 1) ? Bounds.Max.X : Bounds.Min.X,
                    (Corner & 2) ? Bounds.Max.Y : Bounds.Min.Y,
                    (Corner & 4) ? Bounds.Max.Z : Bounds.Min.Z);
                Measured.UpperTorsoPoints[Side].Add(Bind[Upper[Side]].GetRotation().UnrotateVector(
                    ArmAxis[Side] * Point.X + ArmCross[Side] * Point.Y + ArmDepth[Side] * Point.Z));
            }
        }
    }

    for (auto& Band : Measured.TorsoBands) Band = HullGeometry(Band);
    Measured.HeadHull = HullGeometry(Measured.HeadHull);
    // Actors using the same immutable render resource share the expensive skin
    // geometry and preparation identity. Weak entries do not keep unused rigs alive.
    // Editor rebuilds/reimports change the derived-data key or render resource.
    struct FSharedSkinEntry
    {
        TWeakObjectPtr<const USkeletalMesh> Mesh;
        const FSkeletalMeshRenderData* RenderData = nullptr;
        FString Revision;
        TWeakPtr<const FFlowArtsSkinnedClearanceData, ESPMode::ThreadSafe> Skin;
    };
    static TArray<FSharedSkinEntry> SharedSkins;
    FString Revision;
#if WITH_EDITORONLY_DATA
    Revision = RenderData->DerivedDataKey;
#endif
    SharedSkins.RemoveAll([](const FSharedSkinEntry& Entry) {
        return !Entry.Mesh.IsValid() || !Entry.Skin.IsValid();
    });
    for (const FSharedSkinEntry& Entry : SharedSkins)
        if (Entry.Mesh.Get() == Mesh && Entry.RenderData == RenderData && Entry.Revision == Revision)
            if (auto Shared = Entry.Skin.Pin())
            {
                Measured.SkinnedClearance = MoveTemp(Shared);
                OutEnvelope = MoveTemp(Measured);
                return true;
            }
    auto Skin = MakeShared<FFlowArtsSkinnedClearanceData, ESPMode::ThreadSafe>();
    FString SkinError;
    if (FFlowArtsSkinnedClearance::Build(Mesh, *Skin, SkinError))
    {
        Measured.SkinnedClearance = Skin;
        if (SharedSkins.Num() >= 32) SharedSkins.RemoveAt(0);
        FSharedSkinEntry& Entry = SharedSkins.AddDefaulted_GetRef();
        Entry.Mesh = Mesh;
        Entry.RenderData = RenderData;
        Entry.Revision = MoveTemp(Revision);
        Entry.Skin = Skin;
    }
    else
    {
        Measured.SkinnedClearanceError = SkinError;
        static TSet<FString> WarnedMeshes;
        const FString MeshPath = Mesh->GetPathName();
        if (!WarnedMeshes.Contains(MeshPath))
        {
            WarnedMeshes.Add(MeshPath);
            UE_LOG(LogTemp, Warning, TEXT("Weighted arm clearance unavailable for %s: %s"), *MeshPath, *SkinError);
        }
    }
    OutEnvelope = Measured;
    return true;
}

float FFlowArtsArmClearance::BoxHullPenetrationCm(const TArray<FVector>& Box,
    const FFlowArtsClearanceHull& Hull, float PaddingCm)
{
    const auto Geometry = Hull.Vertices.IsEmpty() ? HullGeometry(Hull) : Hull;
    return BoxHullDepth(Box, Geometry, PaddingCm);
}

float FFlowArtsArmClearance::HullPenetrationCm(
    const FFlowArtsClearanceCapsule& Arm, const FFlowArtsClearanceHull& Hull, float PaddingCm)
{
    if (Hull.Planes.IsEmpty() || Arm.RadiusCm <= 0.f) return 0.f;
    const FVector Axis = Arm.End - Arm.Start;
    // Distance to the expanded plane hull is conservative at corners. Minimise
    // its convex piecewise-linear clearance along the complete arm segment.
    // Interval clipping avoids sample gaps, including a forearm crossing a thin band.
    float LowerDepth = 0.f;
    float UpperDepth = Arm.RadiusCm + PaddingCm;
    struct FPlaneClip
    {
        float A;
        float B = 0.f;
        bool bHasB = false;
    };
    TArray<FPlaneClip, TInlineAllocator<32>> Clips;
    Clips.Reserve(Hull.Planes.Num());
    for (const auto& Plane : Hull.Planes)
    {
        const double StartProjection = FVector::DotProduct(Plane.Normal, Arm.Start);
        const double EndProjection = FVector::DotProduct(Plane.Normal, Arm.End);
        UpperDepth = FMath::Max(UpperDepth, static_cast<float>(Arm.RadiusCm + PaddingCm
            - FMath::Min(StartProjection, EndProjection) + Plane.OffsetCm));
        FPlaneClip Clip;
        Clip.A = StartProjection - Plane.OffsetCm;
        Clips.Add(Clip);
    }
    const auto IntersectsAtDepth = [&](float Depth)
    {
        float Low = 0.f, High = 1.f;
        for (int32 PlaneIndex = 0; PlaneIndex < Hull.Planes.Num(); ++PlaneIndex)
        {
            auto& Clip = Clips[PlaneIndex];
            // Preserve the original float rounding and clipping order. Lazily
            // cache B so an early separating plane does not add unused work.
            if (!Clip.bHasB)
            {
                Clip.B = FVector::DotProduct(Hull.Planes[PlaneIndex].Normal, Axis);
                Clip.bHasB = true;
            }
            const float A = Clip.A;
            const float B = Clip.B;
            const float Limit = Arm.RadiusCm + PaddingCm - Depth;
            if (FMath::Abs(B) < SMALL_NUMBER) { if (A > Limit) return false; }
            else if (B > 0.f) High = FMath::Min(High, (Limit - A) / B);
            else Low = FMath::Max(Low, (Limit - A) / B);
            if (Low > High) return false;
        }
        return true;
    };
    if (!IntersectsAtDepth(0.f)) return 0.f;
    for (int32 Iteration = 0; Iteration < 16; ++Iteration)
    {
        const float Mid = (LowerDepth + UpperDepth) * 0.5f;
        if (IntersectsAtDepth(Mid)) LowerDepth = Mid; else UpperDepth = Mid;
    }
    return LowerDepth;
}

float FFlowArtsArmClearance::CapsulePenetrationCm(
    const FFlowArtsClearanceCapsule& A, const FFlowArtsClearanceCapsule& B, float PaddingCm)
{
    if (A.RadiusCm <= 0.f || B.RadiusCm <= 0.f) return 0.f;
    const float SurfaceDistance = FMath::Sqrt(SegmentDistanceSquared(A.Start, A.End, B.Start, B.End));
    return FMath::Max(0.f, A.RadiusCm + B.RadiusCm + FMath::Max(0.f, PaddingCm) - SurfaceDistance);
}

FFlowArtsArmClearanceResult FFlowArtsArmClearance::Solve(
    const FFlowArtsArmClearanceInput& SourceInput, FFlowArtsArmClearanceHistory& History)
{
    FClearancePhaseTiming PhaseTiming;
    FFlowArtsArmClearanceInput Input = SourceInput;
    if (PhaseTiming.bEnabled && Input.CertifySkinnedUpperTorso)
    {
        const auto Certificate = Input.CertifySkinnedUpperTorso;
        Input.CertifySkinnedUpperTorso = [&, Certificate](const FFlowArtsClearanceArm* Arms, const FQuat& Rotation, bool bPair)
        {
            FScopedClearancePhaseTimer Timer(&PhaseTiming.CertificateMs);
            ++PhaseTiming.CertificateCount;
            return Certificate(Arms, Rotation, bPair);
        };
    }
    if (PhaseTiming.bEnabled && Input.EvaluateSkinnedContacts)
    {
        const auto Witness = Input.EvaluateSkinnedContacts;
        Input.EvaluateSkinnedContacts = [&, Witness](const FFlowArtsClearanceArm* Arms, const FQuat& Rotation)
        {
            FScopedClearancePhaseTimer Timer(&PhaseTiming.WitnessMs);
            ++PhaseTiming.WitnessCount;
            return Witness(Arms, Rotation);
        };
    }
    for (auto& Hull : Input.TorsoHulls)
        if (Hull.Vertices.IsEmpty()) Hull = HullGeometry(Hull);
    FFlowArtsArmClearanceResult Result;
    Result.AddedTorsoPitch=Input.AddedTorsoPitch;
    Result.NeckCounterFraction=Input.NeckCounterFraction;
    Result.Arms[0] = Input.Arms[0];
    Result.Arms[1] = Input.Arms[1];
    Result.OriginalWrists[0] = Input.Arms[0].Wrist.GetLocation();
    Result.OriginalWrists[1] = Input.Arms[1].Wrist.GetLocation();
    Result.bMeasuredSurface = Input.bMeasuredSurface;
    for (int32 Side = 0; Side < 2; ++Side)
        Result.OriginalHeldPropCapsules[Side] = Input.HeldPropCapsules[Side];

    bool bContinuous = History.bValid;
    if (bContinuous)
    {
        for (int32 Side = 0; Side < 2; ++Side)
        {
            const float ArmLength = FVector::Dist(Input.Arms[Side].Upper.GetLocation(), Input.Arms[Side].Elbow.GetLocation())
                + FVector::Dist(Input.Arms[Side].Elbow.GetLocation(), Input.Arms[Side].Wrist.GetLocation());
            if (FVector::Dist(History.PreviousShoulders[Side], Input.Arms[Side].Upper.GetLocation()) > ArmLength * 0.35f ||
                FVector::Dist(History.PreviousWrists[Side], Input.Arms[Side].Wrist.GetLocation()) > ArmLength * 0.35f)
                bContinuous = false;
        }
    }
    bool bRejectedGuideContinuous = History.bRejectedGuideValid &&
        History.bRejectedPreserveWrist == Input.bPreserveWrist;
    if (bRejectedGuideContinuous)
        for (int32 Side = 0; Side < 2; ++Side)
        {
            const float ArmLength = FVector::Dist(Input.Arms[Side].Upper.GetLocation(), Input.Arms[Side].Elbow.GetLocation())
                + FVector::Dist(Input.Arms[Side].Elbow.GetLocation(), Input.Arms[Side].Wrist.GetLocation());
            if (FVector::Dist(History.RejectedAuthoredShoulders[Side], Input.Arms[Side].Upper.GetLocation()) > ArmLength * .35f ||
                FVector::Dist(History.RejectedAuthoredWrists[Side], Input.Arms[Side].Wrist.GetLocation()) > ArmLength * .35f)
                bRejectedGuideContinuous = false;
        }
    const uint8 RequiredUpperSkinMask =
        (Input.CertifySkinnedUpperTorso && Input.bCanCertifySkinnedUpperTorso) ? 3 : 0;
    const uint8 RequiredOppositePropMask = Input.CertifySkinnedOppositeProps
        ? uint8((!Input.HeldPropCapsules[1].IsEmpty() ? 8 : 0)
            | (!Input.HeldPropCapsules[0].IsEmpty() ? 16 : 0)) : 0;
    const uint8 RequiredHeldPropBodyMask = Input.CertifySkinnedHeldPropBody
        ? uint8((!Input.HeldPropCapsules[0].IsEmpty() ? 32 : 0)
            | (!Input.HeldPropCapsules[1].IsEmpty() ? 64 : 0)) : 0;
    const uint8 RequiredDistalPropMask = Input.CertifySkinnedSegments
        ? uint8((!Input.HeldPropCapsules[1].IsEmpty() ? 16 : 0)
            | (!Input.HeldPropCapsules[0].IsEmpty() ? 32 : 0)) : 0;
    const auto HasCompleteSkinCertificate = [&](uint8 Mask, uint8 SegmentMask)
    {
        if ((Mask & RequiredUpperSkinMask) != RequiredUpperSkinMask) return false;
        // Distal proofs cover hands and fingers, but cannot replace whole-arm
        // coverage: two upper arms can intersect while both distal regions clear.
        if ((Input.CertifySkinnedSegments ||
            (Input.CertifySkinnedUpperTorso && Input.bCanCertifySkinnedArmPair)) && !(Mask & 4)) return false;
        if ((Mask & RequiredOppositePropMask) != RequiredOppositePropMask) return false;
        if ((Mask & RequiredHeldPropBodyMask) != RequiredHeldPropBodyMask) return false;
        if (Input.CertifySkinnedSegments)
        {
            if ((SegmentMask & 3) != 3 ||
                (SegmentMask & RequiredDistalPropMask) != RequiredDistalPropMask) return false;
        }
        return true;
    };
    const auto ResultSkinMask = [](const FFlowArtsArmClearanceResult& Pose)
    {
        return uint8(Pose.SkinnedUpperTorsoClearMask
            | (Pose.bSkinnedArmPairClear ? 4 : 0) | Pose.SkinnedOppositePropClearMask
            | Pose.SkinnedHeldPropBodyClearMask);
    };
    const auto IsCertifiedClear = [&](const FFlowArtsArmClearanceResult& Pose)
    { return Pose.WorstPenetrationCm <= .02f &&
        HasCompleteSkinCertificate(ResultSkinMask(Pose), Pose.SkinnedSegmentClearMask); };
    // Proxy-clear poses require fresh certificates for every available weighted surface.
    Result.WorstPenetrationCm = TNumericLimits<float>::Max();
    FFlowArtsArmClearanceResult UncertifiedClearFallback;
    float UncertifiedClearScore = TNumericLimits<float>::Max();
    float BestScore = TNumericLimits<float>::Max();
    float SelectedWristOffsetCm = 0.f;
    float SelectedWristAbductionDeg = 0.f;
    const bool bClavicleResponse = Input.bMeasuredSurface && Input.bPreserveWrist &&
        Input.bAllowSharedPerformanceTranslation && Input.CertifySkinnedUpperTorso && Input.bCanCertifySkinnedUpperTorso &&
        Input.Arms[0].bHasClavicle && Input.Arms[1].bHasClavicle;
#if WITH_DEV_AUTOMATION_TESTS
    // Offline replay diagnostic only. Shipping builds retain every normal limit.
    const bool bDeepSearch = FParse::Param(FCommandLine::Get(), TEXT("FlowArtsReplayDeepSearch"));
#else
    constexpr bool bDeepSearch = false;
#endif
    // Reserve six of the same eight exact queries for two independent planes:
    // each gets a coarse certificate plus two refreshed contact refinements.
    int32 SkinQueryBudget = bClavicleResponse ? 2 : 8;
    uint32 LastDeepSkipReason = 0;
    FFlowArtsArmClearanceResult BestProxySharedPose;
    float BestProxySharedScore = TNumericLimits<float>::Max();
    float RetainedSharedRankScore = TNumericLimits<float>::Max();
    struct FJointSeed { FFlowArtsArmClearanceResult Pose; float Score; float LeftPole; float RightPole; bool bWideAnchored = false; bool bDynamicGuideEligible = false; double ContactGuidedScore = TNumericLimits<double>::Max(); };
    TFunction<bool(const FJointSeed&, FJointSeed&)> RefineContacts;
    double LastContactRefinementProgress = 0.;
    TArray<FJointSeed> JointSeeds;
    FFlowArtsArmClearanceResult JointReferencePose;
    bool bJointValidation = false;
    bool bRankingAnchoredWide = false;
    uint8 LastJointCertificate = 0;
    bool bJointRanking = false;
    bool bWideRanking = false;
    float ActiveClavicleDeg[2] = {0.f, 0.f};
    float ActiveAxialDeg[2] = {0.f, 0.f};
    bool bClosestClaviclePole = false;
    FVector ClaviclePoles[2];
    FFlowArtsClearanceArm ClavicleReferenceArms[2];
    int32 UnshiftedSkinQueryBudget = Input.bAllowSharedPerformanceTranslation ? 2 : 8;
    int32 HistorySkinQueryBudget = 2;
    int32 JointReservedQueries = 6;
    TOptional<FJointSeed> LastHistorySeed;
    TOptional<FJointSeed> LastRejectedGuideSeed;
    TOptional<FJointSeed> BestRejectedGuideSeed;
    double BestRejectedGuideRank = TNumericLimits<double>::Max();
    TOptional<FJointSeed> LastSoftSeed;
    float LastSoftOffsetCm = 0.f, LastSoftAbductionDeg = 0.f;
    bool bTestingSharedHistory = false;
    bool bTestingRejectedGuide = false;
    FVector ActiveSharedTranslation = FVector::ZeroVector;
    int32 SharedCandidateCount = 0, SharedHeadPropRejectedCount = 0, SharedReachRejectedCount = 0;
    int32 SharedNoIKCount = 0, SharedRankedSeedCount = 0, SharedFullSearchCount = 0;
    float BestSharedPenetrationCm = TNumericLimits<float>::Max();
    float SourceTravelCm = 0.f;
    if (bContinuous)
        for (int32 Side = 0; Side < 2; ++Side)
            SourceTravelCm = FMath::Max(SourceTravelCm, FVector::Dist(History.PreviousWrists[Side], Input.Arms[Side].Wrist.GetLocation()));
    // Compare certified branches in the same coordinates that are actually
    // published. Source travel permits a moving clip to change its correction,
    // but a stationary source cannot justify a sudden new torso/hand basin.
    const auto ContinuityStep = [&](const FQuat& Torso, const FVector& Shared,
        const float* Clavicles, const FFlowArtsClearanceArm& Left,
        const FFlowArtsClearanceArm& Right)
    {
        if (!bContinuous) return 0.f;
        float Step = FVector::Dist(Shared, History.PreviousSharedPerformanceTranslationCm);
        Step += FMath::RadiansToDegrees(Torso.AngularDistance(History.PreviousTorsoRotation)) * .4f;
        const FFlowArtsClearanceArm* Arms[2] = {&Left, &Right};
        for (int32 Side = 0; Side < 2; ++Side)
        {
            Step += FMath::Abs(Clavicles[Side] - History.PreviousClavicleProtractionDeg[Side]) * .15f;
            Step += FVector::Dist(Arms[Side]->Elbow.GetLocation(), History.PreviousElbows[Side]) * .2f;
        }
        return Step;
    };
    const auto CandidateContinuityStep = [&](const FArmCandidate& Left, const FArmCandidate& Right,
        const FQuat& Torso, const FVector& Shared, const float* Clavicles)
    { return ContinuityStep(Torso, Shared, Clavicles, Left.Arm, Right.Arm); };
    const auto ResultContinuityStep = [&](const FFlowArtsArmClearanceResult& Pose)
    { return ContinuityStep(Pose.TorsoRotation, Pose.SharedPerformanceTranslationCm,
        Pose.ClavicleProtractionDeg, Pose.Arms[0], Pose.Arms[1]); };
    const float ContinuousStepLimitCm = FMath::Max(8.f, SourceTravelCm * 5.f);
    TArray<FArmCandidate> Candidates[2];
    for (TArray<FArmCandidate>& ArmCandidates : Candidates) ArmCandidates.Reserve(PoleSamples + 2);
    FClearanceTorsoFaceSupports TorsoFaceSupports;
    FRigidPropGeometryCache RigidPropCache;
    const auto Consider = [&](const FFlowArtsArmClearanceInput& CandidateInput, const FQuat& TorsoRotation, float WristOffsetCm, int32 FastMode = 0, float WristAbductionDeg = 0.f)
    {
        FScopedClearancePhaseTimer Timer(PhaseTiming.bEnabled ? &PhaseTiming.ConsiderMs : nullptr);
        if (PhaseTiming.bEnabled) ++PhaseTiming.ConsiderCount;
        float LocalBestScore = TNumericLimits<float>::Max();
        RetainedSharedRankScore = TNumericLimits<float>::Max();
        const bool bRankSharedOnly = FastMode == 4;
        const bool bSoftTarget = WristOffsetCm > 0.f || WristAbductionDeg > 0.f;
        const bool bSharedTarget = !ActiveSharedTranslation.IsNearlyZero();
        const bool bMovedClavicle = ActiveClavicleDeg[0] > 0.f || ActiveClavicleDeg[1] > 0.f;
        const bool bMovedTorso = !TorsoRotation.Equals(FQuat::Identity, 0.00001f);
        FTransform SoftWrists[2] = {Input.Arms[0].Wrist, Input.Arms[1].Wrist};
        FFlowArtsArmClearanceInput SoftGeometry;
        if (bSoftTarget || bSharedTarget)
        {
            SoftGeometry = CandidateInput;
            for (int32 Side = 0; Side < 2; ++Side)
            {
                FTransform& SoftWrist = SoftWrists[Side];
                const auto& Arm = CandidateInput.Arms[Side];
                const FVector Shoulder = Arm.Upper.GetLocation();
                const FVector Outward = (Input.Arms[Side].Upper.GetLocation()
                    - Input.Arms[1 - Side].Upper.GetLocation()).GetSafeNormal();
                const float Reach = FVector::Dist(Shoulder, Arm.Elbow.GetLocation())
                    + FVector::Dist(Arm.Elbow.GetLocation(), Arm.Wrist.GetLocation());
                FVector Desired = SoftWrist.GetLocation() + Outward * WristOffsetCm + ActiveSharedTranslation;
                if (WristAbductionDeg > 0.f)
                {
                    // Translate-only targets exhaust reach before opening the shoulder.
                    // Rotate the authored reach vector instead: its length stays legal.
                    const FVector AuthoredReach = SoftWrist.GetLocation() - Shoulder;
                    const FVector Axis = FVector::CrossProduct(AuthoredReach.GetSafeNormal(), Outward).GetSafeNormal();
                    const FQuat Abduction = Axis.IsNearlyZero() ? FQuat::Identity
                        : FQuat(Axis, FMath::DegreesToRadians(WristAbductionDeg));
                    Desired = Shoulder + Abduction.RotateVector(AuthoredReach);
                    Desired = SoftWrist.GetLocation() + (Desired - SoftWrist.GetLocation()).GetClampedToMaxSize(Reach * .7f);
                }
                const FVector Delta = Desired - Shoulder;
                // Shared targets must stay rigidly paired: reject unreachable targets, never clamp one hand.
                if (bSharedTarget && Delta.Size() > Reach + .001f)
                {
                    ++SharedReachRejectedCount;
                    if (bClosestClaviclePole || bJointValidation) UE_LOG(LogFlowArtsClearance, Verbose,
                        TEXT("Clavicle %.0f/%.0f shift=%s side=%d reach rejected distance=%.6f reach=%.6f"),
                        ActiveClavicleDeg[0], ActiveClavicleDeg[1], *ActiveSharedTranslation.ToString(), Side, Delta.Size(), Reach);
                    return LocalBestScore;
                }
                SoftWrist.SetLocation(bSharedTarget ? Desired : Shoulder + Delta.GetClampedToMaxSize(Reach));
                const FVector Shift = SoftWrist.GetLocation() - Input.Arms[Side].Wrist.GetLocation();
                for (auto& Prop : SoftGeometry.HeldPropCapsules[Side])
                { Prop.Start += Shift; Prop.End += Shift; }
            }
        }
        const FFlowArtsArmClearanceInput& Geometry = (bSoftTarget || bSharedTarget) ? SoftGeometry : CandidateInput;
        const FHeldPropBodyDepths& HeldPropDepths = RigidPropCache.Body(Geometry);
        TorsoFaceSupports.Update(Geometry);
        for (int32 Side = 0; Side < 2; ++Side)
        {
            Candidates[Side].Reset();
            if (FastMode == 1 || FastMode == 5)
            {
                FArmCandidate Authored;
                Authored.Arm = CandidateInput.Arms[Side];
                Candidates[Side].Add(MoveTemp(Authored));
            }
            else if (bRankSharedOnly)
            {
                // Rank retained obstacles across elbow poles, not just the authored
                // pole or conservative upper-arm boxes. This is never a verdict.
                const auto& Arm = CandidateInput.Arms[Side];
                const FVector Shoulder = Arm.Upper.GetLocation();
                const FVector Axis = (SoftWrists[Side].GetLocation() - Shoulder).GetSafeNormal();
                const FVector Pole = bMovedClavicle ? ClavicleReferenceArms[Side].Elbow.GetLocation() : Arm.Elbow.GetLocation();
                FVector Radial = FVector::VectorPlaneProject(Pole - Shoulder, Axis).GetSafeNormal();
                if (Radial.IsNearlyZero()) Radial = FVector::CrossProduct(Axis, FVector::UpVector).GetSafeNormal();
                if (Radial.IsNearlyZero()) Radial = FVector::CrossProduct(Axis, FVector::RightVector).GetSafeNormal();
                const int32 PoleCount = bWideRanking ? 24 : bMovedClavicle ? 3 : 8;
                for (int32 Sample = 0; Sample < PoleCount; ++Sample)
                {
                    // Retain the closest bend and both adjacent branches.
                    const float Degrees = bWideRanking ? Sample * 15.f : bMovedClavicle ? (Sample == 0 ? 0.f : Sample == 1 ? -30.f : 30.f)
                        : Sample * 360.f / PoleCount;
                    const int32 Before = Candidates[Side].Num();
                    AddPole(Candidates[Side], Arm, Shoulder + FQuat(Axis, FMath::DegreesToRadians(Degrees)).RotateVector(Radial) * 100.f,
                        nullptr, SoftWrists[Side]);
                    if (Candidates[Side].Num() > Before) Candidates[Side].Last().PoleDegrees = Degrees;
                }
            }
            else if (bClosestClaviclePole)
            {
                const auto& Arm = CandidateInput.Arms[Side];
                const FVector Shoulder = Arm.Upper.GetLocation();
                const FVector Axis = (SoftWrists[Side].GetLocation() - Shoulder).GetSafeNormal();
                FVector Radial = FVector::VectorPlaneProject(ClaviclePoles[Side] - Shoulder, Axis).GetSafeNormal();
                if (Radial.IsNearlyZero()) Radial = FVector::CrossProduct(Axis, FVector::UpVector).GetSafeNormal();
                if (Radial.IsNearlyZero()) Radial = FVector::CrossProduct(Axis, FVector::RightVector).GetSafeNormal();
                // The closest bend can intersect the opposite moving staff.
                // Search the same fixed-length elbow circle, retaining the
                // closest pole first and ranking every complete pair below.
                AddPole(Candidates[Side], Arm, ClaviclePoles[Side],
                    bContinuous ? &History.PreviousElbows[Side] : nullptr, SoftWrists[Side]);
                for (int32 Sample = 1; Sample < PoleSamples; ++Sample)
                    AddPole(Candidates[Side], Arm,
                        Shoulder + FQuat(Axis, Sample * 2.f * PI / PoleSamples).RotateVector(Radial) * 100.f,
                        bContinuous ? &History.PreviousElbows[Side] : nullptr, SoftWrists[Side]);
            }
            else if (FastMode == 2 || FastMode == 3 || FastMode == 6 || FastMode == 7)
                AddPole(Candidates[Side], CandidateInput.Arms[Side],
                    FastMode == 2 ? History.PreviousElbows[Side] : FastMode == 6
                        ? History.RejectedElbows[Side] : FastMode == 7
                            ? Input.PreparedSeed->SolvedElbows[Side] : CandidateInput.Arms[Side].Elbow.GetLocation(),
                    bContinuous ? &History.PreviousElbows[Side] : nullptr, SoftWrists[Side]);
            else
                BuildCandidates(CandidateInput.Arms[Side], bContinuous ? &History.PreviousElbows[Side] : nullptr,
                    Candidates[Side], (bMovedTorso || bSoftTarget || bSharedTarget || bMovedClavicle) ? &SoftWrists[Side] : nullptr);
            for (FArmCandidate& Candidate : Candidates[Side])
            {
                if ((bClosestClaviclePole || FastMode == 6 || FastMode == 7 || (bRankSharedOnly && bMovedClavicle)) && FastMode != 5)
                {
                    // Reconstruct from the selected pre-protraction pose. Rotating
                    // the whole arm first and then composing another shortest-arc
                    // IK rotation introduces an unintended axial roll.
                    const auto& Before = ClavicleReferenceArms[Side];
                    auto& After = Candidate.Arm;
                    After.Upper.SetRotation((FQuat::FindBetweenNormals(
                        (Before.Elbow.GetLocation() - Before.Upper.GetLocation()).GetSafeNormal(),
                        (After.Elbow.GetLocation() - After.Upper.GetLocation()).GetSafeNormal()) *
                        Before.Upper.GetRotation()).GetNormalized());
                    After.Elbow.SetRotation((FQuat::FindBetweenNormals(
                        (Before.Wrist.GetLocation() - Before.Elbow.GetLocation()).GetSafeNormal(),
                        (After.Wrist.GetLocation() - After.Elbow.GetLocation()).GetSafeNormal()) *
                        Before.Elbow.GetRotation()).GetNormalized());
                }
                if (FastMode != 5 && !FMath::IsNearlyZero(ActiveAxialDeg[Side]))
                {
                    const FVector Axis = (Candidate.Arm.Elbow.GetLocation() - Candidate.Arm.Upper.GetLocation()).GetSafeNormal();
                    Candidate.Arm.Upper.SetRotation((FQuat(Axis, FMath::DegreesToRadians(ActiveAxialDeg[Side])) *
                        Candidate.Arm.Upper.GetRotation()).GetNormalized());
                }
                if (FastMode == 7)
                {
                    // Endpoints and named axial correction do not determine the
                    // complete roll of a previously solved bone. Carry its full
                    // orientation along each new segment; the same source pose
                    // reproduces the saved frames exactly, while a nearby phase
                    // still rebuilds its endpoints and receives a fresh certificate.
                    const auto* Prepared = Input.PreparedSeed;
                    const FVector OldUpper = (Prepared->SolvedElbows[Side] - Prepared->SolvedShoulders[Side]).GetSafeNormal();
                    const FVector NewUpper = (Candidate.Arm.Elbow.GetLocation() - Candidate.Arm.Upper.GetLocation()).GetSafeNormal();
                    const FVector OldForearm = (Prepared->SolvedWrists[Side] - Prepared->SolvedElbows[Side]).GetSafeNormal();
                    const FVector NewForearm = (Candidate.Arm.Wrist.GetLocation() - Candidate.Arm.Elbow.GetLocation()).GetSafeNormal();
                    Candidate.Arm.Upper.SetRotation((FQuat::FindBetweenNormals(OldUpper, NewUpper)
                        * Prepared->SolvedUpperRotation[Side]).GetNormalized());
                    Candidate.Arm.Elbow.SetRotation((FQuat::FindBetweenNormals(OldForearm, NewForearm)
                        * Prepared->SolvedForearmRotation[Side]).GetNormalized());
                }
                if (FastMode == 2 && bTestingSharedHistory && bContinuous)
                {
                    // The solved endpoints do not determine axial roll. A paused
                    // source retains its actual solved rotations, not a second
                    // shortest-arc reconstruction through a protracted clavicle.
                    const auto& Source = Input.Arms[Side];
                    const FTransform Frames[] = {Source.Clavicle, Source.Upper, Source.Elbow, Source.Wrist};
                    bool bSameSource = true;
                    for (int32 Frame = 0; Frame < 4; ++Frame)
                        bSameSource &= Frames[Frame].Equals(History.PreviousAuthoredArmTransforms[Side][Frame], 0.f);
                    if (bSameSource && Candidate.Arm.Upper.GetLocation().Equals(History.PreviousSolvedShoulders[Side], .00001f)
                        && Candidate.Arm.Elbow.GetLocation().Equals(History.PreviousElbows[Side], .00001f))
                    {
                        Candidate.Arm.Upper.SetRotation(History.PreviousSolvedUpperRotation[Side]);
                        Candidate.Arm.Elbow.SetRotation(History.PreviousSolvedForearmRotation[Side]);
                    }
                }
                Candidate.AuthoredElbowMotionCm = FVector::Dist(
                    Candidate.Arm.Elbow.GetLocation(), Input.Arms[Side].Elbow.GetLocation());
                if (!bContinuous) Candidate.PreviousElbowMotionCm = Candidate.AuthoredElbowMotionCm;
                // Body/prop clearance depends on one arm, so compute it once per
                // candidate rather than repeating convex clipping for every pair.
                // Joint ranking used to overwrite an earlier retained-only measurement.
                // Perform its final face-axis measurement directly, in the same order.
                MeasureSide(Geometry, Candidate.Arm, Side, Candidate.BodyWorst, Candidate.BodyTotal, Candidate.Contact,
                    bJointRanking ? false : bRankSharedOnly, &Candidate.NonUpperTorsoWorst,
                    bJointRanking, &HeldPropDepths, &TorsoFaceSupports, false,
                    &Candidate.NonSkinnedWorst, &Candidate.OppositePropWorst, false, &Candidate.HeldPropBodyWorst);
            }
            if (bJointRanking && Candidates[Side].Num() > 0)
            {
                // Keep every nearby branch: capsule ranking must not remove
                // the sole skin-clear elbow before paired validation.
                // Hull face axes provide soft ordering here. This mode cannot
                // accept a pose: final FastMode5 remeasures the complete SAT.
                if (bWideRanking)
                {
                    Candidates[Side].Sort([](const FArmCandidate& A, const FArmCandidate& B)
                    {
                        return A.NonSkinnedWorst * 1000.f + A.BodyWorst * 60.f + A.BodyTotal * 2.f
                            < B.NonSkinnedWorst * 1000.f + B.BodyWorst * 60.f + B.BodyTotal * 2.f;
                    });
                    TArray<FArmCandidate> Diverse;
                    if (FMath::IsNearlyZero(ActiveClavicleDeg[Side]))
                    {
                        // The unprotracted arm has an anatomical reference bend.
                        // Proxy clearance alone can discard it even when that
                        // bend is the skin-clear branch after the chest turns.
                        const FArmCandidate* Reference = Candidates[Side].FindByPredicate([](const FArmCandidate& Arm)
                        { return FMath::Abs(FMath::FindDeltaAngleDegrees(Arm.PoleDegrees, 0.f)) < 7.5f; });
                        if (Reference) Diverse.Add(*Reference);
                    }
                    for (const auto& Arm : Candidates[Side])
                        if (!Diverse.ContainsByPredicate([&](const FArmCandidate& Kept)
                            { return FMath::Abs(FMath::FindDeltaAngleDegrees(Kept.PoleDegrees, Arm.PoleDegrees)) < 45.f; }))
                        { Diverse.Add(Arm); if (Diverse.Num() == 3) break; }
                    Candidates[Side] = MoveTemp(Diverse);
                }
            }
        }
        if (bSharedTarget && (Candidates[0].IsEmpty() || Candidates[1].IsEmpty())) ++SharedNoIKCount;
        const float TorsoTravelDeg = FMath::RadiansToDegrees(TorsoRotation.AngularDistance(FQuat::Identity));
        const float PreviousTorsoTravelDeg = bContinuous
            ? FMath::RadiansToDegrees(TorsoRotation.AngularDistance(History.PreviousTorsoRotation)) : TorsoTravelDeg;
        if (bClosestClaviclePole || bJointValidation) UE_LOG(LogFlowArtsClearance, Verbose,
            TEXT("Clavicle %.0f/%.0f shift=%s IK candidates=%d/%d budget=%d"),
            ActiveClavicleDeg[0], ActiveClavicleDeg[1], *ActiveSharedTranslation.ToString(),
            Candidates[0].Num(), Candidates[1].Num(), SkinQueryBudget);
        const auto ScorePair = [&](const FArmCandidate& Left, const FArmCandidate& Right, float Worst, float Total)
        {
            return Worst * 1000.f + Total * 35.f
                + (Left.PreviousElbowMotionCm + Right.PreviousElbowMotionCm) * 0.15f
                + (Left.AuthoredElbowMotionCm + Right.AuthoredElbowMotionCm) * 0.06f
                + TorsoTravelDeg * 0.5f + PreviousTorsoTravelDeg * 0.3f
                + (FVector::Dist(Left.Arm.Wrist.GetLocation(), Input.Arms[0].Wrist.GetLocation())
                    + FVector::Dist(Right.Arm.Wrist.GetLocation(), Input.Arms[1].Wrist.GetLocation())) * .3f
                + CandidateContinuityStep(Left, Right, TorsoRotation, ActiveSharedTranslation, ActiveClavicleDeg);
        };
        const auto StorePose = [&](FFlowArtsArmClearanceResult& Pose, const FArmCandidate& Left,
            const FArmCandidate& Right, float Worst, float Total, const FContact& Contact,
            uint8 SkinClearMask, uint8 SegmentClearMask = 0, uint8 ForearmBodyMask = 0,
            uint8 ForearmHeadMask = 0)
        {
            Pose.Arms[0] = Left.Arm;
            Pose.Arms[1] = Right.Arm;
            for (int32 Side = 0; Side < 2; ++Side)
            {
                Pose.ClavicleProtractionDeg[Side] = ActiveClavicleDeg[Side];
                Pose.UpperAxialTwistDeg[Side] = ActiveAxialDeg[Side];
            }
            Pose.SkinnedUpperTorsoClearMask = SkinClearMask & 3;
            Pose.bSkinnedArmPairClear = Input.bCanCertifySkinnedArmPair && (SkinClearMask & 4);
            Pose.SkinnedOppositePropClearMask = SkinClearMask & 24;
            Pose.SkinnedHeldPropBodyClearMask = SkinClearMask & 96;
            Pose.SkinnedSegmentClearMask = SegmentClearMask;
            Pose.ForearmBodyClearMask = ForearmBodyMask & 3;
            Pose.ForearmHeadClearMask = ForearmHeadMask & 3;
            Pose.SharedPerformanceTranslationCm = ActiveSharedTranslation;
            Pose.WorstPenetrationCm = Worst;
            Pose.TotalPenetrationCm = Total;
            Pose.WorstArm = Contact.Arm;
            Pose.WorstSegment = Contact.Segment;
            Pose.WorstObstacleKind = Contact.Kind;
            Pose.WorstObstacleIndex = Contact.Index;
            Pose.TorsoHulls = Geometry.TorsoHulls;
            Pose.BodyCapsules = Geometry.BodyCapsules;
            Pose.TorsoRotation = TorsoRotation;
        };
        const auto Accept = [&](const FArmCandidate& Left, const FArmCandidate& Right,
            float Worst, float Total, const FContact& Contact,
            uint8 SkinClearMask = 0, uint8 SegmentClearMask = 0, uint8 ForearmBodyMask = 0,
            uint8 ForearmHeadMask = 0)
        {
            const float Score = ScorePair(Left, Right, Worst, Total);
            if (bRankSharedOnly)
            { LocalBestScore = FMath::Min(LocalBestScore, Score); return; }
            if (Worst <= .02f && !HasCompleteSkinCertificate(SkinClearMask, SegmentClearMask))
            {
                if (Score < UncertifiedClearScore)
                {
                    UncertifiedClearScore = Score;
                    StorePose(UncertifiedClearFallback, Left, Right, Worst, Total, Contact,
                        SkinClearMask, SegmentClearMask, ForearmBodyMask, ForearmHeadMask);
                }
                return;
            }
            if (bSharedTarget) BestSharedPenetrationCm = FMath::Min(BestSharedPenetrationCm, Worst);
            LocalBestScore = FMath::Min(LocalBestScore, Score);
            const bool bClear = Worst <= .02f;
            const bool bIncumbentClear = Result.WorstPenetrationCm <= .02f &&
                HasCompleteSkinCertificate(ResultSkinMask(Result), Result.SkinnedSegmentClearMask);
            // Feasibility precedes comfort and continuity cost.
            if (bIncumbentClear && !bClear) return;
            if (bClear && bIncumbentClear && bContinuous)
            {
                const bool bCandidateNear = CandidateContinuityStep(Left, Right, TorsoRotation,
                    ActiveSharedTranslation, ActiveClavicleDeg) <= ContinuousStepLimitCm;
                const bool bIncumbentNear = ResultContinuityStep(Result) <= ContinuousStepLimitCm;
                if (bCandidateNear != bIncumbentNear)
                {
                    if (!bCandidateNear) return;
                }
                else if (Score >= BestScore) return;
            }
            else if (bClear == bIncumbentClear && Score >= BestScore) return;
            BestScore = Score;
            SelectedWristOffsetCm = WristOffsetCm;
            SelectedWristAbductionDeg = WristAbductionDeg;
            StorePose(Result, Left, Right, Worst, Total, Contact, SkinClearMask, SegmentClearMask,
                ForearmBodyMask, ForearmHeadMask);
        };
        struct FPairRank { const FArmCandidate* Left; const FArmCandidate* Right; float Score;
            bool bRequestArmPair; uint8 RequestedPropSides; uint8 RequestedHeldPropBodySides;
            uint8 RequestedSegments; };
        TArray<FPairRank, TInlineAllocator<4>> SkinPairs;
        for (const FArmCandidate& Left : Candidates[0])
        for (const FArmCandidate& Right : Candidates[1])
        {
            float Worst = 0.f, Total = 0.f;
            FContact Contact;
            float PairWorst = 0.f;
            const uint8 RequestedPropSides = Input.CertifySkinnedOppositeProps
                ? uint8((!Geometry.HeldPropCapsules[1].IsEmpty() ? 1 : 0)
                    | (!Geometry.HeldPropCapsules[0].IsEmpty() ? 2 : 0)) : 0;
            const uint8 RequestedHeldPropBodySides = Input.CertifySkinnedHeldPropBody
                ? uint8((!Geometry.HeldPropCapsules[0].IsEmpty() ? 1 : 0)
                    | (!Geometry.HeldPropCapsules[1].IsEmpty() ? 2 : 0)) : 0;
            Measure(Geometry, Left, Right, Worst, Total, Contact, &PairWorst,
                bRankSharedOnly && Input.CertifySkinnedUpperTorso && Input.bCanCertifySkinnedArmPair);
            const uint8 RequestedSegments = Input.CertifySkinnedSegments
                ? uint8(3 | (!Geometry.HeldPropCapsules[1].IsEmpty() ? 16 : 0)
                    | (!Geometry.HeldPropCapsules[0].IsEmpty() ? 32 : 0)) : 0;
            Accept(Left, Right, Worst, Total, Contact);
            if (bRankSharedOnly)
            {
                if (bMovedClavicle)
                {
                    const float RetainedWorst = FMath::Max((Input.CertifySkinnedUpperTorso && Input.bCanCertifySkinnedArmPair)
                        ? 0.f : PairWorst,
                        FMath::Max(Left.NonSkinnedWorst, Right.NonSkinnedWorst));
                    // Retained obstacles dominate. The measured upper proxy is
                    // still useful geometric guidance, without making its box
                    // a verdict or letting continuity cost bury body clearance.
                    const float JointScore = RetainedWorst * 1000.f + Worst * 60.f + Total * 2.f
                        + (Left.AuthoredElbowMotionCm + Right.AuthoredElbowMotionCm) * .01f;
                    int32 Similar = JointSeeds.IndexOfByPredicate([&](const FJointSeed& Seed)
                    { return FVector::DistSquared(Seed.Pose.SharedPerformanceTranslationCm, ActiveSharedTranslation) < 16.f
                        && FMath::IsNearlyEqual(Seed.Pose.ClavicleProtractionDeg[0], ActiveClavicleDeg[0])
                        && FMath::IsNearlyEqual(Seed.Pose.ClavicleProtractionDeg[1], ActiveClavicleDeg[1])
                        && Seed.Pose.TorsoRotation.Equals(TorsoRotation, .00001f)
                        && FMath::IsNearlyEqual(Seed.Pose.UpperAxialTwistDeg[0], ActiveAxialDeg[0])
                        && FMath::IsNearlyEqual(Seed.LeftPole, Left.PoleDegrees)
                        && FMath::IsNearlyEqual(Seed.RightPole, Right.PoleDegrees); });
                    if (Similar == INDEX_NONE || JointScore < JointSeeds[Similar].Score)
                    {
                        if (Similar != INDEX_NONE) JointSeeds.RemoveAt(Similar);
                        FJointSeed Seed;
                        Seed.Score = JointScore; Seed.LeftPole = Left.PoleDegrees; Seed.RightPole = Right.PoleDegrees;
                        Seed.bWideAnchored = bRankingAnchoredWide;
                        StorePose(Seed.Pose, Left, Right, Worst, Total, Contact, 0);
                        JointSeeds.Add(MoveTemp(Seed));
                        JointSeeds.Sort([](const FJointSeed& A, const FJointSeed& B) { return A.Score < B.Score; });
                        int32 InStratum = 0;
                        for (int32 Index = 0; Index < JointSeeds.Num(); ++Index)
                            if (FMath::IsNearlyEqual(JointSeeds[Index].Pose.ClavicleProtractionDeg[0], ActiveClavicleDeg[0])
                                && FMath::IsNearlyEqual(JointSeeds[Index].Pose.ClavicleProtractionDeg[1], ActiveClavicleDeg[1])
                                && JointSeeds[Index].Pose.TorsoRotation.Equals(TorsoRotation, .00001f)
                                && FMath::IsNearlyEqual(JointSeeds[Index].Pose.UpperAxialTwistDeg[0], ActiveAxialDeg[0])
                                && FMath::IsNearlyEqual(JointSeeds[Index].LeftPole, Left.PoleDegrees)
                                && FMath::IsNearlyEqual(JointSeeds[Index].RightPole, Right.PoleDegrees)
                                && ++InStratum > (bDeepSearch ? 4 : 2)) { JointSeeds.RemoveAt(Index); break; }
                    }
                }
                // Preserve the independent ranking with conservative arm pairs.
                // Neither ranking is a collision certificate.
                if (bJointRanking) continue;
                Measure(Geometry, Left, Right, Worst, Total, Contact);
                RetainedSharedRankScore = FMath::Min(RetainedSharedRankScore, ScorePair(Left, Right, Worst, Total));
                continue;
            }
            if (bSharedTarget && !bMovedClavicle)
            {
                const float ProxyScore = ScorePair(Left, Right, Worst, Total);
                if (ProxyScore < BestProxySharedScore)
                {
                    BestProxySharedScore = ProxyScore;
                    StorePose(BestProxySharedPose, Left, Right, Worst, Total, Contact, 0);
                }
            }
            const int32 PhaseBudget = (bClosestClaviclePole || bJointValidation) ? SkinQueryBudget : bTestingSharedHistory ? HistorySkinQueryBudget
                : !bSharedTarget ? UnshiftedSkinQueryBudget : SkinQueryBudget;
            uint32 Skip = 0;
            if (!Input.CertifySkinnedUpperTorso && !Input.CertifySkinnedSegments &&
                !RequestedPropSides && !RequestedHeldPropBodySides && !Input.CertifyForearmBody &&
                !Input.CertifyForearmHead) Skip |= 1;
            if (Left.NonSkinnedWorst > .02f || Right.NonSkinnedWorst > .02f) Skip |= 2;
            if (PairWorst > .02f) Skip |= 4;
            if (SkinQueryBudget <= 0 || PhaseBudget <= 0) Skip |= 8;
            if (FastMode == 3) Skip |= 16;
            Result.SkinnedSkipReasons |= Skip;
            if (bDeepSearch && (Skip & ~uint32(2 | 4))) LastDeepSkipReason = Skip;
            Result.SkinnedBestOtherObstacleCm = FMath::Min(Result.SkinnedBestOtherObstacleCm,
                FMath::Max(PairWorst, FMath::Max(Left.NonSkinnedWorst, Right.NonSkinnedWorst)));
            // Other contacts remain measured, but do not block a useful
            // upper-only refinement of an otherwise infeasible candidate.
            if (Skip & ~uint32(2 | 4)) continue;
            // Rank complete paired poses, because torso blend weights can include
            // either arm. A skin certificate never overrides another obstacle.
            const float RemainingWorst = FMath::Max((Input.CertifySkinnedUpperTorso && Input.bCanCertifySkinnedArmPair)
                ? 0.f : PairWorst,
                FMath::Max(Left.NonSkinnedWorst, Right.NonSkinnedWorst));
            const float Score = ScorePair(Left, Right, RemainingWorst, 0.f) + Worst * 10.f + Total * .5f;
            int32 Insert = 0;
            while (Insert < SkinPairs.Num() && SkinPairs[Insert].Score <= Score) ++Insert;
            if (Insert < 4)
            {
                SkinPairs.Insert({&Left, &Right, Score,
                    !!Input.CertifySkinnedUpperTorso && Input.bCanCertifySkinnedArmPair,
                    RequestedPropSides, RequestedHeldPropBodySides, RequestedSegments}, Insert);
                if (SkinPairs.Num() > 4) SkinPairs.SetNum(4, EAllowShrinking::No);
            }
        }
        int32 ClavicleQueriesRemaining = 1;
        for (const FPairRank& Pair : SkinPairs)
        {
            // Each joint stratum gets one fresh certificate here; the caller
            // reserves separate queries for contact refinement and other planes.
            if ((bClosestClaviclePole || bJointValidation) && ClavicleQueriesRemaining <= 0) break;
            if (SkinQueryBudget <= 0 || (!bClosestClaviclePole && !bJointValidation && !bTestingSharedHistory && !bSharedTarget && UnshiftedSkinQueryBudget <= 0) ||
                (bTestingSharedHistory && HistorySkinQueryBudget <= 0)) break;
            FArmCandidate Refined[2] = {*Pair.Left, *Pair.Right};
            // Remove only the certifiable region to estimate improvement.
            // Body/forearm/head/own-prop contacts survive; arm pairs are optimistic
            // only when the callback supports an independent complete-pair verdict.
            for (int32 Side = 0; Side < 2; ++Side)
                MeasureSide(Geometry, Refined[Side].Arm, Side, Refined[Side].BodyWorst,
                    Refined[Side].BodyTotal, Refined[Side].Contact, !!Input.CertifySkinnedUpperTorso, nullptr, false,
                    nullptr, nullptr, (Pair.RequestedPropSides & (1 << Side)) != 0,
                    nullptr, nullptr, (Pair.RequestedHeldPropBodySides & (1 << Side)) != 0,
                    nullptr, Pair.RequestedSegments, !!Input.CertifyForearmBody,
                    !!Input.CertifyForearmHead);
            float Worst = 0.f, Total = 0.f;
            FContact Contact;
            Measure(Geometry, Refined[0], Refined[1], Worst, Total, Contact, nullptr,
                !!Input.CertifySkinnedUpperTorso && Input.bCanCertifySkinnedArmPair,
                Pair.RequestedSegments);
            // Do not spend a query when even every supported skin certificate
            // cannot improve the currently selected fully measured score.
            const float OptimisticScore = ScorePair(Refined[0], Refined[1], Worst, Total);
            if (bClosestClaviclePole || bJointValidation) UE_LOG(LogFlowArtsClearance, Verbose,
                TEXT("Clavicle %.0f/%.0f shift=%s optimistic worst=%.6f kind=%d index=%d arm=%d segment=%d score=%.6f best=%.6f"),
                ActiveClavicleDeg[0], ActiveClavicleDeg[1], *ActiveSharedTranslation.ToString(),
                Worst, Contact.Kind, Contact.Index, Contact.Arm, Contact.Segment, OptimisticScore, BestScore);
            if (bClosestClaviclePole || bJointValidation)
                for (int32 Side = 0; Side < 2; ++Side)
                    UE_LOG(LogFlowArtsClearance, Verbose, TEXT("Clavicle pre-query candidate side=%d C=%s U=%s E=%s W=%s"),
                        Side, *Refined[Side].Arm.Clavicle.ToString(), *Refined[Side].Arm.Upper.ToString(),
                        *Refined[Side].Arm.Elbow.ToString(), *Refined[Side].Arm.Wrist.ToString());
            const bool bIncumbentClear = Result.WorstPenetrationCm <= .02f &&
                HasCompleteSkinCertificate(ResultSkinMask(Result), Result.SkinnedSegmentClearMask);
            const bool bCouldClear = Worst <= .02f;
            // The offline deep probe needs actual certificates even when the
            // proxy score ranks a seed below an infeasible incumbent. Keep the
            // normal prune, and all final acceptance checks, in gameplay.
            const bool bProbeWideSeed = bDeepSearch && bJointValidation && FastMode == 5;
            const bool bProbeRejectedGuide = bJointValidation && FastMode == 6 && !bIncumbentClear;
            // A close history branch needs a real verdict before a distant
            // certified incumbent's proxy score can reject it. The ordinary
            // exact-query budget still applies.
            const bool bProbeNearbyHistory = bTestingSharedHistory && bIncumbentClear && bContinuous &&
                ResultContinuityStep(Result) > ContinuousStepLimitCm &&
                CandidateContinuityStep(Refined[0], Refined[1], TorsoRotation,
                    ActiveSharedTranslation, ActiveClavicleDeg) <= ContinuousStepLimitCm;
            // The proxy incumbent may be the very pose we are about to certify.
            // Give its first exact query a chance to expose a real contact or
            // prove clearance before score equality can prune every candidate.
            const bool bFirstCertificate = Result.SkinnedQueryCount == 0 && !bIncumbentClear;
            if (!bFirstCertificate && !bProbeWideSeed && !bProbeRejectedGuide && !bProbeNearbyHistory && ((bIncumbentClear && !bCouldClear) ||
                (bIncumbentClear == bCouldClear && OptimisticScore >= BestScore)))
            {
                if (bTestingSharedHistory && UE_LOG_ACTIVE(LogFlowArtsClearance, VeryVerbose))
                    UE_LOG(LogFlowArtsClearance, VeryVerbose,
                        TEXT("HistoryCandidate pruned fast=%d optimistic=%.6f best=%.6f worst=%.6f contact=%d/%d/%d/%d incumbentClear=%d"),
                        FastMode, OptimisticScore, BestScore, Worst, Contact.Kind, Contact.Arm,
                        Contact.Segment, Contact.Index, bIncumbentClear);
                if (bDeepSearch) LastDeepSkipReason = 32; // Optimistic-score prune, not a failed certificate.
                continue;
            }
            --SkinQueryBudget;
            if (bClosestClaviclePole || bJointValidation) --ClavicleQueriesRemaining;
            if (bTestingSharedHistory) --HistorySkinQueryBudget;
            else if (!bSharedTarget && !bClosestClaviclePole && !bJointValidation) --UnshiftedSkinQueryBudget;
            ++Result.SkinnedQueryCount;
            const FFlowArtsClearanceArm PairArms[2] = {Refined[0].Arm, Refined[1].Arm};
            // PairWorst was measured on these exact candidate endpoints above.
            // An unrequested bit must never waive an independently retained contact.
            uint8 ClearMask=0, SegmentMask=0;
            const uint8 ForearmBodyMask = Input.CertifyForearmBody
                ? Input.CertifyForearmBody(PairArms, TorsoRotation) & 3 : 0;
            const uint8 ForearmHeadMask = Input.CertifyForearmHead
                ? Input.CertifyForearmHead(PairArms, TorsoRotation) & 3 : 0;
            if (Input.CertifySkinnedCandidate)
            {
                const uint16 Bits=Input.CertifySkinnedCandidate(PairArms,TorsoRotation,Pair.bRequestArmPair,
                    Geometry.HeldPropCapsules[0],Geometry.HeldPropCapsules[1],
                    Pair.RequestedPropSides,Pair.RequestedHeldPropBodySides,Pair.RequestedSegments);
                const uint8 Requested=uint8((Pair.bRequestArmPair ? 7 : 3) |
                    ((Pair.RequestedPropSides&1) ? 8 : 0) | ((Pair.RequestedPropSides&2) ? 16 : 0) |
                    ((Pair.RequestedHeldPropBodySides&1) ? 32 : 0) | ((Pair.RequestedHeldPropBodySides&2) ? 64 : 0));
                ClearMask=uint8(Bits)&Requested;
                SegmentMask=uint8(Bits>>8)&Pair.RequestedSegments;
            }
            else
            {
                ClearMask = Input.CertifySkinnedUpperTorso
                ? Input.CertifySkinnedUpperTorso(PairArms, TorsoRotation, Pair.bRequestArmPair)
                    & (Pair.bRequestArmPair ? uint8(7) : uint8(3)) : 0;
            if (Pair.RequestedPropSides && Input.CertifySkinnedOppositeProps)
            {
                const uint8 RequestedBits = uint8(((Pair.RequestedPropSides & 1) ? 8 : 0)
                    | ((Pair.RequestedPropSides & 2) ? 16 : 0));
                ClearMask |= Input.CertifySkinnedOppositeProps(PairArms, TorsoRotation,
                    Geometry.HeldPropCapsules[0], Geometry.HeldPropCapsules[1], Pair.RequestedPropSides)
                    & RequestedBits;
            }
            if (Pair.RequestedHeldPropBodySides && Input.CertifySkinnedHeldPropBody)
            {
                const uint8 RequestedBits = uint8(((Pair.RequestedHeldPropBodySides & 1) ? 32 : 0)
                    | ((Pair.RequestedHeldPropBodySides & 2) ? 64 : 0));
                ClearMask |= Input.CertifySkinnedHeldPropBody(PairArms, TorsoRotation,
                    Geometry.HeldPropCapsules[0], Geometry.HeldPropCapsules[1], Pair.RequestedHeldPropBodySides)
                    & RequestedBits;
            }
                SegmentMask = Pair.RequestedSegments && Input.CertifySkinnedSegments
                ? Input.CertifySkinnedSegments(PairArms, TorsoRotation,
                    Geometry.HeldPropCapsules[0], Geometry.HeldPropCapsules[1], Pair.RequestedSegments)
                    & Pair.RequestedSegments : 0;
            }
            if (bTestingSharedHistory && UE_LOG_ACTIVE(LogFlowArtsClearance, VeryVerbose))
                UE_LOG(LogFlowArtsClearance, VeryVerbose,
                    TEXT("HistoryCandidate queried fast=%d upperMask=%u segmentMask=%u requestedSegments=%u propSides=%u bodyPropSides=%u proxyWorst=%.6f contact=%d/%d/%d/%d shared=%s torso=%s"),
                    FastMode, ClearMask, SegmentMask, Pair.RequestedSegments, Pair.RequestedPropSides,
                    Pair.RequestedHeldPropBodySides, Worst, Contact.Kind, Contact.Arm, Contact.Segment,
                    Contact.Index, *ActiveSharedTranslation.ToString(), *TorsoRotation.ToString());
            if (bTestingSharedHistory || bTestingRejectedGuide || !Input.bPreserveWrist)
            {
                FJointSeed Queried;
                StorePose(Queried.Pose, *Pair.Left, *Pair.Right, Worst, Total, Contact, ClearMask, SegmentMask);
                Queried.Score = OptimisticScore;
                Queried.LeftPole = Queried.RightPole = 0.f;
                if (bTestingSharedHistory) LastHistorySeed = Queried;
                if (bTestingRejectedGuide) LastRejectedGuideSeed = Queried;
                if (!Input.bPreserveWrist)
                { LastSoftSeed = MoveTemp(Queried); LastSoftOffsetCm = WristOffsetCm; LastSoftAbductionDeg = WristAbductionDeg; }
            }
            if (bClavicleResponse && ((ClearMask & 3) != 3 || Worst > .02f))
            {
                // A rejected query contributes search coordinates only. Contact
                // witnesses are current-query measurements, never saved here.
                const double ContactRank = Input.EvaluateSkinnedContacts
                    ? Input.EvaluateSkinnedContacts(PairArms, TorsoRotation)
                    : double(3 - ((ClearMask & 1) != 0) - ((ClearMask & 2) != 0));
                const double GuideRank = ContactRank + FMath::Square(double(FMath::Max(0.f, Worst)));
                if (FMath::IsFinite(GuideRank) && GuideRank < BestRejectedGuideRank)
                {
                    FJointSeed Guide;
                    StorePose(Guide.Pose, *Pair.Left, *Pair.Right, Worst, Total, Contact, ClearMask, SegmentMask);
                    Guide.Score = OptimisticScore;
                    Guide.LeftPole = Pair.Left->PoleDegrees;
                    Guide.RightPole = Pair.Right->PoleDegrees;
                    BestRejectedGuideSeed = MoveTemp(Guide);
                    BestRejectedGuideRank = GuideRank;
                }
            }
            if (bJointValidation) LastJointCertificate = ClearMask;
            if (bClosestClaviclePole || bJointValidation)
            {
                UE_LOG(LogFlowArtsClearance, Verbose, TEXT("Clavicle %.0f/%.0f skin mask=%u pairCapability=%d torso=%s"),
                    ActiveClavicleDeg[0], ActiveClavicleDeg[1], ClearMask, Input.bCanCertifySkinnedArmPair, *TorsoRotation.ToString());
                for (int32 Side = 0; Side < 2; ++Side)
                    UE_LOG(LogFlowArtsClearance, Verbose, TEXT("Clavicle candidate side=%d C=%s U=%s E=%s W=%s"),
                        Side, *PairArms[Side].Clavicle.ToString(), *PairArms[Side].Upper.ToString(),
                        *PairArms[Side].Elbow.ToString(), *PairArms[Side].Wrist.ToString());
            }
            if (!ClearMask && !SegmentMask && !ForearmBodyMask && !ForearmHeadMask) continue;
#if WITH_DEV_AUTOMATION_TESTS
            FString Decision;
            if (!Input.DecisionEvidencePath.IsEmpty())
            {
                Decision=FString::Printf(TEXT("inputCallback=%d geometryCallback=%d forearmMask=%u headMask=%u before=%.12f contact=%d/%d/%d/%d\n"),
                    !!Input.CertifyForearmBody,!!Geometry.CertifyForearmBody,uint32(ForearmBodyMask),uint32(ForearmHeadMask),
                    Worst,Contact.Kind,Contact.Arm,Contact.Segment,Contact.Index);
                for(int32 Side=0;Side<2;++Side)
                {
                    const auto Capsule=ForearmCapsule(PairArms[Side]);
                    Decision+=FString::Printf(TEXT("side=%d before=%.12f E=%s W=%s radius=%.12f\n"),Side,
                        Refined[Side].BodyWorst,*Capsule.Start.ToString(),*Capsule.End.ToString(),Capsule.RadiusCm);
                }
            }
#endif
            for (int32 Side = 0; Side < 2; ++Side)
                MeasureSide(Geometry, Refined[Side].Arm, Side, Refined[Side].BodyWorst,
                    Refined[Side].BodyTotal, Refined[Side].Contact, (ClearMask & (1 << Side)) != 0,
                    nullptr, false, nullptr, nullptr, (ClearMask & (8 << Side)) != 0,
                    nullptr, nullptr, (ClearMask & (32 << Side)) != 0,
                    nullptr, SegmentMask, (ForearmBodyMask & (1 << Side)) != 0,
                    (ForearmHeadMask & (1 << Side)) != 0);
            Measure(Geometry, Refined[0], Refined[1], Worst, Total, Contact, nullptr,
                Input.bCanCertifySkinnedArmPair && (ClearMask & 4), SegmentMask);
#if WITH_DEV_AUTOMATION_TESTS
            if (!Decision.IsEmpty())
            {
                Decision+=FString::Printf(TEXT("after=%.12f contact=%d/%d/%d/%d\n"),
                    Worst,Contact.Kind,Contact.Arm,Contact.Segment,Contact.Index);
                for(int32 Side=0;Side<2;++Side)
                    Decision+=FString::Printf(TEXT("side=%d after=%.12f contact=%d/%d/%d/%d\n"),Side,
                        Refined[Side].BodyWorst,Refined[Side].Contact.Kind,Refined[Side].Contact.Arm,
                        Refined[Side].Contact.Segment,Refined[Side].Contact.Index);
                FFileHelper::SaveStringToFile(Decision,*(Input.DecisionEvidencePath+TEXT("-decision.txt")));
            }
#endif
            // This mode evaluates exactly one supplied pose. Its fresh regional
            // verdicts remain useful even when an independent blocked region
            // leaves the score unchanged. Do not lose them to score equality.
            if (Input.bSourceFidelityOnly)
            {
                StorePose(Result, Refined[0], Refined[1], Worst, Total, Contact, ClearMask, SegmentMask,
                    ForearmBodyMask, ForearmHeadMask);
                // A proxy-clear pose may still fail exact surface padding. Its
                // fallback must retain this fresh verdict, not the pre-query mask.
                if (UncertifiedClearScore < TNumericLimits<float>::Max())
                    UncertifiedClearFallback = Result;
            }
            Accept(Refined[0], Refined[1], Worst, Total, Contact, ClearMask, SegmentMask,
                ForearmBodyMask, ForearmHeadMask);
            if (Worst <= .02f && HasCompleteSkinCertificate(ClearMask, SegmentMask)) break;
        }
        return LocalBestScore;
    };
    // Reconstruct absolute joint rotations from the current authored pose, not
    // last frame's corrected joint, so repeated paused evaluation cannot drift.
    const auto ApplyClavicles = [&](FFlowArtsArmClearanceInput& Geometry, const FQuat& TorsoRotation)
    {
        const FTransform TorsoDelta(TorsoRotation, Input.TorsoPivot - TorsoRotation.RotateVector(Input.TorsoPivot));
        const FVector Up = (TorsoDelta.TransformPosition(Input.Neck) - Input.FixedHip).GetSafeNormal();
        const FVector SideAxis = TorsoRotation.RotateVector(Input.Arms[1].Upper.GetLocation() - Input.Arms[0].Upper.GetLocation());
        const FVector Forward = FVector::CrossProduct(SideAxis, Up).GetSafeNormal();
        for (int32 Side = 0; Side < 2; ++Side)
        {
            auto& Arm = Geometry.Arms[Side];
            if (!Arm.bHasClavicle) continue;
            const FTransform AuthoredClavicle = Input.Arms[Side].Clavicle * TorsoDelta;
            const FVector Pivot = AuthoredClavicle.GetLocation();
            const FVector Radius = TorsoDelta.TransformPosition(Input.Arms[Side].Upper.GetLocation()) - Pivot;
            const float Angle = FMath::DegreesToRadians(FMath::Clamp(ActiveClavicleDeg[Side], 0.f, 40.f));
            const FQuat Positive(Up, Angle), Negative(Up, -Angle);
            const FQuat Protraction = FVector::DotProduct(Positive.RotateVector(Radius), Forward) >=
                FVector::DotProduct(Negative.RotateVector(Radius), Forward) ? Positive : Negative;
            const FQuat Desired = (Protraction * AuthoredClavicle.GetRotation()).GetNormalized();
            const FQuat Rotation = (Desired * Arm.Clavicle.GetRotation().Inverse()).GetNormalized();
            const FTransform Delta(Rotation, Pivot - Rotation.RotateVector(Pivot));
            Arm.Clavicle = FTransform(Desired, Pivot, AuthoredClavicle.GetScale3D());
            Arm.Upper = Arm.Upper * Delta;
            Arm.Elbow = Arm.Elbow * Delta;
            Arm.Wrist = Arm.Wrist * Delta;
        }
    };
    // An authored clear pose needs two body checks and one paired check, not
    // all pole candidates. Every fast path uses the current complete obstacles.
    const bool bPriorGripCorrection = bContinuous && bClavicleResponse &&
        (!History.PreviousSharedPerformanceTranslationCm.IsNearlyZero()
            || History.PreviousClavicleProtractionDeg[0] > .01f || History.PreviousClavicleProtractionDeg[1] > .01f);
    if (Input.bSourceFidelityOnly || !bPriorGripCorrection || (Input.bMeasuredSurface && Input.bPreserveWrist))
        Consider(Input, Input.bSourceFidelityOnly ? Input.SourceTorsoRotation : FQuat::Identity, 0.f, 1);
    bool bFastClear = BestScore < TNumericLimits<float>::Max() && IsCertifiedClear(Result);
    if (!Input.bSourceFidelityOnly && !bFastClear && bContinuous && !bPriorGripCorrection)
    {
        // Retain any partially certified authored improvement across fallbacks.
        Consider(Input, FQuat::Identity, Input.bPreserveWrist ? 0.f : History.PreviousWristOffsetCm, 2,
            Input.bPreserveWrist ? 0.f : History.PreviousWristAbductionDeg);
        bFastClear = BestScore < TNumericLimits<float>::Max() && IsCertifiedClear(Result);
    }
    if (!Input.bSourceFidelityOnly)
    {
    // Reserve the final repair verdict before early contact refreshes can
    // consume the budget. Its candidate may use freedom absent from those
    // refreshes, so publishing it still needs one fresh complete certificate.
    const int32 ReservedSoftQuery = !bFastClear && !Input.bPreserveWrist &&
        Input.CertifySkinnedUpperTorso && SkinQueryBudget > 0 ? 1 : 0;
    SkinQueryBudget -= ReservedSoftQuery;
    // Socket-attached hands can repair a fresh local skin contact before a
    // blind pole grid. This never runs for captured wrists or Eat/Sit contact.
    // Witnesses guide candidates; Consider remeasures every
    // body, prop and pair constraint and requires a fresh full skin verdict.
    if (!bFastClear && !Input.bPreserveWrist && Input.bMeasuredSurface &&
        Input.CertifySkinnedUpperTorso && Input.EvaluateSkinnedContacts && LastSoftSeed.IsSet())
    {
        for (int32 Pass = 0; Pass < 8 && SkinQueryBudget > 0; ++Pass)
        {
            const FJointSeed Anchor = LastSoftSeed.GetValue();
            struct FSoftParameters { float Offset; float Pole[2]; };
            FSoftParameters Current{LastSoftOffsetCm, {0.f, 0.f}};
            const float Abduction = LastSoftAbductionDeg;
            const auto EvaluateSoft = [&](const FSoftParameters& P, FFlowArtsArmClearanceInput& Out) -> double
            {
                if (P.Offset < 0.f || P.Offset > 18.f ||
                    FMath::Abs(P.Pole[0]) > 15.f || FMath::Abs(P.Pole[1]) > 15.f)
                    return TNumericLimits<double>::Max();
                Out = Input;
                FArmCandidate Pair[2];
                for (int32 Side = 0; Side < 2; ++Side)
                {
                    const auto& Original = Input.Arms[Side];
                    const FVector Shoulder = Original.Upper.GetLocation();
                    const float Reach = FVector::Dist(Shoulder, Original.Elbow.GetLocation()) +
                        FVector::Dist(Original.Elbow.GetLocation(), Original.Wrist.GetLocation());
                    const FVector Outward = (Shoulder - Input.Arms[1 - Side].Upper.GetLocation()).GetSafeNormal();
                    FTransform Target = Original.Wrist;
                    FVector Desired = Target.GetLocation() + Outward * P.Offset;
                    if (Abduction > 0.f)
                    {
                        const FVector AuthoredReach = Target.GetLocation() - Shoulder;
                        const FVector Axis = FVector::CrossProduct(AuthoredReach.GetSafeNormal(), Outward).GetSafeNormal();
                        const FQuat Rotation = Axis.IsNearlyZero() ? FQuat::Identity :
                            FQuat(Axis, FMath::DegreesToRadians(Abduction));
                        Desired = Target.GetLocation() + (Shoulder + Rotation.RotateVector(AuthoredReach) -
                            Target.GetLocation()).GetClampedToMaxSize(Reach * .7f);
                        // An angular history target remains unchanged; local repair
                        // uses elbow freedom, without introducing another hand policy.
                        if (!FMath::IsNearlyEqual(P.Offset, Current.Offset)) return TNumericLimits<double>::Max();
                    }
                    Target.SetLocation(Shoulder + (Desired - Shoulder).GetClampedToMaxSize(Reach));
                    const FVector Axis = (Target.GetLocation() - Shoulder).GetSafeNormal();
                    const FVector Radial = FVector::VectorPlaneProject(
                        Anchor.Pose.Arms[Side].Elbow.GetLocation() - Shoulder, Axis).GetSafeNormal();
                    if (Radial.IsNearlyZero()) return TNumericLimits<double>::Max();
                    const FVector Pole = Shoulder + FQuat(Axis, FMath::DegreesToRadians(P.Pole[Side])).RotateVector(Radial) * Reach;
                    TArray<FArmCandidate> Local;
                    AddPole(Local, Original, Pole, nullptr, Target);
                    if (Local.IsEmpty()) return TNumericLimits<double>::Max();
                    Pair[Side] = Local[0];
                    Out.Arms[Side] = Pair[Side].Arm;
                    const FVector Shift = Target.GetLocation() - Original.Wrist.GetLocation();
                    for (auto& Prop : Out.HeldPropCapsules[Side]) { Prop.Start += Shift; Prop.End += Shift; }
                }
                for (int32 Side = 0; Side < 2; ++Side)
                    MeasureSide(Out, Pair[Side].Arm, Side, Pair[Side].BodyWorst,
                        Pair[Side].BodyTotal, Pair[Side].Contact, true);
                float Worst = 0.f, Total = 0.f;
                FContact Contact;
                Measure(Out, Pair[0], Pair[1], Worst, Total, Contact, nullptr, Input.bCanCertifySkinnedArmPair);
                const double Witness = Input.EvaluateSkinnedContacts(Out.Arms, FQuat::Identity);
                if (!FMath::IsFinite(Witness)) return TNumericLimits<double>::Max();
                return Witness + Worst * Worst * 4.0 + Total * .01;
            };
            FFlowArtsArmClearanceInput BestGeometry;
            double Objective = EvaluateSoft(Current, BestGeometry);
            if (!FMath::IsFinite(Objective) || Objective == TNumericLimits<double>::Max()) break;
            const double InitialObjective = Objective;
            bool bImproved = false;
            // Finish below a millimetre before spending the existing exact-query
            // budget. Centimetre-only steps can strand a submillimetre contact.
            // Forty-eight cheap witness trials per pass; acceptance is still the
            // unchanged full certificate below, never the witness objective.
            for (const float Step : {2.f, 1.f, .5f, .25f, .125f, .0625f, .03125f, .015625f})
                for (int32 Coordinate = 0; Coordinate < 3; ++Coordinate)
                    for (const float Sign : {-1.f, 1.f})
                    {
                        FSoftParameters Trial = Current;
                        if (Coordinate == 0) Trial.Offset += Sign * Step;
                        else Trial.Pole[Coordinate - 1] += Sign * Step * 2.5f;
                        FFlowArtsArmClearanceInput TrialGeometry;
                        const double Score = EvaluateSoft(Trial, TrialGeometry);
                        if (Score + 1.e-9 < Objective)
                        { Objective = Score; Current = Trial; BestGeometry = MoveTemp(TrialGeometry); bImproved = true; }
                    }
            UE_LOG(LogFlowArtsClearance, VeryVerbose,
                TEXT("Soft refinement pass=%d initial=%.12g final=%.12g offset=%.9g abduction=%.9g poles=%.9g/%.9g improved=%d budget=%d"),
                Pass, InitialObjective, Objective, Current.Offset, Abduction, Current.Pole[0], Current.Pole[1], bImproved, SkinQueryBudget);
            if (!bImproved) break;
            const TArray<FFlowArtsContactWitness> PreviousContacts = Input.SnapshotSkinnedContacts
                ? Input.SnapshotSkinnedContacts() : TArray<FFlowArtsContactWitness>();
            const int32 QueriesBefore = Result.SkinnedQueryCount;
            bJointValidation = true;
            Consider(BestGeometry, FQuat::Identity, 0.f, 5);
            bJointValidation = false;
            Result.SoftRefinementQueryCount += Result.SkinnedQueryCount - QueriesBefore;
            UE_LOG(LogFlowArtsClearance, VeryVerbose,
                TEXT("Soft refinement verdict pass=%d newQueries=%d upperMask=%u residual=%.12g kind=%d segment=%d arm=%d"),
                Pass, Result.SkinnedQueryCount - QueriesBefore, Result.SkinnedUpperTorsoClearMask,
                Result.WorstPenetrationCm, Result.WorstObstacleKind, Result.WorstSegment, Result.WorstArm);
            if (LastSoftSeed.IsSet())
            { LastSoftOffsetCm = Current.Offset; LastSoftAbductionDeg = Abduction; }
            if (Result.Arms[0].Wrist.Equals(BestGeometry.Arms[0].Wrist, .00001f) &&
                Result.Arms[0].Elbow.Equals(BestGeometry.Arms[0].Elbow, .00001f))
            { SelectedWristOffsetCm = Current.Offset; SelectedWristAbductionDeg = Abduction; }
            bFastClear = BestScore < TNumericLimits<float>::Max() && IsCertifiedClear(Result);
            if (bFastClear || Result.SkinnedQueryCount == QueriesBefore) break;
            // Two ordinary attempts remain sufficient for a fixed active set.
            // Continue only when a fresh exact rejection exposes another contact
            // after useful progress. A cleared old witness is not a certificate.
            if (Pass >= 1)
            {
                bool bNewContact = false;
                if (Input.SnapshotSkinnedContacts && Objective <= InitialObjective * .9)
                    for (const FFlowArtsContactWitness& Contact : Input.SnapshotSkinnedContacts())
                        if (!PreviousContacts.ContainsByPredicate([&](const FFlowArtsContactWitness& Prior)
                        {
                            return Contact.Side == Prior.Side
                                && Contact.UpperTriangleIndex == Prior.UpperTriangleIndex
                                && Contact.BodyTriangleIndex == Prior.BodyTriangleIndex
                                && Contact.bClosedBody == Prior.bClosedBody
                                && Contact.bContainment == Prior.bContainment
                                && Contact.EscapeNormalSign == Prior.EscapeNormalSign;
                        }))
                        { bNewContact = true; break; }
                if (!bNewContact) break;
            }
        }
    }

    const bool bDeferAuthoredSearch = !bFastClear && (bContinuous || bRejectedGuideContinuous) && Input.bMeasuredSurface
        && Input.bPreserveWrist && (Input.bAllowTorsoResponse || bPriorGripCorrection || bRejectedGuideContinuous)
        && Input.BodyCapsules.Num() == 3
        && (bRejectedGuideContinuous || !History.PreviousTorsoRotation.Equals(FQuat::Identity, .00001f) || bPriorGripCorrection);
    // The broad arm-pair capsules are retained as a reported obstacle, but
    // their overlap alone is not evidence that moving the whole performer can
    // separate the skinned arms. Preserve the measured source pose instead of
    // searching distant torso/translation basins for this one proxy failure.
    const bool bSourceFidelityPairProxy = Input.bMeasuredSurface && Input.bPreserveWrist &&
        Input.bAllowSharedPerformanceTranslation && BestScore < TNumericLimits<float>::Max() &&
        Result.WorstPenetrationCm > .02f && Result.WorstObstacleKind == 3;
    if (!bFastClear && !bDeferAuthoredSearch && !bSourceFidelityPairProxy)
    {
        // Full pole search must compete with already certified fast candidates.
        Consider(Input, FQuat::Identity, 0.f);
    }
    // Socket-attached idle props follow their hands: they have no captured grip
    // to pin in space. Prefer the smallest bounded outward hand correction.
    // Hard captures and contact activities never enter this branch.
    if (!Input.bPreserveWrist && Result.WorstPenetrationCm > .02f)
        for (const float Offset : {6.f, 12.f, 18.f})
        {
            Consider(Input, FQuat::Identity, Offset);
            if (IsCertifiedClear(Result)) break;
        }

    // A hanging almost-straight arm needs angular freedom, not more reach.
    // Bound shoulder abduction to forty degrees and hand travel to 0.7 arm length.
    if (!Input.bPreserveWrist && Result.WorstPenetrationCm > .02f)
        for (const float Degrees : {20.f, 30.f, 40.f})
        {
            Consider(Input, FQuat::Identity, 0.f, 0, Degrees);
            if (IsCertifiedClear(Result)) break;
        }

    SkinQueryBudget += ReservedSoftQuery;
    // Refine the selected coarse pose against every conservative obstacle.
    // Each hand has independent freedom: one clear arm must not prevent the
    // other from repairing a small residual. A supported rig still requires
    // its fresh complete skin verdict before this pose can be accepted.
    if (!Input.bPreserveWrist &&
        Result.WorstPenetrationCm > .02f && BestScore < TNumericLimits<float>::Max())
    {
        const FFlowArtsArmClearanceResult Anchor = Result;
        const bool bAngular = SelectedWristAbductionDeg > 0.f || SelectedWristOffsetCm == 0.f;
        const bool bAllowRetraction = bAngular;
        struct FFallbackParameters { float Hand[2]; float Pole[2]; float Azimuth[2]; float Retract[2]; };
        const float InitialHand = bAngular ? SelectedWristAbductionDeg : SelectedWristOffsetCm;
        FFallbackParameters Current{{InitialHand, InitialHand}, {0.f, 0.f}, {0.f, 0.f}, {0.f, 0.f}};
        const auto EvaluateFallback = [&](const FFallbackParameters& P, FFlowArtsArmClearanceInput& Geometry)
        {
            if (P.Hand[0] < 0.f || P.Hand[0] > (bAngular ? 40.f : 18.f) ||
                P.Hand[1] < 0.f || P.Hand[1] > (bAngular ? 40.f : 18.f) ||
                FMath::Abs(P.Pole[0]) > 15.f || FMath::Abs(P.Pole[1]) > 15.f ||
                FMath::Abs(P.Azimuth[0]) > 40.f || FMath::Abs(P.Azimuth[1]) > 40.f)
                return TNumericLimits<double>::Max();
            Geometry = Input;
            FArmCandidate Arms[2];
            for (int32 Side = 0; Side < 2; ++Side)
            {
                const auto& Original = Input.Arms[Side];
                const FVector Shoulder = Original.Upper.GetLocation();
                const float Reach = FVector::Dist(Shoulder, Original.Elbow.GetLocation()) +
                    FVector::Dist(Original.Elbow.GetLocation(), Original.Wrist.GetLocation());
                if (P.Retract[Side] < 0.f || P.Retract[Side] > FMath::Min(6.f, Reach * .15f) ||
                    (!bAllowRetraction && P.Retract[Side] != 0.f))
                    return TNumericLimits<double>::Max();
                const FVector Outward = (Shoulder - Input.Arms[1 - Side].Upper.GetLocation()).GetSafeNormal();
                FTransform Target = Original.Wrist;
                FVector Desired = Target.GetLocation() + Outward * P.Hand[Side];
                if (bAngular)
                {
                    const FVector AuthoredReach = Target.GetLocation() - Shoulder;
                    const FVector TurnAxis = FVector::CrossProduct(AuthoredReach.GetSafeNormal(), Outward).GetSafeNormal();
                    const FQuat Turn = TurnAxis.IsNearlyZero() ? FQuat::Identity :
                        FQuat(TurnAxis, FMath::DegreesToRadians(P.Hand[Side]));
                    Desired = Target.GetLocation() + (Shoulder + Turn.RotateVector(AuthoredReach) -
                        Target.GetLocation()).GetClampedToMaxSize(Reach * .7f);
                }
                // Opening in a single outward plane can be blocked by clothing
                // even though the same opening directed slightly forward clears.
                // Rotation about the authored reach preserves target reach,
                // opening angle and distance from the authored wrist exactly.
                const FVector AuthoredAxis = (Original.Wrist.GetLocation() - Shoulder).GetSafeNormal();
                if (!AuthoredAxis.IsNearlyZero() && !FMath::IsNearlyZero(P.Azimuth[Side]))
                    Desired = Shoulder + FQuat(AuthoredAxis, FMath::DegreesToRadians(P.Azimuth[Side]))
                        .RotateVector(Desired - Shoulder);
                // An almost straight idle arm cannot gain elbow bend through
                // opening/azimuth alone, which preserve its target radius.
                // Both supported and conservative rigs need this bounded inward
                // freedom; the attached prop follows the same exact hand shift.
                if (P.Retract[Side] > 0.f)
                {
                    const FVector ReachVector = Desired - Shoulder;
                    Desired = Shoulder + ReachVector.GetSafeNormal() *
                        FMath::Max(0., ReachVector.Size() - double(P.Retract[Side]));
                }
                Target.SetLocation(Shoulder + (Desired - Shoulder).GetClampedToMaxSize(Reach));
                const FVector Axis = (Target.GetLocation() - Shoulder).GetSafeNormal();
                const FVector Radial = FVector::VectorPlaneProject(
                    Anchor.Arms[Side].Elbow.GetLocation() - Shoulder, Axis).GetSafeNormal();
                if (Radial.IsNearlyZero()) return TNumericLimits<double>::Max();
                const FVector Pole = Shoulder + FQuat(Axis, FMath::DegreesToRadians(P.Pole[Side])).RotateVector(Radial) * Reach;
                TArray<FArmCandidate> Candidates;
                AddPole(Candidates, Original, Pole, nullptr, Target);
                if (Candidates.IsEmpty()) return TNumericLimits<double>::Max();
                Arms[Side] = Candidates[0];
                Geometry.Arms[Side] = Arms[Side].Arm;
                const FVector Shift = Target.GetLocation() - Original.Wrist.GetLocation();
                for (auto& Prop : Geometry.HeldPropCapsules[Side]) { Prop.Start += Shift; Prop.End += Shift; }
            }
            for (int32 Side = 0; Side < 2; ++Side)
                MeasureSide(Geometry, Arms[Side].Arm, Side, Arms[Side].BodyWorst,
                    Arms[Side].BodyTotal, Arms[Side].Contact);
            float Worst = 0.f, Total = 0.f;
            FContact Contact;
            Measure(Geometry, Arms[0], Arms[1], Worst, Total, Contact);
            return double(Worst) * Worst * 4.0 + double(Total) * .01;
        };
        FFlowArtsArmClearanceInput BestGeometry;
        double Objective = EvaluateFallback(Current, BestGeometry);
        bool bImproved = false;
        // The bounded angular repair includes independent azimuth and radial
        // freedom on every rig. Trials remain cheap measured candidates;
        // supported surfaces still require the reserved exact verdict.
        // No surface, prop, head or arm-pair waiver
        // participates in this objective or its final production remeasurement.
        for (const float Step : {4.f, 2.f, 1.f, .5f, .25f, .125f, .0625f})
            for (int32 Coordinate = 0; Coordinate < (bAllowRetraction ? 8 : 6); ++Coordinate)
                for (const float Sign : {-1.f, 1.f})
                {
                    FFallbackParameters Trial = Current;
                    if (Coordinate < 2) Trial.Hand[Coordinate] += Sign * Step * (bAngular ? 2.5f : 1.f);
                    else if (Coordinate < 4) Trial.Pole[Coordinate - 2] += Sign * Step * 2.5f;
                    else if (Coordinate < 6) Trial.Azimuth[Coordinate - 4] += Sign * Step * 2.5f;
                    else Trial.Retract[Coordinate - 6] += Sign * Step;
                    FFlowArtsArmClearanceInput TrialGeometry;
                    const double Score = EvaluateFallback(Trial, TrialGeometry);
                    if (Score + 1.e-9 < Objective)
                    { Objective = Score; Current = Trial; BestGeometry = MoveTemp(TrialGeometry); bImproved = true; }
                }
        if (bImproved)
        {
            const int32 QueriesBefore = Result.SkinnedQueryCount;
            bJointValidation = true;
            Consider(BestGeometry, FQuat::Identity, 0.f, 5);
            bJointValidation = false;
            Result.SoftRefinementQueryCount += Result.SkinnedQueryCount - QueriesBefore;
            if (Result.Arms[0].Wrist.Equals(BestGeometry.Arms[0].Wrist, .00001f) &&
                Result.Arms[0].Elbow.Equals(BestGeometry.Arms[0].Elbow, .00001f))
            {
                // The legacy history stores one shared policy, not asymmetric
                // targets. Do not describe this exact pose with a false offset;
                // history elbows remain hints and are freshly remeasured.
                const bool bCommon = FMath::IsNearlyEqual(Current.Hand[0], Current.Hand[1]) &&
                    FMath::IsNearlyZero(Current.Azimuth[0]) && FMath::IsNearlyZero(Current.Azimuth[1]) &&
                    FMath::IsNearlyZero(Current.Retract[0]) && FMath::IsNearlyZero(Current.Retract[1]);
                SelectedWristOffsetCm = !bAngular && bCommon ? Current.Hand[0] : 0.f;
                SelectedWristAbductionDeg = bAngular && bCommon ? Current.Hand[0] : 0.f;
            }
        }
    }

    // Only use the measured surface and a real spine pivot. A bounded spine
    // rotation moves the trunk away from an embedded hard grip without moving
    // the pelvis, feet, prop, wrist frame, or arm segment lengths.
    const bool bRecoverClavicle = bClavicleResponse && bContinuous &&
        (History.PreviousClavicleProtractionDeg[0] > .01f || History.PreviousClavicleProtractionDeg[1] > .01f);
    const bool bRecoverShared = bContinuous && Input.bAllowSharedPerformanceTranslation &&
        !History.PreviousSharedPerformanceTranslationCm.IsNearlyZero();
    const bool bRecoverTorso = bContinuous &&
        FMath::RadiansToDegrees(History.PreviousTorsoRotation.AngularDistance(FQuat::Identity)) > 2.01f;
    // A previously clear, nearby branch deserves a fresh verdict even when
    // neither shared translation nor clavicle protraction was active. Without
    // this probe a cold clear branch can replace it in a single frame.
    const bool bRecoverNearbyHistory = bContinuous && Input.bMeasuredSurface && Input.bPreserveWrist &&
        (Input.bAllowTorsoResponse || Input.bAllowSharedPerformanceTranslation) && Input.BodyCapsules.Num() == 3 &&
        (!IsCertifiedClear(Result) || ResultContinuityStep(Result) > ContinuousStepLimitCm);
    const auto HeadPropDepth = [&](const FFlowArtsArmClearanceInput& Geometry)
    { return RigidPropCache.Head(Geometry); };
        // Exact failing surface pairs guide a bounded local search. Witnesses
        // only rank candidates: fresh full geometry and certification still accept.
        RefineContacts = [&](const FJointSeed& Seed, FJointSeed& Refined)
        {
            FScopedClearancePhaseTimer Timer(PhaseTiming.bEnabled ? &PhaseTiming.RefineMs : nullptr);
            LastContactRefinementProgress = 0.;
            if (!Input.EvaluateSkinnedContacts) return false;
            struct FParameters { FVector Shift; float Pole[2]; float Twist[2]; float Turn[3]; float Clavicle[2]; };
            FParameters Current{Seed.Pose.SharedPerformanceTranslationCm,
                {Seed.LeftPole, Seed.RightPole},
                {Seed.Pose.UpperAxialTwistDeg[0], Seed.Pose.UpperAxialTwistDeg[1]}, {0.f, 0.f, 0.f},
                {Seed.Pose.ClavicleProtractionDeg[0], Seed.Pose.ClavicleProtractionDeg[1]}};
            const FVector AnatomicalUp = (Input.Neck - Input.FixedHip).GetSafeNormal();
            const FVector AnatomicalSide = (Input.Arms[1].Upper.GetLocation() - Input.Arms[0].Upper.GetLocation()).GetSafeNormal();
            const FVector AnatomicalForward = FVector::CrossProduct(AnatomicalSide, AnatomicalUp).GetSafeNormal();
            FRefinementGeometryScratch GeometryScratch(Input);
            const auto Evaluate = [&](const FParameters& P, FJointSeed& Out) -> double
            {
                if (P.Shift.SizeSquared() > FMath::Square(FMath::Clamp(Input.MaxSharedPerformanceTranslationCm, 0.f, 35.f))) return TNumericLimits<double>::Max();
                Out = Seed;
                Out.Pose.SharedPerformanceTranslationCm = P.Shift;
                Out.LeftPole = P.Pole[0]; Out.RightPole = P.Pole[1];
                const FQuat Rotation = (FQuat(AnatomicalForward, FMath::DegreesToRadians(P.Turn[2])) *
                    FQuat(AnatomicalUp, FMath::DegreesToRadians(P.Turn[0])) *
                    FQuat(AnatomicalSide, FMath::DegreesToRadians(P.Turn[1])) * Seed.Pose.TorsoRotation).GetNormalized();
                if ((!Input.bAllowTorsoResponse && !Rotation.Equals(Seed.Pose.TorsoRotation, .00001f)) ||
                    FMath::RadiansToDegrees(Rotation.AngularDistance(FQuat::Identity)) > 65.f)
                    return TNumericLimits<double>::Max();
                Out.Pose.TorsoRotation = Rotation;
                const FTransform AbsoluteDelta(Rotation, Input.TorsoPivot - Rotation.RotateVector(Input.TorsoPivot));
                // Hulls belong to the latest seed; the pole and roll reference
                // always belongs to the immutable joint base, even after refresh.
                const FQuat ReferenceRelative = (Rotation * JointReferencePose.TorsoRotation.Inverse()).GetNormalized();
                const FTransform ReferenceDelta(ReferenceRelative,
                    Input.TorsoPivot - ReferenceRelative.RotateVector(Input.TorsoPivot));
                GeometryScratch.Update(Input, Seed.Pose.TorsoHulls, Seed.Pose.BodyCapsules,
                    Seed.Pose.TorsoRotation, Rotation);
                auto& Geometry = GeometryScratch.Geometry;
                Out.Pose.TorsoHulls = Geometry.TorsoHulls;
                Out.Pose.BodyCapsules = Geometry.BodyCapsules;
                const FVector PosedUp = (AbsoluteDelta.TransformPosition(Input.Neck) - Input.FixedHip).GetSafeNormal();
                const FVector PosedForward = FVector::CrossProduct(Rotation.RotateVector(AnatomicalSide), PosedUp).GetSafeNormal();
                FArmCandidate Arms[2];
                for (int32 Side = 0; Side < 2; ++Side)
                {
                    auto Base = JointReferencePose.Arms[Side];
                    Base.Clavicle = Base.Clavicle * ReferenceDelta;
                    Base.Upper = Base.Upper * ReferenceDelta;
                    Base.Elbow = Base.Elbow * ReferenceDelta;
                    Base.Wrist = Base.Wrist * ReferenceDelta;
                    auto Arm = Base;
                    if (Arm.bHasClavicle)
                    {
                        const FTransform Authored = Input.Arms[Side].Clavicle * AbsoluteDelta;
                        const FVector Pivot = Authored.GetLocation();
                        const FVector Radius = AbsoluteDelta.TransformPosition(Input.Arms[Side].Upper.GetLocation()) - Pivot;
                        const float Angle = FMath::DegreesToRadians(P.Clavicle[Side]);
                        const FQuat Positive(PosedUp, Angle), Negative(PosedUp, -Angle);
                        const FQuat Protraction = FVector::DotProduct(Positive.RotateVector(Radius), PosedForward) >=
                            FVector::DotProduct(Negative.RotateVector(Radius), PosedForward) ? Positive : Negative;
                        const FQuat Desired = (Protraction * Authored.GetRotation()).GetNormalized();
                        const FQuat Correction = (Desired * Arm.Clavicle.GetRotation().Inverse()).GetNormalized();
                        const FTransform ClavicleDelta(Correction, Pivot - Correction.RotateVector(Pivot));
                        Arm.Clavicle = FTransform(Desired, Pivot, Authored.GetScale3D());
                        Arm.Upper = Arm.Upper * ClavicleDelta;
                        Arm.Elbow = Arm.Elbow * ClavicleDelta;
                        Arm.Wrist = Arm.Wrist * ClavicleDelta;
                    }
                    Out.Pose.ClavicleProtractionDeg[Side] = P.Clavicle[Side];
                    const FVector Shoulder = Arm.Upper.GetLocation();
                    FTransform Wrist = Input.Arms[Side].Wrist;
                    Wrist.AddToTranslation(P.Shift);
                    const float Reach = FVector::Dist(Base.Upper.GetLocation(), Base.Elbow.GetLocation())
                        + FVector::Dist(Base.Elbow.GetLocation(), Base.Wrist.GetLocation());
                    if (FVector::Dist(Shoulder, Wrist.GetLocation()) > Reach + .001f)
                        return TNumericLimits<double>::Max();
                    const FVector Axis = (Wrist.GetLocation() - Shoulder).GetSafeNormal();
                    const FVector Radial = FVector::VectorPlaneProject(Base.Elbow.GetLocation() - Shoulder, Axis).GetSafeNormal();
                    TArray<FArmCandidate> Pole;
                    AddPole(Pole, Arm, Shoulder + FQuat(Axis, FMath::DegreesToRadians(P.Pole[Side])).RotateVector(Radial) * 100.f,
                        nullptr, Wrist);
                    if (Pole.IsEmpty()) return TNumericLimits<double>::Max();
                    Arms[Side] = MoveTemp(Pole[0]);
                    auto& A = Arms[Side].Arm;
                    A.Upper.SetRotation((FQuat::FindBetweenNormals(
                        (Base.Elbow.GetLocation() - Base.Upper.GetLocation()).GetSafeNormal(),
                        (A.Elbow.GetLocation() - A.Upper.GetLocation()).GetSafeNormal()) * Base.Upper.GetRotation()).GetNormalized());
                    A.Elbow.SetRotation((FQuat::FindBetweenNormals(
                        (Base.Wrist.GetLocation() - Base.Elbow.GetLocation()).GetSafeNormal(),
                        (A.Wrist.GetLocation() - A.Elbow.GetLocation()).GetSafeNormal()) * Base.Elbow.GetRotation()).GetNormalized());
                    A.Upper.SetRotation((FQuat((A.Elbow.GetLocation() - Shoulder).GetSafeNormal(),
                        FMath::DegreesToRadians(P.Twist[Side])) * A.Upper.GetRotation()).GetNormalized());
                    Out.Pose.Arms[Side] = A;
                    Out.Pose.UpperAxialTwistDeg[Side] = P.Twist[Side];
                    for (auto& Prop : Geometry.HeldPropCapsules[Side]) { Prop.Start += P.Shift; Prop.End += P.Shift; }
                }
                double Penalty = FMath::Square(double(HeadPropDepth(Geometry)));
                for (int32 Side = 0; Side < 2; ++Side)
                {
                    MeasureSide(Geometry, Arms[Side].Arm, Side, Arms[Side].BodyWorst,
                        Arms[Side].BodyTotal, Arms[Side].Contact, true, nullptr, false,
                        nullptr, nullptr, !!Input.CertifySkinnedOppositeProps,
                        nullptr, nullptr, !!Input.CertifySkinnedHeldPropBody);
                    Penalty += FMath::Square(double(Arms[Side].BodyWorst));
                }
                float Worst = 0.f, Total = 0.f; FContact Contact;
                Measure(Geometry, Arms[0], Arms[1], Worst, Total, Contact, nullptr, Input.bCanCertifySkinnedArmPair);
                Penalty += FMath::Square(double(Worst));
                const FFlowArtsClearanceArm Pair[2] = {Out.Pose.Arms[0], Out.Pose.Arms[1]};
                // Broad pair and prop contacts can be false positives, so they
                // guide locally at low weight. Fresh exact bits alone accept.
                const double PropContacts = Input.EvaluateSkinnedPropContacts
                    ? Input.EvaluateSkinnedPropContacts(Pair, Rotation,
                        Geometry.HeldPropCapsules[0], Geometry.HeldPropCapsules[1]) : 0.;
                return Penalty * 100.0 + Input.EvaluateSkinnedContacts(Pair, Rotation)
                    + PropContacts + CertifiableProxyGuideCm2(Geometry, Pair) * .1;
            };
            FJointSeed Best = Seed;
            double Objective = Evaluate(Current, Best);
            if (!FMath::IsFinite(Objective) || Objective >= TNumericLimits<double>::Max()) return false;
            const double Initial = Objective;
            // Preserve the broad search, then spend at most four extra cheap
            // sweeps only after it reaches a sub-centimeter contact objective.
            // A fresh certificate can expose a gap smaller than the old
            // one-centimeter minimum translation step.
            constexpr float ShiftSteps[] = {1.f, 2.f, .5f, .25f};
            constexpr float PoleSteps[] = {5.f, 10.f, 2.5f, 1.25f};
            constexpr float TwistSteps[] = {5.f, 15.f, 2.5f, 1.25f};
            constexpr float TurnSteps[] = {2.f, 4.f, 1.f, .5f};
            constexpr float ClavicleSteps[] = {5.f, 10.f, 2.5f, 1.25f};
            for (int32 Resolution = 0; Resolution < UE_ARRAY_COUNT(ShiftSteps); ++Resolution)
            {
                if (Resolution >= 2 && Objective > 1.) break;
                for (int32 Sweep = 0; Sweep < (Resolution < 2 ? 8 : 2); ++Sweep)
                {
                    bool Improved = false;
                    for (int32 Axis = 0; Axis < 12; ++Axis)
                    {
                        FParameters Winner = Current;
                        for (const float Sign : {-1.f, 1.f})
                        {
                            FParameters Trial = Current;
                            if (Axis < 3) Trial.Shift[Axis] += Sign * ShiftSteps[Resolution];
                            else if (Axis < 5) Trial.Pole[Axis - 3] += Sign * PoleSteps[Resolution];
                            else if (Axis < 7) Trial.Twist[Axis - 5] = FMath::Clamp(Trial.Twist[Axis - 5] + Sign * TwistSteps[Resolution], -15.f, 15.f);
                            else if (Axis < 10) Trial.Turn[Axis - 7] = FMath::Clamp(Trial.Turn[Axis - 7] + Sign * TurnSteps[Resolution], -12.f, 12.f);
                            else Trial.Clavicle[Axis - 10] = FMath::Clamp(Trial.Clavicle[Axis - 10] + Sign * ClavicleSteps[Resolution], 0.f, 40.f);
                            FJointSeed Candidate;
                            const double Score = Evaluate(Trial, Candidate);
                            if (Score + 1.e-12 < Objective)
                            { Objective = Score; Winner = Trial; Best = MoveTemp(Candidate); Improved = true; }
                        }
                        Current = Winner;
                    }
                    if (!Improved || Objective <= 1.e-12) break;
                }
            }
            if (Objective + 1.e-12 >= Initial) return false;
            LastContactRefinementProgress = (Initial - Objective) / FMath::Max(Initial, 1.);
            Refined = MoveTemp(Best);
            UE_LOG(LogFlowArtsClearance, Verbose, TEXT("Contact refinement shift=%s poles=%.1f/%.1f axial=%.1f/%.1f clavicle=%.1f/%.1f torso=%s objective=%.9g->%.9g"),
                *Refined.Pose.SharedPerformanceTranslationCm.ToString(), Refined.LeftPole, Refined.RightPole,
                Refined.Pose.UpperAxialTwistDeg[0], Refined.Pose.UpperAxialTwistDeg[1],
                Refined.Pose.ClavicleProtractionDeg[0], Refined.Pose.ClavicleProtractionDeg[1],
                *Refined.Pose.TorsoRotation.ToString(), Initial, Objective);
            return true;
        };
    FFlowArtsArmClearanceInput Candidate = Input;
    TFunction<float(const FQuat&, int32)> ConsiderTorso;
    if (!bSourceFidelityPairProxy && (Result.WorstPenetrationCm > 0.02f ||
        !HasCompleteSkinCertificate(ResultSkinMask(Result), Result.SkinnedSegmentClearMask) ||
        bRecoverTorso || bRecoverShared || bRecoverClavicle || bRecoverNearbyHistory) && Input.bMeasuredSurface &&
        Input.bPreserveWrist && (Input.bAllowTorsoResponse || Input.bAllowSharedPerformanceTranslation) && Input.BodyCapsules.Num() == 3)
    {
        ConsiderTorso = [&](const FQuat& Rotation, int32 FastMode)
        {
            if (!Input.bAllowTorsoResponse && !Rotation.Equals(FQuat::Identity, .00001f))
                return TNumericLimits<float>::Max();
            // Keep the first feasible correction, including a stable history pose.
            if (Result.WorstPenetrationCm <= .02f &&
                HasCompleteSkinCertificate(ResultSkinMask(Result), Result.SkinnedSegmentClearMask))
                return TNumericLimits<float>::Max();
            if (!ActiveSharedTranslation.IsNearlyZero()) ++SharedCandidateCount;
            const FTransform Delta(Rotation, Input.TorsoPivot - Rotation.RotateVector(Input.TorsoPivot));
            for (int32 Side = 0; Side < 2; ++Side)
            {
                Candidate.Arms[Side].Clavicle = Input.Arms[Side].Clavicle * Delta;
                Candidate.Arms[Side].Upper = Input.Arms[Side].Upper * Delta;
                Candidate.Arms[Side].Elbow = Input.Arms[Side].Elbow * Delta;
                Candidate.Arms[Side].Wrist = Input.Arms[Side].Wrist * Delta;
            }
            if (FastMode == 4 || FastMode == 6 || FastMode == 7)
                for (int32 Side = 0; Side < 2; ++Side) ClavicleReferenceArms[Side] = Candidate.Arms[Side];
            ApplyClavicles(Candidate, Rotation);
            Candidate.TorsoHulls = Input.TorsoHulls;
            for (auto& Hull : Candidate.TorsoHulls)
            {
                for (FVector& Point : Hull.Vertices) Point = Delta.TransformPosition(Point);
                for (FVector& Edge : Hull.EdgeDirections) Edge = Rotation.RotateVector(Edge);
                for (auto& Plane : Hull.Planes)
                {
                    Plane.Normal = Rotation.RotateVector(Plane.Normal);
                    Plane.OffsetCm += FVector::DotProduct(Plane.Normal, Delta.GetTranslation());
                }
            }
            const FVector Neck = Delta.TransformPosition(Input.Neck);
            const FVector Head = Delta.TransformPosition(Input.Head);
            Candidate.BodyCapsules[0].Start = FMath::Lerp(Input.FixedHip, Neck, 0.28f);
            Candidate.BodyCapsules[0].End = FMath::Lerp(Input.FixedHip, Neck, 0.59f);
            Candidate.BodyCapsules[1].Start = Candidate.BodyCapsules[0].End;
            Candidate.BodyCapsules[1].End = FMath::Lerp(Input.FixedHip, Neck, 0.89f);
            Candidate.BodyCapsules[2].Start = Neck;
            Candidate.BodyCapsules[2].End = Head;
            // A correction must not introduce a new head/held-prop overlap.
            FFlowArtsArmClearanceInput PropGeometry = Candidate;
            for (int32 Side = 0; Side < 2; ++Side)
                for (auto& Prop : PropGeometry.HeldPropCapsules[Side])
                { Prop.Start += ActiveSharedTranslation; Prop.End += ActiveSharedTranslation; }
            if (HeadPropDepth(PropGeometry) > .02f)
            {
                if (bTestingSharedHistory && UE_LOG_ACTIVE(LogFlowArtsClearance, VeryVerbose))
                    UE_LOG(LogFlowArtsClearance, VeryVerbose,
                        TEXT("HistoryCandidate rejected before ranking: head/held-prop shared=%s torso=%s"),
                        *ActiveSharedTranslation.ToString(), *Rotation.ToString());
                if (!ActiveSharedTranslation.IsNearlyZero()) ++SharedHeadPropRejectedCount;
                return TNumericLimits<float>::Max();
            }
            if (!ActiveSharedTranslation.IsNearlyZero() && FastMode == 0) ++SharedFullSearchCount;
            return Consider(Candidate, Rotation, 0.f, FastMode);
        };
        // Revalidate the complete previous pair first. Recovery follows distance
        // travelled by the source, not frames; a paused source is exactly stable.
        if (bRecoverShared || bRecoverClavicle || bRecoverTorso || bRecoverNearbyHistory)
        {
            // Recovery is measured in source travel, never evaluations/second.
            for (int32 Side = 0; Side < 2; ++Side)
            {
                ActiveClavicleDeg[Side] = FMath::Max(0.f, History.PreviousClavicleProtractionDeg[Side] - SourceTravelCm * .25f);
                ActiveAxialDeg[Side] = FMath::Sign(History.PreviousUpperAxialTwistDeg[Side]) *
                    FMath::Max(0.f, FMath::Abs(History.PreviousUpperAxialTwistDeg[Side]) - SourceTravelCm * .1f);
            }
            bTestingSharedHistory = true;
            const FFlowArtsArmClearanceResult Unshifted = Result;
            const float UnshiftedScore = BestScore;
            const float Bound = FMath::Clamp(Input.MaxSharedPerformanceTranslationCm, 0.f, 35.f);
            ActiveSharedTranslation = History.PreviousSharedPerformanceTranslationCm.GetClampedToMaxSize(Bound);
            if (IsCertifiedClear(Result) && SourceTravelCm > 0.f)
                ActiveSharedTranslation = ActiveSharedTranslation.GetSafeNormal() *
                    FMath::Max(0.f, ActiveSharedTranslation.Size() - SourceTravelCm * .25f);
            Result.WorstPenetrationCm = BestScore = TNumericLimits<float>::Max();
            ConsiderTorso(History.PreviousTorsoRotation, 2);
            if (PhaseTiming.bEnabled)
                UE_LOG(LogFlowArtsClearance, VeryVerbose,
                    TEXT("HistoryRecovery previous-pair queryCount=%d historyBudget=%d skip=0x%x worst=%.6f mask=%u segments=%u contact=%d/%d/%d/%d lastQueried=%d sourceTravel=%.6f"),
                    Result.SkinnedQueryCount, HistorySkinQueryBudget, Result.SkinnedSkipReasons, Result.WorstPenetrationCm,
                    ResultSkinMask(Result), Result.SkinnedSegmentClearMask, Result.WorstObstacleKind,
                    Result.WorstArm, Result.WorstSegment, Result.WorstObstacleIndex,
                    LastHistorySeed.IsSet(), SourceTravelCm);
            // Fresh history contacts get a bounded local correction before any
            // cold ring/plane enumeration. These queries come from the same
            // reserved joint allowance, not an additional per-frame budget.
            if (Result.WorstPenetrationCm > .02f && LastHistorySeed.IsSet()
                && Input.EvaluateSkinnedContacts && bClavicleResponse)
            {
                FJointSeed ContactSeed = LastHistorySeed.GetValue();
                JointReferencePose = ContactSeed.Pose;
                const FTransform TorsoDelta(ContactSeed.Pose.TorsoRotation,
                    Input.TorsoPivot - ContactSeed.Pose.TorsoRotation.RotateVector(Input.TorsoPivot));
                for (int32 Side = 0; Side < 2; ++Side)
                {
                    const auto& Solved = ContactSeed.Pose.Arms[Side];
                    auto& Reference = JointReferencePose.Arms[Side];
                    const FTransform AuthoredClavicle = Input.Arms[Side].Clavicle * TorsoDelta;
                    const FQuat UndoClavicle = (AuthoredClavicle.GetRotation() * Solved.Clavicle.GetRotation().Inverse()).GetNormalized();
                    const FVector Pivot = AuthoredClavicle.GetLocation();
                    const FTransform Undo(UndoClavicle, Pivot - UndoClavicle.RotateVector(Pivot));
                    Reference.Clavicle = AuthoredClavicle;
                    Reference.Upper = Solved.Upper * Undo;
                    Reference.Elbow = Solved.Elbow * Undo;
                    Reference.Wrist = Solved.Wrist * Undo;
                    // Preserve the actual roll while expressing it in the
                    // immutable pre-clavicle reference used by RefineContacts.
                    const FVector UpperAxis = (Solved.Elbow.GetLocation() - Solved.Upper.GetLocation()).GetSafeNormal();
                    const FQuat Untwisted = FQuat(UpperAxis, FMath::DegreesToRadians(-ContactSeed.Pose.UpperAxialTwistDeg[Side]))
                        * Solved.Upper.GetRotation();
                    Reference.Upper.SetRotation((FQuat::FindBetweenNormals(
                        (Reference.Elbow.GetLocation() - Reference.Upper.GetLocation()).GetSafeNormal(), UpperAxis).Inverse()
                        * Untwisted).GetNormalized());
                    Reference.Elbow.SetRotation((FQuat::FindBetweenNormals(
                        (Reference.Wrist.GetLocation() - Reference.Elbow.GetLocation()).GetSafeNormal(),
                        (Solved.Wrist.GetLocation() - Solved.Elbow.GetLocation()).GetSafeNormal()).Inverse()
                        * Solved.Elbow.GetRotation()).GetNormalized());
                    const FVector Axis = (Solved.Wrist.GetLocation() - Solved.Upper.GetLocation()).GetSafeNormal();
                    const FVector InitialRadial = FVector::VectorPlaneProject(
                        Reference.Elbow.GetLocation() - Solved.Upper.GetLocation(), Axis).GetSafeNormal();
                    const FVector SolvedRadial = FVector::VectorPlaneProject(
                        Solved.Elbow.GetLocation() - Solved.Upper.GetLocation(), Axis).GetSafeNormal();
                    const float Pole = FMath::RadiansToDegrees(FMath::Atan2(
                        FVector::DotProduct(Axis, FVector::CrossProduct(InitialRadial, SolvedRadial)),
                        FVector::DotProduct(InitialRadial, SolvedRadial)));
                    if (Side == 0) ContactSeed.LeftPole = Pole; else ContactSeed.RightPole = Pole;
                }
                bTestingSharedHistory = false;
                bJointValidation = true;
                for (int32 Refresh = 0; Refresh < 2 && JointReservedQueries > 0
                    && Result.WorstPenetrationCm > .02f; ++Refresh)
                {
                    FJointSeed Refined;
                    if (!RefineContacts(ContactSeed, Refined)) break;
                    --JointReservedQueries;
                    ++SkinQueryBudget;
                    ActiveSharedTranslation = Refined.Pose.SharedPerformanceTranslationCm;
                    for (int32 Side = 0; Side < 2; ++Side)
                    {
                        ActiveClavicleDeg[Side] = Refined.Pose.ClavicleProtractionDeg[Side];
                        ActiveAxialDeg[Side] = Refined.Pose.UpperAxialTwistDeg[Side];
                    }
                    FFlowArtsArmClearanceInput Geometry = Input;
                    Geometry.Arms[0] = Refined.Pose.Arms[0]; Geometry.Arms[1] = Refined.Pose.Arms[1];
                    Geometry.TorsoHulls = Refined.Pose.TorsoHulls; Geometry.BodyCapsules = Refined.Pose.BodyCapsules;
                    const int32 BeforeQueries = Result.SkinnedQueryCount;
                    Consider(Geometry, Refined.Pose.TorsoRotation, 0.f, 5);
                    if (BeforeQueries == Result.SkinnedQueryCount)
                    { --SkinQueryBudget; ++JointReservedQueries; break; }
                    ++Result.WarmRefinementQueryCount;
                    ContactSeed = MoveTemp(Refined);
                }
                bJointValidation = false;
                bTestingSharedHistory = true;
            }
            if (Result.WorstPenetrationCm > .02f)
            {
                ActiveSharedTranslation = History.PreviousSharedPerformanceTranslationCm.GetClampedToMaxSize(Bound);
                for (int32 Side = 0; Side < 2; ++Side)
                {
                    ActiveClavicleDeg[Side] = History.PreviousClavicleProtractionDeg[Side];
                    ActiveAxialDeg[Side] = History.PreviousUpperAxialTwistDeg[Side];
                }
                ConsiderTorso(History.PreviousTorsoRotation, 0);
                if (PhaseTiming.bEnabled)
                    UE_LOG(LogFlowArtsClearance, VeryVerbose,
                        TEXT("HistoryRecovery retained-pair queryCount=%d historyBudget=%d worst=%.6f mask=%u segments=%u contact=%d/%d/%d/%d"),
                        Result.SkinnedQueryCount, HistorySkinQueryBudget, Result.WorstPenetrationCm,
                        ResultSkinMask(Result), Result.SkinnedSegmentClearMask, Result.WorstObstacleKind,
                        Result.WorstArm, Result.WorstSegment, Result.WorstObstacleIndex);
            }
            const int32 HistoryQueryCount = Result.SkinnedQueryCount;
            const int32 HistoryWarmQueries = Result.WarmRefinementQueryCount;
            const uint32 HistorySkipReasons = Result.SkinnedSkipReasons;
            if ((IsCertifiedClear(Result) && IsCertifiedClear(Unshifted) &&
                    ResultContinuityStep(Unshifted) < ResultContinuityStep(Result)) ||
                (!IsCertifiedClear(Result) && IsCertifiedClear(Unshifted)) ||
                (!IsCertifiedClear(Result) && !IsCertifiedClear(Unshifted) &&
                    Unshifted.WorstPenetrationCm < Result.WorstPenetrationCm))
            { Result = Unshifted; BestScore = UnshiftedScore; }
            // Restoring an accepted pose never erases the work used to compare
            // it with the freshly certified history branch.
            Result.SkinnedQueryCount = FMath::Max(Result.SkinnedQueryCount, HistoryQueryCount);
            Result.WarmRefinementQueryCount = FMath::Max(Result.WarmRefinementQueryCount, HistoryWarmQueries);
            Result.SkinnedSkipReasons |= HistorySkipReasons;
            ActiveSharedTranslation = FVector::ZeroVector;
            bTestingSharedHistory = false;
            for (int32 Side = 0; Side < 2; ++Side) ActiveClavicleDeg[Side] = ActiveAxialDeg[Side] = 0.f;
        }
        // A seed prepared from another sample supplies coordinates only. Rebuild
        // the current wrists, props, torso and IK before its fresh certificate.
        // Reserve one of the ordinary joint queries; a miss still leaves the
        // authored and cold searches available within the same total budget.
        const FFlowArtsArmClearancePreparedSeed* Prepared = Input.PreparedSeed;
        bool bPreparedContinuous = Prepared && Prepared->bValid && bClavicleResponse
            && Prepared->bPreserveWrist == Input.bPreserveWrist && JointReservedQueries > 0
            && (Result.WorstPenetrationCm > .02f ||
                !HasCompleteSkinCertificate(ResultSkinMask(Result), Result.SkinnedSegmentClearMask))
            && !Prepared->TorsoRotation.ContainsNaN()
            && Prepared->TorsoRotation.SizeSquared() > .5f
            && FMath::RadiansToDegrees(Prepared->TorsoRotation.GetNormalized().AngularDistance(FQuat::Identity)) <= 65.01f
            && !Prepared->SharedPerformanceTranslationCm.ContainsNaN()
            && Prepared->SharedPerformanceTranslationCm.Size() <=
                FMath::Clamp(Input.MaxSharedPerformanceTranslationCm, 0.f, 35.f) + .001f
            && (Input.bAllowTorsoResponse || Prepared->TorsoRotation.Equals(FQuat::Identity, .00001f));
        if (bPreparedContinuous)
            for (int32 Side = 0; Side < 2; ++Side)
            {
                const float ArmLength = FVector::Dist(Input.Arms[Side].Upper.GetLocation(), Input.Arms[Side].Elbow.GetLocation())
                    + FVector::Dist(Input.Arms[Side].Elbow.GetLocation(), Input.Arms[Side].Wrist.GetLocation());
                bPreparedContinuous &= !Prepared->AuthoredShoulders[Side].ContainsNaN()
                    && !Prepared->AuthoredWrists[Side].ContainsNaN()
                    && !Prepared->SolvedShoulders[Side].ContainsNaN()
                    && !Prepared->SolvedElbows[Side].ContainsNaN()
                    && !Prepared->SolvedWrists[Side].ContainsNaN()
                    && !Prepared->SolvedUpperRotation[Side].ContainsNaN()
                    && !Prepared->SolvedForearmRotation[Side].ContainsNaN()
                    && Prepared->SolvedUpperRotation[Side].SizeSquared() > .5f
                    && Prepared->SolvedForearmRotation[Side].SizeSquared() > .5f
                    && FVector::DistSquared(Prepared->SolvedShoulders[Side], Prepared->SolvedElbows[Side]) > 1.f
                    && FVector::DistSquared(Prepared->SolvedElbows[Side], Prepared->SolvedWrists[Side]) > 1.f
                    && FMath::IsFinite(Prepared->ClavicleProtractionDeg[Side])
                    && FMath::IsFinite(Prepared->UpperAxialTwistDeg[Side])
                    && Prepared->ClavicleProtractionDeg[Side] >= 0.f
                    && Prepared->ClavicleProtractionDeg[Side] <= 40.f
                    && FMath::Abs(Prepared->UpperAxialTwistDeg[Side]) <= 15.f
                    && FVector::Dist(Prepared->AuthoredShoulders[Side], Input.Arms[Side].Upper.GetLocation()) <= ArmLength * .35f
                    && FVector::Dist(Prepared->AuthoredWrists[Side], Input.Arms[Side].Wrist.GetLocation()) <= ArmLength * .35f;
            }
        if (bPreparedContinuous)
        {
            ActiveSharedTranslation = Prepared->SharedPerformanceTranslationCm;
            for (int32 Side = 0; Side < 2; ++Side)
            {
                ActiveClavicleDeg[Side] = Prepared->ClavicleProtractionDeg[Side];
                ActiveAxialDeg[Side] = Prepared->UpperAxialTwistDeg[Side];
            }
            bJointValidation = true;
            --JointReservedQueries;
            ++SkinQueryBudget;
            const int32 BeforeQueries = Result.SkinnedQueryCount;
            ConsiderTorso(Prepared->TorsoRotation.GetNormalized(), 7);
            Result.PreparedSeedQueryCount += Result.SkinnedQueryCount - BeforeQueries;
            if (BeforeQueries == Result.SkinnedQueryCount)
            { --SkinQueryBudget; ++JointReservedQueries; }
            bJointValidation = false;
            ActiveSharedTranslation = FVector::ZeroVector;
            for (int32 Side = 0; Side < 2; ++Side) ActiveClavicleDeg[Side] = ActiveAxialDeg[Side] = 0.f;
        }
        // A failed exact query may be a useful nearby search coordinate. Rebuild
        // both arms against this frame's authored wrists, props and torso before
        // spending a fresh certificate. The feasible history remains untouched.
        if (bRejectedGuideContinuous && bClavicleResponse && Result.WorstPenetrationCm > .02f
            && JointReservedQueries > 0)
        {
            const float Bound = FMath::Clamp(Input.MaxSharedPerformanceTranslationCm, 0.f, 35.f);
            ActiveSharedTranslation = History.RejectedSharedPerformanceTranslationCm.GetClampedToMaxSize(Bound);
            for (int32 Side = 0; Side < 2; ++Side)
            {
                ActiveClavicleDeg[Side] = FMath::Clamp(History.RejectedClavicleProtractionDeg[Side], 0.f, 40.f);
                ActiveAxialDeg[Side] = FMath::Clamp(History.RejectedUpperAxialTwistDeg[Side], -15.f, 15.f);
            }
            bTestingRejectedGuide = true;
            bJointValidation = true;
            --JointReservedQueries;
            ++SkinQueryBudget;
            const int32 BeforeGuideQueries = Result.SkinnedQueryCount;
            ConsiderTorso(History.RejectedTorsoRotation, 6);
            Result.RejectedGuideQueryCount += Result.SkinnedQueryCount - BeforeGuideQueries;
            if (BeforeGuideQueries == Result.SkinnedQueryCount)
            { --SkinQueryBudget; ++JointReservedQueries; }
            bJointValidation = false;
            bTestingRejectedGuide = false;
            if (Result.WorstPenetrationCm > .02f && LastRejectedGuideSeed.IsSet()
                && Input.EvaluateSkinnedContacts && JointReservedQueries > 0)
            {
                FJointSeed ContactSeed = LastRejectedGuideSeed.GetValue();
                JointReferencePose = ContactSeed.Pose;
                const FTransform TorsoDelta(ContactSeed.Pose.TorsoRotation,
                    Input.TorsoPivot - ContactSeed.Pose.TorsoRotation.RotateVector(Input.TorsoPivot));
                for (int32 Side = 0; Side < 2; ++Side)
                {
                    const auto& Solved = ContactSeed.Pose.Arms[Side];
                    auto& Reference = JointReferencePose.Arms[Side];
                    const FTransform AuthoredClavicle = Input.Arms[Side].Clavicle * TorsoDelta;
                    const FQuat UndoClavicle = (AuthoredClavicle.GetRotation() * Solved.Clavicle.GetRotation().Inverse()).GetNormalized();
                    const FVector Pivot = AuthoredClavicle.GetLocation();
                    const FTransform Undo(UndoClavicle, Pivot - UndoClavicle.RotateVector(Pivot));
                    Reference.Clavicle = AuthoredClavicle;
                    Reference.Upper = Solved.Upper * Undo;
                    Reference.Elbow = Solved.Elbow * Undo;
                    Reference.Wrist = Solved.Wrist * Undo;
                    const FVector UpperAxis = (Solved.Elbow.GetLocation() - Solved.Upper.GetLocation()).GetSafeNormal();
                    const FQuat Untwisted = FQuat(UpperAxis, FMath::DegreesToRadians(-ContactSeed.Pose.UpperAxialTwistDeg[Side]))
                        * Solved.Upper.GetRotation();
                    Reference.Upper.SetRotation((FQuat::FindBetweenNormals(
                        (Reference.Elbow.GetLocation() - Reference.Upper.GetLocation()).GetSafeNormal(), UpperAxis).Inverse()
                        * Untwisted).GetNormalized());
                    Reference.Elbow.SetRotation((FQuat::FindBetweenNormals(
                        (Reference.Wrist.GetLocation() - Reference.Elbow.GetLocation()).GetSafeNormal(),
                        (Solved.Wrist.GetLocation() - Solved.Elbow.GetLocation()).GetSafeNormal()).Inverse()
                        * Solved.Elbow.GetRotation()).GetNormalized());
                    const FVector Axis = (Solved.Wrist.GetLocation() - Solved.Upper.GetLocation()).GetSafeNormal();
                    const FVector InitialRadial = FVector::VectorPlaneProject(
                        Reference.Elbow.GetLocation() - Solved.Upper.GetLocation(), Axis).GetSafeNormal();
                    const FVector SolvedRadial = FVector::VectorPlaneProject(
                        Solved.Elbow.GetLocation() - Solved.Upper.GetLocation(), Axis).GetSafeNormal();
                    const float Pole = FMath::RadiansToDegrees(FMath::Atan2(
                        FVector::DotProduct(Axis, FVector::CrossProduct(InitialRadial, SolvedRadial)),
                        FVector::DotProduct(InitialRadial, SolvedRadial)));
                    if (Side == 0) ContactSeed.LeftPole = Pole; else ContactSeed.RightPole = Pole;
                }
                bJointValidation = true;
                for (int32 Refresh = 0; Refresh < 2 && JointReservedQueries > 0
                    && Result.WorstPenetrationCm > .02f; ++Refresh)
                {
                    FJointSeed Refined;
                    if (!RefineContacts(ContactSeed, Refined)) break;
                    --JointReservedQueries;
                    ++SkinQueryBudget;
                    ActiveSharedTranslation = Refined.Pose.SharedPerformanceTranslationCm;
                    for (int32 Side = 0; Side < 2; ++Side)
                    {
                        ActiveClavicleDeg[Side] = Refined.Pose.ClavicleProtractionDeg[Side];
                        ActiveAxialDeg[Side] = Refined.Pose.UpperAxialTwistDeg[Side];
                    }
                    FFlowArtsArmClearanceInput Geometry = Input;
                    Geometry.Arms[0] = Refined.Pose.Arms[0]; Geometry.Arms[1] = Refined.Pose.Arms[1];
                    Geometry.TorsoHulls = Refined.Pose.TorsoHulls; Geometry.BodyCapsules = Refined.Pose.BodyCapsules;
                    const int32 BeforeQueries = Result.SkinnedQueryCount;
                    Consider(Geometry, Refined.Pose.TorsoRotation, 0.f, 5);
                    if (BeforeQueries == Result.SkinnedQueryCount)
                    { --SkinQueryBudget; ++JointReservedQueries; break; }
                    ++Result.WarmRefinementQueryCount;
                    ContactSeed = MoveTemp(Refined);
                }
                bJointValidation = false;
            }
            ActiveSharedTranslation = FVector::ZeroVector;
            for (int32 Side = 0; Side < 2; ++Side) ActiveClavicleDeg[Side] = ActiveAxialDeg[Side] = 0.f;
        }
        // Do not snap a large clear correction to identity when the authored
        // pose first clears. Validate a two-degree recovery step with full IK
        // and geometry; an invalid intermediate pose cannot override safety.
        if (bRecoverTorso && bFastClear && !bRecoverShared && !bRecoverClavicle && IsCertifiedClear(Result))
        {
            const FFlowArtsArmClearanceResult AuthoredClear = Result;
            const float AuthoredScore = BestScore;
            const float PreviousDegrees = FMath::RadiansToDegrees(
                History.PreviousTorsoRotation.AngularDistance(FQuat::Identity));
            const FQuat Recovery = FQuat::Slerp(History.PreviousTorsoRotation, FQuat::Identity,
                FMath::Min(1.f, 2.f / PreviousDegrees)).GetNormalized();
            Result.WorstPenetrationCm = BestScore = TNumericLimits<float>::Max();
            ConsiderTorso(Recovery, 2);
            if (Result.WorstPenetrationCm > .02f)
            {
                Result = AuthoredClear;
                BestScore = AuthoredScore;
            }
        }
        // Reconstruct and remeasure the previous torso plus elbow solution first.
        // This is a pose candidate, never a cached collision verdict.
        if (Result.WorstPenetrationCm > .02f && bContinuous &&
            FMath::RadiansToDegrees(History.PreviousTorsoRotation.AngularDistance(FQuat::Identity)) <= 65.01f)
            ConsiderTorso(History.PreviousTorsoRotation, 2);
        // A stable torso pose can now finish before the expensive authored pole
        // sweep. On failure, the original search is still performed in full.
        if (bDeferAuthoredSearch && Result.WorstPenetrationCm > .02f)
            Consider(Input, FQuat::Identity, 0.f);

        TArray<FQuat, TInlineAllocator<48>> Rotations;
        for (const FVector& Axis : {FVector::ForwardVector, FVector::RightVector})
            for (const float Degrees : {-16.f, -12.f, -6.f, 6.f, 12.f, 16.f})
                Rotations.Add(FQuat(Axis, FMath::DegreesToRadians(Degrees)));
        for (const float Degrees : {-10.f, 10.f})
            Rotations.Add(FQuat(FVector::UpVector, FMath::DegreesToRadians(Degrees)));
        const int32 OriginalRotationCount = Rotations.Num();
        for (const FVector& Axis : {FVector::ForwardVector, FVector::RightVector})
            for (const float Degrees : {-32.f, -24.f, 24.f, 32.f})
                Rotations.Add(FQuat(Axis, FMath::DegreesToRadians(Degrees)));
        for (const float Degrees : {-30.f, -20.f, 20.f, 30.f})
            Rotations.Add(FQuat(FVector::UpVector, FMath::DegreesToRadians(Degrees)));
        // Lean and twist must be considered together for a fixed grip crossing
        // the chest. Max combined rotation is 43.61 degrees (32 lean, 30 yaw).
        for (const FVector& Axis : {FVector::ForwardVector, FVector::RightVector})
            for (const float Sign : {-1.f, 1.f})
                for (const float YawSign : {-1.f, 1.f})
                    for (int32 Tier = 0; Tier < 2; ++Tier)
                    {
                        const FQuat Lean(Axis, FMath::DegreesToRadians(Sign * (Tier ? 32.f : 24.f)));
                        const FQuat Yaw(FVector::UpVector, FMath::DegreesToRadians(YawSign * (Tier ? 30.f : 20.f)));
                        Rotations.Add(Yaw * Lean);
                    }
        if (Input.bAllowSharedPerformanceTranslation && Result.WorstPenetrationCm > .02f)
        {
            const FVector Up = (Input.Neck - Input.FixedHip).GetSafeNormal();
            const FVector Side = FVector::VectorPlaneProject(
                Input.Arms[1].Upper.GetLocation() - Input.Arms[0].Upper.GetLocation(), Up).GetSafeNormal();
            const FVector Forward = FVector::CrossProduct(Side, Up).GetSafeNormal();
            const FVector PlaneCenter = (Input.Arms[0].Wrist.GetLocation() + Input.Arms[1].Wrist.GetLocation()) * .5f;
            const float ForwardProjection = bRecoverShared
                ? FVector::DotProduct(History.PreviousSharedPerformanceTranslationCm, Forward)
                : FVector::DotProduct(PlaneCenter - Input.TorsoPivot, Forward);
            const float Sign = ForwardProjection < 0.f ? -1.f : 1.f;
            const float Bound = FMath::Clamp(Input.MaxSharedPerformanceTranslationCm, 0.f, 35.f);
            struct FShiftSeed { FVector Shift; FQuat Rotation; float Score; float RetainedScore; };
            TArray<FShiftSeed> ShiftSeeds;
            // Intersect both reach spheres along the lateral axis. Crossed grips
            // often need a common lateral correction before a forward shift fits.
            // The ordinary pass uses nearest/center lateral offsets; the joint
            // shoulder pass also tests the two reach-interval quartiles.
            // Try the source/history side first, then the opposite side when
            // reach or contact makes that side infeasible. A feasible validated
            // history returns above, so this does not oscillate a paused plane.
            const auto Rank = [&](const FVector& Shift, const FQuat& Rotation, float ShoulderDegrees = 0.f, float LeftTwist = 0.f)
            {
                ActiveClavicleDeg[0] = ActiveClavicleDeg[1] = ShoulderDegrees;
                ActiveAxialDeg[0] = ShoulderDegrees > 0.f ? LeftTwist : 0.f;
                ActiveAxialDeg[1] = ShoulderDegrees > 0.f ? -15.f : 0.f;
                FFlowArtsArmClearanceInput ReachGeometry = Input;
                const FTransform ReachDelta(Rotation, Input.TorsoPivot - Rotation.RotateVector(Input.TorsoPivot));
                for (int32 ArmSide = 0; ArmSide < 2; ++ArmSide)
                {
                    ReachGeometry.Arms[ArmSide].Clavicle = Input.Arms[ArmSide].Clavicle * ReachDelta;
                    ReachGeometry.Arms[ArmSide].Upper = Input.Arms[ArmSide].Upper * ReachDelta;
                    ReachGeometry.Arms[ArmSide].Elbow = Input.Arms[ArmSide].Elbow * ReachDelta;
                    ReachGeometry.Arms[ArmSide].Wrist = Input.Arms[ArmSide].Wrist * ReachDelta;
                }
                ApplyClavicles(ReachGeometry, Rotation);
                const float LateralBound = FMath::Sqrt(FMath::Max(0.f, Bound * Bound - Shift.SizeSquared()));
                float MinLateral = -LateralBound, MaxLateral = LateralBound;
                for (int32 ArmSide = 0; ArmSide < 2; ++ArmSide)
                {
                    const auto& Arm = Input.Arms[ArmSide];
                    const FVector Shoulder = ReachGeometry.Arms[ArmSide].Upper.GetLocation();
                    const float Reach = FVector::Dist(Arm.Upper.GetLocation(), Arm.Elbow.GetLocation())
                        + FVector::Dist(Arm.Elbow.GetLocation(), Arm.Wrist.GetLocation()) - .01f;
                    const FVector Delta = Arm.Wrist.GetLocation() + Shift - Shoulder;
                    const float Along = FVector::DotProduct(Delta, Side);
                    const float RadiusSquared = Reach * Reach - (Delta.SizeSquared() - Along * Along);
                    if (RadiusSquared < 0.f)
                    { ++SharedCandidateCount; ++SharedReachRejectedCount; return; }
                    const float Radius = FMath::Sqrt(RadiusSquared);
                    MinLateral = FMath::Max(MinLateral, -Along - Radius);
                    MaxLateral = FMath::Min(MaxLateral, -Along + Radius);
                }
                if (MinLateral > MaxLateral)
                { ++SharedCandidateCount; ++SharedReachRejectedCount; return; }
                const float Nearest = FMath::Clamp(0.f, MinLateral, MaxLateral);
                const float Center = (MinLateral + MaxLateral) * .5f;
                const int32 LateralCount = ShoulderDegrees > 0.f ? 4 : 2;
                for (int32 LateralIndex = 0; LateralIndex < LateralCount; ++LateralIndex)
                {
                    if (LateralIndex == 1 && FMath::Abs(Center - Nearest) < 1.f) continue;
                    const float Lateral = LateralIndex == 0 ? Nearest : LateralIndex == 1 ? Center
                        : FMath::Lerp(MinLateral, MaxLateral, LateralIndex == 2 ? .25f : .75f);
                    ActiveSharedTranslation = Shift + Side * Lateral;
                    const float Score = ConsiderTorso(Rotation, 4);
                    if (ShoulderDegrees <= 0.f && Score < TNumericLimits<float>::Max())
                        ShiftSeeds.Add({ActiveSharedTranslation, Rotation, Score, RetainedSharedRankScore});
                }
            };
            for (const float Direction : {Sign, -Sign})
            for (const float Distance : {6.f, 12.f, 18.f, 24.f, 30.f})
                for (const float Height : {0.f, 6.f, -6.f, 12.f})
                {
                    const FVector Shift = Forward * (Direction * Distance) + Up * Height;
                    if (Shift.Size() > Bound + .001f) continue;
                    Rank(Shift, FQuat::Identity);
                    for (const float Lean : {-24.f, -12.f, 12.f, 24.f})
                        Rank(Shift, FQuat(Side, FMath::DegreesToRadians(Lean)));
                    if (IsCertifiedClear(Result)) break;
                }
            TArray<FShiftSeed> RetainedSeeds = ShiftSeeds;
            RetainedSeeds.Sort([](const FShiftSeed& A, const FShiftSeed& B) { return A.RetainedScore < B.RetainedScore; });
            ShiftSeeds.Sort([](const FShiftSeed& A, const FShiftSeed& B) { return A.Score < B.Score; });
            SharedRankedSeedCount = ShiftSeeds.Num();
            TArray<FVector, TInlineAllocator<6>> TestedShifts;
            int32 NextSeed[2] = {0, 0};
            // Retain the original four conservative seeds, then at most two
            // additional optimistic seeds. Exact query count remains capped at
            // eight; neither ranking may discard the other's physical solution.
            for (int32 Slot = 0; Slot < 6; ++Slot)
            {
                const int32 Ranking = Slot < 4 ? 0 : 1;
                const auto& Ranked = Ranking == 0 ? RetainedSeeds : ShiftSeeds;
                while (NextSeed[Ranking] < Ranked.Num() && TestedShifts.ContainsByPredicate([&](const FVector& Tested)
                    { return FVector::DistSquared(Tested, Ranked[NextSeed[Ranking]].Shift) < 4.f; })) ++NextSeed[Ranking];
                if (NextSeed[Ranking] >= Ranked.Num()) continue;
                const auto& Seed = Ranked[NextSeed[Ranking]++];
                TestedShifts.Add(Seed.Shift);
                ActiveSharedTranslation = Seed.Shift;
                ConsiderTorso(Seed.Rotation, 0);
            }
            // Refine common planes around the selected physical base rather
            // than measuring every pole at every reach-grid point. The base
            // quaternion and pole are immutable throughout this local search.
            if (bClavicleResponse && Result.WorstPenetrationCm > .02f)
            {
                const FFlowArtsArmClearanceResult Base = BestProxySharedScore < TNumericLimits<float>::Max()
                    ? BestProxySharedPose : Result;
                JointReferencePose = Base;
                const auto RankJoint = [&](const FVector& Shift, float Degrees, float LeftTwist)
                {
                    if (Shift.Size() > Bound + .001f) return;
                    ActiveSharedTranslation = Shift;
                    ActiveClavicleDeg[0] = ActiveClavicleDeg[1] = Degrees;
                    ActiveAxialDeg[0] = LeftTwist; ActiveAxialDeg[1] = -15.f;
                    FFlowArtsArmClearanceInput Joint = Input;
                    Joint.TorsoHulls = Base.TorsoHulls; Joint.BodyCapsules = Base.BodyCapsules;
                    for (int32 ArmSide = 0; ArmSide < 2; ++ArmSide)
                    {
                        Joint.Arms[ArmSide] = Base.Arms[ArmSide];
                        ClavicleReferenceArms[ArmSide] = Base.Arms[ArmSide];
                    }
                    ApplyClavicles(Joint, Base.TorsoRotation);
                    FFlowArtsArmClearanceInput Props = Joint;
                    for (int32 ArmSide = 0; ArmSide < 2; ++ArmSide)
                        for (auto& Prop : Props.HeldPropCapsules[ArmSide])
                        { Prop.Start += Shift; Prop.End += Shift; }
                    ++SharedCandidateCount;
                    if (HeadPropDepth(Props) > .02f)
                    { ++SharedHeadPropRejectedCount; return; }
                    bJointRanking = true;
                    Consider(Joint, Base.TorsoRotation, 0.f, 4);
                    bJointRanking = false;
                };
                // Cover common-offset space independently of a single proxy
                // minimum. The lattice is relative to zero shared translation;
                // it never depends on absolute avatar location or source score.
                for (int32 X = -3; X <= 3; ++X)
                    for (int32 Y = -3; Y <= 3; ++Y)
                        for (int32 Z = -3; Z <= 3; ++Z)
                        {
                            const FVector Shift(X * 10.f, Y * 10.f, Z * 10.f);
                            if (Shift.SizeSquared() > Bound * Bound) continue;
                            RankJoint(Shift, 40.f, 0.f);
                        }
            }
            ActiveSharedTranslation = FVector::ZeroVector;
            for (int32 SideIndex = 0; SideIndex < 2; ++SideIndex)
                ActiveClavicleDeg[SideIndex] = ActiveAxialDeg[SideIndex] = 0.f;
        }
        struct FSeed { FQuat Rotation; float Score; };
        TArray<FSeed, TInlineAllocator<48>> Seeds;
        // One valid IK solution per arm cheaply ranks the expanded body search.
        // A clear candidate is accepted only after all existing geometry checks.
        for (const FQuat& Rotation : Rotations)
        {
            if (IsCertifiedClear(Result)) break;
            const float Score = ConsiderTorso(Rotation, 3);
            if (Score < TNumericLimits<float>::Max()) Seeds.Add({Rotation, Score});
        }
        Seeds.Sort([](const FSeed& A, const FSeed& B) { return A.Score < B.Score; });
        for (int32 Index = 0; Index < FMath::Min(4, Seeds.Num()); ++Index)
            ConsiderTorso(Seeds[Index].Rotation, 0);
        // If coarse candidates did not clear, retain the entire previous pole
        // search. Ranking cannot remove a solution the original solver found.
        for (int32 Index = 0; Index < OriginalRotationCount; ++Index)
            ConsiderTorso(Rotations[Index], 0);

    }

    if (bClavicleResponse && Result.WorstPenetrationCm > .02f)
    {
        // A local shoulder-girdle response preserves the selected common plane,
        // hips, head and hand frames. Exact skin validation, full opposite-arm,
        // forearm and prop measurements still decide whether it improves the pose.
        TArray<FFlowArtsArmClearanceResult, TInlineAllocator<2>> Bases;
        if (BestProxySharedScore < TNumericLimits<float>::Max()) Bases.Add(BestProxySharedPose);
        if (Bases.IsEmpty() || !Bases[0].SharedPerformanceTranslationCm.Equals(Result.SharedPerformanceTranslationCm, .001f)
            || !Bases[0].TorsoRotation.Equals(Result.TorsoRotation, .00001f)
            || !Bases[0].Arms[0].Elbow.Equals(Result.Arms[0].Elbow, .001f)
            || !Bases[0].Arms[1].Elbow.Equals(Result.Arms[1].Elbow, .001f)) Bases.Add(Result);
        SkinQueryBudget += JointReservedQueries;
        JointReservedQueries = 0;
        // Validate the joint-ranked geometry before revisiting old unprotracted
        // bases. Six reserved queries retain two independently refined planes.
        bJointValidation = true;
        TArray<const FJointSeed*, TInlineAllocator<8>> PendingJoint;
        for (int32 Stratum = 0; Stratum < 4; ++Stratum)
        {
            const float RightPole = Stratum == 0 ? -30.f : Stratum == 1 ? 0.f : 30.f;
            const float LeftPole = Stratum == 3 ? -30.f : 0.f;
            int32 Rank = 0;
            for (const FJointSeed& Seed : JointSeeds)
                if (FMath::IsNearlyEqual(Seed.LeftPole, LeftPole) && FMath::IsNearlyEqual(Seed.RightPole, RightPole))
                {
                    UE_LOG(LogFlowArtsClearance, Verbose, TEXT("Joint retained poles=%.0f/%.0f candidate=%d shift=%s rank=%.6f"),
                        Seed.LeftPole, Seed.RightPole, Rank, *Seed.Pose.SharedPerformanceTranslationCm.ToString(), Seed.Score);
                    if (Rank == 0) PendingJoint.Add(&Seed);
                    if (++Rank == 2) break;
                }
        }
        TArray<const FJointSeed*, TInlineAllocator<4>> TriedJoint;
        for (int32 Attempt = 0; Attempt < 4 && !PendingJoint.IsEmpty(); ++Attempt)
        {
            if (IsCertifiedClear(Result) || SkinQueryBudget <= 0) break;
            const FJointSeed* Selected = PendingJoint[0];
            PendingJoint.RemoveAt(0);
            TriedJoint.Add(Selected);
            const FJointSeed& Seed = *Selected;
            UE_LOG(LogFlowArtsClearance, Verbose, TEXT("Joint selected poles=%.0f/%.0f shift=%s rank=%.6f"),
                Seed.LeftPole, Seed.RightPole, *Seed.Pose.SharedPerformanceTranslationCm.ToString(), Seed.Score);
            ActiveSharedTranslation = Seed.Pose.SharedPerformanceTranslationCm;
            for (int32 Side = 0; Side < 2; ++Side)
            {
                ActiveClavicleDeg[Side] = Seed.Pose.ClavicleProtractionDeg[Side];
                ActiveAxialDeg[Side] = Seed.Pose.UpperAxialTwistDeg[Side];
            }
            FFlowArtsArmClearanceInput Geometry = Input;
            Geometry.Arms[0] = Seed.Pose.Arms[0]; Geometry.Arms[1] = Seed.Pose.Arms[1];
            Geometry.TorsoHulls = Seed.Pose.TorsoHulls; Geometry.BodyCapsules = Seed.Pose.BodyCapsules;
            LastJointCertificate = 0;
            Consider(Geometry, Seed.Pose.TorsoRotation, 0.f, 5);
            // Two refreshed refinements per plane retain an equal three-query
            // share for the independently retained alternate common plane.
            FJointSeed ContactSeed = Seed;
            for (int32 Refresh = 0; Refresh < 2 && Input.EvaluateSkinnedContacts
                && Result.WorstPenetrationCm > .02f && SkinQueryBudget > 0; ++Refresh)
            {
                FJointSeed Refined;
                if (!RefineContacts(ContactSeed, Refined)) break;
                ActiveSharedTranslation = Refined.Pose.SharedPerformanceTranslationCm;
                for (int32 Side = 0; Side < 2; ++Side)
                {
                    ActiveAxialDeg[Side] = Refined.Pose.UpperAxialTwistDeg[Side];
                    ActiveClavicleDeg[Side] = Refined.Pose.ClavicleProtractionDeg[Side];
                }
                Geometry.TorsoHulls = Refined.Pose.TorsoHulls;
                Geometry.BodyCapsules = Refined.Pose.BodyCapsules;
                Geometry.Arms[0] = Refined.Pose.Arms[0]; Geometry.Arms[1] = Refined.Pose.Arms[1];
                const int32 BeforeQueries = Result.SkinnedQueryCount;
                Consider(Geometry, Refined.Pose.TorsoRotation, 0.f, 5);
                if (Result.SkinnedQueryCount == BeforeQueries) break;
                ContactSeed = MoveTemp(Refined);
            }
            // A one-sided certificate is concrete evidence that this elbow branch
            // is useful. Test its independently retained common plane before
            // discarding it for a different right bend. Every query is fresh.
            const uint8 UpperMask = LastJointCertificate & 3;
            if (UpperMask == 1 || UpperMask == 2)
                for (const FJointSeed& Alternative : JointSeeds)
                    if (FMath::IsNearlyEqual(Alternative.LeftPole, Seed.LeftPole)
                        && FMath::IsNearlyEqual(Alternative.RightPole, Seed.RightPole)
                        && !TriedJoint.Contains(&Alternative))
                    {
                        PendingJoint.Remove(&Alternative);
                        PendingJoint.Insert(&Alternative, 0);
                        break;
                    }
        }
        bJointValidation = false;
        bClosestClaviclePole = true;
        for (const FFlowArtsArmClearanceResult& Base : Bases)
        {
            if (IsCertifiedClear(Result)) break;
            ActiveSharedTranslation = Base.SharedPerformanceTranslationCm;
            for (int32 Side = 0; Side < 2; ++Side) ClaviclePoles[Side] = Base.Arms[Side].Elbow.GetLocation();
            for (const float Degrees : {30.f, 40.f})
            {
                if (IsCertifiedClear(Result)) break;
                ActiveClavicleDeg[0] = ActiveClavicleDeg[1] = Degrees;
                ActiveAxialDeg[0] = 0.f;
                ActiveAxialDeg[1] = -15.f;
                FFlowArtsArmClearanceInput ClavicleCandidate = Input;
                ClavicleCandidate.Arms[0] = Base.Arms[0]; ClavicleCandidate.Arms[1] = Base.Arms[1];
                // The selected base may itself be a partially useful history pose.
                // Remove its axial response before applying the absolute new one.
                for (int32 Side = 0; Side < 2; ++Side)
                    if (!FMath::IsNearlyZero(Base.UpperAxialTwistDeg[Side]))
                    {
                        auto& Arm = ClavicleCandidate.Arms[Side];
                        const FVector Axis = (Arm.Elbow.GetLocation() - Arm.Upper.GetLocation()).GetSafeNormal();
                        Arm.Upper.SetRotation((FQuat(Axis, -FMath::DegreesToRadians(Base.UpperAxialTwistDeg[Side])) *
                            Arm.Upper.GetRotation()).GetNormalized());
                    }
                ClavicleCandidate.TorsoHulls = Base.TorsoHulls;
                ClavicleCandidate.BodyCapsules = Base.BodyCapsules;
                ClavicleReferenceArms[0] = ClavicleCandidate.Arms[0];
                ClavicleReferenceArms[1] = ClavicleCandidate.Arms[1];
                ApplyClavicles(ClavicleCandidate, Base.TorsoRotation);
                Consider(ClavicleCandidate, Base.TorsoRotation, 0.f);
            }
        }
        bClosestClaviclePole = false;
        ActiveSharedTranslation = FVector::ZeroVector;
    }


    }

    if (BestScore == TNumericLimits<float>::Max() && UncertifiedClearScore < TNumericLimits<float>::Max())
    {
        // Preserve solve diagnostics while retaining the rejected pose for inspection.
        for (int32 Side = 0; Side < 2; ++Side)
        {
            Result.Arms[Side] = UncertifiedClearFallback.Arms[Side];
            Result.ClavicleProtractionDeg[Side] = UncertifiedClearFallback.ClavicleProtractionDeg[Side];
            Result.UpperAxialTwistDeg[Side] = UncertifiedClearFallback.UpperAxialTwistDeg[Side];
        }
        Result.SkinnedUpperTorsoClearMask = UncertifiedClearFallback.SkinnedUpperTorsoClearMask;
        Result.bSkinnedArmPairClear = UncertifiedClearFallback.bSkinnedArmPairClear;
        Result.SkinnedOppositePropClearMask = UncertifiedClearFallback.SkinnedOppositePropClearMask;
        Result.SkinnedHeldPropBodyClearMask = UncertifiedClearFallback.SkinnedHeldPropBodyClearMask;
        Result.ForearmBodyClearMask = UncertifiedClearFallback.ForearmBodyClearMask;
        Result.ForearmHeadClearMask = UncertifiedClearFallback.ForearmHeadClearMask;
        Result.SharedPerformanceTranslationCm = UncertifiedClearFallback.SharedPerformanceTranslationCm;
        Result.WorstPenetrationCm = UncertifiedClearFallback.WorstPenetrationCm;
        Result.TotalPenetrationCm = UncertifiedClearFallback.TotalPenetrationCm;
        Result.WorstArm = UncertifiedClearFallback.WorstArm;
        Result.WorstSegment = UncertifiedClearFallback.WorstSegment;
        Result.WorstObstacleKind = UncertifiedClearFallback.WorstObstacleKind;
        Result.WorstObstacleIndex = UncertifiedClearFallback.WorstObstacleIndex;
        Result.TorsoHulls = MoveTemp(UncertifiedClearFallback.TorsoHulls);
        Result.BodyCapsules = MoveTemp(UncertifiedClearFallback.BodyCapsules);
        Result.TorsoRotation = UncertifiedClearFallback.TorsoRotation;
    }
    Result.bSharedTranslationAllowed = Input.bAllowSharedPerformanceTranslation;
    Result.SharedCandidateCount = SharedCandidateCount;
    Result.SharedHeadPropRejectedCount = SharedHeadPropRejectedCount;
    Result.SharedReachRejectedCount = SharedReachRejectedCount;
    Result.SharedNoIKCount = SharedNoIKCount;
    Result.SharedRankedSeedCount = SharedRankedSeedCount;
    Result.SharedFullSearchCount = SharedFullSearchCount;
    Result.BestSharedPenetrationCm = BestSharedPenetrationCm;
    Result.bSkinnedCallbackAvailable = !!Input.CertifySkinnedUpperTorso;
    Result.bFeasible = Result.WorstPenetrationCm <= 0.02f
        && HasCompleteSkinCertificate(ResultSkinMask(Result), Result.SkinnedSegmentClearMask);
    // A failed pose is still returned for diagnostics and rendering, but it is
    // not a useful temporal seed. Keep the last certified correction until the
    // authored shoulders or wrists move outside the continuity bound above.
    for (int32 Side = 0; Side < 2; ++Side)
    {
        const FFlowArtsClearanceArm& Before = Input.Arms[Side];
        const FFlowArtsClearanceArm& After = Result.Arms[Side];
        Result.WorstWristPositionErrorCm = FMath::Max(Result.WorstWristPositionErrorCm,
            FVector::Dist(Before.Wrist.GetLocation(), After.Wrist.GetLocation()));
        Result.WorstWristAngleErrorDeg = FMath::Max(Result.WorstWristAngleErrorDeg,
            FMath::RadiansToDegrees(Before.Wrist.GetRotation().AngularDistance(After.Wrist.GetRotation())));
        Result.MaxElbowDisplacementCm = FMath::Max(Result.MaxElbowDisplacementCm,
            FVector::Dist(Before.Elbow.GetLocation(), After.Elbow.GetLocation()));
        if (!Result.bFeasible) continue;
        History.PreviousAuthoredArmTransforms[Side][0] = Before.Clavicle;
        History.PreviousAuthoredArmTransforms[Side][1] = Before.Upper;
        History.PreviousAuthoredArmTransforms[Side][2] = Before.Elbow;
        History.PreviousAuthoredArmTransforms[Side][3] = Before.Wrist;
        History.PreviousSolvedShoulders[Side] = After.Upper.GetLocation();
        History.PreviousSolvedUpperRotation[Side] = After.Upper.GetRotation();
        History.PreviousSolvedForearmRotation[Side] = After.Elbow.GetRotation();
        History.PreviousElbows[Side] = After.Elbow.GetLocation();
        History.PreviousClavicleProtractionDeg[Side] = Result.ClavicleProtractionDeg[Side];
        History.PreviousUpperAxialTwistDeg[Side] = Result.UpperAxialTwistDeg[Side];
        // Detect changes in the authored animation, not our own correction.
        // Solved shoulders/hands may legitimately be far from these inputs.
        History.PreviousShoulders[Side] = Before.Upper.GetLocation();
        History.PreviousWrists[Side] = Before.Wrist.GetLocation();
    }
    if (Result.bFeasible)
    {
        History.bRejectedGuideValid = false;
        History.bValid = true;
        History.PreviousTorsoRotation = Result.TorsoRotation;
        History.PreviousSharedPerformanceTranslationCm = Result.SharedPerformanceTranslationCm;
        History.PreviousWristOffsetCm = SelectedWristOffsetCm;
        History.PreviousWristAbductionDeg = SelectedWristAbductionDeg;
    }
    else if (BestRejectedGuideSeed.IsSet())
    {
        const auto& Guide = BestRejectedGuideSeed.GetValue().Pose;
        for (int32 Side = 0; Side < 2; ++Side)
        {
            History.RejectedElbows[Side] = Guide.Arms[Side].Elbow.GetLocation();
            History.RejectedAuthoredShoulders[Side] = Input.Arms[Side].Upper.GetLocation();
            History.RejectedAuthoredWrists[Side] = Input.Arms[Side].Wrist.GetLocation();
            History.RejectedClavicleProtractionDeg[Side] = Guide.ClavicleProtractionDeg[Side];
            History.RejectedUpperAxialTwistDeg[Side] = Guide.UpperAxialTwistDeg[Side];
        }
        History.RejectedTorsoRotation = Guide.TorsoRotation;
        History.RejectedSharedPerformanceTranslationCm = Guide.SharedPerformanceTranslationCm;
        History.bRejectedPreserveWrist = Input.bPreserveWrist;
        History.bRejectedGuideValid = true;
    }
    else if (!bRejectedGuideContinuous)
        History.bRejectedGuideValid = false;
    // A hard grip invalidates soft wrist targets even when this frame cannot
    // clear. The last feasible shoulder/torso correction remains a warm seed.
    if (Input.bPreserveWrist)
    {
        History.PreviousWristOffsetCm = 0.f;
        History.PreviousWristAbductionDeg = 0.f;
    }
    Result.bApplied = Result.MaxElbowDisplacementCm > 0.01f || Result.WorstWristPositionErrorCm > .01f ||
        !Result.TorsoRotation.Equals(FQuat::Identity, 0.00001f) ||
        Result.NeckCounterFraction>0.f ||
        Result.ClavicleProtractionDeg[0] > .01f || Result.ClavicleProtractionDeg[1] > .01f ||
        FMath::Abs(Result.UpperAxialTwistDeg[0]) > .01f || FMath::Abs(Result.UpperAxialTwistDeg[1]) > .01f;
    return Result;
}

FVector FFlowArtsArmClearance::StepContactHandCorrection(const FVector& Current,
    const FVector& Gradient, float DeltaSeconds, const FVector& ComponentToWorldScale, double MaxDistanceCm)
{
    if (Current.ContainsNaN()) return FVector::ZeroVector;
    if (Gradient.ContainsNaN() || !FMath::IsFinite(DeltaSeconds) || DeltaSeconds<=0.f ||
        ComponentToWorldScale.ContainsNaN() || ComponentToWorldScale.GetAbsMin()<=SMALL_NUMBER ||
        !FMath::IsFinite(MaxDistanceCm) || MaxDistanceCm<=0.)
        return Current;
    const FVector WorldCurrent=Current*ComponentToWorldScale;
    const FVector WorldGradient=Gradient/ComponentToWorldScale;
    const FVector Velocity=(-WorldGradient*24.-WorldCurrent*.32).GetClampedToMaxSize(30.);
    return (WorldCurrent+Velocity*FMath::Min(DeltaSeconds,.1f)).GetClampedToMaxSize(MaxDistanceCm)/ComponentToWorldScale;
}

FVector FFlowArtsArmClearance::StepContactTorsoCorrection(const FVector& Current,
    const FVector& Gradient, float DeltaSeconds)
{
    if (Current.ContainsNaN()) return FVector::ZeroVector;
    if (Gradient.ContainsNaN() || !FMath::IsFinite(DeltaSeconds) || DeltaSeconds<=0.f) return Current;
    constexpr double Limit=25.*PI/180.;
    const FVector Velocity=(-Gradient*.01-Current*.32).GetClampedToMaxSize(Limit);
    return (Current+Velocity*FMath::Min(DeltaSeconds,.1f)).GetClampedToMaxSize(Limit);
}

double FFlowArtsArmClearance::StepContactElbowCorrection(double Current, double Gradient, float DeltaSeconds)
{
    if (!FMath::IsFinite(Current)) return 0.;
    if (!FMath::IsFinite(Gradient) || !FMath::IsFinite(DeltaSeconds) || DeltaSeconds<=0.f) return Current;
    constexpr double Limit=PI/12.;
    constexpr double Speed=PI/6.;
    const double Velocity=FMath::Clamp(-Gradient*.05-Current*.32,-Speed,Speed);
    return FMath::Clamp(Current+Velocity*FMath::Min(DeltaSeconds,.1f),-Limit,Limit);
}


namespace
{
bool PreparedBasis(const FVector& Axis, const FVector& Normal, FQuat& Out)
{
    if (Axis.IsNearlyZero(1.e-8) || Normal.IsNearlyZero(1.e-8) ||
        Axis.ContainsNaN() || Normal.ContainsNaN()) return false;
    Out = FRotationMatrix::MakeFromXY(Axis, Normal).ToQuat().GetNormalized();
    return !Out.ContainsNaN();
}

double PreparedTorsoPenalty(const FFlowArtsArmClearanceInput& Geometry)
{
    // The final source check retains forearm/torso and forearm/head proxy
    // contacts when their independent exact proofs are absent. Give those
    // retained contacts a continuous search merit as well. Only fresh,
    // same-pose, same-side proofs can remove their corresponding proxy term.
    const uint8 ForearmBodyMask=Geometry.CertifyForearmBody
        ? Geometry.CertifyForearmBody(Geometry.Arms,Geometry.SourceTorsoRotation)&3 : 0;
    const uint8 ForearmHeadMask=Geometry.CertifyForearmHead
        ? Geometry.CertifyForearmHead(Geometry.Arms,Geometry.SourceTorsoRotation)&3 : 0;
    double Penalty=0.;
    for(int32 Index=0;Index<2 && Index<Geometry.TorsoHulls.Num();++Index)
        for(int32 Side=0;Side<2;++Side)
            if(!(ForearmBodyMask&(1<<Side)))
            {
                const double ForearmDepth=FFlowArtsArmClearance::HullPenetrationCm(
                    ForearmCapsule(Geometry.Arms[Side]),Geometry.TorsoHulls[Index],Geometry.SurfacePaddingCm);
                Penalty+=ForearmDepth*ForearmDepth;
            }
    for(int32 Index=2;Index<Geometry.TorsoHulls.Num();++Index)
        for(int32 Side=0;Side<2;++Side)
        {
            const double UpperDepth=FFlowArtsArmClearance::HullPenetrationCm(
                UpperCapsule(Geometry.Arms[Side]),Geometry.TorsoHulls[Index],Geometry.SurfacePaddingCm);
            Penalty+=UpperDepth*UpperDepth;
            if(Index==2 && (ForearmHeadMask&(1<<Side))) continue;
            const double ForearmDepth=FFlowArtsArmClearance::HullPenetrationCm(
                ForearmCapsule(Geometry.Arms[Side]),Geometry.TorsoHulls[Index],Geometry.SurfacePaddingCm);
            Penalty+=ForearmDepth*ForearmDepth;
        }
    return Penalty;
}

bool BuildPreparedGeometry(const FFlowArtsArmClearanceInput& Source,
    FFlowArtsArmClearancePreparedSeed& Seed, FFlowArtsArmClearanceInput& Out,
    FString* Failure=nullptr)
{
    if (!Seed.bValid || !Seed.bAbsoluteControls || Seed.TorsoRotation.ContainsNaN())
    { if(Failure) *Failure=TEXT("invalid absolute controls or torso rotation"); return false; }
    const FQuat Torso = Seed.TorsoRotation.GetNormalized();
    const FTransform Body(Torso, Source.TorsoPivot - Torso.RotateVector(Source.TorsoPivot));
    const FVector Up = (Source.Neck - Source.FixedHip).GetSafeNormal();
    if (Up.IsNearlyZero())
    { if(Failure) *Failure=TEXT("degenerate torso up axis"); return false; }
    FRefinementGeometryScratch Scratch(Source);
    Scratch.Update(Source, Source.TorsoHulls, Source.BodyCapsules, FQuat::Identity, Torso);
    Out = MoveTemp(Scratch.Geometry);
    Out.PreparedSeed = nullptr;
    Out.bSourceFidelityOnly = true;
    Out.SourceTorsoRotation = Torso;
    Out.AddedTorsoPitch = Seed.AddedTorsoPitch;
    Out.NeckCounterFraction = Seed.NeckCounterFraction;
    for (int32 Side = 0; Side < 2; ++Side)
    {
        const auto& Original = Source.Arms[Side];
        auto& Arm = Out.Arms[Side];
        Arm.Clavicle = Original.Clavicle * Body;
        Arm.Upper = Original.Upper * Body;
        const FVector Shift = Seed.HandTranslationCm[Side];
        if (Shift.ContainsNaN() || Seed.ElbowPole[Side].ContainsNaN())
        { if(Failure) *Failure=FString::Printf(TEXT("side=%d invalid hand shift or pole"),Side); return false; }
        if (Arm.bHasClavicle)
        {
            const FVector Pivot = Arm.Clavicle.GetLocation();
            const double Angle = FMath::DegreesToRadians(Seed.ClavicleProtractionDeg[Side]) * (Side ? -1. : 1.);
            const FQuat Protraction(Torso.RotateVector(Up), Angle);
            const FTransform Delta(Protraction, Pivot - Protraction.RotateVector(Pivot));
            Arm.Clavicle = Arm.Clavicle * Delta;
            Arm.Upper = Arm.Upper * Delta;
        }
        const FVector Shoulder = Arm.Upper.GetLocation();
        const FTransform& Target = Source.bHasPreparedHandTargets ? Source.PreparedHandTargets[Side] : Original.Wrist;
        const FVector Hand = Target.GetLocation() + Shift;
        FVector Axis = Hand - Shoulder;
        const double Distance = Axis.Size();
        const double UpperLength = FVector::Dist(Original.Upper.GetLocation(), Original.Elbow.GetLocation());
        const double ForeLength = FVector::Dist(Original.Elbow.GetLocation(), Original.Wrist.GetLocation());
        if (!FMath::IsFinite(Distance) || Distance <= FMath::Abs(UpperLength-ForeLength)+1.e-5 ||
            Distance >= UpperLength+ForeLength-1.e-5)
        {
            if(Failure) *Failure=FString::Printf(TEXT("side=%d reach distance=%.9f min=%.9f max=%.9f shoulder=%s hand=%s"),
                Side,Distance,FMath::Abs(UpperLength-ForeLength),UpperLength+ForeLength,
                *Shoulder.ToString(),*Hand.ToString());
            return false;
        }
        Axis /= Distance;
        const double Along = (UpperLength*UpperLength-ForeLength*ForeLength+Distance*Distance)/(2.*Distance);
        const double RadiusSquared = UpperLength*UpperLength-Along*Along;
        if (RadiusSquared <= 1.e-8)
        { if(Failure) *Failure=FString::Printf(TEXT("side=%d elbow circle radiusSquared=%.9f"),Side,RadiusSquared); return false; }
        FVector Pole = Seed.ElbowPole[Side] - Axis*FVector::DotProduct(Seed.ElbowPole[Side],Axis);
        if (!Pole.Normalize(1.e-8))
        { if(Failure) *Failure=FString::Printf(TEXT("side=%d degenerate projected elbow pole"),Side); return false; }
        const FVector Elbow = Shoulder + Along*Axis + FMath::Sqrt(RadiusSquared)*Pole;
        const FVector Normal = FVector::CrossProduct(Elbow-Shoulder,Hand-Elbow).GetSafeNormal();
        FQuat UpperBasis, ForeBasis;
        if (!PreparedBasis(Elbow-Shoulder,Normal,UpperBasis) ||
            !PreparedBasis(Hand-Elbow,Normal,ForeBasis))
        { if(Failure) *Failure=FString::Printf(TEXT("side=%d degenerate arm frame basis"),Side); return false; }
        Arm.Upper.SetRotation((UpperBasis*Seed.UpperFrameOffset[Side]).GetNormalized());
        Arm.Elbow = Original.Elbow;
        Arm.Elbow.SetLocation(Elbow);
        Arm.Elbow.SetRotation((ForeBasis*Seed.ForearmFrameOffset[Side]).GetNormalized());
        Arm.Wrist = Target;
        Arm.Wrist.SetLocation(Hand);
        for (auto& Prop : Out.HeldPropCapsules[Side]) { Prop.Start += Shift; Prop.End += Shift; }
        Seed.AuthoredShoulders[Side] = Original.Upper.GetLocation();
        Seed.AuthoredWrists[Side] = Target.GetLocation();
        Seed.SolvedShoulders[Side] = Shoulder;
        Seed.SolvedElbows[Side] = Elbow;
        Seed.SolvedWrists[Side] = Hand;
        Seed.SolvedUpperRotation[Side] = Arm.Upper.GetRotation();
        Seed.SolvedForearmRotation[Side] = Arm.Elbow.GetRotation();
    }
    if (!FMath::IsFinite(Seed.NeckCounterFraction) || Seed.NeckCounterFraction<0.f ||
        Seed.NeckCounterFraction>1.f || Seed.AddedTorsoPitch.ContainsNaN() ||
        !Seed.AddedTorsoPitch.IsNormalized())
    { if(Failure) *Failure=TEXT("invalid neck control"); return false; }
    const FVector PosedNeck=Body.TransformPosition(Source.Neck);
    const FVector PosedHead=Body.TransformPosition(Source.Head);
    FQuat Counter=FQuat::Identity;
    if (Seed.NeckCounterFraction>0.f)
    {
        const FQuat Yaw=(Torso*Seed.AddedTorsoPitch.Inverse()).GetNormalized();
        const FQuat Unpitch=FQuat::Slerp(FQuat::Identity,Seed.AddedTorsoPitch.Inverse(),
            Seed.NeckCounterFraction).GetNormalized();
        Counter=(Yaw*Unpitch*Yaw.Inverse()).GetNormalized();
        const FTransform HeadDelta(Counter,PosedNeck-Counter.RotateVector(PosedNeck));
        if (Out.TorsoHulls.Num()<3 || Out.BodyCapsules.Num()<3 || !Out.RebindPreparedNeck ||
            !Out.RebindPreparedNeck(Out,HeadDelta))
        { if(Failure) *Failure=TEXT("neck skin callback unavailable"); return false; }
        auto& HeadHull=Out.TorsoHulls[2];
        for(FVector& Vertex:HeadHull.Vertices) Vertex=HeadDelta.TransformPosition(Vertex);
        for(FVector& Edge:HeadHull.EdgeDirections) Edge=Counter.RotateVector(Edge);
        for(auto& Plane:HeadHull.Planes)
        {
            Plane.Normal=Counter.RotateVector(Plane.Normal);
            Plane.OffsetCm+=FVector::DotProduct(Plane.Normal,HeadDelta.GetTranslation());
        }
        Out.BodyCapsules[2].End=HeadDelta.TransformPosition(Out.BodyCapsules[2].End);
        Out.Head=Body.InverseTransformPosition(Out.BodyCapsules[2].End);
    }
    Seed.SolvedHeadCenter=PosedNeck+Counter.RotateVector(PosedHead-PosedNeck);
    Seed.SolvedHeadRotation=(Counter*Torso*Source.SourceHeadRotation).GetNormalized();
    return true;
}
}

namespace
{
bool PreparedCommonOrthogonal(const FFlowArtsArmClearancePreparationSnapshot& Snapshot,
    const FVector Shifts[2],FVector& Out)
{
    const FVector N=Snapshot.PreparedPatternNormal;
    const FVector Up=(Snapshot.Geometry.Neck-Snapshot.Geometry.FixedHip).GetSafeNormal();
    FVector Height=FVector::VectorPlaneProject(Up,N);
    if (!N.IsNormalized() || Up.IsNearlyZero() || !Height.Normalize()) return false;
    FVector Lateral=Snapshot.Geometry.Arms[1].Upper.GetLocation()-Snapshot.Geometry.Arms[0].Upper.GetLocation();
    Lateral=FVector::VectorPlaneProject(Lateral,N);
    Lateral-=Height*FVector::DotProduct(Lateral,Height);
    if (!Lateral.Normalize()) return false;
    const FVector Common=(Shifts[0]+Shifts[1])*.5;
    const FVector Orthogonal=FVector::VectorPlaneProject(Common,N);
    const double HeightCm=FMath::Clamp(FVector::DotProduct(Orthogonal,Height),-16.,0.);
    const double LateralCm=FMath::Clamp(FVector::DotProduct(Orthogonal,Lateral),-6.,6.);
    Out=Height*HeightCm+Lateral*LateralCm;
    return !Out.ContainsNaN();
}
}

bool FFlowArtsArmClearance::PreparedCommonDepthInterval(
    const FFlowArtsArmClearancePreparationSnapshot& Snapshot,
    const FFlowArtsArmClearancePreparedSeed& Seed, double& OutMin, double& OutMax)
{
    OutMin=OutMax=0.;
    const FVector N=Snapshot.PreparedPatternNormal;
    if(!Snapshot.bValid || !Seed.bValid || !Seed.bAbsoluteControls || !N.IsNormalized() ||
        N.ContainsNaN() || Seed.TorsoRotation.ContainsNaN() ||
        !FMath::IsFinite(Snapshot.MinPreparedCommonDepthCm) || Snapshot.MinPreparedCommonDepthCm>0. ||
        Seed.HandTranslationCm[0].ContainsNaN() || Seed.HandTranslationCm[1].ContainsNaN()) return false;
    const auto& Source=Snapshot.Geometry;
    const FVector Up=(Source.Neck-Source.FixedHip).GetSafeNormal();
    if(Up.IsNearlyZero()) return false;
    const FQuat Torso=Seed.TorsoRotation.GetNormalized();
    const FTransform Body(Torso,Source.TorsoPivot-Torso.RotateVector(Source.TorsoPivot));
    const double Current=FVector::DotProduct((Seed.HandTranslationCm[0]+Seed.HandTranslationCm[1])*.5,N);
    const double Depth=FVector::DotProduct((Seed.HandTranslationCm[0]-Seed.HandTranslationCm[1])*.5,N);
    double Min=Snapshot.MinPreparedCommonDepthCm,Max=0.;
    for(int32 Side=0;Side<2;++Side)
    {
        const auto& Arm=Source.Arms[Side];
        FVector Shoulder=Body.TransformPosition(Arm.Upper.GetLocation());
        if(Arm.bHasClavicle)
        {
            if(!FMath::IsFinite(Seed.ClavicleProtractionDeg[Side])) return false;
            const FVector Pivot=Body.TransformPosition(Arm.Clavicle.GetLocation());
            const FQuat Protraction(Torso.RotateVector(Up),FMath::DegreesToRadians(
                Seed.ClavicleProtractionDeg[Side])*(Side ? -1. : 1.));
            Shoulder=Pivot+Protraction.RotateVector(Shoulder-Pivot);
        }
        const FVector Target=(Source.bHasPreparedHandTargets ? Source.PreparedHandTargets[Side] : Arm.Wrist).GetLocation();
        // Solve only the common component along N. The source seed may also
        // carry a coherent vertical/tangential shift, which changes reach.
        const FVector ShiftOrthogonal=Seed.HandTranslationCm[Side]-
            N*FVector::DotProduct(Seed.HandTranslationCm[Side],N);
        const FVector Offset=Target+ShiftOrthogonal+N*(Side ? -Depth : Depth)-Shoulder;
        const double Along=FVector::DotProduct(Offset,N);
        const double AcrossSquared=FMath::Max(0.,Offset.SizeSquared()-Along*Along);
        const double Upper=FVector::Dist(Arm.Upper.GetLocation(),Arm.Elbow.GetLocation());
        const double Fore=FVector::Dist(Arm.Elbow.GetLocation(),Arm.Wrist.GetLocation());
        // Stay strictly inside both two-link singularities, with margin beyond
        // BuildPreparedGeometry's reach epsilon and elbow-circle threshold.
        const double Outer=Upper+Fore-1.e-4,Inner=FMath::Abs(Upper-Fore)+1.e-4;
        if(!FMath::IsFinite(AcrossSquared) || !FMath::IsFinite(Outer) || Outer<=Inner ||
            AcrossSquared>=Outer*Outer) return false;
        const double Span=FMath::Sqrt(Outer*Outer-AcrossSquared);
        Min=FMath::Max(Min,-Along-Span); Max=FMath::Min(Max,-Along+Span);
        if(AcrossSquared<Inner*Inner)
        {
            const double Hole=FMath::Sqrt(Inner*Inner-AcrossSquared);
            const double HoleMin=-Along-Hole,HoleMax=-Along+Hole;
            if(Current<=HoleMin) Max=FMath::Min(Max,HoleMin);
            else if(Current>=HoleMax) Min=FMath::Max(Min,HoleMax);
            else return false; // Never jump across the folded-arm singularity.
        }
        if(!FMath::IsFinite(Min) || !FMath::IsFinite(Max) || Min>Max) return false;
    }
    OutMin=Min; OutMax=Max;
    return true;
}

bool FFlowArtsArmClearance::CapturePreparationSnapshot(FPoseContext& Output,
    const TArray<FFlowArtsClearanceCapsule>& LeftProp,
    const TArray<FFlowArtsClearanceCapsule>& RightProp,
    const FFlowArtsArmClearanceRigEnvelope& Envelope, FVector ComponentToWorldScale,
    FFlowArtsArmClearancePreparationSnapshot& Out)
{
    FFlowArtsArmClearanceHistory Unused;
    SolvePose(Output, Unused, LeftProp, RightProp, &Envelope, true, true, true,
        nullptr, ComponentToWorldScale, &Out);
    return Out.bValid;
}

#if WITH_DEV_AUTOMATION_TESTS
bool FFlowArtsArmClearance::ProbePreparedNeckCounterRotation(
    const FFlowArtsArmClearancePreparationSnapshot& Snapshot,
    const FFlowArtsArmClearancePreparedSeed& Seed, double Fraction,
    FFlowArtsArmClearanceResult& OutResult, FString& Error)
{
    OutResult={};
    Error.Reset();
    if (!Snapshot.bValid || !Seed.bValid || !FMath::IsFinite(Fraction) || Fraction<0. || Fraction>1.)
    { Error=TEXT("invalid snapshot, seed, or fraction"); return false; }
    auto Copy=Seed;
    // The legacy probe applies its requested fraction in the rebound callback.
    // Start from the uncountered geometry so head proxies and weighted skin agree.
    Copy.NeckCounterFraction=0.f;
    FFlowArtsArmClearanceInput Geometry;
    if (!BuildPreparedGeometry(Snapshot.Geometry,Copy,Geometry,&Error)) return false;
    if (!Geometry.ProbeNeckCounterRotation ||
        !Geometry.ProbeNeckCounterRotation(Geometry,Fraction,Error))
    { if(Error.IsEmpty()) Error=TEXT("neck probe callback unavailable"); return false; }
    FFlowArtsArmClearanceHistory Fresh;
    OutResult=Solve(Geometry,Fresh);
    if (!OutResult.bFeasible && Geometry.MakePreparedContactObjective)
    {
        const auto Objective=Geometry.MakePreparedContactObjective(OutResult.Arms,Copy.TorsoRotation,
            Geometry.HeldPropCapsules[0],Geometry.HeldPropCapsules[1]);
        OutResult.PreparedContactPenalty=Objective ? Objective(OutResult.Arms,Copy.TorsoRotation,
            Geometry.HeldPropCapsules[0],Geometry.HeldPropCapsules[1])+PreparedTorsoPenalty(Geometry) : 1.e6;
    }
    return true;
}
#endif

bool FFlowArtsArmClearance::PrepareCandidate(const FFlowArtsArmClearancePreparationSnapshot& Snapshot,
    int32 CandidateIndex, const FFlowArtsArmClearancePreparedSeed* Previous,
    FFlowArtsArmClearancePreparedSeed& OutSeed, FFlowArtsArmClearanceResult& OutResult)
{
    OutSeed = {}; OutResult = {};
    if (!Snapshot.bValid || CandidateIndex < 0 || CandidateIndex >= PreparationCandidateCount) return false;
    const auto& Source = Snapshot.Geometry;
    // Legacy proxy-only rigs can use Solve, but cannot publish a measured
    // held-prop/body certificate without the corresponding surface query.
    if ((!Source.HeldPropCapsules[0].IsEmpty() || !Source.HeldPropCapsules[1].IsEmpty())
        && !Source.CertifySkinnedHeldPropBody) return false;
    const FVector Up = (Source.Neck-Source.FixedHip).GetSafeNormal();
    FVector Lateral = Source.Arms[1].Upper.GetLocation()-Source.Arms[0].Upper.GetLocation();
    Lateral -= Up*FVector::DotProduct(Lateral,Up);
    if (!Lateral.Normalize() || Up.IsNearlyZero()) return false;
    const FVector Forward = FVector::CrossProduct(Lateral,Up).GetSafeNormal();
    const bool bPrevious = Previous && Previous->bValid && Previous->bAbsoluteControls;
    if (bPrevious) OutSeed = *Previous;
    else
    {
        for (int32 Side=0;Side<2;++Side)
        {
            const auto& Arm=Source.Arms[Side];
            const FVector S=Arm.Upper.GetLocation(), E=Arm.Elbow.GetLocation(), H=Arm.Wrist.GetLocation();
            const FVector Axis=(H-S).GetSafeNormal(), Normal=FVector::CrossProduct(E-S,H-E).GetSafeNormal();
            FQuat U,F;
            if (!PreparedBasis(E-S,Normal,U) || !PreparedBasis(H-E,Normal,F)) return false;
            OutSeed.UpperFrameOffset[Side]=(U.Inverse()*Arm.Upper.GetRotation()).GetNormalized();
            OutSeed.ForearmFrameOffset[Side]=(F.Inverse()*Arm.Elbow.GetRotation()).GetNormalized();
            OutSeed.ElbowPole[Side]=(E-S-Axis*FVector::DotProduct(E-S,Axis)).GetSafeNormal();
        }
    }
    OutSeed.bValid = OutSeed.bAbsoluteControls = true;
    if (CandidateIndex > 0)
    {
        // Finite common-target/body proposals preserve relative hand positions.
        // Unreachable or uncertified phases fail preparation instead of widening
        // these controls silently or separating crossed hands into side lanes.
        const int32 Pattern=(CandidateIndex-1)/16, PolePair=(CandidateIndex-1)%16;
        static const double ShiftCm[8]={0.,-4.,-8.,-12.,-16.,-20.,-12.,-20.};
        static const double LeanDeg[8]={0.,15.,15.,15.,15.,15.,10.,10.};
        static const double YawDeg[8]={0.,0.,0.,0.,0.,0.,30.,-30.};
        static const double PoleDeg[4]={-45.,0.,45.,90.};
        OutSeed.TorsoRotation=(FQuat(Up,FMath::DegreesToRadians(YawDeg[Pattern]))*
            FQuat(Lateral,FMath::DegreesToRadians(LeanDeg[Pattern]))).GetNormalized();
        for (int32 Side=0;Side<2;++Side)
        {
            OutSeed.HandTranslationCm[Side]=Forward*ShiftCm[Pattern];
            OutSeed.ClavicleProtractionDeg[Side]=20.f;
            const FVector Axis=(Source.Arms[Side].Wrist.GetLocation()-Source.Arms[Side].Upper.GetLocation()).GetSafeNormal();
            const FVector Base=(Forward*24.+Lateral*(Side ? 20. : -20.)-Up).GetSafeNormal();
            OutSeed.ElbowPole[Side]=FQuat(Axis,FMath::DegreesToRadians(PoleDeg[Side ? PolePair/4 : PolePair%4])).RotateVector(Base);
        }
    }
    if (Snapshot.bConstrainPreparedHandTranslation)
    {
        for (int32 Side=0; Side<2; ++Side) OutSeed.HandTranslationCm[Side]=Snapshot.PreparedHandTranslationCm[Side];
        if (Snapshot.MaxPreparedHandDepthCm>0.)
        {
            if (!FMath::IsFinite(Snapshot.MaxPreparedHandDepthCm) ||
                !Snapshot.PreparedPatternNormal.IsNormalized()) return false;
            // Only the continuation/refinement candidate may carry a different
            // depth. Coarse pole proposals retain the same whole-track lane.
            if (!FMath::IsFinite(Snapshot.MinPreparedCommonDepthCm) || Snapshot.MinPreparedCommonDepthCm>0.) return false;
            const FVector* Shifts=CandidateIndex==0 && bPrevious ? Previous->HandTranslationCm : Snapshot.PreparedHandTranslationCm;
            if (Shifts[0].ContainsNaN() || Shifts[1].ContainsNaN()) return false;
            FVector Orthogonal;
            if (!PreparedCommonOrthogonal(Snapshot,Shifts,Orthogonal)) return false;
            const double Depth=FMath::Clamp(FVector::DotProduct((Shifts[0]-Shifts[1])*.5,
                Snapshot.PreparedPatternNormal),0.,Snapshot.MaxPreparedHandDepthCm);
            const double Common=FMath::Clamp(FVector::DotProduct((Shifts[0]+Shifts[1])*.5,
                Snapshot.PreparedPatternNormal),Snapshot.MinPreparedCommonDepthCm,0.);
            for (int32 Side=0;Side<2;++Side)
                OutSeed.HandTranslationCm[Side]=Orthogonal+Snapshot.PreparedPatternNormal*(Common+(Side ? -Depth : Depth));
        }
    }
    if (Snapshot.bConstrainPreparedTorsoRotation)
    {
        if (Snapshot.PreparedTorsoRotation.ContainsNaN() || !Snapshot.PreparedTorsoRotation.IsNormalized()) return false;
        OutSeed.TorsoRotation=Snapshot.PreparedTorsoRotation;
        OutSeed.AddedTorsoPitch=Snapshot.PreparedAddedTorsoPitch;
        OutSeed.NeckCounterFraction=Snapshot.PreparedNeckCounterFraction;
    }
    FFlowArtsArmClearanceInput Geometry;
#if WITH_DEV_AUTOMATION_TESTS
    const bool bNeutralProbe=CandidateIndex==0 && bPrevious &&
        Snapshot.bConstrainPreparedTorsoRotation &&
        Snapshot.PreparedTorsoRotation.Equals(FQuat::Identity,1.e-8) &&
        FParse::Param(FCommandLine::Get(),TEXT("FlowFestStanceProbeNeutralLean"));
    FString BuildFailure;
#endif
    if (!BuildPreparedGeometry(Source,OutSeed,Geometry,
#if WITH_DEV_AUTOMATION_TESTS
        bNeutralProbe ? &BuildFailure : nullptr
#else
        nullptr
#endif
        ))
    {
#if WITH_DEV_AUTOMATION_TESTS
        if(bNeutralProbe) UE_LOG(LogTemp,Display,TEXT("FlowFestStanceProbeNeutralLean geometryFailure=%s"),*BuildFailure);
#endif
        OutSeed.bValid=false;
        return false;
    }
#if WITH_DEV_AUTOMATION_TESTS
    Geometry.DecisionEvidencePath=Snapshot.SkinEvidencePath;
#endif
    FFlowArtsArmClearanceHistory Fresh;
    OutResult=Solve(Geometry,Fresh);
    if (!OutResult.bFeasible && Geometry.MakePreparedContactObjective)
    {
        const auto Objective=Geometry.MakePreparedContactObjective(OutResult.Arms,OutSeed.TorsoRotation,
            Geometry.HeldPropCapsules[0],Geometry.HeldPropCapsules[1]);
        OutResult.PreparedContactPenalty=Objective ? Objective(OutResult.Arms,OutSeed.TorsoRotation,
            Geometry.HeldPropCapsules[0],Geometry.HeldPropCapsules[1])+PreparedTorsoPenalty(Geometry) : 1.e6;
    }
#if WITH_DEV_AUTOMATION_TESTS
    if (!Snapshot.SkinEvidencePath.IsEmpty() && Geometry.WriteSkinEvidence)
        Geometry.WriteSkinEvidence(OutResult.Arms,OutSeed.TorsoRotation,
            Geometry.HeldPropCapsules[0],Geometry.HeldPropCapsules[1],Snapshot.SkinEvidencePath);
#endif
    for(int32 Side=0;Side<2;++Side)
    {
        OutResult.OriginalWrists[Side]=(Source.bHasPreparedHandTargets ? Source.PreparedHandTargets[Side] : Source.Arms[Side].Wrist).GetLocation();
        OutResult.AppliedHandTranslationCm[Side]=OutSeed.HandTranslationCm[Side];
    }
    OutResult.PreparedSeedQueryCount=OutResult.SkinnedQueryCount;
    return true;
}

bool FFlowArtsArmClearance::RefinePreparedCandidate(const FFlowArtsArmClearancePreparationSnapshot& Snapshot,
    const FFlowArtsArmClearancePreparedSeed& Seed, FFlowArtsArmClearancePreparedSeed& OutSeed,
    FFlowArtsArmClearanceResult& OutResult)
{
    OutSeed={}; OutResult={};
    auto Center=Seed;
    FFlowArtsArmClearanceInput Geometry;
    if (!Snapshot.bValid || !BuildPreparedGeometry(Snapshot.Geometry,Center,Geometry) ||
        !Geometry.MakePreparedContactObjective) return false;
#if WITH_DEV_AUTOMATION_TESTS
    FString Diagnostic;
    auto Trace=[&](const FString& Message)
    {
        if(Snapshot.SkinEvidencePath.IsEmpty()) return;
        Diagnostic+=Message+TEXT("\n");
        FFileHelper::SaveStringToFile(Diagnostic,*(Snapshot.SkinEvidencePath+TEXT("-refinement.txt")));
    };
    Trace(FString::Printf(TEXT("center depth=%s clavicles=%.9f,%.9f"),
        *Center.HandTranslationCm[0].ToString(),Center.ClavicleProtractionDeg[0],Center.ClavicleProtractionDeg[1]));
    if(!Snapshot.SkinEvidencePath.IsEmpty() && Geometry.WriteSkinEvidence)
        Geometry.WriteSkinEvidence(Geometry.Arms,Center.TorsoRotation,Geometry.HeldPropCapsules[0],
            Geometry.HeldPropCapsules[1],Snapshot.SkinEvidencePath+TEXT("-center"));
#endif
    auto Objective=Geometry.MakePreparedContactObjective(Geometry.Arms,Center.TorsoRotation,
        Geometry.HeldPropCapsules[0],Geometry.HeldPropCapsules[1]);
    if (!Objective) return false;
    double Initial=Objective(Geometry.Arms,Center.TorsoRotation,
        Geometry.HeldPropCapsules[0],Geometry.HeldPropCapsules[1])+PreparedTorsoPenalty(Geometry);
    if (!FMath::IsFinite(Initial) || Initial<=1.e-12) return false;
    FVector Axes[2];
    for(int32 Side=0;Side<2;++Side)
        Axes[Side]=(Center.SolvedWrists[Side]-Center.SolvedShoulders[Side]).GetSafeNormal();
    const bool bDepth=Snapshot.bConstrainPreparedHandTranslation && Snapshot.MaxPreparedHandDepthCm>0. &&
        Snapshot.PreparedPatternNormal.IsNormalized();
    const bool bCommon=bDepth && FMath::IsFinite(Snapshot.MinPreparedCommonDepthCm) && Snapshot.MinPreparedCommonDepthCm<0.;
    auto DepthOf=[&](const FFlowArtsArmClearancePreparedSeed& S)
    { return FVector::DotProduct((S.HandTranslationCm[0]-S.HandTranslationCm[1])*.5,Snapshot.PreparedPatternNormal); };
    auto CommonOf=[&](const FFlowArtsArmClearancePreparedSeed& S)
    { return FVector::DotProduct((S.HandTranslationCm[0]+S.HandTranslationCm[1])*.5,Snapshot.PreparedPatternNormal); };
    FVector Orthogonal=FVector::ZeroVector;
    if (bDepth && !PreparedCommonOrthogonal(Snapshot,Center.HandTranslationCm,Orthogonal)) return false;
    double CenterCommonMin=0.,CenterCommonMax=0.;
    if(bCommon && !PreparedCommonDepthInterval(Snapshot,Center,CenterCommonMin,CenterCommonMax)) return false;
    auto Perturb=[&](const double* Degrees,FFlowArtsArmClearancePreparedSeed& Candidate)
    {
        Candidate=Center;
        for(int32 Side=0;Side<2;++Side)
        {
            Candidate.ElbowPole[Side]=FQuat(Axes[Side],FMath::DegreesToRadians(Degrees[Side])).RotateVector(Center.ElbowPole[Side]);
            Candidate.ClavicleProtractionDeg[Side]=FMath::Clamp(Center.ClavicleProtractionDeg[Side]+float(Degrees[Side+2]),0.f,40.f);
        }
        if (bDepth)
        {
            // One optimization unit is .25 cm, bounding a two-unit step to
            // .5 cm per hand while keeping symmetric depth and owned props.
            const double Depth=FMath::Clamp(DepthOf(Center)+.25*Degrees[4],0.,Snapshot.MaxPreparedHandDepthCm);
            double Common=bCommon ? FMath::Clamp(CommonOf(Center)+.25*Degrees[5],Snapshot.MinPreparedCommonDepthCm,0.) : 0.;
            for(int32 Side=0;Side<2;++Side)
                Candidate.HandTranslationCm[Side]=Orthogonal+Snapshot.PreparedPatternNormal*(Common+(Side ? -Depth : Depth));
            if(bCommon)
            {
                double Min,Max;
                auto Branch=Candidate;
                for(int32 Side=0;Side<2;++Side)
                    Branch.HandTranslationCm[Side]=Orthogonal+Snapshot.PreparedPatternNormal*(CommonOf(Center)+(Side ? -Depth : Depth));
                if(!PreparedCommonDepthInterval(Snapshot,Branch,Min,Max)) { Candidate.bValid=false; return; }
                Common=FMath::Clamp(Common,Min,Max);
                for(int32 Side=0;Side<2;++Side)
                    Candidate.HandTranslationCm[Side]=Orthogonal+Snapshot.PreparedPatternNormal*(Common+(Side ? -Depth : Depth));
            }
        }
    };
    auto Measure=[&](FFlowArtsArmClearancePreparedSeed Candidate)
    {
        FFlowArtsArmClearanceInput G;
        if(!BuildPreparedGeometry(Snapshot.Geometry,Candidate,G)) return TNumericLimits<double>::Max();
        return Objective(G.Arms,Candidate.TorsoRotation,G.HeldPropCapsules[0],G.HeldPropCapsules[1])+PreparedTorsoPenalty(G);
    };
    FFlowArtsArmClearancePreparedSeed RetainedEscape;
    FFlowArtsArmClearanceResult RetainedEscapeResult;
    bool bRetainedEscape=false;
    auto EscapeDepth=[&]()
    {
        if(!bDepth || !Geometry.FindPreparedDepthEscape)
        {
#if WITH_DEV_AUTOMATION_TESTS
            Trace(TEXT("escape unavailable: constrained depth or callback missing"));
#endif
            return false;
        }
        const double CurrentDepth=DepthOf(Center);
        double Additional=0.;
        const double Maximum=Snapshot.MaxPreparedHandDepthCm-CurrentDepth;
        const bool bEscaped=Geometry.FindPreparedDepthEscape(Geometry.Arms,Center.TorsoRotation,
            Geometry.HeldPropCapsules[0],Geometry.HeldPropCapsules[1],Snapshot.PreparedPatternNormal,
            Maximum,Additional);
#if WITH_DEV_AUTOMATION_TESTS
        Trace(FString::Printf(TEXT("escape depth=%.9f max=%.9f found=%d additional=%.9f"),
            CurrentDepth,Maximum,int32(bEscaped),Additional));
#endif
        if(!bEscaped) return false;
        auto Candidate=Center;
        for(int32 Side=0;Side<2;++Side)
            Candidate.HandTranslationCm[Side]=Orthogonal+Snapshot.PreparedPatternNormal*(CommonOf(Center)+(Side ? -1. : 1.)*(CurrentDepth+Additional));
        // A rigid proposal may cross a local invalid interval internally. Only
        // rebuilt certificates and whole-track continuity accept its endpoint.
        FFlowArtsArmClearancePreparedSeed CheckedSeed;
        FFlowArtsArmClearanceResult CheckedResult;
        const bool bBuilt=PrepareCandidate(Snapshot,0,&Candidate,CheckedSeed,CheckedResult);
#if WITH_DEV_AUTOMATION_TESTS
        Trace(FString::Printf(TEXT("escape endpoint built=%d feasible=%d penalty=%.12f residual=%.9f opposite=%u pair=%d obstacle=%d/%d/%d/%d"),
            int32(bBuilt),int32(CheckedResult.bFeasible),CheckedResult.PreparedContactPenalty,
            CheckedResult.WorstPenetrationCm,uint32(CheckedResult.SkinnedOppositePropClearMask),
            int32(CheckedResult.bSkinnedArmPairClear),CheckedResult.WorstObstacleKind,
            CheckedResult.WorstArm,CheckedResult.WorstSegment,CheckedResult.WorstObstacleIndex));
#endif
        if(!bBuilt) return false;
        if(CheckedResult.bFeasible)
        {
            OutSeed=MoveTemp(CheckedSeed);
            OutResult=MoveTemp(CheckedResult);
            return true;
        }
        double OldMerit=0.,NewMerit=0.;
        const bool bPaired=ComparePreparedContactMerit(Snapshot,Center,CheckedSeed,OldMerit,NewMerit);
#if WITH_DEV_AUTOMATION_TESTS
        Trace(FString::Printf(TEXT("escape paired=%d merit=%.12f->%.12f retained=%d"),
            int32(bPaired),OldMerit,NewMerit,int32(bPaired && NewMerit<OldMerit-1.e-10)));
#endif
        if(!bPaired || !(NewMerit<OldMerit-1.e-10)) return false;
        RetainedEscape=CheckedSeed;
        RetainedEscapeResult=CheckedResult;
        bRetainedEscape=true;
        Center=MoveTemp(CheckedSeed);
        if(!BuildPreparedGeometry(Snapshot.Geometry,Center,Geometry))
        {
            OutSeed=MoveTemp(RetainedEscape);
            OutResult=MoveTemp(RetainedEscapeResult);
            return true;
        }
        Objective=Geometry.MakePreparedContactObjective(Geometry.Arms,Center.TorsoRotation,
            Geometry.HeldPropCapsules[0],Geometry.HeldPropCapsules[1]);
        if(!Objective)
        {
            OutSeed=MoveTemp(RetainedEscape);
            OutResult=MoveTemp(RetainedEscapeResult);
            return true;
        }
        Initial=Objective(Geometry.Arms,Center.TorsoRotation,
            Geometry.HeldPropCapsules[0],Geometry.HeldPropCapsules[1])+PreparedTorsoPenalty(Geometry);
        if(!FMath::IsFinite(Initial) || Initial<=1.e-12)
        {
            OutSeed=MoveTemp(RetainedEscape);
            OutResult=MoveTemp(RetainedEscapeResult);
            return true;
        }
        for(int32 Side=0;Side<2;++Side)
            Axes[Side]=(Center.SolvedWrists[Side]-Center.SolvedShoulders[Side]).GetSafeNormal();
        if(bCommon && !PreparedCommonDepthInterval(Snapshot,Center,CenterCommonMin,CenterCommonMax))
        {
            OutSeed=MoveTemp(RetainedEscape);
            OutResult=MoveTemp(RetainedEscapeResult);
            return true;
        }
        return false;
    };
    // Unsigned distance can descend into the wrong side of an intersecting
    // hand/prop interval even with a nonzero local gradient. Use the measured
    // signed depth endpoint first; it is still only a fresh-query proposal.
    if (EscapeDepth()) return true;
    constexpr double Difference=.25;
    double Gradient[6]={}, NormSquared=0.;
    for(int32 D=0;D<6;++D)
    {
        if(D>=2 && D<4 && !Geometry.Arms[D-2].bHasClavicle) continue;
        if(D==4 && !bDepth) continue;
        if(D==5 && !bCommon) continue;
        double Delta[6]={}; FFlowArtsArmClearancePreparedSeed Plus,Minus;
        Delta[D]=Difference; Perturb(Delta,Plus);
        Delta[D]=-Difference; Perturb(Delta,Minus);
        const double P=Measure(Plus),M=Measure(Minus);
#if WITH_DEV_AUTOMATION_TESTS
        Trace(FString::Printf(TEXT("difference dim=%d initial=%.12f plus=%.12f minus=%.12f"),D,Initial,P,M));
#endif
        if(!FMath::IsFinite(P) || !FMath::IsFinite(M) || P>1.e12 || M>1.e12)
        {
            if(!bRetainedEscape) return false;
            OutSeed=MoveTemp(RetainedEscape);
            OutResult=MoveTemp(RetainedEscapeResult);
            return true;
        }
        Gradient[D]=(P-M)/(2.*Difference);
        // Remove infeasible outward directions before normalizing the step.
        // Clamping a proposal later is insufficient: a large blocked gradient
        // can otherwise consume the whole step and starve the free elbow pole.
        if(D>=2 && D<4)
        {
            const double Value=Center.ClavicleProtractionDeg[D-2];
            if((Value<=1.e-6 && Gradient[D]>0.) || (Value>=40.-1.e-6 && Gradient[D]<0.))
                Gradient[D]=0.;
        }
        if(D==4)
        {
            const double Value=DepthOf(Center);
            if((Value<=1.e-6 && Gradient[D]>0.) ||
                (Value>=Snapshot.MaxPreparedHandDepthCm-1.e-6 && Gradient[D]<0.))
                Gradient[D]=0.;
        }
        if(D==5)
        {
            const double Value=CommonOf(Center);
            if((Value<=CenterCommonMin+1.e-6 && Gradient[D]>0.) ||
                (Value>=CenterCommonMax-1.e-6 && Gradient[D]<0.)) Gradient[D]=0.;
        }
        if(D==4 && Gradient[D]>0. && Geometry.FindPreparedDepthEscape)
        {
            // A clear hand surface is absent from the frozen forearm witnesses.
            // Do not descend back through its measured depth boundary and then
            // spend the next iteration escaping the same contact again.
            FFlowArtsArmClearanceInput MinusGeometry;
            double RequiredEscape=0.;
            if(BuildPreparedGeometry(Snapshot.Geometry,Minus,MinusGeometry))
            {
                const double MinusDepth=DepthOf(Minus);
                if(Geometry.FindPreparedDepthEscape(MinusGeometry.Arms,Minus.TorsoRotation,
                    MinusGeometry.HeldPropCapsules[0],MinusGeometry.HeldPropCapsules[1],
                    Snapshot.PreparedPatternNormal,Snapshot.MaxPreparedHandDepthCm-MinusDepth,RequiredEscape) &&
                    RequiredEscape>1.e-6)
                    Gradient[D]=0.;
            }
        }
        NormSquared+=Gradient[D]*Gradient[D];
    }
    if(NormSquared<=1.e-16)
    {
        if(!bRetainedEscape) return false;
        OutSeed=MoveTemp(RetainedEscape);
        OutResult=MoveTemp(RetainedEscapeResult);
        return true;
    }
    // At most two angular degrees / .5 cm depth in this step. A frozen witness
    // supplies direction; only the subsequent complete query establishes clearance.
    const double Scale=FMath::Min(2./FMath::Sqrt(NormSquared),1.25*Initial/NormSquared);
    for(double Fraction : {1.,.5,.25})
    {
        double Delta[6]; for(int32 D=0;D<6;++D) Delta[D]=-Gradient[D]*Scale*Fraction;
        FFlowArtsArmClearancePreparedSeed Candidate; Perturb(Delta,Candidate);
        if(bDepth && Delta[4]<0. && Geometry.FindPreparedDepthEscape)
        {
            FFlowArtsArmClearanceInput ProposedGeometry;
            double RequiredEscape=0.;
            if(BuildPreparedGeometry(Snapshot.Geometry,Candidate,ProposedGeometry))
            {
                const double ProposedDepth=DepthOf(Candidate);
                if(Geometry.FindPreparedDepthEscape(ProposedGeometry.Arms,Candidate.TorsoRotation,
                    ProposedGeometry.HeldPropCapsules[0],ProposedGeometry.HeldPropCapsules[1],
                    Snapshot.PreparedPatternNormal,Snapshot.MaxPreparedHandDepthCm-ProposedDepth,RequiredEscape) &&
                    RequiredEscape>1.e-6)
                {
                    // The accepted step can exceed the finite-difference probe.
                    // Project only its violating depth coordinate, retaining the
                    // angular proposal and measuring that actual endpoint anew.
                    const double Common=CommonOf(Candidate),Depth=DepthOf(Center);
                    for(int32 Side=0;Side<2;++Side)
                        Candidate.HandTranslationCm[Side]=Orthogonal+Snapshot.PreparedPatternNormal*(Common+(Side ? -Depth : Depth));
                }
            }
        }
        const double Cost=Measure(Candidate);
#if WITH_DEV_AUTOMATION_TESTS
        Trace(FString::Printf(TEXT("line fraction=%.3f cost=%.12f norm=%.12f depth=%s"),
            Fraction,Cost,NormSquared,*Candidate.HandTranslationCm[0].ToString()));
#endif
        if(FMath::IsFinite(Cost) && Cost<Initial-1.e-10)
        {
            FFlowArtsArmClearancePreparedSeed CheckedSeed;
            FFlowArtsArmClearanceResult CheckedResult;
            if(!PrepareCandidate(Snapshot,0,&Candidate,CheckedSeed,CheckedResult)) continue;
            // Compare the same old AND new witness families at both endpoints.
            // Comparing raw newly collected penalties gives a discontinuous
            // merit when a contact family enters the collection margin.
            FFlowArtsArmClearanceInput CheckedGeometry;
            if(!BuildPreparedGeometry(Snapshot.Geometry,CheckedSeed,CheckedGeometry)) continue;
            const auto NewObjective=Geometry.MakePreparedContactObjective(CheckedGeometry.Arms,
                CheckedSeed.TorsoRotation,CheckedGeometry.HeldPropCapsules[0],CheckedGeometry.HeldPropCapsules[1]);
            if(!NewObjective) continue;
            const double NewAtCenter=NewObjective(Geometry.Arms,Center.TorsoRotation,
                Geometry.HeldPropCapsules[0],Geometry.HeldPropCapsules[1])+PreparedTorsoPenalty(Geometry);
            const double NewAtCandidate=NewObjective(CheckedGeometry.Arms,CheckedSeed.TorsoRotation,
                CheckedGeometry.HeldPropCapsules[0],CheckedGeometry.HeldPropCapsules[1])+PreparedTorsoPenalty(CheckedGeometry);
            const double PairedCenter=Initial+NewAtCenter,PairedCandidate=Cost+NewAtCandidate;
#if WITH_DEV_AUTOMATION_TESTS
            Trace(FString::Printf(TEXT("fresh fraction=%.3f paired=%.12f->%.12f cost=%.12f feasible=%d"),
                Fraction,PairedCenter,PairedCandidate,CheckedResult.PreparedContactPenalty,CheckedResult.bFeasible));
#endif
            if(CheckedResult.bFeasible || (FMath::IsFinite(PairedCenter) && FMath::IsFinite(PairedCandidate) &&
                PairedCandidate<PairedCenter-1.e-10))
            {
                OutSeed=MoveTemp(CheckedSeed);
                OutResult=MoveTemp(CheckedResult);
                return true;
            }
        }
    }
    if(!bRetainedEscape) return false;
    OutSeed=MoveTemp(RetainedEscape);
    OutResult=MoveTemp(RetainedEscapeResult);
    return true;
}

bool FFlowArtsArmClearance::ComparePreparedContactMerit(
    const FFlowArtsArmClearancePreparationSnapshot& Snapshot,
    const FFlowArtsArmClearancePreparedSeed& Old,
    const FFlowArtsArmClearancePreparedSeed& Candidate,
    double& OldMerit, double& CandidateMerit)
{
    FFlowArtsArmClearanceInput A,B;
    auto OldControl=Old, NewControl=Candidate;
    if (!Snapshot.bValid || !Old.AddedTorsoPitch.Equals(Candidate.AddedTorsoPitch,1.e-8) ||
        !FMath::IsNearlyEqual(Old.NeckCounterFraction,Candidate.NeckCounterFraction,1.e-8f) ||
        !BuildPreparedGeometry(Snapshot.Geometry,OldControl,A) ||
        !BuildPreparedGeometry(Snapshot.Geometry,NewControl,B) ||
        !A.MakePreparedContactObjective) return false;
    const auto OldWitnesses=A.MakePreparedContactObjective(A.Arms,Old.TorsoRotation,
        A.HeldPropCapsules[0],A.HeldPropCapsules[1]);
    const auto NewWitnesses=A.MakePreparedContactObjective(B.Arms,Candidate.TorsoRotation,
        B.HeldPropCapsules[0],B.HeldPropCapsules[1]);
    if (!OldWitnesses || !NewWitnesses) return false;
    OldMerit=OldWitnesses(A.Arms,Old.TorsoRotation,A.HeldPropCapsules[0],A.HeldPropCapsules[1])+
        NewWitnesses(A.Arms,Old.TorsoRotation,A.HeldPropCapsules[0],A.HeldPropCapsules[1])+
        2.*PreparedTorsoPenalty(A);
    CandidateMerit=OldWitnesses(B.Arms,Candidate.TorsoRotation,B.HeldPropCapsules[0],B.HeldPropCapsules[1])+
        NewWitnesses(B.Arms,Candidate.TorsoRotation,B.HeldPropCapsules[0],B.HeldPropCapsules[1])+
        2.*PreparedTorsoPenalty(B);
    return FMath::IsFinite(OldMerit) && FMath::IsFinite(CandidateMerit);
}

bool FFlowArtsArmClearance::InterpolatePreparedSeed(const FFlowArtsArmClearancePreparedSeed& A,
    const FFlowArtsArmClearancePreparedSeed& B, double Alpha, FFlowArtsArmClearancePreparedSeed& Out)
{
    Out={};
    if (!A.bValid || !B.bValid || !A.bAbsoluteControls || !B.bAbsoluteControls ||
        !FMath::IsFinite(Alpha) || Alpha<0. || Alpha>1.) return false;
    Out=A;
    Out.TorsoRotation=FQuat::Slerp(A.TorsoRotation,B.TorsoRotation,Alpha).GetNormalized();
    Out.AddedTorsoPitch=FQuat::Slerp(A.AddedTorsoPitch,B.AddedTorsoPitch,Alpha).GetNormalized();
    Out.NeckCounterFraction=FMath::Lerp(A.NeckCounterFraction,B.NeckCounterFraction,Alpha);
    Out.SolvedHeadCenter=FMath::Lerp(A.SolvedHeadCenter,B.SolvedHeadCenter,Alpha);
    Out.SolvedHeadRotation=FQuat::Slerp(A.SolvedHeadRotation,B.SolvedHeadRotation,Alpha).GetNormalized();
    for(int32 Side=0;Side<2;++Side)
    {
        // Reject antipodal radial branches; their linear blend passes through a
        // singular elbow plane. Preparation must insert a continuous branch first.
        if (FVector::DotProduct(A.ElbowPole[Side].GetSafeNormal(),B.ElbowPole[Side].GetSafeNormal()) < -.95) return false;
        Out.ElbowPole[Side]=FMath::Lerp(A.ElbowPole[Side],B.ElbowPole[Side],Alpha).GetSafeNormal();
        Out.HandTranslationCm[Side]=FMath::Lerp(A.HandTranslationCm[Side],B.HandTranslationCm[Side],Alpha);
        Out.ClavicleProtractionDeg[Side]=FMath::Lerp(A.ClavicleProtractionDeg[Side],B.ClavicleProtractionDeg[Side],Alpha);
        // Bind-to-anatomical-frame calibration is clip-coherent, not another
        // interpolated source rotation that could reintroduce the authored cliff.
        if (!A.UpperFrameOffset[Side].Equals(B.UpperFrameOffset[Side],1.e-5) ||
            !A.ForearmFrameOffset[Side].Equals(B.ForearmFrameOffset[Side],1.e-5)) return false;
        Out.SolvedElbows[Side]=FMath::Lerp(A.SolvedElbows[Side],B.SolvedElbows[Side],Alpha);
        Out.SolvedShoulders[Side]=FMath::Lerp(A.SolvedShoulders[Side],B.SolvedShoulders[Side],Alpha);
        Out.SolvedWrists[Side]=FMath::Lerp(A.SolvedWrists[Side],B.SolvedWrists[Side],Alpha);
    }
    return true;
}

bool FFlowArtsArmClearance::CaptureTransitionSeed(
    const FFlowArtsArmClearancePreparationSnapshot& Source,
    const FFlowArtsArmClearanceResult& Displayed, FFlowArtsArmClearancePreparedSeed& Out)
{
    Out={};
    if (!Source.bValid || Displayed.TorsoRotation.ContainsNaN() ||
        !Displayed.TorsoRotation.IsNormalized()) return false;
    FFlowArtsArmClearancePreparedSeed Seed;
    Seed.bValid=Seed.bAbsoluteControls=true;
    Seed.TorsoRotation=Displayed.TorsoRotation;
    Seed.AddedTorsoPitch=Displayed.AddedTorsoPitch;
    Seed.NeckCounterFraction=Displayed.NeckCounterFraction;
    for (int32 Side=0;Side<2;++Side)
    {
        const auto& Arm=Displayed.Arms[Side];
        if (Arm.Upper.ContainsNaN() || Arm.Elbow.ContainsNaN() || Arm.Wrist.ContainsNaN()) return false;
        const FVector S=Arm.Upper.GetLocation(), E=Arm.Elbow.GetLocation(), H=Arm.Wrist.GetLocation();
        const FVector Axis=(H-S).GetSafeNormal(), Normal=FVector::CrossProduct(E-S,H-E).GetSafeNormal();
        FQuat U,F;
        if (!PreparedBasis(E-S,Normal,U) || !PreparedBasis(H-E,Normal,F)) return false;
        Seed.UpperFrameOffset[Side]=(U.Inverse()*Arm.Upper.GetRotation()).GetNormalized();
        Seed.ForearmFrameOffset[Side]=(F.Inverse()*Arm.Elbow.GetRotation()).GetNormalized();
        Seed.ElbowPole[Side]=(E-S-Axis*FVector::DotProduct(E-S,Axis)).GetSafeNormal();
        Seed.ClavicleProtractionDeg[Side]=Displayed.ClavicleProtractionDeg[Side];
        const auto& Target=Source.Geometry.bHasPreparedHandTargets ?
            Source.Geometry.PreparedHandTargets[Side] : Source.Geometry.Arms[Side].Wrist;
        Seed.HandTranslationCm[Side]=H-Target.GetLocation();
    }
    FFlowArtsArmClearanceInput Rebuilt;
    if (!BuildPreparedGeometry(Source.Geometry,Seed,Rebuilt)) return false;
    // Reject mismatched source frames, pivot/subtree changes, altered lengths,
    // or a hand orientation that cannot be represented by this target contract.
    for (int32 Side=0;Side<2;++Side)
    {
        const auto& A=Displayed.Arms[Side]; const auto& B=Rebuilt.Arms[Side];
        if (!A.Upper.Equals(B.Upper,1.e-3) || !A.Elbow.Equals(B.Elbow,1.e-3) ||
            !A.Wrist.Equals(B.Wrist,1.e-3) ||
            (A.bHasClavicle && !A.Clavicle.Equals(B.Clavicle,1.e-3))) return false;
    }
    Out=MoveTemp(Seed);
    return true;
}

bool FFlowArtsArmClearance::InterpolateTransitionSeed(
    const FFlowArtsArmClearancePreparedSeed& A, const FFlowArtsArmClearancePreparedSeed& B,
    double Alpha, FFlowArtsArmClearancePreparedSeed& Out)
{
    auto Matching=B;
    for (int32 Side=0;Side<2;++Side)
    {
        if (!A.UpperFrameOffset[Side].IsNormalized() || !B.UpperFrameOffset[Side].IsNormalized() ||
            !A.ForearmFrameOffset[Side].IsNormalized() || !B.ForearmFrameOffset[Side].IsNormalized())
        { Out={}; return false; }
        Matching.UpperFrameOffset[Side]=A.UpperFrameOffset[Side];
        Matching.ForearmFrameOffset[Side]=A.ForearmFrameOffset[Side];
    }
    if (!InterpolatePreparedSeed(A,Matching,Alpha,Out)) return false;
    for (int32 Side=0;Side<2;++Side)
    {
        Out.UpperFrameOffset[Side]=FQuat::Slerp(A.UpperFrameOffset[Side],B.UpperFrameOffset[Side],Alpha).GetNormalized();
        Out.ForearmFrameOffset[Side]=FQuat::Slerp(A.ForearmFrameOffset[Side],B.ForearmFrameOffset[Side],Alpha).GetNormalized();
    }
    return true;
}

FFlowArtsArmClearanceResult FFlowArtsArmClearance::SolvePose(
    FPoseContext& Output, FFlowArtsArmClearanceHistory& History,
    const TArray<FFlowArtsClearanceCapsule>& LeftProp,
    const TArray<FFlowArtsClearanceCapsule>& RightProp,
    const FFlowArtsArmClearanceRigEnvelope* MeasuredEnvelope, bool bAllowTorsoResponse, bool bPreserveWrist,
    bool bAllowSharedPerformanceTranslation, const FFlowArtsArmClearancePreparedSeed* PreparedSeed,
    FVector ComponentToWorldScale, FFlowArtsArmClearancePreparationSnapshot* CaptureOnly,
    const FTransform* PreparedHandTargets)
{
    if (CaptureOnly) *CaptureOnly = {};
    const double StartedAt = FPlatformTime::Seconds();
    int32 HandAvoidanceExactQueries = 0;
    FFlowArtsArmClearanceResult Empty;
    const FBoneContainer& Bones = Output.Pose.GetBoneContainer();
    const USkeleton* Skeleton = Bones.GetSkeletonAsset();
    if (!Skeleton) return Empty;
    const FReferenceSkeleton& Reference = Skeleton->GetReferenceSkeleton();
    const FCompactPoseBoneIndex Upper[2] = {Bone(Bones, Reference, TEXT("LeftArm")), Bone(Bones, Reference, TEXT("RightArm"))};
    const FCompactPoseBoneIndex Clavicle[2] = {Bone(Bones, Reference, TEXT("LeftShoulder")), Bone(Bones, Reference, TEXT("RightShoulder"))};
    const FCompactPoseBoneIndex Elbow[2] = {Bone(Bones, Reference, TEXT("LeftForeArm")), Bone(Bones, Reference, TEXT("RightForeArm"))};
    const FCompactPoseBoneIndex Wrist[2] = {Bone(Bones, Reference, TEXT("LeftHand")), Bone(Bones, Reference, TEXT("RightHand"))};
    if (!Has(Upper[0]) || !Has(Elbow[0]) || !Has(Wrist[0]) ||
        !Has(Upper[1]) || !Has(Elbow[1]) || !Has(Wrist[1])) return Empty;

    FCSPose<FCompactPose> Pose;
    Pose.InitPose(Output.Pose);
    // Opt-in baseline trace shared by game evaluation and the CPU replay harness.
    // Emit before constructing or solving candidates so history and authored
    // inputs can be compared independently of the final corrected arm pose.
    if (UE_LOG_ACTIVE(LogFlowArtsClearance, VeryVerbose))
    {
        const auto TraceFrame = [](const TCHAR* Kind, const FString& Name, const FTransform& Frame)
        {
            const FVector P = Frame.GetLocation(), S = Frame.GetScale3D();
            const FQuat Q = Frame.GetRotation();
            UE_LOG(LogFlowArtsClearance, VeryVerbose,
                TEXT("Clearance baseline %s=%s p=(%.17g,%.17g,%.17g) q=(%.17g,%.17g,%.17g,%.17g) s=(%.17g,%.17g,%.17g)"),
                Kind, *Name, P.X, P.Y, P.Z, Q.X, Q.Y, Q.Z, Q.W, S.X, S.Y, S.Z);
        };
        UE_LOG(LogFlowArtsClearance, VeryVerbose,
            TEXT("Clearance baseline begin skeleton=%s compact=%d history=%d torso=%d preserveWrist=%d shared=%d measured=%d"),
            *Skeleton->GetPathName(), Output.Pose.GetNumBones(), History.bValid,
            bAllowTorsoResponse, bPreserveWrist, bAllowSharedPerformanceTranslation,
            MeasuredEnvelope && MeasuredEnvelope->IsComplete());
        for (int32 Index = 0; Index < Reference.GetNum(); ++Index)
        {
            const auto Compact = Bones.GetCompactPoseIndexFromSkeletonIndex(Index);
            if (!Has(Compact)) continue;
            const FString Name = Reference.GetBoneName(Index).ToString();
            TraceFrame(TEXT("component"), Name, Pose.GetComponentSpaceTransform(Compact));
            TraceFrame(TEXT("local"), Name, Output.Pose[Compact]);
        }
        if (History.bValid)
        {
            TraceFrame(TEXT("historyTorso"), TEXT("previous"), FTransform(History.PreviousTorsoRotation,
                History.PreviousSharedPerformanceTranslationCm));
            UE_LOG(LogFlowArtsClearance, VeryVerbose,
                TEXT("Clearance baseline history wristOffset=%.17g wristAbduction=%.17g"),
                double(History.PreviousWristOffsetCm), double(History.PreviousWristAbductionDeg));
            for (int32 Side = 0; Side < 2; ++Side)
            {
                const FString Name = FString::FromInt(Side);
                UE_LOG(LogFlowArtsClearance, VeryVerbose,
                    TEXT("Clearance baseline history side=%d clavicle=%.17g axial=%.17g"), Side,
                    double(History.PreviousClavicleProtractionDeg[Side]), double(History.PreviousUpperAxialTwistDeg[Side]));
                TraceFrame(TEXT("historyShoulder"), Name, FTransform(History.PreviousShoulders[Side]));
                TraceFrame(TEXT("historyWrist"), Name, FTransform(History.PreviousWrists[Side]));
                TraceFrame(TEXT("historyUpper"), Name, FTransform(History.PreviousSolvedUpperRotation[Side], History.PreviousSolvedShoulders[Side]));
                TraceFrame(TEXT("historyElbow"), Name, FTransform(History.PreviousSolvedForearmRotation[Side], History.PreviousElbows[Side]));
                for (int32 Frame = 0; Frame < 4; ++Frame)
                    TraceFrame(TEXT("historyAuthored"), FString::Printf(TEXT("%d/%d"), Side, Frame),
                        History.PreviousAuthoredArmTransforms[Side][Frame]);
            }
        }
        UE_LOG(LogFlowArtsClearance, VeryVerbose, TEXT("Clearance baseline end"));
    }
    FFlowArtsArmClearanceInput Input;
    if (PreparedHandTargets)
    {
        Input.bHasPreparedHandTargets=true;
        for (int32 Side=0; Side<2; ++Side) Input.PreparedHandTargets[Side]=PreparedHandTargets[Side];
    }
    Input.PreparedSeed = PreparedSeed;
    Input.bPreserveWrist = bPreserveWrist;
    Input.bAllowSharedPerformanceTranslation = bAllowSharedPerformanceTranslation;
    for (int32 Side = 0; Side < 2; ++Side)
    {
        FFlowArtsClearanceArm& Arm = Input.Arms[Side];
        Arm.bHasClavicle = Has(Clavicle[Side]);
        if (Arm.bHasClavicle) Arm.Clavicle = Pose.GetComponentSpaceTransform(Clavicle[Side]);
        Arm.Upper = Pose.GetComponentSpaceTransform(Upper[Side]);
        Arm.Elbow = Pose.GetComponentSpaceTransform(Elbow[Side]);
        Arm.Wrist = Pose.GetComponentSpaceTransform(Wrist[Side]);
        const float UpperLength = FVector::Dist(Arm.Upper.GetLocation(), Arm.Elbow.GetLocation());
        const float ForearmLength = FVector::Dist(Arm.Elbow.GetLocation(), Arm.Wrist.GetLocation());
        // Per-rig skeletal proxy until the caller supplies skinned surface radii.
        Arm.UpperRadiusCm = MeasuredEnvelope && MeasuredEnvelope->IsComplete()
            ? MeasuredEnvelope->UpperRadiusCm[Side] : UpperLength * 0.13f;
        Arm.ForearmRadiusCm = MeasuredEnvelope && MeasuredEnvelope->IsComplete()
            ? MeasuredEnvelope->ForearmRadiusCm[Side] : ForearmLength * 0.11f;
        if (MeasuredEnvelope && MeasuredEnvelope->BindUpperLengthCm[Side] > SMALL_NUMBER)
            for (const FVector& Point : MeasuredEnvelope->UpperTorsoPoints[Side])
                Arm.UpperTorsoPoints.Add(Point * (UpperLength / MeasuredEnvelope->BindUpperLengthCm[Side]));
    }
    Input.HeldPropCapsules[0] = LeftProp;
    Input.HeldPropCapsules[1] = RightProp;

    const bool bCompleteMeasuredGeometry = MeasuredEnvelope && MeasuredEnvelope->IsComplete();
    Input.bMeasuredSurface = bCompleteMeasuredGeometry;
    const FCompactPoseBoneIndex Hips = Bone(Bones, Reference, TEXT("Hips"));
    const FCompactPoseBoneIndex Neck = Bone(Bones, Reference, TEXT("Neck"));
    const FCompactPoseBoneIndex Head = Bone(Bones, Reference, TEXT("Head"));
    const bool bPreparedPerformancePivot = bCompleteMeasuredGeometry && bPreserveWrist && bAllowSharedPerformanceTranslation;
    const TCHAR* SpineName = (CaptureOnly || bPreparedPerformancePivot ||
        (PreparedSeed && PreparedSeed->bAbsoluteControls)) ? TEXT("Spine1") : TEXT("Spine");
    const FCompactPoseBoneIndex Spine = Bone(Bones, Reference, SpineName);
    if (!bCompleteMeasuredGeometry && Has(Hips) && Has(Neck))
    {
        const FVector HipPoint = Pose.GetComponentSpaceTransform(Hips).GetLocation();
        const FVector NeckPoint = Pose.GetComponentSpaceTransform(Neck).GetLocation();
        const float ShoulderSpan = FVector::Dist(Input.Arms[0].Upper.GetLocation(), Input.Arms[1].Upper.GetLocation());
        const float TorsoRadius = ShoulderSpan * 0.27f;
        Input.BodyCapsules.Add({FMath::Lerp(HipPoint, NeckPoint, 0.28f),
            FMath::Lerp(HipPoint, NeckPoint, 0.59f), TorsoRadius});
        Input.BodyCapsules.Add({FMath::Lerp(HipPoint, NeckPoint, 0.59f),
            FMath::Lerp(HipPoint, NeckPoint, 0.89f), TorsoRadius});
        if (Has(Head))
        {
            const FVector HeadPoint = Pose.GetComponentSpaceTransform(Head).GetLocation();
            Input.BodyCapsules.Add({NeckPoint, HeadPoint,
                static_cast<float>(FVector::Dist(NeckPoint, HeadPoint) * 0.45)});
        }
    }
    if (bCompleteMeasuredGeometry && Has(Hips) && Has(Neck) && Has(Head))
    {
        const FVector HipPoint = Pose.GetComponentSpaceTransform(Hips).GetLocation();
        const FVector NeckPoint = Pose.GetComponentSpaceTransform(Neck).GetLocation();
        const FVector HeadPoint = Pose.GetComponentSpaceTransform(Head).GetLocation();
        Input.BodyCapsules.Add({FMath::Lerp(HipPoint, NeckPoint, 0.28f),
            FMath::Lerp(HipPoint, NeckPoint, 0.59f), MeasuredEnvelope->LowerTorsoRadiusCm});
        Input.BodyCapsules.Add({FMath::Lerp(HipPoint, NeckPoint, 0.59f),
            FMath::Lerp(HipPoint, NeckPoint, 0.89f), MeasuredEnvelope->UpperTorsoRadiusCm});
        Input.BodyCapsules.Add({NeckPoint, HeadPoint, MeasuredEnvelope->HeadRadiusCm});
        if (MeasuredEnvelope->BindTrunkLengthCm > SMALL_NUMBER &&
            MeasuredEnvelope->TorsoBands[0].Planes.Num() >= 10 && MeasuredEnvelope->TorsoBands[1].Planes.Num() >= 10)
        {
            const FVector Up = (NeckPoint - HipPoint).GetSafeNormal();
            const FVector Lateral = FVector::VectorPlaneProject(
                Input.Arms[1].Upper.GetLocation() - Input.Arms[0].Upper.GetLocation(), Up).GetSafeNormal();
            if (!Lateral.IsNearlyZero())
            {
                const FQuat Frame = FRotationMatrix::MakeFromXZ(Lateral, Up).ToQuat();
                const float Scale = FVector::Dist(HipPoint, NeckPoint) / MeasuredEnvelope->BindTrunkLengthCm;
                for (const auto& Band : MeasuredEnvelope->TorsoBands)
                {
                    FFlowArtsClearanceHull Hull;
                    for (const auto& Plane : Band.Planes)
                    {
                        const FVector Normal = Frame.RotateVector(Plane.Normal);
                        Hull.Planes.Add({Normal, static_cast<float>(Plane.OffsetCm * Scale + FVector::DotProduct(Normal, HipPoint))});
                    }
                    for (const FVector& Point : Band.Vertices)
                        Hull.Vertices.Add(HipPoint + Frame.RotateVector(Point * Scale));
                    for (const FVector& Edge : Band.EdgeDirections)
                        Hull.EdgeDirections.Add(Frame.RotateVector(Edge));
                    Input.TorsoHulls.Add(MoveTemp(Hull));
                }
                Input.BodyCapsules[0].RadiusCm = Input.BodyCapsules[1].RadiusCm = 0.f;
                if (!MeasuredEnvelope->HeadHull.Planes.IsEmpty())
                {
                    FFlowArtsClearanceHull HeadHull;
                    const FQuat HeadRotation = Pose.GetComponentSpaceTransform(Head).GetRotation();
                    for (const auto& Plane : MeasuredEnvelope->HeadHull.Planes)
                    {
                        const FVector Normal = HeadRotation.RotateVector(Plane.Normal);
                        HeadHull.Planes.Add({Normal, static_cast<float>(Plane.OffsetCm * Scale +
                            FVector::DotProduct(Normal, HeadPoint))});
                    }
                    for (const FVector& Point : MeasuredEnvelope->HeadHull.Vertices)
                        HeadHull.Vertices.Add(HeadPoint + HeadRotation.RotateVector(Point * Scale));
                    for (const FVector& Edge : MeasuredEnvelope->HeadHull.EdgeDirections)
                        HeadHull.EdgeDirections.Add(HeadRotation.RotateVector(Edge));
                    Input.TorsoHulls.Add(MoveTemp(HeadHull));
                    Input.BodyCapsules[2].RadiusCm = 0.f;
                }
            }
        }
    }
    else if (bCompleteMeasuredGeometry)
        Input.bMeasuredSurface = false;

    const int32 SpineSkeleton = Reference.FindBoneIndex(SpineName);
    if (bAllowTorsoResponse && Input.bMeasuredSurface && Has(Spine) && Has(Hips) && Has(Neck) && Has(Head) &&
        DescendsFrom(Reference, Reference.FindBoneIndex(TEXT("LeftArm")), SpineSkeleton) &&
        DescendsFrom(Reference, Reference.FindBoneIndex(TEXT("RightArm")), SpineSkeleton) &&
        DescendsFrom(Reference, Reference.FindBoneIndex(TEXT("Head")), SpineSkeleton) &&
        !DescendsFrom(Reference, Reference.FindBoneIndex(TEXT("Hips")), SpineSkeleton) &&
        !DescendsFrom(Reference, Reference.FindBoneIndex(TEXT("LeftFoot")), SpineSkeleton) &&
        !DescendsFrom(Reference, Reference.FindBoneIndex(TEXT("RightFoot")), SpineSkeleton))
    {
        Input.bAllowTorsoResponse = true;
        Input.TorsoPivot = Pose.GetComponentSpaceTransform(Spine).GetLocation();
        Input.FixedHip = Pose.GetComponentSpaceTransform(Hips).GetLocation();
        Input.Neck = Pose.GetComponentSpaceTransform(Neck).GetLocation();
        Input.Head = Pose.GetComponentSpaceTransform(Head).GetLocation();
        Input.SourceHeadRotation = Pose.GetComponentSpaceTransform(Head).GetRotation();
    }

    const FVector SourceWrists[2] = {
        (Input.bHasPreparedHandTargets ? Input.PreparedHandTargets[0] : Input.Arms[0].Wrist).GetLocation(),
        (Input.bHasPreparedHandTargets ? Input.PreparedHandTargets[1] : Input.Arms[1].Wrist).GetLocation()};
    const TArray<FFlowArtsClearanceCapsule> SourceHeldProps[2] =
        {Input.HeldPropCapsules[0], Input.HeldPropCapsules[1]};
    FVector AppliedHandTranslation[2] = {FVector::ZeroVector, FVector::ZeroVector};
    const FVector SourceElbows[2] = {Input.Arms[0].Elbow.GetLocation(), Input.Arms[1].Elbow.GetLocation()};
    bool bTemporalHandResponse = false;
    bool bTemporalElbowResponse = false;
    FFlowArtsArmClearanceHistory BaselineHistory = History;
    FFlowArtsArmClearanceResult BaselineResult;
    bool bBaselineSolved = false;
    if (bCompleteMeasuredGeometry && MeasuredEnvelope->SkinnedClearance)
    {
        Input.bCanCertifySkinnedArmPair = MeasuredEnvelope->SkinnedClearance->bCanCertifyArmPair ||
            (MeasuredEnvelope->SkinnedClearance->bOpenArmCoverComplete[0] &&
             MeasuredEnvelope->SkinnedClearance->bOpenArmCoverComplete[1]);
        // Capture every authored component frame before mutating any parent.
        // Candidate skinning must match the final adapter, including finger locals.
        TArray<FTransform> AuthoredComponents, AuthoredLocals;
        AuthoredComponents.Init(FTransform::Identity, Reference.GetNum());
        AuthoredLocals.Init(FTransform::Identity, Reference.GetNum());
        TArray<bool> Available;
        Available.Init(false, Reference.GetNum());
        for (int32 Index = 0; Index < Reference.GetNum(); ++Index)
        {
            const auto Compact = Bones.GetCompactPoseIndexFromSkeletonIndex(Index);
            if (!Has(Compact)) continue;
            Available[Index] = true;
            AuthoredComponents[Index] = Pose.GetComponentSpaceTransform(Compact);
            AuthoredLocals[Index] = Output.Pose[Compact];
        }
        const int32 ClavicleSkeleton[2] = {Reference.FindBoneIndex(TEXT("LeftShoulder")), Reference.FindBoneIndex(TEXT("RightShoulder"))};
        const int32 UpperSkeleton[2] = {Reference.FindBoneIndex(TEXT("LeftArm")), Reference.FindBoneIndex(TEXT("RightArm"))};
        const int32 ElbowSkeleton[2] = {Reference.FindBoneIndex(TEXT("LeftForeArm")), Reference.FindBoneIndex(TEXT("RightForeArm"))};
        const int32 HandSkeleton[2] = {Reference.FindBoneIndex(TEXT("LeftHand")), Reference.FindBoneIndex(TEXT("RightHand"))};
        // Candidate geometry copies the callback; keep its authored pose immutable
        // and shared so each cheap search seed does not copy every bone array.
        struct FSkinnedAuthoredPose
        {
            TArray<FTransform> Components, Locals;
            TArray<int32> TorsoIndices;
            TArray<TPair<int32, int32>> HandParents, UpperMeshRemap, FullMeshRemap;
            bool bUpperRemapValid = true, bFullRemapValid = true;
        };
        const auto Snapshot = MakeShared<FSkinnedAuthoredPose, ESPMode::ThreadSafe>();
        Snapshot->Components = MoveTemp(AuthoredComponents);
        Snapshot->Locals = MoveTemp(AuthoredLocals);
        // Hierarchy membership, availability, and name remapping are immutable
        // during this SolvePose. Preserve reference order for parent-before-child
        // reconstruction, but resolve them once rather than at every search seed.
        for (int32 Index = 0; Index < Reference.GetNum(); ++Index)
        {
            if (!Available[Index]) continue;
            if (Index == SpineSkeleton || DescendsFrom(Reference, Index, SpineSkeleton))
                Snapshot->TorsoIndices.Add(Index);
            if (DescendsFrom(Reference, Index, HandSkeleton[0]) ||
                DescendsFrom(Reference, Index, HandSkeleton[1]))
            {
                const int32 Parent = Reference.GetParentIndex(Index);
                if (Parent != INDEX_NONE) Snapshot->HandParents.Add({Index, Parent});
            }
        }
        const auto& Skin = *MeasuredEnvelope->SkinnedClearance;
        const auto BuildRemap = [&](const TArray<int32>& RequiredBones,
            TArray<TPair<int32, int32>>& Remap) -> bool
        {
            Remap.Reserve(RequiredBones.Num());
            for (const int32 MeshBone : RequiredBones)
            {
                if (!Skin.ReferenceBoneNames.IsValidIndex(MeshBone)) return false;
                const int32 Index = Reference.FindBoneIndex(Skin.ReferenceBoneNames[MeshBone]);
                if (Index == INDEX_NONE || !Available[Index]) return false;
                Remap.Add({MeshBone, Index});
            }
            return true;
        };
        Snapshot->bUpperRemapValid = BuildRemap(Skin.UpperReferencedBones, Snapshot->UpperMeshRemap);
        Snapshot->bFullRemapValid = BuildRemap(Skin.ReferencedBones, Snapshot->FullMeshRemap);
        const auto SkinData = MeasuredEnvelope->SkinnedClearance;
        const auto MakeSkinFrames = [ClavicleSkeleton, UpperSkeleton, ElbowSkeleton, HandSkeleton, SkinData]
            (TSharedPtr<const FSkinnedAuthoredPose, ESPMode::ThreadSafe> FrameSnapshot, FVector TorsoPivot)
        {
            return [ClavicleSkeleton, UpperSkeleton, ElbowSkeleton, HandSkeleton, Snapshot=MoveTemp(FrameSnapshot), SkinData, TorsoPivot]
            (const FFlowArtsClearanceArm* CandidateArms, const FQuat& Rotation, bool bRequestArmPair, TArray<FTransform>& MeshComponents) -> bool
        {
            const auto& AuthoredComponents = Snapshot->Components;
            const auto& AuthoredLocals = Snapshot->Locals;
            if (!(bRequestArmPair ? Snapshot->bFullRemapValid : Snapshot->bUpperRemapValid)) return false;
            TArray<FTransform> Components = AuthoredComponents;
            const FTransform Delta(Rotation, TorsoPivot - Rotation.RotateVector(TorsoPivot));
            for (const int32 Index : Snapshot->TorsoIndices)
                Components[Index] = AuthoredComponents[Index] * Delta;
            for (int32 Side = 0; Side < 2; ++Side)
            {
                if (CandidateArms[Side].bHasClavicle && ClavicleSkeleton[Side] != INDEX_NONE)
                    Components[ClavicleSkeleton[Side]] = CandidateArms[Side].Clavicle;
                Components[UpperSkeleton[Side]] = CandidateArms[Side].Upper;
                Components[ElbowSkeleton[Side]] = CandidateArms[Side].Elbow;
                Components[HandSkeleton[Side]] = CandidateArms[Side].Wrist;
            }
            for (const auto& Entry : Snapshot->HandParents)
                Components[Entry.Key] = AuthoredLocals[Entry.Key] * Components[Entry.Value];
            const auto& Skin = *SkinData;
            MeshComponents.Init(FTransform::Identity, Skin.ReferenceBoneNames.Num());
            const auto& Remap = bRequestArmPair ? Snapshot->FullMeshRemap : Snapshot->UpperMeshRemap;
            for (const auto& Entry : Remap)
                MeshComponents[Entry.Key] = Components[Entry.Value];
            return true;
            };
        };
        const auto BuildSkinFrames = MakeSkinFrames(Snapshot, Input.TorsoPivot);
        const auto ContactWitnesses = MakeShared<TArray<FFlowArtsContactWitness>>();
        const auto PropContactWitnesses = MakeShared<TArray<FFlowArtsPropContactWitness>>();
        const auto UpdatePropContacts = [PropContactWitnesses]
            (TConstArrayView<FFlowArtsPropContactWitness> Current, bool bBody, uint8 RequestedSides)
        {
            PropContactWitnesses->RemoveAll([&](const FFlowArtsPropContactWitness& W)
            {
                if (bBody != (W.SurfaceKind != 0)) return false;
                const uint8 Side = bBody ? W.PropSide : W.SurfaceSide;
                return !!(RequestedSides & (1 << Side));
            });
            for (const auto& W : Current)
            {
                if (PropContactWitnesses->Num() >= 16) PropContactWitnesses->RemoveAt(0);
                PropContactWitnesses->Add(W);
            }
        };
        const auto SearchConstraints = MakeShared<FContactSearchConstraints>();
        Input.SnapshotSkinnedContacts = [ContactWitnesses]() { return *ContactWitnesses; };
        const auto WitnessFrames = MakeShared<FSparseWitnessFrames>();
        WitnessFrames->Initialize(Reference.GetNum(), Skin.ReferenceBoneNames.Num(),
            Snapshot->TorsoIndices, Snapshot->HandParents, Snapshot->UpperMeshRemap);
        const auto ArmPairWitness = MakeShared<FFlowArtsArmPairContactWitness>();
        const auto ArmPairWitnessFrames = MakeShared<FSparseWitnessFrames>();
        ArmPairWitnessFrames->Initialize(Reference.GetNum(), Skin.ReferenceBoneNames.Num(),
            Snapshot->TorsoIndices, Snapshot->HandParents, Snapshot->FullMeshRemap);
        const auto PropWitnessFrames = MakeShared<FSparseWitnessFrames>();
        PropWitnessFrames->Initialize(Reference.GetNum(), Skin.ReferenceBoneNames.Num(),
            Snapshot->TorsoIndices, Snapshot->HandParents, Snapshot->FullMeshRemap);
        Input.EvaluateSkinnedContacts = [&, Snapshot, SearchConstraints, WitnessFrames,
            ArmPairWitness, ArmPairWitnessFrames,
            ClavicleSkeleton, UpperSkeleton, ElbowSkeleton, HandSkeleton]
            (const FFlowArtsClearanceArm* Arms, const FQuat& Rotation) -> double
        {
            TRACE_CPUPROFILER_EVENT_SCOPE(FlowArtsSparseWitnessFrames);
            const auto& WitnessSkin = *MeasuredEnvelope->SkinnedClearance;
            // Preserve the old adapter's missing-bone rejection, even when the missing
            // frame is not referenced by this particular active contact set.
            if (!Snapshot->bUpperRemapValid ||
                !WitnessFrames->Prepare(WitnessSkin, SearchConstraints->Active))
                return TNumericLimits<double>::Max();
            const FTransform Delta(Rotation, Input.TorsoPivot - Rotation.RotateVector(Input.TorsoPivot));
            WitnessFrames->Build(Snapshot->Components, Snapshot->Locals, Arms,
                ClavicleSkeleton, UpperSkeleton, ElbowSkeleton, HandSkeleton, Delta);
            double Objective = FFlowArtsSkinnedClearance::EvaluateContactWitnesses(
                // Ranking margin only; the complete certificate retains exact padding.
                WitnessSkin, WitnessFrames->MeshFrames, SearchConstraints->Active, Input.SurfacePaddingCm + .15f);
            if (ArmPairWitness->LeftTriangleIndex != INDEX_NONE &&
                ArmPairWitness->RightTriangleIndex != INDEX_NONE)
            {
                if (!Snapshot->bFullRemapValid ||
                    !ArmPairWitnessFrames->PrepareArmPair(WitnessSkin, *ArmPairWitness))
                    return TNumericLimits<double>::Max();
                ArmPairWitnessFrames->Build(Snapshot->Components, Snapshot->Locals, Arms,
                    ClavicleSkeleton, UpperSkeleton, ElbowSkeleton, HandSkeleton, Delta);
                Objective += FFlowArtsSkinnedClearance::EvaluateArmPairContactWitness(
                    WitnessSkin, ArmPairWitnessFrames->MeshFrames, *ArmPairWitness,
                    Input.SurfacePaddingCm + .15f);
            }
            return Objective;
        };
        if (Snapshot->bFullRemapValid)
            Input.EvaluateSkinnedPropContacts = [&, Snapshot, PropContactWitnesses, PropWitnessFrames,
                ClavicleSkeleton, UpperSkeleton, ElbowSkeleton, HandSkeleton]
                (const FFlowArtsClearanceArm* Arms, const FQuat& Rotation,
                    const TArray<FFlowArtsClearanceCapsule>& LeftProps,
                    const TArray<FFlowArtsClearanceCapsule>& RightProps) -> double
            {
                const auto& WitnessSkin = *MeasuredEnvelope->SkinnedClearance;
                if (!PropWitnessFrames->PrepareProps(WitnessSkin,*PropContactWitnesses))
                    return TNumericLimits<double>::Max();
                const FTransform Delta(Rotation, Input.TorsoPivot - Rotation.RotateVector(Input.TorsoPivot));
                PropWitnessFrames->Build(Snapshot->Components, Snapshot->Locals, Arms,
                    ClavicleSkeleton, UpperSkeleton, ElbowSkeleton, HandSkeleton, Delta);
                return FFlowArtsSkinnedClearance::EvaluatePropContactWitnesses(
                    WitnessSkin, PropWitnessFrames->MeshFrames,*PropContactWitnesses,
                    LeftProps,RightProps,Input.SurfacePaddingCm + .15f);
            };
        const bool bOpenUpperBody = Skin.bOpenBodyCoverComplete && Snapshot->bFullRemapValid;
        const bool bCanCertifyUpperBody = bOpenUpperBody || (Snapshot->bUpperRemapValid &&
            !Skin.ClosedBodyTopology.Nodes.IsEmpty() &&
            (Skin.bTorsoCoveredByClosedBody || !Skin.TorsoTopology.Nodes.IsEmpty()));
        Input.bCanCertifySkinnedUpperTorso = bCanCertifyUpperBody;
        Input.bCanCertifySkinnedArmPair &= Snapshot->bFullRemapValid;
        if (bCanCertifyUpperBody || Input.bCanCertifySkinnedArmPair)
            Input.CertifySkinnedUpperTorso = [&, BuildSkinFrames, ContactWitnesses,
            SearchConstraints, ArmPairWitness, bOpenUpperBody]
            (const FFlowArtsClearanceArm* CandidateArms, const FQuat& Rotation, bool bRequestArmPair) -> uint8
        {
            TArray<FTransform> MeshComponents;
            if (!BuildSkinFrames(CandidateArms, Rotation, bRequestArmPair || bOpenUpperBody, MeshComponents))
            {
                *ArmPairWitness = {};
                return 0;
            }
            const auto& Skin = *MeasuredEnvelope->SkinnedClearance;
            const auto& RequiredBones = (bRequestArmPair || bOpenUpperBody) ? Skin.ReferencedBones : Skin.UpperReferencedBones;
            // Opt-in full callback frames distinguish pose reconstruction from exact
            // surface-query rejection without changing normal game logging or search.
            if (UE_LOG_ACTIVE(LogFlowArtsClearance, VeryVerbose))
            {
                UE_LOG(LogFlowArtsClearance, VeryVerbose,
                    TEXT("Skin callback begin pair=%d padding=%.12g torso=(%.12g,%.12g,%.12g,%.12g) bones=%d"),
                    bRequestArmPair, double(Input.SurfacePaddingCm), Rotation.X, Rotation.Y, Rotation.Z, Rotation.W,
                    RequiredBones.Num());
                for (const int32 MeshBone : RequiredBones)
                {
                    const auto& Frame = MeshComponents[MeshBone];
                    const FVector P = Frame.GetLocation(), S = Frame.GetScale3D();
                    const FQuat Q = Frame.GetRotation();
                    UE_LOG(LogFlowArtsClearance, VeryVerbose,
                        TEXT("Skin callback bone=%s p=(%.12g,%.12g,%.12g) q=(%.12g,%.12g,%.12g,%.12g) s=(%.12g,%.12g,%.12g)"),
                        *Skin.ReferenceBoneNames[MeshBone].ToString(), P.X, P.Y, P.Z, Q.X, Q.Y, Q.Z, Q.W, S.X, S.Y, S.Z);
                }
            }
            const uint8 Certificate = FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(
                Skin, MeshComponents, Input.SurfacePaddingCm, bCanCertifyUpperBody ? 3 : 0,
                bRequestArmPair, bCanCertifyUpperBody ? &ContactWitnesses.Get() : nullptr,
                {}, {}, 0, 0, nullptr, &ArmPairWitness.Get());
            if (bCanCertifyUpperBody) SearchConstraints->Update(*ContactWitnesses);
            UE_LOG(LogFlowArtsClearance, VeryVerbose, TEXT("Skin callback end mask=%u"), unsigned(Certificate));
            return Certificate;
        };
        if (Snapshot->bFullRemapValid &&
            !Skin.DistalArmTriangles[0].IsEmpty() && !Skin.DistalArmTriangles[1].IsEmpty() &&
            !Skin.UncappedArmTriangles[0].IsEmpty() && !Skin.UncappedArmTriangles[1].IsEmpty())
        {
            Input.CertifySkinnedSegments = [&, BuildSkinFrames]
                (const FFlowArtsClearanceArm* CandidateArms, const FQuat& Rotation,
                    const TArray<FFlowArtsClearanceCapsule>& LeftProps,
                    const TArray<FFlowArtsClearanceCapsule>& RightProps, uint8 RequestedMask) -> uint8
            {
                TArray<FTransform> MeshComponents;
                if (!BuildSkinFrames(CandidateArms, Rotation, true, MeshComponents)) return 0;
                return FFlowArtsSkinnedClearance::CertifyUncappedSegments(
                    *MeasuredEnvelope->SkinnedClearance, MeshComponents, Input.SurfacePaddingCm,
                    LeftProps, RightProps, RequestedMask);
            };
        }
        if ((Skin.bCanCertifyArmPair || Skin.bOpenArmCoverComplete[0] ||
            Skin.bOpenArmCoverComplete[1]) && Snapshot->bFullRemapValid)
        {
            Input.CertifySkinnedOppositeProps = [&, BuildSkinFrames, UpdatePropContacts]
                (const FFlowArtsClearanceArm* CandidateArms, const FQuat& Rotation,
                    const TArray<FFlowArtsClearanceCapsule>& LeftProps,
                    const TArray<FFlowArtsClearanceCapsule>& RightProps, uint8 RequestedSides) -> uint8
            {
                TArray<FTransform> MeshComponents;
                if (!BuildSkinFrames(CandidateArms, Rotation, true, MeshComponents)) return 0;
                // The separate query does not replace upper/body contact witnesses.
                // Props already include this candidate's hand translation and offsets.
                TArray<FFlowArtsPropContactWitness> Current;
                const uint8 Mask = FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(
                    *MeasuredEnvelope->SkinnedClearance, MeshComponents, Input.SurfacePaddingCm,
                    0, false, nullptr, LeftProps, RightProps, RequestedSides, 0, &Current) & uint8(24);
                UpdatePropContacts(Current,false,RequestedSides);
                return Mask;
            };
        }
        if ((Skin.bCanCertifyHeldPropBody || Skin.bOpenBodyPropCoverComplete) && Snapshot->bFullRemapValid)
        {
            Input.CertifySkinnedHeldPropBody = [&, BuildSkinFrames, UpdatePropContacts]
                (const FFlowArtsClearanceArm* CandidateArms, const FQuat& Rotation,
                    const TArray<FFlowArtsClearanceCapsule>& LeftProps,
                    const TArray<FFlowArtsClearanceCapsule>& RightProps, uint8 RequestedSides) -> uint8
            {
                TArray<FTransform> MeshComponents;
                if (!BuildSkinFrames(CandidateArms, Rotation, true, MeshComponents)) return 0;
                TArray<FFlowArtsPropContactWitness> Current;
                const uint8 Mask = FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(
                    *MeasuredEnvelope->SkinnedClearance, MeshComponents, Input.SurfacePaddingCm,
                    0, false, nullptr, LeftProps, RightProps, 0, RequestedSides, &Current) & uint8(96);
                UpdatePropContacts(Current,true,RequestedSides);
                return Mask;
            };
        }
        if (Input.CertifySkinnedHeldPropBody)
            Input.CertifyForearmBody = [BuildSkinFrames, SkinData, Padding = Input.SurfacePaddingCm]
                (const FFlowArtsClearanceArm* Arms, const FQuat& Rotation) -> uint8
            {
                TArray<FTransform> Frames;
                if (!BuildSkinFrames(Arms, Rotation, true, Frames)) return 0;
                const TArray<FFlowArtsClearanceCapsule> Left{ForearmCapsule(Arms[0])};
                const TArray<FFlowArtsClearanceCapsule> Right{ForearmCapsule(Arms[1])};
                // This separate invocation retains the body's containment,
                // mixed-face and lower-body checks without modifying prop witnesses.
                return (FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(*SkinData, Frames, Padding,
                    0, false, nullptr, Left, Right, 0, 3) >> 5) & 3;
            };
        Input.CertifyForearmHead = [BuildSkinFrames, SkinData, Padding = Input.SurfacePaddingCm]
            (const FFlowArtsClearanceArm* Arms, const FQuat& Rotation) -> uint8
        {
            TArray<FTransform> Frames;
            if (!BuildSkinFrames(Arms, Rotation, true, Frames)) return 0;
            const uint8 Convex=FFlowArtsSkinnedClearance::CertifyForearmHeadClear(*SkinData, Frames, Padding,
                ForearmCapsule(Arms[0]), ForearmCapsule(Arms[1]));
            return Convex | FFlowArtsSkinnedClearance::CertifyForearmHeadSkinClear(
                *SkinData,Frames,Padding,uint8(3 & ~Convex));
        };
        const float Padding = Input.SurfacePaddingCm;
        const bool bUpperQuery=bool(Input.CertifySkinnedUpperTorso), bOppositeQuery=bool(Input.CertifySkinnedOppositeProps),
            bBodyQuery=bool(Input.CertifySkinnedHeldPropBody), bSegmentQuery=bool(Input.CertifySkinnedSegments),
            bHeadQuery=bool(Input.CertifyForearmHead);
            const auto BindQueries = [SkinData, Padding, bCanCertifyUpperBody, bUpperQuery, bOppositeQuery, bBodyQuery, bSegmentQuery, bHeadQuery]
                (const auto& BuildSkinFrames, FFlowArtsArmClearanceInput& Geometry)
            {
            if (bHeadQuery)
                Geometry.CertifyForearmHead = [BuildSkinFrames, SkinData, Padding]
                    (const FFlowArtsClearanceArm* Arms, const FQuat& Rotation) -> uint8
                {
                    TArray<FTransform> Frames;
                    if (!BuildSkinFrames(Arms, Rotation, true, Frames)) return 0;
                    const uint8 Convex=FFlowArtsSkinnedClearance::CertifyForearmHeadClear(*SkinData, Frames, Padding,
                        ForearmCapsule(Arms[0]), ForearmCapsule(Arms[1]));
                    return Convex | FFlowArtsSkinnedClearance::CertifyForearmHeadSkinClear(
                        *SkinData,Frames,Padding,uint8(3 & ~Convex));
                };
            if (bBodyQuery)
                Geometry.CertifyForearmBody = [BuildSkinFrames, SkinData, Padding]
                    (const FFlowArtsClearanceArm* Arms, const FQuat& Rotation) -> uint8
                {
                    TArray<FTransform> Frames;
                    if (!BuildSkinFrames(Arms, Rotation, true, Frames)) return 0;
                    const TArray<FFlowArtsClearanceCapsule> Left{ForearmCapsule(Arms[0])};
                    const TArray<FFlowArtsClearanceCapsule> Right{ForearmCapsule(Arms[1])};
                    return (FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(*SkinData, Frames, Padding,
                        0, false, nullptr, Left, Right, 0, 3) >> 5) & 3;
                };
            Geometry.MakePreparedContactObjective=[BuildSkinFrames,SkinData,Padding,bCanCertifyUpperBody]
                (const FFlowArtsClearanceArm* Arms,const FQuat& Rotation,
                    const TArray<FFlowArtsClearanceCapsule>& Left,const TArray<FFlowArtsClearanceCapsule>& Right)
                    -> FFlowArtsPreparedContactObjective
            {
                TArray<FTransform> Frames;
                if(!BuildSkinFrames(Arms,Rotation,true,Frames)) return {};
                TArray<FFlowArtsContactWitness> Contacts;
                TArray<FFlowArtsPropContactWitness> Props;
                FFlowArtsArmPairContactWitness Pair;
                TArray<FFlowArtsArmPairContactWitness> Pairs;
                const uint8 Mask=FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(*SkinData,Frames,Padding,
                    bCanCertifyUpperBody ? 3 : 0,true,&Contacts,Left,Right,3,3,&Props,&Pair,&Pairs);
                const bool HasPair=!Pairs.IsEmpty();
                // A missing witness (e.g. conservative containment/projection) is
                // a constant search penalty, never an invented signed distance.
                double Unsupported=0.;
                for(int32 Side=0;Side<2;++Side)
                {
                    if(!(Mask&(1<<Side)) && !Contacts.ContainsByPredicate([&](const auto& W){return W.Side==Side;})) Unsupported+=1.;
                    if(!(Mask&(8<<Side)) && !Props.ContainsByPredicate([&](const auto& W){return W.SurfaceKind==0 && W.SurfaceSide==Side;})) Unsupported+=1.;
                    const auto& Owned=Side ? Right : Left;
                    if(!Owned.IsEmpty() && !(Mask&(32<<Side)) &&
                        !Props.ContainsByPredicate([&](const auto& W){return W.PropSide==Side && W.SurfaceKind!=0;})) Unsupported+=1.;
                }
                if(!(Mask&4) && !HasPair) Unsupported+=1.;
                return [BuildSkinFrames,SkinData,Padding,Contacts=MoveTemp(Contacts),Props=MoveTemp(Props),Pairs=MoveTemp(Pairs),Unsupported]
                    (const FFlowArtsClearanceArm* Candidate,const FQuat& CandidateRotation,
                        const TArray<FFlowArtsClearanceCapsule>& CandidateLeft,const TArray<FFlowArtsClearanceCapsule>& CandidateRight)
                    -> double
                {
                    TArray<FTransform> CandidateFrames;
                    if(!BuildSkinFrames(Candidate,CandidateRotation,true,CandidateFrames)) return TNumericLimits<double>::Max();
                    // A half-millimetre optimization margin avoids asymptotic
                    // convergence exactly onto the unchanged certificate padding.
                    const float Target=Padding+.05f;
                    double Value=Unsupported+FFlowArtsSkinnedClearance::EvaluateContactWitnesses(*SkinData,CandidateFrames,Contacts,Target);
                    double PairValue=0.;
                    for(const auto& Witness:Pairs)
                        PairValue+=FFlowArtsSkinnedClearance::EvaluateArmPairContactWitness(*SkinData,CandidateFrames,Witness,Target);
                    // Normalize tessellation density while retaining simultaneous
                    // descent constraints for adjacent forearm/finger surfaces.
                    if(!Pairs.IsEmpty()) Value+=PairValue/Pairs.Num();
                    Value+=FFlowArtsSkinnedClearance::EvaluatePropContactWitnesses(*SkinData,CandidateFrames,Props,CandidateLeft,CandidateRight,Target);
                    return Value;
                };
            };
            Geometry.CertifySkinnedCandidate = [BuildSkinFrames, SkinData, Padding, bCanCertifyUpperBody,
                bUpperQuery, bOppositeQuery, bBodyQuery, bSegmentQuery]
                (const FFlowArtsClearanceArm* Arms,const FQuat& Rotation,bool bPair,
                    const TArray<FFlowArtsClearanceCapsule>& Left,const TArray<FFlowArtsClearanceCapsule>& Right,
                    uint8 OppositeSides,uint8 BodySides,uint8 Segments) -> uint16
            {
                TArray<FTransform> Frames;
                if (!BuildSkinFrames(Arms,Rotation,true,Frames)) return 0;
                const uint8 Clear=FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(*SkinData,Frames,Padding,
                    bUpperQuery && bCanCertifyUpperBody ? 3 : 0,bUpperQuery && bPair,nullptr,Left,Right,
                    bOppositeQuery ? OppositeSides : 0,bBodyQuery ? BodySides : 0);
                const uint8 Distal=bSegmentQuery && Segments ? FFlowArtsSkinnedClearance::CertifyUncappedSegments(
                    *SkinData,Frames,Padding,Left,Right,Segments) : 0;
                return uint16(Clear)|(uint16(Distal)<<8);
            };
            Geometry.FindPreparedDepthEscape = [BuildSkinFrames,SkinData,Padding]
                (const FFlowArtsClearanceArm* Arms,const FQuat& Rotation,
                 const TArray<FFlowArtsClearanceCapsule>& Left,const TArray<FFlowArtsClearanceCapsule>& Right,
                 const FVector& Normal,double Maximum,double& Additional)
            {
                TArray<FTransform> Frames;
                return BuildSkinFrames(Arms,Rotation,true,Frames) &&
                    FFlowArtsSkinnedClearance::FindHandPropDepthEscape(*SkinData,Frames,Left,Right,
                        Normal,Maximum,Additional,Padding+.05f);
            };
#if WITH_DEV_AUTOMATION_TESTS
            Geometry.WriteSkinEvidence = [BuildSkinFrames,SkinData,Padding]
                (const FFlowArtsClearanceArm* Arms,const FQuat& Rotation,
                 const TArray<FFlowArtsClearanceCapsule>& Left,const TArray<FFlowArtsClearanceCapsule>& Right,
                 const FString& Path)
            {
                TArray<FTransform> Frames;
                if(!BuildSkinFrames(Arms,Rotation,true,Frames)) return;
                FString Csv=TEXT("index,posedX,posedY,posedZ,dominantBone,dominantWeight\n");
                for(int32 V=0;V<SkinData->Vertices.Num();++V)
                {
                    const auto& Vertex=SkinData->Vertices[V];
                    FVector P=FVector::ZeroVector; int32 Bone=INDEX_NONE; float Weight=0;
                    for(int32 I=Vertex.FirstInfluence;I<Vertex.FirstInfluence+Vertex.InfluenceCount;++I)
                    {
                        const auto& Influence=SkinData->Influences[I];
                        if(!Frames.IsValidIndex(Influence.Bone)) return;
                        P+=Frames[Influence.Bone].TransformPosition(Influence.BoneLocalPosition)*Influence.Weight;
                        if(Influence.Weight>Weight) { Bone=Influence.Bone; Weight=Influence.Weight; }
                    }
                    Csv+=FString::Printf(TEXT("%d,%.12f,%.12f,%.12f,%s,%.9f\n"),V,P.X,P.Y,P.Z,
                        SkinData->ReferenceBoneNames.IsValidIndex(Bone) ? *SkinData->ReferenceBoneNames[Bone].ToString() : TEXT("none"),Weight);
                }
                FFileHelper::SaveStringToFile(Csv,*(Path+TEXT("-vertices.csv")));
                FString HandFaces=TEXT("side,index,a,b,c\n");
                for(int32 Side=0;Side<2;++Side)
                    for(int32 I=0;I<SkinData->HandTriangles[Side].Num();++I)
                    {
                        const auto& T=SkinData->HandTriangles[Side][I];
                        HandFaces+=FString::Printf(TEXT("%d,%d,%d,%d,%d\n"),Side,I,T.X,T.Y,T.Z);
                    }
                FFileHelper::SaveStringToFile(HandFaces,*(Path+TEXT("-hand-triangles.csv")));
                FString Bones=TEXT("bone,x,y,z,qx,qy,qz,qw,sx,sy,sz\n");
                for(int32 I=0;I<Frames.Num();++I)
                {
                    const auto& T=Frames[I]; const auto P=T.GetLocation(),S=T.GetScale3D(); const auto Q=T.GetRotation();
                    Bones+=FString::Printf(TEXT("%s,%.12f,%.12f,%.12f,%.12f,%.12f,%.12f,%.12f,%.12f,%.12f,%.12f\n"),
                        *SkinData->ReferenceBoneNames[I].ToString(),P.X,P.Y,P.Z,Q.X,Q.Y,Q.Z,Q.W,S.X,S.Y,S.Z);
                }
                FFileHelper::SaveStringToFile(Bones,*(Path+TEXT("-bones.csv")));
                TArray<FFlowArtsContactWitness> Contacts; TArray<FFlowArtsPropContactWitness> Props;
                FFlowArtsArmPairContactWitness Pair;
                const uint8 Mask=FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(*SkinData,Frames,Padding,3,true,
                    &Contacts,Left,Right,3,3,&Props,&Pair);
                FString Details=FString::Printf(TEXT("space=mesh-component-cm padding=%.9f mask=%u\n"),Padding,uint32(Mask));
                auto Face=[&](const TCHAR* Label,const FIntVector& T)
                { Details+=FString::Printf(TEXT("%s=%d,%d,%d\n"),Label,T.X,T.Y,T.Z); };
                for(const auto& C:Contacts)
                {
                    Details+=FString::Printf(TEXT("upper side=%d index=%d body=%d closed=%d containment=%d\n"),
                        C.Side,C.UpperTriangleIndex,C.BodyTriangleIndex,int32(C.bClosedBody),int32(C.bContainment));
                    if(SkinData->UpperTriangles[C.Side].IsValidIndex(C.UpperTriangleIndex))
                    {
                        const auto& T=SkinData->UpperTriangles[C.Side][C.UpperTriangleIndex]; Face(TEXT("upperFace"),T.Vertices);
                        Details+=FString::Printf(TEXT("bindFractions=%.12f,%.12f,%.12f\n"),T.BindArmFractions.X,T.BindArmFractions.Y,T.BindArmFractions.Z);
                    }
                    const auto& Body=C.bClosedBody ? SkinData->ClosedBodyTriangles : SkinData->TorsoTriangles;
                    if(Body.IsValidIndex(C.BodyTriangleIndex)) Face(TEXT("bodyFace"),Body[C.BodyTriangleIndex]);
                }
                Details+=FString::Printf(TEXT("pair=%d,%d\n"),Pair.LeftTriangleIndex,Pair.RightTriangleIndex);
                if(SkinData->FullArmTriangles[0].IsValidIndex(Pair.LeftTriangleIndex)) Face(TEXT("pairLeft"),SkinData->FullArmTriangles[0][Pair.LeftTriangleIndex]);
                if(SkinData->FullArmTriangles[1].IsValidIndex(Pair.RightTriangleIndex)) Face(TEXT("pairRight"),SkinData->FullArmTriangles[1][Pair.RightTriangleIndex]);
                for(const auto& C:Props)
                {
                    Details+=FString::Printf(TEXT("prop side=%d surface=%d surfaceSide=%d triangle=%d capsule=%d containment=%d\n"),
                        C.PropSide,C.SurfaceKind,C.SurfaceSide,C.TriangleIndex,C.CapsuleIndex,int32(C.bContainment));
                    const auto& Faces=C.SurfaceKind==0 ? SkinData->FullArmTriangles[C.SurfaceSide] :
                        C.SurfaceKind==1 ? SkinData->ClosedBodyTriangles : SkinData->BodyPropBoundaryTriangles;
                    if(Faces.IsValidIndex(C.TriangleIndex)) Face(TEXT("propFace"),Faces[C.TriangleIndex]);
                }
                for(int32 Side=0;Side<2;++Side)
                {
                    const auto& Capsules=Side ? Right : Left;
                    for(const auto& C:Capsules) Details+=FString::Printf(TEXT("capsule side=%d start=%.9f,%.9f,%.9f end=%.9f,%.9f,%.9f radius=%.9f\n"),
                        Side,C.Start.X,C.Start.Y,C.Start.Z,C.End.X,C.End.Y,C.End.Z,C.RadiusCm);
                }
                TArray<FFlowArtsPropContactWitness> ForearmContacts;
                const TArray<FFlowArtsClearanceCapsule> Forearms[2] = {
                    { ForearmCapsule(Arms[0]) }, { ForearmCapsule(Arms[1]) } };
                const uint8 ForearmMask = FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(
                    *SkinData,Frames,Padding,0,false,nullptr,Forearms[0],Forearms[1],0,3,&ForearmContacts);
                Details+=FString::Printf(TEXT("forearmBodyMask=%u closed=%d open=%d\n"),
                    uint32((ForearmMask>>5)&3),int32(SkinData->bCanCertifyHeldPropBody),
                    int32(SkinData->bOpenBodyPropCoverComplete));
                for(int32 Side=0;Side<2;++Side)
                {
                    const auto& C=Forearms[Side][0];
                    Details+=FString::Printf(TEXT("forearmCapsule side=%d start=%.12f,%.12f,%.12f end=%.12f,%.12f,%.12f radius=%.12f\n"),
                        Side,C.Start.X,C.Start.Y,C.Start.Z,C.End.X,C.End.Y,C.End.Z,C.RadiusCm);
                }
                for(const auto& C:ForearmContacts)
                {
                    Details+=FString::Printf(TEXT("forearmBody side=%d surface=%d triangle=%d containment=%d\n"),
                        C.PropSide,C.SurfaceKind,C.TriangleIndex,int32(C.bContainment));
                    const auto& Faces=C.SurfaceKind==1 ? SkinData->ClosedBodyTriangles : SkinData->BodyPropBoundaryTriangles;
                    if(Faces.IsValidIndex(C.TriangleIndex)) Face(TEXT("forearmBodyFace"),Faces[C.TriangleIndex]);
                }
                FFileHelper::SaveStringToFile(Details,*(Path+TEXT("-contacts.txt")));
            };
#endif
            if (bUpperQuery)
                Geometry.CertifySkinnedUpperTorso = [BuildSkinFrames, SkinData, Padding, bCanCertifyUpperBody]
                    (const FFlowArtsClearanceArm* Arms, const FQuat& Rotation, bool bPair) -> uint8
                {
                    TArray<FTransform> Frames;
                    if (!BuildSkinFrames(Arms, Rotation, bPair, Frames)) return 0;
                    return FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(*SkinData, Frames, Padding,
                        bCanCertifyUpperBody ? 3 : 0, bPair);
                };
            if (bOppositeQuery)
                Geometry.CertifySkinnedOppositeProps = [BuildSkinFrames, SkinData, Padding]
                    (const FFlowArtsClearanceArm* Arms, const FQuat& Rotation,
                        const TArray<FFlowArtsClearanceCapsule>& Left,
                        const TArray<FFlowArtsClearanceCapsule>& Right, uint8 Sides) -> uint8
                {
                    TArray<FTransform> Frames;
                    if (!BuildSkinFrames(Arms, Rotation, true, Frames)) return 0;
                    return FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(*SkinData, Frames, Padding,
                        0, false, nullptr, Left, Right, Sides, 0) & uint8(24);
                };
            if (bBodyQuery)
                Geometry.CertifySkinnedHeldPropBody = [BuildSkinFrames, SkinData, Padding]
                    (const FFlowArtsClearanceArm* Arms, const FQuat& Rotation,
                        const TArray<FFlowArtsClearanceCapsule>& Left,
                        const TArray<FFlowArtsClearanceCapsule>& Right, uint8 Sides) -> uint8
                {
                    TArray<FTransform> Frames;
                    if (!BuildSkinFrames(Arms, Rotation, true, Frames)) return 0;
                    return FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(*SkinData, Frames, Padding,
                        0, false, nullptr, Left, Right, 0, Sides) & uint8(96);
                };
            if (bSegmentQuery)
                Geometry.CertifySkinnedSegments = [BuildSkinFrames, SkinData, Padding]
                    (const FFlowArtsClearanceArm* Arms, const FQuat& Rotation,
                        const TArray<FFlowArtsClearanceCapsule>& Left,
                        const TArray<FFlowArtsClearanceCapsule>& Right, uint8 Mask) -> uint8
                {
                    TArray<FTransform> Frames;
                    if (!BuildSkinFrames(Arms, Rotation, true, Frames)) return 0;
                    return FFlowArtsSkinnedClearance::CertifyUncappedSegments(*SkinData, Frames, Padding,
                        Left, Right, Mask);
                };
            };
            // Include both named head and neck branches. Some rigs parent Head
            // beside Neck; the same posed-neck pivot moves either branch.
            const int32 PreparedNeck=Reference.FindBoneIndex(TEXT("Neck"));
            const int32 ProbeHead=Reference.FindBoneIndex(TEXT("Head"));
            const bool bPreparedNeckHierarchy=PreparedNeck!=INDEX_NONE && ProbeHead!=INDEX_NONE;
            TArray<int32> PreparedNeckMeshIndices;
            if (bPreparedNeckHierarchy)
                for (int32 MeshIndex=0;MeshIndex<SkinData->ReferenceBoneNames.Num();++MeshIndex)
                {
                    const int32 BoneIndex=Reference.FindBoneIndex(SkinData->ReferenceBoneNames[MeshIndex]);
                    if (BoneIndex==PreparedNeck || DescendsFrom(Reference,BoneIndex,PreparedNeck) ||
                        BoneIndex==ProbeHead || DescendsFrom(Reference,BoneIndex,ProbeHead))
                        PreparedNeckMeshIndices.Add(MeshIndex);
                }
        const auto MakeNeckRebind=[BindQueries,bPreparedNeckHierarchy,PreparedNeckMeshIndices]
            (const auto& SourceFrames) -> TFunction<bool(FFlowArtsArmClearanceInput&,const FTransform&)>
        {
            return [BindQueries,bPreparedNeckHierarchy,PreparedNeckMeshIndices,SourceFrames]
                (FFlowArtsArmClearanceInput& Geometry,const FTransform& NeckDelta) -> bool
            {
                if (!bPreparedNeckHierarchy || PreparedNeckMeshIndices.IsEmpty() ||
                    NeckDelta.ContainsNaN()) return false;
                const FVector SourceNeck=Geometry.Neck, Pivot=Geometry.TorsoPivot;
                const FQuat AddedPitch=Geometry.AddedTorsoPitch;
                const float Fraction=Geometry.NeckCounterFraction;
                const auto CounterFrames=[SourceFrames,PreparedNeckMeshIndices,SourceNeck,Pivot,AddedPitch,Fraction]
                    (const FFlowArtsClearanceArm* Arms,const FQuat& Rotation,bool bFull,
                        TArray<FTransform>& Frames) -> bool
                {
                    if (!SourceFrames(Arms,Rotation,bFull,Frames)) return false;
                    const FQuat Yaw=(Rotation*AddedPitch.Inverse()).GetNormalized();
                    const FQuat Unpitch=FQuat::Slerp(FQuat::Identity,AddedPitch.Inverse(),Fraction).GetNormalized();
                    const FQuat Counter=(Yaw*Unpitch*Yaw.Inverse()).GetNormalized();
                    const FTransform TorsoDelta(Rotation,Pivot-Rotation.RotateVector(Pivot));
                    const FVector PosedNeck=TorsoDelta.TransformPosition(SourceNeck);
                    const FTransform CandidateDelta(Counter,PosedNeck-Counter.RotateVector(PosedNeck));
                    for (const int32 Bone:PreparedNeckMeshIndices)
                        if (Frames.IsValidIndex(Bone)) Frames[Bone]=Frames[Bone]*CandidateDelta;
                    return true;
                };
                BindQueries(CounterFrames,Geometry);
                return true;
            };
        };
        Input.RebindPreparedNeck=MakeNeckRebind(BuildSkinFrames);
        if (CaptureOnly)
        {
            // Replace every query callback with a self-contained immutable capture.
            // Search witness callbacks below intentionally reference this live evaluation
            // and must never escape to a worker.
            auto& Geometry = CaptureOnly->Geometry;
            Geometry = Input;
            Geometry.PreparedSeed = nullptr;
            Geometry.EvaluateSkinnedContacts = {};
            Geometry.EvaluateSkinnedPropContacts = {};
            Geometry.SnapshotSkinnedContacts = {};
            Geometry.CertifySkinnedUpperTorso = {};
            Geometry.CertifySkinnedOppositeProps = {};
            Geometry.CertifySkinnedHeldPropBody = {};
            Geometry.CertifyForearmBody = {};
            Geometry.CertifyForearmHead = {};
            Geometry.CertifySkinnedSegments = {};
            BindQueries(BuildSkinFrames, Geometry);
            TArray<int32> SkeletonToCompact, SkeletonParents;
            SkeletonToCompact.Init(INDEX_NONE, Reference.GetNum());
            SkeletonParents.Init(INDEX_NONE, Reference.GetNum());
            for (int32 I=0; I<Reference.GetNum(); ++I)
            {
                const auto Compact=Bones.GetCompactPoseIndexFromSkeletonIndex(I);
                if (Has(Compact)) SkeletonToCompact[I]=Compact.GetInt();
                SkeletonParents[I]=Reference.GetParentIndex(I);
            }
            TArray<int32> MeshToCompact;
            MeshToCompact.Init(INDEX_NONE,SkinData->ReferenceBoneCount);
            for (const auto& Pair : Snapshot->FullMeshRemap)
                if (MeshToCompact.IsValidIndex(Pair.Key) && SkeletonToCompact.IsValidIndex(Pair.Value))
                    MeshToCompact[Pair.Key]=SkeletonToCompact[Pair.Value];
            CaptureOnly->EvaluateFootSurfaces = [SkinData, MeshToCompact=MoveTemp(MeshToCompact)]
                (const TArray<FTransform>& Components,TArray<FVector>& Left,TArray<FVector>& Right) -> bool
            {
                Left.Reset(); Right.Reset();
                TArray<FVector> Points[2];
                for (int32 Side=0; Side<2; ++Side)
                {
                    const FName Name=Side ? TEXT("RightFoot") : TEXT("LeftFoot");
                    const auto* Region=SkinData->LowerBodyRegions.FindByPredicate([&](const auto& R)
                    { return SkinData->ReferenceBoneNames.IsValidIndex(R.Bone) && SkinData->ReferenceBoneNames[R.Bone]==Name; });
                    if (!Region || Region->Vertices.IsEmpty()) return false;
                    Points[Side].Reserve(Region->Vertices.Num());
                    for (int32 V : Region->Vertices)
                    {
                        if (!SkinData->Vertices.IsValidIndex(V)) return false;
                        const auto& Vertex=SkinData->Vertices[V];
                        FVector Point=FVector::ZeroVector;
                        for (int32 I=Vertex.FirstInfluence; I<Vertex.FirstInfluence+Vertex.InfluenceCount; ++I)
                        {
                            if (!SkinData->Influences.IsValidIndex(I)) return false;
                            const auto& Influence=SkinData->Influences[I];
                            if (!MeshToCompact.IsValidIndex(Influence.Bone)) return false;
                            const int32 Compact=MeshToCompact[Influence.Bone];
                            if (!Components.IsValidIndex(Compact) || Components[Compact].ContainsNaN()) return false;
                            Point+=Components[Compact].TransformPosition(Influence.BoneLocalPosition)*Influence.Weight;
                        }
                        if (Point.ContainsNaN()) return false;
                        Points[Side].Add(Point);
                    }
                }
                Left=MoveTemp(Points[0]); Right=MoveTemp(Points[1]);
                return true;
            };
            CaptureOnly->RebuildSkin = [Snapshot, SkeletonToCompact=MoveTemp(SkeletonToCompact),
                SkeletonParents=MoveTemp(SkeletonParents), MakeSkinFrames, BindQueries, MakeNeckRebind, SkinData, Padding
#if WITH_DEV_AUTOMATION_TESTS
                , bPreparedNeckHierarchy, PreparedNeckMeshIndices
#endif
                ]
                (const TArray<FTransform>& Components, FFlowArtsArmClearanceInput& Geometry) -> bool
            {
                auto Posed=MakeShared<FSkinnedAuthoredPose, ESPMode::ThreadSafe>(*Snapshot);
                for (int32 I=0; I<SkeletonToCompact.Num(); ++I)
                {
                    const int32 Compact=SkeletonToCompact[I];
                    if (Compact==INDEX_NONE) continue;
                    if (!Components.IsValidIndex(Compact) || Components[Compact].ContainsNaN()) return false;
                    Posed->Components[I]=Components[Compact];
                }
                for (int32 I=0; I<SkeletonParents.Num(); ++I)
                {
                    if (SkeletonToCompact[I]==INDEX_NONE) continue;
                    const int32 Parent=SkeletonParents[I];
                    Posed->Locals[I]=Parent==INDEX_NONE ? Posed->Components[I] :
                        Posed->Components[I].GetRelativeTransform(Posed->Components[Parent]);
                }
                const auto PosedFrames=MakeSkinFrames(Posed,Geometry.TorsoPivot);
                BindQueries(PosedFrames,Geometry);
                Geometry.RebindPreparedNeck=MakeNeckRebind(PosedFrames);
#if WITH_DEV_AUTOMATION_TESTS
                Geometry.ProbeNeckCounterRotation=[PosedFrames,BindQueries,SkinData,Padding,bPreparedNeckHierarchy,PreparedNeckMeshIndices]
                    (FFlowArtsArmClearanceInput& Probe,double Fraction,FString& Error) -> bool
                {
                    if (!bPreparedNeckHierarchy || PreparedNeckMeshIndices.IsEmpty() ||
                        Probe.TorsoHulls.Num()<3 || Probe.BodyCapsules.Num()<3 ||
                        !FMath::IsFinite(Fraction) || Fraction<0. || Fraction>1.)
                    { Error=TEXT("unsupported neck hierarchy or probe geometry"); return false; }
                    const FQuat Rotation=Probe.SourceTorsoRotation.GetNormalized();
                    FVector Axis; double Angle=0.;
                    Rotation.ToAxisAndAngle(Axis,Angle);
                    if (!Axis.Normalize() || !FMath::IsNearlyEqual(FMath::RadiansToDegrees(Angle),15.,.25))
                    { Error=FString::Printf(TEXT("source torso pitch is %.6f degrees, expected 15"),FMath::RadiansToDegrees(Angle)); return false; }
                    const FTransform TorsoDelta(Rotation,Probe.TorsoPivot-Rotation.RotateVector(Probe.TorsoPivot));
                    const FVector Neck=TorsoDelta.TransformPosition(Probe.Neck);
                    const FQuat Counter(Axis,-Angle*Fraction);
                    const FTransform HeadDelta(Counter,Neck-Counter.RotateVector(Neck));
                    auto& HeadHull=Probe.TorsoHulls[2];
                    for (FVector& Vertex:HeadHull.Vertices) Vertex=HeadDelta.TransformPosition(Vertex);
                    for (FVector& Edge:HeadHull.EdgeDirections) Edge=Counter.RotateVector(Edge);
                    for (auto& Plane:HeadHull.Planes)
                    {
                        Plane.Normal=Counter.RotateVector(Plane.Normal);
                        Plane.OffsetCm+=FVector::DotProduct(Plane.Normal,HeadDelta.GetTranslation());
                    }
                    Probe.BodyCapsules[2].End=HeadDelta.TransformPosition(Probe.BodyCapsules[2].End);
                    Probe.Head=TorsoDelta.InverseTransformPosition(Probe.BodyCapsules[2].End);
                    const auto CounterFrames=[PosedFrames,PreparedNeckMeshIndices,HeadDelta,Rotation]
                        (const FFlowArtsClearanceArm* Arms,const FQuat& Torso,bool bFull,TArray<FTransform>& Frames) -> bool
                    {
                        if (!Torso.Equals(Rotation,1.e-8) || !PosedFrames(Arms,Torso,bFull,Frames)) return false;
                        for (const int32 Bone:PreparedNeckMeshIndices)
                            if (Frames.IsValidIndex(Bone)) Frames[Bone]=Frames[Bone]*HeadDelta;
                        return true;
                    };
                    BindQueries(CounterFrames,Probe);
                    TArray<FTransform> MeasuredFrames;
                    if(!CounterFrames(Probe.Arms,Rotation,true,MeasuredFrames))
                    { Error=TEXT("counterrotated head measurement frames unavailable"); return false; }
                    FFlowArtsHeadSurfaceDistance Surface[2];
                    FFlowArtsSkinnedClearance::MeasureForearmHeadSurface(*SkinData,MeasuredFrames,Padding,
                        ForearmCapsule(Probe.Arms[0]),ForearmCapsule(Probe.Arms[1]),Surface);
                    for(int32 Side=0;Side<2;++Side)
                    {
                        const auto& S=Surface[Side];
                        UE_LOG(LogFlowArtsClearance,Display,TEXT("FlowFestStanceProbeHeadSurface fraction=%.3f side=%d valid=%d axisDistance=%.9f radiusPadding=%.9f margin=%.9f triangle=%d vertices=%d/%d/%d points=%s;%s;%s influences=%s;%s;%s"),
                            Fraction,Side,int32(S.bValid),S.AxisDistanceCm,S.RadiusPlusPaddingCm,
                            S.SignedMarginCm,S.TriangleIndex,S.VertexIndices.X,S.VertexIndices.Y,S.VertexIndices.Z,
                            *S.PosedVertices[0].ToString(),*S.PosedVertices[1].ToString(),*S.PosedVertices[2].ToString(),
                            *S.CornerInfluences[0],*S.CornerInfluences[1],*S.CornerInfluences[2]);
                    }
                    FFlowArtsHeadSkinDistance SkinSurface[2];
                    FFlowArtsSkinnedClearance::MeasureDistalHeadSkin(*SkinData,MeasuredFrames,Padding,SkinSurface);
                    for(int32 Side=0;Side<2;++Side)
                    {
                        const auto& S=SkinSurface[Side];
                        const FString NearWitness=S.bDistalSurfaceNear
                            ? FString::Printf(TEXT("%.9f distal=%d head=%d"),S.WitnessSurfaceDistanceCm,
                                S.DistalTriangleIndex,S.HeadTriangleIndex)
                            : TEXT("unavailable");
                        UE_LOG(LogFlowArtsClearance,Display,TEXT("FlowFestStanceProbeHeadSkin fraction=%.3f side=%d valid=%d wholeArmProjectionSeparated=%d bestProjectionGapCm=%.9f distalSurfaceNear=%d nearWitness=%s"),
                            Fraction,Side,int32(S.bValid),int32(S.bWholeArmProjectionSeparated),
                            S.BestProjectionGapCm,int32(S.bDistalSurfaceNear),*NearWitness);
                    }
                    FFlowArtsHeadSkinCertificateDiagnostics HeadProof;
                    const uint8 HeadProofMask=FFlowArtsSkinnedClearance::CertifyForearmHeadSkinClear(
                        *SkinData,MeasuredFrames,Padding,3,&HeadProof);
                    for(int32 Side=0;Side<2;++Side)
                        UE_LOG(LogFlowArtsClearance,Display,TEXT("FlowFestStanceProbeHeadProof fraction=%.3f side=%d clear=%d reason=%u armOriginal=%d armCap=%d headOriginal=%d headCap=%d armContact=%d headContact=%d armContactCap=%d headContactCap=%d"),
                            Fraction,Side,int32((HeadProofMask&(1<<Side))!=0),uint32(HeadProof.Reason[Side]),
                            HeadProof.ArmOriginalTriangles[Side],HeadProof.ArmCapTriangles[Side],
                            HeadProof.HeadOriginalTriangles,HeadProof.HeadCapTriangles,
                            HeadProof.ArmContactTriangle[Side],HeadProof.HeadContactTriangle[Side],
                            int32(HeadProof.bArmContactIsCap[Side]),int32(HeadProof.bHeadContactIsCap[Side]));
                    UE_LOG(LogFlowArtsClearance,Display,TEXT("FlowFestStanceProbeNeck fraction=%.3f neck=%s counter=%s translation=%s bones=%d"),
                        Fraction,*Neck.ToString(),*Counter.ToString(),*HeadDelta.GetTranslation().ToString(),PreparedNeckMeshIndices.Num());
                    return true;
                };
#endif
                return true;
            };
            Geometry.bSourceFidelityOnly = true;
            CaptureOnly->ComponentToWorldScale = ComponentToWorldScale;
            CaptureOnly->bValid = Geometry.bCanCertifySkinnedArmPair && Geometry.bCanCertifySkinnedUpperTorso &&
                bool(Geometry.CertifySkinnedUpperTorso) && bool(Geometry.CertifySkinnedSegments);
            return Empty;
        }
        if (PreparedSeed && PreparedSeed->bValid && PreparedSeed->bAbsoluteControls)
        {
            auto CurrentSeed = *PreparedSeed;
            FFlowArtsArmClearanceInput PreparedGeometry;
            if (BuildPreparedGeometry(Input, CurrentSeed, PreparedGeometry))
            {
                Input = MoveTemp(PreparedGeometry);
                BaselineResult = Solve(Input, BaselineHistory);
                BaselineResult.PreparedSeedQueryCount = BaselineResult.SkinnedQueryCount;
                BaselineResult.bApplied = true;
                for (int32 Side=0;Side<2;++Side)
                {
                    AppliedHandTranslation[Side] = CurrentSeed.HandTranslationCm[Side];
                    BaselineResult.ClavicleProtractionDeg[Side] = CurrentSeed.ClavicleProtractionDeg[Side];
                }
                bBaselineSolved = true;
            }
        }
        bool bDiagnosticSourceOnly = false;
#if WITH_DEV_AUTOMATION_TESTS
        bDiagnosticSourceOnly = FParse::Param(FCommandLine::Get(), TEXT("FlowArtsSourceCertificateOnly"));
#endif
        const bool bHandResponseAllowed = bPreserveWrist && bAllowSharedPerformanceTranslation;
        if (Input.bMeasuredSurface && !bBaselineSolved)
        {
            Input.bSourceFidelityOnly = true;
            const FFlowArtsClearanceArm SourceArms[2]={Input.Arms[0],Input.Arms[1]};
            double ElbowAngle[2] = {0., 0.};
            if (!bDiagnosticSourceOnly)
                for (int32 Side=0; Side<2; ++Side) ElbowAngle[Side]=History.ContactElbowAngleRadians[Side];
            const bool bTorsoResponseAllowed = bHandResponseAllowed && Input.bAllowTorsoResponse;
            FVector TorsoVector = bTorsoResponseAllowed && !bDiagnosticSourceOnly ?
                History.ContactTorsoRotationVector : FVector::ZeroVector;
            const FQuat SpineFrame = Has(Spine) ? Pose.GetComponentSpaceTransform(Spine).GetRotation() : FQuat::Identity;
            const auto TorsoRotation = [&](const FVector& Vector) -> FQuat
            {
                const double Angle=Vector.Size();
                return Angle<1.e-10 ? FQuat::Identity : FQuat(SpineFrame.RotateVector(Vector/Angle),Angle);
            };
            const auto SourceHulls=Input.TorsoHulls;
            const auto SourceCapsules=Input.BodyCapsules;
            FRefinementGeometryScratch BodyScratch(Input);
            const auto SetTorsoGeometry = [&]()
            {
                Input.SourceTorsoRotation=TorsoRotation(TorsoVector);
                BodyScratch.Update(Input,SourceHulls,SourceCapsules,FQuat::Identity,Input.SourceTorsoRotation);
                Input.TorsoHulls=BodyScratch.Geometry.TorsoHulls;
                Input.BodyCapsules=BodyScratch.Geometry.BodyCapsules;
            };
            const auto BuildContactTrial = [&](const FVector* Offsets, FFlowArtsClearanceArm* Arms,
                TArray<FFlowArtsClearanceCapsule>* Props, const double* Angles = nullptr,
                const FVector* RotationVector = nullptr, double* ReachPenalty = nullptr) -> bool
            {
                const FQuat Rotation=TorsoRotation(RotationVector ? *RotationVector : TorsoVector);
                const FTransform Delta(Rotation,Input.TorsoPivot-Rotation.RotateVector(Input.TorsoPivot));
                if (ReachPenalty) *ReachPenalty=0.;
                for(int32 Side=0;Side<2;++Side)
                {
                    Arms[Side]=SourceArms[Side];
                    Props[Side]=SourceHeldProps[Side];
                    const double Angle = Angles ? Angles[Side] : ElbowAngle[Side];
                    if(Offsets[Side].IsNearlyZero() && FMath::Abs(Angle)<1.e-10 && Rotation.Equals(FQuat::Identity,1.e-10))continue;
                    Arms[Side].Clavicle=Arms[Side].Clavicle*Delta;
                    Arms[Side].Upper=Arms[Side].Upper*Delta;
                    Arms[Side].Elbow=Arms[Side].Elbow*Delta;
                    Arms[Side].Wrist=Arms[Side].Wrist*Delta;
                    FTransform Target=SourceArms[Side].Wrist;
                    Target.AddToTranslation(Offsets[Side]);
                    const FVector Shoulder = Arms[Side].Upper.GetLocation();
                    if (ReachPenalty)
                    {
                        // Derivatives remain defined near full extension. Only this
                        // objective evaluation relaxes reach; final poses use hard IK.
                        const double Upper=FVector::Distance(Arms[Side].Upper.GetLocation(),Arms[Side].Elbow.GetLocation());
                        const double Lower=FVector::Distance(Arms[Side].Elbow.GetLocation(),Arms[Side].Wrist.GetLocation());
                        const FVector Reach=Target.GetLocation()-Shoulder;
                        const double Length=Reach.Size();
                        const double Feasible=FMath::Clamp(Length,FMath::Abs(Upper-Lower)+.0001,Upper+Lower-.0001);
                        *ReachPenalty+=100.*FMath::Square(Length-Feasible);
                        if (Length>SMALL_NUMBER) Target.SetLocation(Shoulder+Reach*(Feasible/Length));
                    }
                    TArray<FArmCandidate> Candidate;
                    const FVector Axis = (Target.GetLocation()-Shoulder).GetSafeNormal();
                    const FVector Pole = Shoulder + FQuat(Axis,Angle).RotateVector(
                        Arms[Side].Elbow.GetLocation()-Shoulder);
                    AddPole(Candidate,Arms[Side],Pole,nullptr,Target);
                    if(Candidate.IsEmpty())return false;
                    Arms[Side]=Candidate[0].Arm;
                    const FVector Shift=Target.GetLocation()-SourceArms[Side].Wrist.GetLocation();
                    for(auto& Prop:Props[Side]) { Prop.Start+=Shift; Prop.End+=Shift; }
                }
                return true;
            };
            // Carry only bounded coordinates. They confer no clearance and are
            // rebuilt against this frame's authored lengths and visible props.
            FVector Offset[2]={History.ContactHandTranslationCm[0],History.ContactHandTranslationCm[1]};
            if (bDiagnosticSourceOnly || !bHandResponseAllowed) Offset[0] = Offset[1] = FVector::ZeroVector;
            FFlowArtsClearanceArm TrialArms[2];
            TArray<FFlowArtsClearanceCapsule> TrialProps[2];
            if(!BuildContactTrial(Offset,TrialArms,TrialProps))
            {
                // The feasible reach domain can shrink as the source extends.
                // A bounded line projection preserves the authored zero target.
                double Low=0.,High=1.;
                for(int32 I=0;I<12;++I)
                {
                    const double Mid=(Low+High)*.5;
                    const FVector Scaled[2]={Offset[0]*Mid,Offset[1]*Mid};
                    const FVector ScaledTorso=TorsoVector*Mid;
                    const double ScaledAngles[2]={ElbowAngle[0]*Mid,ElbowAngle[1]*Mid};
                    if(BuildContactTrial(Scaled,TrialArms,TrialProps,ScaledAngles,&ScaledTorso))Low=Mid;else High=Mid;
                }
                Offset[0]*=Low;Offset[1]*=Low;TorsoVector*=Low;
                ElbowAngle[0]*=Low;ElbowAngle[1]*=Low;
                BuildContactTrial(Offset,TrialArms,TrialProps);
            }
            for(int32 Side=0;Side<2;++Side)
            { Input.Arms[Side]=TrialArms[Side];Input.HeldPropCapsules[Side]=TrialProps[Side]; }
            SetTorsoGeometry();
            UE_LOG(LogFlowArtsClearance, VeryVerbose, TEXT("TemporalContact begin carried"));
            BaselineResult = Solve(Input, BaselineHistory);
            const float DeltaSeconds=Output.AnimInstanceProxy ? Output.AnimInstanceProxy->GetDeltaSeconds() : 0.f;
            if(!bDiagnosticSourceOnly && bHandResponseAllowed && DeltaSeconds>0.f && Input.EvaluateSkinnedPropContacts)
            {
                // Follow the same immutable exact contact set for every derivative.
                // Body, arm-pair and prop contacts all influence the bounded response.
                PropContactWitnesses->RemoveAll([](const FFlowArtsPropContactWitness& W){return W.SurfaceKind!=0;});
                FVector Gradient[2]={FVector::ZeroVector,FVector::ZeroVector};
                double NextAngle[2]={ElbowAngle[0],ElbowAngle[1]};
                FVector NextTorso=TorsoVector;
                if(!PropContactWitnesses->IsEmpty() || Input.EvaluateSkinnedContacts)
                {
                    const auto Objective = [&](const FVector* CandidateOffsets, const double* Angles=nullptr,
                        const FVector* CandidateTorso=nullptr) -> double
                    {
                        FFlowArtsClearanceArm Arms[2];TArray<FFlowArtsClearanceCapsule> Props[2];
                        double ReachPenalty=0.;
                        if(!BuildContactTrial(CandidateOffsets,Arms,Props,Angles,CandidateTorso,&ReachPenalty))return TNumericLimits<double>::Max();
                        const FQuat Rotation=TorsoRotation(CandidateTorso ? *CandidateTorso : TorsoVector);
                        double Cost=ReachPenalty+Input.EvaluateSkinnedPropContacts(Arms,Rotation,Props[0],Props[1]);
                        if (Input.EvaluateSkinnedContacts) Cost+=Input.EvaluateSkinnedContacts(Arms,Rotation);
                        return Cost;
                    };
                    constexpr double Epsilon=.05;
                    for(int32 Side=0;Side<2;++Side)
                        for(int32 Axis=0;Axis<3;++Axis)
                        {
                            FVector Plus[2]={Offset[0],Offset[1]},Minus[2]={Offset[0],Offset[1]};
                            Plus[Side][Axis]+=Epsilon;Minus[Side][Axis]-=Epsilon;
                            const double A=Objective(Plus),B=Objective(Minus);
                            if(A<TNumericLimits<double>::Max() && B<TNumericLimits<double>::Max())
                                Gradient[Side][Axis]=(A-B)/(2.*Epsilon);
                        }
                    constexpr double AngleEpsilon=PI/360.;
                    for (int32 Side=0; Side<2; ++Side)
                    {
                        double Plus[2]={ElbowAngle[0],ElbowAngle[1]},Minus[2]={ElbowAngle[0],ElbowAngle[1]};
                        Plus[Side]+=AngleEpsilon;Minus[Side]-=AngleEpsilon;
                        const double A=Objective(Offset,Plus),B=Objective(Offset,Minus);
                        const double G=(A<TNumericLimits<double>::Max() && B<TNumericLimits<double>::Max()) ?
                            (A-B)/(2.*AngleEpsilon) : 0.;
                        NextAngle[Side]=StepContactElbowCorrection(ElbowAngle[Side],G,DeltaSeconds);
                    }
                    if (bTorsoResponseAllowed)
                    {
                        FVector TorsoGradient=FVector::ZeroVector;
                        for (int32 Axis=0; Axis<3; ++Axis)
                        {
                            FVector Plus=TorsoVector,Minus=TorsoVector;
                            Plus[Axis]+=AngleEpsilon;Minus[Axis]-=AngleEpsilon;
                            const double A=Objective(Offset,nullptr,&Plus),B=Objective(Offset,nullptr,&Minus);
                            if (A<TNumericLimits<double>::Max() && B<TNumericLimits<double>::Max())
                                TorsoGradient[Axis]=(A-B)/(2.*AngleEpsilon);
                        }
                        NextTorso=StepContactTorsoCorrection(TorsoVector,TorsoGradient,DeltaSeconds);
                    }
                }
                FVector Next[2];
                for(int32 Side=0;Side<2;++Side)
                    Next[Side]=StepContactHandCorrection(Offset[Side],Gradient[Side],DeltaSeconds,ComponentToWorldScale,8.);
                // No candidate ranking or branch swap. Shorten the one proposed
                // temporal step only when the hard two-bone reach rejects it.
                if(!BuildContactTrial(Next,TrialArms,TrialProps,NextAngle,&NextTorso))
                {
                    double Low=0.,High=1.;
                    for(int32 I=0;I<12;++I)
                    {
                        const double Mid=(Low+High)*.5;
                        const FVector Scaled[2]={FMath::Lerp(Offset[0],Next[0],Mid),FMath::Lerp(Offset[1],Next[1],Mid)};
                        const FVector ScaledTorso=FMath::Lerp(TorsoVector,NextTorso,Mid);
                        const double ScaledAngles[2]={FMath::Lerp(ElbowAngle[0],NextAngle[0],Mid),FMath::Lerp(ElbowAngle[1],NextAngle[1],Mid)};
                        if(BuildContactTrial(Scaled,TrialArms,TrialProps,ScaledAngles,&ScaledTorso))Low=Mid;else High=Mid;
                    }
                    for(int32 Side=0;Side<2;++Side)
                    {
                        Next[Side]=FMath::Lerp(Offset[Side],Next[Side],Low);
                        NextAngle[Side]=FMath::Lerp(ElbowAngle[Side],NextAngle[Side],Low);
                    }
                    NextTorso=FMath::Lerp(TorsoVector,NextTorso,Low);
                    BuildContactTrial(Next,TrialArms,TrialProps,NextAngle,&NextTorso);
                }
                if(!Next[0].Equals(Offset[0],1.e-6) || !Next[1].Equals(Offset[1],1.e-6) ||
                    FMath::Abs(NextAngle[0]-ElbowAngle[0])>1.e-8 || FMath::Abs(NextAngle[1]-ElbowAngle[1])>1.e-8 ||
                    !NextTorso.Equals(TorsoVector,1.e-8))
                {
                    HandAvoidanceExactQueries+=BaselineResult.SkinnedQueryCount;
                    for(int32 Side=0;Side<2;++Side)
                    {
                        Input.Arms[Side]=TrialArms[Side];Input.HeldPropCapsules[Side]=TrialProps[Side];
                        Offset[Side]=Next[Side];ElbowAngle[Side]=NextAngle[Side];
                    }
                    TorsoVector=NextTorso;
                    SetTorsoGeometry();
                    UE_LOG(LogFlowArtsClearance, VeryVerbose, TEXT("TemporalContact begin final"));
                    BaselineResult=Solve(Input,BaselineHistory);
                }
            }
            if (!bDiagnosticSourceOnly && !bHandResponseAllowed && DeltaSeconds>0.f &&
                Input.EvaluateSkinnedContacts)
            {
                // Activities keep their authored grips. A small swivel around the
                // shoulder-to-wrist axis preserves both limb lengths and avoids
                // the old solver's large elbow branch changes.
                const auto Objective = [&](const double* Angles) -> double
                {
                    FFlowArtsClearanceArm Arms[2]; TArray<FFlowArtsClearanceCapsule> Props[2];
                    if (!BuildContactTrial(Offset,Arms,Props,Angles)) return TNumericLimits<double>::Max();
                    double Cost=Input.EvaluateSkinnedContacts(Arms,FQuat::Identity);
                    if (Input.EvaluateSkinnedPropContacts)
                        Cost+=Input.EvaluateSkinnedPropContacts(Arms,FQuat::Identity,Props[0],Props[1]);
                    return Cost;
                };
                constexpr double Epsilon=PI/360.;
                double Next[2]={ElbowAngle[0],ElbowAngle[1]};
                for (int32 Side=0; Side<2; ++Side)
                {
                    double Plus[2]={ElbowAngle[0],ElbowAngle[1]}, Minus[2]={ElbowAngle[0],ElbowAngle[1]};
                    Plus[Side]+=Epsilon; Minus[Side]-=Epsilon;
                    const double A=Objective(Plus), B=Objective(Minus);
                    const double Gradient=(A<TNumericLimits<double>::Max() && B<TNumericLimits<double>::Max()) ?
                        (A-B)/(2.*Epsilon) : 0.;
                    Next[Side]=StepContactElbowCorrection(ElbowAngle[Side],Gradient,DeltaSeconds);
                }
                if ((FMath::Abs(Next[0]-ElbowAngle[0])>1.e-8 || FMath::Abs(Next[1]-ElbowAngle[1])>1.e-8) &&
                    BuildContactTrial(Offset,TrialArms,TrialProps,Next))
                {
                    HandAvoidanceExactQueries+=BaselineResult.SkinnedQueryCount;
                    for (int32 Side=0; Side<2; ++Side)
                    { Input.Arms[Side]=TrialArms[Side]; ElbowAngle[Side]=Next[Side]; }
                    UE_LOG(LogFlowArtsClearance, VeryVerbose, TEXT("TemporalContact begin final"));
                    BaselineResult=Solve(Input,BaselineHistory);
                }
            }
            for(int32 Side=0;Side<2;++Side)
            {
                AppliedHandTranslation[Side]=Offset[Side];
                BaselineHistory.ContactHandTranslationCm[Side]=Offset[Side];
                BaselineHistory.ContactElbowAngleRadians[Side]=ElbowAngle[Side];
                bTemporalElbowResponse |= FMath::Abs(ElbowAngle[Side])>1.e-10;
            }
            BaselineHistory.ContactTorsoRotationVector=TorsoVector;
            UE_LOG(LogFlowArtsClearance, VeryVerbose, TEXT("TemporalContact end"));
            bTemporalHandResponse=bHandResponseAllowed;
            bBaselineSolved = true;
        }
    }

    if (CaptureOnly) return Empty;
    if (!bBaselineSolved)
    {
        // Missing measured geometry cannot justify a large pose correction.
        // Keep the authored pose and report its conservative residual instead
        // of falling back to the experimental whole-pose search.
        Input.bSourceFidelityOnly = true;
        BaselineResult = Solve(Input, BaselineHistory);
    }
    FFlowArtsArmClearanceResult Result = MoveTemp(BaselineResult);
    History = MoveTemp(BaselineHistory);
    if (Result.bFeasible && AppliedHandTranslation[0].IsNearlyZero() &&
        AppliedHandTranslation[1].IsNearlyZero())
    {
        History.PreviousHandTranslationCm[0] = FVector::ZeroVector;
        History.PreviousHandTranslationCm[1] = FVector::ZeroVector;
    }
    Result.HandAvoidanceExactQueries = HandAvoidanceExactQueries;
    // Prepared controls allow common normal [-16,0] plus relative [0,8] cm.
    // Keep this distinct from the ordinary live response bound.
    Result.HandCorrectionLimitCm = Result.PreparedSeedQueryCount > 0 ?
        float(PreparedCommonDepthLimitCm+PreparedDifferentialDepthLimitCm) : (bTemporalHandResponse ? 8.f : 0.f);
    Result.bApplied |= bTemporalElbowResponse;
    for (int32 Side=0;Side<2;++Side)
    {
        Result.OriginalWrists[Side]=SourceWrists[Side];
        Result.OriginalHeldPropCapsules[Side]=SourceHeldProps[Side];
        Result.AppliedHandTranslationCm[Side]=AppliedHandTranslation[Side];
        Result.MaxElbowDisplacementCm=FMath::Max(Result.MaxElbowDisplacementCm,
            float(FVector::Dist(SourceElbows[Side],Result.Arms[Side].Elbow.GetLocation())));
        Result.bApplied |= !AppliedHandTranslation[Side].IsNearlyZero();
    }
    Result.bSkinnedCacheAvailable = MeasuredEnvelope && MeasuredEnvelope->SkinnedClearance.IsValid();
    Result.SolveMicroseconds = (FPlatformTime::Seconds() - StartedAt) * 1000000.0;
    if (!Result.bApplied) return Result;

    // Conversion below changes parents. Save every hand descendant's local transform
    // so grip fingers and any authored attachments retain their exact local pose.
    struct FDescendantLocal { FCompactPoseBoneIndex Index; FTransform Local; };
    TArray<FDescendantLocal> HandDescendants;
    const int32 WristSkeleton[2] = {Reference.FindBoneIndex(TEXT("LeftHand")), Reference.FindBoneIndex(TEXT("RightHand"))};
    for (int32 SkeletonIndex = 0; SkeletonIndex < Reference.GetNum(); ++SkeletonIndex)
    {
        if (!DescendsFrom(Reference, SkeletonIndex, WristSkeleton[0]) &&
            !DescendsFrom(Reference, SkeletonIndex, WristSkeleton[1])) continue;
        const FCompactPoseBoneIndex Index = Bones.GetCompactPoseIndexFromSkeletonIndex(SkeletonIndex);
        if (Has(Index)) HandDescendants.Add({Index, Output.Pose[Index]});
    }
    if (!Result.TorsoRotation.Equals(FQuat::Identity, 0.00001f))
    {
        // Read before writing: cached component transforms must all receive the
        // same rigid delta. Descendants outside Spine (including both legs) stay
        // authored. The solved arm transforms below restore both hard grips.
        TArray<FDescendantLocal> TorsoTransforms;
        const FTransform Delta(Result.TorsoRotation,
            Input.TorsoPivot - Result.TorsoRotation.RotateVector(Input.TorsoPivot));
        for (int32 SkeletonIndex = 0; SkeletonIndex < Reference.GetNum(); ++SkeletonIndex)
        {
            if (SkeletonIndex != SpineSkeleton && !DescendsFrom(Reference, SkeletonIndex, SpineSkeleton)) continue;
            const FCompactPoseBoneIndex Index = Bones.GetCompactPoseIndexFromSkeletonIndex(SkeletonIndex);
            if (Has(Index)) TorsoTransforms.Add({Index, Pose.GetComponentSpaceTransform(Index) * Delta});
        }
        for (const FDescendantLocal& Transform : TorsoTransforms)
            Pose.SetComponentSpaceTransform(Transform.Index, Transform.Local);
    }
    if (Result.NeckCounterFraction>0.f)
    {
        const int32 NeckSkeleton=Reference.FindBoneIndex(TEXT("Neck"));
        const int32 HeadSkeleton=Reference.FindBoneIndex(TEXT("Head"));
        if (NeckSkeleton==INDEX_NONE || HeadSkeleton==INDEX_NONE)
        {
            Result.bFeasible=false;
            return Result;
        }
        const FQuat Yaw=(Result.TorsoRotation*Result.AddedTorsoPitch.Inverse()).GetNormalized();
        const FQuat Unpitch=FQuat::Slerp(FQuat::Identity,Result.AddedTorsoPitch.Inverse(),
            Result.NeckCounterFraction).GetNormalized();
        const FQuat Counter=(Yaw*Unpitch*Yaw.Inverse()).GetNormalized();
        const FVector PosedNeck=FTransform(Result.TorsoRotation,
            Input.TorsoPivot-Result.TorsoRotation.RotateVector(Input.TorsoPivot)).TransformPosition(Input.Neck);
        const FTransform HeadDelta(Counter,PosedNeck-Counter.RotateVector(PosedNeck));
        TArray<FDescendantLocal> NeckTransforms;
        for (int32 SkeletonIndex=0;SkeletonIndex<Reference.GetNum();++SkeletonIndex)
        {
            if (SkeletonIndex!=NeckSkeleton && !DescendsFrom(Reference,SkeletonIndex,NeckSkeleton) &&
                SkeletonIndex!=HeadSkeleton && !DescendsFrom(Reference,SkeletonIndex,HeadSkeleton)) continue;
            const FCompactPoseBoneIndex Index=Bones.GetCompactPoseIndexFromSkeletonIndex(SkeletonIndex);
            if (Has(Index)) NeckTransforms.Add({Index,Pose.GetComponentSpaceTransform(Index)*HeadDelta});
        }
        for (const FDescendantLocal& Transform:NeckTransforms)
            Pose.SetComponentSpaceTransform(Transform.Index,Transform.Local);
    }
    for (int32 Side = 0; Side < 2; ++Side)
    {
        if (Result.Arms[Side].bHasClavicle && Has(Clavicle[Side]))
            Pose.SetComponentSpaceTransform(Clavicle[Side], Result.Arms[Side].Clavicle);
        Pose.SetComponentSpaceTransform(Upper[Side], Result.Arms[Side].Upper);
        Pose.SetComponentSpaceTransform(Elbow[Side], Result.Arms[Side].Elbow);
        Pose.SetComponentSpaceTransform(Wrist[Side], Result.Arms[Side].Wrist);
    }
    FCSPose<FCompactPose>::ConvertComponentPosesToLocalPosesSafe(Pose, Output.Pose);
    for (const FDescendantLocal& Descendant : HandDescendants)
        Output.Pose[Descendant.Index] = Descendant.Local;
    Result.SolveMicroseconds = (FPlatformTime::Seconds() - StartedAt) * 1000000.0;
    return Result;
}
