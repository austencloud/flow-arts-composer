#pragma once

#include "CoreMinimal.h"
#include "Animation/AnimInstance.h"
#include "Animation/AnimInstanceProxy.h"
#include "FlowFestAnimInstance.generated.h"

class UAnimSequence;

/** Runtime evaluation of authored, skeleton-matched clips. One clock also drives prop samples. */
UCLASS(Transient)
class FLOWFEST_API UFlowFestAnimInstance : public UAnimInstance
{
    GENERATED_BODY()
public:
    void Configure(const TMap<FName, TObjectPtr<UAnimSequence>>& InMotions);
    bool SetMotion(FName Name);
    void StartPerformance(UAnimSequence* Clip, bool bLoop);
    void StopPerformance();
    void SetPerformancePhase(float NormalizedPhase);
    void SetPerformanceRate(float Rate);
    float GetPerformanceTime() const { return PerformanceTime; }
    float GetPerformanceWeight() const { return PerformanceWeight; }
    float GetOutgoingPerformanceWeight() const;
    bool IsPerforming() const { return bPerformanceTarget; }
    float GetMotionWeight(FName Name) const;
    void SetFootCorrection(float LeftCm, float RightCm);

protected:
    virtual FAnimInstanceProxy* CreateAnimInstanceProxy() override;
    virtual void DestroyAnimInstanceProxy(FAnimInstanceProxy* InProxy) override;

private:
    friend struct FFlowFestAnimProxy;
    UPROPERTY(Transient) TArray<TObjectPtr<UAnimSequence>> MotionClips;
    UPROPERTY(Transient) TObjectPtr<UAnimSequence> PerformanceClip;
    UPROPERTY(Transient) TArray<TObjectPtr<UAnimSequence>> OutgoingPerformanceClips;
    TArray<float> OutgoingPerformanceTimes;
    TArray<float> OutgoingPerformanceWeights;
    TArray<float> OutgoingPerformanceRates;
    TArray<bool> OutgoingPerformanceLoops;
    TArray<FName> MotionNames;
    TArray<float> MotionTimes;
    TArray<float> MotionWeights;
    FName TargetMotion = NAME_None;
    float PerformanceTime = 0.f;
    float PerformanceWeight = 0.f;
    float PerformanceRate = 1.f;
    bool bPerformanceTarget = false;
    bool bPerformanceLoop = true;
    float FootCorrectionCm[2] = {0.f, 0.f};
    void Advance(float DeltaSeconds);
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
    TArray<float> Times;
    TArray<float> Weights;
    float FootCorrectionCm[2] = {0.f, 0.f};
    FTransform MeshToWorld = FTransform::Identity;
    void CorrectFoot(FPoseContext& Output, FName UpperName, FName KneeName, FName FootName, float CorrectionCm);
};
