#include "FlowArtsConservativeCover.h"
#include <limits>

namespace
{
struct FInterval
{
    double Low = std::numeric_limits<double>::max();
    double High = -std::numeric_limits<double>::max();
    double Scale = 0.;

    bool Add(const FVector& Point, const FVector& UnitAxis)
    {
        if (!FMath::IsFinite(Point.X) || !FMath::IsFinite(Point.Y) ||
            !FMath::IsFinite(Point.Z)) return false;
        const double Projection = FVector::DotProduct(Point, UnitAxis);
        if (!FMath::IsFinite(Projection)) return false;
        Low = FMath::Min(Low, Projection);
        High = FMath::Max(High, Projection);
        // Include cancellation in the dot product in the roundoff allowance.
        const double Magnitude = FMath::Abs(Point.X * UnitAxis.X) +
            FMath::Abs(Point.Y * UnitAxis.Y) + FMath::Abs(Point.Z * UnitAxis.Z);
        if (!FMath::IsFinite(Magnitude)) return false;
        Scale = FMath::Max(Scale, Magnitude);
        return true;
    }
};

bool AddIndexed(FInterval& Interval, const TArray<FVector>& Points,
    const TArray<int32>& Indices, const FVector& Axis)
{
    if (Indices.IsEmpty()) return false;
    for (const int32 Index : Indices)
    {
        if (!Points.IsValidIndex(Index) || !Interval.Add(Points[Index], Axis)) return false;
    }
    return true;
}

bool AddDirect(FInterval& Interval, TConstArrayView<FVector> Points, const FVector& Axis)
{
    if (Points.IsEmpty()) return false;
    for (const FVector& Point : Points) if (!Interval.Add(Point, Axis)) return false;
    return true;
}

bool IsSeparated(const FInterval& A, const FInterval& B, double Padding)
{
    const double Roundoff = 64. * std::numeric_limits<double>::epsilon() *
        (A.Scale + B.Scale + FMath::Abs(Padding) + 1.);
    if (!FMath::IsFinite(Roundoff)) return false;
    return A.High < B.Low - Padding - Roundoff ||
        B.High < A.Low - Padding - Roundoff;
}

bool ValidAxes(const TArray<FVector>& Axes)
{
    if (Axes.IsEmpty()) return false;
    for (const FVector& Axis : Axes)
    {
        if (!FMath::IsFinite(Axis.X) || !FMath::IsFinite(Axis.Y) ||
            !FMath::IsFinite(Axis.Z) || !FMath::IsFinite(Axis.SizeSquared()) ||
            Axis.SizeSquared() <= UE_DOUBLE_SMALL_NUMBER) return false;
    }
    return true;
}

int32 Root(TArray<int32>& Parent, int32 Index)
{
    while (Parent[Index] != Index)
    {
        Parent[Index] = Parent[Parent[Index]];
        Index = Parent[Index];
    }
    return Index;
}
}

bool FlowArtsConservativeCover::PartitionOriginalFaces(const TArray<FIntVector>& Faces,
    const TArray<int32>& InfluenceSafeWeld, int32 VertexCount,
    TArray<TArray<int32>>& OutComponents)
{
    OutComponents.Reset();
    if (Faces.IsEmpty() || VertexCount <= 0 || InfluenceSafeWeld.Num() != VertexCount) return false;
    TArray<int32> Parent;
    Parent.SetNumUninitialized(VertexCount);
    TMap<int32, int32> WeldRepresentatives;
    for (int32 I = 0; I < VertexCount; ++I)
    {
        Parent[I] = I;
        if (InfluenceSafeWeld[I] < 0) return false;
        if (const int32* Previous = WeldRepresentatives.Find(InfluenceSafeWeld[I]))
            Parent[I] = *Previous;
        else WeldRepresentatives.Add(InfluenceSafeWeld[I], I);
    }
    TArray<bool> Used;
    Used.Init(false, VertexCount);
    for (const FIntVector& Face : Faces)
    {
        const int32 Indices[3] = {Face.X, Face.Y, Face.Z};
        for (int32 I = 0; I < 3; ++I)
        {
            if (Indices[I] < 0 || Indices[I] >= VertexCount)
            {
                OutComponents.Reset();
                return false;
            }
            Used[Indices[I]] = true;
            Parent[Root(Parent, Indices[I])] = Root(Parent, Indices[0]);
        }
    }
    TMap<int32, int32> ComponentsByRoot;
    for (int32 I = 0; I < VertexCount; ++I)
    {
        if (!Used[I]) continue;
        const int32 Representative = Root(Parent, I);
        int32* ComponentIndex = ComponentsByRoot.Find(Representative);
        if (!ComponentIndex)
        {
            const int32 NewIndex = OutComponents.AddDefaulted();
            ComponentsByRoot.Add(Representative, NewIndex);
            ComponentIndex = ComponentsByRoot.Find(Representative);
        }
        OutComponents[*ComponentIndex].Add(I);
    }
    return !OutComponents.IsEmpty();
}

bool FlowArtsConservativeCover::SeparateVertices(const TArray<FVector>& PosedPoints,
    const TArray<int32>& ComponentA, const TArray<int32>& ComponentB,
    const TArray<FVector>& Axes, double PaddingCm)
{
    if (!FMath::IsFinite(PaddingCm) || PaddingCm < 0. || !ValidAxes(Axes)) return false;
    for (const FVector& Axis : Axes)
    {
        const FVector UnitAxis = Axis / FMath::Sqrt(Axis.SizeSquared());
        FInterval A, B;
        if (!AddIndexed(A, PosedPoints, ComponentA, UnitAxis) ||
            !AddIndexed(B, PosedPoints, ComponentB, UnitAxis)) return false;
        if (IsSeparated(A, B, PaddingCm)) return true;
    }
    return false;
}

bool FlowArtsConservativeCover::SeparateCapsule(const TArray<FVector>& PosedPoints,
    const TArray<int32>& Component, const FVector& Start, const FVector& End,
    double RadiusCm, const TArray<FVector>& Axes, double PaddingCm)
{
    if (!FMath::IsFinite(Start.X) || !FMath::IsFinite(Start.Y) ||
        !FMath::IsFinite(Start.Z) || !FMath::IsFinite(End.X) ||
        !FMath::IsFinite(End.Y) || !FMath::IsFinite(End.Z) ||
        !FMath::IsFinite(RadiusCm) ||
        RadiusCm < 0. || !FMath::IsFinite(PaddingCm) || PaddingCm < 0. ||
        !ValidAxes(Axes)) return false;
    for (const FVector& Axis : Axes)
    {
        const FVector UnitAxis = Axis / FMath::Sqrt(Axis.SizeSquared());
        FInterval A, B;
        if (!AddIndexed(A, PosedPoints, Component, UnitAxis) ||
            !B.Add(Start, UnitAxis) || !B.Add(End, UnitAxis)) return false;
        B.Low -= RadiusCm;
        B.High += RadiusCm;
        B.Scale += RadiusCm;
        if (!FMath::IsFinite(B.Low) || !FMath::IsFinite(B.High) ||
            !FMath::IsFinite(B.Scale)) return false;
        if (IsSeparated(A, B, PaddingCm)) return true;
    }
    return false;
}

bool FlowArtsConservativeCover::SeparatePolygon(const TArray<FVector>& PosedPoints,
    const TArray<int32>& BodyComponent, TConstArrayView<FVector> ClippedPosedPolygon,
    const TArray<FVector>& Axes, double PaddingCm)
{
    if (!FMath::IsFinite(PaddingCm) || PaddingCm < 0. || !ValidAxes(Axes)) return false;
    for (const FVector& Axis : Axes)
    {
        const FVector UnitAxis = Axis / FMath::Sqrt(Axis.SizeSquared());
        FInterval A, B;
        if (!AddIndexed(A, PosedPoints, BodyComponent, UnitAxis) ||
            !AddDirect(B, ClippedPosedPolygon, UnitAxis)) return false;
        if (IsSeparated(A, B, PaddingCm)) return true;
    }
    return false;
}
