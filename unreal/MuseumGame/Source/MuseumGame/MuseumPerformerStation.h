#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "MuseumPerformerStation.generated.h"

class UFlowFestAvatarComponent;
class UFlowFestPropComponent;
class UFlowArtsWorldScoreComponent;
class USceneComponent;

/** One exported Museum station, driven by its exact authored native capture. */
UCLASS()
class MUSEUMGAME_API AMuseumPerformerStation : public AActor
{
    GENERATED_BODY()

public:
    AMuseumPerformerStation();
    bool Configure(const FString& InId, const FString& InLabel, const FString& InSequenceId,
        FName CharacterId, FName Profile, FName PropId, bool bBodyVisible, bool bAutoPlay, float Rate);
    void TogglePlayback();
    void RestartPlayback();
    const FString& GetStationId() const { return StationId; }
    const FString& GetSequenceId() const { return SequenceId; }
    FName GetProfile() const { return PerformanceProfile; }
    FName GetCharacterId() const { return Character; }
    FName GetPropId() const { return PropName; }
    FString GetDisplayLabel() const { return Label.IsEmpty() ? StationId : Label; }
    FString GetPlaybackStatus() const;
    bool IsReady() const { return bReady; }
    bool IsPlaying() const;
    bool IsPaused() const;
    bool IsBodyVisible() const { return bShowBody; }
    float GetPlaybackPhase() const;
    float GetGripErrorCm() const;
    float GetPropAnchorErrorCm() const;
    FTransform GetPropRootTransform(bool bLeft) const;
    bool IsPropReady() const;
    UFlowFestAvatarComponent* GetAvatar() const { return Avatar; }
    UFlowFestPropComponent* GetProp() const { return Prop; }

private:
    UPROPERTY() TObjectPtr<USceneComponent> Feet;
    UPROPERTY() TObjectPtr<UFlowFestAvatarComponent> Avatar;
    UPROPERTY() TObjectPtr<UFlowFestPropComponent> Prop;
    UPROPERTY(VisibleAnywhere, Category="Museum|Score") TObjectPtr<UFlowArtsWorldScoreComponent> Score;
    FString StationId;
    FString Label;
    FString SequenceId;
    FString Failure;
    FName Character = NAME_None;
    FName PerformanceProfile = NAME_None;
    FName PropName = NAME_None;
    float PlaybackRate = 1.f;
    bool bReady = false;
    bool bShowBody = true;
    bool StartPlayback();
    bool Fail(const FString& Reason);
};
