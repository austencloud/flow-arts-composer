#include "FlowArtsPerformanceLibrary.h"
#include "Dom/JsonObject.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"
#include "Policies/CondensedJsonPrintPolicy.h"
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
bool ReadObject(const FString& Text, TSharedPtr<FJsonObject>& Out)
{
    return FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Out) && Out.IsValid();
}

bool ReadIdentity(const TSharedPtr<FJsonObject>& Object, const TCHAR* Key, FName& Out)
{
    FString Value;
    if (!Object->TryGetStringField(Key, Value) || Value.IsEmpty()) return false;
    for (const TCHAR C : Value)
        if (!FChar::IsAlnum(C) && C != TEXT('_') && C != TEXT('-')) return false;
    Out = FName(*Value);
    return true;
}

bool IsHash(const FString& Value)
{
    if (Value.Len() != 64) return false;
    for (const TCHAR C : Value)
        if (!((C >= TEXT('0') && C <= TEXT('9')) || (C >= TEXT('a') && C <= TEXT('f')))) return false;
    return true;
}

FString JsonString(const FString& Value)
{
    FString Result;
    const TSharedRef<TJsonWriter<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>> Writer =
        TJsonWriterFactory<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>::Create(&Result);
    Writer->WriteValue(Value);
    Writer->Close();
    return Result;
}
}

bool FFlowArtsPerformanceLibrary::VerifySnapshot(const FString& Hash, const FString& Json)
{
    if (!IsHash(Hash) || Json.IsEmpty()) return false;
    TSharedPtr<FJsonObject> Sequence;
    if (!ReadObject(Json, Sequence)) return false;
    const FTCHARToUTF8 Utf8(*Json);
    if (Utf8.Length() < 1 || static_cast<uint64>(Utf8.Length()) > MAX_uint32) return false;
#if PLATFORM_WINDOWS
    BCRYPT_ALG_HANDLE Algorithm = nullptr;
    if (BCryptOpenAlgorithmProvider(&Algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) < 0) return false;
    uint8 Digest[32]{};
    const NTSTATUS Status = BCryptHash(Algorithm, nullptr, 0,
        reinterpret_cast<PUCHAR>(const_cast<ANSICHAR*>(Utf8.Get())),
        static_cast<ULONG>(Utf8.Length()), Digest, sizeof(Digest));
    BCryptCloseAlgorithmProvider(Algorithm, 0);
    if (Status < 0) return false;
    FString Actual;
    Actual.Reserve(64);
    for (const uint8 Byte : Digest) Actual += FString::Printf(TEXT("%02x"), Byte);
    return Actual == Hash;
#else
    return false;
#endif
}

bool FFlowArtsPerformanceLibrary::Parse(const FString& Json, FFlowArtsPerformanceLibrary& Out, FString& Error)
{
    TSharedPtr<FJsonObject> Root;
    const TArray<TSharedPtr<FJsonValue>>* Rows = nullptr;
    FString Schema;
    if (!ReadObject(Json, Root) || !Root->TryGetStringField(TEXT("schema"), Schema) ||
        Schema != TEXT("tka-performance-library-v1") ||
        !Root->TryGetArrayField(TEXT("entries"), Rows) || !Rows)
    {
        Error = TEXT("Performance library schema is missing or unsupported");
        return false;
    }
    FFlowArtsPerformanceLibrary Parsed;
    TSet<FString> Ids;
    for (int32 Index = 0; Index < Rows->Num(); ++Index)
    {
        const TSharedPtr<FJsonObject>* Row = nullptr;
        if (!(*Rows)[Index].IsValid() || !(*Rows)[Index]->TryGetObject(Row) || !Row || !Row->IsValid())
        {
            Error = FString::Printf(TEXT("Performance library entry %d is malformed"), Index);
            return false;
        }
        FFlowArtsPerformanceEntry Entry;
        double Duration = 0, ScoreRate = 0;
        if (!(*Row)->TryGetStringField(TEXT("id"), Entry.Id) || Entry.Id.IsEmpty() || Ids.Contains(Entry.Id) ||
            !ReadIdentity(*Row, TEXT("characterId"), Entry.CharacterId) ||
            !ReadIdentity(*Row, TEXT("profile"), Entry.Profile) ||
            !ReadIdentity(*Row, TEXT("propFamily"), Entry.PropFamily) ||
            !(*Row)->TryGetStringField(TEXT("title"), Entry.Title) || Entry.Title.IsEmpty() ||
            !(*Row)->TryGetStringField(TEXT("sequenceSHA256"), Entry.SequenceSHA256) ||
            !(*Row)->TryGetStringField(TEXT("sequenceJson"), Entry.SequenceJson) ||
            !(*Row)->TryGetNumberField(TEXT("durationSeconds"), Duration) || !FMath::IsFinite(Duration) || Duration <= 0 ||
            !(*Row)->TryGetNumberField(TEXT("scoreUnitsPerSecond"), ScoreRate) || !FMath::IsFinite(ScoreRate) || ScoreRate <= 0 ||
            !VerifySnapshot(Entry.SequenceSHA256, Entry.SequenceJson))
        {
            Error = FString::Printf(TEXT("Performance library entry %d is invalid or its sequence hash is stale"), Index);
            return false;
        }
        Entry.DurationSeconds = static_cast<float>(Duration);
        Entry.ScoreUnitsPerSecond = static_cast<float>(ScoreRate);
        Ids.Add(Entry.Id);
        Parsed.Entries.Add(MoveTemp(Entry));
    }
    Out = MoveTemp(Parsed);
    Error.Empty();
    return true;
}

bool FFlowArtsPerformanceLibrary::LoadFromProject(FFlowArtsPerformanceLibrary& Out, FString& Error)
{
    const FString Path = FPaths::ProjectContentDir() / TEXT("Data/performance-library.json");
    FString Json;
    if (!FFileHelper::LoadFileToString(Json, *Path))
    {
        Error = FString::Printf(TEXT("Prepared performance library is missing: %s"), *Path);
        return false;
    }
    return Parse(Json, Out, Error);
}

bool FFlowArtsPerformanceLibrary::ParseTransfer(const FString& Json, FFlowArtsPerformanceTransfer& Out, FString& Error)
{
    TSharedPtr<FJsonObject> Root;
    FString Schema;
    if (!ReadObject(Json, Root) || !Root->TryGetStringField(TEXT("schema"), Schema) ||
        Schema != TEXT("tka-performance-transfer-v1"))
    {
        Error = TEXT("Unsupported Composer transfer schema");
        return false;
    }
    FFlowArtsPerformanceTransfer Parsed;
    const TSharedPtr<FJsonObject>* Selection = nullptr;
    const TSharedPtr<FJsonObject>* Playback = nullptr;
    double Phase = 0, Rate = 0;
    if (!Root->TryGetStringField(TEXT("sequenceSHA256"), Parsed.SequenceSHA256) ||
        !Root->TryGetStringField(TEXT("sequenceJson"), Parsed.SequenceJson) ||
        !VerifySnapshot(Parsed.SequenceSHA256, Parsed.SequenceJson) ||
        !Root->TryGetObjectField(TEXT("playback"), Playback) || !Playback || !Playback->IsValid() ||
        !(*Playback)->TryGetNumberField(TEXT("phase"), Phase) || !FMath::IsFinite(Phase) || Phase < 0 || Phase >= 1 ||
        !(*Playback)->TryGetNumberField(TEXT("rate"), Rate) || !FMath::IsFinite(Rate) || Rate < .5 || Rate > 1.75 ||
        !(*Playback)->TryGetBoolField(TEXT("paused"), Parsed.bPaused))
    {
        Error = TEXT("Composer transfer is malformed or its sequence hash is stale");
        return false;
    }
    if (Root->HasField(TEXT("selection")) &&
        (!Root->TryGetObjectField(TEXT("selection"), Selection) || !Selection || !Selection->IsValid() ||
         !ReadIdentity(*Selection, TEXT("characterId"), Parsed.CharacterId) ||
         !ReadIdentity(*Selection, TEXT("propFamily"), Parsed.PropFamily)))
    {
        Error = TEXT("Composer transfer selection is invalid");
        return false;
    }
    Parsed.Phase = static_cast<float>(Phase);
    Parsed.Rate = static_cast<float>(Rate);
    Out = MoveTemp(Parsed);
    Error.Empty();
    return true;
}

TArray<const FFlowArtsPerformanceEntry*> FFlowArtsPerformanceLibrary::Find(const FFlowArtsPerformanceTransfer& Transfer) const
{
    TArray<const FFlowArtsPerformanceEntry*> Matches;
    for (const FFlowArtsPerformanceEntry& Entry : Entries)
        if (Entry.SequenceSHA256 == Transfer.SequenceSHA256 && Entry.SequenceJson == Transfer.SequenceJson &&
            (Transfer.CharacterId.IsNone() || Entry.CharacterId == Transfer.CharacterId) &&
            (Transfer.PropFamily.IsNone() || Entry.PropFamily == Transfer.PropFamily))
            Matches.Add(&Entry);
    return Matches;
}

TArray<const FFlowArtsPerformanceEntry*> FFlowArtsPerformanceLibrary::ForTarget(FName CharacterId, FName PropFamily) const
{
    TArray<const FFlowArtsPerformanceEntry*> Matches;
    for (const FFlowArtsPerformanceEntry& Entry : Entries)
        if (Entry.CharacterId == CharacterId && Entry.PropFamily == PropFamily) Matches.Add(&Entry);
    return Matches;
}

bool FFlowArtsPerformanceLibrary::MakeTransfer(const FFlowArtsPerformanceEntry& Entry, float Phase, float Rate,
    bool bPaused, FString& OutJson)
{
    if (!VerifySnapshot(Entry.SequenceSHA256, Entry.SequenceJson) || !FMath::IsFinite(Phase) || Phase < 0 || Phase >= 1 ||
        !FMath::IsFinite(Rate) || Rate < .5f || Rate > 1.75f) return false;
    OutJson = FString::Printf(TEXT("{\"schema\":\"tka-performance-transfer-v1\",\"sequenceSHA256\":%s,\"sequenceJson\":%s,\"selection\":{\"characterId\":%s,\"propFamily\":%s},\"playback\":{\"phase\":%.9g,\"rate\":%.9g,\"paused\":%s}}"),
        *JsonString(Entry.SequenceSHA256), *JsonString(Entry.SequenceJson),
        *JsonString(Entry.CharacterId.ToString()), *JsonString(Entry.PropFamily.ToString()),
        Phase, Rate, bPaused ? TEXT("true") : TEXT("false"));
    return true;
}
