#if WITH_DEV_AUTOMATION_TESTS
#include "FlowArtsArmClearance.h"
#include "FlowArtsSkinnedClearance.h"

#include "Engine/SkeletalMesh.h"
#include "Dom/JsonObject.h"
#include "Misc/AutomationTest.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "UObject/UObjectGlobals.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsHullClipCoefficientReuseTest,
    "FlowArts.Runtime.ArmClearance.HullClipCoefficientReuse",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsHullClipCoefficientReuseTest::RunTest(const FString& Parameters)
{
    // The uncached production algorithm is the compatibility oracle: rounding
    // near a plane can affect candidate ordering as well as feasibility.
    const auto Reference = [](const FFlowArtsClearanceCapsule& Arm,
        const FFlowArtsClearanceHull& Hull, float PaddingCm)
    {
        if (Hull.Planes.IsEmpty() || Arm.RadiusCm <= 0.f) return 0.f;
        const FVector Axis = Arm.End - Arm.Start;
        float LowerDepth = 0.f;
        float UpperDepth = Arm.RadiusCm + PaddingCm;
        for (const auto& Plane : Hull.Planes)
            UpperDepth = FMath::Max(UpperDepth, static_cast<float>(Arm.RadiusCm + PaddingCm
                - FMath::Min(FVector::DotProduct(Plane.Normal, Arm.Start), FVector::DotProduct(Plane.Normal, Arm.End)) + Plane.OffsetCm));
        const auto IntersectsAtDepth = [&](float Depth)
        {
            float Low = 0.f, High = 1.f;
            for (const auto& Plane : Hull.Planes)
            {
                const float A = FVector::DotProduct(Plane.Normal, Arm.Start) - Plane.OffsetCm;
                const float B = FVector::DotProduct(Plane.Normal, Axis);
                const float Limit = Arm.RadiusCm + PaddingCm - Depth;
                if (FMath::Abs(B) < SMALL_NUMBER) { if (A > Limit) return false; }
                else if (B > 0.f) High = FMath::Min(High, (Limit - A) / B);
                else Low = FMath::Max(Low, (Limit - A) / B);
                if (Low > High) return false;
            }
            return true;
        };
        if (!IntersectsAtDepth(0.f)) return 0.f;
        for (int32 Iteration = 0; Iteration < 16; ++Iteration)
        {
            const float Mid = (LowerDepth + UpperDepth) * 0.5f;
            if (IntersectsAtDepth(Mid)) LowerDepth = Mid; else UpperDepth = Mid;
        }
        return LowerDepth;
    };
    FRandomStream Random(0x435049);
    int32 Compared = 0;
    for (int32 Shape = 0; Shape < 5; ++Shape)
    {
        FFlowArtsClearanceHull Hull;
        const FQuat Rotation = Shape == 0 ? FQuat::Identity
            : FRotator(17.f * Shape, 31.f * Shape, -11.f * Shape).Quaternion();
        const FVector Center(13.125 * Shape, -7.0625 * Shape, 114.45663452148438);
        const FVector Extent(Shape == 1 ? .0001 : 12.37, 7.125, 19.331);
        const FVector Axes[] = {FVector::ForwardVector, FVector::RightVector, FVector::UpVector};
        // The final hull also exercises the non-inline plane storage path.
        for (int32 Repeat = 0; Repeat < (Shape == 4 ? 7 : 1); ++Repeat)
            for (int32 AxisIndex = 0; AxisIndex < 3; ++AxisIndex)
                for (int32 Sign : {-1, 1})
                {
                    const FVector Normal = Rotation.RotateVector(Axes[AxisIndex] * Sign);
                    Hull.Planes.Add({Normal, static_cast<float>(FVector::DotProduct(Normal, Center) + Extent[AxisIndex])});
                }
        for (int32 Sample = 0; Sample < 768; ++Sample)
        {
            const float Padding = Sample % 3 == 0 ? 0.f : Sample % 3 == 1 ? .3f : 1.125f;
            const auto RandomPoint = [&]()
            { return Center + Rotation.RotateVector(FVector(Random.FRandRange(-40.f, 40.f),
                Random.FRandRange(-40.f, 40.f), Random.FRandRange(-40.f, 40.f))); };
            FFlowArtsClearanceCapsule Capsule{RandomPoint(), RandomPoint(), Random.FRandRange(.01f, 10.f)};
            if (Sample < 64)
            {
                // Tangencies, tiny signed offsets, parallel and zero-length
                // segments, and the SMALL_NUMBER clipping branch boundary.
                const double Offset = (Sample % 5 - 2) * 1.e-7;
                const FVector Local(Extent.X + Capsule.RadiusCm + Padding + Offset, -5, 0);
                Capsule.Start = Center + Rotation.RotateVector(Local);
                Capsule.End = Capsule.Start + Rotation.RotateVector(FVector(
                    Sample % 2 ? 0. : SMALL_NUMBER * .5, Sample % 3 ? 10. : 0., 0.));
            }
            if (Sample == 64) Capsule.RadiusCm = 0.f;
            const float Expected = Reference(Capsule, Hull, Padding);
            const float Actual = FFlowArtsArmClearance::HullPenetrationCm(Capsule, Hull, Padding);
            if (FMemory::Memcmp(&Expected, &Actual, sizeof(float)) != 0)
            {
                AddError(FString::Printf(TEXT("Hull clip changed bits at shape %d sample %d: %.9g vs %.9g"),
                    Shape, Sample, Expected, Actual));
                return false;
            }
            ++Compared;
        }
    }
    TestEqual(TEXT("All deterministic random and boundary depths preserve exact float bits"), Compared, 3840);
    TestEqual(TEXT("Empty hull remains clear"), FFlowArtsArmClearance::HullPenetrationCm(
        {{0, 0, 0}, {1, 1, 1}, 1.f}, FFlowArtsClearanceHull{}, .3f), 0.f);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsHullFaceSupportReuseTest,
    "FlowArts.Runtime.ArmClearance.HullFaceSupportReuse",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsHullFaceSupportReuseTest::RunTest(const FString& Parameters)
{
    FString Error;
    const bool bEquivalent = FFlowArtsArmClearance::VerifyHullFaceSupportReuse(Error);
    return TestTrue(*FString::Printf(TEXT("Face support cache exactly preserves full SAT and ranking: %s"), *Error), bEquivalent);
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsCandidateMeasurementReuseTest,
    "FlowArts.Runtime.ArmClearance.CandidateMeasurementReuse",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsCandidateMeasurementReuseTest::RunTest(const FString& Parameters)
{
    FString Error;
    const bool bEquivalent = FFlowArtsArmClearance::VerifyCandidateMeasurementReuse(Error);
    return TestTrue(*FString::Printf(TEXT("Cached candidate measurements preserve exact ranking: %s"), *Error), bEquivalent);
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsRigidPropGeometryReuseTest,
    "FlowArts.Runtime.ArmClearance.RigidPropGeometryReuse",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsRigidPropGeometryReuseTest::RunTest(const FString& Parameters)
{
    FString Error;
    const bool bEquivalent = FFlowArtsArmClearance::VerifyRigidPropGeometryReuse(Error);
    return TestTrue(*FString::Printf(TEXT("Rigid prop cache preserves bits, contact and independent invalidation: %s"), *Error), bEquivalent);
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsRefinementGeometryReuseTest,
    "FlowArts.Runtime.ArmClearance.RefinementGeometryReuse",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsRefinementGeometryReuseTest::RunTest(const FString& Parameters)
{
    FString Error;
    const bool bEquivalent = FFlowArtsArmClearance::VerifyRefinementGeometryReuse(Error);
    return TestTrue(*FString::Printf(TEXT("Cached refinement geometry exactly matches legacy trials: %s"), *Error),
        bEquivalent);
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsCertifiableProxyGuideTest,
    "FlowArts.Runtime.ArmClearance.CertifiableProxyGuide",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsCertifiableProxyGuideTest::RunTest(const FString& Parameters)
{
    FString Error;
    const bool bValid = FFlowArtsArmClearance::VerifyCertifiableProxyGuide(Error);
    return TestTrue(*FString::Printf(TEXT("Local guidance retains only supported pair and prop proxy gradients: %s"), *Error),
        bValid);
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsArmCapsuleMetricTest,
    "FlowArts.Runtime.ArmClearance.CapsuleMetric",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsArmCapsuleMetricTest::RunTest(const FString& Parameters)
{
    const FFlowArtsClearanceCapsule A{{-10.f, 0.f, 0.f}, {10.f, 0.f, 0.f}, 2.f};
    const FFlowArtsClearanceCapsule Cross{{0.f, -10.f, 0.f}, {0.f, 10.f, 0.f}, 3.f};
    const FFlowArtsClearanceCapsule Far{{0.f, 10.f, 10.f}, {0.f, 20.f, 10.f}, 3.f};
    const FFlowArtsClearanceCapsule Ends{{11.f, 0.f, 0.f}, {20.f, 0.f, 0.f}, 2.f};
    TestEqual(TEXT("Crossing capsule overlap includes both radii"),
        FFlowArtsArmClearance::CapsulePenetrationCm(A, Cross), 5.f);
    TestEqual(TEXT("Distant capsules do not overlap"),
        FFlowArtsArmClearance::CapsulePenetrationCm(A, Far), 0.f);
    TestEqual(TEXT("Finite segment ends are measured"),
        FFlowArtsArmClearance::CapsulePenetrationCm(A, Ends), 3.f);
    return true;
}

namespace
{
FFlowArtsClearanceArm Arm(const FVector& Shoulder, const FVector& Elbow, const FVector& Wrist)
{
    FFlowArtsClearanceArm Result;
    Result.Upper.SetLocation(Shoulder);
    Result.Elbow.SetLocation(Elbow);
    Result.Wrist.SetLocation(Wrist);
    Result.UpperRadiusCm = 1.5f;
    Result.ForearmRadiusCm = 1.3f;
    return Result;
}
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsHeldPropTrunkTest,
    "FlowArts.Runtime.ArmClearance.HeldPropTrunkGuard",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsHeldPropTrunkTest::RunTest(const FString& Parameters)
{
    FFlowArtsArmClearanceInput Input;
    Input.Arms[0] = Arm({-50, 50, 20}, {-50, 55, 10}, {-50, 50, 0});
    Input.Arms[1] = Arm({50, 50, 20}, {50, 55, 10}, {50, 50, 0});
    Input.bMeasuredSurface = true;
    Input.bCanCertifySkinnedArmPair = true;
    Input.CertifySkinnedUpperTorso = [](const FFlowArtsClearanceArm*, const FQuat&, bool) -> uint8 { return 7; };
    for (int32 Band = 0; Band < 3; ++Band)
    {
        const float Height = Band * 6.f;
        FFlowArtsClearanceHull Hull;
        Hull.Planes = {{{1, 0, 0}, 2}, {{-1, 0, 0}, 2},
            {{0, 1, 0}, 2}, {{0, -1, 0}, 2},
            {{0, 0, 1}, Height + 2}, {{0, 0, -1}, 2 - Height}};
        Input.TorsoHulls.Add(Hull);
    }
    FFlowArtsArmClearanceHistory History;
    for (int32 Band = 0; Band < 3; ++Band)
    {
        const float Height = Band * 6.f;
        Input.HeldPropCapsules[0] = {{{-10, 0, Height}, {10, 0, Height}, 1.f}};
        const auto Embedded = FFlowArtsArmClearance::Solve(Input, History);
        TestFalse(TEXT("Full arm skin certificate cannot waive a staff through the trunk or head"), Embedded.bFeasible);
        TestTrue(TEXT("Embedded shaft retains measured penetration"), Embedded.WorstPenetrationCm > 1.f);
        TestEqual(TEXT("Diagnostic identifies held prop against body"), Embedded.WorstObstacleKind, Band == 2 ? 5 : 4);
        TestEqual(TEXT("Diagnostic identifies the affected trunk band"), Embedded.WorstObstacleIndex, Band);
        TestEqual(TEXT("Diagnostic distinguishes the rigid prop from an arm segment"), Embedded.WorstSegment, 2);
        Input.HeldPropCapsules[0] = {{{-10, -40, Height}, {10, -40, Height}, 1.f}};
        const auto Clear = FFlowArtsArmClearance::Solve(Input, History);
        TestTrue(TEXT("Changed prop geometry is remeasured and permits an outside shaft"), Clear.bFeasible);
        TestTrue(TEXT("Prop guard preserves authored wrists"), Clear.WorstWristPositionErrorCm < 0.01f);
    }
    // Rigs without fitted hulls still protect their legacy trunk capsules.
    Input.TorsoHulls.Reset();
    Input.BodyCapsules.Add({{0, 0, -2}, {0, 0, 2}, 2.f});
    Input.HeldPropCapsules[0] = {{{-10, 0, 0}, {10, 0, 0}, 1.f}};
    const auto Legacy = FFlowArtsArmClearance::Solve(Input, History);
    TestFalse(TEXT("Legacy torso capsules also reject an embedded shaft"), Legacy.bFeasible);
    TestEqual(TEXT("Legacy shaft guard retains its distinct diagnostic"), Legacy.WorstObstacleKind, 4);
    Input.BodyCapsules = {{{0, 0, -30}, {0, 0, -25}, 2.f},
        {{0, 0, -20}, {0, 0, -15}, 2.f}, {{0, 0, -2}, {0, 0, 2}, 2.f}};
    const auto Head = FFlowArtsArmClearance::Solve(Input, History);
    TestFalse(TEXT("Authored head penetration is not a permitted baseline"), Head.bFeasible);
    TestEqual(TEXT("Legacy head contact has an absolute head diagnostic"), Head.WorstObstacleKind, 5);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsArmPoleSearchTest,
    "FlowArts.Runtime.ArmClearance.PairedPoleSearch",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsArmPoleSearchTest::RunTest(const FString& Parameters)
{
    FFlowArtsArmClearanceInput Input;
    Input.Arms[0] = Arm({-25.f, 0.f, 0.f}, {-15.f, 0.f, 12.f}, {-8.f, 0.f, 0.f});
    Input.Arms[1] = Arm({25.f, 0.f, 0.f}, {33.f, 0.f, 12.f}, {42.f, 0.f, 0.f});
    Input.BodyCapsules.Add({{-15.f, 0.f, 12.f}, {-15.f, 0.f, 12.f}, 3.f});
    Input.bMeasuredSurface = true;
    const float Before = FFlowArtsArmClearance::CapsulePenetrationCm(
        {Input.Arms[0].Elbow.GetLocation(), Input.Arms[0].Wrist.GetLocation(), Input.Arms[0].ForearmRadiusCm},
        Input.BodyCapsules[0], Input.SurfacePaddingCm);

    FFlowArtsArmClearanceHistory History;
    const FFlowArtsArmClearanceResult Result = FFlowArtsArmClearance::Solve(Input, History);
    TestTrue(TEXT("Authored arm begins in collision"), Before > 1.f);
    TestTrue(TEXT("Pole search reduces penetration"), Result.WorstPenetrationCm < Before);
    TestTrue(TEXT("Wrist contact remains exact"), Result.WorstWristPositionErrorCm < 0.1f);
    TestTrue(TEXT("Wrist rotation remains exact"), Result.WorstWristAngleErrorDeg < 0.01f);
    TestTrue(TEXT("Solver retains measured surface provenance"), Result.bMeasuredSurface);

    FFlowArtsArmClearanceInput Next = Input;
    Next.Arms[0] = Result.Arms[0];
    Next.Arms[1] = Result.Arms[1];
    const FFlowArtsArmClearanceResult Continuous = FFlowArtsArmClearance::Solve(Next, History);
    TestTrue(TEXT("Stable frame keeps elbow position"), Continuous.MaxElbowDisplacementCm < 0.1f);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsArmSoftIdleWristTest,
    "FlowArts.Runtime.ArmClearance.BoundedSoftIdleWrist",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsArmSoftIdleWristTest::RunTest(const FString& Parameters)
{
    FFlowArtsArmClearanceInput Input;
    Input.Arms[0] = Arm({-20.f, 0.f, 0.f}, {-10.f, 0.f, 12.f}, {0.f, 0.f, 0.f});
    Input.Arms[1] = Arm({20.f, 0.f, 0.f}, {10.f, 0.f, 12.f}, {0.f, 0.f, 0.f});
    Input.BodyCapsules.Add({{0.f, 0.f, 0.f}, {0.f, 0.f, 0.f}, 5.f});
    FFlowArtsArmClearanceHistory HardHistory, SoftHistory;
    const auto Hard = FFlowArtsArmClearance::Solve(Input, HardHistory);
    Input.bPreserveWrist = false;
    const auto Soft = FFlowArtsArmClearance::Solve(Input, SoftHistory);
    TestFalse(TEXT("Captured wrist remains pinned even when embedded"), Hard.bFeasible);
    TestTrue(TEXT("Socket-attached idle hands can leave the body"), Soft.bFeasible);
    TestTrue(TEXT("Idle hand response stays inside eighteen centimetres"),
        Soft.WorstWristPositionErrorCm > .01f && Soft.WorstWristPositionErrorCm <= 18.001f);
    TestTrue(TEXT("Idle hand orientation stays authored"), Soft.WorstWristAngleErrorDeg < .001f);
    for (int32 Side = 0; Side < 2; ++Side)
    {
        const auto& Before = Input.Arms[Side];
        const auto& After = Soft.Arms[Side];
        TestTrue(TEXT("Upper-arm length stays authored"), FMath::IsNearlyEqual(
            FVector::Dist(Before.Upper.GetLocation(), Before.Elbow.GetLocation()),
            FVector::Dist(After.Upper.GetLocation(), After.Elbow.GetLocation()), .01f));
        TestTrue(TEXT("Forearm length stays authored"), FMath::IsNearlyEqual(
            FVector::Dist(Before.Elbow.GetLocation(), Before.Wrist.GetLocation()),
            FVector::Dist(After.Elbow.GetLocation(), After.Wrist.GetLocation()), .01f));
    }
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsSoftWitnessTest,
    "FlowArts.Runtime.ArmClearance.SoftWitnessRefinement",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsSoftWitnessTest::RunTest(const FString& Parameters)
{
    FFlowArtsArmClearanceInput Input;
    Input.Arms[0] = Arm({-20, 0, 20}, {-23, 8, 10}, {-20, 0, 0});
    Input.Arms[1] = Arm({20, 0, 20}, {23, 8, 10}, {20, 0, 0});
    Input.bMeasuredSurface = true;
    Input.bPreserveWrist = false;
    Input.bAllowTorsoResponse = false;
    double TargetOffset = 1.0;
    double AcceptanceTolerance = .05;
    int32 Certificates = 0;
    Input.CertifySkinnedUpperTorso = [&](const FFlowArtsClearanceArm* Arms, const FQuat&, bool) -> uint8
    {
        ++Certificates;
        const double Offset = Input.Arms[0].Wrist.GetLocation().X - Arms[0].Wrist.GetLocation().X;
        return FMath::Abs(Offset - TargetOffset) < AcceptanceTolerance ? 3 : 0;
    };
    Input.EvaluateSkinnedContacts = [&](const FFlowArtsClearanceArm* Arms, const FQuat&) -> double
    {
        const double Offset = Input.Arms[0].Wrist.GetLocation().X - Arms[0].Wrist.GetLocation().X;
        return FMath::Square(Offset - TargetOffset);
    };
    FFlowArtsArmClearanceHistory History;
    const auto First = FFlowArtsArmClearance::Solve(Input, History);
    TestTrue(TEXT("Ordinary attached hands use a fresh local witness repair"),
        First.bFeasible && First.SoftRefinementQueryCount > 0 && First.SoftRefinementQueryCount <= 2);
    TestTrue(TEXT("Local repair precedes blind pole search within eight fresh queries"),
        First.SkinnedQueryCount <= 3 && Certificates == First.SkinnedQueryCount);
    for (int32 Side = 0; Side < 2; ++Side)
    {
        TestTrue(TEXT("Soft repair preserves upper length"), FMath::IsNearlyEqual(
            FVector::Dist(First.Arms[Side].Upper.GetLocation(), First.Arms[Side].Elbow.GetLocation()),
            FVector::Dist(Input.Arms[Side].Upper.GetLocation(), Input.Arms[Side].Elbow.GetLocation()), .001f));
        TestTrue(TEXT("Soft repair preserves forearm length and wrist orientation"), FMath::IsNearlyEqual(
            FVector::Dist(First.Arms[Side].Elbow.GetLocation(), First.Arms[Side].Wrist.GetLocation()),
            FVector::Dist(Input.Arms[Side].Elbow.GetLocation(), Input.Arms[Side].Wrist.GetLocation()), .001f)
            && First.Arms[Side].Wrist.GetRotation().Equals(Input.Arms[Side].Wrist.GetRotation(), .00001f));
    }
    // A valid interval narrower than the old centimetre lattice must be reached
    // through finer guidance, with a fresh exact verdict and no extra queries.
    TargetOffset = 1.34375;
    AcceptanceTolerance = .002;
    Certificates = 0;
    FFlowArtsArmClearanceHistory FineHistory;
    const auto Fine = FFlowArtsArmClearance::Solve(Input, FineHistory);
    const double FineOffset = Input.Arms[0].Wrist.GetLocation().X - Fine.Arms[0].Wrist.GetLocation().X;
    TestTrue(TEXT("Fine soft repair reaches a submillimetre valid interval"),
        Fine.bFeasible && FMath::Abs(FineOffset - TargetOffset) < AcceptanceTolerance);
    TestTrue(TEXT("Fine soft repair retains fresh certification and existing query limits"),
        Fine.SoftRefinementQueryCount > 0 && Fine.SoftRefinementQueryCount <= 2 &&
        Fine.SkinnedQueryCount <= 8 && Certificates == Fine.SkinnedQueryCount);
    // Clearing one active contact can expose a distant genuine contact on the
    // next exact query. Stopping after two refreshes abandons useful progress.
    FFlowArtsArmClearanceInput Sequential = Input;
    int32 ContactRegion = 0;
    int32 SequentialCertificates = 0;
    bool bSequentialClear = false;
    Sequential.SnapshotSkinnedContacts = [&]()
    {
        TArray<FFlowArtsContactWitness> Contacts;
        if (!bSequentialClear) Contacts.Add({0, ContactRegion * 100, 7, true});
        return Contacts;
    };
    Sequential.EvaluateSkinnedContacts = [&](const FFlowArtsClearanceArm* Arms, const FQuat&) -> double
    {
        const double Offset = Sequential.Arms[0].Wrist.GetLocation().X - Arms[0].Wrist.GetLocation().X;
        return FMath::Square(Offset - (ContactRegion + 1.));
    };
    Sequential.CertifySkinnedUpperTorso = [&](const FFlowArtsClearanceArm* Arms, const FQuat&, bool) -> uint8
    {
        ++SequentialCertificates;
        const double Offset = Sequential.Arms[0].Wrist.GetLocation().X - Arms[0].Wrist.GetLocation().X;
        if (FMath::Abs(Offset - (ContactRegion + 1.)) < .01)
        {
            if (ContactRegion < 3) ++ContactRegion;
            else bSequentialClear = true;
        }
        return bSequentialClear ? 3 : 0;
    };
    FFlowArtsArmClearanceHistory SequentialHistory;
    const auto SequentialResult = FFlowArtsArmClearance::Solve(Sequential, SequentialHistory);
    TestTrue(TEXT("Fresh distant contacts can continue a progressing soft repair"),
        SequentialResult.bFeasible && bSequentialClear && SequentialResult.SoftRefinementQueryCount > 2);
    TestTrue(TEXT("Successive contact repair retains the existing exact query budget"),
        SequentialResult.SkinnedQueryCount <= 8 && SequentialCertificates == SequentialResult.SkinnedQueryCount);
    AcceptanceTolerance = .05;
    for (auto& A : Input.Arms) A.Wrist.AddToTranslation(FVector(0, .05f, 0));
    TargetOffset = 2.0;
    Certificates = 0;
    const auto Moving = FFlowArtsArmClearance::Solve(Input, History);
    TestTrue(TEXT("Changed source refreshes history contacts before cold search"),
        Moving.bFeasible && Moving.SoftRefinementQueryCount > 0 && Moving.SoftRefinementQueryCount <= 2
        && Moving.SkinnedQueryCount <= 8 && Certificates == Moving.SkinnedQueryCount);
    Input.HeldPropCapsules[1].Add({Input.Arms[0].Wrist.GetLocation(), Input.Arms[0].Wrist.GetLocation(), 100.f});
    const auto Blocked = FFlowArtsArmClearance::Solve(Input, History);
    TestFalse(TEXT("Changed attached prop cannot reuse the earlier skin verdict"), Blocked.bFeasible);
    TestTrue(TEXT("Blocked local repair retains the eight-query cap"), Blocked.SkinnedQueryCount <= 8
        && Blocked.SoftRefinementQueryCount <= 2);
    Input.HeldPropCapsules[1].Reset();
    Input.bPreserveWrist = true;
    const auto Contact = FFlowArtsArmClearance::Solve(Input, History);
    TestTrue(TEXT("Fixed contact activities cannot enter soft wrist refinement"),
        Contact.SoftRefinementQueryCount == 0 && Contact.WorstWristPositionErrorCm < .001f);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsArmStraightIdleTest,
    "FlowArts.Runtime.ArmClearance.StraightIdleAbduction",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsArmStraightIdleTest::RunTest(const FString& Parameters)
{
    // Translating these nearly extended wrists sideways consumes reach before
    // their exposed upper arms clear the trunk. Angular targets retain reach.
    FFlowArtsArmClearanceInput Input;
    Input.Arms[0] = Arm({-15, 0, 145}, {-17, 0, 117}, {-21, 0, 89});
    Input.Arms[1] = Arm({15, 0, 145}, {17, 0, 117}, {21, 0, 89});
    for (auto& A : Input.Arms) { A.UpperRadiusCm = 6.5f; A.ForearmRadiusCm = 6.f; }
    Input.BodyCapsules.Add({{0, 0, 125}, {0, 0, 145}, 12.f});
    FFlowArtsArmClearanceHistory HardHistory, SoftHistory;
    const auto Hard = FFlowArtsArmClearance::Solve(Input, HardHistory);
    TestFalse(TEXT("Fixed hanging grips cannot open the straight upper arms"), Hard.bFeasible);
    Input.bPreserveWrist = false;
    const auto Soft = FFlowArtsArmClearance::Solve(Input, SoftHistory);
    TestTrue(TEXT("Bounded shoulder abduction clears the complete trunk proxy"), Soft.bFeasible);
    TestTrue(TEXT("Straight hanging arms require the angular fallback"), SoftHistory.PreviousWristAbductionDeg > 0.f);
    for (int32 Side = 0; Side < 2; ++Side)
    {
        const auto& Before = Input.Arms[Side];
        const auto& After = Soft.Arms[Side];
        const float UpperLength = FVector::Dist(Before.Upper.GetLocation(), Before.Elbow.GetLocation());
        const float ForeLength = FVector::Dist(Before.Elbow.GetLocation(), Before.Wrist.GetLocation());
        TestTrue(TEXT("Angular response preserves both limb lengths"),
            FMath::IsNearlyEqual(UpperLength, FVector::Dist(After.Upper.GetLocation(), After.Elbow.GetLocation()), .01f)
            && FMath::IsNearlyEqual(ForeLength, FVector::Dist(After.Elbow.GetLocation(), After.Wrist.GetLocation()), .01f));
        TestTrue(TEXT("Angular response stays within the proportional hand bound"),
            FVector::Dist(Before.Wrist.GetLocation(), After.Wrist.GetLocation()) <= .7f * (UpperLength + ForeLength) + .001f);
        const FVector AuthoredReach = (Before.Wrist.GetLocation() - Before.Upper.GetLocation()).GetSafeNormal();
        const FVector SolvedReach = (After.Wrist.GetLocation() - After.Upper.GetLocation()).GetSafeNormal();
        TestTrue(TEXT("Angular and azimuth repair cannot expand the shoulder opening bound"),
            FVector::DotProduct(AuthoredReach, SolvedReach) >= FMath::Cos(FMath::DegreesToRadians(40.f)) - .00001f);
        TestTrue(TEXT("Angular and azimuth repair keep the authored wrist orientation"),
            After.Wrist.GetRotation().Equals(Before.Wrist.GetRotation(), .00001f));
    }
    TestTrue(TEXT("Hand orientation remains authored"), Soft.WorstWristAngleErrorDeg < .001f);
    const auto Reused = FFlowArtsArmClearance::Solve(Input, SoftHistory);
    TestTrue(TEXT("Angular target can be revalidated on the next frame"), Reused.bFeasible);
    Input.bPreserveWrist = true;
    const auto Pinned = FFlowArtsArmClearance::Solve(Input, SoftHistory);
    TestTrue(TEXT("Hard grip cancels historical angular targets"), Pinned.WorstWristPositionErrorCm < .001f
        && SoftHistory.PreviousWristAbductionDeg == 0.f);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsArmHistoryObstacleChangeTest,
    "FlowArts.Runtime.ArmClearance.HistoryRechecksChangedObstacles",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsArmHistoryObstacleChangeTest::RunTest(const FString& Parameters)
{
    FFlowArtsArmClearanceInput Input;
    Input.Arms[0] = Arm({-20.f, 0.f, 0.f}, {-10.f, 0.f, 12.f}, {0.f, 0.f, 0.f});
    Input.Arms[1] = Arm({20.f, 0.f, 0.f}, {10.f, 0.f, 12.f}, {0.f, 0.f, 0.f});
    Input.BodyCapsules.Add({{0.f, 0.f, 0.f}, {0.f, 0.f, 0.f}, 5.f});
    Input.bPreserveWrist = false;
    FFlowArtsArmClearanceHistory History;
    const auto First = FFlowArtsArmClearance::Solve(Input, History);
    TestTrue(TEXT("Initial socket pose obtains a clear solution"), First.bFeasible);
    const auto Stable = FFlowArtsArmClearance::Solve(Input, History);
    TestTrue(TEXT("Revalidated stationary solution remains clear"), Stable.bFeasible);
    const FVector OldWrist = Stable.Arms[0].Wrist.GetLocation();
    const FFlowArtsClearanceCapsule NewObstacle{OldWrist, OldWrist, 4.f};
    Input.BodyCapsules.Add(NewObstacle);
    const auto Changed = FFlowArtsArmClearance::Solve(Input, History);
    const auto& ArmAfter = Changed.Arms[0];
    const float ActualNewDepth = FFlowArtsArmClearance::CapsulePenetrationCm(
        {ArmAfter.Elbow.GetLocation(), ArmAfter.Wrist.GetLocation(), ArmAfter.ForearmRadiusCm},
        NewObstacle, Input.SurfacePaddingCm);
    TestTrue(TEXT("Changed obstacle is included in the reported result"),
        Changed.WorstPenetrationCm + .0001f >= ActualNewDepth);
    TestTrue(TEXT("A stale clear result cannot hide a newly embedded wrist"),
        !Changed.bFeasible || FVector::Dist(OldWrist, ArmAfter.Wrist.GetLocation()) > .1f);
    Input.bPreserveWrist = true;
    const auto Hard = FFlowArtsArmClearance::Solve(Input, History);
    TestTrue(TEXT("Changing to hard grip policy cancels historical soft targets"),
        Hard.WorstWristPositionErrorCm < .001f && History.PreviousWristOffsetCm == 0.f);

    FFlowArtsArmClearanceInput Clear;
    Clear.Arms[0] = Arm({-25.f, 0.f, 0.f}, {-30.f, 0.f, -12.f}, {-25.f, 0.f, -24.f});
    Clear.Arms[1] = Arm({25.f, 0.f, 0.f}, {30.f, 0.f, -12.f}, {25.f, 0.f, -24.f});
    FFlowArtsArmClearanceHistory ClearHistory;
    const auto Authored = FFlowArtsArmClearance::Solve(Clear, ClearHistory);
    TestTrue(TEXT("Already-clear authored pose is retained exactly"),
        Authored.bFeasible && !Authored.bApplied && Authored.MaxElbowDisplacementCm == 0.f);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsArmInfeasibleGripTest,
    "FlowArts.Runtime.ArmClearance.InfeasibleGrip",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsArmInfeasibleGripTest::RunTest(const FString& Parameters)
{
    FFlowArtsArmClearanceInput Input;
    Input.Arms[0] = Arm({-20.f, 0.f, 0.f}, {-10.f, 0.f, 12.f}, {0.f, 0.f, 0.f});
    Input.Arms[1] = Arm({20.f, 0.f, 0.f}, {10.f, 0.f, 12.f}, {0.f, 0.f, 0.f});
    Input.BodyCapsules.Add({{0.f, 0.f, 0.f}, {0.f, 0.f, 0.f}, 5.f});
    FFlowArtsArmClearanceHistory History;
    const FFlowArtsArmClearanceResult Result = FFlowArtsArmClearance::Solve(Input, History);
    TestFalse(TEXT("A wrist embedded in the body is reported infeasible"), Result.bFeasible);
    TestTrue(TEXT("Residual depth is reported"), Result.WorstPenetrationCm > 1.f);
    TestTrue(TEXT("Solver does not retract either grip"), Result.WorstWristPositionErrorCm < 0.1f);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsArmTorsoResponseTest,
    "FlowArts.Runtime.ArmClearance.BoundedTorsoResponse",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsArmTorsoResponseTest::RunTest(const FString& Parameters)
{
    FFlowArtsArmClearanceInput Input;
    Input.Arms[0] = Arm({-15.f, 0.f, 45.f}, {-22.f, -10.f, 42.f}, {-4.5f, 0.f, 40.f});
    Input.Arms[1] = Arm({15.f, 0.f, 45.f}, {22.f, -10.f, 42.f}, {4.5f, 0.f, 40.f});
    Input.FixedHip = Input.TorsoPivot = FVector::ZeroVector;
    Input.Neck = FVector(0.f, 0.f, 50.f);
    Input.Head = FVector(0.f, 0.f, 65.f);
    Input.BodyCapsules.Add({{0.f, 0.f, 14.f}, {0.f, 0.f, 29.5f}, 4.f});
    Input.BodyCapsules.Add({{0.f, 0.f, 29.5f}, {0.f, 0.f, 44.5f}, 4.f});
    Input.BodyCapsules.Add({Input.Neck, Input.Head, 3.f});
    Input.bMeasuredSurface = true;
    FFlowArtsArmClearanceHistory PoleHistory;
    const FFlowArtsArmClearanceResult Poles = FFlowArtsArmClearance::Solve(Input, PoleHistory);
    TestFalse(TEXT("Fixed shoulders cannot clear the embedded wrists"), Poles.bFeasible);

    Input.bAllowTorsoResponse = true;
    FFlowArtsArmClearanceHistory History;
    const FFlowArtsArmClearanceResult Result = FFlowArtsArmClearance::Solve(Input, History);
    TestTrue(TEXT("Bounded torso rotation clears the embedded wrist targets"), Result.bFeasible);
    const float Degrees = FMath::RadiansToDegrees(Result.TorsoRotation.AngularDistance(FQuat::Identity));
    TestTrue(TEXT("Response actually uses a spine rotation bounded to sixteen degrees"), Degrees > 0.1f && Degrees <= 16.01f);
    TestTrue(TEXT("Torso response preserves both wrist positions"), Result.WorstWristPositionErrorCm < 0.1f);
    TestTrue(TEXT("Torso response preserves both wrist rotations"), Result.WorstWristAngleErrorDeg < 0.01f);
    for (int32 Side = 0; Side < 2; ++Side)
    {
        const FFlowArtsClearanceArm& Before = Input.Arms[Side];
        const FFlowArtsClearanceArm& After = Result.Arms[Side];
        TestTrue(TEXT("Upper arm length remains authored"), FMath::IsNearlyEqual(
            FVector::Dist(Before.Upper.GetLocation(), Before.Elbow.GetLocation()),
            FVector::Dist(After.Upper.GetLocation(), After.Elbow.GetLocation()), 0.01f));
        TestTrue(TEXT("Forearm length remains authored"), FMath::IsNearlyEqual(
            FVector::Dist(Before.Elbow.GetLocation(), Before.Wrist.GetLocation()),
            FVector::Dist(After.Elbow.GetLocation(), After.Wrist.GetLocation()), 0.01f));
    }

    // The same bounds must report impossibility rather than detach grips or
    // grow the arms when the enclosing surface cannot move far enough away.
    Input.BodyCapsules[0].RadiusCm = Input.BodyCapsules[1].RadiusCm = 100.f;
    History.Reset();
    const FFlowArtsArmClearanceResult Impossible = FFlowArtsArmClearance::Solve(Input, History);
    TestFalse(TEXT("Surface beyond the bounded response remains infeasible"), Impossible.bFeasible);
    TestTrue(TEXT("Impossible response retains the fixed grips"), Impossible.WorstWristPositionErrorCm < 0.1f);
    TestTrue(TEXT("Impossible response retains the angular bound"),
        FMath::RadiansToDegrees(Impossible.TorsoRotation.AngularDistance(FQuat::Identity)) <= 44.01f);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsArmComposedTorsoTest,
    "FlowArts.Runtime.ArmClearance.ComposedTorsoHardGrips",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsArmComposedTorsoTest::RunTest(const FString& Parameters)
{
    // Asymmetric crossing grips need a lean plus a twist. Independent CPU
    // replay of all 16 poles at every former rotation leaves >1 cm overlap;
    // the 24-degree lean / 20-degree twist candidate clears without stretching.
    FFlowArtsArmClearanceInput Input;
    Input.Arms[0] = Arm({-15, 0, 45}, {-22, -10, 42}, {-4.5, -10, 40});
    Input.Arms[1] = Arm({15, 0, 45}, {22, -10, 42}, {4.5, -2, 40});
    Input.FixedHip = Input.TorsoPivot = FVector::ZeroVector;
    Input.Neck = FVector(0, 0, 50);
    Input.Head = FVector(0, 0, 65);
    Input.BodyCapsules.Add({{0, 0, 14}, {0, 0, 29.5}, 14.f});
    Input.BodyCapsules.Add({{0, 0, 29.5}, {0, 0, 44.5}, 14.f});
    Input.BodyCapsules.Add({Input.Neck, Input.Head, 3.f});
    Input.bMeasuredSurface = Input.bAllowTorsoResponse = true;
    FFlowArtsArmClearanceHistory History;
    const auto Result = FFlowArtsArmClearance::Solve(Input, History);
    TestTrue(TEXT("Composed body response clears crossing fixed grips"), Result.bFeasible);
    TestTrue(TEXT("Correction includes both lean and yaw"),
        FMath::Abs(Result.TorsoRotation.Z) > .01f
        && FVector2D(Result.TorsoRotation.X, Result.TorsoRotation.Y).Size() > .01f);
    const float Degrees = FMath::RadiansToDegrees(Result.TorsoRotation.AngularDistance(FQuat::Identity));
    TestTrue(TEXT("Expanded response exceeds the former limit but stays bounded"), Degrees > 16.01f && Degrees <= 44.01f);
    TestTrue(TEXT("Captured wrist positions and orientations stay exact"),
        Result.WorstWristPositionErrorCm < .001f && Result.WorstWristAngleErrorDeg < .001f);
    for (int32 Side = 0; Side < 2; ++Side)
    {
        const auto& Before = Input.Arms[Side];
        const auto& After = Result.Arms[Side];
        TestTrue(TEXT("Composed response does not stretch either segment"),
            FMath::IsNearlyEqual(FVector::Dist(Before.Upper.GetLocation(), Before.Elbow.GetLocation()),
                FVector::Dist(After.Upper.GetLocation(), After.Elbow.GetLocation()), .01f)
            && FMath::IsNearlyEqual(FVector::Dist(Before.Elbow.GetLocation(), Before.Wrist.GetLocation()),
                FVector::Dist(After.Elbow.GetLocation(), After.Wrist.GetLocation()), .01f));
    }
    TestTrue(TEXT("Continuity records authored shoulders rather than solver displacement"),
        History.PreviousShoulders[0].Equals(Input.Arms[0].Upper.GetLocation(), .0001f)
        && History.PreviousWrists[0].Equals(Input.Arms[0].Wrist.GetLocation(), .0001f));
    const auto Stable = FFlowArtsArmClearance::Solve(Input, History);
    TestTrue(TEXT("History revalidates the complete composed correction"), Stable.bFeasible
        && Stable.WorstWristPositionErrorCm < .001f
        && Stable.TorsoRotation.Equals(Result.TorsoRotation, .0001f));
    const FFlowArtsArmClearanceHistory LastClearHistory = History;
    FFlowArtsArmClearanceInput ImpossibleGeometry = Input;
    ImpossibleGeometry.BodyCapsules[0].RadiusCm = ImpossibleGeometry.BodyCapsules[1].RadiusCm = 100.f;
    const auto Failed = FFlowArtsArmClearance::Solve(ImpossibleGeometry, History);
    TestFalse(TEXT("Oversized body is infeasible"), Failed.bFeasible);
    TestTrue(TEXT("A failed frame retains the last certified temporal seed"),
        History.bValid && History.PreviousTorsoRotation.Equals(LastClearHistory.PreviousTorsoRotation, .0001f)
        && History.PreviousSharedPerformanceTranslationCm.Equals(
            LastClearHistory.PreviousSharedPerformanceTranslationCm, .0001f)
        && History.PreviousElbows[0].Equals(LastClearHistory.PreviousElbows[0], .0001f));
    const auto Resumed = FFlowArtsArmClearance::Solve(Input, History);
    TestTrue(TEXT("A clear source reuses the retained temporal seed"), Resumed.bFeasible
        && Resumed.TorsoRotation.Equals(Stable.TorsoRotation, .0001f));
    FFlowArtsArmClearanceInput ClearBody = Input;
    for (auto& Body : ClearBody.BodyCapsules) Body.RadiusCm = 0.f;
    FFlowArtsArmClearanceHistory RecoveryHistory = History;
    const auto Recovered = FFlowArtsArmClearance::Solve(ClearBody, RecoveryHistory);
    TestTrue(TEXT("Clear authored recovery does not snap a large torso correction"), Recovered.bFeasible
        && FMath::RadiansToDegrees(Recovered.TorsoRotation.AngularDistance(Stable.TorsoRotation)) <= 2.01f
        && FMath::RadiansToDegrees(Recovered.TorsoRotation.AngularDistance(FQuat::Identity)) > 2.f);
    TestTrue(TEXT("Recovery retains exact captured wrists"), Recovered.WorstWristPositionErrorCm < .001f);
    // Moving the body into both target wrists must invalidate that clear pose.
    Input.BodyCapsules[0].RadiusCm = Input.BodyCapsules[1].RadiusCm = 100.f;
    const auto Blocked = FFlowArtsArmClearance::Solve(Input, History);
    TestFalse(TEXT("Changed body geometry invalidates composed history"), Blocked.bFeasible);
    TestTrue(TEXT("Blocked history still cannot relocate captured wrists"), Blocked.WorstWristPositionErrorCm < .001f);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsArmRigEnvelopeTest,
    "FlowArts.Runtime.ArmClearance.RigEnvelope",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsArmRigEnvelopeTest::RunTest(const FString& Parameters)
{
    FString CatalogJson;
    if (!TestTrue(TEXT("Prepared character catalog is readable"), FFileHelper::LoadFileToString(
        CatalogJson, *(FPaths::ProjectContentDir() / TEXT("Data/characters.json"))))) return false;
    TSharedPtr<FJsonObject> Catalog;
    if (!TestTrue(TEXT("Prepared character catalog parses"), FJsonSerializer::Deserialize(
        TJsonReaderFactory<>::Create(CatalogJson), Catalog) && Catalog.IsValid())) return false;
    const TArray<TSharedPtr<FJsonValue>>* Characters = nullptr;
    if (!TestTrue(TEXT("Catalog contains characters"),
        Catalog->TryGetArrayField(TEXT("characters"), Characters))) return false;
    TestEqual(TEXT("All sixteen deployed rigs are covered"), Characters->Num(), 16);
    TSet<FString> MeasuredIds;
    for (const TSharedPtr<FJsonValue>& Character : *Characters)
    {
        const TSharedPtr<FJsonObject>* Entry = nullptr;
        FString Id, MeshPath;
        if (!TestTrue(TEXT("Character entry has id and mesh"), Character.IsValid() &&
            Character->TryGetObject(Entry) && Entry && Entry->IsValid() &&
            (*Entry)->TryGetStringField(TEXT("id"), Id) &&
            (*Entry)->TryGetStringField(TEXT("mesh"), MeshPath))) continue;
        TestFalse(*FString::Printf(TEXT("%s is a unique catalog rig"), *Id), MeasuredIds.Contains(Id));
        const USkeletalMesh* Mesh = LoadObject<USkeletalMesh>(nullptr, *MeshPath);
        if (!TestNotNull(*FString::Printf(TEXT("Prepared %s mesh"), *Id), Mesh)) continue;
        const FSkeletalMeshLODInfo* LODInfo = Mesh->GetLODInfo(0);
        TestTrue(*FString::Printf(TEXT("%s persists LOD0 CPU access for cooking"), *Id),
            LODInfo && LODInfo->bAllowCPUAccess);
        FFlowArtsArmClearanceRigEnvelope Envelope;
        FString Error;
        const bool bMeasured = FFlowArtsArmClearance::MeasureRig(Mesh, Envelope, Error);
        if (!TestTrue(*FString::Printf(TEXT("%s surface envelope extracted from LOD0 vertices and weights: %s"),
            *Id, *Error), bMeasured)) continue;
        TestTrue(*FString::Printf(TEXT("%s seven-part envelope has vertex support"), *Id), Envelope.IsComplete());
        TestTrue(*FString::Printf(TEXT("%s CPU-accessible rig has usable weighted clearance cache: %s"),
            *Id, *Envelope.SkinnedClearanceError), Envelope.SkinnedClearance.IsValid());
        if (Envelope.SkinnedClearance)
        {
            FFlowArtsArmClearanceRigEnvelope SecondActorEnvelope;
            FString SecondError;
            TestTrue(TEXT("A second actor can measure the same rig"),
                FFlowArtsArmClearance::MeasureRig(Mesh, SecondActorEnvelope, SecondError));
            TestTrue(TEXT("Actors share immutable skin geometry and preparation identity"),
                SecondActorEnvelope.SkinnedClearance == Envelope.SkinnedClearance);
            FString SparseError;
            const bool bSparseEquivalent = FFlowArtsArmClearance::VerifySparseWitnessFrames(
                Mesh, *Envelope.SkinnedClearance, SparseError);
            TestTrue(*FString::Printf(TEXT("%s full/sparse witness frames and objectives agree: %s"),
                *Id, *SparseError), bSparseEquivalent);
            TestTrue(TEXT("Weighted cache includes exposed triangles for both arms"),
                !Envelope.SkinnedClearance->UpperTriangles[0].IsEmpty() && !Envelope.SkinnedClearance->UpperTriangles[1].IsEmpty());
            TestTrue(TEXT("Weighted cache includes exact reference bone mapping"),
                Envelope.SkinnedClearance->ReferenceBoneNames.Num() == Envelope.SkinnedClearance->ReferenceBoneCount);
        }
        TestTrue(*FString::Printf(TEXT("%s forearms retain positive surface radii"), *Id),
            Envelope.ForearmRadiusCm[0] > 0.f && Envelope.ForearmRadiusCm[1] > 0.f);
        for (int32 Band = 0; Band < 2; ++Band)
        {
            TestEqual(*FString::Printf(TEXT("%s torso band is axially bounded with directional mesh supports"), *Id),
                Envelope.TorsoBands[Band].Planes.Num(), 42);
            TestEqual(*FString::Printf(TEXT("%s upper arm has three measured exposed slice boxes"), *Id),
                Envelope.UpperTorsoPoints[Band].Num(), 24);
            for (const auto& Plane : Envelope.TorsoBands[Band].Planes)
                TestTrue(TEXT("Fitted plane is finite and unit length"),
                    !Plane.Normal.ContainsNaN() && FMath::IsFinite(Plane.OffsetCm) &&
                    FMath::IsNearlyEqual(Plane.Normal.SizeSquared(), 1., 0.001));
        }
        TestEqual(TEXT("Head has bounded directional mesh supports"), Envelope.HeadHull.Planes.Num(), 26);
        TestTrue(TEXT("Head support planes enclose a bounded polytope"), Envelope.HeadHull.Vertices.Num() >= 4);
        for (const auto& Band : Envelope.TorsoBands)
        {
            TestTrue(TEXT("Tapered band has cached SAT vertices and edges"),
                Band.Vertices.Num() >= 4 && !Band.EdgeDirections.IsEmpty());
            for (const FVector& Point : Band.Vertices)
                for (const auto& Plane : Band.Planes)
                    TestTrue(TEXT("Cached SAT vertex remains inside every fitted support"),
                        FVector::DotProduct(Plane.Normal, Point) <= Plane.OffsetCm + 0.002);
        }
        MeasuredIds.Add(Id);
    }
    TestEqual(TEXT("Every deployed rig yielded a measured envelope"), MeasuredIds.Num(), 16);
    return true;
}
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsArmStandingHullTest,
    "FlowArts.Runtime.ArmClearance.StandingAttachmentAndCrossedForearm",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsArmStandingHullTest::RunTest(const FString& Parameters)
{
    // A chest has different width/depth and finite height. A circular 16.5 cm
    // sweep spuriously reaches the normal arm attachment and beyond its top.
    FFlowArtsClearanceHull Chest;
    Chest.Planes = {{{1, 0, 0}, 14}, {{-1, 0, 0}, 14},
        {{0, 1, 0}, 8}, {{0, -1, 0}, 8},
        {{0, 0, 1}, 145}, {{0, 0, -1}, -125}};
    FFlowArtsArmClearanceInput Input;
    Input.Arms[0] = Arm({-18, 0, 145}, {-24, 0, 116}, {-24, 0, 86});
    Input.Arms[1] = Arm({18, 0, 145}, {24, 0, 116}, {24, 0, 86});
    for (int32 Side = 0; Side < 2; ++Side)
    {
        auto& A = Input.Arms[Side];
        A.UpperRadiusCm = 6.5f;
        A.ForearmRadiusCm = 5.f;
        // Exposed surface box in the shoulder's rotation-only frame. Its medial
        // support is narrower than the maximum radial depth of the arm.
        for (int32 Corner = 0; Corner < 8; ++Corner)
        {
            const float X = (Corner & 1) ? 9.f : 1.f;
            A.UpperTorsoPoints.Add(FVector(Side ? X : -X, (Corner & 2) ? 6.5f : -6.5f,
                (Corner & 4) ? -7.f : -29.f));
        }
    }
    Input.TorsoHulls.Add(Chest);
    Input.bMeasuredSurface = true;
    const float OldDepth = FFlowArtsArmClearance::CapsulePenetrationCm(
        {FMath::Lerp(Input.Arms[1].Upper.GetLocation(), Input.Arms[1].Elbow.GetLocation(), 0.23f),
            Input.Arms[1].Elbow.GetLocation(), 6.5f}, {{0, 0, 125}, {0, 0, 145}, 16.5f}, 0.3f);
    TestTrue(TEXT("Circular sweep reproduces the false standing shoulder overlap"), OldDepth > 3.f);
    FFlowArtsArmClearanceHistory History;
    const auto Standing = FFlowArtsArmClearance::Solve(Input, History);
    TestTrue(TEXT("Bounded fitted chest permits the standing attachment"), Standing.bFeasible);
    TestTrue(TEXT("Standing keeps exact authored grips"), Standing.WorstWristPositionErrorCm < 0.01f);

    // A forearm ending inside the chest cannot be excused as shoulder attachment.
    Input.Arms[0].Wrist.SetLocation(FVector(0, 0, 135));
    History.Reset();
    const auto Crossed = FFlowArtsArmClearance::Solve(Input, History);
    TestFalse(TEXT("Crossed forearm with embedded wrist stays infeasible"), Crossed.bFeasible);
    TestTrue(TEXT("Crossed forearm retains a real residual"), Crossed.WorstPenetrationCm > 1.f);
    TestTrue(TEXT("Crossed forearm does not detach the grip"), Crossed.WorstWristPositionErrorCm < 0.01f);
    TestEqual(TEXT("Worst collision identifies the fitted torso"), Crossed.WorstObstacleKind, 1);
    TestEqual(TEXT("Worst collision identifies the forearm"), Crossed.WorstSegment, 1);

    const FFlowArtsClearanceCapsule ThinCrossing{{-25, 0, 135}, {25, 0, 135}, 1.f};
    TestTrue(TEXT("Continuous segment clipping detects an interior crossing"),
        FFlowArtsArmClearance::HullPenetrationCm(ThinCrossing, Chest) > 1.f);
    TestEqual(TEXT("Bounded chest has no spherical bulge above its top"),
        FFlowArtsArmClearance::HullPenetrationCm({{-10, 0, 150}, {10, 0, 150}, 1.f}, Chest), 0.f);

    // Proximal upper-arm protection remains active for the opposite prop.
    Input.Arms[0].Wrist.SetLocation(FVector(-24, 0, 86));
    Input.HeldPropCapsules[1].Add({Input.Arms[0].Upper.GetLocation(), Input.Arms[0].Upper.GetLocation(), 1.f});
    History.Reset();
    const auto Prop = FFlowArtsArmClearance::Solve(Input, History);
    TestFalse(TEXT("Shoulder attachment exclusion never exempts an opposite prop"), Prop.bFeasible);
    TestEqual(TEXT("Proximal prop collision has useful diagnostics"), Prop.WorstObstacleKind, 2);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsArmBoxSeparationTest,
    "FlowArts.Runtime.ArmClearance.TiltedBoxSeparation",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsArmBoxSeparationTest::RunTest(const FString& Parameters)
{
    FFlowArtsClearanceHull Chest;
    Chest.Planes = {{{1, 0, 0}, 10}, {{-1, 0, 0}, 10},
        {{0, 1, 0}, 10}, {{0, -1, 0}, 10}, {{0, 0, 1}, 10}, {{0, 0, -1}, 10}};
    const FVector Along = FVector(1, -1, 0).GetSafeNormal();
    const FVector Across = FVector(1, 1, 0).GetSafeNormal();
    TArray<FVector> Box;
    for (int32 Corner = 0; Corner < 8; ++Corner)
        Box.Add(FVector(15, 15, 0) + Along * ((Corner & 1) ? 10 : -10)
            + Across * ((Corner & 2) ? 1 : -1) + FVector::UpVector * ((Corner & 4) ? 2 : -2));
    float FaceSeparation = -TNumericLimits<float>::Max();
    for (const auto& Plane : Chest.Planes)
    {
        float Nearest = TNumericLimits<float>::Max();
        for (const FVector& Point : Box)
            Nearest = FMath::Min(Nearest, static_cast<float>(FVector::DotProduct(Plane.Normal, Point) - Plane.OffsetCm));
        FaceSeparation = FMath::Max(FaceSeparation, Nearest);
    }
    TestTrue(TEXT("Torso faces alone reproduce a false overlap over three centimetres"), 0.3f - FaceSeparation > 3.f);
    TestEqual(TEXT("Box face axis proves the tilted box is separated"),
        FFlowArtsArmClearance::BoxHullPenetrationCm(Box, Chest), 0.f);
    for (FVector& Point : Box) Point -= Across * 10.f;
    TestTrue(TEXT("The same unchanged box detects a real intersection when translated into the torso"),
        FFlowArtsArmClearance::BoxHullPenetrationCm(Box, Chest) > 1.f);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsArmBoxSupportEquivalenceTest,
    "FlowArts.Runtime.ArmClearance.BoxSupportEquivalence",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsArmBoxSupportEquivalenceTest::RunTest(const FString& Parameters)
{
    FFlowArtsClearanceHull Hull;
    Hull.Planes = {{{1, 0, 0}, 10}, {{-1, 0, 0}, 10},
        {{0, 1, 0}, 7}, {{0, -1, 0}, 7}, {{0, 0, 1}, 12}, {{0, 0, -1}, 12}};
    Hull.EdgeDirections = {FVector::ForwardVector, FVector::RightVector, FVector::UpVector};
    for (int32 Corner = 0; Corner < 8; ++Corner)
        Hull.Vertices.Add({(Corner & 1) ? 10. : -10., (Corner & 2) ? 7. : -7., (Corner & 4) ? 12. : -12.});
    for (int32 Case = 0; Case < 48; ++Case)
    {
        const FQuat Rotation = FRotator(Case * 13., Case * 29., Case * 7.).Quaternion();
        const FVector Center((Case % 8) * 4. - 14., (Case % 5) * 5. - 9., (Case % 3) * 6. - 5.);
        TArray<FVector> Box;
        for (int32 Corner = 0; Corner < 8; ++Corner)
            Box.Add(Center + Rotation.RotateVector(FVector((Corner & 1) ? 9. : -9.,
                (Corner & 2) ? 2. : -2., (Corner & 4) ? 3. : -3.)));
        TArray<FVector> Axes;
        for (const auto& Plane : Hull.Planes) Axes.Add(Plane.Normal);
        const FVector Edges[3] = {(Box[1] - Box[0]).GetSafeNormal(),
            (Box[2] - Box[0]).GetSafeNormal(), (Box[4] - Box[0]).GetSafeNormal()};
        for (int32 Edge = 0; Edge < 3; ++Edge)
            Axes.Add(FVector::CrossProduct(Edges[(Edge + 1) % 3], Edges[(Edge + 2) % 3]));
        for (const FVector& HullEdge : Hull.EdgeDirections)
            for (const FVector& BoxEdge : Edges) Axes.Add(FVector::CrossProduct(HullEdge, BoxEdge));
        double Reference = TNumericLimits<double>::Max();
        for (const FVector& Direction : Axes)
        {
            const FVector Axis = Direction.GetSafeNormal();
            if (Axis.IsNearlyZero()) continue;
            double BoxMin = TNumericLimits<double>::Max(), BoxMax = -BoxMin;
            double HullMin = BoxMin, HullMax = -BoxMin;
            for (const FVector& Point : Box)
            {
                const double Projection = FVector::DotProduct(Axis, Point);
                BoxMin = FMath::Min(BoxMin, Projection); BoxMax = FMath::Max(BoxMax, Projection);
            }
            for (const FVector& Point : Hull.Vertices)
            {
                const double Projection = FVector::DotProduct(Axis, Point);
                HullMin = FMath::Min(HullMin, Projection); HullMax = FMath::Max(HullMax, Projection);
            }
            Reference = FMath::Min(Reference, FMath::Min(BoxMax - HullMin, HullMax - BoxMin) + .3);
        }
        TestTrue(FString::Printf(TEXT("Support SAT matches full vertex projection case %d"), Case),
            FMath::IsNearlyEqual(FFlowArtsArmClearance::BoxHullPenetrationCm(Box, Hull, .3f),
                static_cast<float>(FMath::Max(0., Reference)), .0001f));
    }
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsArmBoundedHeadTest,
    "FlowArts.Runtime.ArmClearance.BoundedHeadRetainsFullArmProtection",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsArmBoundedHeadTest::RunTest(const FString& Parameters)
{
    // The previous neck-to-head capsule placed a full head-radius hemisphere
    // below the neck, falsely reaching a seated shoulder. A measured head hull
    // has an actual lower boundary while keeping the same lateral dimensions.
    FFlowArtsClearanceHull Head;
    Head.Planes = {{{1, 0, 0}, 12}, {{-1, 0, 0}, 12},
        {{0, 1, 0}, 10}, {{0, -1, 0}, 10},
        {{0, 0, 1}, 85}, {{0, 0, -1}, -62}};
    const FFlowArtsClearanceCapsule Shoulder{{0, 0, 45}, {20, 0, 40}, 6.5f};
    TestTrue(TEXT("Neck-centered head hemisphere reproduces seated shoulder false contact"),
        FFlowArtsArmClearance::CapsulePenetrationCm(Shoulder, {{0, 0, 50}, {0, 0, 65}, 12}, 0.3f) > 1.f);
    TestEqual(TEXT("Bounded head separates the same full upper-arm capsule below the neck"),
        FFlowArtsArmClearance::HullPenetrationCm(Shoulder, Head, 0.3f), 0.f);
    TestTrue(TEXT("An arm crossing the actual head remains protected"),
        FFlowArtsArmClearance::HullPenetrationCm({{-20, 0, 70}, {20, 0, 70}, 6.5f}, Head, 0.3f) > 1.f);
    TestTrue(TEXT("A held prop crossing the head remains protected"),
        FFlowArtsArmClearance::HullPenetrationCm({{0, -20, 70}, {0, 20, 70}, 1.f}, Head, 0.3f) > 1.f);

    FFlowArtsArmClearanceInput Input;
    Input.Arms[0] = Arm({0, 0, 70}, {-20, 0, 50}, {-20, 0, 25});
    Input.Arms[1] = Arm({40, 0, 70}, {50, 0, 50}, {50, 0, 25});
    FFlowArtsClearanceHull FarTorso = Head;
    for (auto& Plane : FarTorso.Planes) Plane.OffsetCm += Plane.Normal.X * 200.f;
    Input.TorsoHulls = {FarTorso, FarTorso, Head};
    // An exposed box far away cannot exempt the proximal upper arm from head checks.
    for (int32 Corner = 0; Corner < 8; ++Corner)
        Input.Arms[0].UpperTorsoPoints.Add(FVector(100 + (Corner & 1), Corner & 2, Corner & 4));
    FFlowArtsArmClearanceHistory History;
    const auto Result = FFlowArtsArmClearance::Solve(Input, History);
    TestFalse(TEXT("A shoulder inside the head cannot be excused as torso attachment"), Result.bFeasible);
    TestEqual(TEXT("Full-arm head collision is diagnosed as head hull"), Result.WorstObstacleIndex, 2);
    TestTrue(TEXT("Head response retains strict wrist preservation"), Result.WorstWristPositionErrorCm < 0.01f);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsArmSkinCertificateBoundaryTest,
    "FlowArts.Runtime.ArmClearance.SkinCertificateRetainsOtherObstacles",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsArmSkinCertificateBoundaryTest::RunTest(const FString& Parameters)
{
    FFlowArtsArmClearanceInput Input;
    Input.Arms[0] = Arm({-20, 0, 0}, {-20, 0, -15}, {-20, 0, -30});
    Input.Arms[1] = Arm({20, 0, 0}, {20, 0, -15}, {20, 0, -30});
    FFlowArtsClearanceHull Torso;
    Torso.Planes = {{{1, 0, 0}, 3}, {{-1, 0, 0}, 3}, {{0, 1, 0}, 3},
        {{0, -1, 0}, 3}, {{0, 0, 1}, 3}, {{0, 0, -1}, 3}};
    Torso.EdgeDirections = {FVector::ForwardVector, FVector::RightVector, FVector::UpVector};
    for (int32 Corner = 0; Corner < 8; ++Corner)
    {
        Torso.Vertices.Add(FVector((Corner & 1) ? 3 : -3,
            (Corner & 2) ? 3 : -3, (Corner & 4) ? 3 : -3));
        // A deliberately conservative box fills empty space toward the trunk.
        Input.Arms[0].UpperTorsoPoints.Add(FVector((Corner & 1) ? 22 : 18,
            (Corner & 2) ? 2 : -2, (Corner & 4) ? 2 : -2));
    }
    Input.TorsoHulls = {Torso};
    FFlowArtsArmClearanceHistory History;
    const auto Conservative = FFlowArtsArmClearance::Solve(Input, History);
    TestFalse(TEXT("Conservative upper box alone blocks this fixture"), Conservative.bFeasible);
    TestTrue(TEXT("No callback is reported separately from geometry rejection"),
        !Conservative.bSkinnedCallbackAvailable && (Conservative.SkinnedSkipReasons & 1) != 0);
    FFlowArtsArmClearanceInput ProxyClearInput = Input;
    ProxyClearInput.TorsoHulls.Reset();
    int32 ClearProxyQueries = 0;
    ProxyClearInput.CertifySkinnedUpperTorso = [&](const FFlowArtsClearanceArm*, const FQuat&, bool) -> uint8
    { ++ClearProxyQueries; return 2; };
    FFlowArtsArmClearanceHistory ClearProxyHistory;
    const auto RejectedClearProxy = FFlowArtsArmClearance::Solve(ProxyClearInput, ClearProxyHistory);
    TestTrue(TEXT("Broad-clear upper arms still receive fresh weighted-surface validation"), ClearProxyQueries > 0);
    TestFalse(TEXT("A rejected weighted left shoulder cannot be accepted from a clear proxy"), RejectedClearProxy.bFeasible);
    TestTrue(TEXT("Failed broad-clear validation retains the exact query budget"), ClearProxyQueries <= 8);
    ProxyClearInput.CertifySkinnedUpperTorso = [](const FFlowArtsClearanceArm*, const FQuat&, bool) -> uint8 { return 3; };
    const auto CertifiedClearProxy = FFlowArtsArmClearance::Solve(ProxyClearInput, ClearProxyHistory);
    TestTrue(TEXT("Both freshly certified broad-clear surfaces can be accepted"),
        CertifiedClearProxy.bFeasible && CertifiedClearProxy.SkinnedUpperTorsoClearMask == 3);
    int32 Queries = 0;
    bool bPairRequested = false;
    Input.bCanCertifySkinnedArmPair = true;
    bool bCertificateValid = true;
    uint8 ValidCertificate = 7;
    Input.CertifySkinnedUpperTorso = [&](const FFlowArtsClearanceArm* Arms, const FQuat&, bool bRequestArmPair) -> uint8
    {
        ++Queries;
        bPairRequested |= bRequestArmPair;
        TestTrue(TEXT("Certificate receives the final paired wrist targets"),
            Arms[0].Wrist.Equals(Input.Arms[0].Wrist) && Arms[1].Wrist.Equals(Input.Arms[1].Wrist));
        return bCertificateValid ? ValidCertificate : 0;
    };
    const auto Certified = FFlowArtsArmClearance::Solve(Input, History);
    TestTrue(TEXT("A current skin separation certificate resolves only the conservative box"),
        Certified.bFeasible && Certified.MaxElbowDisplacementCm < .001f);
    TestTrue(TEXT("Authored certificate uses a bounded query"), Queries == 1);
    TestTrue(TEXT("Separated capsule proxies still request full hand and finger pair skinning"), bPairRequested);
    TestTrue(TEXT("The current full-pair certificate is retained"), Certified.bSkinnedArmPairClear);
    ValidCertificate = 3;
    const auto PairSkinRejected = FFlowArtsArmClearance::Solve(Input, History);
    TestFalse(TEXT("Separated forearm capsules cannot stand in for missing hand-pair skin clearance"),
        PairSkinRejected.bFeasible);
    ValidCertificate = 7;
    bCertificateValid = false;
    const auto Invalidated = FFlowArtsArmClearance::Solve(Input, History);
    TestFalse(TEXT("History never reuses a stale skin certificate"), Invalidated.bFeasible);
    bCertificateValid = true;
    const FVector HardWrist = Input.Arms[0].Wrist.GetLocation();
    Input.HeldPropCapsules[1].Add({HardWrist, HardWrist, 2.f});
    const auto PropBlocked = FFlowArtsArmClearance::Solve(Input, History);
    TestFalse(TEXT("Upper skin certificate cannot waive an opposite prop at a fixed wrist"), PropBlocked.bFeasible);
    TestTrue(TEXT("Hard wrist remains exact with a rejected certified pose"),
        PropBlocked.WorstWristPositionErrorCm < .001f);
    Input.HeldPropCapsules[1].Reset();
    Input.BodyCapsules.Add({HardWrist, HardWrist, 2.f});
    const auto ForearmBlocked = FFlowArtsArmClearance::Solve(Input, History);
    TestFalse(TEXT("Upper skin certificate cannot waive forearm body contact"), ForearmBlocked.bFeasible);
    TestTrue(TEXT("Other-obstacle contact is reported while the callback remains available"),
        ForearmBlocked.bSkinnedCallbackAvailable && (ForearmBlocked.SkinnedSkipReasons & 2) != 0);
    Input.BodyCapsules[0].RadiusCm = .1f;
    bCertificateValid = false;
    History.Reset();
    const auto PartialProxy = FFlowArtsArmClearance::Solve(Input, History);
    bCertificateValid = true;
    ValidCertificate = 5;
    History.Reset();
    const auto PartialSkin = FFlowArtsArmClearance::Solve(Input, History);
    TestTrue(TEXT("Skin refinement runs even when a separate forearm contact remains"),
        PartialSkin.SkinnedQueryCount > 0 && PartialSkin.SkinnedUpperTorsoClearMask == 1);
    TestTrue(TEXT("Partial certificate improves the residual without declaring clearance"),
        PartialSkin.WorstPenetrationCm < PartialProxy.WorstPenetrationCm && !PartialSkin.bFeasible);
    TestTrue(TEXT("The independent forearm contact remains fully measured"),
        PartialSkin.WorstObstacleKind == 0 && PartialSkin.WorstSegment == 1 &&
        FMath::IsNearlyEqual(PartialSkin.WorstPenetrationCm, 1.7f, .001f));
    const auto PartialHistory = FFlowArtsArmClearance::Solve(Input, History);
    TestTrue(TEXT("Later fallback searches retain a partial certificate after the phase budget is exhausted"),
        FMath::IsNearlyEqual(PartialHistory.WorstPenetrationCm, PartialSkin.WorstPenetrationCm, .001f) &&
        PartialHistory.SkinnedUpperTorsoClearMask == 1);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsArmSharedPlaneHistoryTest,
    "FlowArts.Runtime.ArmClearance.SharedPlaneStableHistory",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsArmSharedPlaneHistoryTest::RunTest(const FString& Parameters)
{
    FFlowArtsArmClearanceInput Input;
    Input.Arms[0] = Arm({-20, 0, 0}, {-25, 6, -10}, {-20, 0, -20});
    Input.Arms[1] = Arm({20, 0, 0}, {25, 6, -10}, {20, 0, -20});
    Input.bMeasuredSurface = Input.bAllowTorsoResponse = true;
    Input.bAllowSharedPerformanceTranslation = true;
    Input.MaxSharedPerformanceTranslationCm = 8.f;
    Input.FixedHip = {0, 0, -20}; Input.Neck = {0, 0, 10}; Input.Head = {0, 0, 20};
    Input.BodyCapsules.SetNum(3);
    // A body obstacle containing the authored wrist cannot be solved by an
    // elbow pole. With body rotation disabled, a common shift must resolve it.
    FFlowArtsArmClearanceInput Search = Input;
    Search.bAllowTorsoResponse = false;
    FFlowArtsClearanceHull WristObstacle;
    WristObstacle.Planes = {{{1, 0, 0}, -18}, {{-1, 0, 0}, 22},
        {{0, 1, 0}, 1}, {{0, -1, 0}, 1}, {{0, 0, 1}, -18}, {{0, 0, -1}, 22}};
    Search.TorsoHulls.Add(WristObstacle);
    FFlowArtsArmClearanceHistory SearchHistory;
    Search.MaxSharedPerformanceTranslationCm = 0.f;
    TestFalse(TEXT("A zero translation bound retains the embedded hard target"),
        FFlowArtsArmClearance::Solve(Search, SearchHistory).bFeasible);
    SearchHistory.Reset();
    Search.MaxSharedPerformanceTranslationCm = 8.f;
    const auto Shifted = FFlowArtsArmClearance::Solve(Search, SearchHistory);
    TestTrue(TEXT("Bounded shared search resolves the embedded plane without torso rotation"), Shifted.bFeasible);
    TestTrue(TEXT("Search returns a nonzero permitted common offset"),
        Shifted.SharedPerformanceTranslationCm.Size() > .1f && Shifted.SharedPerformanceTranslationCm.Size() <= 8.001f);
    TestTrue(TEXT("Shared diagnostics distinguish evaluated reachable poses from rejected poses"),
        Shifted.bSharedTranslationAllowed && Shifted.SharedCandidateCount > 0 &&
        Shifted.BestSharedPenetrationCm <= .02f);
    for (int32 Side = 0; Side < 2; ++Side)
        TestTrue(TEXT("Search preserves both relative wrist paths"),
            (Shifted.Arms[Side].Wrist.GetLocation() - Search.Arms[Side].Wrist.GetLocation()).Equals(
                Shifted.SharedPerformanceTranslationCm, .001f));
    // Both source wrists lie on the front side at almost full reach. Moving
    // farther forward cannot fit either arm; the opposite rigid shift can.
    Search.Arms[0] = Arm({-20, 0, 0}, {-25, 10, -10}, {-20, 20, -20});
    Search.Arms[1] = Arm({20, 0, 0}, {25, 10, -10}, {20, 20, -20});
    Search.MaxSharedPerformanceTranslationCm = 6.f;
    Search.TorsoHulls[0].Planes = {{{1, 0, 0}, -18}, {{-1, 0, 0}, 22},
        {{0, 1, 0}, 21}, {{0, -1, 0}, -19}, {{0, 0, 1}, -18}, {{0, 0, -1}, 22}};
    SearchHistory.Reset();
    const auto Opposite = FFlowArtsArmClearance::Solve(Search, SearchHistory);
    TestTrue(TEXT("Opposite signed forward search resolves a reach-limited source side"),
        Opposite.bFeasible && Opposite.SharedPerformanceTranslationCm.Y < -5.9f);
    TestTrue(TEXT("Reach-limited candidates are reported independently of head protection"),
        Opposite.SharedReachRejectedCount > 0 && Opposite.SharedHeadPropRejectedCount == 0);
    // Rounded measured x-bot crossed grips: a forward-only shift exhausts the
    // left arm while the right grip is still inside the lower trunk. A single
    // lateral component moves both paths intact into their shared reach lens.
    Search.Arms[0] = Arm({14.7f, -5.5f, 144.5f}, {6.8f, 20.9f, 140.3f}, {-15.4f, 28.6f, 124.5f});
    Search.Arms[1] = Arm({-15.6f, -5.5f, 143.6f}, {3.4f, 13.4f, 151.2f}, {9.8f, 5.9f, 124.7f});
    // Isolate the forearm/reach regression; upper-surface protection has its own
    // measured-box and skin-certificate fixtures above.
    Search.Arms[0].UpperRadiusCm = Search.Arms[1].UpperRadiusCm = 0.f;
    Search.FixedHip = {0, 1.6f, 104.3f}; Search.Neck = {-.7f, -3.1f, 150.3f};
    Search.Head = {-.8f, -2.7f, 160.1f}; Search.TorsoPivot = {0, 1.7f, 114.5f};
    Search.MaxSharedPerformanceTranslationCm = 35.f;
    Search.TorsoHulls[0].Planes = {{{1, 0, 0}, 100}, {{-1, 0, 0}, 100},
        {{0, 1, 0}, 20}, {{0, -1, 0}, 10}, {{0, 0, 1}, 145}, {{0, 0, -1}, -115}};
    Search.MaxSharedPerformanceTranslationCm = 0.f;
    SearchHistory.Reset();
    const auto CrossedFixed = FFlowArtsArmClearance::Solve(Search, SearchHistory);
    Search.MaxSharedPerformanceTranslationCm = 35.f;
    SearchHistory.Reset();
    const auto Crossed = FFlowArtsArmClearance::Solve(Search, SearchHistory);
    TestTrue(TEXT("Reach-derived lateral correction improves crossed-forearm clearance within the bound"),
        Crossed.WorstPenetrationCm + .5f < CrossedFixed.WorstPenetrationCm &&
        FMath::Abs(Crossed.SharedPerformanceTranslationCm.X) > 1.f &&
        Crossed.SharedPerformanceTranslationCm.Size() <= 35.001f);
    for (int32 Side = 0; Side < 2; ++Side)
        TestTrue(TEXT("Lateral correction preserves the complete relative hand pattern"),
            (Crossed.Arms[Side].Wrist.GetLocation() - Search.Arms[Side].Wrist.GetLocation()).Equals(
                Crossed.SharedPerformanceTranslationCm, .001f));
    // Optimistic seed ranking must not become an upper-surface certificate.
    // Enclose the fixture trunk in each deliberately excessive arm box; without
    // a positive current skin verdict every final candidate remains blocked.
    auto Uncertified = Search;
    Uncertified.Arms[0].ForearmRadiusCm = Uncertified.Arms[1].ForearmRadiusCm = 0.f;
    for (int32 Corner = 0; Corner < 8; ++Corner)
        Uncertified.TorsoHulls[0].Vertices.Add(FVector((Corner & 1) ? 100 : -100,
            (Corner & 2) ? 20 : -10, (Corner & 4) ? 145 : 115));
    for (int32 Side = 0; Side < 2; ++Side)
        for (int32 Corner = 0; Corner < 8; ++Corner)
            Uncertified.Arms[Side].UpperTorsoPoints.Add(FVector(
                (Corner & 1) ? 200 : -200, (Corner & 2) ? 200 : -200, (Corner & 4) ? 200 : -200));
    SearchHistory.Reset();
    const auto UncertifiedResult = FFlowArtsArmClearance::Solve(Uncertified, SearchHistory);
    TestFalse(TEXT("Optimistic shared seed ranking cannot waive uncertified upper surfaces"), UncertifiedResult.bFeasible);
    FFlowArtsArmClearanceHistory History;
    History.bValid = true;
    History.PreviousSharedPerformanceTranslationCm = {0, 6, 0};
    for (int32 Side = 0; Side < 2; ++Side)
    {
        History.PreviousShoulders[Side] = Input.Arms[Side].Upper.GetLocation();
        History.PreviousWrists[Side] = Input.Arms[Side].Wrist.GetLocation();
        History.PreviousElbows[Side] = Input.Arms[Side].Elbow.GetLocation();
    }
    const auto First = FFlowArtsArmClearance::Solve(Input, History);
    TestTrue(TEXT("An existing reachable shared offset is revalidated"), First.bFeasible);
    TestTrue(TEXT("Paused source retains the shared offset instead of recovering per frame"),
        First.SharedPerformanceTranslationCm.Equals(FVector(0, 6, 0), .001f));
    for (int32 Frame = 0; Frame < 4; ++Frame)
    {
        const auto Paused = FFlowArtsArmClearance::Solve(Input, History);
        TestTrue(TEXT("Repeated paused evaluation is stable"),
            Paused.SharedPerformanceTranslationCm.Equals(First.SharedPerformanceTranslationCm, .001f));
        TestTrue(TEXT("Configured displacement limit is respected"),
            Paused.SharedPerformanceTranslationCm.Size() <= Input.MaxSharedPerformanceTranslationCm + .001f);
        for (int32 Side = 0; Side < 2; ++Side)
        {
            TestTrue(TEXT("Both hands have exactly the shared displacement"),
                (Paused.Arms[Side].Wrist.GetLocation() - Input.Arms[Side].Wrist.GetLocation()).Equals(
                    Paused.SharedPerformanceTranslationCm, .001f));
            TestTrue(TEXT("Shared translation preserves hand orientation"),
                Paused.Arms[Side].Wrist.GetRotation().Equals(Input.Arms[Side].Wrist.GetRotation(), .00001f));
            TestTrue(TEXT("Shared translation preserves upper arm length"),
                FMath::IsNearlyEqual(FVector::Dist(Paused.Arms[Side].Upper.GetLocation(), Paused.Arms[Side].Elbow.GetLocation()),
                    FVector::Dist(Input.Arms[Side].Upper.GetLocation(), Input.Arms[Side].Elbow.GetLocation()), .001f));
        }
    }
    // The opposite prop follows the same plane. A large sphere at the original
    // left target blocks every permitted translated target, invalidating history.
    Input.HeldPropCapsules[1].Add({Input.Arms[0].Wrist.GetLocation(), Input.Arms[0].Wrist.GetLocation(), 12.f});
    const auto Blocked = FFlowArtsArmClearance::Solve(Input, History);
    TestFalse(TEXT("Changed props invalidate a previously clear translated pair"), Blocked.bFeasible);
    TestTrue(TEXT("Even rejected pairs retain a common displacement within the bound"),
        Blocked.SharedPerformanceTranslationCm.Size() <= Input.MaxSharedPerformanceTranslationCm + .001f);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsClavicleHardGripTest,
    "FlowArts.Runtime.ArmClearance.ClavicleHardGripHistory",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsClavicleHardGripTest::RunTest(const FString& Parameters)
{
    FFlowArtsArmClearanceInput Input;
    Input.Arms[0] = Arm({-20, 0, 20}, {-22, 12, 15}, {-25, 8, 0});
    Input.Arms[1] = Arm({20, 0, 20}, {22, 12, 15}, {25, 8, 0});
    Input.bMeasuredSurface = Input.bAllowSharedPerformanceTranslation = true;
    Input.MaxSharedPerformanceTranslationCm = 0.f;
    for (int32 Index = 0; Index < 3; ++Index)
        Input.BodyCapsules.Add({{0,0,-1000}, {0,0,-990}, 0.f});
    Input.FixedHip = {0, 0, -100}; Input.Neck = {0, 0, 100}; Input.Head = {0, 0, 110};
    Input.SurfacePaddingCm = .3f;
    for (int32 Side = 0; Side < 2; ++Side)
    {
        auto& A = Input.Arms[Side];
        A.bHasClavicle = true;
        A.Clavicle.SetLocation(FVector(Side == 0 ? -10 : 10, 0, 20));
        A.UpperRadiusCm = A.ForearmRadiusCm = 0.f;
        // Deliberately conservative upper boxes require an explicit fresh skin
        // verdict; the small torso does not touch the actual limb segments.
        for (int32 Corner = 0; Corner < 8; ++Corner)
            A.UpperTorsoPoints.Add(FVector((Corner & 1) ? 100 : -100,
                (Corner & 2) ? 100 : -100, (Corner & 4) ? 100 : -100));
    }
    FFlowArtsClearanceHull Hull;
    Hull.Planes = {{{1,0,0},2}, {{-1,0,0},2}, {{0,1,0},2}, {{0,-1,0},2}, {{0,0,1},2}, {{0,0,-1},2}};
    Input.TorsoHulls.Add(Hull);
    bool bAllowCertificate = true;
    Input.bCanCertifySkinnedArmPair = true;
    int32 FortyDegreeQueries = 0;
    int32 PartialShoulderQueries = 0;
    bool bSawJointCandidate = false;
    bool bRequireDifferentRightBranch = false;
    bool bRequireAlternatePlane = false;
    TOptional<FVector> FirstPartialPlane;
    TArray<FVector> QueriedRightElbows;
    Input.CertifySkinnedUpperTorso = [&](const FFlowArtsClearanceArm* Arms, const FQuat&, bool bRequestArmPair) -> uint8
    {
        // This isolates solver/adapter contracts, not the physical skin query.
        // Actual x-bot clipped-surface evidence separately validates the bound.
        const float Degrees = FMath::RadiansToDegrees(Arms[0].Clavicle.GetRotation().AngularDistance(FQuat::Identity));
        if (!bAllowCertificate || !Arms[0].bHasClavicle || !Arms[1].bHasClavicle) return 0;
        if (Degrees > 39.f && FMath::RadiansToDegrees(
            Arms[1].Clavicle.GetRotation().AngularDistance(FQuat::Identity)) > 39.f)
        {
            ++FortyDegreeQueries;
            if (bRequireAlternatePlane)
            {
                const FVector Shift = Arms[0].Wrist.GetLocation() - Input.Arms[0].Wrist.GetLocation();
                if (!FirstPartialPlane.IsSet()) { FirstPartialPlane = Shift; return 2; }
                if (Shift.Equals(FirstPartialPlane.GetValue(), 1.f)) return 2;
            }
            if (bRequireDifferentRightBranch)
            {
                const FVector Elbow = Arms[1].Elbow.GetLocation();
                if (QueriedRightElbows.IsEmpty()) { QueriedRightElbows.Add(Elbow); return 0; }
                if (Elbow.Equals(QueriedRightElbows[0], 1.f)) return 0;
                QueriedRightElbows.Add(Elbow);
            }
            bSawJointCandidate |= FVector::Dist(Arms[0].Wrist.GetLocation(), Input.Arms[0].Wrist.GetLocation()) > 1.f;
            return 7;
        }
        if (Degrees > 29.f)
        { ++PartialShoulderQueries; return 5; }
        return 0;
    };
    FFlowArtsArmClearanceHistory History;
    const auto First = FFlowArtsArmClearance::Solve(Input, History);
    TestTrue(TEXT("Bounded shoulder response reaches a freshly certified hard-grip pose"), First.bFeasible);
    TestTrue(TEXT("A fully certified forty-degree candidate wins over partial shoulder certificates"),
        FortyDegreeQueries > 0 && First.SkinnedUpperTorsoClearMask == 3);
    AddInfo(FString::Printf(TEXT("Shoulder certificates: partial thirty=%d, full forty=%d"),
        PartialShoulderQueries, FortyDegreeQueries));
    TestTrue(TEXT("Zero-radius proxies still need the independent complete-arm pair certificate"), First.bSkinnedArmPairClear);
    TestTrue(TEXT("Shoulder fallback stays within the eight-query budget"), First.SkinnedQueryCount <= 8);
    for (int32 Side = 0; Side < 2; ++Side)
    {
        const auto& Before = Input.Arms[Side]; const auto& After = First.Arms[Side];
        TestTrue(TEXT("Clavicle pivot remains authored"), After.Clavicle.GetLocation().Equals(Before.Clavicle.GetLocation(), .001f));
        TestTrue(TEXT("Clavicle length is preserved"), FMath::IsNearlyEqual(
            FVector::Dist(After.Clavicle.GetLocation(), After.Upper.GetLocation()),
            FVector::Dist(Before.Clavicle.GetLocation(), Before.Upper.GetLocation()), .001f));
        TestTrue(TEXT("Upper-arm length is preserved"), FMath::IsNearlyEqual(
            FVector::Dist(After.Upper.GetLocation(), After.Elbow.GetLocation()),
            FVector::Dist(Before.Upper.GetLocation(), Before.Elbow.GetLocation()), .001f));
        TestTrue(TEXT("Forearm length is preserved"), FMath::IsNearlyEqual(
            FVector::Dist(After.Elbow.GetLocation(), After.Wrist.GetLocation()),
            FVector::Dist(Before.Elbow.GetLocation(), Before.Wrist.GetLocation()), .001f));
        TestTrue(TEXT("Hard wrist transform stays exact"), After.Wrist.Equals(Before.Wrist, .001f));
        TestTrue(TEXT("Protraction is bounded"), First.ClavicleProtractionDeg[Side] <= 40.f);
    }
    const auto Paused = FFlowArtsArmClearance::Solve(Input, History);
    TestTrue(TEXT("Paused source does not recover shoulder angles per frame"),
        FMath::IsNearlyEqual(Paused.ClavicleProtractionDeg[0], First.ClavicleProtractionDeg[0], .001f));
    TestTrue(TEXT("Paused source retains the solved elbow"),
        Paused.Arms[0].Elbow.GetLocation().Equals(First.Arms[0].Elbow.GetLocation(), .001f));
    // A small source change invalidates the previous certificate. A smooth
    // witness objective should repair that fresh history before a cold grid.
    FFlowArtsArmClearanceInput Moving = Input;
    Moving.MaxSharedPerformanceTranslationCm = 35.f;
    for (int32 Side = 0; Side < 2; ++Side)
        Moving.Arms[Side].Wrist.AddToTranslation(FVector(0, .05f, 0));
    int32 MovingCertificates = 0;
    Moving.CertifySkinnedUpperTorso = [&](const FFlowArtsClearanceArm* Arms, const FQuat&, bool) -> uint8
    {
        ++MovingCertificates;
        const FVector Shift = Arms[0].Wrist.GetLocation() - Moving.Arms[0].Wrist.GetLocation();
        return Shift.X > .9f ? 7 : 0;
    };
    Moving.EvaluateSkinnedContacts = [&](const FFlowArtsClearanceArm* Arms, const FQuat&) -> double
    {
        const FVector Shift = Arms[0].Wrist.GetLocation() - Moving.Arms[0].Wrist.GetLocation();
        return FMath::Square(Shift.X - 1.0);
    };
    auto MovingHistory = History;
    const auto MovingWarm = FFlowArtsArmClearance::Solve(Moving, MovingHistory);
    TestTrue(TEXT("Moving source obtains a fresh local history correction"), MovingWarm.bFeasible);
    TestTrue(TEXT("Warm correction precedes cold search and uses at most two fresh local queries"),
        MovingWarm.WarmRefinementQueryCount > 0 && MovingWarm.WarmRefinementQueryCount <= 2
        && MovingWarm.SharedRankedSeedCount == 0);
    TestTrue(TEXT("Every moving correction retains the existing total query bound"),
        MovingWarm.SkinnedQueryCount <= 14 && MovingCertificates > 0);
    TestTrue(TEXT("Warm refinement preserves the rigid paired hand displacement"),
        (MovingWarm.Arms[0].Wrist.GetLocation() - Moving.Arms[0].Wrist.GetLocation()).Equals(
            MovingWarm.Arms[1].Wrist.GetLocation() - Moving.Arms[1].Wrist.GetLocation(), .001f));
    // A new obstacle is measured even when the witness objective and callback
    // still prefer the formerly certified plane. Neither can waive this prop.
    Moving.HeldPropCapsules[1].Add({Moving.Arms[0].Wrist.GetLocation(),
        Moving.Arms[0].Wrist.GetLocation(), 100.f});
    const auto MovingBlocked = FFlowArtsArmClearance::Solve(Moving, MovingHistory);
    TestFalse(TEXT("Changed props invalidate warm local clearance"), MovingBlocked.bFeasible);
    TestTrue(TEXT("Rejected warm search does not replenish the fourteen-query budget"),
        MovingBlocked.SkinnedQueryCount <= 14 && MovingBlocked.WarmRefinementQueryCount <= 2);
    // A staff through the formerly selected elbow invalidates the closest
    // bend. The paired ring must find a different elbow without moving grips.
    FFlowArtsArmClearanceInput BlockedPole = Input;
    BlockedPole.Arms[0].UpperRadiusCm = BlockedPole.Arms[0].ForearmRadiusCm = .5f;
    BlockedPole.Arms[1].UpperRadiusCm = BlockedPole.Arms[1].ForearmRadiusCm = .5f;
    const FVector BlockedElbow = First.Arms[0].Elbow.GetLocation();
    BlockedPole.HeldPropCapsules[1].Add({BlockedElbow, BlockedElbow, 1.5f});
    FFlowArtsArmClearanceHistory BlockedHistory;
    const auto Alternate = FFlowArtsArmClearance::Solve(BlockedPole, BlockedHistory);
    TestTrue(TEXT("Shoulder elbow ring clears an opposite prop blocking the closest bend"), Alternate.bFeasible);
    TestTrue(TEXT("Blocked closest elbow is not reused"),
        FVector::Dist(Alternate.Arms[0].Elbow.GetLocation(), BlockedElbow) > 2.f);
    TestTrue(TEXT("Alternate pole preserves both hard grips"),
        Alternate.Arms[0].Wrist.Equals(Input.Arms[0].Wrist, .001f) &&
        Alternate.Arms[1].Wrist.Equals(Input.Arms[1].Wrist, .001f));
    TestTrue(TEXT("Pole search retains the eight-query bound"), Alternate.SkinnedQueryCount <= 8);
    FFlowArtsArmClearanceInput JointInput = Input;
    JointInput.MaxSharedPerformanceTranslationCm = 35.f;
    FFlowArtsArmClearanceHistory JointHistory;
    const auto Joint = FFlowArtsArmClearance::Solve(JointInput, JointHistory);
    TestTrue(TEXT("Joint-ranked shoulder and plane candidate receives fresh certification"), bSawJointCandidate && Joint.bFeasible);
    TestTrue(TEXT("Joint search remains within the configured common-plane bound"),
        Joint.SharedPerformanceTranslationCm.Size() <= 35.001f);
    TestTrue(TEXT("Joint candidate preserves the exact relative hand path and orientations"),
        (Joint.Arms[0].Wrist.GetLocation() - Input.Arms[0].Wrist.GetLocation()).Equals(
            Joint.Arms[1].Wrist.GetLocation() - Input.Arms[1].Wrist.GetLocation(), .001f)
        && Joint.Arms[0].Wrist.GetRotation().Equals(Input.Arms[0].Wrist.GetRotation(), .001f)
        && Joint.Arms[1].Wrist.GetRotation().Equals(Input.Arms[1].Wrist.GetRotation(), .001f));
    TestTrue(TEXT("Joint ranking does not increase the exact-query budget"), Joint.SkinnedQueryCount <= 8);
    bRequireAlternatePlane = true;
    FFlowArtsArmClearanceHistory AlternatePlaneHistory;
    const auto AlternatePlane = FFlowArtsArmClearance::Solve(JointInput, AlternatePlaneHistory);
    TestTrue(TEXT("A partial shoulder certificate explores a fresh common plane"),
        FirstPartialPlane.IsSet() && AlternatePlane.bFeasible
        && !AlternatePlane.SharedPerformanceTranslationCm.Equals(FirstPartialPlane.GetValue(), 1.f));
    TestTrue(TEXT("Partial-certificate plane retry retains exact-query budget"), AlternatePlane.SkinnedQueryCount <= 8);
    bRequireAlternatePlane = false;
    bRequireDifferentRightBranch = true;
    FFlowArtsArmClearanceHistory DiverseBranchHistory;
    const auto DiverseBranch = FFlowArtsArmClearance::Solve(JointInput, DiverseBranchHistory);
    TestTrue(TEXT("Rejected first right elbow cannot consume all joint shoulder queries"),
        QueriedRightElbows.Num() >= 2 && DiverseBranch.bFeasible);
    TestTrue(TEXT("Distinct elbow validation retains the exact-query bound"), DiverseBranch.SkinnedQueryCount <= 8);
    bRequireDifferentRightBranch = false;
    bAllowCertificate = false;
    int32 WitnessEvaluations = 0;
    bool bEvaluatedTurn = false, bEvaluatedAsymmetricShoulders = false;
    JointInput.bAllowTorsoResponse = true;
    JointInput.EvaluateSkinnedContacts = [&](const FFlowArtsClearanceArm* Arms, const FQuat& Turn) -> double
    {
        ++WitnessEvaluations;
        bEvaluatedTurn |= !Turn.Equals(FQuat::Identity, .0001f);
        const double Left = Arms[0].Clavicle.GetRotation().AngularDistance(Turn);
        const double Right = Arms[1].Clavicle.GetRotation().AngularDistance(Turn);
        bEvaluatedAsymmetricShoulders |= FMath::Abs(Left - Right) > FMath::DegreesToRadians(1.f);
        // A satisfied or stale contact set is only a ranking signal. It cannot
        // substitute for the deliberately rejecting full current-pose query.
        return 0.0;
    };
    FFlowArtsArmClearanceHistory UncertifiedJointHistory;
    const auto UncertifiedJoint = FFlowArtsArmClearance::Solve(JointInput, UncertifiedJointHistory);
    TestFalse(TEXT("Cheap joint face-axis ranking cannot replace full measured acceptance"), UncertifiedJoint.bFeasible);
    TestTrue(TEXT("Contact ranking is exercised on rejected measured joint poses"), WitnessEvaluations > 0);
    TestTrue(TEXT("Contact refinement evaluates articulated torso responses"), bEvaluatedTurn);
    TestTrue(TEXT("Contact refinement evaluates independent shoulder responses"), bEvaluatedAsymmetricShoulders);
    TestFalse(TEXT("Zero witness objective cannot grant a missing full certificate"), UncertifiedJoint.bFeasible);
    TestTrue(TEXT("Contact refinement preserves configured translation bound"),
        UncertifiedJoint.SharedPerformanceTranslationCm.Size() <= JointInput.MaxSharedPerformanceTranslationCm + .001f);

    TestTrue(TEXT("Rejected cold search still honors the fourteen-query bound"), UncertifiedJoint.SkinnedQueryCount <= 14);
    // Removed cold-wide recovery must not reappear through a rejected certificate.
    // A valid response remains bounded and retains the honest failed verdict.
    TestTrue(TEXT("Rejected response retains finite bounded arms"),
        !UncertifiedJoint.Arms[0].Elbow.ContainsNaN() &&
        !UncertifiedJoint.Arms[1].Elbow.ContainsNaN());
    const auto Invalidated = FFlowArtsArmClearance::Solve(Input, History);
    TestFalse(TEXT("A previous shoulder certificate cannot survive changed geometry"), Invalidated.bFeasible);
    return true;
}


IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsArmPairCertificateTest,
    "FlowArts.Runtime.ArmClearance.WeightedArmPairCertificate",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsArmPairCertificateTest::RunTest(const FString& Parameters)
{
    FFlowArtsArmClearanceInput Input;
    // Overlapping conservative capsule endpoints cannot be cleared by pole
    // changes. The mock isolates the independent current-pose certificate bits.
    Input.Arms[0] = Arm({-20, 0, 20}, {-18, 12, 10}, {0, 8, 0});
    Input.Arms[1] = Arm({20, 0, 20}, {18, 12, 10}, {0, 8, 0});
    Input.bCanCertifySkinnedArmPair = true;
    uint8 Certificate = 7;
    bool bPairRequested = false;
    Input.CertifySkinnedUpperTorso = [&](const FFlowArtsClearanceArm*, const FQuat&, bool bRequestArmPair) -> uint8
    { bPairRequested |= bRequestArmPair; return Certificate; };
    FFlowArtsArmClearanceHistory History;
    const auto Clear = FFlowArtsArmClearance::Solve(Input, History);
    TestTrue(TEXT("A fresh full-pair certificate can refine conservative arm capsules"), Clear.bFeasible);
    TestTrue(TEXT("Pair verdict has its own diagnostic"), Clear.bSkinnedArmPairClear);
    TestTrue(TEXT("Fresh capsule overlap requests the independent pair query"), bPairRequested);
    TestEqual(TEXT("Feasible pair also has fresh clearance for both upper surfaces"), Clear.SkinnedUpperTorsoClearMask, uint8(3));
    for (int32 Side = 0; Side < 2; ++Side)
        TestTrue(TEXT("Pair refinement preserves exact hard grips"), Clear.Arms[Side].Wrist.Equals(Input.Arms[Side].Wrist, .001f));
    Certificate = 4;
    const auto PairOnly = FFlowArtsArmClearance::Solve(Input, History);
    TestFalse(TEXT("Pair-only verdict cannot certify either upper surface"), PairOnly.bFeasible);
    Certificate = 3;
    const auto UpperOnly = FFlowArtsArmClearance::Solve(Input, History);
    TestFalse(TEXT("Upper torso certificate cannot waive arm-pair contact"), UpperOnly.bFeasible);
    TestFalse(TEXT("Previous pair verdict is never reused without revalidation"), UpperOnly.bSkinnedArmPairClear);
    Certificate = 7;
    Input.bCanCertifySkinnedArmPair = false;
    History.Reset();
    const auto Unsupported = FFlowArtsArmClearance::Solve(Input, History);
    TestFalse(TEXT("Callback bit cannot waive pair contacts without complete cache capability"), Unsupported.bFeasible);
    Input.bCanCertifySkinnedArmPair = true;
    Input.HeldPropCapsules[1].Add({Input.Arms[0].Wrist.GetLocation(), Input.Arms[0].Wrist.GetLocation(), 10.f});
    History.Reset();
    const auto PropBlocked = FFlowArtsArmClearance::Solve(Input, History);
    TestFalse(TEXT("Pair certificate retains opposite held-prop protection"), PropBlocked.bFeasible);
    uint8 RequestedProps = 0;
    uint8 PropCertificate = 8;
    Input.CertifySkinnedOppositeProps = [&](const FFlowArtsClearanceArm* CandidateArms,
        const FQuat&, const TArray<FFlowArtsClearanceCapsule>&,
        const TArray<FFlowArtsClearanceCapsule>& RightProps, uint8 RequestedSides) -> uint8
    {
        RequestedProps |= RequestedSides;
        TestTrue(TEXT("Opposite prop certificate sees this candidate's hard wrist"),
            CandidateArms[0].Wrist.Equals(Input.Arms[0].Wrist, .001f));
        TestTrue(TEXT("Opposite prop certificate receives the current held capsule"),
            RightProps.Num() == 1 && RightProps[0].Start.Equals(Input.Arms[0].Wrist.GetLocation(), .001f));
        return PropCertificate;
    };
    History.Reset();
    const auto PropClear = FFlowArtsArmClearance::Solve(Input, History);
    TestTrue(TEXT("Fresh same-candidate prop and full-pair certificates clear the conservative contacts"),
        PropClear.bFeasible && PropClear.SkinnedOppositePropClearMask == 8 && (RequestedProps & 1));
    PropCertificate = 0;
    History.Reset();
    const auto PropRejected = FFlowArtsArmClearance::Solve(Input, History);
    TestFalse(TEXT("Failed exact prop certificate restores the broad opposite contact"), PropRejected.bFeasible);
    TestTrue(TEXT("Rejected prop remains a measured collision"), PropRejected.WorstPenetrationCm > .02f);

    FFlowArtsArmClearanceInput PropOnly;
    PropOnly.Arms[0] = Arm({-60, 0, 20}, {-60, 12, 10}, {-60, 8, 0});
    PropOnly.Arms[1] = Arm({60, 0, 20}, {60, 12, 10}, {60, 8, 0});
    PropOnly.HeldPropCapsules[1].Add({PropOnly.Arms[0].Wrist.GetLocation(),
        PropOnly.Arms[0].Wrist.GetLocation(), 10.f});
    int32 PropOnlyQueries = 0;
    uint8 PropOnlyCertificate = 8;
    PropOnly.CertifySkinnedOppositeProps = [&](const FFlowArtsClearanceArm* CandidateArms,
        const FQuat&, const TArray<FFlowArtsClearanceCapsule>&,
        const TArray<FFlowArtsClearanceCapsule>&, uint8 RequestedSides) -> uint8
    {
        ++PropOnlyQueries;
        TestTrue(TEXT("Prop-only query uses the current candidate wrist"),
            CandidateArms[0].Wrist.Equals(PropOnly.Arms[0].Wrist, .001f));
        return PropOnlyCertificate & uint8(((RequestedSides & 1) ? 8 : 0) | ((RequestedSides & 2) ? 16 : 0));
    };
    FFlowArtsArmClearanceHistory PropOnlyHistory;
    const auto PropOnlyClear = FFlowArtsArmClearance::Solve(PropOnly, PropOnlyHistory);
    TestTrue(TEXT("Independent full-arm prop certificate works without upper torso topology"),
        PropOnlyClear.bFeasible && PropOnlyClear.SkinnedOppositePropClearMask == 8 && PropOnlyQueries > 0);
    PropOnly.HeldPropCapsules[1][0] = {{200, 200, 200}, {200, 200, 200}, 1.f};
    PropOnlyCertificate = 0;
    PropOnlyHistory.Reset();
    const auto RemotePropRejected = FFlowArtsArmClearance::Solve(PropOnly, PropOnlyHistory);
    TestFalse(TEXT("A remote broad prop proxy cannot replace a rejected exact hand-to-prop certificate"),
        RemotePropRejected.bFeasible);
    PropOnly.HeldPropCapsules[1][0] = {PropOnly.Arms[0].Wrist.GetLocation(),
        PropOnly.Arms[0].Wrist.GetLocation(), 10.f};
    PropOnlyCertificate = 8;
    PropOnly.BodyCapsules.Add({PropOnly.Arms[0].Wrist.GetLocation(),
        PropOnly.Arms[0].Wrist.GetLocation(), 5.f});
    PropOnlyHistory.Reset();
    const auto BodyBlocked = FFlowArtsArmClearance::Solve(PropOnly, PropOnlyHistory);
    TestFalse(TEXT("Opposite prop certificate cannot waive forearm-body contact"), BodyBlocked.bFeasible);
    TestTrue(TEXT("Independent body contact remains measured"), BodyBlocked.WorstPenetrationCm > .02f);
    const FVector RemoteTrunk(0, 0, -200);
    PropOnly.BodyCapsules[0] = {RemoteTrunk, RemoteTrunk, 5.f};
    PropOnly.HeldPropCapsules[0].Add({RemoteTrunk, RemoteTrunk, 5.f});
    PropOnlyCertificate = 24;
    PropOnlyHistory.Reset();
    const auto OwnPropBlocked = FFlowArtsArmClearance::Solve(PropOnly, PropOnlyHistory);
    TestFalse(TEXT("Opposite prop certificate cannot waive the held prop against its own body"),
        OwnPropBlocked.bFeasible);
    TestTrue(TEXT("Own-prop contact remains the reported blocker"),
        OwnPropBlocked.WorstObstacleKind == 4 && OwnPropBlocked.WorstPenetrationCm > .02f);
    uint8 RequestedBodySides = 0;
    uint8 BodyCertificate = 96;
    PropOnly.CertifySkinnedHeldPropBody = [&](const FFlowArtsClearanceArm* CandidateArms,
        const FQuat&, const TArray<FFlowArtsClearanceCapsule>& LeftProps,
        const TArray<FFlowArtsClearanceCapsule>&, uint8 RequestedSides) -> uint8
    {
        RequestedBodySides |= RequestedSides;
        TestTrue(TEXT("Own-prop body certificate sees the current hard wrist"),
            CandidateArms[0].Wrist.Equals(PropOnly.Arms[0].Wrist, .001f));
        TestTrue(TEXT("Own-prop body certificate sees the currently held capsule"),
            LeftProps.Num() == 1 && LeftProps[0].Start.Equals(RemoteTrunk, .001f));
        return BodyCertificate;
    };
    PropOnlyHistory.Reset();
    const auto OwnPropClear = FFlowArtsArmClearance::Solve(PropOnly, PropOnlyHistory);
    TestTrue(TEXT("Fresh same-candidate own-prop body certificate clears only that contact"),
        OwnPropClear.bFeasible && OwnPropClear.SkinnedHeldPropBodyClearMask == 96 && RequestedBodySides == 3);
    BodyCertificate = 0;
    PropOnlyHistory.Reset();
    const auto OwnPropRejected = FFlowArtsArmClearance::Solve(PropOnly, PropOnlyHistory);
    TestFalse(TEXT("Failed own-prop body certificate retains broad contact"), OwnPropRejected.bFeasible);
    TestTrue(TEXT("Failed own-prop body certificate reports the own-body obstruction"),
        OwnPropRejected.WorstObstacleKind == 4 && OwnPropRejected.WorstPenetrationCm > .02f);
    BodyCertificate = 96;
    // BodyCapsules[2] is the head proxy; index 1 is still a trunk band.
    PropOnly.BodyCapsules.Add({RemoteTrunk, RemoteTrunk, 5.f});
    PropOnly.BodyCapsules.Add({RemoteTrunk, RemoteTrunk, 12.f});
    PropOnlyHistory.Reset();
    const auto HeadBlocked = FFlowArtsArmClearance::Solve(PropOnly, PropOnlyHistory);
    TestFalse(TEXT("Own-prop body certificate cannot waive head contact"), HeadBlocked.bFeasible);
    TestTrue(TEXT("Head contact remains independently measured"),
        HeadBlocked.WorstObstacleKind == 5 && HeadBlocked.WorstPenetrationCm > .02f);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsSourceCertificateDiagnosticsTest,
    "FlowArts.Runtime.ArmClearance.SourceCertificateDiagnostics",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsSourceCertificateDiagnosticsTest::RunTest(const FString& Parameters)
{
    FFlowArtsArmClearanceInput Input;
    Input.Arms[0] = Arm({-20, 0, 20}, {-18, 12, 10}, {0, 8, 0});
    Input.Arms[1] = Arm({20, 0, 20}, {18, 12, 10}, {0, 8, 0});
    Input.bSourceFidelityOnly = true;
    Input.bCanCertifySkinnedArmPair = true;
    int32 Queries = 0;
    Input.CertifySkinnedUpperTorso = [&](const FFlowArtsClearanceArm*, const FQuat&, bool) -> uint8
    { ++Queries; return 3; };
    FFlowArtsArmClearanceHistory History;
    const auto Result = FFlowArtsArmClearance::Solve(Input, History);
    TestEqual(TEXT("Source pose receives one fresh certificate"), Queries, 1);
    TestEqual(TEXT("Independent upper clearance survives an equal-score pair rejection"),
        Result.SkinnedUpperTorsoClearMask, uint8(3));
    TestFalse(TEXT("Upper certificates do not waive the rejected arm pair"), Result.bFeasible);
    TestFalse(TEXT("Rejected pair remains explicit"), Result.bSkinnedArmPairClear);
    TestTrue(TEXT("Pair residual remains positive"), Result.WorstPenetrationCm > .02f);
    // The capsules can miss weighted upper-arm extensions. An independent
    // exact pair rejection must survive even when every distal proof succeeds.
    Input.Arms[0] = Arm({-40, 0, 20}, {-40, 12, 10}, {-40, 8, 0});
    Input.Arms[1] = Arm({40, 0, 20}, {40, 12, 10}, {40, 8, 0});
    Input.CertifySkinnedSegments = [](const FFlowArtsClearanceArm*, const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&, const TArray<FFlowArtsClearanceCapsule>&,
        uint8 Requested) -> uint8 { return Requested; };
    History.Reset();
    const auto MissingUpperPair = FFlowArtsArmClearance::Solve(Input, History);
    TestTrue(TEXT("Regression isolates a proxy-clear, distal-clear candidate"),
        MissingUpperPair.WorstPenetrationCm <= .02f && (MissingUpperPair.SkinnedSegmentClearMask & 3) == 3);
    TestFalse(TEXT("Distal certificates cannot waive an exact upper-arm pair rejection"),
        MissingUpperPair.bFeasible);
    Input.CertifySkinnedUpperTorso = [](const FFlowArtsClearanceArm*, const FQuat&, bool) -> uint8
    { return 5; };
    History.Reset();
    const auto PartialSurface = FFlowArtsArmClearance::Solve(Input, History);
    TestEqual(TEXT("Proxy-clear fallback preserves the final partial upper certificate"),
        PartialSurface.SkinnedUpperTorsoClearMask, uint8(1));
    TestTrue(TEXT("Proxy-clear fallback preserves the final complete arm-pair certificate"),
        PartialSurface.bSkinnedArmPairClear);
    TestFalse(TEXT("Partial upper certificate remains infeasible despite clear proxies"), PartialSurface.bFeasible);
    Input.bCanCertifySkinnedArmPair = false;
    History.Reset();
    TestFalse(TEXT("Unavailable whole-arm topology cannot grant a complete distal-based certificate"),
        FFlowArtsArmClearance::Solve(Input, History).bFeasible);
    for (int32 Side = 0; Side < 2; ++Side)
    {
        TestTrue(TEXT("Source shoulder is preserved"), MissingUpperPair.Arms[Side].Upper.Equals(Input.Arms[Side].Upper));
        TestTrue(TEXT("Source elbow is preserved"), MissingUpperPair.Arms[Side].Elbow.Equals(Input.Arms[Side].Elbow));
        TestTrue(TEXT("Source grip is preserved"), MissingUpperPair.Arms[Side].Wrist.Equals(Input.Arms[Side].Wrist));
    }
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsForearmBodyCertificateTest,
    "FlowArts.Runtime.ArmClearance.ForearmBodyCertificate",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsForearmBodyCertificateTest::RunTest(const FString& Parameters)
{
    FFlowArtsArmClearanceInput Input;
    Input.Arms[0] = Arm({-40,0,30}, {-40,0,15}, {-40,15,15});
    Input.Arms[1] = Arm({40,0,30}, {40,0,15}, {40,15,15});
    Input.bSourceFidelityOnly = true;
    FFlowArtsClearanceHull Hull;
    const FVector Center(-40,8,15);
    for (const FVector Axis : {FVector::ForwardVector,FVector::RightVector,FVector::UpVector})
        for (int32 Sign : {-1,1})
        {
            const FVector N=Axis*Sign;
            Hull.Planes.Add({N,static_cast<float>(FVector::DotProduct(N,Center)+.5)});
        }
    Input.TorsoHulls.Add(Hull);
    auto Solve=[&]() { FFlowArtsArmClearanceHistory History; return FFlowArtsArmClearance::Solve(Input,History); };
    TestFalse(TEXT("Overlapping forearm hull remains conservative without proof"),Solve().bFeasible);
    Input.CertifySkinnedHeldPropBody=[](const FFlowArtsClearanceArm*,const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&,uint8)->uint8{return 96;};
    TestFalse(TEXT("Held-prop proof cannot substitute for forearm proof"),Solve().bFeasible);
    Input.CertifyForearmBody=[](const FFlowArtsClearanceArm*,const FQuat&)->uint8{return 0;};
    TestFalse(TEXT("Exact forearm rejection retains hull"),Solve().bFeasible);
    Input.CertifyForearmBody=[](const FFlowArtsClearanceArm*,const FQuat&)->uint8{return 2;};
    TestFalse(TEXT("Opposite side proof cannot waive left forearm"),Solve().bFeasible);
    Input.CertifyForearmBody=[](const FFlowArtsClearanceArm*,const FQuat&)->uint8{return 1;};
    const auto Clear=Solve();
    TestTrue(TEXT("Same-side fresh proof can replace only its torso hull"),Clear.bFeasible);
    TestEqual(TEXT("Forearm proof has independent result identity"),Clear.ForearmBodyClearMask,uint8(1));
    Input.TorsoHulls.InsertDefaulted(0,2);
    TestFalse(TEXT("Forearm proof never replaces head hull"),Solve().bFeasible);
    Input.CertifyForearmHead=[](const FFlowArtsClearanceArm*,const FQuat&)->uint8{return 2;};
    TestFalse(TEXT("Opposite-side head proof retains left head hull"),Solve().bFeasible);
    Input.CertifyForearmHead=[](const FFlowArtsClearanceArm*,const FQuat&)->uint8{return 1;};
    const auto HeadClear=Solve();
    TestTrue(TEXT("Same-side head proof clears only the head hull"),HeadClear.bFeasible);
    TestEqual(TEXT("Head proof has separate result identity"),HeadClear.ForearmHeadClearMask,uint8(1));
    Input.TorsoHulls[0]=Hull;
    Input.CertifyForearmBody=[](const FFlowArtsClearanceArm*,const FQuat&)->uint8{return 0;};
    TestFalse(TEXT("Head proof cannot replace torso forearm proof"),Solve().bFeasible);
    Input.CertifyForearmBody=[](const FFlowArtsClearanceArm*,const FQuat&)->uint8{return 1;};
    Input.TorsoHulls.Reset();
    Input.BodyCapsules.Add({Center,Center,1.f});
    TestFalse(TEXT("Forearm proof never replaces legacy body capsule"),Solve().bFeasible);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsContactCorrectionRateTest,
    "FlowArts.Runtime.ArmClearance.ContactCorrectionRate",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsContactCorrectionRateTest::RunTest(const FString& Parameters)
{
    const FVector Scale(2., .5, 1.5);
    const FVector Current(1., 1., 0.);
    const FVector Gradient(-100., 0., 0.);
    TestTrue(TEXT("Paused evaluation preserves correction exactly"),
        FFlowArtsArmClearance::StepContactHandCorrection(Current, Gradient, 0.f, Scale).Equals(Current, 0.));
    for (const int32 Fps : {30, 60, 120})
    {
        FVector Correction = FVector::ZeroVector;
        for (int32 Frame = 0; Frame < Fps; ++Frame)
        {
            const FVector Next = FFlowArtsArmClearance::StepContactHandCorrection(
                Correction, Gradient, 1.f / Fps, Scale);
            TestTrue(TEXT("Correction speed is bounded in world centimeters"),
                ((Next - Correction) * Scale).Size() <= 30. / Fps + .0001);
            TestTrue(TEXT("Correction stays within four world centimeters"),
                (Next * Scale).Size() <= 4.0001);
            Correction = Next;
        }
        TestTrue(TEXT("The same sustained contact reaches the same bound at each frame rate"),
            (Correction * Scale).Equals(FVector(4., 0., 0.), .0001));
    }
    TestEqual(TEXT("Paused activity preserves elbow angle exactly"),
        FFlowArtsArmClearance::StepContactElbowCorrection(.1, -100., 0.f), .1);
    for (const int32 Fps : {30, 60, 120})
    {
        double Angle=0.;
        for (int32 Frame=0; Frame<Fps; ++Frame)
        {
            const double Next=FFlowArtsArmClearance::StepContactElbowCorrection(Angle,-100.,1.f/Fps);
            TestTrue(TEXT("Activity elbow rate is at most thirty degrees per second"),
                FMath::Abs(Next-Angle)<=PI/(6.*Fps)+1.e-6);
            TestTrue(TEXT("Activity elbow remains within fifteen degrees of source"),FMath::Abs(Next)<=PI/12.+1.e-6);
            Angle=Next;
        }
        TestTrue(TEXT("Sustained activity contact reaches the same angular bound at every rate"),
            FMath::Abs(Angle-PI/12.)<1.e-6);
    }
    const FVector Released = FFlowArtsArmClearance::StepContactHandCorrection(
        Current, FVector::ZeroVector, 1.f / 30.f, Scale);
    TestTrue(TEXT("A released contact returns gradually toward the authored hand"),
        (Released * Scale).Size() < (Current * Scale).Size() && !Released.IsNearlyZero());
    TestTrue(TEXT("Paused torso response is exactly stable"),
        FFlowArtsArmClearance::StepContactTorsoCorrection(Current,Gradient,0.f).Equals(Current,0.));
    for (const int32 Fps : {30,60,120})
    {
        FVector Rotation=FVector::ZeroVector;
        constexpr double Limit=25.*PI/180.;
        for (int32 Frame=0; Frame<Fps*2; ++Frame)
        {
            const FVector Next=FFlowArtsArmClearance::StepContactTorsoCorrection(
                Rotation,FVector(-1000.,0.,0.),1.f/Fps);
            TestTrue(TEXT("Torso speed remains bounded at each frame rate"),(Next-Rotation).Size()<=Limit/Fps+1.e-6);
            TestTrue(TEXT("Torso displacement remains bounded"),Next.Size()<=Limit+1.e-6);
            Rotation=Next;
        }
        TestTrue(TEXT("Sustained torso contact reaches the same bound"),Rotation.Equals(FVector(Limit,0.,0.),1.e-6));
    }
    FFlowArtsArmClearanceHistory History;
    History.ContactHandTranslationCm[0] = Current;
    History.ContactHandTranslationCm[1] = -Current;
    History.ContactElbowAngleRadians[0] = .1;
    History.ContactElbowAngleRadians[1] = -.1;
    History.ContactTorsoRotationVector=FVector(.1,.2,0.);
    History.Reset();
    TestTrue(TEXT("Seek and clip reset clears torso correction"),History.ContactTorsoRotationVector.IsZero());
    TestTrue(TEXT("Seek and clip history reset clears both activity elbow corrections"),
        History.ContactElbowAngleRadians[0] == 0. && History.ContactElbowAngleRadians[1] == 0.);
    TestTrue(TEXT("Seek and clip history reset clears both contact offsets"),
        History.ContactHandTranslationCm[0].IsZero() && History.ContactHandTranslationCm[1].IsZero());
    return true;
}


IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsPreparedGeometryTest,
    "FlowArts.Runtime.ArmClearance.PreparedGeometry",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsPreparedGeometryTest::RunTest(const FString& Parameters)
{
    FFlowArtsArmClearancePreparationSnapshot Snapshot;
    Snapshot.bValid=true;
    auto& Input=Snapshot.Geometry;
    Input.bMeasuredSurface=Input.bSourceFidelityOnly=true;
    Input.bCanCertifySkinnedArmPair=true;
    Input.FixedHip=FVector::ZeroVector;
    Input.Neck=FVector(0,0,100);
    Input.Head=FVector(0,0,115);
    Input.TorsoPivot=FVector(0,0,60);
    Input.CertifySkinnedUpperTorso=[](const FFlowArtsClearanceArm*,const FQuat&,bool) {return uint8(7);};
    Input.CertifySkinnedSegments=[](const FFlowArtsClearanceArm*,const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&,uint8) {return uint8(51);};
    for(int32 Side=0;Side<2;++Side)
    {
        const double Sign=Side ? 1. : -1.;
        auto& Arm=Input.Arms[Side];
        Arm.Upper=FTransform(FVector(0,Sign*20,80));
        Arm.Elbow=FTransform(FVector(20,Sign*30,60));
        Arm.Wrist=FTransform(FVector(35,Sign*10,65));
        Arm.UpperRadiusCm=Arm.ForearmRadiusCm=2.f;
    }
    FFlowArtsArmClearancePreparedSeed Seed;
    FFlowArtsArmClearanceResult Result;
    TestTrue(TEXT("Source control is a valid exact-length candidate"),
        FFlowArtsArmClearance::PrepareCandidate(Snapshot,0,nullptr,Seed,Result));
    TestTrue(TEXT("Fresh complete certificate is required"),Result.bFeasible);
    for(int32 Side=0;Side<2;++Side)
    {
        TestTrue(TEXT("Source endpoint remains exact"),Seed.SolvedWrists[Side].Equals(Input.Arms[Side].Wrist.GetLocation(),1.e-8));
        TestTrue(TEXT("Source elbow remains exact"),Seed.SolvedElbows[Side].Equals(Input.Arms[Side].Elbow.GetLocation(),1.e-8));
    }
    // Source rotations may contain a branch cliff even when endpoints are continuous.
    // Reusing the absolute anatomical calibration must not reproduce that cliff.
    Input.Arms[0].Upper.SetRotation(FQuat(FVector::ForwardVector,2.1));
    FFlowArtsArmClearancePreparedSeed Next;
    TestTrue(TEXT("Previous absolute calibration projects onto current geometry"),
        FFlowArtsArmClearance::PrepareCandidate(Snapshot,0,&Seed,Next,Result));
    TestTrue(TEXT("Authored quaternion cliff is not inherited"),
        Next.SolvedUpperRotation[0].Equals(Seed.SolvedUpperRotation[0],1.e-8));
    FFlowArtsArmClearancePreparedSeed Mid;
    TestTrue(TEXT("Coherent controls interpolate"),FFlowArtsArmClearance::InterpolatePreparedSeed(Seed,Next,.5,Mid));
    Next.ElbowPole[0]=-Seed.ElbowPole[0];
    TestFalse(TEXT("Antipodal elbow plane cannot be published through a singular midpoint"),
        FFlowArtsArmClearance::InterpolatePreparedSeed(Seed,Next,.5,Mid));
    Seed.HandTranslationCm[0]=FVector(1000,0,0);
    TestFalse(TEXT("Unreachable current target rejects cached control"),
        FFlowArtsArmClearance::PrepareCandidate(Snapshot,0,&Seed,Next,Result));
    return true;
}

#endif
