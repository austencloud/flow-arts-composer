#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "MuseumSaveGame.h"
#include "MuseumWorld.generated.h"

class UHierarchicalInstancedStaticMeshComponent;
class UBoxComponent;
class UPointLightComponent;
class UStaticMeshComponent;
class UMaterialInstanceDynamic;
class AMuseumPerformerStation;

USTRUCT()
struct FMuseumExhibit
{
    GENERATED_BODY()
    FString Id;
    FString Title;
    FString Subtitle;
    FString Body;
    FString Footer;
    FVector Location = FVector::ZeroVector;
};

USTRUCT()
struct FMuseumRoom
{
    GENERATED_BODY()
    FString Id;
    FString Name;
    FString Theme;
    FIntRect Bounds;
};

struct FMuseumFireCourt
{
    FString Id;
    FString PerformerId;
    FVector2D Centre = FVector2D::ZeroVector;
    FVector2D Entry = FVector2D::ZeroVector;
    FVector2D Exit = FVector2D::ZeroVector;
    TArray<FVector2D> Outline;
    float ThroatWidth = 0.f;
    float OrbitRadius = 0.f;
    float OrbitWidth = 0.f;
    float OrbitSweepDegrees = 0.f;
};

UCLASS()
class MUSEUMGAME_API AMuseumWorld : public AActor
{
    GENERATED_BODY()
public:
    AMuseumWorld();
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;
    bool LoadMuseum();
    FVector GetSpawnLocation() const { return SpawnLocation; }
    FRotator GetSpawnRotation() const { return SpawnRotation; }
    const FMuseumExhibit* NearestExhibit(const FVector& Location, float RadiusCm) const;
    const FMuseumRoom* RoomAt(const FVector& Location) const;
    bool UsesAuthoredCaveLighting(const FVector& Location) const;
    AMuseumPerformerStation* NearestPerformerStation(const FVector& Location, float RadiusCm) const;
    const TArray<TObjectPtr<AMuseumPerformerStation>>& GetAnimatedStations() const { return AnimatedStations; }
    const TArray<FMuseumRoom>& GetRooms() const { return Rooms; }
    int32 GetExhibitCount() const { return Exhibits.Num(); }
    int32 GetPerformerCount() const { return PerformerCount; }
    bool IsLoaded() const { return bLoaded; }
    bool HasFireProgression() const { return FireCourts.Num() == 3; }
    const FMuseumFireProgress& GetFireProgress() const { return FireProgress; }
    void RestoreFireProgress(const FMuseumFireProgress& Progress);
    void UpdateFireProgress(const FVector& VisitorLocation, float DeltaSeconds);
    FString GetFireStatus() const;
    bool IsFireStation(const AMuseumPerformerStation* Station) const;

private:
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* Floors;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* CaveFloorCollision;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* CaveWallCollision;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* Corridors;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* Walls;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* Displays;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* Performers;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* Furniture;
    UPROPERTY() TArray<UBoxComponent*> RoomCollision;
    UPROPERTY() TArray<UPointLightComponent*> RoomLights;
    UPROPERTY() TArray<UPointLightComponent*> FireAmbientLights;
    UPROPERTY() TArray<UStaticMeshComponent*> AuthoredShells;
    UPROPERTY() TArray<UMaterialInstanceDynamic*> FireMaterials;
    TArray<FString> FireMaterialNames;
    UPROPERTY() TArray<UStaticMeshComponent*> PerformerFigures;
    UPROPERTY() TArray<TObjectPtr<AMuseumPerformerStation>> AnimatedStations;
    TArray<FMuseumExhibit> Exhibits;
    TArray<FMuseumRoom> Rooms;
    TArray<FBox2D> AuthoredCorridors;
    TArray<FMuseumFireCourt> FireCourts;
    FMuseumFireProgress FireProgress;
    FVector2D EarthDoor = FVector2D::ZeroVector;
    FVector2D WaterDoor = FVector2D::ZeroVector;
    FVector2D FireVisitorPosition = FVector2D::ZeroVector;
    UPROPERTY() TArray<UPointLightComponent*> FireLights;
    UPROPERTY() UPointLightComponent* GrowthLight = nullptr;
    UPROPERTY() UPointLightComponent* WaterLight = nullptr;
    FVector SpawnLocation = FVector::ZeroVector;
    FRotator SpawnRotation = FRotator(0.f, -90.f, 0.f);
    int32 PerformerCount = 0;
    bool bLoaded = false;
    int32 SmokeStage = -1;
    float SmokeElapsed = 0.f;
    float SmokePhase = 0.f;
    float SmokeHiddenPhase = 0.f;
    float SmokePeakGripCm = 0.f;
    float SmokePeakAnchorCm = 0.f;
    FTransform SmokeLeftProp = FTransform::Identity;
    FTransform SmokeRightProp = FTransform::Identity;
    void RunPlaybackSmoke(float DeltaSeconds);
    void RefreshFireVisuals();
    void RunProgressionSmoke(float DeltaSeconds);
    int32 ProgressionSmokeStage = -1;
    float ProgressionSmokeElapsed = 0.f;
    int32 CaveSmokeRoutePoint = 0;
};
