#include "FlowFestCrowd.h"

namespace
{
constexpr float TwoPi = 2.f * PI;
const TCHAR* Names[] = { TEXT("Wren"), TEXT("Bo"), TEXT("Sage"), TEXT("Cass"), TEXT("Juniper"), TEXT("Rook"), TEXT("Mira"), TEXT("Dez"), TEXT("Ash"), TEXT("Poppy"), TEXT("Kit"), TEXT("Lark"), TEXT("Nico"), TEXT("Sol"), TEXT("Wilder"), TEXT("Fen"), TEXT("Marlow"), TEXT("Tam"), TEXT("Rue"), TEXT("Ozzy"), TEXT("Sparrow"), TEXT("Indigo"), TEXT("Cleo"), TEXT("Bram"), TEXT("Delta"), TEXT("Onyx"), TEXT("Vale"), TEXT("Hollis"), TEXT("Wynn"), TEXT("Zephyr"), TEXT("Callum"), TEXT("Nova"), TEXT("Piper"), TEXT("Ridge"), TEXT("Sunny"), TEXT("Thea"), TEXT("Blaze"), TEXT("Coriander"), TEXT("Echo"), TEXT("Fable") };
const FName Avatars[] = { TEXT("ch01"), TEXT("ch07"), TEXT("ch12"), TEXT("ch18"), TEXT("ch21"), TEXT("ch22"), TEXT("ch24"), TEXT("ch41"), TEXT("ch42") };
const FName PerformerProps[] = { TEXT("poi"), TEXT("bighoop") };
const FName PerformerClips[] = { TEXT("FirePoi"), TEXT("FireHoop") };
const FName PracticeProps[] = { TEXT("club"), TEXT("capsule_baton") };
const FName PracticeClips[] = { TEXT("Juggler"), TEXT("LedFlow") };

float Hash01(int32 Index, int32 Salt)
{
    uint32 X = static_cast<uint32>(Index * 747796405u + Salt * 2891336453u + 277803737u);
    X ^= X >> 16; X *= 2246822519u; X ^= X >> 13;
    return static_cast<float>(X & 0xffffu) / 65535.f;
}

}

void FFlowFestCrowd::Initialize(const TMap<FString, FVector2D>& InLandmarks,
                                const TArray<TArray<FVector2D>>& RoadLines, float Hour)
{
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
        if (Agent.Role == 3)
        {
            Agent.PerformerOrdinal = PerformerCount++;
            const int32 Profile = Agent.PerformerOrdinal % UE_ARRAY_COUNT(PerformerProps);
            Agent.PropId = PerformerProps[Profile];
            Agent.PerformanceId = PerformerClips[Profile];
            Agent.FinishId = TEXT("fire");
        }
        else if (Agent.Role == 4 && I % 2 == 0)
        {
            const int32 Profile = (I / 2) % UE_ARRAY_COUNT(PracticeProps);
            Agent.PropId = PracticeProps[Profile];
            Agent.PerformanceId = PracticeClips[Profile];
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
        for (int32 I = 0; I < Agents.Num(); ++I)
        {
            Plan(Agents[I], I);
            Agents[I].Position = Agents[I].Destination;
            Agents[I].Route.Reset();
            Agents[I].RouteIndex = 0;
            Agents[I].Activity = Agents[I].DesiredActivity;
        }
}

void FFlowFestCrowd::SetPlayerPresence(const FVector2D& Position, bool bAtFire, bool bJoining)
{
    PlayerPosition = Position;
    bPlayerAtFire = bAtFire;
    bPlayerJoining = bJoining;
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
            const float SlotAngle = Agent.PerformerOrdinal % 2 == 0 ? 0.5f : 3.65f;
            return *Anchor + FVector2D(FMath::Cos(SlotAngle), FMath::Sin(SlotAngle)) * 2.f;
        }
        Radius = 8.2f + (Index % 3) * 1.4f;
    }
    return *Anchor + FVector2D(FMath::Cos(Angle), FMath::Sin(Angle)) * Radius;
}

void FFlowFestCrowd::BuildRoute(FFlowFestCrowdAgent& Agent, const FVector2D& Destination)
{
    Agent.Route.Reset(); Agent.RouteIndex = 0;
    if (FVector2D::Distance(Agent.Position, Destination) < 0.35f) return;
    if (Nodes.IsEmpty()) { Agent.Route.Add(Destination); return; }
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
        if (FVector2D::DistSquared(Agent.Position, Destination) < 25.f * 25.f) Agent.Route.Add(Destination);
        return;
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
    if (Start != Goal && Parent[Goal] == INDEX_NONE) return;
    TArray<FVector2D> Reverse;
    for (int32 N = Goal; N != INDEX_NONE; N = Parent[N]) { Reverse.Add(Nodes[N].Position); if (N == Start) break; }
    for (int32 I = Reverse.Num() - 1; I >= 0; --I) Agent.Route.Add(Reverse[I]);
    Agent.Route.Add(Destination);
}

void FFlowFestCrowd::Plan(FFlowFestCrowdAgent& Agent, int32 Index)
{
    FString Anchor = Agent.HomeId;
    EFlowFestCrowdActivity Activity = EFlowFestCrowdActivity::Camp;
    const float Jitter = (Hash01(Index, 8) - 0.5f) * 35.f;
    if (Agent.Role == 0)
    {
        Activity = SimMinute < 1590.f ? EFlowFestCrowdActivity::Gate : EFlowFestCrowdActivity::Rest;
    }
    else if (SimMinute >= 1560.f + Jitter)
    {
        Activity = EFlowFestCrowdActivity::Rest;
    }
    else if (SimMinute >= 1260.f + Jitter || (Agent.Role == 3 && SimMinute >= 1210.f + Jitter))
    {
        Anchor = TEXT("fire");
        Activity = Agent.Role == 3 ? EFlowFestCrowdActivity::Queue : EFlowFestCrowdActivity::Watch;
        if (Agent.Role == 4 && SimMinute > 1470.f + Jitter) { Anchor = TEXT("workshop"); Activity = EFlowFestCrowdActivity::Gather; }
    }
    else if (SimMinute >= 1140.f + Jitter)
    {
        Anchor = Agent.Role == 3 || Agent.Role == 4 ? TEXT("workshop") : TEXT("fire");
        Activity = Agent.Role == 3 || Agent.Role == 4 ? EFlowFestCrowdActivity::Practice : EFlowFestCrowdActivity::Gather;
    }
    else if (SimMinute >= 990.f + Jitter)
    {
        Anchor = Agent.Role == 3 || Agent.Role == 4 ? TEXT("workshop") : Agent.Role == 2 ? TEXT("fire") : Agent.HomeId;
        Activity = Agent.Role == 3 || Agent.Role == 4 ? EFlowFestCrowdActivity::Practice : EFlowFestCrowdActivity::Social;
    }
    else if (Agent.Role == 2 && SimMinute < 850.f + Jitter)
    {
        Anchor = TEXT("parking"); Activity = EFlowFestCrowdActivity::Travel;
    }

    const int32 Rotation = FMath::FloorToInt(ElapsedSeconds / 24.f);
    if (Agent.Role == 3 && Anchor == TEXT("fire"))
    {
        int32 Count = 0; for (const FFlowFestCrowdAgent& Other : Agents) if (Other.Role == 3) ++Count;
        if (Count > 0 && (Agent.PerformerOrdinal - Rotation + Count * 100) % Count < 2)
            Activity = EFlowFestCrowdActivity::Perform;
    }
    Agent.bPlayerJoining = bPlayerJoining && bPlayerAtFire && Anchor == TEXT("fire");
    const FString Key = Anchor + TEXT(":") + FString::FromInt(static_cast<int32>(Activity));
    if (Key != Agent.DestinationId)
    {
        Agent.DestinationId = Key;
        Agent.DesiredActivity = Activity;
        Agent.Destination = ActivityPosition(Agent, Anchor, Activity);
        BuildRoute(Agent, Agent.Destination);
    }
}

void FFlowFestCrowd::Tick(float DeltaSeconds)
{
    const float Dt = FMath::Clamp(DeltaSeconds, 0.f, 0.1f);
    ElapsedSeconds += FMath::Max(0.f, DeltaSeconds);
    SimMinute = FMath::Min(SimMinute + FMath::Max(0.f, DeltaSeconds) * 0.5f, PhaseEndMinute - 0.001f);
    for (int32 I = 0; I < Agents.Num(); ++I) Plan(Agents[I], I);
    for (int32 I = 0; I < Agents.Num(); ++I)
    {
        FFlowFestCrowdAgent& Agent = Agents[I];
        Agent.Velocity = FVector2D::ZeroVector;
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
            const FVector2D* Look = Landmarks.Find(Agent.DestinationId.LeftChop(2));
            if (Agent.Activity == EFlowFestCrowdActivity::Watch || Agent.Activity == EFlowFestCrowdActivity::Queue || Agent.Activity == EFlowFestCrowdActivity::Perform)
                Look = Landmarks.Find(TEXT("fire"));
            if (Agent.bPlayerJoining && Agent.Activity == EFlowFestCrowdActivity::Watch &&
                FVector2D::DistSquared(PlayerPosition, Agent.Position) < 12.f * 12.f)
                Look = &PlayerPosition;
            // A short social pause can interrupt a settled schedule without losing its destination.
            if (Agent.Activity == EFlowFestCrowdActivity::Social || Agent.Activity == EFlowFestCrowdActivity::Gather)
            {
                if (ElapsedSeconds > Agent.DwellUntil && Hash01(I, FMath::FloorToInt(ElapsedSeconds / 22.f)) > 0.54f)
                {
                    Agent.InterruptUntil = ElapsedSeconds + 5.f + Hash01(I, 19) * 6.f;
                    Agent.DwellUntil = ElapsedSeconds + 22.f;
                }
                if (ElapsedSeconds < Agent.InterruptUntil)
                {
                    for (int32 J = 0; J < Agents.Num(); ++J)
                        if (I != J && FVector2D::DistSquared(Agents[J].Position, Agent.Position) < 5.f * 5.f)
                        { Look = &Agents[J].Position; break; }
                }
            }
            if (Look && FVector2D::DistSquared(*Look, Agent.Position) > 0.01f)
            {
                const float Goal = FMath::RadiansToDegrees(FMath::Atan2(Look->Y - Agent.Position.Y, Look->X - Agent.Position.X));
                Agent.Facing = FMath::FixedTurn(Agent.Facing, Goal, Dt * 150.f);
            }
        }
    }
}

int32 FFlowFestCrowd::GetCount(EFlowFestCrowdActivity Activity) const
{
    int32 Count = 0; for (const FFlowFestCrowdAgent& Agent : Agents) if (Agent.Activity == Activity) ++Count;
    return Count;
}
