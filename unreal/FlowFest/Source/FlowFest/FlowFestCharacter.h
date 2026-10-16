#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "FlowFestSaveGame.h"
#include "FlowFestCharacter.generated.h"

class AFlowFestWorld;
class UCameraComponent;
class USpringArmComponent;
class UStaticMeshComponent;
class UFlowFestAvatarComponent;
class UFlowFestPropComponent;

struct FFlowFestChoice
{
    FName Id;
    FString Name;
    FString Category;
};

UCLASS()
class FLOWFEST_API AFlowFestCharacter : public ACharacter
{
    GENERATED_BODY()
public:
    AFlowFestCharacter();
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;
    virtual void SetupPlayerInputComponent(UInputComponent* Input) override;

    UPROPERTY(BlueprintReadOnly) EFlowFestPhase Phase = EFlowFestPhase::Loadout;
    UPROPERTY(BlueprintReadOnly) EFlowFestCamp Camp = EFlowFestCamp::None;
    UPROPERTY(BlueprintReadOnly) EFlowFestJam Jam = EFlowFestJam::NotStarted;
    UPROPERTY(BlueprintReadOnly) float Energy = 100.f;
    UPROPERTY(BlueprintReadOnly) float Hunger = 15.f;
    UPROPERTY(BlueprintReadOnly) bool bInVehicle = false;
    UPROPERTY(BlueprintReadOnly) bool bOnEUC = false;
    UPROPERTY(BlueprintReadOnly) bool bPhotoFly = false;
    UPROPERTY(BlueprintReadOnly) bool bCampBuilt = false;
    UPROPERTY(BlueprintReadOnly) int32 LoadoutChoice = 0;
    UPROPERTY(BlueprintReadOnly) int32 DepartureChoice = 0;

    // Tweak in a derived Blueprint if the imported car's pivot or scale changes.
    UPROPERTY(EditDefaultsOnly, Category = "Flow Fest|Vehicle") FVector CarVisualOffset = FVector(0.f, 0.f, -36.f);
    UPROPERTY(EditDefaultsOnly, Category = "Flow Fest|Vehicle") FVector CarVisualScale = FVector::OneVector;

    FString GetObjectiveTitle() const;
    FString GetObjectiveDetail() const;
    FString GetInteractHint() const;
    FString GetModeLabel() const;
    FString GetNotice() const;
    FString GetNearbyIntent() const;
    FVector GetObjectiveLocation() const;
    float GetObjectiveDistanceMeters() const;
    AFlowFestWorld* GetFestivalWorld() const { return FestivalWorld.Get(); }
    bool IsWardrobeOpen() const { return bWardrobeOpen; }
    FName GetCharacterId() const { return CharacterId; }
    FName GetEquippedPropId() const { return EquippedPropId; }
    const TArray<FFlowFestChoice>& GetCharacters() const { return CharacterChoices; }
    const TArray<FFlowFestChoice>& GetProps() const { return PropChoices; }
    void ChooseCharacter(FName Id);
    void ChooseProp(FName Id);
    void ToggleWardrobe();

private:
    UPROPERTY(VisibleAnywhere) TObjectPtr<USpringArmComponent> CameraBoom;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UCameraComponent> FollowCamera;
    UPROPERTY(VisibleAnywhere) TObjectPtr<USceneComponent> AvatarRoot;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UFlowFestAvatarComponent> Avatar;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UFlowFestPropComponent> Props;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> CarMesh;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> EUCMesh;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> EUCWheel;
    UPROPERTY() TObjectPtr<AFlowFestWorld> FestivalWorld;

    bool bForward = false, bBack = false, bLeft = false, bRight = false;
    bool bSprint = false, bRise = false, bDescend = false, bFirstPerson = false, bStaffSpinning = false;
    float SaveNoticeUntil = 0.f;
    FString SaveNotice;
    float JamSpinSeconds = 0.f;
    EFlowFestVisitorAction VisitorAction = EFlowFestVisitorAction::None;
    float VisitorActionRemaining = 0.f;
    bool bInitialPlacementDone = false;
    bool bWardrobeOpen = false;
    bool bSoundEnabled = true;
    int32 PerformanceVariant = 0;
    FName CharacterId = TEXT("ch01");
    FName EquippedPropId = TEXT("capsule_baton");
    TArray<FFlowFestChoice> CharacterChoices;
    TArray<FFlowFestChoice> PropChoices;
    FRotator PreWardrobeView;
    bool bReviewMode = false;
    bool bCaptureRequested = false;
    bool bCaptureReady = false;
    bool bAutoExit = false;
    bool bSmoke = false;
    bool bSmokeRan = false;
    bool bSmokePassed = true;
    bool bSmokeDrivePassed = true;
    int32 SmokeDriveStage = 0;
    float SmokeStageStartSeconds = 0.f;
    FVector SmokeStageStartLocation = FVector::ZeroVector;
    float SmokeStageStartYaw = 0.f;
    float StartupSeconds = 0.f;
    double FrameDeltaTotalMs = 0.0;
    float FrameDeltaMaxMs = 0.f;
    int32 FrameSampleCount = 0;
    bool bTimingReported = false;
    FString ReviewSite;
    FString Showcase;
    bool bShowcaseStarted = false;
    bool bShowcaseStopped = false;
    float ShowcaseStopAt = 0.f;
    FString CapturePath;
    FString ActiveCapturePath;
    int32 CaptureFrames = 1;
    int32 CapturedFrames = 0;
    float CaptureStart = 25.f;
    float CaptureInterval = .1f;
    FDateTime CapturePreviousTimestamp;

    void SetForward() { bForward = true; }
    void ClearForward() { bForward = false; }
    void SetBack() { bBack = true; }
    void ClearBack() { bBack = false; }
    void SetLeft() { bLeft = true; }
    void ClearLeft() { bLeft = false; }
    void SetRight() { bRight = true; }
    void ClearRight() { bRight = false; }
    void SetSprint() { bSprint = true; }
    void ClearSprint() { bSprint = false; }
    void SetRise() { bRise = true; }
    void ClearRise() { bRise = false; }
    void SetDescend() { bDescend = true; }
    void ClearDescend() { bDescend = false; }
    void LookX(float Value);
    void LookY(float Value);
    void Interact();
    bool TryVisitorActivity();
    void GreetNearby();
    void EndVisitorActivity();
    void TickVisitorActivity(float DeltaSeconds);
    FString VisitorActivityHint() const;
    void SelectOne();
    void SelectTwo();
    void SelectThree();
    void ToggleSprint();
    void ToggleFirstPerson();
    void TogglePhotoFly();
    void ToggleEUC();
    void ToggleStaff();
    void CyclePerformance();
    void OpenPerformanceLibrary();
    void SyncPerformanceActivity();
    bool IsFlowPlaying() const;
    void ToggleSound();
    void StopFlow();
    void TravelToObjective();
    void CycleTime();
    void SaveProgress();
    void LoadProgress();
    void Restart();
    void JumpOrRise();
    void StopJumpOrRise();
    void QuitGame();
    bool Near(const FString& Landmark, float RadiusMeters) const;
    void Advance(EFlowFestPhase Next);
    void ApplyPhaseTime();
    void SyncModeVisuals();
    void LoadCatalogs();
    void SyncPlayerCamp();
    void Notify(const FString& Message);
    bool ValidateSave(const UFlowFestSaveGame* Save) const;
    FString CampLandmark() const;
    void PlaceReviewCamera();
    bool RunSmokeDrive();
    void RunSmoke();
    void ReportFrameTiming();
    const TCHAR* SaveSlot() const { return bSmoke ? TEXT("FlowFestNative58Smoke") : UFlowFestSaveGame::SlotName; }
};
