#if WITH_DEV_AUTOMATION_TESTS
#include "FlowFestAnimInstance.h"
#include "FlowFestStancePlan.h"
#include "Misc/AutomationTest.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestStanceEntryTest,
    "FlowArts.Runtime.Stance.GroundedEntry",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowFestStanceEntryTest::RunTest(const FString& Parameters)
{
    FFlowFestStanceSample Target;
    Target.NeutralBodyOffsetCm = FVector(0., 0., -2.);
    Target.BodyDelta.SetTranslation(Target.NeutralBodyOffsetCm);
    Target.Feet[0].SetLocation(FVector(-12., 0., 0.));
    Target.Feet[1].SetLocation(FVector(12., 0., 0.));
    const FTransform SourceFeet[2] = {
        FTransform(FQuat::Identity, FVector(-12., 0., 2.)),
        FTransform(FQuat::Identity, FVector(12., 0., 2.))};
    TestTrue(TEXT("Measured body offset is neutral support"),
        FFlowFestAnimProxy::IsNeutralStanceEntrySample(Target));

    FFlowFestStanceSample Blended;
    TestTrue(TEXT("Grounded entry starts at the displayed body and feet"),
        FFlowFestAnimProxy::BlendStanceEntrySample(Target, SourceFeet, 0., Blended));
    TestTrue(TEXT("No first-frame body jump"), Blended.BodyDelta.Equals(FTransform::Identity, .001));
    TestTrue(TEXT("No first-frame foot jump"), Blended.Feet[0].Equals(SourceFeet[0], .001) &&
        Blended.Feet[1].Equals(SourceFeet[1], .001));
    TestTrue(TEXT("Grounded entry moves support and body together"),
        FFlowFestAnimProxy::BlendStanceEntrySample(Target, SourceFeet, .5, Blended) &&
        FMath::IsNearlyEqual(Blended.BodyDelta.GetTranslation().Z, -1., .001) &&
        FMath::IsNearlyEqual(Blended.Feet[0].GetLocation().Z, 1., .001) &&
        FMath::IsNearlyEqual(Blended.Feet[1].GetLocation().Z, 1., .001));
    TestTrue(TEXT("Entry ends at the prepared grounded sample"),
        FFlowFestAnimProxy::BlendStanceEntrySample(Target, SourceFeet, 1., Blended) &&
        Blended.BodyDelta.Equals(Target.BodyDelta, .001) &&
        Blended.Feet[0].Equals(Target.Feet[0], .001) &&
        Blended.Feet[1].Equals(Target.Feet[1], .001));

    Target.BodyDelta.AddToTranslation(FVector(1., 0., 0.));
    TestFalse(TEXT("Excursion motion cannot enter through the neutral ramp"),
        FFlowFestAnimProxy::IsNeutralStanceEntrySample(Target));
    TestFalse(TEXT("An excursion cannot be blended as neutral support"),
        FFlowFestAnimProxy::BlendStanceEntrySample(Target, SourceFeet, .5, Blended));

    TArray<FVector> WeightedFeet[2];
    WeightedFeet[0].Add(FVector(-12., 0., 2.035344));
    WeightedFeet[1].Add(FVector(12., 0., 2.035344));
    TestTrue(TEXT("An initial foot gap is allowed during the entry ramp"),
        FFlowFestAnimProxy::AreStanceFootSurfacesGrounded(WeightedFeet,
            FVector::ZeroVector, FVector::UpVector, .5, 2., false));
    TestFalse(TEXT("The same gap cannot certify a completed planted stance"),
        FFlowFestAnimProxy::AreStanceFootSurfacesGrounded(WeightedFeet,
            FVector::ZeroVector, FVector::UpVector, .5, 2., true));
    WeightedFeet[0].Add(FVector(-12., 1., -.51));
    TestFalse(TEXT("A weighted vertex penetrating the floor cancels the trial"),
        FFlowFestAnimProxy::AreStanceFootSurfacesGrounded(WeightedFeet,
            FVector::ZeroVector, FVector::UpVector, .5, 2., false));
    WeightedFeet[0].Reset();
    TestFalse(TEXT("An empty weighted foot cannot pass a ground check"),
        FFlowFestAnimProxy::AreStanceFootSurfacesGrounded(WeightedFeet,
            FVector::ZeroVector, FVector::UpVector, .5, 2., false));
    return true;
}
#endif
