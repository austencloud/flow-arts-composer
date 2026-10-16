#pragma once

#include "CoreMinimal.h"
#include "Animation/AnimInstance.h"
#include "Animation/AnimInstanceProxy.h"
#include "FlowFestAnimInstance.generated.h"

class UAnimSequence;
class UFlowFestPropComponent;

/** Runtime evaluation of authored, skeleton-matched clips. One clock also drives prop samples. */
UCLASS(Transient)
class FLOWARTSRUNTIME_API UFlowFestAnimInstance : public UAnimInstance
{
    GENERATED_BODY()
public:
    void Configure(const TMap<FName, TObjectPtr<UAnimSequence>>& InMotions, const FString& InCharacterFolder);
    bool SetMotion(FName Name);
    void SetMotionRate(FName Name, float Rate);
    void SetMotionTime(FName Name, float Seconds);
    float GetMotionRate(FName Name) const;
    float GetMotionTime(FName Name) const;
    void StartPerformance(UAnimSequence* Clip, bool bLoop, FName Profile);
    void SetGripSource(UFlowFestPropComponent* Prop);
    void StopPerformance();
    void SetPerformancePhase(float NormalizedPhase);
    void SetPerformanceRate(float Rate);
    void SetPerformancePaused(bool bPaused);
    bool IsPerformancePaused() const { return bPerformancePaused; }
    void SeekPerformance(float Seconds);
    float GetPerformanceRate() const { return PerformanceRate; }
    void RestartPerformance();
    float GetPerformanceTime() const { return PerformanceTime; }
    FName GetPerformanceProfile() const { return bPerformanceTarget && PerformanceClip ? PerformanceProfile : NAME_None; }
    float GetPerformanceWeight() const { return PerformanceWeight; }
    float GetOutgoingPerformanceWeight() const;
    int32 GetOutgoingPerformanceCount() const { return OutgoingPerformanceClips.Num(); }
    bool GetOutgoingPerformanceSample(int32 Index, float& Seconds, float& Weight, FName& Profile) const;
    bool IsPerforming() const { return bPerformanceTarget; }
    float GetMotionWeight(FName Name) const;
    void SetFootCorrection(float LeftCm, float RightCm);

protected:
    virtual FAnimInstanceProxy* CreateAnimInstanceProxy() override;
    virtual void DestroyAnimInstanceProxy(FAnimInstanceProxy* InProxy) override;

private:
    friend struct FFlowFestAnimProxy;
#if WITH_DEV_AUTOMATION_TESTS
    friend class FFlowArtsPerformanceTransportTest;
#endif
    UPROPERTY(Transient) TArray<TObjectPtr<UAnimSequence>> MotionClips;
    UPROPERTY(Transient) TObjectPtr<UAnimSequence> PerformanceClip;
    UPROPERTY(Transient) TObjectPtr<UAnimSequence> IdleGripClip;
    FString CharacterFolderPath;
    FName IdleGripFamily = NAME_None;
    TWeakObjectPtr<UFlowFestPropComponent> GripSource;
    FName PerformanceProfile = NAME_None;
    UPROPERTY(Transient) TArray<TObjectPtr<UAnimSequence>> OutgoingPerformanceClips;
    TArray<float> OutgoingPerformanceTimes;
    TArray<float> OutgoingPerformanceWeights;
    TArray<float> OutgoingPerformanceRates;
    TArray<bool> OutgoingPerformanceLoops;
    TArray<FName> OutgoingPerformanceProfiles;
    TArray<FName> MotionNames;
    TArray<float> MotionTimes;
    TArray<float> MotionRates;
    TArray<float> MotionTargetRates;
    TArray<float> MotionWeights;
    FName TargetMotion = NAME_None;
    float PerformanceTime = 0.f;
    float PerformanceWeight = 0.f;
    float PerformanceRate = 1.f;
    bool bPerformanceTarget = false;
    bool bPerformanceLoop = true;
    bool bPerformancePaused = false;
    float FootCorrectionCm[2] = {0.f, 0.f};
    void SettlePerformanceBlend();
    void Advance(float DeltaSeconds);
    void UpdateIdleGripClip();
};

/** Immutable game-thread snapshot copied before animation evaluation. */
struct FFlowFestAnimProxy final : FAnimInstanceProxy
{
    FFlowFestAnimProxy() = default;
    explicit FFlowFestAnimProxy(UAnimInstance* Instance) : FAnimInstanceProxy(Instance) {}
    virtual void PreUpdate(UAnimInstance* Instance, float DeltaSeconds) override;
    virtual bool Evaluate(FPoseContext& Output) override;
private:
    TArray<const UAnimSequence*> Clips;
    TArray<bool> bMotionSamples;
    TArray<float> Times;
    TArray<float> Weights;
    const UAnimSequence* IdleGripClip = nullptr;
    float FootCorrectionCm[2] = {0.f, 0.f};
    FTransform MeshToWorld = FTransform::Identity;
    FVector CapturedWristComponent[2] = {FVector::ZeroVector, FVector::ZeroVector};
    FVector LastCapturedWristComponent[2] = {FVector::ZeroVector, FVector::ZeroVector};
    bool bCapturedWristsValid = false;
    bool bLastCapturedWristsValid = false;
    void CorrectFoot(FPoseContext& Output, FName UpperName, FName KneeName, FName FootName, float CorrectionCm);
    void CorrectHand(FPoseContext& Output, FName UpperName, FName ElbowName, FName HandName, const FVector& Target);
};
