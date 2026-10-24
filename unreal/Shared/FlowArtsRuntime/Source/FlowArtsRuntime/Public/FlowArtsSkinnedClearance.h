#pragma once

#include "CoreMinimal.h"

class USkeletalMesh;
struct FFlowArtsClearanceCapsule;

/** Query-local contact from an exact upper-arm/body surface rejection. */
struct FLOWARTSRUNTIME_API FFlowArtsContactWitness
{
    uint8 Side = 0;
    int32 UpperTriangleIndex = INDEX_NONE;
    int32 BodyTriangleIndex = INDEX_NONE;
    bool bClosedBody = false;
    // Search guidance only. Rebuild this oriented plane from the exact candidate body triangle.
    bool bContainment = false;
    double EscapeNormalSign = 1.;
    /** Surface crossing with an exterior direction verified against the closed body. Search only. */
    bool bOrientedSurface = false;
};

/** Query-local exact prop/surface rejection. Kind 0 is a complete arm,
 * 1 the closed body, and 2 an original mixed body boundary face. */
struct FLOWARTSRUNTIME_API FFlowArtsPropContactWitness
{
    uint8 SurfaceKind = 0;
    uint8 SurfaceSide = 0;
    uint8 PropSide = 0;
    int32 TriangleIndex = INDEX_NONE;
    int32 CapsuleIndex = INDEX_NONE;
    bool bContainment = false;
    double EscapeNormalSign = 1.;
};

/** First exact complete-arm pair proximity contact. Search guidance only. */
struct FLOWARTSRUNTIME_API FFlowArtsArmPairContactWitness
{
    int32 LeftTriangleIndex = INDEX_NONE;
    int32 RightTriangleIndex = INDEX_NONE;
};

/** Immutable CPU skin data. Bone indices address the mesh reference skeleton. */
struct FLOWARTSRUNTIME_API FFlowArtsSkinnedClearanceData
{
    struct FInfluence
    {
        int32 Bone = INDEX_NONE;
        FVector BoneLocalPosition = FVector::ZeroVector;
        float Weight = 0.f;
    };
    struct FVertex { int32 FirstInfluence = 0; int32 InfluenceCount = 0; };
    struct FTriangle
    {
        FIntVector Vertices = FIntVector::ZeroValue;
        FVector BindArmFractions = FVector::ZeroVector;
    };
    struct FSurfaceNode
    {
        FBox Bounds = FBox(ForceInit);
        int32 Begin = 0, End = 0, Left = INDEX_NONE, Right = INDEX_NONE;
    };
    struct FSurfaceTopology
    {
        TArray<FSurfaceNode> Nodes;
        TArray<int32> Order;
    };
    TArray<FVertex> Vertices;
    TArray<FInfluence> Influences;
    TArray<FTriangle> UpperTriangles[2];
    TArray<int32> TorsoSupportVertices[8];
    TArray<FName> ReferenceBoneNames;
    TArray<FIntVector> TorsoTriangles;
    TArray<FIntVector> BodyTriangles;
    // Complete original render faces before optional cap closure or torso-core pruning.
    // Open covers may certify only by strict posed projection separation.
    TArray<FIntVector> OpenBodyTriangles;
    TArray<TArray<int32>> OpenBodyComponents;
    TArray<FIntVector> OpenArmTriangles[2];
    TArray<TArray<int32>> OpenArmComponents[2];
    TArray<FIntVector> OpenBodyPropTriangles;
    TArray<TArray<int32>> OpenBodyPropComponents;
    int32 OpenBodyBone = INDEX_NONE;
    bool bOpenBodyCoverComplete = false;
    bool bOpenArmCoverComplete[2] = {false, false};
    bool bOpenBodyPropCoverComplete = false;
    TArray<int32> BodyTriangleComponents;
    TArray<TArray<int32>> BoundaryLoops;
    TArray<int32> BoundaryLoopComponents;
    TArray<FIntVector> BodyCapTriangles;
    TArray<int32> BodyCapComponents;
    int32 BodyComponentCount = 0;
    int32 ReferenceBoneCount = 0;
    // Bind-built partitions are immutable. Queries refit bounds for the exact posed triangles.
    FSurfaceTopology TorsoTopology;
    FSurfaceTopology ClosedBodyTopology;
    TArray<FIntVector> ClosedBodyTriangles;
    TArray<int32> ClosedBodyComponents;
    // Build proves every torso face has an identical, influence-welded closed-body face.
    // Manually assembled caches leave this false and use the original support/torso path.
    bool bTorsoCoveredByClosedBody = false;
    // Closed trunk plus every original face touching a Hip/Spine-dominated vertex.
    // Mixed arm/neck faces remain exact distance constraints, never omitted.
    bool bCanCertifyHeldPropBody = false;
    TArray<FIntVector> BodyPropBoundaryTriangles;
    FSurfaceTopology BodyPropBoundaryTopology;
    // Original mixed faces for each thigh, calf and foot influence region. They
    // survive disconnected clothing seams. Queries use convex separation only;
    // open render surfaces never provide a containment/parity certificate.
    struct FLowerBodyRegion
    {
        int32 Bone = INDEX_NONE;
        TArray<FIntVector> Triangles;
        TArray<int32> Vertices;
    };
    TArray<FLowerBodyRegion> LowerBodyRegions;
    // Complete welded arm surfaces, with bind-valid caps at any simple cut boundary.
    bool bCanCertifyArmPair = false;
    TArray<FIntVector> FullArmTriangles[2];
    // Open hand subsets only select correction witnesses. They never certify an arm pair.
    TArray<FIntVector> HandTriangles[2];
    TArray<int32> HandFullArmTriangleIndices[2];
    FSurfaceTopology HandTopology[2];
    // Original render faces survive failed closure. Every face with any positive
    // descendant weight is included; the query bounds all three of its vertices.
    TArray<FIntVector> UncappedArmTriangles[2];
    TArray<FIntVector> DistalArmTriangles[2];
    // Optional closed copies retain every influence-defined face. Their caps
    // allow exact distance plus containment when convex projection is inconclusive.
    struct FClosedInfluenceRegion
    {
        TArray<FIntVector> Triangles;
        int32 OriginalTriangleCount = 0; // Caps follow every original influenced face.
        bool bClosureValidated = false; // Set only after the bind manifold/cap check.
        TArray<int32> Components;
        TArray<int32> Witnesses;
        FSurfaceTopology Topology;
    };
    FClosedInfluenceRegion ClosedInfluenceArm[2];
    FClosedInfluenceRegion ClosedInfluenceDistal[2];
    FClosedInfluenceRegion ClosedInfluenceHead;
    // Every original face touched by a positive Neck, Head, or descendant
    // weight, including mixed neck/torso and head/arm boundary faces.
    TArray<FIntVector> HeadInfluenceTriangles;
    TArray<int32> UncappedArmVertices[2];
    TArray<int32> DistalArmVertices[2];
    TArray<int32> HeadInfluenceVertices;
    int32 UncappedArmBone[2] = {INDEX_NONE, INDEX_NONE};
    int32 DistalArmBone[2] = {INDEX_NONE, INDEX_NONE};
    int32 HeadInfluenceBone = INDEX_NONE; // Neck axis for projection.
    int32 HeadInfluenceHeadBone = INDEX_NONE;
    bool bHeadInfluenceCoverComplete = false; // Both roots and head-weighted faces proved by Build.
    TArray<int32> FullArmComponents[2];
    TArray<int32> FullArmWitnessTriangles[2];
    FSurfaceTopology FullArmTopology[2];
    int32 FullArmComponentCount[2] = {0,0};
    TArray<int32> ReferencedVertices;
    TArray<int32> ReferencedBones;
    // Upper/body queries do not need complete forearm, hand, or finger surfaces.
    TArray<int32> UpperReferencedVertices;
    TArray<int32> UpperReferencedBones;
};

/** Measurement of an open posed head surface against one unchanged forearm axis.
 * A positive margin is only surface distance; it does not prove solid clearance.
 */
struct FLOWARTSRUNTIME_API FFlowArtsHeadSurfaceDistance
{
    bool bValid = false;
    double AxisDistanceCm = 0.;
    double RadiusPlusPaddingCm = 0.;
    double SignedMarginCm = 0.;
    int32 TriangleIndex = INDEX_NONE;
    FIntVector VertexIndices = FIntVector(INDEX_NONE, INDEX_NONE, INDEX_NONE);
    FVector PosedVertices[3] = {FVector::ZeroVector, FVector::ZeroVector, FVector::ZeroVector};
    FString CornerInfluences[3]; // Bone index and normalized weight for each original corner.
};

/** Diagnostic of posed original arm/head skin. Open-surface proximity is not
 * penetration depth; only bWholeArmProjectionSeparated proves solid clearance.
 */
struct FLOWARTSRUNTIME_API FFlowArtsHeadSkinDistance
{
    bool bValid = false;
    bool bWholeArmProjectionSeparated = false;
    double BestProjectionGapCm = 0.; // Best tested interval gap minus padding.
    bool bDistalSurfaceNear = false; // Original distal/head faces within padding.
    double WitnessSurfaceDistanceCm = 0.;
    int32 DistalTriangleIndex = INDEX_NONE;
    int32 HeadTriangleIndex = INDEX_NONE;
    FIntVector DistalVertexIndices = FIntVector(INDEX_NONE, INDEX_NONE, INDEX_NONE);
    FIntVector HeadVertexIndices = FIntVector(INDEX_NONE, INDEX_NONE, INDEX_NONE);
    FVector DistalPosedVertices[3] = {FVector::ZeroVector, FVector::ZeroVector, FVector::ZeroVector};
    FVector HeadPosedVertices[3] = {FVector::ZeroVector, FVector::ZeroVector, FVector::ZeroVector};
    FString DistalCornerInfluences[3];
    FString HeadCornerInfluences[3];
};

/** Optional explanation for an absent closed arm/head skin bit. No failure
 * reason asserts a collision unless it identifies original-surface proximity.
 */
struct FLOWARTSRUNTIME_API FFlowArtsHeadSkinCertificateDiagnostics
{
    // 0 clear, 1 absent closure, 2 invalid posed/cache data, 3 shared original
    // vertex, 4 surfaces within padding, 5 arm inside head/inconclusive ray,
    // 6 head inside arm/inconclusive ray.
    uint8 Reason[2] = {1, 1};
    int32 ArmOriginalTriangles[2] = {0, 0};
    int32 ArmCapTriangles[2] = {0, 0};
    int32 HeadOriginalTriangles = 0;
    int32 HeadCapTriangles = 0;
    int32 ArmContactTriangle[2] = {INDEX_NONE, INDEX_NONE};
    int32 HeadContactTriangle[2] = {INDEX_NONE, INDEX_NONE};
    bool bArmContactIsCap[2] = {false, false};
    bool bHeadContactIsCap[2] = {false, false};
};

/** Weighted-surface narrow phase for upper-arm / torso and complete arm pairs. */
class FLOWARTSRUNTIME_API FFlowArtsSkinnedClearance
{
public:
    /** Bits 1/2 identify Neck/Head ancestry independently, including rigs
     * where the two roots are not parented to one another. Invalid ancestry
     * returns zero. Also used by Build when collecting original head faces.
     */
    static uint8 HeadOrNeckAncestryMask(TConstArrayView<int32> ParentIndices,
        int32 Bone, int32 NeckBone, int32 HeadBone);

    /** Game thread only. Copies CPU LOD0 data; no render resources survive in the cache. */
    static bool Build(const USkeletalMesh* Mesh, FFlowArtsSkinnedClearanceData& Out, FString& Error);

    /**
     * Transforms must be the complete final paired candidate, including torso and arm overrides.
     * Returns upper/torso bits 1/2, complete arm-pair bit 4, and opposite-prop bits 8/16.
     * RequestedBodyPropSides grants owner-indexed trunk/lower-body prop bits 32/64; never head.
     * Upper bits also require whole-arm separation from posed lower-body covers.
     * Lower-body convex overlap is inconclusive and rejects, even without surface contact.
     * Complete closed-body coverage and every mixed trunk boundary face are required.
     * RequestedPropSides uses bits 1/2; props are indexed by their OWNER hand.
     * Empty/invalid opposite props cannot grant a prop bit. Full closed arms are required.
     * Pair certification is independent of SideMask, but requires bRequestArmPair.
     * An unrequested pair never returns bit 4. Zero is conservative/invalid, not proof of collision.
     * Uses exact weighted surface distance and capped-body ray containment. Built caches
     * with a proved torso subset skip redundant torso support and distance checks;
     * other caches retain the original path. Invalid/nonmanifold topology rejects.
     * Each invocation replaces OutWitnesses with only this query's rejected contacts,
     * including clearing it on invalid/clear queries. Prior entries only order probes.
     * Skipping this function performs no query and leaves the caller's array unchanged.
     */
    static uint8 CertifyUpperTorsoClear(const FFlowArtsSkinnedClearanceData& Data,
        TConstArrayView<FTransform> ReferenceComponentTransforms, float PaddingCm = .3f,
        uint8 SideMask = 3, bool bRequestArmPair = true,
        TArray<FFlowArtsContactWitness>* OutWitnesses = nullptr,
        TConstArrayView<FFlowArtsClearanceCapsule> LeftHeldProps = {},
        TConstArrayView<FFlowArtsClearanceCapsule> RightHeldProps = {}, uint8 RequestedPropSides = 0,
        uint8 RequestedBodyPropSides = 0,
        TArray<FFlowArtsPropContactWitness>* OutPropWitnesses = nullptr,
        FFlowArtsArmPairContactWitness* OutArmPairWitness = nullptr,
        TArray<FFlowArtsArmPairContactWitness>* OutArmPairWitnesses = nullptr);

    /** Sufficient solid separation of uncapped influence-defined regions.
     * Bits 1/2: left/right distal arm versus the whole opposite arm.
     * Bits 16/32: left/right distal arm versus the opposite held props.
     * Overlap, incomplete data and unrequested regions return no bit.
     */
    static uint8 CertifyUncappedSegments(const FFlowArtsSkinnedClearanceData& Data,
        TConstArrayView<FTransform> ReferenceComponentTransforms, float PaddingCm,
        TConstArrayView<FFlowArtsClearanceCapsule> LeftHeldProps,
        TConstArrayView<FFlowArtsClearanceCapsule> RightHeldProps,
        uint8 RequestedMask);

    /** Strict same-pose separation of each unchanged forearm capsule from all
     * original head/neck-influenced faces. Bits 1/2 are left/right. An absent
     * bit is inconclusive, including overlap, touching, and invalid geometry;
     * the caller must retain its existing head collision test.
     */
    static uint8 CertifyForearmHeadClear(const FFlowArtsSkinnedClearanceData& Data,
        TConstArrayView<FTransform> ReferenceComponentTransforms, float PaddingCm,
        const FFlowArtsClearanceCapsule& LeftForearm,
        const FFlowArtsClearanceCapsule& RightForearm, uint8 RequestedMask = 3);

    /** Sufficient same-pose solid separation of the COMPLETE influence-defined
     * arm skin from the complete head/neck skin. Bits 1/2 are left/right.
     * Both closed regions, every posed corner, surface padding and two-way
     * escape-ray containment are required. Missing/inconclusive returns zero.
     * This may waive only the forearm/head proxy; it says nothing about upper/body.
     */
    static uint8 CertifyForearmHeadSkinClear(const FFlowArtsSkinnedClearanceData& Data,
        TConstArrayView<FTransform> ReferenceComponentTransforms, float PaddingCm,
        uint8 RequestedMask = 3,
        FFlowArtsHeadSkinCertificateDiagnostics* OutDiagnostics = nullptr);

    /** Diagnostic only: minimum axis-to-original-head-face distance for each
     * requested forearm. Invalid or incomplete covers leave bValid false.
     * This never grants clearance, including when the signed margin is positive.
     */
    static void MeasureForearmHeadSurface(const FFlowArtsSkinnedClearanceData& Data,
        TConstArrayView<FTransform> ReferenceComponentTransforms, float PaddingCm,
        const FFlowArtsClearanceCapsule& LeftForearm,
        const FFlowArtsClearanceCapsule& RightForearm,
        FFlowArtsHeadSurfaceDistance Out[2], uint8 RequestedMask = 3);

    /** Diagnostic only. Strict full-arm/head projected separation is sufficient;
     * an original distal/head face near-contact is actual surface proximity.
     * Inconclusive open-surface results never change clearance acceptance.
     */
    static void MeasureDistalHeadSkin(const FFlowArtsSkinnedClearanceData& Data,
        TConstArrayView<FTransform> ReferenceComponentTransforms, float PaddingCm,
        FFlowArtsHeadSkinDistance Out[2], uint8 RequestedMask = 3);

    /** Local search objective only; full certification remains the acceptance check. */
    static bool FindHandPropDepthEscape(const FFlowArtsSkinnedClearanceData& Data,
        TConstArrayView<FTransform> ReferenceComponentTransforms,
        TConstArrayView<FFlowArtsClearanceCapsule> LeftHeldProps,
        TConstArrayView<FFlowArtsClearanceCapsule> RightHeldProps,
        const FVector& PatternNormal, double MaxAdditionalDepthCm, double& OutAdditionalDepthCm,
        float PaddingCm = .3f);

    /** Local search objective only; full certification remains the acceptance check. */
    static double EvaluateContactWitnesses(const FFlowArtsSkinnedClearanceData& Data,
        TConstArrayView<FTransform> ReferenceComponentTransforms,
        TConstArrayView<FFlowArtsContactWitness> Witnesses, float PaddingCm = .3f);

    /** Search guidance for an exact rejected arm-pair triangle; never a clearance verdict. */
    static double EvaluateArmPairContactWitness(const FFlowArtsSkinnedClearanceData& Data,
        TConstArrayView<FTransform> ReferenceComponentTransforms,
        const FFlowArtsArmPairContactWitness& Witness, float PaddingCm = .3f);

    /** Search objective only. Props must be the same candidate geometry used by certification. */
    static double EvaluatePropContactWitnesses(const FFlowArtsSkinnedClearanceData& Data,
        TConstArrayView<FTransform> ReferenceComponentTransforms,
        TConstArrayView<FFlowArtsPropContactWitness> Witnesses,
        TConstArrayView<FFlowArtsClearanceCapsule> LeftHeldProps,
        TConstArrayView<FFlowArtsClearanceCapsule> RightHeldProps, float PaddingCm = .3f);
};
