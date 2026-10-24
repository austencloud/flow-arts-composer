#pragma once

#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "FlowFestSaveGame.generated.h"

UENUM(BlueprintType)
enum class EFlowFestPhase : uint8
{
    Loadout, DriveIn, GateCheckIn, ChooseCamp, CampArrival, VehicleSettle,
    WalkHome, MakeCamp, WalkToFestival, FestivalNight, NightFreeRoam,
    NightReturn, Morning
};

UENUM(BlueprintType)
enum class EFlowFestCamp : uint8 { None, LowerTent, UpperTent, CarCamp };

UENUM(BlueprintType)
enum class EFlowFestJam : uint8 { NotStarted, Active, Completed };

UENUM()
enum class EFlowFestVisitorAction : uint8 { None, Eat, Rest };

UCLASS()
class FLOWFEST_API UFlowFestSaveGame : public USaveGame
{
    GENERATED_BODY()
public:
    // A native slot intentionally separate from the browser simulation's storage.
    static constexpr int32 CurrentVersion = 4;
    static constexpr const TCHAR* SlotName = TEXT("FlowFestNative58");

    UPROPERTY(SaveGame) int32 Version = CurrentVersion;
    UPROPERTY(SaveGame) EFlowFestPhase Phase = EFlowFestPhase::Loadout;
    UPROPERTY(SaveGame) EFlowFestCamp Camp = EFlowFestCamp::None;
    UPROPERTY(SaveGame) EFlowFestJam Jam = EFlowFestJam::NotStarted;
    UPROPERTY(SaveGame) int32 LoadoutChoice = 0;
    UPROPERTY(SaveGame) int32 DepartureChoice = 0;
    UPROPERTY(SaveGame) float Energy = 100.f;
    UPROPERTY(SaveGame) float Hunger = 15.f;
    UPROPERTY(SaveGame) EFlowFestVisitorAction VisitorAction = EFlowFestVisitorAction::None;
    UPROPERTY(SaveGame) float VisitorActionRemaining = 0.f;
    UPROPERTY(SaveGame) float VisitorStandRemaining = 0.f;
    UPROPERTY(SaveGame) float VisitorRestElapsed = 0.f;
    UPROPERTY(SaveGame) FString CrowdState;
    UPROPERTY(SaveGame) bool bExplorationOnly = false;
    UPROPERTY(SaveGame) FVector Position = FVector::ZeroVector;
    UPROPERTY(SaveGame) FRotator Rotation = FRotator::ZeroRotator;
    UPROPERTY(SaveGame) float Hour = 15.f;
    UPROPERTY(SaveGame) bool bInVehicle = false;
    UPROPERTY(SaveGame) bool bCampBuilt = false;
    UPROPERTY(SaveGame) FName CharacterId = TEXT("ch01");
    UPROPERTY(SaveGame) FName PropId = TEXT("capsule_baton");
    UPROPERTY(SaveGame) bool bOnEUC = false;
    UPROPERTY(SaveGame) bool bSoundEnabled = true;
    UPROPERTY(SaveGame) int32 PerformanceVariant = 0;
};
