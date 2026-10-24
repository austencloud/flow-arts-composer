#include "FlowFestStructures.h"
#include "FlowFestWorld.h"
#include "FlowFestRoadShape.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Components/InstancedSkinnedMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInterface.h"
#include "ProceduralMeshComponent.h"

using namespace FlowFestStructures;

namespace
{
constexpr float Cm = 100.f;

UStaticMesh* StructureMesh(const TCHAR* Name)
{
    return LoadObject<UStaticMesh>(nullptr, *FString::Printf(TEXT("/Game/FlowFest/Assets/Structures/%s.%s"), Name, Name));
}

// Festival colours for the hung art: rust, saffron, teal, plum, rose and indigo.
const FLinearColor ArtColours[] = {
    FLinearColor(FColor::FromHex(TEXT("b8452a"))), FLinearColor(FColor::FromHex(TEXT("e0a43a"))), FLinearColor(FColor::FromHex(TEXT("2f8c86"))),
    FLinearColor(FColor::FromHex(TEXT("7a3d78"))), FLinearColor(FColor::FromHex(TEXT("d9748a"))), FLinearColor(FColor::FromHex(TEXT("3b4a8f"))) };

FLinearColor ArtColour(uint32 Seed, uint32 Salt)
{
    return ArtColours[FMath::FloorToInt(Hash01(Seed, Salt) * UE_ARRAY_COUNT(ArtColours)) % UE_ARRAY_COUNT(ArtColours)];
}
}

void AFlowFestWorld::BuildStructures()
{
    TArray<FPiece> Plan = SitePlan();
    TMap<FString, UHierarchicalInstancedStaticMeshComponent*> Groups;
    const auto GroupFor = [this, &Groups](const TCHAR* Name) -> UHierarchicalInstancedStaticMeshComponent*
    {
        if (UHierarchicalInstancedStaticMeshComponent** Found = Groups.Find(Name)) return *Found;
        UHierarchicalInstancedStaticMeshComponent* Group = nullptr;
        if (UStaticMesh* Mesh = StructureMesh(Name))
        {
            Group = AddInstanceGroup(Mesh, FString(TEXT("Structures_")) + Name);
            // Colour A, colour B and a ring count; plain meshes ignore them.
            Group->SetNumCustomDataFloats(7);
        }
        else UE_LOG(LogTemp, Warning, TEXT("Flow Fest structure mesh missing: %s; run Tools/import-structures.py"), Name);
        Groups.Add(Name, Group);
        return Group;
    };
    const auto Place = [&GroupFor](const TCHAR* Name, const FTransform& Transform, const FLinearColor& A, const FLinearColor& B = FLinearColor::White, float Rings = 5.f)
    {
        UHierarchicalInstancedStaticMeshComponent* Group = GroupFor(Name);
        if (!Group) return;
        const int32 Index = Group->AddInstance(Transform);
        const float Data[] = { A.R, A.G, A.B, B.R, B.G, B.B, Rings };
        Group->SetCustomData(Index, Data);
    };

    // Legs stand on the lowest corner and floors on the highest; gear that shares a
    // footprint, or a porch built against a building, takes the height of the piece it belongs to.
    const auto BaseHeight = [this, &Plan](int32 Index) -> float
    {
        const FPiece& Piece = Plan[Index];
        const FPiece* Owner = Piece.bAttached && Index > 0 ? &Plan[Index - 1] : &Piece;
        if (Piece.Size.X <= 0.f && Piece.Base != EBase::Centre)
            for (const FPiece& Other : Plan)
                if (Other.Size.X > 0.f && Other.At.Equals(Piece.At, .01f)) { Owner = &Other; break; }
        if (Owner->Base == EBase::Centre || Owner->Size.X <= 0.f) return SurfaceAt(Piece.At.X, Piece.At.Y);
        FVector2D Corners[4];
        const FVector2D Centre = FootprintCentre(*Owner);
        FootprintCorners(Centre, Owner->Bearing, Owner->Size - FVector2D(.4f, .4f), Corners);
        float Low = SurfaceAt(Centre.X, Centre.Y), High = Low;
        for (const FVector2D& Corner : Corners)
        {
            const float Z = SurfaceAt(Corner.X, Corner.Y);
            Low = FMath::Min(Low, Z);
            High = FMath::Max(High, Z);
        }
        return Owner->Base == EBase::Lowest ? Low : High;
    };

    // Trees standing inside a roof are the canopy scan reading the roof; clear them first,
    // from the drawn trees, their trunks, and the lists the lanterns and path art read.
    const auto Roofed = [&Plan](const FVector2D& At)
    {
        for (const FPiece& Piece : Plan)
            if (Piece.bClearsTrees && DistanceToFootprint(Piece, At) < .5f) return true;
        return false;
    };
    int32 Cleared = 0;
    for (UHierarchicalInstancedStaticMeshComponent* Group : InstanceGroups)
    {
        if (!Group) continue;
        const FString Name = Group->GetName();
        if (!Name.StartsWith(TEXT("Trees_")) && Name != TEXT("TreeTrunkCollision")) continue;
        TArray<int32> Remove;
        for (int32 I = 0; I < Group->GetInstanceCount(); ++I)
        {
            FTransform T;
            Group->GetInstanceTransform(I, T);
            if (Roofed(FVector2D(T.GetLocation()) / Cm)) Remove.Add(I);
        }
        if (Name != TEXT("TreeTrunkCollision")) Cleared += Remove.Num();
        if (Remove.Num()) Group->RemoveInstances(Remove);
    }
    for (UInstancedSkinnedMeshComponent* Group : TreeLiveGroups)
    {
        if (!Group) continue;
        TArray<FPrimitiveInstanceId> Remove;
        for (int32 I = 0; I < Group->GetInstanceCount(); ++I)
        {
            const FPrimitiveInstanceId Id = Group->GetInstanceId(I);
            FTransform T;
            if (Group->GetInstanceTransform(Id, T) && Roofed(FVector2D(T.GetLocation()) / Cm)) Remove.Add(Id);
        }
        Cleared += Remove.Num();
        if (Remove.Num()) Group->RemoveInstances(Remove);
    }
    Trees.RemoveAll([&Roofed](const FSiteTree& Tree) { return Roofed(Tree.Position); });
    FillTrees.RemoveAll([&Roofed](const FSiteTree& Tree) { return Roofed(Tree.Position); });

    // The pieces, and a hidden box over every closed one so walkers go round it.
    UHierarchicalInstancedStaticMeshComponent* Solids = AddInstanceGroup(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube")), TEXT("StructureCollision"));
    if (Solids)
    {
        Solids->SetCollisionProfileName(TEXT("BlockAll"));
        Solids->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
        Solids->SetHiddenInGame(true);
        Solids->SetCastShadow(false);
    }
    for (int32 Index = 0; Index < Plan.Num(); ++Index)
    {
        const FPiece& Piece = Plan[Index];
        const float Z = BaseHeight(Index);
        const FRotator Rotation(0.f, YawFromBearing(Piece.Bearing), 0.f);
        Place(Piece.Mesh, FTransform(Rotation, FVector(Piece.At.X * Cm, Piece.At.Y * Cm, Z)), Piece.Colour);
        if (Solids && Piece.SolidHeight > 0.f)
        {
            // From below the lowest ground under it to the solid height over the base.
            float Low = Z;
            FVector2D Corners[4];
            const FVector2D Centre = FootprintCentre(Piece);
            FootprintCorners(Centre, Piece.Bearing, Piece.Size, Corners);
            for (const FVector2D& Corner : Corners) Low = FMath::Min(Low, SurfaceAt(Corner.X, Corner.Y));
            const float Bottom = Low - 30.f, Top = Z + Piece.SolidHeight * Cm;
            Solids->AddInstance(FTransform(Rotation, FVector(Centre.X * Cm, Centre.Y * Cm, (Bottom + Top) * .5f),
                FVector(Piece.Size.X - .4f, Piece.Size.Y - .4f, (Top - Bottom) / Cm)));
        }
    }

    // Cones along the drive's edge at check-in, out of the running surface.
    const FSiteRoad* Loop = Roads.FindByPredicate([](const FSiteRoad& Road) { return Road.Id == TEXT("lower-campground-loop"); });
    if (Loop)
    {
        const float Offsets[] = { -5.5f, -2.5f, 3.f, 6.f };
        for (const FVector2D& At : RoadEdgePoints(SmoothRoad(Loop->Points), FVector2D(317.f, -116.2f), Offsets, Loop->Width * .5f + .35f))
            Place(TEXT("Cone"), FTransform(FRotator(0.f, Hash01(static_cast<uint32>(FMath::RoundToInt(At.X * 10.f)), 3) * 360.f, 0.f), FVector(At.X * Cm, At.Y * Cm, SurfaceAt(At.X, At.Y))), FLinearColor::White);
    }

    BuildGroundPatches();

    // The decorated path: ropes from tree to tree, or to a stake, across the walk, hung with
    // painted panels, hoops with streamers, or paper lanterns, all of it unlit.
    const FSiteRoad* Walk = Roads.FindByPredicate([](const FSiteRoad& Road) { return Road.Id == TEXT("middle-to-lower"); });
    if (!Walk) return;
    TArray<FVector2D> Trunks;
    for (const FSiteTree& Tree : Trees) Trunks.Add(Tree.Position);
    for (const FSiteTree& Tree : FillTrees) Trunks.Add(Tree.Position);
    const TArray<FPathArtSpan> Spans = PlanPathArt(SmoothRoad(Walk->Points), Trunks, Plan, PathArtMinEast, PathArtMaxEast);
    UStaticMesh* Cylinder = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
    UHierarchicalInstancedStaticMeshComponent* Rope = AddInstanceGroup(Cylinder, TEXT("PathArtRope"), LoadMaterial(TEXT("M_Wood")));
    UHierarchicalInstancedStaticMeshComponent* Stakes = AddInstanceGroup(Cylinder, TEXT("PathArtStakes"), LoadMaterial(TEXT("M_Wood")));
    if (Rope) Rope->SetCastShadow(false);
    const auto Hang = [](const TCHAR* Name) { const UStaticMesh* Mesh = StructureMesh(Name); return Mesh ? Mesh->GetBounds().GetBox() : FBox(FVector(-10.f), FVector(10.f)); };
    const FBox PanelBox = Hang(TEXT("ArtPanel")), RingBox = Hang(TEXT("RingStreamers")), LanternBox = Hang(TEXT("PaperLantern"));
    const float LongestDrop = FMath::Max3(PanelBox.Max.Z - PanelBox.Min.Z, RingBox.Max.Z - RingBox.Min.Z, LanternBox.Max.Z - LanternBox.Min.Z);
    constexpr float Sag = 35.f, Headroom = 230.f;
    int32 Hung = 0;
    for (const FPathArtSpan& Span : Spans)
    {
        const float Ground = FMath::Max3(SurfaceAt(Span.Ends[0].X, Span.Ends[0].Y), SurfaceAt(Span.Ends[1].X, Span.Ends[1].Y), SurfaceAt(Span.Centre.X, Span.Centre.Y));
        // High enough that the lowest hanging thing still clears a walker's head at the centre.
        const float Top = Ground + FMath::Max(420.f, Headroom + LongestDrop + Sag + 15.f);
        FVector Ends[2];
        for (int32 E = 0; E < 2; ++E)
        {
            // A rope ties round the near side of a trunk; a stake stands a little taller than the tie.
            const FVector2D Tie = Span.bTree[E] ? Span.Ends[E] + (Span.Centre - Span.Ends[E]).GetSafeNormal() * .25f : Span.Ends[E];
            Ends[E] = FVector(Tie.X * Cm, Tie.Y * Cm, Top);
            if (!Span.bTree[E] && Stakes)
            {
                const float Foot = SurfaceAt(Tie.X, Tie.Y), Height = Top + 20.f - Foot;
                Stakes->AddInstance(FTransform(FRotator(0.f, 0.f, (Hash01(Span.Seed, 31 + E) - .5f) * 4.f), FVector(Tie.X * Cm, Tie.Y * Cm, Foot + Height * .5f), FVector(.09f, .09f, Height / Cm)));
            }
        }
        const auto RopeAt = [&Ends](float T) { return FMath::Lerp(Ends[0], Ends[1], T) - FVector(0.f, 0.f, 4.f * Sag * T * (1.f - T)); };
        if (Rope)
        {
            constexpr int32 Segments = 8;
            for (int32 S = 0; S < Segments; ++S)
            {
                const FVector A = RopeAt(float(S) / Segments), B = RopeAt(float(S + 1) / Segments);
                Rope->AddInstance(FTransform(FRotationMatrix::MakeFromZ(B - A).Rotator(), (A + B) * .5f, FVector(.025f, .025f, (B - A).Size() / Cm)));
            }
        }
        // Where the rope crosses the walk, and the hung pieces either side of that point.
        const FVector2D L(Ends[0].X / Cm, Ends[0].Y / Cm), R(Ends[1].X / Cm, Ends[1].Y / Cm);
        const float Length = FVector2D::Distance(L, R);
        if (Length < 1.f) continue;
        const float Cross = FMath::Clamp(FVector2D::DotProduct(Span.Centre - L, (R - L) / Length) / Length, .1f, .9f);
        const float Yaw = FMath::RadiansToDegrees(FMath::Atan2(Span.Along.Y, Span.Along.X));
        const TCHAR* Name = Span.Kind == EPathArt::Panels ? TEXT("ArtPanel") : Span.Kind == EPathArt::Rings ? TEXT("RingStreamers") : TEXT("PaperLantern");
        const FBox& Box = Span.Kind == EPathArt::Panels ? PanelBox : Span.Kind == EPathArt::Rings ? RingBox : LanternBox;
        const TArray<float> Across = Span.Kind == EPathArt::Panels ? TArray<float>{ -.6f, .6f } : Span.Kind == EPathArt::Rings ? TArray<float>{ -.95f, 0.f, .95f } : TArray<float>{ -1.2f, -.6f, 0.f, .6f, 1.2f };
        for (int32 K = 0; K < Across.Num(); ++K)
        {
            const float T = FMath::Clamp(Cross + Across[K] / Length, .05f, .95f);
            const FVector At = RopeAt(T) - FVector(0.f, 0.f, Box.Max.Z);
            const uint32 Key = Span.Seed * 8 + K;
            Place(Name, FTransform(FRotator(0.f, Yaw + (Hash01(Key, 41) - .5f) * 16.f, 0.f), At),
                ArtColour(Key, 43), ArtColour(Key, 47), 3.f + FMath::FloorToInt(Hash01(Key, 53) * 5.f));
            ++Hung;
        }
    }
    UE_LOG(LogTemp, Display, TEXT("Flow Fest structures: %d pieces, %d trees cleared under roofs, %d art spans with %d hung pieces"),
           Plan.Num(), Cleared, Spans.Num(), Hung);
}

void AFlowFestWorld::BuildGroundPatches()
{
    UMaterialInterface* Material = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/FlowFest/Assets/Structures/M_Structures_GroundPatch.M_Structures_GroundPatch"));
    if (!Material) return;
    TArray<FVector> Vertices; TArray<int32> Triangles; TArray<FVector> Normals;
    TArray<FVector2D> UVs; TArray<FLinearColor> Colors; TArray<FProcMeshTangent> Tangents;
    constexpr float Fade = .8f, Lift = 2.f;
    for (const FGroundPatch& Patch : SitePatches())
    {
        // A metre grid over the patch and its fading rim, draped on the rendered ground.
        const float HalfDepth = Patch.Size.X * .5f + Fade, HalfWidth = Patch.Size.Y * .5f + Fade;
        const int32 Rows = FMath::CeilToInt(HalfDepth * 2.f) + 1, Columns = FMath::CeilToInt(HalfWidth * 2.f) + 1;
        const int32 Start = Vertices.Num();
        for (int32 Row = 0; Row < Rows; ++Row)
            for (int32 Column = 0; Column < Columns; ++Column)
            {
                const float Ahead = -HalfDepth + 2.f * HalfDepth * Row / (Rows - 1);
                const float Right = -HalfWidth + 2.f * HalfWidth * Column / (Columns - 1);
                const FVector2D P = LocalToSite(Patch.At, Patch.Bearing, Ahead, Right);
                const float Dx = SampleGround(P.X + 1.f, P.Y) - SampleGround(P.X - 1.f, P.Y);
                const float Dy = SampleGround(P.X, P.Y + 1.f) - SampleGround(P.X, P.Y - 1.f);
                const float Edge = FMath::Min(HalfDepth - FMath::Abs(Ahead), HalfWidth - FMath::Abs(Right));
                Vertices.Add(FVector(P.X * Cm, P.Y * Cm, SurfaceAt(P.X, P.Y) + Lift));
                Normals.Add(FVector(-Dx, -Dy, 200.f).GetSafeNormal());
                UVs.Add(P);
                Colors.Add(FLinearColor(FMath::Clamp(Edge / Fade, 0.f, 1.f), Patch.Trampled, 0.f, 1.f));
                Tangents.Add(FProcMeshTangent(1.f, 0.f, 0.f));
            }
        for (int32 Row = 1; Row < Rows; ++Row)
            for (int32 Column = 1; Column < Columns; ++Column)
            {
                const int32 A = Start + (Row - 1) * Columns + Column - 1, C = A + Columns;
                Triangles.Append({ A, A + 1, C, A + 1, C + 1, C });
            }
    }
    UProceduralMeshComponent* Mesh = NewObject<UProceduralMeshComponent>(this, TEXT("StructureGround"));
    Mesh->SetupAttachment(SiteRoot);
    Mesh->RegisterComponent();
    Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Mesh->SetCastShadow(false);
    Mesh->CreateMeshSection_LinearColor(0, Vertices, Triangles, Normals, UVs, Colors, Tangents, false);
    Mesh->SetMaterial(0, Material);
}
