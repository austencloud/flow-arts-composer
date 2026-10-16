#pragma once

#include "CoreMinimal.h"

class APlayerController;
class UFlowFestAvatarComponent;
class UFlowFestPropComponent;

/** Game-neutral, target-bound prepared performance browser and transport. */
class FLOWARTSRUNTIME_API FFlowArtsPerformancePanel
{
public:
    static void Open(APlayerController* Player, UFlowFestAvatarComponent* Avatar, UFlowFestPropComponent* Prop);
};
