#include "MuseumWorld.h"
#include "MuseumPerformerStation.h"
#include "MuseumCharacter.h"
#include "Components/BoxComponent.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/SceneComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
#include "Misc/FileHelper.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
constexpr float TileCm = 50.f;
FVector TilePosition(int32 X, int32 Y, float Z = 0.f) { return FVector(X * TileCm, Y * TileCm, Z); }
FString StringField(const TSharedPtr<FJsonObject>& Object, const TCHAR* Name)
{
    FString Value;
    if (Object.IsValid()) Object->TryGetStringField(Name, Value);
    return Value;
}
double NumberField(const TSharedPtr<FJsonObject>& Object, const TCHAR* Name, double Fallback = 0)
{
    double Value = Fallback;
    if (Object.IsValid()) Object->TryGetNumberField(Name, Value);
    return Value;
}
TSharedPtr<FJsonObject> ObjectField(const TSharedPtr<FJsonObject>& Parent, const TCHAR* Name)
{
    const TSharedPtr<FJsonObject>* Found = nullptr;
    return Parent.IsValid() && Parent->TryGetObjectField(Name, Found) ? *Found : nullptr;
}
void AddCube(UHierarchicalInstancedStaticMeshComponent* Component, const FVector& Position, const FVector& Scale)
{
    Component->AddInstance(FTransform(FRotator::ZeroRotator, Position, Scale));
}
FVector2D PlanPoint(const TSharedPtr<FJsonObject>& Object)
{
    return FVector2D(NumberField(Object, TEXT("x")) * 100.f, NumberField(Object, TEXT("z")) * 100.f);
}
bool InCourt(const TArray<FVector2D>& Outline, const FVector2D& Point)
{
    bool bInside = false;
    for (int32 I = 0, J = Outline.Num() - 1; I < Outline.Num(); J = I++)
    {
        const FVector2D& A = Outline[I];
        const FVector2D& B = Outline[J];
        if ((A.Y > Point.Y) != (B.Y > Point.Y) &&
            Point.X < A.X + (Point.Y - A.Y) * (B.X - A.X) / (B.Y - A.Y)) bInside = !bInside;
    }
    return bInside;
}
}

AMuseumWorld::AMuseumWorld()
{
    PrimaryActorTick.bCanEverTick = true;
    PrimaryActorTick.bStartWithTickEnabled = false;
    USceneComponent* Scene = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
    SetRootComponent(Scene);
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(TEXT("/Engine/BasicShapes/Cube.Cube"));
    auto MakeGroup = [this](const TCHAR* Name, bool bCollision)
    {
        UHierarchicalInstancedStaticMeshComponent* Group = CreateDefaultSubobject<UHierarchicalInstancedStaticMeshComponent>(Name);
        Group->SetupAttachment(GetRootComponent());
        Group->SetStaticMesh(Cube.Object);
        Group->SetCollisionEnabled(bCollision ? ECollisionEnabled::QueryAndPhysics : ECollisionEnabled::NoCollision);
        Group->SetCollisionResponseToAllChannels(bCollision ? ECR_Block : ECR_Ignore);
        return Group;
    };
    Floors = MakeGroup(TEXT("Floors"), false);
    CaveFloorCollision = MakeGroup(TEXT("CaveFloorCollision"), true);
    CaveFloorCollision->SetHiddenInGame(true);
    CaveWallCollision = MakeGroup(TEXT("CaveWallCollision"), true);
    CaveWallCollision->SetHiddenInGame(true);
    Corridors = MakeGroup(TEXT("Corridors"), true);
    Walls = MakeGroup(TEXT("Walls"), true);
    Displays = MakeGroup(TEXT("Displays"), true);
    Performers = MakeGroup(TEXT("PerformerStations"), true);
    Furniture = MakeGroup(TEXT("Furniture"), false);
    auto SetMaterial = [](UHierarchicalInstancedStaticMeshComponent* Component, const TCHAR* Path)
    {
        if (UMaterialInterface* Material = LoadObject<UMaterialInterface>(nullptr, Path, nullptr, LOAD_NoWarn | LOAD_Quiet))
            Component->SetMaterial(0, Material);
    };
    SetMaterial(Floors, TEXT("/Game/MuseumGame/Materials/M_Floor.M_Floor"));
    SetMaterial(Corridors, TEXT("/Game/MuseumGame/Materials/M_Floor.M_Floor"));
    SetMaterial(Walls, TEXT("/Game/MuseumGame/Materials/M_Wall.M_Wall"));
    SetMaterial(Displays, TEXT("/Game/MuseumGame/Materials/M_Display.M_Display"));
    SetMaterial(Performers, TEXT("/Game/MuseumGame/Materials/M_Performer.M_Performer"));
    SetMaterial(Furniture, TEXT("/Game/MuseumGame/Materials/M_Furniture.M_Furniture"));
}

void AMuseumWorld::BeginPlay()
{
    Super::BeginPlay();
    bLoaded = LoadMuseum();
    UE_LOG(LogTemp, Display, TEXT("MuseumGame layout %s: %d rooms, %d exhibits, %d performers"),
        bLoaded ? TEXT("loaded") : TEXT("FAILED"), Rooms.Num(), Exhibits.Num(), PerformerCount);
    if (FParse::Param(FCommandLine::Get(), TEXT("MuseumPlaybackSmoke")))
    {
        SmokeStage = 0;
        SetActorTickEnabled(true);
    }
    if (FParse::Param(FCommandLine::Get(), TEXT("MuseumProgressionSmoke")))
    {
        ProgressionSmokeStage = 0;
        SetActorTickEnabled(true);
    }
}

void AMuseumWorld::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if (SmokeStage >= 0) RunPlaybackSmoke(DeltaSeconds);
    if (ProgressionSmokeStage >= 0) RunProgressionSmoke(DeltaSeconds);
}

bool AMuseumWorld::LoadMuseum()
{
    const FString Path = FPaths::Combine(FPaths::ProjectContentDir(), TEXT("Data/museum.json"));
    FString Source;
    if (!FFileHelper::LoadFileToString(Source, *Path))
    {
        UE_LOG(LogTemp, Error, TEXT("MuseumGame missing layout: %s. Run Tools/bootstrap.ps1."), *Path);
        return false;
    }
    TSharedPtr<FJsonObject> Root;
    if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Source), Root) || !Root.IsValid() || NumberField(Root, TEXT("version")) != 1)
    {
        UE_LOG(LogTemp, Error, TEXT("MuseumGame invalid layout version or JSON: %s"), *Path);
        return false;
    }
    const TSharedPtr<FJsonObject> Spawn = ObjectField(Root, TEXT("spawn"));
    if (!Spawn.IsValid()) return false;
    SpawnLocation = TilePosition(NumberField(Spawn, TEXT("x")), NumberField(Spawn, TEXT("y")), 140.f);
    // Source north is decreasing grid Y; Unreal yaw zero faces increasing X (east).
    const FString SpawnFacing = StringField(Spawn, TEXT("facing"));
    static const TCHAR* Directions[] = { TEXT("north"), TEXT("northeast"), TEXT("east"), TEXT("southeast"),
        TEXT("south"), TEXT("southwest"), TEXT("west"), TEXT("northwest") };
    for (int32 Index = 0; Index < UE_ARRAY_COUNT(Directions); ++Index)
        if (SpawnFacing == Directions[Index]) { SpawnRotation = FRotator(0.f, -90.f + Index * 45.f, 0.f); break; }

    const TArray<TSharedPtr<FJsonValue>>* RoomValues = nullptr;
    const TArray<TSharedPtr<FJsonValue>>* TileValues = nullptr;
    const TArray<TSharedPtr<FJsonValue>>* ExhibitValues = nullptr;
    const TArray<TSharedPtr<FJsonValue>>* PerformerValues = nullptr;
    if (!Root->TryGetArrayField(TEXT("rooms"), RoomValues) || !Root->TryGetArrayField(TEXT("tiles"), TileValues)
        || !Root->TryGetArrayField(TEXT("exhibits"), ExhibitValues) || !Root->TryGetArrayField(TEXT("performers"), PerformerValues)) return false;

    for (const auto& Value : *RoomValues)
    {
        const TSharedPtr<FJsonObject> Json = Value->AsObject();
        const TSharedPtr<FJsonObject> Bounds = ObjectField(Json, TEXT("bounds"));
        if (!Bounds.IsValid()) continue;
        FMuseumRoom Room;
        Room.Id = StringField(Json, TEXT("id"));
        Room.Name = StringField(Json, TEXT("name"));
        Room.Theme = StringField(Json, TEXT("theme"));
        const int32 X = NumberField(Bounds, TEXT("x"));
        const int32 Y = NumberField(Bounds, TEXT("y"));
        const int32 W = NumberField(Bounds, TEXT("width"));
        const int32 H = NumberField(Bounds, TEXT("height"));
        if (W < 3 || H < 3) continue;
        Room.Bounds = FIntRect(X, Y, X + W, Y + H);
        Rooms.Add(Room);
        const bool bCaveShell = Room.Id == TEXT("cave-water-approach") || Room.Id == TEXT("cave-water-gallery")
            || Room.Id == TEXT("cave-water") || Room.Id == TEXT("cave-fire") || Room.Id == TEXT("cave-earth");
        if (!bCaveShell)
        {
            UBoxComponent* FloorCollision = NewObject<UBoxComponent>(this);
            FloorCollision->SetupAttachment(GetRootComponent());
            FloorCollision->SetBoxExtent(FVector((W - 2) * TileCm / 2, (H - 2) * TileCm / 2, 5.f));
            FloorCollision->SetRelativeLocation(TilePosition(X + (W - 1) / 2, Y + (H - 1) / 2, -8.f));
            FloorCollision->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
            FloorCollision->SetCollisionResponseToAllChannels(ECR_Block);
            FloorCollision->RegisterComponent();
            RoomCollision.Add(FloorCollision);
        }

        // The imported Water, Fire and Earth shells carry their own lightmaps
        // and the source scene supplies a small set of point-light fixtures.
        if (bCaveShell) continue;
        const bool bCave = Room.Theme == TEXT("cave");
        const FLinearColor LightColor = Room.Id.Contains(TEXT("water")) ? FLinearColor(.45f, .7f, 1.f)
            : Room.Id.Contains(TEXT("fire")) ? FLinearColor(1.f, .48f, .2f)
            : Room.Id.Contains(TEXT("earth")) ? FLinearColor(.75f, .9f, .55f)
            : FLinearColor(.86f, .9f, 1.f);
        const int32 Spacing = bCave ? 10 : FMath::Max(W, H);
        for (int32 LightX = X + (bCave ? FMath::Min(5, W / 2) : W / 2); LightX < X + W; LightX += Spacing)
        for (int32 LightY = Y + (bCave ? FMath::Min(5, H / 2) : H / 2); LightY < Y + H; LightY += Spacing)
        {
            UPointLightComponent* Light = NewObject<UPointLightComponent>(this);
            Light->SetupAttachment(GetRootComponent());
            Light->SetRelativeLocation(TilePosition(LightX, LightY, bCave ? 250.f : 330.f));
            Light->SetIntensity(bCave ? 6000.f : 3000.f);
            Light->SetAttenuationRadius(bCave ? 800.f : FMath::Max(W, H) * TileCm * .9f);
            Light->SetCastShadows(false);
            Light->SetLightColor(LightColor);
            Light->RegisterComponent();
            RoomLights.Add(Light);
            if (Room.Id == TEXT("cave-fire")) FireAmbientLights.Add(Light);
        }
    }

    const TArray<TSharedPtr<FJsonValue>>* AuthoredLightValues = nullptr;
    if (Root->TryGetArrayField(TEXT("authoredLights"), AuthoredLightValues))
        for (const TSharedPtr<FJsonValue>& Value : *AuthoredLightValues)
        {
            const TSharedPtr<FJsonObject> LightJson = Value->AsObject();
            if (!LightJson.IsValid()) continue;
            UPointLightComponent* Light = NewObject<UPointLightComponent>(this);
            Light->SetupAttachment(GetRootComponent());
            Light->SetRelativeLocation(FVector(NumberField(LightJson, TEXT("x")) * 100.f,
                NumberField(LightJson, TEXT("z")) * 100.f, NumberField(LightJson, TEXT("y")) * 100.f));
            Light->SetLightColor(FColor::FromHex(StringField(LightJson, TEXT("color"))));
            // Three's physically correct PointLight intensity is candela too.
            Light->SetIntensityUnits(ELightUnits::Candelas);
            Light->SetIntensity(NumberField(LightJson, TEXT("intensity")));
            Light->SetAttenuationRadius(NumberField(LightJson, TEXT("distance")) * 100.f);
            Light->SetCastShadows(false);
            Light->RegisterComponent();
            RoomLights.Add(Light);
        }

    const TArray<TSharedPtr<FJsonValue>>* CorridorValues = nullptr;
    if (Root->TryGetArrayField(TEXT("authoredCorridors"), CorridorValues))
        for (const TSharedPtr<FJsonValue>& Value : *CorridorValues)
        {
            const TSharedPtr<FJsonObject> Rect = Value->AsObject();
            if (!Rect.IsValid()) continue;
            // Include the immediately bordering tile walls. The authored shell
            // models these corridor faces; native cube walls occluded its door.
            AuthoredCorridors.Emplace(
                FVector2D(NumberField(Rect, TEXT("minX")) * 100.f - TileCm, NumberField(Rect, TEXT("minZ")) * 100.f - TileCm),
                FVector2D(NumberField(Rect, TEXT("maxX")) * 100.f + TileCm, NumberField(Rect, TEXT("maxZ")) * 100.f + TileCm));
        }

    TSet<FIntPoint> WalkableTiles;
    for (const TSharedPtr<FJsonValue>& Value : *TileValues)
    {
        const TSharedPtr<FJsonObject> Tile = Value->AsObject();
        if (Tile.IsValid() && Tile->GetBoolField(TEXT("walkable")))
            WalkableTiles.Add(FIntPoint(NumberField(Tile, TEXT("x")), NumberField(Tile, TEXT("y"))));
    }

    for (const auto& Value : *TileValues)
    {
        const TSharedPtr<FJsonObject> Tile = Value->AsObject();
        if (!Tile.IsValid()) continue;
        const int32 X = NumberField(Tile, TEXT("x"));
        const int32 Y = NumberField(Tile, TEXT("y"));
        const float Elevation = NumberField(Tile, TEXT("elevation")) * 100.f;
        const FVector Position = TilePosition(X, Y, Elevation);
        const FString Type = StringField(Tile, TEXT("type"));
        bool bAuthoredShell = false;
        for (const FMuseumRoom& Room : Rooms)
            if ((Room.Id == TEXT("cave-water-approach") || Room.Id == TEXT("cave-water-gallery") || Room.Id == TEXT("cave-water")
                    || Room.Id == TEXT("cave-fire") || Room.Id == TEXT("cave-earth")) && Room.Bounds.Contains(FIntPoint(X, Y)))
            { bAuthoredShell = true; break; }
        if (!bAuthoredShell)
            for (const FBox2D& Corridor : AuthoredCorridors)
                if (Corridor.IsInsideOrOn(FVector2D(Position.X, Position.Y))) { bAuthoredShell = true; break; }
        if (bAuthoredShell && Tile->GetBoolField(TEXT("walkable")))
            AddCube(CaveFloorCollision, Position + FVector(0, 0, -5), FVector(.5f, .5f, .08f));
        else if (bAuthoredShell)
        {
            // The browser samples a 15cm visitor disc against this tile grid.
            // Full blocked cells along the contour give the same tile boundary
            // once the native capsule uses that source radius.
            bool bAtWalkableEdge = false;
            for (int32 DX = -1; DX <= 1 && !bAtWalkableEdge; ++DX)
                for (int32 DY = -1; DY <= 1; ++DY)
                    if ((DX || DY) && WalkableTiles.Contains(FIntPoint(X + DX, Y + DY)))
                    { bAtWalkableEdge = true; break; }
            if (bAtWalkableEdge)
                // -10m to +20m spans the authored cleft, overlook and jump.
                AddCube(CaveWallCollision, FVector(Position.X, Position.Y, 500.f), FVector(.5f, .5f, 30.f));
        }
        if (Type == TEXT("floor") && !bAuthoredShell) AddCube(Floors, Position + FVector(0, 0, -5), FVector(.5f, .5f, .08f));
        else if ((Type == TEXT("corridor") || Type == TEXT("door")) && !bAuthoredShell) AddCube(Corridors, Position + FVector(0, 0, -5), FVector(.5f, .5f, .08f));
        else if ((Type == TEXT("wall") || Type == TEXT("rope") || Type == TEXT("scaffolding")) && !bAuthoredShell) AddCube(Walls, Position + FVector(0, 0, 150), FVector(.5f, .5f, 3.f));
        else if (Type == TEXT("exhibit-panel") || Type == TEXT("sequence-screen") || Type == TEXT("sign")) AddCube(Displays, Position + FVector(0, 0, 105), FVector(.45f, .2f, 1.25f));
        else if (Type == TEXT("performer-station") || Type == TEXT("pedestal")) AddCube(Performers, Position + FVector(0, 0, 15), FVector(.6f, .6f, .3f));
    }
    const TArray<TSharedPtr<FJsonValue>>* ShellValues = nullptr;
    if (Root->TryGetArrayField(TEXT("shells"), ShellValues))
        for (const auto& Value : *ShellValues)
        {
            const TSharedPtr<FJsonObject> ShellJson = Value->AsObject();
            const FString Id = StringField(ShellJson, TEXT("id"));
            if (Id.IsEmpty()) continue;
            const FString AssetPath = FString::Printf(TEXT("/Game/MuseumGame/Shells/%s/SM_%s.SM_%s"), *Id, *Id, *Id);
            UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *AssetPath);
            if (!Mesh) { UE_LOG(LogTemp, Warning, TEXT("MuseumGame missing authored shell %s"), *AssetPath); continue; }
            UStaticMeshComponent* Shell = NewObject<UStaticMeshComponent>(this);
            Shell->SetupAttachment(GetRootComponent());
            Shell->SetStaticMesh(Mesh);
            Shell->SetRelativeLocation(FVector(NumberField(ShellJson, TEXT("x")) * 100.f, NumberField(ShellJson, TEXT("z")) * 100.f, 0));
            Shell->SetCollisionEnabled(ECollisionEnabled::NoCollision);
            Shell->RegisterComponent();
            AuthoredShells.Add(Shell);
            if (Id == TEXT("FirstFire"))
            {
                const TArray<FStaticMaterial>& Slots = Mesh->GetStaticMaterials();
                for (int32 Slot = 0; Slot < Slots.Num(); ++Slot)
                {
                    if (UMaterialInstanceDynamic* Dynamic = Shell->CreateDynamicMaterialInstance(Slot))
                    {
                        FireMaterials.Add(Dynamic);
                        FireMaterialNames.Add(Slots[Slot].MaterialSlotName.ToString().Replace(TEXT(" "), TEXT("_")));
                    }
                }
            }
        }
    for (const auto& Value : *ExhibitValues)
    {
        const TSharedPtr<FJsonObject> Json = Value->AsObject();
        if (!Json.IsValid()) continue;
        FMuseumExhibit Exhibit;
        Exhibit.Id = StringField(Json, TEXT("id"));
        Exhibit.Location = TilePosition(NumberField(Json, TEXT("tileX")), NumberField(Json, TEXT("tileY")), 100.f);
        const TSharedPtr<FJsonObject> Plaque = ObjectField(Json, TEXT("plaque"));
        Exhibit.Title = StringField(Plaque, TEXT("title"));
        Exhibit.Subtitle = StringField(Plaque, TEXT("subtitle"));
        Exhibit.Body = StringField(Plaque, TEXT("body"));
        Exhibit.Footer = StringField(Plaque, TEXT("barter"));
        if (Exhibit.Title.IsEmpty()) Exhibit.Title = Exhibit.Id;
        Exhibits.Add(MoveTemp(Exhibit));
    }
    PerformerCount = PerformerValues->Num();
    static const TCHAR* AvatarIds[] = {
        TEXT("ch01"), TEXT("ch07"), TEXT("ch10"), TEXT("ch12"),
        TEXT("ch18"), TEXT("ch21"), TEXT("ch22"), TEXT("ch24"),
        TEXT("ch26"), TEXT("ch34"), TEXT("ch41"), TEXT("ch42"),
        TEXT("ch44"), TEXT("remy"), TEXT("x_bot"), TEXT("y_bot")
    };
    UStaticMesh* AvatarMeshes[UE_ARRAY_COUNT(AvatarIds)] = {};
    for (int32 Index = 0; Index < UE_ARRAY_COUNT(AvatarIds); ++Index)
    {
        const FString AssetPath = FString::Printf(TEXT("/Game/MuseumGame/Performers/SM_%s.SM_%s"), AvatarIds[Index], AvatarIds[Index]);
        AvatarMeshes[Index] = LoadObject<UStaticMesh>(nullptr, *AssetPath);
        if (!AvatarMeshes[Index]) UE_LOG(LogTemp, Warning, TEXT("MuseumGame missing performer mesh %s"), *AssetPath);
    }
    for (int32 Index = 0; Index < PerformerValues->Num(); ++Index)
    {
        const TSharedPtr<FJsonObject> Json = (*PerformerValues)[Index]->AsObject();
        if (!Json.IsValid()) continue;
        const FString SequenceId = StringField(Json, TEXT("sequenceId"));
        const FVector Feet = TilePosition(NumberField(Json, TEXT("tileX")), NumberField(Json, TEXT("tileY")),
            30.f + NumberField(Json, TEXT("elevation")) * 100.f);
        const FString Facing = StringField(Json, TEXT("facing"));
        const float Yaw = Facing == TEXT("north") ? -90.f : Facing == TEXT("south") ? 90.f : Facing == TEXT("west") ? 180.f : 0.f;
        if (!SequenceId.IsEmpty())
        {
            FActorSpawnParameters StationSpawn;
            StationSpawn.Owner = this;
            StationSpawn.Name = FName(*FString::Printf(TEXT("MuseumPerformer_%02d"), Index));
            StationSpawn.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
            AMuseumPerformerStation* Station = GetWorld()->SpawnActor<AMuseumPerformerStation>(
                AMuseumPerformerStation::StaticClass(), Feet, FRotator(0, Yaw, 0), StationSpawn);
            if (!Station)
            {
                UE_LOG(LogTemp, Error, TEXT("Museum performer %s could not spawn"), *StringField(Json, TEXT("id")));
                continue;
            }
            const float Scale = NumberField(Json, TEXT("scale"), 1.0);
            if (FMath::IsFinite(Scale) && Scale > 0.f) Station->SetActorScale3D(FVector(Scale));
            else UE_LOG(LogTemp, Error, TEXT("Museum performer %s has invalid scale"), *StringField(Json, TEXT("id")));
            const TSharedPtr<FJsonObject> Playback = ObjectField(Json, TEXT("nativePlayback"));
            if (!Playback.IsValid())
                Station->Configure(StringField(Json, TEXT("id")), StringField(Json, TEXT("label")), SequenceId,
                    NAME_None, NAME_None, NAME_None, true, false, 1.f);
            else
            {
                bool bBodyVisible = true;
                bool bAutoPlay = true;
                Playback->TryGetBoolField(TEXT("bodyVisible"), bBodyVisible);
                Json->TryGetBoolField(TEXT("autoPlay"), bAutoPlay);
                Station->Configure(StringField(Json, TEXT("id")), StringField(Json, TEXT("label")), SequenceId,
                    FName(*StringField(Playback, TEXT("characterId"))), FName(*StringField(Playback, TEXT("profile"))),
                    FName(*StringField(Playback, TEXT("propId"))), bBodyVisible, bAutoPlay,
                    NumberField(Playback, TEXT("rate"), 1.0));
            }
            AnimatedStations.Add(Station);
            continue;
        }
        UStaticMesh* Mesh = AvatarMeshes[Index % UE_ARRAY_COUNT(AvatarIds)];
        if (!Mesh) continue;
        UStaticMeshComponent* Figure = NewObject<UStaticMeshComponent>(this);
        Figure->SetupAttachment(GetRootComponent());
        Figure->SetStaticMesh(Mesh);
        const FBoxSphereBounds Bounds = Mesh->GetBounds();
        const float LocalFloor = Bounds.Origin.Z - Bounds.BoxExtent.Z;
        Figure->SetRelativeLocation(Feet - FVector(0, 0, LocalFloor));
        Figure->SetRelativeRotation(FRotator(0, Yaw, 0));
        Figure->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        Figure->RegisterComponent();
        PerformerFigures.Add(Figure);
    }
    const TArray<TSharedPtr<FJsonValue>>* FurnitureValues = nullptr;
    if (Root->TryGetArrayField(TEXT("furniture"), FurnitureValues))
        for (const auto& Value : *FurnitureValues)
        {
            const TSharedPtr<FJsonObject> Json = Value->AsObject();
            AddCube(Furniture, TilePosition(NumberField(Json, TEXT("tileX")), NumberField(Json, TEXT("tileY")), 40.f), FVector(.9f, .55f, .75f));
        }
    const TSharedPtr<FJsonObject> FireJson = ObjectField(Root, TEXT("fireProgression"));
    const TArray<TSharedPtr<FJsonValue>>* CourtValues = nullptr;
    if (FireJson.IsValid() && FireJson->TryGetArrayField(TEXT("shrines"), CourtValues))
        for (const TSharedPtr<FJsonValue>& Value : *CourtValues)
        {
            const TSharedPtr<FJsonObject> CourtJson = Value->AsObject();
            if (!CourtJson.IsValid()) continue;
            FMuseumFireCourt Court;
            Court.Id = StringField(CourtJson, TEXT("id"));
            Court.PerformerId = StringField(CourtJson, TEXT("performerId"));
            Court.Centre = PlanPoint(ObjectField(CourtJson, TEXT("centre")));
            Court.Entry = PlanPoint(ObjectField(CourtJson, TEXT("entry")));
            Court.Exit = PlanPoint(ObjectField(CourtJson, TEXT("exit")));
            Court.ThroatWidth = NumberField(CourtJson, TEXT("throatWidth")) * 100.f;
            Court.OrbitRadius = NumberField(CourtJson, TEXT("orbitRadius")) * 100.f;
            Court.OrbitWidth = NumberField(CourtJson, TEXT("orbitWidth")) * 100.f;
            Court.OrbitSweepDegrees = NumberField(CourtJson, TEXT("orbitSweepDegrees"));
            const TArray<TSharedPtr<FJsonValue>>* Outline = nullptr;
            if (CourtJson->TryGetArrayField(TEXT("courtOutline"), Outline))
                for (const TSharedPtr<FJsonValue>& Point : *Outline) Court.Outline.Add(PlanPoint(Point->AsObject()));
            if (Court.Outline.Num() < 3 || Court.OrbitRadius <= 0 || Court.Id.IsEmpty()) continue;
            FireCourts.Add(MoveTemp(Court));
        }
    if (FireCourts.Num() == 3)
    {
        EarthDoor = PlanPoint(ObjectField(FireJson, TEXT("earthDoor")));
        WaterDoor = PlanPoint(ObjectField(FireJson, TEXT("waterDoor")));
        RestoreFireProgress(FMuseumFireProgress());
        for (const FMuseumFireCourt& Court : FireCourts)
        {
            UPointLightComponent* Light = NewObject<UPointLightComponent>(this);
            Light->SetupAttachment(GetRootComponent());
            Light->SetRelativeLocation(FVector(Court.Centre, 230.f));
            Light->SetLightColor(FColor::FromHex(TEXT("#ff4a18")));
            Light->SetIntensityUnits(ELightUnits::Candelas);
            Light->SetIntensity(42.f);
            Light->SetAttenuationRadius(1400.f);
            Light->SetCastShadows(false);
            Light->RegisterComponent();
            FireLights.Add(Light);
        }
        GrowthLight = NewObject<UPointLightComponent>(this);
        GrowthLight->SetupAttachment(GetRootComponent());
        GrowthLight->SetRelativeLocation(FVector(EarthDoor + FVector2D(-250.f, 0.f), 210.f));
        GrowthLight->SetLightColor(FColor::FromHex(TEXT("#72d957")));
        GrowthLight->SetIntensityUnits(ELightUnits::Candelas);
        GrowthLight->SetIntensity(30.f);
        GrowthLight->SetAttenuationRadius(1500.f);
        GrowthLight->SetCastShadows(false);
        GrowthLight->RegisterComponent();
        WaterLight = NewObject<UPointLightComponent>(this);
        WaterLight->SetupAttachment(GetRootComponent());
        // The authored water light sits 2.2m inside the west threshold.
        WaterLight->SetRelativeLocation(FVector(WaterDoor + FVector2D(220.f, 0.f), 260.f));
        WaterLight->SetLightColor(FColor::FromHex(TEXT("#7cc7dd")));
        WaterLight->SetIntensityUnits(ELightUnits::Candelas);
        WaterLight->SetIntensity(10.f);
        WaterLight->SetAttenuationRadius(1100.f);
        WaterLight->SetCastShadows(false);
        WaterLight->RegisterComponent();
        RefreshFireVisuals();
    }
    return Rooms.Num() > 0 && Exhibits.Num() > 0 && Floors->GetInstanceCount() > 0;
}

const FMuseumExhibit* AMuseumWorld::NearestExhibit(const FVector& Location, float RadiusCm) const
{
    const FMuseumExhibit* Best = nullptr;
    float BestSq = RadiusCm * RadiusCm;
    for (const FMuseumExhibit& Exhibit : Exhibits)
    {
        const float DistSq = FVector::DistSquared2D(Location, Exhibit.Location);
        if (DistSq < BestSq) { Best = &Exhibit; BestSq = DistSq; }
    }
    return Best;
}

AMuseumPerformerStation* AMuseumWorld::NearestPerformerStation(const FVector& Location, float RadiusCm) const
{
    AMuseumPerformerStation* Best = nullptr;
    float BestSq = RadiusCm * RadiusCm;
    for (AMuseumPerformerStation* Station : AnimatedStations)
    {
        if (!Station) continue;
        const float DistSq = FVector::DistSquared2D(Location, Station->GetActorLocation());
        if (DistSq < BestSq) { Best = Station; BestSq = DistSq; }
    }
    return Best;
}

void AMuseumWorld::RunPlaybackSmoke(float DeltaSeconds)
{
    auto FailSmoke = [this](const FString& Reason)
    {
        UE_LOG(LogTemp, Error, TEXT("MUSEUM_PLAYBACK_SMOKE FAIL: %s"), *Reason);
        SmokeStage = -1;
        SetActorTickEnabled(false);
    };
    if (!bLoaded || AnimatedStations.Num() != 31 || PerformerCount != 33 || PerformerFigures.Num() != 2)
    {
        FailSmoke(FString::Printf(TEXT("station counts: %d animated, %d total, %d static"),
            AnimatedStations.Num(), PerformerCount, PerformerFigures.Num()));
        return;
    }
    AMuseumPerformerStation* Sample = AnimatedStations[0];
    if (!Sample) { FailSmoke(TEXT("first station missing")); return; }
    if (SmokeStage == 0)
    {
        TSet<FString> SequenceIds;
        int32 HiddenBodies = 0;
        const AMuseumPerformerStation* HiddenStation = nullptr;
        for (const AMuseumPerformerStation* Station : AnimatedStations)
        {
            if (!Station || !Station->IsReady() || !Station->IsPropReady() ||
                Station->GetCharacterId() != TEXT("x-bot") || Station->GetPropId() != TEXT("staff") ||
                !FMath::IsFinite(Station->GetGripErrorCm()))
            { FailSmoke(Station ? Station->GetStationId() + TEXT(" not ready or identity/grip invalid") : TEXT("null station")); return; }
            FString Expected = Station->GetSequenceId();
            for (int32 CharacterIndex = 0; CharacterIndex < Expected.Len(); ++CharacterIndex)
                if (!FChar::IsAlnum(Expected[CharacterIndex]) && Expected[CharacterIndex] != TEXT('_'))
                    Expected[CharacterIndex] = TEXT('_');
            Expected = TEXT("M_") + Expected;
            if (Station->GetProfile().ToString() != Expected)
            { FailSmoke(Station->GetStationId() + TEXT(" profile differs from authored sequence")); return; }
            SequenceIds.Add(Station->GetSequenceId());
            if (!Station->IsBodyVisible()) { ++HiddenBodies; HiddenStation = Station; }
        }
        if (SequenceIds.Num() != 25 || HiddenBodies != 1 || !Sample->IsPlaying() ||
            !HiddenStation || !HiddenStation->IsPlaying())
        { FailSmoke(TEXT("unique captures, formation visibility, or autoplay mismatch")); return; }
        SmokePhase = Sample->GetPlaybackPhase();
        SmokeHiddenPhase = HiddenStation->GetPlaybackPhase();
        SmokeStage = 1;
        SmokeElapsed = 0.f;
        return;
    }
    if (SmokeStage == 5)
    {
        // All performers have passed the initial blend. Sample every tick for
        // longer than the longest authored four-second loop, including wraps.
        for (const AMuseumPerformerStation* Station : AnimatedStations)
        {
            if (!Station || !Station->IsPlaying() || !Station->IsPropReady())
            { FailSmoke(TEXT("station stopped during full-cycle grip check")); return; }
            const float Grip = Station->GetGripErrorCm();
            const float Anchor = Station->GetPropAnchorErrorCm();
            if (!FMath::IsFinite(Grip) || !FMath::IsFinite(Anchor) || Grip > 15.f || Anchor > 15.f)
            {
                FailSmoke(FString::Printf(TEXT("%s (%s): grip %.2f cm, prop anchor %.2f cm"),
                    *Station->GetStationId(), *Station->GetProfile().ToString(), Grip, Anchor));
                return;
            }
            SmokePeakGripCm = FMath::Max(SmokePeakGripCm, Grip);
            SmokePeakAnchorCm = FMath::Max(SmokePeakAnchorCm, Anchor);
        }
        SmokeElapsed += DeltaSeconds;
        if (SmokeElapsed < 4.2f) return;
        UE_LOG(LogTemp, Display, TEXT("MUSEUM_PLAYBACK_SMOKE PASS: 33 stations, 31 animated, 25 exact captures, one hidden formation; pause, resume, restart, full-cycle grip peak %.2f cm, anchor peak %.2f cm"),
            SmokePeakGripCm, SmokePeakAnchorCm);
        SmokeStage = -1;
        SetActorTickEnabled(false);
        return;
    }
    SmokeElapsed += DeltaSeconds;
    if (SmokeElapsed < .4f) return;
    SmokeElapsed = 0.f;
    if (SmokeStage == 1)
    {
        const AMuseumPerformerStation* HiddenStation = nullptr;
        for (const AMuseumPerformerStation* Station : AnimatedStations)
            if (Station && !Station->IsBodyVisible()) { HiddenStation = Station; break; }
        if (!HiddenStation || HiddenStation->GetPlaybackPhase() <= SmokeHiddenPhase + .001f)
        { FailSmoke(TEXT("hidden formation body did not keep animating")); return; }
        if (Sample->GetPlaybackPhase() <= SmokePhase + .001f)
        { FailSmoke(TEXT("authored animation phase did not advance")); return; }
        Sample->TogglePlayback();
        SmokePhase = Sample->GetPlaybackPhase();
        SmokeLeftProp = Sample->GetPropRootTransform(true);
        SmokeRightProp = Sample->GetPropRootTransform(false);
        SmokeStage = 2;
    }
    else if (SmokeStage == 2)
    {
        if (!Sample->IsPaused() || FMath::Abs(Sample->GetPlaybackPhase() - SmokePhase) > .001f ||
            !Sample->GetPropRootTransform(true).Equals(SmokeLeftProp, .01f) ||
            !Sample->GetPropRootTransform(false).Equals(SmokeRightProp, .01f))
        { FailSmoke(TEXT("pause did not freeze authored body and props")); return; }
        Sample->TogglePlayback();
        SmokeStage = 3;
    }
    else if (SmokeStage == 3)
    {
        if (!Sample->IsPlaying() || Sample->GetPlaybackPhase() <= SmokePhase + .001f)
        { FailSmoke(TEXT("resume did not advance authored phase")); return; }
        Sample->RestartPlayback();
        if (Sample->GetPlaybackPhase() > .001f)
        { FailSmoke(TEXT("restart did not reset authored phase")); return; }
        SmokeStage = 4;
    }
    else if (SmokeStage == 4)
    {
        if (!Sample->IsPlaying() || Sample->GetPlaybackPhase() <= .001f ||
            !FMath::IsFinite(Sample->GetGripErrorCm()) || Sample->GetGripErrorCm() > 15.f)
        { FailSmoke(TEXT("restart did not play within the 15 cm grip bound")); return; }
        SmokePeakGripCm = 0.f;
        SmokePeakAnchorCm = 0.f;
        SmokeElapsed = 0.f;
        SmokeStage = 5;
    }
}

const FMuseumRoom* AMuseumWorld::RoomAt(const FVector& Location) const
{
    const FIntPoint Tile(FMath::RoundToInt(Location.X / TileCm), FMath::RoundToInt(Location.Y / TileCm));
    for (const FMuseumRoom& Room : Rooms)
        if (Room.Bounds.Contains(Tile)) return &Room;
    return nullptr;
}

bool AMuseumWorld::UsesAuthoredCaveLighting(const FVector& Location) const
{
    if (const FMuseumRoom* Room = RoomAt(Location))
        if (Room->Id == TEXT("cave-water-approach") || Room->Id == TEXT("cave-water-gallery")
            || Room->Id == TEXT("cave-water") || Room->Id == TEXT("cave-fire") || Room->Id == TEXT("cave-earth"))
            return true;
    for (const FBox2D& Corridor : AuthoredCorridors)
        if (Corridor.IsInsideOrOn(FVector2D(Location.X, Location.Y))) return true;
    return false;
}

void AMuseumWorld::RestoreFireProgress(const FMuseumFireProgress& Progress)
{
    FireProgress = Progress;
    if (FireProgress.Phase < 0 || FireProgress.Phase > 7 ||
        FireProgress.OrbitZones.Num() != 3 || FireProgress.OrbitTravelDegrees.Num() != 3 ||
        FireProgress.LastOrbitAngles.Num() != 3 || FireProgress.HasLastOrbitAngle.Num() != 3 ||
        FireProgress.Extinguished.Num() != 3 || !FMath::IsFinite(FireProgress.BlackoutElapsedSeconds))
    {
        FireProgress = FMuseumFireProgress();
        FireProgress.Phase = 0;
        FireProgress.BlackoutElapsedSeconds = 0.f;
        for (int32 I = 0; I < 3; ++I)
        {
            FireProgress.OrbitZones.Add(0);
            FireProgress.OrbitTravelDegrees.Add(0.f);
            FireProgress.LastOrbitAngles.Add(0.f);
            FireProgress.HasLastOrbitAngle.Add(false);
            FireProgress.Extinguished.Add(false);
        }
    }
    for (int32 I = 0; I < 3; ++I)
    {
        FireProgress.OrbitZones[I] = FMath::Clamp(FireProgress.OrbitZones[I], 0, 4);
        if (!FMath::IsFinite(FireProgress.OrbitTravelDegrees[I]) || !FMath::IsFinite(FireProgress.LastOrbitAngles[I]))
        {
            FireProgress.OrbitTravelDegrees[I] = 0.f;
            FireProgress.LastOrbitAngles[I] = 0.f;
            FireProgress.HasLastOrbitAngle[I] = false;
        }
    }
    FireProgress.BlackoutElapsedSeconds = FMath::Clamp(FireProgress.BlackoutElapsedSeconds, 0.f, 2.2f);
    RefreshFireVisuals();
}

bool AMuseumWorld::IsFireStation(const AMuseumPerformerStation* Station) const
{
    if (!Station) return false;
    for (const FMuseumFireCourt& Court : FireCourts)
        if (Station->GetStationId() == Court.PerformerId) return true;
    return false;
}

void AMuseumWorld::UpdateFireProgress(const FVector& VisitorLocation, float DeltaSeconds)
{
    if (FireCourts.Num() != 3) return;
    FireVisitorPosition = FVector2D(VisitorLocation.X, VisitorLocation.Y);
    int32& Phase = FireProgress.Phase;
    if (Phase == 6)
    {
        FireProgress.BlackoutElapsedSeconds = FMath::Min(2.2f, FireProgress.BlackoutElapsedSeconds + FMath::Max(0.f, DeltaSeconds));
        if (FireProgress.BlackoutElapsedSeconds >= 2.2f) Phase = 7;
        RefreshFireVisuals();
        return;
    }
    if (Phase == 7) { RefreshFireVisuals(); return; }

    const int32 EntryIndex = Phase == 0 ? 0 : Phase == 2 ? 1 : Phase == 4 ? 2 : INDEX_NONE;
    if (EntryIndex != INDEX_NONE)
    {
        const FMuseumFireCourt& Court = FireCourts[EntryIndex];
        const float Mouth = FMath::Max(165.f, Court.ThroatWidth * .5f);
        if (FVector2D::Distance(FireVisitorPosition, Court.Entry) <= Mouth || InCourt(Court.Outline, FireVisitorPosition))
            Phase = 1 + EntryIndex * 2;
    }
    else if (Phase == 1 || Phase == 3 || Phase == 5)
    {
        const int32 I = (Phase - 1) / 2;
        const FMuseumFireCourt& Court = FireCourts[I];
        const float Mouth = FMath::Max(165.f, Court.ThroatWidth * .5f);
        if (FVector2D::Distance(FireVisitorPosition, Court.Exit) <= Mouth)
        {
            FireProgress.OrbitZones[I] = 4;
            FireProgress.OrbitTravelDegrees[I] = FMath::Abs(Court.OrbitSweepDegrees);
            Phase = I == 2 ? 6 : (I + 1) * 2;
        }
        else
        {
            const FVector2D Offset = FireVisitorPosition - Court.Centre;
            const float Radius = Offset.Size();
            const bool bRibbon = FMath::Abs(Radius - Court.OrbitRadius) <= Court.OrbitWidth * .5f + 35.f;
            const bool bCourt = Radius > 75.f && InCourt(Court.Outline, FireVisitorPosition);
            if (bRibbon || bCourt)
            {
                const float Angle = FMath::RadiansToDegrees(FMath::Atan2(Offset.Y, Offset.X));
                if (FireProgress.HasLastOrbitAngle[I])
                {
                    const float Sweep = FMath::Min(360.f, FMath::Abs(Court.OrbitSweepDegrees));
                    const float Direction = FMath::Sign(Court.OrbitSweepDegrees);
                    FireProgress.OrbitTravelDegrees[I] = FMath::Clamp(
                        FireProgress.OrbitTravelDegrees[I] + FMath::FindDeltaAngleDegrees(FireProgress.LastOrbitAngles[I], Angle) * Direction,
                        0.f, Sweep);
                    static const float Fractions[] = { 25.f / 360.f, 110.f / 360.f, 195.f / 360.f, 280.f / 360.f };
                    for (int32 Zone = 0; Zone < 4; ++Zone)
                        if (FireProgress.OrbitTravelDegrees[I] >= Sweep * Fractions[Zone])
                            FireProgress.OrbitZones[I] = FMath::Max(FireProgress.OrbitZones[I], Zone + 1);
                    if (FireProgress.OrbitZones[I] == 4) Phase = I == 2 ? 6 : (I + 1) * 2;
                }
                FireProgress.LastOrbitAngles[I] = Angle;
                FireProgress.HasLastOrbitAngle[I] = true;
            }
        }
    }
    for (int32 I = 0; I < 3; ++I)
        if (FireProgress.OrbitZones[I] == 4 && FVector2D::Distance(FireVisitorPosition, FireCourts[I].Centre) > 1400.f)
            FireProgress.Extinguished[I] = true;
    RefreshFireVisuals();
}

FString AMuseumWorld::GetFireStatus() const
{
    if (!HasFireProgression()) return FString();
    switch (FireProgress.Phase)
    {
    case 0: return TEXT("Ember bridge crossed");
    case 1: return FString::Printf(TEXT("DJ orbit %d/4"), FireProgress.OrbitZones[0]);
    case 2: return TEXT("DJ lane cooling to coals");
    case 3: return FString::Printf(TEXT("EK orbit %d/4"), FireProgress.OrbitZones[1]);
    case 4: return TEXT("EK lane cooling to coals");
    case 5: return FString::Printf(TEXT("FL orbit %d/4"), FireProgress.OrbitZones[2]);
    case 6: return FString::Printf(TEXT("Neutral blackout %.1fs"), FMath::Max(0.f, 2.2f - FireProgress.BlackoutElapsedSeconds));
    default: return TEXT("Earth growth revealed");
    }
}

void AMuseumWorld::RefreshFireVisuals()
{
    if (FireCourts.Num() != 3) return;
    const int32 Phase = FireProgress.Phase;
    const bool bBlackout = Phase == 6;
    const bool bFlamesOut = Phase >= 6;
    const int32 Pending = Phase <= 1 ? 0 : Phase <= 3 ? 1 : 2;
    const int32 Active = Phase == 1 ? 0 : Phase == 3 ? 1 : Phase == 5 ? 2 : INDEX_NONE;
    int32 Lit = Active;
    if (Lit == INDEX_NONE && !bFlamesOut)
        for (int32 I = 2; I >= 0; --I)
            if (FireProgress.OrbitZones[I] == 4 && !FireProgress.Extinguished[I]) { Lit = I; break; }
    int32 Displayed = Active;
    if (Displayed == INDEX_NONE && Phase > 0) Displayed = FMath::Min(2, (Phase - 1) / 2);
    for (int32 I = 0; I < FireLights.Num(); ++I)
    {
        const bool bVisible = !bFlamesOut && I == (Lit == INDEX_NONE ? Pending : Lit);
        FireLights[I]->SetVisibility(bVisible);
        FireLights[I]->SetIntensity(42.f);
    }
    if (GrowthLight) GrowthLight->SetVisibility(Phase == 7);
    if (WaterLight) WaterLight->SetVisibility(!bBlackout);
    for (UPointLightComponent* Light : FireAmbientLights) Light->SetVisibility(!bBlackout);
    for (int32 I = 0; I < FireMaterials.Num() && I < FireMaterialNames.Num(); ++I)
    {
        const FString& Name = FireMaterialNames[I];
        float Glow = bBlackout ? 0.f : 1.f;
        const bool bGuide = Name.Contains(TEXT("Flame_Guide"));
        // Source mesh guides are placement markers, not the rendered shader flames.
        float Presence = bGuide ? 0.f : 1.f;
        const bool bLane = Name.Contains(TEXT("_Lane")) || Name.Contains(TEXT("Coal_Memory"));
        if (bLane) Glow = bBlackout ? 0.f : Phase == 7 ? .1f : 1.f;
        if (Name.Contains(TEXT("Earth_Growth")))
        {
            Glow = Phase == 7 ? 1.f : 0.f;
            Presence = Phase == 7 ? 1.f : 0.f;
        }
        for (int32 CourtIndex = 0; CourtIndex < 3; ++CourtIndex)
        {
            const FString Tag = FireCourts[CourtIndex].Id.ToUpper();
            if (Name.Contains(Tag) && !bLane)
            {
                const bool bStillBurning = CourtIndex == Pending ||
                    (FireProgress.OrbitZones[CourtIndex] == 4 && !FireProgress.Extinguished[CourtIndex]);
                const bool bCompleted = FireProgress.OrbitZones[CourtIndex] == 4;
                Glow = bBlackout ? 0.f : Phase == 7 ? .28f : bStillBurning ? 1.f : bCompleted ? .28f : .06f;
                if (bGuide)
                {
                    if (bFlamesOut) Glow = 0.f;
                }
            }
        }
        if (bGuide && bFlamesOut) Glow = 0.f;
        FireMaterials[I]->SetScalarParameterValue(TEXT("GlowScale"), Glow);
        if (bGuide || Name.Contains(TEXT("Earth_Growth")))
            FireMaterials[I]->SetScalarParameterValue(TEXT("Presence"), Presence);
    }
    if (!FParse::Param(FCommandLine::Get(), TEXT("MuseumPlaybackSmoke")))
        for (AMuseumPerformerStation* Station : AnimatedStations)
            if (IsFireStation(Station))
            {
                int32 I = 0;
                for (; I < 3; ++I) if (Station->GetStationId() == FireCourts[I].PerformerId) break;
                if (I >= 3) continue;
                const bool bShow = I == Displayed;
                const bool bPlay = I == Lit && FVector2D::Distance(FireVisitorPosition, FireCourts[I].Centre) < 3000.f;
                if (Station->IsHidden() != !bShow) Station->SetActorHiddenInGame(!bShow);
                if (Station->IsPlaying() != bPlay) Station->TogglePlayback();
            }
}

void AMuseumWorld::RunProgressionSmoke(float DeltaSeconds)
{
    auto MaterialScalar = [this](const TCHAR* NameFragment, const TCHAR* Parameter, float& Out)
    {
        for (int32 I = 0; I < FireMaterials.Num() && I < FireMaterialNames.Num(); ++I)
        {
            FString Name = FireMaterialNames[I].Replace(TEXT(" "), TEXT("_"));
            if (Name.Contains(NameFragment))
            {
                Out = FireMaterials[I]->K2_GetScalarParameterValue(FName(Parameter));
                return true;
            }
        }
        return false;
    };
    auto Fail = [this](const TCHAR* Reason)
    {
        UE_LOG(LogTemp, Error, TEXT("MUSEUM_PROGRESSION_SMOKE FAIL: %s phase=%d"), Reason, FireProgress.Phase);
        ProgressionSmokeStage = -1;
        SetActorTickEnabled(false);
    };
    if (!bLoaded || !HasFireProgression()) { Fail(TEXT("authored Fire contract unavailable")); return; }
    if (ProgressionSmokeStage == 0)
    {
        RestoreFireProgress(FMuseumFireProgress());
        float InitialGuidePresence = -1.f;
        if (!MaterialScalar(TEXT("Flame_Guide"), TEXT("Presence"), InitialGuidePresence) || InitialGuidePresence > .001f)
        { Fail(TEXT("authored flame placement markers are visible")); return; }
        // The second court is spatially valid but cannot start before DJ.
        UpdateFireProgress(FVector(FireCourts[1].Entry, 180.f), 0.f);
        if (FireProgress.Phase != 0) { Fail(TEXT("out-of-order EK entry advanced")); return; }
        const FMuseumFireCourt& First = FireCourts[0];
        const FVector2D MouthSide = FVector2D(-(First.Exit - First.Centre).Y, (First.Exit - First.Centre).X).GetSafeNormal() * 100.f;
        UpdateFireProgress(FVector(First.Entry + MouthSide, 180.f), 0.f);
        if (FireProgress.Phase != 1) { Fail(TEXT("off-center DJ mouth entry failed")); return; }
        UpdateFireProgress(FVector(First.Exit + MouthSide, 180.f), 0.f);
        if (FireProgress.Phase != 2 || FireProgress.OrbitZones[0] != 4)
        { Fail(TEXT("off-center far-mouth completion failed")); return; }
        RestoreFireProgress(FMuseumFireProgress());
        bool bSavedMidOrbit = false;
        for (int32 I = 0; I < 3; ++I)
        {
            const FMuseumFireCourt& Court = FireCourts[I];
            UpdateFireProgress(FVector(Court.Entry, 180.f), 0.f);
            if (FireProgress.Phase != 1 + I * 2) { Fail(TEXT("ordered court entry failed")); return; }
            const FVector2D Start = Court.Entry - Court.Centre;
            const float StartAngle = FMath::Atan2(Start.Y, Start.X);
            for (int32 Step = 0; Step <= 16 && FireProgress.Phase == 1 + I * 2; ++Step)
            {
                const float Angle = StartAngle + FMath::DegreesToRadians(Step * 15.f * FMath::Sign(Court.OrbitSweepDegrees));
                const FVector2D Position = Court.Centre + Court.OrbitRadius * FVector2D(FMath::Cos(Angle), FMath::Sin(Angle));
                UpdateFireProgress(FVector(Position, 180.f), 0.f);
                if (I == 0 && !bSavedMidOrbit && FireProgress.OrbitZones[0] >= 2 && FireProgress.OrbitZones[0] < 4)
                {
                    UMuseumSaveGame* Save = Cast<UMuseumSaveGame>(UGameplayStatics::CreateSaveGameObject(UMuseumSaveGame::StaticClass()));
                    if (!Save) { Fail(TEXT("save object creation failed")); return; }
                    Save->FireProgress = FireProgress;
                    const float Travel = FireProgress.OrbitTravelDegrees[0];
                    TArray<uint8> Bytes;
                    if (!UGameplayStatics::SaveGameToMemory(Save, Bytes)) { Fail(TEXT("save serialization failed")); return; }
                    RestoreFireProgress(FMuseumFireProgress());
                    const UMuseumSaveGame* Loaded = Cast<UMuseumSaveGame>(UGameplayStatics::LoadGameFromMemory(Bytes));
                    if (!Loaded || Loaded->Version != 2) { Fail(TEXT("save deserialization failed")); return; }
                    RestoreFireProgress(Loaded->FireProgress);
                    if (FireProgress.Phase != 1 || FireProgress.OrbitZones[0] < 2 ||
                        !FMath::IsNearlyEqual(FireProgress.OrbitTravelDegrees[0], Travel, .01f))
                    { Fail(TEXT("mid-orbit save restore lost progression")); return; }
                    bSavedMidOrbit = true;
                }
            }
            if (I == 0 && !bSavedMidOrbit) { Fail(TEXT("DJ mid-orbit save checkpoint not reached")); return; }
            if (FireProgress.Phase != (I == 2 ? 6 : (I + 1) * 2) || FireProgress.OrbitZones[I] != 4)
            { Fail(TEXT("authored orbit failed to reach four zones")); return; }
            if (I < 2)
            {
                const FVector2D Away = Court.Centre + FVector2D(1500.f, 0.f);
                UpdateFireProgress(FVector(Away, 180.f), 0.f);
                if (!FireProgress.Extinguished[I]) { Fail(TEXT("court did not extinguish at 14 metres")); return; }
                UpdateFireProgress(FVector(Court.Centre, 180.f), 0.f);
                if (!FireProgress.Extinguished[I]) { Fail(TEXT("backtracking relit finished court")); return; }
            }
        }
        UpdateFireProgress(FVector(FireCourts[2].Centre, 180.f), 2.19f);
        if (FireProgress.Phase != 6 || !GrowthLight || GrowthLight->IsVisible())
        { Fail(TEXT("neutral blackout ended early or growth light leaked")); return; }
        float LaneGlow = -1.f;
        float GuidePresence = -1.f;
        if (!MaterialScalar(TEXT("Rock_Lane"), TEXT("GlowScale"), LaneGlow) || LaneGlow > .001f ||
            !MaterialScalar(TEXT("Flame_Guide"), TEXT("Presence"), GuidePresence) || GuidePresence > .001f ||
            !WaterLight || WaterLight->IsVisible())
        { Fail(TEXT("blackout material or water light leaked")); return; }
        for (UPointLightComponent* Light : FireAmbientLights)
            if (Light->IsVisible()) { Fail(TEXT("ambient light leaked into blackout")); return; }
        ProgressionSmokeStage = 1;
        ProgressionSmokeElapsed = 0.f;
        return;
    }
    if (ProgressionSmokeStage == 1)
    {
        // Hold a real frame in blackout, then cross the 2.2 second boundary.
        ProgressionSmokeElapsed += DeltaSeconds;
        if (ProgressionSmokeElapsed < .12f) return;
        UpdateFireProgress(FVector(FireCourts[2].Centre, 180.f), .02f);
        if (FireProgress.Phase != 7 || !GrowthLight->IsVisible())
        { Fail(TEXT("growth did not reveal after 2.2 seconds")); return; }
        float LaneGlow = -1.f;
        float CourtGlow = -1.f;
        float GuidePresence = -1.f;
        if (!MaterialScalar(TEXT("Rock_Lane"), TEXT("GlowScale"), LaneGlow) || !FMath::IsNearlyEqual(LaneGlow, .1f, .001f) ||
            !MaterialScalar(TEXT("Rock_DJ"), TEXT("GlowScale"), CourtGlow) || !FMath::IsNearlyEqual(CourtGlow, .28f, .001f) ||
            !MaterialScalar(TEXT("Flame_Guide"), TEXT("Presence"), GuidePresence) || GuidePresence > .001f ||
            !WaterLight || !WaterLight->IsVisible())
        { Fail(TEXT("growth residual material or water light missing")); return; }
        for (UPointLightComponent* Light : FireAmbientLights)
            if (!Light->IsVisible()) { Fail(TEXT("ambient light did not recover after growth")); return; }
        for (UPointLightComponent* Light : FireLights)
            if (Light->IsVisible()) { Fail(TEXT("hero fire relit after growth")); return; }
        for (AMuseumPerformerStation* Station : AnimatedStations)
            if (IsFireStation(Station) && Station->IsPlaying())
            { Fail(TEXT("Fire station remained active after growth")); return; }
        for (TActorIterator<AMuseumCharacter> It(GetWorld()); It; ++It)
        {
            // Authored walkable west threshold, 2.25m before the Earth door.
            It->SetActorLocation(FVector(EarthDoor + FVector2D(-225.f, -25.f), 180.f), false, nullptr, ETeleportType::TeleportPhysics);
            if (APlayerController* Player = Cast<APlayerController>(It->GetController()))
            {
                Player->SetControlRotation(FRotator(0.f, 0.f, 0.f));
            }
            break;
        }
        ProgressionSmokeStage = 2;
        ProgressionSmokeElapsed = 0.f;
        return;
    }
    if (ProgressionSmokeStage == 2)
    {
        ProgressionSmokeElapsed += DeltaSeconds;
        if (ProgressionSmokeElapsed < .4f) return;
        if (APlayerController* Player = UGameplayStatics::GetPlayerController(this, 0))
            Player->ConsoleCommand(TEXT("HighResShot 1"));
        ProgressionSmokeStage = 3;
        ProgressionSmokeElapsed = 0.f;
        return;
    }
    // Exercise the actual character capsule and CharacterMovement sweeps across
    // the source corridor, including both turns and a blocked boundary tile.
    AMuseumCharacter* Visitor = nullptr;
    for (TActorIterator<AMuseumCharacter> It(GetWorld()); It; ++It) { Visitor = *It; break; }
    if (!Visitor) { Fail(TEXT("visitor unavailable for cave traversal")); return; }
    if (ProgressionSmokeStage == 3)
    {
        ProgressionSmokeElapsed += DeltaSeconds;
        if (ProgressionSmokeElapsed < .3f) return;
        Visitor->SetActorLocation(FVector(178.f * TileCm, 114.f * TileCm, 180.f), false, nullptr, ETeleportType::TeleportPhysics);
        Visitor->GetCharacterMovement()->StopMovementImmediately();
        CaveSmokeRoutePoint = 0;
        ProgressionSmokeStage = 4;
        ProgressionSmokeElapsed = 0.f;
        return;
    }
    if (ProgressionSmokeStage == 4)
    {
        ProgressionSmokeElapsed += DeltaSeconds;
        if (!Visitor->GetCharacterMovement()->IsMovingOnGround() ||
            FMath::Abs(Visitor->GetActorLocation().Z - 89.f) > 12.f)
        {
            if (ProgressionSmokeElapsed > 2.f)
            {
                UE_LOG(LogTemp, Error, TEXT("MUSEUM_PROGRESSION_SMOKE route settle pos=%s mode=%d"),
                    *Visitor->GetActorLocation().ToString(), static_cast<int32>(Visitor->GetCharacterMovement()->MovementMode));
                Fail(TEXT("visitor did not land on authored corridor floor"));
            }
            return;
        }
        ProgressionSmokeStage = 5;
        ProgressionSmokeElapsed = 0.f;
        return;
    }
    if (ProgressionSmokeStage == 5)
    {
        // Every route leg must be supported by the hidden authored floor,
        // including the turns and the Earth threshold. XY alone could pass
        // while a capsule falls through missing corridor collision.
        if (!Visitor->GetCharacterMovement()->IsMovingOnGround() ||
            FMath::Abs(Visitor->GetActorLocation().Z - 89.f) > 12.f)
        { Fail(TEXT("visitor lost authored corridor floor")); return; }
        // Four corridor tiles across at the north leg; x=183 follows the
        // authored centre without cutting either corner.
        static const FIntPoint Route[] = {
            FIntPoint(183, 114), FIntPoint(183, 80), FIntPoint(190, 80),
            FIntPoint(183, 80), FIntPoint(183, 114), FIntPoint(178, 114)
        };
        if (CaveSmokeRoutePoint >= UE_ARRAY_COUNT(Route))
        {
            Visitor->SetActorLocation(FVector(183.f * TileCm, 100.f * TileCm, 180.f), false, nullptr, ETeleportType::TeleportPhysics);
            Visitor->GetCharacterMovement()->StopMovementImmediately();
            ProgressionSmokeStage = 6;
            ProgressionSmokeElapsed = 0.f;
            return;
        }
        const FVector Here = Visitor->GetActorLocation();
        const FVector Goal(Route[CaveSmokeRoutePoint].X * TileCm, Route[CaveSmokeRoutePoint].Y * TileCm, Here.Z);
        const FVector Delta = Goal - Here;
        if (FVector2D(Delta.X, Delta.Y).Size() < 32.f)
        {
            ++CaveSmokeRoutePoint;
            ProgressionSmokeElapsed = 0.f;
            return;
        }
        ProgressionSmokeElapsed += DeltaSeconds;
        if (ProgressionSmokeElapsed > 9.f) { Fail(TEXT("character blocked on Fire-Earth corridor")); return; }
        Visitor->AddMovementInput(FVector(Delta.X, Delta.Y, 0.f).GetSafeNormal(), 1.f);
        return;
    }
    if (ProgressionSmokeStage == 6)
    {
        ProgressionSmokeElapsed += DeltaSeconds;
        if (!Visitor->GetCharacterMovement()->IsMovingOnGround() ||
            FMath::Abs(Visitor->GetActorLocation().Z - 89.f) > 12.f)
        {
            if (ProgressionSmokeElapsed > 2.f)
            {
                UE_LOG(LogTemp, Error, TEXT("MUSEUM_PROGRESSION_SMOKE boundary settle pos=%s mode=%d"),
                    *Visitor->GetActorLocation().ToString(), static_cast<int32>(Visitor->GetCharacterMovement()->MovementMode));
                Fail(TEXT("visitor did not land for blocked-wall probe"));
            }
            return;
        }
        ProgressionSmokeStage = 7;
        ProgressionSmokeElapsed = 0.f;
        return;
    }
    if (ProgressionSmokeStage == 7)
    {
        if (!Visitor->GetCharacterMovement()->IsMovingOnGround() ||
            FMath::Abs(Visitor->GetActorLocation().Z - 89.f) > 12.f)
        { Fail(TEXT("blocked-wall probe is not grounded")); return; }
        ProgressionSmokeElapsed += DeltaSeconds;
        if (ProgressionSmokeElapsed < 1.f)
        {
            Visitor->AddMovementInput(FVector::ForwardVector, 1.f);
            return;
        }
        // Blocked x=185 begins at 92.25m; the 15cm visitor centre must
        // remain west of 92.10m, allowing 3cm of floating point tolerance.
        if (Visitor->GetActorLocation().X > 9213.f)
        { Fail(TEXT("visitor crossed blocked cave boundary")); return; }
        UE_LOG(LogTemp, Display, TEXT("MUSEUM_PROGRESSION_SMOKE PASS: authored DJ/EK/FL progression, save restore, 2.2s blackout, Earth growth, screenshot, grounded swept Fire-Earth round trip, blocked cave boundary"));
        ProgressionSmokeStage = -1;
        SetActorTickEnabled(false);
    }
}
