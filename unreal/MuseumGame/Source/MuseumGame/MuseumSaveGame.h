#pragma once
#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "MuseumSaveGame.generated.h"

UCLASS()
class MUSEUMGAME_API UMuseumSaveGame : public USaveGame
{
    GENERATED_BODY()
public:
    UPROPERTY() int32 Version = 1;
    UPROPERTY() FVector PlayerLocation = FVector::ZeroVector;
    UPROPERTY() FRotator PlayerRotation = FRotator::ZeroRotator;
    UPROPERTY() TArray<FString> ViewedExhibits;
};
