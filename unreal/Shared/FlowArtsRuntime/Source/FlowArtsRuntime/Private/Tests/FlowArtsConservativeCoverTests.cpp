#include "FlowArtsConservativeCover.h"
#include "Misc/AutomationTest.h"
#include <limits>

#if WITH_DEV_AUTOMATION_TESTS
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsConservativeCoverTest,
    "FlowArts.Clearance.ConservativeOpenCover",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsConservativeCoverTest::RunTest(const FString& Parameters)
{
    using namespace FlowArtsConservativeCover;
    // Open sleeve and shirt/pants surfaces: no cap or inside/outside assumption.
    const TArray<FIntVector> Faces = {
        FIntVector(0, 1, 2), FIntVector(3, 4, 5), FIntVector(6, 7, 8)};
    const TArray<int32> Weld = {0, 1, 2, 3, 4, 5, 3, 7, 8};
    TArray<TArray<int32>> Components;
    TestTrue(TEXT("partitions every original face"),
        PartitionOriginalFaces(Faces, Weld, 9, Components));
    TestEqual(TEXT("open sleeve and body remain two components"), Components.Num(), 2);
    if (Components.Num() != 2) return false;
    TestEqual(TEXT("sleeve covers its three vertices"), Components[0].Num(), 3);
    TestEqual(TEXT("welded shirt/pants component covers both faces"), Components[1].Num(), 6);
    TArray<FVector> Posed = {
        FVector(0, 0, 0), FVector(0, 1, 0), FVector(0, 0, 1),
        FVector(10, 0, 0), FVector(10, 1, 0), FVector(10, 0, 1),
        FVector(12, 0, 0), FVector(12, 1, 0), FVector(12, 0, 1)};
    const TArray<FVector> Axes = {FVector(3, 0, 0), FVector(0, 1, 0)};
    TestTrue(TEXT("separated open surfaces certify"),
        SeparateVertices(Posed, Components[0], Components[1], Axes, 1.));
    TestTrue(TEXT("capsule with strict radius and padding gap certifies"),
        SeparateCapsule(Posed, Components[1], FVector(0, 0, 0),
            FVector(0, 0, 1), 2., Axes, 1.));
    TestFalse(TEXT("radius plus padding touching does not certify"),
        SeparateCapsule(Posed, Components[1], FVector(0, 0, 0),
            FVector(0, 0, 1), 9., Axes, 1.));
    const TArray<FVector> ClippedPolygon = {
        FVector(0, 0, 0), FVector(0, 0, 1), FVector(0, 1, 0)};
    TestTrue(TEXT("actual clipped polygon separates from body"),
        SeparatePolygon(Posed, Components[1], ClippedPolygon, Axes, 1.));
    Posed[4].X = 0.;
    TestFalse(TEXT("posed update, including every component vertex, changes verdict"),
        SeparateVertices(Posed, Components[0], Components[1], Axes, 1.));
    TestFalse(TEXT("overlapping body rejects polygon"),
        SeparatePolygon(Posed, Components[1], ClippedPolygon, Axes, 1.));
    TestFalse(TEXT("contained point is inconclusive"),
        SeparateVertices(Posed, {0}, {0, 1, 2}, Axes, 0.));

    TArray<TArray<int32>> InvalidComponents;
    TestFalse(TEXT("face with missing posed vertex cannot partition"),
        PartitionOriginalFaces({FIntVector(0, 1, 9)}, Weld, 9, InvalidComponents));
    TestTrue(TEXT("failed partition clears output"), InvalidComponents.IsEmpty());
    TestFalse(TEXT("missing original faces cannot certify"),
        PartitionOriginalFaces({}, Weld, 9, InvalidComponents));
    TestFalse(TEXT("incomplete weld references cannot partition"),
        PartitionOriginalFaces(Faces, {0, 1}, 9, InvalidComponents));
    TestFalse(TEXT("invalid component reference cannot certify"),
        SeparateVertices(Posed, {0}, {9}, Axes, 0.));
    TestFalse(TEXT("empty component cannot certify"),
        SeparateVertices(Posed, {}, {3}, Axes, 0.));
    TestFalse(TEXT("invalid radius cannot certify"),
        SeparateCapsule(Posed, {3}, FVector::ZeroVector, FVector::ZeroVector,
            -1., Axes, 0.));
    TestFalse(TEXT("invalid axis cannot certify"),
        SeparateVertices(Posed, {0}, {3}, {FVector::ZeroVector}, 0.));
    Posed[3].X = std::numeric_limits<double>::quiet_NaN();
    TestFalse(TEXT("nonfinite posed point cannot certify"),
        SeparateVertices(Posed, {0}, Components[1], Axes, 0.));
    return true;
}
#endif
