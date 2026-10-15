#include "MuseumGameMode.h"
#include "MuseumWorld.h"
#include "MuseumCharacter.h"
#include "MuseumHUD.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerController.h"

AMuseumGameMode::AMuseumGameMode()
{
    DefaultPawnClass = AMuseumCharacter::StaticClass();
    HUDClass = AMuseumHUD::StaticClass();
}

void AMuseumGameMode::StartPlay()
{
    AMuseumWorld* Museum = GetWorld()->SpawnActor<AMuseumWorld>(AMuseumWorld::StaticClass(), FVector::ZeroVector, FRotator::ZeroRotator);
    Super::StartPlay();
    if (!Museum || !Museum->IsLoaded()) return;
    for (FConstPlayerControllerIterator It = GetWorld()->GetPlayerControllerIterator(); It; ++It)
    {
        if (AMuseumCharacter* Visitor = Cast<AMuseumCharacter>(It->Get()->GetPawn()))
        {
            Visitor->SetMuseumWorld(Museum);
            Visitor->SetActorLocation(Museum->GetSpawnLocation());
        }
    }
}
