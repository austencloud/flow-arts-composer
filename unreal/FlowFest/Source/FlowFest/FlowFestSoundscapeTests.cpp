#if WITH_DEV_AUTOMATION_TESTS
#include "FlowFestSoundscapeComponent.h"
#include "FlowFestWorld.h"

#include "Components/AudioComponent.h"
#include "Engine/World.h"
#include "Misc/AutomationTest.h"
#include "Sound/SoundAttenuation.h"
#include "Sound/SoundBase.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestSoundscapeTest, "FlowFest.Sound.DistanceAndReactiveMix",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowFestSoundscapeTest::RunTest(const FString& Parameters)
{
    struct FSoundWorld
    {
        UWorld* World = nullptr;
        ~FSoundWorld() { if (World) World->DestroyWorld(false); }
    } Fixture;
    UWorld::InitializationValues Settings;
    Settings.AllowAudioPlayback(false).CreatePhysicsScene(false).CreateNavigation(false).CreateAISystem(false);
    Fixture.World = UWorld::CreateWorld(EWorldType::Game, false,
        MakeUniqueObjectName(GetTransientPackage(), UWorld::StaticClass(), TEXT("FlowFestSoundTest")),
        GetTransientPackage(), true, ERHIFeatureLevel::Num, &Settings);
    if (!TestNotNull(TEXT("Sound test world"), Fixture.World)) return false;
    AFlowFestWorld* Site = Fixture.World->SpawnActor<AFlowFestWorld>();
    if (!TestNotNull(TEXT("Native festival actor"), Site)) return false;
    UFlowFestSoundscapeComponent* Mix = Site->FindComponentByClass<UFlowFestSoundscapeComponent>();
    if (!TestNotNull(TEXT("Native soundscape component"), Mix)) return false;
    Mix->SetEnabled(false);
    if (!TestTrue(TEXT("All six native ambient assets load"), Mix->BuildFromSite(Site))) return false;

    TArray<UAudioComponent*> Voices;
    Site->GetComponents(Voices);
    TestEqual(TEXT("One voice per ambient layer"), Voices.Num(), 6);
    TMap<FName, UAudioComponent*> ByName;
    for (UAudioComponent* Voice : Voices)
    {
        if (!Voice || !Voice->Sound) continue;
        ByName.Add(Voice->Sound->GetFName(), Voice);
        const FSoundAttenuationSettings& Attenuation = Voice->AttenuationOverrides;
        const FTransform Origin = Voice->GetComponentTransform();
        const FVector Position = Origin.GetTranslation();
        const float Near = Attenuation.Evaluate(Origin, Position);
        const float Middle = Attenuation.Evaluate(Origin,
            Position + FVector(Attenuation.FalloffDistance * .5f, 0.f, 0.f));
        const float Outside = Attenuation.Evaluate(Origin,
            Position + FVector(Attenuation.GetMaxDimension() + 1000.f, 0.f, 0.f));
        TestTrue(TEXT("Ambient layer is spatial and attenuated"),
            Voice->bOverrideAttenuation && Attenuation.bAttenuate && Attenuation.bSpatialize);
        TestTrue(TEXT("Distance reduces gain and silences beyond the sound radius"),
            Near > Middle && Middle > Outside && FMath::IsNearlyZero(Outside));
        TestTrue(TEXT("Obstruction reduces gain and high frequencies"),
            Attenuation.bEnableOcclusion && Attenuation.OcclusionVolumeAttenuation > 0.f &&
            Attenuation.OcclusionVolumeAttenuation < 1.f && Attenuation.OcclusionLowPassFilterFrequency < 2000.f);
    }
    for (const TCHAR* Name : {TEXT("Birds"), TEXT("Insects"), TEXT("Fire"), TEXT("Crowd")})
        if (!TestTrue(*FString::Printf(TEXT("Reactive layer %s exists"), Name), ByName.Contains(FName(Name)))) return false;

    const auto Settle = [Mix]()
    {
        for (int32 I = 0; I < 50; ++I) Mix->TickComponent(.2f, LEVELTICK_All, nullptr);
    };
    Mix->SetEnabled(true);
    Mix->SetTimeOfDay(12.f);
    Mix->SetJamActive(false);
    Settle();
    TMap<FName, float> Day;
    for (const auto& Pair : ByName) Day.Add(Pair.Key, Pair.Value->VolumeMultiplier);
    Mix->SetTimeOfDay(22.f);
    Mix->SetJamActive(true);
    Settle();
    TestTrue(TEXT("Night reduces birds"), ByName[TEXT("Birds")]->VolumeMultiplier < Day[TEXT("Birds")] * .4f);
    TestTrue(TEXT("Night brings insects forward"), ByName[TEXT("Insects")]->VolumeMultiplier > Day[TEXT("Insects")] * 4.f);
    TestTrue(TEXT("Night brings fire forward"), ByName[TEXT("Fire")]->VolumeMultiplier > Day[TEXT("Fire")] * 1.5f);
    TestTrue(TEXT("Joining the jam brings crowd forward"), ByName[TEXT("Crowd")]->VolumeMultiplier > Day[TEXT("Crowd")] * 2.f);

    const float NightBirds = ByName[TEXT("Birds")]->VolumeMultiplier;
    Mix->SetEnabled(false);
    Mix->SetTimeOfDay(12.f);
    Settle();
    TestFalse(TEXT("Festival mute state retained"), Mix->IsEnabled());
    TestEqual(TEXT("Muted mix stops processing changes"), ByName[TEXT("Birds")]->VolumeMultiplier, NightBirds);
    Mix->SetEnabled(true);
    Settle();
    TestTrue(TEXT("Unmute resumes the current time-of-day mix"), ByName[TEXT("Birds")]->VolumeMultiplier > NightBirds * 3.f);

    Mix->SetEnabled(false);
    TestTrue(TEXT("Soundscape can rebuild while muted"), Mix->BuildFromSite(Site));
    Voices.Reset();
    Site->GetComponents(Voices);
    TestEqual(TEXT("Rebuild replaces voices without doubling ambience"), Voices.Num(), 6);
    TestFalse(TEXT("Rebuild preserves mute"), Mix->IsEnabled());
    return !HasAnyErrors();
}
#endif
