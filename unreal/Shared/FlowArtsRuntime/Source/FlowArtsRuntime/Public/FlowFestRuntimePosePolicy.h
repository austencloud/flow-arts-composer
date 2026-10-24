#pragma once

#include "CoreMinimal.h"

/** Imported editor playback can retain its captured pose without a second solver. */
enum class EFlowFestRuntimePosePolicy : uint8
{
    GameClearance,
    PreserveCapturedPose,
};
