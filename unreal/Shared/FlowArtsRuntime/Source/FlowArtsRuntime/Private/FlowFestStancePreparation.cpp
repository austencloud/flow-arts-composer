#include "FlowFestStancePlan.h"
#include "HAL/PlatformTime.h"
#if WITH_DEV_AUTOMATION_TESTS
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Misc/FileHelper.h"
#endif

namespace
{
bool ConstrainBodyControls(const FFlowFestStancePlan& Plan, FFlowArtsArmClearancePreparationSnapshot& Snapshot)
{
    const auto& G=Snapshot.Geometry;
    const FVector Up=(G.Neck-G.FixedHip).GetSafeNormal();
    FVector Axis=G.Arms[1].Upper.GetLocation()-G.Arms[0].Upper.GetLocation();
    Axis-=Up*FVector::DotProduct(Axis,Up);
    if (Up.IsNearlyZero() || !Axis.Normalize()) return false;
    Snapshot.bConstrainPreparedTorsoRotation=true;
    Snapshot.PreparedTorsoRotation=FQuat(Axis,FMath::DegreesToRadians(Plan.Controls.TorsoLeanDegrees));
    Snapshot.PreparedAddedTorsoPitch=Snapshot.PreparedTorsoRotation;
    Snapshot.PreparedNeckCounterFraction=1.f;
    Snapshot.bConstrainPreparedHandTranslation=true;
    Snapshot.PreparedPatternNormal=Plan.PatternNormal;
    Snapshot.MaxPreparedHandDepthCm=8.;
    Snapshot.MinPreparedCommonDepthCm=-FFlowArtsArmClearance::PreparedCommonDepthLimitCm;
    for (int32 Side=0; Side<2; ++Side)
        Snapshot.PreparedHandTranslationCm[Side]=Plan.PatternNormal*(Side ? -Plan.Controls.HandDepthCm : Plan.Controls.HandDepthCm);
    return true;
}

bool PoseContinuous(const FFlowFestStancePose& A,const FFlowFestStancePose& B,double Seconds)
{
    if (!A.IsValid() || !B.IsValid() || Seconds<=0.) return false;
    // Rates, independent of preparation and render sampling frequency.
    for (int32 Chain=0; Chain<2; ++Chain)
        for (int32 Index : {A.Upper[Chain],A.Middle[Chain],A.End[Chain]})
            if (FVector::Dist(A.Components[Index].GetLocation(),B.Components[Index].GetLocation())>300.*Seconds ||
                FMath::RadiansToDegrees(A.Components[Index].GetRotation().AngularDistance(
                    B.Components[Index].GetRotation()))>720.*Seconds) return false;
    return true;
}
}

bool FFlowFestStancePreparation::ContinuousArms(const FFlowArtsArmClearancePreparedSeed& A,
    const FFlowArtsArmClearancePreparedSeed& B, double Seconds)
{
    if (!A.bValid || !B.bValid || !A.bAbsoluteControls || !B.bAbsoluteControls ||
        !FMath::IsFinite(Seconds) || Seconds<=0. ||
        FMath::RadiansToDegrees(A.TorsoRotation.AngularDistance(B.TorsoRotation))>360.*Seconds ||
        A.SolvedHeadCenter.ContainsNaN() || B.SolvedHeadCenter.ContainsNaN() ||
        A.SolvedHeadRotation.ContainsNaN() || B.SolvedHeadRotation.ContainsNaN() ||
        FVector::Dist(A.SolvedHeadCenter,B.SolvedHeadCenter)>300.*Seconds ||
        FMath::RadiansToDegrees(A.SolvedHeadRotation.AngularDistance(B.SolvedHeadRotation))>720.*Seconds)
        return false;
    for (int32 Side=0; Side<2; ++Side)
    {
        if (A.SolvedShoulders[Side].ContainsNaN() || B.SolvedShoulders[Side].ContainsNaN() ||
            A.SolvedElbows[Side].ContainsNaN() || B.SolvedElbows[Side].ContainsNaN() ||
            A.SolvedWrists[Side].ContainsNaN() || B.SolvedWrists[Side].ContainsNaN() ||
            A.SolvedUpperRotation[Side].ContainsNaN() || B.SolvedUpperRotation[Side].ContainsNaN() ||
            A.SolvedForearmRotation[Side].ContainsNaN() || B.SolvedForearmRotation[Side].ContainsNaN() ||
            FVector::Dist(A.SolvedShoulders[Side],B.SolvedShoulders[Side])>300.*Seconds ||
            FVector::Dist(A.SolvedElbows[Side],B.SolvedElbows[Side])>300.*Seconds ||
            FVector::Dist(A.SolvedWrists[Side],B.SolvedWrists[Side])>300.*Seconds ||
            FMath::RadiansToDegrees(A.SolvedUpperRotation[Side].AngularDistance(B.SolvedUpperRotation[Side]))>720.*Seconds ||
            FMath::RadiansToDegrees(A.SolvedForearmRotation[Side].AngularDistance(B.SolvedForearmRotation[Side]))>720.*Seconds ||
            FMath::Abs(A.ClavicleProtractionDeg[Side]-B.ClavicleProtractionDeg[Side])>360.*Seconds) return false;
        const FVector P=A.ElbowPole[Side].GetSafeNormal(), Q=B.ElbowPole[Side].GetSafeNormal();
        if (P.IsNearlyZero() || Q.IsNearlyZero() ||
            FMath::RadiansToDegrees(FMath::Acos(FMath::Clamp(FVector::DotProduct(P,Q),-1.,1.)))>600.*Seconds) return false;
    }
    return true;
}

namespace FlowFestStanceDetail
{
FVector TransitionCorePole(const FVector& Pole,const FVector& WristAxis,double Degrees,int32 Side)
{
    if((Side!=0 && Side!=1) || WristAxis.IsNearlyZero() || Pole.IsNearlyZero()) return FVector::ZeroVector;
    return FQuat(WristAxis.GetSafeNormal(),FMath::DegreesToRadians((Side==0 ? 1. : -1.)*Degrees))
        .RotateVector(Pole.GetSafeNormal()).GetSafeNormal();
}

void SelectJointControl(int32 RepairStart,int32 RepairEnd,int32 RejectedIndex,int32 Step,
    bool bUnanchoredStart,int32 PreferredArm,
    int32& OutSource,int32& OutDimension,double& OutDirection)
{
    OutSource=INDEX_NONE;
    OutDimension=INDEX_NONE;
    OutDirection=(Step%2) ? -1. : 1.;
    if(Step<0 || RepairEnd<RepairStart+2) return;
    const int32 FirstMovable=RepairStart+(bUnanchoredStart ? 0 : 2);
    const int32 Center=FMath::Clamp(RejectedIndex-RejectedIndex%2,FirstMovable,RepairEnd);
    int32 Nearest[3]={INDEX_NONE,INDEX_NONE,INDEX_NONE};
    int32 Count=0;
    // Enumerate actual movable endpoints, never clip a missing neighbor onto
    // another slot. A short window repeats only its distinct available sources.
    for(int32 Radius=0;Count<3 && Radius<=RepairEnd-RepairStart;Radius+=2)
        for(int32 Sign : {1,-1})
        {
            if(Radius==0 && Sign<0) continue;
            const int32 Candidate=Center+Sign*Radius;
            if(Candidate<FirstMovable || Candidate>RepairEnd) continue;
            bool bSeen=false;
            for(int32 J=0;J<Count;++J) bSeen |= Nearest[J]==Candidate;
            if(!bSeen) Nearest[Count++]=Candidate;
            if(Count==3) break;
        }
    if(!Count) return;
    // Two 48-step sweeps cover both pole and clavicle routes on the three
    // nearest distinct sources. With no witness, the sweeps lead with
    // opposite arms.
    constexpr int32 LeftFirst[8]={0,6,1,2,5,7,8,3};
    constexpr int32 RightFirst[8]={5,7,1,2,0,6,8,3};
    const int32 Sweep=Step/48;
    const int32 Pair=(Step%48)/2;
    const int32 Side=(PreferredArm==0 || PreferredArm==1) ? PreferredArm : Sweep%2;
    OutSource=Nearest[(Pair/8)%Count];
    OutDimension=(Side==0 ? LeftFirst : RightFirst)[Pair%8];
}

double ArmRateExcess(const FFlowArtsArmClearancePreparedSeed& A,
    const FFlowArtsArmClearancePreparedSeed& B,double Seconds)
{
    if(!A.bValid || !B.bValid || !A.bAbsoluteControls || !B.bAbsoluteControls ||
        !FMath::IsFinite(Seconds) || Seconds<=0.) return 1.e6;
    auto Excess=[](double Used,double Allowed)
    {
        if(!FMath::IsFinite(Used) || !FMath::IsFinite(Allowed) || Allowed<=0.) return 1.e6;
        const double Over=FMath::Max(0.,Used/Allowed-1.);
        return Over*Over;
    };
    double Sum=Excess(FMath::RadiansToDegrees(A.TorsoRotation.AngularDistance(B.TorsoRotation)),
        360.*Seconds);
    for(int32 Side=0;Side<2;++Side)
    {
        if(A.SolvedShoulders[Side].ContainsNaN() || B.SolvedShoulders[Side].ContainsNaN() ||
            A.SolvedElbows[Side].ContainsNaN() || B.SolvedElbows[Side].ContainsNaN() ||
            A.SolvedWrists[Side].ContainsNaN() || B.SolvedWrists[Side].ContainsNaN()) return 1.e6;
        Sum+=Excess(FVector::Dist(A.SolvedShoulders[Side],B.SolvedShoulders[Side]),300.*Seconds);
        Sum+=Excess(FVector::Dist(A.SolvedElbows[Side],B.SolvedElbows[Side]),300.*Seconds);
        Sum+=Excess(FVector::Dist(A.SolvedWrists[Side],B.SolvedWrists[Side]),300.*Seconds);
        if(A.SolvedUpperRotation[Side].ContainsNaN() || B.SolvedUpperRotation[Side].ContainsNaN() ||
            A.SolvedForearmRotation[Side].ContainsNaN() || B.SolvedForearmRotation[Side].ContainsNaN())
            return 1.e6;
        Sum+=Excess(FMath::RadiansToDegrees(A.SolvedUpperRotation[Side].AngularDistance(
            B.SolvedUpperRotation[Side])),720.*Seconds);
        Sum+=Excess(FMath::RadiansToDegrees(A.SolvedForearmRotation[Side].AngularDistance(
            B.SolvedForearmRotation[Side])),720.*Seconds);
        Sum+=Excess(FMath::Abs(A.ClavicleProtractionDeg[Side]-B.ClavicleProtractionDeg[Side]),
            360.*Seconds);
        const FVector P=A.ElbowPole[Side].GetSafeNormal(), Q=B.ElbowPole[Side].GetSafeNormal();
        if(P.IsNearlyZero() || Q.IsNearlyZero()) return 1.e6;
        Sum+=Excess(FMath::RadiansToDegrees(FMath::Acos(FMath::Clamp(FVector::DotProduct(P,Q),-1.,1.))),
            600.*Seconds);
    }
    return FMath::IsFinite(Sum) ? Sum : 1.e6;
}

double ArmRateMerit(const FFlowArtsArmClearancePreparedSeed& A,
    const FFlowArtsArmClearancePreparedSeed& B,double Seconds)
{
    if(FFlowFestStancePreparation::ContinuousArms(A,B,Seconds)) return 0.;
    const double Excess=ArmRateExcess(A,B,Seconds);
    // The 1000-point broken-link term keeps the existing feasibility priority.
    // Continuous excess gives descent within that failed class; the cap keeps
    // one broken link cheaper than two. The hard acceptance gate is unchanged.
    return 1000.+999.*Excess/(1.+Excess);
}
}

FFlowFestStancePreparation::FFlowFestStancePreparation(FFlowFestStancePlan InPrototype,
    TArray<FFlowFestStanceKnot> InKnots,int32 SourceFps)
    : Prototype(MoveTemp(InPrototype)),Knots(MoveTemp(InKnots)),Fps(SourceFps)
{
    if (Fps<=0 || Knots.Num()<4 || Knots.Num()>MaxKnots || Knots.Num()%2 || !Prototype.IsValid(&Failure))
    { bFailed=true; if(Failure.IsEmpty()) Failure=TEXT("Unsupported dense stance input"); return; }
    for (int32 I=0; I<Knots.Num(); ++I)
    {
        const double Expected=Prototype.Duration*I/Knots.Num();
        if (!Knots[I].Pose.IsValid() || !Knots[I].Clearance.bValid ||
            FMath::Abs(Knots[I].Seconds-Expected)>1.e-6 || Prototype.Duration/Knots.Num()>.5/Fps+1.e-6)
        { bFailed=true; Failure=TEXT("Stance capture must cover uniform source and midpoint phases"); return; }
    }
    Lateral=Knots[0].Clearance.Geometry.Arms[1].Upper.GetLocation()-Knots[0].Clearance.Geometry.Arms[0].Upper.GetLocation();
    Lateral.Z=0.;
    if (!Lateral.Normalize()) { bFailed=true; Failure=TEXT("Degenerate stance body frame"); return; }
    Forward=FVector::CrossProduct(Lateral,FVector::UpVector).GetSafeNormal();
    Current=Best=Prototype;
    CurrentSeeds.SetNum(Knots.Num());
    PosedKnots.SetNum(Knots.Num());
    Samples.SetNum(Knots.Num());
}

void FFlowFestStancePreparation::PreflightKnot()
{
    FString Error;
    const int32 I=Preflight++;
    bool Valid=Current.Sample(Knots[I].Seconds,Samples[I],&Error);
    if (Valid) Valid=FFlowFestStancePlan::Apply(Knots[I].Pose,Samples[I],PosedKnots[I],&Error,false);
    if (Valid)
    {
        TArray<FVector> Feet[2];
        Valid=Knots[I].Clearance.EvaluateFootSurfaces &&
            Knots[I].Clearance.EvaluateFootSurfaces(PosedKnots[I].Components,Feet[0],Feet[1]);
        if(!Valid) Error=TEXT("Complete weighted foot surfaces unavailable");
        for(int32 Side=0;Valid && Side<2;++Side)
        {
            double Minimum=TNumericLimits<double>::Max();
            for(const FVector& Point:Feet[Side])
            {
                if(Point.ContainsNaN()) { Valid=false; break; }
                Minimum=FMath::Min(Minimum,FVector::DotProduct(Point-Current.GroundOrigin,Current.GroundNormal));
            }
            Valid=Valid && !Feet[Side].IsEmpty() && Minimum>=-Current.GroundPenetrationToleranceCm &&
                (!Samples[I].bSupport[Side] || Minimum<=Current.GroundContactToleranceCm);
            if(!Valid) Error=FString::Printf(TEXT("Weighted %s foot ground gap %.6fcm (support=%d)"),
                Side ? TEXT("right") : TEXT("left"),Minimum,int32(Samples[I].bSupport[Side]));
        }
    }
    if (!Valid)
    {
        ++InvalidPoses;
        PosedKnots[I]={};
        if (FirstRejection.IsEmpty()) FirstRejection=FString::Printf(TEXT("Phase %.6fs: %s"),Knots[I].Seconds,*Error);
        // These fixed whole-track controls cannot repair a failed support pose.
        Preflight=Knots.Num();
    }
    if (Preflight!=Knots.Num()) return;
    if (!InvalidPoses)
        for (int32 J=0; J<Knots.Num(); ++J)
            if (!PoseContinuous(PosedKnots[J],PosedKnots[(J+1)%Knots.Num()],Current.Duration/Knots.Num()))
            {
                ++InvalidPoses;
                if (FirstRejection.IsEmpty()) FirstRejection=FString::Printf(TEXT("Phase %.6fs: realized leg continuity"),Knots[J].Seconds);
            }
    bPreflighting=false;
    if (InvalidPoses)
    {
        // No arm branch or exact skin query can repair invalid support/reach for
        // these fixed whole-track controls. Reject before any expensive query.
        Score=1.e12+InvalidPoses*1.e6;
        bContinuous=false;
        FinishTrial();
    }
}

bool FFlowFestStancePreparation::BeginKnot()
{
    bKnotStarted=true; ArmCandidate=0; bCandidateFound=bKnotClear=false;
    bRepairAttemptedForKnot=false;
    CandidateRejection=TEXT("Complete posed skin could not be bound");
    CandidateCost=TNumericLimits<double>::Max();
    RepairAttempt=RepairRebases=RepairMidpointRebases=0;
    bRepairJoint=bRepairJointUsed=bRepairJointFinal=false;
    return PlaceKnot(Knot,Placed);
}

bool FFlowFestStancePreparation::PlaceKnot(int32 Index, FFlowArtsArmClearancePreparationSnapshot& Out) const
{
    const auto& Sample=Samples[Index];
    const auto& Posed=PosedKnots[Index];
    FFlowArtsClearanceArm Arms[2];
    for (int32 Side=0; Side<2; ++Side)
    {
        Arms[Side]=Knots[Index].Clearance.Geometry.Arms[Side];
        Arms[Side].Clavicle=Arms[Side].Clavicle*Sample.BodyDelta;
        Arms[Side].Upper=Posed.Components[Posed.Upper[Side+2]];
        Arms[Side].Elbow=Posed.Components[Posed.Middle[Side+2]];
        Arms[Side].Wrist=Posed.Components[Posed.End[Side+2]];
    }
    if (!Knots[Index].Clearance.PlaceBody(Sample.BodyDelta,Arms,Posed.Components,Out))
    {
        UE_LOG(LogTemp,Warning,TEXT("Stance PlaceKnot phase=%d failed at PlaceBody"),Index);
        return false;
    }
    if (!ConstrainBodyControls(Current,Out))
    {
        UE_LOG(LogTemp,Warning,TEXT("Stance PlaceKnot phase=%d failed at ConstrainBodyControls"),Index);
        return false;
    }
    return true;
}

void FFlowFestStancePreparation::BeginPrefixRepair(const FFlowArtsArmClearancePreparedSeed& Target)
{
    bRepairAttemptedForKnot=true;
    RepairTarget=Target;
    const double Window=RepairAttempt ? .5 : .25;
    RepairStart=FMath::Max(0,Knot-FMath::CeilToInt(Window*Knots.Num()/Current.Duration));
    RepairStart-=RepairStart%2;
    // Include the following source endpoint so the outgoing midpoint of the
    // source being changed is part of this atomic certificate.
    const int32 LookAhead=2*FMath::Max(1,FMath::CeilToInt(.18*Knots.Num()/(2.*Current.Duration)));
    RepairEnd=FMath::Min(Knots.Num()-2,Knot+Knot%2+LookAhead+2);
    RepairSeeds=CurrentSeeds;
    for(int32 I=FMath::Max(RepairStart,Knot+Knot%2);I<=RepairEnd;I+=2)
        if (!RepairSeeds[I].bValid) RepairSeeds[I]=RepairTarget;
    RepairIndex=RepairStart;
    RepairRefinement=0;
    bRepairMidpoints=false;
    bRepairJoint=bRepairJointFinal=false;
    bRepairing=true;
}

bool FFlowFestStancePreparation::QueryRepairKnot(int32 Index,
    const FFlowArtsArmClearancePreparedSeed& Proposal,
    FFlowArtsArmClearancePreparedSeed& Checked, FFlowArtsArmClearanceResult& Result) const
{
    FFlowArtsArmClearancePreparationSnapshot Snapshot;
    if (!PlaceKnot(Index,Snapshot)) return false;
    // The proposed absolute controls are transported from neighboring source
    // poses. Replacing the torso angle with the local plan angle changes them.
    Snapshot.bConstrainPreparedTorsoRotation=false;
    if (Index%2) Snapshot.bConstrainPreparedHandTranslation=false;
    Snapshot.SkinEvidencePath.Reset();
    if (!FFlowArtsArmClearance::PrepareCandidate(Snapshot,0,&Proposal,Checked,Result)) return false;
    if (Index%2)
        for (int32 Side=0;Side<2;++Side)
            if (!Checked.HandTranslationCm[Side].Equals(Proposal.HandTranslationCm[Side],1.e-6)) return false;
    return true;
}

void FFlowFestStancePreparation::BeginJointRepair(int32 Midpoint,
    const FFlowArtsArmClearanceResult& Rejection)
{
    bRepairJoint=true;
    bRepairJointUsed=true;
    RepairJointMidpoint=Midpoint;
    RepairJointObservedArm=(Rejection.WorstSegment==0 || Rejection.WorstSegment==1) &&
        (Rejection.WorstArm==0 || Rejection.WorstArm==1) ? Rejection.WorstArm : INDEX_NONE;
    RepairJointSweepArm=INDEX_NONE;
    RepairJointSweepSources.Reset();
    RepairJointStep=0;
    RepairJointBaselineIndex=0;
    RepairJointRampVariant=RepairJointRampIndex=0;
    RepairJointOriginalSeeds.Reset();
    RepairJointRampSeeds.Reset();
    RepairJointRampCosts.Reset();
    RepairJointRampBuilt.Reset();
    RepairJointBestSeeds.Reset();
    RepairJointBestCosts.Reset();
    RepairJointBestBuilt.Reset();
    bRepairJointRampComparing=bRepairJointWarmStarted=false;
    RepairJointRampCompareIndex=0;
    RepairJointRampBefore=RepairJointRampAfter=0.;
    RepairJointCosts.Init(TNumericLimits<double>::Max(),Knots.Num());
    RepairJointBuilt.Init(false,Knots.Num());
    UE_LOG(LogTemp,Log,TEXT("Stance joint source window trial=%d midpoint=%.6f bounds=%d..%d residual=%.6f penalty=%.12f"),
        Trial,Knots[Midpoint].Seconds,RepairStart,RepairEnd,
        Rejection.WorstPenetrationCm,Rejection.PreparedContactPenalty);
}

bool FFlowFestStancePreparation::BeginFinalRepair(int32 FailedOdd)
{
    const int32 N=Knots.Num();
    if(bFinalRepairAttempted || N<4 || FailedOdd<1 || FailedOdd>=N || !(FailedOdd%2) ||
        Clear!=N || !bContinuous) return false;
    for(int32 I=0;I<N;I+=2) if(!CurrentSeeds[I].bValid) return false;
    // Final validation has already completed the source pass. Retain it for
    // rollback and repair only the two adjacent sources (tail only at wrap).
    // Source zero is always the fixed exterior of a wrapped repair.
    FinalRepairOriginalSeeds=CurrentSeeds;
    bFinalRepairAttempted=bFinalRepairActive=true;
    bValidating=bValidationPassed=false;
    Knot=FMath::Min(FailedOdd+1,N-2);
    RepairStart=FMath::Max(0,Knot-4);
    RepairEnd=Knot;
    RepairSeeds=CurrentSeeds;
    RepairTarget=CurrentSeeds[Knot];
    RepairIndex=RepairStart;
    RepairAttempt=RepairRefinement=RepairRebases=RepairMidpointRebases=0;
    bRepairMidpoints=bRepairJointFinal=false;
    bRepairing=true;
    BeginJointRepair(FailedOdd,FFlowArtsArmClearanceResult{});
    return true;
}

void FFlowFestStancePreparation::SelectJointSweepSources()
{
    RepairJointSweepSources.Reset();
    const int32 FirstMovable=RepairStart+(Knot==0 ? 0 : 2);
    const int32 LastPhase=RepairEnd+(bFinalRepairActive ? 1 : 0);
    const int32 N=Knots.Num();
    const double Dt=Current.Duration/N;
    TArray<double> Priority;
    Priority.Init(0.,N);
    auto AddSource=[&](int32 Source,double Weight)
    {
        if(Source>=FirstMovable && Source<=RepairEnd && !(Source%2)) Priority[Source]+=Weight;
    };
    auto AddPhase=[&](int32 Phase,double Weight)
    {
        if(Phase%2) { AddSource(Phase-1,Weight); AddSource((Phase+1)%N,Weight); }
        else AddSource(Phase,Weight);
    };
    const int32 FirstPhase=Knot==0 ? 0 : FMath::Max(1,RepairStart-1);
    for(int32 I=FirstPhase;I<=LastPhase;++I)
    {
        AddPhase(I,!RepairJointBuilt[I] ? 1.e6 : RepairJointCosts[I]);
        if(I>0)
        {
            const double Rate=FlowFestStanceDetail::ArmRateMerit(RepairSeeds[I-1],RepairSeeds[I],Dt);
            AddPhase(I-1,Rate); AddPhase(I,Rate);
        }
    }
    if(bFinalRepairActive)
    {
        const int32 Exterior=(RepairEnd+2)%N;
        const double Rate=FlowFestStanceDetail::ArmRateMerit(RepairSeeds[LastPhase],RepairSeeds[Exterior],Dt);
        AddPhase(LastPhase,Rate); AddPhase(Exterior,Rate);
    }
    const int32 Core=FMath::Clamp(Knot+Knot%2,FirstMovable,RepairEnd);
    // Freeze three distinct sources for the entire sweep, so each receives
    // both signs of every scheduled dimension. Re-rank only between sweeps.
    for(int32 Slot=0;Slot<3;++Slot)
    {
        int32 BestSource=INDEX_NONE;
        for(int32 I=FirstMovable;I<=RepairEnd;I+=2)
        {
            if(RepairJointSweepSources.Contains(I)) continue;
            if(BestSource==INDEX_NONE || Priority[I]>Priority[BestSource] ||
                (Priority[I]==Priority[BestSource] && FMath::Abs(I-Core)<FMath::Abs(BestSource-Core)))
                BestSource=I;
        }
        if(BestSource==INDEX_NONE) break;
        RepairJointSweepSources.Add(BestSource);
    }
}

void FFlowFestStancePreparation::StepJointRepair()
{
    const int32 First=FMath::Max(1,RepairStart-1);
    const int32 LastPhase=RepairEnd+(bFinalRepairActive ? 1 : 0);
    const int32 RightExterior=(RepairEnd+2)%Knots.Num();
    auto Query=[&](int32 I,const TArray<FFlowArtsArmClearancePreparedSeed>& Seeds,
        FFlowArtsArmClearancePreparedSeed& Checked,FFlowArtsArmClearanceResult& Result)
    {
        FFlowArtsArmClearancePreparedSeed Proposal;
        if (I%2)
        {
            if (!FFlowArtsArmClearance::InterpolatePreparedSeed(Seeds[I-1],Seeds[(I+1)%Knots.Num()],.5,Proposal)) return false;
        }
        else Proposal=Seeds[I];
        return QueryRepairKnot(I,Proposal,Checked,Result);
    };
    const int32 SourceCount=(RepairEnd-RepairStart)/2+1;
    const int32 MidpointCount=(LastPhase-First)/2+1;
    const double Dt=Current.Duration/Knots.Num();
    if (RepairJointBaselineIndex<SourceCount+MidpointCount)
    {
        const int32 Ordinal=RepairJointBaselineIndex++;
        // Seed all unpublished source endpoints before reconstructing any odd
        // sample from their controls.
        const int32 I=Ordinal<SourceCount ? RepairStart+Ordinal*2 : First+(Ordinal-SourceCount)*2;
        FFlowArtsArmClearancePreparedSeed Checked;
        FFlowArtsArmClearanceResult Result;
        const bool bBuilt=Query(I,RepairSeeds,Checked,Result);
        if(I==RepairJointMidpoint && bBuilt && !Result.bFeasible &&
            (Result.WorstSegment==0 || Result.WorstSegment==1) &&
            (Result.WorstArm==0 || Result.WorstArm==1)) RepairJointObservedArm=Result.WorstArm;
        RepairJointBuilt[I]=bBuilt;
        RepairJointCosts[I]=bBuilt && Result.bFeasible ? 0. : 1000.;
        // An unpublished future endpoint is a variable. Its transported
        // baseline may fail, but the valid full-control proposal still seeds
        // the bounded joint search; never freeze or reject that guess here.
        if(bBuilt) RepairSeeds[I]=Checked;
        return;
    }
    if(RepairJointBestSeeds.IsEmpty())
    {
        RepairJointOriginalSeeds=RepairSeeds;
        RepairJointBestSeeds=RepairSeeds;
        RepairJointBestCosts=RepairJointCosts;
        RepairJointBestBuilt=RepairJointBuilt;
    }
    // Try coherent entry and exit profiles before single-coordinate descent.
    // Each profile is a scratch full-control path, queried one phase per Step.
    // The zero profile is the baseline above; none changes the published path.
    static constexpr double RampHeight[4]={-10.,-12.,-16.,-6.};
    static constexpr double RampLeftPole[4]={45.,15.,0.,45.};
    static constexpr double RampYaw[4]={0.,-8.,0.,-8.};
    if (RepairJointRampVariant<12)
    {
        const bool bTransitionField=RepairJointRampVariant>=4;
        // A pretarget rejection is evidence about the transition, not a new
        // choreography target. Keep the original blocked source as the core.
        const int32 FirstChanged=RepairStart+(Knot==0 ? 0 : 2);
        const int32 LastChanged=RepairEnd;
        const int32 CenterSource=FMath::Clamp(Knot+Knot%2,FirstChanged,LastChanged);
        const int32 FirstAffectedOdd=First;
        const int32 RampSourceCount=(RepairEnd-FirstChanged)/2+1;
        const int32 RampMidpointCount=(LastPhase-FirstAffectedOdd)/2+1;
        auto LogBlockOutcome=[&](const TCHAR* Outcome,double Before,double After,
            bool bPaired,int32 AbortIndex)
        {
            if(!bTransitionField) return;
            FString Unbuilt,Contact,Rate;
            for(int32 J=RepairStart;J<=LastPhase;++J)
            {
                if(!RepairJointRampBuilt[J]) Unbuilt+=FString::Printf(TEXT(" %d"),J);
                else if(RepairJointRampCosts[J]>1.e-7) Contact+=FString::Printf(TEXT(" %d"),J);
            }
            for(int32 J=FMath::Max(0,First-1);J<LastPhase;++J)
                if(!ContinuousArms(RepairJointRampSeeds[J],RepairJointRampSeeds[J+1],Dt))
                    Rate+=FString::Printf(TEXT(" %d>%d"),J,J+1);
            if(bFinalRepairActive && !ContinuousArms(RepairJointRampSeeds[LastPhase],RepairJointRampSeeds[RightExterior],Dt))
                Rate+=FString::Printf(TEXT(" %d>%d"),LastPhase,RightExterior);
            UE_LOG(LogTemp,Log,TEXT("Stance joint transition trial=%d variant=%d sources=%d..%d core=%d outcome=%s pairedValid=%d paired=%.6f->%.6f abort=%d unbuilt=[%s] contact=[%s] rate=[%s]"),
                Trial,RepairJointRampVariant,FirstChanged,LastChanged,CenterSource,Outcome,
                bPaired ? 1 : 0,Before,After,AbortIndex,*Unbuilt,*Contact,*Rate);
        };
        if (bRepairJointRampComparing)
        {
            const int32 I=RepairJointRampCompareIndex++;
            const bool bOld=RepairJointBestBuilt[I], bNew=RepairJointRampBuilt[I];
            if (bOld && bNew)
            {
                FFlowArtsArmClearancePreparationSnapshot Own;
                double OldMerit=0.,NewMerit=0.;
                if (!PlaceKnot(I,Own) || !FFlowArtsArmClearance::ComparePreparedContactMerit(Own,
                    RepairJointBestSeeds[I],RepairJointRampSeeds[I],OldMerit,NewMerit))
                {
                    // The two poses must be measured against the same
                    // authored snapshot and union of contact witnesses.
                    UE_LOG(LogTemp,Log,TEXT("Stance joint ramp comparison unavailable trial=%d variant=%d phase=%d"),
                        Trial,RepairJointRampVariant,I);
                    LogBlockOutcome(TEXT("paired-comparison-unavailable"),RepairJointRampBefore,
                        RepairJointRampAfter,false,I);
                    bRepairJointRampComparing=false;
                    ++RepairJointRampVariant;
                    RepairJointRampSeeds.Reset();
                    return;
                }
                RepairJointRampBefore+=RepairJointBestCosts[I]+OldMerit;
                RepairJointRampAfter+=RepairJointRampCosts[I]+NewMerit;
            }
            else
            {
                RepairJointRampBefore+=bOld ? RepairJointBestCosts[I] : 1.e6;
                RepairJointRampAfter+=bNew ? RepairJointRampCosts[I] : 1.e6;
            }
            if (RepairJointRampCompareIndex<=LastPhase) return;
            for(int32 J=First;J<=LastPhase;++J)
            {
                RepairJointRampBefore+=FlowFestStanceDetail::ArmRateMerit(
                    RepairJointBestSeeds[J-1],RepairJointBestSeeds[J],Dt);
                RepairJointRampAfter+=FlowFestStanceDetail::ArmRateMerit(
                    RepairJointRampSeeds[J-1],RepairJointRampSeeds[J],Dt);
            }
            if(bFinalRepairActive)
            {
                RepairJointRampBefore+=FlowFestStanceDetail::ArmRateMerit(
                    RepairJointBestSeeds[LastPhase],RepairJointBestSeeds[RightExterior],Dt);
                RepairJointRampAfter+=FlowFestStanceDetail::ArmRateMerit(
                    RepairJointRampSeeds[LastPhase],RepairJointRampSeeds[RightExterior],Dt);
            }
            const bool bImproved=RepairJointRampAfter+1.e-7<RepairJointRampBefore;
            LogBlockOutcome(bImproved ? TEXT("retained") : TEXT("not-improved"),
                RepairJointRampBefore,RepairJointRampAfter,true,INDEX_NONE);
            if (bImproved)
            {
                RepairJointBestSeeds=RepairJointRampSeeds;
                RepairJointBestCosts=RepairJointRampCosts;
                RepairJointBestBuilt=RepairJointRampBuilt;
                UE_LOG(LogTemp,Log,TEXT("Stance joint window retained partial ramp trial=%d variant=%d paired merit %.6f -> %.6f"),
                    Trial,RepairJointRampVariant,RepairJointRampBefore,RepairJointRampAfter);
            }
            bRepairJointRampComparing=false;
            ++RepairJointRampVariant;
            RepairJointRampSeeds.Reset();
            return;
        }
        if (RepairJointRampSeeds.IsEmpty())
        {
            RepairJointRampSeeds=RepairJointOriginalSeeds;
            RepairJointRampCosts.Init(TNumericLimits<double>::Max(),Knots.Num());
            RepairJointRampBuilt.Init(false,Knots.Num());
            if(Knot>0)
            {
                // The accepted left source stays fixed, but its certificate
                // remains part of the full frontier gate below.
                RepairJointRampCosts[RepairStart]=RepairJointCosts[RepairStart];
                RepairJointRampBuilt[RepairStart]=RepairJointBuilt[RepairStart];
            }
            RepairJointRampIndex=0;
            if (RampSourceCount==0)
            {
                LogBlockOutcome(TEXT("no-movable-sources"),0.,0.,false,INDEX_NONE);
                ++RepairJointRampVariant;
                RepairJointRampSeeds.Reset();
                return;
            }
            // The core branch is chosen once in the mesh frame. A smooth
            // transition approaches that same pole from each source baseline
            // and holds it through the mutable right frontier.
            const int32 Profile=(RepairJointRampVariant-4)/2;
            const int32 FieldSide=(RepairJointObservedArm==0 || RepairJointObservedArm==1) ?
                RepairJointObservedArm : (bTransitionField ? Profile%2 : RepairJointRampVariant%2);
            const double Handed=FieldSide==0 ? 1. : -1.;
            static constexpr double FieldHeight[4]={-12.,-12.,-16.,-10.};
            static constexpr double FieldPole[4]={60.,60.,45.,45.};
            static constexpr double FieldYaw[4]={0.,-8.,0.,-8.};
            static constexpr double FieldLateral[4]={0.,4.,0.,4.};
            const double Amplitude=bTransitionField && (RepairJointRampVariant%2==0) ? .75 : 1.;
            const auto& CoreSeed=RepairJointOriginalSeeds[CenterSource];
            FVector CorePole=CoreSeed.ElbowPole[FieldSide].GetSafeNormal();
            const FVector CoreAxis=(CoreSeed.SolvedWrists[FieldSide]-CoreSeed.SolvedShoulders[FieldSide]).GetSafeNormal();
            if(bTransitionField && (!CorePole.Normalize() || CoreAxis.IsNearlyZero()))
            {
                LogBlockOutcome(TEXT("invalid-core-pole"),0.,0.,false,CenterSource);
                ++RepairJointRampVariant; RepairJointRampSeeds.Reset(); return;
            }
            if(bTransitionField) CorePole=FlowFestStanceDetail::TransitionCorePole(
                CorePole,CoreAxis,FieldPole[Profile]*Amplitude,FieldSide);
            bool bFieldValid=true;
            int32 InvalidSource=INDEX_NONE;
            for(int32 I=FirstChanged;I<=RepairEnd;I+=2)
            {
                FFlowArtsArmClearancePreparationSnapshot Own;
                if(!PlaceKnot(I,Own)) { bFieldValid=false; InvalidSource=I; break; }
                auto& S=RepairJointRampSeeds[I];
                const double Rise=FMath::Max(2.,double(RepairEnd-RepairStart)*.5);
                const double Weight=bTransitionField ? (Knot==0 ? 1. :
                    FMath::Clamp(double(I-RepairStart)/double(FMath::Max(2,CenterSource-RepairStart)),0.,1.)) :
                    (Knot==0 ? FMath::Cos(.5*PI*FMath::Min(1.,double(I-RepairStart)/Rise)) :
                        FMath::Sin(.5*PI*FMath::Min(1.,double(I-RepairStart)/Rise)));
                const double Height=bTransitionField ? FieldHeight[Profile]*Amplitude : RampHeight[RepairJointRampVariant];
                const double LeftPole=bTransitionField ? FieldPole[Profile]*Amplitude : RampLeftPole[RepairJointRampVariant];
                const double Yaw=bTransitionField ? FieldYaw[Profile]*Amplitude : RampYaw[RepairJointRampVariant];
                const FVector Up=(Own.Geometry.Neck-Own.Geometry.FixedHip).GetSafeNormal();
                if(Up.IsNearlyZero()) { bFieldValid=false; InvalidSource=I; break; }
                FVector Shift=Up*Height*Weight;
                if (bTransitionField && FieldLateral[Profile]!=0.)
                {
                    FVector BlockLateral=FVector::VectorPlaneProject(Own.Geometry.Arms[1].Upper.GetLocation()-
                        Own.Geometry.Arms[0].Upper.GetLocation(),Current.PatternNormal);
                    if(BlockLateral.Normalize()) Shift+=BlockLateral*Handed*FieldLateral[Profile]*Amplitude*Weight;
                }
                for(int32 Side=0;Side<2;++Side) S.HandTranslationCm[Side]+=Shift;
                if (bTransitionField)
                {
                    const FVector BasePole=S.ElbowPole[FieldSide].GetSafeNormal();
                    if(BasePole.IsNearlyZero() || FVector::DotProduct(BasePole,CorePole)<-.98)
                    { bFieldValid=false; InvalidSource=I; break; }
                    const FQuat Arc=FQuat::FindBetweenNormals(BasePole,CorePole);
                    S.ElbowPole[FieldSide]=FQuat::Slerp(FQuat::Identity,Arc,Weight).RotateVector(BasePole).GetSafeNormal();
                }
                else
                {
                    const FVector Axis=(S.SolvedWrists[FieldSide]-S.SolvedShoulders[FieldSide]).GetSafeNormal();
                    if(!Axis.IsNearlyZero()) S.ElbowPole[FieldSide]=FQuat(Axis,FMath::DegreesToRadians(
                        Handed*LeftPole*Weight)).RotateVector(S.ElbowPole[FieldSide]);
                }
                S.TorsoRotation=(FQuat(Up,FMath::DegreesToRadians(Handed*Yaw*Weight))*
                    S.TorsoRotation).GetNormalized();
            }
            if(!bFieldValid)
            {
                LogBlockOutcome(TEXT("invalid-transition-field"),0.,0.,false,InvalidSource);
                ++RepairJointRampVariant; RepairJointRampSeeds.Reset(); return;
            }
        }
        const int32 Ordinal=RepairJointRampIndex++;
        const int32 I=Ordinal<RampSourceCount ? FirstChanged+Ordinal*2 :
            FirstAffectedOdd+(Ordinal-RampSourceCount)*2;
        FFlowArtsArmClearancePreparedSeed Checked;
        FFlowArtsArmClearanceResult Result;
        const bool bBuilt=Query(I,RepairJointRampSeeds,Checked,Result);
        RepairJointRampBuilt[I]=bBuilt;
        if(bBuilt) RepairJointRampSeeds[I]=Checked;
        RepairJointRampCosts[I]=bBuilt && Result.bFeasible ? 0. : 1000.;
        if(RepairJointRampIndex<RampSourceCount+RampMidpointCount) return;
        bool bCertified=true;
        for(int32 J=RepairStart;J<=RepairEnd;J+=2) bCertified &= RepairJointRampCosts[J]==0.;
        for(int32 J=First;J<=LastPhase;J+=2) bCertified &= RepairJointRampCosts[J]==0.;
        for(int32 J=First;J<=LastPhase;++J)
            bCertified &= ContinuousArms(RepairJointRampSeeds[J-1],RepairJointRampSeeds[J],Dt);
        if(bFinalRepairActive)
            bCertified &= ContinuousArms(RepairJointRampSeeds[LastPhase],RepairJointRampSeeds[RightExterior],Dt);
        if(bCertified)
        {
            LogBlockOutcome(TEXT("fully-certified"),0.,0.,false,INDEX_NONE);
            RepairSeeds=MoveTemp(RepairJointRampSeeds);
            bRepairJoint=false; bRepairJointFinal=true; bRepairMidpoints=false;
            RepairIndex=RepairStart; RepairRefinement=0;
            UE_LOG(LogTemp,Log,TEXT("Stance coherent source window certified locally; recertifying all phases"));
            return;
        }
        bRepairJointRampComparing=true;
        RepairJointRampCompareIndex=Knot==0 ? 0 : First;
        RepairJointRampBefore=RepairJointRampAfter=0.;
        return;
    }
    if(!bRepairJointWarmStarted && !RepairJointBestSeeds.IsEmpty())
    {
        RepairSeeds=MoveTemp(RepairJointBestSeeds);
        RepairJointCosts=MoveTemp(RepairJointBestCosts);
        RepairJointBuilt=MoveTemp(RepairJointBestBuilt);
        bRepairJointWarmStarted=true;
        UE_LOG(LogTemp,Log,TEXT("Stance joint window paired-merit warm start trial=%d"),Trial);
    }
    constexpr int32 MaxControlSteps=96;
    if (RepairJointStep==MaxControlSteps)
    {
        int32 Unbuilt=0, ContactFailures=0, RateFailures=0;
        double RateExcess=0.;
        for(int32 I=Knot==0 ? 0 : First;I<=LastPhase;++I)
        {
            Unbuilt+=!RepairJointBuilt[I];
            ContactFailures+=RepairJointBuilt[I] && RepairJointCosts[I]>1.e-7;
            if(I>=First && !ContinuousArms(RepairSeeds[I-1],RepairSeeds[I],Dt))
            {
                ++RateFailures;
                RateExcess+=FlowFestStanceDetail::ArmRateExcess(RepairSeeds[I-1],RepairSeeds[I],Dt);
            }
        }
        if(bFinalRepairActive && !ContinuousArms(RepairSeeds[LastPhase],RepairSeeds[RightExterior],Dt))
        {
            ++RateFailures;
            RateExcess+=FlowFestStanceDetail::ArmRateExcess(RepairSeeds[LastPhase],RepairSeeds[RightExterior],Dt);
        }
        UE_LOG(LogTemp,Log,TEXT("Stance joint search exhausted trial=%d target=%.6f unbuilt=%d contactFailures=%d rateFailures=%d rateExcess=%.6f"),
            Trial,Knots[RepairJointMidpoint].Seconds,Unbuilt,ContactFailures,RateFailures,RateExcess);
        bRepairJoint=false;
        RejectPrefixRepair(FString::Printf(TEXT("Joint endpoint window exhausted %d controls at phase %.6f"),
            MaxControlSteps,Knots[RepairJointMidpoint].Seconds));
        return;
    }
    // A nonzero repair keeps its accepted left anchor fixed. At phase zero
    // there is no accepted anchor, so source zero is itself a search variable.
    // Global suffix/midpoint/seam gates must pass before any publication.
    int32 Source=INDEX_NONE,Dimension=INDEX_NONE;
    double Direction=1.;
    if(RepairJointStep%48==0)
    {
        RepairJointSweepArm=RepairJointObservedArm;
        SelectJointSweepSources();
    }
    FlowFestStanceDetail::SelectJointControl(RepairStart,RepairEnd,Knot+Knot%2,
        RepairJointStep,Knot==0,RepairJointSweepArm,Source,Dimension,Direction);
    if(!RepairJointSweepSources.IsEmpty())
        Source=RepairJointSweepSources[((RepairJointStep%48)/16)%RepairJointSweepSources.Num()];
    ++RepairJointStep;
    if (Source<RepairStart+(Knot==0 ? 0 : 2) || Source>RepairEnd) return;
    auto TrialSeeds=RepairSeeds;
    auto& Changed=TrialSeeds[Source];
    FFlowArtsArmClearancePreparationSnapshot Own;
    if(!PlaceKnot(Source,Own)) return;
    const FVector Up=(Own.Geometry.Neck-Own.Geometry.FixedHip).GetSafeNormal();
    if(Up.IsNearlyZero()) return;
    if (Dimension==0 || Dimension==5)
    {
        const int32 Side=Dimension==0 ? 0 : 1;
        const FVector Axis=(Changed.SolvedWrists[Side]-Changed.SolvedShoulders[Side]).GetSafeNormal();
        if (Axis.IsNearlyZero()) return;
        Changed.ElbowPole[Side]=FQuat(Axis,FMath::DegreesToRadians(15.*Direction)).RotateVector(Changed.ElbowPole[Side]);
    }
    else if (Dimension==6 || Dimension==7)
    {
        const int32 Side=Dimension-6;
        Changed.ClavicleProtractionDeg[Side]=FMath::Clamp(Changed.ClavicleProtractionDeg[Side]+float(5.*Direction),0.f,40.f);
    }
    else if (Dimension==1 || Dimension==8)
    {
        FVector Axis=FVector::VectorPlaneProject(Dimension==1 ? Up :
            Own.Geometry.Arms[1].Upper.GetLocation()-Own.Geometry.Arms[0].Upper.GetLocation(),Current.PatternNormal);
        if(!Axis.Normalize()) return;
        const FVector Common=(Changed.HandTranslationCm[0]+Changed.HandTranslationCm[1])*.5;
        const double Value=FVector::DotProduct(Common,Axis);
        const double Next=Dimension==1 ? FMath::Clamp(Value+2.*Direction,-16.,0.) :
            FMath::Clamp(Value+4.*Direction,-6.,6.);
        for(int32 Side=0;Side<2;++Side) Changed.HandTranslationCm[Side]+=Axis*(Next-Value);
    }
    else if (Dimension==2)
        Changed.TorsoRotation=(FQuat(Up,FMath::DegreesToRadians(8.*Direction))*Changed.TorsoRotation).GetNormalized();
    else
    {
        const FVector Normal=Current.PatternNormal;
        if (!Normal.IsNormalized()) return;
        const double Common=FVector::DotProduct((Changed.HandTranslationCm[0]+Changed.HandTranslationCm[1])*.5,Normal);
        const double Depth=FVector::DotProduct((Changed.HandTranslationCm[0]-Changed.HandTranslationCm[1])*.5,Normal);
        const double NewCommon=FMath::Clamp(Common+(Dimension==3 ? 2.*Direction : 0.),
            -FFlowArtsArmClearance::PreparedCommonDepthLimitCm,0.);
        const double NewDepth=FMath::Clamp(Depth+(Dimension==4 ? 2.*Direction : 0.),0.,
            FFlowArtsArmClearance::PreparedDifferentialDepthLimitCm);
        for (int32 Side=0;Side<2;++Side)
        {
            const FVector Orthogonal=FVector::VectorPlaneProject(Changed.HandTranslationCm[Side],Normal);
            Changed.HandTranslationCm[Side]=Orthogonal+Normal*(NewCommon+(Side ? -NewDepth : NewDepth));
        }
    }
    const int32 A=FMath::Max(Knot==0 ? 0 : First,Source-1), B=FMath::Min(LastPhase,Source+1);
    double Before=0.,After=0.;
    // The source certificate is queried first, so both adjacent midpoint
    // proposals interpolate its freshly solved absolute control.
    FFlowArtsArmClearancePreparedSeed Checked;
    FFlowArtsArmClearanceResult Result;
    if (!Query(Source,TrialSeeds,Checked,Result)) return;
    if(Source==Knot+Knot%2 && !Result.bFeasible &&
        (Result.WorstSegment==0 || Result.WorstSegment==1) &&
        (Result.WorstArm==0 || Result.WorstArm==1)) RepairJointObservedArm=Result.WorstArm;
    TrialSeeds[Source]=Checked;
    double NewCosts[3]={};
    NewCosts[Source-A]=Result.bFeasible ? 0. : 1000.;
    for(int32 I=A;I<=B;++I)
    {
        if (I==Source) continue;
        if (!Query(I,TrialSeeds,Checked,Result)) return;
        TrialSeeds[I]=Checked;
        NewCosts[I-A]=Result.bFeasible ? 0. : 1000.;
    }
    for(int32 I=A;I<=B;++I)
    {
        FFlowArtsArmClearancePreparationSnapshot Snapshot;
        if (!PlaceKnot(I,Snapshot)) return;
        if(!RepairJointBuilt[I])
        {
            // The old transported pose has no geometry to share witnesses
            // with. A newly built pose strictly improves this phase; every
            // changed phase was built above and final gates still certify it.
            Before+=1.e6;
            After+=NewCosts[I-A];
            continue;
        }
        double OldMerit=0.,NewMerit=0.;
        if (!FFlowArtsArmClearance::ComparePreparedContactMerit(Snapshot,RepairSeeds[I],TrialSeeds[I],
            OldMerit,NewMerit)) return;
        Before+=RepairJointCosts[I]+OldMerit;
        After+=NewCosts[I-A]+NewMerit;
    }
    for(int32 I=FMath::Max(First-1,A-1);I<=FMath::Min(LastPhase-1,B);++I)
    {
        Before+=FlowFestStanceDetail::ArmRateMerit(RepairSeeds[I],RepairSeeds[I+1],Dt);
        After+=FlowFestStanceDetail::ArmRateMerit(TrialSeeds[I],TrialSeeds[I+1],Dt);
    }
    if(bFinalRepairActive && B==LastPhase)
    {
        Before+=FlowFestStanceDetail::ArmRateMerit(RepairSeeds[LastPhase],RepairSeeds[RightExterior],Dt);
        After+=FlowFestStanceDetail::ArmRateMerit(TrialSeeds[LastPhase],TrialSeeds[RightExterior],Dt);
    }
    if (After+1.e-7>=Before) return;
    for(int32 I=A;I<=B;++I)
    {
        RepairSeeds[I]=TrialSeeds[I];
        RepairJointCosts[I]=NewCosts[I-A];
        RepairJointBuilt[I]=true;
    }
    if(Knot==0 && RepairJointCosts[0]>1.e-7) return;
    for(int32 I=First;I<=LastPhase;++I)
        if (RepairJointCosts[I]>1.e-7 || !ContinuousArms(RepairSeeds[I-1],RepairSeeds[I],Dt)) return;
    if(bFinalRepairActive && !ContinuousArms(RepairSeeds[LastPhase],RepairSeeds[RightExterior],Dt)) return;
    // A promising local result is only a proposal. The normal pass below
    // recertifies every window phase and continuity link before publication.
    bRepairJoint=false;
    bRepairJointFinal=true;
    bRepairMidpoints=false;
    RepairIndex=RepairStart;
    RepairRefinement=0;
    UE_LOG(LogTemp,Log,TEXT("Stance joint window local midpoint cleared trial=%d steps=%d; recertifying interval"),
        Trial,RepairJointStep);
}

void FFlowFestStancePreparation::RejectPrefixRepair(const FString& Reason)
{
    UE_LOG(LogTemp,Log,TEXT("Stance prefix repair trial=%d target=%d attempt=%d rejected: %s"),Trial,Knot,RepairAttempt,*Reason);
    if(bFinalRepairActive)
    {
        FirstRejection+=TEXT("; final repair: ")+Reason;
        bRepairing=bRepairJoint=bValidating=false;
        CompleteTrial();
        return;
    }
    if(!RepairAttempt && RepairStart>0)
    {
        ++RepairAttempt;
        bRepairJointUsed=false;
        BeginPrefixRepair(RepairTarget);
        return;
    }
    bRepairing=false;
    CandidateRejection+=TEXT("; prefix repair: ")+Reason;
    FinishKnot();
}

bool FFlowFestStancePreparation::RebasePrefixRepair(const FFlowArtsArmClearancePreparedSeed& CertifiedTarget)
{
    if(RepairRebases || !CertifiedTarget.bValid) return false;
    ++RepairRebases;
    RepairAttempt=0;
    // Restart from the untouched accepted prefix. The endpoint certificate is
    // only a target: every earlier pose and interpolated midpoint is queried again.
    BeginPrefixRepair(CertifiedTarget);
    return true;
}

bool FFlowFestStancePreparation::RebaseMidpointRepair(const FFlowArtsArmClearancePreparedSeed& CertifiedTarget)
{
    if(!bRepairMidpoints || RepairMidpointRebases || !CertifiedTarget.bValid) return false;
    ++RepairMidpointRebases;
    RepairAttempt=0;
    // A directly solved odd sample is not a playback control. Use it only to
    // steer source endpoints, then reconstruct and certify all odd samples again.
    BeginPrefixRepair(CertifiedTarget);
    return true;
}

#if WITH_DEV_AUTOMATION_TESTS
void FFlowFestStancePreparation::StepWholeCycleProbe()
{
    constexpr double PoleDegrees[5]={0.,15.,30.,45.,60.};
    constexpr int32 HeightCount=9, PoleCount=5, VariantCount=HeightCount*PoleCount+1;
    const int32 SourceCount=Knots.Num()/2;
    const double Dt=Current.Duration/Knots.Num();
    auto Finish=[&](const FString& Reason)
    {
        const FString Prefix=WholeCycleEvidence+FString::Printf(TEXT("-attempt%d-cycle"),RepairAttempt);
        FFileHelper::SaveStringToFile(WholeCycleNodeCsv,*(Prefix+TEXT("-nodes.csv")));
        FFileHelper::SaveStringToFile(WholeCycleEdgeCsv,*(Prefix+TEXT("-edges.csv")));
        FFileHelper::SaveStringToFile(WholeCycleReachCsv,*(Prefix+TEXT("-reach.csv")));
        FFileHelper::SaveStringToFile(WholeCycleSummary+FString::Printf(
            TEXT("sourceQueries=%d edgeQueries=%d ratePruned=%d\n"),
            WholeCycleNodeQueries,WholeCycleEdgeQueries,WholeCyclePrunedEdges)+Reason,
            *(Prefix+TEXT("-summary.txt")));
        UE_LOG(LogTemp,Display,TEXT("Stance whole-cycle height probe: %s"),*Reason);
        bWholeCycleProbe=false;
        bWholeCycleProbeDone=true;
    };
    auto Edge=[&](int32 MidIndex,const FWholeCycleProbeNode& LeftNode,
        const FWholeCycleProbeNode& RightNode,int32 LeftSource,int32 RightSource,
        int32 LeftVariant,int32 RightVariant)->bool
    {
        if(!ContinuousArms(LeftNode.Seed,RightNode.Seed,2.*Dt))
        {
            ++WholeCyclePrunedEdges;
            return false;
        }
        if(WholeCycleMidIndex!=MidIndex)
        {
            WholeCycleMidIndex=MidIndex;
            bWholeCycleMidValid=PlaceKnot(MidIndex,WholeCycleMidSnapshot);
            WholeCycleMidSnapshot.bConstrainPreparedHandTranslation=false;
            WholeCycleMidSnapshot.bConstrainPreparedTorsoRotation=false;
            WholeCycleMidSnapshot.SkinEvidencePath.Reset();
        }
        FFlowArtsArmClearancePreparedSeed Interpolated,Checked;
        FFlowArtsArmClearanceResult Contact;
        bool bInterpolated=FFlowArtsArmClearance::InterpolatePreparedSeed(
            LeftNode.Seed,RightNode.Seed,.5,Interpolated);
        bool bBuilt=bInterpolated && bWholeCycleMidValid;
        if(bBuilt)
        {
            ++WholeCycleEdgeQueries;
            bBuilt=FFlowArtsArmClearance::PrepareCandidate(WholeCycleMidSnapshot,0,&Interpolated,Checked,Contact);
        }
        const bool bLeftRate=bBuilt && ContinuousArms(LeftNode.Seed,Checked,Dt);
        const bool bRightRate=bBuilt && ContinuousArms(Checked,RightNode.Seed,Dt);
        WholeCycleEdgeCsv+=FString::Printf(TEXT("%d,%d,%d,%d,%d,%d,%d,%d,%.12f,%.9f\n"),
            LeftSource,RightSource,LeftVariant,RightVariant,int32(bBuilt),int32(Contact.bFeasible),
            int32(bLeftRate),int32(bRightRate),Contact.PreparedContactPenalty,Contact.WorstPenetrationCm);
        return bBuilt && Contact.bFeasible && bLeftRate && bRightRate;
    };
    // Stages bound both skin queries and cheap edge scans per worker slice.
    if(WholeCycleStage==0)
    {
        const int32 J=2*WholeCycleIndex;
        if(!PlaceKnot(J,WholeCycleOwnSnapshot))
        {
            Finish(FString::Printf(TEXT("source snapshot unavailable at %d phase %.6f"),J,Knots[J].Seconds));
            return;
        }
        WholeCycleOwnSnapshot.SkinEvidencePath.Reset();
        WholeCycleOwnSnapshot.bConstrainPreparedHandTranslation=false;
        WholeCycleOwnSnapshot.bConstrainPreparedTorsoRotation=false;
        WholeCycleLayers.AddDefaulted();
        WholeCycleVariant=0;
        WholeCycleStage=1;
    }
    if(WholeCycleStage==1)
    {
        const int32 J=2*WholeCycleIndex;
        auto& Own=WholeCycleOwnSnapshot;
        auto& Layer=WholeCycleLayers.Last();
        const FVector Up=(Own.Geometry.Neck-Own.Geometry.FixedHip).GetSafeNormal();
        for(int32 Work=0;Work<8 && WholeCycleVariant<VariantCount;++Work,++WholeCycleVariant)
        {
            const int32 Variant=WholeCycleVariant;
            const bool bCurrent=Variant==VariantCount-1;
            const double Height=bCurrent ? 0. : -2.*(Variant/PoleCount);
            const double Pole=bCurrent ? 0. : PoleDegrees[Variant%PoleCount];
            FFlowArtsArmClearancePreparedSeed Proposal,Certified;
            FFlowArtsArmClearanceResult Contact;
            bool bInterpolated=bCurrent ? CurrentSeeds.IsValidIndex(J) && CurrentSeeds[J].bValid :
                FFlowArtsArmClearance::InterpolatePreparedSeed(WholeCycleStartTemplate,
                    WholeCycleEndTemplate,FMath::Clamp(-Height/12.,0.,1.),Proposal);
            if(bCurrent && bInterpolated) Proposal=CurrentSeeds[J];
            if(bInterpolated && !bCurrent)
            {
                for(int32 Side=0;Side<2;++Side) Proposal.HandTranslationCm[Side]+=Up*Height;
                const FVector Axis=(Proposal.SolvedWrists[0]-
                    Proposal.SolvedShoulders[0]).GetSafeNormal();
                Proposal.ElbowPole[0]=FQuat(Axis,FMath::DegreesToRadians(Pole)).RotateVector(
                    Proposal.ElbowPole[0]);
            }
            ++WholeCycleNodeQueries;
            const bool bBuilt=bInterpolated && !Up.IsNearlyZero() &&
                FFlowArtsArmClearance::PrepareCandidate(Own,0,&Proposal,Certified,Contact);
            WholeCycleNodeCsv+=FString::Printf(TEXT("%d,%.6f,%d,%.1f,%.1f,%d,%d,%.12f,%.9f\n"),
                J,Knots[J].Seconds,Variant,Height,Pole,int32(bBuilt),int32(Contact.bFeasible),
                Contact.PreparedContactPenalty,Contact.WorstPenetrationCm);
            if(bBuilt && Contact.bFeasible)
            {
                auto& Node=Layer.AddDefaulted_GetRef();
                Node.Seed=Certified;
                Node.Variant=Variant;
                Node.Parents.Init(-1,VariantCount);
                if(!WholeCycleIndex) Node.ReachMask=1ull<<Variant;
            }
        }
        if(WholeCycleVariant<VariantCount) return;
        if(Layer.IsEmpty())
        {
            Finish(FString::Printf(TEXT("empty source layer at %d phase %.6f"),J,Knots[J].Seconds));
            return;
        }
        WholeCycleFrom=WholeCycleTo=0;
        WholeCycleStage=WholeCycleIndex ? 2 : 4;
        return;
    }
    if(WholeCycleStage==2 || WholeCycleStage==3)
    {
        const bool bSeam=WholeCycleStage==3;
        const int32 J=2*WholeCycleIndex;
        auto& Prior=bSeam ? WholeCycleLayers.Last() : WholeCycleLayers[WholeCycleIndex-1];
        auto& Layer=bSeam ? WholeCycleLayers[0] : WholeCycleLayers[WholeCycleIndex];
        int32 Work=0, Scans=0;
        while(WholeCycleFrom<Prior.Num() && Work<8 && Scans<64)
        {
            auto& Left=Prior[WholeCycleFrom];
            auto& Right=Layer[WholeCycleTo];
            ++Scans;
            const bool bCanTry=bSeam ? (Left.ReachMask&(1ull<<Right.Variant))!=0 : Left.ReachMask!=0;
            if(bCanTry)
            {
                ++Work;
                const bool bClear=Edge(bSeam ? Knots.Num()-1 : J-1,Left,Right,
                    bSeam ? Knots.Num()-2 : J-2,bSeam ? 0 : J,Left.Variant,Right.Variant);
                if(bClear && bSeam)
                {
                    FString PathCsv=TEXT("source,phase,variant\n");
                    TArray<int32> Path; Path.Init(-1,SourceCount);
                    int32 Parent=WholeCycleFrom;
                    for(int32 L=SourceCount-1;L>=0;--L)
                    {
                        const auto& Node=WholeCycleLayers[L][Parent];
                        Path[L]=Node.Variant;
                        Parent=L ? Node.Parents[Right.Variant] : -1;
                        if(L && Parent<0) break;
                    }
                    for(int32 L=0;L<SourceCount;++L)
                        PathCsv+=FString::Printf(TEXT("%d,%.6f,%d\n"),2*L,Knots[2*L].Seconds,Path[L]);
                    FFileHelper::SaveStringToFile(PathCsv,*(WholeCycleEvidence+
                        FString::Printf(TEXT("-attempt%d-cycle-path.csv"),RepairAttempt)));
                    Finish(FString::Printf(TEXT("closed source cycle variable height root=%d last=%d"),
                        Right.Variant,Left.Variant));
                    return;
                }
                if(bClear && !bSeam)
                    for(int32 Root=0;Root<VariantCount;++Root)
                        if(Left.ReachMask&(1ull<<Root))
                        {
                            Right.ReachMask|=1ull<<Root;
                            if(Right.Parents[Root]<0) Right.Parents[Root]=WholeCycleFrom;
                        }
            }
            if(++WholeCycleTo>=Layer.Num()) { WholeCycleTo=0; ++WholeCycleFrom; }
        }
        if(WholeCycleFrom<Prior.Num()) return;
        if(bSeam)
        {
            Finish(TEXT("all source layers reachable; no certified closing midpoint/rate seam"));
            return;
        }
        WholeCycleStage=4;
    }
    if(WholeCycleStage==4)
    {
        const int32 J=2*WholeCycleIndex;
        const auto& Layer=WholeCycleLayers.Last();
        int32 Reachable=0; uint64 RootMask=0;
        for(const auto& Node:Layer)
            if(Node.ReachMask) { ++Reachable; RootMask|=Node.ReachMask; }
        WholeCycleReachCsv+=FString::Printf(TEXT("%d,%.6f,%d,%d,%llu\n"),
            J,Knots[J].Seconds,Layer.Num(),Reachable,static_cast<unsigned long long>(RootMask));
        if(!Reachable)
        {
            Finish(FString::Printf(TEXT("disconnected source edge %d to %d at phase %.6f; %d own-phase feasible nodes"),
                J-2,J,Knots[J].Seconds,Layer.Num()));
            return;
        }
        ++WholeCycleIndex;
        WholeCycleStage=WholeCycleIndex>=SourceCount ? 3 : 0;
        WholeCycleFrom=WholeCycleTo=0;
        WholeCycleMidIndex=INDEX_NONE;
    }
}
#endif

void FFlowFestStancePreparation::StepPrefixRepair()
{
#if WITH_DEV_AUTOMATION_TESTS
    if(bWholeCycleProbe) { StepWholeCycleProbe(); return; }
#endif
    if(RepairEnd>=Knots.Num() || RepairEnd<Knot ||
        (RepairStart>=Knot && Knot!=0))
    { RejectPrefixRepair(TEXT("Insufficient bounded repair interval")); return; }
    const int32 LastPhase=RepairEnd+(bFinalRepairActive ? 1 : 0);
    const int32 I=RepairIndex;
    FFlowArtsArmClearancePreparationSnapshot Snapshot;
    FFlowArtsArmClearancePreparedSeed Proposed,Checked;
    FFlowArtsArmClearanceResult Result;
    bool Built=PlaceKnot(I,Snapshot);
    Snapshot.SkinEvidencePath.Reset();
    // Repair transports already solved absolute controls. Replacing their torso
    // rotation with this phase's fixed plan rotation changes a certified target
    // (and the source-endpoint interpolation that playback will actually use).
    // Every transported pose still receives a fresh query and both rate checks.
    Snapshot.bConstrainPreparedTorsoRotation=false;
    if(bRepairMidpoints) Snapshot.bConstrainPreparedHandTranslation=false;
#if WITH_DEV_AUTOMATION_TESTS
    FString RepairEvidence; int32 EvidenceTrial=0,EvidenceKnot=30,EvidenceRefinement=32;
    FParse::Value(FCommandLine::Get(),TEXT("FlowArtsRepairEvidenceTrial="),EvidenceTrial);
    FParse::Value(FCommandLine::Get(),TEXT("FlowArtsRepairEvidenceKnot="),EvidenceKnot);
    FParse::Value(FCommandLine::Get(),TEXT("FlowArtsRepairEvidenceRefinement="),EvidenceRefinement);
    const bool TraceRepair=Trial==EvidenceTrial && I==EvidenceKnot && !bRepairMidpoints &&
        FParse::Value(FCommandLine::Get(),TEXT("FlowArtsRepairEvidence="),RepairEvidence);
    if(TraceRepair && RepairRefinement==EvidenceRefinement && !bWholeCycleProbeDone &&
        FParse::Param(FCommandLine::Get(),TEXT("FlowArtsRepairWholeCycleProbe")))
    {
        bWholeCycleProbe=true;
        WholeCycleEvidence=RepairEvidence;
        WholeCycleIndex=0;
        WholeCycleStage=0;
        WholeCycleFrom=WholeCycleTo=WholeCycleVariant=0;
        WholeCycleMidIndex=INDEX_NONE;
        WholeCycleStartTemplate=CurrentSeeds.IsValidIndex(0) ? CurrentSeeds[0] : FFlowArtsArmClearancePreparedSeed{};
        WholeCycleEndTemplate=RepairSeeds.IsValidIndex(I) && RepairSeeds[I].bValid ?
            RepairSeeds[I] : RepairTarget;
        WholeCycleNodeQueries=WholeCycleEdgeQueries=WholeCyclePrunedEdges=0;
        WholeCycleSummary.Reset();
        WholeCycleLayers.Reset();
        WholeCycleNodeCsv=TEXT("source,phase,variant,heightCm,leftPoleDeg,built,feasible,penalty,residual\n");
        WholeCycleEdgeCsv=TEXT("left,right,from,to,built,feasible,leftRate,rightRate,penalty,residual\n");
        WholeCycleReachCsv=TEXT("source,phase,nodes,reachable,rootMask\n");
        bool bCoherent=WholeCycleStartTemplate.bValid && WholeCycleEndTemplate.bValid &&
            WholeCycleStartTemplate.bAbsoluteControls && WholeCycleEndTemplate.bAbsoluteControls;
        for(int32 Side=0;Side<2 && bCoherent;++Side)
            bCoherent=WholeCycleStartTemplate.UpperFrameOffset[Side].Equals(
                    WholeCycleEndTemplate.UpperFrameOffset[Side],1.e-5) &&
                WholeCycleStartTemplate.ForearmFrameOffset[Side].Equals(
                    WholeCycleEndTemplate.ForearmFrameOffset[Side],1.e-5);
        if(!bCoherent)
        {
            WholeCycleSummary=TEXT("coherent full-control template unavailable or frame calibration differs\n");
            WholeCycleStage=0;
            bWholeCycleProbe=false;
            bWholeCycleProbeDone=true;
            FFileHelper::SaveStringToFile(WholeCycleSummary,*(WholeCycleEvidence+
                FString::Printf(TEXT("-attempt%d-cycle-summary.txt"),RepairAttempt)));
            return;
        }
        StepWholeCycleProbe();
        return;
    }
    if(TraceRepair && RepairRefinement==EvidenceRefinement)
        Snapshot.SkinEvidencePath=RepairEvidence+FString::Printf(TEXT("-attempt%d-step%d"),RepairAttempt,RepairRefinement);
#endif
    if(bRepairMidpoints)
    {
        Built=Built && FFlowArtsArmClearance::InterpolatePreparedSeed(RepairSeeds[I-1],RepairSeeds[(I+1)%Knots.Num()],.5,Proposed);
    }
    else if(bRepairJointFinal) Proposed=RepairSeeds[I];
    else if(I>=Knot) Proposed=RepairTarget;
    else
    {
        const double T=double(I-RepairStart)/double(Knot-RepairStart);
        const double Alpha=T*T*(3.-2.*T);
        Built=Built && FFlowArtsArmClearance::InterpolatePreparedSeed(CurrentSeeds[I],RepairTarget,Alpha,Proposed);
    }
    Built=Built && (RepairRefinement
        ? FFlowArtsArmClearance::RefinePreparedCandidate(Snapshot,RepairSeeds[I],Checked,Result)
        : FFlowArtsArmClearance::PrepareCandidate(Snapshot,0,&Proposed,Checked,Result));
    if(Built && bRepairMidpoints && !RepairRefinement)
        for(int32 Side=0;Side<2;++Side)
            Built &= Checked.HandTranslationCm[Side].Equals(Proposed.HandTranslationCm[Side],1.e-6);
#if WITH_DEV_AUTOMATION_TESTS
    if(TraceRepair)
    {
        // A stalled refinement intentionally returns no new result. Re-query
        // its last coordinate for evidence without accepting it as progress.
        auto EvidenceSeed=Checked;
        auto EvidenceResult=Result;
        if(!Built && RepairRefinement)
            FFlowArtsArmClearance::PrepareCandidate(Snapshot,0,&RepairSeeds[I],EvidenceSeed,EvidenceResult);
        if(RepairRefinement==EvidenceRefinement && FParse::Param(FCommandLine::Get(),TEXT("FlowArtsRepairCommonProbe")))
        {
            // Evidence only: preserve the measured relative lane and apply one
            // common pattern-normal translation to both hands and owned props.
            for(double Common : {-12.,-16.})
            {
                auto ProbeSnapshot=Snapshot;
                ProbeSnapshot.bConstrainPreparedHandTranslation=false;
                ProbeSnapshot.SkinEvidencePath=RepairEvidence+FString::Printf(TEXT("-common%.0f"),Common);
                auto Proposal=EvidenceSeed;
                for(int32 Side=0;Side<2;++Side)
                    Proposal.HandTranslationCm[Side]+=Snapshot.PreparedPatternNormal*Common;
                FFlowArtsArmClearancePreparedSeed ProbeSeed;
                FFlowArtsArmClearanceResult ProbeResult;
                const bool ProbeBuilt=FFlowArtsArmClearance::PrepareCandidate(ProbeSnapshot,0,&Proposal,ProbeSeed,ProbeResult);
                UE_LOG(LogTemp,Display,TEXT("Stance common probe phase=%.6f common=%.3f built=%d feasible=%d residual=%.9f penalty=%.12f upper=%u pair=%d opposite=%u held=%u segments=%u obstacle=%d arm=%d segment=%d"),
                    Knots[I].Seconds,Common,int32(ProbeBuilt),int32(ProbeResult.bFeasible),ProbeResult.WorstPenetrationCm,
                    ProbeResult.PreparedContactPenalty,uint32(ProbeResult.SkinnedUpperTorsoClearMask),int32(ProbeResult.bSkinnedArmPairClear),
                    uint32(ProbeResult.SkinnedOppositePropClearMask),uint32(ProbeResult.SkinnedHeldPropBodyClearMask),
                    uint32(ProbeResult.SkinnedSegmentClearMask),ProbeResult.WorstObstacleKind,ProbeResult.WorstArm,ProbeResult.WorstSegment);
            }
        }
        if(RepairRefinement==EvidenceRefinement && FParse::Param(FCommandLine::Get(),TEXT("FlowArtsRepairLocalProbe")))
        {
            auto ProbeSnapshot=Snapshot;
            ProbeSnapshot.bConstrainPreparedHandTranslation=false;
            ProbeSnapshot.SkinEvidencePath.Reset();
            const FVector Up=(Snapshot.Geometry.Neck-Snapshot.Geometry.FixedHip).GetSafeNormal();
            const FVector ProbeLateral=(Snapshot.Geometry.Arms[1].Upper.GetLocation()-
                Snapshot.Geometry.Arms[0].Upper.GetLocation()).GetSafeNormal();
            const FVector ProbeForward=FVector::CrossProduct(ProbeLateral,Up).GetSafeNormal();
            FString ProbeCsv=TEXT("family,side,delta,built,feasible,penalty,residual,upper,pair,opposite,segments,hand0x,hand0y,hand0z,hand1x,hand1y,hand1z\n");
            auto Probe=[&](const TCHAR* Family,int32 Side,double Delta,const FFlowArtsArmClearancePreparedSeed& Proposal)
            {
                FFlowArtsArmClearancePreparedSeed ProbeSeed;
                FFlowArtsArmClearanceResult ProbeResult;
                const bool ProbeBuilt=FFlowArtsArmClearance::PrepareCandidate(ProbeSnapshot,0,&Proposal,ProbeSeed,ProbeResult);
                ProbeCsv+=FString::Printf(TEXT("%s,%d,%.3f,%d,%d,%.12f,%.9f,%u,%d,%u,%u,%.6f,%.6f,%.6f,%.6f,%.6f,%.6f\n"),
                    Family,Side,Delta,int32(ProbeBuilt),int32(ProbeResult.bFeasible),ProbeResult.PreparedContactPenalty,
                    ProbeResult.WorstPenetrationCm,uint32(ProbeResult.SkinnedUpperTorsoClearMask),
                    int32(ProbeResult.bSkinnedArmPairClear),uint32(ProbeResult.SkinnedOppositePropClearMask),
                    uint32(ProbeResult.SkinnedSegmentClearMask),Proposal.HandTranslationCm[0].X,
                    Proposal.HandTranslationCm[0].Y,Proposal.HandTranslationCm[0].Z,
                    Proposal.HandTranslationCm[1].X,Proposal.HandTranslationCm[1].Y,Proposal.HandTranslationCm[1].Z);
            };
            Probe(TEXT("center"),-1,0.,EvidenceSeed);
            for(const auto& Axis : {TTuple<const TCHAR*,FVector>(TEXT("normal"),ProbeForward),
                TTuple<const TCHAR*,FVector>(TEXT("lateral"),ProbeLateral),
                TTuple<const TCHAR*,FVector>(TEXT("height"),Up)})
                for(double Cm : {-12.,-8.,-4.,4.,8.,12.})
                {
                    auto Proposal=EvidenceSeed;
                    for(int32 Side=0;Side<2;++Side) Proposal.HandTranslationCm[Side]+=Axis.Get<1>()*Cm;
                    Probe(Axis.Get<0>(),-1,Cm,Proposal);
                }
            for(double Degrees : {-15.,-10.,-5.,5.,10.,15.})
                for(int32 Mode=0;Mode<2;++Mode)
                {
                    auto Proposal=EvidenceSeed;
                    const FVector Axis=Mode ? Up : ProbeLateral;
                    Proposal.TorsoRotation=(FQuat(Axis,FMath::DegreesToRadians(Degrees))*Proposal.TorsoRotation).GetNormalized();
                    Probe(Mode ? TEXT("yaw") : TEXT("lean"),-1,Degrees,Proposal);
                }
            for(int32 Side=0;Side<2;++Side)
                for(double Degrees : {-30.,-15.,15.,30.})
                {
                    auto Proposal=EvidenceSeed;
                    const FVector Axis=(Proposal.SolvedWrists[Side]-Proposal.SolvedShoulders[Side]).GetSafeNormal();
                    Proposal.ElbowPole[Side]=FQuat(Axis,FMath::DegreesToRadians(Degrees)).RotateVector(Proposal.ElbowPole[Side]);
                    Probe(TEXT("pole"),Side,Degrees,Proposal);
                }
            for(double Cm : {-6.,-4.,-2.,2.,4.,6.})
            {
                auto Proposal=EvidenceSeed;
                Proposal.HandTranslationCm[0]+=ProbeForward*Cm;
                Proposal.HandTranslationCm[1]-=ProbeForward*Cm;
                Probe(TEXT("differential"),-1,Cm,Proposal);
            }
            for(double Height : {-8.,-10.,-12.,-14.,-16.})
                for(double LeftPole : {0.,15.,30.,45.})
                    for(double RightPole : {-15.,0.,15.})
                        for(double Normal : {0.,4.})
                        {
                            auto Proposal=EvidenceSeed;
                            for(int32 Side=0;Side<2;++Side)
                                Proposal.HandTranslationCm[Side]+=Up*Height+ProbeForward*Normal;
                            const double Angles[2]={LeftPole,RightPole};
                            for(int32 Side=0;Side<2;++Side)
                            {
                                const FVector Axis=(Proposal.SolvedWrists[Side]-Proposal.SolvedShoulders[Side]).GetSafeNormal();
                                Proposal.ElbowPole[Side]=FQuat(Axis,FMath::DegreesToRadians(Angles[Side])).RotateVector(Proposal.ElbowPole[Side]);
                            }
                            const FString Label=FString::Printf(TEXT("grid_h%.0f_l%.0f_r%.0f_n%.0f"),
                                Height,LeftPole,RightPole,Normal);
                            Probe(*Label,-1,0.,Proposal);
                        }
            FFileHelper::SaveStringToFile(ProbeCsv,*(RepairEvidence+FString::Printf(TEXT("-attempt%d-local.csv"),RepairAttempt)));
        }
        if(RepairRefinement==EvidenceRefinement && FParse::Param(FCommandLine::Get(),TEXT("FlowArtsRepairTemporalProbe")))
        {
            FString TemporalCsv=TEXT("phase,source,alpha,built,feasible,penalty,residual,upper,pair,opposite,continuous\n");
            TArray<FFlowArtsArmClearancePreparedSeed> TemporalSeeds;
            TemporalSeeds.SetNum(Knots.Num());
            const int32 FirstSource=FMath::Max(0,I-10);
            const int32 LastSource=FMath::Min(Knots.Num()-2,I+6);
            auto TemporalQuery=[&](int32 J,const FFlowArtsArmClearancePreparedSeed& Proposal,
                FFlowArtsArmClearancePreparedSeed& Out,FFlowArtsArmClearanceResult& Contact)
            {
                FFlowArtsArmClearancePreparationSnapshot OwnSnapshot;
                if (!PlaceKnot(J,OwnSnapshot)) return false;
                OwnSnapshot.bConstrainPreparedHandTranslation=false;
                OwnSnapshot.bConstrainPreparedTorsoRotation=false;
                OwnSnapshot.SkinEvidencePath.Reset();
                return FFlowArtsArmClearance::PrepareCandidate(OwnSnapshot,0,&Proposal,Out,Contact);
            };
            for(int32 J=FirstSource;J<=LastSource;J+=2)
            {
                FFlowArtsArmClearancePreparationSnapshot OwnSnapshot;
                if (!PlaceKnot(J,OwnSnapshot)) continue;
                const FVector OwnUp=(OwnSnapshot.Geometry.Neck-OwnSnapshot.Geometry.FixedHip).GetSafeNormal();
                const double Alpha=FMath::Clamp(double(J-FirstSource)/double(I-FirstSource),0.,1.);
                auto Proposal=J==I ? EvidenceSeed : (J<RepairSeeds.Num() && RepairSeeds[J].bValid ? RepairSeeds[J] : RepairTarget);
                for(int32 Side=0;Side<2;++Side) Proposal.HandTranslationCm[Side]+=OwnUp*(-12.*Alpha);
                const FVector PoleAxis=(Proposal.SolvedWrists[0]-Proposal.SolvedShoulders[0]).GetSafeNormal();
                Proposal.ElbowPole[0]=FQuat(PoleAxis,FMath::DegreesToRadians(15.*Alpha)).RotateVector(Proposal.ElbowPole[0]);
                FFlowArtsArmClearanceResult Contact;
                const bool bBuilt=TemporalQuery(J,Proposal,TemporalSeeds[J],Contact);
                const bool bTemporalContinuous=J==FirstSource || (TemporalSeeds[J-2].bValid && bBuilt &&
                    ContinuousArms(TemporalSeeds[J-2],TemporalSeeds[J],2.*Current.Duration/Knots.Num()));
                TemporalCsv+=FString::Printf(TEXT("%.6f,1,%.3f,%d,%d,%.12f,%.9f,%u,%d,%u,%d\n"),
                    Knots[J].Seconds,Alpha,int32(bBuilt),int32(Contact.bFeasible),Contact.PreparedContactPenalty,
                    Contact.WorstPenetrationCm,uint32(Contact.SkinnedUpperTorsoClearMask),int32(Contact.bSkinnedArmPairClear),
                    uint32(Contact.SkinnedOppositePropClearMask),int32(bTemporalContinuous));
            }
            for(int32 J=FirstSource+1;J<LastSource;J+=2)
            {
                FFlowArtsArmClearancePreparedSeed Proposal,TemporalChecked;
                FFlowArtsArmClearanceResult Contact;
                const bool bBuilt=FFlowArtsArmClearance::InterpolatePreparedSeed(TemporalSeeds[J-1],TemporalSeeds[J+1],.5,Proposal) &&
                    TemporalQuery(J,Proposal,TemporalChecked,Contact);
                const bool bTemporalContinuous=bBuilt && ContinuousArms(TemporalSeeds[J-1],TemporalChecked,Current.Duration/Knots.Num()) &&
                    ContinuousArms(TemporalChecked,TemporalSeeds[J+1],Current.Duration/Knots.Num());
                TemporalCsv+=FString::Printf(TEXT("%.6f,0,0,%d,%d,%.12f,%.9f,%u,%d,%u,%d\n"),
                    Knots[J].Seconds,int32(bBuilt),int32(Contact.bFeasible),Contact.PreparedContactPenalty,
                    Contact.WorstPenetrationCm,uint32(Contact.SkinnedUpperTorsoClearMask),int32(Contact.bSkinnedArmPairClear),
                    uint32(Contact.SkinnedOppositePropClearMask),int32(bTemporalContinuous));
            }
            FFileHelper::SaveStringToFile(TemporalCsv,*(RepairEvidence+FString::Printf(TEXT("-attempt%d-temporal.csv"),RepairAttempt)));
        }
        if(RepairRefinement==EvidenceRefinement && FParse::Param(FCommandLine::Get(),TEXT("FlowArtsRepairNeighborhoodProbe")))
        {
            FString NeighborhoodCsv=TEXT("phase,height,leftPole,patternCommon,built,feasible,penalty,residual,upper,pair,opposite\n");
            FString BaselineCsv=TEXT("phase,kind,valid,built,feasible,penalty,residual,upper,pair,opposite\n");
            for(int32 J=I-6;J<=I+6;J+=2)
            {
                if(J<0 || J>=Knots.Num()) continue;
                FFlowArtsArmClearancePreparationSnapshot OwnSnapshot;
                if(!PlaceKnot(J,OwnSnapshot)) continue;
                OwnSnapshot.bConstrainPreparedHandTranslation=false;
                OwnSnapshot.bConstrainPreparedTorsoRotation=false;
                OwnSnapshot.SkinEvidencePath.Reset();
                const FVector OwnUp=(OwnSnapshot.Geometry.Neck-OwnSnapshot.Geometry.FixedHip).GetSafeNormal();
                for(int32 Kind=0;Kind<3;++Kind)
                {
                    const auto& Seed=Kind==0 ? CurrentSeeds[J] : (Kind==1 ? RepairSeeds[J] : RepairTarget);
                    FFlowArtsArmClearancePreparedSeed CheckedBaseline;
                    FFlowArtsArmClearanceResult BaselineContact;
                    const bool bBuilt=Seed.bValid && FFlowArtsArmClearance::PrepareCandidate(OwnSnapshot,0,&Seed,
                        CheckedBaseline,BaselineContact);
                    BaselineCsv+=FString::Printf(TEXT("%.6f,%d,%d,%d,%d,%.12f,%.9f,%u,%d,%u\n"),
                        Knots[J].Seconds,Kind,int32(Seed.bValid),int32(bBuilt),int32(BaselineContact.bFeasible),
                        BaselineContact.PreparedContactPenalty,BaselineContact.WorstPenetrationCm,
                        uint32(BaselineContact.SkinnedUpperTorsoClearMask),int32(BaselineContact.bSkinnedArmPairClear),
                        uint32(BaselineContact.SkinnedOppositePropClearMask));
                }
                const auto Base=J==I ? EvidenceSeed : (J<RepairSeeds.Num() && RepairSeeds[J].bValid ? RepairSeeds[J] : RepairTarget);
                for(double Height : {-8.,-10.,-12.,-14.,-16.})
                    for(double LeftPole : {0.,15.,30.,45.,60.})
                        for(double PatternCommon : {0.,4.})
                        {
                            auto Proposal=Base;
                            for(int32 Side=0;Side<2;++Side)
                                Proposal.HandTranslationCm[Side]+=OwnUp*Height+OwnSnapshot.PreparedPatternNormal*PatternCommon;
                            const FVector PoleAxis=(Proposal.SolvedWrists[0]-Proposal.SolvedShoulders[0]).GetSafeNormal();
                            Proposal.ElbowPole[0]=FQuat(PoleAxis,FMath::DegreesToRadians(LeftPole)).RotateVector(Proposal.ElbowPole[0]);
                            FFlowArtsArmClearancePreparedSeed ProbeSeed;
                            FFlowArtsArmClearanceResult Contact;
                            const bool bBuilt=FFlowArtsArmClearance::PrepareCandidate(OwnSnapshot,0,&Proposal,ProbeSeed,Contact);
                            NeighborhoodCsv+=FString::Printf(TEXT("%.6f,%.0f,%.0f,%.0f,%d,%d,%.12f,%.9f,%u,%d,%u\n"),
                                Knots[J].Seconds,Height,LeftPole,PatternCommon,int32(bBuilt),int32(Contact.bFeasible),
                                Contact.PreparedContactPenalty,Contact.WorstPenetrationCm,uint32(Contact.SkinnedUpperTorsoClearMask),
                                int32(Contact.bSkinnedArmPairClear),uint32(Contact.SkinnedOppositePropClearMask));
                        }
            }
            FFileHelper::SaveStringToFile(NeighborhoodCsv,*(RepairEvidence+FString::Printf(TEXT("-attempt%d-neighborhood.csv"),RepairAttempt)));
            FFileHelper::SaveStringToFile(BaselineCsv,*(RepairEvidence+FString::Printf(TEXT("-attempt%d-baselines.csv"),RepairAttempt)));
            const int32 BlockedSource=I-4;
            FFlowArtsArmClearancePreparationSnapshot BlockedSnapshot;
            if(BlockedSource>=0 && PlaceKnot(BlockedSource,BlockedSnapshot))
            {
                BlockedSnapshot.bConstrainPreparedHandTranslation=false;
                BlockedSnapshot.bConstrainPreparedTorsoRotation=false;
                BlockedSnapshot.SkinEvidencePath.Reset();
                const FVector BlockedUp=(BlockedSnapshot.Geometry.Neck-BlockedSnapshot.Geometry.FixedHip).GetSafeNormal();
                const FVector BlockedLateral=(BlockedSnapshot.Geometry.Arms[1].Upper.GetLocation()-
                    BlockedSnapshot.Geometry.Arms[0].Upper.GetLocation()).GetSafeNormal();
                const auto Base=CurrentSeeds[BlockedSource].bValid ? CurrentSeeds[BlockedSource] : RepairSeeds[BlockedSource];
                FString CoupledCsv=TEXT("height,leftPole,rightPole,lateral,yaw,built,feasible,penalty,residual,upper,pair,opposite\n");
                for(double Height : {-6.,-8.,-10.})
                    for(double RightPole : {-30.,-15.,0.,15.,30.})
                        for(double LateralCm : {-4.,0.,4.})
                            for(double Yaw : {-8.,0.,8.})
                            {
                                auto Proposal=Base;
                                for(int32 Side=0;Side<2;++Side)
                                    Proposal.HandTranslationCm[Side]+=BlockedUp*Height+BlockedLateral*LateralCm;
                                const FVector PoleAxis0=(Proposal.SolvedWrists[0]-Proposal.SolvedShoulders[0]).GetSafeNormal();
                                const FVector PoleAxis1=(Proposal.SolvedWrists[1]-Proposal.SolvedShoulders[1]).GetSafeNormal();
                                Proposal.ElbowPole[0]=FQuat(PoleAxis0,FMath::DegreesToRadians(45.)).RotateVector(Proposal.ElbowPole[0]);
                                Proposal.ElbowPole[1]=FQuat(PoleAxis1,FMath::DegreesToRadians(RightPole)).RotateVector(Proposal.ElbowPole[1]);
                                Proposal.TorsoRotation=(FQuat(BlockedUp,FMath::DegreesToRadians(Yaw))*Proposal.TorsoRotation).GetNormalized();
                                FFlowArtsArmClearancePreparedSeed ProbeSeed;
                                FFlowArtsArmClearanceResult Contact;
                                const bool bBuilt=FFlowArtsArmClearance::PrepareCandidate(BlockedSnapshot,0,&Proposal,ProbeSeed,Contact);
                                CoupledCsv+=FString::Printf(TEXT("%.0f,45,%.0f,%.0f,%.0f,%d,%d,%.12f,%.9f,%u,%d,%u\n"),
                                    Height,RightPole,LateralCm,Yaw,int32(bBuilt),int32(Contact.bFeasible),
                                    Contact.PreparedContactPenalty,Contact.WorstPenetrationCm,uint32(Contact.SkinnedUpperTorsoClearMask),
                                    int32(Contact.bSkinnedArmPairClear),uint32(Contact.SkinnedOppositePropClearMask));
                            }
                FFileHelper::SaveStringToFile(CoupledCsv,*(RepairEvidence+FString::Printf(TEXT("-attempt%d-blocked-source.csv"),RepairAttempt)));
            }
        }
        if(RepairRefinement==EvidenceRefinement && FParse::Param(FCommandLine::Get(),TEXT("FlowArtsRepairGraphProbe")))
        {
            struct FProbeNode { FFlowArtsArmClearancePreparedSeed Seed; FString Name; int32 Parent=-1; };
            TArray<TArray<FProbeNode>> Layers;
            FString NodeCsv=TEXT("phase,variant,compact,built,feasible,penalty,residual\n");
            FString EdgeCsv=TEXT("left,right,from,to,interpolated,built,feasible,leftRate,rightRate,penalty,residual\n");
            const int32 GraphFirst=FMath::Max(0,I-10),GraphLast=I+6;
            const double Dt=Current.Duration/Knots.Num();
            for(int32 J=GraphFirst;J<=GraphLast;J+=2)
            {
                TArray<FProbeNode>& Layer=Layers.AddDefaulted_GetRef();
                FFlowArtsArmClearancePreparationSnapshot Own;
                if(!PlaceKnot(J,Own)) continue;
                Own.bConstrainPreparedHandTranslation=false;
                Own.bConstrainPreparedTorsoRotation=false;
                Own.SkinEvidencePath.Reset();
                const FVector OwnUp=(Own.Geometry.Neck-Own.Geometry.FixedHip).GetSafeNormal();
                const FVector OwnLateral=(Own.Geometry.Arms[1].Upper.GetLocation()-
                    Own.Geometry.Arms[0].Upper.GetLocation()).GetSafeNormal();
                const auto Base=CurrentSeeds[J].bValid ? CurrentSeeds[J] :
                    (J==I ? EvidenceSeed : (RepairSeeds[J].bValid ? RepairSeeds[J] : RepairTarget));
                const int32 VariantCount=J==I-4 ? 18 : ((J==I-2 || J==I) ? 43 :
                    ((J==I-8 || J==I-6) ? 29 : 10));
                for(int32 Variant=0;Variant<VariantCount;++Variant)
                {
                    auto Proposal=Variant==0 && CurrentSeeds[J].bValid ? CurrentSeeds[J] : Base;
                    if(Variant==1 && RepairSeeds[J].bValid) Proposal=RepairSeeds[J];
                    double Height=0.,LeftPole=0.,RightPole=0.,LateralCm=0.,Yaw=0.;
                    if(Variant>=2 && Variant<10)
                    {
                        constexpr double Heights[8]={-10.,-12.,-14.,-16.,-8.,-16.,-6.,-8.};
                        constexpr double Poles[8]={45.,15.,30.,0.,45.,60.,45.,45.};
                        const int32 Pair=Variant-2;
                        Height=Heights[Pair]; LeftPole=Poles[Pair];
                        if(Variant>=8) Yaw=-8.;
                    }
                    else if(Variant>=10 && Variant<18 && J==I-4)
                    {
                        Height=-6.; LeftPole=45.; Yaw=-8.;
                        RightPole=-15.+15.*((Variant-10)/2);
                        LateralCm=(Variant-10)%2 ? 4. : 0.;
                    }
                    else if(Variant>=10 && Variant<25 && (J==I-2 || J==I))
                    {
                        constexpr double Heights[15]={-12.,-12.,-12.,-14.,-14.,-16.,-16.,
                            -10.,-10.,-12.,-12.,-14.,-14.,-16.,-16.};
                        constexpr double Poles[15]={30.,45.,60.,45.,60.,30.,45.,
                            15.,30.,0.,60.,15.,30.,15.,60.};
                        Height=Heights[Variant-10]; LeftPole=Poles[Variant-10];
                    }
                    else if(Variant>=25 && J<=I-6)
                    {
                        Height=(Variant-25)/2 ? -4. : -2.;
                        LeftPole=(Variant-25)%2 ? 30. : 15.;
                    }
                    else if(Variant>=25 && (J==I-2 || J==I))
                    {
                        constexpr double Heights[6]={-4.,-6.,-8.,-10.,-12.,-14.};
                        constexpr double Poles[3]={30.,45.,60.};
                        const int32 Pair=Variant-25;
                        Height=Heights[Pair/3]; LeftPole=Poles[Pair%3]; Yaw=-8.;
                    }
                    if(Height || LateralCm)
                        for(int32 Side=0;Side<2;++Side)
                            Proposal.HandTranslationCm[Side]+=OwnUp*Height+OwnLateral*LateralCm;
                    if(LeftPole)
                    {
                        const FVector Axis=(Proposal.SolvedWrists[0]-Proposal.SolvedShoulders[0]).GetSafeNormal();
                        Proposal.ElbowPole[0]=FQuat(Axis,FMath::DegreesToRadians(LeftPole)).RotateVector(Proposal.ElbowPole[0]);
                    }
                    if(RightPole)
                    {
                        const FVector Axis=(Proposal.SolvedWrists[1]-Proposal.SolvedShoulders[1]).GetSafeNormal();
                        Proposal.ElbowPole[1]=FQuat(Axis,FMath::DegreesToRadians(RightPole)).RotateVector(Proposal.ElbowPole[1]);
                    }
                    if(Yaw) Proposal.TorsoRotation=(FQuat(OwnUp,FMath::DegreesToRadians(Yaw))*
                        Proposal.TorsoRotation).GetNormalized();
                    FFlowArtsArmClearancePreparedSeed Certified;
                    FFlowArtsArmClearanceResult Contact;
                    const bool bBuilt=Proposal.bValid && FFlowArtsArmClearance::PrepareCandidate(Own,0,&Proposal,Certified,Contact);
                    NodeCsv+=FString::Printf(TEXT("%.6f,%d,%d,%d,%d,%.12f,%.9f\n"),Knots[J].Seconds,Variant,
                        bBuilt && Contact.bFeasible ? Layer.Num() : -1,
                        int32(bBuilt),int32(Contact.bFeasible),Contact.PreparedContactPenalty,Contact.WorstPenetrationCm);
                    if(bBuilt && Contact.bFeasible) Layer.Add({Certified,FString::Printf(TEXT("%d"),Variant),-1});
                }
            }
            if(Layers.Num() && Layers[0].Num() && CurrentSeeds[GraphFirst].bValid &&
                Layers[0][0].Name==TEXT("0")) Layers[0][0].Parent=0;
            for(int32 L=1;L<Layers.Num();++L)
            {
                const int32 J=GraphFirst+2*L;
                FFlowArtsArmClearancePreparationSnapshot Mid;
                if(!PlaceKnot(J-1,Mid)) continue;
                Mid.bConstrainPreparedHandTranslation=false;
                Mid.bConstrainPreparedTorsoRotation=false;
                Mid.SkinEvidencePath.Reset();
                for(int32 A=0;A<Layers[L-1].Num();++A)
                    for(int32 B=0;B<Layers[L].Num();++B)
                    {
                        FFlowArtsArmClearancePreparedSeed Interpolated,CheckedMid;
                        FFlowArtsArmClearanceResult Contact;
                        const bool bInterpolated=FFlowArtsArmClearance::InterpolatePreparedSeed(
                            Layers[L-1][A].Seed,Layers[L][B].Seed,.5,Interpolated);
                        const bool bBuilt=bInterpolated && FFlowArtsArmClearance::PrepareCandidate(Mid,0,&Interpolated,CheckedMid,Contact);
                        const bool bLeftRate=bBuilt && ContinuousArms(Layers[L-1][A].Seed,CheckedMid,Dt);
                        const bool bRightRate=bBuilt && ContinuousArms(CheckedMid,Layers[L][B].Seed,Dt);
                        EdgeCsv+=FString::Printf(TEXT("%.6f,%.6f,%d,%d,%d,%d,%d,%d,%d,%.12f,%.9f\n"),
                            Knots[J-2].Seconds,Knots[J].Seconds,A,B,int32(bInterpolated),int32(bBuilt),
                            int32(Contact.bFeasible),int32(bLeftRate),int32(bRightRate),
                            Contact.PreparedContactPenalty,Contact.WorstPenetrationCm);
                        if(Layers[L-1][A].Parent>=0 && Layers[L][B].Parent<0 && bBuilt && Contact.bFeasible &&
                            bLeftRate && bRightRate) Layers[L][B].Parent=A;
                    }
            }
            FString ReachCsv=TEXT("phase,nodes,reachable,pathVariant\n");
            TArray<int32> PathVariants;
            PathVariants.Init(-1,Layers.Num());
            if(Layers.Num())
            {
                int32 Parent=-1;
                for(int32 N=0;N<Layers.Last().Num();++N)
                    if(Layers.Last()[N].Parent>=0) { Parent=N; break; }
                for(int32 L=Layers.Num()-1;L>=0 && Parent>=0;--L)
                {
                    PathVariants[L]=FCString::Atoi(*Layers[L][Parent].Name);
                    Parent=Layers[L][Parent].Parent;
                }
            }
            for(int32 L=0;L<Layers.Num();++L)
            {
                int32 Reached=0;
                for(const auto& Node:Layers[L]) if(Node.Parent>=0) ++Reached;
                ReachCsv+=FString::Printf(TEXT("%.6f,%d,%d,%d\n"),Knots[GraphFirst+2*L].Seconds,
                    Layers[L].Num(),Reached,PathVariants[L]);
            }
            const FString Path=RepairEvidence+FString::Printf(TEXT("-attempt%d-graph"),RepairAttempt);
            FFileHelper::SaveStringToFile(NodeCsv,*(Path+TEXT("-nodes.csv")));
            FFileHelper::SaveStringToFile(EdgeCsv,*(Path+TEXT("-edges.csv")));
            FFileHelper::SaveStringToFile(ReachCsv,*(Path+TEXT("-reach.csv")));
        }
        const FString TracePath=RepairEvidence+FString::Printf(TEXT("-attempt%d-trend.csv"),RepairAttempt);
        FString Detail;
        if(!RepairRefinement) Detail=TEXT("step,built,feasible,penalty,residual,depth,maxDepth,leftClavicle,rightClavicle,leftPoleX,leftPoleY,leftPoleZ,rightPoleX,rightPoleY,rightPoleZ,upper,pair,opposite,segments\n");
        Detail+=FString::Printf(TEXT("%d,%d,%d,%.12f,%.9f,%.9f,%.9f,%.9f,%.9f,%.12f,%.12f,%.12f,%.12f,%.12f,%.12f,%u,%d,%u,%u\n"),
            RepairRefinement,int32(Built),int32(EvidenceResult.bFeasible),EvidenceResult.PreparedContactPenalty,EvidenceResult.WorstPenetrationCm,
            FVector::DotProduct(EvidenceSeed.HandTranslationCm[0],Snapshot.PreparedPatternNormal),Snapshot.MaxPreparedHandDepthCm,
            EvidenceSeed.ClavicleProtractionDeg[0],EvidenceSeed.ClavicleProtractionDeg[1],
            EvidenceSeed.ElbowPole[0].X,EvidenceSeed.ElbowPole[0].Y,EvidenceSeed.ElbowPole[0].Z,
            EvidenceSeed.ElbowPole[1].X,EvidenceSeed.ElbowPole[1].Y,EvidenceSeed.ElbowPole[1].Z,
            uint32(EvidenceResult.SkinnedUpperTorsoClearMask),int32(EvidenceResult.bSkinnedArmPairClear),
            uint32(EvidenceResult.SkinnedOppositePropClearMask),uint32(EvidenceResult.SkinnedSegmentClearMask));
        FFileHelper::SaveStringToFile(Detail,*TracePath,FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM,
            &IFileManager::Get(),RepairRefinement ? FILEWRITE_Append : 0);
    }
#endif
    // The following source endpoint is a different authored phase. Continue the
    // same exact-contact branch there before certifying its actual midpoint.
    // Scratch controls are never published while this bounded solve is pending.
    if(Built && !Result.bFeasible && !bRepairJointFinal && RepairRefinement<32 &&
        ((!bRepairMidpoints && I>Knot) || (bRepairMidpoints && !RepairMidpointRebases)))
    {
        RepairSeeds[I]=Checked;
        ++RepairRefinement;
        return;
    }
    if(Built && Result.bFeasible && bRepairMidpoints && !bRepairJointFinal && RepairRefinement && RebaseMidpointRepair(Checked))
    {
        UE_LOG(LogTemp,Log,TEXT("Stance midpoint rebase trial=%d target=%d certifiedMidpoint=%d phase=%.6f"),
            Trial,Knot,I,Knots[I].Seconds);
        return;
    }
    const double Dt=Current.Duration/Knots.Num();
    const bool Left=Built && (!I || (bRepairMidpoints
        ? ContinuousArms(RepairSeeds[I-1],Checked,Dt)
        : ContinuousArms(RepairSeeds[I-2],Checked,2.*Dt)));
    const bool Right=Built && (!bRepairMidpoints || ContinuousArms(Checked,RepairSeeds[(I+1)%Knots.Num()],Dt));
    if(Built && Result.bFeasible && !Left && !bRepairMidpoints && !bRepairJointFinal && I>Knot &&
        RebasePrefixRepair(Checked))
    {
        UE_LOG(LogTemp,Log,TEXT("Stance prefix rebase trial=%d target=%d certifiedEndpoint=%d phase=%.6f"),
            Trial,Knot,I,Knots[I].Seconds);
        return;
    }
    if(!Built || !Result.bFeasible || !Left || !Right)
    {
        if (!bRepairJointUsed && I>=RepairStart-1 && I<=RepairEnd &&
            ((bRepairMidpoints && I%2) ||
             // A transported target can make an earlier, previously accepted
             // source infeasible before we reach the blocked source. The left
             // window anchor stays fixed, but every changed source belongs to
             // the same bounded joint proposal and must be repairable there.
             (!bRepairMidpoints && !(I%2) &&
                 (I>RepairStart || (Knot==0 && I==0)))))
        {
            BeginJointRepair(I,Result);
            return;
        }
        RejectPrefixRepair(FString::Printf(TEXT("phase=%.6f midpoint=%d refinement=%d built=%d feasible=%d left=%d right=%d residual=%.6f exactPenalty=%.12f upper=%u pair=%d opposite=%u segments=%u"),
            Knots[I].Seconds,int32(bRepairMidpoints),RepairRefinement,int32(Built),int32(Result.bFeasible),int32(Left),int32(Right),Result.WorstPenetrationCm,Result.PreparedContactPenalty,
            uint32(Result.SkinnedUpperTorsoClearMask),int32(Result.bSkinnedArmPairClear),uint32(Result.SkinnedOppositePropClearMask),uint32(Result.SkinnedSegmentClearMask)));
        return;
    }
    RepairSeeds[I]=Checked;
    RepairRefinement=0;
    RepairIndex+=2;
    if(RepairIndex<=RepairEnd && !bRepairMidpoints) return;
    if(bRepairMidpoints && RepairIndex<=LastPhase) return;
    if(!bRepairMidpoints)
    { bRepairMidpoints=true; RepairIndex=FMath::Max(1,RepairStart-1); return; }
    // Commit only the completely recertified interval. Suffix and cyclic seam
    // still pass the ordinary final track gates before any publication.
    for(int32 J=FMath::Max(0,RepairStart-1);J<=LastPhase;++J) CurrentSeeds[J]=RepairSeeds[J];
    UE_LOG(LogTemp,Log,TEXT("Stance prefix repair accepted trial=%d knots=%d..%d target=%d"),Trial,RepairStart,RepairEnd,Knot);
    if(bFinalRepairActive)
    {
        bRepairing=false;
        if(!ContinuousArms(CurrentSeeds[Knots.Num()-2],CurrentSeeds[0],2.*Dt))
        { RejectPrefixRepair(TEXT("Final repair: loop source continuity")); return; }
        // The locally certified scratch interval may invalidate earlier global
        // results. Re-run every actual midpoint before publishing any source.
        FirstRejection.Reset();
        bValidating=true; Validation=1;
        return;
    }
    Knot=RepairEnd+2;
    Clear=FMath::Min(Knot,Knots.Num());
    bRepairing=false;
    bKnotStarted=false;
    if(Knot>=Knots.Num()) FinishTrial();
}

void FFlowFestStancePreparation::FinishKnot()
{
    // A valid but colliding source can still be repaired jointly with its
    // neighbors. Enter once; an exhausted bounded repair must end the trial.
    if(!bKnotClear && bCandidateFound && CandidateSeed.bValid &&
        !bRepairAttemptedForKnot)
    {
        bKnotStarted=false;
        BeginPrefixRepair(CandidateSeed);
        return;
    }
    if (bCandidateFound)
    {
        CurrentSeeds[Knot]=CandidateSeed;
        Score+=CandidateCost;
        if (bKnotClear) Clear=FMath::Min(Knot+2,Knots.Num());
    }
    else { CurrentSeeds[Knot]={}; Score+=1.e6; bContinuous=false; }
    bKnotStarted=false;
    if(!bKnotClear)
    {
        FirstRejection=FString::Printf(TEXT("Phase %.6fs: %s"),Knots[Knot].Seconds,*CandidateRejection);
        // Rank certified prefixes, without spending queries on a rejected suffix.
        Score=(Knots.Num()-Clear)*1.e6+FMath::Min(CandidateCost,999999.);
        bContinuous=false;
        FinishTrial();
        return;
    }
    Knot+=2;
    if (Knot>=Knots.Num()) FinishTrial();
}

bool FFlowFestStancePreparation::ValidateMidpoint(int32 I)
{
    FFlowArtsArmClearancePreparedSeed Interpolated, Checked;
    FFlowArtsArmClearanceResult Result;
    FFlowFestStanceSample Sample;
    FFlowFestStancePose Posed;
    FFlowArtsArmClearancePreparationSnapshot Mid;
    if (!FFlowArtsArmClearance::InterpolatePreparedSeed(CurrentSeeds[I-1],CurrentSeeds[(I+1)%Knots.Num()],.5,Interpolated) ||
        !Current.Sample(Knots[I].Seconds,Sample) || !FFlowFestStancePlan::Apply(Knots[I].Pose,Sample,Posed,nullptr,false)) return false;
    FFlowArtsClearanceArm Arms[2];
    for(int32 S=0; S<2; ++S)
    {
        Arms[S]=Knots[I].Clearance.Geometry.Arms[S];
        Arms[S].Clavicle=Arms[S].Clavicle*Sample.BodyDelta;
        Arms[S].Upper=Posed.Components[Posed.Upper[S+2]];
        Arms[S].Elbow=Posed.Components[Posed.Middle[S+2]];
        Arms[S].Wrist=Posed.Components[Posed.End[S+2]];
    }
    if (!Knots[I].Clearance.PlaceBody(Sample.BodyDelta,Arms,Posed.Components,Mid)) return false;
    if (!ConstrainBodyControls(Current,Mid)) return false;
    // Certify the actual playback interpolation, not a replacement body control
    // recomputed from the midpoint's authored frame.
    Mid.bConstrainPreparedTorsoRotation=false;
    Mid.bConstrainPreparedHandTranslation=false;
    if (!FFlowArtsArmClearance::PrepareCandidate(Mid,0,&Interpolated,Checked,Result)) return false;
    for(int32 Side=0;Side<2;++Side)
        if(!Checked.HandTranslationCm[Side].Equals(Interpolated.HandTranslationCm[Side],1.e-6)) return false;
    return Result.bFeasible &&
        ContinuousArms(CurrentSeeds[I-1],Checked,Current.Duration/Knots.Num()) &&
        ContinuousArms(Checked,CurrentSeeds[(I+1)%Knots.Num()],Current.Duration/Knots.Num());
}

void FFlowFestStancePreparation::FinishTrial()
{
    ++Trial;
    bValidationPassed=false;
    if (Clear==Knots.Num() && bContinuous &&
        ContinuousArms(CurrentSeeds[Knots.Num()-2],CurrentSeeds[0],2.*Current.Duration/Knots.Num()))
    {
        bValidating=true; Validation=1; return;
    }
    if (Clear==Knots.Num() && FirstRejection.IsEmpty())
        FirstRejection=TEXT("Loop seam: realized arm continuity");
    if(BeginFinalRepair(Knots.Num()-1)) return;
    CompleteTrial();
}

void FFlowFestStancePreparation::CompleteTrial()
{
    if (bValidationPassed)
    {
        AcceptedPlan=Current;
        for(int32 I=0; I<CurrentSeeds.Num(); I+=2) AcceptedSeeds.Add(CurrentSeeds[I]);
        bReady=true; BestClear=Clear; return;
    }
    if(bFinalRepairActive)
    {
        CurrentSeeds=MoveTemp(FinalRepairOriginalSeeds);
        bFinalRepairActive=false;
        bRepairing=bRepairJoint=bValidating=false;
    }
    if (Clear==Knots.Num()) Score+=1.e6;
    if (!bContinuous) Score+=1.e6;
    if (Trial==1 && Clear<Knots.Num())
        BlockedPhase=Knots[FMath::Min(Knot+Knot%2,Knots.Num()-1)].Seconds;
    UE_LOG(LogTemp,Display,TEXT("Stance trial %d/%d heading=%.3f translation=%s start=%.6f return=%.6f depth=%.3f lean=%.3f prefix=%d/%d rejection=%s"),
        Trial,MaxPlans,Current.Controls.HeadingDegrees,*Current.Controls.HipTranslationCm.ToString(),
        Current.Controls.StartSeconds,Current.Controls.ReturnSeconds,Current.Controls.HandDepthCm,Current.Controls.TorsoLeanDegrees,Clear,Knots.Num(),*FirstRejection);
    if (Score<BestScore) { BestScore=Score; Best=Current; BestClear=Clear; BestRejection=FirstRejection; }
    if (Trial>=MaxPlans) { bFailed=true; Failure=FString::Printf(TEXT("No continuous certified stance: best %d/%d dense samples; %s"),BestClear,Knots.Num(),*BestRejection); return; }
    Current=Best;
    // Four first-pass timing probes use the actual blocking source phase. The
    // other proposals remain whole-track coordinates, never per-frame winners.
    if (Trial>=7 && Trial<=10 && BlockedPhase>=0.)
    {
        const int32 Event=Trial-7;
        FString ScheduleError;
        if (!Prototype.MakePhaseSchedule(BlockedPhase,(Event%2)!=0,Event>=2,Lateral,
            FMath::Max(.30,.25+1./Fps),Current,&ScheduleError))
        { bFailed=true; Failure=ScheduleError; return; }
        UE_LOG(LogTemp,Display,TEXT("Stance event schedule blocked=%.6f turn=%s swapped=%d outward=%.6f/%.3f return=%.6f/%.3f neutral=%.6f"),
            BlockedPhase,(Event%2) ? TEXT("return") : TEXT("outward"),Event>=2,
            Current.Outward.Duration,Current.Outward.HeadingDegrees,Current.Return.Duration,Current.Return.HeadingDegrees,
            Current.Controls.StartSeconds+Current.Duration-Current.Controls.ReturnSeconds-Current.Return.Duration);
    }
    else
    {
    const int32 Coordinate=((Trial-1)%10)/2;
    const double Direction=(Trial%2) ? 1. : -1.;
    const double Scale=Trial<=10 ? 1. : .5;
    if (Coordinate==0) Current.Controls.HeadingDegrees+=Direction*10.*Scale;
    if (Coordinate==1) Current.Controls.HipTranslationCm+=Forward*(Direction*5.*Scale);
    if (Coordinate==2) Current.Controls.HipTranslationCm+=Lateral*(Direction*5.*Scale);
    if (Coordinate==3)
    {
        Current.Controls.StartSeconds+=Direction*.1*Scale;
        Current.Controls.ReturnSeconds+=Direction*.1*Scale;
    }
    if (Coordinate==4) Current.Controls.ReturnSeconds+=Direction*.1*Scale;
    }
    Knot=0; Clear=0; Score=0.; bContinuous=true; bKnotStarted=false;
    Preflight=0; InvalidPoses=0; bPreflighting=true;
    FirstRejection.Reset();
    bFinalRepairActive=bFinalRepairAttempted=false;
    FinalRepairOriginalSeeds.Reset();
    CurrentSeeds.Init(FFlowArtsArmClearancePreparedSeed{},Knots.Num());
}

void FFlowFestStancePreparation::Step(double BudgetSeconds)
{
    if (bReady || bFailed || !FMath::IsFinite(BudgetSeconds) || BudgetSeconds<=0.) return;
    const double Deadline=FPlatformTime::Seconds()+FMath::Min(BudgetSeconds,.05);
    constexpr int32 MaxArmCandidate=48; // One bounded descent, at most 32 refinement steps.
    do
    {
        if (bPreflighting) { PreflightKnot(); continue; }
        if (bRepairing) { if (bRepairJoint) StepJointRepair(); else StepPrefixRepair(); continue; }
        if (bValidating)
        {
            if (!ValidateMidpoint(Validation))
            {
                FirstRejection=FString::Printf(TEXT("Phase %.6fs: interpolated arm certificate or continuity"),Knots[Validation].Seconds);
                bValidating=false;
                if(!BeginFinalRepair(Validation)) CompleteTrial();
            }
            else if ((Validation+=2)>=Knots.Num())
            { bValidating=false; bValidationPassed=true; CompleteTrial(); }
            continue;
        }
        if (!bKnotStarted && !BeginKnot()) { FinishKnot(); continue; }
        FFlowArtsArmClearancePreparedSeed Seed;
        FFlowArtsArmClearanceResult Result;
#if WITH_DEV_AUTOMATION_TESTS
        FString Evidence; int32 EvidenceTrial=17,EvidenceCandidate=5,EvidenceKnot=0;
        FParse::Value(FCommandLine::Get(),TEXT("FlowArtsStanceEvidenceTrial="),EvidenceTrial);
        FParse::Value(FCommandLine::Get(),TEXT("FlowArtsStanceEvidenceCandidate="),EvidenceCandidate);
        FParse::Value(FCommandLine::Get(),TEXT("FlowArtsStanceEvidenceKnot="),EvidenceKnot);
        const bool bProbeDepthEscape=FParse::Param(FCommandLine::Get(),TEXT("FlowFestStanceProbeDepthEscape"));
        Placed.SkinEvidencePath.Reset();
        if(Knot==EvidenceKnot && Trial==EvidenceTrial &&
            (EvidenceCandidate<0 || ArmCandidate==EvidenceCandidate ||
                (bProbeDepthEscape && ArmCandidate==17)) &&
            FParse::Value(FCommandLine::Get(),TEXT("FlowArtsStanceEvidence="),Evidence))
        {
            Placed.SkinEvidencePath=EvidenceCandidate<0 ? Evidence+FString::Printf(TEXT("-candidate%d"),ArmCandidate) :
                ArmCandidate==17 && ArmCandidate!=EvidenceCandidate ? Evidence+TEXT("-selected") : Evidence;
            const auto& G=Knots[Knot].Clearance.Geometry;
            if(G.WriteSkinEvidence) G.WriteSkinEvidence(G.Arms,FQuat::Identity,
                G.HeldPropCapsules[0],G.HeldPropCapsules[1],Evidence+TEXT("-baseline"));
        }
#endif
        // Only authored source controls are searched. Odd dense samples are
        // reconstructed from adjacent solved sources in ValidateMidpoint.
        const auto* Previous=Knot>=2 && CurrentSeeds[Knot-2].bValid ? &CurrentSeeds[Knot-2] : nullptr;
        const bool Refining=ArmCandidate>=17;
        if(ArmCandidate==17) RefinementSeed=CandidateSeed;
#if WITH_DEV_AUTOMATION_TESTS
        if(bProbeDepthEscape && Refining && !Placed.SkinEvidencePath.IsEmpty())
            UE_LOG(LogTemp,Display,TEXT("FlowFestStanceProbeDepth selectedStart candidate=%d valid=%d bestCost=%.9f depth=%.9f translation=%s;%s"),
                ArmCandidate,int32(RefinementSeed.bValid),CandidateCost,
                FVector::DotProduct((RefinementSeed.HandTranslationCm[0]-RefinementSeed.HandTranslationCm[1])*.5,Placed.PreparedPatternNormal),
                *RefinementSeed.HandTranslationCm[0].ToString(),*RefinementSeed.HandTranslationCm[1].ToString());
#endif
        const bool Valid=Refining
            ? FFlowArtsArmClearance::RefinePreparedCandidate(Placed,RefinementSeed,Seed,Result)
            : FFlowArtsArmClearance::PrepareCandidate(Placed,ArmCandidate,Previous,Seed,Result);
#if WITH_DEV_AUTOMATION_TESTS
        if(FParse::Param(FCommandLine::Get(),TEXT("FlowFestStanceProbeCommonRelease")) &&
            !Placed.SkinEvidencePath.IsEmpty() && Valid && Seed.bValid)
        {
            const double InitialCommon=FVector::DotProduct(
                (Seed.HandTranslationCm[0]+Seed.HandTranslationCm[1])*.5,
                Placed.PreparedPatternNormal);
            UE_LOG(LogTemp,Display,TEXT("FlowFestStanceProbeCommonRelease baseline source=%d trial=%d candidate=%d common=%.9f feasible=%d penalty=%.9f residual=%.6f upper=%u forearmBody=%u forearmHead=%u opposite=%u heldBody=%u pair=%d obstacle=%d/%d/%d/%d"),
                Knot,Trial,ArmCandidate,InitialCommon,int32(Result.bFeasible),
                Result.PreparedContactPenalty,Result.WorstPenetrationCm,
                uint32(Result.SkinnedUpperTorsoClearMask),uint32(Result.ForearmBodyClearMask),
                uint32(Result.ForearmHeadClearMask),uint32(Result.SkinnedOppositePropClearMask),
                uint32(Result.SkinnedHeldPropBodyClearMask),int32(Result.bSkinnedArmPairClear),
                Result.WorstObstacleKind,Result.WorstArm,Result.WorstSegment,Result.WorstObstacleIndex);
            for(const double ShiftCm : {0.9,1.2})
            {
                const double RequestedCommon=InitialCommon+ShiftCm;
                const bool bWithinBounds=RequestedCommon>=Placed.MinPreparedCommonDepthCm-1.e-6 &&
                    RequestedCommon<=1.e-6;
                auto ProbeSnapshot=Placed;
                ProbeSnapshot.SkinEvidencePath=Placed.SkinEvidencePath+
                    FString::Printf(TEXT("-common-release%d"),FMath::RoundToInt(ShiftCm*100.));
                auto Proposal=Seed;
                for(int32 Side=0;Side<2;++Side)
                    Proposal.HandTranslationCm[Side]+=Placed.PreparedPatternNormal*ShiftCm;
                FFlowArtsArmClearancePreparedSeed Checked;
                FFlowArtsArmClearanceResult CheckedResult;
                const bool bBuilt=bWithinBounds && FFlowArtsArmClearance::PrepareCandidate(
                    ProbeSnapshot,0,&Proposal,Checked,CheckedResult);
                const bool bExactShift=bBuilt &&
                    Checked.HandTranslationCm[0].Equals(Proposal.HandTranslationCm[0],1.e-3) &&
                    Checked.HandTranslationCm[1].Equals(Proposal.HandTranslationCm[1],1.e-3);
                const double CheckedCommon=FVector::DotProduct(
                    (Checked.HandTranslationCm[0]+Checked.HandTranslationCm[1])*.5,
                    ProbeSnapshot.PreparedPatternNormal);
                UE_LOG(LogTemp,Display,TEXT("FlowFestStanceProbeCommonRelease source=%d trial=%d candidate=%d shift=%.3f requestedCommon=%.9f withinBounds=%d built=%d exactShift=%d checkedCommon=%.9f feasible=%d penalty=%.9f residual=%.6f upper=%u forearmBody=%u forearmHead=%u opposite=%u heldBody=%u segments=%u pair=%d obstacle=%d/%d/%d/%d evidence=%s"),
                    Knot,Trial,ArmCandidate,ShiftCm,RequestedCommon,int32(bWithinBounds),int32(bBuilt),
                    int32(bExactShift),CheckedCommon,int32(CheckedResult.bFeasible),
                    CheckedResult.PreparedContactPenalty,CheckedResult.WorstPenetrationCm,
                    uint32(CheckedResult.SkinnedUpperTorsoClearMask),uint32(CheckedResult.ForearmBodyClearMask),
                    uint32(CheckedResult.ForearmHeadClearMask),uint32(CheckedResult.SkinnedOppositePropClearMask),
                    uint32(CheckedResult.SkinnedHeldPropBodyClearMask),uint32(CheckedResult.SkinnedSegmentClearMask),
                    int32(CheckedResult.bSkinnedArmPairClear),CheckedResult.WorstObstacleKind,
                    CheckedResult.WorstArm,CheckedResult.WorstSegment,CheckedResult.WorstObstacleIndex,
                    *ProbeSnapshot.SkinEvidencePath);
            }
        }
        if(bProbeDepthEscape && !Refining && Valid && Seed.bValid && !Placed.SkinEvidencePath.IsEmpty())
        {
            FFlowArtsArmClearancePreparedSeed EscapedSeed;
            FFlowArtsArmClearanceResult EscapedResult;
            const bool bBuilt=FFlowArtsArmClearance::RefinePreparedCandidate(Placed,Seed,EscapedSeed,EscapedResult);
            UE_LOG(LogTemp,Display,TEXT("FlowFestStanceProbeDepth coarse candidate=%d depth=%.9f penalty=%.9f residual=%.6f opposite=%u probeBuilt=%d probeDepth=%.9f probeFeasible=%d probePenalty=%.9f probeResidual=%.6f probeOpposite=%u probeObstacle=%d/%d/%d/%d"),
                ArmCandidate,FVector::DotProduct((Seed.HandTranslationCm[0]-Seed.HandTranslationCm[1])*.5,Placed.PreparedPatternNormal),
                Result.PreparedContactPenalty,Result.WorstPenetrationCm,uint32(Result.SkinnedOppositePropClearMask),
                int32(bBuilt),FVector::DotProduct((EscapedSeed.HandTranslationCm[0]-EscapedSeed.HandTranslationCm[1])*.5,Placed.PreparedPatternNormal),
                int32(EscapedResult.bFeasible),EscapedResult.PreparedContactPenalty,EscapedResult.WorstPenetrationCm,
                uint32(EscapedResult.SkinnedOppositePropClearMask),EscapedResult.WorstObstacleKind,EscapedResult.WorstArm,
                EscapedResult.WorstSegment,EscapedResult.WorstObstacleIndex);
            if(bBuilt && EscapedSeed.bValid)
            {
                if(FParse::Param(FCommandLine::Get(),TEXT("FlowFestStanceProbeDepth11")))
                {
                    // Diagnostic only: reproject the escaped pole onto each new
                    // shoulder-to-wrist plane before turning it. The production
                    // hand-depth cap remains unchanged.
                    const double ExistingDepth=FVector::DotProduct(
                        (EscapedSeed.HandTranslationCm[0]-EscapedSeed.HandTranslationCm[1])*.5,
                        Placed.PreparedPatternNormal);
                    for(const double ProbeDepth : {11.6})
                        for(const double PoleDegrees : {40.,42.5})
                        {
                            auto ProbeSnapshot=Placed;
                            ProbeSnapshot.MaxPreparedHandDepthCm=11.6;
                            if(!Placed.SkinEvidencePath.IsEmpty())
                                ProbeSnapshot.SkinEvidencePath=Placed.SkinEvidencePath+
                                    FString::Printf(TEXT("-edge-followup-depth%d-pole%d"),
                                        FMath::RoundToInt(ProbeDepth*100.),
                                        FMath::RoundToInt(PoleDegrees*10.));
                            auto ProbeSeed=EscapedSeed;
                            const double DepthChange=ProbeDepth-ExistingDepth;
                            for(int32 Side=0;Side<2;++Side)
                                ProbeSeed.HandTranslationCm[Side]+=
                                    ProbeSnapshot.PreparedPatternNormal*((Side ? -1. : 1.)*DepthChange);
                            const FVector NewWrist=EscapedSeed.SolvedWrists[0]+
                                ProbeSnapshot.PreparedPatternNormal*DepthChange;
                            const FVector NewAxis=(NewWrist-EscapedSeed.SolvedShoulders[0]).GetSafeNormal();
                            const FVector ProjectedPole=(EscapedSeed.ElbowPole[0]-NewAxis*
                                FVector::DotProduct(EscapedSeed.ElbowPole[0],NewAxis)).GetSafeNormal();
                            const bool bValidAxis=NewAxis.IsNormalized() && ProjectedPole.IsNormalized();
                            if(bValidAxis)
                                ProbeSeed.ElbowPole[0]=FQuat(NewAxis,FMath::DegreesToRadians(PoleDegrees))
                                    .RotateVector(ProjectedPole);
                            FFlowArtsArmClearancePreparedSeed Checked;
                            FFlowArtsArmClearanceResult CheckedResult;
                            const bool bDepthProbeBuilt=bValidAxis && FFlowArtsArmClearance::PrepareCandidate(
                                ProbeSnapshot,0,&ProbeSeed,Checked,CheckedResult);
                            UE_LOG(LogTemp,Display,TEXT("FlowFestStanceProbeDepth11 source=%d trial=%d candidate=%d requestedDepth=%.3f poleDelta=%.3f axis=%s proposedPole=%s built=%d feasible=%d checkedDepth=%.9f checkedWrist=%s checkedPole=%s penalty=%.9f residual=%.6f upper=%u forearmBody=%u forearmHead=%u opposite=%u heldBody=%u pair=%d obstacle=%d/%d/%d/%d evidence=%s"),
                                Knot,Trial,ArmCandidate,ProbeDepth,PoleDegrees,*NewAxis.ToString(),
                                *ProbeSeed.ElbowPole[0].ToString(),int32(bDepthProbeBuilt),int32(CheckedResult.bFeasible),
                                FVector::DotProduct((Checked.HandTranslationCm[0]-Checked.HandTranslationCm[1])*.5,
                                    ProbeSnapshot.PreparedPatternNormal),*Checked.SolvedWrists[0].ToString(),
                                *Checked.ElbowPole[0].ToString(),CheckedResult.PreparedContactPenalty,
                                CheckedResult.WorstPenetrationCm,uint32(CheckedResult.SkinnedUpperTorsoClearMask),
                                uint32(CheckedResult.ForearmBodyClearMask),uint32(CheckedResult.ForearmHeadClearMask),
                                uint32(CheckedResult.SkinnedOppositePropClearMask),uint32(CheckedResult.SkinnedHeldPropBodyClearMask),
                                int32(CheckedResult.bSkinnedArmPairClear),CheckedResult.WorstObstacleKind,
                                CheckedResult.WorstArm,CheckedResult.WorstSegment,CheckedResult.WorstObstacleIndex,
                                *ProbeSnapshot.SkinEvidencePath);
                        }
                }
                // Hold the escaped hand separation and requery a few left elbow
                // routes on this same authored phase. This is evidence only.
                const FVector Axis=(EscapedSeed.SolvedWrists[0]-EscapedSeed.SolvedShoulders[0]).GetSafeNormal();
                if(Axis.IsNormalized())
                    for(const double Degrees : {-20.,-10.,-5.,5.,10.,20.})
                    {
                        auto PoleProposal=EscapedSeed;
                        PoleProposal.ElbowPole[0]=FQuat(Axis,FMath::DegreesToRadians(Degrees)).RotateVector(
                            EscapedSeed.ElbowPole[0]);
                        FFlowArtsArmClearancePreparedSeed CheckedPole;
                        FFlowArtsArmClearanceResult PoleResult;
                        const bool bPoleBuilt=FFlowArtsArmClearance::PrepareCandidate(
                            Placed,0,&PoleProposal,CheckedPole,PoleResult);
                        UE_LOG(LogTemp,Display,TEXT("FlowFestStanceProbeDepth poleDeg=%.3f built=%d depth=%.9f feasible=%d penalty=%.9f residual=%.6f opposite=%u pair=%d obstacle=%d/%d/%d/%d"),
                            Degrees,int32(bPoleBuilt),
                            FVector::DotProduct((CheckedPole.HandTranslationCm[0]-CheckedPole.HandTranslationCm[1])*.5,
                                Placed.PreparedPatternNormal),int32(PoleResult.bFeasible),PoleResult.PreparedContactPenalty,
                            PoleResult.WorstPenetrationCm,uint32(PoleResult.SkinnedOppositePropClearMask),
                            int32(PoleResult.bSkinnedArmPairClear),PoleResult.WorstObstacleKind,PoleResult.WorstArm,
                            PoleResult.WorstSegment,PoleResult.WorstObstacleIndex);
                    }
            }
        }
#endif
#if WITH_DEV_AUTOMATION_TESTS
        if(Knot==0 && Trial==0 && ArmCandidate==0 && Valid && Seed.bValid &&
            FParse::Param(FCommandLine::Get(),TEXT("FlowFestStanceProbeNeutralLean")))
        {
            // Hold this exact source's absolute hand, pole and clavicle controls
            // while isolating the prescribed torso lean in the grounded pose.
            FFlowArtsArmClearancePreparedSeed BaseSeed, NeutralSeed;
            FFlowArtsArmClearanceResult BaseResult, NeutralResult;
            const bool bBase=FFlowArtsArmClearance::PrepareCandidate(Placed,0,&Seed,BaseSeed,BaseResult);
            auto Neutral=Placed;
            Neutral.PreparedTorsoRotation=FQuat::Identity;
            Neutral.PreparedAddedTorsoPitch=FQuat::Identity;
            Neutral.PreparedNeckCounterFraction=0.f;
            const bool bNeutral=FFlowArtsArmClearance::PrepareCandidate(Neutral,0,&Seed,NeutralSeed,NeutralResult);
            UE_LOG(LogTemp,Display,TEXT("FlowFestStanceProbeNeutralLean baseBuilt=%d baseFeasible=%d basePenalty=%.9f baseResidual=%.6f baseUpper=%u baseForearmBody=%u baseForearmHead=%u baseObstacle=%d/%d/%d/%d neutralBuilt=%d neutralFeasible=%d neutralPenalty=%.9f neutralResidual=%.6f neutralUpper=%u neutralForearmBody=%u neutralForearmHead=%u neutralObstacle=%d/%d/%d/%d"),
                int32(bBase),int32(BaseResult.bFeasible),BaseResult.PreparedContactPenalty,BaseResult.WorstPenetrationCm,
                uint32(BaseResult.SkinnedUpperTorsoClearMask),uint32(BaseResult.ForearmBodyClearMask),uint32(BaseResult.ForearmHeadClearMask),
                BaseResult.WorstObstacleKind,BaseResult.WorstArm,BaseResult.WorstSegment,BaseResult.WorstObstacleIndex,
                int32(bNeutral),int32(NeutralResult.bFeasible),NeutralResult.PreparedContactPenalty,NeutralResult.WorstPenetrationCm,
                uint32(NeutralResult.SkinnedUpperTorsoClearMask),uint32(NeutralResult.ForearmBodyClearMask),uint32(NeutralResult.ForearmHeadClearMask),
                NeutralResult.WorstObstacleKind,NeutralResult.WorstArm,NeutralResult.WorstSegment,NeutralResult.WorstObstacleIndex);
        }
        if(Knot==0 && Trial==0 && ArmCandidate==0 && Valid && Seed.bValid &&
            FParse::Param(FCommandLine::Get(),TEXT("FlowFestStanceProbeNeckCounterRotation")))
        {
            FFlowArtsArmClearancePreparedSeed BaseSeed;
            FFlowArtsArmClearanceResult Base;
            auto Uncountered=Placed;
            Uncountered.PreparedNeckCounterFraction=0.f;
            auto UncounteredSeed=Seed;
            UncounteredSeed.NeckCounterFraction=0.f;
            const bool bBase=FFlowArtsArmClearance::PrepareCandidate(
                Uncountered,0,&UncounteredSeed,BaseSeed,Base);
            for (const double Fraction : {0.,.5,1.})
            {
                FFlowArtsArmClearanceResult Probe;
                FString Error;
                const bool bBuilt=FFlowArtsArmClearance::ProbePreparedNeckCounterRotation(
                    Placed,Seed,Fraction,Probe,Error);
                const bool bBaselineMatch=Fraction!=0. || (bBase && bBuilt &&
                    Base.bFeasible==Probe.bFeasible &&
                    FMath::IsNearlyEqual(Base.PreparedContactPenalty,Probe.PreparedContactPenalty,1.e-8) &&
                    Base.WorstPenetrationCm==Probe.WorstPenetrationCm &&
                    Base.SkinnedUpperTorsoClearMask==Probe.SkinnedUpperTorsoClearMask &&
                    Base.ForearmBodyClearMask==Probe.ForearmBodyClearMask &&
                    Base.ForearmHeadClearMask==Probe.ForearmHeadClearMask &&
                    Base.bSkinnedArmPairClear==Probe.bSkinnedArmPairClear &&
                    Base.SkinnedOppositePropClearMask==Probe.SkinnedOppositePropClearMask &&
                    Base.SkinnedHeldPropBodyClearMask==Probe.SkinnedHeldPropBodyClearMask &&
                    Base.SkinnedSegmentClearMask==Probe.SkinnedSegmentClearMask &&
                    Base.WorstObstacleKind==Probe.WorstObstacleKind &&
                    Base.WorstArm==Probe.WorstArm && Base.WorstSegment==Probe.WorstSegment &&
                    Base.WorstObstacleIndex==Probe.WorstObstacleIndex);
                UE_LOG(LogTemp,Display,TEXT("FlowFestStanceProbeNeck fraction=%.2f built=%d baselineMatch=%d feasible=%d penalty=%.9f residual=%.6f upper=%u body=%u head=%u pair=%d opposite=%u heldBody=%u segments=%u obstacle=%d/%d/%d/%d error=%s"),
                    Fraction,int32(bBuilt),int32(bBaselineMatch),int32(Probe.bFeasible),Probe.PreparedContactPenalty,
                    Probe.WorstPenetrationCm,uint32(Probe.SkinnedUpperTorsoClearMask),uint32(Probe.ForearmBodyClearMask),
                    uint32(Probe.ForearmHeadClearMask),int32(Probe.bSkinnedArmPairClear),
                    uint32(Probe.SkinnedOppositePropClearMask),uint32(Probe.SkinnedHeldPropBodyClearMask),
                    uint32(Probe.SkinnedSegmentClearMask),Probe.WorstObstacleKind,Probe.WorstArm,
                    Probe.WorstSegment,Probe.WorstObstacleIndex,*Error);
                if(Fraction==0. && !bBaselineMatch) break;
            }
        }
#endif
        if (Valid && Seed.bValid)
        {
            bool Continuous=!Previous || ContinuousArms(*Previous,Seed,2.*Current.Duration/Knots.Num());
            const bool Feasible=Result.bFeasible && Continuous;
#if WITH_DEV_AUTOMATION_TESTS
            if(!Placed.SkinEvidencePath.IsEmpty())
            {
                FString Detail=FString::Printf(TEXT("feasible=%d continuous=%d exactPenalty=%.12f residual=%.9f forearmMask=%u forearmHeadMask=%u obstacle=%d/%d/%d/%d\n"),
                    int32(Result.bFeasible),int32(Continuous),Result.PreparedContactPenalty,Result.WorstPenetrationCm,
                    uint32(Result.ForearmBodyClearMask),uint32(Result.ForearmHeadClearMask),
                    Result.WorstObstacleKind,Result.WorstArm,Result.WorstSegment,Result.WorstObstacleIndex);
                if(Previous) for(int32 Side=0;Side<2;++Side)
                    Detail+=FString::Printf(TEXT("side=%d shoulder=%.9f elbow=%.9f wrist=%.9f upperDeg=%.9f forearmDeg=%.9f clavicleDeg=%.9f poleDeg=%.9f\n"),Side,
                        FVector::Dist(Previous->SolvedShoulders[Side],Seed.SolvedShoulders[Side]),
                        FVector::Dist(Previous->SolvedElbows[Side],Seed.SolvedElbows[Side]),
                        FVector::Dist(Previous->SolvedWrists[Side],Seed.SolvedWrists[Side]),
                        FMath::RadiansToDegrees(Previous->SolvedUpperRotation[Side].AngularDistance(Seed.SolvedUpperRotation[Side])),
                        FMath::RadiansToDegrees(Previous->SolvedForearmRotation[Side].AngularDistance(Seed.SolvedForearmRotation[Side])),
                        FMath::Abs(Previous->ClavicleProtractionDeg[Side]-Seed.ClavicleProtractionDeg[Side]),
                        FMath::RadiansToDegrees(FMath::Acos(FMath::Clamp(FVector::DotProduct(
                            Previous->ElbowPole[Side].GetSafeNormal(),Seed.ElbowPole[Side].GetSafeNormal()),-1.,1.))));
                FFileHelper::SaveStringToFile(Detail,*(Placed.SkinEvidencePath+TEXT("-result.txt")));
            }
#endif
            double Cost=(Feasible ? 0. : 10000.)+Result.TotalPenetrationCm*100.+
                1000.*FMath::Sqrt(FMath::Max(0.,Result.PreparedContactPenalty));
            if(Refining) RefinementSeed=Seed;
            if (Previous)
                for(int32 Side=0; Side<2; ++Side) Cost+=.01*FVector::DistSquared(Previous->SolvedElbows[Side],Seed.SolvedElbows[Side]);
            // An inadmissible pole/depth reset cannot replace a continuous
            // branch merely because its broad penetration cost is lower.
            const bool bReplace=!bCandidateFound || (Continuous && !bCandidateContinuous) ||
                (Continuous==bCandidateContinuous && Cost<CandidateCost);
#if WITH_DEV_AUTOMATION_TESTS
            if(bProbeDepthEscape && Refining && !Placed.SkinEvidencePath.IsEmpty())
                UE_LOG(LogTemp,Display,TEXT("FlowFestStanceProbeDepth selectedResult candidate=%d depth=%.9f feasible=%d continuous=%d cost=%.9f bestCost=%.9f adopted=%d penalty=%.9f residual=%.6f opposite=%u obstacle=%d/%d/%d/%d"),
                    ArmCandidate,FVector::DotProduct((Seed.HandTranslationCm[0]-Seed.HandTranslationCm[1])*.5,Placed.PreparedPatternNormal),
                    int32(Result.bFeasible),int32(Continuous),Cost,CandidateCost,int32(bReplace),
                    Result.PreparedContactPenalty,Result.WorstPenetrationCm,uint32(Result.SkinnedOppositePropClearMask),
                    Result.WorstObstacleKind,Result.WorstArm,Result.WorstSegment,Result.WorstObstacleIndex);
#endif
            if (bReplace)
            {
                bCandidateFound=true; bCandidateContinuous=Continuous;
                CandidateCost=Cost; CandidateSeed=Seed; bKnotClear=Feasible;
                CandidateRejection=FString::Printf(TEXT("candidate=%d feasible=%d continuous=%d residual=%.6fcm exactPenalty=%.9f upper=%u forearmBody=%u forearmHead=%u pair=%d opposite=%u heldBody=%u segments=%u obstacle=%d arm=%d segment=%d hull=%d"),
                    ArmCandidate,int32(Result.bFeasible),int32(Continuous),Result.WorstPenetrationCm,Result.PreparedContactPenalty,
                    uint32(Result.SkinnedUpperTorsoClearMask),uint32(Result.ForearmBodyClearMask),
                    uint32(Result.ForearmHeadClearMask),int32(Result.bSkinnedArmPairClear),
                    uint32(Result.SkinnedOppositePropClearMask),uint32(Result.SkinnedHeldPropBodyClearMask),
                    uint32(Result.SkinnedSegmentClearMask),Result.WorstObstacleKind,Result.WorstArm,Result.WorstSegment,Result.WorstObstacleIndex);
            }
            if(Result.bFeasible && !Continuous && Previous)
            { BeginPrefixRepair(Seed); continue; }
            // Continue the accepted anatomical branch directly where it is still clear.
            if ((ArmCandidate==0 || Refining) && Feasible) ArmCandidate=MaxArmCandidate;
        }
        if(Refining && !Valid) ArmCandidate=MaxArmCandidate;
        if (++ArmCandidate>MaxArmCandidate || (ArmCandidate==17 && (bKnotClear || !bCandidateFound))) FinishKnot();
    } while (!bReady && !bFailed && FPlatformTime::Seconds()<Deadline);
}
