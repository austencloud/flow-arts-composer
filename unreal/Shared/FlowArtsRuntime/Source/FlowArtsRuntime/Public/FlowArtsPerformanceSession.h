#pragma once

#include "CoreMinimal.h"
#include "FlowArtsPerformanceLibrary.h"

class UFlowFestAvatarComponent;
class UFlowFestPropComponent;

/** Target-bound native transport. The avatar animation instance owns the clock. */
class FLOWARTSRUNTIME_API FFlowArtsPerformanceSession
{
public:
    FFlowArtsPerformanceSession(UFlowFestAvatarComponent* InAvatar, UFlowFestPropComponent* InProp);
    FName GetCharacterId() const;
    FName GetPropFamily() const;
    /** Select the unique prepared entry already playing on this target without changing its clock. */
    bool AttachCurrent(const FFlowArtsPerformanceLibrary& Library);
    bool Play(const FFlowArtsPerformanceEntry& Entry, const FFlowArtsPerformanceTransfer* Transfer, FString& Error);
    /** Play a catalog profile. The four declared staff overrides require their packaged manifest and motion. */
    bool PlayBuiltIn(FName Profile, FString& Error);
    /** Load an exported score and complete motion without cooking a new animation asset. */
    bool ImportMotionFile(const FString& Path, FString& Error);
    void Pause(bool bPaused);
    void Restart();
    void Seek(float Seconds);
    void SetRate(float Rate);
    bool IsPaused() const;
    float GetTime() const;
    float GetLength() const;
    float GetRate() const;
    const FFlowArtsPerformanceEntry* GetSelected() const { return Selected; }
    bool CopyTransfer(FString& OutJson) const;
#if WITH_DEV_AUTOMATION_TESTS
    void SetFamilyOverrideDirectoryForTests(const FString& Directory) { FamilyOverrideDirectory = Directory; }
#endif

private:
    TWeakObjectPtr<UFlowFestAvatarComponent> Avatar;
    TWeakObjectPtr<UFlowFestPropComponent> Prop;
    const FFlowArtsPerformanceEntry* Selected = nullptr;
    TOptional<FFlowArtsPerformanceEntry> RuntimeEntry;
    FString FamilyOverrideDirectory;
    void SelectRuntimeMotion();
};
