#pragma once
#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "MuseumSaveGame.generated.h"

// The authored Fire visit has three ordered courts. Persist physical orbit
// evidence as well as the phase so loading midway through an arc is stable.
USTRUCT()
struct FMuseumFireProgress
{
    GENERATED_BODY()
    UPROPERTY() int32 Phase = 0;
    UPROPERTY() TArray<int32> OrbitZones;
    UPROPERTY() TArray<float> OrbitTravelDegrees;
    UPROPERTY() TArray<float> LastOrbitAngles;
    UPROPERTY() TArray<bool> HasLastOrbitAngle;
    UPROPERTY() TArray<bool> Extinguished;
    UPROPERTY() float BlackoutElapsedSeconds = 0.f;
};

UCLASS()
class MUSEUMGAME_API UMuseumSaveGame : public USaveGame
{
    GENERATED_BODY()
public:
    UPROPERTY() int32 Version = 2;
    UPROPERTY() FVector PlayerLocation = FVector::ZeroVector;
    UPROPERTY() FRotator PlayerRotation = FRotator::ZeroRotator;
    UPROPERTY() TArray<FString> ViewedExhibits;
    UPROPERTY() FMuseumFireProgress FireProgress;
};
