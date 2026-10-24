#pragma once

#include "CoreMinimal.h"
#include "FlowArtsArmClearance.h"
#include "FlowFestPropComponent.h"
#include "FlowFestStancePlan.h"
#include "Templates/SharedPointer.h"
#include "UObject/ObjectKey.h"

struct FFlowFestPreparedMotionCacheState;
struct FFlowFestPreparedMotionJob;
struct FFlowFestStanceJob;

enum class EFlowFestPreparationStep : uint8 { Continue, Feasible, Failed };

/** Lock-consistent, value-only progress for opt-in game-thread diagnostics. */
struct FLOWARTSRUNTIME_API FFlowFestPreparedMotionProgress
{
    FString Stage;
    int32 CapturedTurns = 0;
    int32 TotalTurns = 0;
    int32 CapturedSource = 0;
    int32 TotalSource = 0;
    int32 AcceptedLegacy = 0;
    int32 TotalLegacy = 0;
    int32 ValidatedLegacy = 0;
    int32 TotalValidation = 0;
    int32 GlobalActive = 0;
    int32 GlobalCaptures = 0;
    int32 GlobalWorkers = 0;
    int32 Consumers = 0;
    uint8 Policy = 0;
    uint8 PlanState = 0;
    bool bReady = false;
    bool bFailed = false;
    bool bCancelled = false;
};

/** Exact inputs shared by performers using the same imported motion and equipment. */
struct FLOWARTSRUNTIME_API FFlowFestPreparedMotionKey
{
    FName Payload = NAME_None;
    FString MotionIdentity;
    FObjectKey MotionClipIncarnation;
    FString PropTrackIdentity;
    FName PropId = NAME_None;
    const void* Mesh = nullptr;
    TSharedPtr<const FFlowArtsSkinnedClearanceData, ESPMode::ThreadSafe> Skin;
    FTransform MeshPresentation = FTransform::Identity;
    FVector WorldScale = FVector::OneVector;
    FVector PalmLocal[2] = {FVector::ZeroVector, FVector::ZeroVector};
    FFlowFestGripCalibration GripCalibration[2];
    TArray<FFlowArtsClearanceCapsule> LocalProps[2];
    const void* TurnClips[2] = {nullptr, nullptr};
    FObjectKey TurnClipIncarnation[2];
    FString TurnContent[2];
    double TurnDuration[2] = {0., 0.};
    double TurnHeading[2] = {0., 0.};
    double SwingStart[2][2] = {{0., 0.}, {0., 0.}};
    double SwingEnd[2][2] = {{0., 0.}, {0., 0.}};
    int32 TurnFrameCount[2] = {0, 0};
    FVector GroundOrigin = FVector::ZeroVector;
    FVector GroundNormal = FVector::UpVector;
    FVector PatternNormal = FVector::ZeroVector;
    double FootSoleOffsetCm[2] = {0., 0.};
    uint8 Policy = 0;

    bool Equals(const FFlowFestPreparedMotionKey& Other) const;
};

/** Phase math is independent of playback, including seek and the loop seam. */
struct FLOWARTSRUNTIME_API FFlowFestPreparedMotionPhase
{
    static bool Bracket(double Seconds, double Duration, int32 Count, bool bLoop,
        int32& A, int32& B, float& Alpha);
    static double KnotSeconds(int32 Index, double Duration, int32 Count, bool bLoop);
    static bool NeutralWindowCovers(double Seconds, double Duration,
        double OutwardStart, double NeutralStart, double RequiredSeconds);
    static bool Continuous(const FFlowArtsArmClearancePreparedSeed& A,
        const FFlowArtsArmClearancePreparedSeed& B, double IntervalSeconds, int32 Fps);
};

class FLOWARTSRUNTIME_API FFlowFestPreparedMotionEntry :
    public TSharedFromThis<FFlowFestPreparedMotionEntry, ESPMode::ThreadSafe>
{
public:
    bool ClaimNext(int32& Index, double& Seconds,
        FFlowArtsArmClearancePreparedSeed& Previous, bool& bHasPrevious);
    bool ClaimValidation(int32& Index, double& Seconds, double& IntervalSeconds,
        FFlowArtsArmClearancePreparedSeed& A, FFlowArtsArmClearancePreparedSeed& B);
    void Submit(int32 Index,
        TFunction<EFlowFestPreparationStep(FFlowArtsArmClearancePreparedSeed&)>&& PrepareStep);
    void SubmitValidation(int32 Index,
        TFunction<bool()>&& Validate);
    void Fail(int32 Index);
    void FailValidation(int32 Index);
    void AbandonClaim(int32 Index, bool bValidation);
    bool ClaimStanceCapture(int32& Index, double& Seconds);
    void CompleteStanceCapture(int32 Index, FFlowFestStanceKnot&& Knot);
    void FailStanceCapture(int32 Index);
    void AbandonStanceCapture(int32 Index);
    bool ClaimTurnCapture(int32& Turn, int32& Index, double& Seconds);
    void CompleteTurnCapture(int32 Turn, int32 Index, const FFlowFestStanceTurnFrame& Frame);
    void AbandonTurnCapture(int32 Turn, int32 Index, bool bFailed);
    bool ClaimStancePlan(TArray<FFlowFestStanceKnot>& OutKnots,
        FFlowFestStanceTurn (&OutTurns)[2]);
    void SubmitStancePlan(FFlowFestStancePlan&& Prototype,
        TArray<FFlowFestStanceKnot>&& Knots, int32 SourceFps);
    void FailStancePlan();
    bool ReadStanceCandidate(FFlowFestStancePlan& OutPlan) const;
    bool PublishStanceCandidate(bool bNativeSupportValid);
    bool ReadStanceSample(double Seconds, FFlowFestStanceSample& Sample,
        FFlowArtsArmClearancePreparedSeed& A,
        FFlowArtsArmClearancePreparedSeed& B, float& Alpha) const;
    bool CanBeginStanceEntry(double Seconds, double RampSeconds) const;
    bool ReadPair(double Seconds, FFlowArtsArmClearancePreparedSeed& A,
        FFlowArtsArmClearancePreparedSeed& B, float& Alpha) const;
    bool IsFailed() const;
    bool IsReady() const;
    void AddConsumer();
    void RemoveConsumer();
    // PreUpdate retries a parked worker when another track had occupied both slots.
    void ResumePendingPreparation();
    bool IsCancelled() const;
    FFlowFestPreparedMotionProgress ReadProgress() const;
#if WITH_DEV_AUTOMATION_TESTS
    FString DescribeForTests() const;
    void MarkFailedForTests();
    bool ReadCapturedTurnFrameForTests(int32 Turn, int32 Index,
        FFlowFestStanceTurnFrame& OutFrame) const;
    bool ReadCapturedStancePoseForTests(int32 Index, FFlowFestStancePose& OutPose) const;
#endif
    bool CoversEverySourceFrame() const { return bFullFrameCoverage; }
    bool IsStanceTrack() const { return Key.Policy == 2; }
    bool Matches(const FFlowFestPreparedMotionKey& OtherKey, int32 Count, double OtherDuration,
        bool bOtherLoop, bool bOtherFullFrameCoverage) const;

    FFlowFestPreparedMotionEntry(TWeakPtr<FFlowFestPreparedMotionCacheState, ESPMode::ThreadSafe> InState,
        FFlowFestPreparedMotionKey InKey, int32 InCount, double InDuration, bool bInLoop,
        bool bInFullFrameCoverage);

private:
    friend class FFlowFestPreparedMotionCache;
    friend struct FFlowFestPreparedMotionJob;
    friend struct FFlowFestStanceJob;
    void Complete(int32 Index, bool bSuccess, FFlowArtsArmClearancePreparedSeed&& Seed);
    void CompleteValidation(int32 Index, bool bSuccess);
    void CompleteStancePlan(bool bSuccess, FFlowFestStancePlan&& Plan,
        TArray<FFlowArtsArmClearancePreparedSeed>&& AcceptedSeeds);
    bool ParkLegacyJob(const TSharedRef<FFlowFestPreparedMotionJob, ESPMode::ThreadSafe>& Job);
    bool ParkStanceJob(const TSharedRef<FFlowFestStanceJob, ESPMode::ThreadSafe>& Job);
    bool CanEvictLocked() const;

    TWeakPtr<FFlowFestPreparedMotionCacheState, ESPMode::ThreadSafe> State;
    FFlowFestPreparedMotionKey Key;
    TArray<FFlowArtsArmClearancePreparedSeed> Seeds;
    TArray<uint8> KnotStates; // 0 untouched, 1 claimed, 2 accepted
    TArray<uint8> IntervalStates; // 0 untouched, 1 claimed, 2 certified midpoint
    TArray<uint8> KnotSubmitted; // claimed capture transferred to a worker
    TArray<uint8> IntervalSubmitted;
    TArray<FFlowFestStanceKnot> StanceKnots;
    TArray<uint8> StanceCaptureStates; // 0 untouched, 1 claimed, 2 copied
    FFlowFestStanceTurn CapturedTurns[2];
    TArray<uint8> TurnCaptureStates[2];
    FFlowFestStancePlan StancePlan;
    int32 CapturedStanceKnots = 0;
    uint8 StancePlanState = 0; // 0 waiting, 1 worker, 2 geometry candidate, 3 native published, 4 failed
    double Duration = 0.0;
    int32 Accepted = 0;
    int32 ValidatedIntervals = 0;
    bool bLoop = false;
    bool bFullFrameCoverage = false;
    bool bFailed = false;
    bool bCancelled = false;
    int32 Consumers = 0;
    TSharedPtr<FFlowFestPreparedMotionJob, ESPMode::ThreadSafe> PausedLegacyJob;
    TSharedPtr<FFlowFestStanceJob, ESPMode::ThreadSafe> PausedStanceJob;
};

/** Sixty-four retained tracks; at most two capture claims or workers combined. */
class FLOWARTSRUNTIME_API FFlowFestPreparedMotionCache
{
public:
    FFlowFestPreparedMotionCache();
    static FFlowFestPreparedMotionCache& Get();
    TSharedPtr<FFlowFestPreparedMotionEntry, ESPMode::ThreadSafe> Acquire(
        const FFlowFestPreparedMotionKey& Key, int32 Count, double Duration, bool bLoop,
        bool bFullFrameCoverage);
    // Covers the 480 source-rate frames in a bundled 16-second performance.
    static constexpr int32 MaxKnots = 512;
    static constexpr int32 MaxEntries = 64;
#if WITH_DEV_AUTOMATION_TESTS
    int32 GetOutstandingForTests() const;
    int32 GetCaptureOutstandingForTests() const;
#endif

private:
    TSharedRef<FFlowFestPreparedMotionCacheState, ESPMode::ThreadSafe> State;
};
