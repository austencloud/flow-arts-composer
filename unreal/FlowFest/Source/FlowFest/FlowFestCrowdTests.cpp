#include "FlowFestCrowd.h"
#include "FlowFestAvatarComponent.h"

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
            TestTrue(TEXT("Fire dancer has a corridor route"), Agent.Route.Num() > 2);
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
    for (int32 Rotation = 0; Rotation < 5; ++Rotation)
    {
        int32 Active = 0;
        for (const FFlowFestCrowdAgent& Agent : Crowd.GetAgents())
            if (Agent.DesiredActivity == EFlowFestCrowdActivity::Perform)
            { ++Active; EverActive.Add(Agent.PerformerOrdinal); }
        TestEqual(TEXT("Exactly two assigned fire slots"), Active, 2);
        const FVector2D Before = Crowd.GetAgents()[4].Position;
        Crowd.Tick(24.f);
        TestTrue(TEXT("A schedule update does not teleport"), FVector2D::Distance(Before, Crowd.GetAgents()[4].Position) < 0.2f);
    }
    TestEqual(TEXT("Every dancer receives a turn"), EverActive.Num(), 5);
    return true;
}
#endif
