#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "MuseumCharacter.generated.h"

class UCameraComponent;
class AMuseumWorld;
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
    const TSet<FString>& GetViewedExhibits() const { return ViewedExhibits; }
    FString GetNotice() const { return Notice; }

private:
    UPROPERTY() UCameraComponent* Camera;
    UPROPERTY() AMuseumWorld* Museum = nullptr;
    const FMuseumExhibit* NearbyExhibit = nullptr;
    FString OpenExhibitId;
    TSet<FString> ViewedExhibits;
    FString Notice;
    float NoticeTime = 0;
    bool bReviewStartApplied = false;
    float ReviewScreenshotDelay = -1.f;
    void MoveForward(float Value);
    void MoveRight(float Value);
    void Interact();
    void SaveProgress();
    void LoadProgress();
    void ResetToEntrance();
    void QuitGame();
    void ShowNotice(const FString& Message);
};
