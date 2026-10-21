#pragma once

#include "CoreMinimal.h"
#include "Components/SceneComponent.h"
#include "FlowFestEcologyComponent.generated.h"

class AFlowFestWorld;
class UHierarchicalInstancedStaticMeshComponent;
class UMaterialInstanceDynamic;

/** The source site's route-cleared grass and understory, in the site's metre frame. */
UCLASS(ClassGroup=(FlowFest), meta=(BlueprintSpawnableComponent))
class FLOWFEST_API UFlowFestEcologyComponent : public USceneComponent
{
    GENERATED_BODY()
public:
    UFlowFestEcologyComponent();

    /** Call after site.json is exported and SiteRoot is attached. SiteWorld settles the
     *  stubble grown between source placements on the terrain; without it, stubble
     *  takes its parent placement's height. */
    UFUNCTION(BlueprintCallable, Category="Flow Fest|Ecology")
    bool BuildFromSite(AFlowFestWorld* SiteWorld = nullptr);

    /** View distance is expressed in centimetres and can follow quality settings. */
    UFUNCTION(BlueprintCallable, Category="Flow Fest|Ecology")
    void SetViewDistances(float GrassNearCm, float GrassFarCm, float UnderstoryFarCm);

    UFUNCTION(BlueprintCallable, Category="Flow Fest|Ecology")
    void SetWindStrength(float Strength);

    /** Field grass groups: meadow patches, the stubble between them, and seed stalks. */
    static constexpr int32 GrassGroupCount = 3;

private:
    /** The grass groups first, then the understory families. */
    UPROPERTY(Transient) TArray<TObjectPtr<UHierarchicalInstancedStaticMeshComponent>> Groups;
    UPROPERTY(Transient) TArray<TObjectPtr<UMaterialInstanceDynamic>> WindMaterials;
    float WindStrength = 0.38f;
};
