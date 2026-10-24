#include "MuseumPerformerStation.h"
#include "FlowFestAvatarComponent.h"
#include "FlowFestPropComponent.h"
#include "FlowArtsWorldScoreComponent.h"
#include "FlowArtsPerformanceSession.h"
#include "Components/SceneComponent.h"
#include "Components/SkeletalMeshComponent.h"

AMuseumPerformerStation::AMuseumPerformerStation()
{
    PrimaryActorTick.bCanEverTick = false;
    Feet = CreateDefaultSubobject<USceneComponent>(TEXT("Feet"));
    SetRootComponent(Feet);
    Avatar = CreateDefaultSubobject<UFlowFestAvatarComponent>(TEXT("Avatar"));
    Prop = CreateDefaultSubobject<UFlowFestPropComponent>(TEXT("Prop"));
    Score = CreateDefaultSubobject<UFlowArtsWorldScoreComponent>(TEXT("Score"));
    Score->SetupAttachment(Feet);
    // A physical score beside the performer, clear of the body and spinning prop.
    Score->SetRelativeLocation(FVector(15.f, -180.f, 155.f));
    // Performer and score face the shared visitor aisle.
    Score->SetRelativeRotation(FRotator::ZeroRotator);
    Score->SetRelativeScale3D(FVector(.13f));
}

bool AMuseumPerformerStation::Fail(const FString& Reason)
{
    Failure = Reason;
    bReady = false;
    if (Avatar) Avatar->SetPresentation(false, false);
    if (Prop) Prop->SetVisible(false);
    if (Score) Score->SetVisibility(false);
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
    bComposerPreview = false;
    if (StationId.IsEmpty() || SequenceId.IsEmpty() || Character.IsNone() || PerformanceProfile.IsNone() || PropName.IsNone())
        return Fail(TEXT("incomplete native playback identity"));
    if (!FMath::IsFinite(PlaybackRate) || PlaybackRate < .5f || PlaybackRate > 1.75f)
        return Fail(TEXT("playback rate outside shared runtime range"));

    if (!InitializePerformer()) return false;
    if (!Prop->LoadPerformance(Character, PerformanceProfile))
        return Fail(TEXT("exact authored prop track is missing"));
    bReady = true;
    if (bAutoPlay && !StartPlayback()) return false;
    if (StationId.StartsWith(TEXT("iso-"))) Score->ShowPerformance(Avatar, Prop, GetDisplayLabel());
    return true;
}

bool AMuseumPerformerStation::InitializePerformer()
{
    Failure.Empty();
    bReady = false;
    Avatar->Initialize(Feet, Character);
    if (!Avatar->GetBodyMesh() || !Avatar->GetBodyMesh()->GetSkeletalMeshAsset() || Avatar->GetCharacterId() != Character)
        return Fail(TEXT("character assets could not be loaded"));
    Avatar->SetFootstepsEnabled(false);
    // The formation intentionally hides one body while its hand-driven prop remains visible.
    Avatar->GetBodyMesh()->VisibilityBasedAnimTickOption = EVisibilityBasedAnimTickOption::AlwaysTickPoseAndRefreshBones;
    Avatar->SetPresentation(bShowBody, false);

    Prop->Initialize(Feet);
    if (!Prop->Equip(PropName) || !Prop->IsReady())
        return Fail(TEXT("authored prop could not be equipped"));
    if (!Prop->BindHands(Avatar->GetBodyMesh()))
        return Fail(TEXT("prop could not bind to avatar hands"));
    Prop->SetHandTransforms(Avatar->GetHandTransform(true), Avatar->GetHandTransform(false));
    Avatar->BindPerformanceProp(Prop);
    return true;
}

bool AMuseumPerformerStation::ConfigureComposerPreview(const FString& InId)
{
    StationId = InId;
    Label = TEXT("Composer preview");
    SequenceId.Empty();
    Character = TEXT("x-bot");
    PerformanceProfile = NAME_None;
    PropName = TEXT("fire_double_staff:default");
    PlaybackRate = 1.f;
    bShowBody = true;
    bComposerPreview = true;
    if (!InitializePerformer()) return false;
    bReady = true;
    // An edited score has no packaged pictograph atlas. Keep the old board hidden.
    Score->SetVisibility(false);
    UE_LOG(LogTemp, Display, TEXT("MUSEUM_COMPOSER_READY station=%s character=x-bot prop=fire_double_staff:default"), *StationId);
    return true;
}

bool AMuseumPerformerStation::LoadMotionFile(const FString& Path, FString& Error)
{
    if (!bReady) { Error = TEXT("The Museum performer is unavailable."); return false; }
    FFlowArtsPerformanceSession Session(Avatar, Prop);
    if (!Session.ImportMotionFile(Path, Error))
    {
        // The shared session preserves the current performance on failed validation.
        UE_LOG(LogTemp, Warning, TEXT("MUSEUM_MOTION_REJECTED station=%s reason=%s"), *StationId, *Error);
        return false;
    }
    UE_LOG(LogTemp, Display, TEXT("MUSEUM_MOTION_LOADED station=%s profile=%s duration=%.6f"),
        *StationId, *Avatar->GetPerformanceProfile().ToString(), Session.GetLength());
    return true;
}

FName AMuseumPerformerStation::GetProfile() const
{
    return Avatar && Avatar->GetPerformanceLength() > 0.f ? Avatar->GetPerformanceProfile() : PerformanceProfile;
}

FName AMuseumPerformerStation::GetPropId() const
{
    return Prop ? Prop->GetPropId() : PropName;
}

FString AMuseumPerformerStation::GetDisplayLabel() const
{
    if (Avatar && Avatar->GetRuntimeMotion().IsValid()) return TEXT("Composer preview");
    return Label.IsEmpty() ? StationId : Label;
}

bool AMuseumPerformerStation::StartPlayback()
{
    if (!bReady || bComposerPreview) return false;
    if (!Avatar->PlayPerformance(PerformanceProfile, true))
        return Fail(TEXT("exact authored body clip is missing"));
    Avatar->SetPerformanceRate(PlaybackRate);
    Avatar->SetPerformancePaused(false);
    Prop->SetPerformanceTime(Avatar->GetPerformanceTime());
    return true;
}

void AMuseumPerformerStation::TogglePlayback()
{
    if (!bReady) return;
    if (Avatar->GetPerformanceLength() <= 0.f) { StartPlayback(); return; }
    Avatar->SetPerformancePaused(!Avatar->IsPerformancePaused());
}

void AMuseumPerformerStation::RestartPlayback()
{
    if (!bReady) return;
    if (Avatar->GetPerformanceLength() <= 0.f) { StartPlayback(); return; }
    Avatar->RestartPerformance();
}

FString AMuseumPerformerStation::GetPlaybackStatus() const
{
    if (!Failure.IsEmpty()) return FString::Printf(TEXT("Unavailable: %s"), *Failure);
    if (!bReady) return TEXT("Unavailable");
    if (Avatar->GetPerformanceLength() <= 0.f) return TEXT("Ready");
    return Avatar->IsPerformancePaused() ? TEXT("Paused") : TEXT("Playing");
}

bool AMuseumPerformerStation::IsPlaying() const
{
    return bReady && Avatar && Avatar->GetPerformanceLength() > 0.f && !Avatar->IsPerformancePaused();
}

bool AMuseumPerformerStation::IsPaused() const
{
    return bReady && Avatar && Avatar->GetPerformanceLength() > 0.f && Avatar->IsPerformancePaused();
}

float AMuseumPerformerStation::GetPlaybackPhase() const
{
    return Avatar ? Avatar->GetPerformancePhase() : 0.f;
}

float AMuseumPerformerStation::GetGripErrorCm() const
{
    return Prop ? Prop->GetGripErrorCm() : 0.f;
}

float AMuseumPerformerStation::GetPropAnchorErrorCm() const
{
    return Prop ? Prop->GetPropAnchorErrorCm() : 0.f;
}

FTransform AMuseumPerformerStation::GetPropRootTransform(bool bLeft) const
{
    return Prop ? Prop->GetPropRootTransform(bLeft) : FTransform::Identity;
}

bool AMuseumPerformerStation::IsPropReady() const
{
    return Prop && Prop->IsReady();
}
