#pragma once

#include "CoreMinimal.h"
#include "FlowFestCanopy.h"

// The source scene places trees only where it measured a trunk, so most of the real woods
// stand as gaps. The LiDAR canopy-height scan says where crowns are; FillWoods plants a
// tree in every stretch of tall canopy that no placed crown already covers.

/** A tree planted to close up the woods: trunk position and height in site metres, turn in radians. */
struct FWoodsFillTree
{
    FVector2D At;
    float Height = 0.f;
    float Rotation = 0.f;
};

struct FWoodsFillSettings
{
    /** Candidate trunks sit on a grid this far apart, each nudged up to a third of it. */
    float Spacing = 5.f;
    /** Canopy lower than this is scrub or a hedge, not woods. */
    float MinCanopy = 6.f;
    /** A candidate this close to an existing trunk is already part of that tree. */
    float MinTrunkGap = 3.6f;
    /** Ground already this shaded by placed crowns needs no new tree. */
    float MaxCover = .55f;
};

/** A stable 0..1 value per grid cell and salt, so the same woods grow on every run. */
inline float WoodsHash(int32 X, int32 Y, uint32 Salt)
{
    uint32 H = static_cast<uint32>(X) * 0x8da6b343u ^ static_cast<uint32>(Y) * 0xd8163841u ^ Salt * 0xcb1ab31fu;
    H ^= H >> 13; H *= 0x5bd1e995u; H ^= H >> 15;
    return (H & 0xffffff) / static_cast<float>(0x1000000);
}

/**
 * Plants trees across [Min, Max] wherever CanopyTop reports tall canopy, Blocked allows a
 * trunk, and the crowns already in Canopy leave the ground open. Each planted tree joins
 * Canopy, so later candidates see it. Heights follow the scan, so a tree tops out where
 * the real crown does.
 */
inline TArray<FWoodsFillTree> FillWoods(const FVector2D& Min, const FVector2D& Max, TFunctionRef<float(const FVector2D&)> CanopyTop,
                                        TFunctionRef<bool(const FVector2D&)> Blocked, FCanopyMap& Canopy, const FWoodsFillSettings& Settings = {})
{
    TArray<FWoodsFillTree> Planted;
    const int32 Columns = FMath::FloorToInt((Max.X - Min.X) / Settings.Spacing);
    const int32 Rows = FMath::FloorToInt((Max.Y - Min.Y) / Settings.Spacing);
    for (int32 Row = 0; Row < Rows; ++Row)
        for (int32 Column = 0; Column < Columns; ++Column)
        {
            const FVector2D Jitter((WoodsHash(Column, Row, 1) - .5f) * .66f, (WoodsHash(Column, Row, 2) - .5f) * .66f);
            const FVector2D At = Min + (FVector2D(Column + .5f, Row + .5f) + Jitter) * Settings.Spacing;
            const float Top = CanopyTop(At);
            if (Top < Settings.MinCanopy || Blocked(At)) continue;
            float NearestTrunk = 0.f;
            if (Canopy.Cover(At, NearestTrunk) > Settings.MaxCover || NearestTrunk < Settings.MinTrunkGap) continue;
            const float Height = FMath::Max(Settings.MinCanopy, Top * FMath::Lerp(.9f, 1.f, WoodsHash(Column, Row, 3)));
            Canopy.Add(At, Height);
            Planted.Add({ At, Height, WoodsHash(Column, Row, 4) * TWO_PI });
        }
    return Planted;
}
