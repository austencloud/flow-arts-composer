#include "FlowFestWorld.h"
#include "FlowFestAvatarComponent.h"
#include "FlowFestPropComponent.h"
#include "FlowFestEcologyComponent.h"
#include "FlowFestSoundscapeComponent.h"

#include "AssetRegistry/AssetRegistryModule.h"
#include "Components/SceneComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/PostProcessComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/TextRenderComponent.h"
#include "Dom/JsonObject.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "GameFramework/Pawn.h"
#include "Kismet/GameplayStatics.h"
#include "GameFramework/Actor.h"
#include "HAL/PlatformFileManager.h"
#include "Json.h"
#include "Materials/MaterialInterface.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Modules/ModuleManager.h"
#include "ProceduralMeshComponent.h"

namespace
{
constexpr float MetresToCm = 100.f;

float Number(const TSharedPtr<FJsonObject>& Object, const TCHAR* Key, float Default = 0.f)
{
    double Value = Default;
    return Object.IsValid() && Object->TryGetNumberField(Key, Value) ? static_cast<float>(Value) : Default;
}

FString String(const TSharedPtr<FJsonObject>& Object, const TCHAR* Key, const FString& Default = TEXT(""))
{
    FString Value;
    return Object.IsValid() && Object->TryGetStringField(Key, Value) ? Value : Default;
}

const TArray<TSharedPtr<FJsonValue>>* Array(const TSharedPtr<FJsonObject>& Object, const TCHAR* Key)
{
    const TArray<TSharedPtr<FJsonValue>>* Result = nullptr;
    return Object.IsValid() && Object->TryGetArrayField(Key, Result) ? Result : nullptr;
}

UStaticMesh* BasicMesh(const TCHAR* Name)
{
    return LoadObject<UStaticMesh>(nullptr, Name);
}
}

AFlowFestWorld::AFlowFestWorld()
{
    PrimaryActorTick.bCanEverTick = true;
    PrimaryActorTick.bStartWithTickEnabled = false;
    SiteRoot = CreateDefaultSubobject<USceneComponent>(TEXT("SiteRoot"));
    RootComponent = SiteRoot;
    Ecology = CreateDefaultSubobject<UFlowFestEcologyComponent>(TEXT("Ecology"));
    Ecology->SetupAttachment(SiteRoot);
    Soundscape = CreateDefaultSubobject<UFlowFestSoundscapeComponent>(TEXT("Soundscape"));
    Soundscape->SetupAttachment(SiteRoot);

    Sun = CreateDefaultSubobject<UDirectionalLightComponent>(TEXT("Sun"));
    Sun->SetupAttachment(SiteRoot);
    Sun->SetMobility(EComponentMobility::Movable);
    Sun->bAtmosphereSunLight = true;
    Sun->AtmosphereSunLightIndex = 0;
    Sun->CastShadows = true;

    Moon = CreateDefaultSubobject<UDirectionalLightComponent>(TEXT("Moon"));
    Moon->SetupAttachment(SiteRoot);
    Moon->SetMobility(EComponentMobility::Movable);
    Moon->bAtmosphereSunLight = true;
    Moon->AtmosphereSunLightIndex = 1;
    Moon->SetLightColor(FLinearColor(0.43f, 0.57f, 1.f));
    Moon->SetIntensity(0.f);
    Moon->CastShadows = true;

    Atmosphere = CreateDefaultSubobject<USkyAtmosphereComponent>(TEXT("Atmosphere"));
    Atmosphere->SetupAttachment(SiteRoot);
    Atmosphere->SetMobility(EComponentMobility::Movable);

    SkyLight = CreateDefaultSubobject<USkyLightComponent>(TEXT("SkyLight"));
    SkyLight->SetupAttachment(SiteRoot);
    SkyLight->SetMobility(EComponentMobility::Movable);
    SkyLight->SourceType = ESkyLightSourceType::SLS_CapturedScene;
    SkyLight->bRealTimeCapture = true;

    Fog = CreateDefaultSubobject<UExponentialHeightFogComponent>(TEXT("ValleyHaze"));
    Fog->SetupAttachment(SiteRoot);
    Fog->SetMobility(EComponentMobility::Movable);
    Fog->FogDensity = 0.012f;
    Fog->FogHeightFalloff = 0.2f;
    Fog->SetRelativeLocation(FVector(0, 0, -1000.f));

    PostProcess = CreateDefaultSubobject<UPostProcessComponent>(TEXT("FestivalColor"));
    PostProcess->SetupAttachment(SiteRoot);
    PostProcess->bUnbound = true;
    PostProcess->Settings.bOverride_AutoExposureMethod = true;
    PostProcess->Settings.AutoExposureMethod = EAutoExposureMethod::AEM_Histogram;
    PostProcess->Settings.bOverride_AutoExposureMinBrightness = true;
    PostProcess->Settings.bOverride_AutoExposureMaxBrightness = true;
    PostProcess->Settings.AutoExposureMinBrightness = -3.f;
    PostProcess->Settings.AutoExposureMaxBrightness = 16.f;
    PostProcess->Settings.bOverride_AutoExposureBias = true;
    PostProcess->Settings.AutoExposureBias = 0.f;
    PostProcess->Settings.bOverride_AutoExposureSpeedUp = true;
    PostProcess->Settings.AutoExposureSpeedUp = 2.f;
    PostProcess->Settings.bOverride_AutoExposureSpeedDown = true;
    PostProcess->Settings.AutoExposureSpeedDown = 1.f;
    // Preserve sunlit foliage when the player is standing beneath a dark canopy.
    PostProcess->Settings.bOverride_LocalExposureHighlightContrastScale = true;
    PostProcess->Settings.LocalExposureHighlightContrastScale = 0.7f;
    PostProcess->Settings.bOverride_LocalExposureShadowContrastScale = true;
    PostProcess->Settings.LocalExposureShadowContrastScale = 0.9f;
    PostProcess->Settings.bOverride_BloomIntensity = true;
    PostProcess->Settings.BloomIntensity = 0.45f;
    PostProcess->Settings.bOverride_VignetteIntensity = true;
    PostProcess->Settings.VignetteIntensity = 0.14f;
}

void AFlowFestWorld::BeginPlay()
{
    Super::BeginPlay();
    if (!LoadSite())
    {
        UE_LOG(LogTemp, Error, TEXT("Flow Fest site could not be loaded. World geometry was not built."));
        FPlatformMisc::RequestExitWithStatus(false, 1);
        return;
    }
    BuildTerrain();
    BuildRoads();
    BuildTrees();
    if (!Ecology->BuildFromSite()) UE_LOG(LogTemp, Error, TEXT("Flow Fest ecology could not load; run the environment asset import."));
    BuildCamps();
    BuildVehicles();
    BuildFestivalLandmarks();
    BuildLanterns();
    BuildPeople();
    if (!Soundscape->BuildFromSite(this)) UE_LOG(LogTemp, Error, TEXT("Flow Fest soundscape could not load; run the audio import."));
    SetTimeOfDay(TimeOfDay);
}

void AFlowFestWorld::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if (FireLight)
    {
        const float Seconds = GetWorld()->GetTimeSeconds();
        const float Flicker = 0.88f + 0.08f * FMath::Sin(Seconds * 8.1f)
            + 0.04f * FMath::Sin(Seconds * 13.7f + 1.3f);
        FireLight->SetIntensity(15000.f * Flicker);
    }
    Crowd.Tick(DeltaSeconds);
    const TArray<FFlowFestCrowdAgent>& Agents = Crowd.GetAgents();
    for (int32 I = 0; I < People.Num() && I < Agents.Num(); ++I)
    {
        FFestivalPerson& Person = People[I];
        const FFlowFestCrowdAgent& Agent = Agents[I];
        if (!IsValid(Person.Actor) || !IsValid(Person.Avatar)) continue;
        const FVector LocalFoot = ToWorld(Agent.Position.X, Agent.Position.Y);
        Person.Actor->SetActorLocation(SiteRoot->GetComponentTransform().TransformPosition(LocalFoot));
        Person.Actor->SetActorRotation(FRotator(0.f, Agent.Facing + SiteRoot->GetComponentRotation().Yaw, 0.f));
        const bool bPerforming = Agent.Activity == EFlowFestCrowdActivity::Perform || Agent.Activity == EFlowFestCrowdActivity::Practice;
        if (Person.LastActivity != Agent.Activity)
        {
            if (bPerforming && Person.Prop && !Agent.PerformanceId.IsNone())
            {
                const FName Profile = Agent.PerformanceId;
                Person.bPerformancePlaying = Person.Prop->LoadPerformance(Agent.AvatarId, Profile)
                    && Person.Avatar->PlayPerformance(Profile);
                if (Person.bPerformancePlaying)
                {
                    Person.Avatar->SetPerformancePhase(FMath::Frac(Agent.PhaseOffset / (2.f * PI)));
                    Person.Prop->SetFinish(Agent.FinishId);
                }
                else Person.Avatar->StopPerformance();
            }
            else if (Person.bPerformancePlaying)
            {
                Person.Avatar->StopPerformance();
                Person.Prop->ClearPerformanceTransforms();
                Person.bPerformancePlaying = false;
            }
            if (!Person.bPerformancePlaying && Person.Prop) Person.Prop->SetFinish(NAME_None);
            Person.LastActivity = Agent.Activity;
        }
        const FVector WorldVelocity = SiteRoot->GetComponentTransform().TransformVectorNoScale(FVector(Agent.Velocity.X, Agent.Velocity.Y, 0.f) * MetresToCm);
        Person.Avatar->SetMotion(WorldVelocity, false, false);
        if (Person.Prop && !Person.bPerformancePlaying)
        {
            Person.Prop->SetHandTransforms(Person.Avatar->GetHandTransform(true), Person.Avatar->GetHandTransform(false));
        }
    }
}

bool AFlowFestWorld::LoadSite()
{
    const FString DataDir = FPaths::ProjectContentDir() / TEXT("Data");
    FString JsonText;
    if (!FFileHelper::LoadFileToString(JsonText, *(DataDir / TEXT("site.json"))))
    {
        UE_LOG(LogTemp, Error, TEXT("Missing Flow Fest site JSON at %s"), *(DataDir / TEXT("site.json")));
        return false;
    }
    TSharedPtr<FJsonObject> Root;
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonText);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid() || Number(Root, TEXT("version")) != 1.f)
    {
        UE_LOG(LogTemp, Error, TEXT("Invalid Flow Fest site JSON/version"));
        return false;
    }

    const TSharedPtr<FJsonObject>* Terrain = nullptr;
    if (!Root->TryGetObjectField(TEXT("terrain"), Terrain) || !Terrain || !Terrain->IsValid()) return false;
    GridWidth = FMath::RoundToInt(Number(*Terrain, TEXT("width")));
    GridHeight = FMath::RoundToInt(Number(*Terrain, TEXT("height")));
    GridSpacing = Number(*Terrain, TEXT("spacing"), 1.f);
    GridMinEast = Number(*Terrain, TEXT("minX"), -512.f);
    GridMinSouth = Number(*Terrain, TEXT("minZ"), -512.f);
    OriginElevation = Number(*Terrain, TEXT("originElevation"), 270.f);
    const FString HeightPath = DataDir / String(*Terrain, TEXT("heightFile"), TEXT("terrain-height.f32"));
    if (GridWidth < 2 || GridHeight < 2 || GridWidth > 4097 || GridHeight > 4097 || GridSpacing <= 0.f)
    {
        UE_LOG(LogTemp, Error, TEXT("Flow Fest terrain dimensions are invalid"));
        return false;
    }
    TArray<uint8> Bytes;
    if (!FFileHelper::LoadFileToArray(Bytes, *HeightPath) || Bytes.Num() != GridWidth * GridHeight * sizeof(float))
    {
        UE_LOG(LogTemp, Error, TEXT("Flow Fest terrain height file missing or wrong size: %s"), *HeightPath);
        return false;
    }
    Elevations.SetNumUninitialized(GridWidth * GridHeight);
    FMemory::Memcpy(Elevations.GetData(), Bytes.GetData(), Bytes.Num());

    if (const auto* Items = Array(Root, TEXT("landmarks")))
    {
        for (const TSharedPtr<FJsonValue>& Item : *Items)
        {
            const TSharedPtr<FJsonObject> Object = Item->AsObject();
            if (Object.IsValid()) Landmarks.Add(String(Object, TEXT("id")), FVector2D(Number(Object, TEXT("x")), Number(Object, TEXT("z"))));
        }
    }
    if (const auto* Items = Array(Root, TEXT("roads")))
    {
        for (const TSharedPtr<FJsonValue>& Item : *Items)
        {
            const TSharedPtr<FJsonObject> Object = Item->AsObject();
            if (!Object.IsValid()) continue;
            FSiteRoad Road;
            Road.Id = String(Object, TEXT("id"));
            Road.Kind = String(Object, TEXT("kind"));
            Road.Width = FMath::Clamp(Number(Object, TEXT("width"), 3.f), 0.5f, 15.f);
            if (const auto* Points = Array(Object, TEXT("points")))
            {
                for (const TSharedPtr<FJsonValue>& Point : *Points)
                {
                    const TArray<TSharedPtr<FJsonValue>>* Pair = nullptr;
                    if (Point.IsValid() && Point->TryGetArray(Pair) && Pair && Pair->Num() >= 2)
                    {
                        Road.Points.Add(FVector2D((*Pair)[0]->AsNumber(), (*Pair)[1]->AsNumber()));
                    }
                }
            }
            if (Road.Points.Num() >= 2) Roads.Add(MoveTemp(Road));
        }
    }
    if (const auto* Items = Array(Root, TEXT("trees")))
    {
        for (const TSharedPtr<FJsonValue>& Item : *Items)
        {
            const TSharedPtr<FJsonObject> Object = Item->AsObject();
            if (!Object.IsValid()) continue;
            FSiteTree Tree;
            Tree.Position = FVector2D(Number(Object, TEXT("x")), Number(Object, TEXT("z")));
            Tree.Family = String(Object, TEXT("family"));
            Tree.Height = Number(Object, TEXT("height"), 10.f);
            Tree.Rotation = Number(Object, TEXT("rotation"));
            Trees.Add(MoveTemp(Tree));
        }
    }
    if (const auto* Items = Array(Root, TEXT("backdropTrees")))
    {
        for (const TSharedPtr<FJsonValue>& Item : *Items)
        {
            const TSharedPtr<FJsonObject> Object = Item->AsObject();
            if (!Object.IsValid()) continue;
            FSiteTree Tree;
            Tree.Position = FVector2D(Number(Object, TEXT("x")), Number(Object, TEXT("z")));
            Tree.Family = String(Object, TEXT("family"));
            Tree.Height = Number(Object, TEXT("height"), 10.f);
            Tree.Rotation = Number(Object, TEXT("rotation"));
            BackdropTrees.Add(MoveTemp(Tree));
        }
    }
    if (const auto* Items = Array(Root, TEXT("camps")))
    {
        for (const TSharedPtr<FJsonValue>& Item : *Items)
        {
            const TSharedPtr<FJsonObject> Object = Item->AsObject();
            if (!Object.IsValid()) continue;
            FSiteCamp Camp;
            Camp.Position = FVector2D(Number(Object, TEXT("x")), Number(Object, TEXT("z")));
            Camp.Rotation = Number(Object, TEXT("rotation"));
            Camp.Scale = Number(Object, TEXT("scale"), 1.f);
            Camp.Type = String(Object, TEXT("type"), TEXT("tent"));
            Camps.Add(MoveTemp(Camp));
        }
    }
    if (const auto* Items = Array(Root, TEXT("vehicles")))
    {
        for (const TSharedPtr<FJsonValue>& Item : *Items)
        {
            const TSharedPtr<FJsonObject> Object = Item->AsObject();
            if (!Object.IsValid()) continue;
            FSiteVehicle Vehicle;
            Vehicle.Position = FVector2D(Number(Object, TEXT("x")), Number(Object, TEXT("z")));
            Vehicle.Rotation = Number(Object, TEXT("rotation"));
            Vehicle.Model = String(Object, TEXT("model"));
            Vehicle.PaintIndex = FMath::RoundToInt(Number(Object, TEXT("paintIndex")));
            Vehicles.Add(MoveTemp(Vehicle));
        }
    }
    if (const auto* Items = Array(Root, TEXT("assets")))
    {
        for (const TSharedPtr<FJsonValue>& Item : *Items)
        {
            const TSharedPtr<FJsonObject> Object = Item->AsObject();
            if (Object.IsValid()) SourceMeshHeights.Add(String(Object, TEXT("family")), Number(Object, TEXT("sourceHeight")));
        }
    }
    UE_LOG(LogTemp, Display, TEXT("Flow Fest site: %dx%d terrain, %d roads, %d near trees, %d backdrop trees, %d camps, %d vehicles, %d landmarks"), GridWidth, GridHeight, Roads.Num(), Trees.Num(), BackdropTrees.Num(), Camps.Num(), Vehicles.Num(), Landmarks.Num());
    return true;
}

float AFlowFestWorld::ElevationAt(float East, float South) const
{
    if (Elevations.IsEmpty()) return OriginElevation;
    const float X = FMath::Clamp((East - GridMinEast) / GridSpacing, 0.f, static_cast<float>(GridWidth - 1));
    const float Y = FMath::Clamp((South - GridMinSouth) / GridSpacing, 0.f, static_cast<float>(GridHeight - 1));
    const int32 X0 = FMath::FloorToInt(X), Y0 = FMath::FloorToInt(Y);
    const int32 X1 = FMath::Min(X0 + 1, GridWidth - 1), Y1 = FMath::Min(Y0 + 1, GridHeight - 1);
    const float A = FMath::Lerp(Elevations[Y0 * GridWidth + X0], Elevations[Y0 * GridWidth + X1], X - X0);
    const float B = FMath::Lerp(Elevations[Y1 * GridWidth + X0], Elevations[Y1 * GridWidth + X1], X - X0);
    return FMath::Lerp(A, B, Y - Y0);
}

float AFlowFestWorld::SampleGround(float EastMeters, float SouthMeters) const
{
    return (ElevationAt(EastMeters, SouthMeters) - OriginElevation) * MetresToCm;
}

FVector AFlowFestWorld::ToWorld(float East, float South, float HeightOffsetCm) const
{
    return FVector(East * MetresToCm, South * MetresToCm, SampleGround(East, South) + HeightOffsetCm);
}

FVector AFlowFestWorld::GetLandmark(const FString& Id) const
{
    const FVector2D* Position = Landmarks.Find(Id);
    return Position ? ToWorld(Position->X, Position->Y) : FVector::ZeroVector;
}

UMaterialInterface* AFlowFestWorld::LoadMaterial(const FString& Name) const
{
    const FString Path = FString::Printf(TEXT("/Game/FlowFest/Materials/%s.%s"), *Name, *Name);
    return LoadObject<UMaterialInterface>(nullptr, *Path);
}

void AFlowFestWorld::BuildTerrain()
{
    // 2 m vertices in 128 m chunks retain measured slopes and give walkers collision.
    const int32 Step = FMath::Max(1, FMath::RoundToInt(2.f / GridSpacing));
    const int32 CellCountX = (GridWidth - 1) / Step;
    const int32 CellCountY = (GridHeight - 1) / Step;
    const int32 ChunkCells = 64;
    UMaterialInterface* Ground = LoadMaterial(TEXT("M_Ground"));
    for (int32 BaseY = 0; BaseY < CellCountY; BaseY += ChunkCells)
    {
        for (int32 BaseX = 0; BaseX < CellCountX; BaseX += ChunkCells)
        {
            const int32 CellsX = FMath::Min(ChunkCells, CellCountX - BaseX);
            const int32 CellsY = FMath::Min(ChunkCells, CellCountY - BaseY);
            TArray<FVector> Vertices;
            TArray<int32> Triangles;
            TArray<FVector> Normals;
            TArray<FVector2D> UVs;
            TArray<FLinearColor> Colors;
            TArray<FProcMeshTangent> Tangents;
            Vertices.Reserve((CellsX + 1) * (CellsY + 1));
            Normals.Reserve(Vertices.Num());
            for (int32 Y = 0; Y <= CellsY; ++Y)
            {
                for (int32 X = 0; X <= CellsX; ++X)
                {
                    const float East = GridMinEast + (BaseX + X) * Step * GridSpacing;
                    const float South = GridMinSouth + (BaseY + Y) * Step * GridSpacing;
                    Vertices.Add(ToWorld(East, South));
                    const float Dx = SampleGround(East + 1.f, South) - SampleGround(East - 1.f, South);
                    const float Dy = SampleGround(East, South + 1.f) - SampleGround(East, South - 1.f);
                    Normals.Add(FVector(-Dx, -Dy, 200.f).GetSafeNormal());
                    UVs.Add(FVector2D(East / 4.f, South / 4.f));
                    Colors.Add(FLinearColor::White);
                    Tangents.Add(FProcMeshTangent(1.f, 0.f, 0.f));
                }
            }
            for (int32 Y = 0; Y < CellsY; ++Y)
            {
                for (int32 X = 0; X < CellsX; ++X)
                {
                    const int32 A = Y * (CellsX + 1) + X;
                    const int32 B = A + 1;
                    const int32 C = A + CellsX + 1;
                    const int32 D = C + 1;
                    Triangles.Append({A, C, B, B, C, D});
                }
            }
            UProceduralMeshComponent* Chunk = NewObject<UProceduralMeshComponent>(this);
            Chunk->SetupAttachment(SiteRoot);
            Chunk->RegisterComponent();
            Chunk->bUseAsyncCooking = true;
            Chunk->SetCollisionProfileName(TEXT("BlockAll"));
            Chunk->CreateMeshSection_LinearColor(0, Vertices, Triangles, Normals, UVs, Colors, Tangents, true);
            if (Ground) Chunk->SetMaterial(0, Ground);
            TerrainChunks.Add(Chunk);
        }
    }
}

void AFlowFestWorld::BuildRoads()
{
    UMaterialInterface* Dirt = LoadMaterial(TEXT("M_Dirt"));
    UMaterialInterface* Asphalt = LoadMaterial(TEXT("M_Asphalt"));
    for (const FSiteRoad& Road : Roads)
    {
        TArray<FVector> Vertices;
        TArray<int32> Triangles;
        TArray<FVector> Normals;
        TArray<FVector2D> UVs;
        TArray<FLinearColor> Colors;
        TArray<FProcMeshTangent> Tangents;
        float Distance = 0.f;
        // Independent short ribbons follow the real DTM; path junctions remain on grade.
        for (int32 I = 1; I < Road.Points.Num(); ++I)
        {
            const FVector2D Start = Road.Points[I - 1];
            const FVector2D End = Road.Points[I];
            const FVector2D Delta = End - Start;
            const float Length = Delta.Size();
            if (Length < 0.05f) continue;
            const FVector2D Side(-Delta.Y / Length, Delta.X / Length);
            const int32 Segments = FMath::Max(1, FMath::CeilToInt(Length / 2.f));
            for (int32 J = 0; J <= Segments; ++J)
            {
                const float T = static_cast<float>(J) / Segments;
                const FVector2D Center = FMath::Lerp(Start, End, T);
                for (int32 K = 0; K < 2; ++K)
                {
                    const FVector2D P = Center + Side * (K == 0 ? -Road.Width * 0.5f : Road.Width * 0.5f);
                    Vertices.Add(ToWorld(P.X, P.Y, 4.f));
                    Normals.Add(FVector::UpVector);
                    UVs.Add(FVector2D((Distance + Length * T) / 3.f, K));
                    Colors.Add(FLinearColor::White);
                    Tangents.Add(FProcMeshTangent(Delta.X, Delta.Y, 0.f));
                }
                if (J > 0)
                {
                    const int32 A = Vertices.Num() - 4;
                    Triangles.Append({A, A + 1, A + 2, A + 1, A + 3, A + 2});
                }
            }
            Distance += Length;
        }
        if (Vertices.IsEmpty()) continue;
        UProceduralMeshComponent* Mesh = NewObject<UProceduralMeshComponent>(this);
        Mesh->SetupAttachment(SiteRoot);
        Mesh->RegisterComponent();
        Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        Mesh->CreateMeshSection_LinearColor(0, Vertices, Triangles, Normals, UVs, Colors, Tangents, false);
        Mesh->SetMaterial(0, (Road.Kind.Contains(TEXT("asphalt"), ESearchCase::IgnoreCase) || Road.Kind == TEXT("public-road")) ? Asphalt : Dirt);
    }
}

UHierarchicalInstancedStaticMeshComponent* AFlowFestWorld::AddInstanceGroup(UStaticMesh* Mesh, const FString& Name, UMaterialInterface* OverrideMaterial)
{
    if (!Mesh) return nullptr;
    UHierarchicalInstancedStaticMeshComponent* Group = NewObject<UHierarchicalInstancedStaticMeshComponent>(this, FName(*Name));
    Group->SetupAttachment(SiteRoot);
    Group->SetStaticMesh(Mesh);
    Group->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Group->RegisterComponent();
    if (OverrideMaterial) Group->SetMaterial(0, OverrideMaterial);
    InstanceGroups.Add(Group);
    return Group;
}

void AFlowFestWorld::BuildTrees()
{
    TMap<FString, UHierarchicalInstancedStaticMeshComponent*> Groups;
    // The near trees use simple invisible trunks for walking collision. HiddenInGame
    // only affects rendering; the instances retain their BlockAll collision bodies.
    UHierarchicalInstancedStaticMeshComponent* Trunks = AddInstanceGroup(BasicMesh(TEXT("/Engine/BasicShapes/Cylinder.Cylinder")), TEXT("TreeTrunkCollision"));
    if (Trunks)
    {
        Trunks->SetCollisionProfileName(TEXT("BlockAll"));
        Trunks->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
        Trunks->SetHiddenInGame(true);
        Trunks->SetCastShadow(false);
    }
    for (int32 Layer = 0; Layer < 2; ++Layer)
    {
      const bool bBackdrop = Layer == 1;
      const TArray<FSiteTree>& LayerTrees = bBackdrop ? BackdropTrees : Trees;
      for (const FSiteTree& Tree : LayerTrees)
      {
        if (Tree.Family.IsEmpty() || Tree.Height <= 0.f) continue;
        const FString GroupKey = Tree.Family + (bBackdrop ? TEXT("_backdrop") : TEXT("_near"));
        UHierarchicalInstancedStaticMeshComponent** Existing = Groups.Find(GroupKey);
        if (Existing && !*Existing) continue;
        UHierarchicalInstancedStaticMeshComponent* Group = Existing ? *Existing : nullptr;
        if (!Group)
        {
            FString Normalized = Tree.Family;
            Normalized.ReplaceInline(TEXT("-"), TEXT("_"));
            const FString AssetPath = FString::Printf(TEXT("/Game/FlowFest/Assets/Trees/%s/%s.%s"), *Normalized, *Normalized, *Normalized);
            UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *AssetPath);
            if (!Mesh)
            {
                // Importers can rename the generated static mesh within its family package.
                const FString Folder = FString::Printf(TEXT("/Game/FlowFest/Assets/Trees/%s"), *Normalized);
                FAssetRegistryModule& Registry = FModuleManager::LoadModuleChecked<FAssetRegistryModule>(TEXT("AssetRegistry"));
                TArray<FAssetData> Found;
                Registry.Get().GetAssetsByPath(FName(*Folder), Found, true);
                for (const FAssetData& Asset : Found)
                {
                    Mesh = Cast<UStaticMesh>(Asset.GetAsset());
                    if (Mesh) break;
                }
            }
            if (!Mesh)
            {
                UE_LOG(LogTemp, Warning, TEXT("Flow Fest tree asset missing: %s"), *AssetPath);
                Groups.Add(GroupKey, nullptr);
                continue;
            }
            Group = AddInstanceGroup(Mesh, TEXT("Trees_") + GroupKey);
            if (bBackdrop) Group->SetCullDistances(18000, 110000);
            Groups.Add(GroupKey, Group);
        }
        if (!Group) continue;
        const float MeshCm = Group->GetStaticMesh()->GetBounds().BoxExtent.Z * 2.f;
        const float Scale = Tree.Height * MetresToCm / FMath::Max(1.f, MeshCm);
        // Three.js +Y rotations reverse when source (x,y,z) maps to UE (x,z,y).
        Group->AddInstance(FTransform(FRotator(0.f, -FMath::RadiansToDegrees(Tree.Rotation), 0.f), ToWorld(Tree.Position.X, Tree.Position.Y), FVector(Scale)));
        if (!bBackdrop && Trunks)
        {
            const float TrunkHeightCm = FMath::Min(300.f, Tree.Height * MetresToCm * 0.45f);
            Trunks->AddInstance(FTransform(FRotator::ZeroRotator, ToWorld(Tree.Position.X, Tree.Position.Y, TrunkHeightCm * 0.5f), FVector(0.5f, 0.5f, TrunkHeightCm / 100.f)));
        }
      }
    }
}

UStaticMesh* AFlowFestWorld::LoadSetMesh(const FString& Name) const
{
    const FString Path = FString::Printf(TEXT("/Game/FlowFest/Assets/Set/%s.%s"), *Name, *Name);
    return LoadObject<UStaticMesh>(nullptr, *Path);
}

void AFlowFestWorld::AddSetPiece(const FString& AssetName, const FVector& Position, const FRotator& Rotation, const FVector& Scale)
{
    UStaticMesh* Mesh = LoadSetMesh(AssetName);
    if (!Mesh)
    {
        UE_LOG(LogTemp, Warning, TEXT("Flow Fest set mesh missing: %s"), *AssetName);
        return;
    }
    UStaticMeshComponent* Component = NewObject<UStaticMeshComponent>(this);
    Component->SetupAttachment(SiteRoot);
    Component->SetStaticMesh(Mesh);
    Component->SetCollisionProfileName(TEXT("BlockAll"));
    Component->SetRelativeTransform(FTransform(Rotation, Position, Scale));
    Component->RegisterComponent();
}

void AFlowFestWorld::BuildCamps()
{
    TMap<FString, UHierarchicalInstancedStaticMeshComponent*> Groups;
    for (const FSiteCamp& Camp : Camps)
    {
        if (Camp.Type == TEXT("player-tent"))
        {
            PlayerTentPlacement = Camp;
            bHasPlayerTentPlacement = true;
            continue;
        }
        const bool IsCanopy = Camp.Type.Contains(TEXT("canopy"), ESearchCase::IgnoreCase);
        const bool IsDome = Camp.Type.Contains(TEXT("dome"), ESearchCase::IgnoreCase);
        FString AssetName = IsCanopy ? TEXT("Canopy") : IsDome ? TEXT("DomeTent") : TEXT("Tent");
        UHierarchicalInstancedStaticMeshComponent* Group = Groups.FindRef(AssetName);
        if (!Group)
        {
            UStaticMesh* Mesh = LoadSetMesh(AssetName);
            if (!Mesh && IsDome)
            {
                AssetName = TEXT("Tent");
                Mesh = LoadSetMesh(AssetName);
                Group = Groups.FindRef(AssetName);
            }
            if (!Mesh) continue;
            if (!Group)
            {
                Group = AddInstanceGroup(Mesh, AssetName + TEXT("Instances"));
                Groups.Add(AssetName, Group);
            }
        }
        Group->AddInstance(FTransform(FRotator(0.f, -FMath::RadiansToDegrees(Camp.Rotation), 0.f), ToWorld(Camp.Position.X, Camp.Position.Y), FVector(Camp.Scale)));
    }
    if (bHasPlayerTentPlacement)
    {
        if (UStaticMesh* TentMesh = LoadSetMesh(TEXT("Tent")))
        {
            PlayerTent = NewObject<UStaticMeshComponent>(this, TEXT("PlayerTent"));
            PlayerTent->SetupAttachment(SiteRoot);
            PlayerTent->SetStaticMesh(TentMesh);
            PlayerTent->SetRelativeScale3D(FVector(PlayerTentPlacement.Scale));
            PlayerTent->SetRelativeRotation(FRotator(0.f, -FMath::RadiansToDegrees(PlayerTentPlacement.Rotation), 0.f));
            PlayerTent->SetHiddenInGame(true);
            PlayerTent->SetCollisionEnabled(ECollisionEnabled::NoCollision);
            PlayerTent->RegisterComponent();
        }
    }
}

void AFlowFestWorld::SetPlayerCamp(FString CampLandmark, bool bBuilt)
{
    if (!PlayerTent) return;
    const FVector2D* Camp = Landmarks.Find(CampLandmark);
    const bool bVisible = bBuilt && Camp;
    if (Camp)
    {
        FVector2D Position = *Camp;
        if (bHasPlayerTentPlacement)
        {
            // Retain the authored tent offset from lower camp when the selected camp changes.
            if (const FVector2D* Lower = Landmarks.Find(TEXT("camp-lower")))
            {
                Position += PlayerTentPlacement.Position - *Lower;
            }
        }
        PlayerTent->SetRelativeLocation(ToWorld(Position.X, Position.Y));
    }
    PlayerTent->SetHiddenInGame(!bVisible);
    PlayerTent->SetCollisionEnabled(bVisible ? ECollisionEnabled::QueryAndPhysics : ECollisionEnabled::NoCollision);
}

void AFlowFestWorld::BuildVehicles()
{
    UStaticMesh* Car = LoadObject<UStaticMesh>(nullptr, TEXT("/Game/FlowFest/Assets/Car/SM_Car.SM_Car"));
    if (!Car)
    {
        UE_LOG(LogTemp, Warning, TEXT("Flow Fest parked car mesh is missing"));
        return;
    }
    UHierarchicalInstancedStaticMeshComponent* Parked = AddInstanceGroup(Car, TEXT("ParkedVehicles"));
    Parked->SetCollisionProfileName(TEXT("BlockAll"));
    Parked->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
    const FBoxSphereBounds Bounds = Car->GetBounds();
    for (const FSiteVehicle& Vehicle : Vehicles)
    {
        FVector Scale(1.f);
        if (Vehicle.Model.Contains(TEXT("hatchback"))) Scale = FVector(.86f, .93f, .92f);
        else if (Vehicle.Model.Contains(TEXT("wagon"))) Scale = FVector(1.1f, .97f, .98f);
        else if (Vehicle.Model.Contains(TEXT("pickup"))) Scale = FVector(1.2f, 1.06f, 1.08f);
        else if (Vehicle.Model.Contains(TEXT("suv"))) Scale = FVector(1.06f, 1.03f, 1.16f);
        else if (Vehicle.Model.Contains(TEXT("camper"))) Scale = FVector(1.24f, 1.12f, 1.32f);
        const float BottomOffset = -(Bounds.Origin.Z - Bounds.BoxExtent.Z) * Scale.Z;
        Parked->AddInstance(FTransform(FRotator(0.f, -FMath::RadiansToDegrees(Vehicle.Rotation), 0.f), ToWorld(Vehicle.Position.X, Vehicle.Position.Y, BottomOffset), Scale));
    }
}

void AFlowFestWorld::AddSign(const FString& Label, const FVector2D& At, float Yaw)
{
    AddSetPiece(TEXT("Signpost"), ToWorld(At.X, At.Y), FRotator(0.f, Yaw, 0.f));
    for (float Side : {-1.f, 1.f})
    {
        UTextRenderComponent* Text = NewObject<UTextRenderComponent>(this);
        Text->SetupAttachment(SiteRoot);
        Text->SetText(FText::FromString(Label));
        Text->SetTextRenderColor(FColor(255, 232, 174));
        Text->SetWorldSize(18.f);
        Text->SetHorizontalAlignment(EHTA_Center);
        Text->SetVerticalAlignment(EVRTA_TextCenter);
        const FVector FaceOffset = FRotator(0.f, Yaw, 0.f).RotateVector(FVector(0.f, Side * 6.f, 180.f));
        Text->SetRelativeLocation(ToWorld(At.X, At.Y) + FaceOffset);
        Text->SetRelativeRotation(FRotator(0.f, Yaw + Side * 90.f, 0.f));
        Text->RegisterComponent();
    }
}

void AFlowFestWorld::BuildFestivalLandmarks()
{
    if (const FVector2D* Gate = Landmarks.Find(TEXT("gate")))
    {
        AddSetPiece(TEXT("Gatehouse"), ToWorld(Gate->X, Gate->Y), FRotator::ZeroRotator);
        AddSign(TEXT("FLOW FEST"), *Gate, 0.f);
    }
    if (const FVector2D* Fire = Landmarks.Find(TEXT("fire")))
    {
        AddSetPiece(TEXT("Firepit"), ToWorld(Fire->X, Fire->Y), FRotator::ZeroRotator);
        // A few intersecting sheets keep the fire readable from every side without a solid cone.
        // All turbulence and rising spark motion are shader driven; the geometry is built once.
        UMaterialInterface* FlameMaterial = LoadMaterial(TEXT("M_FireFlame"));
        UMaterialInterface* SparkMaterial = LoadMaterial(TEXT("M_FireSparks"));
        if (FlameMaterial && SparkMaterial)
        {
            UProceduralMeshComponent* FireMesh = NewObject<UProceduralMeshComponent>(this);
            FireMesh->SetupAttachment(SiteRoot);
            FireMesh->SetRelativeLocation(ToWorld(Fire->X, Fire->Y, 34.f));
            FireMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
            FireMesh->CastShadow = false;
            const auto MakeSheets = [FireMesh](int32 Section, int32 Count, float BaseWidth, float Height, float MinZ, float Radius)
            {
                TArray<FVector> Vertices;
                TArray<int32> Triangles;
                TArray<FVector> Normals;
                TArray<FVector2D> UVs;
                TArray<FLinearColor> Colors;
                for (int32 I = 0; I < Count; ++I)
                {
                    const float Angle = PI * I / Count + 0.31f;
                    const FVector Across(FMath::Cos(Angle), FMath::Sin(Angle), 0.f);
                    const FVector Normal(-Across.Y, Across.X, 0.f);
                    const FVector Offset = Normal * (Radius * FMath::Sin(I * 2.39f));
                    const float Width = BaseWidth * (0.83f + 0.13f * FMath::Sin(I * 3.1f));
                    const float Top = MinZ + Height * (0.79f + 0.17f * FMath::Cos(I * 2.1f));
                    const int32 Start = Vertices.Num();
                    Vertices.Add(Offset - Across * Width * 0.5f + FVector(0, 0, MinZ));
                    Vertices.Add(Offset + Across * Width * 0.5f + FVector(0, 0, MinZ));
                    Vertices.Add(Offset - Across * Width * 0.5f + FVector(0, 0, Top));
                    Vertices.Add(Offset + Across * Width * 0.5f + FVector(0, 0, Top));
                    Triangles.Append({Start, Start + 2, Start + 1, Start + 1, Start + 2, Start + 3});
                    for (int32 Vertex = 0; Vertex < 4; ++Vertex) Normals.Add(Normal);
                    UVs.Append({FVector2D(0, 0), FVector2D(1, 0), FVector2D(0, 1), FVector2D(1, 1)});
                    for (int32 Vertex = 0; Vertex < 4; ++Vertex) Colors.Add(FLinearColor::White);
                }
                TArray<FProcMeshTangent> Tangents;
                FireMesh->CreateMeshSection_LinearColor(Section, Vertices, Triangles, Normals, UVs, Colors, Tangents, false);
            };
            MakeSheets(0, 7, 115.f, 205.f, 0.f, 27.f);
            MakeSheets(1, 3, 165.f, 255.f, 90.f, 32.f);
            FireMesh->SetMaterial(0, FlameMaterial);
            FireMesh->SetMaterial(1, SparkMaterial);
            FireMesh->RegisterComponent();
        }
        else
        {
            UE_LOG(LogTemp, Warning, TEXT("Flow Fest fire materials are missing; run Tools/create-fire-material.py"));
        }
        for (int32 I = 0; I < 5; ++I)
        {
            const float Angle = 2.f * PI * I / 5.f;
            const FVector2D At = *Fire + FVector2D(FMath::Cos(Angle), FMath::Sin(Angle)) * 5.5f;
            AddSetPiece(TEXT("Bench"), ToWorld(At.X, At.Y), FRotator(0.f, FMath::RadiansToDegrees(Angle) + 90.f, 0.f));
        }
        UPointLightComponent* Light = NewObject<UPointLightComponent>(this);
        Light->SetupAttachment(SiteRoot);
        Light->SetRelativeLocation(ToWorld(Fire->X, Fire->Y, 120.f));
        Light->SetLightColor(FLinearColor(1.f, 0.42f, 0.12f));
        Light->SetIntensity(15000.f);
        Light->SetSourceRadius(45.f);
        Light->SetAttenuationRadius(1600.f);
        Light->CastShadows = true;
        Light->RegisterComponent();
        FireLight = Light;
    }
    if (const FVector2D* Workshop = Landmarks.Find(TEXT("workshop")))
    {
        AddSetPiece(TEXT("Canopy"), ToWorld(Workshop->X, Workshop->Y), FRotator::ZeroRotator, FVector(1.5f));
        AddSign(TEXT("WORKSHOPS"), *Workshop + FVector2D(0.f, -5.f), 0.f);
    }
    const struct { const TCHAR* Id; const TCHAR* Label; } Signs[] = {
        {TEXT("camp-lower"), TEXT("LOWER CAMP")},
        {TEXT("camp-upper"), TEXT("UPPER CAMP")},
        {TEXT("camp-car"), TEXT("CAR CAMP")},
        {TEXT("parking"), TEXT("PARKING")}
    };
    for (const auto& Sign : Signs)
    {
        if (const FVector2D* Position = Landmarks.Find(Sign.Id)) AddSign(Sign.Label, *Position, 0.f);
    }
}

void AFlowFestWorld::BuildLanterns()
{
    UStaticMesh* Sphere = BasicMesh(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
    UStaticMesh* Cylinder = BasicMesh(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
    UHierarchicalInstancedStaticMeshComponent* Globes = AddInstanceGroup(Sphere, TEXT("LanternGlobes"), LoadMaterial(TEXT("M_Ember")));
    UHierarchicalInstancedStaticMeshComponent* Posts = AddInstanceGroup(Cylinder, TEXT("LanternPosts"), LoadMaterial(TEXT("M_Wood")));
    int32 Lights = 0;
    for (const FSiteRoad& Road : Roads)
    {
        if (Lights >= 30) break;
        if (Road.Kind == TEXT("public-road")) continue;
        float Carried = 0.f;
        for (int32 I = 1; I < Road.Points.Num() && Lights < 30; ++I)
        {
            const FVector2D Start = Road.Points[I - 1];
            const FVector2D End = Road.Points[I];
            const FVector2D Delta = End - Start;
            const float Length = Delta.Size();
            if (Length < 1.f) continue;
            const FVector2D Side(-Delta.Y / Length, Delta.X / Length);
            for (float D = 35.f - Carried; D < Length && Lights < 30; D += 35.f)
            {
                const FVector2D P = Start + Delta * (D / Length) + Side * (Road.Width * 0.5f + 1.5f);
                const FVector Ground = ToWorld(P.X, P.Y);
                if (Posts) Posts->AddInstance(FTransform(FRotator::ZeroRotator, Ground + FVector(0, 0, 140.f), FVector(0.045f, 0.045f, 2.8f)));
                if (Globes) Globes->AddInstance(FTransform(FRotator::ZeroRotator, Ground + FVector(0, 0, 290.f), FVector(0.22f)));
                UPointLightComponent* Light = NewObject<UPointLightComponent>(this);
                Light->SetupAttachment(SiteRoot);
                Light->SetRelativeLocation(Ground + FVector(0, 0, 290.f));
                Light->SetLightColor(FLinearColor(1.f, 0.48f, 0.16f));
                Light->SetIntensity(1100.f);
                Light->SetAttenuationRadius(900.f);
                Light->CastShadows = false;
                Light->RegisterComponent();
                ++Lights;
            }
            Carried = FMath::Fmod(Carried + Length, 35.f);
        }
    }
}

void AFlowFestWorld::BuildPeople()
{
    TArray<TArray<FVector2D>> RoadLines;
    for (const FSiteRoad& Road : Roads)
        RoadLines.Add(Road.Points);
    Crowd.Initialize(Landmarks, RoadLines, TimeOfDay);
    People.Reset();
    const TArray<FFlowFestCrowdAgent>& Agents = Crowd.GetAgents();
    for (const FFlowFestCrowdAgent& Agent : Agents)
    {
        FFestivalPerson Person;
        const FVector Foot = SiteRoot->GetComponentTransform().TransformPosition(ToWorld(Agent.Position.X, Agent.Position.Y));
        FActorSpawnParameters Spawn;
        Spawn.Owner = this;
        Spawn.Name = FName(*Agent.Id);
        Spawn.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
        Person.Actor = GetWorld()->SpawnActor<AActor>(AActor::StaticClass(), Foot,
            FRotator(0.f, Agent.Facing + SiteRoot->GetComponentRotation().Yaw, 0.f), Spawn);
        if (Person.Actor)
        {
            USceneComponent* Feet = NewObject<USceneComponent>(Person.Actor, TEXT("Feet"));
            Person.Actor->SetRootComponent(Feet);
            Feet->RegisterComponent();
            Person.Actor->SetActorLocation(Foot);
            Person.Avatar = NewObject<UFlowFestAvatarComponent>(Person.Actor, TEXT("Avatar"));
            Person.Avatar->RegisterComponent();
            Person.Avatar->Initialize(Feet, Agent.AvatarId);
            Person.Avatar->SetFootstepsEnabled(bSoundEnabled);
            Person.Avatar->SetPresentation(true, false);
            if (!Agent.PropId.IsNone() && Person.Avatar->GetBodyMesh() &&
                Person.Avatar->GetBodyMesh()->GetSkeletalMeshAsset())
            {
                Person.Prop = NewObject<UFlowFestPropComponent>(Person.Actor, TEXT("Prop"));
                Person.Prop->RegisterComponent();
                Person.Prop->Initialize(Feet);
                if (Person.Prop->Equip(Agent.PropId))
                {
                    Person.Prop->BindHands(Person.Avatar->GetBodyMesh());
                    Person.Avatar->BindPerformanceProp(Person.Prop);
                    Person.Prop->SetFinish(NAME_None);
                    Person.Prop->SetHandTransforms(Person.Avatar->GetHandTransform(true),
                                                   Person.Avatar->GetHandTransform(false));
                }
            }
            Person.Avatar->SetMotion(FVector::ZeroVector, false, false);
        }
        People.Add(Person);
    }
    UE_LOG(LogTemp, Display, TEXT("Flow Fest living crowd: %d persistent identities, %d road lines"),
           People.Num(), RoadLines.Num());
    SetActorTickEnabled(People.Num() > 0 || FireLight != nullptr);
}

void AFlowFestWorld::SetSoundEnabled(bool bEnabled)
{
    bSoundEnabled = bEnabled;
    Soundscape->SetEnabled(bEnabled);
    if (APawn* Player = UGameplayStatics::GetPlayerPawn(this, 0))
        if (UFlowFestAvatarComponent* PlayerAvatar = Player->FindComponentByClass<UFlowFestAvatarComponent>())
            PlayerAvatar->SetFootstepsEnabled(bEnabled);
    for (FFestivalPerson& Person : People)
        if (IsValid(Person.Avatar)) Person.Avatar->SetFootstepsEnabled(bEnabled);
}

void AFlowFestWorld::SetJamSoundActive(bool bActive)
{
    Soundscape->SetJamActive(bActive);
}

void AFlowFestWorld::SetTimeOfDay(float Hour)
{
    TimeOfDay = FMath::Fmod(FMath::Fmod(Hour, 24.f) + 24.f, 24.f);
    Crowd.SetTimeOfDay(TimeOfDay);
    Soundscape->SetTimeOfDay(TimeOfDay);
    // Two atmosphere lights retain a cool terrain silhouette after the sun leaves the horizon.
    // The moon stays high enough for paths to catch grazing light; the fire stays much brighter locally.
    const float Altitude = FMath::Sin((TimeOfDay - 6.f) * PI / 12.f) * 68.f;
    Sun->SetWorldRotation(FRotator(-Altitude, 205.f, 0.f));
    const float Daylight = FMath::Clamp((Altitude + 8.f) / 24.f, 0.f, 1.f);
    // Low sun loses energy through the atmosphere before its warm light reaches the valley.
    Sun->SetIntensity(85000.f * Daylight * Daylight);
    Sun->SetLightColor(FLinearColor::LerpUsingHSV(FLinearColor(1.f, 0.47f, 0.24f), FLinearColor(1.f, 0.94f, 0.82f), FMath::Clamp(Altitude / 35.f, 0.f, 1.f)));
    const float Night = 1.f - FMath::Clamp((Altitude + 3.f) / 9.f, 0.f, 1.f);
    const float MoonAltitude = 31.f + 10.f * FMath::Sin((TimeOfDay - 23.f) * PI / 12.f);
    Moon->SetWorldRotation(FRotator(-MoonAltitude, 48.f, 0.f));
    Moon->SetIntensity(1.2f * Night);
    SkyLight->SetIntensity(FMath::Lerp(0.8f, 1.2f, Daylight));
    Fog->SetFogDensity(FMath::Lerp(0.013f, 0.008f, Daylight));
    // Limit dark adaptation so moonlit terrain remains visibly darker than the fire circle.
    PostProcess->Settings.AutoExposureMinBrightness = FMath::Lerp(0.f, -3.f, Daylight);
    PostProcess->Settings.AutoExposureBias = -0.8f * Daylight;
    PostProcess->Settings.BloomIntensity = FMath::Lerp(0.85f, 0.32f, Daylight);
}

void AFlowFestWorld::SetPlayerCrowdPresence(FVector WorldPosition, bool bAtFire, bool bJoining)
{
    const FVector Local = SiteRoot->GetComponentTransform().InverseTransformPosition(WorldPosition);
    Crowd.SetPlayerPresence(FVector2D(Local.X, Local.Y) / MetresToCm, bAtFire, bJoining);
}

int32 AFlowFestWorld::GetCrowdActivityCount(int32 Activity) const
{
    if (Activity < 0 || Activity > static_cast<int32>(EFlowFestCrowdActivity::Rest)) return 0;
    return Crowd.GetCount(static_cast<EFlowFestCrowdActivity>(Activity));
}
