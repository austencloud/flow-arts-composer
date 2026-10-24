#include "FlowFestCrowd.h"
#include "FlowFestAvatarComponent.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

namespace
{
constexpr float TwoPi = 2.f * PI;
const TCHAR* Names[] = { TEXT("Wren"), TEXT("Bo"), TEXT("Sage"), TEXT("Cass"), TEXT("Juniper"), TEXT("Rook"), TEXT("Mira"), TEXT("Dez"), TEXT("Ash"), TEXT("Poppy"), TEXT("Kit"), TEXT("Lark"), TEXT("Nico"), TEXT("Sol"), TEXT("Wilder"), TEXT("Fen"), TEXT("Marlow"), TEXT("Tam"), TEXT("Rue"), TEXT("Ozzy"), TEXT("Sparrow"), TEXT("Indigo"), TEXT("Cleo"), TEXT("Bram"), TEXT("Delta"), TEXT("Onyx"), TEXT("Vale"), TEXT("Hollis"), TEXT("Wynn"), TEXT("Zephyr"), TEXT("Callum"), TEXT("Nova"), TEXT("Piper"), TEXT("Ridge"), TEXT("Sunny"), TEXT("Thea"), TEXT("Blaze"), TEXT("Coriander"), TEXT("Echo"), TEXT("Fable") };
const FName Avatars[] = { TEXT("remy"), TEXT("ch26"), TEXT("ch01"), TEXT("ch07"), TEXT("ch10"),
    TEXT("ch12"), TEXT("ch18"), TEXT("ch21"), TEXT("ch22"), TEXT("ch24"), TEXT("ch34"),
    TEXT("ch41"), TEXT("ch42"), TEXT("ch44") };
const FName PerformerProps[] = { TEXT("poi"), TEXT("bighoop") };
const FName PracticeProps[] = { TEXT("club"), TEXT("capsule_baton") };
constexpr float PerformanceTurnSeconds = 24.f;

float Hash01(int32 Index, int32 Salt)
{
    uint32 X = static_cast<uint32>(Index * 747796405u + Salt * 2891336453u + 277803737u);
    X ^= X >> 16; X *= 2246822519u; X ^= X >> 13;
    return static_cast<float>(X & 0xffffu) / 65535.f;
}

TArray<TSharedPtr<FJsonValue>> WritePoint(const FVector2D& Point)
{
    return { MakeShared<FJsonValueNumber>(Point.X), MakeShared<FJsonValueNumber>(Point.Y) };
}

bool ReadPoint(const TArray<TSharedPtr<FJsonValue>>& Values, FVector2D& Out)
{
    if (Values.Num() != 2 || Values[0]->Type != EJson::Number || Values[1]->Type != EJson::Number) return false;
    Out = FVector2D(Values[0]->AsNumber(), Values[1]->AsNumber());
    return FMath::IsFinite(Out.X) && FMath::IsFinite(Out.Y);
}

bool ReadNumber(const TSharedPtr<FJsonObject>& Object, const TCHAR* Key, float& Out)
{
    double Value = 0.0;
    if (!Object->TryGetNumberField(Key, Value) || !FMath::IsFinite(Value)) return false;
    Out = static_cast<float>(Value);
    return true;
}

}

void FFlowFestCrowd::Initialize(const TMap<FString, FVector2D>& InLandmarks,
                                const TArray<TArray<FVector2D>>& RoadLines, float Hour)
{
    // A new journey or a failed load reuses this instance. Drop the old clock and
    // player influence before SetTimeOfDay reconstructs the requested moment.
    SimMinute = 1110.f;
    ElapsedSeconds = 0.f;
    PhaseEndMinute = 1140.f;
    PlayerPosition = FVector2D::ZeroVector;
    bPlayerAtFire = false;
    bPlayerJoining = false;
    Landmarks = InLandmarks;
    Nodes.Reset();
    for (const TArray<FVector2D>& Line : RoadLines)
    {
        int32 Previous = INDEX_NONE;
        for (int32 I = 1; I < Line.Num(); ++I)
        {
            const float Length = FVector2D::Distance(Line[I - 1], Line[I]);
            const int32 Steps = FMath::Max(1, FMath::CeilToInt(Length / 5.f));
            for (int32 Step = (I == 1 ? 0 : 1); Step <= Steps; ++Step)
            {
                const FVector2D Point = FMath::Lerp(Line[I - 1], Line[I], static_cast<float>(Step) / Steps);
                int32 Node = INDEX_NONE;
                for (int32 N = 0; N < Nodes.Num(); ++N)
                    if (FVector2D::DistSquared(Nodes[N].Position, Point) < 1.5f * 1.5f) { Node = N; break; }
                if (Node == INDEX_NONE)
                {
                    FNode NewNode;
                    NewNode.Position = Point;
                    Node = Nodes.Add(MoveTemp(NewNode));
                }
                if (Previous != INDEX_NONE && Previous != Node)
                {
                    Nodes[Previous].Neighbors.AddUnique(Node);
                    Nodes[Node].Neighbors.AddUnique(Previous);
                }
                Previous = Node;
            }
        }
    }
    // Road polylines exported as separate objects may meet between sampled vertices.
    for (int32 A = 0; A < Nodes.Num(); ++A)
        for (int32 B = A + 1; B < Nodes.Num(); ++B)
            if (FVector2D::DistSquared(Nodes[A].Position, Nodes[B].Position) < 2.5f * 2.5f)
            {
                Nodes[A].Neighbors.AddUnique(B);
                Nodes[B].Neighbors.AddUnique(A);
            }
    Agents.Reset();
    const TCHAR* Homes[] = { TEXT("camp-lower"), TEXT("camp-upper"), TEXT("camp-car") };
    int32 PerformerCount = 0;
    int32 PracticeCount = 0;
    for (int32 I = 0; I < 38; ++I)
    {
        FFlowFestCrowdAgent Agent;
        Agent.Id = FString::Printf(TEXT("flow-fest-npc-%02d"), I);
        Agent.Name = Names[I];
        Agent.AvatarId = Avatars[I % UE_ARRAY_COUNT(Avatars)];
        Agent.Role = I < 3 ? 0 : (I % 8 == 4 ? 3 : I % 8 == 1 || I % 8 == 5 ? 1 : I % 8 == 2 || I % 8 == 6 ? 4 : 2);
        Agent.HomeId = I < 3 ? TEXT("gate") : Homes[I % UE_ARRAY_COUNT(Homes)];
        Agent.PhaseOffset = Hash01(I, 1) * TwoPi;
        Agent.WalkSpeed = 1.05f + 0.42f * Hash01(I, 2);
        Agent.Position = ActivityPosition(Agent, Agent.HomeId, EFlowFestCrowdActivity::Camp);
        Agent.Facing = Hash01(I, 3) * 360.f;
        Agent.Needs.Hunger = 0.12f + 0.52f * Hash01(I, 31);
        Agent.Needs.Fatigue = 0.10f + 0.78f * Hash01(I, 32);
        Agent.Needs.Social = 0.12f + 0.50f * Hash01(I, 33);
        Agent.Needs.Practice = 0.16f + 0.55f * Hash01(I, 34);
        if (Agent.Role == 3)
        {
            // Fire artists arrive ready to join the queue; their needs still grow normally.
            Agent.Needs.Hunger = FMath::Min(Agent.Needs.Hunger, 0.48f);
            Agent.Needs.Fatigue = FMath::Min(Agent.Needs.Fatigue, 0.72f);
            Agent.Needs.Social = FMath::Min(Agent.Needs.Social, 0.42f);
            Agent.Needs.Practice = FMath::Min(Agent.Needs.Practice, 0.40f);
            Agent.PerformerOrdinal = PerformerCount++;
            const int32 Profile = Agent.PerformerOrdinal % UE_ARRAY_COUNT(PerformerProps);
            Agent.PropId = PerformerProps[Profile];
            Agent.PerformanceId = UFlowFestAvatarComponent::ResolvePerformanceProfile(
                Agent.PropId, (Agent.PerformerOrdinal / UE_ARRAY_COUNT(PerformerProps)) % 2);
            Agent.FinishId = TEXT("fire");
        }
        else if (Agent.Role == 4 && I % 2 == 0)
        {
            const int32 PracticeOrdinal = PracticeCount++;
            const int32 Profile = PracticeOrdinal % UE_ARRAY_COUNT(PracticeProps);
            Agent.PropId = PracticeProps[Profile];
            Agent.PerformanceId = UFlowFestAvatarComponent::ResolvePerformanceProfile(
                Agent.PropId, (PracticeOrdinal / UE_ARRAY_COUNT(PracticeProps)) % 2);
            Agent.FinishId = TEXT("led");
        }
        else if (I >= 3)
        {
            // Every guest has a specific personal kit, even if they are watching now.
            Agent.PropId = PracticeProps[I % UE_ARRAY_COUNT(PracticeProps)];
            Agent.PerformanceId = UFlowFestAvatarComponent::ResolvePerformanceProfile(Agent.PropId, I % 2);
            Agent.FinishId = TEXT("led");
        }
        Agents.Add(MoveTemp(Agent));
    }
    SetTimeOfDay(Hour);
    for (int32 I = 0; I < Agents.Num(); ++I) Plan(Agents[I], I);
}

void FFlowFestCrowd::SetTimeOfDay(float Hour)
{
    const float Wrapped = FMath::Fmod(FMath::Fmod(Hour, 24.f) + 24.f, 24.f);
    SimMinute = Wrapped * 60.f;
    if (Wrapped < 6.f) SimMinute += 1440.f;
    PhaseEndMinute = SimMinute < 1140.f ? 1140.f : SimMinute < 1260.f ? 1260.f : SimMinute < 1560.f ? 1560.f : 1800.f;
    // Story/review mode can select a moment before the first rendered tick. Reconstruct
    // that moment only at startup; later phase changes are travelled on foot.
    if (ElapsedSeconds < 0.5f)
    {
        AssignSocialPairs();
        for (int32 I = 0; I < Agents.Num(); ++I)
        {
            Plan(Agents[I], I);
            Agents[I].Position = Agents[I].Destination;
            Agents[I].Route.Reset();
            Agents[I].RouteIndex = 0;
            Agents[I].Activity = Agents[I].DesiredActivity;
            Agents[I].bPropInHands = Agents[I].HasEquipment() &&
                Agents[I].Activity != EFlowFestCrowdActivity::Food &&
                Agents[I].Activity != EFlowFestCrowdActivity::Rest;
            Agents[I].bActionStarted = true;
            Agents[I].ActionStartedAt = ElapsedSeconds;
            Agents[I].ActionUntil = ElapsedSeconds + Agents[I].ActionDuration;
        }
    }
}

void FFlowFestCrowd::SetPlayerPresence(const FVector2D& Position, bool bAtFire, bool bJoining)
{
    PlayerPosition = Position;
    bPlayerAtFire = bAtFire;
    bPlayerJoining = bJoining;
}

bool FFlowFestCrowd::GreetNearby(const FVector2D& Position, FString& Reply)
{
    Reply.Reset();
    int32 Nearest = INDEX_NONE;
    float BestDistance = 3.f * 3.f;
    for (int32 I = 0; I < Agents.Num(); ++I)
    {
        const FFlowFestCrowdAgent& Agent = Agents[I];
        if (Agent.Activity == EFlowFestCrowdActivity::Travel ||
            Agent.Activity == EFlowFestCrowdActivity::Gate ||
            Agent.Activity == EFlowFestCrowdActivity::Perform ||
            Agent.DesiredActivity == EFlowFestCrowdActivity::Perform ||
            ElapsedSeconds < Agent.NextGreetAt) continue;
        const float Distance = FVector2D::DistSquared(Position, Agent.Position);
        if (Distance <= BestDistance) { BestDistance = Distance; Nearest = I; }
    }
    if (Nearest == INDEX_NONE) return false;
    FFlowFestCrowdAgent& Agent = Agents[Nearest];
    Agent.Needs.Social = FMath::Max(0.f, Agent.Needs.Social - 0.28f);
    Agent.GreetUntil = ElapsedSeconds + 3.f;
    Agent.NextGreetAt = ElapsedSeconds + 12.f;
    PlayerPosition = Position;
    const TCHAR* Purpose = TEXT("I'm taking a moment.");
    switch (Agent.DesiredActivity)
    {
    case EFlowFestCrowdActivity::Camp: Purpose = TEXT("I'm tending my camp."); break;
    case EFlowFestCrowdActivity::Social: Purpose = TEXT("I'm meeting a friend."); break;
    case EFlowFestCrowdActivity::Gather: Purpose = TEXT("I'm joining the workshop."); break;
    case EFlowFestCrowdActivity::Practice: Purpose = TEXT("I'm practicing with my prop."); break;
    case EFlowFestCrowdActivity::Watch: Purpose = TEXT("I'm watching the fire circle."); break;
    case EFlowFestCrowdActivity::Queue: Purpose = TEXT("I'm waiting for my fire turn."); break;
    case EFlowFestCrowdActivity::Rest: Purpose = TEXT("I'm resting at camp."); break;
    case EFlowFestCrowdActivity::Food: Purpose = TEXT("I'm getting something to eat."); break;
    default: break;
    }
    Reply = FString::Printf(TEXT("%s: %s"), *Agent.Name, Purpose);
    return true;
}

FVector2D FFlowFestCrowd::ActivityPosition(const FFlowFestCrowdAgent& Agent, const FString& Id,
                                           EFlowFestCrowdActivity Activity) const
{
    const FVector2D* Anchor = Landmarks.Find(Id);
    if (!Anchor) return Agent.Position;
    const int32 Index = FCString::Atoi(*Agent.Id.Right(2));
    const float Angle = Hash01(Index, 6) * TwoPi;
    float Radius = 2.5f + 3.5f * Hash01(Index, 7);
    if (Id == TEXT("fire"))
    {
        if (Activity == EFlowFestCrowdActivity::Perform)
        {
            const float SlotAngle = Agent.ReservedPerformanceSlot == 0 ? 0.5f : 3.65f;
            return *Anchor + FVector2D(FMath::Cos(SlotAngle), FMath::Sin(SlotAngle)) * 2.f;
        }
        Radius = 8.2f + (Index % 3) * 1.4f;
        if (!FireWatchSpots.IsEmpty()) return FireWatchSpots[Index % FireWatchSpots.Num()];
    }
    if (Activity == EFlowFestCrowdActivity::Social)
    {
        // A reciprocal pair stands face-to-face at one shared clearing.
        const int32 PartnerIndex = FCString::Atoi(*Agent.PartnerId.Right(2));
        const int32 Pair = FMath::Min(Index, PartnerIndex);
        const float PairAngle = Hash01(Pair, 66) * TwoPi;
        const FVector2D Center = *Anchor + FVector2D(FMath::Cos(PairAngle), FMath::Sin(PairAngle)) * 3.5f;
        const FVector2D Side(-FMath::Sin(PairAngle), FMath::Cos(PairAngle));
        return Center + Side * (Index < PartnerIndex ? -0.85f : 0.85f);
    }
    if (Activity == EFlowFestCrowdActivity::Practice)
    {
        // Fixed stations leave space for bodies and hand props, even when all guests practice.
        const int32 Station = Index % 19;
        const float StationAngle = (Station + (Index / 19 == 0 ? 0.f : 0.5f)) * TwoPi / 19.f;
        const float StationRadius = Index / 19 == 0 ? 8.f : 12.f;
        return *Anchor + FVector2D(FMath::Cos(StationAngle), FMath::Sin(StationAngle)) * StationRadius;
    }
    return *Anchor + FVector2D(FMath::Cos(Angle), FMath::Sin(Angle)) * Radius;
}

bool FFlowFestCrowd::BuildRoute(FFlowFestCrowdAgent& Agent, const FVector2D& Destination)
{
    Agent.Route.Reset(); Agent.RouteIndex = 0;
    if (FVector2D::Distance(Agent.Position, Destination) < 0.35f) return true;
    if (Nodes.IsEmpty()) return false;
    int32 Start = 0, Goal = 0;
    float StartDist = FLT_MAX, GoalDist = FLT_MAX;
    for (int32 I = 0; I < Nodes.Num(); ++I)
    {
        const float S = FVector2D::DistSquared(Agent.Position, Nodes[I].Position);
        const float G = FVector2D::DistSquared(Destination, Nodes[I].Position);
        if (S < StartDist) { StartDist = S; Start = I; }
        if (G < GoalDist) { GoalDist = G; Goal = I; }
    }
    // A short local clearing leg is fine; long off-road legs would cut through the forest.
    if (StartDist > 25.f * 25.f || GoalDist > 25.f * 25.f)
    {
        if (FVector2D::DistSquared(Agent.Position, Destination) < 25.f * 25.f)
        { Agent.Route.Add(Destination); return true; }
        return false;
    }
    TArray<float> Cost; Cost.Init(FLT_MAX, Nodes.Num());
    TArray<int32> Parent; Parent.Init(INDEX_NONE, Nodes.Num());
    TArray<bool> Visited; Visited.Init(false, Nodes.Num());
    Cost[Start] = 0.f;
    for (int32 Step = 0; Step < Nodes.Num(); ++Step)
    {
        int32 Current = INDEX_NONE;
        for (int32 N = 0; N < Nodes.Num(); ++N)
            if (!Visited[N] && (Current == INDEX_NONE || Cost[N] < Cost[Current])) Current = N;
        if (Current == INDEX_NONE || Cost[Current] == FLT_MAX || Current == Goal) break;
        Visited[Current] = true;
        for (int32 Next : Nodes[Current].Neighbors)
        {
            const float Candidate = Cost[Current] + FVector2D::Distance(Nodes[Current].Position, Nodes[Next].Position);
            if (Candidate < Cost[Next]) { Cost[Next] = Candidate; Parent[Next] = Current; }
        }
    }
    if (Start != Goal && Parent[Goal] == INDEX_NONE) return false;
    TArray<FVector2D> Reverse;
    for (int32 N = Goal; N != INDEX_NONE; N = Parent[N]) { Reverse.Add(Nodes[N].Position); if (N == Start) break; }
    for (int32 I = Reverse.Num() - 1; I >= 0; --I) Agent.Route.Add(Reverse[I]);
    Agent.Route.Add(Destination);
    return true;
}

void FFlowFestCrowd::Plan(FFlowFestCrowdAgent& Agent, int32 Index)
{
    const float Jitter = (Hash01(Index, 8) - 0.5f) * 25.f;
    const bool bNight = SimMinute >= 1560.f + Jitter;
    const bool bFire = SimMinute >= 1240.f + Jitter && !bNight;
    Agent.bPlayerJoining = bPlayerJoining && bPlayerAtFire && bFire;
    if (Agent.Role == 0)
    {
        if (Agent.DesiredActivity != EFlowFestCrowdActivity::Gate || Agent.GoalAnchorId != Agent.HomeId)
            SetGoal(Agent, Agent.HomeId, EFlowFestCrowdActivity::Gate, TEXT("welcome arrivals"));
        return;
    }
    // A granted fire turn remains reserved through travel and the full action after arrival.
    if (Agent.ReservedPerformanceSlot != INDEX_NONE &&
        (!Agent.bActionStarted || Agent.RouteIndex < Agent.Route.Num() || Agent.ActionUntil > ElapsedSeconds))
        return;

    if (!Agent.GoalAnchorId.IsEmpty() && Agent.bActionStarted &&
        Agent.RouteIndex >= Agent.Route.Num() && Agent.ActionUntil <= ElapsedSeconds)
    {
        ++Agent.CompletedActions;
        switch (Agent.DesiredActivity)
        {
        case EFlowFestCrowdActivity::Food: Agent.Needs.Hunger = FMath::Max(0.f, Agent.Needs.Hunger - 0.65f); break;
        case EFlowFestCrowdActivity::Rest: Agent.Needs.Fatigue = FMath::Max(0.f, Agent.Needs.Fatigue - 0.7f); break;
        case EFlowFestCrowdActivity::Social: Agent.Needs.Social = FMath::Max(0.f, Agent.Needs.Social - 0.6f); break;
        case EFlowFestCrowdActivity::Practice: Agent.Needs.Practice = FMath::Max(0.f, Agent.Needs.Practice - 0.6f); break;
        case EFlowFestCrowdActivity::Perform:
            Agent.Needs.Practice = FMath::Max(0.f, Agent.Needs.Practice - 0.4f);
            Agent.NextPerformanceEligibleAt = ElapsedSeconds + PerformanceTurnSeconds * 2.f;
            break;
        default: break;
        }
        Agent.ReservedPerformanceSlot = INDEX_NONE;
    }

    if (Agent.DesiredActivity == EFlowFestCrowdActivity::Social && Agent.PartnerId.IsEmpty())
    {
        Agent.GoalAnchorId.Reset();
        Agent.DestinationId.Reset();
        Agent.Route.Reset();
        Agent.RouteIndex = 0;
        Agent.bActionStarted = false;
    }
    const bool bBusy = !Agent.GoalAnchorId.IsEmpty() &&
        (Agent.ActionUntil > ElapsedSeconds || Agent.RouteIndex < Agent.Route.Num() || !Agent.bActionStarted);
    const bool bUrgentRest = bNight || Agent.Needs.Fatigue > 0.82f;
    const bool bUrgentFood = Agent.Needs.Hunger > 0.55f;
    // Finish food, rest, and a granted performance; other stops can yield to bodily needs.
    if (bBusy && (Agent.DesiredActivity == EFlowFestCrowdActivity::Food ||
                  Agent.DesiredActivity == EFlowFestCrowdActivity::Rest ||
                  Agent.DesiredActivity == EFlowFestCrowdActivity::Perform ||
                  (!bUrgentRest && !bUrgentFood)))
        return;

    if (bUrgentRest)
    {
        SetGoal(Agent, Agent.HomeId, EFlowFestCrowdActivity::Rest, bNight ? TEXT("sleep at home") : TEXT("recover energy"));
        return;
    }
    if (bUrgentFood)
    {
        const bool bFoodStall = Landmarks.Contains(TEXT("food"));
        if (!bFoodStall || !SetGoal(Agent, TEXT("food"), EFlowFestCrowdActivity::Food, TEXT("get food")))
            SetGoal(Agent, Agent.HomeId, EFlowFestCrowdActivity::Food, TEXT("eat camp provisions"));
        return;
    }
    if (!Agent.PartnerId.IsEmpty() && Agent.Needs.Social > 0.52f)
    {
        const int32 PartnerIndex = FCString::Atoi(*Agent.PartnerId.Right(2));
        const FString SharedAnchor = Agents[FMath::Min(Index, PartnerIndex)].HomeId;
        if (SetGoal(Agent, SharedAnchor, EFlowFestCrowdActivity::Social, TEXT("meet a friend")))
            Agent.ActionDuration = 16.f + 4.f * Hash01(FMath::Min(Index, PartnerIndex), 75);
        return;
    }
    Agent.PartnerId.Reset();
    if (Agent.Needs.Practice > 0.44f && !Agent.PropId.IsNone())
    {
        SetGoal(Agent, TEXT("workshop"), EFlowFestCrowdActivity::Practice, TEXT("practice with personal prop"));
        return;
    }
    if (bFire)
        SetGoal(Agent, TEXT("fire"), Agent.PerformerOrdinal >= 0 ? EFlowFestCrowdActivity::Queue : EFlowFestCrowdActivity::Watch,
                Agent.PerformerOrdinal >= 0 ? TEXT("wait for fire turn") : TEXT("watch fire circle"));
    else if (SimMinute >= 1140.f)
        SetGoal(Agent, TEXT("workshop"), EFlowFestCrowdActivity::Gather, TEXT("join workshop"));
    else
        SetGoal(Agent, Agent.HomeId, Agent.Role == 0 ? EFlowFestCrowdActivity::Gate : EFlowFestCrowdActivity::Camp,
                Agent.Role == 0 ? TEXT("welcome arrivals") : TEXT("tend camp"));
}

bool FFlowFestCrowd::SetGoal(FFlowFestCrowdAgent& Agent, const FString& Anchor,
                             EFlowFestCrowdActivity Activity, const FString& Reason, int32 Slot)
{
    if (!Landmarks.Contains(Anchor)) return false;
    const FString Key = Anchor + TEXT(":") + FString::FromInt(static_cast<int32>(Activity)) + TEXT(":") + FString::FromInt(Slot);
    if (Key == Agent.DestinationId &&
        (!Agent.bActionStarted || Agent.RouteIndex < Agent.Route.Num() || Agent.ActionUntil > ElapsedSeconds)) return true;
    const int32 PreviousSlot = Agent.ReservedPerformanceSlot;
    Agent.ReservedPerformanceSlot = Slot;
    const FVector2D Destination = ActivityPosition(Agent, Anchor, Activity);
    if (!BuildRoute(Agent, Destination))
    {
        Agent.ReservedPerformanceSlot = PreviousSlot;
        Agent.GoalReason = TEXT("unreachable: ") + Reason;
        Agent.GoalAnchorId.Reset();
        Agent.DestinationId.Reset();
        Agent.DesiredActivity = EFlowFestCrowdActivity::Idle;
        Agent.Activity = EFlowFestCrowdActivity::Idle;
        Agent.ReservedPerformanceSlot = INDEX_NONE;
        Agent.bPropInHands = Agent.HasEquipment();
        Agent.bActionStarted = false;
        Agent.ActionUntil = ElapsedSeconds + 5.f;
        return false;
    }
    Agent.GoalAnchorId = Anchor;
    if (Agent.Activity == EFlowFestCrowdActivity::Rest && Agent.bActionStarted &&
        Activity != EFlowFestCrowdActivity::Rest)
        Agent.StandUntil = ElapsedSeconds + 1.1f;
    Agent.GoalReason = Reason;
    Agent.DestinationId = Key;
    Agent.Destination = Destination;
    Agent.DesiredActivity = Activity;
    Agent.ReservedPerformanceSlot = Slot;
    Agent.ActionDuration = Activity == EFlowFestCrowdActivity::Perform ? PerformanceTurnSeconds :
        12.f + 9.f * Hash01(FCString::Atoi(*Agent.Id.Right(2)), Agent.CompletedActions + 40);
    Agent.ActionUntil = 0.f;
    Agent.bActionStarted = false;
    return true;
}

void FFlowFestCrowd::UpdateNeeds(FFlowFestCrowdAgent& Agent, float DeltaSeconds)
{
    const float Dt = FMath::Max(0.f, DeltaSeconds);
    Agent.Needs.Hunger = FMath::Clamp(Agent.Needs.Hunger + Dt * 0.00055f, 0.f, 1.f);
    Agent.Needs.Fatigue = FMath::Clamp(Agent.Needs.Fatigue + Dt * 0.00042f, 0.f, 1.f);
    Agent.Needs.Social = FMath::Clamp(Agent.Needs.Social + Dt * 0.00048f, 0.f, 1.f);
    Agent.Needs.Practice = FMath::Clamp(Agent.Needs.Practice + Dt * 0.00036f, 0.f, 1.f);
}

void FFlowFestCrowd::AssignSocialPairs()
{
    TArray<bool> Paired;
    Paired.Init(false, Agents.Num());
    auto HasUrgentNeed = [this](const FFlowFestCrowdAgent& Agent)
    {
        return SimMinute >= 1560.f || Agent.Needs.Fatigue > 0.82f || Agent.Needs.Hunger > 0.55f ||
            Agent.ReservedPerformanceSlot != INDEX_NONE;
    };
    // Keep an existing encounter together through travel and its full shared dwell.
    for (int32 I = 0; I < Agents.Num(); ++I)
    {
        FFlowFestCrowdAgent& A = Agents[I];
        const int32 J = FCString::Atoi(*A.PartnerId.Right(2));
        if (A.PartnerId.IsEmpty() || !Agents.IsValidIndex(J) || J <= I) continue;
        FFlowFestCrowdAgent& B = Agents[J];
        if (B.PartnerId != A.Id || A.DesiredActivity != EFlowFestCrowdActivity::Social ||
            B.DesiredActivity != EFlowFestCrowdActivity::Social || HasUrgentNeed(A) || HasUrgentNeed(B)) continue;
        const bool bABusy = A.RouteIndex < A.Route.Num() || !A.bActionStarted || A.ActionUntil > ElapsedSeconds;
        const bool bBBusy = B.RouteIndex < B.Route.Num() || !B.bActionStarted || B.ActionUntil > ElapsedSeconds;
        if (bABusy || bBBusy) { Paired[I] = true; Paired[J] = true; }
    }
    for (int32 I = 0; I < Agents.Num(); ++I)
        if (!Paired[I]) Agents[I].PartnerId.Reset();
    auto CanPair = [this, &Paired, &HasUrgentNeed](int32 I)
    {
        const FFlowFestCrowdAgent& Agent = Agents[I];
        if (Paired[I] || Agent.Role == 0 || Agent.Needs.Social <= 0.52f || HasUrgentNeed(Agent)) return false;
        if (!Agent.GoalAnchorId.IsEmpty() &&
            (Agent.RouteIndex < Agent.Route.Num() || !Agent.bActionStarted || Agent.ActionUntil > ElapsedSeconds)) return false;
        return true;
    };
    for (int32 I = 3; I < Agents.Num(); ++I)
    {
        if (!CanPair(I)) continue;
        for (int32 J = I + 1; J < Agents.Num(); ++J)
        {
            if (!CanPair(J) || Agents[I].HomeId != Agents[J].HomeId) continue;
            FFlowFestCrowdAgent A = Agents[I];
            FFlowFestCrowdAgent B = Agents[J];
            A.PartnerId = B.Id; B.PartnerId = A.Id;
            const FVector2D AP = ActivityPosition(A, A.HomeId, EFlowFestCrowdActivity::Social);
            const FVector2D BP = ActivityPosition(B, B.HomeId, EFlowFestCrowdActivity::Social);
            if (!BuildRoute(A, AP) || !BuildRoute(B, BP)) continue;
            Agents[I].PartnerId = Agents[J].Id;
            Agents[J].PartnerId = Agents[I].Id;
            Paired[I] = true; Paired[J] = true;
            break;
        }
    }
}

void FFlowFestCrowd::AssignPerformanceSlots()
{
    if (SimMinute < 1240.f || SimMinute >= 1560.f || !Landmarks.Contains(TEXT("fire"))) return;
    for (int32 Slot = 0; Slot < 2; ++Slot)
    {
        bool bTaken = false;
        for (const FFlowFestCrowdAgent& Agent : Agents)
            if (Agent.ReservedPerformanceSlot == Slot) { bTaken = true; break; }
        if (bTaken) continue;
        int32 Best = INDEX_NONE;
        for (int32 I = 0; I < Agents.Num(); ++I)
        {
            const FFlowFestCrowdAgent& Agent = Agents[I];
            if (Agent.PerformerOrdinal < 0 || Agent.ReservedPerformanceSlot != INDEX_NONE ||
                Agent.DesiredActivity != EFlowFestCrowdActivity::Queue ||
                Agent.Activity != EFlowFestCrowdActivity::Queue || Agent.RouteIndex < Agent.Route.Num() ||
                !Agent.bActionStarted || Agent.NextPerformanceEligibleAt > ElapsedSeconds ||
                Agent.Needs.Hunger > 0.55f || Agent.Needs.Fatigue > 0.82f ||
                FVector2D::DistSquared(Agent.Position, Landmarks.FindRef(TEXT("fire"))) > 15.f * 15.f) continue;
            if (Best == INDEX_NONE || Agent.CompletedActions < Agents[Best].CompletedActions ||
                (Agent.CompletedActions == Agents[Best].CompletedActions && Agent.PerformerOrdinal < Agents[Best].PerformerOrdinal))
                Best = I;
        }
        if (Best != INDEX_NONE)
            SetGoal(Agents[Best], TEXT("fire"), EFlowFestCrowdActivity::Perform, TEXT("reserved fire turn"), Slot);
    }
}

void FFlowFestCrowd::Tick(float DeltaSeconds)
{
    const float Dt = FMath::Clamp(DeltaSeconds, 0.f, 0.1f);
    ElapsedSeconds += FMath::Max(0.f, DeltaSeconds);
    SimMinute = FMath::Min(SimMinute + FMath::Max(0.f, DeltaSeconds) * 0.5f, PhaseEndMinute - 0.001f);
    for (int32 I = 0; I < Agents.Num(); ++I)
        UpdateNeeds(Agents[I], DeltaSeconds);
    AssignSocialPairs();
    for (int32 I = 0; I < Agents.Num(); ++I) Plan(Agents[I], I);
    AssignPerformanceSlots();
    for (int32 I = 0; I < Agents.Num(); ++I)
    {
        FFlowFestCrowdAgent& Agent = Agents[I];
        Agent.Velocity = FVector2D::ZeroVector;
        if (Agent.StandUntil > ElapsedSeconds)
        {
            Agent.Activity = EFlowFestCrowdActivity::Rest;
            Agent.bPropInHands = false;
            continue;
        }
        Agent.StandUntil = 0.f;
        if (Agent.RouteIndex < Agent.Route.Num())
        {
            const FVector2D Delta = Agent.Route[Agent.RouteIndex] - Agent.Position;
            const float Distance = Delta.Size();
            if (Distance < 0.2f) { ++Agent.RouteIndex; }
            else
            {
                const FVector2D Direction = Delta / Distance;
                float Speed = Agent.WalkSpeed;
                for (int32 J = 0; J < Agents.Num(); ++J)
                {
                    if (I == J) continue;
                    const FVector2D Ahead = Agents[J].Position - Agent.Position;
                    if (Ahead.SizeSquared() < 1.5f * 1.5f && FVector2D::DotProduct(Ahead, Direction) > 0.f)
                        Speed = FMath::Min(Speed, Agent.WalkSpeed * 0.35f);
                }
                Agent.Velocity = Direction * FMath::Min(Speed, Distance / FMath::Max(Dt, 0.001f));
                FVector2D Separation = FVector2D::ZeroVector;
                for (int32 J = 0; J < Agents.Num(); ++J)
                {
                    if (I == J) continue;
                    const FVector2D Away = Agent.Position - Agents[J].Position;
                    const float Gap = Away.Size();
                    if (Gap > 0.01f && Gap < 0.9f) Separation += Away / Gap * (0.9f - Gap);
                }
                // Keep the lean inside even a narrow foot corridor; the path remains the travel owner.
                Agent.Velocity += Separation.GetClampedToMaxSize(0.3f);
                Agent.Position += Agent.Velocity * Dt;
                Agent.Facing = FMath::RadiansToDegrees(FMath::Atan2(Direction.Y, Direction.X));
                Agent.Activity = EFlowFestCrowdActivity::Travel;
            }
        }
        if (Agent.RouteIndex >= Agent.Route.Num())
        {
            Agent.Activity = Agent.DesiredActivity;
            // Paired social dwell begins for both guests after movement has updated
            // everyone, so index order cannot start one person's clock early.
            if (!Agent.bActionStarted && !Agent.GoalAnchorId.IsEmpty() &&
                Agent.DesiredActivity != EFlowFestCrowdActivity::Social)
            {
                Agent.bActionStarted = true;
                Agent.ActionStartedAt = ElapsedSeconds;
                Agent.ActionUntil = ElapsedSeconds + Agent.ActionDuration;
            }
            const FVector2D* Look = Landmarks.Find(Agent.GoalAnchorId);
            if (Agent.Activity == EFlowFestCrowdActivity::Watch || Agent.Activity == EFlowFestCrowdActivity::Queue || Agent.Activity == EFlowFestCrowdActivity::Perform)
                Look = Landmarks.Find(TEXT("fire"));
            if (Agent.bPlayerJoining && Agent.Activity == EFlowFestCrowdActivity::Watch &&
                FVector2D::DistSquared(PlayerPosition, Agent.Position) < 12.f * 12.f)
                Look = &PlayerPosition;
            // A short social pause can interrupt a settled schedule without losing its destination.
            if (Agent.Activity == EFlowFestCrowdActivity::Social || Agent.Activity == EFlowFestCrowdActivity::Gather)
            {
                bool bLookingAtPartner = false;
                if (Agent.Activity == EFlowFestCrowdActivity::Social && !Agent.PartnerId.IsEmpty())
                    for (const FFlowFestCrowdAgent& Other : Agents)
                        if (Other.Id == Agent.PartnerId && FVector2D::DistSquared(Other.Position, Agent.Position) < 5.f * 5.f)
                        { Look = &Other.Position; bLookingAtPartner = true; break; }
                if (!bLookingAtPartner && ElapsedSeconds > Agent.DwellUntil &&
                    Hash01(I, FMath::FloorToInt(ElapsedSeconds / 22.f)) > 0.54f)
                {
                    Agent.InterruptUntil = ElapsedSeconds + 5.f + Hash01(I, 19) * 6.f;
                    Agent.DwellUntil = ElapsedSeconds + 22.f;
                }
                if (!bLookingAtPartner && ElapsedSeconds < Agent.InterruptUntil)
                {
                    for (int32 J = 0; J < Agents.Num(); ++J)
                        if (I != J && FVector2D::DistSquared(Agents[J].Position, Agent.Position) < 5.f * 5.f)
                        { Look = &Agents[J].Position; break; }
                }
            }
            if (ElapsedSeconds < Agent.GreetUntil) Look = &PlayerPosition;
            if (Look && FVector2D::DistSquared(*Look, Agent.Position) > 0.01f)
            {
                const float Goal = FMath::RadiansToDegrees(FMath::Atan2(Look->Y - Agent.Position.Y, Look->X - Agent.Position.X));
                Agent.Facing = FMath::FixedTurn(Agent.Facing, Goal, Dt * 150.f);
            }
        }
        // Equipment stays with its owner across ordinary travel and fire turns.
        // Only a settled meal or floor rest stows it; the route to either still carries it.
        Agent.bPropInHands = Agent.HasEquipment() &&
            Agent.Activity != EFlowFestCrowdActivity::Food &&
            Agent.Activity != EFlowFestCrowdActivity::Rest;
    }
    for (int32 I = 0; I < Agents.Num(); ++I)
    {
        FFlowFestCrowdAgent& A = Agents[I];
        if (A.DesiredActivity != EFlowFestCrowdActivity::Social || A.PartnerId.IsEmpty() ||
            A.GoalAnchorId.IsEmpty() || A.RouteIndex < A.Route.Num()) continue;
        const int32 J = FCString::Atoi(*A.PartnerId.Right(2));
        if (!Agents.IsValidIndex(J) || J <= I) continue;
        FFlowFestCrowdAgent& B = Agents[J];
        if (B.PartnerId != A.Id || B.DesiredActivity != EFlowFestCrowdActivity::Social ||
            B.GoalAnchorId != A.GoalAnchorId || B.RouteIndex < B.Route.Num() ||
            (A.bActionStarted && B.bActionStarted)) continue;
        A.bActionStarted = true;
        B.bActionStarted = true;
        A.ActionStartedAt = B.ActionStartedAt = ElapsedSeconds;
        const float SharedEnd = ElapsedSeconds + FMath::Max(A.ActionDuration, B.ActionDuration);
        A.ActionUntil = SharedEnd;
        B.ActionUntil = SharedEnd;
    }
}

int32 FFlowFestCrowd::GetCount(EFlowFestCrowdActivity Activity) const
{
    int32 Count = 0; for (const FFlowFestCrowdAgent& Agent : Agents) if (Agent.Activity == Activity) ++Count;
    return Count;
}

FFlowFestCrowdSnapshot FFlowFestCrowd::CaptureSnapshot() const
{
    FFlowFestCrowdSnapshot Snapshot;
    Snapshot.Agents = Agents;
    Snapshot.SimMinute = SimMinute;
    Snapshot.ElapsedSeconds = ElapsedSeconds;
    Snapshot.PhaseEndMinute = PhaseEndMinute;
    Snapshot.PlayerPosition = PlayerPosition;
    Snapshot.bPlayerAtFire = bPlayerAtFire;
    Snapshot.bPlayerJoining = bPlayerJoining;
    return Snapshot;
}

bool FFlowFestCrowd::RestoreSnapshot(const FFlowFestCrowdSnapshot& Snapshot)
{
    if (Snapshot.Agents.Num() != Agents.Num() || !FMath::IsFinite(Snapshot.ElapsedSeconds) ||
        !FMath::IsFinite(Snapshot.SimMinute) || !FMath::IsFinite(Snapshot.PhaseEndMinute)) return false;
    for (int32 I = 0; I < Agents.Num(); ++I)
    {
        const FFlowFestCrowdAgent& Saved = Snapshot.Agents[I];
        if (Saved.Id != Agents[I].Id || Saved.AvatarId != Agents[I].AvatarId ||
            Saved.PropId != Agents[I].PropId || Saved.RouteIndex < 0 || Saved.RouteIndex > Saved.Route.Num() ||
            !FMath::IsFinite(Saved.Position.X) || !FMath::IsFinite(Saved.Position.Y) ||
            !FMath::IsFinite(Saved.ActionUntil) || !FMath::IsFinite(Saved.GreetUntil) ||
            !FMath::IsFinite(Saved.ActionStartedAt) || !FMath::IsFinite(Saved.StandUntil) ||
            !FMath::IsFinite(Saved.NextGreetAt) || !FMath::IsFinite(Saved.NextPerformanceEligibleAt) ||
            Saved.ReservedPerformanceSlot < INDEX_NONE || Saved.ReservedPerformanceSlot > 1) return false;
        if (!Saved.PartnerId.IsEmpty())
        {
            const int32 PartnerIndex = FCString::Atoi(*Saved.PartnerId.Right(2));
            if (!Snapshot.Agents.IsValidIndex(PartnerIndex) || PartnerIndex == I ||
                Saved.PartnerId != Snapshot.Agents[PartnerIndex].Id ||
                Snapshot.Agents[PartnerIndex].PartnerId != Saved.Id ||
                Saved.Role == 0 || Snapshot.Agents[PartnerIndex].Role == 0 ||
                Saved.HomeId != Snapshot.Agents[PartnerIndex].HomeId ||
                Saved.DesiredActivity != EFlowFestCrowdActivity::Social ||
                Snapshot.Agents[PartnerIndex].DesiredActivity != EFlowFestCrowdActivity::Social) return false;
        }
    }
    Agents = Snapshot.Agents;
    SimMinute = Snapshot.SimMinute;
    ElapsedSeconds = Snapshot.ElapsedSeconds;
    PhaseEndMinute = Snapshot.PhaseEndMinute;
    PlayerPosition = Snapshot.PlayerPosition;
    bPlayerAtFire = Snapshot.bPlayerAtFire;
    bPlayerJoining = Snapshot.bPlayerJoining;
    return true;
}

FString FFlowFestCrowd::SerializeState() const
{
    TSharedRef<FJsonObject> Root = MakeShared<FJsonObject>();
    Root->SetNumberField(TEXT("version"), 1);
    Root->SetNumberField(TEXT("minute"), SimMinute);
    Root->SetNumberField(TEXT("elapsed"), ElapsedSeconds);
    Root->SetNumberField(TEXT("phaseEnd"), PhaseEndMinute);
    Root->SetArrayField(TEXT("player"), WritePoint(PlayerPosition));
    Root->SetBoolField(TEXT("playerAtFire"), bPlayerAtFire);
    Root->SetBoolField(TEXT("playerJoining"), bPlayerJoining);
    TArray<TSharedPtr<FJsonValue>> SavedAgents;
    for (const FFlowFestCrowdAgent& Agent : Agents)
    {
        TSharedRef<FJsonObject> Entry = MakeShared<FJsonObject>();
        Entry->SetStringField(TEXT("id"), Agent.Id);
        Entry->SetStringField(TEXT("avatar"), Agent.AvatarId.ToString());
        Entry->SetStringField(TEXT("prop"), Agent.PropId.ToString());
        Entry->SetArrayField(TEXT("position"), WritePoint(Agent.Position));
        Entry->SetArrayField(TEXT("destination"), WritePoint(Agent.Destination));
        Entry->SetArrayField(TEXT("velocity"), WritePoint(Agent.Velocity));
        TArray<TSharedPtr<FJsonValue>> RoutePoints;
        for (const FVector2D& Point : Agent.Route)
            RoutePoints.Add(MakeShared<FJsonValueArray>(WritePoint(Point)));
        Entry->SetArrayField(TEXT("route"), RoutePoints);
        Entry->SetNumberField(TEXT("routeIndex"), Agent.RouteIndex);
        Entry->SetNumberField(TEXT("facing"), Agent.Facing);
        Entry->SetNumberField(TEXT("dwell"), Agent.DwellUntil);
        Entry->SetNumberField(TEXT("interrupt"), Agent.InterruptUntil);
        Entry->SetNumberField(TEXT("greetUntil"), Agent.GreetUntil);
        Entry->SetNumberField(TEXT("nextGreet"), Agent.NextGreetAt);
        Entry->SetNumberField(TEXT("actionUntil"), Agent.ActionUntil);
        Entry->SetNumberField(TEXT("actionDuration"), Agent.ActionDuration);
        Entry->SetNumberField(TEXT("actionStartedAt"), Agent.ActionStartedAt);
        Entry->SetNumberField(TEXT("standUntil"), Agent.StandUntil);
        Entry->SetNumberField(TEXT("nextTurn"), Agent.NextPerformanceEligibleAt);
        Entry->SetBoolField(TEXT("actionStarted"), Agent.bActionStarted);
        Entry->SetNumberField(TEXT("completed"), Agent.CompletedActions);
        Entry->SetNumberField(TEXT("slot"), Agent.ReservedPerformanceSlot);
        Entry->SetNumberField(TEXT("activity"), static_cast<int32>(Agent.Activity));
        Entry->SetNumberField(TEXT("desired"), static_cast<int32>(Agent.DesiredActivity));
        Entry->SetStringField(TEXT("destinationId"), Agent.DestinationId);
        Entry->SetStringField(TEXT("anchor"), Agent.GoalAnchorId);
        Entry->SetStringField(TEXT("reason"), Agent.GoalReason);
        Entry->SetStringField(TEXT("partner"), Agent.PartnerId);
        Entry->SetBoolField(TEXT("hands"), Agent.bPropInHands);
        Entry->SetBoolField(TEXT("joining"), Agent.bPlayerJoining);
        TArray<TSharedPtr<FJsonValue>> NeedValues = {
            MakeShared<FJsonValueNumber>(Agent.Needs.Hunger), MakeShared<FJsonValueNumber>(Agent.Needs.Fatigue),
            MakeShared<FJsonValueNumber>(Agent.Needs.Social), MakeShared<FJsonValueNumber>(Agent.Needs.Practice) };
        Entry->SetArrayField(TEXT("needs"), NeedValues);
        SavedAgents.Add(MakeShared<FJsonValueObject>(Entry));
    }
    Root->SetArrayField(TEXT("agents"), SavedAgents);
    FString Json;
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Json);
    FJsonSerializer::Serialize(Root, Writer);
    return Json;
}

bool FFlowFestCrowd::RestoreState(const FString& Json)
{
    TSharedPtr<FJsonObject> Root;
    if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json), Root) || !Root.IsValid()) return false;
    double Version = 0.0;
    if (!Root->TryGetNumberField(TEXT("version"), Version) || Version != 1.0) return false;
    FFlowFestCrowdSnapshot Snapshot = CaptureSnapshot();
    if (!ReadNumber(Root, TEXT("minute"), Snapshot.SimMinute) ||
        !ReadNumber(Root, TEXT("elapsed"), Snapshot.ElapsedSeconds) ||
        !ReadNumber(Root, TEXT("phaseEnd"), Snapshot.PhaseEndMinute)) return false;
    const TArray<TSharedPtr<FJsonValue>>* Player = nullptr;
    if (!Root->TryGetArrayField(TEXT("player"), Player) || !ReadPoint(*Player, Snapshot.PlayerPosition) ||
        !Root->TryGetBoolField(TEXT("playerAtFire"), Snapshot.bPlayerAtFire) ||
        !Root->TryGetBoolField(TEXT("playerJoining"), Snapshot.bPlayerJoining)) return false;
    const TArray<TSharedPtr<FJsonValue>>* Entries = nullptr;
    if (!Root->TryGetArrayField(TEXT("agents"), Entries) || Entries->Num() != Agents.Num()) return false;
    for (int32 I = 0; I < Entries->Num(); ++I)
    {
        const TSharedPtr<FJsonObject> Entry = (*Entries)[I]->AsObject();
        if (!Entry.IsValid()) return false;
        FFlowFestCrowdAgent& Agent = Snapshot.Agents[I];
        FString Id, Avatar, Prop;
        if (!Entry->TryGetStringField(TEXT("id"), Id) || Id != Agent.Id ||
            !Entry->TryGetStringField(TEXT("avatar"), Avatar) || Avatar != Agent.AvatarId.ToString() ||
            !Entry->TryGetStringField(TEXT("prop"), Prop) || Prop != Agent.PropId.ToString()) return false;
        const TArray<TSharedPtr<FJsonValue>>* Values = nullptr;
        if (!Entry->TryGetArrayField(TEXT("position"), Values) || !ReadPoint(*Values, Agent.Position) ||
            !Entry->TryGetArrayField(TEXT("destination"), Values) || !ReadPoint(*Values, Agent.Destination) ||
            !Entry->TryGetArrayField(TEXT("velocity"), Values) || !ReadPoint(*Values, Agent.Velocity)) return false;
        if (!Entry->TryGetArrayField(TEXT("route"), Values)) return false;
        Agent.Route.Reset();
        for (const TSharedPtr<FJsonValue>& RouteValue : *Values)
        {
            FVector2D Point;
            if (RouteValue->Type != EJson::Array || !ReadPoint(RouteValue->AsArray(), Point)) return false;
            Agent.Route.Add(Point);
        }
        float Number = 0.f;
        if (!ReadNumber(Entry, TEXT("routeIndex"), Number)) return false; Agent.RouteIndex = FMath::RoundToInt(Number);
        if (!ReadNumber(Entry, TEXT("facing"), Agent.Facing) ||
            !ReadNumber(Entry, TEXT("dwell"), Agent.DwellUntil) ||
            !ReadNumber(Entry, TEXT("interrupt"), Agent.InterruptUntil) ||
            !ReadNumber(Entry, TEXT("greetUntil"), Agent.GreetUntil) ||
            !ReadNumber(Entry, TEXT("nextGreet"), Agent.NextGreetAt) ||
            !ReadNumber(Entry, TEXT("actionUntil"), Agent.ActionUntil) ||
            !ReadNumber(Entry, TEXT("actionDuration"), Agent.ActionDuration) ||
            !Entry->TryGetBoolField(TEXT("actionStarted"), Agent.bActionStarted)) return false;
        // Saves predating body actions can continue with their original schedule.
        if (Entry->HasField(TEXT("actionStartedAt")) &&
            !ReadNumber(Entry, TEXT("actionStartedAt"), Agent.ActionStartedAt)) return false;
        if (Entry->HasField(TEXT("standUntil")) &&
            !ReadNumber(Entry, TEXT("standUntil"), Agent.StandUntil)) return false;
        // Older crowd snapshots predate turn cooldowns; zero means immediately eligible.
        if (Entry->HasField(TEXT("nextTurn")) && !ReadNumber(Entry, TEXT("nextTurn"), Agent.NextPerformanceEligibleAt)) return false;
        if (!ReadNumber(Entry, TEXT("completed"), Number)) return false; Agent.CompletedActions = FMath::RoundToInt(Number);
        if (!ReadNumber(Entry, TEXT("slot"), Number)) return false; Agent.ReservedPerformanceSlot = FMath::RoundToInt(Number);
        if (!ReadNumber(Entry, TEXT("activity"), Number) || Number < 0.f || Number > static_cast<int32>(EFlowFestCrowdActivity::Idle)) return false;
        Agent.Activity = static_cast<EFlowFestCrowdActivity>(FMath::RoundToInt(Number));
        if (!ReadNumber(Entry, TEXT("desired"), Number) || Number < 0.f || Number > static_cast<int32>(EFlowFestCrowdActivity::Idle)) return false;
        Agent.DesiredActivity = static_cast<EFlowFestCrowdActivity>(FMath::RoundToInt(Number));
        if (!Entry->TryGetStringField(TEXT("destinationId"), Agent.DestinationId) ||
            !Entry->TryGetStringField(TEXT("anchor"), Agent.GoalAnchorId) ||
            !Entry->TryGetStringField(TEXT("reason"), Agent.GoalReason) ||
            !Entry->TryGetStringField(TEXT("partner"), Agent.PartnerId) ||
            !Entry->TryGetBoolField(TEXT("hands"), Agent.bPropInHands) ||
            !Entry->TryGetBoolField(TEXT("joining"), Agent.bPlayerJoining)) return false;
        if (!Entry->TryGetArrayField(TEXT("needs"), Values) || Values->Num() != 4) return false;
        float* Needs[] = { &Agent.Needs.Hunger, &Agent.Needs.Fatigue, &Agent.Needs.Social, &Agent.Needs.Practice };
        for (int32 N = 0; N < 4; ++N)
        {
            if ((*Values)[N]->Type != EJson::Number) return false;
            *Needs[N] = (*Values)[N]->AsNumber();
            if (!FMath::IsFinite(*Needs[N]) || *Needs[N] < 0.f || *Needs[N] > 1.f) return false;
        }
    }
    return RestoreSnapshot(Snapshot);
}

const TCHAR* FFlowFestCrowd::ActivityLabel(EFlowFestCrowdActivity Activity)
{
    switch (Activity)
    {
    case EFlowFestCrowdActivity::Gate: return TEXT("Welcoming arrivals");
    case EFlowFestCrowdActivity::Camp: return TEXT("At camp");
    case EFlowFestCrowdActivity::Social: return TEXT("Meeting a friend");
    case EFlowFestCrowdActivity::Travel: return TEXT("Walking");
    case EFlowFestCrowdActivity::Gather: return TEXT("At the workshop");
    case EFlowFestCrowdActivity::Practice: return TEXT("Practicing");
    case EFlowFestCrowdActivity::Watch: return TEXT("Watching the fire circle");
    case EFlowFestCrowdActivity::Queue: return TEXT("Waiting to perform");
    case EFlowFestCrowdActivity::Perform: return TEXT("Performing");
    case EFlowFestCrowdActivity::Rest: return TEXT("Resting");
    case EFlowFestCrowdActivity::Food: return TEXT("Eating");
    default: return TEXT("Taking a moment");
    }
}

FString FFlowFestCrowd::IntentText(const FFlowFestCrowdAgent& Agent)
{
    if (Agent.Activity == EFlowFestCrowdActivity::Travel)
        return FString::Printf(TEXT("Walking to %s to %s"), *Agent.GoalAnchorId, *Agent.GoalReason);
    return Agent.GoalReason.IsEmpty() ? FString(ActivityLabel(Agent.Activity)) : Agent.GoalReason;
}
