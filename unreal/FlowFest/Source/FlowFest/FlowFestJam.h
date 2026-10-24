#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "FlowFestJam.generated.h"

class AFlowFestWorld;
class UFlowFestAvatarComponent;
class UFlowFestPropComponent;
class UHierarchicalInstancedStaticMeshComponent;
class UMaterialInstanceDynamic;
class UPointLightComponent;

// The jam at the fire circle, "Dusk at Middle Earth": a roped circle of fire spinners
// with safety stations on its edge, LED spinners outside it, an archway entry with one
// lighting flame, a DJ booth and string lights on the stage. Every placement comes from
// Content/FlowFest/Assets/Jam/Data/jam-layout.json, which Tools/export-jam.ts writes from
// the browser's src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts, so both
// engines build the same jam. Site metres, x east and z south, the frame of site.json.
// A yaw in the file is radians about +y, 0 facing +x and turning toward +z; because site
// x is Unreal X and site z is Unreal Y, and Unreal yaw turns +X toward +Y, the Unreal
// yaw is the same angle in degrees (UnrealYaw).
namespace FlowFestJam
{
struct FStation { FString Id; FVector2D At = FVector2D::ZeroVector; float Yaw = 0.f; bool bTowelOnBack = true; bool bOccupied = false; int32 ChairColour = 0; };
struct FDressing { FString Id; FString Kind; FVector2D At = FVector2D::ZeroVector; float Yaw = 0.f; int32 Colour = 0; FString Carries; };
struct FSpectator { FString Id; FVector2D At = FVector2D::ZeroVector; float Yaw = 0.f; float Order = 0.f; };
struct FPerformer
{
    FString Id; FString Prop; FString Finish; bool bJuggler = false; bool bFacesAudience = false;
    FVector2D Start = FVector2D::ZeroVector; float Order = 0.f; float Seeds[4] = {0, 0, 0, 0};
};
struct FOutsideSpinner
{
    FString Id; FString Prop; FString Anchor; bool bJuggler = false;
    FVector2D At = FVector2D::ZeroVector; float Yaw = 0.f; float WanderRadius = 1.f; float Order = 0.f; float Seeds[4] = {0, 0, 0, 0};
};
struct FObstacle { FString Id; FVector2D At = FVector2D::ZeroVector; float Radius = 0.f; };
/** One opening-shot key: camera and look heights are metres above the sampled ground. */
struct FShotKey
{
    float Seconds = 0.f; FVector2D At = FVector2D::ZeroVector; float Height = 2.f;
    FVector2D Look = FVector2D::ZeroVector; float LookHeight = 1.f; float SunElevation = 0.f;
};
struct FNightKey { float Hour = 20.f; float Inside = 0.f; float Watching = 0.f; };
/** Anchors carry their height above ground in Z. */
struct FStringLight { FString Id; TArray<FVector> Anchors; float Sag = .4f; float BulbSpacing = .5f; };

struct FLayout
{
    int32 Version = 0;
    FVector2D Centre = FVector2D::ZeroVector;
    TArray<FVector2D> Boundary;
    float Perimeter = 0.f;
    FVector2D Entrance = FVector2D::ZeroVector;
    FVector2D Inward = FVector2D(1, 0);
    float GapStart = 0.f, GapEnd = 0.f;
    FVector2D Posts[2];
    FVector2D Archway = FVector2D::ZeroVector;
    float ArchwayYaw = 0.f;
    FVector2D Flame = FVector2D::ZeroVector;
    TArray<TArray<FVector2D>> Funnel;
    TArray<TArray<FVector2D>> Rope;
    TArray<FVector2D> Queue;
    TArray<FObstacle> Obstacles;
    TArray<FStation> Stations;
    TArray<FDressing> Dressing;
    TArray<FSpectator> Spectators;
    TArray<FPerformer> Performers;
    TArray<FOutsideSpinner> OutsideSpinners;
    FVector2D Booth = FVector2D::ZeroVector;
    float BoothYaw = 0.f, BoothWidth = 2.4f, BoothDepth = 1.1f, BeatsPerMinute = 118.f, BeatUntilHour = 26.f;
    TArray<FStringLight> StringLights;
    FVector2D Handover = FVector2D::ZeroVector;
    float HandoverYaw = 0.f;
    TArray<FShotKey> Opening;
    TArray<FNightKey> Night;
    float RopeOnBelow = 1.f, RopeFullBelow = -5.f;
    FLinearColor RopeColour = FLinearColor(1.f, .78f, .52f);
    FLinearColor RopeDrift = FLinearColor(1.f, .52f, .34f);
    float RopeDriftSeconds = 90.f;
    int32 MaxFireAtOnce = 18;
    float LingerSpeed = .6f, LingerRadius = 9.f, LingerSettle = 2.5f;
    float NoticeSeconds = 6.f, DuetSeconds = 18.f, NoticeRadius = 14.f;
};

FString LayoutPath();
bool ParseLayout(const FString& Json, FLayout& Out, FString& Error);
bool LoadLayout(FLayout& Out, FString& Error);

inline float UnrealYaw(float SiteYawRadians) { return FMath::RadiansToDegrees(SiteYawRadians); }
inline FVector2D Facing(float SiteYawRadians) { return FVector2D(FMath::Cos(SiteYawRadians), FMath::Sin(SiteYawRadians)); }

bool Inside(const TArray<FVector2D>& Loop, const FVector2D& P);
float DistanceToLine(const TArray<FVector2D>& Line, const FVector2D& P, bool bClosed);

/** The real sun's elevation at the site in mid-May (39.59 N, declination 18.78, solar noon 13:35 EDT). */
float MidMayElevation(float RealHour);
/** The mid-May clock hour with this sun elevation: the evening branch from solar noon to solar
 *  midnight (about 25.6), or the morning branch after it. Below the real night's lowest sun
 *  (-31.6 degrees) it holds solar midnight. */
float EquivalentHour(float SunElevation, bool bMorning);
/** The sun elevation of the world's current sun model (AFlowFestWorld::SunRotationAt). */
float ModelElevation(float ClockHour);
/** The world clock hour on the current model's evening branch with this sun elevation. */
float SolveClockHour(float SunElevation);
/** 0 above ropeOnBelowDegrees, 1 at ropeFullBelowDegrees and lower, smooth between. */
float RopeGlow(const FLayout& Layout, float SunElevation);
/** How much of the jam is out at a mid-May hour: the inside performers and the watchers. */
FVector2D NightAt(const FLayout& Layout, float RealHour);
/** Both night levels for the world clock, held at zero until the rope glows. */
FVector2D NightForClock(const FLayout& Layout, float ClockHour);
/** Opening-shot camera at a time: positions in site metres with height above ground in Z. */
void SampleShot(const FLayout& Layout, float Seconds, FVector& Eye, FVector& Look, float& SunElevation);
float ShotLength(const FLayout& Layout);
/** A deterministic drift around a home spot for wandering people, inside Radius metres. */
FVector2D Drift(const FVector2D& Home, float Radius, const float Seeds[4], float Seconds);
/** Inside performers keep at least this far inside the rope. */
constexpr float RopeClearance = 1.6f;
/** The distance from the rope polyline (open: the entrance gap is not rope). */
float DistanceToRope(const FLayout& Layout, const FVector2D& P);
/** Reflect a wander target back inside the circle with RopeClearance to spare. */
FVector2D KeepInside(const FLayout& Layout, const FVector2D& P);
/** The catalogue prop for a layout prop and finish; fire props take fire variants. */
FName PropIdFor(const FString& LayoutProp, bool bJuggler, bool bLed);
/** Builds the sagged points of a string-light run, Z is height above ground in metres. */
TArray<FVector> StringBulbs(const FStringLight& Run);
}

/** Runtime half of the jam: its people, the rope glow, and the player's verbs that the world answers. */
UCLASS()
class FLOWFEST_API UFlowFestJamComponent : public UActorComponent
{
    GENERATED_BODY()
public:
    UFlowFestJamComponent();
    void Setup(AFlowFestWorld* InWorld, const FlowFestJam::FLayout& InLayout);
    const FlowFestJam::FLayout& GetLayout() const { return Layout; }

    /** Rope MIDs and the lighting flame, registered by the world's builder. */
    void AddRopeMaterial(UMaterialInstanceDynamic* Material) { if (Material) RopeMaterials.Add(Material); }
    void AddGlowMaterial(UMaterialInstanceDynamic* Material) { if (Material) GlowMaterials.Add(Material); }
    void SetLightingFlame(UPointLightComponent* Light, USceneComponent* Flame) { FlameLight = Light; FlameVisual = Flame; }
    /** Night-only glows (laptop screen, LED club): their Glow follows the rope. */
    void AddBoothScreen(UMaterialInstanceDynamic* Material) { if (Material) ScreenMaterials.Add(Material); }

    /** World position of a site point on the ground. */
    FVector Ground(const FVector2D& P, float HeightCm = 0.f) const;
    /** Review views over the jam: fire, jam-club, jam-entrance, jam-stage, jam-outside. False if the site is not a jam view. */
    bool ReviewShot(const FString& Site, FVector& Eye, FVector& Look) const;
    /** Player presence: the world faces people toward a flowing player and sends a duet partner. */
    void SetPlayer(const FVector& WorldPosition, bool bFlowing, FName Profile, float Phase);
    bool IsInside(const FVector& WorldPosition) const;
    float DistanceToRopeCm(const FVector& WorldPosition) const;
    /** Slice drive: when set, the night levels come from this clock hour instead of the world's. */
    void SetShowAll(bool bAll) { bShowAll = bAll; }

    float GetRopeGlow() const { return CurrentGlow; }
    FVector2D GetNight() const { return CurrentNight; }
    int32 CountActive(int32 Kind) const;
    int32 CountFireLit() const;
    int32 CountNearEntrance(float Radius) const;
    bool OwnsActor(const AActor* Actor) const;
    /** The Nth shown watcher in a camp chair: the chair's ground point and yaw (jam frame, radians). */
    bool GetChairSitter(int32 Nth, FVector2D& ChairAt, float& ChairYaw) const;
    bool HasDuetPartner() const { return DuetIndex != INDEX_NONE; }
    const AActor* GetDuetPartner() const;

    /** Per group (EKind): how many the layout asks for, how many were spawned (Present), how many of those are dressed with their prop
     *  in hand, how many are out at the current clock, and how many of those are posed and shown. */
    struct FReadiness { int32 Expected[5] = {}, Present[5] = {}, Spawned[5] = {}, Out[5] = {}, Shown[5] = {}; };
    FReadiness GetReadiness() const;

    virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

    enum EKind : uint8 { Inside, Outside, Spectator, Safety, DJ };

private:
    struct FPerson
    {
        AActor* Actor = nullptr;
        UFlowFestAvatarComponent* Avatar = nullptr;
        UFlowFestPropComponent* Prop = nullptr;
        EKind Kind = Inside;
        int32 Source = 0;
        FVector2D Home = FVector2D::ZeroVector;
        FVector2D At = FVector2D::ZeroVector;
        FVector2D Target = FVector2D::ZeroVector;
        float Yaw = 0.f;
        float HomeYaw = 0.f;
        float Order = 0.f;
        float Seeds[4] = {0, 0, 0, 0};
        float WanderRadius = 1.f;
        FName Profile = NAME_None;
        FName Finish = NAME_None;
        bool bOut = false;
        bool bPlaying = false;
        bool bWalking = false;
        bool bSeated = false;
        float StateUntil = 0.f;
        float Turn = 0.f;
        uint8 LightState = 0;
        FName Body = NAME_None;
        bool bSolved = false;
        float SpinPhase = 0.f;
        // Seated in a camp chair: the actor stands where the held partial seat puts the hips on
        // the sling, and ChairExit holds FloorRest at that partial weight.
        bool bChair = false;
        float ChairExit = -1.f;
        FVector2D ChairAt = FVector2D::ZeroVector;
        // Shown once the body has posed for a moment while hidden, so nobody appears mid-blend.
        bool bShown = false;
        float RevealAt = 0.f;
    };
    bool SeatInChair(FPerson& Person, const FVector2D& ChairAt, float ChairYaw);
    void Reveal(FPerson& Person);
    bool Solve(FPerson& Person, float Phase);
    void Unsolve(FPerson& Person);
    void UpdateSolved();
    float SolvedAt = -10.f;

    UPROPERTY(Transient) TObjectPtr<AFlowFestWorld> World;
    UPROPERTY(Transient) TArray<TObjectPtr<UMaterialInstanceDynamic>> RopeMaterials;
    UPROPERTY(Transient) TArray<TObjectPtr<UMaterialInstanceDynamic>> GlowMaterials;
    UPROPERTY(Transient) TArray<TObjectPtr<UMaterialInstanceDynamic>> ScreenMaterials;
    UPROPERTY(Transient) TObjectPtr<UPointLightComponent> FlameLight;
    UPROPERTY(Transient) TObjectPtr<USceneComponent> FlameVisual;
    FlowFestJam::FLayout Layout;
    TArray<FPerson> People;
    float Elapsed = 0.f;
    float CurrentGlow = -1.f;
    FVector2D CurrentNight = FVector2D(-1, -1);
    bool bShowAll = false;

    FVector2D PlayerAt = FVector2D(1e6f, 1e6f);
    bool bPlayerFlowing = false;
    FName PlayerProfile = NAME_None;
    float PlayerPhase = 0.f;
    float FlowSeconds = 0.f;
    int32 DuetIndex = INDEX_NONE;

    void SpawnPeople();
    FPerson* Spawn(EKind Kind, int32 Source, const FVector2D& At, float Yaw, FName Avatar, FName PropId);
    void SetOut(FPerson& Person, bool bOut);
    void StartPlaying(FPerson& Person, float Phase);
    void StopPlaying(FPerson& Person);
    void UpdatePerson(FPerson& Person, int32 Index, float DeltaTime);
    void ApplyLights(bool bForce = false);
    float LogSince = 0.f;
    int32 LogFrames = 0;
};
