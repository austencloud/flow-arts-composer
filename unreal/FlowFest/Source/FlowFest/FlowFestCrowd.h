#pragma once

#include "CoreMinimal.h"

/** Native festival simulation coordinates are east/south metres. No actor ownership lives here. */
enum class EFlowFestCrowdActivity : uint8
{
    Gate, Camp, Social, Travel, Gather, Practice, Watch, Queue, Perform, Rest
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
    EFlowFestCrowdActivity Activity = EFlowFestCrowdActivity::Camp;
    EFlowFestCrowdActivity DesiredActivity = EFlowFestCrowdActivity::Camp;
    FString DestinationId;
    bool bPlayerJoining = false;
};

class FFlowFestCrowd
{
public:
    void Initialize(const TMap<FString, FVector2D>& InLandmarks,
                    const TArray<TArray<FVector2D>>& RoadLines, float Hour);
    void SetTimeOfDay(float Hour);
    void SetPlayerPresence(const FVector2D& Position, bool bAtFire, bool bJoining);
    void Tick(float DeltaSeconds);
    const TArray<FFlowFestCrowdAgent>& GetAgents() const { return Agents; }
    int32 GetCount(EFlowFestCrowdActivity Activity) const;

private:
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
    void BuildRoute(FFlowFestCrowdAgent& Agent, const FVector2D& Destination);
    void Plan(FFlowFestCrowdAgent& Agent, int32 Index);
    FVector2D ActivityPosition(const FFlowFestCrowdAgent& Agent, const FString& Id,
                               EFlowFestCrowdActivity Activity) const;
};
