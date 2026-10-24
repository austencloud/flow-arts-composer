#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "FlowArtsArmClearance.h"
#include "Templates/SharedPointer.h"
#include "FlowFestPropComponent.generated.h"

class UPointLightComponent;
class UProceduralMeshComponent;
class USceneComponent;
class USkeletalMeshComponent;
class UStaticMeshComponent;
class UFlowFestAnimInstance;
class UFlowArtsNiagaraEffectComponent;
class FFlowArtsRuntimeMotion;
struct FFlowArtsClearanceCapsule;

/** Bind-calibrated axes for measuring a posed finger channel in hand space. */
struct FLOWARTSRUNTIME_API FFlowFestGripCalibration
{
    FVector Longitudinal = FVector::ZeroVector;
    FVector PalmNormal = FVector::ZeroVector;
    FVector Transverse = FVector::ZeroVector;
    FVector Fallback = FVector::ZeroVector;
    bool bValid = false;
};

/** Same scale-independent circumcenter and open-hand fallback as the capture animator. */
FLOWARTSRUNTIME_API FVector MeasureFlowFestGripChannel(const FFlowFestGripCalibration& Calibration,
    const FVector& Proximal, const FVector& Middle, const FVector& Distal);

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
    /** Install a validated runtime bundle as the current immutable prop track. */
    bool LoadRuntimePerformance(TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Motion);
    /** Sample at the avatar animation's own playback clock, including loop interpolation. */
    bool SetPerformanceTime(float Seconds, float PoseWeight = 1.f, const UFlowFestAnimInstance* Animator = nullptr,
        const FVector& SharedComponentTranslation = FVector::ZeroVector);
    /** Captured wrist targets in world space for the animation evaluator's hand IK. */
    bool SampleCapturedWrists(FName Profile, float Seconds, FVector& LeftWorld, FVector& RightWorld) const;
    /** Authored visible grip points and calibrated hand-local palm points. */
    bool SampleVisibleGrips(FName Profile, float Seconds, FVector& LeftWorld, FVector& RightWorld) const;
    /** Exact authored visibility for the same discrete native prop frame used by collision sampling. */
    bool SamplePerformanceVisibility(FName Profile, float Seconds, bool (&Visible)[2]) const;
    const FString& GetPerformanceTrackIdentity() const { return PerformanceTrackIdentity; }
    bool GetPalmLocalOffsets(FVector (&Offsets)[2]) const;
    bool GetGripCalibrations(FFlowFestGripCalibration (&Calibrations)[2]) const;
    /** Sample visible prop geometry in body mesh space. Animator includes outgoing tracks;
     * CurrentGripWorld supplies this frame's visible grip targets before mesh evaluation. */
    bool SampleClearanceCapsules(FName Profile, float Seconds, const FTransform& MeshToWorld,
        TArray<FFlowArtsClearanceCapsule>& LeftCapsules,
        TArray<FFlowArtsClearanceCapsule>& RightCapsules,
        const TArray<float>* RuntimeValues = nullptr,
        const UFlowFestAnimInstance* Animator = nullptr,
        const FVector* CurrentGripWorld = nullptr,
        FVector* SampledRootWorld = nullptr,
        FTransform* SampledRootAvatar = nullptr,
        FQuat* SampledVisual = nullptr) const;

    /** Game-thread snapshot: capsules use world-centimeter size in the wrist's
     * orientation; grip offsets use bone-local units. Prop roots have absolute scale.
     * The proxy applies the current evaluated hand, without a previous socket pose. */
    bool SnapshotHandLocalClearanceCapsules(TArray<FFlowArtsClearanceCapsule>& LeftCapsules,
        TArray<FFlowArtsClearanceCapsule>& RightCapsules, FVector (&GripOffsets)[2]) const;

    /** Collision geometry in the authored prop-root frame, independent of actor
     * location, attachment animation, and the current visible hand. */
    bool SnapshotPerformanceLocalClearanceCapsules(
        TArray<FFlowArtsClearanceCapsule>& LeftCapsules,
        TArray<FFlowArtsClearanceCapsule>& RightCapsules) const;

    /** Legacy name: deviation from the captured source grip, not the visible prop's grip error. */
    UFUNCTION(BlueprintPure, Category="Flow Fest|Props")
    float GetGripErrorCm() const { return GripErrorCm; }

    /** Live hand versus the captured source grip after the synchronized pose was applied. */
    UFUNCTION(BlueprintPure, Category="Flow Fest|Props")
    float GetSourceGripDeviationCm() const { return GripErrorCm; }

    UFUNCTION(BlueprintPure, Category="Flow Fest|Props")
    float GetPeakGripErrorCm() const { return PeakGripErrorCm; }

    /** Actual held-prop grip error: visible prop anchor versus the live hand. */
    UFUNCTION(BlueprintPure, Category="Flow Fest|Props")
    float GetActualGripErrorCm() const { return ActualGripErrorCm; }

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

    /** Drive wick effects from the same clock as the performance, including pause. */
    void SyncEffectPlayback(float Seconds, bool bPaused, float PlaybackRate = 1.f);
    /** Clear particle trails after a seek or playback restart. */
    void ResetEffectHistory();

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
        bool PropVisible[2] = {true, true};
    };
    struct FPropMotionTrack
    {
        TArray<FPropMotionFrame> Frames;
        float Fps = 30.f;
        FName Profile = NAME_None;
        bool bLoop = true;
    };
    struct FBlendedPerformancePose
    {
        FPropMotionFrame Frame;
        FVector LeftAnchor = FVector::ZeroVector;
        FVector RightAnchor = FVector::ZeroVector;
        float OutgoingWeight = 0.f;
        TArray<bool> UsedTracks;
    };
    bool SampleBlendedPerformancePose(float Seconds, float PoseWeight,
        const UFlowFestAnimInstance* Animator, FBlendedPerformancePose& Out,
        const FVector* CurrentGripWorld = nullptr) const;

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
    UPROPERTY(Transient) TObjectPtr<UFlowArtsNiagaraEffectComponent> NiagaraEffects;
    UPROPERTY(Transient) FName EquippedPropId = NAME_None;
    FName PerformanceProfile = NAME_None;
    FString PerformanceTrackIdentity;
    bool bVisible = true;
    bool HandVisible[2] = {true, true};
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
    FFlowFestGripCalibration GripCalibrations[2];
    // Conservative covers of the imported static mesh, before instance transforms.
    TArray<FFlowArtsClearanceCapsule> LeftMeshClearanceCapsules;
    TArray<FFlowArtsClearanceCapsule> RightMeshClearanceCapsules;
    TArray<FPropMotionFrame> PerformanceFrames;
    TArray<FPropMotionTrack> OutgoingPerformanceTracks;
    float PerformanceFps = 30.f;
    bool bPerformanceLoop = true;
    bool bHasGripSamples = false;
    float GripErrorCm = 0.f;
    float PeakGripErrorCm = 0.f;
    float PropAnchorErrorCm = 0.f;
    float ActualGripErrorCm = 0.f;
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
    void UpdateHandVisibility(bool bLeft, bool bRight);
    void InstallPerformanceTrack(TArray<FPropMotionFrame>&& Frames, float Fps, FName Profile,
        bool bLoop, bool bHasGrips);
};
