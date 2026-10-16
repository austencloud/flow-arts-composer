#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "FlowFestGameMode.generated.h"

class AFlowFestWorld;

UCLASS()
class FLOWFEST_API AFlowFestGameMode : public AGameModeBase
{
    GENERATED_BODY()
public:
    AFlowFestGameMode();
    virtual void StartPlay() override;
    UPROPERTY(BlueprintReadOnly) TObjectPtr<AFlowFestWorld> FestivalWorld;
};
