#if WITH_DEV_AUTOMATION_TESTS
#include "Misc/AutomationTest.h"
#include "FlowFestWoods.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestWoodsFillTest, "FlowFest.Environment.WoodsFill",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)

// A 60 m block of 15 m canopy with one placed tree and a road through it fills in as woods:
// crowns over nearly all of it, nothing outside it or on the road, no two trunks touching.
bool FFlowFestWoodsFillTest::RunTest(const FString& Parameters)
{
    const auto Canopy15 = [](const FVector2D& At) { return FMath::Abs(At.X) < 30.f && FMath::Abs(At.Y) < 30.f ? 15.f : 0.f; };
    const auto Road = [](const FVector2D& At) { return FMath::Abs(At.X - 12.f) < 3.f; };
    FCanopyMap Crowns;
    Crowns.Add(FVector2D(-10.f, -10.f), 15.f);
    const TArray<FWoodsFillTree> Planted = FillWoods(FVector2D(-50.f), FVector2D(50.f), Canopy15, Road, Crowns);
    if (!TestTrue(*FString::Printf(TEXT("Planted a stand (%d trees)"), Planted.Num()), Planted.Num() > 60 && Planted.Num() < 250)) return false;

    float NarrowestGap = TNumericLimits<float>::Max();
    for (int32 I = 0; I < Planted.Num(); ++I)
    {
        TestTrue(TEXT("Only under the scanned canopy"), Canopy15(Planted[I].At) > 0.f);
        TestFalse(TEXT("No trunk on the road"), Road(Planted[I].At));
        TestTrue(TEXT("Height follows the scan"), Planted[I].Height >= 13.5f && Planted[I].Height <= 15.f);
        NarrowestGap = FMath::Min(NarrowestGap, FVector2D::Distance(Planted[I].At, FVector2D(-10.f, -10.f)));
        for (int32 J = 0; J < I; ++J) NarrowestGap = FMath::Min(NarrowestGap, FVector2D::Distance(Planted[I].At, Planted[J].At));
    }
    TestTrue(*FString::Printf(TEXT("Trunks keep apart (closest %.2f m)"), NarrowestGap), NarrowestGap >= 3.6f);

    int32 Inside = 0, Shaded = 0;
    for (float Y = -26.f; Y <= 26.f; Y += 1.f)
        for (float X = -26.f; X <= 26.f; X += 1.f)
        {
            if (Road(FVector2D(X, Y))) continue;
            float Trunk = 0.f;
            ++Inside;
            Shaded += Crowns.Cover(FVector2D(X, Y), Trunk) > .3f;
        }
    TestTrue(*FString::Printf(TEXT("Crowns close over the block (%d of %d)"), Shaded, Inside), Shaded >= Inside * .9f);

    FCanopyMap Again;
    Again.Add(FVector2D(-10.f, -10.f), 15.f);
    const TArray<FWoodsFillTree> Repeat = FillWoods(FVector2D(-50.f), FVector2D(50.f), Canopy15, Road, Again);
    TestTrue(TEXT("The same woods grow every run"), Repeat.Num() == Planted.Num() && Repeat.Last().At.Equals(Planted.Last().At));
    return true;
}
#endif
