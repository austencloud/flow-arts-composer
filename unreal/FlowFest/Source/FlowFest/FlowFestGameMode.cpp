#include "FlowFestGameMode.h"
#include "FlowFestCharacter.h"
#include "FlowFestHUD.h"
#include "FlowFestWorld.h"
#include "Engine/World.h"
#include "EngineUtils.h"

AFlowFestGameMode::AFlowFestGameMode()
{
    DefaultPawnClass = AFlowFestCharacter::StaticClass();
    HUDClass = AFlowFestHUD::StaticClass();
}

void AFlowFestGameMode::StartPlay()
{
    for (TActorIterator<AFlowFestWorld> It(GetWorld()); It; ++It)
    {
        FestivalWorld = *It;
        break;
    }
    if (!FestivalWorld)
    {
        FestivalWorld = GetWorld()->SpawnActor<AFlowFestWorld>(AFlowFestWorld::StaticClass());
    }
    Super::StartPlay();
}
