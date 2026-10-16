#include "ComposerViewerGameMode.h"
#include "ComposerViewerStage.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"

AComposerViewerGameMode::AComposerViewerGameMode()
{
    DefaultPawnClass = nullptr;
}

void AComposerViewerGameMode::StartPlay()
{
    Super::StartPlay();
    GetWorld()->SpawnActor<AComposerViewerStage>(AComposerViewerStage::StaticClass(),
        FVector::ZeroVector, FRotator::ZeroRotator);
}
