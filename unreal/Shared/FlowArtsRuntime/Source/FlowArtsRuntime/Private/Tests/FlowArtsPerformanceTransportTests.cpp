#if WITH_DEV_AUTOMATION_TESTS
#include "FlowFestAnimInstance.h"

#include "Animation/AnimSequence.h"
#include "Components/SkeletalMeshComponent.h"
#include "Misc/AutomationTest.h"
#include "UObject/UObjectGlobals.h"
#include <limits>

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsPerformanceTransportTest,
    "FlowArts.Runtime.PerformanceTransport",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsPerformanceTransportTest::RunTest(const FString& Parameters)
{
    UAnimSequence* Clip = LoadObject<UAnimSequence>(nullptr,
        TEXT("/Game/FlowFest/Characters/x_bot/A_Flow_FirePoi.A_Flow_FirePoi"));
    if (!TestNotNull(TEXT("Deployed body clip"), Clip)) return false;
    const float Length = Clip->GetPlayLength();
    if (!TestTrue(TEXT("Clip has duration"), Length > 1.f)) return false;

    // UAnimInstance has Within=SkeletalMeshComponent, even when its clock is
    // exercised without a registered mesh or world.
    USkeletalMeshComponent* Mesh = NewObject<USkeletalMeshComponent>(GetTransientPackage());
    if (!TestNotNull(TEXT("Animation instance outer"), Mesh)) return false;
    UFlowFestAnimInstance* Anim = NewObject<UFlowFestAnimInstance>(Mesh);
    if (!TestNotNull(TEXT("Shared animation clock"), Anim)) return false;
    Anim->Configure({}, FString());
    Anim->StartPerformance(Clip, true, TEXT("FirePoi"));
    Anim->Advance(.05f);
    Anim->SetPerformanceRate(1.5f);
    TestTrue(TEXT("Rate is retained"), FMath::IsNearlyEqual(Anim->GetPerformanceRate(), 1.5f));
    const float BeforeRateStep = Anim->GetPerformanceTime();
    Anim->Advance(.05f);
    TestTrue(TEXT("Rate controls the shared clock"),
        FMath::IsNearlyEqual(Anim->GetPerformanceTime() - BeforeRateStep, .075f, .0001f));
    Anim->SetPerformanceRate(.1f);
    TestTrue(TEXT("Existing minimum rate is retained"),
        FMath::IsNearlyEqual(Anim->GetPerformanceRate(), .5f));
    Anim->SetPerformanceRate(3.f);
    TestTrue(TEXT("Existing maximum rate is retained"),
        FMath::IsNearlyEqual(Anim->GetPerformanceRate(), 1.75f));

    Anim->StartPerformance(Clip, true, TEXT("OtherProfile"));
    TestEqual(TEXT("Switch creates an outgoing blend"), Anim->GetOutgoingPerformanceCount(), 1);
    float OutgoingTime = 0.f, OutgoingWeight = 0.f;
    FName OutgoingProfile;
    Anim->GetOutgoingPerformanceSample(0, OutgoingTime, OutgoingWeight, OutgoingProfile);
    const float IncomingWeight = Anim->GetPerformanceWeight();
    Anim->SetPerformancePaused(true);
    Anim->Advance(.1f);
    TestTrue(TEXT("Pause freezes current clip"), FMath::IsNearlyZero(Anim->GetPerformanceTime()));
    TestTrue(TEXT("Pause freezes incoming blend"),
        FMath::IsNearlyEqual(Anim->GetPerformanceWeight(), IncomingWeight));
    float FrozenOutgoingTime = 0.f, FrozenOutgoingWeight = 0.f;
    FName FrozenOutgoingProfile;
    Anim->GetOutgoingPerformanceSample(0, FrozenOutgoingTime, FrozenOutgoingWeight, FrozenOutgoingProfile);
    TestTrue(TEXT("Pause freezes outgoing clock and blend"),
        FMath::IsNearlyEqual(FrozenOutgoingTime, OutgoingTime) &&
        FMath::IsNearlyEqual(FrozenOutgoingWeight, OutgoingWeight));

    Anim->SeekPerformance(Length * .4f);
    TestTrue(TEXT("Seek while paused updates current time"),
        FMath::IsNearlyEqual(Anim->GetPerformanceTime(), Length * .4f, .001f));
    TestTrue(TEXT("Seek retains pause"), Anim->IsPerformancePaused());
    TestEqual(TEXT("Seek removes stale outgoing poses"), Anim->GetOutgoingPerformanceCount(), 0);
    TestTrue(TEXT("Seek settles the target pose"), FMath::IsNearlyEqual(Anim->GetPerformanceWeight(), 1.f));
    Anim->Advance(.1f);
    TestTrue(TEXT("Paused seek remains at selected time"),
        FMath::IsNearlyEqual(Anim->GetPerformanceTime(), Length * .4f, .001f));

    Anim->SetPerformanceRate(std::numeric_limits<float>::infinity());
    TestTrue(TEXT("Nonfinite rate is ignored"), FMath::IsNearlyEqual(Anim->GetPerformanceRate(), 1.f));
    Anim->SeekPerformance(std::numeric_limits<float>::quiet_NaN());
    TestTrue(TEXT("Nonfinite seek is ignored"),
        FMath::IsNearlyEqual(Anim->GetPerformanceTime(), Length * .4f, .001f));
    Anim->SetPerformancePhase(std::numeric_limits<float>::infinity());
    TestTrue(TEXT("Nonfinite phase is ignored"),
        FMath::IsNearlyEqual(Anim->GetPerformanceTime(), Length * .4f, .001f));

    Anim->SetPerformancePaused(false);
    const float ResumeTime = Anim->GetPerformanceTime();
    Anim->Advance(.05f);
    TestTrue(TEXT("Resume advances the same clock"),
        FMath::IsNearlyEqual(Anim->GetPerformanceTime() - ResumeTime, .05f, .0001f));
    Anim->SeekPerformance(Length - .02f);
    Anim->Advance(.05f);
    TestTrue(TEXT("Loop wraps at the clip end"),
        FMath::IsNearlyEqual(Anim->GetPerformanceTime(), .03f, .001f));
    Anim->SetPerformancePhase(1.25f);
    TestTrue(TEXT("Existing normalized phase wraps"),
        FMath::IsNearlyEqual(Anim->GetPerformanceTime(), Length * .25f, .001f));
    Anim->SeekPerformance(Length + 5.f);
    TestTrue(TEXT("Seek clamps beyond duration"),
        FMath::IsNearlyEqual(Anim->GetPerformanceTime(), Length, .001f));
    Anim->SetPerformancePaused(true);
    Anim->RestartPerformance();
    TestTrue(TEXT("Restart returns to first frame"), FMath::IsNearlyZero(Anim->GetPerformanceTime()));
    TestFalse(TEXT("Restart resumes by default"), Anim->IsPerformancePaused());
    TestTrue(TEXT("Restart retains rate"), FMath::IsNearlyEqual(Anim->GetPerformanceRate(), 1.f));

    Anim->StartPerformance(Clip, false, TEXT("OneShot"));
    Anim->SeekPerformance(Length - .02f);
    Anim->Advance(.05f);
    TestTrue(TEXT("Nonlooping clip holds its end"),
        FMath::IsNearlyEqual(Anim->GetPerformanceTime(), Length, .001f));
    return true;
}
#endif
