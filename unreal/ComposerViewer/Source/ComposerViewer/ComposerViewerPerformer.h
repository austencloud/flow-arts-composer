#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ComposerViewerPerformer.generated.h"

class UFlowFestAvatarComponent;
class UFlowFestPropComponent;
class USceneComponent;

/** A single prepared family loop, using the shared native body and prop clock. */
UCLASS()
class COMPOSERVIEWER_API AComposerViewerPerformer : public AActor
{
    GENERATED_BODY()
public:
    AComposerViewerPerformer();
    bool Configure(const FString& InId, FName InCharacter, FName InProp, float InRate);
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

private:
    UPROPERTY() TObjectPtr<USceneComponent> Feet;
    UPROPERTY() TObjectPtr<UFlowFestAvatarComponent> Avatar;
    UPROPERTY() TObjectPtr<UFlowFestPropComponent> Prop;
    FString PerformerId;
    FName CharacterId = NAME_None;
    FName PropId = NAME_None;
    float Rate = 1.f;
    bool bPlaying = false;
};
