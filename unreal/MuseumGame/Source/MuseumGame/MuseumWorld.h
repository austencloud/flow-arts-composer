#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "MuseumWorld.generated.h"

class UHierarchicalInstancedStaticMeshComponent;
class UBoxComponent;
class UPointLightComponent;
class UStaticMeshComponent;
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
    AMuseumPerformerStation* NearestPerformerStation(const FVector& Location, float RadiusCm) const;
    const TArray<TObjectPtr<AMuseumPerformerStation>>& GetAnimatedStations() const { return AnimatedStations; }
    const TArray<FMuseumRoom>& GetRooms() const { return Rooms; }
    int32 GetExhibitCount() const { return Exhibits.Num(); }
    int32 GetPerformerCount() const { return PerformerCount; }
    bool IsLoaded() const { return bLoaded; }

private:
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* Floors;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* CaveFloorCollision;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* Corridors;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* Walls;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* Displays;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* Performers;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* Furniture;
    UPROPERTY() TArray<UBoxComponent*> RoomCollision;
    UPROPERTY() TArray<UPointLightComponent*> RoomLights;
    UPROPERTY() TArray<UStaticMeshComponent*> AuthoredShells;
    UPROPERTY() TArray<UStaticMeshComponent*> PerformerFigures;
    UPROPERTY() TArray<TObjectPtr<AMuseumPerformerStation>> AnimatedStations;
    TArray<FMuseumExhibit> Exhibits;
    TArray<FMuseumRoom> Rooms;
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
};
