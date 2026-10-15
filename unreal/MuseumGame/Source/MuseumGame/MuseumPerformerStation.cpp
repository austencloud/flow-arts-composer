#include "MuseumPerformerStation.h"
#include "FlowFestAvatarComponent.h"
#include "FlowFestPropComponent.h"
#include "Components/SceneComponent.h"
#include "Components/SkeletalMeshComponent.h"

AMuseumPerformerStation::AMuseumPerformerStation()
{
    PrimaryActorTick.bCanEverTick = false;
    Feet = CreateDefaultSubobject<USceneComponent>(TEXT("Feet"));
    SetRootComponent(Feet);
    Avatar = CreateDefaultSubobject<UFlowFestAvatarComponent>(TEXT("Avatar"));
    Prop = CreateDefaultSubobject<UFlowFestPropComponent>(TEXT("Prop"));
}

bool AMuseumPerformerStation::Fail(const FString& Reason)
{
    Failure = Reason;
    bReady = false;
    bPlaying = false;
    bPaused = false;
    if (Avatar) Avatar->SetPresentation(false, false);
    if (Prop) Prop->SetVisible(false);
    UE_LOG(LogTemp, Error, TEXT("Museum performer %s (%s, profile %s): %s"),
        *StationId, *SequenceId, *PerformanceProfile.ToString(), *Reason);
    return false;
}

bool AMuseumPerformerStation::Configure(const FString& InId, const FString& InLabel, const FString& InSequenceId,
    FName CharacterId, FName Profile, FName PropId, bool bBodyVisible, bool bAutoPlay, float Rate)
{
    StationId = InId;
    Label = InLabel;
    SequenceId = InSequenceId;
    Character = CharacterId;
    PerformanceProfile = Profile;
    PropName = PropId;
    PlaybackRate = Rate;
    bShowBody = bBodyVisible;
    if (StationId.IsEmpty() || SequenceId.IsEmpty() || Character.IsNone() || PerformanceProfile.IsNone() || PropName.IsNone())
        return Fail(TEXT("incomplete native playback identity"));
    if (!FMath::IsFinite(PlaybackRate) || PlaybackRate < .5f || PlaybackRate > 1.75f)
        return Fail(TEXT("playback rate outside shared runtime range"));

    Avatar->Initialize(Feet, Character);
    if (!Avatar->GetBodyMesh() || !Avatar->GetBodyMesh()->GetSkeletalMeshAsset() || Avatar->GetCharacterId() != Character)
        return Fail(TEXT("character assets could not be loaded"));
    Avatar->SetFootstepsEnabled(false);
    // The formation intentionally hides one body while its hand-driven prop remains visible.
    Avatar->GetBodyMesh()->VisibilityBasedAnimTickOption = EVisibilityBasedAnimTickOption::AlwaysTickPoseAndRefreshBones;
    Avatar->SetPresentation(bBodyVisible, false);

    Prop->Initialize(Feet);
    if (!Prop->Equip(PropName) || !Prop->IsReady())
        return Fail(TEXT("authored prop could not be equipped"));
    if (!Prop->BindHands(Avatar->GetBodyMesh()))
        return Fail(TEXT("prop could not bind to avatar hands"));
    Prop->SetHandTransforms(Avatar->GetHandTransform(true), Avatar->GetHandTransform(false));
    if (!Prop->LoadPerformance(Character, PerformanceProfile))
        return Fail(TEXT("exact authored prop track is missing"));
    Avatar->BindPerformanceProp(Prop);
    bReady = true;
    if (bAutoPlay) return StartPlayback();
    return true;
}

bool AMuseumPerformerStation::StartPlayback()
{
    if (!bReady) return false;
    if (USkeletalMeshComponent* Body = Avatar->GetBodyMesh()) Body->bPauseAnims = false;
    Avatar->SetComponentTickEnabled(true);
    Prop->SetComponentTickEnabled(true);
    if (!Avatar->PlayPerformance(PerformanceProfile, true))
        return Fail(TEXT("exact authored body clip is missing"));
    Avatar->SetPerformanceRate(PlaybackRate);
    Prop->SetPerformanceTime(Avatar->GetPerformanceTime());
    bPlaying = true;
    bPaused = false;
    return true;
}

void AMuseumPerformerStation::TogglePlayback()
{
    if (!bReady) return;
    if (!bPlaying) { StartPlayback(); return; }
    bPaused = !bPaused;
    if (USkeletalMeshComponent* Body = Avatar->GetBodyMesh()) Body->bPauseAnims = bPaused;
    Avatar->SetComponentTickEnabled(!bPaused);
    Prop->SetComponentTickEnabled(!bPaused);
}

void AMuseumPerformerStation::RestartPlayback()
{
    if (!bReady) return;
    if (!bPlaying) { StartPlayback(); return; }
    if (USkeletalMeshComponent* Body = Avatar->GetBodyMesh()) Body->bPauseAnims = false;
    Avatar->SetComponentTickEnabled(true);
    Prop->SetComponentTickEnabled(true);
    Avatar->SetPerformancePhase(0.f);
    Avatar->SetPerformanceRate(PlaybackRate);
    Prop->SetPerformanceTime(0.f);
    bPaused = false;
}

FString AMuseumPerformerStation::GetPlaybackStatus() const
{
    if (!Failure.IsEmpty()) return FString::Printf(TEXT("Unavailable: %s"), *Failure);
    if (!bReady) return TEXT("Unavailable");
    if (!bPlaying) return TEXT("Ready");
    return bPaused ? TEXT("Paused") : TEXT("Playing");
}

float AMuseumPerformerStation::GetPlaybackPhase() const
{
    return Avatar ? Avatar->GetPerformancePhase() : 0.f;
}

float AMuseumPerformerStation::GetGripErrorCm() const
{
    return Prop ? Prop->GetGripErrorCm() : 0.f;
}

FTransform AMuseumPerformerStation::GetPropRootTransform(bool bLeft) const
{
    return Prop ? Prop->GetPropRootTransform(bLeft) : FTransform::Identity;
}

bool AMuseumPerformerStation::IsPropReady() const
{
    return Prop && Prop->IsReady();
}
