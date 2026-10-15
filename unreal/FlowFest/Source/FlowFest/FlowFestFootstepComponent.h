#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "FlowFestFootstepComponent.generated.h"

class UAudioComponent;
class USoundWaveProcedural;

/** Contact-driven, spatialized foot and landing sounds for any native avatar. */
UCLASS(ClassGroup=(FlowFest))
class FLOWFEST_API UFlowFestFootstepComponent : public UActorComponent
{
    GENERATED_BODY()
public:
    /** Called after the body mesh evaluates; gaps are foot-joint heights above traced ground. */
    void Evaluate(float DeltaSeconds, FName Motion, bool bGrounded, bool bVisible,
        const FVector FootLocations[2], const float FootGapsCm[2]);
    void SetEnabled(bool bInEnabled);

    int32 GetStepCount() const { return StepCount; }
    int32 GetLandingCount() const { return LandingCount; }

private:
    UPROPERTY(Transient) TObjectPtr<UAudioComponent> Audio;
    UPROPERTY(Transient) TObjectPtr<USoundWaveProcedural> PulseWave;
    bool bFootArmed[2] = {false, false};
    bool bWasLanding = false;
    bool bEnabled = true;
    float CooldownSeconds = 0.f;
    float PulseSeconds = 0.f;
    int32 StepCount = 0;
    int32 LandingCount = 0;

    void PlayPulse(const FVector& Location, bool bLanding, int32 Side);
};
