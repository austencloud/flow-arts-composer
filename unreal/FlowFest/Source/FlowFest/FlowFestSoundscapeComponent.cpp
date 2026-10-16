#include "FlowFestSoundscapeComponent.h"
#include "FlowFestWorld.h"
#include "Components/AudioComponent.h"
#include "Engine/World.h"
#include "Sound/SoundAttenuation.h"
#include "Sound/SoundWave.h"

UFlowFestSoundscapeComponent::UFlowFestSoundscapeComponent()
{
    PrimaryComponentTick.bCanEverTick = true;
    PrimaryComponentTick.TickInterval = 0.2f;
}

void UFlowFestSoundscapeComponent::AddVoice(const TCHAR* Asset, const FVector& LocalPosition, float Gain, float MaxDistanceCm)
{
    const FString Path = FString::Printf(TEXT("/Game/FlowFest/Audio/%s.%s"), Asset, Asset);
    USoundWave* Wave = LoadObject<USoundWave>(nullptr, *Path);
    if (!Wave)
    {
        UE_LOG(LogTemp, Warning, TEXT("Flow Fest ambient loop missing: %s"), *Path);
        return;
    }
    UAudioComponent* Audio = NewObject<UAudioComponent>(GetOwner());
    Audio->SetupAttachment(this);
    Audio->SetRelativeLocation(LocalPosition);
    Audio->SetSound(Wave);
    Audio->bAutoActivate = false;
    Audio->bOverrideAttenuation = true;
    FSoundAttenuationSettings& Settings = Audio->AttenuationOverrides;
    Settings.bAttenuate = true;
    Settings.bSpatialize = true;
    Settings.DistanceAlgorithm = EAttenuationDistanceModel::Logarithmic;
    Settings.AttenuationShape = EAttenuationShape::Sphere;
    Settings.AttenuationShapeExtents = FVector(350.f, 0.f, 0.f);
    Settings.FalloffDistance = MaxDistanceCm;
    Settings.bEnableOcclusion = true;
    Settings.OcclusionTraceChannel = ECC_Visibility;
    Settings.OcclusionLowPassFilterFrequency = 900.f;
    Settings.OcclusionVolumeAttenuation = 0.56f;
    Settings.OcclusionInterpolationTime = 0.5f;
    Audio->RegisterComponent();
    Audio->SetVolumeMultiplier(0.f);
    if (bEnabled) Audio->Play();
    Voices.Add({ Audio, FName(Asset), Gain });
}

bool UFlowFestSoundscapeComponent::BuildFromSite(AFlowFestWorld* SiteWorld)
{
    if (!SiteWorld) return false;
    for (FVoice& Voice : Voices)
        if (Voice.Audio) Voice.Audio->DestroyComponent();
    Voices.Reset();
    auto SitePosition = [SiteWorld](const TCHAR* Id) { return SiteWorld->GetLandmark(Id) + FVector(0.f, 0.f, 180.f); };
    AddVoice(TEXT("WoodlandWind"), SitePosition(TEXT("start")), .32f, 38000.f);
    AddVoice(TEXT("Birds"), SitePosition(TEXT("camp-upper")) + FVector(1500, 400, 450), .28f, 17000.f);
    AddVoice(TEXT("Insects"), SitePosition(TEXT("camp-lower")) + FVector(-800, -700, 80), .15f, 13500.f);
    AddVoice(TEXT("Camp"), SitePosition(TEXT("camp-lower")), .26f, 9000.f);
    AddVoice(TEXT("Fire"), SitePosition(TEXT("fire")), .48f, 6000.f);
    AddVoice(TEXT("Crowd"), SitePosition(TEXT("fire")) + FVector(300, 0, 0), .22f, 10500.f);
    return Voices.Num() == 6;
}

void UFlowFestSoundscapeComponent::SetEnabled(bool bInEnabled)
{
    bEnabled = bInEnabled;
    for (FVoice& Voice : Voices)
    {
        if (!Voice.Audio) continue;
        if (bEnabled && !Voice.Audio->IsPlaying()) Voice.Audio->Play();
        else if (!bEnabled && Voice.Audio->IsPlaying()) Voice.Audio->Stop();
    }
}

void UFlowFestSoundscapeComponent::SetTimeOfDay(float Hour) { HourOfDay = FMath::Fmod(Hour + 24.f, 24.f); }
void UFlowFestSoundscapeComponent::SetJamActive(bool bActive) { bJamActive = bActive; }

void UFlowFestSoundscapeComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
    if (!bEnabled || !GetWorld()) return;
    const bool bNight = HourOfDay < 6.f || HourOfDay >= 19.f;
    for (FVoice& Voice : Voices)
    {
        if (!Voice.Audio) continue;
        float Gain = Voice.BaseGain;
        if (Voice.Asset == TEXT("Birds")) Gain *= bNight ? .28f : 1.f;
        if (Voice.Asset == TEXT("Insects")) Gain *= bNight ? 1.f : .17f;
        if (Voice.Asset == TEXT("Fire")) Gain *= bNight ? 1.f : .55f;
        if (Voice.Asset == TEXT("Crowd")) Gain *= bJamActive ? 1.f : .45f;
        // The sound engine handles spherical distance and line-of-sight obstruction.
        // Smooth only the day/jam gain changes here, avoiding a step at dusk.
        const float Current = Voice.Audio->VolumeMultiplier;
        Voice.Audio->SetVolumeMultiplier(FMath::FInterpTo(Current, Gain, DeltaTime, 1.5f));
    }
}
