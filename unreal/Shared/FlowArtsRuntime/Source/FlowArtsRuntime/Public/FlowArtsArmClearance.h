#pragma once

#include "CoreMinimal.h"
#include "FlowArtsSkinnedClearance.h"

struct FPoseContext;
class USkeletalMesh;
struct FFlowArtsSkinnedClearanceData;

/** Component-space capsule measured for the active avatar or prop. */
struct FLOWARTSRUNTIME_API FFlowArtsClearanceCapsule
{
    FVector Start = FVector::ZeroVector;
    FVector End = FVector::ZeroVector;
    float RadiusCm = 0.f;
};

/** Outward unit plane; interior satisfies Dot(Normal, Point) <= OffsetCm. */
struct FLOWARTSRUNTIME_API FFlowArtsClearancePlane
{
    FVector Normal = FVector::ZeroVector;
    float OffsetCm = 0.f;
};

/** Bounded convex body volume, fitted from mesh vertices rather than a circular sweep. */
struct FLOWARTSRUNTIME_API FFlowArtsClearanceHull
{
    TArray<FFlowArtsClearancePlane> Planes;
    /** Cached bounded polytope features; rigidly transformed with the planes. */
    TArray<FVector> Vertices;
    TArray<FVector> EdgeDirections;
};

/** Current post-contact arm. The wrist transform is a hard target. */
struct FLOWARTSRUNTIME_API FFlowArtsClearanceArm
{
    /** Optional shoulder-girdle joint; its pivot and clavicle length stay fixed. */
    FTransform Clavicle = FTransform::Identity;
    bool bHasClavicle = false;
    FTransform Upper = FTransform::Identity;
    FTransform Elbow = FTransform::Identity;
    FTransform Wrist = FTransform::Identity;
    float UpperRadiusCm = 0.f;
    /** Measured exposed upper-arm slice box corners (eight per slice), relative to Upper in rotation-only cm.
     * Three measured slices stay inline through candidate copies; larger inputs retain TArray spill semantics. */
    TArray<FVector, TInlineAllocator<24>> UpperTorsoPoints;
    float ForearmRadiusCm = 0.f;
};

/** Frozen exact contact witnesses for local search; never a clearance verdict. */
using FFlowArtsPreparedContactObjective = TFunction<double(const FFlowArtsClearanceArm*, const FQuat&,
    const TArray<FFlowArtsClearanceCapsule>&, const TArray<FFlowArtsClearanceCapsule>&)>;

/** Numeric search coordinate from another sample of the same imported motion.
 * The source pose, props, and every clearance verdict are rebuilt at use time. */
struct FFlowArtsArmClearancePreparedSeed
{
    FVector AuthoredShoulders[2] = {FVector::ZeroVector, FVector::ZeroVector};
    FVector AuthoredWrists[2] = {FVector::ZeroVector, FVector::ZeroVector};
    FVector SolvedShoulders[2] = {FVector::ZeroVector, FVector::ZeroVector};
    FVector SolvedElbows[2] = {FVector::ZeroVector, FVector::ZeroVector};
    FVector SolvedWrists[2] = {FVector::ZeroVector, FVector::ZeroVector};
    FQuat SolvedUpperRotation[2] = {FQuat::Identity, FQuat::Identity};
    FQuat SolvedForearmRotation[2] = {FQuat::Identity, FQuat::Identity};
    float ClavicleProtractionDeg[2] = {0.f, 0.f};
    float UpperAxialTwistDeg[2] = {0.f, 0.f};
    FQuat TorsoRotation = FQuat::Identity;
    /** Authored-pose added pitch, before any prepared yaw. Only this pitch is compensated at the neck. */
    FQuat AddedTorsoPitch = FQuat::Identity;
    float NeckCounterFraction = 0.f;
    FVector SolvedHeadCenter = FVector::ZeroVector;
    FQuat SolvedHeadRotation = FQuat::Identity;
    FVector SharedPerformanceTranslationCm = FVector::ZeroVector;
    /** Continuous controls, reprojected onto the exact current elbow circle at use time. */
    FVector HandTranslationCm[2] = {FVector::ZeroVector, FVector::ZeroVector};
    FVector ElbowPole[2] = {FVector::ZeroVector, FVector::ZeroVector};
    FQuat UpperFrameOffset[2] = {FQuat::Identity, FQuat::Identity};
    FQuat ForearmFrameOffset[2] = {FQuat::Identity, FQuat::Identity};
    bool bAbsoluteControls = false;
    bool bPreserveWrist = true;
    bool bValid = false;
};

/** Geometry is in mesh component space; props indexed by the hand holding them. */
struct FLOWARTSRUNTIME_API FFlowArtsArmClearanceInput
{
    FFlowArtsClearanceArm Arms[2];
    /** Optional same-motion search coordinate; never a cached clearance verdict. */
    const FFlowArtsArmClearancePreparedSeed* PreparedSeed = nullptr;
    /** Final bool requests an independent arm-pair check only for fresh pair contact. Fresh complete-pose certificate: upper/torso bits 1/2, optional full arm-pair bit 4. */
    TFunction<uint8(const FFlowArtsClearanceArm*, const FQuat&, bool)> CertifySkinnedUpperTorso;
    /** Fresh complete arm surfaces against owner-indexed props. Requested side bits 1/2 return bits 8/16. */
    TFunction<uint8(const FFlowArtsClearanceArm*, const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&, const TArray<FFlowArtsClearanceCapsule>&, uint8)> CertifySkinnedOppositeProps;
    /** Fresh complete torso surface against owner-indexed props. Side requests 1/2 return bits 32/64; never certifies head clearance. */
    TFunction<uint8(const FFlowArtsClearanceArm*, const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&, const TArray<FFlowArtsClearanceCapsule>&, uint8)> CertifySkinnedHeldPropBody;
    /** Fresh forearm envelope versus the posed body, including mixed trunk and lower-body faces.
     * Side bits 1/2 replace only torso hull contacts, never head or legacy body capsules. */
    TFunction<uint8(const FFlowArtsClearanceArm*, const FQuat&)> CertifyForearmBody;
    // Separate exact head/neck certificate, bits 0/1 for left/right forearms.
    TFunction<uint8(const FFlowArtsClearanceArm*, const FQuat&)> CertifyForearmHead;
    /** Uncapped conservative solid separation: bits 1/2 distal arm versus the other full arm, bits 16/32 distal arm versus opposite props. */
    TFunction<uint8(const FFlowArtsClearanceArm*, const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&, const TArray<FFlowArtsClearanceCapsule>&, uint8)> CertifySkinnedSegments;
    /** Candidate-local combined query. Low byte uses the upper/pair/prop bits above;
     * high byte uses segment bits. Shares posed frames and body/arm BVHs within
     * this invocation only; never memoizes certificates across candidates. */
    TFunction<uint16(const FFlowArtsClearanceArm*, const FQuat&, bool,
        const TArray<FFlowArtsClearanceCapsule>&, const TArray<FFlowArtsClearanceCapsule>&,
        uint8, uint8, uint8)> CertifySkinnedCandidate;
    /** Copies current contact witnesses into a self-contained objective; no mutable query history. */
    TFunction<FFlowArtsPreparedContactObjective(const FFlowArtsClearanceArm*, const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&, const TArray<FFlowArtsClearanceCapsule>&)> MakePreparedContactObjective;
    /** Signed depth escape proposal for rigid hand/owned-prop contacts; never a certificate. */
    TFunction<bool(const FFlowArtsClearanceArm*, const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&, const TArray<FFlowArtsClearanceCapsule>&,
        const FVector&, double, double&)> FindPreparedDepthEscape;
    /** Rebinds every exact weighted-skin query to this candidate's neck subtree. */
    TFunction<bool(FFlowArtsArmClearanceInput&, const FTransform&)> RebindPreparedNeck;
#if WITH_DEV_AUTOMATION_TESTS
    FString DecisionEvidencePath;
    /** Diagnostic only: rebind every exact skin query after rotating the neck subtree. */
    TFunction<bool(FFlowArtsArmClearanceInput&, double, FString&)> ProbeNeckCounterRotation;
    /** Opt-in evidence only; exact component-space vertices from this immutable pose. */
    TFunction<void(const FFlowArtsClearanceArm*, const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&, const TArray<FFlowArtsClearanceCapsule>&,
        const FString&)> WriteSkinEvidence;
#endif
    /** Query-local contact distance objective for search only; never grants clearance. */
    TFunction<double(const FFlowArtsClearanceArm*, const FQuat&)> EvaluateSkinnedContacts;
    /** Exact rejected prop/surface contacts evaluated against this candidate's props. Search only. */
    TFunction<double(const FFlowArtsClearanceArm*, const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&, const TArray<FFlowArtsClearanceCapsule>&)> EvaluateSkinnedPropContacts;
    /** Exact contacts from the latest certificate, for bounded refresh decisions only. */
    TFunction<TArray<FFlowArtsContactWitness>()> SnapshotSkinnedContacts;
    /** True only when the callback can certify complete weighted arm-pair surfaces/containment. */
    bool bCanCertifySkinnedArmPair = false;
    /** The same callback may certify an arm pair when closed torso topology is unavailable. */
    bool bCanCertifySkinnedUpperTorso = true;
    TArray<FFlowArtsClearanceCapsule> BodyCapsules;
    /** First two volumes are torso; optional third is the complete head. */
    TArray<FFlowArtsClearanceHull> TorsoHulls;
    TArray<FFlowArtsClearanceCapsule> HeldPropCapsules[2];
    float SurfacePaddingCm = 0.3f;
    /** True when arm/body envelopes came from rig vertices rather than skeletal proportions. */
    bool bMeasuredSurface = false;
    /** Bound imported hard-grip playback to its authored pose and one fresh verdict. */
    bool bSourceFidelityOnly = false;
    /** Original calibrated pattern targets when the body has moved beneath the arms. */
    bool bHasPreparedHandTargets = false;
    FTransform PreparedHandTargets[2] = {FTransform::Identity, FTransform::Identity};
    /** Already applied torso delta for a single bounded-response certificate. */
    FQuat SourceTorsoRotation = FQuat::Identity;
    FQuat SourceHeadRotation = FQuat::Identity;
    FQuat AddedTorsoPitch = FQuat::Identity;
    float NeckCounterFraction = 0.f;
    /** Hard captured/activity grips default to exact wrist preservation. */
    bool bPreserveWrist = true;
    /** Optional common translation of both captured hands and their props. */
    bool bAllowSharedPerformanceTranslation = false;
    float MaxSharedPerformanceTranslationCm = 35.f;
    /** Optional upper-spine response. BodyCapsules must be the lower/upper torso and head. */
    bool bAllowTorsoResponse = false;
    FVector TorsoPivot = FVector::ZeroVector;
    FVector FixedHip = FVector::ZeroVector;
    FVector Neck = FVector::ZeroVector;
    FVector Head = FVector::ZeroVector;
};

/** Immutable geometry and value-owned skin callbacks. Safe to copy to a preparation worker.
 * Capture creates no UObject references and performs no search or surface query. */
struct FLOWARTSRUNTIME_API FFlowArtsArmClearancePreparationSnapshot
{
    FFlowArtsArmClearanceInput Geometry;
    FVector ComponentToWorldScale = FVector::OneVector;
    bool bConstrainPreparedHandTranslation = false;
    FVector PreparedHandTranslationCm[2] = {FVector::ZeroVector, FVector::ZeroVector};
    /** Optional symmetric depth relaxation; zero disables it. Never changes in-plane targets. */
    FVector PreparedPatternNormal = FVector::ZeroVector;
    double MaxPreparedHandDepthCm = 0.;
    /** Common normal translation preserves the complete projected pattern; zero disables it. */
    double MinPreparedCommonDepthCm = 0.;
    /** Whole-track body control, independent of per-knot elbow branch proposals. */
    bool bConstrainPreparedTorsoRotation = false;
    FQuat PreparedTorsoRotation = FQuat::Identity;
    FQuat PreparedAddedTorsoPitch = FQuat::Identity;
    float PreparedNeckCounterFraction = 0.f;
    bool bValid = false;
    /** Rebuild immutable exact queries from the complete realized compact pose, including planted legs. */
#if WITH_DEV_AUTOMATION_TESTS
    FString SkinEvidencePath;
#endif
    TFunction<bool(const TArray<FTransform>&, FFlowArtsArmClearanceInput&)> RebuildSkin;
    /** Original foot-influenced mixed faces skinned from the complete compact pose.
     * Points are component-space vertices, not ankle/toe proxy positions. */
    TFunction<bool(const TArray<FTransform>&, TArray<FVector>&, TArray<FVector>&)> EvaluateFootSurfaces;
    /** Body proxies move rigidly; exact skin uses every realized component bone. Props stay in the pattern frame. */
    bool PlaceBody(const FTransform& BodyDelta, const FFlowArtsClearanceArm* PositionedArms,
        const TArray<FTransform>& PosedComponents, FFlowArtsArmClearancePreparationSnapshot& Out) const;
};

/** Mesh-local surface envelopes sampled once from LOD0 bind vertices and skin weights. */
struct FLOWARTSRUNTIME_API FFlowArtsArmClearanceRigEnvelope
{
    /** Immutable all-influence skin geometry; unavailable data retains conservative proxies. */
    TSharedPtr<const FFlowArtsSkinnedClearanceData, ESPMode::ThreadSafe> SkinnedClearance;
    FString SkinnedClearanceError;
    float UpperRadiusCm[2] = {0.f, 0.f};
    float ForearmRadiusCm[2] = {0.f, 0.f};
    float LowerTorsoRadiusCm = 0.f;
    float UpperTorsoRadiusCm = 0.f;
    float HeadRadiusCm = 0.f;
    /** Hull planes are in the bind hip/neck/lateral frame, in centimetres. */
    FFlowArtsClearanceHull TorsoBands[2];
    /** Mesh-fitted head support planes in rotation-only head-bone centimetres. */
    FFlowArtsClearanceHull HeadHull;
    float BindTrunkLengthCm = 0.f;
    float BindUpperLengthCm[2] = {0.f, 0.f};
    TArray<FVector> UpperTorsoPoints[2];
    int32 SampledVertices[7] = {0, 0, 0, 0, 0, 0, 0};
    bool IsComplete() const;
};

struct FLOWARTSRUNTIME_API FFlowArtsArmClearanceHistory
{
    FVector PreviousElbows[2] = {FVector::ZeroVector, FVector::ZeroVector};
    /** Previous authored positions used only to detect animation discontinuities. */
    FVector PreviousShoulders[2] = {FVector::ZeroVector, FVector::ZeroVector};
    FVector PreviousWrists[2] = {FVector::ZeroVector, FVector::ZeroVector};
    /** Numeric hand correction from the last fully certified pose; recheck on every use. */
    FVector PreviousHandTranslationCm[2] = {FVector::ZeroVector, FVector::ZeroVector};
    /** Bounded temporal contact response, independent of full-pose feasibility. Never a certificate. */
    FVector ContactHandTranslationCm[2] = {FVector::ZeroVector, FVector::ZeroVector};
    /** Activity elbow swivel around the authored shoulder-to-wrist axis. */
    double ContactElbowAngleRadians[2] = {0., 0.};
    /** Bounded rotation vector in the current authored spine frame, radians. */
    FVector ContactTorsoRotationVector = FVector::ZeroVector;
    /** Stable front hand for a continuous authored phase; -1 until established. */
    int8 PreviousHandFrontSide = -1;
    float PreviousClavicleProtractionDeg[2] = {0.f, 0.f};
    float PreviousUpperAxialTwistDeg[2] = {0.f, 0.f};
    /** Orientation seed only; every reused pose is freshly measured/certified. */
    FTransform PreviousAuthoredArmTransforms[2][4];
    FVector PreviousSolvedShoulders[2] = {FVector::ZeroVector, FVector::ZeroVector};
    FQuat PreviousSolvedUpperRotation[2] = {FQuat::Identity, FQuat::Identity};
    FQuat PreviousSolvedForearmRotation[2] = {FQuat::Identity, FQuat::Identity};
    FQuat PreviousTorsoRotation = FQuat::Identity;
    FVector PreviousSharedPerformanceTranslationCm = FVector::ZeroVector;
    float PreviousWristOffsetCm = 0.f;
    float PreviousWristAbductionDeg = 0.f;
    bool bValid = false;
    /** Search parameters from a rejected exact query. Never a collision verdict. */
    FVector RejectedElbows[2] = {FVector::ZeroVector, FVector::ZeroVector};
    FVector RejectedAuthoredShoulders[2] = {FVector::ZeroVector, FVector::ZeroVector};
    FVector RejectedAuthoredWrists[2] = {FVector::ZeroVector, FVector::ZeroVector};
    float RejectedClavicleProtractionDeg[2] = {0.f, 0.f};
    float RejectedUpperAxialTwistDeg[2] = {0.f, 0.f};
    FQuat RejectedTorsoRotation = FQuat::Identity;
    FVector RejectedSharedPerformanceTranslationCm = FVector::ZeroVector;
    bool bRejectedPreserveWrist = true;
    bool bRejectedGuideValid = false;
    void Reset()
    {
        bValid = false;
        bRejectedGuideValid = false;
        PreviousHandTranslationCm[0] = FVector::ZeroVector;
        PreviousHandTranslationCm[1] = FVector::ZeroVector;
        ContactHandTranslationCm[0] = FVector::ZeroVector;
        ContactHandTranslationCm[1] = FVector::ZeroVector;
        ContactElbowAngleRadians[0] = ContactElbowAngleRadians[1] = 0.;
        ContactTorsoRotationVector = FVector::ZeroVector;
        PreviousHandFrontSide = -1;
    }
};

struct FLOWARTSRUNTIME_API FFlowArtsArmClearanceResult
{
    FFlowArtsClearanceArm Arms[2];
    /** Input component-space wrist positions before any soft or common target translation. */
    FVector OriginalWrists[2] = {FVector::ZeroVector, FVector::ZeroVector};
    float WorstPenetrationCm = 0.f;
    float TotalPenetrationCm = 0.f;
    float WorstWristPositionErrorCm = 0.f;
    float WorstWristAngleErrorDeg = 0.f;
    double SolveMicroseconds = 0.0;
    /** Side bits whose conservative upper boxes were replaced by a current skin certificate. */
    uint8 SkinnedUpperTorsoClearMask = 0;
    /** Side bits whose opposite-prop capsule contacts were replaced by a current surface certificate. */
    uint8 SkinnedOppositePropClearMask = 0;
    /** Bits 32/64 certify the current left/right held prop against the complete torso. */
    uint8 SkinnedHeldPropBodyClearMask = 0;
    /** Independent side bits 1/2 for same-pose forearm envelope/body proofs. */
    uint8 ForearmBodyClearMask = 0;
    uint8 ForearmHeadClearMask = 0;
    /** Separate narrow certificates; never substitutes for upper/torso, head, or full arm bits. */
    uint8 SkinnedSegmentClearMask = 0;
    bool bSkinnedArmPairClear = false;
    int32 SkinnedQueryCount = 0;
    /** Exact opposite-prop probes before Solve; separate from the ordinary search budget. */
    int32 HandAvoidanceExactQueries = 0;
    /** Fresh exact queries spent on an optional prepared numeric coordinate. */
    int32 PreparedSeedQueryCount = 0;
    /** Squared exact surface shortfall used only to rank rejected preparation poses. */
    double PreparedContactPenalty = 0.;
    /** Fresh exact queries spent revalidating a previous rejected search coordinate. */
    int32 RejectedGuideQueryCount = 0;
    /** Fresh local history corrections, charged to the existing joint query reserve. */
    int32 WarmRefinementQueryCount = 0;
    /** Fresh soft-wrist witness repairs, included in the ordinary eight-query cap. */
    int32 SoftRefinementQueryCount = 0;
    bool bSkinnedCacheAvailable = false;
    bool bSkinnedCallbackAvailable = false;
    /** OR observations: 1 no callback, 2 other body/prop, 4 arm pair, 8 budget, 16 seed, 32 clear. Bits 2/4 never block partial refinement. */
    uint32 SkinnedSkipReasons = 0;
    float SkinnedBestOtherObstacleCm = TNumericLimits<float>::Max();
    float MaxElbowDisplacementCm = 0.f;
    /** Anatomical forward shoulder-girdle rotation, bounded to forty degrees. */
    float ClavicleProtractionDeg[2] = {0.f, 0.f};
    /** Rotation about solved upper-arm axis; endpoints and wrist frame stay fixed. */
    float UpperAxialTwistDeg[2] = {0.f, 0.f};
    /** Component-space rotation about Input.TorsoPivot; hips and feet stay authored. */
    FQuat TorsoRotation = FQuat::Identity;
    FQuat AddedTorsoPitch = FQuat::Identity;
    float NeckCounterFraction = 0.f;
    /** Common component-space displacement; relative hand paths and orientations stay intact. */
    FVector SharedPerformanceTranslationCm = FVector::ZeroVector;
    /** Additional component-space hand and owned-prop displacement. */
    FVector AppliedHandTranslationCm[2] = {FVector::ZeroVector, FVector::ZeroVector};
    /** Physical per-hand search limit; every applied offset is checked in world centimetres. */
    float HandCorrectionLimitCm = 12.f;
    /** Shared-search diagnostics count complete paired poses, including cheap seeds. */
    bool bSharedTranslationAllowed = false;
    int32 SharedCandidateCount = 0;
    int32 SharedHeadPropRejectedCount = 0;
    int32 SharedReachRejectedCount = 0;
    int32 SharedNoIKCount = 0;
    int32 SharedRankedSeedCount = 0;
    int32 SharedFullSearchCount = 0;
    float BestSharedPenetrationCm = TNumericLimits<float>::Max();
    /** Worst obstacle: 0 body capsule, 1 torso hull, 2 opposite prop, 3 other arm, 4 held prop against trunk, 5 held prop against head. */
    int32 WorstObstacleKind = INDEX_NONE;
    int32 WorstObstacleIndex = INDEX_NONE;
    int32 WorstArm = INDEX_NONE;
    int32 WorstSegment = INDEX_NONE; // 0 upper arm, 1 forearm, 2 held prop
    /** First two volumes are torso; optional third is the complete head. */
    TArray<FFlowArtsClearanceHull> TorsoHulls;
    TArray<FFlowArtsClearanceCapsule> BodyCapsules;
    /** Authored input props before the selected common performance translation. */
    TArray<FFlowArtsClearanceCapsule> OriginalHeldPropCapsules[2];
    bool bFeasible = false;
    bool bMeasuredSurface = false;
    bool bApplied = false;
};

/** Final paired arm pole search and bounded upper-spine response after wrist contact. */
class FLOWARTSRUNTIME_API FFlowArtsArmClearance
{
public:
    /** Game-thread operation at rig change; fails when CPU render/weight data is stripped. */
    static bool MeasureRig(const USkeletalMesh* Mesh,
        FFlowArtsArmClearanceRigEnvelope& OutEnvelope, FString& OutError);

#if WITH_DEV_AUTOMATION_TESTS
    /** Exact cached/uncached face-axis supports across tapered boxes and changing torso geometry. */
    static bool VerifyHullFaceSupportReuse(FString& Error);
    /** Exact cached candidate measurements, including contact identity and joint-ranking overwrite. */
    static bool VerifyCandidateMeasurementReuse(FString& Error);
    /** Exact legacy/cached objective geometry comparison, including prop reset and cache misses. */
    static bool VerifyRigidPropGeometryReuse(FString& Error);
    static bool VerifyRefinementGeometryReuse(FString& Error);
    /** Search guidance retains a slope for exact-certifiable pair and prop proxies. */
    static bool VerifyCertifiableProxyGuide(FString& Error);
    /** Exact full/sparse adapter comparison on the supplied deployed rig and skin cache. */
    static bool VerifySparseWitnessFrames(const USkeletalMesh* Mesh,
        const FFlowArtsSkinnedClearanceData& Skin, FString& Error);
    /** Opt-in, single-pose neck diagnostic; never changes the prepared seed or publication. */
    static bool ProbePreparedNeckCounterRotation(const FFlowArtsArmClearancePreparationSnapshot& Snapshot,
        const FFlowArtsArmClearancePreparedSeed& Seed, double Fraction,
        FFlowArtsArmClearanceResult& OutResult, FString& Error);
#endif

    /** Pure component-space solver, also used by the native geometry tests. */
    static FFlowArtsArmClearanceResult Solve(
        const FFlowArtsArmClearanceInput& Input, FFlowArtsArmClearanceHistory& History);

    /** Integrate bounded contact corrections in elapsed time; a paused pose never advances. */
    static double StepContactElbowCorrection(double Current, double Gradient, float DeltaSeconds);
    static FVector StepContactHandCorrection(const FVector& Current, const FVector& Gradient,
        float DeltaSeconds, const FVector& ComponentToWorldScale, double MaxDistanceCm = 4.);
    static FVector StepContactTorsoCorrection(const FVector& Current, const FVector& Gradient,
        float DeltaSeconds);

    static constexpr int32 PreparationCandidateCount = 128;
    static constexpr double PreparedCommonDepthLimitCm = 25.;
    static constexpr double PreparedDifferentialDepthLimitCm = 8.;
    /** Connected common-normal reach interval containing the seed's current branch. No skin proof is implied. */
    static bool PreparedCommonDepthInterval(const FFlowArtsArmClearancePreparationSnapshot& Snapshot,
        const FFlowArtsArmClearancePreparedSeed& Seed, double& OutMin, double& OutMax);
    static bool CapturePreparationSnapshot(FPoseContext& Output,
        const TArray<FFlowArtsClearanceCapsule>& LeftProp,
        const TArray<FFlowArtsClearanceCapsule>& RightProp,
        const FFlowArtsArmClearanceRigEnvelope& Envelope, FVector ComponentToWorldScale,
        FFlowArtsArmClearancePreparationSnapshot& Out);
    /** One deterministic bounded proposal and a fresh complete certificate; false means invalid geometry. */
    static bool PrepareCandidate(const FFlowArtsArmClearancePreparationSnapshot& Snapshot,
        int32 CandidateIndex, const FFlowArtsArmClearancePreparedSeed* Previous,
        FFlowArtsArmClearancePreparedSeed& OutSeed, FFlowArtsArmClearanceResult& OutResult);
    /** One bounded local step in absolute elbow/clavicle coordinates, followed by a fresh certificate. */
    static bool RefinePreparedCandidate(const FFlowArtsArmClearancePreparationSnapshot& Snapshot,
        const FFlowArtsArmClearancePreparedSeed& Seed,
        FFlowArtsArmClearancePreparedSeed& OutSeed, FFlowArtsArmClearanceResult& OutResult);
    /** Compare two rebuilt controls against the union of their exact contact witnesses. */
    static bool ComparePreparedContactMerit(const FFlowArtsArmClearancePreparationSnapshot& Snapshot,
        const FFlowArtsArmClearancePreparedSeed& Old, const FFlowArtsArmClearancePreparedSeed& Candidate,
        double& OldMerit, double& CandidateMerit);
    static bool InterpolatePreparedSeed(const FFlowArtsArmClearancePreparedSeed& A,
        const FFlowArtsArmClearancePreparedSeed& B, double Alpha,
        FFlowArtsArmClearancePreparedSeed& Out);
    /** Reparameterize the displayed result, including an uncleared fallback. No certificate is inferred. */
    static bool CaptureTransitionSeed(const FFlowArtsArmClearancePreparationSnapshot& Source,
        const FFlowArtsArmClearanceResult& Displayed, FFlowArtsArmClearancePreparedSeed& Out);
    /** Entry-only interpolation of anatomical calibration; every applied pose still requires SolvePose. */
    static bool InterpolateTransitionSeed(const FFlowArtsArmClearancePreparedSeed& A,
        const FFlowArtsArmClearancePreparedSeed& B, double Alpha,
        FFlowArtsArmClearancePreparedSeed& Out);

    /** Adapter for standard Flow Fest bones. Preserves finger locals, hips, legs and wrist orientations; positions are hard by default. */
    static FFlowArtsArmClearanceResult SolvePose(
        FPoseContext& Output, FFlowArtsArmClearanceHistory& History,
        const TArray<FFlowArtsClearanceCapsule>& LeftProp = {},
        const TArray<FFlowArtsClearanceCapsule>& RightProp = {},
        const FFlowArtsArmClearanceRigEnvelope* MeasuredEnvelope = nullptr,
        bool bAllowTorsoResponse = true, bool bPreserveWrist = true,
        bool bAllowSharedPerformanceTranslation = false,
        const FFlowArtsArmClearancePreparedSeed* PreparedSeed = nullptr,
        FVector ComponentToWorldScale = FVector::OneVector,
        FFlowArtsArmClearancePreparationSnapshot* CaptureOnly = nullptr,
        const FTransform* PreparedHandTargets = nullptr);

    /** Conservative convex-plane capsule depth; zero means separated by a fitted plane. */
    /** Complete box/polytope SAT; corners use bitwise edge order. */
    static float BoxHullPenetrationCm(const TArray<FVector>& Box,
        const FFlowArtsClearanceHull& Hull, float PaddingCm = 0.3f);

    static float HullPenetrationCm(const FFlowArtsClearanceCapsule& Arm,
        const FFlowArtsClearanceHull& Hull, float PaddingCm = 0.f);

    static float CapsulePenetrationCm(
        const FFlowArtsClearanceCapsule& A, const FFlowArtsClearanceCapsule& B,
        float PaddingCm = 0.f);
};
