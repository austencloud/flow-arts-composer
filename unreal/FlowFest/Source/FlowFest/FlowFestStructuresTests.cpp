#if WITH_DEV_AUTOMATION_TESTS
#include "Misc/AutomationTest.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Engine/StaticMesh.h"
#include "FlowFestStructures.h"

using namespace FlowFestStructures;

namespace
{
struct FTestRoad
{
    FString Id;
    float HalfWidth = 1.f;
    TArray<FRoadStation> Stations;
};

// The roads as BuildRoads draws them: smoothed, with each end run on half a width.
bool LoadSite(FAutomationTestBase& Test, TArray<FTestRoad>& Roads, TMap<FString, FVector2D>& Landmarks)
{
    FString Source;
    TSharedPtr<FJsonObject> Site;
    if (!Test.TestTrue(TEXT("site.json loads"), FFileHelper::LoadFileToString(Source, *(FPaths::ProjectContentDir() / TEXT("Data/site.json"))))) return false;
    if (!Test.TestTrue(TEXT("site.json parses"), FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Source), Site) && Site.IsValid())) return false;
    for (const TSharedPtr<FJsonValue>& Value : Site->GetArrayField(TEXT("roads")))
    {
        const TSharedPtr<FJsonObject> Road = Value->AsObject();
        FTestRoad Out;
        Out.Id = Road->GetStringField(TEXT("id"));
        Out.HalfWidth = Road->GetNumberField(TEXT("width")) * .5f;
        TArray<FVector2D> Points;
        for (const TSharedPtr<FJsonValue>& Point : Road->GetArrayField(TEXT("points")))
        {
            const TArray<TSharedPtr<FJsonValue>>& XZ = Point->AsArray();
            Points.Add(FVector2D(XZ[0]->AsNumber(), XZ[1]->AsNumber()));
        }
        Out.Stations = SmoothRoad(Points, .5f);
        if (Out.Stations.Num() < 2) continue;
        const FRoadStation First = Out.Stations[0], Last = Out.Stations.Last();
        Out.Stations.Insert({ First.At + (First.At - Out.Stations[1].At).GetSafeNormal() * Out.HalfWidth, First.Side, -Out.HalfWidth }, 0);
        Out.Stations.Add({ Last.At + (Last.At - Out.Stations[Out.Stations.Num() - 2].At).GetSafeNormal() * Out.HalfWidth, Last.Side, Last.Distance + Out.HalfWidth });
        Roads.Add(MoveTemp(Out));
    }
    for (const TSharedPtr<FJsonValue>& Value : Site->GetArrayField(TEXT("landmarks")))
    {
        const TSharedPtr<FJsonObject> Landmark = Value->AsObject();
        Landmarks.Add(Landmark->GetStringField(TEXT("id")), FVector2D(Landmark->GetNumberField(TEXT("x")), Landmark->GetNumberField(TEXT("z"))));
    }
    return Test.TestTrue(TEXT("site has roads"), Roads.Num() > 3);
}

/** Metres between a footprint and a road's edge (or its worn shoulder); negative when they meet. */
float RoadClearance(const FTestRoad& Road, const FVector2D& At, float Bearing, const FVector2D& Size, bool bShoulder, FVector2D& Worst)
{
    float Best = TNumericLimits<float>::Max();
    const float Reach = Road.HalfWidth * (bShoulder ? 1.35f : 1.f);
    for (int32 I = 1; I < Road.Stations.Num(); ++I)
        for (int32 Step = 0; Step < 4; ++Step)
        {
            // Between stations too, so a corner cannot slip through.
            const FVector2D P = FMath::Lerp(Road.Stations[I - 1].At, Road.Stations[I].At, Step / 4.f);
            const float Clear = DistanceToFootprint(At, Bearing, Size, P) - Reach;
            if (Clear < Best) { Best = Clear; Worst = P; }
        }
    return Best;
}
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestStructureFrameTest, "FlowFest.Structures.Frame",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)

// Bearings are compass degrees in the site frame (x east, z south), and a piece's front is its +X.
bool FFlowFestStructureFrameTest::RunTest(const FString& Parameters)
{
    const FVector2D O(10.f, -20.f);
    TestTrue(TEXT("Bearing 90 faces east"), LocalToSite(O, 90.f, 1.f, 0.f).Equals(O + FVector2D(1.f, 0.f), 1e-4f));
    TestTrue(TEXT("Bearing 180 faces south"), LocalToSite(O, 180.f, 1.f, 0.f).Equals(O + FVector2D(0.f, 1.f), 1e-4f));
    TestTrue(TEXT("Bearing 0 faces north"), LocalToSite(O, 0.f, 1.f, 0.f).Equals(O + FVector2D(0.f, -1.f), 1e-4f));
    TestTrue(TEXT("Right of a north-facing piece is east"), LocalToSite(O, 0.f, 0.f, 1.f).Equals(O + FVector2D(1.f, 0.f), 1e-4f));
    TestTrue(TEXT("Site to local undoes local to site"), SiteToLocal(O, 141.8f, LocalToSite(O, 141.8f, 2.f, -3.f)).Equals(FVector2D(2.f, -3.f), 1e-3f));
    TestEqual(TEXT("Bearing toward the east"), BearingToward(O, O + FVector2D(5.f, 0.f)), 90.f, .01f);
    TestEqual(TEXT("Bearing toward the south-west"), BearingToward(O, O + FVector2D(-5.f, 5.f)), 225.f, .01f);
    TestEqual(TEXT("A point inside a footprint is zero away"), DistanceToFootprint(O, 30.f, FVector2D(4.f, 2.f), LocalToSite(O, 30.f, 1.9f, .9f)), 0.f);
    TestEqual(TEXT("A point past the front is measured square to it"), DistanceToFootprint(O, 30.f, FVector2D(4.f, 2.f), LocalToSite(O, 30.f, 3.f, 0.f)), 1.f, 1e-3f);
    FPiece A, B;
    A.At = O; A.Bearing = 45.f; A.Size = FVector2D(4.f, 4.f);
    B = A; B.At = O + FVector2D(3.f, 0.f);
    TestTrue(TEXT("Turned squares 3 m apart overlap"), FootprintsOverlap(A, B));
    B.At = O + FVector2D(5.8f, 0.f);
    TestFalse(TEXT("Turned squares 5.8 m apart do not"), FootprintsOverlap(A, B));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestStructurePlanTest, "FlowFest.Structures.SitePlan",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)

// Every structure stays off every road and foot path, clear of the gate, the spawn and each
// other, and the juggling tent leaves the field's open lane free.
bool FFlowFestStructurePlanTest::RunTest(const FString& Parameters)
{
    TArray<FTestRoad> Roads;
    TMap<FString, FVector2D> Landmarks;
    if (!LoadSite(*this, Roads, Landmarks)) return false;
    const TArray<FPiece> Plan = SitePlan();
    TestTrue(TEXT("The plan has the brief's structures"), Plan.Num() >= 40);

    for (const FPiece& Piece : Plan)
    {
        if (Piece.Size.X <= 0.f) continue;
        for (const FTestRoad& Road : Roads)
        {
            FVector2D Worst;
            const float Clear = RoadClearance(Road, FootprintCentre(Piece), Piece.Bearing, Piece.Size, !Piece.bRoadEdge, Worst);
            TestTrue(*FString::Printf(TEXT("%s at (%.1f, %.1f) clears %s (%.2f m at %.1f, %.1f)"), Piece.Mesh, Piece.At.X, Piece.At.Y, *Road.Id, Clear, Worst.X, Worst.Y), Clear > .05f);
        }
    }
    for (const FGroundPatch& Patch : SitePatches())
        for (const FTestRoad& Road : Roads)
        {
            // A patch's fading rim may meet a road's worn shoulder, but not its running surface.
            FVector2D Worst;
            const float Clear = RoadClearance(Road, Patch.At, Patch.Bearing, Patch.Size, false, Worst);
            TestTrue(*FString::Printf(TEXT("Ground patch at (%.1f, %.1f) stays off %s (%.2f m)"), Patch.At.X, Patch.At.Y, *Road.Id, Clear), Clear > .05f);
        }

    // The gate trigger and the spawn keep their places, outside every footprint.
    for (const TCHAR* Id : { TEXT("gate"), TEXT("start"), TEXT("fire"), TEXT("workshop") })
    {
        const FVector2D* At = Landmarks.Find(Id);
        if (!TestNotNull(*FString::Printf(TEXT("Landmark %s exists"), Id), At)) continue;
        for (const FPiece& Piece : Plan)
            if (Piece.Size.X > 0.f)
                TestTrue(*FString::Printf(TEXT("%s stands clear of %s"), Id, Piece.Mesh), DistanceToFootprint(Piece, *At) > (Piece.SolidHeight > 0.f ? 1.f : .5f));
    }
    TestTrue(TEXT("The gate is still the surveyed gate"), Landmarks.FindRef(TEXT("gate")).Equals(FVector2D(311.03f, -121.72f), .05f));

    for (int32 I = 0; I < Plan.Num(); ++I)
        for (int32 J = I + 1; J < Plan.Num(); ++J)
        {
            const FPiece& A = Plan[I];
            const FPiece& B = Plan[J];
            if (A.Size.X <= 0.f || B.Size.X <= 0.f || (J == I + 1 && B.bAttached)) continue;
            TestFalse(*FString::Printf(TEXT("%s at (%.1f, %.1f) and %s at (%.1f, %.1f) do not overlap"), A.Mesh, A.At.X, A.At.Y, B.Mesh, B.At.X, B.At.Y), FootprintsOverlap(A, B));
        }

    // Austen asked for x 88 to 100, z -82 to -76 to stay open beside the juggling tent.
    for (const FPiece& Piece : Plan)
    {
        if (Piece.Size.X <= 0.f) continue;
        FPiece Lane;
        Lane.At = FVector2D(94.f, -79.f); Lane.Bearing = 90.f; Lane.Size = FVector2D(12.f, 6.f);
        TestFalse(*FString::Printf(TEXT("%s keeps the open lane free"), Piece.Mesh), FootprintsOverlap(Piece, Lane));
    }
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestStructurePathArtTest, "FlowFest.Structures.PathArt",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)

// The decorated path's ropes come every 6 to 10 m, the same every run, and their trees and
// stakes leave at least 2 m of walk clear and stay off every other road.
bool FFlowFestStructurePathArtTest::RunTest(const FString& Parameters)
{
    TArray<FTestRoad> Roads;
    TMap<FString, FVector2D> Landmarks;
    if (!LoadSite(*this, Roads, Landmarks)) return false;
    const FTestRoad* Walk = Roads.FindByPredicate([](const FTestRoad& Road) { return Road.Id == TEXT("middle-to-lower"); });
    if (!TestNotNull(TEXT("The middle-to-lower walk exists"), Walk)) return false;
    // Its stations as BuildStructures smooths them, without the drawn end runs.
    TArray<FRoadStation> Path(Walk->Stations.GetData() + 1, Walk->Stations.Num() - 2);
    // A grid of trunks every 3 m stands in for the woods.
    TArray<FVector2D> Trunks;
    for (float X = 120.f; X < 220.f; X += 3.f)
        for (float Z = -130.f; Z < -80.f; Z += 3.f)
            Trunks.Add(FVector2D(X + Hash01(static_cast<uint32>(FMath::RoundToInt(X * 7.f - Z)), 1), Z));
    const TArray<FPiece> Plan = SitePlan();
    for (const TArray<FVector2D>& Woods : { TArray<FVector2D>(), Trunks })
    {
        const TArray<FPathArtSpan> Spans = PlanPathArt(Path, Woods, Plan, PathArtMinEast, PathArtMaxEast);
        TestTrue(*FString::Printf(TEXT("At least six spans (%d)"), Spans.Num()), Spans.Num() >= 6);
        const TArray<FPathArtSpan> Again = PlanPathArt(Path, Woods, Plan, PathArtMinEast, PathArtMaxEast);
        TestEqual(TEXT("Same span count every run"), Again.Num(), Spans.Num());
        for (int32 I = 0; I < FMath::Min(Spans.Num(), Again.Num()); ++I)
            TestTrue(TEXT("Same spans every run"), Spans[I].Ends[0].Equals(Again[I].Ends[0]) && Spans[I].Ends[1].Equals(Again[I].Ends[1]) && Spans[I].Kind == Again[I].Kind);
        for (int32 I = 0; I < Spans.Num(); ++I)
        {
            const FPathArtSpan& Span = Spans[I];
            if (I > 0)
            {
                const float Gap = FVector2D::Distance(Spans[I - 1].Centre, Span.Centre);
                TestTrue(*FString::Printf(TEXT("Span gap %.1f m is at least 6 m"), Gap), Gap > 5.5f);
            }
            for (int32 E = 0; E < 2; ++E)
            {
                float NearestWalk = TNumericLimits<float>::Max();
                for (const FRoadStation& S : Path) NearestWalk = FMath::Min(NearestWalk, FVector2D::Distance(S.At, Span.Ends[E]));
                TestTrue(*FString::Printf(TEXT("Rope end %.1f m from the walk's centre leaves it 2 m clear"), NearestWalk), NearestWalk >= 1.f + .2f);
                if (Span.bTree[E]) continue;
                for (const FTestRoad& Road : Roads)
                {
                    if (&Road == Walk) continue;
                    float Nearest = TNumericLimits<float>::Max();
                    for (const FRoadStation& S : Road.Stations) Nearest = FMath::Min(Nearest, FVector2D::Distance(S.At, Span.Ends[E]));
                    TestTrue(*FString::Printf(TEXT("Stake at (%.1f, %.1f) stays off %s"), Span.Ends[E].X, Span.Ends[E].Y, *Road.Id), Nearest > Road.HalfWidth * 1.35f);
                }
                for (const FPiece& Piece : Plan)
                    if (Piece.Size.X > 0.f) TestTrue(TEXT("Stake stands outside every structure"), DistanceToFootprint(Piece, Span.Ends[E]) >= .4f);
            }
        }
    }
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestStructureMeshTest, "FlowFest.Structures.Meshes",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)

// Every planned mesh is imported, and each footprint covers its mesh, so the road and overlap
// checks above hold for the geometry and not just the table.
bool FFlowFestStructureMeshTest::RunTest(const FString& Parameters)
{
    TSet<FString> Seen;
    for (const FPiece& Piece : SitePlan())
    {
        const UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *FString::Printf(TEXT("/Game/FlowFest/Assets/Structures/%s.%s"), Piece.Mesh, Piece.Mesh));
        if (!TestNotNull(*FString::Printf(TEXT("%s is imported"), Piece.Mesh), Mesh) || Piece.Size.X <= 0.f || Seen.Contains(Piece.Mesh)) continue;
        Seen.Add(Piece.Mesh);
        // The mesh box in metres against the footprint rectangle, both in the piece's own frame.
        const FBox Box = Mesh->GetBounds().GetBox();
        const FVector2D Low = Piece.Offset - Piece.Size * .5f - FVector2D(.05f), High = Piece.Offset + Piece.Size * .5f + FVector2D(.05f);
        TestTrue(*FString::Printf(TEXT("%s spans %.2f to %.2f m ahead, inside %.2f to %.2f"), Piece.Mesh, Box.Min.X / 100.f, Box.Max.X / 100.f, Low.X, High.X), Box.Min.X / 100.f >= Low.X && Box.Max.X / 100.f <= High.X);
        TestTrue(*FString::Printf(TEXT("%s spans %.2f to %.2f m across, inside %.2f to %.2f"), Piece.Mesh, Box.Min.Y / 100.f, Box.Max.Y / 100.f, Low.Y, High.Y), Box.Min.Y / 100.f >= Low.Y && Box.Max.Y / 100.f <= High.Y);
    }
    for (const TCHAR* Name : { TEXT("ArtPanel"), TEXT("RingStreamers"), TEXT("PaperLantern"), TEXT("Cone") })
        TestNotNull(*FString::Printf(TEXT("%s is imported"), Name), LoadObject<UStaticMesh>(nullptr, *FString::Printf(TEXT("/Game/FlowFest/Assets/Structures/%s.%s"), Name, Name)));
    return true;
}
#endif
