#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "FlowFestPropComponent.generated.h"

class UPointLightComponent;
class UProceduralMeshComponent;
class USceneComponent;
class USkeletalMeshComponent;
class UStaticMeshComponent;
class UFlowFestAnimInstance;

/** Two real, hand-attached instances of one catalog prop. */
UCLASS(ClassGroup=(FlowFest), meta=(BlueprintSpawnableComponent))
class FLOWARTSRUNTIME_API UFlowFestPropComponent : public UActorComponent
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
    bool HasVisibleGrip() const { return bVisible && IsReady() && BoundBodyMesh != nullptr; }

    UFUNCTION(BlueprintCallable, Category="Flow Fest|Props")
    void SetHandTransforms(FTransform Left, FTransform Right);

    /** Source prop-root poses in avatar-root space, including authored rotation. */
    void SetPerformanceTransforms(const FTransform& LeftLocalToAvatarRoot, const FTransform& RightLocalToAvatarRoot, float PoseWeight = 1.f);
    void ClearPerformanceTransforms();

    /** Load the matching production prop motion for this character and profile. */
    bool LoadPerformance(FName CharacterId, FName Profile);
    /** Sample at the avatar animation's own playback clock, including loop interpolation. */
    bool SetPerformanceTime(float Seconds, float PoseWeight = 1.f, const UFlowFestAnimInstance* Animator = nullptr);
    /** Captured wrist targets in world space for the animation evaluator's hand IK. */
    bool SampleCapturedWrists(FName Profile, float Seconds, FVector& LeftWorld, FVector& RightWorld) const;

    /** Hand-to-captured-grip distance after the synchronized pose was applied. */
    UFUNCTION(BlueprintPure, Category="Flow Fest|Props")
    float GetGripErrorCm() const { return GripErrorCm; }

    UFUNCTION(BlueprintPure, Category="Flow Fest|Props")
    float GetPeakGripErrorCm() const { return PeakGripErrorCm; }

    /** Captured wrist anchor transformed by the actual prop root, compared with the live hand. */
    float GetPropAnchorErrorCm() const { return PropAnchorErrorCm; }
    float GetPeakPropAnchorErrorCm() const { return PeakPropAnchorErrorCm; }
    bool IsEnteringPerformance() const { return bEnteringPerformance; }
    bool IsReturningToHands() const { return bReturningToHands; }
    FTransform GetPropRootTransform(bool bLeft) const;
    FQuat GetVisualRotation(bool bLeft) const;

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

    virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

private:
    struct FPropMotionFrame
    {
        FTransform Left;
        FTransform Right;
        FVector LeftGrip = FVector::ZeroVector;
        FVector RightGrip = FVector::ZeroVector;
        FQuat LeftVisual = FQuat::Identity;
        FQuat RightVisual = FQuat::Identity;
    };
    struct FPropMotionTrack
    {
        TArray<FPropMotionFrame> Frames;
        float Fps = 30.f;
        FName Profile = NAME_None;
    };

    UPROPERTY(Transient) TObjectPtr<USceneComponent> AvatarRoot;
    UPROPERTY(Transient) TObjectPtr<USceneComponent> LeftRoot;
    UPROPERTY(Transient) TObjectPtr<USceneComponent> RightRoot;
    UPROPERTY(Transient) TObjectPtr<USceneComponent> LeftVisualRoot;
    UPROPERTY(Transient) TObjectPtr<USceneComponent> RightVisualRoot;
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
    FName PerformanceProfile = NAME_None;
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
    TArray<FPropMotionTrack> OutgoingPerformanceTracks;
    float PerformanceFps = 30.f;
    bool bHasGripSamples = false;
    float GripErrorCm = 0.f;
    float PeakGripErrorCm = 0.f;
    float PropAnchorErrorCm = 0.f;
    float PeakPropAnchorErrorCm = 0.f;
    int32 GripSampleCount = 0;
    bool bEnteringPerformance = false;
    bool bReturningToHands = false;
    float TransitionStart = 0.f;
    FTransform TransitionLeft = FTransform::Identity;
    FTransform TransitionRight = FTransform::Identity;
    FQuat TransitionLeftVisual = FQuat::Identity;
    FQuat TransitionRightVisual = FQuat::Identity;
    bool bSwitchingPerformance = false;
    FTransform SwitchLeft = FTransform::Identity;
    FTransform SwitchRight = FTransform::Identity;
    FQuat SwitchLeftVisual = FQuat::Identity;
    FQuat SwitchRightVisual = FQuat::Identity;

    void UpdatePose();
    void UpdateEffects();
};
