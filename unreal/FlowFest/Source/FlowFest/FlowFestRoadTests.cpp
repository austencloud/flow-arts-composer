#if WITH_DEV_AUTOMATION_TESTS
#include "Misc/AutomationTest.h"
#include "FlowFestRoadShape.h"
#if WITH_EDITOR
#include "Materials/Material.h"
#include "Materials/MaterialExpressionVertexColor.h"
#endif

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestRoadShapeTest, "FlowFest.Environment.RoadShape",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)

// A surveyed right-angle corner becomes an even, smooth curve that still passes through
// every surveyed point, with sides square to the road.
bool FFlowFestRoadShapeTest::RunTest(const FString& Parameters)
{
    const TArray<FVector2D> Corner = { FVector2D(0, 0), FVector2D(20, 0), FVector2D(20, 20) };
    const TArray<FRoadStation> Stations = SmoothRoad(Corner);
    if (!TestTrue(TEXT("Corner sampled about every metre"), Stations.Num() >= 38 && Stations.Num() <= 42)) return false;
    TestTrue(TEXT("Starts on the first point"), Stations[0].At.Equals(Corner[0], .01f));
    TestTrue(TEXT("Ends on the last point"), Stations.Last().At.Equals(Corner.Last(), .01f));
    float NearCorner = TNumericLimits<float>::Max(), WidestTurn = 0.f, WidestGap = 0.f, NarrowestGap = TNumericLimits<float>::Max();
    for (int32 I = 0; I < Stations.Num(); ++I)
    {
        NearCorner = FMath::Min(NearCorner, FVector2D::Distance(Stations[I].At, Corner[1]));
        TestTrue(TEXT("Side is a unit vector"), FMath::IsNearlyEqual(Stations[I].Side.Size(), 1.f, .001f));
        if (I == 0) continue;
        const float Gap = FVector2D::Distance(Stations[I - 1].At, Stations[I].At);
        WidestGap = FMath::Max(WidestGap, Gap);
        NarrowestGap = FMath::Min(NarrowestGap, Gap);
        WidestTurn = FMath::Max(WidestTurn, FMath::RadiansToDegrees(FMath::Acos(FMath::Clamp(FVector2D::DotProduct(Stations[I - 1].Side, Stations[I].Side), -1.f, 1.f))));
        const FVector2D Direction = (Stations[I].At - Stations[I - 1].At).GetSafeNormal();
        TestTrue(TEXT("Side is square to the road"), FMath::Abs(FVector2D::DotProduct(Direction, Stations[I].Side)) < .35f);
    }
    TestTrue(*FString::Printf(TEXT("Passes the surveyed corner (%.3f m away)"), NearCorner), NearCorner < .6f);
    TestTrue(*FString::Printf(TEXT("Even spacing (%.2f to %.2f m)"), NarrowestGap, WidestGap), NarrowestGap > .85f && WidestGap < 1.1f);
    TestTrue(*FString::Printf(TEXT("No step at the corner (widest turn %.1f degrees)"), WidestTurn), WidestTurn < 20.f);

    const TArray<FRoadStation> Straight = SmoothRoad({ FVector2D(5, 5), FVector2D(5, 5), FVector2D(5, 15) });
    TestEqual(TEXT("Repeated points dropped and a straight run kept straight"), Straight.Num(), 11);
    for (const FRoadStation& Station : Straight) TestTrue(TEXT("Straight stays on its line"), FMath::IsNearlyEqual(Station.At.X, 5.f, .001f));
    TestEqual(TEXT("A single point draws nothing"), SmoothRoad({ FVector2D(1, 1) }).Num(), 0);

#if WITH_EDITOR
    // The road materials fade their shoulders by vertex colour and dithered opacity.
    for (const TCHAR* Name : { TEXT("M_Dirt"), TEXT("M_Asphalt") })
    {
        const UMaterial* Material = LoadObject<UMaterial>(nullptr, *FString::Printf(TEXT("/Game/FlowFest/Materials/%s.%s"), Name, Name));
        if (!TestNotNull(*FString::Printf(TEXT("%s exists"), Name), Material)) continue;
        TestEqual(*FString::Printf(TEXT("%s is masked"), Name), Material->GetBlendMode(), BLEND_Masked);
        bool bVertexColour = false;
        for (const UMaterialExpression* Expression : Material->GetExpressions())
            bVertexColour |= Expression->IsA<UMaterialExpressionVertexColor>();
        TestTrue(*FString::Printf(TEXT("%s dithers its edges"), Name), Material->DitherOpacityMask != 0);
        TestTrue(*FString::Printf(TEXT("%s reads the road's vertex colour"), Name), bVertexColour);
    }
#endif
    return true;
}
#endif
