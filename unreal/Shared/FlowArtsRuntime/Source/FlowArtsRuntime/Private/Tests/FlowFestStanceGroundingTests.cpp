#if WITH_DEV_AUTOMATION_TESTS
#include "FlowFestStancePlan.h"
#include "Misc/AutomationTest.h"
#include <limits>

namespace
{
FFlowFestStancePose GroundingPose()
{
    FFlowFestStancePose P;
    P.Hips=0; P.Components.Add(FTransform(FVector(0,0,90))); P.Parents.Add(INDEX_NONE);
    for (int32 Chain=0; Chain<4; ++Chain)
    {
        const double Sign=Chain%2 ? 1. : -1.;
        const FVector Points[3]={Chain<2 ? FVector(0,Sign*10,90) : FVector(0,Sign*20,140),
            Chain<2 ? FVector(10,Sign*10,50) : FVector(10,Sign*35,115),
            Chain<2 ? FVector(0,Sign*10,10) : FVector(35,Sign*20,105)};
        P.Upper[Chain]=P.Components.Num(); P.Middle[Chain]=P.Upper[Chain]+1; P.End[Chain]=P.Upper[Chain]+2;
        for (int32 Joint=0; Joint<3; ++Joint)
        {
            P.Components.Add(FTransform(Points[Joint]));
            P.Parents.Add(Joint ? P.Upper[Chain]+Joint-1 : 0);
        }
    }
    return P;
}

FFlowFestStancePlan GroundingPlan(const FFlowFestStancePose& Pose)
{
    FFlowFestStancePlan P;
    P.Duration=5.; P.HipPivot=Pose.Components[Pose.Hips].GetLocation(); P.bGroundValidated=true;
    P.Controls.StartSeconds=1.; P.Controls.ReturnSeconds=3.; P.Controls.HeadingDegrees=90.;
    P.Controls.HipTranslationCm=FVector(20,10,0);
    for (int32 Side=0; Side<2; ++Side)
    {
        P.InitialFeet[Side]=Pose.Components[Pose.End[Side]]; P.FootSoleOffsetCm[Side]=10.;
    }
    for (int32 Direction=0; Direction<2; ++Direction)
    {
        auto& Turn=Direction ? P.Return : P.Outward;
        Turn.Duration=1.; Turn.HeadingDegrees=Direction ? -90. : 90.;
        Turn.SwingStart[0]=.05; Turn.SwingEnd[0]=.45; Turn.SwingStart[1]=.55; Turn.SwingEnd[1]=.95;
        for (int32 Index=0; Index<3; ++Index)
        {
            FFlowFestStanceTurnFrame Frame;
            Frame.Seconds=Index*.5; Frame.Hips=FTransform(P.HipPivot);
            for (int32 Side=0; Side<2; ++Side) Frame.Feet[Side]=P.InitialFeet[Side];
            Turn.Frames.Add(Frame);
        }
    }
    return P;
}
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestStanceGroundingTest,"FlowArts.Runtime.Stance.MeasuredGrounding",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FFlowFestStanceGroundingTest::RunTest(const FString&)
{
    const auto Pose=GroundingPose();
    auto Plan=GroundingPlan(Pose);
    Plan.GroundNormal=FVector(.015,0,1).GetSafeNormal();
    const double Gaps[2]={2.035344,1.25};
    TArray<FVector> Surfaces[2];
    for (int32 Side=0; Side<2; ++Side)
    {
        for (const FVector& Offset : {FVector(-5,-2,0),FVector(5,2,0),FVector(0,0,1)})
        {
            FVector Point=Pose.Components[Pose.End[Side]].GetLocation()+Offset;
            Point+=Plan.GroundNormal*(Gaps[Side]+Offset.Z-FVector::DotProduct(Point,Plan.GroundNormal));
            Surfaces[Side].Add(Point);
        }
    }
    FString Error;
    if (!TestTrue(TEXT("Measured weighted soles accepted"),Plan.InitializeGroundedSupport(Pose,Surfaces,5.,&Error)))
    { AddError(Error); return false; }
    TestTrue(TEXT("Common body follows more lowered foot"),Plan.NeutralBodyOffsetCm.Equals(-Plan.GroundNormal*Gaps[0],1.e-8));
    TestTrue(TEXT("Grounded plan remains valid"),Plan.IsValid(&Error));
    for (int32 Side=0; Side<2; ++Side)
    {
        const FVector Probe=Plan.InitialFeet[Side].TransformPosition(Plan.FootTerrainProbesLocal[Side][4]);
        TestTrue(TEXT("Weighted sole probe reaches measured plane"),FMath::Abs(FVector::DotProduct(Probe,Plan.GroundNormal))<1.e-8);
        TestTrue(TEXT("Probe retains original foot frame"),
            Plan.FootTerrainProbesLocal[Side][4].Equals(Pose.Components[Pose.End[Side]].InverseTransformPosition(Surfaces[Side][0]),1.e-8) ||
            Plan.FootTerrainProbesLocal[Side][4].Equals(Pose.Components[Pose.End[Side]].InverseTransformPosition(Surfaces[Side][1]),1.e-8));
    }
    auto Ungrounded=Plan;
    Ungrounded.NeutralBodyOffsetCm=FVector::ZeroVector;
    for (int32 Side=0; Side<2; ++Side)
    {
        Ungrounded.InitialFeet[Side]=Pose.Components[Pose.End[Side]];
        Ungrounded.FootSoleOffsetCm[Side]=FVector::DotProduct(Ungrounded.InitialFeet[Side].GetLocation(),Plan.GroundNormal);
    }
    for (double Seconds : {0.,1.25,2.5,3.75,5.})
    {
        FFlowFestStanceSample Grounded,Original;
        if (!TestTrue(TEXT("Grounded support phase samples"),Plan.Sample(Seconds,Grounded,&Error)) ||
            !TestTrue(TEXT("Control support phase samples"),Ungrounded.Sample(Seconds,Original,&Error)))
        { AddError(Error); return false; }
        TestTrue(TEXT("Body receives one measured offset at every phase"),
            (Grounded.BodyDelta.GetLocation()-Original.BodyDelta.GetLocation()).Equals(Plan.NeutralBodyOffsetCm,1.e-8));
        for (int32 Side=0; Side<2; ++Side)
            TestTrue(TEXT("Foot receives its own correction exactly once"),
                (Grounded.Feet[Side].GetLocation()-Original.Feet[Side].GetLocation()).Equals(-Plan.GroundNormal*Gaps[Side],1.e-8));
    }
    FFlowFestStanceSample Neutral;
    Plan.Sample(0.,Neutral);
    FFlowFestStancePose Applied;
    if (!TestTrue(TEXT("Unequal grounding preserves exact leg reach"),FFlowFestStancePlan::Apply(Pose,Neutral,Applied,&Error,false)))
    { AddError(Error); return false; }
    for (int32 Side=0; Side<2; ++Side)
        TestTrue(TEXT("IK ends at grounded anchor"),Applied.Components[Pose.End[Side]].Equals(Plan.InitialFeet[Side],1.e-6));

    const auto Before=Plan;
    Surfaces[1].Add(FVector(0,0,-6));
    TestFalse(TEXT("Excess correction rejected"),Plan.InitializeGroundedSupport(Pose,Surfaces,5.,&Error));
    TestTrue(TEXT("Failure preserves both anchors and body atomically"),
        Plan.InitialFeet[0].Equals(Before.InitialFeet[0]) && Plan.InitialFeet[1].Equals(Before.InitialFeet[1]) &&
        Plan.NeutralBodyOffsetCm.Equals(Before.NeutralBodyOffsetCm));
    Surfaces[1].Last()=FVector(std::numeric_limits<double>::quiet_NaN(),0,0);
    TestFalse(TEXT("Nonfinite surface rejected"),Plan.InitializeGroundedSupport(Pose,Surfaces,5.,&Error));
    Surfaces[1].Empty();
    TestFalse(TEXT("Missing weighted surface rejected"),Plan.InitializeGroundedSupport(Pose,Surfaces,5.,&Error));
    return true;
}
#endif
