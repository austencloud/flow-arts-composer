#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ComposerViewerPerformer.generated.h"

class UFlowFestAvatarComponent;
class UFlowFestPropComponent;
class USceneComponent;
class FFlowArtsRuntimeMotion;

/** One native performer, using the shared body and prop clock. */
UCLASS()
class COMPOSERVIEWER_API AComposerViewerPerformer : public AActor
{
    GENERATED_BODY()
public:
    AComposerViewerPerformer();
    bool Configure(const FString& InId, FName InCharacter, FName InProp, float InRate,
        bool bInComposerOwned = false, const FString& InEffect = FString());
    bool LoadRuntimeMotion(const FString& Json, const FString& RigSHA256, FString& Error);
    bool SetEffect(const FString& InEffect);
    void SetPlaying(bool bNewPlaying);
    void Restart();
    bool SetRate(float NewRate);
    bool IsPlaying() const { return bPlaying; }
    float GetRate() const { return Rate; }
    float GetPhase() const;
    float GetPerformanceTime() const;
    void SeekPerformance(float Seconds);
    const FString& GetPerformerId() const { return PerformerId; }
    FName GetCharacterId() const { return CharacterId; }
    FName GetPropId() const { return PropId; }
    const FString& GetEffect() const { return Effect; }
    TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> GetRuntimeMotion() const;
    bool HasPreparedClip() const { return bPreparedClip; }
    bool IsComposerOwned() const { return bComposerOwned; }

private:
#if WITH_DEV_AUTOMATION_TESTS
    friend class FComposerViewerBridgeTest;
#endif
    UPROPERTY() TObjectPtr<USceneComponent> Feet;
    UPROPERTY() TObjectPtr<UFlowFestAvatarComponent> Avatar;
    UPROPERTY() TObjectPtr<UFlowFestPropComponent> Prop;
    FString PerformerId;
    FName CharacterId = NAME_None;
    FName PropId = NAME_None;
    FString Effect;
    float Rate = 1.f;
    bool bPlaying = false;
    bool bPreparedClip = false;
    bool bComposerOwned = false;
};
