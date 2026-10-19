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
    // A level can own the world actor for editor authoring. Do not create a
    // second layout when one has already been placed in the native map.
    AMuseumWorld* Museum = nullptr;
    for (TActorIterator<AMuseumWorld> It(GetWorld()); It; ++It)
    {
        Museum = *It;
        break;
    }
    if (!Museum)
        Museum = GetWorld()->SpawnActor<AMuseumWorld>(AMuseumWorld::StaticClass(), FVector::ZeroVector, FRotator::ZeroRotator);
    Super::StartPlay();
    if (!Museum || !Museum->IsLoaded()) return;
    for (FConstPlayerControllerIterator It = GetWorld()->GetPlayerControllerIterator(); It; ++It)
    {
        if (AMuseumCharacter* Visitor = Cast<AMuseumCharacter>(It->Get()->GetPawn()))
        {
            Visitor->SetMuseumWorld(Museum);
            Visitor->SetActorLocation(Museum->GetSpawnLocation());
            It->Get()->SetControlRotation(Museum->GetSpawnRotation());
        }
    }
}
