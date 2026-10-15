#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "FlowFestAvatarComponent.generated.h"

class UAnimSequence;
class USceneComponent;
class USkeletalMeshComponent;

/** One native, skinned deployed performer. The supplied parent is already at foot height. */
UCLASS(ClassGroup=(FlowFest), meta=(BlueprintSpawnableComponent))
class FLOWFEST_API UFlowFestAvatarComponent : public UActorComponent
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

    UFUNCTION(BlueprintCallable, Category="Flow Fest|Avatar")
    void SetMotion(FVector WorldVelocity, bool bInAir, bool bMounted);

    UFUNCTION(BlueprintPure, Category="Flow Fest|Avatar")
    USkeletalMeshComponent* GetBodyMesh() const { return BodyMesh; }

    /** Performer-left maps to the imported LeftHand bone; returns identity if unavailable. */
    UFUNCTION(BlueprintPure, Category="Flow Fest|Avatar")
    FTransform GetHandTransform(bool bLeft) const;

    UFUNCTION(BlueprintPure, Category="Flow Fest|Avatar")
    FName GetCharacterId() const { return CharacterId; }

    /** Reserved for native per-character A_Flow_<profile> performance clips. */
    UFUNCTION(BlueprintCallable, Category="Flow Fest|Avatar")
    bool PlayPerformance(FName Profile, bool bLoop = true);

    UFUNCTION(BlueprintCallable, Category="Flow Fest|Avatar")
    void StopPerformance();

    /** Current native performance animation time in seconds for synchronized props. */
    UFUNCTION(BlueprintPure, Category="Flow Fest|Avatar")
    float GetPerformanceTime() const;

private:
    UPROPERTY(Transient) TObjectPtr<USkeletalMeshComponent> BodyMesh;
    UPROPERTY(Transient) TMap<FName, TObjectPtr<UAnimSequence>> Clips;
    UPROPERTY(Transient) TObjectPtr<UAnimSequence> PerformanceClip;
    UPROPERTY(Transient) TObjectPtr<USceneComponent> AttachParent;
    UPROPERTY(Transient) FName CharacterId;
    FName CurrentMotion;
    FTransform StandingPresentation;
    bool bWasInAir = false;
    float LandingUntil = 0.f;

    bool PlayMotion(FName Motion);
    FString CharacterFolder() const;
};
