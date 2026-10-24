#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Components/ActorComponent.h"
#include "FlowFestActivityPose.h"
#include "FlowFestJam.h"
#include "FlowFestJamSlice.generated.h"

class ACameraActor;
class AFlowFestCharacter;
class AFlowFestWorld;
class UCanvasPanelSlot;
class UFlowFestJamComponent;
class UImage;
class UTextBlock;
class UTexture2D;

/** The slice's one overlay: the dusk loading screen, the title card and the quiet verb hint. */
UCLASS()
class FLOWFEST_API UFlowFestJamOverlay : public UUserWidget
{
    GENERATED_BODY()
public:
    void SetLoading(float Opacity, float Progress);
    void SetTitle(float Opacity);
    void SetHint(const FText& Text, float Opacity);

protected:
    virtual TSharedRef<SWidget> RebuildWidget() override;

private:
    UPROPERTY(Transient) TObjectPtr<UImage> Dusk;
    UPROPERTY(Transient) TObjectPtr<UTextBlock> Title;
    UPROPERTY(Transient) TObjectPtr<UTextBlock> Subtitle;
    UPROPERTY(Transient) TObjectPtr<UImage> Track;
    UPROPERTY(Transient) TObjectPtr<UImage> Fill;
    UPROPERTY(Transient) TObjectPtr<UTextBlock> Hint;
    UPROPERTY(Transient) TObjectPtr<UTexture2D> Gradient;
    float LoadingOpacity = 1.f;
    float TitleOpacity = 0.f;
    void ApplyOpacity();
};

/**
 * The -Jam slice, "Dusk at Middle Earth": a loading screen that holds until the jam is ready to
 * be seen, the opening shot from the layout's keys with the title card, a third-person handover
 * at the funnel, and a night that builds over about four minutes. The player's verbs (linger,
 * sit, join, flow) live here; notice and duet are the jam component's answers to flowing.
 * -Jam -Watch keeps the camera: the opening, then a slow orbit of the circle, recorded when
 * -FlowFestJamRecord=<dir> is given. The normal game never creates this component.
 */
UCLASS()
class FLOWFEST_API UFlowFestJamSlice : public UActorComponent
{
    GENERATED_BODY()
public:
    UFlowFestJamSlice();
    virtual void BeginPlay() override;
    virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

    /** E: sit at the rope's edge, or stand up. */
    void Interact();
    /** The player's sit, applied in the character's pose sync. True while the prop is put away. */
    bool OverridePose(EFlowFestBodyActivity& Activity, float& Elapsed, float& ExitRemaining) const;

private:
    enum class EStage : uint8 { Waiting, Loading, Opening, Play, Watch };
    EStage Stage = EStage::Waiting;

    UPROPERTY(Transient) TObjectPtr<AFlowFestCharacter> Character;
    UPROPERTY(Transient) TObjectPtr<AFlowFestWorld> World;
    UPROPERTY(Transient) TObjectPtr<UFlowFestJamComponent> Jam;
    UPROPERTY(Transient) TObjectPtr<ACameraActor> Camera;
    UPROPERTY(Transient) TObjectPtr<UFlowFestJamOverlay> Overlay;
    UPROPERTY(Transient) TObjectPtr<UInputComponent> AnyKeyInput;
    FlowFestJam::FLayout Layout;

    bool bWatch = false;
    bool bExitWhenDone = false;
    FString RecordDir;
    float RecordSeconds = 40.f;
    int32 RecordedFrames = 0;
    bool bLoadingShot = false;
    float NightSeconds = 240.f;
    float ExitAfter = -1.f;

    double LoadStarted = 0.0;
    double LoadingLoggedAt = 0.0;
    int32 ReadyFrames = 0;
    float Progress = 0.f;
    float StageSeconds = 0.f;
    float SinceReveal = 0.f;
    float NightStartClock = 18.f, FullNightClock = 19.f;
    float NightProgress = 0.f;
    bool bTitleSkipped = false;
    float TitleSkippedAt = 0.f;
    bool bOpeningSkipped = false;
    float OrbitAngle = 0.f, OrbitRadius = 15.f;

    // Player verbs.
    float DefaultArm = 420.f, DefaultFov = 90.f;
    FVector DefaultSocket = FVector::ZeroVector;
    float LingerSeconds = 0.f, LingerBlend = 0.f;
    bool bSeated = false;
    float SitElapsed = 0.f, StandRemaining = -1.f;
    bool bWasInside = false, bLit = false, bUsedSit = false, bUsedFlow = false;
    float HintOpacity = 0.f;

    // stat unit, averaged over a few seconds.
    double StatGame = 0.0, StatDraw = 0.0, StatGpu = 0.0, StatFrame = 0.0;
    int32 StatFrames = 0;
    double StatSince = 0.0;

    struct FReadinessReport
    {
        UFlowFestJamComponent::FReadiness Counts;
        bool bPeople = false;
        float Fraction = 0.f;
        static FReadinessReport Of(const UFlowFestJamComponent& Jam);
    };
    void Begin();
    void TickLoading(float DeltaTime);
    void Reveal(bool bTimedOut);
    void TickOpening(float DeltaTime);
    void Handover();
    void TickPlay(float DeltaTime);
    void TickWatch(float DeltaTime);
    void TickNight(float DeltaTime);
    void PlaceCamera(const FVector& Eye, const FVector& Look);
    FVector ClearOfPeople(const FVector& Eye) const;
    void OnAnyKey(FKey Key);
    void Record();
    void LogStats(float DeltaTime);
    static float ResolutionPercent();
    /** Every body but the player's updates at a rate set by its size on screen, interpolated between. */
    void BudgetBodies();
    double BudgetedAt = -10.0;
    int32 BudgetedBodies = 0;
    /** Every quarter second: which bodies solve arm clearance exactly, against capsules, or not at all. */
    void BudgetClearance();
    double ClearanceBudgetedAt = -10.0;
    TArray<TWeakObjectPtr<USkeletalMeshComponent>> Budgeted;
    TMap<TWeakObjectPtr<USkeletalMeshComponent>, double> ExactSince;
    int32 ExactBodies = 0, SkippedBodies = 0, ExactSwitches = 0;
    /** -FlowFestJamExactBodies=<n>: spinners nearest the camera kept on the exact solve, besides the duet partner. */
    int32 ExactLimit = 1;
    /** -FlowFestJamLevers=<mask>: the frame-rate levers, all on by default; clear a bit to measure without it. */
    enum : uint32 { LeverClearance = 1, LeverShadows = 2, LeverFire = 4, LeverScalability = 8 };
    uint32 Levers = ~0u;
    float FireDistanceCm = 1800.f;
    /** -FlowFestJamShots=<seconds>: in watch, that long after the reveal, a set of review stills. */
    void TickShots(float DeltaTime);
    float ShotsAt = -1.f, ShotHeld = 0.f;
    int32 ShotIndex = 0;
    FString ShotDir;
    FString StageName() const;
};
