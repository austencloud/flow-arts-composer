#include "FlowArtsPerformancePictographs.h"
#include "Dom/JsonObject.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
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

bool IsHash(const FString& Value)
{
    if (Value.Len() != 64) return false;
    for (const TCHAR C : Value)
        if (!((C >= TEXT('0') && C <= TEXT('9')) || (C >= TEXT('a') && C <= TEXT('f')))) return false;
    return true;
}

bool ReadRow(const TSharedPtr<FJsonValue>& Value, const TSharedPtr<FJsonObject>*& Out)
{
    return Value.IsValid() && Value->TryGetObject(Out) && Out && Out->IsValid();
}

bool HashFileMatches(const FString& Path, const FString& Expected)
{
    TArray<uint8> Bytes;
    if (!FFileHelper::LoadFileToArray(Bytes, *Path) || Bytes.IsEmpty() ||
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

bool ExpectedTimeline(const FFlowArtsPerformanceEntry& Entry, TArray<double>& Starts,
    TArray<double>& Ends, TArray<FString>& Letters)
{
    TSharedPtr<FJsonObject> Sequence;
    const TArray<TSharedPtr<FJsonValue>>* SourceSteps = nullptr;
    if (!ReadObject(Entry.SequenceJson, Sequence) ||
        !Sequence->TryGetArrayField(TEXT("steps"), SourceSteps) || !SourceSteps || SourceSteps->IsEmpty() ||
        !FMath::IsFinite(Entry.ScoreUnitsPerSecond) || Entry.ScoreUnitsPerSecond <= 0.f) return false;
    double Units = 0;
    for (const TSharedPtr<FJsonValue>& Value : *SourceSteps)
    {
        const TSharedPtr<FJsonObject>* Step = nullptr;
        if (!ReadRow(Value, Step)) return false;
        FString Letter;
        if ((*Step)->HasField(TEXT("letter")) &&
            !(*Step)->TryGetStringField(TEXT("letter"), Letter)) return false;
        double Duration = 1;
        if ((*Step)->HasField(TEXT("duration")) &&
            (!(*Step)->TryGetNumberField(TEXT("duration"), Duration) ||
             !FMath::IsFinite(Duration) || Duration <= 0)) return false;
        Starts.Add(Units / Entry.ScoreUnitsPerSecond);
        Letters.Add(MoveTemp(Letter));
        Units += Duration;
        Ends.Add(Units / Entry.ScoreUnitsPerSecond);
    }
    return FMath::Abs(Ends.Last() - Entry.DurationSeconds) <= .05;
}

bool ResolveImage(const FString& DataDir, const FFlowArtsPerformanceEntry& Entry, int32 Index,
    const FString& Relative, FString& Absolute)
{
    // Require the generated layout exactly; this also rejects absolute paths,
    // traversal, alternate separators, drive prefixes, and other data roots.
    const FString Expected = FString::Printf(TEXT("Pictographs/%s-%s-light-v1/step-%04d.png"),
        *Entry.SequenceSHA256, *Entry.PropFamily.ToString(), Index);
    if (Relative != Expected || !FPaths::IsRelative(Relative)) return false;
    Absolute = FPaths::ConvertRelativePathToFull(DataDir / Relative);
    return true;
}
}

int32 FFlowArtsPictographSequence::FindStep(float Time) const
{
    if (Steps.IsEmpty() || !FMath::IsFinite(Time) || Time < 0.f || Time > DurationSeconds)
        return INDEX_NONE;
    for (const FFlowArtsPictographStep& Step : Steps)
        if (Time < Step.EndSeconds || Step.Index == Steps.Num() - 1)
            return Step.Index;
    return INDEX_NONE;
}

const FFlowArtsPictographSequence* FFlowArtsPerformancePictographs::Find(
    const FFlowArtsPerformanceEntry& Entry) const
{
    for (const FFlowArtsPictographSequence& Sequence : Sequences)
        if (Sequence.Id == Entry.Id && Sequence.SequenceSHA256 == Entry.SequenceSHA256)
            return &Sequence;
    return nullptr;
}

bool FFlowArtsPerformancePictographs::LoadFromProject(const FFlowArtsPerformanceLibrary& Library,
    FFlowArtsPerformancePictographs& Out, FString& Error)
{
    const FString DataDir = FPaths::ProjectContentDir() / TEXT("Data");
    const FString Path = DataDir / TEXT("performance-pictographs.json");
    FString Json;
    if (!FFileHelper::LoadFileToString(Json, *Path))
    {
        Error = FString::Printf(TEXT("Performance pictographs are missing: %s"), *Path);
        return false;
    }
    return Parse(Json, Library, DataDir, Out, Error);
}

bool FFlowArtsPerformancePictographs::Parse(const FString& Json,
    const FFlowArtsPerformanceLibrary& Library, const FString& DataDir,
    FFlowArtsPerformancePictographs& Out, FString& Error)
{
    TSharedPtr<FJsonObject> Root;
    const TArray<TSharedPtr<FJsonValue>>* Rows = nullptr;
    FString Schema;
    if (!ReadObject(Json, Root) || !Root->TryGetStringField(TEXT("schema"), Schema) ||
        Schema != TEXT("tka-performance-pictographs-v1") ||
        !Root->TryGetArrayField(TEXT("entries"), Rows) || !Rows ||
        Rows->Num() != Library.GetEntries().Num())
    {
        Error = TEXT("Performance pictograph schema is missing or unsupported");
        return false;
    }

    FFlowArtsPerformancePictographs Parsed;
    TSet<FString> Ids;
    for (int32 RowIndex = 0; RowIndex < Rows->Num(); ++RowIndex)
    {
        const TSharedPtr<FJsonObject>* Row = nullptr;
        FFlowArtsPictographSequence Sequence;
        const TArray<TSharedPtr<FJsonValue>>* Steps = nullptr;
        if (!ReadRow((*Rows)[RowIndex], Row) ||
            !(*Row)->TryGetStringField(TEXT("id"), Sequence.Id) || Sequence.Id.IsEmpty() ||
            Ids.Contains(Sequence.Id) ||
            !(*Row)->TryGetStringField(TEXT("sequenceSHA256"), Sequence.SequenceSHA256) ||
            !IsHash(Sequence.SequenceSHA256) ||
            !(*Row)->TryGetArrayField(TEXT("steps"), Steps) || !Steps || Steps->IsEmpty())
        {
            Error = FString::Printf(TEXT("Performance pictograph entry %d is malformed"), RowIndex);
            return false;
        }
        const FFlowArtsPerformanceEntry* Match = nullptr;
        for (const FFlowArtsPerformanceEntry& Entry : Library.GetEntries())
            if (Entry.Id == Sequence.Id && Entry.SequenceSHA256 == Sequence.SequenceSHA256)
            { Match = &Entry; break; }
        TArray<double> ExpectedStarts, ExpectedEnds;
        TArray<FString> ExpectedLetters;
        if (!Match || !ExpectedTimeline(*Match, ExpectedStarts, ExpectedEnds, ExpectedLetters) ||
            Steps->Num() != ExpectedStarts.Num())
        {
            Error = FString::Printf(TEXT("Performance pictograph entry %s does not match the prepared capture"), *Sequence.Id);
            return false;
        }
        Sequence.DurationSeconds = Match->DurationSeconds;

        for (int32 Index = 0; Index < Steps->Num(); ++Index)
        {
            const TSharedPtr<FJsonObject>* Source = nullptr;
            FFlowArtsPictographStep Step;
            double SourceIndex = -1, Start = -1, End = -1;
            FString Relative;
            if (!ReadRow((*Steps)[Index], Source) ||
                !(*Source)->TryGetNumberField(TEXT("index"), SourceIndex) || SourceIndex != Index ||
                !(*Source)->TryGetStringField(TEXT("letter"), Step.Letter) ||
                Step.Letter != ExpectedLetters[Index] ||
                !(*Source)->TryGetNumberField(TEXT("startSeconds"), Start) ||
                !(*Source)->TryGetNumberField(TEXT("endSeconds"), End) ||
                !FMath::IsFinite(Start) || !FMath::IsFinite(End) || Start < 0 || End <= Start ||
                FMath::Abs(Start - ExpectedStarts[Index]) > .05 ||
                FMath::Abs(End - ExpectedEnds[Index]) > .05 ||
                (Index == 0 ? FMath::Abs(Start) > .001 :
                    FMath::Abs(Start - Sequence.Steps.Last().EndSeconds) > .001) ||
                !(*Source)->TryGetStringField(TEXT("image"), Relative) ||
                !(*Source)->TryGetStringField(TEXT("imageSHA256"), Step.ImageSHA256) ||
                !IsHash(Step.ImageSHA256) ||
                !ResolveImage(DataDir, *Match, Index, Relative, Step.ImagePath) ||
                !HashFileMatches(Step.ImagePath, Step.ImageSHA256))
            {
                Error = FString::Printf(TEXT("Performance pictograph %s step %d is invalid or its image changed"),
                    *Sequence.Id, Index);
                return false;
            }
            Step.Index = Index;
            Step.StartSeconds = static_cast<float>(Start);
            Step.EndSeconds = static_cast<float>(End);
            Sequence.Steps.Add(MoveTemp(Step));
        }
        if (FMath::Abs(Sequence.Steps.Last().EndSeconds - Match->DurationSeconds) > .05)
        {
            Error = FString::Printf(TEXT("Performance pictograph %s duration differs from the prepared capture"),
                *Sequence.Id);
            return false;
        }
        Ids.Add(Sequence.Id);
        Parsed.Sequences.Add(MoveTemp(Sequence));
    }
    Out = MoveTemp(Parsed);
    Error.Empty();
    return true;
}
