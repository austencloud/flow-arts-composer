#pragma once

#include "CoreMinimal.h"

// The site's roads are surveyed polylines whose corners can be 30 m apart. The world
// draws each one as a curve through those points, sampled about every metre, so a bend
// reads as a bend rather than a row of overlapping rectangles.

/** One station on a road's smoothed centreline, in site metres. */
struct FRoadStation
{
    FVector2D At;
    /** Unit vector across the road, the same side BuildRoads counts as positive. */
    FVector2D Side;
    float Distance = 0.f;
};

/** Centripetal Catmull-Rom through the surveyed points, resampled at an even spacing. */
inline TArray<FRoadStation> SmoothRoad(const TArray<FVector2D>& Surveyed, float Spacing = 1.f)
{
    TArray<FVector2D> P;
    for (const FVector2D& Point : Surveyed)
        if (P.IsEmpty() || FVector2D::Distance(P.Last(), Point) > .05f) P.Add(Point);
    TArray<FRoadStation> Stations;
    if (P.Num() < 2) return Stations;

    // The curve between P1 and P2 bends toward its neighbours; the ends extend their own line.
    TArray<FVector2D> Dense;
    Dense.Add(P[0]);
    for (int32 I = 0; I + 1 < P.Num(); ++I)
    {
        const FVector2D P1 = P[I], P2 = P[I + 1];
        const FVector2D P0 = I > 0 ? P[I - 1] : P1 * 2.f - P2;
        const FVector2D P3 = I + 2 < P.Num() ? P[I + 2] : P2 * 2.f - P1;
        const float T0 = 0.f;
        const float T1 = T0 + FMath::Max(FMath::Sqrt(FVector2D::Distance(P0, P1)), 1e-3f);
        const float T2 = T1 + FMath::Max(FMath::Sqrt(FVector2D::Distance(P1, P2)), 1e-3f);
        const float T3 = T2 + FMath::Max(FMath::Sqrt(FVector2D::Distance(P2, P3)), 1e-3f);
        const int32 Steps = FMath::Max(2, FMath::CeilToInt(FVector2D::Distance(P1, P2) / (Spacing * .25f)));
        for (int32 S = 1; S <= Steps; ++S)
        {
            const float T = FMath::Lerp(T1, T2, static_cast<float>(S) / Steps);
            const FVector2D A1 = P0 * ((T1 - T) / (T1 - T0)) + P1 * ((T - T0) / (T1 - T0));
            const FVector2D A2 = P1 * ((T2 - T) / (T2 - T1)) + P2 * ((T - T1) / (T2 - T1));
            const FVector2D A3 = P2 * ((T3 - T) / (T3 - T2)) + P3 * ((T - T2) / (T3 - T2));
            const FVector2D B1 = A1 * ((T2 - T) / (T2 - T0)) + A2 * ((T - T0) / (T2 - T0));
            const FVector2D B2 = A2 * ((T3 - T) / (T3 - T1)) + A3 * ((T - T1) / (T3 - T1));
            Dense.Add(B1 * ((T2 - T) / (T2 - T1)) + B2 * ((T - T1) / (T2 - T1)));
        }
    }

    TArray<float> Along;
    Along.Add(0.f);
    for (int32 I = 1; I < Dense.Num(); ++I) Along.Add(Along.Last() + FVector2D::Distance(Dense[I - 1], Dense[I]));
    const float Length = Along.Last();
    const int32 Count = FMath::Max(1, FMath::RoundToInt(Length / Spacing));
    int32 Segment = 1;
    for (int32 I = 0; I <= Count; ++I)
    {
        const float Distance = Length * I / Count;
        while (Segment < Dense.Num() - 1 && Along[Segment] < Distance) ++Segment;
        const float Span = FMath::Max(Along[Segment] - Along[Segment - 1], 1e-4f);
        const float T = FMath::Clamp((Distance - Along[Segment - 1]) / Span, 0.f, 1.f);
        Stations.Add({ FMath::Lerp(Dense[Segment - 1], Dense[Segment], T), FVector2D::ZeroVector, Distance });
    }
    // Sides come from the neighbours two stations away, which keeps a tight bend's inner edge from folding.
    for (int32 I = 0; I < Stations.Num(); ++I)
    {
        const FVector2D Direction = (Stations[FMath::Min(I + 2, Stations.Num() - 1)].At - Stations[FMath::Max(I - 2, 0)].At).GetSafeNormal();
        Stations[I].Side = FVector2D(-Direction.Y, Direction.X);
    }
    return Stations;
}
