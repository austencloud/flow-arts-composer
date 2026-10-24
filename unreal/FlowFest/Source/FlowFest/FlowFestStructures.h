#pragma once

#include "CoreMinimal.h"
#include "FlowFestRoadShape.h"

// The festival's real buildings and gear, from Austen's site interview
// (docs/superpowers/specs/flow-fest-sim/site-labels-interview.md) and his marker file.
// Positions are site metres, x east and z south, the frame of site.json. Every mesh in
// /Game/FlowFest/Assets/Structures has its front on +X and its origin at the centre of
// its footprint on the ground, so a piece is a mesh, a centre and a compass bearing.
// Everything here is plain data and maths so the tests can check it without a world.
namespace FlowFestStructures
{
// Where a piece's origin sits. Legged things stand on the lowest corner of their
// footprint so no leg floats; floored buildings sit on the highest corner and carry a
// plinth down to the ground.
enum class EBase : uint8 { Centre, Lowest, Highest };

struct FPiece
{
    const TCHAR* Mesh = nullptr;
    FVector2D At = FVector2D::ZeroVector;
    /** Compass degrees, clockwise from north, that the front faces. */
    float Bearing = 90.f;
    /** Ground footprint in metres: depth along the front, width across it. Zero for gear that rides in another piece's footprint. */
    FVector2D Size = FVector2D::ZeroVector;
    EBase Base = EBase::Centre;
    /** Height of the walking collision box over the footprint, metres. Zero leaves the piece open. */
    float SolidHeight = 0.f;
    /** Trees inside a roof are the canopy scan reading the roof, so they are cleared. */
    bool bClearsTrees = false;
    /** Per-instance colour for the fabric and painted materials. */
    FLinearColor Colour = FLinearColor(.8f, .8f, .78f);
    /** Small gear at a road edge is held to the running surface, not the worn shoulder. */
    bool bRoadEdge = false;
    /** Where the footprint's centre sits from the origin, metres ahead and to the right: porches, tongues and ramps reach one way. */
    FVector2D Offset = FVector2D::ZeroVector;
    /** Built against the piece before it, which it overlaps by design. */
    bool bAttached = false;
};

/** A gravel pad or trampled strip draped on the ground. */
struct FGroundPatch
{
    FVector2D At = FVector2D::ZeroVector;
    float Bearing = 90.f;
    FVector2D Size = FVector2D::ZeroVector;
    /** 0 is gravel, 1 is trampled earth. */
    float Trampled = 0.f;
};

inline float YawFromBearing(float Bearing) { return Bearing - 90.f; }

inline float BearingToward(const FVector2D& From, const FVector2D& To)
{
    const FVector2D D = To - From;
    return FMath::Fmod(FMath::RadiansToDegrees(FMath::Atan2(D.X, -D.Y)) + 360.f, 360.f);
}

/** A point Ahead metres along a piece's front and Right metres to its right. */
inline FVector2D LocalToSite(const FVector2D& At, float Bearing, float Ahead, float Right)
{
    const float Yaw = FMath::DegreesToRadians(YawFromBearing(Bearing));
    const float C = FMath::Cos(Yaw), S = FMath::Sin(Yaw);
    return At + FVector2D(Ahead * C - Right * S, Ahead * S + Right * C);
}

inline FVector2D SiteToLocal(const FVector2D& At, float Bearing, const FVector2D& P)
{
    const float Yaw = FMath::DegreesToRadians(YawFromBearing(Bearing));
    const float C = FMath::Cos(Yaw), S = FMath::Sin(Yaw);
    const FVector2D D = P - At;
    return FVector2D(D.X * C + D.Y * S, -D.X * S + D.Y * C);
}

/** Where a footprint's rectangle is centred. */
inline FVector2D FootprintCentre(const FPiece& Piece) { return LocalToSite(Piece.At, Piece.Bearing, Piece.Offset.X, Piece.Offset.Y); }

/** Metres from P to a footprint's edge; zero inside. */
inline float DistanceToFootprint(const FVector2D& At, float Bearing, const FVector2D& Size, const FVector2D& P)
{
    const FVector2D L = SiteToLocal(At, Bearing, P);
    return FVector2D(FMath::Max(0.f, FMath::Abs(L.X) - Size.X * .5f), FMath::Max(0.f, FMath::Abs(L.Y) - Size.Y * .5f)).Size();
}

inline float DistanceToFootprint(const FPiece& Piece, const FVector2D& P) { return DistanceToFootprint(FootprintCentre(Piece), Piece.Bearing, Piece.Size, P); }

inline void FootprintCorners(const FVector2D& At, float Bearing, const FVector2D& Size, FVector2D Out[4])
{
    const float H = Size.X * .5f, W = Size.Y * .5f;
    Out[0] = LocalToSite(At, Bearing, H, W);
    Out[1] = LocalToSite(At, Bearing, H, -W);
    Out[2] = LocalToSite(At, Bearing, -H, -W);
    Out[3] = LocalToSite(At, Bearing, -H, W);
}

/** True when two footprints overlap (separating axes on both rectangles). */
inline bool FootprintsOverlap(const FPiece& A, const FPiece& B)
{
    FVector2D CA[4], CB[4];
    FootprintCorners(FootprintCentre(A), A.Bearing, A.Size, CA);
    FootprintCorners(FootprintCentre(B), B.Bearing, B.Size, CB);
    for (const FPiece* Owner : { &A, &B })
        for (int32 Axis = 0; Axis < 2; ++Axis)
        {
            const FVector2D N = (LocalToSite(Owner->At, Owner->Bearing, Axis == 0 ? 1.f : 0.f, Axis == 1 ? 1.f : 0.f) - Owner->At);
            float MinA = TNumericLimits<float>::Max(), MaxA = -MinA, MinB = MinA, MaxB = -MinA;
            for (int32 I = 0; I < 4; ++I)
            {
                const float PA = FVector2D::DotProduct(CA[I], N), PB = FVector2D::DotProduct(CB[I], N);
                MinA = FMath::Min(MinA, PA); MaxA = FMath::Max(MaxA, PA);
                MinB = FMath::Min(MinB, PB); MaxB = FMath::Max(MaxB, PB);
            }
            if (MaxA <= MinB || MaxB <= MinA) return false;
        }
    return true;
}

/** A stable 0..1 value for a key and salt, never the clock. */
inline float Hash01(uint32 Key, uint32 Salt)
{
    uint32 H = Key * 0x9E3779B1u ^ (Salt + 0x7F4A7C15u) * 0x85EBCA77u;
    H ^= H >> 15; H *= 0x2C1B3C6Du; H ^= H >> 12; H *= 0x297A2D39u; H ^= H >> 15;
    return (H & 0xFFFFFF) / 16777216.f;
}

/** Points beside a road, Offsets metres along it from the station nearest Near, Lateral metres out on Near's side. */
inline TArray<FVector2D> RoadEdgePoints(const TArray<FRoadStation>& Stations, const FVector2D& Near, TArrayView<const float> Offsets, float Lateral)
{
    TArray<FVector2D> Points;
    if (Stations.Num() < 2) return Points;
    int32 Closest = 0;
    for (int32 I = 1; I < Stations.Num(); ++I)
        if (FVector2D::DistSquared(Stations[I].At, Near) < FVector2D::DistSquared(Stations[Closest].At, Near)) Closest = I;
    for (float Offset : Offsets)
    {
        const float Want = Stations[Closest].Distance + Offset;
        int32 Pick = Closest;
        for (int32 I = 0; I < Stations.Num(); ++I)
            if (FMath::Abs(Stations[I].Distance - Want) < FMath::Abs(Stations[Pick].Distance - Want)) Pick = I;
        const FRoadStation& S = Stations[Pick];
        const float Sign = FVector2D::DotProduct(Near - S.At, S.Side) >= 0.f ? 1.f : -1.f;
        Points.Add(S.At + S.Side * (Sign * Lateral));
    }
    return Points;
}

// The decorated path: art hung on ropes across the walk from the lower loop to Middle Earth.
enum class EPathArt : uint8 { Panels, Rings, Lanterns };

struct FPathArtSpan
{
    /** Rope ends, left and right of the walk. */
    FVector2D Ends[2];
    /** True where the end is tied to a tree; false where a stake stands. */
    bool bTree[2] = { false, false };
    /** The path's centre under the rope and its direction. */
    FVector2D Centre = FVector2D::ZeroVector;
    FVector2D Along = FVector2D(1.f, 0.f);
    EPathArt Kind = EPathArt::Panels;
    uint32 Seed = 0;
};

/** Stakes stand this far out from the path centre, past the worn shoulder. */
constexpr float StakeLateral = 2.4f;
/** Trees closer than this to the centre would pinch the walk. */
constexpr float TreeLateralMin = 1.6f;
constexpr float TreeLateralMax = 7.f;

/**
 * One rope every 6 to 10 metres along the walk between MinEast and MaxEast. Each end ties to the
 * nearest tree beside the walk when one stands within reach, otherwise to a stake. A span whose
 * stake would land in a piece's footprint is left out.
 */
inline TArray<FPathArtSpan> PlanPathArt(const TArray<FRoadStation>& Path, const TArray<FVector2D>& Trunks,
    const TArray<FPiece>& Avoid, float MinEast, float MaxEast)
{
    TArray<FPathArtSpan> Spans;
    if (Path.Num() < 2) return Spans;
    float Next = -1.f;
    uint32 Index = 0;
    for (int32 I = 1; I < Path.Num(); ++I)
    {
        const FRoadStation& S = Path[I];
        if (S.At.X < MinEast || S.At.X > MaxEast) continue;
        if (Next < 0.f) Next = S.Distance + 2.f;
        if (S.Distance < Next) continue;
        Next = S.Distance + 6.f + 4.f * Hash01(Index, 11);
        const uint32 Seed = Index++;
        FPathArtSpan Span;
        Span.Centre = S.At;
        Span.Along = (S.At - Path[I - 1].At).GetSafeNormal();
        Span.Kind = static_cast<EPathArt>(FMath::FloorToInt(Hash01(Seed, 23) * 3.f) % 3);
        Span.Seed = Seed;
        bool bValid = true;
        for (int32 End = 0; End < 2; ++End)
        {
            const float Sign = End == 0 ? -1.f : 1.f;
            float Best = TreeLateralMax + 1.f;
            for (const FVector2D& Trunk : Trunks)
            {
                const FVector2D D = Trunk - S.At;
                const float Lateral = FVector2D::DotProduct(D, S.Side) * Sign;
                if (FMath::Abs(FVector2D::DotProduct(D, Span.Along)) > 3.f || Lateral < TreeLateralMin || Lateral > TreeLateralMax || Lateral >= Best) continue;
                Best = Lateral;
                Span.Ends[End] = Trunk;
                Span.bTree[End] = true;
            }
            if (Span.bTree[End]) continue;
            Span.Ends[End] = S.At + S.Side * (Sign * StakeLateral);
            for (const FPiece& Piece : Avoid)
                if (Piece.Size.X > 0.f && DistanceToFootprint(Piece, Span.Ends[End]) < .4f) bValid = false;
        }
        if (bValid) Spans.Add(Span);
    }
    return Spans;
}

// Colours named in the interview or read off the orthophoto; the rest are judgement.
inline FLinearColor Hex(const TCHAR* Code) { return FLinearColor(FColor::FromHex(Code)); }

/** The decorated path's centre line: the middle-to-lower foot connector, east of the stage. */
constexpr float PathArtMinEast = 133.f;
constexpr float PathArtMaxEast = 206.f;

/** Where the fire circle's crowd stands; the field's workshops turn to face it. */
inline FVector2D CircleCentre() { return FVector2D(90.5f, -119.5f); }

/** Every structure on the site, steps 1 to 4 of the brief. */
inline TArray<FPiece> SitePlan()
{
    const FVector2D Circle = CircleCentre();
    const FLinearColor White = Hex(TEXT("e8e6df")), Navy = Hex(TEXT("2f3f66")), Green = Hex(TEXT("3f6b4b")), Sand = Hex(TEXT("c9b68a"));
    const FLinearColor Rust = Hex(TEXT("a34a2a")), Teal = Hex(TEXT("2f7d78")), Plum = Hex(TEXT("6b3f66")), Mustard = Hex(TEXT("c99a2e"));
    TArray<FPiece> Plan;
    const auto Add = [&Plan](const FPiece& Piece) { Plan.Add(Piece); };
    const auto Gear = [&Plan](const TCHAR* Mesh, const FVector2D& At, float Bearing, EBase Base = EBase::Centre, FLinearColor Colour = FLinearColor(.8f, .8f, .78f))
    {
        FPiece Piece;
        Piece.Mesh = Mesh; Piece.At = At; Piece.Bearing = Bearing; Piece.Base = Base; Piece.Colour = Colour;
        Plan.Add(Piece);
    };

    // Step 1, Middle Earth.
    // Showcase stage: the teal roof on the orthophoto, turned to face the fire circle. The
    // footprint reaches back over the ramp; the deck alone blocks walking.
    Add({ TEXT("ShowcaseStage"), FVector2D(126.8f, -98.6f), BearingToward(FVector2D(126.8f, -98.6f), Circle), FVector2D(10.6f, 10.2f), EBase::Lowest, 0.f, true, FLinearColor(.8f, .8f, .78f), false, FVector2D(-1.f, 0.f) });
    Add({ TEXT("JugglingTent"), FVector2D(93.6f, -88.9f), 180.f, FVector2D(13.4f, 13.4f), EBase::Lowest, 0.f, true });
    Add({ TEXT("FoodPavilion"), FVector2D(55.9f, -96.4f), 90.f, FVector2D(9.6f, 13.6f), EBase::Highest, 0.f, true });
    Add({ TEXT("FoodBooth"), FVector2D(52.5f, -85.f), 0.f, FVector2D(4.5f, 5.6f), EBase::Highest, 2.6f, true, Rust, false, FVector2D(.74f, -.51f) });
    Add({ TEXT("FoodBooth"), FVector2D(58.5f, -85.f), 0.f, FVector2D(4.5f, 5.6f), EBase::Highest, 2.6f, true, Teal, false, FVector2D(.74f, -.51f) });
    Add({ TEXT("Canopy3"), FVector2D(125.5f, -128.4f), 270.f, FVector2D(3.2f, 3.2f), EBase::Lowest, 0.f, false, Navy });
    Gear(TEXT("HqKit"), FVector2D(125.5f, -128.4f), 270.f, EBase::Lowest);
    Add({ TEXT("Canopy3"), FVector2D(125.5f, -117.6f), 270.f, FVector2D(3.2f, 3.2f), EBase::Lowest, 0.f, false, White });
    Gear(TEXT("FirstAidKit"), FVector2D(125.5f, -117.6f), 270.f, EBase::Lowest);
    Add({ TEXT("DipStation"), FVector2D(68.5f, -144.f), 153.4f, FVector2D(5.f, 5.f) });
    Add({ TEXT("Archway"), FVector2D(77.9f, -138.f), 141.8f, FVector2D(.8f, 3.8f), EBase::Lowest });
    // Workshops W1 to W4 turn their open side to the circle.
    const FVector2D Workshops[] = { {72.f, -134.f}, {106.f, -131.f}, {61.f, -110.f}, {110.f, -89.f}, {214.f, -85.5f} };
    static const TCHAR* const Boards[] = { TEXT("WorkshopBoardW1"), TEXT("WorkshopBoardW2"), TEXT("WorkshopBoardW3"), TEXT("WorkshopBoardW4"), TEXT("WorkshopBoardW5") };
    for (int32 I = 0; I < 5; ++I)
    {
        const float Bearing = I < 4 ? BearingToward(Workshops[I], Circle) : 0.f;
        Add({ TEXT("WorkshopCanopy"), Workshops[I], Bearing, FVector2D(6.4f, 8.2f), EBase::Lowest, 0.f, true, I % 2 ? Sand : White });
        Gear(Boards[I], LocalToSite(Workshops[I], Bearing, 3.9f, 2.4f), Bearing);
    }
    // Toilets and a shower trailer on gravel west of the walk.
    Add({ TEXT("ToiletRow"), FVector2D(66.f, -99.f), 90.f, FVector2D(1.6f, 5.4f), EBase::Highest, 2.4f, true });
    Add({ TEXT("ShowerTrailer"), FVector2D(70.f, -104.2f), 90.f, FVector2D(3.2f, 7.6f), EBase::Highest, 2.8f, true, FLinearColor(.8f, .8f, .78f), false, FVector2D(.22f, .71f) });
    // The walk-in: a board where people arrive on foot (the trampled strip is a ground patch).
    Gear(TEXT("WalkInBoard"), LocalToSite(FVector2D(111.8f, -141.9f), 223.6f, -1.5f, 1.8f), 43.6f);

    // Step 2, the lower loop.
    Add({ TEXT("MainBuilding"), FVector2D(306.f, -114.f), 90.f, FVector2D(12.f, 13.2f), EBase::Highest, 4.f, true, FLinearColor(.8f, .8f, .78f), false, FVector2D(.3f, 0.f) });
    Add({ TEXT("Canopy3"), FVector2D(317.f, -116.2f), 90.f, FVector2D(3.2f, 3.2f), EBase::Lowest, 0.f, false, Green });
    Gear(TEXT("CheckInKit"), FVector2D(317.f, -116.2f), 90.f, EBase::Lowest);
    Add({ TEXT("CheckInBoard"), FVector2D(318.7f, -112.4f), 180.f, FVector2D(.7f, .7f), EBase::Centre, 0.f, false, FLinearColor(.8f, .8f, .78f), true });
    Add({ TEXT("OneWaySign"), FVector2D(325.f, -112.f), 147.5f, FVector2D(.4f, 1.4f), EBase::Centre, 0.f, false, FLinearColor(.8f, .8f, .78f), true });
    Add({ TEXT("ToiletRow"), FVector2D(266.f, -173.5f), 0.f, FVector2D(1.6f, 5.4f), EBase::Highest, 2.4f, true });
    Add({ TEXT("ToiletRow"), FVector2D(262.f, -76.5f), 0.f, FVector2D(1.6f, 5.4f), EBase::Highest, 2.4f, true });
    Add({ TEXT("ShowerTrailer"), FVector2D(254.4f, -77.f), 0.f, FVector2D(3.2f, 7.6f), EBase::Highest, 2.8f, true, FLinearColor(.8f, .8f, .78f), false, FVector2D(.22f, .71f) });
    Add({ TEXT("ToiletRow"), FVector2D(305.f, -102.f), 90.f, FVector2D(1.6f, 5.4f), EBase::Highest, 2.4f, true });

    // Step 3: the barn, the old stage, the vendors.
    Add({ TEXT("Barn"), FVector2D(188.5f, -126.f), 180.f, FVector2D(12.8f, 19.2f), EBase::Highest, 6.f, true });
    Add({ TEXT("AbandonedStage"), FVector2D(136.f, -121.f), 180.f, FVector2D(6.8f, 8.4f), EBase::Lowest, .6f, true, FLinearColor(.8f, .8f, .78f), false, FVector2D(.7f, 0.f) });
    const struct { FVector2D At; float Bearing; } Vendors[] = {
        {{176.f, -99.5f}, 0.f}, {{196.f, -94.5f}, 0.f}, {{165.f, -109.f}, 180.f},
        {{172.f, -64.f}, -1.f}, {{186.f, -66.f}, -1.f}, {{184.f, -76.f}, -1.f}, {{165.f, -77.f}, -1.f}, {{194.f, -80.f}, -1.f} };
    const FLinearColor VendorColours[] = { Plum, Mustard, Teal, Rust, Navy, Sand, Green, Plum };
    for (int32 I = 0; I < UE_ARRAY_COUNT(Vendors); ++I)
    {
        // The woods booths ring a small clearing and face its middle.
        const float Bearing = Vendors[I].Bearing >= 0.f ? Vendors[I].Bearing : BearingToward(Vendors[I].At, FVector2D(179.f, -71.f));
        Add({ TEXT("Canopy3"), Vendors[I].At, Bearing, FVector2D(3.2f, 3.2f), EBase::Lowest, 0.f, false, VendorColours[I] });
        Gear(I % 2 ? TEXT("VendorHoops") : TEXT("VendorRack"), Vendors[I].At, Bearing, EBase::Lowest);
    }

    // Step 4, the upper buildings.
    Add({ TEXT("PinkCabin"), FVector2D(-14.4f, -140.3f), 180.f, FVector2D(12.2f, 15.4f), EBase::Highest, 4.f, true, FLinearColor(.8f, .8f, .78f), false, FVector2D(.9f, 0.f) });
    Add({ TEXT("GreyBuilding"), FVector2D(-33.f, -140.5f), 180.f, FVector2D(12.2f, 16.2f), EBase::Highest, 4.f, true });
    Add({ TEXT("MainCabin"), FVector2D(9.4f, -95.6f), 270.f, FVector2D(18.5f, 26.f), EBase::Highest, 4.f, true, FLinearColor(.8f, .8f, .78f), false, FVector2D(1.25f, 0.f) });
    Add({ TEXT("Lodge"), FVector2D(-23.76f, -60.87f), 214.6f, FVector2D(8.1f, 23.1f), EBase::Highest, 3.5f, true });
    // The porch is built from the lodge's front wall out, under the lodge's eaves.
    Add({ TEXT("LodgePorch"), LocalToSite(FVector2D(-23.76f, -60.87f), 214.6f, 3.5f, 0.f), 214.6f, FVector2D(3.6f, 22.8f), EBase::Highest, 0.f, true, FLinearColor(.8f, .8f, .78f), false, FVector2D(1.65f, 0.f), true });
    Add({ TEXT("WorkshopCanopy"), FVector2D(-27.f, -83.f), 0.f, FVector2D(6.4f, 8.2f), EBase::Lowest, 0.f, true, Sand });
    Gear(TEXT("WorkshopBoardW7"), LocalToSite(FVector2D(-27.f, -83.f), 0.f, 3.9f, 2.4f), 0.f);
    return Plan;
}

inline TArray<FGroundPatch> SitePatches()
{
    return {
        // Gravel under the Middle Earth toilets and showers.
        { FVector2D(67.5f, -101.5f), 90.f, FVector2D(8.f, 12.f), 0.f },
        // The walk-in, trampled from the woods edge toward the circle.
        { LocalToSite(FVector2D(111.8f, -141.9f), 223.6f, 2.f, 0.f), 223.6f, FVector2D(12.f, 2.2f), 1.f },
        // The apron between the main building and the drive, and the lower toilets' gravel.
        { FVector2D(313.4f, -114.f), 90.f, FVector2D(4.6f, 14.f), 0.f },
        { FVector2D(258.5f, -76.6f), 0.f, FVector2D(4.4f, 15.f), 0.f },
        { FVector2D(304.6f, -102.f), 90.f, FVector2D(3.4f, 7.f), 0.f },
        { FVector2D(266.f, -173.5f), 0.f, FVector2D(3.4f, 7.f), 0.f },
        // The west upper parking, past the end of its drive.
        { FVector2D(-118.5f, -21.5f), 225.f, FVector2D(14.f, 20.f), 0.f },
    };
}
}
