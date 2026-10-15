#pragma once

#include "CoreMinimal.h"
#include "Components/SceneComponent.h"
#include "FlowFestSoundscapeComponent.generated.h"

class UAudioComponent;
class AFlowFestWorld;

/** Layered, spatial ambience authored for the measured Flow Fest site. */
UCLASS(ClassGroup=(FlowFest), meta=(BlueprintSpawnableComponent))
class FLOWFEST_API UFlowFestSoundscapeComponent : public USceneComponent
{
    GENERATED_BODY()
public:
    UFlowFestSoundscapeComponent();
    UFUNCTION(BlueprintCallable, Category="Flow Fest|Sound") bool BuildFromSite(AFlowFestWorld* SiteWorld);
    UFUNCTION(BlueprintCallable, Category="Flow Fest|Sound") void SetEnabled(bool bInEnabled);
    UFUNCTION(BlueprintPure, Category="Flow Fest|Sound") bool IsEnabled() const { return bEnabled; }
    UFUNCTION(BlueprintCallable, Category="Flow Fest|Sound") void SetTimeOfDay(float Hour);
    UFUNCTION(BlueprintCallable, Category="Flow Fest|Sound") void SetJamActive(bool bActive);
    virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

private:
    struct FVoice
    {
        TObjectPtr<UAudioComponent> Audio;
        FName Asset;
        float BaseGain = 1.f;
    };
    TArray<FVoice> Voices;
    bool bEnabled = true;
    bool bJamActive = false;
    float HourOfDay = 18.5f;
    void AddVoice(const TCHAR* Asset, const FVector& LocalPosition, float Gain, float MaxDistanceCm);
};
