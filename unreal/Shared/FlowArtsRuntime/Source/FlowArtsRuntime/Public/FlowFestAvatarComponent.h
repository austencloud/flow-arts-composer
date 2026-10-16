#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "FlowFestAvatarComponent.generated.h"

class UAnimSequence;
class UFlowFestAnimInstance;
class UFlowFestFootstepComponent;
class UFlowFestPropComponent;
class USceneComponent;
class USkeletalMeshComponent;

/** One native, skinned deployed performer. The supplied parent is already at foot height. */
UCLASS(ClassGroup=(FlowFest), meta=(BlueprintSpawnableComponent))
class FLOWARTSRUNTIME_API UFlowFestAvatarComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UFlowFestAvatarComponent();

    UFUNCTION(BlueprintCallable, Category="Flow Fest|Avatar")
    void Initialize(USceneComponent* Parent, FName CharacterId);

    UFUNCTION(BlueprintCallable, Category="Flow Fest|Avatar")
    bool SetCharacter(FName NewCharacterId);

    UFUNCTION(BlueprintCallable, Category="Flow Fest|Avatar")
    void SetPresentation(bool bVisible, bool bOwnerNoSee);

    /** Shared world sound toggle also controls contact and landing sounds. */
    void SetFootstepsEnabled(bool bEnabled);

    UFUNCTION(BlueprintCallable, Category="Flow Fest|Avatar")
    void SetMotion(FVector WorldVelocity, bool bInAir, bool bMounted);

    UFUNCTION(BlueprintPure, Category="Flow Fest|Avatar")
    USkeletalMeshComponent* GetBodyMesh() const { return BodyMesh; }

    /** Performer-left maps to the imported LeftHand bone; returns identity if unavailable. */
    UFUNCTION(BlueprintPure, Category="Flow Fest|Avatar")
    FTransform GetHandTransform(bool bLeft) const;

    UFUNCTION(BlueprintPure, Category="Flow Fest|Avatar")
    FName GetCharacterId() const { return CharacterId; }

    /** Selected locomotion clip; blend weights remain on the animation instance. */
    FName GetMotionName() const { return CurrentMotion; }

    /** Reserved for native per-character A_Flow_<profile> performance clips. */
    UFUNCTION(BlueprintCallable, Category="Flow Fest|Avatar")
    bool PlayPerformance(FName Profile, bool bLoop = true);

    /** Exact physical family profile; variant 0/1 selects independent captured routines. */
    UFUNCTION(BlueprintPure, Category="Flow Fest|Avatar")
    static FName ResolvePerformanceProfile(FName PropId, int32 Variant = 0);

    UFUNCTION(BlueprintCallable, Category="Flow Fest|Avatar")
    void StopPerformance();

    /** Current native performance animation time in seconds for synchronized props. */
    UFUNCTION(BlueprintPure, Category="Flow Fest|Avatar")
    float GetPerformanceTime() const;

    UFUNCTION(BlueprintPure, Category="Flow Fest|Avatar")
    float GetPerformanceLength() const;

    /** Active native clip profile, or None after playback stops. */
    UFUNCTION(BlueprintPure, Category="Flow Fest|Avatar")
    FName GetPerformanceProfile() const;

    UFUNCTION(BlueprintPure, Category="Flow Fest|Avatar")
    float GetPerformancePhase() const;

    /** Shift a looping routine without desynchronizing its paired prop track. */
    UFUNCTION(BlueprintCallable, Category="Flow Fest|Avatar")
    void SetPerformancePhase(float NormalizedPhase);

    UFUNCTION(BlueprintCallable, Category="Flow Fest|Avatar")
    void SetPerformanceRate(float Rate);

    UFUNCTION(BlueprintCallable, Category="Flow Fest|Avatar")
    void SetPerformancePaused(bool bPaused);

    UFUNCTION(BlueprintPure, Category="Flow Fest|Avatar")
    bool IsPerformancePaused() const;

    /** Seek in clip seconds; clamps to the clip bounds and settles old blends. */
    UFUNCTION(BlueprintCallable, Category="Flow Fest|Avatar")
    void SeekPerformance(float Seconds);

    UFUNCTION(BlueprintPure, Category="Flow Fest|Avatar")
    float GetPerformanceRate() const;

    /** Return to the first frame and resume playback. */
    UFUNCTION(BlueprintCallable, Category="Flow Fest|Avatar")
    void RestartPerformance();

    /** The avatar's post-mesh tick samples the paired prop on the same clock. */
    void BindPerformanceProp(UFlowFestPropComponent* Prop);

    virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

private:
    UPROPERTY(Transient) TObjectPtr<USkeletalMeshComponent> BodyMesh;
    UPROPERTY(Transient) TMap<FName, TObjectPtr<UAnimSequence>> Clips;
    UPROPERTY(Transient) TObjectPtr<UAnimSequence> PerformanceClip;
    UPROPERTY(Transient) TObjectPtr<UFlowFestPropComponent> BoundProp;
    UPROPERTY(Transient) TObjectPtr<UFlowFestFootstepComponent> Footsteps;
    UPROPERTY(Transient) TObjectPtr<USceneComponent> AttachParent;
    UPROPERTY(Transient) FName CharacterId;
    FName CurrentMotion;
    FTransform StandingPresentation;
    bool bWasInAir = false;
    bool bFootstepsEnabled = true;
    float LandingUntil = 0.f;
    float TakeoffUntil = 0.f;
    float FootCorrectionCm[2] = {0.f, 0.f};

    bool PlayMotion(FName Motion);
    FString CharacterFolder() const;
};
