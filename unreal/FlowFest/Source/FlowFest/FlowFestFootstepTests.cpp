#if WITH_DEV_AUTOMATION_TESTS
#include "FlowFestFootstepComponent.h"

#include "Misc/AutomationTest.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestFootstepTest, "FlowFest.Motion.FootContacts",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowFestFootstepTest::RunTest(const FString& Parameters)
{
    UFlowFestFootstepComponent* Footsteps = NewObject<UFlowFestFootstepComponent>();
    const FVector Feet[2] = {FVector::ZeroVector, FVector::ZeroVector};
    const auto Pose = [Footsteps, &Feet](float Dt, FName Motion, bool bGrounded, float Left, float Right)
    {
        const float Gaps[2] = {Left, Right};
        Footsteps->Evaluate(Dt, Motion, bGrounded, true, Feet, Gaps);
    };
    Pose(.05f, TEXT("Idle"), true, 20.f, 9.f);
    Pose(.05f, TEXT("Idle"), true, 9.f, 20.f);
    TestEqual(TEXT("Idle foot motion stays silent"), Footsteps->GetStepCount(), 0);

    Pose(.05f, TEXT("Walk"), true, 20.f, 9.f);
    Pose(.05f, TEXT("Walk"), true, 9.f, 20.f);
    TestEqual(TEXT("Lift followed by contact makes one step"), Footsteps->GetStepCount(), 1);
    Pose(.05f, TEXT("Walk"), true, 20.f, 9.f);
    TestEqual(TEXT("Short retrigger is suppressed"), Footsteps->GetStepCount(), 1);
    Pose(.1f, TEXT("Walk"), true, 20.f, 20.f);
    Pose(.1f, TEXT("Walk"), true, 20.f, 20.f);
    Pose(.05f, TEXT("Walk"), true, 20.f, 9.f);
    TestEqual(TEXT("Opposite foot contacts after cooldown"), Footsteps->GetStepCount(), 2);

    Pose(.05f, TEXT("Jump"), false, 40.f, 40.f);
    Pose(.05f, TEXT("Fall"), false, 20.f, 20.f);
    Pose(.05f, TEXT("Land"), true, 9.f, 9.f);
    Pose(.05f, TEXT("Land"), true, 9.f, 9.f);
    TestEqual(TEXT("Landing emits once at the ground transition"), Footsteps->GetLandingCount(), 1);
    Pose(.05f, TEXT("Ride"), true, 20.f, 9.f);
    Pose(.05f, TEXT("Ride"), true, 9.f, 20.f);
    Pose(.05f, TEXT("Flow"), false, 20.f, 9.f);
    Pose(.05f, TEXT("Flow"), false, 9.f, 20.f);
    TestEqual(TEXT("Mounted and performance motion stay silent"), Footsteps->GetStepCount(), 2);
    Footsteps->SetEnabled(false);
    Pose(.05f, TEXT("Walk"), true, 20.f, 9.f);
    Pose(.05f, TEXT("Walk"), true, 9.f, 20.f);
    Pose(.05f, TEXT("Land"), true, 9.f, 9.f);
    TestEqual(TEXT("World mute suppresses foot contacts"), Footsteps->GetStepCount(), 2);
    TestEqual(TEXT("World mute suppresses landing"), Footsteps->GetLandingCount(), 1);
    Footsteps->SetEnabled(true);
    Pose(.05f, TEXT("Land"), true, 9.f, 9.f);
    TestEqual(TEXT("Unmuting during landing does not replay it"), Footsteps->GetLandingCount(), 1);
    return !HasAnyErrors();
}
#endif
