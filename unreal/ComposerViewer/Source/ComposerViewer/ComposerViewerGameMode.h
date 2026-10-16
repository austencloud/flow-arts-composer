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
};
