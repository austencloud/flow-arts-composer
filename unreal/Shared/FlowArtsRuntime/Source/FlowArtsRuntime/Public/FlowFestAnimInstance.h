#pragma once

#include "CoreMinimal.h"
#include "Animation/AnimInstance.h"
#include "Animation/AnimInstanceProxy.h"
#include "FlowFestActivityPose.h"
#include "FlowFestPropComponent.h"
#include "FlowArtsArmClearance.h"
#include "FlowFestPreparedMotion.h"
#include "FlowFestRuntimePosePolicy.h"
#include "FlowFestLowerBodyLayer.h" // Phrase stage
#include "FlowFestAnimInstance.generated.h"

class UAnimSequence;
class UFlowFestPropComponent;
class FFlowArtsRuntimeMotion;

// Jam polish: opt-in cheaper arm clearance for crowd bodies. Exact is today's path and the default.
// Capsules solves against the estimated body capsules (no skinned certificate, no prepared motion);
// Skip leaves the evaluated pose as authored, for bodies with nothing in their hands.
enum class EFlowFestClearanceBudget : uint8 { Exact, Capsules, Skip };

/** Runtime evaluation of authored, skeleton-matched clips. One clock also drives prop samples. */
UCLASS(Transient)
class FLOWARTSRUNTIME_API UFlowFestAnimInstance : public UAnimInstance
{
    GENERATED_BODY()
public:
    void Configure(const TMap<FName, TObjectPtr<UAnimSequence>>& InMotions, const FString& InCharacterFolder);
    bool SetMotion(FName Name);
    void SetMotionRate(FName Name, float Rate);
    void SetMotionTime(FName Name, float Seconds);
    float GetMotionRate(FName Name) const;
    float GetMotionTime(FName Name) const;
    void StartPerformance(UAnimSequence* Clip, bool bLoop, FName Profile);
    void StartRuntimePerformance(TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Motion,
        EFlowFestRuntimePosePolicy PosePolicy = EFlowFestRuntimePosePolicy::GameClearance);
    float GetPerformanceLength() const;
    TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> GetRuntimeMotion() const { return PerformanceMotion; }
    EFlowFestRuntimePosePolicy GetRuntimePosePolicy() const { return RuntimePosePolicy; }
    // Jam polish
    void SetClearanceBudget(EFlowFestClearanceBudget Budget) { ClearanceBudget = Budget; }
    EFlowFestClearanceBudget GetClearanceBudget() const { return ClearanceBudget; }
    // Phrase stage: opt-in walking legs under the captured routine; see FlowFestLowerBodyLayer.h.
    void SetLowerBodyLayer(const FFlowFestLowerBodyLayer& Layer) { LowerBodyLayer = Layer; } // Phrase stage
    FFlowFestLowerBodyLayerResult GetLowerBodyLayerResult() const; // Phrase stage
    // Phrase stage: start a runtime routine at an exact clock and crossfade into it over
    // BlendSeconds, never resuming a fading copy of the same routine (a rest restarts it).
    void StartPhraseRoutine(TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Motion, float StartSeconds,
        float BlendSeconds); // Phrase stage
    // Phrase stage: the routine's clock this frame, from the stage's score; the blend keeps running.
    void SetPhraseRoutineClock(float Seconds) { PhraseClockSeconds = Seconds; bPhraseClockPending = true; } // Phrase stage
    void SetGripSource(UFlowFestPropComponent* Prop);
    void StopPerformance();
    void SetPerformancePhase(float NormalizedPhase);
    void SetPerformanceRate(float Rate);
    void SetPerformancePaused(bool bPaused);
    bool IsPerformancePaused() const { return bPerformancePaused; }
    void SeekPerformance(float Seconds);
    float GetPerformanceRate() const { return PerformanceRate; }
    void RestartPerformance();
    float GetPerformanceTime() const { return PerformanceTime; }
    FName GetPerformanceProfile() const { return bPerformanceTarget && (PerformanceClip || PerformanceMotion) ? PerformanceProfile : NAME_None; }
    float GetPerformanceWeight() const { return PerformanceWeight; }
    float GetOutgoingPerformanceWeight() const;
    int32 GetOutgoingPerformanceCount() const { return OutgoingPerformanceClips.Num(); }
    bool GetOutgoingPerformanceSample(int32 Index, float& Seconds, float& Weight, FName& Profile) const;
    bool IsPerforming() const { return bPerformanceTarget; }
    float GetMotionWeight(FName Name) const;
    void SetFootCorrection(float LeftCm, float RightCm);
    void SetActivityPose(EFlowFestBodyActivity Activity, float ElapsedSeconds, float ExitSecondsRemaining);
    const FFlowArtsArmClearanceResult& GetArmClearance() const;
    bool WasPreparedSeedApplied() const;
    bool IsGroundedStanceActive() const;
    bool GetCertifiedPropSample(FTransform (&Roots)[2], FQuat (&Visuals)[2]) const;
    bool GetEvaluatedPalmLocalOffsets(FVector (&Offsets)[2]) const;
#if WITH_DEV_AUTOMATION_TESTS
    bool IsPreparedMotionReady() const;
    bool IsPreparedMotionFailed() const;
#endif

protected:
    virtual FAnimInstanceProxy* CreateAnimInstanceProxy() override;
    virtual void DestroyAnimInstanceProxy(FAnimInstanceProxy* InProxy) override;

private:
    friend struct FFlowFestAnimProxy;
#if WITH_DEV_AUTOMATION_TESTS
    friend class FFlowArtsPerformanceTransportTest;
    friend class FFlowArtsRuntimeClearanceReplayTest;
    friend class FFlowFestCapturedPoseTest;
    friend class FFlowFestPreparedBuiltInRequestTest;
#endif
    UPROPERTY(Transient) TArray<TObjectPtr<UAnimSequence>> MotionClips;
    UPROPERTY(Transient) TObjectPtr<UAnimSequence> PerformanceClip;
    FString PerformanceClipContentIdentity;
    TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> PerformanceMotion;
    EFlowFestRuntimePosePolicy RuntimePosePolicy = EFlowFestRuntimePosePolicy::GameClearance;
    EFlowFestClearanceBudget ClearanceBudget = EFlowFestClearanceBudget::Exact; // Jam polish
    FFlowFestLowerBodyLayer LowerBodyLayer; // Phrase stage
    float PhraseBlendSeconds = 0.f; // Phrase stage
    float PhraseClockSeconds = 0.f; // Phrase stage
    bool bPhraseClockPending = false; // Phrase stage
    bool bPhraseFreshClock = false; // Phrase stage
    UPROPERTY(Transient) TObjectPtr<UAnimSequence> IdleGripClip;
    UPROPERTY(Transient) TObjectPtr<UAnimSequence> StanceTurnClips[2];
    FFlowFestStanceTurn StanceTurnMetadata[2];
    FString StanceTurnContent[2];
    FString CharacterFolderPath;
    FName IdleGripFamily = NAME_None;
    TWeakObjectPtr<UFlowFestPropComponent> GripSource;
    FName PerformanceProfile = NAME_None;
    UPROPERTY(Transient) TArray<TObjectPtr<UAnimSequence>> OutgoingPerformanceClips;
    TArray<TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe>> OutgoingPerformanceMotions;
    TArray<float> OutgoingPerformanceTimes;
    TArray<float> OutgoingPerformanceWeights;
    TArray<float> OutgoingPerformanceRates;
    TArray<bool> OutgoingPerformanceLoops;
    TArray<FName> OutgoingPerformanceProfiles;
    TArray<FName> MotionNames;
    TArray<float> MotionTimes;
    TArray<float> MotionRates;
    TArray<float> MotionTargetRates;
    TArray<float> MotionWeights;
    FName TargetMotion = NAME_None;
    float PerformanceTime = 0.f;
    float PerformanceWeight = 0.f;
    float PerformanceRate = 1.f;
    bool bPerformanceTarget = false;
    bool bPerformanceLoop = true;
    bool bPerformancePaused = false;
    float FootCorrectionCm[2] = {0.f, 0.f};
    FFlowFestActivityPoseRequest ActivityPose;
    float ActivityWeight = 0.f;
    uint32 PoseDiscontinuity = 0;
    FFlowArtsArmClearanceRigEnvelope ArmEnvelope;
    void SettlePerformanceBlend();
    void Advance(float DeltaSeconds);
    void UpdateIdleGripClip();
};

/** Exact pre-solve state. No tolerance or hash-only collision verdicts. */
struct FLOWARTSRUNTIME_API FFlowFestClearanceMemoKey
{
    TArray<FTransform> LocalPose;
    TArray<int32> SkeletonIndices;
    TArray<FFlowArtsClearanceCapsule> Props[2];
    FVector ComponentToWorldScale = FVector::OneVector;
    const UObject* Skeleton = nullptr;
    const UObject* Mesh = nullptr;
    const FFlowArtsSkinnedClearanceData* Skin = nullptr;
    uint32 Generation = 0;
    uint8 Flags = 0;
    bool Equals(const FFlowFestClearanceMemoKey& Other) const;
};

/** Immutable game-thread snapshot copied before animation evaluation. */
struct FFlowFestAnimProxy final : FAnimInstanceProxy
{
    FFlowFestAnimProxy() = default;
    explicit FFlowFestAnimProxy(UAnimInstance* Instance) : FAnimInstanceProxy(Instance) {}
    ~FFlowFestAnimProxy() override;
    virtual void Initialize(UAnimInstance* Instance) override;
    virtual void PreUpdate(UAnimInstance* Instance, float DeltaSeconds) override;
    virtual bool Evaluate(FPoseContext& Output) override;
    const FFlowArtsArmClearanceResult& GetArmClearance() const { return ArmClearance; }
    bool WasPreparedSeedApplied() const { return bLastUsedPreparedSeed; }
    bool IsGroundedStanceActive() const { return bStanceActive && bLastUsedPreparedSeed; }
    bool GetCertifiedPropSample(FTransform (&Roots)[2], FQuat (&Visuals)[2]) const;
    bool GetEvaluatedPalmLocalOffsets(FVector (&Offsets)[2]) const;
    FFlowFestLowerBodyLayerResult GetLowerBodyLayerResult() const { return LowerBodyResult; } // Phrase stage
#if WITH_DEV_AUTOMATION_TESTS
    bool IsPreparedMotionReady() const { return PreparedTrack.IsValid() && PreparedTrack->IsReady() &&
        (!PreparedTrack->IsStanceTrack() || (bStanceGroundChecked && !bStanceGroundRejected)); }
    bool IsPreparedMotionFailed() const { return PreparedTrack.IsValid() &&
        (PreparedTrack->IsFailed() || (PreparedTrack->IsStanceTrack() && bStanceGroundRejected)); }
    bool IsStancePrepared() const { return PreparedTrack.IsValid() && PreparedTrack->IsStanceTrack() &&
        PreparedTrack->IsReady() && bStanceGroundChecked && !bStanceGroundRejected; }
    bool IsStancePreparationFailed() const { return PreparedTrack.IsValid() && PreparedTrack->IsStanceTrack() &&
        (PreparedTrack->IsFailed() || bStanceGroundRejected); }
    FString DescribePreparationForTests() const;
    int32 GetNativePreparationCaptureCountForTests() const { return NativePreparationCaptureCountForTests; }
    int32 GetPendingPreparationCaptureCountForTests() const { return PendingPreparedKnotCount; }
    bool ReadCapturedStancePoseForTests(int32 Index, FFlowFestStancePose& OutPose) const
    {
        return PreparedTrack.IsValid() && PreparedTrack->ReadCapturedStancePoseForTests(Index, OutPose);
    }
    void SetPreparationCapturePolicyForTests(int32 Limit, double BudgetSeconds)
    {
        PreparationCaptureLimit = FMath::Clamp(Limit, 1, 2);
        PreparationCaptureBudgetSeconds = FMath::Clamp(BudgetSeconds, .002, 1.);
    }
    void SetPreparationIdentitySaltForTests(const FString& Salt)
    {
        PreparationIdentitySaltForTests = Salt;
    }
    bool FailLegacyPreparationForTests();
#endif
    static bool IsClearanceResponseSettled(const FFlowArtsArmClearanceHistory& Before,
        const FFlowArtsArmClearanceHistory& After, const FVector& ComponentToWorldScale);
    /** Admission bound for an advancing frame. Explicit seeks intentionally bypass it. */
    static bool IsStanceEntryContinuous(const FVector (&PreviousArms)[4],
        const FQuat& PreviousTorso, const FFlowArtsArmClearancePreparedSeed& Next,
        float DeltaSeconds);
    /** Ease additional prepared correction on the existing cyclic performance clock. */
    static double StanceEntryProgress(double CurrentSeconds, double StartSeconds,
        double DurationSeconds);
    static bool IsNeutralStanceEntrySample(const FFlowFestStanceSample& Sample);
    static bool BlendStanceEntrySample(const FFlowFestStanceSample& Target,
        const FTransform (&SourceFeet)[2], double Progress, FFlowFestStanceSample& Out);
    static bool AreStanceFootSurfacesGrounded(const TArray<FVector> (&Surfaces)[2],
        const FVector& GroundOrigin, const FVector& GroundNormal,
        double PenetrationToleranceCm, double ContactToleranceCm, bool bRequireContact);
private:
    TArray<const UAnimSequence*> Clips;
    TArray<TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe>> RuntimeMotions;
    TArray<bool> bMotionSamples;
    TArray<float> Times;
    TArray<float> Weights;
    const UAnimSequence* IdleGripClip = nullptr;
    const UAnimSequence* StanceTurnClips[2] = {nullptr, nullptr};
    FFlowFestStanceTurn StanceTurnMetadata[2];
    FString StanceTurnContent[2];
    float FootCorrectionCm[2] = {0.f, 0.f};
    FFlowFestLowerBodyLayer LowerBodyLayer; // Phrase stage
    const UAnimSequence* LowerBodyClips[2] = {nullptr, nullptr}; // Phrase stage
    const UAnimSequence* LowerBodyReference = nullptr; // Phrase stage
    FFlowFestLowerBodyLayerResult LowerBodyResult; // Phrase stage
    FTransform MeshToWorld = FTransform::Identity;
    FTransform MeshPresentation = FTransform::Identity;
    FVector CapturedWristComponent[2] = {FVector::ZeroVector, FVector::ZeroVector};
    FVector VisibleGripComponent[2] = {FVector::ZeroVector, FVector::ZeroVector};
    FVector PalmLocalOffset[2] = {FVector::ZeroVector, FVector::ZeroVector};
    FFlowFestGripCalibration GripCalibration[2];
    float GripRelaxation = 0.f;
    FVector AuthoredPalmLocal[2] = {FVector::ZeroVector, FVector::ZeroVector};
    float AuthoredGripWeight = 0.f;
    bool bDynamicGrip = false;
    bool bEvaluatedPalmOffsetsValid = false;
    FVector SampledPropRootComponent[2] = {FVector::ZeroVector, FVector::ZeroVector};
    FTransform SampledPropRootAvatar[2];
    FQuat SampledPropVisual[2] = {FQuat::Identity, FQuat::Identity};
    bool bSampledPropRootsValid = false;
    bool bVisibleGripTargetsValid = false;
    bool bVisibleGripTargetSide[2] = {false, false};
    FVector LastCapturedWristComponent[2] = {FVector::ZeroVector, FVector::ZeroVector};
    bool bCapturedWristsValid = false;
    bool bLastCapturedWristsValid = false;
    FFlowFestActivityPoseRequest ActivityPose;
    FFlowArtsArmClearanceHistory ArmClearanceHistory;
    EFlowFestRuntimePosePolicy RuntimePosePolicy = EFlowFestRuntimePosePolicy::GameClearance;
    EFlowFestClearanceBudget ClearanceBudget = EFlowFestClearanceBudget::Exact; // Jam polish
    FFlowArtsArmClearanceResult ArmClearance;
    FFlowArtsArmClearanceRigEnvelope ArmEnvelope;
    struct FPendingPreparedKnot
    {
        TSharedPtr<FFlowFestPreparedMotionEntry, ESPMode::ThreadSafe> Entry;
        TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Motion;
        const UAnimSequence* NativeClip = nullptr;
        TArray<FFlowArtsClearanceCapsule> Props[2];
        FVector SampledRootComponent[2] = {FVector::ZeroVector, FVector::ZeroVector};
        FVector VisibleGripComponent[2] = {FVector::ZeroVector, FVector::ZeroVector};
        FVector PalmLocal[2] = {FVector::ZeroVector, FVector::ZeroVector};
        bool bVisible[2] = {true, true};
        bool bHasPrevious = false;
        bool bMidpoint = false;
        bool bStance = false;
        bool bTurn = false;
        int32 Turn = INDEX_NONE;
        const UAnimSequence* TurnClip = nullptr;
        bool bClaimed = false;
        FFlowArtsArmClearancePreparedSeed Previous;
        double Seconds = 0.0;
        int32 Index = INDEX_NONE;
        bool bValid = false;
        void Release()
        {
            if (bClaimed && Entry.IsValid())
            {
                if (bTurn) Entry->AbandonTurnCapture(Turn, Index, false);
                else if (bStance) Entry->AbandonStanceCapture(Index);
                else Entry->AbandonClaim(Index, bMidpoint);
            }
            bClaimed = false;
        }
        ~FPendingPreparedKnot() { Release(); }
    } PendingPreparedKnots[2];
    int32 PendingPreparedKnotCount = 0;
    void ReleasePendingPreparedKnots();
    uint64 PreparationCaptureCount = 0;
    double PreparationCaptureTotalMs = 0.;
    double PreparationCaptureMaxMs = 0.;
    uint64 PreparationSecondCaptureDeferred = 0;
    int32 PreparationCaptureLimit = 2;
    double PreparationCaptureBudgetSeconds = .002;
    TSharedPtr<FFlowFestPreparedMotionEntry, ESPMode::ThreadSafe> PreparedTrack;
    const FFlowFestPreparedMotionEntry* PreparationTelemetryEntry = nullptr;
    FString PreparationTelemetryStage;
    double PreparationTelemetryLastLogSeconds = 0.;
    void SetPreparedTrack(TSharedPtr<FFlowFestPreparedMotionEntry, ESPMode::ThreadSafe> Next);
    double PreparedPlaybackSeconds = 0.0;
    double PreparedPlaybackDuration = 0.0;
    bool bPreparedPlaybackEligible = false;
    const void* StanceAttemptSource = nullptr;
#if WITH_DEV_AUTOMATION_TESTS
    int32 NativePreparationCaptureCountForTests = 0;
    FString PreparationIdentitySaltForTests;
#endif
    bool bStanceRequested = false;
    bool bStanceActive = false;
    bool bStanceEntryRamping = false;
    double StanceEntryStartSeconds = 0.;
    int32 StanceEntryCaptureAttempts = 0;
    FFlowArtsArmClearancePreparedSeed StanceEntrySourceSeed;
    FTransform StanceEntrySourceFeet[2] = {FTransform::Identity, FTransform::Identity};
    bool bStanceEntryFeetCaptured = false;
    TFunction<bool(const TArray<FTransform>&, TArray<FVector>&, TArray<FVector>&)>
        StanceEntryEvaluateFootSurfaces;
    bool bExplicitStanceSeek = false;
    FTransform StanceStationaryMeshToWorld = FTransform::Identity;
    FVector StanceGroundOrigin = FVector::ZeroVector;
    FVector StanceGroundNormal = FVector::UpVector;
    bool bStanceGroundValid = false;
    bool bStanceMoved = false;
    FFlowFestStancePlan StanceCandidate;
    int32 StanceGroundCheck = 0;
    bool bStanceGroundChecked = false;
    bool bStanceGroundRejected = false;
    FVector LastSolvedArmPosition[4] = {};
    bool bLastSolvedArmsValid = false;
    FQuat LastSolvedTorsoRotation = FQuat::Identity;
    bool bLastSolvedTorsoValid = false;
    bool ValidateStanceGroundPoint(const FTransform& ComponentFoot, const FVector* FootProbesLocal,
        const UWorld* World, const AActor* Owner, double MaxPenetrationCm = -1.) const;
    bool bLastUsedPreparedSeed = false;
    bool bClearanceMemoPreparedSeed = false;
    TArray<FFlowArtsClearanceCapsule> LeftPropCapsules;
    TArray<FFlowArtsClearanceCapsule> RightPropCapsules;
    TArray<FFlowArtsClearanceCapsule> HandLocalPropCapsules[2];
    FVector HandLocalGripOffsets[2] = {FVector::ZeroVector, FVector::ZeroVector};
    uint32 PoseDiscontinuity = 0;
    bool bClearanceMemoValid = false;
    bool bClearanceMemoSettled = false;
    bool bClearancePlaybackPaused = false;
    FFlowFestClearanceMemoKey ClearanceMemoKey;
    TArray<FTransform> ClearanceMemoPose;
    FFlowArtsArmClearanceResult ClearanceMemoResult;
    FFlowArtsArmClearanceHistory ClearanceMemoHistory;
    void CorrectFoot(FPoseContext& Output, FName UpperName, FName KneeName, FName FootName, float CorrectionCm);
    void CorrectHand(FPoseContext& Output, FName UpperName, FName ElbowName, FName HandName,
        const FVector& VisibleGrip, const FVector& PalmLocal);
};
