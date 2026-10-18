#if WITH_DEV_AUTOMATION_TESTS

#include "Misc/AutomationTest.h"
#include "Misc/ScopeExit.h"
#include "FlowArtsNiagaraEffectComponent.h"
#include "Camera/PlayerCameraManager.h"
#include "Components/SceneComponent.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "GameFramework/PlayerController.h"
#include "NiagaraComponent.h"
#include "NiagaraSystem.h"
#include <limits>

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsNiagaraPlaybackTest,
    "FlowArts.Niagara.ShippedAssetPlayback", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsNiagaraPlaybackTest::RunTest(const FString& Parameters)
{
    // Use the mounted plugin asset: a missing/uncompiled system must fail this integration test.
    UNiagaraSystem* System = LoadObject<UNiagaraSystem>(nullptr,
        TEXT("/FlowArtsRuntime/Effects/NS_PropFire.NS_PropFire"));
    if (!TestNotNull(TEXT("Shipped prop fire system exists"), System)) return false;
    TestTrue(TEXT("Shipped system is compiled and runnable"), System->IsReadyToRun());
    TestEqual(TEXT("Flame, ember and trail emitters ship together"), System->GetEmitterHandles().Num(), 3);

    const UWorld::InitializationValues Values = UWorld::InitializationValues()
        .AllowAudioPlayback(false).RequiresHitProxies(false).CreatePhysicsScene(false)
        .CreateNavigation(false).CreateAISystem(false).ShouldSimulatePhysics(false).SetTransactional(false);
    UWorld* World = UWorld::CreateWorld(EWorldType::Game, false, NAME_None, nullptr, true,
        ERHIFeatureLevel::Num, &Values);
    if (!TestNotNull(TEXT("Isolated playback world"), World)) return false;
    ON_SCOPE_EXIT { World->DestroyWorld(false); };

    APlayerController* Player = World->SpawnActor<APlayerController>();
    APlayerCameraManager* Camera = World->SpawnActor<APlayerCameraManager>();
    AActor* Prop = World->SpawnActor<AActor>();
    if (!TestNotNull(TEXT("Playback player"), Player) || !TestNotNull(TEXT("Playback camera"), Camera) ||
        !TestNotNull(TEXT("Playback prop"), Prop)) return false;
    // The isolated world has no gameplay initialization pass to register controllers.
    World->AddController(Player);
    Player->PlayerCameraManager = Camera;
    // Match SpawnPlayerCameraManager: ownership and InitializeFor are both required.
    // Assigning the controller's pointer alone leaves the camera's PCOwner null.
    Camera->SetOwner(Player);
    Camera->InitializeFor(Player);
    USceneComponent* Left = NewObject<USceneComponent>(Prop);
    USceneComponent* Right = NewObject<USceneComponent>(Prop);
    Prop->SetRootComponent(Left);
    Left->RegisterComponent();
    Right->SetupAttachment(Left);
    Right->RegisterComponent();
    UFlowArtsNiagaraEffectComponent* Effects = NewObject<UFlowArtsNiagaraEffectComponent>(Prop);
    Effects->RegisterComponent();
    Effects->MaxActiveDistanceCm = 0.f;
    Effects->MaxWicksPerHand = 2;
    Effects->Initialize(Left, Right);
    Effects->SyncPlayback(0.f, false, 0.5f);
    Effects->Configure({FVector(3, 5, 1), FVector(-7, 11, 2), FVector(0, 0, 3)}, TEXT("test"));
    TestTrue(TEXT("Shared component loads the shipped effect"), Effects->IsAvailable());
    TArray<UNiagaraComponent*> Wicks;
    Prop->GetComponents(Wicks);
    TestEqual(TEXT("Per hand wick cap applies to both hands"), Wicks.Num(), 4);
    // VFX live under the same animated visual roots as the reflected meshes.
    // A root rotation must carry the wick positions with the prop, on each hand.
    Left->SetRelativeLocation(FVector(-12.f, 8.f, 3.f));
    Left->SetRelativeRotation(FRotator(0.f, -35.f, 0.f));
    Right->SetRelativeLocation(FVector(40.f, 0.f, 0.f));
    Right->SetRelativeRotation(FRotator(0.f, 90.f, 0.f));
    const FVector Offsets[] = {FVector(3, 5, 1), FVector(-7, 11, 2)};
    for (int32 Index = 0; Index < Wicks.Num(); ++Index)
    {
        const USceneComponent* Root = Index < 2 ? Left : Right;
        const FVector Expected = Root->GetComponentTransform().TransformPosition(Offsets[Index % 2]);
        TestTrue(TEXT("Each effect follows its own animated visual root"),
            Wicks[Index]->GetComponentLocation().Equals(Expected, .01f));
    }
    for (UNiagaraComponent* Wick : Wicks)
    {
        TestTrue(TEXT("Every wick uses the shipped system"), Wick->GetAsset() == System);
        TestEqual(TEXT("New wicks inherit authoritative slow playback"), Wick->GetCustomTimeDilation(), 0.5f);
        TestFalse(TEXT("Default finish leaves no active effect"), Wick->IsActive());
    }

    Effects->SetPresentation(TEXT("fire"), true);
    Effects->SyncPlayback(0.1f, true, 1.75f);
    for (UNiagaraComponent* Wick : Wicks)
    {
        TestTrue(TEXT("Fire activates each configured wick"), Wick->IsActive());
        TestTrue(TEXT("Pause freezes each active Niagara simulation"), Wick->IsPaused());
        TestEqual(TEXT("Active wicks follow authoritative fast playback"), Wick->GetCustomTimeDilation(), 1.75f);
    }
    Effects->SyncPlayback(0.1f, false, std::numeric_limits<float>::quiet_NaN());
    for (UNiagaraComponent* Wick : Wicks)
    {
        TestFalse(TEXT("Resume unpauses each wick"), Wick->IsPaused());
        TestEqual(TEXT("Nonfinite rate cannot poison particle simulation"), Wick->GetCustomTimeDilation(), 1.f);
    }
    Effects->SyncPlayback(0.2f, false, -1.f);
    for (UNiagaraComponent* Wick : Wicks)
        TestEqual(TEXT("Unsupported reverse rate clamps to minimum"), Wick->GetCustomTimeDilation(), 0.5f);
    Effects->SyncPlayback(0.2f, false, 10.f);
    for (UNiagaraComponent* Wick : Wicks)
        TestEqual(TEXT("Excessive rate clamps to maximum"), Wick->GetCustomTimeDilation(), 1.75f);
    Effects->SetPresentation(TEXT("none"), true);
    for (UNiagaraComponent* Wick : Wicks)
        TestFalse(TEXT("Removing fire immediately deactivates dormant effects"), Wick->IsActive());
    return true;
}

#endif
