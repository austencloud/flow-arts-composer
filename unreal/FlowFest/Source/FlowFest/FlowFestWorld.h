#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "FlowFestCrowd.h"
#include "FlowFestWorld.generated.h"

class UDirectionalLightComponent;
class UExponentialHeightFogComponent;
class UHierarchicalInstancedStaticMeshComponent;
class UInstancedSkinnedMeshComponent;
class UDynamicWindData;
class UMaterialInterface;
class UPostProcessComponent;
class UPointLightComponent;
class UProceduralMeshComponent;
class USkeletalMeshComponent;
class USkyAtmosphereComponent;
class USkyLightComponent;
class UVolumetricCloudComponent;
class UStaticMesh;
class UStaticMeshComponent;
class UFlowFestAvatarComponent;
class UFlowFestPropComponent;
class UFlowFestEcologyComponent;
class UFlowFestSoundscapeComponent;

/** Measured Flow Fest site. East and south are metres; UE X and Y are centimetres. */
UCLASS()
class FLOWFEST_API AFlowFestWorld : public AActor
{
    GENERATED_BODY()

public:
    AFlowFestWorld();
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;

    UFUNCTION(BlueprintCallable, Category="Flow Fest|Site")
    FVector GetLandmark(const FString& Id) const;

    /** World-space ground Z, in centimetres. */
    UFUNCTION(BlueprintCallable, Category="Flow Fest|Site")
    float SampleGround(float EastMeters, float SouthMeters) const;

    UFUNCTION(BlueprintCallable, Category="Flow Fest|Site")
    FVector ToWorld(float East, float South, float HeightOffsetCm = 0.f) const;

    UFUNCTION(BlueprintCallable, Category="Flow Fest|Sky")
    void SetTimeOfDay(float Hour);

    UFUNCTION(BlueprintPure, Category="Flow Fest|Sky")
    float GetTimeOfDay() const { return TimeOfDay; }

    // The sun's light direction at a clock hour: up 68 degrees at noon, and
    // swinging from east-northeast at dawn through south to west-northwest at dusk.
    static FRotator SunRotationAt(float Hour);

    UFUNCTION(BlueprintPure, Category="Flow Fest|Site")
    int32 GetNearTreeCount() const { return NearTreeCount; }

    UFUNCTION(BlueprintPure, Category="Flow Fest|Site")
    int32 GetBackdropTreeCount() const { return BackdropTreeCount; }

    UFUNCTION(BlueprintCallable, Category="Flow Fest|Camp")
    void SetPlayerCamp(FString CampLandmark, bool bBuilt);

    /** Player participation draws nearby spectators' attention without taking over story state. */
    UFUNCTION(BlueprintCallable, Category="Flow Fest|Crowd")
    void SetPlayerCrowdPresence(FVector WorldPosition, bool bAtFire, bool bJoining);

    UFUNCTION(BlueprintPure, Category="Flow Fest|Crowd")
    int32 GetCrowdActivityCount(int32 Activity) const;

    UFUNCTION(BlueprintPure, Category="Flow Fest|Crowd")
    int32 GetCrowdSize() const { return People.Num(); }

    FString GetNearbyAttendeeIntent(FVector WorldPosition) const;
    bool GreetNearbyAttendee(FVector WorldPosition, FString& Reply);
    FString SaveCrowdState() const { return Crowd.SerializeState(); }
    bool RestoreCrowdState(const FString& State);
    void ResetCrowd();

    void SetSoundEnabled(bool bEnabled);
    void SetJamSoundActive(bool bActive);

private:
    struct FSiteRoad
    {
        FString Id;
        FString Kind;
        float Width = 3.f;
        TArray<FVector2D> Points;
    };

    struct FSiteTree
    {
        FVector2D Position;
        FString Family;
        float Height = 10.f;
        float Rotation = 0.f;
    };

    struct FSiteCamp
    {
        FVector2D Position;
        FString Type;
        float Rotation = 0.f;
        float Scale = 1.f;
    };

    struct FSiteVehicle
    {
        FVector2D Position;
        FString Model;
        float Rotation = 0.f;
        int32 PaintIndex = 0;
    };

    struct FFestivalPerson
    {
        AActor* Actor = nullptr;
        UFlowFestAvatarComponent* Avatar = nullptr;
        UFlowFestPropComponent* Prop = nullptr;
        EFlowFestCrowdActivity LastActivity = EFlowFestCrowdActivity::Rest;
        bool bPerformancePlaying = false;
        bool bNeedsActivityRefresh = true;
    };

    UPROPERTY(VisibleAnywhere) TObjectPtr<USceneComponent> SiteRoot;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UFlowFestEcologyComponent> Ecology;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UFlowFestSoundscapeComponent> Soundscape;
    bool bSoundEnabled = true;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UDirectionalLightComponent> Sun;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UDirectionalLightComponent> Moon;
    UPROPERTY(VisibleAnywhere) TObjectPtr<USkyLightComponent> SkyLight;
    UPROPERTY(VisibleAnywhere) TObjectPtr<USkyAtmosphereComponent> Atmosphere;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UVolumetricCloudComponent> Clouds;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UExponentialHeightFogComponent> Fog;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UPostProcessComponent> PostProcess;

    UPROPERTY(Transient) TArray<TObjectPtr<UProceduralMeshComponent>> TerrainChunks;
    UPROPERTY(Transient) TArray<TObjectPtr<UHierarchicalInstancedStaticMeshComponent>> InstanceGroups;
    UPROPERTY(Transient) TArray<TObjectPtr<UInstancedSkinnedMeshComponent>> TreeLiveGroups;
    UPROPERTY(Transient) TObjectPtr<UDynamicWindData> TreeWindData;
    int32 NearTreeCount = 0;
    int32 BackdropTreeCount = 0;
    bool bLiveNearTrees = true;
    FVector BreezeCenter = FVector::ZeroVector;
    UPROPERTY(Transient) TObjectPtr<UStaticMeshComponent> PlayerTent;
    UPROPERTY(Transient) TObjectPtr<UPointLightComponent> FireLight;

    TArray<float> Elevations;
    TArray<FSiteRoad> Roads;
    TArray<FSiteTree> Trees;
    TArray<FSiteTree> BackdropTrees;
    TArray<FSiteCamp> Camps;
    FSiteCamp PlayerTentPlacement;
    bool bHasPlayerTentPlacement = false;
    TArray<FSiteVehicle> Vehicles;
    TArray<FFestivalPerson> People;
    FFlowFestCrowd Crowd;
    TMap<FString, FVector2D> Landmarks;
    TMap<FString, float> SourceMeshHeights;

    int32 GridWidth = 0;
    int32 GridHeight = 0;
    float GridSpacing = 1.f;
    float GridMinEast = -512.f;
    float GridMinSouth = -512.f;
    float OriginElevation = 270.f;
    float TimeOfDay = 18.5f;

    bool LoadSite();
    void BuildTerrain();
    void BuildRoads();
    void BuildTrees();
    void UpdateBreeze();
    void BuildCamps();
    void BuildVehicles();
    void BuildFestivalLandmarks();
    void BuildLanterns();
    void BuildPeople();
    void AddSign(const FString& Label, const FVector2D& At, float Yaw);
    void AddSetPiece(const FString& AssetName, const FVector& Position, const FRotator& Rotation, const FVector& Scale = FVector::OneVector);
    UHierarchicalInstancedStaticMeshComponent* AddInstanceGroup(UStaticMesh* Mesh, const FString& Name, UMaterialInterface* OverrideMaterial = nullptr);
    UStaticMesh* LoadSetMesh(const FString& Name) const;
    UMaterialInterface* LoadMaterial(const FString& Name) const;
    float ElevationAt(float East, float South) const;
};
