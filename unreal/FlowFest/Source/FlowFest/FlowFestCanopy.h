#pragma once

#include "CoreMinimal.h"

// Shared by the terrain, which darkens the ground under the crowns, and the ecology's
// forest floor, which scatters litter, ferns and deadwood there.

/** A measured tree's trunk and the radius of the ground its crown shades, in metres. */
struct FCanopy
{
    FVector2D At;
    float Radius = 4.f;
};

/** The source's measured trees, hashed in 8 m cells for canopy lookups. */
struct FCanopyMap
{
    TArray<FCanopy> Trees;
    TMap<FIntPoint, TArray<int32>> Cells;
    static FIntPoint CellOf(const FVector2D& At) { return FIntPoint(FMath::FloorToInt(At.X / 8.f), FMath::FloorToInt(At.Y / 8.f)); }

    void Add(const FVector2D& At, float Height)
    {
        // A crown spreads about a quarter of the tree's height to each side.
        Cells.FindOrAdd(CellOf(At)).Add(Trees.Add({ At, FMath::Clamp(Height * .27f, 2.5f, 5.5f) }));
    }

    /** How shaded the ground is, 0 in the open to 1 under overlapping crowns, and the distance to the nearest trunk. */
    float Cover(const FVector2D& At, float& NearestTrunk) const
    {
        const FIntPoint Cell = CellOf(At);
        float Shade = 0.f;
        NearestTrunk = TNumericLimits<float>::Max();
        for (int32 Y = -1; Y <= 1; ++Y)
            for (int32 X = -1; X <= 1; ++X)
                if (const TArray<int32>* Members = Cells.Find(Cell + FIntPoint(X, Y)))
                    for (int32 Member : *Members)
                    {
                        const float Distance = FVector2D::Distance(Trees[Member].At, At);
                        NearestTrunk = FMath::Min(NearestTrunk, Distance);
                        Shade += 1.f - FMath::SmoothStep(Trees[Member].Radius * .45f, Trees[Member].Radius * 1.3f, Distance);
                    }
        return FMath::Min(Shade, 1.f);
    }
};
