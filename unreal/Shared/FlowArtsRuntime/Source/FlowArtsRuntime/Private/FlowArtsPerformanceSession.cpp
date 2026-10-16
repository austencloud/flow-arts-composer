#include "FlowArtsPerformanceSession.h"
#include "FlowFestAvatarComponent.h"
#include "FlowFestPropComponent.h"
#include "FlowFestAnimInstance.h"
#include "Animation/AnimSequence.h"
#include "Components/SkeletalMeshComponent.h"

FFlowArtsPerformanceSession::FFlowArtsPerformanceSession(UFlowFestAvatarComponent* InAvatar, UFlowFestPropComponent* InProp)
    : Avatar(InAvatar), Prop(InProp) {}

FName FFlowArtsPerformanceSession::GetCharacterId() const
{
    return Avatar.IsValid() ? Avatar->GetCharacterId() : NAME_None;
}

FName FFlowArtsPerformanceSession::GetPropFamily() const
{
    if (!Prop.IsValid()) return NAME_None;
    FString Family = Prop->GetPropId().ToString().ToLower();
    int32 Colon = INDEX_NONE;
    if (Family.FindChar(TEXT(':'), Colon)) Family.LeftInline(Colon);
    return FName(*Family);
}

bool FFlowArtsPerformanceSession::AttachCurrent(const FFlowArtsPerformanceLibrary& Library)
{
    Selected = nullptr;
    if (!Avatar.IsValid() || !Prop.IsValid() || GetLength() <= 0.f) return false;
    const FName Profile = Avatar->GetPerformanceProfile();
    if (Profile.IsNone()) return false;
    for (const FFlowArtsPerformanceEntry* Entry : Library.ForTarget(GetCharacterId(), GetPropFamily()))
    {
        if (!Entry || Entry->Profile != Profile) continue;
        // Two snapshots with the same runtime profile cannot be distinguished from the avatar.
        if (Selected) { Selected = nullptr; return false; }
        Selected = Entry;
    }
    return Selected != nullptr;
}

bool FFlowArtsPerformanceSession::Play(const FFlowArtsPerformanceEntry& Entry,
    const FFlowArtsPerformanceTransfer* Transfer, FString& Error)
{
    if (Transfer && (!FMath::IsFinite(Transfer->Phase) || Transfer->Phase < 0.f || Transfer->Phase >= 1.f ||
        !FMath::IsFinite(Transfer->Rate) || Transfer->Rate < .5f || Transfer->Rate > 1.75f))
    {
        Error = TEXT("Composer transfer phase or rate is out of range");
        return false;
    }
    UFlowFestAvatarComponent* Body = Avatar.Get();
    UFlowFestPropComponent* Props = Prop.Get();
    if (!Body || !Props || !Props->IsReady() || !Body->GetBodyMesh() ||
        Entry.CharacterId != GetCharacterId() || Entry.PropFamily != GetPropFamily() ||
        (Transfer && (Transfer->SequenceSHA256 != Entry.SequenceSHA256 || Transfer->SequenceJson != Entry.SequenceJson ||
            (!Transfer->CharacterId.IsNone() && Transfer->CharacterId != Entry.CharacterId) ||
            (!Transfer->PropFamily.IsNone() && Transfer->PropFamily != Entry.PropFamily))))
    {
        Error = TEXT("This prepared performance does not match the selected performer and prop");
        return false;
    }
    if (!FFlowArtsPerformanceLibrary::VerifySnapshot(Entry.SequenceSHA256, Entry.SequenceJson))
    {
        Error = TEXT("Prepared sequence snapshot changed; preparation is required");
        return false;
    }
    FString Character = Entry.CharacterId.ToString();
    Character.ReplaceInline(TEXT("-"), TEXT("_"));
    const FString Profile = Entry.Profile.ToString();
    const FString Asset = FString::Printf(TEXT("/Game/FlowFest/Characters/%s/A_Flow_%s.A_Flow_%s"),
        *Character, *Profile, *Profile);
    UAnimSequence* Clip = LoadObject<UAnimSequence>(nullptr, *Asset);
    USkeletalMeshComponent* Mesh = Body->GetBodyMesh();
    if (!Clip || !Mesh->GetSkeletalMeshAsset() || Clip->GetSkeleton() != Mesh->GetSkeletalMeshAsset()->GetSkeleton() ||
        !Cast<UFlowFestAnimInstance>(Mesh->GetAnimInstance()))
    {
        Error = TEXT("Exact prepared body clip is missing or has the wrong rig; preparation is required");
        return false;
    }
    if (!Props->LoadPerformance(Entry.CharacterId, Entry.Profile))
    {
        Error = TEXT("Exact prepared prop track is missing or mismatched; preparation is required");
        return false;
    }
    Body->BindPerformanceProp(Props);
    if (!Body->PlayPerformance(Entry.Profile, true))
    {
        Error = TEXT("Prepared body clip could not start; preparation is required");
        return false;
    }
    Selected = &Entry;
    Body->SetPerformanceRate(Transfer ? Transfer->Rate : 1.f);
    if (Transfer) Body->SeekPerformance(Transfer->Phase * Body->GetPerformanceLength());
    Body->SetPerformancePaused(Transfer ? Transfer->bPaused : false);
    Error.Empty();
    return true;
}

void FFlowArtsPerformanceSession::Pause(bool bPaused)
{
    if (Avatar.IsValid() && Avatar->GetPerformanceLength() > 0) Avatar->SetPerformancePaused(bPaused);
}

void FFlowArtsPerformanceSession::Restart()
{
    if (Avatar.IsValid() && Avatar->GetPerformanceLength() > 0) Avatar->RestartPerformance();
}

void FFlowArtsPerformanceSession::Seek(float Seconds)
{
    if (Avatar.IsValid() && Avatar->GetPerformanceLength() > 0) Avatar->SeekPerformance(Seconds);
}

void FFlowArtsPerformanceSession::SetRate(float Rate)
{
    if (Avatar.IsValid() && Avatar->GetPerformanceLength() > 0 && FMath::IsFinite(Rate))
        Avatar->SetPerformanceRate(FMath::Clamp(Rate, .5f, 1.75f));
}

bool FFlowArtsPerformanceSession::IsPaused() const { return Avatar.IsValid() && Avatar->IsPerformancePaused(); }
float FFlowArtsPerformanceSession::GetTime() const { return Avatar.IsValid() ? Avatar->GetPerformanceTime() : 0.f; }
float FFlowArtsPerformanceSession::GetLength() const { return Avatar.IsValid() ? Avatar->GetPerformanceLength() : 0.f; }
float FFlowArtsPerformanceSession::GetRate() const { return Avatar.IsValid() ? Avatar->GetPerformanceRate() : 1.f; }

bool FFlowArtsPerformanceSession::CopyTransfer(FString& OutJson) const
{
    if (!Selected || !Avatar.IsValid()) return false;
    const float Length = GetLength();
    const float Phase = Length > SMALL_NUMBER ? FMath::Clamp(GetTime() / Length, 0.f, .999999f) : 0.f;
    return FFlowArtsPerformanceLibrary::MakeTransfer(*Selected, Phase, GetRate(), IsPaused(), OutJson);
}
