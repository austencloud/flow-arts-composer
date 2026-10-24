#pragma once

#include "CoreMinimal.h"

/** Native festival simulation coordinates are east/south metres. No actor ownership lives here. */
enum class EFlowFestCrowdActivity : uint8
{
    Gate, Camp, Social, Travel, Gather, Practice, Watch, Queue, Perform, Rest, Food, Idle
};

/** Values are 0..1. Higher values mean a stronger unmet need. */
struct FFlowFestCrowdNeeds
{
    float Hunger = 0.f;
    float Fatigue = 0.f;
    float Social = 0.f;
    float Practice = 0.f;
};

struct FFlowFestCrowdAgent
{
    FString Id;
    FString Name;
    FName AvatarId;
    FName PropId;
    FName PerformanceId;
    FName FinishId;
    FString HomeId;
    FString GoalAnchorId;
    FString GoalReason;
    FString PartnerId;
    FFlowFestCrowdNeeds Needs;
    FVector2D Position = FVector2D::ZeroVector;
    FVector2D Destination = FVector2D::ZeroVector;
    FVector2D Velocity = FVector2D::ZeroVector;
    TArray<FVector2D> Route;
    int32 RouteIndex = 0;
    int32 Role = 0;
    int32 PerformerOrdinal = -1;
    float WalkSpeed = 1.2f;
    float Facing = 0.f;
    float PhaseOffset = 0.f;
    float DwellUntil = 0.f;
    float InterruptUntil = 0.f;
    float GreetUntil = 0.f;
    float NextGreetAt = 0.f;
    float ActionUntil = 0.f;
    float ActionDuration = 0.f;
    float ActionStartedAt = 0.f;
    /** A rest goal has ended, but route motion waits for the body to stand. */
    float StandUntil = 0.f;
    float NextPerformanceEligibleAt = 0.f;
    bool bActionStarted = false;
    int32 CompletedActions = 0;
    int32 ReservedPerformanceSlot = INDEX_NONE;
    bool bPropInHands = false;
    bool HasEquipment() const { return !PropId.IsNone() && !PerformanceId.IsNone(); }
    EFlowFestCrowdActivity Activity = EFlowFestCrowdActivity::Camp;
    EFlowFestCrowdActivity DesiredActivity = EFlowFestCrowdActivity::Camp;
    FString DestinationId;
    bool bPlayerJoining = false;
};

/** Plain data so the game SaveGame owner can persist and inspect the crowd. */
struct FFlowFestCrowdSnapshot
{
    TArray<FFlowFestCrowdAgent> Agents;
    float SimMinute = 0.f;
    float ElapsedSeconds = 0.f;
    float PhaseEndMinute = 0.f;
    FVector2D PlayerPosition = FVector2D::ZeroVector;
    bool bPlayerAtFire = false;
    bool bPlayerJoining = false;
};

class FFlowFestCrowd
{
public:
    void Initialize(const TMap<FString, FVector2D>& InLandmarks,
                    const TArray<TArray<FVector2D>>& RoadLines, float Hour);
    void SetTimeOfDay(float Hour);
    void SetPlayerPresence(const FVector2D& Position, bool bAtFire, bool bJoining);
    /** Greet the nearest available attendee within three metres, keeping their current goal. */
    bool GreetNearby(const FVector2D& Position, FString& Reply);
    void Tick(float DeltaSeconds);
    const TArray<FFlowFestCrowdAgent>& GetAgents() const { return Agents; }
    float GetElapsedSeconds() const { return ElapsedSeconds; }
    int32 GetCount(EFlowFestCrowdActivity Activity) const;
    FFlowFestCrowdSnapshot CaptureSnapshot() const;
    /** Restore after Initialize with the same geography; rejects mismatched identity sets. */
    bool RestoreSnapshot(const FFlowFestCrowdSnapshot& Snapshot);
    FString SerializeState() const;
    bool RestoreState(const FString& Json);
    static const TCHAR* ActivityLabel(EFlowFestCrowdActivity Activity);
    static FString IntentText(const FFlowFestCrowdAgent& Agent);
    /** Jam polish: where fire watchers stand, outside the jam rope. Empty keeps the ring around the landmark. */
    void SetFireWatchSpots(const TArray<FVector2D>& Spots) { FireWatchSpots = Spots; }

private:
    TArray<FVector2D> FireWatchSpots;
    struct FNode { FVector2D Position; TArray<int32> Neighbors; };
    TArray<FFlowFestCrowdAgent> Agents;
    TArray<FNode> Nodes;
    TMap<FString, FVector2D> Landmarks;
    FVector2D PlayerPosition = FVector2D::ZeroVector;
    float SimMinute = 1110.f;
    float ElapsedSeconds = 0.f;
    float PhaseEndMinute = 1140.f;
    bool bPlayerAtFire = false;
    bool bPlayerJoining = false;
    bool BuildRoute(FFlowFestCrowdAgent& Agent, const FVector2D& Destination);
    void Plan(FFlowFestCrowdAgent& Agent, int32 Index);
    bool SetGoal(FFlowFestCrowdAgent& Agent, const FString& Anchor,
                 EFlowFestCrowdActivity Activity, const FString& Reason, int32 Slot = INDEX_NONE);
    void UpdateNeeds(FFlowFestCrowdAgent& Agent, float DeltaSeconds);
    void AssignSocialPairs();
    void AssignPerformanceSlots();
    FVector2D ActivityPosition(const FFlowFestCrowdAgent& Agent, const FString& Id,
                               EFlowFestCrowdActivity Activity) const;
};
