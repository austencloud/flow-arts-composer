#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "MuseumCharacter.generated.h"

class UCameraComponent;
class AMuseumWorld;
class AMuseumPerformerStation;
struct FMuseumExhibit;

UCLASS()
class MUSEUMGAME_API AMuseumCharacter : public ACharacter
{
    GENERATED_BODY()
public:
    AMuseumCharacter();
    virtual void Tick(float DeltaSeconds) override;
    virtual void SetupPlayerInputComponent(UInputComponent* Input) override;
    void SetMuseumWorld(AMuseumWorld* InWorld) { Museum = InWorld; }
    const AMuseumWorld* GetMuseumWorld() const { return Museum; }
    const FMuseumExhibit* GetOpenExhibit() const;
    const FMuseumExhibit* GetNearbyExhibit() const { return NearbyExhibit; }
    const AMuseumPerformerStation* GetNearbyPerformer() const { return NearbyPerformer; }
    const TSet<FString>& GetViewedExhibits() const { return ViewedExhibits; }
    FString GetNotice() const { return Notice; }

private:
    UPROPERTY() UCameraComponent* Camera;
    UPROPERTY() AMuseumWorld* Museum = nullptr;
    const FMuseumExhibit* NearbyExhibit = nullptr;
    UPROPERTY() TObjectPtr<AMuseumPerformerStation> NearbyPerformer = nullptr;
    FString OpenExhibitId;
    TSet<FString> ViewedExhibits;
    FString Notice;
    float NoticeTime = 0;
    bool bReviewStartApplied = false;
    float ReviewScreenshotDelay = -1.f;
    bool bSprinting = false;
    bool bMovementSmoke = false;
    bool bMovementBaseline = false;
    int32 MovementSmokeStage = -1;
    float MovementSmokeElapsed = 0.f;
    float MovementSmokeSampleTime = 0.f;
    int32 MovementSmokeFrames = 0;
    double MovementSmokeWallStart = 0.0;
    double MovementSmokeTotalWallStart = 0.0;
    float MovementSmokeTotalGameTime = 0.f;
    int32 MovementSmokeTotalFrames = 0;
    float MovementSmokeMeasuredGameTime = 0.f;
    double MovementSmokeMeasuredWallTime = 0.0;
    int32 MovementSmokeMeasuredFrames = 0;
    FVector MovementSmokeStart = FVector::ZeroVector;
    float MovementSmokeWalkCmPerSecond = 0.f;
    float MovementSmokeSprintCmPerSecond = 0.f;
    float MovementSmokeReturnCmPerSecond = 0.f;
    float MovementSmokeDiagonalCmPerSecond = 0.f;
    float MovementSmokeStopDistanceCm = 0.f;
    void SetSprint();
    void ClearSprint();
    void UpdateWalkSpeed();
    void RunMovementSmoke(float DeltaSeconds);
    void MoveForward(float Value);
    void MoveRight(float Value);
    void Interact();
    void TogglePerformance();
    void RestartPerformance();
    void SaveProgress();
    void LoadProgress();
    void ResetToEntrance();
    void QuitGame();
    void ShowNotice(const FString& Message);
};
