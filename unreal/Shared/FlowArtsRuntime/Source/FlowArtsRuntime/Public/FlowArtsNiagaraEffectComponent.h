#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "FlowArtsNiagaraEffectComponent.generated.h"

class UNiagaraComponent;
class UNiagaraSystem;
class USceneComponent;

/** Shared wick VFX for Flow Fest and Museum props. The prop owns the attachment geometry and playback clock. */
UCLASS(ClassGroup=(FlowArts), meta=(BlueprintSpawnableComponent))
class FLOWARTSRUNTIME_API UFlowArtsNiagaraEffectComponent : public UActorComponent
{
    GENERATED_BODY()
public:
    UFlowArtsNiagaraEffectComponent();

    /** Call once after the prop's visual roots exist. */
    void Initialize(USceneComponent* LeftVisualRoot, USceneComponent* RightVisualRoot);

    /** Offsets are the prop catalog's effectAttachment coordinates after prop scaling and axis conversion. */
    void Configure(const TArray<FVector>& LocalWickOffsets, FName PropId);

    /** Only fire activates the Niagara systems. Visibility also follows the prop's presentation state. */
    void SetPresentation(FName Finish, bool bVisible);

    /** Use the avatar's authoritative animation seconds. Backward jumps and large seeks clear old trails. */
    void SyncPlayback(float Seconds, bool bPaused, float PlaybackRate = 1.f);

    /** Call for an explicit seek/restart when the new time could equal the old time. */
    void ResetHistory();

    /** True once an asset and at least one attached wick system are ready. */
    bool IsAvailable() const { return FireSystem != nullptr && !Wicks.IsEmpty(); }

    /** Maximum camera distance for active wick particles; set to zero to disable distance culling. */
    UPROPERTY(EditAnywhere, Category="Flow Arts|Effects", meta=(ClampMin="0"))
    float MaxActiveDistanceCm = 2400.f;

    /** Per hand cap prevents multi-wick props from multiplying emitter cost without bound. */
    UPROPERTY(EditAnywhere, Category="Flow Arts|Effects", meta=(ClampMin="1", ClampMax="12"))
    int32 MaxWicksPerHand = 6;

    /** Serialized asset path keeps the plugin content visible to Unreal's cooker. */
    UPROPERTY(EditDefaultsOnly, Category="Flow Arts|Effects")
    TSoftObjectPtr<UNiagaraSystem> FireSystemAsset;

    virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

private:
    UPROPERTY(Transient) TObjectPtr<USceneComponent> LeftRoot;
    UPROPERTY(Transient) TObjectPtr<USceneComponent> RightRoot;
    UPROPERTY(Transient) TArray<TObjectPtr<UNiagaraComponent>> Wicks;
    UPROPERTY(Transient) TObjectPtr<UNiagaraSystem> FireSystem;

    bool bFireFinish = false;
    bool bVisible = true;
    bool bPaused = false;
    bool bActive = false;
    bool bHasClock = false;
    float LastClockSeconds = 0.f;
    float PlaybackRate = 1.f;

    bool ShouldActivate() const;
    void RefreshActivation();
};
