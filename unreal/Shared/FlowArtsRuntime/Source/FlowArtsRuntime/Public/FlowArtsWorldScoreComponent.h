#pragma once

#include "CoreMinimal.h"
#include "Components/WidgetComponent.h"
#include "FlowArtsWorldScoreComponent.generated.h"

class UFlowFestAvatarComponent;
class UFlowFestPropComponent;
struct FFlowArtsWorldScoreState;

/** Occluded, world-space view of the exact prepared performance and its validated pictographs. */
UCLASS(ClassGroup=(FlowArts), meta=(BlueprintSpawnableComponent))
class FLOWARTSRUNTIME_API UFlowArtsWorldScoreComponent : public UWidgetComponent
{
    GENERATED_BODY()

public:
    UFlowArtsWorldScoreComponent();

    /** Call after the target has its performer, prop, and prepared clip. Missing art leaves playback untouched. */
    UFUNCTION(BlueprintCallable, Category="Flow Arts|Score")
    bool ShowPerformance(UFlowFestAvatarComponent* Avatar, UFlowFestPropComponent* Prop, const FString& DisplayTitle);

    virtual void TickComponent(float DeltaTime, ELevelTick TickType,
        FActorComponentTickFunction* ThisTickFunction) override;
    virtual void OnUnregister() override;

private:
    TSharedPtr<FFlowArtsWorldScoreState> ScoreState;
};
