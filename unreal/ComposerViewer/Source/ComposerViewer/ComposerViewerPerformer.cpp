#include "ComposerViewerPerformer.h"
#include "FlowFestAvatarComponent.h"
#include "FlowFestPropComponent.h"
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

bool AComposerViewerPerformer::Configure(const FString& InId, FName InCharacter, FName InProp, float InRate)
{
    if (InId.IsEmpty() || InCharacter != TEXT("ch01") || (InProp != TEXT("staff") && InProp != TEXT("fan")) ||
        !FMath::IsFinite(InRate) || InRate < .5f || InRate > 1.75f) return false;
    PerformerId = InId;
    CharacterId = InCharacter;
    PropId = InProp;
    Rate = InRate;
    Avatar->Initialize(Feet, CharacterId);
    USkeletalMeshComponent* Body = Avatar->GetBodyMesh();
    if (!Body || !Body->GetSkeletalMeshAsset() || Avatar->GetCharacterId() != CharacterId) return false;
    Avatar->SetFootstepsEnabled(false);
    Body->VisibilityBasedAnimTickOption = EVisibilityBasedAnimTickOption::AlwaysTickPoseAndRefreshBones;
    Avatar->SetPresentation(true, false);
    Prop->Initialize(Feet);
    if (!Prop->Equip(PropId) || !Prop->IsReady() || !Prop->BindHands(Body)) return false;
    Prop->SetHandTransforms(Avatar->GetHandTransform(true), Avatar->GetHandTransform(false));
    const FName Profile(*FString::Printf(TEXT("P_%s_A"), *PropId.ToString()));
    if (!Prop->LoadPerformance(CharacterId, Profile)) return false;
    Avatar->BindPerformanceProp(Prop);
    if (!Avatar->PlayPerformance(Profile, true)) return false;
    Avatar->SetPerformanceRate(Rate);
    Prop->SetPerformanceTime(Avatar->GetPerformanceTime());
    bPlaying = true;
    return true;
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
