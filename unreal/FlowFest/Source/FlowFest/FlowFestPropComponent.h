#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "FlowFestPropComponent.generated.h"

class UPointLightComponent;
class UProceduralMeshComponent;
class USceneComponent;
class USkeletalMeshComponent;
class UStaticMeshComponent;

/** Two real, hand-attached instances of one catalog prop. */
UCLASS(ClassGroup=(FlowFest), meta=(BlueprintSpawnableComponent))
class FLOWFEST_API UFlowFestPropComponent : public UActorComponent
{
    GENERATED_BODY()
public:
    UFlowFestPropComponent();

    UFUNCTION(BlueprintCallable, Category="Flow Fest|Props")
    void Initialize(USceneComponent* Parent);

    /** Follow the imported wrist bones on the mesh's own animation update. */
    UFUNCTION(BlueprintCallable, Category="Flow Fest|Props")
    bool BindHands(USkeletalMeshComponent* BodyMesh);

    /** A variant may be selected as "fan:day_white_covered", "triad:day", or "triangle:side". */
    UFUNCTION(BlueprintCallable, Category="Flow Fest|Props")
    bool Equip(FName PropId, float LengthCm=0.f);

    UFUNCTION(BlueprintPure, Category="Flow Fest|Props")
    bool IsReady() const;

    UFUNCTION(BlueprintCallable, Category="Flow Fest|Props")
    void SetHandTransforms(FTransform Left, FTransform Right);

    /** Source prop-root poses in avatar-root space, including authored rotation. */
    void SetPerformanceTransforms(const FTransform& LeftLocalToAvatarRoot, const FTransform& RightLocalToAvatarRoot);
    void ClearPerformanceTransforms();

    /** Load the matching production prop motion for this character and profile. */
    bool LoadPerformance(FName CharacterId, FName Profile);
    /** Sample at the avatar animation's own playback clock, including loop interpolation. */
    bool SetPerformanceTime(float Seconds);

    UFUNCTION(BlueprintCallable, Category="Flow Fest|Props")
    void SetVisible(bool bNewVisible);

    UFUNCTION(BlueprintCallable, Category="Flow Fest|Props")
    void SetSpin(bool bNewSpin, float Phase);

    /** Lighting finish for performance profiles: fire, led, or none. */
    UFUNCTION(BlueprintCallable, Category="Flow Fest|Props")
    void SetFinish(FName Finish);

    /** Restore the selected variant's authored fire or LED finish. */
    UFUNCTION(BlueprintCallable, Category="Flow Fest|Props")
    void ResetFinish();

    UFUNCTION(BlueprintPure, Category="Flow Fest|Props")
    FName GetPropId() const { return EquippedPropId; }

private:
    struct FPropMotionFrame
    {
        FTransform Left;
        FTransform Right;
    };

    UPROPERTY(Transient) TObjectPtr<USceneComponent> AvatarRoot;
    UPROPERTY(Transient) TObjectPtr<USceneComponent> LeftRoot;
    UPROPERTY(Transient) TObjectPtr<USceneComponent> RightRoot;
    UPROPERTY(Transient) TObjectPtr<UStaticMeshComponent> LeftMesh;
    UPROPERTY(Transient) TObjectPtr<UStaticMeshComponent> RightMesh;
    UPROPERTY(Transient) TObjectPtr<USkeletalMeshComponent> BoundBodyMesh;
    UPROPERTY(Transient) TArray<TObjectPtr<UPointLightComponent>> LeftEffectLights;
    UPROPERTY(Transient) TArray<TObjectPtr<UPointLightComponent>> RightEffectLights;
    UPROPERTY(Transient) TArray<TObjectPtr<UProceduralMeshComponent>> LeftFlames;
    UPROPERTY(Transient) TArray<TObjectPtr<UProceduralMeshComponent>> RightFlames;
    UPROPERTY(Transient) TArray<TObjectPtr<UStaticMeshComponent>> LeftLEDs;
    UPROPERTY(Transient) TArray<TObjectPtr<UStaticMeshComponent>> RightLEDs;
    UPROPERTY(Transient) FName EquippedPropId = NAME_None;
    bool bVisible = true;
    bool bSpin = false;
    bool bPerformancePose = false;
    FName EffectFinish = NAME_None;
    FName DefaultFinish = NAME_None;
    float SpinPhase = 0.f;
    FTransform LeftHand = FTransform::Identity;
    FTransform RightHand = FTransform::Identity;
    FQuat LeftGripBasis = FQuat::Identity;
    FQuat RightGripBasis = FQuat::Identity;
    FVector LeftGripOffset = FVector::ZeroVector;
    FVector RightGripOffset = FVector::ZeroVector;
    TArray<FPropMotionFrame> PerformanceFrames;
    float PerformanceFps = 30.f;

    void UpdatePose();
    void UpdateEffects();
};
