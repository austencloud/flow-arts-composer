#include "FlowFestStancePlan.h"

#include "Animation/AnimNodeBase.h"
#include "Animation/Skeleton.h"
#include "BonePose.h"
#include "TwoBoneIK.h"

namespace
{
double Wrap(double Value, double Period)
{
    const double Result = FMath::Fmod(Value, Period);
    return Result < 0. ? Result + Period : Result;
}

double Ease(double T)
{
    T = FMath::Clamp(T, 0., 1.);
    return T*T*T*(10.+T*(-15.+6.*T));
}

bool Reject(FString* Error, const TCHAR* Message)
{
    if (Error) *Error = Message;
    return false;
}

FTransform Blend(const FTransform& A, const FTransform& B, double T)
{
    return FTransform(FQuat::Slerp(A.GetRotation(), B.GetRotation(), T).GetNormalized(),
        FMath::Lerp(A.GetLocation(), B.GetLocation(), T), FMath::Lerp(A.GetScale3D(), B.GetScale3D(), T));
}
}

bool FFlowFestStanceTurn::IsValid() const
{
    if (Frames.Num() < 3 || !FMath::IsFinite(Duration) || Duration <= 0. ||
        !FMath::IsFinite(HeadingDegrees) || FMath::Abs(HeadingDegrees) < 10. ||
        FMath::Abs(Frames[0].Seconds) > 1.e-6 || FMath::Abs(Frames.Last().Seconds-Duration) > 1.e-6) return false;
    for (int32 Side=0; Side<2; ++Side)
        if (!FMath::IsFinite(SwingStart[Side]) || !FMath::IsFinite(SwingEnd[Side]) ||
            SwingStart[Side] < 0. || SwingEnd[Side] > Duration || SwingEnd[Side]-SwingStart[Side] < .05) return false;
    // There must be a planted support throughout. A flight or ambiguous double-swing turn is not usable.
    if (FMath::Max(SwingStart[0], SwingStart[1]) < FMath::Min(SwingEnd[0], SwingEnd[1])-1.e-6) return false;
    for (int32 Index=0; Index<Frames.Num(); ++Index)
    {
        const auto& F=Frames[Index];
        if (!FMath::IsFinite(F.Seconds) || (Index && F.Seconds<=Frames[Index-1].Seconds) ||
            F.Hips.ContainsNaN() || F.Feet[0].ContainsNaN() || F.Feet[1].ContainsNaN()) return false;
    }
    return true;
}

bool FFlowFestStanceTurn::Sample(double Seconds, FFlowFestStanceTurnFrame& Out) const
{
    if (!IsValid() || !FMath::IsFinite(Seconds)) return false;
    Seconds=FMath::Clamp(Seconds, 0., Duration);
    int32 B=1;
    while (B<Frames.Num()-1 && Frames[B].Seconds<Seconds) ++B;
    const auto& AFrame=Frames[B-1]; const auto& BFrame=Frames[B];
    const double Alpha=(Seconds-AFrame.Seconds)/(BFrame.Seconds-AFrame.Seconds);
    Out.Seconds=Seconds;
    Out.Hips=Blend(AFrame.Hips, BFrame.Hips, Alpha);
    for (int32 Side=0; Side<2; ++Side) Out.Feet[Side]=Blend(AFrame.Feet[Side], BFrame.Feet[Side], Alpha);
    return true;
}

bool FFlowFestStancePlan::SeedTiming(const TArray<FFlowFestStanceSourceFrame>& Frames,
    double InDuration, double OutDuration, double ReturnDuration,
    FFlowFestStanceControls& Out, FString& Error)
{
    Out={}; Error.Reset();
    if (Frames.Num()<3 || !FMath::IsFinite(InDuration) || InDuration<=0. ||
        OutDuration<=0. || ReturnDuration<=0. || OutDuration+ReturnDuration>=InDuration)
        return Reject(&Error, TEXT("Clip cannot contain both authored support turns"));
    TArray<bool> Crossed;
    for (int32 I=0; I<Frames.Num(); ++I)
    {
        const auto& F=Frames[I];
        if (!FMath::IsFinite(F.Seconds) || F.Seconds<0. || F.Seconds>=InDuration ||
            (I && F.Seconds<=Frames[I-1].Seconds)) return Reject(&Error, TEXT("Invalid source phase samples"));
        FVector Lateral=F.Shoulders[1]-F.Shoulders[0]; Lateral.Z=0.;
        if (!Lateral.Normalize()) return Reject(&Error, TEXT("Degenerate shoulder frame"));
        Crossed.Add(FVector::DotProduct(F.Hands[1]-F.Hands[0], Lateral)<-1.);
    }
    TArray<int32> Starts;
    for (int32 I=0; I<Crossed.Num(); ++I)
        if (Crossed[I] && !Crossed[(I+Crossed.Num()-1)%Crossed.Num()]) Starts.Add(I);
    if (Starts.IsEmpty()) return Reject(&Error, TEXT("Requires bounded crossed-hand intervals"));
    // A repeated source phrase can cross hands several times. Place the two
    // support turns around the shortest circular envelope containing them all.
    // The longest clear gap is the neutral portion outside that envelope.
    int32 Start=INDEX_NONE, End=INDEX_NONE;
    double LongestClearGap=-1.;
    for (int32 Run=0; Run<Starts.Num(); ++Run)
    {
        int32 ClearStart=(Starts[Run]+1)%Frames.Num();
        while (Crossed[ClearStart]) ClearStart=(ClearStart+1)%Frames.Num();
        const int32 NextStart=Starts[(Run+1)%Starts.Num()];
        double GapEnd=Frames[NextStart].Seconds;
        if (GapEnd<=Frames[ClearStart].Seconds) GapEnd+=InDuration;
        const double ClearGap=GapEnd-Frames[ClearStart].Seconds;
        if (ClearGap>LongestClearGap)
        {
            LongestClearGap=ClearGap;
            Start=NextStart;
            End=ClearStart;
        }
    }
    const double CrossStart=Frames[Start].Seconds;
    double CrossEnd=Frames[End].Seconds;
    if (CrossEnd<=CrossStart) CrossEnd+=InDuration;
    if (CrossEnd-CrossStart < .5*(OutDuration+ReturnDuration) ||
        CrossEnd-CrossStart+.5*(OutDuration+ReturnDuration)>InDuration-.30+1.e-9)
        return Reject(&Error, TEXT("Crossed interval leaves insufficient time for supported return"));
    // Crossed-hand order seeds timing only. Turns straddle the crossing boundaries;
    // every resulting pose still requires reach, support and full skin validation.
    Out.StartSeconds=Wrap(CrossStart-.5*OutDuration, InDuration);
    Out.ReturnSeconds=Out.StartSeconds+.5*OutDuration+(CrossEnd-CrossStart)-.5*ReturnDuration;
    return true;
}

bool FFlowFestStancePlan::MakePhaseSchedule(double Phase, bool bReturnAtPhase, bool bSwapTurns,
    const FVector& Lateral, double MinimumNeutral, FFlowFestStancePlan& Out, FString* Error) const
{
    if (!IsValid(Error)) return false;
    if (!FMath::IsFinite(Phase) || !FMath::IsFinite(MinimumNeutral) || MinimumNeutral<.30 ||
        Outward.Duration+Return.Duration+MinimumNeutral>Duration || Lateral.ContainsNaN() ||
        FMath::Abs(Lateral.Z)>1.e-6 || Lateral.IsNearlyZero())
        return Reject(Error,TEXT("Invalid event schedule or insufficient neutral entry time"));
    auto Candidate=*this;
    if (bSwapTurns)
    {
        // Carry the actual asymmetric native frames and support windows with their direction.
        Swap(Candidate.Outward,Candidate.Return);
        Candidate.Controls.HeadingDegrees=-Controls.HeadingDegrees;
        const FVector Axis=Lateral.GetSafeNormal();
        Candidate.Controls.HipTranslationCm-=2.*FVector::DotProduct(Controls.HipTranslationCm,Axis)*Axis;
    }
    auto& C=Candidate.Controls;
    const double OutDuration=Candidate.Outward.Duration, ReturnDuration=Candidate.Return.Duration;
    if (bReturnAtPhase)
    {
        C.ReturnSeconds=C.StartSeconds+Wrap(Phase-.5*ReturnDuration-C.StartSeconds,Duration);
        C.StartSeconds=FMath::Clamp(C.StartSeconds,
            C.ReturnSeconds+ReturnDuration-Duration+MinimumNeutral,C.ReturnSeconds-OutDuration);
    }
    else
    {
        C.StartSeconds=Wrap(Phase-.5*OutDuration,Duration);
        C.ReturnSeconds=C.StartSeconds+Wrap(Controls.ReturnSeconds-C.StartSeconds,Duration);
        C.ReturnSeconds=FMath::Clamp(C.ReturnSeconds,C.StartSeconds+OutDuration,
            C.StartSeconds+Duration-ReturnDuration-MinimumNeutral);
    }
    const double NormalizedStart=Wrap(C.StartSeconds,Duration);
    C.ReturnSeconds+=NormalizedStart-C.StartSeconds;
    C.StartSeconds=NormalizedStart;
    if (!Candidate.IsValid(Error) || C.StartSeconds+Duration-C.ReturnSeconds-ReturnDuration<MinimumNeutral-1.e-9)
        return Reject(Error,TEXT("Event schedule cannot preserve neutral entry time"));
    Out=MoveTemp(Candidate);
    return true;
}

bool FFlowFestStancePlan::IsValid(FString* Error) const
{
    if (!FMath::IsFinite(Duration) || Duration<=0. || HipPivot.ContainsNaN() ||
        InitialFeet[0].ContainsNaN() || InitialFeet[1].ContainsNaN() ||
        !Outward.IsValid() || !Return.IsValid()) return Reject(Error, TEXT("Invalid stance/turn geometry"));
    if (PatternNormal.ContainsNaN() || !FMath::IsNearlyEqual(PatternNormal.SizeSquared(),1.,1.e-6) ||
        !FMath::IsFinite(Controls.HandDepthCm) || FMath::Abs(Controls.HandDepthCm)>4. ||
        !FMath::IsFinite(Controls.TorsoLeanDegrees) || FMath::Abs(Controls.TorsoLeanDegrees)>25.)
        return Reject(Error,TEXT("Invalid bounded pattern-normal hand control"));
    if (!FMath::IsFinite(Controls.StartSeconds) || !FMath::IsFinite(Controls.ReturnSeconds) ||
        !FMath::IsFinite(Controls.HeadingDegrees) || Controls.HipTranslationCm.ContainsNaN() ||
        Controls.StartSeconds<0. || Controls.StartSeconds>=Duration ||
        Controls.ReturnSeconds<Controls.StartSeconds+Outward.Duration ||
        Controls.ReturnSeconds+Return.Duration>Controls.StartSeconds+Duration-.30+1.e-9)
        return Reject(Error, TEXT("Support turns overlap or do not close within the cycle"));
    if (Controls.HeadingDegrees*Outward.HeadingDegrees<=0. ||
        Controls.HeadingDegrees*Return.HeadingDegrees>=0.)
        return Reject(Error, TEXT("Authored turn direction disagrees with planned stance"));
    if (!bGroundValidated || GroundOrigin.ContainsNaN() || GroundNormal.ContainsNaN() ||
        !FMath::IsNearlyEqual(GroundNormal.SizeSquared(),1.,1.e-4) ||
        FVector::DotProduct(GroundNormal,FVector::UpVector)<.996)
        return Reject(Error,TEXT("Stance requires measured stationary supported ground"));
    if (!FMath::IsFinite(GroundPenetrationToleranceCm) || GroundPenetrationToleranceCm<=0. ||
        !FMath::IsFinite(GroundContactToleranceCm) || GroundContactToleranceCm<=0. ||
        !FMath::IsFinite(SwingFootLiftCm) || SwingFootLiftCm<0. || SwingFootLiftCm>4.)
        return Reject(Error,TEXT("Invalid measured ground tolerances"));
    if (NeutralBodyOffsetCm.ContainsNaN() ||
        NeutralBodyOffsetCm.Size()>2.5*GroundContactToleranceCm+1.e-6 ||
        FVector::CrossProduct(NeutralBodyOffsetCm,GroundNormal).Size()>1.e-6)
        return Reject(Error,TEXT("Invalid bounded neutral grounding offset"));
    for (int32 Side=0; Side<2; ++Side)
    {
        if (!FMath::IsFinite(FootSoleOffsetCm[Side]) ||
            FMath::Abs(FVector::DotProduct(InitialFeet[Side].GetLocation()-GroundOrigin,GroundNormal)-FootSoleOffsetCm[Side])>.05)
            return Reject(Error,TEXT("Foot anchor disagrees with measured ground"));
        if (bFootTerrainProbesValid)
            for (const FVector& Probe : FootTerrainProbesLocal[Side])
                if (Probe.ContainsNaN()) return Reject(Error,TEXT("Invalid measured foot terrain probe"));
    }
    // Control placement is authored horizontally and projected onto the
    // measured support tangent when sampled.
    if (FMath::Abs(Controls.HipTranslationCm.Z)>.0001 || FMath::Abs(Controls.HeadingDegrees)>110.)
        return Reject(Error, TEXT("Unsupported vertical placement or turn extent"));
    return true;
}

bool FFlowFestStancePlan::Sample(double Seconds, FFlowFestStanceSample& Out, FString* Error) const
{
    Out={};
    if (!IsValid(Error)) return false;
    if (!FMath::IsFinite(Seconds)) return Reject(Error,TEXT("Nonfinite stance phase"));
    Out.NeutralBodyOffsetCm=NeutralBodyOffsetCm;
    const double Phase=Wrap(Seconds-Controls.StartSeconds, Duration);
    const double ReturnStart=Controls.ReturnSeconds-Controls.StartSeconds;
    const FVector TangentTravel=FVector::VectorPlaneProject(Controls.HipTranslationCm,GroundNormal);
    const FQuat Heading(GroundNormal, FMath::DegreesToRadians(Controls.HeadingDegrees));
    const FTransform Destination(Heading, HipPivot+TangentTravel-Heading.RotateVector(HipPivot));
    const bool bOut=Phase<Outward.Duration;
    const bool bReturn=Phase>=ReturnStart && Phase<ReturnStart+Return.Duration;
    if (!bOut && !bReturn)
    {
        const bool bAway=Phase>=Outward.Duration && Phase<ReturnStart;
        Out.ExcursionWeight=bAway ? 1. : 0.;
        Out.BodyDelta=bAway ? Destination : FTransform::Identity;
        for (int32 Side=0; Side<2; ++Side) Out.Feet[Side]=InitialFeet[Side]*Out.BodyDelta;
        // The foot anchors already include grounding. Only the body still needs it.
        Out.BodyDelta.AddToTranslation(NeutralBodyOffsetCm);
        return true;
    }
    const auto& Turn=bOut ? Outward : Return;
    const double T=bOut ? Phase : Phase-ReturnStart;
    const double U=Ease(T/Turn.Duration);
    Out.ExcursionWeight=bOut ? U : 1.-U;
    const FQuat CurrentHeading=FQuat::Slerp(FQuat::Identity, Heading, Out.ExcursionWeight).GetNormalized();
    Out.BodyDelta=FTransform(CurrentHeading, HipPivot+TangentTravel*Out.ExcursionWeight-
        CurrentHeading.RotateVector(HipPivot));
    FFlowFestStanceTurnFrame Current;
    if (!Turn.Sample(T, Current)) return Reject(Error,TEXT("Invalid authored turn phase"));
    // Retain the authored small hip rise; endpoints are exactly the planned standing height.
    const double Linear=T/Turn.Duration;
    const double Bob=Current.Hips.GetLocation().Z-FMath::Lerp(Turn.Frames[0].Hips.GetLocation().Z,
        Turn.Frames.Last().Hips.GetLocation().Z, Linear);
    Out.BodyDelta.AddToTranslation(GroundNormal*Bob);
    const FQuat StartHeading=bOut ? FQuat::Identity : Heading;
    const FQuat TerrainTilt=FQuat::FindBetweenNormals(FVector::UpVector,GroundNormal);
    for (int32 Side=0; Side<2; ++Side)
    {
        const FTransform Start=InitialFeet[Side]*(bOut ? FTransform::Identity : Destination);
        const FTransform End=InitialFeet[Side]*(bOut ? Destination : FTransform::Identity);
        const double A=Turn.SwingStart[Side], B=Turn.SwingEnd[Side];
        Out.bSupport[Side]=T<=A || T>=B;
        if (T<=A) { Out.Feet[Side]=Start; continue; }
        if (T>=B) { Out.Feet[Side]=End; continue; }
        FFlowFestStanceTurnFrame Begin, Finish;
        if (!Turn.Sample(A, Begin) || !Turn.Sample(B, Finish))
            return Reject(Error,TEXT("Invalid authored swing contacts"));
        const double Swing=(T-A)/(B-A), Weight=Ease(Swing);
        Out.Feet[Side]=Blend(Start, End, Weight);
        // Keep the authored swing's lift and bend, removing only its endpoint displacement.
        // End-taper gives zero offset/velocity at fixed contacts even with noisy source keys.
        FVector Bow=Current.Feet[Side].GetLocation()-FMath::Lerp(
            Begin.Feet[Side].GetLocation(),Finish.Feet[Side].GetLocation(),Swing);
        const double Taper=FMath::Square(FMath::Sin(PI*Swing));
        // A retargeted foot can dip below the chord between its authored contacts.
        // The planned contacts are measured on the floor, so retain the authored
        // tangent bow and positive lift without carrying a below-surface dip.
        Bow.Z=FMath::Max(0.,Bow.Z);
        Bow=TerrainTilt.RotateVector(Bow);
        Out.Feet[Side].AddToTranslation(StartHeading.RotateVector(Bow)*Taper);
        // Give the posed toe/heel a small clearance arc; exact weighted surfaces
        // are still checked at every preparation sample before publication.
        Out.Feet[Side].AddToTranslation(GroundNormal*SwingFootLiftCm*Taper);
        // The planned contact orientations are exact. Carry only the authored
        // swing rotation relative to its endpoint interpolation, tapered to zero
        // at both contacts so planted feet never snap or rotate.
        const FQuat SourceChord=FQuat::Slerp(Begin.Feet[Side].GetRotation(),
            Finish.Feet[Side].GetRotation(),Swing).GetNormalized();
        const FQuat SourceBow=(Current.Feet[Side].GetRotation()*SourceChord.Inverse()).GetNormalized();
        const FQuat TerrainBow=(TerrainTilt*SourceBow*TerrainTilt.Inverse()).GetNormalized();
        const FQuat RotatedBow=(StartHeading*TerrainBow*StartHeading.Inverse()).GetNormalized();
        const FQuat TaperedBow=FQuat::Slerp(FQuat::Identity,RotatedBow,Taper).GetNormalized();
        Out.Feet[Side].SetRotation((TaperedBow*Out.Feet[Side].GetRotation()).GetNormalized());
    }
    for (int32 Side=0; Side<2; ++Side)
    {
        const double SoleHeight=FVector::DotProduct(Out.Feet[Side].GetLocation()-GroundOrigin,GroundNormal);
        if (SoleHeight < FootSoleOffsetCm[Side]-.05)
            return Reject(Error,*FString::Printf(TEXT("Foot %d below measured sole: %.3f cm"),Side,
                SoleHeight-FootSoleOffsetCm[Side]));
    }
    if (!Out.bSupport[0] && !Out.bSupport[1])
        return Reject(Error,TEXT("Both authored feet are airborne"));
    Out.BodyDelta.AddToTranslation(NeutralBodyOffsetCm);
    return true;
}

bool FFlowFestStancePose::IsValid() const
{
    if (Components.Num()!=Parents.Num() || !Components.IsValidIndex(Hips)) return false;
    for (int32 I=0; I<Components.Num(); ++I)
        if (Components[I].ContainsNaN() || Parents[I]>=I || Parents[I]<INDEX_NONE) return false;
    for (int32 I=0; I<4; ++I)
        if (!Components.IsValidIndex(Upper[I]) || !Components.IsValidIndex(Middle[I]) ||
            !Components.IsValidIndex(End[I]) || Parents[Middle[I]]!=Upper[I] || Parents[End[I]]!=Middle[I]) return false;
    return true;
}

bool FFlowFestStancePlan::Capture(const FPoseContext& Input, FFlowFestStancePose& Out)
{
    Out={};
    const auto& Container=Input.Pose.GetBoneContainer();
    const USkeleton* Skeleton=Container.GetSkeletonAsset();
    if (!Skeleton) return false;
    const auto& Ref=Skeleton->GetReferenceSkeleton();
    const auto Index=[&](const TCHAR* Name)
    {
        const int32 SkeletonIndex=Ref.FindBoneIndex(Name);
        return SkeletonIndex==INDEX_NONE ? INDEX_NONE : Container.GetCompactPoseIndexFromSkeletonIndex(SkeletonIndex).GetInt();
    };
    Out.Hips=Index(TEXT("Hips"));
    const TCHAR* UpperNames[4]={TEXT("LeftUpLeg"),TEXT("RightUpLeg"),TEXT("LeftArm"),TEXT("RightArm")};
    const TCHAR* MiddleNames[4]={TEXT("LeftLeg"),TEXT("RightLeg"),TEXT("LeftForeArm"),TEXT("RightForeArm")};
    const TCHAR* EndNames[4]={TEXT("LeftFoot"),TEXT("RightFoot"),TEXT("LeftHand"),TEXT("RightHand")};
    for (int32 I=0; I<4; ++I) { Out.Upper[I]=Index(UpperNames[I]); Out.Middle[I]=Index(MiddleNames[I]); Out.End[I]=Index(EndNames[I]); }
    FCSPose<FCompactPose> Component; Component.InitPose(Input.Pose);
    for (const FCompactPoseBoneIndex I : Input.Pose.ForEachBoneIndex())
    {
        Out.Components.Add(Component.GetComponentSpaceTransform(I));
        Out.Parents.Add(Container.GetParentBoneIndex(I).GetInt());
    }
    return Out.IsValid();
}

bool FFlowFestStancePlan::Apply(const FFlowFestStancePose& Input,
    const FFlowFestStanceSample& Sample, FFlowFestStancePose& Out, FString* Error, bool bSolveArms)
{
    if (!Input.IsValid() || Sample.BodyDelta.ContainsNaN() ||
        !Sample.BodyDelta.GetScale3D().Equals(FVector::OneVector,1.e-8) ||
        Sample.Feet[0].ContainsNaN() || Sample.Feet[1].ContainsNaN() ||
        (!Sample.bSupport[0] && !Sample.bSupport[1])) return Reject(Error, TEXT("Invalid rigid support sample"));
    const auto& Before=Input.Components;
    TArray<FTransform> After;
    After.Reserve(Before.Num());
    for (const FTransform& Transform : Before) After.Add(Transform*Sample.BodyDelta);
    for (int32 Chain=0; Chain<(bSolveArms ? 4 : 2); ++Chain)
    {
        const int32 U=Input.Upper[Chain], M=Input.Middle[Chain], E=Input.End[Chain];
        const FTransform Target=Chain<2 ? Sample.Feet[Chain] : Before[E];
        const double L1=FVector::Dist(Before[U].GetLocation(),Before[M].GetLocation());
        const double L2=FVector::Dist(Before[M].GetLocation(),Before[E].GetLocation());
        const double D=FVector::Dist(After[U].GetLocation(),Target.GetLocation());
        if (!FMath::IsFinite(D) || L1<1. || L2<1. || D>L1+L2+1.e-5 || D<FMath::Abs(L1-L2)+1.e-4)
            return Reject(Error, Chain<2 ? TEXT("Planted foot outside exact leg reach") : TEXT("Authored hand outside exact arm reach"));
        FTransform SolvedUpper=After[U], SolvedMiddle=After[M], SolvedEnd=After[E];
        const FVector Axis=(Target.GetLocation()-SolvedUpper.GetLocation()).GetSafeNormal();
        FVector Bend=SolvedMiddle.GetLocation()-SolvedUpper.GetLocation();
        Bend-=Axis*FVector::DotProduct(Bend,Axis);
        if (!Bend.Normalize()) return Reject(Error, TEXT("Degenerate limb bend plane"));
        AnimationCore::SolveTwoBoneIK(SolvedUpper,SolvedMiddle,SolvedEnd,
            SolvedUpper.GetLocation()+Bend*(L1+L2),Target.GetLocation(),false,1.,1.);
        SolvedEnd=Target;
        if (FMath::Abs(FVector::Dist(SolvedUpper.GetLocation(),SolvedMiddle.GetLocation())-L1)>.001 ||
            FMath::Abs(FVector::Dist(SolvedMiddle.GetLocation(),SolvedEnd.GetLocation())-L2)>.001)
            return Reject(Error, TEXT("Exact limb length validation failed"));
        After[U]=SolvedUpper; After[M]=SolvedMiddle; After[E]=SolvedEnd;

        for (int32 I=0; I<Before.Num(); ++I)
        {
            if (I==E) continue;
            int32 Ancestor=Input.Parents[I];
            while (Ancestor!=INDEX_NONE && Ancestor!=E) Ancestor=Input.Parents[Ancestor];
            if (Ancestor==E) After[I]=Before[I].GetRelativeTransform(Before[E])*SolvedEnd;
        }
    }
    Out=Input;
    Out.Components=MoveTemp(After);
    return true;
}

bool FFlowFestStancePlan::Apply(FPoseContext& Output, const FFlowFestStanceSample& Sample, FString* Error, bool bSolveArms)
{
    FFlowFestStancePose Before, After;
    if (!Capture(Output,Before)) return Reject(Error,TEXT("Missing complete stance skeleton"));
    if (!Apply(Before,Sample,After,Error,bSolveArms)) return false;
    FCSPose<FCompactPose> Result; Result.InitPose(Output.Pose);
    for (int32 I=0; I<After.Components.Num(); ++I)
        Result.SetComponentSpaceTransform(FCompactPoseBoneIndex(I),After.Components[I]);
    FCSPose<FCompactPose>::ConvertComponentPosesToLocalPosesSafe(Result,Output.Pose);
    return true;
}
