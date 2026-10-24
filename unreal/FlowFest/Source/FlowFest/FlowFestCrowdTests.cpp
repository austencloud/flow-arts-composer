#include "FlowFestCrowd.h"
#include "FlowFestAvatarComponent.h"
#include "FlowFestActivityPose.h"

#if WITH_DEV_AUTOMATION_TESTS
#include "Misc/AutomationTest.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestCrowdScheduleTest, "FlowFest.Crowd.IdentityRouteAndFireRotation",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowFestCrowdScheduleTest::RunTest(const FString& Parameters)
{
    TMap<FString, FVector2D> Landmarks;
    Landmarks.Add(TEXT("gate"), FVector2D(0.f, 0.f));
    Landmarks.Add(TEXT("parking"), FVector2D(10.f, 0.f));
    Landmarks.Add(TEXT("camp-lower"), FVector2D(20.f, 0.f));
    Landmarks.Add(TEXT("camp-upper"), FVector2D(25.f, 0.f));
    Landmarks.Add(TEXT("camp-car"), FVector2D(30.f, 0.f));
    Landmarks.Add(TEXT("workshop"), FVector2D(45.f, 0.f));
    Landmarks.Add(TEXT("fire"), FVector2D(60.f, 0.f));
    TArray<TArray<FVector2D>> Roads;
    Roads.Add({FVector2D(0.f, 0.f), FVector2D(60.f, 0.f)});
    FFlowFestCrowd Crowd;
    Crowd.Initialize(Landmarks, Roads, 17.f);
    Crowd.Tick(1.f);
    Crowd.SetTimeOfDay(23.f);
    Crowd.Tick(0.1f);
    TestEqual(TEXT("Persistent population"), Crowd.GetAgents().Num(), 38);
    TSet<FString> Ids;
    TSet<int32> EverActive;
    TSet<FName> FireProfiles;
    TSet<FName> PracticeProfiles;
    for (const FFlowFestCrowdAgent& Agent : Crowd.GetAgents())
    {
        Ids.Add(Agent.Id);
        if (Agent.Role == 3)
        {
            FireProfiles.Add(Agent.PerformanceId);
            TestEqual(TEXT("Fire finish remains assigned"), Agent.FinishId, FName(TEXT("fire")));
            TestTrue(TEXT("Fire dancer uses its equipped family"),
                Agent.PerformanceId == UFlowFestAvatarComponent::ResolvePerformanceProfile(Agent.PropId, 0)
                || Agent.PerformanceId == UFlowFestAvatarComponent::ResolvePerformanceProfile(Agent.PropId, 1));
            for (int32 I = 1; I < Agent.Route.Num(); ++I)
                TestTrue(TEXT("No long off-road route hop"), FVector2D::Distance(Agent.Route[I - 1], Agent.Route[I]) < 25.f);
        }
        else if (Agent.Role == 4)
        {
            PracticeProfiles.Add(Agent.PerformanceId);
            TestEqual(TEXT("Practice LED finish remains assigned"), Agent.FinishId, FName(TEXT("led")));
            TestTrue(TEXT("Practice dancer uses its equipped family"),
                Agent.PerformanceId == UFlowFestAvatarComponent::ResolvePerformanceProfile(Agent.PropId, 0)
                || Agent.PerformanceId == UFlowFestAvatarComponent::ResolvePerformanceProfile(Agent.PropId, 1));
        }
    }
    for (const FName Profile : { FName(TEXT("P_poi_A")), FName(TEXT("P_poi_B")),
                                 FName(TEXT("P_bighoop_A")), FName(TEXT("P_bighoop_B")) })
        TestTrue(*FString::Printf(TEXT("Fire profile %s is assigned"), *Profile.ToString()), FireProfiles.Contains(Profile));
    for (const FName Profile : { FName(TEXT("P_club_A")), FName(TEXT("P_club_B")),
                                 FName(TEXT("P_capsule_baton_A")), FName(TEXT("P_capsule_baton_B")) })
        TestTrue(*FString::Printf(TEXT("Practice profile %s is assigned"), *Profile.ToString()), PracticeProfiles.Contains(Profile));
    TestEqual(TEXT("Identity IDs are unique"), Ids.Num(), 38);
    FFlowFestCrowdSnapshot RouteSetup = Crowd.CaptureSnapshot();
    FFlowFestCrowdAgent& DistantPerformer = RouteSetup.Agents[4];
    DistantPerformer.Position = FVector2D(20.f, 0.f);
    DistantPerformer.GoalAnchorId.Reset(); DistantPerformer.DestinationId.Reset();
    DistantPerformer.Route.Reset(); DistantPerformer.RouteIndex = 0;
    DistantPerformer.ActionUntil = 0.f; DistantPerformer.bActionStarted = false;
    DistantPerformer.Needs.Hunger = DistantPerformer.Needs.Fatigue =
        DistantPerformer.Needs.Social = DistantPerformer.Needs.Practice = 0.f;
    TestTrue(TEXT("Distant route setup accepted"), Crowd.RestoreSnapshot(RouteSetup));
    Crowd.Tick(0.1f);
    TestTrue(TEXT("Distant fire queue uses corridor route"), Crowd.GetAgents()[4].Route.Num() > 2);
    for (int32 I = 1; I < Crowd.GetAgents()[4].Route.Num(); ++I)
        TestTrue(TEXT("Distant fire route has no long off-road hop"),
            FVector2D::Distance(Crowd.GetAgents()[4].Route[I - 1], Crowd.GetAgents()[4].Route[I]) < 25.f);
    FFlowFestCrowdSnapshot FireSetup = Crowd.CaptureSnapshot();
    for (FFlowFestCrowdAgent& Agent : FireSetup.Agents)
    {
        if (Agent.PerformerOrdinal < 0) continue;
        Agent.Position = FVector2D(60.f + Agent.PerformerOrdinal * 0.2f, 8.f);
        Agent.Destination = Agent.Position;
        Agent.Route.Reset(); Agent.RouteIndex = 0;
        Agent.Activity = EFlowFestCrowdActivity::Queue;
        Agent.DesiredActivity = EFlowFestCrowdActivity::Queue;
        Agent.GoalAnchorId = TEXT("fire");
        Agent.GoalReason = TEXT("wait for fire turn");
        Agent.DestinationId = TEXT("fire:7:-1");
        Agent.ActionUntil = FireSetup.ElapsedSeconds + 300.f;
        Agent.bActionStarted = true;
        Agent.Needs.Hunger = Agent.Needs.Fatigue = Agent.Needs.Social = Agent.Needs.Practice = 0.f;
    }
    TestTrue(TEXT("Fire queue setup accepted"), Crowd.RestoreSnapshot(FireSetup));
    Crowd.Tick(0.1f);
    int32 Reserved = 0;
    for (const FFlowFestCrowdAgent& Agent : Crowd.GetAgents())
        if (Agent.ReservedPerformanceSlot != INDEX_NONE) { ++Reserved; EverActive.Add(Agent.PerformerOrdinal); }
    TestEqual(TEXT("Exactly two nearby guests receive slots"), Reserved, 2);
    FFlowFestCrowd SavedTurn;
    SavedTurn.Initialize(Landmarks, Roads, 23.f);
    TestTrue(TEXT("Live reservations restore from a save string"), SavedTurn.RestoreState(Crowd.SerializeState()));
    for (int32 I = 0; I < Crowd.GetAgents().Num(); ++I)
        TestEqual(TEXT("Restored slot matches owner"), SavedTurn.GetAgents()[I].ReservedPerformanceSlot,
            Crowd.GetAgents()[I].ReservedPerformanceSlot);
    const int32 FirstPerformer = 4;
    for (int32 Step = 0; Step < 400 && !Crowd.GetAgents()[FirstPerformer].bActionStarted; ++Step)
        Crowd.Tick(0.1f);
    TestTrue(TEXT("Reserved performer reaches the fire before turn starts"), Crowd.GetAgents()[FirstPerformer].bActionStarted);
    if (Crowd.GetAgents()[FirstPerformer].bActionStarted)
        TestTrue(TEXT("Performer receives a full turn after arrival"),
            Crowd.GetAgents()[FirstPerformer].ActionUntil - Crowd.CaptureSnapshot().ElapsedSeconds > 23.8f);
    for (int32 Step = 0; Step < 1800; ++Step)
    {
        Crowd.Tick(0.1f);
        int32 Active = 0;
        for (const FFlowFestCrowdAgent& Agent : Crowd.GetAgents())
            if (Agent.ReservedPerformanceSlot != INDEX_NONE)
            { ++Active; EverActive.Add(Agent.PerformerOrdinal); }
        TestTrue(TEXT("No more than two reserved fire slots"), Active <= 2);
    }
    TestEqual(TEXT("Every dancer receives a turn"), EverActive.Num(), 5);
    for (int32 I = 0; I < 3; ++I)
        TestTrue(TEXT("Gate host remains at gate duty"), Crowd.GetAgents()[I].DesiredActivity == EFlowFestCrowdActivity::Gate);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestCrowdFoodBeforeFireTest, "FlowFest.Crowd.FoodBeforeFireReservation",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowFestCrowdFoodBeforeFireTest::RunTest(const FString& Parameters)
{
    TMap<FString, FVector2D> Landmarks;
    Landmarks.Add(TEXT("gate"), FVector2D(0.f, 0.f));
    Landmarks.Add(TEXT("camp-lower"), FVector2D(20.f, 0.f));
    Landmarks.Add(TEXT("camp-upper"), FVector2D(25.f, 0.f));
    Landmarks.Add(TEXT("camp-car"), FVector2D(30.f, 0.f));
    Landmarks.Add(TEXT("workshop"), FVector2D(45.f, 0.f));
    Landmarks.Add(TEXT("food"), FVector2D(50.f, 0.f));
    Landmarks.Add(TEXT("fire"), FVector2D(60.f, 0.f));
    TArray<TArray<FVector2D>> Roads;
    Roads.Add({FVector2D(0.f, 0.f), FVector2D(60.f, 0.f)});
    FFlowFestCrowd Crowd;
    Crowd.Initialize(Landmarks, Roads, 23.f);
    FFlowFestCrowdSnapshot Setup = Crowd.CaptureSnapshot();
    FFlowFestCrowdAgent& HungryPerformer = Setup.Agents[4];
    HungryPerformer.Position = FVector2D(20.f, 0.f);
    HungryPerformer.Route.Reset(); HungryPerformer.RouteIndex = 0;
    HungryPerformer.GoalAnchorId.Reset(); HungryPerformer.DestinationId.Reset();
    HungryPerformer.ActionUntil = 0.f; HungryPerformer.bActionStarted = false;
    HungryPerformer.Needs.Hunger = 0.95f;
    HungryPerformer.Needs.Fatigue = HungryPerformer.Needs.Social = HungryPerformer.Needs.Practice = 0.f;
    TestTrue(TEXT("Hungry camper setup accepted"), Crowd.RestoreSnapshot(Setup));
    Crowd.Tick(0.1f);
    TestTrue(TEXT("Distant hungry performer first travels to food"),
        Crowd.GetAgents()[4].DesiredActivity == EFlowFestCrowdActivity::Food);
    TestEqual(TEXT("Distant hungry performer holds no fire slot"), Crowd.GetAgents()[4].ReservedPerformanceSlot,
        INDEX_NONE);
    bool bFoodCompleted = false;
    for (int32 Step = 0; Step < 1200 && !bFoodCompleted; ++Step)
    {
        Crowd.Tick(0.1f);
        const FFlowFestCrowdAgent& Agent = Crowd.GetAgents()[4];
        if (Agent.DesiredActivity == EFlowFestCrowdActivity::Food)
            TestEqual(TEXT("Food trip never steals a fire slot"), Agent.ReservedPerformanceSlot, INDEX_NONE);
        bFoodCompleted = Agent.Needs.Hunger < 0.5f;
    }
    TestTrue(TEXT("Distant camper completes food before fire queue"), bFoodCompleted);
    return true;
}
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestCrowdIntentTest, "FlowFest.Crowd.NeedsGoalsAndSave",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowFestCrowdIntentTest::RunTest(const FString& Parameters)
{
    TMap<FString, FVector2D> Landmarks;
    Landmarks.Add(TEXT("gate"), FVector2D(0.f, 0.f));
    Landmarks.Add(TEXT("parking"), FVector2D(10.f, 0.f));
    Landmarks.Add(TEXT("camp-lower"), FVector2D(20.f, 0.f));
    Landmarks.Add(TEXT("camp-upper"), FVector2D(25.f, 0.f));
    Landmarks.Add(TEXT("camp-car"), FVector2D(30.f, 0.f));
    Landmarks.Add(TEXT("workshop"), FVector2D(45.f, 0.f));
    Landmarks.Add(TEXT("food"), FVector2D(50.f, 0.f));
    Landmarks.Add(TEXT("fire"), FVector2D(60.f, 0.f));
    TArray<TArray<FVector2D>> Roads;
    Roads.Add({FVector2D(0.f, 0.f), FVector2D(60.f, 0.f)});
    FFlowFestCrowd Crowd;
    Crowd.Initialize(Landmarks, Roads, 17.f);
    FFlowFestCrowdSnapshot Forced = Crowd.CaptureSnapshot();
    FFlowFestCrowdAgent& Guest = Forced.Agents[7];
    Guest.Needs.Hunger = 0.95f;
    Guest.Needs.Fatigue = 0.05f;
    Guest.Needs.Social = 0.05f;
    Guest.Needs.Practice = 0.05f;
    Guest.ActionUntil = 0.f;
    Guest.GoalAnchorId.Reset();
    TestTrue(TEXT("Valid runtime snapshot accepted"), Crowd.RestoreSnapshot(Forced));
    Crowd.Tick(0.1f);
    const FFlowFestCrowdAgent& GoingToFood = Crowd.GetAgents()[7];
    TestTrue(TEXT("Hunger chooses food"), GoingToFood.DesiredActivity == EFlowFestCrowdActivity::Food);
    TestEqual(TEXT("Food has a real anchor"), GoingToFood.GoalAnchorId, FString(TEXT("food")));
    TestTrue(TEXT("Guest owns equipment"), GoingToFood.HasEquipment());
    TestTrue(TEXT("Guest carries equipment until reaching food"), GoingToFood.bPropInHands);
    TestTrue(TEXT("Travel is observable"), GoingToFood.Activity == EFlowFestCrowdActivity::Travel);

    const FString Saved = Crowd.SerializeState();
    FFlowFestCrowd Restored;
    Restored.Initialize(Landmarks, Roads, 17.f);
    TestTrue(TEXT("Save string restores"), Restored.RestoreState(Saved));
    Crowd.Tick(0.1f);
    Restored.Tick(0.1f);
    const FFlowFestCrowdAgent& A = Crowd.GetAgents()[7];
    const FFlowFestCrowdAgent& B = Restored.GetAgents()[7];
    TestTrue(TEXT("Route progress remains deterministic"), A.Position.Equals(B.Position, 0.001f));
    TestEqual(TEXT("Goal remains deterministic"), A.GoalAnchorId, B.GoalAnchorId);
    TestTrue(TEXT("Need remains deterministic"), FMath::IsNearlyEqual(A.Needs.Hunger, B.Needs.Hunger, 0.0001f));

    FFlowFestCrowdSnapshot Completing = Crowd.CaptureSnapshot();
    FFlowFestCrowdAgent& Eating = Completing.Agents[7];
    Eating.Position = Eating.Destination;
    Eating.Route.Reset();
    Eating.RouteIndex = 0;
    Eating.ActionUntil = 0.f;
    Eating.bActionStarted = true;
    const float HungerBefore = Eating.Needs.Hunger;
    TestTrue(TEXT("Completion setup accepted"), Crowd.RestoreSnapshot(Completing));
    Crowd.Tick(0.1f);
    TestTrue(TEXT("Eating recovers hunger"), Crowd.GetAgents()[7].Needs.Hunger < HungerBefore - 0.5f);
    TestTrue(TEXT("Completed action counted"), Crowd.GetAgents()[7].CompletedActions > Eating.CompletedActions);

    FFlowFestCrowd NoFood;
    Landmarks.Remove(TEXT("food"));
    NoFood.Initialize(Landmarks, Roads, 17.f);
    FFlowFestCrowdSnapshot Fallback = NoFood.CaptureSnapshot();
    Fallback.Agents[7].Needs.Hunger = 0.95f;
    Fallback.Agents[7].Needs.Fatigue = 0.05f;
    Fallback.Agents[7].ActionUntil = 0.f;
    Fallback.Agents[7].GoalAnchorId.Reset();
    NoFood.RestoreSnapshot(Fallback);
    NoFood.Tick(0.1f);
    TestEqual(TEXT("Missing stall uses home provisions"), NoFood.GetAgents()[7].GoalAnchorId, NoFood.GetAgents()[7].HomeId);

    Landmarks.Add(TEXT("food"), FVector2D(300.f, 300.f));
    FFlowFestCrowd Disconnected;
    Disconnected.Initialize(Landmarks, Roads, 17.f);
    FFlowFestCrowdSnapshot Blocked = Disconnected.CaptureSnapshot();
    Blocked.Agents[7].Needs.Hunger = 0.95f;
    Blocked.Agents[7].Needs.Fatigue = 0.05f;
    Blocked.Agents[7].ActionUntil = 0.f;
    Blocked.Agents[7].GoalAnchorId.Reset();
    Disconnected.RestoreSnapshot(Blocked);
    Disconnected.Tick(0.1f);
    TestEqual(TEXT("Unreachable stall falls back to camp food"), Disconnected.GetAgents()[7].GoalAnchorId,
        Disconnected.GetAgents()[7].HomeId);
    TestTrue(TEXT("Fallback still satisfies food intent"), Disconnected.GetAgents()[7].DesiredActivity ==
        EFlowFestCrowdActivity::Food);

    FFlowFestCrowdSnapshot NoPath = Disconnected.CaptureSnapshot();
    NoPath.Agents[7].Position = FVector2D(500.f, 500.f);
    NoPath.Agents[7].ActionUntil = 0.f;
    NoPath.Agents[7].GoalAnchorId.Reset();
    Disconnected.RestoreSnapshot(NoPath);
    Disconnected.Tick(0.1f);
    TestTrue(TEXT("No reachable action settles idle"), Disconnected.GetAgents()[7].Activity == EFlowFestCrowdActivity::Idle);
    TestTrue(TEXT("No path remains inspectable"), Disconnected.GetAgents()[7].GoalReason.StartsWith(TEXT("unreachable")));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestCrowdGreetingTest, "FlowFest.Crowd.GreetingAndPracticeSpace",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowFestCrowdGreetingTest::RunTest(const FString& Parameters)
{
    TMap<FString, FVector2D> Landmarks;
    Landmarks.Add(TEXT("gate"), FVector2D(0.f, 0.f));
    Landmarks.Add(TEXT("camp-lower"), FVector2D(20.f, 0.f));
    Landmarks.Add(TEXT("camp-upper"), FVector2D(25.f, 0.f));
    Landmarks.Add(TEXT("camp-car"), FVector2D(30.f, 0.f));
    Landmarks.Add(TEXT("workshop"), FVector2D(45.f, 0.f));
    Landmarks.Add(TEXT("fire"), FVector2D(60.f, 0.f));
    TArray<TArray<FVector2D>> Roads;
    Roads.Add({FVector2D(0.f, 0.f), FVector2D(60.f, 0.f)});
    FFlowFestCrowd Crowd;
    Crowd.Initialize(Landmarks, Roads, 19.f);
    FFlowFestCrowdSnapshot Setup = Crowd.CaptureSnapshot();
    for (int32 I = 0; I < Setup.Agents.Num(); ++I)
    {
        FFlowFestCrowdAgent& Agent = Setup.Agents[I];
        Agent.Needs.Hunger = 0.f;
        Agent.Needs.Fatigue = 0.f;
        Agent.Needs.Social = 0.f;
        Agent.Needs.Practice = 0.9f;
        Agent.GoalAnchorId.Reset();
        Agent.ActionUntil = 0.f;
        if (I != 7) Agent.Position = FVector2D(-100.f - I * 5.f, -100.f);
    }
    FFlowFestCrowdAgent& Guest = Setup.Agents[7];
    Guest.Position = FVector2D(45.f, 10.f);
    Guest.Destination = Guest.Position;
    Guest.Route.Reset();
    Guest.RouteIndex = 0;
    Guest.Activity = EFlowFestCrowdActivity::Practice;
    Guest.DesiredActivity = EFlowFestCrowdActivity::Practice;
    Guest.GoalAnchorId = TEXT("workshop");
    Guest.GoalReason = TEXT("practice with personal prop");
    Guest.ActionUntil = 100.f;
    Guest.bActionStarted = true;
    Guest.Needs.Social = 0.8f;
    Guest.Facing = 0.f;
    const FVector2D GuestPosition = Guest.Position;
    const FString GuestDestinationId = Guest.DestinationId;
    TestTrue(TEXT("Greeting setup accepted"), Crowd.RestoreSnapshot(Setup));
    FString Reply;
    TestTrue(TEXT("Nearby settled visitor responds"), Crowd.GreetNearby(GuestPosition + FVector2D(1.f, 0.f), Reply));
    TestTrue(TEXT("Reply names attendee"), Reply.Contains(Guest.Name));
    TestTrue(TEXT("Reply explains purpose"), Reply.Contains(TEXT("practicing")));
    TestTrue(TEXT("Greeting reduces social need"), Crowd.GetAgents()[7].Needs.Social < 0.6f);
    TestEqual(TEXT("Greeting leaves goal intact"), Crowd.GetAgents()[7].DestinationId, GuestDestinationId);
    TestFalse(TEXT("Greeting cooldown prevents repeated need reduction"),
        Crowd.GreetNearby(GuestPosition + FVector2D(1.f, 0.f), Reply));
    const FString Saved = Crowd.SerializeState();
    FFlowFestCrowd Restored;
    Restored.Initialize(Landmarks, Roads, 19.f);
    TestTrue(TEXT("Greeting state round trips"), Restored.RestoreState(Saved));
    TestTrue(TEXT("Greeting cooldown persists"), Restored.GetAgents()[7].NextGreetAt > 10.f);
    FFlowFestCrowdSnapshot Busy = Restored.CaptureSnapshot();
    Busy.Agents[7].NextGreetAt = 0.f;
    Busy.Agents[7].Activity = EFlowFestCrowdActivity::Travel;
    Restored.RestoreSnapshot(Busy);
    TestFalse(TEXT("Walking attendee does not stop for greeting"), Restored.GreetNearby(GuestPosition, Reply));
    Busy.Agents[7].Activity = EFlowFestCrowdActivity::Perform;
    Restored.RestoreSnapshot(Busy);
    TestFalse(TEXT("Performing attendee keeps their turn"), Restored.GreetNearby(GuestPosition, Reply));
    Crowd.Tick(0.1f);
    TestTrue(TEXT("Greeting faces the player briefly"), FMath::Abs(Crowd.GetAgents()[7].Facing) < 0.01f);
    Crowd.Tick(3.2f);
    TestTrue(TEXT("Attendee keeps practicing after greeting"),
        Crowd.GetAgents()[7].DesiredActivity == EFlowFestCrowdActivity::Practice);
    TestTrue(TEXT("Greeting never moves attendee"), Crowd.GetAgents()[7].Position.Equals(GuestPosition, 0.001f));
    TestTrue(TEXT("Facing resumes workshop intent"),
        FMath::Abs(FMath::FindDeltaAngleDegrees(Crowd.GetAgents()[7].Facing, -90.f)) < 89.f);

    FFlowFestCrowd PracticeCrowd;
    PracticeCrowd.Initialize(Landmarks, Roads, 19.f);
    FFlowFestCrowdSnapshot PracticeSetup = PracticeCrowd.CaptureSnapshot();
    for (FFlowFestCrowdAgent& Agent : PracticeSetup.Agents)
    {
        Agent.Needs.Hunger = 0.f;
        Agent.Needs.Fatigue = 0.f;
        Agent.Needs.Social = 0.f;
        Agent.Needs.Practice = 0.9f;
        Agent.GoalAnchorId.Reset();
        Agent.ActionUntil = 0.f;
    }
    PracticeCrowd.RestoreSnapshot(PracticeSetup);
    PracticeCrowd.Tick(0.1f);
    const TArray<FFlowFestCrowdAgent>& Practitioners = PracticeCrowd.GetAgents();
    for (int32 I = 0; I < Practitioners.Num(); ++I)
        if (Practitioners[I].DesiredActivity == EFlowFestCrowdActivity::Practice)
            for (int32 J = I + 1; J < Practitioners.Num(); ++J)
                if (Practitioners[J].DesiredActivity == EFlowFestCrowdActivity::Practice)
                    TestTrue(TEXT("Practice stations leave room for hand props"),
                        FVector2D::Distance(Practitioners[I].Destination, Practitioners[J].Destination) > 2.4f);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestCrowdSharedStopsTest, "FlowFest.Crowd.SharedStopsAndEveningMix",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowFestCrowdSharedStopsTest::RunTest(const FString& Parameters)
{
    TMap<FString, FVector2D> Landmarks;
    Landmarks.Add(TEXT("gate"), FVector2D(0.f, 0.f));
    Landmarks.Add(TEXT("camp-lower"), FVector2D(20.f, 0.f));
    Landmarks.Add(TEXT("camp-upper"), FVector2D(25.f, 0.f));
    Landmarks.Add(TEXT("camp-car"), FVector2D(30.f, 0.f));
    Landmarks.Add(TEXT("workshop"), FVector2D(45.f, 0.f));
    Landmarks.Add(TEXT("food"), FVector2D(50.f, 0.f));
    Landmarks.Add(TEXT("fire"), FVector2D(60.f, 0.f));
    TArray<TArray<FVector2D>> Roads;
    Roads.Add({FVector2D(0.f, 0.f), FVector2D(60.f, 0.f)});
    FFlowFestCrowd Crowd;
    Crowd.Initialize(Landmarks, Roads, 22.f);
    int32 PairCount = 0;
    int32 PairA = INDEX_NONE, PairB = INDEX_NONE;
    for (int32 I = 0; I < Crowd.GetAgents().Num(); ++I)
    {
        const FFlowFestCrowdAgent& Agent = Crowd.GetAgents()[I];
        if (Agent.PartnerId.IsEmpty()) continue;
        int32 Partner = INDEX_NONE;
        for (int32 J = 0; J < Crowd.GetAgents().Num(); ++J)
            if (Crowd.GetAgents()[J].Id == Agent.PartnerId) { Partner = J; break; }
        TestTrue(TEXT("Social partner exists"), Partner != INDEX_NONE);
        if (Partner == INDEX_NONE) continue;
        TestEqual(TEXT("Social choice is reciprocal"), Crowd.GetAgents()[Partner].PartnerId, Agent.Id);
        TestTrue(TEXT("Gate staff never pulled into a social stop"), Agent.Role != 0 && Crowd.GetAgents()[Partner].Role != 0);
        TestEqual(TEXT("Pair shares a reachable home anchor"), Agent.GoalAnchorId, Crowd.GetAgents()[Partner].GoalAnchorId);
        if (I < Partner)
        {
            ++PairCount;
            PairA = I; PairB = Partner;
            TestTrue(TEXT("Paired visitors have distinct personal standing positions"),
                FVector2D::Distance(Agent.Destination, Crowd.GetAgents()[Partner].Destination) > 1.4f);
        }
    }
    TestTrue(TEXT("Evening includes real social pairs"), PairCount >= 2);
    const FString Saved = Crowd.SerializeState();
    FFlowFestCrowd Restored;
    Restored.Initialize(Landmarks, Roads, 22.f);
    TestTrue(TEXT("Reciprocal partners survive save and restore"), Restored.RestoreState(Saved));
    FFlowFestCrowdSnapshot Broken = Restored.CaptureSnapshot();
    if (PairA != INDEX_NONE)
    {
        Broken.Agents[PairA].PartnerId = TEXT("flow-fest-npc-00");
        TestFalse(TEXT("One-sided saved pairing is rejected"), Restored.RestoreSnapshot(Broken));
    }
    TSet<EFlowFestCrowdActivity> Seen;
    int32 MaxSlots = 0;
    for (int32 Step = 0; Step < 200; ++Step)
    {
        Crowd.Tick(0.1f); // 20 seconds of action time, ten simulated festival minutes.
        int32 Slots = 0;
        for (const FFlowFestCrowdAgent& Agent : Crowd.GetAgents())
        {
            Seen.Add(Agent.Activity);
            if (Agent.ReservedPerformanceSlot != INDEX_NONE) ++Slots;
        }
        MaxSlots = FMath::Max(MaxSlots, Slots);
    }
    for (EFlowFestCrowdActivity Activity : { EFlowFestCrowdActivity::Food, EFlowFestCrowdActivity::Rest,
            EFlowFestCrowdActivity::Practice, EFlowFestCrowdActivity::Watch,
            EFlowFestCrowdActivity::Social, EFlowFestCrowdActivity::Perform })
        TestTrue(*FString::Printf(TEXT("Ten-minute evening has %s"), FFlowFestCrowd::ActivityLabel(Activity)), Seen.Contains(Activity));
    TestEqual(TEXT("Both fire turns can be reserved while other activities continue"), MaxSlots, 2);
    if (PairA != INDEX_NONE && PairB != INDEX_NONE)
    {
        FFlowFestCrowd Arrival;
        Arrival.Initialize(Landmarks, Roads, 22.f);
        FFlowFestCrowdSnapshot Setup = Arrival.CaptureSnapshot();
        FFlowFestCrowdAgent& A = Setup.Agents[PairA];
        FFlowFestCrowdAgent& B = Setup.Agents[PairB];
        A.Position = FVector2D(30.f, 0.f); B.Position = FVector2D(0.f, 0.f);
        for (FFlowFestCrowdAgent* Guest : { &A, &B })
        {
            Guest->GoalAnchorId.Reset(); Guest->DestinationId.Reset();
            Guest->Route.Reset(); Guest->RouteIndex = 0;
            Guest->bActionStarted = false; Guest->ActionUntil = 0.f;
            Guest->Needs.Hunger = Guest->Needs.Fatigue = 0.f;
            Guest->Needs.Social = 0.9f;
        }
        TestTrue(TEXT("Separated pair setup restores"), Arrival.RestoreSnapshot(Setup));
        Arrival.Tick(0.1f);
        TestFalse(TEXT("First arrival waits for partner before shared dwell"), Arrival.GetAgents()[PairA].bActionStarted);
        for (int32 Step = 0; Step < 500 && !Arrival.GetAgents()[PairB].bActionStarted; ++Step) Arrival.Tick(0.1f);
        TestTrue(TEXT("Both visitors arrive before meeting starts"), Arrival.GetAgents()[PairA].bActionStarted &&
            Arrival.GetAgents()[PairB].bActionStarted);
        if (Arrival.GetAgents()[PairA].bActionStarted && Arrival.GetAgents()[PairB].bActionStarted)
        {
            TestEqual(TEXT("Both visitors share one meeting end time"),
                Arrival.GetAgents()[PairA].ActionUntil, Arrival.GetAgents()[PairB].ActionUntil);
            for (int32 Step = 0; Step < 20; ++Step) Arrival.Tick(0.1f);
            const FFlowFestCrowdAgent& MetA = Arrival.GetAgents()[PairA];
            const FFlowFestCrowdAgent& MetB = Arrival.GetAgents()[PairB];
            TestTrue(TEXT("Meeting holds nearby face-to-face positions"),
                FVector2D::Distance(MetA.Position, MetB.Position) < 2.2f);
            const float BearingA = FMath::RadiansToDegrees(FMath::Atan2(
                MetB.Position.Y - MetA.Position.Y, MetB.Position.X - MetA.Position.X));
            const float BearingB = FMath::RadiansToDegrees(FMath::Atan2(
                MetA.Position.Y - MetB.Position.Y, MetA.Position.X - MetB.Position.X));
            TestTrue(TEXT("First visitor faces partner"), FMath::Abs(FMath::FindDeltaAngleDegrees(MetA.Facing, BearingA)) < 20.f);
            TestTrue(TEXT("Second visitor faces partner"), FMath::Abs(FMath::FindDeltaAngleDegrees(MetB.Facing, BearingB)) < 20.f);
        }
        FFlowFestCrowdSnapshot Hungry = Arrival.CaptureSnapshot();
        Hungry.Agents[PairA].Needs.Hunger = 0.95f;
        TestTrue(TEXT("Hungry pair setup restores"), Arrival.RestoreSnapshot(Hungry));
        Arrival.Tick(0.1f);
        TestTrue(TEXT("Hunger takes priority over social commitment"),
            Arrival.GetAgents()[PairA].DesiredActivity == EFlowFestCrowdActivity::Food);
        TestTrue(TEXT("Former partner does not continue a one-sided meeting"),
            Arrival.GetAgents()[PairB].DesiredActivity != EFlowFestCrowdActivity::Social);
    }
    return true;
}
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestCrowdReinitializeTest, "FlowFest.Crowd.ReinitializeAfterTime",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowFestCrowdReinitializeTest::RunTest(const FString& Parameters)
{
    TMap<FString, FVector2D> Landmarks;
    Landmarks.Add(TEXT("gate"), FVector2D(0.f, 0.f));
    Landmarks.Add(TEXT("camp-lower"), FVector2D(20.f, 0.f));
    Landmarks.Add(TEXT("camp-upper"), FVector2D(25.f, 0.f));
    Landmarks.Add(TEXT("camp-car"), FVector2D(30.f, 0.f));
    Landmarks.Add(TEXT("workshop"), FVector2D(45.f, 0.f));
    Landmarks.Add(TEXT("food"), FVector2D(47.f, 0.f));
    Landmarks.Add(TEXT("fire"), FVector2D(60.f, 0.f));
    TArray<TArray<FVector2D>> Roads;
    Roads.Add({ FVector2D(0.f, 0.f), FVector2D(60.f, 0.f) });

    FFlowFestCrowd Reused;
    Reused.Initialize(Landmarks, Roads, 17.f);
    Reused.SetPlayerPresence(FVector2D(60.f, 0.f), true, true);
    Reused.Tick(90.f);
    TestTrue(TEXT("Old journey advanced before reset"), Reused.CaptureSnapshot().ElapsedSeconds > 0.5f);

    Reused.Initialize(Landmarks, Roads, 17.f);
    Reused.SetTimeOfDay(23.f);
    const FFlowFestCrowdSnapshot Reset = Reused.CaptureSnapshot();
    TestEqual(TEXT("New journey starts at zero elapsed time"), Reset.ElapsedSeconds, 0.f);
    TestEqual(TEXT("New journey clears player position"), Reset.PlayerPosition, FVector2D::ZeroVector);
    TestFalse(TEXT("New journey clears fire presence"), Reset.bPlayerAtFire);
    TestFalse(TEXT("New journey clears joining presence"), Reset.bPlayerJoining);
    for (const FFlowFestCrowdAgent& Agent : Reset.Agents)
    {
        TestTrue(TEXT("Selected time reconstructs each attendee at its goal"),
            Agent.Position.Equals(Agent.Destination, KINDA_SMALL_NUMBER));
        TestEqual(TEXT("Selected time has no stale travel route"), Agent.Route.Num(), 0);
        TestFalse(TEXT("Selected time has no stale player joining flag"), Agent.bPlayerJoining);
    }

    FFlowFestCrowd Fresh;
    Fresh.Initialize(Landmarks, Roads, 17.f);
    Fresh.SetTimeOfDay(23.f);
    TestEqual(TEXT("Reused crowd matches fresh selected-time state"),
        Reused.SerializeState(), Fresh.SerializeState());
    return true;
}
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestActivityPhaseTest, "FlowFest.Crowd.ActivityPosePhases",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowFestActivityPhaseTest::RunTest(const FString& Parameters)
{
    FFlowFestActivityPoseRequest Rest;
    Rest.Activity = EFlowFestBodyActivity::FloorRest;
    Rest.Weight = 1.f;
    TestEqual(TEXT("Rest begins standing"), FFlowFestActivityPose::SeatedWeight(Rest), 0.f);
    Rest.ElapsedSeconds = FFlowFestActivityPose::RestDescentSeconds;
    TestEqual(TEXT("Rest reaches seated pose"), FFlowFestActivityPose::SeatedWeight(Rest), 1.f);
    Rest.ExitSecondsRemaining = FFlowFestActivityPose::RestRiseSeconds * .5f;
    TestTrue(TEXT("Rest rises before walking"), FFlowFestActivityPose::SeatedWeight(Rest) > 0.f &&
        FFlowFestActivityPose::SeatedWeight(Rest) < 1.f);
    Rest.ExitSecondsRemaining = 0.f;
    TestEqual(TEXT("Rest has stood before route resumes"), FFlowFestActivityPose::SeatedWeight(Rest), 0.f);
    TestEqual(TEXT("Scoop starts at bowl"), FFlowFestActivityPose::BiteWeight(0.f), 0.f);
    TestEqual(TEXT("Food reaches mouth"), FFlowFestActivityPose::BiteWeight(2.2f), 1.f);
    TestEqual(TEXT("Food returns to bowl"), FFlowFestActivityPose::BiteWeight(4.f), 0.f);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestRestDepartureTest, "FlowFest.Crowd.RestStandsBeforeTravel",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowFestRestDepartureTest::RunTest(const FString& Parameters)
{
    TMap<FString, FVector2D> Landmarks;
    Landmarks.Add(TEXT("gate"), FVector2D(0.f, 0.f));
    Landmarks.Add(TEXT("parking"), FVector2D(10.f, 0.f));
    Landmarks.Add(TEXT("camp-lower"), FVector2D(20.f, 0.f));
    Landmarks.Add(TEXT("camp-upper"), FVector2D(25.f, 0.f));
    Landmarks.Add(TEXT("camp-car"), FVector2D(30.f, 0.f));
    Landmarks.Add(TEXT("workshop"), FVector2D(45.f, 0.f));
    Landmarks.Add(TEXT("food"), FVector2D(47.f, 0.f));
    Landmarks.Add(TEXT("fire"), FVector2D(60.f, 0.f));
    TArray<TArray<FVector2D>> Roads;
    Roads.Add({FVector2D(0.f, 0.f), FVector2D(60.f, 0.f)});
    FFlowFestCrowd Crowd;
    Crowd.Initialize(Landmarks, Roads, 17.f);
    FFlowFestCrowdSnapshot Saved = Crowd.CaptureSnapshot();
    FFlowFestCrowdAgent& Resting = Saved.Agents[3];
    Resting.Position = FVector2D(20.f, 0.f);
    Resting.Destination = Resting.Position;
    Resting.Route.Reset();
    Resting.RouteIndex = 0;
    Resting.Activity = EFlowFestCrowdActivity::Rest;
    Resting.DesiredActivity = EFlowFestCrowdActivity::Rest;
    Resting.GoalAnchorId = Resting.HomeId;
    Resting.DestinationId = Resting.HomeId + TEXT(":9:-1");
    Resting.bActionStarted = true;
    Resting.ActionStartedAt = 0.f;
    Resting.ActionUntil = 0.f;
    Resting.Needs.Hunger = 1.f;
    Resting.Needs.Fatigue = 0.f;
    Resting.Needs.Social = Resting.Needs.Practice = 0.f;
    TestTrue(TEXT("Rest fixture restores"), Crowd.RestoreSnapshot(Saved));
    Crowd.Tick(.1f);
    const FFlowFestCrowdAgent& Starting = Crowd.GetAgents()[3];
    TestEqual(TEXT("Next intent becomes food"), Starting.DesiredActivity, EFlowFestCrowdActivity::Food);
    TestEqual(TEXT("Body remains at rest during rise"), Starting.Activity, EFlowFestCrowdActivity::Rest);
    TestFalse(TEXT("Equipment stays stowed during the rise"), Starting.bPropInHands);
    TestTrue(TEXT("Route exists but does not advance"), Starting.Route.Num() > 0 &&
        Starting.Position.Equals(FVector2D(20.f, 0.f), KINDA_SMALL_NUMBER));
    TestTrue(TEXT("Stand phase persists through save"), Crowd.SerializeState().Contains(TEXT("standUntil")));
    for (int32 I = 0; I < 12; ++I) Crowd.Tick(.1f);
    TestEqual(TEXT("Walk begins after stand"), Crowd.GetAgents()[3].Activity, EFlowFestCrowdActivity::Travel);
    TestTrue(TEXT("Equipment is carried on the way to food"), Crowd.GetAgents()[3].bPropInHands);
    FFlowFestCrowdSnapshot Eating = Crowd.CaptureSnapshot();
    FFlowFestCrowdAgent& AtFood = Eating.Agents[3];
    AtFood.Position = AtFood.Destination;
    AtFood.RouteIndex = AtFood.Route.Num();
    AtFood.Activity = EFlowFestCrowdActivity::Food;
    AtFood.bActionStarted = true;
    AtFood.ActionUntil = Eating.ElapsedSeconds + 10.f;
    TestTrue(TEXT("Food fixture restores"), Crowd.RestoreSnapshot(Eating));
    Crowd.Tick(.1f);
    TestFalse(TEXT("Equipment is stowed for the meal"), Crowd.GetAgents()[3].bPropInHands);
    FFlowFestCrowdSnapshot Queuing = Crowd.CaptureSnapshot();
    FFlowFestCrowdAgent& AtQueue = Queuing.Agents[3];
    AtQueue.Activity = AtQueue.DesiredActivity = EFlowFestCrowdActivity::Queue;
    AtQueue.GoalAnchorId = TEXT("fire");
    AtQueue.Needs.Hunger = AtQueue.Needs.Fatigue = 0.f;
    AtQueue.ActionUntil = Queuing.ElapsedSeconds + 10.f;
    TestTrue(TEXT("Queue fixture restores"), Crowd.RestoreSnapshot(Queuing));
    Crowd.Tick(.1f);
    TestTrue(TEXT("Queued performer keeps equipment in hand"), Crowd.GetAgents()[3].bPropInHands);
    return true;
}
#endif
