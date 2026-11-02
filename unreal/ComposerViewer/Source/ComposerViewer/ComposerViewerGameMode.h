#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "ComposerViewerGameMode.generated.h"

UCLASS()
class COMPOSERVIEWER_API AComposerViewerGameMode : public AGameModeBase
{
    GENERATED_BODY()
public:
    AComposerViewerGameMode();
    virtual void StartPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

private:
    /** Frame caps for the streamed host: the encoder's 60 while watched, 5 while nobody is. */
    static constexpr float WatchedMaxFps = 60.f;
    static constexpr float IdleMaxFps = 5.f;
    bool bIdle = false;

    void OnViewerJoined(FString StreamerId, FString PlayerId);
    void OnViewersGone(FString StreamerId);
    void SetIdle(bool bNewIdle);
    static void CapFrameRate(float MaxFps);
};
