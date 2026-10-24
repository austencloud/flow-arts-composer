#if WITH_DEV_AUTOMATION_TESTS
#include "FlowArtsArmClearance.h"
#include "FlowArtsSkinnedClearance.h"
#include "Misc/AutomationTest.h"
#include <limits>

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsHeadClearanceTest,
    "FlowArts.Runtime.Clearance.SamePoseForearmHead",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsHeadClearanceTest::RunTest(const FString& Parameters)
{
    const TArray<int32> SeparateRoots{INDEX_NONE, 0, 0, 1, 2};
    TestEqual(TEXT("Separate neck branch is included"),
        FFlowArtsSkinnedClearance::HeadOrNeckAncestryMask(SeparateRoots, 3, 1, 2), uint8(1));
    TestEqual(TEXT("Separate head branch is included"),
        FFlowArtsSkinnedClearance::HeadOrNeckAncestryMask(SeparateRoots, 4, 1, 2), uint8(2));
    TestEqual(TEXT("Missing head root cannot form a cover"),
        FFlowArtsSkinnedClearance::HeadOrNeckAncestryMask(SeparateRoots, 4, 1, INDEX_NONE), uint8(0));
    const TArray<int32> NestedRoots{INDEX_NONE, 0, 1, 2};
    TestEqual(TEXT("Typical head branch includes both roots"),
        FFlowArtsSkinnedClearance::HeadOrNeckAncestryMask(NestedRoots, 3, 1, 2), uint8(3));

    FFlowArtsSkinnedClearanceData Data;
    Data.ReferenceBoneCount = 2; // Neck and a mixed-weight torso bone.
    Data.HeadInfluenceBone = 0;
    Data.HeadInfluenceHeadBone = 0;
    Data.bHeadInfluenceCoverComplete = true;
    Data.Vertices.SetNum(3);
    Data.Vertices[0] = {0, 2};
    Data.Vertices[1] = {2, 1};
    Data.Vertices[2] = {3, 1};
    Data.Influences.Add({0, FVector(10., 0., 0.), .5f});
    Data.Influences.Add({1, FVector::ZeroVector, .5f});
    Data.Influences.Add({0, FVector(10., 1., 0.), 1.f});
    Data.Influences.Add({0, FVector(10., 0., 1.), 1.f});
    Data.HeadInfluenceTriangles.Add(FIntVector(0, 1, 2));
    TArray<FTransform> Pose;
    Pose.Add(FTransform::Identity);
    Pose.Add(FTransform::Identity);
    const FFlowArtsClearanceCapsule Left{FVector::ZeroVector, FVector::ZeroVector, .7f};
    const FFlowArtsClearanceCapsule Right{FVector(10., .2, .2), FVector(10., .2, .2), .7f};
    const auto Certify = [&](const FFlowArtsClearanceCapsule& L, const FFlowArtsClearanceCapsule& R)
    { return FFlowArtsSkinnedClearance::CertifyForearmHeadClear(Data, Pose, .3f, L, R); };
    const auto Measure = [&](const FFlowArtsClearanceCapsule& L, const FFlowArtsClearanceCapsule& R,
        FFlowArtsHeadSurfaceDistance (&Out)[2])
    { FFlowArtsSkinnedClearance::MeasureForearmHeadSurface(Data, Pose, .3f, L, R, Out); };

    FFlowArtsHeadSurfaceDistance Distances[2];
    Measure(Left, Right, Distances);
    TestTrue(TEXT("Separated open head surface has a valid measured distance"), Distances[0].bValid);
    TestTrue(TEXT("Separated surface has positive signed margin"),
        FMath::IsNearlyEqual(Distances[0].AxisDistanceCm, 5., 1.e-6) &&
        FMath::IsNearlyEqual(Distances[0].SignedMarginCm, 4., 1.e-6));
    TestEqual(TEXT("Nearest original head face is retained"), Distances[0].TriangleIndex, 0);
    TestEqual(TEXT("Nearest face retains original indices"), Distances[0].VertexIndices,
        FIntVector(0, 1, 2));
    TestEqual(TEXT("Mixed corner retains both skin influences"),
        Distances[0].CornerInfluences[0], FString(TEXT("0:0.5,1:0.5")));
    TestTrue(TEXT("Overlapping surface gives negative signed margin"),
        Distances[1].bValid && Distances[1].SignedMarginCm < 0.);

    TestEqual(TEXT("Only actually separated forearm is certified"), Certify(Left, Right), uint8(1));
    // The first face vertex has a torso weight. Skinning that weight into this
    // same pose moves the full mixed face onto the unchanged left capsule.
    Pose[1].SetTranslation(FVector(-8., 0., 0.));
    TestEqual(TEXT("Mixed-weight posed face blocks a false clear"), Certify(Left, Right), uint8(0));
    Pose[1] = FTransform::Identity;

    const FFlowArtsClearanceCapsule Touching{FVector(4., 0., 0.), FVector(4., 0., 0.), .7f};
    TestEqual(TEXT("Padding and roundoff make a touching envelope inconclusive"),
        Certify(Touching, Right), uint8(0));
    const FFlowArtsClearanceCapsule Contained{FVector(7., .2, .2), FVector(7., .2, .2), 5.f};
    TestEqual(TEXT("Contained capsule never receives a separation bit"),
        Certify(Contained, Right), uint8(0));
    Measure(Touching, Left, Distances);
    TestTrue(TEXT("Touching padded surface has zero measured margin"),
        Distances[0].bValid && FMath::Abs(Distances[0].SignedMarginCm) < 1.e-6);
    const FFlowArtsClearanceCapsule SurfaceCross{FVector(4., 0., 0.),
        FVector(6., 0., 0.), .7f};
    Measure(SurfaceCross, Left, Distances);
    TestTrue(TEXT("Segment crossing original head face has zero axis distance"),
        Distances[0].bValid && FMath::Abs(Distances[0].AxisDistanceCm) < 1.e-6 &&
        Distances[0].SignedMarginCm < 0.);

    Data.UncappedArmBone[0] = 0;
    Data.DistalArmBone[0] = 0;
    Data.Vertices.Add({4, 1});
    Data.Vertices.Add({5, 1});
    Data.Vertices.Add({6, 1});
    Data.Influences.Add({0, FVector(0., 0., 0.), 1.f});
    Data.Influences.Add({0, FVector(0., 1., 0.), 1.f});
    Data.Influences.Add({0, FVector(0., 0., 1.), 1.f});
    Data.UncappedArmTriangles[0].Add(FIntVector(3, 4, 5));
    Data.DistalArmTriangles[0].Add(FIntVector(3, 4, 5));
    const auto MeasureSkin = [&]()
    {
        FFlowArtsHeadSkinDistance Out[2];
        FFlowArtsSkinnedClearance::MeasureDistalHeadSkin(Data, Pose, .3f, Out, 1);
        return Out[0];
    };
    auto SkinDistance = MeasureSkin();
    TestTrue(TEXT("Whole posed arm skin separates from head despite touching capsule"),
        SkinDistance.bValid && SkinDistance.bWholeArmProjectionSeparated &&
        SkinDistance.BestProjectionGapCm > 4.);
    Pose[1].SetTranslation(FVector(-10., 0., 0.));
    SkinDistance = MeasureSkin();
    TestTrue(TEXT("Mixed-weight head corner moves into distal skin in same pose"),
        SkinDistance.bValid && !SkinDistance.bWholeArmProjectionSeparated &&
        SkinDistance.bDistalSurfaceNear && SkinDistance.WitnessSurfaceDistanceCm < 1.e-6);
    Pose[1] = FTransform::Identity;

    // An upper-only influenced face can defeat whole-arm separation even when
    // the distal face remains distant. Do not infer clearance from distal alone.
    Data.Vertices.Add({7, 1});
    Data.Vertices.Add({8, 1});
    Data.Vertices.Add({9, 1});
    Data.Influences.Add({1, FVector(6., .1, .1), 1.f});
    Data.Influences.Add({1, FVector(6., .2, .1), 1.f});
    Data.Influences.Add({1, FVector(6., .1, .2), 1.f});
    Data.UncappedArmTriangles[0].Add(FIntVector(6, 7, 8));
    SkinDistance = MeasureSkin();
    TestTrue(TEXT("Upper-only face prevents false whole-arm separation"),
        SkinDistance.bValid && !SkinDistance.bWholeArmProjectionSeparated &&
        !SkinDistance.bDistalSurfaceNear);
    Data.UncappedArmTriangles[0].Pop();
    Data.DistalArmTriangles[0].Reset();
    TestFalse(TEXT("Missing distal region has no diagnostic measurement"), MeasureSkin().bValid);
    Data.DistalArmTriangles[0].Add(FIntVector(3, 4, 5));
    Data.Influences[4].Weight = std::numeric_limits<float>::quiet_NaN();
    TestFalse(TEXT("Nonfinite distal skin has no diagnostic measurement"), MeasureSkin().bValid);
    Data.Influences[4].Weight = 1.f;

    Data.HeadInfluenceTriangles.Reset();
    TestEqual(TEXT("Missing head faces fail closed"), Certify(Left, Right), uint8(0));
    Measure(Left, Right, Distances);
    TestFalse(TEXT("Missing head faces have no diagnostic measurement"), Distances[0].bValid);
    TestFalse(TEXT("Missing head faces invalidate skin measurement"), MeasureSkin().bValid);
    Data.HeadInfluenceTriangles.Add(FIntVector(0, 1, 2));
    Data.bHeadInfluenceCoverComplete = false;
    TestEqual(TEXT("Unproved head cover fails closed"), Certify(Left, Right), uint8(0));
    Data.bHeadInfluenceCoverComplete = true;
    Data.Influences[0].Weight = std::numeric_limits<float>::quiet_NaN();
    TestEqual(TEXT("Nonfinite skin weight fails closed"), Certify(Left, Right), uint8(0));
    Measure(Left, Right, Distances);
    TestFalse(TEXT("Nonfinite skin weight has no diagnostic measurement"), Distances[0].bValid);
    TestFalse(TEXT("Nonfinite head skin invalidates arm measurement"), MeasureSkin().bValid);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsClosedHeadSkinTest,
    "FlowArts.Runtime.Clearance.ClosedHeadSkin",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsClosedHeadSkinTest::RunTest(const FString& Parameters)
{
    using FData = FFlowArtsSkinnedClearanceData;
    using FRegion = FData::FClosedInfluenceRegion;
    FData Data;
    Data.ReferenceBoneCount = 3; // Head, arm, optional mixed-weight bone.
    Data.HeadInfluenceBone = 0;
    Data.HeadInfluenceHeadBone = 0;
    Data.bHeadInfluenceCoverComplete = true;
    TArray<FTransform> Pose;
    Pose.Add(FTransform::Identity);
    Pose.Add(FTransform::Identity);
    Pose.Add(FTransform::Identity);
    const auto AddTetra = [&](FRegion& Region, const FVector& Origin, double Size, int32 Bone)
    {
        const int32 First = Data.Vertices.Num();
        const FVector Corners[4] = {Origin, Origin + FVector(Size, 0., 0.),
            Origin + FVector(0., Size, 0.), Origin + FVector(0., 0., Size)};
        for (const FVector& Corner : Corners)
        {
            Data.Vertices.Add({Data.Influences.Num(), 1});
            Data.Influences.Add({Bone, Corner, 1.f});
        }
        const int32 Component = Region.Witnesses.Num();
        const int32 FirstFace = Region.Triangles.Num();
        for (const FIntVector& Face : {FIntVector(0, 2, 1), FIntVector(0, 1, 3),
            FIntVector(0, 3, 2), FIntVector(1, 2, 3)})
        {
            Region.Triangles.Add(FIntVector(First + Face.X, First + Face.Y, First + Face.Z));
            Region.Components.Add(Component);
        }
        Region.Witnesses.Add(FirstFace);
        Region.OriginalTriangleCount = Region.Triangles.Num();
        Region.bClosureValidated = true;
    };
    const auto Topology = [&](FRegion& Region)
    {
        TArray<FIntVector>* Originals = &Region == &Data.ClosedInfluenceHead
            ? &Data.HeadInfluenceTriangles : &Data.UncappedArmTriangles[0];
        Originals->Reset();
        for (int32 I = 0; I < Region.OriginalTriangleCount; ++I)
            Originals->Add(Region.Triangles[I]);
        Region.Topology.Nodes.Reset();
        Region.Topology.Order.Reset();
        FData::FSurfaceNode Root;
        Root.Begin = 0;
        Root.End = Region.Triangles.Num();
        Region.Topology.Nodes.Add(Root);
        for (int32 I = 0; I < Region.Triangles.Num(); ++I) Region.Topology.Order.Add(I);
    };
    const auto Query = [&](FFlowArtsHeadSkinCertificateDiagnostics* Diagnostic = nullptr)
    {
        return FFlowArtsSkinnedClearance::CertifyForearmHeadSkinClear(Data, Pose, .3f, 1, Diagnostic);
    };

    AddTetra(Data.ClosedInfluenceHead, FVector::ZeroVector, 1., 0);
    AddTetra(Data.ClosedInfluenceArm[0], FVector(.7, .7, .7), 1., 1);
    Topology(Data.ClosedInfluenceHead);
    Topology(Data.ClosedInfluenceArm[0]);
    FFlowArtsHeadSkinCertificateDiagnostics Diagnostic;
    TestEqual(TEXT("Separated closed original skins certify the left side"), Query(&Diagnostic), uint8(1));
    TestEqual(TEXT("Clear side has no rejection reason"), Diagnostic.Reason[0], uint8(0));
    TestEqual(TEXT("Original head faces are reported"), Diagnostic.HeadOriginalTriangles, 4);
    TestEqual(TEXT("No synthetic cap is mistaken for an original"), Diagnostic.HeadCapTriangles, 0);

    // Axis-aligned convex envelopes of these disconnected closed components
    // overlap, but every actual component surface is far apart.
    Data = FData();
    Data.ReferenceBoneCount = 3;
    Data.HeadInfluenceBone = Data.HeadInfluenceHeadBone = 0;
    Data.bHeadInfluenceCoverComplete = true;
    AddTetra(Data.ClosedInfluenceHead, FVector(-5., 0., 0.), .5, 0);
    AddTetra(Data.ClosedInfluenceHead, FVector(5., 0., 0.), .5, 0);
    AddTetra(Data.ClosedInfluenceArm[0], FVector(0., -5., 0.), .5, 1);
    AddTetra(Data.ClosedInfluenceArm[0], FVector(0., 5., 0.), .5, 1);
    Topology(Data.ClosedInfluenceHead);
    Topology(Data.ClosedInfluenceArm[0]);
    TestEqual(TEXT("Disconnected nonconvex regions certify by exact surfaces and both-way escape rays"),
        Query(), uint8(1));

    Data = FData();
    Data.ReferenceBoneCount = 3;
    Data.HeadInfluenceBone = Data.HeadInfluenceHeadBone = 0;
    Data.bHeadInfluenceCoverComplete = true;
    AddTetra(Data.ClosedInfluenceHead, FVector::ZeroVector, 1., 0);
    AddTetra(Data.ClosedInfluenceArm[0], FVector(.4, .4, .4), 1., 1);
    Topology(Data.ClosedInfluenceHead);
    Topology(Data.ClosedInfluenceArm[0]);
    TestEqual(TEXT("Faces closer than padding cannot certify"), Query(&Diagnostic), uint8(0));
    TestEqual(TEXT("Original surface proximity is diagnosed"), Diagnostic.Reason[0], uint8(4));
    TestFalse(TEXT("Near head face was original"), Diagnostic.bHeadContactIsCap[0]);

    Data = FData();
    Data.ReferenceBoneCount = 3;
    Data.HeadInfluenceBone = Data.HeadInfluenceHeadBone = 0;
    Data.bHeadInfluenceCoverComplete = true;
    AddTetra(Data.ClosedInfluenceHead, FVector::ZeroVector, 10., 0);
    AddTetra(Data.ClosedInfluenceArm[0], FVector(1., 1., 1.), 1., 1);
    Topology(Data.ClosedInfluenceHead);
    Topology(Data.ClosedInfluenceArm[0]);
    TestEqual(TEXT("Arm completely inside head remains inconclusive"), Query(&Diagnostic), uint8(0));
    TestEqual(TEXT("Arm-in-head containment reason"), Diagnostic.Reason[0], uint8(5));
    Swap(Data.ClosedInfluenceHead, Data.ClosedInfluenceArm[0]);
    TestEqual(TEXT("Head completely inside arm remains inconclusive"), Query(&Diagnostic), uint8(0));
    TestEqual(TEXT("Head-in-arm containment reason"), Diagnostic.Reason[0], uint8(6));

    Data = FData();
    Data.ReferenceBoneCount = 3;
    Data.HeadInfluenceBone = Data.HeadInfluenceHeadBone = 0;
    Data.bHeadInfluenceCoverComplete = true;
    AddTetra(Data.ClosedInfluenceHead, FVector::ZeroVector, 1., 0);
    AddTetra(Data.ClosedInfluenceArm[0], FVector(.7, .7, .7), 1., 1);
    Topology(Data.ClosedInfluenceHead);
    Topology(Data.ClosedInfluenceArm[0]);
    const int32 HeadCorner = Data.ClosedInfluenceHead.Triangles[0].X;
    const int32 MixedFirst = Data.Influences.Num();
    Data.Vertices[HeadCorner] = {MixedFirst, 2};
    Data.Influences.Add({0, FVector::ZeroVector, .5f});
    Data.Influences.Add({2, FVector::ZeroVector, .5f});
    Pose[2].SetTranslation(FVector(1.4, 1.4, 1.4));
    TestEqual(TEXT("Every mixed-weight corner uses the current posed transform"), Query(), uint8(0));
    Pose[2] = FTransform::Identity;
    Data.Influences[MixedFirst].Weight = std::numeric_limits<float>::quiet_NaN();
    TestEqual(TEXT("Nonfinite influence fails closed"), Query(&Diagnostic), uint8(0));
    TestEqual(TEXT("Invalid posed data is diagnosed"), Diagnostic.Reason[0], uint8(2));
    Data.Influences[MixedFirst].Weight = .5f;

    AddTetra(Data.ClosedInfluenceArm[0], FVector(.15, .15, .15), .1, 1);
    Topology(Data.ClosedInfluenceArm[0]);
    TestEqual(TEXT("An extra upper-only closed component near the head prevents a false clear"),
        Query(), uint8(0));
    Data.ClosedInfluenceArm[0] = FRegion();
    AddTetra(Data.ClosedInfluenceArm[0], FVector(.7, .7, .7), 1., 1);
    Topology(Data.ClosedInfluenceArm[0]);
    const int32 SharedArmVertex = Data.ClosedInfluenceArm[0].Triangles[0].X;
    for (FIntVector& Face : Data.ClosedInfluenceArm[0].Triangles)
        for (int32 Corner = 0; Corner < 3; ++Corner)
            if (Face[Corner] == SharedArmVertex) Face[Corner] = HeadCorner;
    TestEqual(TEXT("Shared original vertex never certifies"), Query(&Diagnostic), uint8(0));
    TestEqual(TEXT("Shared original vertex is diagnosed"), Diagnostic.Reason[0], uint8(3));
    for (FIntVector& Face : Data.ClosedInfluenceArm[0].Triangles)
        for (int32 Corner = 0; Corner < 3; ++Corner)
            if (Face[Corner] == HeadCorner) Face[Corner] = SharedArmVertex;
    Data.ClosedInfluenceArm[0].Triangles[0] = Data.ClosedInfluenceArm[0].Triangles[1];
    TestEqual(TEXT("Malformed nonmanifold triangle set cannot certify"), Query(), uint8(0));
    Data.ClosedInfluenceArm[0].Triangles[0] = Data.UncappedArmTriangles[0][0];
    Data.ClosedInfluenceArm[0].bClosureValidated = false;
    TestEqual(TEXT("Unvalidated closure cannot certify"), Query(&Diagnostic), uint8(0));
    TestEqual(TEXT("Missing validated closure is diagnosed"), Diagnostic.Reason[0], uint8(1));
    return true;
}
#endif
