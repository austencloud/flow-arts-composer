#include "ComposerViewerPerformer.h"
#include "FlowFestAvatarComponent.h"
#include "FlowFestPropComponent.h"
#include "FlowArtsRuntimeMotion.h"
#include "FlowFestAnimInstance.h"
#include "Components/SceneComponent.h"
#include "Components/SkeletalMeshComponent.h"

AComposerViewerPerformer::AComposerViewerPerformer()
{
    PrimaryActorTick.bCanEverTick = false;
    Feet = CreateDefaultSubobject<USceneComponent>(TEXT("Feet"));
    SetRootComponent(Feet);
    Avatar = CreateDefaultSubobject<UFlowFestAvatarComponent>(TEXT("Avatar"));
    Prop = CreateDefaultSubobject<UFlowFestPropComponent>(TEXT("Prop"));
}

bool AComposerViewerPerformer::Configure(const FString& InId, FName InCharacter, FName InProp, float InRate,
    bool bInComposerOwned, const FString& InEffect)
{
    FString Family = InProp.ToString().ToLower();
    int32 VariantSeparator = INDEX_NONE;
    if (Family.FindChar(TEXT(':'), VariantSeparator)) Family.LeftInline(VariantSeparator);
    if (InId.IsEmpty() || InCharacter.IsNone() || Family.IsEmpty() ||
        !(InEffect.IsEmpty() || InEffect == TEXT("none") || InEffect == TEXT("fire") || InEffect == TEXT("led")) ||
        !FMath::IsFinite(InRate) || InRate < .5f || InRate > 1.75f) return false;
    PerformerId = InId;
    CharacterId = InCharacter;
    PropId = InProp;
    bComposerOwned = bInComposerOwned;
    Rate = InRate;
    Avatar->Initialize(Feet, CharacterId);
    USkeletalMeshComponent* Body = Avatar->GetBodyMesh();
    if (!Body || !Body->GetSkeletalMeshAsset() || Avatar->GetCharacterId() != CharacterId) return false;
    Avatar->SetFootstepsEnabled(false);
    Body->VisibilityBasedAnimTickOption = EVisibilityBasedAnimTickOption::AlwaysTickPoseAndRefreshBones;
    Avatar->SetPresentation(true, false);
    Prop->Initialize(Feet);
    if (!Prop->Equip(PropId) || !Prop->IsReady() || !Prop->BindHands(Body)) return false;
    SetEffect(InEffect);
    Prop->SetHandTransforms(Avatar->GetHandTransform(true), Avatar->GetHandTransform(false));
    Avatar->BindPerformanceProp(Prop);
    const FName Profile(*FString::Printf(TEXT("P_%s_A"), *Family));
    bPreparedClip = !bComposerOwned && Prop->LoadPerformance(CharacterId, Profile) && Avatar->PlayPerformance(Profile, true);
    if (bPreparedClip)
    {
        Avatar->SetPerformanceRate(Rate);
        Prop->SetPerformanceTime(Avatar->GetPerformanceTime());
        bPlaying = true;
    }
    return true;
}

bool AComposerViewerPerformer::LoadRuntimeMotion(const FString& Json, const FString& RigSHA256, FString& Error)
{
    USkeletalMeshComponent* Body = Avatar ? Avatar->GetBodyMesh() : nullptr;
    if (!Body || !Body->GetSkeletalMeshAsset() || !Cast<UFlowFestAnimInstance>(Body->GetAnimInstance()))
    {
        Error = TEXT("The native avatar animator is unavailable");
        return false;
    }
    TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Motion;
    if (!FFlowArtsRuntimeMotion::Parse(Json, CharacterId.ToString(), RigSHA256,
        Body->GetSkeletalMeshAsset(), Motion, Error)) return false;
    FString Equipped = PropId.ToString().ToLower();
    FString Captured = Motion->GetPropId().ToLower();
    Equipped.RemoveFromEnd(TEXT(":default"));
    Captured.RemoveFromEnd(TEXT(":default"));
    if (Equipped != Captured)
    {
        Error = TEXT("The captured prop differs from the equipped prop");
        return false;
    }
    const auto Previous = Avatar->GetRuntimeMotion();
    if (!Prop->LoadRuntimePerformance(Motion))
    {
        Error = TEXT("The captured prop track could not be loaded");
        return false;
    }
    // Loading the prop track equips it again and restores its catalog finish.
    SetEffect(Effect);
    Avatar->BindPerformanceProp(Prop);
    if (!Avatar->PlayRuntimePerformance(Motion, bComposerOwned
        ? EFlowFestRuntimePosePolicy::PreserveCapturedPose : EFlowFestRuntimePosePolicy::GameClearance))
    {
        if (Previous.IsValid()) Prop->LoadRuntimePerformance(Previous);
        else if (bPreparedClip)
        {
            FString Family = PropId.ToString().ToLower();
            int32 Separator = INDEX_NONE;
            if (Family.FindChar(TEXT(':'), Separator)) Family.LeftInline(Separator);
            Prop->LoadPerformance(CharacterId, FName(*FString::Printf(TEXT("P_%s_A"), *Family)));
        }
        SetEffect(Effect);
        Error = TEXT("The captured body motion could not be installed");
        return false;
    }
    Avatar->SetPerformanceRate(Rate);
    Prop->SetPerformanceTime(Avatar->GetPerformanceTime());
    Avatar->SetPerformancePaused(!bPlaying);
    Error.Empty();
    return true;
}

bool AComposerViewerPerformer::SetEffect(const FString& InEffect)
{
    if (!(InEffect.IsEmpty() || InEffect == TEXT("none") || InEffect == TEXT("fire") || InEffect == TEXT("led")))
        return false;
    Effect = InEffect;
    if (Prop)
    {
        if (Effect.IsEmpty()) Prop->ResetFinish();
        else Prop->SetFinish(Effect == TEXT("none") ? NAME_None : FName(*Effect));
    }
    return true;
}

TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> AComposerViewerPerformer::GetRuntimeMotion() const
{
    return Avatar ? Avatar->GetRuntimeMotion() : nullptr;
}

void AComposerViewerPerformer::SetPlaying(bool bNewPlaying)
{
    if (bPlaying == bNewPlaying) return;
    Avatar->SetPerformancePaused(!bNewPlaying);
    bPlaying = bNewPlaying;
}

void AComposerViewerPerformer::Restart()
{
    Avatar->RestartPerformance();
    Prop->SetPerformanceTime(Avatar->GetPerformanceTime());
    bPlaying = !Avatar->IsPerformancePaused();
}

bool AComposerViewerPerformer::SetRate(float NewRate)
{
    if (!FMath::IsFinite(NewRate) || NewRate < .5f || NewRate > 1.75f) return false;
    Rate = NewRate;
    Avatar->SetPerformanceRate(Rate);
    return true;
}

float AComposerViewerPerformer::GetPhase() const
{
    return Avatar ? Avatar->GetPerformancePhase() : 0.f;
}

float AComposerViewerPerformer::GetPerformanceTime() const
{
    return Avatar ? Avatar->GetPerformanceTime() : 0.f;
}

void AComposerViewerPerformer::SeekPerformance(float Seconds)
{
    if (!Avatar || !Prop) return;
    Avatar->SeekPerformance(Seconds);
    Prop->SetPerformanceTime(Avatar->GetPerformanceTime());
}
