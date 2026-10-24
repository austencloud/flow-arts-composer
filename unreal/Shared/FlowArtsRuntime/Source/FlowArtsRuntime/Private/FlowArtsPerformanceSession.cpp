#include "FlowArtsPerformanceSession.h"
#include "FlowFestAvatarComponent.h"
#include "FlowFestPropComponent.h"
#include "FlowFestAnimInstance.h"
#include "FlowArtsRuntimeMotion.h"
#include "Animation/AnimSequence.h"
#include "Components/SkeletalMeshComponent.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#if PLATFORM_WINDOWS
#include "Windows/WindowsHWrapper.h"
#include "Windows/AllowWindowsPlatformTypes.h"
THIRD_PARTY_INCLUDES_START
#include <bcrypt.h>
THIRD_PARTY_INCLUDES_END
#include "Windows/HideWindowsPlatformTypes.h"
#endif

namespace
{
struct FActiveFamilyOverride
{
    TWeakPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Motion;
    FName CharacterId;
    FName Profile;
};

// Only motions installed by the packaged family path may regain a library
// selection when a new control session attaches to the playing avatar.
TArray<FActiveFamilyOverride> ActiveFamilyOverrides;

bool IsFamilyOverride(FName Character, FName Profile, FName Family)
{
    return (Character == TEXT("x-bot") || Character == TEXT("ch34")) && Family == TEXT("staff") &&
        (Profile == TEXT("P_staff_A") || Profile == TEXT("P_staff_B"));
}

FString CanonicalProp(FString Id)
{
    Id = Id.ToLower();
    Id.RemoveFromEnd(TEXT(":default"));
    return Id;
}

bool IsHash(const FString& Value)
{
    if (Value.Len() != 64) return false;
    for (const TCHAR C : Value)
        if (!((C >= TEXT('0') && C <= TEXT('9')) || (C >= TEXT('a') && C <= TEXT('f')))) return false;
    return true;
}

bool HashFileMatches(const FString& Path, const FString& Expected)
{
    TArray<uint8> Bytes;
    if (!IsHash(Expected) || !FFileHelper::LoadFileToArray(Bytes, *Path) || Bytes.IsEmpty() ||
        static_cast<uint64>(Bytes.Num()) > MAX_uint32) return false;
#if PLATFORM_WINDOWS
    BCRYPT_ALG_HANDLE Algorithm = nullptr;
    if (BCryptOpenAlgorithmProvider(&Algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) < 0) return false;
    uint8 Digest[32]{};
    const NTSTATUS Status = BCryptHash(Algorithm, nullptr, 0, Bytes.GetData(),
        static_cast<ULONG>(Bytes.Num()), Digest, sizeof(Digest));
    BCryptCloseAlgorithmProvider(Algorithm, 0);
    if (Status < 0) return false;
    FString Actual;
    Actual.Reserve(64);
    for (const uint8 Byte : Digest) Actual += FString::Printf(TEXT("%02x"), Byte);
    return Actual == Expected;
#else
    return false;
#endif
}

bool ReadFamilyOverride(const FString& Directory, const FFlowArtsPerformanceEntry& Entry, const FString& EquippedProp,
    FString& OutPath, FString& Error)
{
    FString ManifestText;
    TSharedPtr<FJsonObject> Manifest;
    const TArray<TSharedPtr<FJsonValue>>* Rows = nullptr;
    FString Schema;
    if (!FFileHelper::LoadFileToString(ManifestText, *(Directory / TEXT("manifest.json"))) ||
        !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(ManifestText), Manifest) || !Manifest ||
        !Manifest->TryGetStringField(TEXT("schema"), Schema) || Schema != TEXT("flow-arts-runtime-family-overrides-v1") ||
        !Manifest->TryGetArrayField(TEXT("entries"), Rows) || !Rows || Rows->Num() != 4)
    {
        Error = TEXT("Packaged runtime family override manifest is missing or invalid");
        return false;
    }
    TSet<FString> Seen;
    FString BundleHash, PropId, ScoreHash;
    const FString Wanted = Entry.CharacterId.ToString() + TEXT("/") + Entry.Profile.ToString();
    for (const TSharedPtr<FJsonValue>& Value : *Rows)
    {
        const TSharedPtr<FJsonObject>* Row = nullptr;
        FString Id, Hash, Prop, Score;
        if (!Value.IsValid() || !Value->TryGetObject(Row) || !Row || !Row->IsValid() ||
            !(*Row)->TryGetStringField(TEXT("id"), Id) ||
            !(*Row)->TryGetStringField(TEXT("bundleSHA256"), Hash) || !IsHash(Hash) ||
            !(*Row)->TryGetStringField(TEXT("propId"), Prop) ||
            !(*Row)->TryGetStringField(TEXT("sequenceSHA256"), Score) || !IsHash(Score) ||
            (Id != TEXT("x-bot/P_staff_A") && Id != TEXT("x-bot/P_staff_B") &&
                Id != TEXT("ch34/P_staff_A") && Id != TEXT("ch34/P_staff_B")) || Seen.Contains(Id))
        {
            Error = TEXT("Packaged runtime family override manifest has an invalid entry");
            return false;
        }
        Seen.Add(Id);
        if (Id == Wanted) { BundleHash = Hash; PropId = Prop; ScoreHash = Score; }
    }
    if (Seen.Num() != 4 || BundleHash.IsEmpty() || ScoreHash != Entry.SequenceSHA256 ||
        CanonicalProp(PropId) != CanonicalProp(EquippedProp))
    {
        Error = TEXT("Packaged runtime family override does not match the selected prop or score");
        return false;
    }
    FString Filename = Wanted.Replace(TEXT("/"), TEXT("_")) + TEXT(".motion.json");
    OutPath = Directory / Filename;
    if (!HashFileMatches(OutPath, BundleHash))
    {
        Error = TEXT("Packaged runtime family motion is missing or its file hash changed");
        return false;
    }
    return true;
}
}

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
    if (Avatar->GetRuntimeMotion())
    {
        const auto Current = Avatar->GetRuntimeMotion();
        for (int32 Index = ActiveFamilyOverrides.Num() - 1; Index >= 0; --Index)
        {
            const auto Known = ActiveFamilyOverrides[Index].Motion.Pin();
            if (!Known) { ActiveFamilyOverrides.RemoveAtSwap(Index); continue; }
            if (Known != Current || ActiveFamilyOverrides[Index].CharacterId != GetCharacterId()) continue;
            if (CanonicalProp(Current->GetPropId()) != CanonicalProp(Prop->GetPropId().ToString())) return false;
            const FFlowArtsPerformanceEntry* Match = nullptr;
            for (const FFlowArtsPerformanceEntry* Entry : Library.ForTarget(GetCharacterId(), GetPropFamily()))
            {
                if (Entry->Profile == ActiveFamilyOverrides[Index].Profile &&
                    Entry->SequenceSHA256 == Current->GetSequenceSHA256() &&
                    Entry->SequenceJson == Current->GetSequenceJson())
                {
                    if (Match) return false;
                    Match = Entry;
                }
            }
            Selected = Match;
            return Selected != nullptr;
        }
        SelectRuntimeMotion();
        return Selected != nullptr;
    }
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
    if (IsFamilyOverride(Entry.CharacterId, Entry.Profile, Entry.PropFamily))
    {
        if (!Cast<UFlowFestAnimInstance>(Body->GetBodyMesh()->GetAnimInstance()))
        {
            Error = TEXT("The performer's animation is not ready");
            return false;
        }
        FString Path;
        const FString Directory = FamilyOverrideDirectory.IsEmpty() ?
            FPaths::ProjectContentDir() / TEXT("Data/RuntimeFamilyMotion") : FamilyOverrideDirectory;
        if (!ReadFamilyOverride(Directory, Entry, Props->GetPropId().ToString(), Path, Error)) return false;
        FString CatalogJson, RigHash;
        TSharedPtr<FJsonObject> Catalog;
        const TSharedPtr<FJsonObject>* Rigs = nullptr;
        if (!FFileHelper::LoadFileToString(CatalogJson,
                *(FPaths::ProjectContentDir() / TEXT("Data/runtime-rigs.json"))) ||
            !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(CatalogJson), Catalog) || !Catalog ||
            !Catalog->TryGetObjectField(TEXT("rigs"), Rigs) || !Rigs ||
            !(*Rigs)->TryGetStringField(Entry.CharacterId.ToString(), RigHash))
        {
            Error = TEXT("This build is missing its runtime rig catalog");
            return false;
        }
        TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Motion;
        if (!FFlowArtsRuntimeMotion::LoadFromFile(Path, Entry.CharacterId.ToString(), RigHash,
                Body->GetBodyMesh()->GetSkeletalMeshAsset(), Motion, Error)) return false;
        if (CanonicalProp(Motion->GetPropId()) != CanonicalProp(Props->GetPropId().ToString()) ||
            Motion->GetPropFamily() != Entry.PropFamily.ToString() ||
            Motion->GetSequenceSHA256() != Entry.SequenceSHA256 ||
            Motion->GetSequenceJson() != Entry.SequenceJson ||
            Motion->GetCapturePlane() != TEXT("wall") ||
            !FMath::IsNearlyEqual(Motion->GetDurationSeconds(), Entry.DurationSeconds, .001f))
        {
            Error = TEXT("Packaged runtime family motion does not match the prepared performance");
            return false;
        }
        if (!Props->LoadRuntimePerformance(Motion))
        {
            Error = TEXT("The packaged prop motion could not be loaded");
            return false;
        }
        Body->BindPerformanceProp(Props);
        if (!Body->PlayRuntimePerformance(Motion))
        {
            Error = TEXT("The packaged body motion could not start");
            return false;
        }
        Selected = &Entry;
        ActiveFamilyOverrides.RemoveAll([](const FActiveFamilyOverride& Known) { return !Known.Motion.IsValid(); });
        ActiveFamilyOverrides.Add({Motion, Entry.CharacterId, Entry.Profile});
        Body->SetPerformanceRate(Transfer ? Transfer->Rate : 1.f);
        if (Transfer) Body->SeekPerformance(Transfer->Phase * Body->GetPerformanceLength());
        Body->SetPerformancePaused(Transfer ? Transfer->bPaused : false);
        Error.Empty();
        return true;
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

bool FFlowArtsPerformanceSession::PlayBuiltIn(FName Profile, FString& Error)
{
    UFlowFestAvatarComponent* Body = Avatar.Get();
    UFlowFestPropComponent* Props = Prop.Get();
    if (!Body || !Props || !Props->IsReady() || Profile.IsNone())
    {
        Error = TEXT("Choose a ready performer and prop before playing a routine");
        return false;
    }
    if (!IsFamilyOverride(GetCharacterId(), Profile, GetPropFamily()))
    {
        if (!Props->LoadPerformance(GetCharacterId(), Profile) || !Body->PlayPerformance(Profile))
        {
            Error = TEXT("Prepared performance could not start");
            return false;
        }
        Selected = nullptr;
        RuntimeEntry.Reset();
        Error.Empty();
        return true;
    }
    static FFlowArtsPerformanceLibrary Library;
    static FString LibraryError;
    static const bool bLoaded = FFlowArtsPerformanceLibrary::LoadFromProject(Library, LibraryError);
    if (!bLoaded) { Error = LibraryError; return false; }
    const FFlowArtsPerformanceEntry* Match = nullptr;
    for (const FFlowArtsPerformanceEntry* Entry : Library.ForTarget(GetCharacterId(), GetPropFamily()))
    {
        if (Entry->Profile != Profile) continue;
        if (Match) { Error = TEXT("The built-in routine is ambiguous"); return false; }
        Match = Entry;
    }
    if (!Match) { Error = TEXT("The built-in routine has no exact prepared score"); return false; }
    return Play(*Match, nullptr, Error);
}

void FFlowArtsPerformanceSession::SelectRuntimeMotion()
{
    const auto Motion = Avatar.IsValid() ? Avatar->GetRuntimeMotion() : nullptr;
    if (!Motion) return;
    FFlowArtsPerformanceEntry Entry;
    Entry.Id = Motion->GetProfile().ToString();
    Entry.CharacterId = GetCharacterId();
    Entry.Profile = Motion->GetProfile();
    Entry.PropFamily = FName(*Motion->GetPropFamily());
    Entry.SequenceJson = Motion->GetSequenceJson();
    Entry.SequenceSHA256 = Motion->GetSequenceSHA256();
    Entry.DurationSeconds = Motion->GetDurationSeconds();
    Entry.ScoreUnitsPerSecond = 1.f;
    Entry.Title = TEXT("Imported sequence");
    TSharedPtr<FJsonObject> Score;
    if (FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Entry.SequenceJson), Score) && Score)
    {
        FString Name;
        if (Score->TryGetStringField(TEXT("name"), Name) && !Name.IsEmpty()) Entry.Title = Name.Left(160);
    }
    RuntimeEntry = MoveTemp(Entry);
    Selected = &RuntimeEntry.GetValue();
}

bool FFlowArtsPerformanceSession::ImportMotionFile(const FString& InputPath, FString& Error)
{
    UFlowFestAvatarComponent* Body = Avatar.Get();
    UFlowFestPropComponent* Props = Prop.Get();
    if (!Body || !Props || !Body->GetBodyMesh() || !Body->GetBodyMesh()->GetSkeletalMeshAsset())
    {
        Error = TEXT("Choose a performer before importing motion.");
        return false;
    }
    // Preflight the body before the prop loader installs a new track. Both
    // installs run on this game-thread call, so a missing animator must not
    // leave the currently equipped props playing a motion the body rejected.
    if (!Cast<UFlowFestAnimInstance>(Body->GetBodyMesh()->GetAnimInstance()))
    {
        Error = TEXT("The performer's animation is not ready. Choose the character again before importing motion.");
        return false;
    }
    FString Path = InputPath.TrimStartAndEnd();
    if (Path.IsEmpty()) { Error = TEXT("Paste the path of a motion file first."); return false; }
    Path.RemoveFromStart(TEXT("\"")); Path.RemoveFromEnd(TEXT("\""));
    if (FPaths::IsRelative(Path)) Path = FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("Performances"), Path);
    FString CatalogJson, RigHash;
    TSharedPtr<FJsonObject> Catalog;
    const TSharedPtr<FJsonObject>* Rigs = nullptr;
    if (!FFileHelper::LoadFileToString(CatalogJson, *FPaths::Combine(FPaths::ProjectContentDir(), TEXT("Data/runtime-rigs.json"))) ||
        !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(CatalogJson), Catalog) || !Catalog ||
        !Catalog->TryGetObjectField(TEXT("rigs"), Rigs) || !Rigs ||
        !(*Rigs)->TryGetStringField(GetCharacterId().ToString(), RigHash))
    {
        Error = TEXT("This build is missing its runtime rig catalog.");
        return false;
    }
    TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Motion;
    if (!FFlowArtsRuntimeMotion::LoadFromFile(Path, GetCharacterId().ToString(), RigHash,
        Body->GetBodyMesh()->GetSkeletalMeshAsset(), Motion, Error)) return false;
    const auto CanonicalProp = [](FString Id) {
        Id = Id.ToLower(); Id.RemoveFromEnd(TEXT(":default")); return Id;
    };
    if (CanonicalProp(Motion->GetPropId()) != CanonicalProp(Props->GetPropId().ToString()))
    {
        Error = FString::Printf(TEXT("This motion uses %s. Equip that prop before loading it."), *Motion->GetPropId());
        return false;
    }
    if (!Props->LoadRuntimePerformance(Motion))
    {
        Error = TEXT("The motion's prop track could not be loaded.");
        return false;
    }
    Body->BindPerformanceProp(Props);
    if (!Body->PlayRuntimePerformance(Motion))
    {
        Error = TEXT("The motion could not start on this performer.");
        return false;
    }
    SelectRuntimeMotion();
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
