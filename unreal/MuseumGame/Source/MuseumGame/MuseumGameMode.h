#pragma once
#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "MuseumGameMode.generated.h"

UCLASS()
class MUSEUMGAME_API AMuseumGameMode : public AGameModeBase
{
    GENERATED_BODY()
public:
    AMuseumGameMode();
    virtual void StartPlay() override;
};
