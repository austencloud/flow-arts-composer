#include "FlowArtsNiagaraEffectComponent.h"

#include "Camera/PlayerCameraManager.h"
#include "Components/SceneComponent.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "NiagaraComponent.h"
#include "NiagaraSystem.h"

UFlowArtsNiagaraEffectComponent::UFlowArtsNiagaraEffectComponent()
{
    PrimaryComponentTick.bCanEverTick = true;
    PrimaryComponentTick.TickInterval = 0.25f;
    PrimaryComponentTick.TickGroup = TG_PostUpdateWork;
    FireSystemAsset = TSoftObjectPtr<UNiagaraSystem>(FSoftObjectPath(
        TEXT("/FlowArtsRuntime/Effects/NS_PropFire.NS_PropFire")));
}

void UFlowArtsNiagaraEffectComponent::Initialize(USceneComponent* LeftVisualRoot, USceneComponent* RightVisualRoot)
{
    LeftRoot = LeftVisualRoot;
    RightRoot = RightVisualRoot;
    if (!FireSystem)
    {
        FireSystem = FireSystemAsset.LoadSynchronous();
        if (!FireSystem)
        {
            UE_LOG(LogTemp, Warning, TEXT("Flow Arts Niagara fire system is missing from plugin content"));
        }
    }
}

void UFlowArtsNiagaraEffectComponent::Configure(const TArray<FVector>& LocalWickOffsets, FName PropId)
{
    if (!GetOwner() || !LeftRoot || !RightRoot) return;
    for (UNiagaraComponent* Wick : Wicks)
        if (Wick) Wick->DestroyComponent();
    Wicks.Empty();
    (void)PropId;
    bActive = false;
    bHasClock = false;
    if (!FireSystem) return;

    const int32 Count = FMath::Min(LocalWickOffsets.Num(), FMath::Max(1, MaxWicksPerHand));
    for (USceneComponent* Root : {LeftRoot.Get(), RightRoot.Get()})
    {
        for (int32 Index = 0; Index < Count; ++Index)
        {
            UNiagaraComponent* Wick = NewObject<UNiagaraComponent>(GetOwner());
            Wick->SetAutoActivate(false);
            Wick->SetAutoDestroy(false);
            Wick->SetAsset(FireSystem);
            Wick->SetupAttachment(Root);
            const FVector& Offset = LocalWickOffsets[Index];
            Wick->SetRelativeLocation(Offset);
            if (!Offset.IsNearlyZero())
                Wick->SetRelativeRotation(FQuat::FindBetweenNormals(FVector::YAxisVector, Offset.GetSafeNormal()));
            Wick->SetCastShadow(false);
            Wick->SetTickBehavior(ENiagaraTickBehavior::UsePrereqs);
            Wick->SetCustomTimeDilation(PlaybackRate);
            Wick->RegisterComponent();
            Wicks.Add(Wick);
        }
    }
    RefreshActivation();
}

void UFlowArtsNiagaraEffectComponent::SetPresentation(FName Finish, bool bNewVisible)
{
    bFireFinish = Finish == TEXT("fire");
    bVisible = bNewVisible;
    RefreshActivation();
}

void UFlowArtsNiagaraEffectComponent::SyncPlayback(float Seconds, bool bNewPaused, float NewPlaybackRate)
{
    const float SafeRate = FMath::IsFinite(NewPlaybackRate) ? FMath::Clamp(NewPlaybackRate, 0.5f, 1.75f) : 1.f;
    if (!FMath::IsNearlyEqual(PlaybackRate, SafeRate))
    {
        PlaybackRate = SafeRate;
        for (UNiagaraComponent* Wick : Wicks)
            if (Wick) Wick->SetCustomTimeDilation(PlaybackRate);
    }
    if (!FMath::IsFinite(Seconds)) return;
    if (bHasClock && (Seconds < LastClockSeconds - 0.02f || Seconds > LastClockSeconds + 0.35f))
        ResetHistory();
    LastClockSeconds = Seconds;
    bHasClock = true;
    if (bPaused != bNewPaused)
    {
        bPaused = bNewPaused;
        for (UNiagaraComponent* Wick : Wicks)
            if (Wick && Wick->IsActive()) Wick->SetPaused(bPaused);
    }
}

void UFlowArtsNiagaraEffectComponent::ResetHistory()
{
    for (UNiagaraComponent* Wick : Wicks)
        if (Wick && Wick->IsActive())
        {
            Wick->ResetSystem();
            Wick->SetPaused(bPaused);
        }
}

bool UFlowArtsNiagaraEffectComponent::ShouldActivate() const
{
    if (!bVisible || !bFireFinish || Wicks.IsEmpty() || !GetWorld()) return false;
    const APlayerController* Player = GetWorld()->GetFirstPlayerController();
    if (!Player || !Player->PlayerCameraManager) return false;
    if (MaxActiveDistanceCm <= 0.f) return true;
    const FVector Camera = Player->PlayerCameraManager->GetCameraLocation();
    const float MaxDistanceSq = FMath::Square(MaxActiveDistanceCm);
    const FVector Forward = Player->PlayerCameraManager->GetCameraRotation().Vector();
    auto IsNearAndVisible = [&](const USceneComponent* Root)
    {
        if (!Root || !Root->IsVisible()) return false;
        const FVector ToWick = Root->GetComponentLocation() - Camera;
        return ToWick.SizeSquared() <= MaxDistanceSq &&
            (ToWick.SizeSquared() < FMath::Square(200.f) || FVector::DotProduct(ToWick.GetSafeNormal(), Forward) > -0.1f);
    };
    return IsNearAndVisible(LeftRoot) || IsNearAndVisible(RightRoot);
}

void UFlowArtsNiagaraEffectComponent::RefreshActivation()
{
    const bool bShouldActivate = ShouldActivate();
    bActive = bShouldActivate;
    for (UNiagaraComponent* Wick : Wicks)
    {
        if (!Wick) continue;
        const USceneComponent* HandRoot = Wick->GetAttachParent();
        const bool bWickActive = bActive && HandRoot && HandRoot->IsVisible();
        if (Wick->IsActive() == bWickActive) continue;
        if (bWickActive)
        {
            Wick->Activate(true);
            Wick->SetPaused(bPaused);
        }
        else Wick->DeactivateImmediate();
    }
}

void UFlowArtsNiagaraEffectComponent::TickComponent(float DeltaTime, ELevelTick TickType,
    FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
    RefreshActivation();
}
