#pragma once

#include "CoreMinimal.h"

/** A sealed, exact Composer snapshot with its prepared native profile. */
struct FLOWARTSRUNTIME_API FFlowArtsPerformanceEntry
{
    FString Id;
    FName CharacterId;
    FName Profile;
    FName PropFamily;
    FString Title;
    FString SequenceSHA256;
    FString SequenceJson;
    float DurationSeconds = 0.f;
    float ScoreUnitsPerSecond = 0.f;
};

struct FLOWARTSRUNTIME_API FFlowArtsPerformanceTransfer
{
    FString SequenceSHA256;
    FString SequenceJson;
    FName CharacterId;
    FName PropFamily;
    float Phase = 0.f;
    float Rate = 1.f;
    bool bPaused = false;
};

/** Pure parsing and matching; no guessed A/B profile or identity fallback. */
class FLOWARTSRUNTIME_API FFlowArtsPerformanceLibrary
{
public:
    static bool LoadFromProject(FFlowArtsPerformanceLibrary& Out, FString& Error);
    static bool Parse(const FString& Json, FFlowArtsPerformanceLibrary& Out, FString& Error);
    static bool ParseTransfer(const FString& Json, FFlowArtsPerformanceTransfer& Out, FString& Error);
    static bool MakeTransfer(const FFlowArtsPerformanceEntry& Entry, float Phase, float Rate,
        bool bPaused, FString& OutJson);
    static bool VerifySnapshot(const FString& Hash, const FString& Json);

    /** Returns only exact hash AND text matches, further restricted by selection. */
    TArray<const FFlowArtsPerformanceEntry*> Find(const FFlowArtsPerformanceTransfer& Transfer) const;
    TArray<const FFlowArtsPerformanceEntry*> ForTarget(FName CharacterId, FName PropFamily) const;
    const TArray<FFlowArtsPerformanceEntry>& GetEntries() const { return Entries; }

private:
    TArray<FFlowArtsPerformanceEntry> Entries;
};
