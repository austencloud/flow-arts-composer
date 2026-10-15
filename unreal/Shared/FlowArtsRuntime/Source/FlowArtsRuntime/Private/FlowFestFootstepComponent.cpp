#include "FlowFestFootstepComponent.h"

#include "Components/AudioComponent.h"
#include "Engine/World.h"
#include "GameFramework/Pawn.h"
#include "Kismet/GameplayStatics.h"
#include "Sound/SoundAttenuation.h"
#include "Sound/SoundWaveProcedural.h"

namespace
{
bool IsGait(FName Motion)
{
    return Motion == TEXT("Walk") || Motion == TEXT("Run") || Motion == TEXT("Backward") ||
        Motion == TEXT("StrafeLeft") || Motion == TEXT("StrafeRight") ||
        Motion == TEXT("RunStrafeLeft") || Motion == TEXT("RunStrafeRight");
}
}

void UFlowFestFootstepComponent::Evaluate(float DeltaSeconds, FName Motion, bool bGrounded, bool bVisible,
    const FVector FootLocations[2], const float FootGapsCm[2])
{
    const float Dt = FMath::Clamp(DeltaSeconds, 0.f, .1f);
    CooldownSeconds = FMath::Max(0.f, CooldownSeconds - Dt);
    if (PulseSeconds > 0.f)
    {
        PulseSeconds -= Dt;
        if (PulseSeconds <= 0.f && Audio) Audio->Stop();
    }
    const bool bLanding = bVisible && bGrounded && Motion == TEXT("Land");
    if (bEnabled && bLanding && !bWasLanding)
    {
        ++LandingCount;
        PlayPulse((FootLocations[0] + FootLocations[1]) * .5f, true, 0);
        CooldownSeconds = .22f;
    }
    bWasLanding = bLanding;
    if (!bEnabled || !bVisible || !bGrounded || !IsGait(Motion))
    {
        bFootArmed[0] = bFootArmed[1] = false;
        return;
    }
    for (int32 Side = 0; Side < 2; ++Side)
    {
        const float Gap = FootGapsCm[Side];
        if (!FMath::IsFinite(Gap) || Gap < -8.f || Gap > 70.f)
        {
            bFootArmed[Side] = false;
            continue;
        }
        // Imported foot joints rest about 9 cm above their sole. The small
        // hysteresis also catches the shallower backward gait.
        if (Gap >= 12.f) bFootArmed[Side] = true;
        else if (Gap <= 10.5f && bFootArmed[Side])
        {
            bFootArmed[Side] = false;
            if (CooldownSeconds <= 0.f)
            {
                ++StepCount;
                PlayPulse(FootLocations[Side], false, Side);
                CooldownSeconds = .16f;
            }
        }
    }
}

void UFlowFestFootstepComponent::SetEnabled(bool bInEnabled)
{
    bEnabled = bInEnabled;
    if (!bEnabled)
    {
        bFootArmed[0] = bFootArmed[1] = false;
        PulseSeconds = 0.f;
        if (Audio) Audio->Stop();
    }
}

void UFlowFestFootstepComponent::PlayPulse(const FVector& Location, bool bLanding, int32 Side)
{
    const UWorld* World = GetWorld();
    const APawn* Listener = World ? UGameplayStatics::GetPlayerPawn(World, 0) : nullptr;
    if (!Listener || FVector::DistSquared(Location, Listener->GetActorLocation()) > FMath::Square(2200.f)) return;
    if (!Audio)
    {
        Audio = NewObject<UAudioComponent>(GetOwner());
        Audio->bAutoActivate = false;
        Audio->bOverrideAttenuation = true;
        FSoundAttenuationSettings& Attenuation = Audio->AttenuationOverrides;
        Attenuation.bAttenuate = true;
        Attenuation.bSpatialize = true;
        Attenuation.DistanceAlgorithm = EAttenuationDistanceModel::Logarithmic;
        Attenuation.AttenuationShape = EAttenuationShape::Sphere;
        Attenuation.AttenuationShapeExtents = FVector(85.f, 0.f, 0.f);
        Attenuation.FalloffDistance = 2100.f;
        Audio->RegisterComponent();
        PulseWave = NewObject<USoundWaveProcedural>(this);
        PulseWave->SetSampleRate(24000);
        PulseWave->NumChannels = 1;
        PulseWave->bLooping = false;
        Audio->SetSound(PulseWave);
    }
    // Reproducible filtered noise and a low thump make a soft earth step.
    // No source recording, imported asset, or random global state is needed.
    const int32 SampleRate = 24000;
    const int32 Count = bLanding ? 4320 : 2880;
    TArray<int16> Samples;
    Samples.SetNumUninitialized(Count);
    uint32 NoiseState = 0x9e3779b9u ^ (uint32(StepCount + LandingCount) * 747796405u) ^ uint32(Side * 2891336453u);
    float LowNoise = 0.f;
    for (int32 Index = 0; Index < Count; ++Index)
    {
        NoiseState = 1664525u * NoiseState + 1013904223u;
        const float White = (float((NoiseState >> 16) & 0xffffu) / 32767.5f) - 1.f;
        LowNoise = .76f * LowNoise + .24f * White;
        const float Seconds = float(Index) / float(SampleRate);
        const float Envelope = FMath::Min(1.f, Seconds * 350.f) * FMath::Exp(-Seconds * (bLanding ? 23.f : 36.f));
        const float Thump = FMath::Sin(2.f * PI * (bLanding ? 59.f : 74.f) * Seconds) * FMath::Exp(-Seconds * 29.f);
        const float Value = Envelope * (.50f * LowNoise + .30f * Thump);
        Samples[Index] = int16(FMath::Clamp(Value, -1.f, 1.f) * 32760.f);
    }
    Audio->Stop();
    PulseWave->ResetAudio();
    PulseWave->QueueAudio(reinterpret_cast<const uint8*>(Samples.GetData()), Samples.Num() * sizeof(int16));
    Audio->SetWorldLocation(Location);
    Audio->SetVolumeMultiplier(bLanding ? .24f : .15f);
    Audio->Play();
    PulseSeconds = float(Count) / float(SampleRate) + .02f;
}
