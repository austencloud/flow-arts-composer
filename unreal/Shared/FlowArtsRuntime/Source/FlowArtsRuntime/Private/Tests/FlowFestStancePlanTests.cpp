#if WITH_DEV_AUTOMATION_TESTS
#include "FlowFestStancePlan.h"
#include "Misc/AutomationTest.h"
#include "Animation/AnimNodeBase.h"
#include "Animation/AnimSequence.h"
#include "Animation/AnimationPoseData.h"
#include "Animation/Skeleton.h"
#include "BoneContainer.h"
#include "BonePose.h"
#include "Engine/SkeletalMesh.h"
#include "Misc/MemStack.h"
#include <limits>

namespace FlowFestStanceDetail
{
FVector TransitionCorePole(const FVector& Pole,const FVector& WristAxis,double Degrees,int32 Side);
void SelectJointControl(int32 RepairStart,int32 RepairEnd,int32 RejectedIndex,int32 Step,
    bool bUnanchoredStart,int32 PreferredArm,
    int32& OutSource,int32& OutDimension,double& OutDirection);
double ArmRateExcess(const FFlowArtsArmClearancePreparedSeed& A,
    const FFlowArtsArmClearancePreparedSeed& B,double Seconds);
double ArmRateMerit(const FFlowArtsArmClearancePreparedSeed& A,
    const FFlowArtsArmClearancePreparedSeed& B,double Seconds);
}

namespace
{
FFlowFestStancePlan Plan()
{
    FFlowFestStancePlan P;
    P.Duration=5.; P.HipPivot=FVector(0,0,90);
    P.InitialFeet[0]=FTransform(FVector(0,-10,10)); P.InitialFeet[1]=FTransform(FVector(0,10,10));
    P.bGroundValidated=true; P.FootSoleOffsetCm[0]=P.FootSoleOffsetCm[1]=10.;
    P.Controls.StartSeconds=1.; P.Controls.ReturnSeconds=3.;
    P.Controls.HeadingDegrees=90.; P.Controls.HipTranslationCm=FVector(20,10,0);
    for (int32 Direction=0; Direction<2; ++Direction)
    {
        auto& T=Direction ? P.Return : P.Outward;
        T.Duration=1.; T.HeadingDegrees=Direction ? -89.694 : 102.641;
        T.SwingStart[0]=.05; T.SwingEnd[0]=.45; T.SwingStart[1]=.55; T.SwingEnd[1]=.95;
        for (int32 I=0; I<=20; ++I)
        {
            FFlowFestStanceTurnFrame F; F.Seconds=I/20.; F.Hips=FTransform(P.HipPivot);
            for (int32 S=0; S<2; ++S)
            {
                const double U=FMath::Clamp((F.Seconds-T.SwingStart[S])/(T.SwingEnd[S]-T.SwingStart[S]),0.,1.);
                F.Feet[S]=P.InitialFeet[S]; F.Feet[S].AddToTranslation(FVector(3.*F.Seconds,0,8.*FMath::Sin(PI*U)));
            }
            T.Frames.Add(F);
        }
    }
    return P;
}
FFlowFestStancePose Pose()
{
    FFlowFestStancePose P; P.Hips=0; P.Components.Add(FTransform(FVector(0,0,90))); P.Parents.Add(INDEX_NONE);
    for (int32 C=0; C<4; ++C)
    {
        const double Sign=C%2 ? 1. : -1.;
        const FVector Points[3]={C<2 ? FVector(0,Sign*10,90) : FVector(0,Sign*20,140),
            C<2 ? FVector(10,Sign*10,50) : FVector(10,Sign*35,115),
            C<2 ? FVector(0,Sign*10,10) : FVector(35,Sign*20,105)};
        P.Upper[C]=P.Components.Num(); P.Middle[C]=P.Upper[C]+1; P.End[C]=P.Upper[C]+2;
        for (int32 J=0; J<3; ++J) { P.Components.Add(FTransform(Points[J])); P.Parents.Add(J ? P.Upper[C]+J-1 : 0); }
        P.Components.Add(FTransform(Points[2]+FVector(2,0,0))); P.Parents.Add(P.End[C]);
    }
    return P;
}
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestStanceSupportTest,"FlowArts.Runtime.Stance.SupportCycle",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FFlowFestStanceSupportTest::RunTest(const FString&)
{
    auto P=Plan(); TestTrue(TEXT("Measured turn plan valid"),P.IsValid());
    FFlowFestStanceSample Previous;
    for (int32 I=0; I<=1000; ++I)
    {
        FFlowFestStanceSample S, Repeat, Loop;
        const double Time=I*.005;
        if (!TestTrue(TEXT("Dense phase samples"),P.Sample(Time,S))) return false;
        TestTrue(TEXT("At least one support"),S.bSupport[0] || S.bSupport[1]);
        P.Sample(Time,Repeat); P.Sample(Time+P.Duration,Loop);
        TestTrue(TEXT("Pause is exact"),S.BodyDelta.Equals(Repeat.BodyDelta,1.e-12));
        TestTrue(TEXT("Cyclic body"),S.BodyDelta.Equals(Loop.BodyDelta,1.e-8));
        for(int32 Side=0; Side<2; ++Side)
        {
            TestTrue(TEXT("Cyclic foot"),S.Feet[Side].Equals(Loop.Feet[Side],1.e-8));
            TestTrue(TEXT("Foot origin above ground"),S.Feet[Side].GetLocation().Z>=9.999);
            if(I && S.bSupport[Side] && Previous.bSupport[Side])
                TestTrue(TEXT("Planted anchor never slides or rotates"),S.Feet[Side].Equals(Previous.Feet[Side],1.e-9));
        }
        Previous=S;
    }
    FFlowFestStanceSample Neutral; P.Sample(0.,Neutral);
    TestTrue(TEXT("Neutral activation identity"),Neutral.BodyDelta.Equals(FTransform::Identity,1.e-12));
    // A native retarget can dip its foot origin below the contact chord while
    // pitching the foot through a genuine swing. The planned foot origin stays above
    // measured ground, and the authored pitch must still be visible in flight.
    auto Dipping=Plan();
    auto& SwingFrame=Dipping.Outward.Frames[5];
    SwingFrame.Feet[0].AddToTranslation(FVector(0.,0.,-20.));
    SwingFrame.Feet[0].SetRotation(FQuat(FVector::RightVector,.4));
    FFlowFestStanceSample Swing, Plain, ContactStart, ContactEnd, PlainStart, PlainEnd;
    TestTrue(TEXT("Below-chord native swing remains supportable"),Dipping.Sample(1.25,Swing));
    TestTrue(TEXT("Reference swing samples"),P.Sample(1.25,Plain));
    TestTrue(TEXT("Dipping foot origin stays above measured ground"),
        Swing.Feet[0].GetLocation().Z>=Dipping.InitialFeet[0].GetLocation().Z-.05);
    TestTrue(TEXT("Authored swing pitch survives placement"),
        Swing.Feet[0].GetRotation().AngularDistance(Plain.Feet[0].GetRotation())>.2);
    TestTrue(TEXT("Swing begins at exact contact"),Dipping.Sample(1.05,ContactStart));
    TestTrue(TEXT("Swing ends at exact contact"),Dipping.Sample(1.45,ContactEnd));
    P.Sample(1.05,PlainStart); P.Sample(1.45,PlainEnd);
    TestTrue(TEXT("Departure contact unchanged"),ContactStart.Feet[0].Equals(PlainStart.Feet[0],1.e-9));
    TestTrue(TEXT("Landing contact unchanged"),ContactEnd.Feet[0].Equals(PlainEnd.Feet[0],1.e-9));
    P.Outward.SwingStart[1]=.2; TestFalse(TEXT("Overlapping swing rejected"),P.IsValid());
    P=Plan(); P.bGroundValidated=false; TestFalse(TEXT("Unmeasured ground rejected"),P.IsValid());
    P=Plan(); P.GroundNormal=FVector(.03,0.,FMath::Sqrt(1.-.03*.03));
    for(int32 Side=0;Side<2;++Side)
        P.FootSoleOffsetCm[Side]=FVector::DotProduct(P.InitialFeet[Side].GetLocation()-P.GroundOrigin,P.GroundNormal);
    TestTrue(TEXT("Measured shallow slope accepted"),P.IsValid());
    FFlowFestStanceSample SlopeAway, SlopeSwing;
    TestTrue(TEXT("Shallow slope destination sampled"),P.Sample(2.5,SlopeAway));
    TestTrue(TEXT("Hip excursion follows support tangent"),
        FMath::Abs(FVector::DotProduct(SlopeAway.BodyDelta.TransformPosition(P.HipPivot)-P.HipPivot,
            P.GroundNormal))<1.e-6);
    TestTrue(TEXT("Shallow slope swing sampled"),P.Sample(1.25,SlopeSwing));
    TestTrue(TEXT("Swing sole remains above support plane"),
        FVector::DotProduct(SlopeSwing.Feet[0].GetLocation()-P.GroundOrigin,P.GroundNormal)>=
            P.FootSoleOffsetCm[0]-.05);
    P=Plan(); P.GroundNormal=FVector(.1,0,.995); TestFalse(TEXT("Slope rejected"),P.IsValid());
    TArray<FFlowFestStanceSourceFrame> Frames;
    for(int32 I=0; I<12; ++I)
    {
        FFlowFestStanceSourceFrame F; F.Seconds=I*.5;
        F.Shoulders[0]=FVector(0,-20,140); F.Shoulders[1]=FVector(0,20,140);
        const bool Crossed=I<3 || I>=9;
        F.Hands[0]=FVector(20,Crossed ? 20 : -20,130); F.Hands[1]=FVector(20,Crossed ? -20 : 20,130);
        Frames.Add(F);
    }
    FFlowFestStanceControls Timing; FString Error;
    TestTrue(TEXT("Crossing interval wraps continuously"),FFlowFestStancePlan::SeedTiming(Frames,6.,1.,1.,Timing,Error));
    TestEqual(TEXT("Wrapped turn departure"),Timing.StartSeconds,4.);
    TestEqual(TEXT("Unwrapped return time"),Timing.ReturnSeconds,7.);
    Frames[5].Hands[0].Y=20.; Frames[5].Hands[1].Y=-20.;
    TestTrue(TEXT("Repeated crossing uses a bounded circular envelope"),
        FFlowFestStancePlan::SeedTiming(Frames,6.,1.,1.,Timing,Error));
    TestEqual(TEXT("Envelope starts before first crossing after longest neutral gap"),Timing.StartSeconds,4.);
    TestEqual(TEXT("Envelope closes after final crossing"),Timing.ReturnSeconds,8.5);
    for(int32 I=0; I<Frames.Num(); ++I)
    {
        const bool Crossed=(I%2)==0;
        Frames[I].Hands[0].Y=Crossed ? 20. : -20.;
        Frames[I].Hands[1].Y=Crossed ? -20. : 20.;
    }
    TestFalse(TEXT("Distributed crossings still require neutral return room"),
        FFlowFestStancePlan::SeedTiming(Frames,6.,1.,1.,Timing,Error));
    TArray<FFlowFestStanceSourceFrame> Boundary;
    for(int32 I=0; I<600; ++I)
    {
        FFlowFestStanceSourceFrame F; F.Seconds=I/100.;
        F.Shoulders[0]=FVector(0,-20,140); F.Shoulders[1]=FVector(0,20,140);
        const bool Crossed=I<470;
        F.Hands[0]=FVector(20,Crossed ? 20 : -20,130);
        F.Hands[1]=FVector(20,Crossed ? -20 : 20,130);
        Boundary.Add(F);
    }
    TestTrue(TEXT("Exactly 0.30 second neutral entry is accepted"),
        FFlowFestStancePlan::SeedTiming(Boundary,6.,1.,1.,Timing,Error));
    Boundary[470].Hands[0].Y=20.; Boundary[470].Hands[1].Y=-20.;
    TestFalse(TEXT("0.29 second neutral entry is rejected before plan validation"),
        FFlowFestStancePlan::SeedTiming(Boundary,6.,1.,1.,Timing,Error));
    TArray<FFlowFestStanceSourceFrame> Repeated;
    for(int32 I=0; I<480; ++I)
    {
        FFlowFestStanceSourceFrame F; F.Seconds=I/30.;
        F.Shoulders[0]=FVector(0,-20,140); F.Shoulders[1]=FVector(0,20,140);
        const bool Crossed=(I>=50 && I<117) || (I>=128 && I<161) ||
            (I>=290 && I<358) || (I>=368 && I<401);
        F.Hands[0]=FVector(20,Crossed ? 20 : -20,130);
        F.Hands[1]=FVector(20,Crossed ? -20 : 20,130);
        Repeated.Add(F);
    }
    TestTrue(TEXT("Four source crossing intervals seed one supported cycle"),
        FFlowFestStancePlan::SeedTiming(Repeated,16.,1.,1.,Timing,Error));
    TestTrue(TEXT("Repeated source leaves neutral entry time"),
        Timing.ReturnSeconds+1.<=Timing.StartSeconds+16.-.30);
    for(auto& F:Repeated)
    { F.Hands[0].Y=-20.; F.Hands[1].Y=20.; }
    TestFalse(TEXT("No crossing still has no stance timing seed"),
        FFlowFestStancePlan::SeedTiming(Repeated,16.,1.,1.,Timing,Error));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestStanceEventScheduleTest,"FlowArts.Runtime.Stance.EventSchedule",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FFlowFestStanceEventScheduleTest::RunTest(const FString&)
{
    auto P=Plan();
    // Native left/right clips differ in duration and signed endpoint heading.
    P.Return.Duration=.9;
    for(auto& F:P.Return.Frames) F.Seconds*=.9;
    for(int32 S=0;S<2;++S) { P.Return.SwingStart[S]*=.9; P.Return.SwingEnd[S]*=.9; }
    TestTrue(TEXT("Asymmetric source plan valid"),P.IsValid());
    for(double Phase : {.497682,4.99})
    for(int32 Event=0;Event<4;++Event)
    {
        FFlowFestStancePlan C,Repeat;
        const bool bReturn=(Event%2)!=0, bSwap=Event>=2;
        if(!TestTrue(TEXT("Blocked-phase schedule valid"),P.MakePhaseSchedule(Phase,bReturn,bSwap,
            FVector::RightVector,.30,C))) return false;
        TestTrue(TEXT("Schedule deterministic"),P.MakePhaseSchedule(Phase,bReturn,bSwap,
            FVector::RightVector,.30,Repeat));
        TestEqual(TEXT("Identical departure"),C.Controls.StartSeconds,Repeat.Controls.StartSeconds);
        TestEqual(TEXT("Identical return"),C.Controls.ReturnSeconds,Repeat.Controls.ReturnSeconds);
        TestEqual(TEXT("Whole turn heading follows swap"),C.Outward.HeadingDegrees,
            bSwap ? P.Return.HeadingDegrees : P.Outward.HeadingDegrees);
        TestEqual(TEXT("Whole turn support follows swap"),C.Outward.SwingEnd[1],
            bSwap ? P.Return.SwingEnd[1] : P.Outward.SwingEnd[1]);
        TestEqual(TEXT("Native frame times follow swap"),C.Return.Frames.Last().Seconds,
            bSwap ? P.Outward.Frames.Last().Seconds : P.Return.Frames.Last().Seconds);
        TestTrue(TEXT("Heading agrees with authored direction"),C.Controls.HeadingDegrees*C.Outward.HeadingDegrees>0.);
        TestEqual(TEXT("Lateral destination mirrors with turn"),C.Controls.HipTranslationCm.Y,
            bSwap ? -P.Controls.HipTranslationCm.Y : P.Controls.HipTranslationCm.Y);
        const double Neutral=C.Controls.StartSeconds+C.Duration-C.Controls.ReturnSeconds-C.Return.Duration;
        TestTrue(TEXT("Neutral entry retains 0.30 seconds"),Neutral>=.30-1.e-9);
        FFlowFestStanceSample AtEvent,AtNeutral,Seam,Loop;
        TestTrue(TEXT("Blocking phase samples"),C.Sample(Phase,AtEvent));
        TestTrue(TEXT("Turn is centered on blocking phase"),FMath::Abs(AtEvent.ExcursionWeight-.5)<1.e-9);
        TestTrue(TEXT("Neutral interval samples"),C.Sample(C.Controls.ReturnSeconds+C.Return.Duration+.5*Neutral,AtNeutral));
        TestTrue(TEXT("Neutral interval admits entry"),AtNeutral.BodyDelta.Equals(FTransform::Identity,1.e-9) &&
            AtNeutral.bSupport[0] && AtNeutral.bSupport[1]);
        C.Sample(0.,Seam); C.Sample(C.Duration,Loop);
        TestTrue(TEXT("Body closes at loop seam"),Seam.BodyDelta.Equals(Loop.BodyDelta,1.e-9));
        for(int32 S=0;S<2;++S) TestTrue(TEXT("Foot closes at loop seam"),Seam.Feet[S].Equals(Loop.Feet[S],1.e-9));
    }
    auto Unchanged=P;
    auto ShortEntry=P;
    ShortEntry.Controls.ReturnSeconds=ShortEntry.Controls.StartSeconds+ShortEntry.Duration-ShortEntry.Return.Duration-.29;
    TestFalse(TEXT("Later coordinate proposals cannot shrink entry window"),ShortEntry.IsValid());
    TestFalse(TEXT("Insufficient neutral is rejected"),P.MakePhaseSchedule(.5,false,false,FVector::RightVector,4.,Unchanged));
    TestEqual(TEXT("Rejected schedule does not replace output"),Unchanged.Controls.StartSeconds,P.Controls.StartSeconds);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestStanceIKTest,"FlowArts.Runtime.Stance.ExactAnchorsAndLimbs",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FFlowFestStanceIKTest::RunTest(const FString&)
{
    const auto Before=Pose(); FFlowFestStancePose After;
    FFlowFestStanceSample S; S.BodyDelta=FTransform(FQuat(FVector::UpVector,.05),FVector(1,0,0));
    for(int32 Side=0; Side<2; ++Side) S.Feet[Side]=Before.Components[Before.End[Side]];
    if(!TestTrue(TEXT("Small supported placement realizes"),FFlowFestStancePlan::Apply(Before,S,After))) return false;
    for(int32 C=0; C<4; ++C)
    {
        const int32 U=Before.Upper[C],M=Before.Middle[C],E=Before.End[C];
        TestTrue(TEXT("Upper length preserved"),FMath::Abs(FVector::Dist(Before.Components[U].GetLocation(),Before.Components[M].GetLocation())-
            FVector::Dist(After.Components[U].GetLocation(),After.Components[M].GetLocation()))<.001);
        TestTrue(TEXT("Lower length preserved"),FMath::Abs(FVector::Dist(Before.Components[M].GetLocation(),Before.Components[E].GetLocation())-
            FVector::Dist(After.Components[M].GetLocation(),After.Components[E].GetLocation()))<.001);
        TestTrue(TEXT("Hand/foot full frame fixed"),After.Components[E].Equals(Before.Components[E],1.e-9));
        TestTrue(TEXT("Finger/toe full frame fixed"),After.Components[E+1].Equals(Before.Components[E+1],1.e-9));
    }
    FFlowFestStancePose Carried;
    TestTrue(TEXT("Leg-only realization is available before arm preparation"),FFlowFestStancePlan::Apply(Before,S,Carried,nullptr,false));
    for(int32 Side=0; Side<2; ++Side)
    {
        TestTrue(TEXT("Leg-only stage retains planted feet"),Carried.Components[Carried.End[Side]].Equals(S.Feet[Side],1.e-9));
        TestTrue(TEXT("Arm frame remains rigid until target-aware preparation"),Carried.Components[Carried.End[Side+2]].Equals(
            Before.Components[Before.End[Side+2]]*S.BodyDelta,1.e-9));
    }
    const auto Accepted=After; S.BodyDelta.SetTranslation(FVector(500,0,0));
    TestFalse(TEXT("Unreachable placement rejected"),FFlowFestStancePlan::Apply(Before,S,After));
    for(int32 I=0; I<After.Components.Num(); ++I)
        TestTrue(TEXT("Failure is atomic"),After.Components[I].Equals(Accepted.Components[I],1.e-12));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestStancePatternTest,"FlowArts.Runtime.Stance.PatternTargets",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FFlowFestStancePatternTest::RunTest(const FString&)
{
    const auto Source=Pose();
    const FTransform Body(FQuat(FVector::UpVector,.05),FVector(1,0,0));
    FFlowArtsArmClearancePreparationSnapshot Snapshot;
    Snapshot.bValid=true; Snapshot.bConstrainPreparedHandTranslation=true;
    auto& G=Snapshot.Geometry; G.bSourceFidelityOnly=true; G.bHasPreparedHandTargets=true;
    G.CertifySkinnedHeldPropBody=[](const FFlowArtsClearanceArm*,const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&,uint8){return uint8(96);};
    G.FixedHip=Body.TransformPosition(FVector(0,0,90)); G.Neck=Body.TransformPosition(FVector(0,0,150));
    G.SourceHeadRotation=FQuat(FVector::UpVector,FMath::DegreesToRadians(10.));
    G.TorsoPivot=G.FixedHip;
    const FVector Normal=FVector(1,1,0).GetSafeNormal();
    for(int32 Side=0; Side<2; ++Side)
    {
        auto& A=G.Arms[Side];
        A.Upper=Source.Components[Source.Upper[Side+2]]*Body;
        A.Elbow=Source.Components[Source.Middle[Side+2]]*Body;
        A.Wrist=Source.Components[Source.End[Side+2]]*Body;
        G.PreparedHandTargets[Side]=Source.Components[Source.End[Side+2]];
        Snapshot.PreparedHandTranslationCm[Side]=Normal*(Side ? -3. : 3.);
        const FVector H=G.PreparedHandTargets[Side].GetLocation();
        G.HeldPropCapsules[Side].Add({H,H+FVector(0,0,20),1.f});
    }
    FFlowArtsArmClearancePreparedSeed Seed; FFlowArtsArmClearanceResult Result;
    Snapshot.bConstrainPreparedTorsoRotation=true;
    Snapshot.PreparedTorsoRotation=FQuat(Body.GetRotation().RotateVector(FVector::RightVector),FMath::DegreesToRadians(5.));
    if(!TestTrue(TEXT("Target-aware absolute arm geometry builds"),FFlowArtsArmClearance::PrepareCandidate(Snapshot,0,nullptr,Seed,Result))) return false;
    TestTrue(TEXT("Whole-track torso control retained"),Seed.TorsoRotation.Equals(Snapshot.PreparedTorsoRotation,1.e-8));
    TestTrue(TEXT("Realized head rotation includes authored head orientation"),
        Seed.SolvedHeadRotation.Equals((Seed.TorsoRotation*G.SourceHeadRotation).GetNormalized(),1.e-8));
    auto TurningSnapshot=Snapshot;
    TurningSnapshot.Geometry.SourceHeadRotation=
        FQuat(FVector::UpVector,FMath::DegreesToRadians(30.));
    FFlowArtsArmClearancePreparedSeed TurnedSeed;
    FFlowArtsArmClearanceResult TurnedResult;
    if(!TestTrue(TEXT("Changed authored head orientation builds"),
        FFlowArtsArmClearance::PrepareCandidate(TurningSnapshot,0,nullptr,TurnedSeed,TurnedResult))) return false;
    TestFalse(TEXT("Authored head turn alone respects realized angular rate gate"),
        FFlowFestStancePreparation::ContinuousArms(Seed,TurnedSeed,1./60.));
    for(int32 Side=0; Side<2; ++Side)
    {
        const FVector Expected=G.PreparedHandTargets[Side].GetLocation()+Snapshot.PreparedHandTranslationCm[Side];
        TestTrue(TEXT("Only allowed normal changes authored target"),Seed.SolvedWrists[Side].Equals(Expected,1.e-8));
        const FVector Delta=Seed.SolvedWrists[Side]-G.PreparedHandTargets[Side].GetLocation();
        TestTrue(TEXT("Projected pattern unchanged"),(Delta-Normal*FVector::DotProduct(Delta,Normal)).IsNearlyZero(1.e-8));
        TestTrue(TEXT("Wrist orientation retained"),Result.Arms[Side].Wrist.GetRotation().Equals(G.PreparedHandTargets[Side].GetRotation(),1.e-8));
        TestTrue(TEXT("Upper length preserved after body placement"),FMath::Abs(FVector::Dist(Seed.SolvedShoulders[Side],Seed.SolvedElbows[Side])-
            FVector::Dist(G.Arms[Side].Upper.GetLocation(),G.Arms[Side].Elbow.GetLocation()))<1.e-6);
        TestTrue(TEXT("Forearm length preserved after body placement"),FMath::Abs(FVector::Dist(Seed.SolvedElbows[Side],Seed.SolvedWrists[Side])-
            FVector::Dist(G.Arms[Side].Elbow.GetLocation(),G.Arms[Side].Wrist.GetLocation()))<1.e-6);
    }
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestPreparedTransitionTest,"FlowArts.Runtime.Stance.DisplayedTransition",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FFlowFestPreparedTransitionTest::RunTest(const FString&)
{
    const auto P=Pose();
    FFlowArtsArmClearancePreparationSnapshot Snapshot; Snapshot.bValid=true;
    auto& G=Snapshot.Geometry;
    G.bSourceFidelityOnly=true; G.FixedHip=FVector(0,0,90); G.Neck=FVector(0,0,150); G.TorsoPivot=G.FixedHip;
    for(int32 Side=0;Side<2;++Side)
    {
        G.Arms[Side].Upper=P.Components[P.Upper[Side+2]];
        G.Arms[Side].Elbow=P.Components[P.Middle[Side+2]];
        G.Arms[Side].Wrist=P.Components[P.End[Side+2]];
    }
    FFlowArtsArmClearancePreparedSeed Original,Start,Middle;
    FFlowArtsArmClearanceResult Displayed;
    if(!TestTrue(TEXT("Initial exact geometry builds"),
        FFlowArtsArmClearance::PrepareCandidate(Snapshot,0,nullptr,Original,Displayed))) return false;
    Displayed.bFeasible=false;
    TestTrue(TEXT("Uncleared displayed pose can begin an honest transition"),
        FFlowArtsArmClearance::CaptureTransitionSeed(Snapshot,Displayed,Start));
    auto WrongSource=Snapshot; WrongSource.Geometry.Arms[0].Upper.AddToTranslation(FVector(1,0,0));
    TestFalse(TEXT("Mismatched displayed/source geometry is rejected"),
        FFlowArtsArmClearance::CaptureTransitionSeed(WrongSource,Displayed,Middle));
    auto Target=Start;
    Target.TorsoRotation=FQuat(FVector::RightVector,FMath::DegreesToRadians(15.));
    Target.UpperFrameOffset[0]=(FQuat(FVector::ForwardVector,FMath::DegreesToRadians(20.))*Target.UpperFrameOffset[0]).GetNormalized();
    TestFalse(TEXT("Certified track cannot silently interpolate different calibrations"),
        FFlowArtsArmClearance::InterpolatePreparedSeed(Start,Target,.5,Middle));
    TestTrue(TEXT("Entry transition permits continuous calibration"),
        FFlowArtsArmClearance::InterpolateTransitionSeed(Start,Target,.5,Middle));
    TestTrue(TEXT("Entry torso midpoint is seven and a half degrees"),
        FMath::Abs(FMath::RadiansToDegrees(Middle.TorsoRotation.GetAngle())-7.5)<1.e-6);
    TestTrue(TEXT("Entry calibration midpoint is ten degrees from displayed"),
        FMath::Abs(FMath::RadiansToDegrees(Start.UpperFrameOffset[0].AngularDistance(Middle.UpperFrameOffset[0]))-10.)<1.e-6);
    TestTrue(TEXT("Entry endpoint reproduces target calibration"),
        FFlowArtsArmClearance::InterpolateTransitionSeed(Start,Target,1.,Middle) &&
        Middle.UpperFrameOffset[0].Equals(Target.UpperFrameOffset[0],1.e-8));
    TestFalse(TEXT("Nonfinite entry time is rejected"),
        FFlowArtsArmClearance::InterpolateTransitionSeed(Start,Target,std::numeric_limits<double>::infinity(),Middle));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestPreparedContactRefinementTest,"FlowArts.Runtime.Stance.ExactContactRefinement",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FFlowFestPreparedContactRefinementTest::RunTest(const FString&)
{
    const auto Source=Pose();
    FFlowArtsArmClearancePreparationSnapshot Snapshot;
    Snapshot.bValid=true;
    auto& G=Snapshot.Geometry;
    G.bSourceFidelityOnly=true; G.FixedHip=FVector(0,0,90); G.Neck=FVector(0,0,150); G.TorsoPivot=G.FixedHip;
    for(int32 Side=0; Side<2; ++Side)
    {
        G.Arms[Side].Upper=Source.Components[Source.Upper[Side+2]];
        G.Arms[Side].Elbow=Source.Components[Source.Middle[Side+2]];
        G.Arms[Side].Wrist=Source.Components[Source.End[Side+2]];
    }
    int32 FreshQueries=0;
    G.bCanCertifySkinnedUpperTorso=true;
    G.CertifySkinnedUpperTorso=[&](const FFlowArtsClearanceArm*,const FQuat&,bool)
    { ++FreshQueries; return uint8(0); };
    FFlowArtsArmClearancePreparedSeed Seed; FFlowArtsArmClearanceResult Initial;
    if(!TestTrue(TEXT("Rejected exact candidate still has valid controls"),
        FFlowArtsArmClearance::PrepareCandidate(Snapshot,0,nullptr,Seed,Initial))) return false;
    TestFalse(TEXT("Rejected certificate cannot be feasible"),Initial.bFeasible);
    const FVector Axis=(Seed.SolvedWrists[0]-Seed.SolvedShoulders[0]).GetSafeNormal();
    const FVector Desired=Seed.SolvedShoulders[0]+FQuat(Axis,FMath::DegreesToRadians(1.)).
        RotateVector(Seed.SolvedElbows[0]-Seed.SolvedShoulders[0]);
    G.MakePreparedContactObjective=[Desired](const FFlowArtsClearanceArm*,const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&)->FFlowArtsPreparedContactObjective
    {
        return [Desired](const FFlowArtsClearanceArm* Arms,const FQuat&,
            const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&)
        { return FVector::DistSquared(Arms[0].Elbow.GetLocation(),Desired); };
    };
    const int32 BeforeQueries=FreshQueries;
    FFlowArtsArmClearancePreparedSeed Refined; FFlowArtsArmClearanceResult Result;
    if(!TestTrue(TEXT("Exact-only contact objective produces bounded refinement"),
        FFlowArtsArmClearance::RefinePreparedCandidate(Snapshot,Seed,Refined,Result))) return false;
    TestTrue(TEXT("Reported objective decreases"),Result.PreparedContactPenalty<FVector::DistSquared(Seed.SolvedElbows[0],Desired));
    TestTrue(TEXT("Refinement rechecks the full certificate"),FreshQueries>BeforeQueries);
    TestFalse(TEXT("Lower search penalty never overrides rejected certificate"),Result.bFeasible);
    TestTrue(TEXT("Pole update stays within two degrees"),FMath::Acos(FMath::Clamp(
        FVector::DotProduct(Seed.ElbowPole[0],Refined.ElbowPole[0]),-1.,1.))<=FMath::DegreesToRadians(2.0001));
    for(int32 Side=0;Side<2;++Side)
    {
        TestTrue(TEXT("Refinement preserves hand target"),Seed.SolvedWrists[Side].Equals(Refined.SolvedWrists[Side],1.e-8));
        TestTrue(TEXT("Refinement preserves upper limb length"),FMath::Abs(
            FVector::Dist(Seed.SolvedShoulders[Side],Seed.SolvedElbows[Side])-
            FVector::Dist(Refined.SolvedShoulders[Side],Refined.SolvedElbows[Side]))<1.e-6);
        TestTrue(TEXT("Refinement preserves lower limb length"),FMath::Abs(
            FVector::Dist(Seed.SolvedElbows[Side],Seed.SolvedWrists[Side])-
            FVector::Dist(Refined.SolvedElbows[Side],Refined.SolvedWrists[Side]))<1.e-6);
    }
    {
        auto HeadSnapshot=Snapshot;
        auto& HeadGeometry=HeadSnapshot.Geometry;
        HeadGeometry.Arms[0].ForearmRadiusCm=1.f;
        HeadGeometry.MakePreparedContactObjective=[](const FFlowArtsClearanceArm*,const FQuat&,
            const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&)->FFlowArtsPreparedContactObjective
        {
            return [](const FFlowArtsClearanceArm*,const FQuat&,
                const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&) { return 0.; };
        };
        const FVector Tangent=FVector::CrossProduct(Axis,Seed.SolvedElbows[0]-Seed.SolvedShoulders[0]).GetSafeNormal();
        const FVector Contact=FMath::Lerp(Seed.SolvedElbows[0],Seed.SolvedWrists[0],.35)+Tangent*.8;
        HeadGeometry.TorsoHulls.SetNum(3);
        for(const FVector Direction : {FVector::ForwardVector,FVector::RightVector,FVector::UpVector})
        {
            HeadGeometry.TorsoHulls[2].Planes.Add({Direction,float(FVector::DotProduct(Direction,Contact)+.3)});
            HeadGeometry.TorsoHulls[2].Planes.Add({-Direction,float(FVector::DotProduct(-Direction,Contact)+.3)});
        }
        FFlowArtsArmClearancePreparedSeed HeadSeed,HeadRefined;
        FFlowArtsArmClearanceResult HeadBefore,HeadAfter;
        TestTrue(TEXT("Head-only rejected candidate constructs"),
            FFlowArtsArmClearance::PrepareCandidate(HeadSnapshot,0,&Seed,HeadSeed,HeadBefore));
        TestTrue(TEXT("Retained head contact has merit despite zero skin penalty"),HeadBefore.PreparedContactPenalty>0.);
        TestTrue(TEXT("Retained head contact supplies a refinement direction"),
            FFlowArtsArmClearance::RefinePreparedCandidate(HeadSnapshot,HeadSeed,HeadRefined,HeadAfter));
        TestTrue(TEXT("Refinement reduces the unchanged head envelope penalty"),
            HeadAfter.PreparedContactPenalty<HeadBefore.PreparedContactPenalty);
        TestFalse(TEXT("Head refinement never bypasses rejected skin certificate"),HeadAfter.bFeasible);
        TestTrue(TEXT("Head refinement retains wrist target"),HeadRefined.SolvedWrists[0].Equals(HeadSeed.SolvedWrists[0],1.e-8));
    }
    {
        auto BodySnapshot=Snapshot;
        auto& BodyGeometry=BodySnapshot.Geometry;
        BodyGeometry.Arms[0].ForearmRadiusCm=1.f;
        BodyGeometry.MakePreparedContactObjective=[](const FFlowArtsClearanceArm*,const FQuat&,
            const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&)->FFlowArtsPreparedContactObjective
        {
            return [](const FFlowArtsClearanceArm*,const FQuat&,
                const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&) { return 0.; };
        };
        const FVector Tangent=FVector::CrossProduct(Axis,Seed.SolvedElbows[0]-Seed.SolvedShoulders[0]).GetSafeNormal();
        const FVector Contact=FMath::Lerp(Seed.SolvedElbows[0],Seed.SolvedWrists[0],.35)+Tangent*.8;
        BodyGeometry.TorsoHulls.SetNum(3);
        for(const FVector Direction : {FVector::ForwardVector,FVector::RightVector,FVector::UpVector})
        {
            BodyGeometry.TorsoHulls[1].Planes.Add({Direction,float(FVector::DotProduct(Direction,Contact)+.3)});
            BodyGeometry.TorsoHulls[1].Planes.Add({-Direction,float(FVector::DotProduct(-Direction,Contact)+.3)});
        }
        uint8 BodyProofMask=0;
        BodyGeometry.CertifyForearmBody=[&BodyProofMask](const FFlowArtsClearanceArm*,const FQuat&)
        { return BodyProofMask; };
        FFlowArtsArmClearancePreparedSeed BodySeed,BodyRefined;
        FFlowArtsArmClearanceResult BodyBefore,BodyAfter;
        if(!TestTrue(TEXT("Retained forearm body contact constructs"),
            FFlowArtsArmClearance::PrepareCandidate(BodySnapshot,0,&Seed,BodySeed,BodyBefore))) return false;
        TestTrue(TEXT("Retained forearm body contact has nonzero merit with zero skin objective"),
            BodyBefore.PreparedContactPenalty>0.);
        TestFalse(TEXT("Retained forearm body contact still fails its hard certificate"),BodyBefore.bFeasible);
        if(!TestTrue(TEXT("Retained forearm body contact drives bounded refinement"),
            FFlowArtsArmClearance::RefinePreparedCandidate(BodySnapshot,BodySeed,BodyRefined,BodyAfter))) return false;
        TestTrue(TEXT("Refinement descends retained forearm body residual"),
            BodyAfter.PreparedContactPenalty<BodyBefore.PreparedContactPenalty);
        TestTrue(TEXT("Refinement leaves a measurable forearm body overlap"),
            BodyAfter.PreparedContactPenalty>0.);
        TestFalse(TEXT("Descending forearm body residual does not waive collision"),BodyAfter.bFeasible);
        double BeforeMerit=0.,AfterMerit=0.;
        TestTrue(TEXT("Paired forearm body merit is available"),
            FFlowArtsArmClearance::ComparePreparedContactMerit(BodySnapshot,BodySeed,BodyRefined,BeforeMerit,AfterMerit));
        TestTrue(TEXT("Paired merit decreases for a still colliding forearm"),AfterMerit<BeforeMerit);
        BodyProofMask=2;
        FFlowArtsArmClearancePreparedSeed OppositeProofSeed;
        FFlowArtsArmClearanceResult OppositeProofResult;
        TestTrue(TEXT("Opposite side body proof constructs"),
            FFlowArtsArmClearance::PrepareCandidate(BodySnapshot,0,&BodySeed,OppositeProofSeed,OppositeProofResult));
        TestTrue(TEXT("Opposite side body proof cannot erase left forearm merit"),
            OppositeProofResult.PreparedContactPenalty>0.);
        BodyProofMask=1;
        FFlowArtsArmClearancePreparedSeed SameProofSeed;
        FFlowArtsArmClearanceResult SameProofResult;
        TestTrue(TEXT("Same side body proof constructs"),
            FFlowArtsArmClearance::PrepareCandidate(BodySnapshot,0,&BodySeed,SameProofSeed,SameProofResult));
        TestTrue(TEXT("Fresh same side body proof removes only its proxy merit"),
            SameProofResult.PreparedContactPenalty<OppositeProofResult.PreparedContactPenalty);
        BodyGeometry.TorsoHulls[2]=BodyGeometry.TorsoHulls[1];
        FFlowArtsArmClearancePreparedSeed HeadStillSeed;
        FFlowArtsArmClearanceResult HeadStillResult;
        TestTrue(TEXT("Head contact with proved body constructs"),
            FFlowArtsArmClearance::PrepareCandidate(BodySnapshot,0,&BodySeed,HeadStillSeed,HeadStillResult));
        TestTrue(TEXT("Body proof leaves independent head merit in place"),
            HeadStillResult.PreparedContactPenalty>SameProofResult.PreparedContactPenalty);
    }
    const FVector OriginalElbow=Seed.SolvedElbows[0];
    G.MakePreparedContactObjective=[Desired,OriginalElbow](const FFlowArtsClearanceArm* CenterArms,const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&)->FFlowArtsPreparedContactObjective
    {
        // A second surface enters after any movement. The old witnesses still
        // predict descent, while every freshly collected manifold rejects it.
        const double NewWeight=CenterArms[0].Elbow.GetLocation().Equals(OriginalElbow,1.e-8) ? 0. : 1000.;
        return [Desired,OriginalElbow,NewWeight](const FFlowArtsClearanceArm* Arms,const FQuat&,
            const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&)
        { return NewWeight*FVector::DistSquared(Arms[0].Elbow.GetLocation(),OriginalElbow)+
            FVector::DistSquared(Arms[0].Elbow.GetLocation(),Desired); };
    };
    const int32 BeforeCompetingQueries=FreshQueries;
    TestFalse(TEXT("New contact cannot be accepted solely on frozen witness descent"),
        FFlowArtsArmClearance::RefinePreparedCandidate(Snapshot,Seed,Refined,Result));
    TestTrue(TEXT("Competing surface backtracking rechecks each proposed endpoint"),FreshQueries>=BeforeCompetingQueries+3);
    G.MakePreparedContactObjective=[Desired,OriginalElbow](const FFlowArtsClearanceArm* CenterArms,const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&)->FFlowArtsPreparedContactObjective
    {
        const double NewlyCollectedConstant=CenterArms[0].Elbow.GetLocation().Equals(OriginalElbow,1.e-8) ? 0. : 100.;
        return [Desired,NewlyCollectedConstant](const FFlowArtsClearanceArm* Arms,const FQuat&,
            const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&)
        { return NewlyCollectedConstant+FVector::DistSquared(Arms[0].Elbow.GetLocation(),Desired); };
    };
    TestTrue(TEXT("A collection-only constant does not invalidate matched-witness descent"),
        FFlowArtsArmClearance::RefinePreparedCandidate(Snapshot,Seed,Refined,Result));
    TestFalse(TEXT("Matched merit does not grant a rejected skin certificate"),Result.bFeasible);
    Snapshot.bConstrainPreparedHandTranslation=true;
    Snapshot.PreparedPatternNormal=FVector::ForwardVector;
    Snapshot.MaxPreparedHandDepthCm=8.;
    {
        auto ReachSnapshot=Snapshot;
        ReachSnapshot.MinPreparedCommonDepthCm=-25.;
        double Min,Max;
        TestTrue(TEXT("Two-arm connected reach interval exists"),
            FFlowArtsArmClearance::PreparedCommonDepthInterval(ReachSnapshot,Seed,Min,Max));
        TestTrue(TEXT("Reach interval respects the visual range"),Min>=-25. && Max<=0. && Min<=Max);
        auto Endpoint=Seed;
        for(double Common : {Min,Max})
        {
            Endpoint.HandTranslationCm[0]=Endpoint.HandTranslationCm[1]=FVector(Common,0,0);
            TestTrue(TEXT("Both interval endpoints construct nonsingular two-link poses"),
                FFlowArtsArmClearance::PrepareCandidate(ReachSnapshot,0,&Endpoint,Refined,Result));
        }
        ReachSnapshot.PreparedPatternNormal=FVector::ZeroVector;
        TestFalse(TEXT("Zero pattern normal cannot define a reach interval"),
            FFlowArtsArmClearance::PreparedCommonDepthInterval(ReachSnapshot,Seed,Min,Max));
        ReachSnapshot.PreparedPatternNormal=-FVector::ForwardVector;
        TestTrue(TEXT("Reversed pattern normal is a valid coordinate convention"),
            FFlowArtsArmClearance::PreparedCommonDepthInterval(ReachSnapshot,Seed,Min,Max));
        ReachSnapshot.Geometry.Arms[1].Wrist.AddToTranslation(FVector(0,1000,0));
        ReachSnapshot.Geometry.bHasPreparedHandTargets=true;
        ReachSnapshot.Geometry.PreparedHandTargets[0]=G.Arms[0].Wrist;
        ReachSnapshot.Geometry.PreparedHandTargets[1]=FTransform(FVector(0,100000,0));
        TestFalse(TEXT("Empty intersection of arm reach spheres rejects"),
            FFlowArtsArmClearance::PreparedCommonDepthInterval(ReachSnapshot,Seed,Min,Max));
        ReachSnapshot=Snapshot;
        ReachSnapshot.MinPreparedCommonDepthCm=-25.;
        ReachSnapshot.Geometry.bHasPreparedHandTargets=true;
        for(int32 Side=0;Side<2;++Side)
        {
            auto& Arm=ReachSnapshot.Geometry.Arms[Side];
            Arm.Upper.SetLocation(FVector::ZeroVector);
            Arm.Elbow.SetLocation(FVector(10,0,0));
            Arm.Wrist.SetLocation(FVector(10,0,5));
            ReachSnapshot.Geometry.PreparedHandTargets[Side]=FTransform(FVector(6,0,0));
        }
        auto Branch=Seed;
        TestTrue(TEXT("Folded-arm exclusion retains the current connected branch"),
            FFlowArtsArmClearance::PreparedCommonDepthInterval(ReachSnapshot,Branch,Min,Max));
        TestTrue(TEXT("Near branch cannot cross inner reach hole"),Min>-.999999 && Max==0.);
        Branch.HandTranslationCm[0]=Branch.HandTranslationCm[1]=FVector(-12,0,0);
        TestTrue(TEXT("Far branch remains independently representable"),
            FFlowArtsArmClearance::PreparedCommonDepthInterval(ReachSnapshot,Branch,Min,Max));
        TestTrue(TEXT("Far branch stops before inner hole"),Max<-11.);
        Branch.HandTranslationCm[0]=Branch.HandTranslationCm[1]=FVector(-6,0,0);
        TestFalse(TEXT("A seed inside the inner singularity hole rejects"),
            FFlowArtsArmClearance::PreparedCommonDepthInterval(ReachSnapshot,Branch,Min,Max));
    }
    const FVector DesiredHand=Seed.SolvedWrists[0]+Snapshot.PreparedPatternNormal;
    G.MakePreparedContactObjective=[DesiredHand](const FFlowArtsClearanceArm*,const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&)->FFlowArtsPreparedContactObjective
    {
        return [DesiredHand](const FFlowArtsClearanceArm* Arms,const FQuat&,
            const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&)
        { return FVector::DistSquared(Arms[0].Wrist.GetLocation(),DesiredHand); };
    };
    if(!TestTrue(TEXT("Exact contact can refine symmetric pattern depth"),
        FFlowArtsArmClearance::RefinePreparedCandidate(Snapshot,Seed,Refined,Result))) return false;
    TestTrue(TEXT("Depth refinement makes progress within half-centimetre step"),
        Refined.HandTranslationCm[0].X>0. && Refined.HandTranslationCm[0].X<=.500001);
    TestTrue(TEXT("Depth refinement preserves projected pattern and symmetry"),
        Refined.HandTranslationCm[0].Equals(-Refined.HandTranslationCm[1],1.e-9) &&
        FVector::CrossProduct(Refined.HandTranslationCm[0],Snapshot.PreparedPatternNormal).IsNearlyZero(1.e-9));
    TestTrue(TEXT("Refined depth survives complete fresh candidate construction"),
        Refined.SolvedWrists[0].Equals(Seed.SolvedWrists[0]+Refined.HandTranslationCm[0],1.e-8));
    TestFalse(TEXT("Depth improvement cannot waive the full certificate"),Result.bFeasible);
    auto Excess=Refined;
    Excess.HandTranslationCm[0]=FVector(9.,2.,3.); Excess.HandTranslationCm[1]=-Excess.HandTranslationCm[0];
    TestTrue(TEXT("Depth constraints rebuild an overbound seed"),
        FFlowArtsArmClearance::PrepareCandidate(Snapshot,0,&Excess,Refined,Result));
    TestTrue(TEXT("Depth is clamped and in-plane drift removed"),Refined.HandTranslationCm[0].Equals(FVector(8.,0.,0.),1.e-9));
    const auto CappedSeed=Refined;
    const FVector CappedAxis=(CappedSeed.SolvedWrists[0]-CappedSeed.SolvedShoulders[0]).GetSafeNormal();
    const FVector CappedElbow=CappedSeed.SolvedShoulders[0]+FQuat(CappedAxis,FMath::DegreesToRadians(1.)).
        RotateVector(CappedSeed.SolvedElbows[0]-CappedSeed.SolvedShoulders[0]);
    const double UnreachableDepthTarget=CappedSeed.SolvedWrists[0].X+2.;
    G.MakePreparedContactObjective=[CappedElbow,UnreachableDepthTarget](const FFlowArtsClearanceArm*,const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&)->FFlowArtsPreparedContactObjective
    {
        return [CappedElbow,UnreachableDepthTarget](const FFlowArtsClearanceArm* Arms,const FQuat&,
            const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&)
        { return 1.e6*FMath::Square(Arms[0].Wrist.GetLocation().X-UnreachableDepthTarget)+
            FVector::DistSquared(Arms[0].Elbow.GetLocation(),CappedElbow); };
    };
    TestTrue(TEXT("Bounded depth does not starve free angular correction"),
        FFlowArtsArmClearance::RefinePreparedCandidate(Snapshot,CappedSeed,Refined,Result));
    TestTrue(TEXT("Projected gradient preserves the active depth bound"),
        Refined.HandTranslationCm[0].Equals(CappedSeed.HandTranslationCm[0],1.e-8));
    TestTrue(TEXT("Free elbow makes material progress despite dominant infeasible depth gradient"),
        FVector::DistSquared(Refined.SolvedElbows[0],CappedElbow)<
        .8*FVector::DistSquared(CappedSeed.SolvedElbows[0],CappedElbow));
    TestFalse(TEXT("Projected descent cannot override rejected certificate"),Result.bFeasible);
    const double CenterHandX=Seed.SolvedWrists[0].X;
    G.MakePreparedContactObjective=[CenterHandX](const FFlowArtsClearanceArm*,const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&)->FFlowArtsPreparedContactObjective
    {
        return [CenterHandX](const FFlowArtsClearanceArm* Arms,const FQuat&,
            const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&)
        { return 1.+FMath::Square(Arms[0].Wrist.GetLocation().X-CenterHandX); };
    };
    G.FindPreparedDepthEscape=[](const FFlowArtsClearanceArm*,const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&,
        const FVector&,double Maximum,double& Additional)
    { Additional=1.; return Maximum>=Additional; };
    const int32 BeforeEscape=FreshQueries;
    TestFalse(TEXT("Built but worse depth escape does not displace the incumbent"),
        FFlowArtsArmClearance::RefinePreparedCandidate(Snapshot,Seed,Refined,Result));
    TestTrue(TEXT("Escape still performs fresh full certificate"),FreshQueries>BeforeEscape);
    auto EscapeProposal=Seed;
    EscapeProposal.HandTranslationCm[0]=FVector(1,0,0);
    EscapeProposal.HandTranslationCm[1]=FVector(-1,0,0);
    FFlowArtsArmClearancePreparedSeed BoundarySeed;
    FFlowArtsArmClearanceResult BoundaryResult;
    if(!TestTrue(TEXT("Rejected escape endpoint still constructs for later boundary tests"),
        FFlowArtsArmClearance::PrepareCandidate(Snapshot,0,&EscapeProposal,BoundarySeed,BoundaryResult))) return false;
    TestFalse(TEXT("Rejected escape endpoint cannot waive full certificate"),BoundaryResult.bFeasible);
    const FVector BoundaryHand=BoundarySeed.SolvedWrists[0];
    const FVector BoundaryAxis=(BoundarySeed.SolvedWrists[0]-BoundarySeed.SolvedShoulders[0]).GetSafeNormal();
    const FVector BoundaryElbow=BoundarySeed.SolvedShoulders[0]+FQuat(BoundaryAxis,FMath::DegreesToRadians(1.)).
        RotateVector(BoundarySeed.SolvedElbows[0]-BoundarySeed.SolvedShoulders[0]);
    G.MakePreparedContactObjective=[BoundaryHand,BoundaryElbow](const FFlowArtsClearanceArm*,const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&)->FFlowArtsPreparedContactObjective
    {
        return [BoundaryHand,BoundaryElbow](const FFlowArtsClearanceArm* Arms,const FQuat&,
            const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&)
        { return 100.*FMath::Square(Arms[0].Wrist.GetLocation().X-BoundaryHand.X)+
            FVector::DistSquared(Arms[0].Elbow.GetLocation(),BoundaryElbow); };
    };
    G.FindPreparedDepthEscape=[BoundaryHand](const FFlowArtsClearanceArm* Arms,const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&,
        const FVector&,double Maximum,double& Additional)
    { Additional=BoundaryHand.X-Arms[0].Wrist.GetLocation().X; return Additional>1.e-8 && Maximum>=Additional; };
    if(!TestTrue(TEXT("Improving incomplete escape continues into angular descent"),
        FFlowArtsArmClearance::RefinePreparedCandidate(Snapshot,Seed,Refined,Result))) return false;
    TestTrue(TEXT("Coupled escape holds the measured depth boundary"),
        Refined.HandTranslationCm[0].Equals(BoundarySeed.HandTranslationCm[0],1.e-8));
    TestTrue(TEXT("Coupled escape also improves the elbow after depth rebase"),
        FVector::DistSquared(Refined.SolvedElbows[0],BoundaryElbow)<
        FVector::DistSquared(BoundarySeed.SolvedElbows[0],BoundaryElbow));
    TestFalse(TEXT("Coupled local improvement still respects rejected certificate"),Result.bFeasible);
    int32 UnavailableDerivativeQueries=0;
    const FVector EscapeOriginalElbow=Seed.SolvedElbows[0];
    const FVector EscapedElbow=BoundarySeed.SolvedElbows[0];
    G.MakePreparedContactObjective=[BoundaryHand,EscapeOriginalElbow,EscapedElbow,&UnavailableDerivativeQueries](
        const FFlowArtsClearanceArm*,const FQuat&,const TArray<FFlowArtsClearanceCapsule>&,
        const TArray<FFlowArtsClearanceCapsule>&)->FFlowArtsPreparedContactObjective
    {
        return [BoundaryHand,EscapeOriginalElbow,EscapedElbow,&UnavailableDerivativeQueries](
            const FFlowArtsClearanceArm* Arms,const FQuat&,
            const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&)
        {
            const FVector Elbow=Arms[0].Elbow.GetLocation();
            if(!Elbow.Equals(EscapeOriginalElbow,1.e-6) && !Elbow.Equals(EscapedElbow,1.e-6))
            {
                ++UnavailableDerivativeQueries;
                return TNumericLimits<double>::Max();
            }
            return 1.+100.*FMath::Square(Arms[0].Wrist.GetLocation().X-BoundaryHand.X);
        };
    };
    if(!TestTrue(TEXT("Improved escape survives an unavailable angular derivative"),
        FFlowArtsArmClearance::RefinePreparedCandidate(Snapshot,Seed,Refined,Result))) return false;
    TestTrue(TEXT("Fixture exercises the unavailable derivative"),UnavailableDerivativeQueries>0);
    TestTrue(TEXT("Fallback retains the full escaped endpoint"),
        Refined.HandTranslationCm[0].Equals(BoundarySeed.HandTranslationCm[0],1.e-8) &&
        Refined.SolvedElbows[0].Equals(EscapedElbow,1.e-6));
    TestFalse(TEXT("Derivative fallback never waives the full certificate"),Result.bFeasible);
    G.MakePreparedContactObjective=[BoundaryHand,BoundaryElbow](const FFlowArtsClearanceArm*,const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&)->FFlowArtsPreparedContactObjective
    {
        return [BoundaryHand,BoundaryElbow](const FFlowArtsClearanceArm* Arms,const FQuat&,
            const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&)
        { return FMath::Square(Arms[0].Wrist.GetLocation().X-BoundaryHand.X+1.)+
            FVector::DistSquared(Arms[0].Elbow.GetLocation(),BoundaryElbow); };
    };
    G.FindPreparedDepthEscape=[BoundaryHand](const FFlowArtsClearanceArm* Arms,const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&,
        const FVector&,double Maximum,double& Additional)
    { Additional=BoundaryHand.X-Arms[0].Wrist.GetLocation().X; return Additional>1.e-8 && Maximum>=Additional; };
    TestTrue(TEXT("Active hand depth boundary allows remaining angular descent"),
        FFlowArtsArmClearance::RefinePreparedCandidate(Snapshot,BoundarySeed,Refined,Result));
    TestTrue(TEXT("Forearm objective cannot descend back into the cleared hand contact"),
        Refined.HandTranslationCm[0].Equals(BoundarySeed.HandTranslationCm[0],1.e-8));
    TestTrue(TEXT("Angular descent still reduces the elbow error at fixed safe depth"),
        FVector::DistSquared(Refined.SolvedElbows[0],BoundaryElbow)<
        FVector::DistSquared(BoundarySeed.SolvedElbows[0],BoundaryElbow));
    TestFalse(TEXT("Active constraint still cannot waive rejected certificate"),Result.bFeasible);
    bool bRejectedFullDepthStep=false;
    G.FindPreparedDepthEscape=[BoundaryHand,&bRejectedFullDepthStep](const FFlowArtsClearanceArm* Arms,const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&,
        const FVector&,double Maximum,double& Additional)
    {
        // The .0625 cm derivative probe is clear; the actual larger step is not.
        Additional=BoundaryHand.X-Arms[0].Wrist.GetLocation().X-.1;
        const bool Violates=Additional>1.e-8 && Maximum>=Additional;
        bRejectedFullDepthStep|=Violates;
        return Violates;
    };
    TestTrue(TEXT("Actual line proposal is constrained beyond the derivative probe"),
        FFlowArtsArmClearance::RefinePreparedCandidate(Snapshot,BoundarySeed,Refined,Result));
    TestTrue(TEXT("Regression exercises a violating full depth step"),bRejectedFullDepthStep);
    TestTrue(TEXT("Projected line proposal retains the safe depth coordinate"),
        Refined.HandTranslationCm[0].Equals(BoundarySeed.HandTranslationCm[0],1.e-8));
    TestTrue(TEXT("Projected line proposal retains useful angular descent"),
        FVector::DistSquared(Refined.SolvedElbows[0],BoundaryElbow)<
        FVector::DistSquared(BoundarySeed.SolvedElbows[0],BoundaryElbow));
    Snapshot.MinPreparedCommonDepthCm=-16.;
    G.FindPreparedDepthEscape={};
    const FVector DesiredCommonHand=Seed.SolvedWrists[0]-FVector(2,0,0);
    const FVector DesiredCommonOther=Seed.SolvedWrists[1]-FVector(2,0,0);
    G.MakePreparedContactObjective=[DesiredCommonHand,DesiredCommonOther](const FFlowArtsClearanceArm*,const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&)->FFlowArtsPreparedContactObjective
    {
        return [DesiredCommonHand,DesiredCommonOther](const FFlowArtsClearanceArm* Arms,const FQuat&,
            const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&)
        { return FVector::DistSquared(Arms[0].Wrist.GetLocation(),DesiredCommonHand)+
            FVector::DistSquared(Arms[1].Wrist.GetLocation(),DesiredCommonOther); };
    };
    TestTrue(TEXT("Exact witnesses can move the common pattern normal coordinate"),
        FFlowArtsArmClearance::RefinePreparedCandidate(Snapshot,Seed,Refined,Result));
    TestTrue(TEXT("Common refinement preserves pair-relative pattern and bounded step"),
        Refined.HandTranslationCm[0].Equals(Refined.HandTranslationCm[1],1.e-8) &&
        Refined.HandTranslationCm[0].X<0. && Refined.HandTranslationCm[0].X>=-.500001);
    TestFalse(TEXT("Common objective never overrides rejected full certificate"),Result.bFeasible);
    auto CommonSeed=Seed;
    CommonSeed.HandTranslationCm[0]=FVector(-11,0,0);
    CommonSeed.HandTranslationCm[1]=FVector(-13,0,0);
    TestTrue(TEXT("Common and relative coordinates survive fresh reconstruction"),
        FFlowArtsArmClearance::PrepareCandidate(Snapshot,0,&CommonSeed,Refined,Result));
    TestTrue(TEXT("Fresh wrists preserve common shift and relative depth independently"),
        Refined.SolvedWrists[0].Equals(Seed.SolvedWrists[0]+FVector(-11,0,0),1.e-8) &&
        Refined.SolvedWrists[1].Equals(Seed.SolvedWrists[1]+FVector(-13,0,0),1.e-8));
    FFlowArtsArmClearancePreparedSeed CommonMiddle,CommonChecked;
    TestTrue(TEXT("Common coordinate interpolates through actual track midpoint"),
        FFlowArtsArmClearance::InterpolatePreparedSeed(Seed,Refined,.5,CommonMiddle) &&
        FFlowArtsArmClearance::PrepareCandidate(Snapshot,0,&CommonMiddle,CommonChecked,Result));
    TestTrue(TEXT("Midpoint reconstructs both shifts without losing common component"),
        CommonChecked.HandTranslationCm[0].Equals(FVector(-5.5,0,0),1.e-8) &&
        CommonChecked.HandTranslationCm[1].Equals(FVector(-6.5,0,0),1.e-8));
    const FVector DesiredEscapedLeft=Refined.SolvedWrists[0]+FVector(1,0,0);
    const FVector DesiredEscapedRight=Refined.SolvedWrists[1]-FVector(1,0,0);
    G.MakePreparedContactObjective=[DesiredEscapedLeft,DesiredEscapedRight](
        const FFlowArtsClearanceArm*,const FQuat&,const TArray<FFlowArtsClearanceCapsule>&,
        const TArray<FFlowArtsClearanceCapsule>&)->FFlowArtsPreparedContactObjective
    {
        return [DesiredEscapedLeft,DesiredEscapedRight](const FFlowArtsClearanceArm* Arms,const FQuat&,
            const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&)
        { return FVector::DistSquared(Arms[0].Wrist.GetLocation(),DesiredEscapedLeft)+
            FVector::DistSquared(Arms[1].Wrist.GetLocation(),DesiredEscapedRight); };
    };
    G.FindPreparedDepthEscape=[](const FFlowArtsClearanceArm*,const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&,
        const FVector&,double Maximum,double& Additional)
    { Additional=1.; return Maximum>=Additional; };
    TestTrue(TEXT("Signed hand escape retains existing whole-pattern placement"),
        FFlowArtsArmClearance::RefinePreparedCandidate(Snapshot,Refined,CommonChecked,Result));
    TestTrue(TEXT("Hand escape changes relative depth without erasing common offset"),
        CommonChecked.HandTranslationCm[0].Equals(FVector(-10,0,0),1.e-8) &&
        CommonChecked.HandTranslationCm[1].Equals(FVector(-14,0,0),1.e-8));
    CommonSeed.HandTranslationCm[0]=FVector(-12,3,4);
    CommonSeed.HandTranslationCm[1]=FVector(-32,3,4);
    TestTrue(TEXT("Overbound common seed is rebuilt under both constraints"),
        FFlowArtsArmClearance::PrepareCandidate(Snapshot,0,&CommonSeed,CommonChecked,Result));
    TestTrue(TEXT("Independent bounds retain bounded lateral shift and remove overbound height"),
        CommonChecked.HandTranslationCm[0].Equals(FVector(-8,3,0),1.e-8) &&
        CommonChecked.HandTranslationCm[1].Equals(FVector(-24,3,0),1.e-8));
    Snapshot.MinPreparedCommonDepthCm=std::numeric_limits<double>::quiet_NaN();
    TestFalse(TEXT("Nonfinite common bound fails closed"),
        FFlowArtsArmClearance::PrepareCandidate(Snapshot,0,&CommonSeed,CommonChecked,Result));
    Snapshot.MinPreparedCommonDepthCm=-16.;
    G.MakePreparedContactObjective={};
    TestFalse(TEXT("Missing exact witness objective fails closed"),
        FFlowArtsArmClearance::RefinePreparedCandidate(Snapshot,Seed,Refined,Result));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestStanceContinuityTest,"FlowArts.Runtime.Stance.SolvedContinuity",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FFlowFestStanceContinuityTest::RunTest(const FString&)
{
    FFlowArtsArmClearancePreparedSeed A,B; A.bValid=A.bAbsoluteControls=true;
    A.ElbowPole[0]=A.ElbowPole[1]=FVector::ForwardVector; B=A;
    TestTrue(TEXT("Identical solved frames continuous"),FFlowFestStancePreparation::ContinuousArms(A,B,1./60.));
    B.SolvedUpperRotation[1]=FQuat(FVector::UpVector,FMath::DegreesToRadians(123.));
    TestFalse(TEXT("Bone twist cliff rejected even with fixed joints"),FFlowFestStancePreparation::ContinuousArms(A,B,1./60.));
    B=A; B.SolvedElbows[0]=FVector(6,0,0);
    TestFalse(TEXT("Fast elbow rejected"),FFlowFestStancePreparation::ContinuousArms(A,B,1./60.));
    TestTrue(TEXT("Same displacement allowed over adequate duration"),FFlowFestStancePreparation::ContinuousArms(A,B,1./30.));
    B=A; B.SolvedHeadCenter=FVector(6,0,0);
    TestFalse(TEXT("Fast realized head translation rejected"),
        FFlowFestStancePreparation::ContinuousArms(A,B,1./60.));
    TestTrue(TEXT("Realized head translation allowed over adequate duration"),
        FFlowFestStancePreparation::ContinuousArms(A,B,1./30.));
    B=A; B.SolvedHeadRotation=FQuat(FVector::UpVector,FMath::DegreesToRadians(20.));
    TestFalse(TEXT("Fast realized head rotation rejected"),
        FFlowFestStancePreparation::ContinuousArms(A,B,1./60.));
    B=A; B.SolvedElbows[0]=FVector(6,0,0);
    const double FastExcess=FlowFestStanceDetail::ArmRateExcess(A,B,1./60.);
    const double FastMerit=FlowFestStanceDetail::ArmRateMerit(A,B,1./60.);
    B.SolvedElbows[0]=FVector(5.5,0,0);
    TestFalse(TEXT("Reduced but excessive elbow rate remains rejected"),
        FFlowFestStancePreparation::ContinuousArms(A,B,1./60.));
    TestTrue(TEXT("Continuous excess rewards a partial rate repair without accepting it"),
        FlowFestStanceDetail::ArmRateExcess(A,B,1./60.)<FastExcess &&
        FlowFestStanceDetail::ArmRateMerit(A,B,1./60.)<FastMerit);
    int32 ActiveSource=INDEX_NONE,ActiveDimension=INDEX_NONE;
    double ActiveDirection=0.;
    bool bCenterHeight=false,bLeftPole=false,bRightYaw=false,bCenterLateral=false;
    for(int32 Step=0;Step<96;++Step)
    {
        FlowFestStanceDetail::SelectJointControl(16,46,32,Step,false,0,
            ActiveSource,ActiveDimension,ActiveDirection);
        bCenterHeight |= ActiveSource==32 && ActiveDimension==1;
        bLeftPole |= ActiveSource==30 && ActiveDimension==0;
        bRightYaw |= ActiveSource==34 && ActiveDimension==2;
        bCenterLateral |= ActiveSource==32 && ActiveDimension==8;
    }
    TestTrue(TEXT("Bounded control search reaches coupled controls on all active sources"),
        bCenterHeight && bLeftPole && bRightYaw && bCenterLateral);
    FlowFestStanceDetail::SelectJointControl(16,46,32,4,false,0,
        ActiveSource,ActiveDimension,ActiveDirection);
    TestEqual(TEXT("Rejected source height is reached before broad search starvation"),ActiveSource,32);
    TestEqual(TEXT("Rejected source height dimension is selected"),ActiveDimension,1);
    FlowFestStanceDetail::SelectJointControl(16,46,33,4,false,0,
        ActiveSource,ActiveDimension,ActiveDirection);
    TestEqual(TEXT("Odd rejection schedules the preceding source height"),ActiveSource,32);
    FlowFestStanceDetail::SelectJointControl(16,46,40,4,false,0,
        ActiveSource,ActiveDimension,ActiveDirection);
    TestEqual(TEXT("Active schedule shifts with the rejected source"),ActiveSource,40);
    FlowFestStanceDetail::SelectJointControl(16,32,32,16,false,0,
        ActiveSource,ActiveDimension,ActiveDirection);
    TestEqual(TEXT("Boundary schedule uses distinct movable neighbor"),ActiveSource,30);
    FlowFestStanceDetail::SelectJointControl(0,14,0,4,true,0,
        ActiveSource,ActiveDimension,ActiveDirection);
    TestEqual(TEXT("Unanchored start search includes source zero"),ActiveSource,0);
    TestEqual(TEXT("Unanchored start tests a height control"),ActiveDimension,1);
    constexpr int32 PreferredArms[3]={0,1,INDEX_NONE};
    for(int32 PreferredArm : PreferredArms)
        for(int32 Sweep=0;Sweep<2;++Sweep)
        {
            bool Seen[3][9][2]={};
            for(int32 Offset=0;Offset<48;++Offset)
            {
                FlowFestStanceDetail::SelectJointControl(16,46,32,Sweep*48+Offset,false,
                    PreferredArm,ActiveSource,ActiveDimension,ActiveDirection);
                const int32 SourceSlot=ActiveSource==32 ? 0 : ActiveSource==34 ? 1 :
                    ActiveSource==30 ? 2 : INDEX_NONE;
                TestTrue(TEXT("Every scheduled source remains one of three distinct neighbors"),SourceSlot>=0);
                if(SourceSlot>=0 && ActiveDimension>=0 && ActiveDimension<9)
                    Seen[SourceSlot][ActiveDimension][ActiveDirection<0. ? 1 : 0]=true;
            }
            for(int32 SourceSlot=0;SourceSlot<3;++SourceSlot)
                for(int32 Dimension : {0,1,2,3,5,6,7,8})
                    for(int32 Direction=0;Direction<2;++Direction)
                        TestTrue(TEXT("Each sweep visits both signs of every active control per source"),
                            Seen[SourceSlot][Dimension][Direction]);
        }
    FlowFestStanceDetail::SelectJointControl(16,46,32,0,false,1,
        ActiveSource,ActiveDimension,ActiveDirection);
    TestEqual(TEXT("Right forearm witness leads with right pole"),ActiveDimension,5);
    FlowFestStanceDetail::SelectJointControl(16,46,32,2,false,1,
        ActiveSource,ActiveDimension,ActiveDirection);
    TestEqual(TEXT("Right forearm witness visits right clavicle next"),ActiveDimension,7);
    FlowFestStanceDetail::SelectJointControl(16,46,32,48,false,INDEX_NONE,
        ActiveSource,ActiveDimension,ActiveDirection);
    TestEqual(TEXT("Missing witness balances the second sweep toward right arm"),ActiveDimension,5);
    auto P=Plan(); TArray<FFlowFestStanceKnot> Missing;
    FFlowFestStancePreparation Incomplete(P,MoveTemp(Missing),30);
    TestTrue(TEXT("Incomplete track fails closed"),Incomplete.IsFailed());
    TestFalse(TEXT("Incomplete cannot publish"),Incomplete.IsCandidateReady());
    // An unreachable support foot cannot be repaired by any arm certificate. Verify
    // whole-track reach preflight rejects without invoking a single skin query.
    int32 SkinBindings=0;
    TArray<FFlowFestStanceKnot> Unreachable;
    for(int32 I=0; I<300; ++I)
    {
        FFlowFestStanceKnot K; K.Seconds=P.Duration*I/300.; K.Pose=Pose();

        K.Clearance.bValid=true;
        K.Clearance.Geometry.Arms[0].Upper=FTransform(FVector(0,-20,140));
        K.Clearance.Geometry.Arms[1].Upper=FTransform(FVector(0,20,140));
        K.Clearance.RebuildSkin=[&](const TArray<FTransform>&,FFlowArtsArmClearanceInput&) { ++SkinBindings; return false; };
        Unreachable.Add(MoveTemp(K));
    }
    // Make a leg target unreachable, independent of the synthetic source limb lengths.
    P.InitialFeet[0].AddToTranslation(FVector(1000,0,0));
    FFlowFestStancePreparation Preflight(P,MoveTemp(Unreachable),30);
    for(int32 I=0; I<1000 && !Preflight.IsFailed(); ++I) Preflight.Step(.05);
    TestTrue(TEXT("Unreachable complete track terminates"),Preflight.IsFailed());
    TestEqual(TEXT("Reach preflight uses no skin factories"),SkinBindings,0);
    TestFalse(TEXT("Reach failure never publishes"),Preflight.IsCandidateReady());
    int32 FootQueries=0;
    TArray<FFlowFestStanceKnot> BelowGround;
    for(int32 I=0;I<300;++I)
    {
        FFlowFestStanceKnot K; K.Seconds=5.*I/300.; K.Pose=Pose(); K.Clearance.bValid=true;
        K.Clearance.Geometry.Arms[0].Upper=FTransform(FVector(0,-20,140));
        K.Clearance.Geometry.Arms[1].Upper=FTransform(FVector(0,20,140));
        K.Clearance.EvaluateFootSurfaces=[&](const TArray<FTransform>&,TArray<FVector>& L,TArray<FVector>& R)
        { ++FootQueries; L={FVector(0,-10,-1)}; R={FVector(0,10,0)}; return true; };
        K.Clearance.RebuildSkin=[&](const TArray<FTransform>&,FFlowArtsArmClearanceInput&) { ++SkinBindings; return false; };
        BelowGround.Add(MoveTemp(K));
    }
    FFlowFestStancePreparation Grounded(Plan(),MoveTemp(BelowGround),30);
    for(int32 I=0;I<1000 && !Grounded.IsFailed();++I) Grounded.Step(.05);
    TestTrue(TEXT("Weighted shoe penetration rejects whole track"),Grounded.IsFailed());
    TestEqual(TEXT("Rejected support trial stops at first knot"),FootQueries,FFlowFestStancePreparation::MaxPlans);
    TestEqual(TEXT("Invalid sole never reaches arm skin search"),SkinBindings,0);
    TestTrue(TEXT("Failure preserves exact weighted-foot reason"),Grounded.GetFailure().Contains(TEXT("Weighted left foot ground gap -1.000000cm")));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestStanceClearanceFrameTest,"FlowArts.Runtime.Stance.FreshCertificateFrame",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FFlowFestStanceClearanceFrameTest::RunTest(const FString&)
{
    FFlowArtsArmClearancePreparationSnapshot Source,Placed; Source.bValid=true;
    Source.Geometry.SurfacePaddingCm=.3f;
    Source.Geometry.BodyCapsules.Add({FVector(0,0,80),FVector(0,0,140),15.f});
    Source.Geometry.HeldPropCapsules[0].Add({FVector(20,0,100),FVector(20,0,150),1.f});
    Source.Geometry.Arms[0].Upper=FTransform(FVector(0,-20,140));
    Source.Geometry.Arms[1].Upper=FTransform(FVector(0,20,140));
    const FTransform Body(FQuat(FVector::UpVector,PI/2),FVector(20,10,0));
    FFlowArtsClearanceArm Arms[2]={Source.Geometry.Arms[0],Source.Geometry.Arms[1]};
    for(auto& Arm:Arms) { Arm.Clavicle=Arm.Clavicle*Body; Arm.Upper=Arm.Upper*Body; Arm.Elbow=Arm.Elbow*Body; Arm.Wrist=Arm.Wrist*Body; }
    int32 Queries=0;
    const TArray<FTransform> Posed={FTransform(FVector(4,5,6)),FTransform(FVector(0,20,10))};
    TestFalse(TEXT("Rigid-only skin cannot certify a planted stance"),Source.PlaceBody(Body,Arms,Posed,Placed));
    Source.RebuildSkin=[&](const TArray<FTransform>& Components,FFlowArtsArmClearanceInput& G)
    {
        TestTrue(TEXT("Complete planted pose reaches skin factory"),Components.Num()==2 && Components[1].Equals(Posed[1]));
        G.CertifySkinnedUpperTorso=[&,Captured=Components](const FFlowArtsClearanceArm* Query,const FQuat&,bool)
        {
            ++Queries;
            TestTrue(TEXT("Fresh skin query uses realized world frame"),Query[0].Upper.Equals(Arms[0].Upper,1.e-8));
            TestTrue(TEXT("Planted leg is retained rather than rigid body map"),Captured[1].Equals(Posed[1]));
            return uint8(0);
        };
        return true;
    };
    if(!TestTrue(TEXT("Body snapshot placed"),Source.PlaceBody(Body,Arms,Posed,Placed))) return false;
    TestEqual(TEXT("No certificate during mapping"),Queries,0);
    TestTrue(TEXT("Moved body retains original pattern targets"),Placed.Geometry.bHasPreparedHandTargets &&
        Placed.Geometry.PreparedHandTargets[0].Equals(Source.Geometry.Arms[0].Wrist,1.e-12) &&
        Placed.Geometry.PreparedHandTargets[1].Equals(Source.Geometry.Arms[1].Wrist,1.e-12));
    TestEqual(TEXT("Padding unchanged"),Placed.Geometry.SurfacePaddingCm,.3f);
    TestTrue(TEXT("Pattern prop remains fixed"),Placed.Geometry.HeldPropCapsules[0][0].Start.Equals(Source.Geometry.HeldPropCapsules[0][0].Start));
    TestTrue(TEXT("Body capsule transformed"),Placed.Geometry.BodyCapsules[0].Start.Equals(Body.TransformPosition(Source.Geometry.BodyCapsules[0].Start),1.e-8));
    TestEqual(TEXT("Rejected witness stays rejected"),Placed.Geometry.CertifySkinnedUpperTorso(Arms,FQuat::Identity,true),uint8(0));
    TestEqual(TEXT("Certificate freshly queried"),Queries,1);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestStanceNativeSkinTest,"FlowArts.Runtime.Stance.NativePlantedSkin",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FFlowFestStanceNativeSkinTest::RunTest(const FString&)
{
    USkeletalMesh* Mesh=LoadObject<USkeletalMesh>(nullptr,TEXT("/Game/FlowFest/Characters/x_bot/SK_x_bot.SK_x_bot"));
    UAnimSequence* Idle=LoadObject<UAnimSequence>(nullptr,TEXT("/Game/FlowFest/Characters/x_bot/A_Idle.A_Idle"));
    if(!TestNotNull(TEXT("Native x-bot mesh"),Mesh) || !TestNotNull(TEXT("Native idle"),Idle)) return false;
    FFlowArtsArmClearanceRigEnvelope Envelope; FString Error;
    if(!TestTrue(TEXT("Measured complete skin"),FFlowArtsArmClearance::MeasureRig(Mesh,Envelope,Error))) return false;
    const auto& Ref=Mesh->GetRefSkeleton();
    TArray<FBoneIndexType> Required;
    for(int32 I=0; I<Ref.GetNum(); ++I) Required.Add(I);
    const FMemMark Mark(FMemStack::Get());
    FBoneContainer Container(Required,UE::Anim::FCurveFilterSettings(),*Mesh);
    FPoseContext Native(Container); Native.ResetToRefPose();
    FAnimationPoseData Data(Native); Idle->GetAnimationPose(Data,FAnimExtractContext(.2,false));
    FFlowFestStancePose Before,After;
    if(!TestTrue(TEXT("Capture native chains"),FFlowFestStancePlan::Capture(Native,Before))) return false;
    FFlowArtsArmClearancePreparationSnapshot Original,Placed,Fresh;
    if(!TestTrue(TEXT("Capture original complete skin factory"),FFlowArtsArmClearance::CapturePreparationSnapshot(
        Native,{},{},Envelope,FVector::OneVector,Original))) return false;
    FFlowFestStanceSample Sample; Sample.BodyDelta=FTransform(FVector(0,0,-2));
    for(int32 Side=0;Side<2;++Side) Sample.Feet[Side]=Before.Components[Before.End[Side]];
    if(!TestTrue(TEXT("Native planted hip accommodation"),FFlowFestStancePlan::Apply(Before,Sample,After,&Error)))
    { AddError(Error); return false; }
    FFlowArtsClearanceArm Arms[2];
    for(int32 Side=0;Side<2;++Side)
    {
        Arms[Side]=Original.Geometry.Arms[Side];
        Arms[Side].Clavicle=Arms[Side].Clavicle*Sample.BodyDelta;
        Arms[Side].Upper=After.Components[After.Upper[Side+2]];
        Arms[Side].Elbow=After.Components[After.Middle[Side+2]];
        Arms[Side].Wrist=After.Components[After.End[Side+2]];
    }
    if(!TestTrue(TEXT("Full realized skin rebound"),Original.PlaceBody(Sample.BodyDelta,Arms,After.Components,Placed))) return false;
    FCSPose<FCompactPose> Components; Components.InitPose(Native.Pose);
    for(int32 I=0; I<After.Components.Num(); ++I) Components.SetComponentSpaceTransform(FCompactPoseBoneIndex(I),After.Components[I]);
    FCSPose<FCompactPose>::ConvertComponentPosesToLocalPosesSafe(Components,Native.Pose);
    if(!TestTrue(TEXT("Independent final-pose skin capture"),FFlowArtsArmClearance::CapturePreparationSnapshot(
        Native,{},{},Envelope,FVector::OneVector,Fresh))) return false;
    const auto& Skin=*Envelope.SkinnedClearance;
    const auto& Skeleton=Mesh->GetSkeleton()->GetReferenceSkeleton();
    TArray<FTransform> ActualMesh,RigidMesh;
    for(int32 I=0; I<Skin.ReferenceBoneNames.Num(); ++I)
    {
        const int32 Compact=Container.GetCompactPoseIndexFromSkeletonIndex(Skeleton.FindBoneIndex(Skin.ReferenceBoneNames[I])).GetInt();
        if(!After.Components.IsValidIndex(Compact)) return false;
        ActualMesh.Add(After.Components[Compact]); RigidMesh.Add(Before.Components[Compact]*Sample.BodyDelta);
    }
    TArray<FVector> ActualPoints, RigidPoints;
    TArray<double> LegWeights;
    int32 OriginalFootVertex=INDEX_NONE; double FootDifference=0.;
    for(const auto& Vertex:Skin.Vertices)
    {
        FVector Actual=FVector::ZeroVector,Rigid=FVector::ZeroVector; double LegWeight=0.,FootWeight=0.;
        for(int32 J=0;J<Vertex.InfluenceCount;++J)
        {
            const auto& Influence=Skin.Influences[Vertex.FirstInfluence+J];
            Actual+=ActualMesh[Influence.Bone].TransformPosition(Influence.BoneLocalPosition)*Influence.Weight;
            Rigid+=RigidMesh[Influence.Bone].TransformPosition(Influence.BoneLocalPosition)*Influence.Weight;
            const FString Name=Skin.ReferenceBoneNames[Influence.Bone].ToString();
            if(Name.Contains(TEXT("Leg")) || Name.Contains(TEXT("Foot")) || Name.Contains(TEXT("Toe"))) LegWeight+=Influence.Weight;
            if(Name.Contains(TEXT("Foot")) || Name.Contains(TEXT("Toe"))) FootWeight+=Influence.Weight;
        }
        if(FootWeight>.9 && FVector::Dist(Actual,Rigid)>FootDifference)
        { OriginalFootVertex=ActualPoints.Num(); FootDifference=FVector::Dist(Actual,Rigid); }
        ActualPoints.Add(Actual); RigidPoints.Add(Rigid); LegWeights.Add(LegWeight);
    }
    // Preserve the original regression witness: this visible planted foot was
    // 82 cm from the trunk-only coverage, despite moving 2 cm under leg IK.
    double LargestDifference=0.,FootSurfaceGap=TNumericLimits<double>::Max(); FVector LegWitness=FVector::ZeroVector;
    const auto InspectTriangles=[&](const TArray<FIntVector>& Triangles)
    {
        for(const FIntVector& T:Triangles)
        {
            if(OriginalFootVertex!=INDEX_NONE) FootSurfaceGap=FMath::Min(FootSurfaceGap,FVector::Dist(ActualPoints[OriginalFootVertex],
                FMath::ClosestPointOnTriangleToPoint(ActualPoints[OriginalFootVertex],ActualPoints[T.X],ActualPoints[T.Y],ActualPoints[T.Z])));
            if((LegWeights[T.X]+LegWeights[T.Y]+LegWeights[T.Z])/3.<.9) continue;
            const FVector Actual=(ActualPoints[T.X]+ActualPoints[T.Y]+ActualPoints[T.Z])/3.;
            const FVector Rigid=(RigidPoints[T.X]+RigidPoints[T.Y]+RigidPoints[T.Z])/3.;
            if(FVector::Dist(Actual,Rigid)>LargestDifference)
            { LargestDifference=FVector::Dist(Actual,Rigid); LegWitness=Actual; }
        }
    };
    InspectTriangles(Skin.BodyTriangles);
    InspectTriangles(Skin.BodyPropBoundaryTriangles);
    AddInfo(FString::Printf(TEXT("Original foot witness vertex=%d displacement=%.6fcm nearest covered original body face=%.6fcm"),OriginalFootVertex,FootDifference,FootSurfaceGap));
    TestTrue(TEXT("Original planted foot is outside trunk-only coverage"),FootSurfaceGap>50.);
    for (const auto& Region : Skin.LowerBodyRegions) InspectTriangles(Region.Triangles);
    TestTrue(TEXT("Original foot witness belongs to covered lower-body faces"),FootSurfaceGap<1.e-8);
    TestTrue(TEXT("Covered planted leg skin differs materially from rigid body skin"),LargestDifference>.5);
    if(!TestTrue(TEXT("Exact foot surface factory available"),bool(Original.EvaluateFootSurfaces))) return false;
    TArray<FVector> FootPoints[2],FreshFootPoints[2];
    TestTrue(TEXT("Complete planted pose skins foot surfaces"),Original.EvaluateFootSurfaces(After.Components,FootPoints[0],FootPoints[1]));
    TestTrue(TEXT("Independent pose skins same foot surfaces"),Fresh.EvaluateFootSurfaces(After.Components,FreshFootPoints[0],FreshFootPoints[1]));
    for(int32 Side=0;Side<2;++Side)
    {
        const FName Name(Side ? TEXT("RightFoot") : TEXT("LeftFoot"));
        const auto* Region=Skin.LowerBodyRegions.FindByPredicate([&](const auto& R) { return Skin.ReferenceBoneNames[R.Bone]==Name; });
        if(!TestNotNull(TEXT("Original weighted foot region"),Region)) return false;
        TestEqual(TEXT("All mixed foot-face vertices sampled"),FootPoints[Side].Num(),Region->Vertices.Num());
        if(FootPoints[Side].Num()!=Region->Vertices.Num() || FreshFootPoints[Side].Num()!=FootPoints[Side].Num()) return false;
        for(int32 I=0;I<FootPoints[Side].Num();++I)
        {
            if(!FootPoints[Side][I].Equals(ActualPoints[Region->Vertices[I]],1.e-8) ||
                !FootPoints[Side][I].Equals(FreshFootPoints[Side][I],1.e-8))
            { AddError(TEXT("Foot surface differs from independently weighted final native skin")); return false; }
        }
    }
    TestFalse(TEXT("Missing complete pose rejects foot surfaces"),Original.EvaluateFootSurfaces({},FootPoints[0],FootPoints[1]));
    TestTrue(TEXT("Failed foot sample cannot expose stale points"),FootPoints[0].IsEmpty() && FootPoints[1].IsEmpty());
    if(!TestTrue(TEXT("Original foot witness remains available"),OriginalFootVertex!=INDEX_NONE)) return false;
    LegWitness=ActualPoints[OriginalFootVertex];
    const TArray<FFlowArtsClearanceCapsule> FootProp={{LegWitness,LegWitness+FVector(0,0,.01),.01f}};
    if(!TestTrue(TEXT("Final body prop query available"),bool(Fresh.Geometry.CertifySkinnedHeldPropBody))) return false;
    const uint8 ActualBody=Fresh.Geometry.CertifySkinnedHeldPropBody(Arms,FQuat::Identity,FootProp,{},1);
    TestEqual(TEXT("Prop touching actual planted leg surface is rejected"),ActualBody,uint8(0));
    TestEqual(TEXT("Rebound factory sees same planted-leg contact"),Placed.Geometry.CertifySkinnedHeldPropBody(
        Arms,FQuat::Identity,FootProp,{},1),ActualBody);
    const TArray<FFlowArtsClearanceCapsule> DistantProp={{FVector(1000,1000,1000),FVector(1000,1000,1001),.01f}};
    TestEqual(TEXT("Lower-body coverage retains distant prop certificate"),
        Fresh.Geometry.CertifySkinnedHeldPropBody(Arms,FQuat::Identity,DistantProp,{},1),uint8(32));
    for(const FQuat Rotation : {FQuat::Identity,FQuat(FVector::UpVector,.03)})
    {
        TestEqual(TEXT("Fresh upper/body/pair result equals direct final capture"),Placed.Geometry.CertifySkinnedUpperTorso(
            Arms,Rotation,true),Fresh.Geometry.CertifySkinnedUpperTorso(Arms,Rotation,true));
        TestEqual(TEXT("Fresh distal result equals direct final capture"),Placed.Geometry.CertifySkinnedSegments(
            Arms,Rotation,FootProp,{},51),Fresh.Geometry.CertifySkinnedSegments(Arms,Rotation,FootProp,{},51));
        const uint8 Separate=Fresh.Geometry.CertifySkinnedUpperTorso(Arms,Rotation,true) |
            Fresh.Geometry.CertifySkinnedOppositeProps(Arms,Rotation,FootProp,FootProp,3) |
            Fresh.Geometry.CertifySkinnedHeldPropBody(Arms,Rotation,FootProp,FootProp,3);
        const uint8 SeparateSegments=Fresh.Geometry.CertifySkinnedSegments(Arms,Rotation,FootProp,FootProp,51);
        TestEqual(TEXT("Candidate-local combined query equals independent fresh queries"),
            Placed.Geometry.CertifySkinnedCandidate(Arms,Rotation,true,FootProp,FootProp,3,3,51),
            uint16(uint16(Separate)|(uint16(SeparateSegments)<<8)));
    }
    TestFalse(TEXT("Missing full compact pose cannot bind skin"),Original.PlaceBody(Sample.BodyDelta,Arms,{},Placed));
    return true;
}
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestStancePrefixAtomicTest,"FlowArts.Runtime.Stance.PrefixRepairAtomic",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FFlowFestStancePrefixAtomicTest::RunTest(const FString&)
{
    TArray<FFlowFestStanceKnot> Knots;
    Knots.SetNum(20);
    for(int32 I=0;I<Knots.Num();++I)
    {
        Knots[I].Seconds=I*.25; Knots[I].Pose=Pose(); Knots[I].Clearance.bValid=true;
        for(int32 Side=0;Side<2;++Side)
            Knots[I].Clearance.Geometry.Arms[Side].Upper=Knots[I].Pose.Components[Knots[I].Pose.Upper[Side+2]];
    }
    FFlowFestStancePreparation Worker(Plan(),MoveTemp(Knots),2);
    if(!TestFalse(TEXT("Fixture is a valid preparation input"),Worker.IsFailed())) return false;
    Worker.Knot=9; Worker.Clear=9;
    for(int32 I=0;I<Worker.Knot;++I)
    {
        auto& Seed=Worker.CurrentSeeds[I]; Seed.bValid=Seed.bAbsoluteControls=true;
        Seed.HandTranslationCm[0]=FVector(I,0,0);
    }
    const auto Before=Worker.CurrentSeeds;
    auto Target=Before[8]; Target.HandTranslationCm[0]=FVector(7,1,0);
    Worker.BeginPrefixRepair(Target);
    TestEqual(TEXT("Odd target includes a time-derived right reconnection window"),Worker.RepairEnd,14);
    TestEqual(TEXT("Repair begins at a source endpoint"),Worker.RepairStart%2,0);
    // A later certificate or boundary failure must discard even earlier successful
    // scratch solves. Neither prior accepted prefix nor public output may change.
    Worker.RepairSeeds[Worker.RepairStart].HandTranslationCm[0]=FVector(999,0,0);
    Worker.RejectPrefixRepair(TEXT("Injected exact midpoint rejection"));
    TestEqual(TEXT("Only one wider bounded retry"),Worker.RepairAttempt,1);
    for(int32 I=0;I<9;++I)
        TestTrue(TEXT("Retry retains original prefix"),Worker.CurrentSeeds[I].HandTranslationCm[0].Equals(Before[I].HandTranslationCm[0],0.));
    auto Endpoint=Target; Endpoint.HandTranslationCm[0]=FVector(5,2,0);
    TestTrue(TEXT("Certified endpoint may rebase once"),Worker.RebasePrefixRepair(Endpoint));
    TestTrue(TEXT("Rebase replaces the target"),Worker.RepairTarget.HandTranslationCm[0].Equals(Endpoint.HandTranslationCm[0],0.));
    TestEqual(TEXT("Rebase starts the shorter bounded window"),Worker.RepairAttempt,0);
    TestFalse(TEXT("Second endpoint rebase is forbidden"),Worker.RebasePrefixRepair(Target));
    for(int32 I=0;I<9;++I)
    {
        TestTrue(TEXT("Rebase retains accepted prefix"),Worker.CurrentSeeds[I].HandTranslationCm[0].Equals(Before[I].HandTranslationCm[0],0.));
        TestTrue(TEXT("Rebase discards scratch edits"),Worker.RepairSeeds[I].HandTranslationCm[0].Equals(Before[I].HandTranslationCm[0],0.));
    }
    // A feasible independently solved odd pose is not the interpolation that
    // playback evaluates. Exercise the fresh certificate on both geometries.
    FFlowArtsArmClearancePreparationSnapshot MidSnapshot;
    MidSnapshot.bValid=true;
    auto& Geometry=MidSnapshot.Geometry;
    Geometry.bSourceFidelityOnly=true;
    Geometry.FixedHip=FVector(0,0,90); Geometry.Neck=FVector(0,0,150); Geometry.TorsoPivot=Geometry.FixedHip;
    const auto MidPose=Pose();
    for(int32 Side=0;Side<2;++Side)
    {
        Geometry.Arms[Side].Upper=MidPose.Components[MidPose.Upper[Side+2]];
        Geometry.Arms[Side].Elbow=MidPose.Components[MidPose.Middle[Side+2]];
        Geometry.Arms[Side].Wrist=MidPose.Components[MidPose.End[Side+2]];
    }
    const double OriginalY=Geometry.Arms[0].Wrist.GetLocation().Y;
    int32 MidQueries=0;
    Geometry.bCanCertifySkinnedUpperTorso=true;
    Geometry.CertifySkinnedUpperTorso=[&](const FFlowArtsClearanceArm* Arms,const FQuat&,bool)
    { ++MidQueries; return uint8(Arms[0].Wrist.GetLocation().Y>OriginalY+.5 ? 3 : 0); };
    FFlowArtsArmClearancePreparedSeed SourceControl,DirectOdd,InterpolatedOdd,CheckedOdd;
    FFlowArtsArmClearanceResult MidResult;
    TestTrue(TEXT("Source control builds"),FFlowArtsArmClearance::PrepareCandidate(MidSnapshot,0,nullptr,SourceControl,MidResult));
    auto OddProposal=SourceControl; OddProposal.HandTranslationCm[0].Y+=1.;
    TestTrue(TEXT("Independent odd pose builds"),FFlowArtsArmClearance::PrepareCandidate(MidSnapshot,0,&OddProposal,DirectOdd,MidResult));
    TestTrue(TEXT("Independent odd pose is certified"),MidResult.bFeasible);
    TestTrue(TEXT("Playback midpoint reconstructs from source controls"),
        FFlowArtsArmClearance::InterpolatePreparedSeed(SourceControl,SourceControl,.5,InterpolatedOdd));
    const int32 QueriesBeforeMidpoint=MidQueries;
    TestTrue(TEXT("Reconstructed midpoint is queried"),FFlowArtsArmClearance::PrepareCandidate(MidSnapshot,0,&InterpolatedOdd,CheckedOdd,MidResult));
    TestTrue(TEXT("Midpoint certificate is fresh"),MidQueries>QueriesBeforeMidpoint);
    TestFalse(TEXT("Clear independent odd pose cannot waive rejected interpolation"),MidResult.bFeasible);
    // Drive the actual repair pass: a certified absolute torso control must not
    // be replaced by the plan's fixed lean before source endpoints are queried.
    bool AllowRepairCertificate=true;
    const FQuat RepairRotation(FVector::UpVector,.1);
    auto RepairSnapshot=MidSnapshot;
    RepairSnapshot.Geometry.CertifySkinnedUpperTorso=[&](const FFlowArtsClearanceArm*,const FQuat& R,bool)
    { return uint8(AllowRepairCertificate && R.AngularDistance(RepairRotation)<1.e-6 ? 3 : 0); };
    RepairSnapshot.RebuildSkin=[](const TArray<FTransform>&,FFlowArtsArmClearanceInput&) { return true; };
    auto RotatedProposal=SourceControl;
    RotatedProposal.TorsoRotation=RepairRotation;
    FFlowArtsArmClearancePreparedSeed RotatedControl;
    TestTrue(TEXT("Absolute repair control builds"),FFlowArtsArmClearance::PrepareCandidate(
        RepairSnapshot,0,&RotatedProposal,RotatedControl,MidResult));
    TestTrue(TEXT("Absolute repair control has a fresh certificate"),MidResult.bFeasible);
    TArray<FFlowFestStanceKnot> RepairKnots;
    RepairKnots.SetNum(20);
    for(int32 I=0;I<RepairKnots.Num();++I)
    { RepairKnots[I].Seconds=I*.25; RepairKnots[I].Pose=MidPose; RepairKnots[I].Clearance=RepairSnapshot; }
    auto JointKnots=RepairKnots;
    auto PhaseZeroKnots=RepairKnots;
    auto PretargetKnots=RepairKnots;
    auto MeritKnots=RepairKnots;
    auto ActualJointKnots=RepairKnots;
    auto UnpublishedKnots=RepairKnots;
    ActualJointKnots[9].Clearance.Geometry.CertifySkinnedUpperTorso=[](const FFlowArtsClearanceArm*,const FQuat&,bool)
    { return uint8(0); };
    UnpublishedKnots[14].Clearance.Geometry.CertifySkinnedUpperTorso=[](const FFlowArtsClearanceArm*,const FQuat&,bool)
    { return uint8(0); };
    auto RepairPlan=Plan(); RepairPlan.Controls.HandDepthCm=0.;
    PhaseZeroKnots[0].Clearance.Geometry.CertifySkinnedUpperTorso=[](
        const FFlowArtsClearanceArm*,const FQuat&,bool) { return uint8(0); };
    FFlowFestStancePreparation PhaseZero(RepairPlan,MoveTemp(PhaseZeroKnots),2);
    for(int32 I=0;I<20;++I) PhaseZero.PosedKnots[I]=MidPose;
    PhaseZero.Knot=0; PhaseZero.Clear=0;
    PhaseZero.bKnotStarted=PhaseZero.bCandidateFound=true;
    PhaseZero.bKnotClear=false;
    PhaseZero.CandidateSeed=RotatedControl;
    PhaseZero.FinishKnot();
    TestTrue(TEXT("Colliding source zero enters bounded unanchored repair"),PhaseZero.bRepairing);
    TestEqual(TEXT("Phase-zero repair starts at its uncertified source"),PhaseZero.RepairStart,0);
    PhaseZero.StepPrefixRepair();
    TestTrue(TEXT("Rejected source zero admits joint recovery"),PhaseZero.bRepairJoint);
    TestEqual(TEXT("Joint recovery records source zero"),PhaseZero.RepairJointMidpoint,0);
    if(PhaseZero.bRepairJoint)
    {
        const int32 BaselineQueries=(PhaseZero.RepairEnd-PhaseZero.RepairStart)/2+1+
            (PhaseZero.RepairEnd-1+1)/2;
        for(int32 I=0;I<=BaselineQueries && PhaseZero.bRepairJoint;++I)
            PhaseZero.StepJointRepair();
        TestTrue(TEXT("Phase-zero recovery tests a changed source-zero profile"),
            PhaseZero.RepairJointRampIndex>0 && PhaseZero.RepairJointRampSeeds[0].bValid);
    }
    TestFalse(TEXT("Uncertified source zero is not published"),PhaseZero.CurrentSeeds[0].bValid);
    TestEqual(TEXT("No accepted phase-zero controls before forward and seam gates"),
        PhaseZero.AcceptedSeeds.Num(),0);
    TestFalse(TEXT("Phase-zero scratch search is not Ready"),PhaseZero.IsCandidateReady());
    auto TransportKnots=RepairKnots;
    FFlowFestStancePreparation Transport(RepairPlan,MoveTemp(TransportKnots),2);
    Transport.Knot=9; Transport.Clear=9;
    for(int32 I=0;I<20;++I)
    { Transport.CurrentSeeds[I]=RotatedControl; Transport.PosedKnots[I]=MidPose; }
    const auto OriginalTransport=Transport.CurrentSeeds;
    Transport.BeginPrefixRepair(RotatedControl);
    const int32 SourceQueries=(Transport.RepairEnd-Transport.RepairStart)/2+1;
    for(int32 I=0;I<SourceQueries;++I) Transport.StepPrefixRepair();
    TestTrue(TEXT("Production repair recertifies source endpoints without replacing torso control"),Transport.bRepairMidpoints);
    TestEqual(TEXT("Transported target needs no wider retry"),Transport.RepairAttempt,0);
    TestTrue(TEXT("Queried endpoint retains its absolute torso control"),
        Transport.RepairSeeds[Transport.RepairEnd].TorsoRotation.AngularDistance(RepairRotation)<1.e-6);
    // A coherent target can collide at a changed source before the originally
    // blocked knot. The accepted source is still a valid left-side baseline;
    // the real prefix worker must enter bounded joint repair at that source.
    PretargetKnots[6].Clearance.Geometry.CertifySkinnedUpperTorso=[](const FFlowArtsClearanceArm*,const FQuat&,bool)
    { return uint8(3); };
    FFlowFestStancePreparation Pretarget(RepairPlan,MoveTemp(PretargetKnots),2);
    Pretarget.Knot=9; Pretarget.Clear=9;
    for(int32 I=0;I<20;++I)
    { Pretarget.CurrentSeeds[I]=RotatedControl; Pretarget.PosedKnots[I]=MidPose; }
    const auto PretargetPublished=Pretarget.CurrentSeeds;
    auto ChangedTarget=RotatedControl;
    ChangedTarget.TorsoRotation=FQuat(FVector::UpVector,.15);
    Pretarget.BeginPrefixRepair(ChangedTarget);
    Pretarget.RepairStart=4; Pretarget.RepairIndex=4;
    for(int32 I=0;I<3 && Pretarget.bRepairing && !Pretarget.bRepairJoint;++I)
        Pretarget.StepPrefixRepair();
    TestTrue(TEXT("Changed pretarget source enters bounded joint repair"),Pretarget.bRepairJoint);
    TestEqual(TEXT("Joint repair records the changed pretarget source"),Pretarget.RepairJointMidpoint,8);
    if(Pretarget.bRepairJoint)
    {
        const int32 BaselineQueries=(Pretarget.RepairEnd-Pretarget.RepairStart)/2+1+
            (Pretarget.RepairEnd-FMath::Max(1,Pretarget.RepairStart-1)+1)/2;
        for(int32 I=0;I<=BaselineQueries && Pretarget.bRepairJoint;++I)
            Pretarget.StepJointRepair();
        TestTrue(TEXT("Pretarget joint enters a bounded profile trial"),Pretarget.RepairJointRampIndex>0);
    }
    for(int32 I=0;I<20;++I)
        TestTrue(TEXT("Pretarget joint leaves published controls untouched"),
            Pretarget.CurrentSeeds[I].TorsoRotation.AngularDistance(
                PretargetPublished[I].TorsoRotation)<1.e-6);
    TestFalse(TEXT("Pretarget joint cannot publish before full certificates"),Pretarget.IsCandidateReady());
    FFlowFestStancePreparation ActualJoint(RepairPlan,MoveTemp(ActualJointKnots),2);
    ActualJoint.Knot=9; ActualJoint.Clear=9;
    for(int32 I=0;I<20;++I)
    { if(I<9 && !(I%2)) ActualJoint.CurrentSeeds[I]=RotatedControl; ActualJoint.PosedKnots[I]=MidPose; }
    ActualJoint.BeginPrefixRepair(RotatedControl);
    TestFalse(TEXT("Normal source pass leaves accepted odd slots invalid"),ActualJoint.CurrentSeeds[7].bValid);
    TestTrue(TEXT("Unvisited right source receives a valid transport seed"),ActualJoint.RepairSeeds[12].bValid);
    for(int32 I=0;I<20 && !ActualJoint.bRepairJoint && ActualJoint.bRepairing;++I)
        ActualJoint.StepPrefixRepair();
    TestTrue(TEXT("Actual source then interpolated midpoint pass enters joint repair"),ActualJoint.bRepairJoint);
    TestEqual(TEXT("Actual joint branch records rejected midpoint"),ActualJoint.RepairJointMidpoint,9);
    FFlowFestStancePreparation Joint(RepairPlan,MoveTemp(JointKnots),2);
    Joint.Knot=9; Joint.Clear=9;
    for(int32 I=0;I<20;++I)
    { Joint.CurrentSeeds[I]=RotatedControl; Joint.PosedKnots[I]=MidPose; }
    const auto JointBefore=Joint.CurrentSeeds;
    Joint.BeginPrefixRepair(RotatedControl);
    Joint.RepairStart=4; Joint.RepairEnd=14;
    Joint.BeginJointRepair(9,MidResult);
    const int32 FirstBaseline=FMath::Max(1,Joint.RepairStart-1);
    const int32 BaselineQueries=(Joint.RepairEnd-Joint.RepairStart)/2+1+
        (Joint.RepairEnd-FirstBaseline+1)/2;
    for(int32 I=0;I<BaselineQueries;++I) Joint.StepJointRepair();
    TestTrue(TEXT("Joint baseline resumes one authored phase per step"),Joint.bRepairJoint);
    TestEqual(TEXT("Joint baseline finishes before bounded profile search"),Joint.RepairJointStep,0);
    AllowRepairCertificate=false;
    Joint.StepJointRepair();
    TestEqual(TEXT("Coherent window profile resumes one phase at a time"),Joint.RepairJointRampIndex,1);
    TestFalse(TEXT("Rejected joint step cannot publish"),Joint.IsCandidateReady());
    Joint.RepairJointOriginalSeeds=Joint.RepairSeeds;
    Joint.RepairJointRampVariant=4;
    Joint.RepairJointRampSeeds.Reset();
    Joint.StepJointRepair();
    TestTrue(TEXT("Coherent field has all scratch source slots"),Joint.RepairJointRampSeeds.Num()>14);
    if(Joint.RepairJointRampSeeds.Num()<=14) return false;
    for(int32 I : {6,8,10,12,14})
    {
        TestFalse(TEXT("Transition field visits each source through the mutable right frontier"),
            Joint.RepairJointRampSeeds[I].HandTranslationCm[0].Equals(
                Joint.RepairJointOriginalSeeds[I].HandTranslationCm[0],1.e-6));
        TestFalse(TEXT("Transition field carries a shared left pole branch"),
            Joint.RepairJointRampSeeds[I].ElbowPole[0].Equals(
                Joint.RepairJointOriginalSeeds[I].ElbowPole[0],1.e-6));
    }
    TestTrue(TEXT("Accepted left source remains fixed"),
        Joint.RepairJointRampSeeds[4].HandTranslationCm[0].Equals(
            Joint.RepairJointOriginalSeeds[4].HandTranslationCm[0],1.e-6));
    const auto NarrowField=Joint.RepairJointRampSeeds;
    // The right-arm profile is the geometric mirror of the left profile:
    // pole rotation, torso yaw, and lateral shift reverse sign; height does not.
    Joint.RepairJointRampVariant=7;
    Joint.RepairJointRampIndex=0;
    Joint.RepairJointRampSeeds.Reset();
    Joint.RepairJointObservedArm=0;
    Joint.StepJointRepair();
    TestTrue(TEXT("Left-witness transition produces a scratch field"),Joint.RepairJointRampSeeds.Num()>10);
    if(Joint.RepairJointRampSeeds.Num()<=10) return false;
    const auto LeftMirror=Joint.RepairJointRampSeeds[10];
    Joint.RepairJointRampIndex=0;
    Joint.RepairJointRampSeeds.Reset();
    Joint.RepairJointObservedArm=1;
    Joint.StepJointRepair();
    TestTrue(TEXT("Right-witness transition produces a scratch field"),Joint.RepairJointRampSeeds.Num()>10);
    if(Joint.RepairJointRampSeeds.Num()<=10) return false;
    const auto RightMirror=Joint.RepairJointRampSeeds[10];
    const auto& OriginalCore=Joint.RepairJointOriginalSeeds[10];
    auto SignedPoleChange=[&](const FFlowArtsArmClearancePreparedSeed& Changed,int32 Side)
    {
        const FVector Axis=(OriginalCore.SolvedWrists[Side]-OriginalCore.SolvedShoulders[Side]).GetSafeNormal();
        const FVector Before=OriginalCore.ElbowPole[Side].GetSafeNormal();
        const FVector After=Changed.ElbowPole[Side].GetSafeNormal();
        return FMath::RadiansToDegrees(FMath::Atan2(FVector::DotProduct(Axis,FVector::CrossProduct(Before,After)),
            FVector::DotProduct(Before,After)));
    };
    TestTrue(TEXT("Left witness turns only the left pole on its chosen anatomical arc"),
        SignedPoleChange(LeftMirror,0)>40. &&
        LeftMirror.ElbowPole[1].Equals(OriginalCore.ElbowPole[1],1.e-6));
    TestTrue(TEXT("Mirrored right witness reverses the right pole arc"),
        SignedPoleChange(RightMirror,1)<-40. &&
        RightMirror.ElbowPole[0].Equals(OriginalCore.ElbowPole[0],1.e-6));
    const FVector LeftShift=LeftMirror.HandTranslationCm[0]-OriginalCore.HandTranslationCm[0];
    const FVector RightShift=RightMirror.HandTranslationCm[0]-OriginalCore.HandTranslationCm[0];
    FFlowArtsArmClearancePreparationSnapshot MirrorOwn;
    TestTrue(TEXT("Mirrored field uses its own authored snapshot"),Joint.PlaceKnot(10,MirrorOwn));
    const FVector CoreUp=(MirrorOwn.Geometry.Neck-MirrorOwn.Geometry.FixedHip).GetSafeNormal();
    TestTrue(TEXT("Mirrored fields retain their common height"),
        FMath::IsNearlyEqual(FVector::DotProduct((LeftShift+RightShift)*.5,CoreUp),-12.,1.e-4));
    TestTrue(TEXT("Mirrored fields reverse their lateral shift"),
        FVector::VectorPlaneProject(LeftShift+RightShift,CoreUp).IsNearlyZero(1.e-4));
    const FQuat LeftYaw=LeftMirror.TorsoRotation*OriginalCore.TorsoRotation.Inverse();
    const FQuat RightYaw=RightMirror.TorsoRotation*OriginalCore.TorsoRotation.Inverse();
    TestTrue(TEXT("Mirrored fields reverse whole-body yaw"),
        (LeftYaw*RightYaw).AngularDistance(FQuat::Identity)<1.e-5);
    // Reflect an actual solved shoulder-to-wrist axis and its pole across the
    // sagittal plane. The signed right rotation must reflect the left target.
    auto Reflect=[](const FVector& V) { return FVector(V.X,-V.Y,V.Z); };
    const FVector LeftAxis=(OriginalCore.SolvedWrists[0]-OriginalCore.SolvedShoulders[0]).GetSafeNormal();
    const FVector RightShoulder=Reflect(OriginalCore.SolvedShoulders[0]);
    const FVector RightWrist=Reflect(OriginalCore.SolvedWrists[0]);
    const FVector RightAxis=(RightWrist-RightShoulder).GetSafeNormal();
    const FVector LeftPole=OriginalCore.ElbowPole[0].GetSafeNormal();
    const FVector GeometricLeft=FlowFestStanceDetail::TransitionCorePole(LeftPole,LeftAxis,60.,0);
    const FVector GeometricRight=FlowFestStanceDetail::TransitionCorePole(
        Reflect(LeftPole),RightAxis,60.,1);
    TestTrue(TEXT("Right pole target reflects the left solved-arm target"),
        GeometricRight.Equals(Reflect(GeometricLeft),1.e-5));
    Joint.RepairJointRampVariant=4;
    Joint.RepairJointObservedArm=INDEX_NONE;
    auto RealizedField=NarrowField;
    for(int32 I=2;I<=14;I+=2)
    {
        FFlowArtsArmClearancePreparedSeed CheckedSource;
        FFlowArtsArmClearanceResult SourceResult;
        const bool bSourceBuilt=Joint.QueryRepairKnot(I,RealizedField[I],CheckedSource,SourceResult);
        TestTrue(TEXT("Transition source rebuilds on its own authored snapshot"),bSourceBuilt);
        if(!bSourceBuilt) return false;
        RealizedField[I]=CheckedSource;
    }
    for(int32 I=3;I<14;I+=2)
    {
        FFlowArtsArmClearancePreparedSeed ActualOdd,RealizedOdd;
        FFlowArtsArmClearanceResult OddResult;
        TestTrue(TEXT("Field midpoint reconstructs from freshly solved source controls"),
            FFlowArtsArmClearance::InterpolatePreparedSeed(RealizedField[I-1],RealizedField[I+1],.5,ActualOdd));
        const bool bOddBuilt=Joint.QueryRepairKnot(I,ActualOdd,RealizedOdd,OddResult);
        TestTrue(TEXT("Actual transition midpoint rebuilds on its own authored snapshot"),bOddBuilt);
        if(!bOddBuilt) return false;
        TestTrue(TEXT("Entry link remains rate coherent"),
            FFlowFestStancePreparation::ContinuousArms(RealizedField[I-1],RealizedOdd,.25));
        TestTrue(TEXT("Exit link remains rate coherent"),
            FFlowFestStancePreparation::ContinuousArms(RealizedOdd,RealizedField[I+1],.25));
    }
    Joint.RepairJointMidpoint=11;
    Joint.RepairJointRampSeeds.Reset();
    Joint.RepairJointRampIndex=0;
    Joint.StepJointRepair();
    TestTrue(TEXT("Pretarget field remains a scratch proposal"),Joint.RepairJointRampSeeds.Num()>10);
    if(Joint.RepairJointRampSeeds.Num()<=10) return false;
    TestTrue(TEXT("Pretarget rejection does not recenter the original blocked choreography target"),
        Joint.RepairJointRampSeeds[10].ElbowPole[0].Equals(NarrowField[10].ElbowPole[0],1.e-6));
    Joint.RepairJointMidpoint=10;
    Joint.RepairJointRampSeeds.Reset();
    Joint.RepairJointRampIndex=0;
    Joint.StepJointRepair();
    TestTrue(TEXT("Even-source field remains a scratch proposal"),Joint.RepairJointRampSeeds.Num()>10);
    if(Joint.RepairJointRampSeeds.Num()<=10) return false;
    TestTrue(TEXT("Rejected even source also preserves original field core"),
        Joint.RepairJointRampSeeds[10].ElbowPole[0].Equals(NarrowField[10].ElbowPole[0],1.e-6));
    // Expanded attempts are new repair lifecycles, not a mutation of an
    // in-progress ramp's cursors and cached baseline certificates.
    auto WideKnots=RepairKnots;
    FFlowFestStancePreparation Wide(RepairPlan,MoveTemp(WideKnots),2);
    TestTrue(TEXT("Widened fixture preserves its source track"),Wide.CurrentSeeds.Num()==20 && Wide.PosedKnots.Num()==20);
    if(Wide.CurrentSeeds.Num()!=20 || Wide.PosedKnots.Num()!=20) return false;
    Wide.Knot=9; Wide.Clear=9;
    for(int32 I=0;I<20;++I)
    { Wide.CurrentSeeds[I]=RotatedControl; Wide.PosedKnots[I]=MidPose; }
    Wide.BeginPrefixRepair(RotatedControl);
    Wide.RepairStart=0; Wide.RepairEnd=14;
    Wide.BeginJointRepair(9,MidResult);
    const int32 WideBaseline=(Wide.RepairEnd-Wide.RepairStart)/2+1+
        (Wide.RepairEnd-1+1)/2;
    for(int32 I=0;I<WideBaseline;++I) Wide.StepJointRepair();
    Wide.RepairJointRampVariant=4;
    Wide.StepJointRepair();
    TestTrue(TEXT("Widened transition field remains an active scratch proposal"),
        Wide.RepairJointRampSeeds.Num()>14);
    if(Wide.RepairJointRampSeeds.Num()<=14) return false;
    TestFalse(TEXT("Wider window extends smooth entry into formerly fixed source"),
        Wide.RepairJointRampSeeds[4].HandTranslationCm[0].Equals(NarrowField[4].HandTranslationCm[0],1.e-6));
    TestTrue(TEXT("Wider entry retains the same original blocked core"),
        Wide.RepairJointRampSeeds[10].ElbowPole[0].Equals(NarrowField[10].ElbowPole[0],1.e-6));
    int32 SelectedSource=INDEX_NONE,SelectedDimension=INDEX_NONE;
    double SelectedDirection=0.;
    FlowFestStanceDetail::SelectJointControl(0,14,Joint.Knot+Joint.Knot%2,0,false,0,
        SelectedSource,SelectedDimension,SelectedDirection);
    TestEqual(TEXT("Post-field control search stays on original blocked source"),SelectedSource,10);
    auto FrontierKnots=UnpublishedKnots;
    FFlowFestStancePreparation Frontier(RepairPlan,MoveTemp(FrontierKnots),2);
    Frontier.Knot=9; Frontier.Clear=9;
    for(int32 I=0;I<20;++I)
    { Frontier.CurrentSeeds[I]=RotatedControl; Frontier.PosedKnots[I]=MidPose; }
    Frontier.BeginPrefixRepair(RotatedControl);
    Frontier.RepairIndex=Frontier.RepairEnd;
    Frontier.RepairRefinement=32;
    Frontier.StepPrefixRepair();
    TestTrue(TEXT("Colliding mutable right frontier enters joint search through the real source pass"),Frontier.bRepairJoint);
    TestEqual(TEXT("Frontier rejection keeps its actual phase"),Frontier.RepairJointMidpoint,Frontier.RepairEnd);
    TestEqual(TEXT("Frontier admission does not consume a wider retry"),Frontier.RepairAttempt,0);
    TestFalse(TEXT("Frontier admission cannot publish"),Frontier.IsCandidateReady());
    FFlowFestStancePreparation Unpublished(RepairPlan,MoveTemp(UnpublishedKnots),2);
    Unpublished.Knot=9; Unpublished.Clear=9;
    for(int32 I=0;I<20;++I)
    { if(I<9 && !(I%2)) Unpublished.CurrentSeeds[I]=RotatedControl; Unpublished.PosedKnots[I]=MidPose; }
    Unpublished.BeginPrefixRepair(RotatedControl);
    Unpublished.BeginJointRepair(9,MidResult);
    const int32 UnpublishedFirst=FMath::Max(1,Unpublished.RepairStart-1);
    const int32 UnpublishedBaseline=(Unpublished.RepairEnd-Unpublished.RepairStart)/2+1+
        (Unpublished.RepairEnd-UnpublishedFirst+1)/2;
    for(int32 I=0;I<UnpublishedBaseline;++I) Unpublished.StepJointRepair();
    TestTrue(TEXT("Unpublished right endpoint may fail its transported baseline"),
        Unpublished.RepairJointCosts[Unpublished.RepairEnd]>0.);
    TestTrue(TEXT("Failed future baseline still enters bounded joint search"),Unpublished.bRepairJoint);
    Unpublished.StepJointRepair();
    TestEqual(TEXT("Future endpoint search starts a resumable profile"),Unpublished.RepairJointRampIndex,1);
    TestFalse(TEXT("Failed future endpoint cannot publish its scratch path"),Unpublished.IsCandidateReady());
    // Equal binary certificates can conceal a strict reduction in measured
    // contact. The retained ramp must use paired witnesses and warm start the
    // next search while leaving the published prefix untouched.
    for(auto& K:MeritKnots)
    {
        K.Clearance=RepairSnapshot;
        const FVector DesiredWrist=DirectOdd.SolvedWrists[0];
        K.Clearance.Geometry.MakePreparedContactObjective=[DesiredWrist](const FFlowArtsClearanceArm*,const FQuat&,
            const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&)->FFlowArtsPreparedContactObjective
        {
            return [DesiredWrist](const FFlowArtsClearanceArm* Arms,const FQuat&,
                const TArray<FFlowArtsClearanceCapsule>&,const TArray<FFlowArtsClearanceCapsule>&)
            { return FVector::DistSquared(Arms[0].Wrist.GetLocation(),DesiredWrist); };
        };
    }
    FFlowFestStancePreparation Merit(RepairPlan,MoveTemp(MeritKnots),2);
    Merit.Knot=9; Merit.Clear=9;
    for(int32 I=0;I<20;++I)
    { Merit.CurrentSeeds[I]=SourceControl; Merit.PosedKnots[I]=MidPose; }
    const auto MeritPublished=Merit.CurrentSeeds;
    Merit.BeginPrefixRepair(SourceControl);
    Merit.BeginJointRepair(9,MidResult);
    const int32 MeritFirst=FMath::Max(1,Merit.RepairStart-1);
    Merit.RepairJointBaselineIndex=(Merit.RepairEnd-Merit.RepairStart)/2+1+
        (Merit.RepairEnd-MeritFirst+1)/2;
    Merit.RepairJointBestSeeds=Merit.RepairSeeds;
    Merit.RepairJointBestCosts.Init(1000.,20);
    Merit.RepairJointBestBuilt.Init(true,20);
    Merit.RepairJointRampSeeds=Merit.RepairSeeds;
    Merit.RepairJointRampCosts.Init(1000.,20);
    Merit.RepairJointRampBuilt.Init(true,20);
    for(int32 I=MeritFirst;I<=Merit.RepairEnd;++I) Merit.RepairJointRampSeeds[I]=DirectOdd;
    Merit.bRepairJointRampComparing=true;
    Merit.RepairJointRampCompareIndex=MeritFirst;
    FFlowArtsArmClearancePreparationSnapshot MeritOwn;
    double MeritOld=0.,MeritNew=0.;
    TestTrue(TEXT("Merit fixture places its own authored snapshot"),Merit.PlaceKnot(Merit.RepairEnd,MeritOwn));
    TestTrue(TEXT("Merit fixture builds paired contact objectives"),
        FFlowArtsArmClearance::ComparePreparedContactMerit(MeritOwn,SourceControl,DirectOdd,MeritOld,MeritNew));
    auto HeadMeritOwn=MeritOwn;
    HeadMeritOwn.Geometry.TorsoHulls.SetNum(3);
    // The generic midpoint fixture has no arm surface radii. Give this
    // separate merit fixture a measured capsule so its head proxy can overlap.
    HeadMeritOwn.Geometry.Arms[0].ForearmRadiusCm=1.f;
    FFlowArtsClearanceHull HeadHull;
    const FVector HeadCenter=HeadMeritOwn.Geometry.Arms[0].Elbow.GetLocation();
    for(const FVector Axis : {FVector::ForwardVector,FVector::RightVector,FVector::UpVector})
        for(const int32 Sign : {-1,1})
        {
            const FVector N=Axis*Sign;
            HeadHull.Planes.Add({N,float(FVector::DotProduct(N,HeadCenter)+100.)});
        }
    HeadMeritOwn.Geometry.TorsoHulls[2]=MoveTemp(HeadHull);
    double UnprovedOld=0.,UnprovedNew=0.,ProvedOld=0.,ProvedNew=0.;
    TestTrue(TEXT("Paired head merit builds without exact head proof"),
        FFlowArtsArmClearance::ComparePreparedContactMerit(
            HeadMeritOwn,SourceControl,SourceControl,UnprovedOld,UnprovedNew));
    HeadMeritOwn.Geometry.CertifyForearmHead=[](const FFlowArtsClearanceArm*,const FQuat&)->uint8{return 1;};
    TestTrue(TEXT("Paired head merit builds with same-side head proof"),
        FFlowArtsArmClearance::ComparePreparedContactMerit(
            HeadMeritOwn,SourceControl,SourceControl,ProvedOld,ProvedNew));
    AddInfo(FString::Printf(TEXT("Paired head merit unproved=(%.9f,%.9f) proved=(%.9f,%.9f)"),
        UnprovedOld,UnprovedNew,ProvedOld,ProvedNew));
    TestTrue(TEXT("Synthetic forearm capsule incurs a head proxy penalty"),UnprovedOld>ProvedOld+1.e-6);
    TestTrue(TEXT("Exact head proof removes only its forearm proxy penalty from paired merit"),
        ProvedOld+1.e-6<UnprovedOld && ProvedNew+1.e-6<UnprovedNew);
    AddInfo(FString::Printf(TEXT("Paired merit fixture old=%.9f new=%.9f"),MeritOld,MeritNew));
    while(Merit.bRepairJointRampComparing) Merit.StepJointRepair();
    TestTrue(TEXT("Lower paired contact merit retains partial ramp despite equal binary costs"),
        Merit.RepairJointBestSeeds[Merit.RepairEnd].HandTranslationCm[0].Equals(
            DirectOdd.HandTranslationCm[0],1.e-6));
    TestFalse(TEXT("Partial merit improvement cannot publish before full certificates"),Merit.IsCandidateReady());
    TestTrue(TEXT("Partial merit comparison leaves accepted source controls unchanged"),
        Merit.CurrentSeeds[Merit.RepairEnd].HandTranslationCm[0].Equals(
            MeritPublished[Merit.RepairEnd].HandTranslationCm[0],0.));
    for(int32 I=0;I<20;++I)
    {
        TestTrue(TEXT("Rejected joint query preserves left elbow pole"),
            Joint.CurrentSeeds[I].ElbowPole[0].Equals(JointBefore[I].ElbowPole[0],0.));
        TestTrue(TEXT("Rejected joint query preserves right elbow pole"),
            Joint.CurrentSeeds[I].ElbowPole[1].Equals(JointBefore[I].ElbowPole[1],0.));
        TestTrue(TEXT("Rejected joint query preserves hand translation"),
            Joint.CurrentSeeds[I].HandTranslationCm[0].Equals(JointBefore[I].HandTranslationCm[0],0.));
        TestEqual(TEXT("Rejected joint query preserves clavicle"),
            Joint.CurrentSeeds[I].ClavicleProtractionDeg[0],JointBefore[I].ClavicleProtractionDeg[0]);
    }
    TArray<FFlowFestStanceKnot> TailKnots;
    TailKnots.SetNum(20);
    for(int32 I=0;I<TailKnots.Num();++I)
    { TailKnots[I].Seconds=I*.25; TailKnots[I].Pose=MidPose; TailKnots[I].Clearance=RepairSnapshot; }
    FFlowFestStancePreparation Tail(RepairPlan,MoveTemp(TailKnots),2);
    Tail.Knot=19; Tail.Clear=19;
    for(int32 I=0;I<20;++I) Tail.CurrentSeeds[I]=RotatedControl;
    Tail.BeginPrefixRepair(RotatedControl);
    TestTrue(TEXT("Last odd knot cannot have a following source endpoint"),Tail.RepairEnd<Tail.Knot);
    Tail.StepPrefixRepair();
    TestTrue(TEXT("Last odd knot does not publish an invalid interval"),Tail.Knot==19 && !Tail.IsCandidateReady());

    // A completed source pass can still fail the actual odd interpolation.
    // Repair it once, with both exterior sources fixed, then restart all odd
    // validation. The wrapped case holds source zero fixed and queries N-1.
    for(const int32 FailedOdd : {9,19})
    {
        auto FinalKnots=RepairKnots;
        FFlowFestStancePreparation Final(RepairPlan,MoveTemp(FinalKnots),2);
        Final.Clear=20; Final.Trial=FFlowFestStancePreparation::MaxPlans;
        Final.bPreflighting=false;
        for(int32 I=0;I<20;++I)
        { Final.CurrentSeeds[I]=RotatedControl; Final.PosedKnots[I]=MidPose; }
        const auto Original=Final.CurrentSeeds;
        if(FailedOdd==9)
        {
            Final.Knots[9].Clearance.Geometry.CertifySkinnedUpperTorso=[](
                const FFlowArtsClearanceArm*,const FQuat&,bool) { return uint8(0); };
            Final.bValidating=true; Final.Validation=9;
            Final.Step(1.e-9);
            Final.Knots[9].Clearance.Geometry.CertifySkinnedUpperTorso=RepairSnapshot.Geometry.CertifySkinnedUpperTorso;
        }
        else
        {
            Final.Trial=FFlowFestStancePreparation::MaxPlans-1;
            Final.CurrentSeeds[18].SolvedWrists[0]+=FVector(1000.,0.,0.);
            Final.FinishTrial();
            // The final repair will rebuild this endpoint from its unchanged
            // controls; its stale solved frame triggered the coarse seam gate.
        }
        TestTrue(TEXT("Final validation or seam gate admits bounded repair through the worker"),Final.bFinalRepairActive);
        TestEqual(TEXT("Final repair consumes no extra outer trial"),Final.Trial,FFlowFestStancePreparation::MaxPlans);
        TestFalse(TEXT("Final odd repair cannot recursively admit another attempt"),Final.BeginFinalRepair(FailedOdd));
        const int32 Last=Final.RepairEnd+1, Exterior=(Final.RepairEnd+2)%20;
        TestEqual(TEXT("Final odd repair has the expected fixed right exterior"),Exterior,FailedOdd==19 ? 0 : 12);
        const int32 FinalBaselineQueries=(Final.RepairEnd-Final.RepairStart)/2+1+
            (Last-FMath::Max(1,Final.RepairStart-1))/2+1;
        for(int32 I=0;I<FinalBaselineQueries;++I) Final.StepJointRepair();
        TestTrue(TEXT("Final baseline includes the actual outgoing odd phase"),Final.RepairJointBuilt[Last]);
        TestTrue(TEXT("Final baseline does not replace right exterior controls"),
            Final.RepairSeeds[Exterior].ElbowPole[0].Equals(Original[Exterior].ElbowPole[0],0.));
        TestFalse(TEXT("Final baseline remains unpublished"),Final.IsCandidateReady());
        // Simulate an optimizer returning the already clear path, then execute
        // production's complete local recertification rather than bypassing it.
        Final.bRepairJoint=false; Final.bRepairJointFinal=true;
        Final.bRepairMidpoints=false; Final.RepairIndex=Final.RepairStart;
        for(int32 I=0;I<20 && Final.bRepairing;++I) Final.StepPrefixRepair();
        TestTrue(TEXT("Local final repair restarts whole-loop odd validation"),Final.bValidating);
        TestEqual(TEXT("Whole-loop validation restarts at the first midpoint"),Final.Validation,1);
        TestFalse(TEXT("A locally certified final interval is not Ready"),Final.IsCandidateReady());
        TestTrue(TEXT("Local final repair preserves the left anchor"),
            Final.CurrentSeeds[Final.RepairStart].ElbowPole[0].Equals(Original[Final.RepairStart].ElbowPole[0],0.));
        TestTrue(TEXT("Local final repair preserves the right exterior"),
            Final.CurrentSeeds[Exterior].ElbowPole[0].Equals(Original[Exterior].ElbowPole[0],0.));
        // A later global failure must roll back even a locally committed path,
        // without reopening the final-repair budget or publishing any seed.
        Final.CurrentSeeds[Final.RepairEnd].ClavicleProtractionDeg[0]+=1.f;
        Final.Knots[1].Clearance.Geometry.CertifySkinnedUpperTorso=[](
            const FFlowArtsClearanceArm*,const FQuat&,bool) { return uint8(0); };
        Final.Step(1.e-9);
        TestTrue(TEXT("Failed global revalidation terminates the bounded final attempt"),Final.IsFailed());
        TestFalse(TEXT("Failed global revalidation cannot publish"),Final.IsCandidateReady());
        TestTrue(TEXT("Failed global revalidation restores the entire original source pass"),
            Final.CurrentSeeds[Final.RepairEnd].ClavicleProtractionDeg[0]==Original[Final.RepairEnd].ClavicleProtractionDeg[0]);
        TestFalse(TEXT("Terminal final failure cannot retry recursively"),Final.BeginFinalRepair(FailedOdd));
    }
    auto SeamKnots=RepairKnots;
    FFlowFestStancePreparation Seam(RepairPlan,MoveTemp(SeamKnots),2);
    Seam.Clear=20; Seam.Trial=FFlowFestStancePreparation::MaxPlans;
    for(int32 I=0;I<20;++I)
    { Seam.CurrentSeeds[I]=RotatedControl; Seam.PosedKnots[I]=MidPose; }
    TestTrue(TEXT("Wrapped rate fixture starts bounded final repair"),Seam.BeginFinalRepair(19));
    Seam.bRepairJoint=false; Seam.bRepairJointFinal=true;
    Seam.bRepairMidpoints=true; Seam.RepairIndex=19;
    FFlowArtsArmClearancePreparedSeed SeamMid,SeamChecked;
    FFlowArtsArmClearanceResult SeamResult;
    TestTrue(TEXT("Wrapped phase interpolates source18 to fixed source0"),
        FFlowArtsArmClearance::InterpolatePreparedSeed(Seam.RepairSeeds[18],Seam.RepairSeeds[0],.5,SeamMid));
    TestTrue(TEXT("Wrapped phase has a fresh actual-pose query"),Seam.QueryRepairKnot(19,SeamMid,SeamChecked,SeamResult));
    TestTrue(TEXT("Wrapped fixture starts contact-clear"),SeamResult.bFeasible);
    TestTrue(TEXT("Wrapped fixture incoming rate is clear"),FFlowFestStancePreparation::ContinuousArms(
        Seam.RepairSeeds[18],SeamChecked,Seam.Current.Duration/20.));
    Seam.RepairSeeds[0].SolvedWrists[0]+=FVector(1000.,0.,0.);
    TestFalse(TEXT("Wrapped fixture outgoing rate is independently blocked"),FFlowFestStancePreparation::ContinuousArms(
        SeamChecked,Seam.RepairSeeds[0],Seam.Current.Duration/20.));
    Seam.StepPrefixRepair();
    TestTrue(TEXT("Wrapped outgoing rate failure rejects the final repair"),Seam.IsFailed());
    TestFalse(TEXT("Wrapped outgoing failure never publishes"),Seam.IsCandidateReady());
    TestTrue(TEXT("Wrapped rejection restores original source0 solved state"),
        Seam.CurrentSeeds[0].SolvedWrists[0].Equals(RotatedControl.SolvedWrists[0],0.));

    auto ScheduleKnots=RepairKnots;
    FFlowFestStancePreparation Schedule(RepairPlan,MoveTemp(ScheduleKnots),2);
    Schedule.Knot=10; Schedule.RepairStart=0; Schedule.RepairEnd=18;
    Schedule.RepairSeeds.Init(RotatedControl,20);
    Schedule.RepairJointBuilt.Init(true,20); Schedule.RepairJointCosts.Init(0.,20);
    Schedule.RepairJointCosts[18]=1000.;
    Schedule.SelectJointSweepSources();
    TestEqual(TEXT("A failed future source outside the old nearest-three is selected first"),Schedule.RepairJointSweepSources[0],18);
    TestEqual(TEXT("A sweep selects three distinct sources"),Schedule.RepairJointSweepSources.Num(),3);
    Schedule.RepairJointCosts[18]=0.; Schedule.RepairJointCosts[3]=1000.;
    Schedule.SelectJointSweepSources();
    TestTrue(TEXT("A failed earlier midpoint selects both mutable source endpoints"),
        Schedule.RepairJointSweepSources.Contains(2) && Schedule.RepairJointSweepSources.Contains(4));
    TestFalse(TEXT("Failure scheduling never selects a fixed left anchor"),Schedule.RepairJointSweepSources.Contains(0));
    Schedule.RepairJointCosts[3]=0.;
    Schedule.RepairSeeds[18].SolvedWrists[0]+=FVector(1000.,0.,0.);
    Schedule.SelectJointSweepSources();
    TestTrue(TEXT("A pure rate failure outside the target neighborhood receives a source slot"),
        Schedule.RepairJointSweepSources.Contains(18));
    AllowRepairCertificate=false;
    Transport.StepPrefixRepair();
    TestFalse(TEXT("Rejected neighboring midpoint cannot publish transported endpoints"),Transport.IsCandidateReady());
    for(int32 I=0;I<20;++I)
        TestTrue(TEXT("Actual failed midpoint pass leaves accepted prefix unchanged"),
            Transport.CurrentSeeds[I].TorsoRotation.Equals(OriginalTransport[I].TorsoRotation,0.));
    Worker.bRepairMidpoints=true;
    TestTrue(TEXT("Midpoint rebase has a separate budget after endpoint rebase"),Worker.RebaseMidpointRepair(DirectOdd));
    TestFalse(TEXT("Midpoint target restarts source endpoint reconstruction"),Worker.bRepairMidpoints);
    Worker.bRepairMidpoints=true;
    TestFalse(TEXT("Second midpoint rebase is forbidden"),Worker.RebaseMidpointRepair(DirectOdd));
    for(int32 I=0;I<9;++I)
        TestTrue(TEXT("Certified odd target alone never replaces accepted prefix"),
            Worker.CurrentSeeds[I].HandTranslationCm[0].Equals(Before[I].HandTranslationCm[0],0.));
    Worker.RejectPrefixRepair(TEXT("Injected rebased midpoint rejection"));
    Worker.Trial=FFlowFestStancePreparation::MaxPlans-1;
    Worker.RepairSeeds[Worker.RepairStart].HandTranslationCm[0]=FVector(999,0,0);
    Worker.RejectPrefixRepair(TEXT("Injected exact midpoint rejection"));
    TestFalse(TEXT("Rejected repair never publishes"),Worker.IsCandidateReady());
    TestTrue(TEXT("Public seeds remain empty"),Worker.GetSeeds().IsEmpty());
    for(int32 I=0;I<9;++I)
        TestTrue(TEXT("Terminal repair retains original prefix"),Worker.CurrentSeeds[I].HandTranslationCm[0].Equals(Before[I].HandTranslationCm[0],0.));
    return true;
}

#endif
