#include "FlowFestEcologyComponent.h"
#include "FlowFestWorld.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Dom/JsonObject.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Math/RandomStream.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Engine/StaticMesh.h"

namespace
{
float Num(const TSharedPtr<FJsonObject>& Object, const TCHAR* Key, float Default = 0.f)
{
    double Value = Default;
    return Object->TryGetNumberField(Key, Value) ? static_cast<float>(Value) : Default;
}

UStaticMesh* LoadMesh(const TCHAR* Folder, const TCHAR* Name)
{
    const FString Path = FString::Printf(TEXT("/Game/FlowFest/Assets/%s/%s.%s"), Folder, Name, Name);
    return LoadObject<UStaticMesh>(nullptr, *Path);
}

struct FGrassPlacement
{
    FVector2D At;
    float Ground = 0.f;
    float Rotation = 0.f;
    float Width = 0.285f;
    float Height = 0.35f;
    bool bShade = false;
    int32 Tier = 0;
    int32 ColorIndex = 0;
};

/** A parked car's footprint, so grass is cleared under it and trampled around it. */
struct FCarFootprint
{
    FVector2D At;
    FVector2D Nose;
};

/** Signed distance in metres from a point to the nearest car's body; negative is underneath. */
float CarClearance(const TArray<FCarFootprint>& Cars, const FVector2D& At)
{
    constexpr float HalfLength = 2.5f, HalfWidth = 1.05f;
    float Nearest = TNumericLimits<float>::Max();
    for (const FCarFootprint& Car : Cars)
    {
        const FVector2D Delta = At - Car.At;
        if (Delta.SizeSquared() > 49.f) continue;
        const float Along = FMath::Abs(FVector2D::DotProduct(Delta, Car.Nose)) - HalfLength;
        const float Across = FMath::Abs(FVector2D::CrossProduct(Car.Nose, Delta)) - HalfWidth;
        Nearest = FMath::Min(Nearest, FMath::Max(Along, Across));
    }
    return Nearest;
}

/** Distance in metres from a point to the nearest road or path edge. */
float RoadClearance(const TArray<TPair<TArray<FVector2D>, float>>& Roads, const FVector2D& At)
{
    float Nearest = TNumericLimits<float>::Max();
    for (const TPair<TArray<FVector2D>, float>& Road : Roads)
        for (int32 Index = 1; Index < Road.Key.Num(); ++Index)
        {
            const FVector2D A = Road.Key[Index - 1], B = Road.Key[Index];
            const FVector2D Segment = B - A;
            const float T = FMath::Clamp(FVector2D::DotProduct(At - A, Segment) / FMath::Max(Segment.SizeSquared(), 1e-4f), 0.f, 1.f);
            Nearest = FMath::Min(Nearest, FVector2D::Distance(At, A + Segment * T) - Road.Value * .5f);
        }
    return Nearest;
}
}

UFlowFestEcologyComponent::UFlowFestEcologyComponent()
{
    PrimaryComponentTick.bCanEverTick = false;
}

bool UFlowFestEcologyComponent::BuildFromSite(AFlowFestWorld* SiteWorld)
{
    for (UHierarchicalInstancedStaticMeshComponent* Group : Groups)
        if (Group) Group->DestroyComponent();
    Groups.Reset();
    WindMaterials.Reset();
    FString Source;
    if (!FFileHelper::LoadFileToString(Source, *(FPaths::ProjectContentDir() / TEXT("Data/site.json")))) return false;
    TSharedPtr<FJsonObject> Site;
    if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Source), Site) || !Site.IsValid()) return false;

    const auto AddGroup = [&](UStaticMesh* Mesh, bool bCastShadow, int32 CullEndCm, int32 CustomFloats)
    {
        UHierarchicalInstancedStaticMeshComponent* Group = NewObject<UHierarchicalInstancedStaticMeshComponent>(GetOwner());
        Group->SetStaticMesh(Mesh);
        Group->SetupAttachment(this);
        Group->RegisterComponent();
        Group->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        Group->SetCastShadow(bCastShadow);
        Group->SetCullDistances(0, CullEndCm);
        if (CustomFloats) Group->SetNumCustomDataFloats(CustomFloats);
        for (int32 Slot = 0; Slot < Mesh->GetStaticMaterials().Num(); ++Slot)
        {
            UMaterialInterface* ParentMaterial = Mesh->GetMaterial(Slot);
            if (!ParentMaterial) continue;
            UMaterialInstanceDynamic* Dynamic = UMaterialInstanceDynamic::Create(ParentMaterial, this);
            Dynamic->SetScalarParameterValue(TEXT("WindStrength"), WindStrength);
            Group->SetMaterial(Slot, Dynamic);
            WindMaterials.Add(Dynamic);
        }
        Groups.Add(Group);
        return Group;
    };

    // Field grass. Each source tuft becomes a ragged metre-wide meadow patch with
    // stubble around it, and fill patches cover the open ground between them, so the
    // field reads as continuous growth that thins out instead of stamped blobs.
    const TCHAR* GrassMeshes[GrassGroupCount] = { TEXT("MeadowPatch"), TEXT("StubbleTuft"), TEXT("SeedStalks") };
    float GrassSourceHeight[GrassGroupCount];
    for (int32 Index = 0; Index < GrassGroupCount; ++Index)
    {
        UStaticMesh* Mesh = LoadMesh(TEXT("Meadow"), GrassMeshes[Index]);
        if (!Mesh)
        {
            UE_LOG(LogTemp, Warning, TEXT("Flow Fest grass mesh unavailable: %s"), GrassMeshes[Index]);
            return false;
        }
        // Stubble is short enough to stop drawing sooner than the patches it fills between.
        AddGroup(Mesh, false, Index == 1 ? 9000 : 16000, 2);
        GrassSourceHeight[Index] = FMath::Max(1.f, Mesh->GetBounds().BoxExtent.Z * 2.f);
    }

    const TArray<TSharedPtr<FJsonValue>>* Items = nullptr;
    if (!Site->TryGetArrayField(TEXT("grass"), Items) || !Items) return false;
    const int32 ExpectedGrass = Items->Num();
    TArray<FGrassPlacement> Grass;
    Grass.Reserve(ExpectedGrass);
    for (const TSharedPtr<FJsonValue>& Value : *Items)
    {
        const TSharedPtr<FJsonObject> Placement = Value->AsObject();
        if (!Placement.IsValid()) continue;
        FGrassPlacement& Tuft = Grass.AddDefaulted_GetRef();
        Tuft.At = FVector2D(Num(Placement, TEXT("x")), Num(Placement, TEXT("z")));
        // Exported y is already relative to the site's NAVD88 vertical origin.
        Tuft.Ground = Num(Placement, TEXT("y")) * 100.f;
        Tuft.Rotation = -FMath::RadiansToDegrees(Num(Placement, TEXT("rotation")));
        Tuft.Width = Num(Placement, TEXT("widthMeters"), .285f);
        Tuft.Height = Num(Placement, TEXT("heightMeters"), .35f);
        Tuft.bShade = Placement->GetStringField(TEXT("species")) == TEXT("woodland-grass");
        const FString Tier = Placement->GetStringField(TEXT("tier"));
        Tuft.Tier = Tier == TEXT("high") ? 2 : Tier == TEXT("medium") ? 1 : 0;
        Tuft.ColorIndex = FMath::Clamp(FMath::RoundToInt(Num(Placement, TEXT("colorIndex"))), 0, 3);
    }

    TArray<FCarFootprint> Cars;
    if (Site->TryGetArrayField(TEXT("vehicles"), Items) && Items)
        for (const TSharedPtr<FJsonValue>& Value : *Items)
            if (const TSharedPtr<FJsonObject> Car = Value->AsObject())
            {
                // The web's yaw turns the nose to (cos, -sin) in east/south (BuildVehicles).
                const float Yaw = Num(Car, TEXT("rotation"));
                Cars.Add({ FVector2D(Num(Car, TEXT("x")), Num(Car, TEXT("z"))), FVector2D(FMath::Cos(Yaw), -FMath::Sin(Yaw)) });
            }
    TArray<TPair<TArray<FVector2D>, float>> Roads;
    if (Site->TryGetArrayField(TEXT("roads"), Items) && Items)
        for (const TSharedPtr<FJsonValue>& Value : *Items)
            if (const TSharedPtr<FJsonObject> Road = Value->AsObject())
            {
                TPair<TArray<FVector2D>, float>& Line = Roads.AddDefaulted_GetRef();
                Line.Value = Num(Road, TEXT("width"), 3.f);
                const TArray<TSharedPtr<FJsonValue>>* Points = nullptr;
                if (Road->TryGetArrayField(TEXT("points"), Points) && Points)
                    for (const TSharedPtr<FJsonValue>& Point : *Points)
                    {
                        const TArray<TSharedPtr<FJsonValue>>& Pair = Point->AsArray();
                        if (Pair.Num() >= 2) Line.Key.Add(FVector2D(Pair[0]->AsNumber(), Pair[1]->AsNumber()));
                    }
            }

    // How crowded each placement's neighbourhood is. A patch at the edge of the
    // source's growth is shorter, smaller and drier, so a field fades out softly.
    TMap<FIntPoint, TArray<int32>> Cells;
    const auto CellOf = [](const FVector2D& At) { return FIntPoint(FMath::FloorToInt(At.X / 4.f), FMath::FloorToInt(At.Y / 4.f)); };
    for (int32 Index = 0; Index < Grass.Num(); ++Index) Cells.FindOrAdd(CellOf(Grass[Index].At)).Add(Index);
    const auto Fullness = [&](const FVector2D& At)
    {
        const FIntPoint Cell = CellOf(At);
        int32 Count = 0;
        for (int32 Y = -2; Y <= 2; ++Y)
            for (int32 X = -2; X <= 2; ++X)
                if (const TArray<int32>* Members = Cells.Find(Cell + FIntPoint(X, Y)))
                    for (int32 Member : *Members)
                        Count += FVector2D::DistSquared(Grass[Member].At, At) < 64.f;
        // A placement deep in the source's growth has about eight neighbours within 8 m.
        return FMath::Clamp((Count - 1) / 7.f, 0.f, 1.f);
    };

    // The nearest source placement within Reach metres, or INDEX_NONE.
    const auto Nearest = [&](const FVector2D& At, float Reach, float& Distance)
    {
        const FIntPoint Cell = CellOf(At);
        int32 Found = INDEX_NONE;
        float Best = Reach * Reach;
        for (int32 Y = -2; Y <= 2; ++Y)
            for (int32 X = -2; X <= 2; ++X)
                if (const TArray<int32>* Members = Cells.Find(Cell + FIntPoint(X, Y)))
                    for (int32 Member : *Members)
                    {
                        const float Squared = FVector2D::DistSquared(Grass[Member].At, At);
                        if (Squared < Best) { Best = Squared; Found = Member; }
                    }
        Distance = FMath::Sqrt(Best);
        return Found;
    };

    static const float ColorDryness[4] = { -.16f, -.05f, .07f, .18f };
    static const float TierScale[3] = { .85f, 1.1f, 1.4f };
    int32 Cleared = 0, Trampled = 0, Filled = 0, Stubble = 0, Stalks = 0;
    const auto Add = [&](int32 Group, const FVector2D& At, float Ground, float Yaw, const FVector& Scale, float Dryness, float Brightness, FRandomStream& Random)
    {
        const FRotator Lean(Random.FRandRange(-6.f, 6.f), Yaw, Random.FRandRange(-6.f, 6.f));
        const int32 Instance = Groups[Group]->AddInstance(FTransform(Lean, FVector(At.X * 100.f, At.Y * 100.f, Ground), Scale));
        Groups[Group]->SetCustomData(Instance, { FMath::Clamp(Dryness, 0.f, 1.f), Brightness });
    };
    // One meadow patch with its seed stalks and the stubble around it. Edge is how far
    // toward the growth's outer limit the patch sits: 0 inside it, 1 at the last fill.
    const auto Grow = [&](const FGrassPlacement& Tuft, float Edge, FRandomStream& Random)
    {
        const float Car = CarClearance(Cars, Tuft.At);
        if (Car < -.2f) { ++Cleared; return; }
        // Within a metre and a half of a car the grass is walked flat and browned.
        const float Trodden = Car < 1.5f ? 1.f - FMath::Clamp((Car + .2f) / 1.7f, 0.f, 1.f) : 0.f;
        Trampled += Trodden > 0.f;
        const float Full = Fullness(Tuft.At) * (1.f - Edge);
        const float Patchiness = FMath::PerlinNoise2D(Tuft.At / 26.f) * .3f;
        const float Dryness = (Tuft.bShade ? .08f : .42f) + ColorDryness[Tuft.ColorIndex] + Patchiness
            + (1.f - Full) * .25f + Trodden * .3f;
        const float Brightness = (Tuft.bShade ? .74f : .96f) * Random.FRandRange(.88f, 1.12f);
        // Broad hollows where the sward grows short and thin, so a full field still varies.
        const float Thin = FMath::Clamp(-FMath::PerlinNoise2D(Tuft.At / 17.f + FVector2D(31.f, 7.f)) * 2.2f, 0.f, 1.f);
        const float Stature = TierScale[Tuft.Tier] * FMath::Lerp(.6f, 1.f, Full) * (1.f - .6f * Trodden) * (1.f - .45f * Thin);
        const float PatchHeight = Tuft.Height * 100.f * Stature / GrassSourceHeight[0] * 1.15f;
        const float Spread = Tuft.Width / .285f * FMath::Lerp(1.05f, 1.7f, Full) * (1.f - .3f * Trodden);
        Add(0, Tuft.At, Tuft.Ground, Tuft.Rotation, FVector(Spread, Spread, PatchHeight), Dryness + Thin * .15f, Brightness, Random);

        // Tall sunny placements and the driest clumps send up seed stalks.
        if (!Tuft.bShade && Trodden == 0.f && Thin < .5f && (Tuft.Tier == 2 || (Dryness > .55f && Random.FRand() < .3f)))
        {
            const FVector2D At = Tuft.At + FVector2D(Random.FRandRange(-.35f, .35f), Random.FRandRange(-.35f, .35f));
            const float Size = Random.FRandRange(.8f, 1.2f) * FMath::Lerp(.7f, 1.f, Full);
            Add(2, At, Tuft.Ground, Random.FRandRange(0.f, 360.f), FVector(Size, Size, Size * Random.FRandRange(.85f, 1.2f)),
                Dryness + .25f, Brightness * 1.05f, Random);
            ++Stalks;
        }
        // Stubble fills between this patch and its neighbours and runs a little past the
        // growth's edge, but never onto a road or under a car.
        const int32 Sprigs = Edge > 0.f ? 2 : 3;
        for (int32 Sprig = 0; Sprig < Sprigs; ++Sprig)
        {
            const float Angle = Random.FRandRange(0.f, UE_TWO_PI);
            const FVector2D At = Tuft.At + FVector2D(FMath::Cos(Angle), FMath::Sin(Angle)) * Random.FRandRange(.7f, 2.f);
            if (CarClearance(Cars, At) < .3f || RoadClearance(Roads, At) < .4f) continue;
            const float Ground = SiteWorld ? SiteWorld->SampleGround(At.X, At.Y) - 2.f : Tuft.Ground;
            const float Size = Random.FRandRange(.8f, 1.5f);
            Add(1, At, Ground, Random.FRandRange(0.f, 360.f), FVector(Size, Size, Size * Random.FRandRange(.7f, 1.3f) * FMath::Lerp(.75f, 1.f, Full)),
                Dryness + .12f, Brightness * .97f, Random);
            ++Stubble;
        }
    };
    for (int32 Index = 0; Index < Grass.Num(); ++Index)
    {
        FRandomStream Random(Index * 7919 + 17);
        Grow(Grass[Index], 0.f, Random);
    }

    // The source keeps two of three cells on a 4 m grid, with dense lawns only around
    // the camps, so its patches alone leave bare dirt between them. Fill the field on a
    // jittered 1.6 m grid, each fill patch borrowing the nearest source placement's
    // shade, tint and stature, and thin out between 3.5 and 6 m from the last one so
    // the field ends softly. Woodland floors fill at under half the meadow's density.
    if (SiteWorld && Grass.Num())
    {
        FBox2D Field(ForceInit);
        for (const FGrassPlacement& Tuft : Grass) Field += Tuft.At;
        constexpr float Spacing = 1.6f;
        const int32 Columns = FMath::CeilToInt(Field.GetSize().X / Spacing), Rows = FMath::CeilToInt(Field.GetSize().Y / Spacing);
        for (int32 Row = 0; Row <= Rows; ++Row)
            for (int32 Column = 0; Column <= Columns; ++Column)
            {
                FRandomStream Random(Row * 104729 + Column * 7919 + 3);
                const FVector2D At = Field.Min + FVector2D(Column + Random.FRandRange(-.4f, .4f), Row + Random.FRandRange(-.4f, .4f)) * Spacing;
                float Distance = 0.f;
                const int32 NearIndex = Nearest(At, 6.f, Distance);
                // Inside a source patch already, or past the growth's edge.
                if (NearIndex == INDEX_NONE || Distance < .9f) continue;
                const FGrassPlacement& Near = Grass[NearIndex];
                const float Edge = FMath::SmoothStep(3.5f, 6.f, Distance);
                if (Random.FRand() < Edge || (Near.bShade && Random.FRand() < .55f)) continue;
                if (RoadClearance(Roads, At) < .5f) continue;
                FGrassPlacement Fill = Near;
                Fill.At = At;
                Fill.Ground = SiteWorld->SampleGround(At.X, At.Y) - 2.f;
                Fill.Rotation = Random.FRandRange(0.f, 360.f);
                Fill.Width *= Random.FRandRange(.85f, 1.15f);
                Fill.Height *= Random.FRandRange(.8f, 1.1f);
                // Tall tiers stay where the source put them; the fill between grows medium at most.
                Fill.Tier = FMath::Min(Near.Tier, Random.FRand() < .3f ? 1 : 0);
                ++Filled;
                Grow(Fill, Edge, Random);
            }
    }

    // Understory: damp sedge and hazel keep their source meshes and placements.
    struct FFamily { const TCHAR* Asset; const TCHAR* Species; };
    const FFamily Families[] = {
        { TEXT("DampSedge"), TEXT("damp-sedge-tussock") },
        { TEXT("HazelShrub"), TEXT("woodland-hazel-shrub") },
    };
    if (!Site->TryGetArrayField(TEXT("groundLife"), Items) || !Items) return false;
    const int32 ExpectedGroundLife = Items->Num();
    int32 GroundLife = 0;
    for (const FFamily& Family : Families)
    {
        UStaticMesh* Mesh = LoadMesh(TEXT("Ecology"), Family.Asset);
        if (!Mesh)
        {
            UE_LOG(LogTemp, Warning, TEXT("Flow Fest ecology mesh unavailable: %s"), Family.Asset);
            continue;
        }
        UHierarchicalInstancedStaticMeshComponent* Group = AddGroup(Mesh, true, 9000, 0);
        Group->SetCullDistances(800, 9000);
        for (const TSharedPtr<FJsonValue>& Value : *Items)
        {
            const TSharedPtr<FJsonObject> Placement = Value->AsObject();
            if (!Placement.IsValid() || Placement->GetStringField(TEXT("species")) != Family.Species) continue;
            const float Rotation = -FMath::RadiansToDegrees(Num(Placement, TEXT("rotation")));
            const FVector Location(Num(Placement, TEXT("x")) * 100.f, Num(Placement, TEXT("z")) * 100.f, Num(Placement, TEXT("y")) * 100.f);
            Group->AddInstance(FTransform(FRotator(0.f, Rotation, 0.f), Location, FVector(Num(Placement, TEXT("scale"), 1.f))));
            ++GroundLife;
        }
    }
    UE_LOG(LogTemp, Display, TEXT("Flow Fest native ecology: %d grass placements and %d fill patches (%d cleared under cars, %d trampled), %d stubble, %d seed stalks; %d of %d understory in %d groups"),
        Grass.Num(), Filled, Cleared, Trampled, Stubble, Stalks, GroundLife, ExpectedGroundLife, Groups.Num());
    return Groups.Num() == GrassGroupCount + 2 && Grass.Num() == ExpectedGrass && ExpectedGrass > 0 && GroundLife == ExpectedGroundLife;
}

void UFlowFestEcologyComponent::SetViewDistances(float GrassNearCm, float GrassFarCm, float UnderstoryFarCm)
{
    for (int32 Index = 0; Index < Groups.Num(); ++Index)
        if (Groups[Index]) Groups[Index]->SetCullDistances(FMath::RoundToInt(GrassNearCm), FMath::RoundToInt(Index < GrassGroupCount ? GrassFarCm : UnderstoryFarCm));
}

void UFlowFestEcologyComponent::SetWindStrength(float Strength)
{
    WindStrength = FMath::Clamp(Strength, 0.f, 1.f);
    for (UMaterialInstanceDynamic* Material : WindMaterials)
        if (Material) Material->SetScalarParameterValue(TEXT("WindStrength"), WindStrength);
}
