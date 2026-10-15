#include "MuseumWorld.h"
#include "Components/BoxComponent.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/SceneComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "Materials/MaterialInterface.h"
#include "Misc/FileHelper.h"
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
}

AMuseumWorld::AMuseumWorld()
{
    PrimaryActorTick.bCanEverTick = false;
    USceneComponent* Scene = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
    SetRootComponent(Scene);
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(TEXT("/Engine/BasicShapes/Cube.Cube"));
    auto MakeGroup = [this, &Cube](const TCHAR* Name, bool bCollision)
    {
        UHierarchicalInstancedStaticMeshComponent* Group = CreateDefaultSubobject<UHierarchicalInstancedStaticMeshComponent>(Name);
        Group->SetupAttachment(GetRootComponent());
        Group->SetStaticMesh(Cube.Object);
        Group->SetCollisionEnabled(bCollision ? ECollisionEnabled::QueryAndPhysics : ECollisionEnabled::NoCollision);
        Group->SetCollisionResponseToAllChannels(bCollision ? ECR_Block : ECR_Ignore);
        return Group;
    };
    Floors = MakeGroup(TEXT("Floors"), false);
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
        UBoxComponent* FloorCollision = NewObject<UBoxComponent>(this);
        FloorCollision->SetupAttachment(GetRootComponent());
        FloorCollision->SetBoxExtent(FVector((W - 2) * TileCm / 2, (H - 2) * TileCm / 2, 5.f));
        FloorCollision->SetRelativeLocation(TilePosition(X + (W - 1) / 2, Y + (H - 1) / 2, -8.f));
        FloorCollision->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
        FloorCollision->SetCollisionResponseToAllChannels(ECR_Block);
        FloorCollision->RegisterComponent();
        RoomCollision.Add(FloorCollision);

        UPointLightComponent* Light = NewObject<UPointLightComponent>(this);
        Light->SetupAttachment(GetRootComponent());
        Light->SetRelativeLocation(TilePosition(X + W / 2, Y + H / 2, 330.f));
        Light->SetIntensity(Room.Theme == TEXT("cave") ? 1800.f : 3000.f);
        Light->SetAttenuationRadius(FMath::Max(W, H) * TileCm * .9f);
        Light->SetLightColor(Room.Theme == TEXT("cave") ? FLinearColor(1.f, .48f, .20f) : FLinearColor(.86f, .9f, 1.f));
        Light->RegisterComponent();
        RoomLights.Add(Light);
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
        if (Type == TEXT("floor")) AddCube(Floors, Position + FVector(0, 0, -5), FVector(.5f, .5f, .08f));
        else if (Type == TEXT("corridor") || Type == TEXT("door")) AddCube(Corridors, Position + FVector(0, 0, -5), FVector(.5f, .5f, .08f));
        else if (Type == TEXT("wall") || Type == TEXT("rope") || Type == TEXT("scaffolding")) AddCube(Walls, Position + FVector(0, 0, 150), FVector(.5f, .5f, 3.f));
        else if (Type == TEXT("exhibit-panel") || Type == TEXT("sequence-screen") || Type == TEXT("sign")) AddCube(Displays, Position + FVector(0, 0, 105), FVector(.45f, .2f, 1.25f));
        else if (Type == TEXT("performer-station") || Type == TEXT("pedestal")) AddCube(Performers, Position + FVector(0, 0, 45), FVector(.6f, .6f, .8f));
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
    const TArray<TSharedPtr<FJsonValue>>* FurnitureValues = nullptr;
    if (Root->TryGetArrayField(TEXT("furniture"), FurnitureValues))
        for (const auto& Value : *FurnitureValues)
        {
            const TSharedPtr<FJsonObject> Json = Value->AsObject();
            AddCube(Furniture, TilePosition(NumberField(Json, TEXT("tileX")), NumberField(Json, TEXT("tileY")), 40.f), FVector(.9f, .55f, .75f));
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

const FMuseumRoom* AMuseumWorld::RoomAt(const FVector& Location) const
{
    const FIntPoint Tile(FMath::RoundToInt(Location.X / TileCm), FMath::RoundToInt(Location.Y / TileCm));
    for (const FMuseumRoom& Room : Rooms)
        if (Room.Bounds.Contains(Tile)) return &Room;
    return nullptr;
}
