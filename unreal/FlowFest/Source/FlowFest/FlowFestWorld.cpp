#include "FlowFestWorld.h"
#include "FlowFestAvatarComponent.h"
#include "FlowFestPropComponent.h"
#include "FlowFestActivityPose.h"
#include "FlowFestAnimInstance.h"
#include "FlowArtsPerformanceSession.h"
#include "FlowFestEcologyComponent.h"
#include "FlowFestSoundscapeComponent.h"
#include "FlowFestCanopy.h"
#include "FlowFestRoadShape.h"
#include "FlowFestWoods.h"

#include "AssetRegistry/AssetRegistryModule.h"
#include "Components/SceneComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Components/InstancedSkinnedMeshComponent.h"
#include "DynamicWindData.h"
#include "DynamicWindParameters.h"
#include "DynamicWindSubsystem.h"
#include "Engine/SkeletalMesh.h"
#include "Misc/ConfigCacheIni.h"
#include "Components/PointLightComponent.h"
#include "Components/PostProcessComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/VolumetricCloudComponent.h"
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
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
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
    SiteRoot->SetMobility(EComponentMobility::Static);
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
    // Clouds drift their shadows across the field.
    Sun->bCastCloudShadows = true;

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
    // A late-summer valley is hazy: more Mie scattering, and aerial perspective
    // stretched so the tree lines a few hundred metres out sit back in the haze.
    // (Height fog can't do this: its dark inscatter greys the sky once it reaches treetops.)
    Atmosphere->SetMieScatteringScale(0.0065f);
    Atmosphere->SetAerialPespectiveViewDistanceScale(18.f);

    // Fair-weather cumulus on the engine's cloud material, low enough to read as
    // separate clouds over a site this size.
    Clouds = CreateDefaultSubobject<UVolumetricCloudComponent>(TEXT("Clouds"));
    Clouds->SetupAttachment(SiteRoot);
    Clouds->SetMobility(EComponentMobility::Movable);
    Clouds->SetLayerBottomAltitude(1.6f);
    Clouds->SetLayerHeight(3.5f);

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
    // Keep the camp crisp; haze starts past the nearest tents and glows toward the sun.
    Fog->SetStartDistance(4000.f);
    Fog->SetDirectionalInscatteringExponent(6.f);
    Fog->SetDirectionalInscatteringStartDistance(8000.f);

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
    PostProcess->Settings.bOverride_ColorGainHighlights = true;
    PostProcess->Settings.bOverride_ColorGainShadows = true;
    PostProcess->Settings.bOverride_ColorSaturation = true;
    PostProcess->Settings.bOverride_ColorContrast = true;
    PostProcess->Settings.ColorContrast = FVector4(1.f, 1.f, 1.f, 1.03f);
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
    if (!Ecology->BuildFromSite(this)) UE_LOG(LogTemp, Error, TEXT("Flow Fest ecology could not load; run the environment asset import."));
    BuildCamps();
    BuildVehicles();
    BuildFestivalLandmarks();
    // Structures polish
    BuildStructures();
    BuildLanterns();
    // Jam polish: before the crowd, which takes its fire watch spots from the jam.
    BuildJam();
    BuildPeople();
    if (!Soundscape->BuildFromSite(this)) UE_LOG(LogTemp, Error, TEXT("Flow Fest soundscape could not load; run the audio import."));
    SetTimeOfDay(TimeOfDay);
}

void AFlowFestWorld::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if (!TreeLiveGroups.IsEmpty())
    {
        if (const APawn* Player = UGameplayStatics::GetPlayerPawn(this, 0))
            if (FVector::DistSquared(Player->GetActorLocation(), BreezeCenter) > FMath::Square(1000.f)) UpdateBreeze();
    }
    Crowd.Tick(DeltaSeconds);
    static const bool bClearanceStats = FParse::Param(FCommandLine::Get(), TEXT("FlowFestClearanceStats"));
    ClearanceStatsElapsed += DeltaSeconds;
    const bool bReportClearance = bClearanceStats && ClearanceStatsElapsed >= 1.f;
    if (bReportClearance) ClearanceStatsElapsed = 0.f;
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
        if (Person.bNeedsActivityRefresh || Person.LastActivity != Agent.Activity)
        {
            Person.bNeedsActivityRefresh = false;
            if (bPerforming && Person.Prop && !Agent.PerformanceId.IsNone())
            {
                const FName Profile = Agent.PerformanceId;
                FFlowArtsPerformanceSession Session(Person.Avatar, Person.Prop);
                FString PerformanceError;
                Person.bPerformancePlaying = Session.PlayBuiltIn(Profile, PerformanceError);
                if (Person.bPerformancePlaying)
                {
                    Person.Avatar->SetPerformancePhase(FMath::Frac(Agent.PhaseOffset / (2.f * PI)));
                    Person.Prop->SetFinish(Agent.FinishId);
                }
                else
                {
                    Person.Avatar->StopPerformance();
                    Person.Prop->ClearPerformanceTransforms();
                }
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
        EFlowFestBodyActivity BodyActivity = EFlowFestBodyActivity::None;
        if (!Person.bPerformancePlaying)
        {
            if (Agent.Activity == EFlowFestCrowdActivity::Rest)
                BodyActivity = EFlowFestBodyActivity::FloorRest;
            else if (Agent.Activity == EFlowFestCrowdActivity::Food)
                BodyActivity = EFlowFestBodyActivity::Eat;
            else if (Agent.bPropInHands)
                BodyActivity = EFlowFestBodyActivity::Carry;
        }
        const float StandRemaining = Agent.StandUntil > Crowd.GetElapsedSeconds()
            ? Agent.StandUntil - Crowd.GetElapsedSeconds() : -1.f;
        const float ActivityElapsed = Agent.bActionStarted || StandRemaining >= 0.f
            ? FMath::Max(0.f, Crowd.GetElapsedSeconds() - Agent.ActionStartedAt) : 0.f;
        Person.Avatar->SetActivityPose(BodyActivity, ActivityElapsed, StandRemaining);
        if (Person.Prop) Person.Prop->SetVisible(Agent.bPropInHands);
        if (Person.Prop && !Person.bPerformancePlaying)
        {
            Person.Prop->SetHandTransforms(Person.Avatar->GetHandTransform(true), Person.Avatar->GetHandTransform(false));
        }
        UpdateMealVisuals(Person, BodyActivity == EFlowFestBodyActivity::Eat, ActivityElapsed);
        if (bReportClearance)
        {
            USkeletalMeshComponent* Body = Person.Avatar->GetBodyMesh();
            UFlowFestAnimInstance* Anim = Body ? Cast<UFlowFestAnimInstance>(Body->GetAnimInstance()) : nullptr;
            if (Anim && Body->WasRecentlyRendered(.1f))
            {
                const auto& Clearance = Anim->GetArmClearance();
                UE_LOG(LogTemp, Display, TEXT("FlowFest clearance sample: attendee=%s avatar=%s activity=%d lastSolveUs=%.1f queries=%d feasible=%d residualCm=%.4f kind=%d segment=%d arm=%d upper=%u pair=%d warm=%d soft=%d handQueries=%d"),
                    *Agent.Id, *Agent.AvatarId.ToString(), int32(Agent.Activity),
                    Clearance.SolveMicroseconds, Clearance.SkinnedQueryCount,
                    Clearance.bFeasible, Clearance.WorstPenetrationCm,
                    Clearance.WorstObstacleKind, Clearance.WorstSegment, Clearance.WorstArm,
                    Clearance.SkinnedUpperTorsoClearMask, Clearance.bSkinnedArmPairClear,
                    Clearance.WarmRefinementQueryCount, Clearance.SoftRefinementQueryCount, Clearance.HandAvoidanceExactQueries);
            }
        }
    }
}

void AFlowFestWorld::SetActivityEvidence(UFlowFestAvatarComponent* Avatar,
    UFlowFestPropComponent* Prop, EFlowFestBodyActivity Activity,
    float ElapsedSeconds, float ExitSecondsRemaining)
{
    if (!IsValid(Avatar) || !FMath::IsFinite(ElapsedSeconds) ||
        !FMath::IsFinite(ExitSecondsRemaining)) return;
    if (ActivityEvidencePerson.Avatar != Avatar)
    {
        ActivityEvidencePerson = FFestivalPerson();
        ActivityEvidencePerson.Actor = Avatar->GetOwner();
        ActivityEvidencePerson.Avatar = Avatar;
        CreateMealVisuals(ActivityEvidencePerson);
    }
    ActivityEvidencePerson.Prop = Prop;
    Avatar->SetActivityPose(Activity, FMath::Max(0.f, ElapsedSeconds), ExitSecondsRemaining);
    if (IsValid(Prop))
    {
        Prop->SetFinish(NAME_None);
        Prop->SetVisible(Activity == EFlowFestBodyActivity::Carry);
    }
    UpdateMealVisuals(ActivityEvidencePerson, Activity == EFlowFestBodyActivity::Eat,
        FMath::Max(0.f, ElapsedSeconds));
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
    // The canopy scan shares the terrain grid. Without it the woods stay as the source placed them.
    const FString CanopyPath = DataDir / String(*Terrain, TEXT("canopyFile"), TEXT("surface-offset.u16"));
    if (FFileHelper::LoadFileToArray(Bytes, *CanopyPath) && Bytes.Num() == GridWidth * GridHeight * sizeof(uint16))
    {
        CanopyOffsets.SetNumUninitialized(GridWidth * GridHeight);
        FMemory::Memcpy(CanopyOffsets.GetData(), Bytes.GetData(), Bytes.Num());
    }
    else UE_LOG(LogTemp, Warning, TEXT("Flow Fest canopy scan missing or wrong size: %s"), *CanopyPath);

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
    PlantWoods();
    UE_LOG(LogTemp, Display, TEXT("Flow Fest site: %dx%d terrain, %d roads, %d near trees, %d backdrop trees, %d camps, %d vehicles, %d landmarks"), GridWidth, GridHeight, Roads.Num(), Trees.Num(), BackdropTrees.Num(), Camps.Num(), Vehicles.Num(), Landmarks.Num());
    return true;
}

float AFlowFestWorld::CanopyTopAt(float East, float South) const
{
    // The tallest return within a metre, so a gap between two crowns in the scan still reads as woods.
    if (CanopyOffsets.IsEmpty()) return 0.f;
    const int32 X = FMath::RoundToInt((East - GridMinEast) / GridSpacing), Y = FMath::RoundToInt((South - GridMinSouth) / GridSpacing);
    uint16 Top = 0;
    for (int32 DY = -1; DY <= 1; ++DY)
        for (int32 DX = -1; DX <= 1; ++DX)
        {
            const int32 SX = X + DX, SY = Y + DY;
            if (SX < 0 || SY < 0 || SX >= GridWidth || SY >= GridHeight) continue;
            const uint16 Offset = CanopyOffsets[SY * GridWidth + SX];
            if (Offset != 65535) Top = FMath::Max(Top, Offset);
        }
    return Top / 100.f;
}

void AFlowFestWorld::AddCrowns(FCanopyMap& Canopy) const
{
    for (const TArray<FSiteTree>* Layer : { &Trees, &BackdropTrees, &FillTrees })
        for (const FSiteTree& Tree : *Layer) Canopy.Add(Tree.Position, Tree.Height);
}

void AFlowFestWorld::PlantWoods()
{
    FillTrees.Reset();
    if (CanopyOffsets.IsEmpty()) return;
    FCanopyMap Canopy;
    AddCrowns(Canopy);
    // Share of the tall canopy, sampled every 4 m, that has a crown over it.
    const FVector2D Min(GridMinEast, GridMinSouth), Max(GridMinEast + (GridWidth - 1) * GridSpacing, GridMinSouth + (GridHeight - 1) * GridSpacing);
    const auto Covered = [&]()
    {
        int32 Tall = 0, Under = 0;
        for (float South = Min.Y; South < Max.Y; South += 4.f)
            for (float East = Min.X; East < Max.X; East += 4.f)
                if (CanopyTopAt(East, South) >= 6.f)
                {
                    float Trunk = 0.f;
                    ++Tall;
                    Under += Canopy.Cover(FVector2D(East, South), Trunk) > .3f;
                }
        return Tall ? 100.f * Under / Tall : 0.f;
    };
    const float Before = Covered();
    // No trunk on a road, in a camp or on a landmark the festival gathers around.
    const auto Blocked = [&](const FVector2D& At)
    {
        for (const FSiteRoad& Road : Roads)
            for (int32 Index = 1; Index < Road.Points.Num(); ++Index)
                if (FVector2D::Distance(FMath::ClosestPointOnSegment2D(At, Road.Points[Index - 1], Road.Points[Index]), At) < Road.Width * .5f + 2.f) return true;
        // Tents pitch along the woods' edge, so a trunk may stand a few metres off and shade
        // them; a wider ring would cut a notch in the tree line around every camp.
        for (const FSiteCamp& Camp : Camps)
            if (FVector2D::Distance(Camp.Position, At) < (Camp.Type.Contains(TEXT("canopy")) ? 4.5f : 3.5f) * Camp.Scale) return true;
        for (const TPair<FString, FVector2D>& Landmark : Landmarks)
            if (FVector2D::Distance(Landmark.Value, At) < 12.f) return true;
        return false;
    };
    const TArray<FWoodsFillTree> Planted = FillWoods(Min, Max, [this](const FVector2D& At) { return CanopyTopAt(At.X, At.Y); }, Blocked, Canopy);
    // Each new tree takes the species of the nearest placed one, so oak stands stay oak.
    for (const FWoodsFillTree& Fill : Planted)
    {
        const FSiteTree* Nearest = nullptr;
        float Best = TNumericLimits<float>::Max();
        for (const TArray<FSiteTree>* Layer : { &Trees, &BackdropTrees })
            for (const FSiteTree& Tree : *Layer)
            {
                const float Distance = FVector2D::DistSquared(Tree.Position, Fill.At);
                if (Distance < Best && !Tree.Family.IsEmpty()) { Best = Distance; Nearest = &Tree; }
            }
        if (!Nearest) break;
        FillTrees.Add({ Fill.At, Nearest->Family, Fill.Height, Fill.Rotation });
    }
    UE_LOG(LogTemp, Display, TEXT("Flow Fest woods: %d trees planted from the canopy scan; tall canopy under a crown %.0f%% -> %.0f%%"),
           FillTrees.Num(), Before, Covered());
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

float AFlowFestWorld::SurfaceAt(float EastMeters, float SouthMeters) const
{
    // The same cells and diagonal BuildTerrain triangulates.
    const float Step = FMath::Max(1, FMath::RoundToInt(2.f / GridSpacing)) * GridSpacing;
    const int32 CellsX = (GridWidth - 1) / FMath::Max(1, FMath::RoundToInt(2.f / GridSpacing));
    const int32 CellsY = (GridHeight - 1) / FMath::Max(1, FMath::RoundToInt(2.f / GridSpacing));
    if (CellsX < 1 || CellsY < 1) return SampleGround(EastMeters, SouthMeters);
    const float X = FMath::Clamp((EastMeters - GridMinEast) / Step, 0.f, static_cast<float>(CellsX) - KINDA_SMALL_NUMBER);
    const float Y = FMath::Clamp((SouthMeters - GridMinSouth) / Step, 0.f, static_cast<float>(CellsY) - KINDA_SMALL_NUMBER);
    const int32 X0 = FMath::FloorToInt(X), Y0 = FMath::FloorToInt(Y);
    const float U = X - X0, V = Y - Y0;
    const auto Corner = [&](int32 DX, int32 DY) { return SampleGround(GridMinEast + (X0 + DX) * Step, GridMinSouth + (Y0 + DY) * Step); };
    const float B = Corner(1, 0), C = Corner(0, 1);
    if (U + V <= 1.f)
    {
        const float A = Corner(0, 0);
        return A + U * (B - A) + V * (C - A);
    }
    const float D = Corner(1, 1);
    return D + (1.f - U) * (C - D) + (1.f - V) * (B - D);
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
    // Vertex colour red carries crown shade, which M_Ground darkens toward a damp forest floor.
    FCanopyMap Canopy;
    AddCrowns(Canopy);
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
                    float NearestTrunk = 0.f;
                    Colors.Add(FLinearColor(Canopy.Cover(FVector2D(East, South), NearestTrunk), 1.f, 1.f, 1.f));
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
            Chunk->SetMobility(EComponentMobility::Static);
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
    FCanopyMap Canopy;
    AddCrowns(Canopy);
    // Across the road in half-widths: the running surface spans -1 to 1, and the road
    // materials fade a worn shoulder into the ground over the outer columns.
    const float Columns[] = { -1.35f, -1.f, -.6f, -.3f, 0.f, .3f, .6f, 1.f, 1.35f };
    const int32 ColumnCount = UE_ARRAY_COUNT(Columns);
    for (int32 RoadIndex = 0; RoadIndex < Roads.Num(); ++RoadIndex)
    {
        const FSiteRoad& Road = Roads[RoadIndex];
        TArray<FRoadStation> Stations = SmoothRoad(Road.Points);
        if (Stations.Num() < 2) continue;
        const bool bPaved = Road.Kind == TEXT("public-road") || Road.Kind.Contains(TEXT("asphalt"), ESearchCase::IgnoreCase);
        const bool bFoot = Road.Kind == TEXT("foot-connector");
        const float HalfWidth = Road.Width * .5f;
        // Each end runs on half a width and fades out, so a drive joins its road without a square cap.
        const float Start = Stations[0].Distance, End = Stations.Last().Distance;
        const FRoadStation First = Stations[0], Last = Stations.Last();
        Stations.Insert({ First.At + (First.At - Stations[1].At).GetSafeNormal() * HalfWidth, First.Side, Start - HalfWidth }, 0);
        Stations.Add({ Last.At + (Last.At - Stations[Stations.Num() - 2].At).GetSafeNormal() * HalfWidth, Last.Side, End + HalfWidth });
        // The paved road lies over the drives that meet it, and drives over the foot paths.
        const float Lift = (bPaved ? 6.f : bFoot ? 3.f : 4.5f) + RoadIndex * .3f;
        TArray<FVector> Vertices; TArray<int32> Triangles; TArray<FVector> Normals;
        TArray<FVector2D> UVs; TArray<FLinearColor> Colors; TArray<FProcMeshTangent> Tangents;
        for (const FRoadStation& Station : Stations)
        {
            const float Fade = FMath::Clamp(FMath::Min(Station.Distance - (Start - HalfWidth), End + HalfWidth - Station.Distance) / HalfWidth, 0.f, 1.f);
            float NearestTrunk = 0.f;
            const float Shade = Canopy.Cover(Station.At, NearestTrunk);
            for (float Across : Columns)
            {
                // Heights and normals come from the rendered terrain, so the road lies on it instead of cutting through.
                const FVector2D P = Station.At + Station.Side * (Across * HalfWidth);
                const float Dx = SampleGround(P.X + 1.f, P.Y) - SampleGround(P.X - 1.f, P.Y);
                const float Dy = SampleGround(P.X, P.Y + 1.f) - SampleGround(P.X, P.Y - 1.f);
                Vertices.Add(FVector(P.X * MetresToCm, P.Y * MetresToCm, SurfaceAt(P.X, P.Y) + Lift));
                Normals.Add(FVector(-Dx, -Dy, 200.f).GetSafeNormal());
                // U runs along the road in metres, V across it in half-widths. Red is crown
                // shade, green marks a foot path and blue fades the ends.
                UVs.Add(FVector2D(Station.Distance, Across));
                Colors.Add(FLinearColor(Shade, bFoot ? 1.f : 0.f, Fade, 1.f));
                Tangents.Add(FProcMeshTangent(Station.Side.Y, -Station.Side.X, 0.f));
            }
        }
        for (int32 Row = 1; Row < Stations.Num(); ++Row)
            for (int32 Column = 0; Column + 1 < ColumnCount; ++Column)
            {
                const int32 A = (Row - 1) * ColumnCount + Column, C = A + ColumnCount;
                Triangles.Append({A, A + 1, C, A + 1, C + 1, C});
            }
        UProceduralMeshComponent* Mesh = NewObject<UProceduralMeshComponent>(this);
        Mesh->SetupAttachment(SiteRoot); Mesh->RegisterComponent();
        Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        // A few centimetres above the ground, a shadow would draw a dark seam along each edge.
        Mesh->SetCastShadow(false);
        Mesh->CreateMeshSection_LinearColor(0, Vertices, Triangles, Normals, UVs, Colors, Tangents, false);
        Mesh->SetMaterial(0, bPaved ? Asphalt : Dirt);
        RoadMeshes.Add(Mesh);
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
    // [FlowFest.Trees] NearLayer=Live|Far in DefaultGame.ini, or -ini:Game:[FlowFest.Trees]:NearLayer=Far on the command line.
    FString NearLayer = TEXT("Live");
    GConfig->GetString(TEXT("FlowFest.Trees"), TEXT("NearLayer"), NearLayer, GGameIni);
    bLiveNearTrees = !NearLayer.Equals(TEXT("Far"), ESearchCase::IgnoreCase);
    TreeWindData = NewObject<UDynamicWindData>(this, TEXT("TreeWind"));

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

    struct FTreeBatch
    {
        UStaticMesh* Far = nullptr;
        USkeletalMesh* Live = nullptr;
        float MeshCm = 0.f;
        bool bBackdrop = false;
        TArray<FTransform> Transforms;
        FBox Bounds = FBox(ForceInit);
    };
    TMap<FString, FTreeBatch> Batches;
    TSet<FString> Missing;
    NearTreeCount = 0;
    BackdropTreeCount = 0;

    // Layers: measured near trees, the source's backdrop, then the woods PlantWoods filled
    // in. Fill trees use the backdrop meshes but keep trunks, since they stand where people walk.
    for (int32 Layer = 0; Layer < 3; ++Layer)
    {
        const bool bBackdrop = Layer > 0;
        const bool bLive = !bBackdrop && bLiveNearTrees;
        for (const FSiteTree& Tree : Layer == 0 ? Trees : Layer == 1 ? BackdropTrees : FillTrees)
        {
            if (Tree.Family.IsEmpty() || Tree.Height <= 0.f) continue;
            const FString GroupKey = Tree.Family + (bBackdrop ? TEXT("_backdrop") : TEXT("_near"));
            if (Missing.Contains(GroupKey)) continue;
            FTreeBatch* Batch = Batches.Find(GroupKey);
            if (!Batch)
            {
                FString Normalized = Tree.Family;
                Normalized.ReplaceInline(TEXT("-"), TEXT("_"));
                const FString Folder = FString::Printf(TEXT("/Game/FlowFest/Assets/Trees/%s"), *Normalized);
                FTreeBatch New;
                New.bBackdrop = bBackdrop;
                if (bLive)
                {
                    New.Live = LoadObject<USkeletalMesh>(nullptr, *FString::Printf(TEXT("%s/%s_Live.%s_Live"), *Folder, *Normalized, *Normalized));
                    if (New.Live) New.MeshCm = New.Live->GetBounds().BoxExtent.Z * 2.f;
                }
                else
                {
                    New.Far = LoadObject<UStaticMesh>(nullptr, *FString::Printf(TEXT("%s/%s_Far.%s_Far"), *Folder, *Normalized, *Normalized));
                    if (New.Far) New.MeshCm = New.Far->GetBounds().BoxExtent.Z * 2.f;
                }
                if (!New.Live && !New.Far)
                {
                    UE_LOG(LogTemp, Warning, TEXT("Flow Fest tree asset missing: %s/%s_%s"), *Folder, *Normalized, bLive ? TEXT("Live") : TEXT("Far"));
                    Missing.Add(GroupKey);
                    continue;
                }
                Batch = &Batches.Add(GroupKey, MoveTemp(New));
            }
            const float Scale = Tree.Height * MetresToCm / FMath::Max(1.f, Batch->MeshCm);
            const FVector Location = ToWorld(Tree.Position.X, Tree.Position.Y);
            // Three.js +Y rotations reverse when source (x,y,z) maps to UE (x,z,y).
            Batch->Transforms.Add(FTransform(FRotator(0.f, -FMath::RadiansToDegrees(Tree.Rotation), 0.f), Location, FVector(Scale)));
            const float Reach = Tree.Height * MetresToCm;
            Batch->Bounds += FBox(Location - FVector(Reach, Reach, 0.f), Location + FVector(Reach, Reach, Reach * 1.2f));
            if (Layer != 1 && Trunks)
            {
                const float TrunkHeightCm = FMath::Min(300.f, Tree.Height * MetresToCm * 0.45f);
                Trunks->AddInstance(FTransform(FRotator::ZeroRotator, ToWorld(Tree.Position.X, Tree.Position.Y, TrunkHeightCm * 0.5f), FVector(0.5f, 0.5f, TrunkHeightCm / 100.f)));
            }
        }
    }

    for (TPair<FString, FTreeBatch>& Pair : Batches)
    {
        FTreeBatch& Batch = Pair.Value;
        const FString Name = TEXT("Trees_") + Pair.Key;
        if (Batch.Live)
        {
            // One skinned component per family. Instances arrive in one batch, the bounds are
            // set before registration, and the component never ticks: the wind lives on the GPU.
            UInstancedSkinnedMeshComponent* Group = NewObject<UInstancedSkinnedMeshComponent>(this, FName(*Name));
            Group->SetupAttachment(SiteRoot);
            Group->SetSkinnedAsset(Batch.Live);
            Group->SetTransformProvider(TreeWindData);
            Group->SetCollisionEnabled(ECollisionEnabled::NoCollision);
            Group->PrimaryComponentTick.bCanEverTick = false;
            Group->SetPrimitiveBoundsOverride(Batch.Bounds);
            Group->RegisterComponent();
            TArray<int32> Animations;
            Animations.Init(0, Batch.Transforms.Num());
            Group->AddInstances(Batch.Transforms, Animations, false, true);
            TreeLiveGroups.Add(Group);
            NearTreeCount += Batch.Transforms.Num();
        }
        else
        {
            UHierarchicalInstancedStaticMeshComponent* Group = AddInstanceGroup(Batch.Far, Name);
            if (Batch.bBackdrop) Group->SetCullDistances(18000, 110000);
            Group->AddInstances(Batch.Transforms, false, true);
            if (Batch.bBackdrop) BackdropTreeCount += Batch.Transforms.Num();
            else NearTreeCount += Batch.Transforms.Num();
        }
    }
    FillTreeCount = FillTrees.Num();
    BackdropTreeCount -= FillTreeCount;
    UE_LOG(LogTemp, Display, TEXT("Flow Fest trees: %d near (%s), %d backdrop, %d woods fill, %d families missing"),
           NearTreeCount, bLiveNearTrees ? TEXT("Nanite Foliage") : TEXT("Nanite static"), BackdropTreeCount, FillTreeCount, Missing.Num());
    UpdateBreeze();
}

void AFlowFestWorld::UpdateBreeze()
{
    UDynamicWindSubsystem* Wind = GetWorld() ? GetWorld()->GetSubsystem<UDynamicWindSubsystem>() : nullptr;
    if (!Wind || TreeLiveGroups.IsEmpty()) return;
    if (const APawn* Player = UGameplayStatics::GetPlayerPawn(this, 0)) BreezeCenter = Player->GetActorLocation();
    // Calm at night, gusty through the afternoon: the same sun altitude the sky uses.
    const float Daylight = FMath::Clamp(FMath::Sin((TimeOfDay - 6.f) * PI / 12.f), 0.f, 1.f);
    FDynamicWindParameters Params;
    Params.SimulationCenter = BreezeCenter;
    Params.SimulationExtents = 60000.f;
    // Prevailing south-westerly, in UE axes (site east is +X, site south is +Y).
    Params.WindDirection = FVector(0.77f, -0.64f, 0.f);
    Params.WindSpeed = FMath::Lerp(4.f, 14.f, Daylight);
    Params.WindAmplitude = FMath::Lerp(0.25f, 1.f, Daylight);
    Wind->UpdateWindParameters(Params);
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

namespace
{
// The web camp's fabric colours (TENT_COLORS and CANOPY_COLORS in
// flow-fest-production-geometry.ts). The tent fly and canopy fabric read them per instance.
const TCHAR* const TentColours[] = {TEXT("e56c4c"), TEXT("e6b859"), TEXT("6fa68c"), TEXT("6f7fc2"), TEXT("bd77a0")};
const TCHAR* const CanopyColours[] = {TEXT("e8e6df"), TEXT("2f3f66"), TEXT("c9b68a"), TEXT("3f6b4b")};

// Neighbouring camps in the site list sit side by side, so mix the index before picking.
FLinearColor CampColour(int32 CampIndex, bool bCanopy)
{
    const uint32 Mixed = static_cast<uint32>(CampIndex) * 2654435761u >> 16;
    return bCanopy ? FLinearColor(FColor::FromHex(CanopyColours[Mixed % UE_ARRAY_COUNT(CanopyColours)]))
                   : FLinearColor(FColor::FromHex(TentColours[Mixed % UE_ARRAY_COUNT(TentColours)]));
}
}

void AFlowFestWorld::BuildCamps()
{
    TMap<FString, UHierarchicalInstancedStaticMeshComponent*> Groups;
    for (int32 CampIndex = 0; CampIndex < Camps.Num(); ++CampIndex)
    {
        const FSiteCamp& Camp = Camps[CampIndex];
        if (Camp.Type == TEXT("player-tent"))
        {
            PlayerTentPlacement = Camp;
            bHasPlayerTentPlacement = true;
            continue;
        }
        const bool IsCanopy = Camp.Type.Contains(TEXT("canopy"), ESearchCase::IgnoreCase);
        const bool IsDome = Camp.Type.Contains(TEXT("dome"), ESearchCase::IgnoreCase);
        // Camp canopies carry the table, cooler and chairs; the bare Canopy is the
        // stall shade, and an older content store may have only that.
        FString AssetName = IsCanopy ? TEXT("CampCanopy") : IsDome ? TEXT("DomeTent") : TEXT("Tent");
        UHierarchicalInstancedStaticMeshComponent* Group = Groups.FindRef(AssetName);
        if (!Group)
        {
            UStaticMesh* Mesh = LoadSetMesh(AssetName);
            if (!Mesh && (IsDome || IsCanopy))
            {
                AssetName = IsCanopy ? TEXT("Canopy") : TEXT("Tent");
                Mesh = LoadSetMesh(AssetName);
                Group = Groups.FindRef(AssetName);
            }
            if (!Mesh) continue;
            if (!Group)
            {
                Group = AddInstanceGroup(Mesh, AssetName + TEXT("Instances"));
                Group->SetNumCustomDataFloats(3);
                Groups.Add(AssetName, Group);
            }
        }
        const int32 Instance = Group->AddInstance(FTransform(FRotator(0.f, -FMath::RadiansToDegrees(Camp.Rotation), 0.f), ToWorld(Camp.Position.X, Camp.Position.Y), FVector(Camp.Scale)));
        const FLinearColor Fabric = CampColour(CampIndex, IsCanopy);
        Group->SetCustomData(Instance, {Fabric.R, Fabric.G, Fabric.B});
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

namespace
{
// The parked lot's bodies, mirroring FLOW_FEST_PARKED_CAR_MODELS in the web's
// src/routes/test/flow-fest-sim/flow-fest-parked-car-catalog.ts. Tools/author-assets.py
// bakes each mesh to its catalogue length with the nose on +X, the footprint centred and
// the tyres on z = 0, so instances need no scale. Wheel contacts are in body metres.
struct FParkedCarModel
{
    const TCHAR* Id;
    const TCHAR* Asset;
    float FrontAlong;
    float RearAlong;
    float HalfTrack;
    TArray<const TCHAR*> Paint;
};

const TArray<FParkedCarModel>& ParkedCarModels()
{
    static const TArray<FParkedCarModel> Models = {
        {TEXT("fairheaven-sedan"), TEXT("FairheavenSedan"), 1.433f, -1.218f, .749f, {TEXT("641c26"), TEXT("c9c5bb"), TEXT("2c3d5e"), TEXT("8a8f93")}},
        {TEXT("fairheaven-wagon"), TEXT("FairheavenWagon"), 1.443f, -1.21f, .749f, {TEXT("33505a"), TEXT("d8d3c4"), TEXT("4a5a2f"), TEXT("1f2530")}},
        {TEXT("lightbody-pickup"), TEXT("LightbodyPickup"), 1.587f, -1.316f, .781f, {TEXT("14121f"), TEXT("b7b2a8"), TEXT("7a1e1e"), TEXT("3b4a3a")}},
        {TEXT("bokaroo-suv"), TEXT("BokarooSuv"), 1.425f, -1.189f, .794f, {TEXT("348bb0"), TEXT("e6e1d3"), TEXT("b8482c"), TEXT("6f7a52")}},
        {TEXT("ace-hatchback"), TEXT("AceHatchback"), 1.101f, -1.302f, .721f, {TEXT("cf9a24"), TEXT("e8e6e1"), TEXT("1e2a44"), TEXT("a13a3a")}},
        {TEXT("t2-camper"), TEXT("T2Camper"), 1.132f, -1.247f, .706f, {}},
    };
    return Models;
}

// How far the tyres press into the field, so no car floats on a grass tip.
constexpr float TyreSinkMetres = .03f;
}

void AFlowFestWorld::BuildVehicles()
{
    TMap<FString, UHierarchicalInstancedStaticMeshComponent*> Groups;
    for (const FParkedCarModel& Model : ParkedCarModels())
    {
        const FString Path = FString::Printf(TEXT("/Game/FlowFest/Assets/Car/%s/SM_%s.SM_%s"), Model.Asset, Model.Asset, Model.Asset);
        UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *Path);
        if (!Mesh)
        {
            UE_LOG(LogTemp, Warning, TEXT("Flow Fest parked car mesh is missing: %s"), *Path);
            continue;
        }
        UHierarchicalInstancedStaticMeshComponent* Group = AddInstanceGroup(Mesh, FString::Printf(TEXT("ParkedVehicles_%s"), Model.Asset));
        Group->SetCollisionProfileName(TEXT("BlockAll"));
        Group->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
        // The body material reads its paint from these three floats (linear RGB).
        if (Model.Paint.Num() > 0) Group->SetNumCustomDataFloats(3);
        Groups.Add(Model.Id, Group);
    }

    int32 Placed = 0;
    for (const FSiteVehicle& Vehicle : Vehicles)
    {
        const FParkedCarModel* Model = ParkedCarModels().FindByPredicate([&](const FParkedCarModel& Entry) { return Vehicle.Model == Entry.Id; });
        UHierarchicalInstancedStaticMeshComponent* const* Group = Groups.Find(Vehicle.Model);
        if (!Model || !Group)
        {
            UE_LOG(LogTemp, Warning, TEXT("Flow Fest parked car has no body: %s"), *Vehicle.Model);
            continue;
        }
        // Settle on all four tyres as the web lot does (settleFlowFestParkedCarOnGround):
        // the web's yaw turns the nose to (cos, -sin) in east/south, so the native yaw is
        // its negative, and the right-hand side is native +Y at zero yaw.
        const float Yaw = -Vehicle.Rotation;
        const FVector2D Nose(FMath::Cos(Yaw), FMath::Sin(Yaw));
        const FVector2D Right(-FMath::Sin(Yaw), FMath::Cos(Yaw));
        const auto Wheel = [&](float Along, float Side)
        {
            const FVector2D At = Vehicle.Position + Nose * Along + Right * (Side * Model->HalfTrack);
            return SampleGround(At.X, At.Y);
        };
        const float FrontLeft = Wheel(Model->FrontAlong, -1.f), FrontRight = Wheel(Model->FrontAlong, 1.f);
        const float RearLeft = Wheel(Model->RearAlong, -1.f), RearRight = Wheel(Model->RearAlong, 1.f);
        const float Front = (FrontLeft + FrontRight) * .5f, Rear = (RearLeft + RearRight) * .5f;
        const float Left = (FrontLeft + RearLeft) * .5f, RightSide = (FrontRight + RearRight) * .5f;
        const float HalfWheelbaseCm = (Model->FrontAlong - Model->RearAlong) * .5f * MetresToCm;
        const float AlongOffsetCm = (Model->FrontAlong + Model->RearAlong) * .5f * MetresToCm;
        const float Pitch = FMath::Atan2(Front - Rear, 2.f * HalfWheelbaseCm);
        // Positive roll lowers the right side, so a higher right-hand pair rolls it back.
        const float Roll = -FMath::Atan2(RightSide - Left, 2.f * Model->HalfTrack * MetresToCm);
        const float Height = (Front + Rear) * .5f - AlongOffsetCm * FMath::Sin(Pitch) - TyreSinkMetres * MetresToCm;
        const FVector Location(Vehicle.Position.X * MetresToCm, Vehicle.Position.Y * MetresToCm, Height);
        const FRotator Rotation(FMath::RadiansToDegrees(Pitch), FMath::RadiansToDegrees(Yaw), FMath::RadiansToDegrees(Roll));
        const int32 Index = (*Group)->AddInstance(FTransform(Rotation, Location));
        if (Model->Paint.Num() > 0)
        {
            const FLinearColor Paint(FColor::FromHex(Model->Paint[FMath::Abs(Vehicle.PaintIndex) % Model->Paint.Num()]));
            (*Group)->SetCustomData(Index, {Paint.R, Paint.G, Paint.B});
        }
        ++Placed;
    }
    UE_LOG(LogTemp, Display, TEXT("Flow Fest parked cars: %d of %d placed across %d bodies"), Placed, Vehicles.Num(), Groups.Num());
}

void AFlowFestWorld::BuildFestivalLandmarks()
{
    // The food landmark is where crowd meals gather, beside first aid on the walk in from the lower loop.
    if (!Landmarks.Contains(TEXT("food")))
        if (const FVector2D* Workshop = Landmarks.Find(TEXT("workshop")))
            Landmarks.Add(TEXT("food"), *Workshop + FVector2D(22.f, 0.f));
    // The fire circle is the jam now: a roped circle lit by its spinners, built in FlowFestJam.cpp.
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

void AFlowFestWorld::CreateMealVisuals(FFestivalPerson& Person)
{
    if (!IsValid(Person.Actor) || !IsValid(Person.Avatar) || !Person.Avatar->GetBodyMesh() ||
        Person.MealBowl) return;
    UStaticMesh* Cylinder = BasicMesh(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
    UStaticMesh* Sphere = BasicMesh(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
    if (!Cylinder || !Sphere) return;
    // A carried camp meal gives the scoop-to-mouth gesture a visible source.
    USceneComponent* MealPalm = NewObject<USceneComponent>(Person.Actor, TEXT("MealPalm"));
    MealPalm->SetupAttachment(Person.Avatar->GetBodyMesh(), TEXT("LeftHandMiddle1"));
    MealPalm->SetAbsolute(false, true, true);
    MealPalm->RegisterComponent();
    Person.MealBowl = NewObject<UStaticMeshComponent>(Person.Actor, TEXT("MealBowl"));
    Person.MealBowl->SetupAttachment(MealPalm);
    // The bowl rides with the palm but its rim stays level while the wrist turns.
    // Imported skeletons retain a 100x root scale. Socket positions include it,
    // but a meal is measured in world centimetres and must not inherit it again.
    Person.MealBowl->SetAbsolute(false, true, true);
    Person.MealBowl->SetStaticMesh(Cylinder);
    // The level palm anchor keeps this offset in world centimetres even
    // while the finger socket turns or carries an imported root scale.
    Person.MealBowl->SetRelativeLocation(FVector(0.f, 0.f, 2.f));
    Person.MealBowl->SetRelativeScale3D(FVector(.15f, .15f, .035f));
    Person.MealBowl->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    if (UMaterialInterface* Material = LoadMaterial(TEXT("M_Wood")))
        Person.MealBowl->SetMaterial(0, Material);
    Person.MealBowl->RegisterComponent();
    Person.MealFood = NewObject<UStaticMeshComponent>(Person.Actor, TEXT("MealFood"));
    Person.MealFood->SetupAttachment(Person.MealBowl);
    Person.MealFood->SetStaticMesh(Sphere);
    Person.MealFood->SetRelativeLocation(FVector(0.f, 0.f, 80.f));
    Person.MealFood->SetRelativeScale3D(FVector(.76f, .76f, 1.2f));
    Person.MealFood->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    if (UMaterialInterface* Material = LoadMaterial(TEXT("M_Dirt")))
        Person.MealFood->SetMaterial(0, Material);
    Person.MealFood->RegisterComponent();
    Person.MealBite = NewObject<UStaticMeshComponent>(Person.Actor, TEXT("MealBite"));
    Person.MealBite->SetupAttachment(Person.Avatar->GetBodyMesh(), TEXT("RightHandIndex3"));
    Person.MealBite->SetAbsolute(false, false, true);
    Person.MealBite->SetStaticMesh(Sphere);
    Person.MealBite->SetRelativeLocation(FVector::ZeroVector);
    Person.MealBite->SetRelativeScale3D(FVector(.025f));
    Person.MealBite->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    if (UMaterialInterface* Material = LoadMaterial(TEXT("M_Dirt")))
        Person.MealBite->SetMaterial(0, Material);
    Person.MealBite->RegisterComponent();
    UpdateMealVisuals(Person, false, 0.f);
}

void AFlowFestWorld::UpdateMealVisuals(FFestivalPerson& Person, bool bEating, float ElapsedSeconds)
{
    if (!Person.MealBowl) return;
    Person.MealBowl->SetVisibility(bEating, true);
    if (Person.MealBite)
    {
        const float Phase = FMath::Fmod(FMath::Max(0.f, ElapsedSeconds),
            FFlowFestActivityPose::EatCycleSeconds);
        Person.MealBite->SetVisibility(bEating && Phase >= 1.f && Phase < 2.3f);
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
            if (USkeletalMeshComponent* CrowdBody = Person.Avatar->GetBodyMesh())
                CrowdBody->VisibilityBasedAnimTickOption = EVisibilityBasedAnimTickOption::OnlyTickPoseWhenRendered;
            Person.Avatar->SetFootstepsEnabled(bSoundEnabled);
            Person.Avatar->SetPresentation(true, false);
            CreateMealVisuals(Person);
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
                    Person.Prop->SetVisible(Agent.bPropInHands);
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
    SetActorTickEnabled(People.Num() > 0 || !TreeLiveGroups.IsEmpty());
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

FRotator AFlowFestWorld::SunRotationAt(float Hour)
{
    const float Altitude = FMath::Sin((Hour - 6.f) * PI / 12.f) * 68.f;
    // Compass bearing of the sun for a late-summer day at the site's 43 degrees north:
    // about 80 at six, 180 at noon and 280 at six in the evening.
    const float HourAngle = FMath::DegreesToRadians((Hour - 12.f) * 15.f);
    const float Latitude = FMath::DegreesToRadians(43.f), Declination = FMath::DegreesToRadians(14.f);
    const float Bearing = PI + FMath::Atan2(FMath::Sin(HourAngle),
        FMath::Cos(HourAngle) * FMath::Sin(Latitude) - FMath::Tan(Declination) * FMath::Cos(Latitude));
    // The site runs +X east and +Y south; the light travels away from the sun.
    const FVector2D Away(-FMath::Sin(Bearing), FMath::Cos(Bearing));
    return FRotator(-Altitude, FMath::RadiansToDegrees(FMath::Atan2(Away.Y, Away.X)), 0.f);
}

void AFlowFestWorld::SetTimeOfDay(float Hour)
{
    TimeOfDay = FMath::Fmod(FMath::Fmod(Hour, 24.f) + 24.f, 24.f);
    Crowd.SetTimeOfDay(TimeOfDay);
    Soundscape->SetTimeOfDay(TimeOfDay);
    // Two atmosphere lights retain a cool terrain silhouette after the sun leaves the horizon.
    // The moon stays high enough for paths to catch grazing light; the fire stays much brighter locally.
    const FRotator SunRotation = SunRotationAt(TimeOfDay);
    const float Altitude = -SunRotation.Pitch;
    Sun->SetWorldRotation(SunRotation);
    const float Daylight = FMath::Clamp((Altitude + 8.f) / 24.f, 0.f, 1.f);
    // Low sun loses energy through the atmosphere before its warm light reaches the valley.
    const float SunLux = 85000.f * Daylight * Daylight;
    Sun->SetIntensity(SunLux);
    // The light warms through the whole afternoon, not only in the last half hour.
    const float SunHeight = FMath::Clamp(Altitude / 55.f, 0.f, 1.f);
    Sun->SetLightColor(FLinearColor::LerpUsingHSV(FLinearColor(1.f, 0.47f, 0.24f), FLinearColor(1.f, 0.9f, 0.76f), SunHeight));
    const float Night = 1.f - FMath::Clamp((Altitude + 3.f) / 9.f, 0.f, 1.f);
    const float MoonAltitude = 31.f + 10.f * FMath::Sin((TimeOfDay - 23.f) * PI / 12.f);
    Moon->SetWorldRotation(FRotator(-MoonAltitude, 48.f, 0.f));
    Moon->SetIntensity(1.2f * Night);
    SkyLight->SetIntensity(FMath::Lerp(0.8f, 1.8f, Daylight));
    Fog->SetFogDensity(FMath::Lerp(0.013f, 0.02f, Daylight));
    Fog->SetDirectionalInscatteringColor(FLinearColor(0.55f, 0.4f, 0.25f) * Daylight * (1.f - 0.6f * SunHeight));
    // Allow canopy shade while bounding dark adaptation against the incident sunlight.
    // A histogram dominated by shaded ground otherwise overexposes the sunlit canopy.
    // The zero EV100 floor still limits dark adaptation around the nighttime fire.
    PostProcess->Settings.AutoExposureMinBrightness = FMath::Max(0.f,
        FMath::Log2(FMath::Max(1.f, SunLux) / 2.5f) - 4.5f);
    PostProcess->Settings.AutoExposureBias = -0.8f * Daylight;
    PostProcess->Settings.BloomIntensity = FMath::Lerp(0.85f, 0.32f, Daylight);
    // Warm highlights against slightly cool shade, strongest as the sun drops.
    const float Warmth = Daylight * (0.3f + 0.7f * (1.f - SunHeight));
    PostProcess->Settings.ColorGainHighlights = FVector4(1.f + 0.06f * Warmth, 1.f + 0.01f * Warmth, 1.f - 0.08f * Warmth, 1.f);
    PostProcess->Settings.ColorGainShadows = FVector4(1.f - 0.03f * Warmth, 1.f, 1.f + 0.04f * Warmth, 1.f);
    PostProcess->Settings.ColorSaturation = FVector4(1.f, 1.f, 1.f, 1.f + 0.06f * Daylight);
    UpdateBreeze();
}

void AFlowFestWorld::SetPlayerCrowdPresence(FVector WorldPosition, bool bAtFire, bool bJoining)
{
    const FVector Local = SiteRoot->GetComponentTransform().InverseTransformPosition(WorldPosition);
    Crowd.SetPlayerPresence(FVector2D(Local.X, Local.Y) / MetresToCm, bAtFire, bJoining);
}

int32 AFlowFestWorld::GetCrowdActivityCount(int32 Activity) const
{
    if (Activity < 0 || Activity > static_cast<int32>(EFlowFestCrowdActivity::Idle)) return 0;
    return Crowd.GetCount(static_cast<EFlowFestCrowdActivity>(Activity));
}

FString AFlowFestWorld::GetNearbyAttendeeIntent(FVector WorldPosition) const
{
    const FVector Local = SiteRoot->GetComponentTransform().InverseTransformPosition(WorldPosition);
    const FVector2D Position(Local.X / MetresToCm, Local.Y / MetresToCm);
    const FFlowFestCrowdAgent* Nearest = nullptr;
    float DistanceSquared = FMath::Square(4.f);
    for (const FFlowFestCrowdAgent& Agent : Crowd.GetAgents())
    {
        const float Distance = FVector2D::DistSquared(Position, Agent.Position);
        if (Distance < DistanceSquared) { Nearest = &Agent; DistanceSquared = Distance; }
    }
    return Nearest ? FFlowFestCrowd::IntentText(*Nearest) : FString();
}

bool AFlowFestWorld::GreetNearbyAttendee(FVector WorldPosition, FString& Reply)
{
    const FVector Local = SiteRoot->GetComponentTransform().InverseTransformPosition(WorldPosition);
    return Crowd.GreetNearby(FVector2D(Local.X, Local.Y) / MetresToCm, Reply);
}

bool AFlowFestWorld::RestoreCrowdState(const FString& State)
{
    if (!Crowd.RestoreState(State)) return false;
    for (FFestivalPerson& Person : People) Person.bNeedsActivityRefresh = true;
    return true;
}

void AFlowFestWorld::ResetCrowd()
{
    TArray<TArray<FVector2D>> RoadLines;
    for (const FSiteRoad& Road : Roads) RoadLines.Add(Road.Points);
    Crowd.Initialize(Landmarks, RoadLines, TimeOfDay);
    for (FFestivalPerson& Person : People) Person.bNeedsActivityRefresh = true;
}
