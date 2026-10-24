#pragma once

#include "CoreMinimal.h"
#include "FlowArtsArmClearance.h"

struct FPoseContext;

/** Animation-thread sampled native turn. All transforms use the same mesh component frame. */
struct FFlowFestStanceTurnFrame
{
    double Seconds = 0.;
    FTransform Hips = FTransform::Identity;
    FTransform Feet[2] = {FTransform::Identity, FTransform::Identity};
};

struct FLOWARTSRUNTIME_API FFlowFestStanceTurn
{
    TArray<FFlowFestStanceTurnFrame> Frames;
    double Duration = 0.;
    double HeadingDegrees = 0.;
    /** Measured departure/landing times, not unverified artist contact weights. */
    double SwingStart[2] = {0., 0.};
    double SwingEnd[2] = {0., 0.};
    bool IsValid() const;
    bool Sample(double Seconds, FFlowFestStanceTurnFrame& Out) const;
};

struct FFlowFestStanceSourceFrame
{
    double Seconds = 0.;
    FVector Shoulders[2] = {FVector::ZeroVector, FVector::ZeroVector};
    FVector Hands[2] = {FVector::ZeroVector, FVector::ZeroVector};
};

/** A complete cyclic excursion. No body control is chosen independently at playback frames. */
struct FFlowFestStanceControls
{
    double StartSeconds = 0.;
    double ReturnSeconds = 0.; // unwrapped relative to StartSeconds
    double HeadingDegrees = 0.;
    FVector HipTranslationCm = FVector::ZeroVector;
    double HandDepthCm = 3.;
    double TorsoLeanDegrees = 15.;
};

struct FFlowFestStanceSample
{
    FTransform BodyDelta = FTransform::Identity;
    FVector NeutralBodyOffsetCm = FVector::ZeroVector;
    FTransform Feet[2] = {FTransform::Identity, FTransform::Identity};
    bool bSupport[2] = {true, true};
    double ExcursionWeight = 0.;
};

/** Value-only pose captured once for background planning. */
struct FLOWARTSRUNTIME_API FFlowFestStancePose
{
    TArray<FTransform> Components;
    TArray<int32> Parents;
    int32 Hips = INDEX_NONE;
    int32 Upper[4] = {INDEX_NONE, INDEX_NONE, INDEX_NONE, INDEX_NONE};
    int32 Middle[4] = {INDEX_NONE, INDEX_NONE, INDEX_NONE, INDEX_NONE};
    int32 End[4] = {INDEX_NONE, INDEX_NONE, INDEX_NONE, INDEX_NONE};
    bool IsValid() const;
};

/** Prepared support realization. This is geometry only; it never grants collision clearance. */
class FLOWARTSRUNTIME_API FFlowFestStancePlan
{
public:
    double Duration = 0.;
    FVector HipPivot = FVector::ZeroVector;
    /** Measured sole correction, applied once to the body and separately to foot anchors. */
    FVector NeutralBodyOffsetCm = FVector::ZeroVector;
    FVector PatternNormal = FVector::ForwardVector;
    FTransform InitialFeet[2] = {FTransform::Identity, FTransform::Identity};
    FVector GroundOrigin = FVector::ZeroVector;
    FVector GroundNormal = FVector::UpVector;
    double FootSoleOffsetCm[2] = {0.,0.};
    static constexpr int32 TerrainProbeCount = 5;
    FVector FootTerrainProbesLocal[2][TerrainProbeCount] = {};
    bool bFootTerrainProbesValid = false;
    double GroundPenetrationToleranceCm = .5;
    double GroundContactToleranceCm = 2.;
    double SwingFootLiftCm = 2.;
    bool bGroundValidated = false;
    FFlowFestStanceControls Controls;
    FFlowFestStanceTurn Outward;
    FFlowFestStanceTurn Return;

    /** Atomic support proposal from weighted soles; post-IK surface checks remain authoritative. */
    bool InitializeGroundedSupport(const FFlowFestStancePose& Pose,
        const TArray<FVector> (&FootSurfaces)[2], double MaxAdjustmentCm,
        FString* Error = nullptr);

    /** Finds the shortest circular envelope around bounded crossed intervals for one support excursion. */
    static bool SeedTiming(const TArray<FFlowFestStanceSourceFrame>& Frames, double Duration,
        double OutDuration, double ReturnDuration, FFlowFestStanceControls& Out, FString& Error);
    /** Centers an authored turn on a measured blocking phase; preserves a neutral entry window. */
    bool MakePhaseSchedule(double Phase, bool bReturnAtPhase, bool bSwapTurns,
        const FVector& Lateral, double MinimumNeutral, FFlowFestStancePlan& Out,
        FString* Error = nullptr) const;
    bool IsValid(FString* Error = nullptr) const;
    bool Sample(double Seconds, FFlowFestStanceSample& Out, FString* Error = nullptr) const;
    static bool Capture(const FPoseContext& Input, FFlowFestStancePose& Out);
    /** Pure worker operation; output is assigned only after all four chains validate. */
    static bool Apply(const FFlowFestStancePose& Input, const FFlowFestStanceSample& Sample,
        FFlowFestStancePose& Out, FString* Error = nullptr, bool bSolveArms = true);
    /** Atomic pose operation: failure leaves Output unchanged. Hands/fingers retain their input world frame. */
    static bool Apply(FPoseContext& Output, const FFlowFestStanceSample& Sample, FString* Error = nullptr, bool bSolveArms = true);
};

/** Exact source samples, including interval midpoints, after palm calibration. No UObject references. */
struct FFlowFestStanceKnot
{
    double Seconds = 0.;
    FFlowFestStancePose Pose;
    FFlowArtsArmClearancePreparationSnapshot Clearance;
};

/** Finite whole-cycle coordinate refinement. A single control trajectory owns every output knot. */
class FLOWARTSRUNTIME_API FFlowFestStancePreparation
{
public:
    FFlowFestStancePreparation(FFlowFestStancePlan Prototype,
        TArray<FFlowFestStanceKnot> Knots, int32 SourceFps);
    /** Resumes pure geometry work; a query in progress may finish after the requested slice. */
    void Step(double BudgetSeconds);
    /** Geometry candidate only. Native ground validation must precede cache publication. */
    bool IsCandidateReady() const { return bReady; }
    bool IsReady() const { return bReady; }
    bool IsFailed() const { return bFailed; }
    const FString& GetFailure() const { return Failure; }
    const FFlowFestStancePlan& GetPlan() const { return AcceptedPlan; }
    const TArray<FFlowArtsArmClearancePreparedSeed>& GetSeeds() const { return AcceptedSeeds; }
    int32 GetEvaluatedPlans() const { return Trial; }
    int32 GetBestClearKnots() const { return BestClear; }
    int32 GetCurrentKnot() const { return Knot; }
    int32 GetCurrentArmCandidate() const { return ArmCandidate; }
    const FString& GetFirstRejection() const { return FirstRejection; }
    /** Admission checks actual solved frames, independent of authored elbow branch changes. */
    static bool ContinuousArms(const FFlowArtsArmClearancePreparedSeed& A,
        const FFlowArtsArmClearancePreparedSeed& B, double Seconds);
    static constexpr int32 MaxKnots = 1024;
    static constexpr int32 MaxPlans = 21;
private:
#if WITH_DEV_AUTOMATION_TESTS
    friend class FFlowFestStancePrefixAtomicTest;
#endif
    void PreflightKnot();
    bool BeginKnot();
    bool PlaceKnot(int32 Index, FFlowArtsArmClearancePreparationSnapshot& Out) const;
    void BeginPrefixRepair(const FFlowArtsArmClearancePreparedSeed& Target);
    bool RebasePrefixRepair(const FFlowArtsArmClearancePreparedSeed& CertifiedTarget);
    bool RebaseMidpointRepair(const FFlowArtsArmClearancePreparedSeed& CertifiedTarget);
    void StepPrefixRepair();
    void BeginJointRepair(int32 Midpoint, const FFlowArtsArmClearanceResult& Rejection);
    void StepJointRepair();
    bool BeginFinalRepair(int32 FailedOdd);
    void SelectJointSweepSources();
#if WITH_DEV_AUTOMATION_TESTS
    void StepWholeCycleProbe();
    struct FWholeCycleProbeNode
    {
        FFlowArtsArmClearancePreparedSeed Seed;
        int32 Variant=0;
        uint64 ReachMask=0;
        TArray<int8> Parents;
    };
    TArray<TArray<FWholeCycleProbeNode>> WholeCycleLayers;
    FFlowArtsArmClearancePreparedSeed WholeCycleStartTemplate, WholeCycleEndTemplate;
    FFlowArtsArmClearancePreparationSnapshot WholeCycleOwnSnapshot, WholeCycleMidSnapshot;
    FString WholeCycleEvidence, WholeCycleNodeCsv, WholeCycleEdgeCsv, WholeCycleReachCsv, WholeCycleSummary;
    int32 WholeCycleIndex=0, WholeCycleStage=0, WholeCycleVariant=0;
    int32 WholeCycleFrom=0, WholeCycleTo=0, WholeCycleMidIndex=INDEX_NONE;
    bool bWholeCycleMidValid=false;
    int32 WholeCycleNodeQueries=0, WholeCycleEdgeQueries=0, WholeCyclePrunedEdges=0;
    bool bWholeCycleProbe=false, bWholeCycleProbeDone=false;
#endif
    bool QueryRepairKnot(int32 Index, const FFlowArtsArmClearancePreparedSeed& Proposal,
        FFlowArtsArmClearancePreparedSeed& Checked, FFlowArtsArmClearanceResult& Result) const;
    void RejectPrefixRepair(const FString& Reason);
    void FinishKnot();
    void FinishTrial();
    void CompleteTrial();
    bool ValidateMidpoint(int32 Index);
    FFlowFestStancePlan Prototype, Current, Best, AcceptedPlan;
    TArray<FFlowFestStanceKnot> Knots;
    TArray<FFlowArtsArmClearancePreparedSeed> CurrentSeeds, AcceptedSeeds;
    FFlowArtsArmClearancePreparationSnapshot Placed;
    FFlowArtsArmClearancePreparedSeed CandidateSeed;
    FFlowArtsArmClearancePreparedSeed RefinementSeed;
    FFlowArtsArmClearancePreparedSeed RepairTarget;
    TArray<FFlowArtsArmClearancePreparedSeed> RepairSeeds;
    int32 RepairStart=0, RepairEnd=0, RepairIndex=0, RepairAttempt=0, RepairRefinement=0, RepairRebases=0;
    int32 RepairMidpointRebases=0;
    bool bRepairing=false, bRepairMidpoints=false;
    bool bRepairJoint=false, bRepairJointUsed=false, bRepairJointFinal=false;
    bool bFinalRepairActive=false, bFinalRepairAttempted=false;
    TArray<FFlowArtsArmClearancePreparedSeed> FinalRepairOriginalSeeds;
    TArray<int32> RepairJointSweepSources;
    int32 RepairJointMidpoint=0, RepairJointStep=0, RepairJointBaselineIndex=0;
    int32 RepairJointObservedArm=INDEX_NONE, RepairJointSweepArm=INDEX_NONE;
    TArray<double> RepairJointCosts;
    TArray<bool> RepairJointBuilt;
    int32 RepairJointRampVariant=0, RepairJointRampIndex=0;
    TArray<FFlowArtsArmClearancePreparedSeed> RepairJointOriginalSeeds;
    TArray<FFlowArtsArmClearancePreparedSeed> RepairJointRampSeeds;
    TArray<double> RepairJointRampCosts;
    TArray<bool> RepairJointRampBuilt;
    TArray<FFlowArtsArmClearancePreparedSeed> RepairJointBestSeeds;
    TArray<double> RepairJointBestCosts;
    TArray<bool> RepairJointBestBuilt;
    bool bRepairJointRampComparing=false, bRepairJointWarmStarted=false;
    int32 RepairJointRampCompareIndex=0;
    double RepairJointRampBefore=0., RepairJointRampAfter=0.;
    TArray<FFlowFestStancePose> PosedKnots;
    TArray<FFlowFestStanceSample> Samples;
    int32 Preflight=0, InvalidPoses=0;
    FString FirstRejection, BestRejection;
    FString CandidateRejection;
    bool bPreflighting=true;
    FVector Forward=FVector::ForwardVector, Lateral=FVector::RightVector;
    double BestScore=TNumericLimits<double>::Max(), Score=0., CandidateCost=0.;
    double BlockedPhase=-1.;
    int32 Fps=30, Trial=0, Knot=0, ArmCandidate=0, Clear=0, BestClear=0, Validation=1;
    bool bKnotStarted=false, bCandidateFound=false, bCandidateContinuous=false, bKnotClear=false, bContinuous=true, bReady=false, bFailed=false;
    bool bRepairAttemptedForKnot=false;
    bool bValidating=false, bValidationPassed=false;
    FString Failure;
};
