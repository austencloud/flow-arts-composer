#pragma once

#include "CoreMinimal.h"
#include "Components/SceneComponent.h"
#include "FlowFestEcologyComponent.generated.h"

class UHierarchicalInstancedStaticMeshComponent;
class UMaterialInstanceDynamic;

/** The source site's route-cleared grass and understory, in the site's metre frame. */
UCLASS(ClassGroup=(FlowFest), meta=(BlueprintSpawnableComponent))
class FLOWFEST_API UFlowFestEcologyComponent : public USceneComponent
{
    GENERATED_BODY()
public:
    UFlowFestEcologyComponent();

    /** Call after site.json is exported and SiteRoot is attached. */
    UFUNCTION(BlueprintCallable, Category="Flow Fest|Ecology")
    bool BuildFromSite();

    /** View distance is expressed in centimetres and can follow quality settings. */
    UFUNCTION(BlueprintCallable, Category="Flow Fest|Ecology")
    void SetViewDistances(float GrassNearCm, float GrassFarCm, float UnderstoryFarCm);

    UFUNCTION(BlueprintCallable, Category="Flow Fest|Ecology")
    void SetWindStrength(float Strength);

private:
    UPROPERTY(Transient) TArray<TObjectPtr<UHierarchicalInstancedStaticMeshComponent>> Groups;
    UPROPERTY(Transient) TArray<TObjectPtr<UMaterialInstanceDynamic>> WindMaterials;
    float WindStrength = 0.38f;
};
