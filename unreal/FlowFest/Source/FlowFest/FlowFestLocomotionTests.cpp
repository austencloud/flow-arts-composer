#if WITH_DEV_AUTOMATION_TESTS
#include "FlowFestAnimInstance.h"
#include "FlowFestAvatarComponent.h"

#include "Components/SceneComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "Misc/AutomationTest.h"
#include "UObject/UObjectGlobals.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestLocomotionTest, "FlowFest.Motion.LocomotionTransitions",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowFestLocomotionTest::RunTest(const FString& Parameters)
{
    UWorld::InitializationValues WorldSettings;
    WorldSettings.AllowAudioPlayback(false).CreatePhysicsScene(false).CreateNavigation(false).CreateAISystem(false);
    UWorld* World = UWorld::CreateWorld(EWorldType::Game, false,
        MakeUniqueObjectName(GetTransientPackage(), UWorld::StaticClass(), TEXT("FlowFestLocomotionTestWorld")),
        GetTransientPackage(), true, ERHIFeatureLevel::Num, &WorldSettings);
    if (!TestNotNull(TEXT("Transient locomotion world"), World)) return false;
    struct FDestroyWorld { UWorld* Value; ~FDestroyWorld() { Value->DestroyWorld(false); } } Cleanup{World};

    AActor* Actor = World->SpawnActor<AActor>();
    if (!TestNotNull(TEXT("Transient performer"), Actor)) return false;
    USceneComponent* Root = NewObject<USceneComponent>(Actor);
    Actor->SetRootComponent(Root);
    Root->RegisterComponent();
    UFlowFestAvatarComponent* Avatar = NewObject<UFlowFestAvatarComponent>(Actor);
    Avatar->RegisterComponent();
    Avatar->Initialize(Root, TEXT("x-bot"));
    USkeletalMeshComponent* Body = Avatar->GetBodyMesh();
    if (!TestNotNull(TEXT("Imported skinned body"), Body)) return false;
    UFlowFestAnimInstance* Anim = Cast<UFlowFestAnimInstance>(Body->GetAnimInstance());
    if (!TestNotNull(TEXT("Native blended animation instance"), Anim)) return false;

    static constexpr const TCHAR* MotionNames[] = {
        TEXT("Idle"), TEXT("Walk"), TEXT("Run"), TEXT("Jump"), TEXT("Fall"), TEXT("Land"),
        TEXT("Backward"), TEXT("StrafeLeft"), TEXT("StrafeRight"),
        TEXT("RunStrafeLeft"), TEXT("RunStrafeRight"), TEXT("Ride")
    };
    const auto Step = [this, World, Avatar, Body, Anim](float Seconds)
    {
        World->TimeSeconds += Seconds;
        Body->TickAnimation(Seconds, false);
        Body->RefreshBoneTransforms();
        Avatar->TickComponent(Seconds, LEVELTICK_All, nullptr);
        float Sum = Anim->GetPerformanceWeight() + Anim->GetOutgoingPerformanceWeight();
        bool bFinite = FMath::IsFinite(Sum) && Sum >= 0.f && Sum <= 1.f;
        for (const TCHAR* Name : MotionNames)
        {
            const float Weight = Anim->GetMotionWeight(FName(Name));
            Sum += Weight;
            bFinite &= FMath::IsFinite(Weight) && Weight >= 0.f && Weight <= 1.f;
        }
        const auto Finite = [](const FVector& Point)
        {
            return FMath::IsFinite(Point.X) && FMath::IsFinite(Point.Y) && FMath::IsFinite(Point.Z);
        };
        bFinite &= Finite(Body->GetSocketLocation(TEXT("Hips"))) &&
            Finite(Body->GetSocketLocation(TEXT("Head"))) &&
            Finite(Body->GetSocketLocation(TEXT("LeftFoot"))) &&
            Finite(Body->GetSocketLocation(TEXT("RightFoot")));
        TestTrue(TEXT("Finite pose and normalized blend weights"), bFinite && FMath::IsNearlyEqual(Sum, 1.f, .002f));
    };
    const auto Settle = [&Step](int32 Count = 12)
    {
        for (int32 Index = 0; Index < Count; ++Index) Step(.05f);
    };
    const auto Motion = [this, Avatar](const TCHAR* Expected)
    {
        TestEqual(*FString::Printf(TEXT("Selected motion %s"), Expected), Avatar->GetMotionName(), FName(Expected));
    };

    Motion(TEXT("Idle"));
    Avatar->SetMotion(FVector(120, 0, 0), false, false);
    Motion(TEXT("Walk"));
    Step(.05f);
    TestTrue(TEXT("Walk enters with a skeletal crossfade"),
        Anim->GetMotionWeight(TEXT("Walk")) > 0.f && Anim->GetMotionWeight(TEXT("Idle")) > 0.f);
    Settle();
    Avatar->SetMotion(FVector(500, 0, 0), false, false);
    Motion(TEXT("Run"));
    Step(.05f);
    TestTrue(TEXT("Run enters with a skeletal crossfade"),
        Anim->GetMotionWeight(TEXT("Run")) > 0.f && Anim->GetMotionWeight(TEXT("Walk")) > 0.f);
    Avatar->SetMotion(FVector(400, 0, 0), false, false);
    Motion(TEXT("Run"));
    Avatar->SetMotion(FVector(360, 0, 0), false, false);
    Motion(TEXT("Walk"));
    Avatar->SetMotion(FVector(0, -150, 0), false, false);
    Motion(TEXT("StrafeLeft"));
    Avatar->SetMotion(FVector(-150, 0, 0), false, false);
    Motion(TEXT("Backward"));
    Avatar->SetMotion(FVector(0, 0, 0), false, false);
    Motion(TEXT("Idle"));
    Settle();

    Avatar->SetMotion(FVector(0, 0, 200), true, false);
    Motion(TEXT("Jump"));
    Step(.05f);
    Avatar->SetMotion(FVector(0, 0, -180), true, false);
    Motion(TEXT("Jump"));
    Settle(10);
    Avatar->SetMotion(FVector(0, 0, -180), true, false);
    Motion(TEXT("Fall"));
    Avatar->SetMotion(FVector::ZeroVector, false, false);
    Motion(TEXT("Land"));
    Step(.05f);
    TestTrue(TEXT("Landing blends from fall"),
        Anim->GetMotionWeight(TEXT("Land")) > 0.f && Anim->GetMotionWeight(TEXT("Fall")) > 0.f);
    Settle(40);
    Avatar->SetMotion(FVector::ZeroVector, false, false);
    Motion(TEXT("Idle"));

    const float StandingZ = Body->GetRelativeLocation().Z;
    Avatar->SetMotion(FVector::ZeroVector, false, true);
    Motion(TEXT("Ride"));
    TestTrue(TEXT("Mounted rig reaches authored ride frame"),
        FMath::IsNearlyEqual(Body->GetRelativeLocation().Z, StandingZ - 156.21f, .1f));
    Step(.05f);
    Avatar->SetMotion(FVector::ZeroVector, false, false);
    Motion(TEXT("Idle"));
    TestTrue(TEXT("Dismount restores standing frame"),
        FMath::IsNearlyEqual(Body->GetRelativeLocation().Z, StandingZ, .1f));
    Settle();
    if (TestTrue(TEXT("First authored flow clip loads"), Avatar->PlayPerformance(TEXT("FirePoi"))))
    {
        Settle(30);
        Avatar->SetPerformancePhase(.35f);
        Step(.001f);
        const FVector BeforeSwitch = Body->GetSocketLocation(TEXT("LeftHand"));
        // R stops and starts a new routine within one game frame. The old
        // skeletal clip must still contribute to the very next evaluated pose.
        Avatar->StopPerformance();
        if (TestTrue(TEXT("Second authored flow clip loads"), Avatar->PlayPerformance(TEXT("Juggler"))))
        {
            Step(.001f);
            const FVector AfterSwitch = Body->GetSocketLocation(TEXT("LeftHand"));
            TestTrue(TEXT("Outgoing flow pose survives an immediate routine switch"),
                Anim->GetOutgoingPerformanceWeight() > .9f);
            TestTrue(TEXT("Routine switch does not teleport the hand"),
                FVector::Distance(BeforeSwitch, AfterSwitch) < 15.f);
            Settle(30);
            TestTrue(TEXT("Incoming routine reaches full weight"),
                Anim->GetPerformanceWeight() > .99f && Anim->GetOutgoingPerformanceWeight() < .001f);
        }
    }
    return !HasAnyErrors();
}
#endif
