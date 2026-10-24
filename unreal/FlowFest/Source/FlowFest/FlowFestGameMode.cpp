#include "FlowFestGameMode.h"
#include "FlowFestCharacter.h"
#include "FlowFestHUD.h"
#include "FlowFestPhraseStage.h"
#include "FlowFestWorld.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/HUD.h"
#include "GameFramework/SpectatorPawn.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"

namespace
{
// Phrase stage: -FlowFestPhraseStage plays the staff phrase stage alone, without the festival.
bool IsPhraseStage() { return FParse::Param(FCommandLine::Get(), TEXT("FlowFestPhraseStage")); }
}

AFlowFestGameMode::AFlowFestGameMode()
{
    DefaultPawnClass = AFlowFestCharacter::StaticClass();
    HUDClass = AFlowFestHUD::StaticClass();
}

void AFlowFestGameMode::InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage)
{
    Super::InitGame(MapName, Options, ErrorMessage);
    if (IsPhraseStage()) // Phrase stage
    {
        DefaultPawnClass = ASpectatorPawn::StaticClass();
        HUDClass = AHUD::StaticClass();
    }
}

void AFlowFestGameMode::StartPlay()
{
    if (IsPhraseStage()) // Phrase stage
    {
        Super::StartPlay();
        GetWorld()->SpawnActor<AFlowFestPhraseStage>(AFlowFestPhraseStage::StaticClass(), FTransform::Identity);
        return;
    }
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
