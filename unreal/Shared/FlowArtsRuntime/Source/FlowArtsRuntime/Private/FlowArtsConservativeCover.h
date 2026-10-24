#pragma once

#include "CoreMinimal.h"

/** Conservative certificates for open original render surfaces. Callers supply only original faces. */
namespace FlowArtsConservativeCover
{
    // InfluenceSafeWeld maps every vertex to its influence-safe weld identifier.
    // Every input face must be present and valid; caps must never be passed as faces.
    bool PartitionOriginalFaces(const TArray<FIntVector>& Faces,
        const TArray<int32>& InfluenceSafeWeld, int32 VertexCount,
        TArray<TArray<int32>>& OutComponents);

    // A true result proves a strict gap in the supplied posed coordinate space.
    // Padding and radius must use that same space. False is inconclusive.
    bool SeparateVertices(const TArray<FVector>& PosedPoints,
        const TArray<int32>& ComponentA, const TArray<int32>& ComponentB,
        const TArray<FVector>& Axes, double PaddingCm);

    bool SeparateCapsule(const TArray<FVector>& PosedPoints,
        const TArray<int32>& Component, const FVector& Start, const FVector& End,
        double RadiusCm, const TArray<FVector>& Axes, double PaddingCm);

    bool SeparatePolygon(const TArray<FVector>& PosedPoints,
        const TArray<int32>& BodyComponent, TConstArrayView<FVector> ClippedPosedPolygon,
        const TArray<FVector>& Axes, double PaddingCm);
}
