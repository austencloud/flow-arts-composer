#pragma once

#include "CoreMinimal.h"
#include "FlowArtsPerformanceLibrary.h"

struct FLOWARTSRUNTIME_API FFlowArtsPictographStep
{
    int32 Index = INDEX_NONE;
    FString Letter;
    float StartSeconds = 0.f;
    float EndSeconds = 0.f;
    /** Absolute path below ProjectContentDir()/Data, verified against ImageSHA256 at load time. */
    FString ImagePath;
    FString ImageSHA256;
};

struct FLOWARTSRUNTIME_API FFlowArtsPictographSequence
{
    FString Id;
    FString SequenceSHA256;
    float DurationSeconds = 0.f;
    TArray<FFlowArtsPictographStep> Steps;

    /** Half-open steps; the exact duration endpoint selects the final step. */
    int32 FindStep(float Time) const;
};

/** Optional illustrated timeline. Failure to load must never disable native playback. */
class FLOWARTSRUNTIME_API FFlowArtsPerformancePictographs
{
public:
    static bool LoadFromProject(const FFlowArtsPerformanceLibrary& Library,
        FFlowArtsPerformancePictographs& Out, FString& Error);
    static bool Parse(const FString& Json, const FFlowArtsPerformanceLibrary& Library,
        const FString& DataDir, FFlowArtsPerformancePictographs& Out, FString& Error);

    const FFlowArtsPictographSequence* Find(const FFlowArtsPerformanceEntry& Entry) const;

private:
    TArray<FFlowArtsPictographSequence> Sequences;
};
