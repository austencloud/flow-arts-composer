#include "FlowFestPreparedMotion.h"

#include "Async/Async.h"
#include "Misc/ScopeLock.h"

namespace
{
bool ExactVector(const FVector& A, const FVector& B)
{
    return A.X == B.X && A.Y == B.Y && A.Z == B.Z;
}

bool ExactQuat(const FQuat& A, const FQuat& B)
{
    return A.X == B.X && A.Y == B.Y && A.Z == B.Z && A.W == B.W;
}

bool ExactTransform(const FTransform& A, const FTransform& B)
{
    return ExactVector(A.GetTranslation(), B.GetTranslation()) &&
        ExactVector(A.GetScale3D(), B.GetScale3D()) &&
        ExactQuat(A.GetRotation(), B.GetRotation());
}

bool ExactCapsules(const TArray<FFlowArtsClearanceCapsule>& A,
    const TArray<FFlowArtsClearanceCapsule>& B)
{
    if (A.Num() != B.Num()) return false;
    for (int32 Index = 0; Index < A.Num(); ++Index)
        if (!ExactVector(A[Index].Start, B[Index].Start) ||
            !ExactVector(A[Index].End, B[Index].End) ||
            A[Index].RadiusCm != B[Index].RadiusCm) return false;
    return true;
}

bool ExactCalibration(const FFlowFestGripCalibration& A, const FFlowFestGripCalibration& B)
{
    return A.bValid == B.bValid && ExactVector(A.Longitudinal, B.Longitudinal) &&
        ExactVector(A.PalmNormal, B.PalmNormal) && ExactVector(A.Transverse, B.Transverse) &&
        ExactVector(A.Fallback, B.Fallback);
}
}

bool FFlowFestPreparedMotionKey::Equals(const FFlowFestPreparedMotionKey& Other) const
{
    if (Payload != Other.Payload || MotionIdentity != Other.MotionIdentity ||
        MotionClipIncarnation != Other.MotionClipIncarnation ||
        PropTrackIdentity != Other.PropTrackIdentity ||
        PropId != Other.PropId || Mesh != Other.Mesh ||
        Skin.Get() != Other.Skin.Get() || Policy != Other.Policy ||
        !ExactTransform(MeshPresentation, Other.MeshPresentation) ||
        !ExactVector(WorldScale, Other.WorldScale) ||
        !ExactVector(GroundOrigin, Other.GroundOrigin) ||
        !ExactVector(GroundNormal, Other.GroundNormal) ||
        !ExactVector(PatternNormal, Other.PatternNormal)) return false;
    for (int32 Turn = 0; Turn < 2; ++Turn)
        if (TurnClips[Turn] != Other.TurnClips[Turn] ||
            TurnClipIncarnation[Turn] != Other.TurnClipIncarnation[Turn] ||
            TurnContent[Turn] != Other.TurnContent[Turn] ||
            TurnDuration[Turn] != Other.TurnDuration[Turn] ||
            TurnHeading[Turn] != Other.TurnHeading[Turn] ||
            SwingStart[Turn][0] != Other.SwingStart[Turn][0] ||
            SwingStart[Turn][1] != Other.SwingStart[Turn][1] ||
            SwingEnd[Turn][0] != Other.SwingEnd[Turn][0] ||
            SwingEnd[Turn][1] != Other.SwingEnd[Turn][1] ||
            TurnFrameCount[Turn] != Other.TurnFrameCount[Turn] ||
            FootSoleOffsetCm[Turn] != Other.FootSoleOffsetCm[Turn]) return false;
    for (int32 Side = 0; Side < 2; ++Side)
        if (!ExactVector(PalmLocal[Side], Other.PalmLocal[Side]) ||
            !ExactCalibration(GripCalibration[Side], Other.GripCalibration[Side]) ||
            !ExactCapsules(LocalProps[Side], Other.LocalProps[Side])) return false;
    return true;
}

bool FFlowFestPreparedMotionPhase::Bracket(double Seconds, double Duration, int32 Count,
    bool bLoop, int32& A, int32& B, float& Alpha)
{
    A = B = 0;
    Alpha = 0.f;
    if (!FMath::IsFinite(Seconds) || !FMath::IsFinite(Duration) || Duration <= 0.0 ||
        Count < 2 || Count > FFlowFestPreparedMotionCache::MaxKnots) return false;
    const double Safe = bLoop
        ? FMath::Fmod(FMath::Fmod(Seconds, Duration) + Duration, Duration)
        : FMath::Clamp(Seconds, 0.0, Duration);
    const double Position = Safe * (bLoop ? Count : Count - 1) / Duration;
    A = FMath::Min(FMath::FloorToInt(Position), Count - 1);
    B = bLoop ? (A + 1) % Count : FMath::Min(A + 1, Count - 1);
    Alpha = A == B ? 0.f : static_cast<float>(FMath::Clamp(Position - A, 0.0, 1.0));
    return true;
}

double FFlowFestPreparedMotionPhase::KnotSeconds(int32 Index, double Duration, int32 Count, bool bLoop)
{
    if (Index < 0 || Index >= Count || Count < 2 || !FMath::IsFinite(Duration) || Duration <= 0.0)
        return 0.0;
    return Duration * Index / (bLoop ? Count : Count - 1);
}

bool FFlowFestPreparedMotionPhase::NeutralWindowCovers(double Seconds, double Duration,
    double OutwardStart, double NeutralStart, double RequiredSeconds)
{
    if (!FMath::IsFinite(Seconds) || !FMath::IsFinite(Duration) ||
        !FMath::IsFinite(OutwardStart) || !FMath::IsFinite(NeutralStart) ||
        !FMath::IsFinite(RequiredSeconds) || Duration <= 0. || RequiredSeconds < 0. ||
        OutwardStart < 0. || OutwardStart >= Duration ||
        NeutralStart <= OutwardStart || NeutralStart >= OutwardStart + Duration)
        return false;
    double Phase = FMath::Fmod(Seconds - OutwardStart, Duration);
    if (Phase < 0.) Phase += Duration;
    return Phase >= NeutralStart - OutwardStart - 1.e-6 &&
        Phase + RequiredSeconds <= Duration - 1.e-6;
}

bool FFlowFestPreparedMotionPhase::Continuous(
    const FFlowArtsArmClearancePreparedSeed& A,
    const FFlowArtsArmClearancePreparedSeed& B, double IntervalSeconds, int32 Fps)
{
    if (!A.bValid || !B.bValid || !A.bAbsoluteControls || !B.bAbsoluteControls ||
        !FMath::IsFinite(IntervalSeconds) || IntervalSeconds <= 0.0 || Fps <= 0) return false;
    const double Frames = IntervalSeconds * Fps;
    // Admission limits are rates between certified samples. Runtime still
    // performs a fresh clearance certificate at every interpolated pose.
    if (FMath::RadiansToDegrees(A.TorsoRotation.AngularDistance(B.TorsoRotation)) >
        12.0 * Frames) return false;
    for (int32 Side = 0; Side < 2; ++Side)
    {
        if (FVector::Dist(A.HandTranslationCm[Side], B.HandTranslationCm[Side]) > 10.0 * Frames ||
            FVector::Dist(A.SolvedElbows[Side], B.SolvedElbows[Side]) > 10.0 * Frames ||
            FMath::Abs(A.ClavicleProtractionDeg[Side] - B.ClavicleProtractionDeg[Side]) >
                12.0 * Frames) return false;
        const FVector PoleA = A.ElbowPole[Side].GetSafeNormal();
        const FVector PoleB = B.ElbowPole[Side].GetSafeNormal();
        if (PoleA.IsNearlyZero() || PoleB.IsNearlyZero() ||
            FMath::RadiansToDegrees(FMath::Acos(FMath::Clamp(
                FVector::DotProduct(PoleA, PoleB), -1.0, 1.0))) > 20.0 * Frames) return false;
    }
    return true;
}

struct FFlowFestPreparedMotionCacheState
{
    FCriticalSection Mutex;
    TArray<TSharedPtr<FFlowFestPreparedMotionEntry, ESPMode::ThreadSafe>> Entries;
    int32 CaptureOutstanding = 0;
    int32 LegacyCaptureReservations = 0;
    int32 Outstanding = 0;
    int32 ActiveWorkCount() const
    {
        // A legacy claim reserves its worker slot before its pose is copied.
        return CaptureOutstanding + Outstanding - LegacyCaptureReservations;
    }
};

FFlowFestPreparedMotionEntry::FFlowFestPreparedMotionEntry(
    TWeakPtr<FFlowFestPreparedMotionCacheState, ESPMode::ThreadSafe> InState,
    FFlowFestPreparedMotionKey InKey, int32 InCount, double InDuration, bool bInLoop,
    bool bInFullFrameCoverage)
    : State(MoveTemp(InState)), Key(MoveTemp(InKey)), Duration(InDuration), bLoop(bInLoop),
      bFullFrameCoverage(bInFullFrameCoverage)
{
    Seeds.SetNum(InCount);
    if (Key.Policy == 2)
    {
        StanceKnots.SetNum(2 * InCount);
        StanceCaptureStates.Init(0, 2 * InCount);
        for (int32 Turn = 0; Turn < 2; ++Turn)
        {
            CapturedTurns[Turn].Duration = Key.TurnDuration[Turn];
            CapturedTurns[Turn].HeadingDegrees = Key.TurnHeading[Turn];
            CapturedTurns[Turn].SwingStart[0] = Key.SwingStart[Turn][0];
            CapturedTurns[Turn].SwingStart[1] = Key.SwingStart[Turn][1];
            CapturedTurns[Turn].SwingEnd[0] = Key.SwingEnd[Turn][0];
            CapturedTurns[Turn].SwingEnd[1] = Key.SwingEnd[Turn][1];
            CapturedTurns[Turn].Frames.SetNum(Key.TurnFrameCount[Turn]);
            TurnCaptureStates[Turn].Init(0, Key.TurnFrameCount[Turn]);
        }
    }
    else
    {
        KnotStates.Init(0, InCount);
        IntervalStates.Init(0, bLoop ? InCount : InCount - 1);
        KnotSubmitted.Init(0, InCount);
        IntervalSubmitted.Init(0, bLoop ? InCount : InCount - 1);
    }
}

bool FFlowFestPreparedMotionEntry::ClaimStanceCapture(int32& Index, double& Seconds)
{
    const auto Owner = State.Pin();
    if (!Owner) return false;
    FScopeLock Lock(&Owner->Mutex);
    if (Key.Policy != 2 || bFailed || bCancelled || StancePlanState != 0 ||
        Owner->CaptureOutstanding >= 2 || Owner->ActiveWorkCount() >= 2) return false;
    for (int32 Candidate = 0; Candidate < StanceCaptureStates.Num(); ++Candidate)
        if (StanceCaptureStates[Candidate] == 0)
        {
            StanceCaptureStates[Candidate] = 1;
            ++Owner->CaptureOutstanding;
            Index = Candidate;
            Seconds = Duration * Candidate / StanceCaptureStates.Num();
            return true;
        }
    return false;
}

void FFlowFestPreparedMotionEntry::CompleteStanceCapture(int32 Index, FFlowFestStanceKnot&& Knot)
{
    const auto Owner = State.Pin();
    if (!Owner) return;
    FScopeLock Lock(&Owner->Mutex);
    if (!StanceCaptureStates.IsValidIndex(Index) || StanceCaptureStates[Index] != 1) return;
    StanceCaptureStates[Index] = 2;
    --Owner->CaptureOutstanding;
    if (bCancelled || bFailed) return;
    if (!Knot.Pose.IsValid() || !Knot.Clearance.bValid ||
        Knot.Seconds != Duration * Index / StanceCaptureStates.Num())
    {
        bFailed = true;
        return;
    }
    StanceKnots[Index] = MoveTemp(Knot);
    ++CapturedStanceKnots;
}

void FFlowFestPreparedMotionEntry::FailStanceCapture(int32 Index)
{
    const auto Owner = State.Pin();
    if (!Owner) return;
    FScopeLock Lock(&Owner->Mutex);
    if (!StanceCaptureStates.IsValidIndex(Index) || StanceCaptureStates[Index] != 1) return;
    StanceCaptureStates[Index] = 3;
    --Owner->CaptureOutstanding;
    bFailed = true;
}

void FFlowFestPreparedMotionEntry::AbandonStanceCapture(int32 Index)
{
    const auto Owner = State.Pin();
    if (!Owner) return;
    FScopeLock Lock(&Owner->Mutex);
    if (!StanceCaptureStates.IsValidIndex(Index) || StanceCaptureStates[Index] != 1) return;
    StanceCaptureStates[Index] = 0;
    --Owner->CaptureOutstanding;
}

bool FFlowFestPreparedMotionEntry::ClaimTurnCapture(int32& Turn, int32& Index, double& Seconds)
{
    const auto Owner = State.Pin();
    if (!Owner) return false;
    FScopeLock Lock(&Owner->Mutex);
    if (Key.Policy != 2 || bFailed || bCancelled || StancePlanState != 0 ||
        Owner->CaptureOutstanding >= 2 || Owner->ActiveWorkCount() >= 2) return false;
    for (int32 Side = 0; Side < 2; ++Side)
        for (int32 Frame = 0; Frame < TurnCaptureStates[Side].Num(); ++Frame)
            if (TurnCaptureStates[Side][Frame] == 0)
            {
                TurnCaptureStates[Side][Frame] = 1;
                ++Owner->CaptureOutstanding;
                Turn = Side;
                Index = Frame;
                Seconds = Key.TurnDuration[Side] * Frame /
                    FMath::Max(1, Key.TurnFrameCount[Side] - 1);
                return true;
            }
    return false;
}

void FFlowFestPreparedMotionEntry::CompleteTurnCapture(int32 Turn, int32 Index,
    const FFlowFestStanceTurnFrame& Frame)
{
    const auto Owner = State.Pin();
    if (!Owner) return;
    FScopeLock Lock(&Owner->Mutex);
    if (Turn < 0 || Turn >= 2 || !TurnCaptureStates[Turn].IsValidIndex(Index) ||
        TurnCaptureStates[Turn][Index] != 1) return;
    TurnCaptureStates[Turn][Index] = 2;
    --Owner->CaptureOutstanding;
    if (bCancelled || bFailed) return;
    if (Frame.Seconds != Key.TurnDuration[Turn] * Index /
            FMath::Max(1, Key.TurnFrameCount[Turn] - 1) ||
        Frame.Hips.ContainsNaN() || Frame.Feet[0].ContainsNaN() ||
        Frame.Feet[1].ContainsNaN()) { bFailed = true; return; }
    CapturedTurns[Turn].Frames[Index] = Frame;
}

void FFlowFestPreparedMotionEntry::AbandonTurnCapture(int32 Turn, int32 Index, bool bCaptureFailed)
{
    const auto Owner = State.Pin();
    if (!Owner) return;
    FScopeLock Lock(&Owner->Mutex);
    if (Turn < 0 || Turn >= 2 || !TurnCaptureStates[Turn].IsValidIndex(Index) ||
        TurnCaptureStates[Turn][Index] != 1) return;
    TurnCaptureStates[Turn][Index] = bCaptureFailed ? 3 : 0;
    --Owner->CaptureOutstanding;
    if (bCaptureFailed) bFailed = true;
}

bool FFlowFestPreparedMotionEntry::ClaimStancePlan(TArray<FFlowFestStanceKnot>& OutKnots,
    FFlowFestStanceTurn (&OutTurns)[2])
{
    const auto Owner = State.Pin();
    if (!Owner) return false;
    FScopeLock Lock(&Owner->Mutex);
    if (Key.Policy != 2 || bFailed || bCancelled || StancePlanState != 0 ||
        CapturedStanceKnots != StanceCaptureStates.Num() ||
        Owner->Outstanding >= 2 || Owner->ActiveWorkCount() >= 2) return false;
    for (int32 Turn = 0; Turn < 2; ++Turn)
        for (uint8 CaptureState : TurnCaptureStates[Turn])
            if (CaptureState != 2) return false;
    StancePlanState = 1;
    ++Owner->Outstanding;
    OutKnots = MoveTemp(StanceKnots);
    for (int32 Turn = 0; Turn < 2; ++Turn)
        OutTurns[Turn] = MoveTemp(CapturedTurns[Turn]);
    StanceCaptureStates.Empty();
    TurnCaptureStates[0].Empty();
    TurnCaptureStates[1].Empty();
    return true;
}

void FFlowFestPreparedMotionEntry::CompleteStancePlan(bool bSuccess,
    FFlowFestStancePlan&& Plan, TArray<FFlowArtsArmClearancePreparedSeed>&& AcceptedSeeds)
{
    const auto Owner = State.Pin();
    if (!Owner) return;
    FScopeLock Lock(&Owner->Mutex);
    if (StancePlanState != 1) return;
    if (PausedStanceJob.IsValid()) PausedStanceJob.Reset();
    else Owner->Outstanding = FMath::Max(0, Owner->Outstanding - 1);
    if (bCancelled || bFailed) { StancePlanState = 4; return; }
    if (!bSuccess || AcceptedSeeds.Num() != Seeds.Num() || !Plan.IsValid())
    {
        StancePlanState = 4;
        bFailed = true;
        return;
    }
    StancePlan = MoveTemp(Plan);
    Seeds = MoveTemp(AcceptedSeeds);
    StancePlanState = 2;
}

struct FFlowFestStanceJob : TSharedFromThis<FFlowFestStanceJob, ESPMode::ThreadSafe>
{
    TWeakPtr<FFlowFestPreparedMotionEntry, ESPMode::ThreadSafe> Entry;
    TUniquePtr<FFlowFestStancePreparation> Preparation;
    double StartedAt = FPlatformTime::Seconds();
    int32 NextDiagnosticSecond = 5;

    void Dispatch()
    {
        const auto Self = AsShared();
        Async(EAsyncExecution::ThreadPool, [Self]()
        {
            const auto Current = Self->Entry.Pin();
            if (!Current) return;
            if (Current->IsFailed())
            {
                Current->FailStancePlan();
                return;
            }
            Self->Preparation->Step(0.05);
            const double Elapsed = FPlatformTime::Seconds() - Self->StartedAt;
            if (Elapsed >= Self->NextDiagnosticSecond)
            {
                UE_LOG(LogTemp, Display, TEXT("Stance worker after %.2fs: trial=%d knot=%d armCandidate=%d bestClear=%d failed=%d candidateReady=%d reason=%s"),
                    Elapsed, Self->Preparation->GetEvaluatedPlans(),
                    Self->Preparation->GetCurrentKnot(), Self->Preparation->GetCurrentArmCandidate(),
                    Self->Preparation->GetBestClearKnots(), Self->Preparation->IsFailed(),
                    Self->Preparation->IsCandidateReady(), *Self->Preparation->GetFailure());
                Self->NextDiagnosticSecond += 5;
            }
            if (Self->Preparation->IsReady())
                Current->CompleteStancePlan(true,
                    FFlowFestStancePlan(Self->Preparation->GetPlan()),
                    TArray<FFlowArtsArmClearancePreparedSeed>(Self->Preparation->GetSeeds()));
            else if (Self->Preparation->IsFailed())
            {
                UE_LOG(LogTemp, Display, TEXT("Stance worker failed after %.2fs: trial=%d bestClear=%d reason=%s"),
                    Elapsed, Self->Preparation->GetEvaluatedPlans(),
                    Self->Preparation->GetBestClearKnots(), *Self->Preparation->GetFailure());
                Current->FailStancePlan();
            }
            else if (!Current->ParkStanceJob(Self)) Self->Dispatch();
        });
    }
};

bool FFlowFestPreparedMotionEntry::ParkStanceJob(
    const TSharedRef<FFlowFestStanceJob, ESPMode::ThreadSafe>& Job)
{
    const auto Owner = State.Pin();
    if (!Owner) return true;
    FScopeLock Lock(&Owner->Mutex);
    if (bFailed || bCancelled || StancePlanState != 1)
    {
        if (StancePlanState == 1)
        {
            StancePlanState = 4;
            Owner->Outstanding = FMath::Max(0, Owner->Outstanding - 1);
        }
        return true;
    }
    if (Consumers > 0) return false;
    check(!PausedStanceJob.IsValid());
    PausedStanceJob = Job;
    Owner->Outstanding = FMath::Max(0, Owner->Outstanding - 1);
    return true;
}

void FFlowFestPreparedMotionEntry::SubmitStancePlan(FFlowFestStancePlan&& Prototype,
    TArray<FFlowFestStanceKnot>&& Knots, int32 SourceFps)
{
    const auto Job = MakeShared<FFlowFestStanceJob, ESPMode::ThreadSafe>();
    Job->Entry = AsShared();
    Job->Preparation = MakeUnique<FFlowFestStancePreparation>(
        MoveTemp(Prototype), MoveTemp(Knots), SourceFps);
    Job->Dispatch();
}

void FFlowFestPreparedMotionEntry::FailStancePlan()
{
    CompleteStancePlan(false, {}, {});
}

bool FFlowFestPreparedMotionEntry::ReadStanceCandidate(FFlowFestStancePlan& OutPlan) const
{
    const auto Owner = State.Pin();
    if (!Owner) return false;
    FScopeLock Lock(&Owner->Mutex);
    if (Key.Policy != 2 || bFailed || bCancelled || StancePlanState < 2 ||
        StancePlanState > 3) return false;
    OutPlan = StancePlan;
    return true;
}

bool FFlowFestPreparedMotionEntry::PublishStanceCandidate(bool bNativeSupportValid)
{
    const auto Owner = State.Pin();
    if (!Owner) return false;
    FScopeLock Lock(&Owner->Mutex);
    if (Key.Policy != 2 || bFailed || bCancelled || StancePlanState < 2 ||
        StancePlanState > 3 || !bNativeSupportValid) return false;
    StancePlanState = 3;
    return true;
}

bool FFlowFestPreparedMotionEntry::ReadStanceSample(double Seconds,
    FFlowFestStanceSample& Sample, FFlowArtsArmClearancePreparedSeed& A,
    FFlowArtsArmClearancePreparedSeed& B, float& Alpha) const
{
    const auto Owner = State.Pin();
    if (!Owner) return false;
    FScopeLock Lock(&Owner->Mutex);
    if (Key.Policy != 2 || bFailed || bCancelled || StancePlanState != 3) return false;
    int32 First, Second;
    if (!FFlowFestPreparedMotionPhase::Bracket(Seconds, Duration, Seeds.Num(), bLoop,
        First, Second, Alpha) || !StancePlan.Sample(Seconds, Sample)) return false;
    A = Seeds[First];
    B = Seeds[Second];
    return true;
}

bool FFlowFestPreparedMotionEntry::CanBeginStanceEntry(double Seconds, double RampSeconds) const
{
    const auto Owner = State.Pin();
    if (!Owner) return false;
    FScopeLock Lock(&Owner->Mutex);
    if (Key.Policy != 2 || bFailed || bCancelled || StancePlanState != 3 || Seeds.IsEmpty())
        return false;
    // Leave one source-frame margin so the last eased frame is still double support.
    return FFlowFestPreparedMotionPhase::NeutralWindowCovers(Seconds, Duration,
        StancePlan.Controls.StartSeconds,
        StancePlan.Controls.ReturnSeconds + StancePlan.Return.Duration,
        RampSeconds + Duration / Seeds.Num());
}

bool FFlowFestPreparedMotionEntry::ClaimNext(int32& Index, double& Seconds,
    FFlowArtsArmClearancePreparedSeed& Previous, bool& bHasPrevious)
{
    const auto Owner = State.Pin();
    if (!Owner) return false;
    FScopeLock Lock(&Owner->Mutex);
    if (bFailed || bCancelled || Accepted == Seeds.Num() ||
        Owner->CaptureOutstanding >= 2 || Owner->Outstanding >= 2 ||
        Owner->ActiveWorkCount() >= 2) return false;
    for (int32 Candidate = 0; Candidate < KnotStates.Num(); ++Candidate)
        if (KnotStates[Candidate] == 0)
        {
            // A track is prepared in phase order so its prior accepted numeric
            // coordinate can guide the next search. Other tracks can run in parallel.
            if (Candidate > 0 && KnotStates[Candidate - 1] != 2) return false;
            KnotStates[Candidate] = 1;
            ++Owner->CaptureOutstanding;
            ++Owner->LegacyCaptureReservations;
            ++Owner->Outstanding;
            Index = Candidate;
            Seconds = FFlowFestPreparedMotionPhase::KnotSeconds(Candidate, Duration, Seeds.Num(), bLoop);
            bHasPrevious = Candidate > 0;
            if (bHasPrevious) Previous = Seeds[Candidate - 1];
            return true;
        }
    return false;
}

bool FFlowFestPreparedMotionEntry::ClaimValidation(int32& Index, double& Seconds,
    double& IntervalSeconds,
    FFlowArtsArmClearancePreparedSeed& A, FFlowArtsArmClearancePreparedSeed& B)
{
    const auto Owner = State.Pin();
    if (!Owner) return false;
    FScopeLock Lock(&Owner->Mutex);
    if (bFailed || bCancelled || Accepted != Seeds.Num() ||
        Owner->CaptureOutstanding >= 2 || Owner->Outstanding >= 2 ||
        Owner->ActiveWorkCount() >= 2) return false;
    for (int32 Segment = 0; Segment < IntervalStates.Num(); ++Segment)
        if (IntervalStates[Segment] == 0)
        {
            IntervalStates[Segment] = 1;
            ++Owner->CaptureOutstanding;
            ++Owner->LegacyCaptureReservations;
            ++Owner->Outstanding;
            Index = Segment;
            const int32 Next = (Segment + 1) % Seeds.Num();
            const double Start = FFlowFestPreparedMotionPhase::KnotSeconds(
                Segment, Duration, Seeds.Num(), bLoop);
            const double End = Next == 0 ? Duration : FFlowFestPreparedMotionPhase::KnotSeconds(
                Next, Duration, Seeds.Num(), bLoop);
            Seconds = 0.5 * (Start + End);
            IntervalSeconds = End - Start;
            A = Seeds[Segment];
            B = Seeds[Next];
            return true;
        }
    return false;
}

void FFlowFestPreparedMotionEntry::Complete(int32 Index, bool bSuccess,
    FFlowArtsArmClearancePreparedSeed&& Seed)
{
    const auto Owner = State.Pin();
    if (!Owner) return;
    FScopeLock Lock(&Owner->Mutex);
    if (!KnotStates.IsValidIndex(Index) || KnotStates[Index] != 1) return;
    KnotStates[Index] = bSuccess ? 2 : 3;
    if (!KnotSubmitted[Index])
    {
        --Owner->CaptureOutstanding;
        --Owner->LegacyCaptureReservations;
    }
    KnotSubmitted[Index] = 0;
    if (PausedLegacyJob.IsValid()) PausedLegacyJob.Reset();
    else Owner->Outstanding = FMath::Max(0, Owner->Outstanding - 1);
    if (bCancelled || bFailed) return;
    if (!bSuccess || !Seed.bValid)
    {
        bFailed = true;
        return;
    }
    Seeds[Index] = MoveTemp(Seed);
    ++Accepted;
}

void FFlowFestPreparedMotionEntry::CompleteValidation(int32 Index, bool bSuccess)
{
    const auto Owner = State.Pin();
    if (!Owner) return;
    FScopeLock Lock(&Owner->Mutex);
    if (!IntervalStates.IsValidIndex(Index) || IntervalStates[Index] != 1) return;
    IntervalStates[Index] = bSuccess ? 2 : 3;
    if (!IntervalSubmitted[Index])
    {
        --Owner->CaptureOutstanding;
        --Owner->LegacyCaptureReservations;
    }
    IntervalSubmitted[Index] = 0;
    Owner->Outstanding = FMath::Max(0, Owner->Outstanding - 1);
    if (bCancelled || bFailed) return;
    if (!bSuccess) { bFailed = true; return; }
    ++ValidatedIntervals;
}

struct FFlowFestPreparedMotionJob : TSharedFromThis<FFlowFestPreparedMotionJob, ESPMode::ThreadSafe>
{
    TWeakPtr<FFlowFestPreparedMotionEntry, ESPMode::ThreadSafe> Entry;
    int32 Index = INDEX_NONE;
    TFunction<EFlowFestPreparationStep(FFlowArtsArmClearancePreparedSeed&)> Step;
    FFlowArtsArmClearancePreparedSeed Seed;

    void Dispatch()
    {
        const auto Self = AsShared();
        Async(EAsyncExecution::ThreadPool, [Self]()
        {
            const auto Current = Self->Entry.Pin();
            if (!Current) return;
            const EFlowFestPreparationStep Result = !Current->IsFailed() && Self->Step
                ? Self->Step(Self->Seed) : EFlowFestPreparationStep::Failed;
            if (Result == EFlowFestPreparationStep::Continue)
            {
                if (!Current->ParkLegacyJob(Self)) Self->Dispatch();
            }
            else
                Current->Complete(Self->Index,
                    Result == EFlowFestPreparationStep::Feasible, MoveTemp(Self->Seed));
        });
    }
};

bool FFlowFestPreparedMotionEntry::ParkLegacyJob(
    const TSharedRef<FFlowFestPreparedMotionJob, ESPMode::ThreadSafe>& Job)
{
    const auto Owner = State.Pin();
    if (!Owner) return true;
    FScopeLock Lock(&Owner->Mutex);
    if (!KnotStates.IsValidIndex(Job->Index) || KnotStates[Job->Index] != 1) return true;
    if (bFailed || bCancelled)
    {
        KnotStates[Job->Index] = 3;
        Owner->Outstanding = FMath::Max(0, Owner->Outstanding - 1);
        return true;
    }
    if (Consumers > 0) return false;
    check(!PausedLegacyJob.IsValid());
    PausedLegacyJob = Job;
    Owner->Outstanding = FMath::Max(0, Owner->Outstanding - 1);
    return true;
}

void FFlowFestPreparedMotionEntry::Submit(int32 Index,
    TFunction<EFlowFestPreparationStep(FFlowArtsArmClearancePreparedSeed&)>&& PrepareStep)
{
    const auto Owner = State.Pin();
    if (!Owner) return;
    {
        FScopeLock Lock(&Owner->Mutex);
        if (!KnotStates.IsValidIndex(Index) || KnotStates[Index] != 1 || KnotSubmitted[Index]) return;
        KnotSubmitted[Index] = 1;
        --Owner->CaptureOutstanding;
        --Owner->LegacyCaptureReservations;
    }
    const auto Job = MakeShared<FFlowFestPreparedMotionJob, ESPMode::ThreadSafe>();
    Job->Entry = AsShared();
    Job->Index = Index;
    Job->Step = MoveTemp(PrepareStep);
    Job->Dispatch();
}

void FFlowFestPreparedMotionEntry::SubmitValidation(int32 Index,
    TFunction<bool()>&& Validate)
{
    const auto Owner = State.Pin();
    if (!Owner) return;
    {
        FScopeLock Lock(&Owner->Mutex);
        if (!IntervalStates.IsValidIndex(Index) || IntervalStates[Index] != 1 || IntervalSubmitted[Index]) return;
        IntervalSubmitted[Index] = 1;
        --Owner->CaptureOutstanding;
        --Owner->LegacyCaptureReservations;
    }
    const auto Entry = AsShared();
    Async(EAsyncExecution::ThreadPool, [Entry, Index, Validate = MoveTemp(Validate)]() mutable
    {
        Entry->CompleteValidation(Index, !Entry->IsCancelled() && Validate && Validate());
    });
}

void FFlowFestPreparedMotionEntry::Fail(int32 Index)
{
    Complete(Index, false, {});
}

void FFlowFestPreparedMotionEntry::FailValidation(int32 Index)
{
    CompleteValidation(Index, false);
}

void FFlowFestPreparedMotionEntry::AbandonClaim(int32 Index, bool bValidation)
{
    const auto Owner = State.Pin();
    if (!Owner) return;
    FScopeLock Lock(&Owner->Mutex);
    TArray<uint8>& States = bValidation ? IntervalStates : KnotStates;
    TArray<uint8>& Submitted = bValidation ? IntervalSubmitted : KnotSubmitted;
    if (!States.IsValidIndex(Index) || States[Index] != 1 || Submitted[Index]) return;
    States[Index] = 0;
    --Owner->CaptureOutstanding;
    --Owner->LegacyCaptureReservations;
    Owner->Outstanding = FMath::Max(0, Owner->Outstanding - 1);
}

bool FFlowFestPreparedMotionEntry::ReadPair(double Seconds,
    FFlowArtsArmClearancePreparedSeed& A, FFlowArtsArmClearancePreparedSeed& B, float& Alpha) const
{
    const auto Owner = State.Pin();
    if (!Owner) return false;
    FScopeLock Lock(&Owner->Mutex);
    if (Key.Policy == 2 || bFailed || bCancelled || Accepted != Seeds.Num() ||
        ValidatedIntervals != IntervalStates.Num()) return false;
    int32 First, Second;
    if (!FFlowFestPreparedMotionPhase::Bracket(Seconds, Duration, Seeds.Num(), bLoop,
        First, Second, Alpha)) return false;
    A = Seeds[First];
    B = Seeds[Second];
    return true;
}

bool FFlowFestPreparedMotionEntry::IsFailed() const
{
    const auto Owner = State.Pin();
    if (!Owner) return true;
    FScopeLock Lock(&Owner->Mutex);
    return bFailed || bCancelled;
}

bool FFlowFestPreparedMotionEntry::IsReady() const
{
    const auto Owner = State.Pin();
    if (!Owner) return false;
    FScopeLock Lock(&Owner->Mutex);
    if (Key.Policy == 2) return !bFailed && !bCancelled && StancePlanState == 3;
    return !bFailed && !bCancelled && Accepted == Seeds.Num() &&
        ValidatedIntervals == IntervalStates.Num();
}

void FFlowFestPreparedMotionEntry::AddConsumer()
{
    const auto Owner = State.Pin();
    if (!Owner) return;
    {
        FScopeLock Lock(&Owner->Mutex);
        ++Consumers;
    }
    ResumePendingPreparation();
}

void FFlowFestPreparedMotionEntry::RemoveConsumer()
{
    const auto Owner = State.Pin();
    if (!Owner) return;
    FScopeLock Lock(&Owner->Mutex);
    if (Consumers <= 0) return;
    --Consumers;
}

void FFlowFestPreparedMotionEntry::ResumePendingPreparation()
{
    const auto Owner = State.Pin();
    if (!Owner) return;
    TSharedPtr<FFlowFestPreparedMotionJob, ESPMode::ThreadSafe> Legacy;
    TSharedPtr<FFlowFestStanceJob, ESPMode::ThreadSafe> Stance;
    {
        FScopeLock Lock(&Owner->Mutex);
        if (Consumers <= 0 || bCancelled || bFailed || Owner->Outstanding >= 2 ||
            Owner->ActiveWorkCount() >= 2) return;
        if (PausedLegacyJob.IsValid()) Legacy = MoveTemp(PausedLegacyJob);
        else if (PausedStanceJob.IsValid()) Stance = MoveTemp(PausedStanceJob);
        else return;
        ++Owner->Outstanding;
    }
    if (Legacy.IsValid()) Legacy->Dispatch();
    else Stance->Dispatch();
}

bool FFlowFestPreparedMotionEntry::CanEvictLocked() const
{
    if (Consumers > 0) return false;
    for (int32 Index = 0; Index < KnotStates.Num(); ++Index)
        if (KnotStates[Index] == 1 &&
            (!PausedLegacyJob.IsValid() || PausedLegacyJob->Index != Index)) return false;
    for (uint8 Claim : IntervalStates) if (Claim == 1) return false;
    for (uint8 Claim : StanceCaptureStates) if (Claim == 1) return false;
    for (const auto& States : TurnCaptureStates)
        for (uint8 Claim : States) if (Claim == 1) return false;
    if (StancePlanState == 1 && !PausedStanceJob.IsValid()) return false;
    return true;
}

bool FFlowFestPreparedMotionEntry::IsCancelled() const
{
    const auto Owner = State.Pin();
    if (!Owner) return true;
    FScopeLock Lock(&Owner->Mutex);
    return bCancelled;
}

#if WITH_DEV_AUTOMATION_TESTS
void FFlowFestPreparedMotionEntry::MarkFailedForTests()
{
    const auto Owner = State.Pin();
    if (!Owner) return;
    FScopeLock Lock(&Owner->Mutex);
    bFailed = true;
}
#endif

FFlowFestPreparedMotionProgress FFlowFestPreparedMotionEntry::ReadProgress() const
{
    FFlowFestPreparedMotionProgress Result;
    const auto Owner = State.Pin();
    if (!Owner) { Result.Stage = TEXT("cache-expired"); return Result; }
    FScopeLock Lock(&Owner->Mutex);
    Result.Policy = Key.Policy;
    Result.PlanState = StancePlanState;
    Result.TotalTurns = Key.TurnFrameCount[0] + Key.TurnFrameCount[1];
    Result.CapturedTurns = StancePlanState > 0 ? Result.TotalTurns : 0;
    bool bTurnClaimed = false;
    for (const auto& States : TurnCaptureStates)
        for (uint8 Capture : States)
        {
            Result.CapturedTurns += Capture == 2;
            bTurnClaimed |= Capture == 1;
        }
    Result.CapturedSource = CapturedStanceKnots;
    Result.TotalSource = Key.Policy == 2 ? Seeds.Num() * 2 : 0;
    Result.AcceptedLegacy = Accepted;
    Result.TotalLegacy = KnotStates.Num();
    Result.ValidatedLegacy = ValidatedIntervals;
    Result.TotalValidation = IntervalStates.Num();
    Result.GlobalActive = Owner->ActiveWorkCount();
    Result.GlobalCaptures = Owner->CaptureOutstanding;
    Result.GlobalWorkers = Owner->Outstanding;
    Result.Consumers = Consumers;
    Result.bFailed = bFailed || StancePlanState == 4;
    Result.bCancelled = bCancelled;
    Result.bReady = !bFailed && !bCancelled && (Key.Policy == 2 ? StancePlanState == 3 :
        Accepted == Seeds.Num() && ValidatedIntervals == IntervalStates.Num());
    if (Result.bCancelled) Result.Stage = TEXT("cancelled");
    else if (Result.bFailed) Result.Stage = TEXT("failed");
    else if (Result.bReady) Result.Stage = TEXT("ready");
    else if (Key.Policy == 2)
    {
        if (Result.CapturedTurns < Result.TotalTurns)
            Result.Stage = bTurnClaimed ? TEXT("turn-capture") : TEXT("turn-wait");
        else if (CapturedStanceKnots < StanceCaptureStates.Num())
        {
            const bool bClaimed = StanceCaptureStates.Contains(1);
            Result.Stage = bClaimed ? TEXT("source-capture") : TEXT("source-wait");
        }
        else if (StancePlanState == 0) Result.Stage = TEXT("stance-worker-wait");
        else if (StancePlanState == 1)
            Result.Stage = PausedStanceJob.IsValid() ? TEXT("stance-worker-parked") : TEXT("stance-worker");
        else Result.Stage = TEXT("native-ground-check");
    }
    else if (Accepted < Seeds.Num())
    {
        const int32 Claimed = KnotStates.Find(1);
        Result.Stage = Claimed == INDEX_NONE ? TEXT("legacy-wait") :
            KnotSubmitted.IsValidIndex(Claimed) && KnotSubmitted[Claimed] ?
                (PausedLegacyJob.IsValid() ? TEXT("legacy-worker-parked") : TEXT("legacy-worker")) :
                TEXT("legacy-capture");
    }
    else
    {
        const int32 Claimed = IntervalStates.Find(1);
        Result.Stage = Claimed == INDEX_NONE ? TEXT("validation-wait") :
            IntervalSubmitted.IsValidIndex(Claimed) && IntervalSubmitted[Claimed] ?
                TEXT("validation-worker") : TEXT("validation-capture");
    }
    return Result;
}

#if WITH_DEV_AUTOMATION_TESTS
FString FFlowFestPreparedMotionEntry::DescribeForTests() const
{
    const auto Progress = ReadProgress();
    return FString::Printf(TEXT("policy=%u legacy=%d/%d validation=%d/%d stance=%d/%d turns=%d/%d plan=%u outstanding=%d capture=%d workers=%d consumers=%d failed=%d cancelled=%d"),
        Progress.Policy, Progress.AcceptedLegacy, Progress.TotalLegacy,
        Progress.ValidatedLegacy, Progress.TotalValidation,
        Progress.CapturedSource, Progress.TotalSource, Progress.CapturedTurns,
        Progress.TotalTurns, Progress.PlanState, Progress.GlobalActive,
        Progress.GlobalCaptures, Progress.GlobalWorkers, Progress.Consumers,
        Progress.bFailed, Progress.bCancelled);
}

bool FFlowFestPreparedMotionEntry::ReadCapturedTurnFrameForTests(int32 Turn, int32 Index,
    FFlowFestStanceTurnFrame& OutFrame) const
{
    const auto Owner = State.Pin();
    if (!Owner || Turn < 0 || Turn >= 2) return false;
    FScopeLock Lock(&Owner->Mutex);
    if (!TurnCaptureStates[Turn].IsValidIndex(Index) || TurnCaptureStates[Turn][Index] != 2)
        return false;
    OutFrame = CapturedTurns[Turn].Frames[Index];
    return true;
}

bool FFlowFestPreparedMotionEntry::ReadCapturedStancePoseForTests(int32 Index,
    FFlowFestStancePose& OutPose) const
{
    const auto Owner = State.Pin();
    if (!Owner) return false;
    FScopeLock Lock(&Owner->Mutex);
    if (!StanceCaptureStates.IsValidIndex(Index) || StanceCaptureStates[Index] != 2)
        return false;
    OutPose = StanceKnots[Index].Pose;
    return true;
}
#endif

bool FFlowFestPreparedMotionEntry::Matches(const FFlowFestPreparedMotionKey& OtherKey,
    int32 Count, double OtherDuration, bool bOtherLoop, bool bOtherFullFrameCoverage) const
{
    return Key.Equals(OtherKey) && Seeds.Num() == Count && Duration == OtherDuration &&
        bLoop == bOtherLoop && bFullFrameCoverage == bOtherFullFrameCoverage;
}

FFlowFestPreparedMotionCache::FFlowFestPreparedMotionCache()
    : State(MakeShared<FFlowFestPreparedMotionCacheState, ESPMode::ThreadSafe>()) {}

FFlowFestPreparedMotionCache& FFlowFestPreparedMotionCache::Get()
{
    static FFlowFestPreparedMotionCache Cache;
    return Cache;
}

TSharedPtr<FFlowFestPreparedMotionEntry, ESPMode::ThreadSafe>
FFlowFestPreparedMotionCache::Acquire(const FFlowFestPreparedMotionKey& Key,
    int32 Count, double Duration, bool bLoop, bool bFullFrameCoverage)
{
    if (Key.Payload.IsNone() || !Key.Mesh || !Key.Skin.IsValid() || !bFullFrameCoverage ||
        Count < 2 || Count > MaxKnots ||
        (Key.Policy == 2 && (!bLoop || 2 * Count > FFlowFestStancePreparation::MaxKnots ||
            !Key.TurnClips[0] || !Key.TurnClips[1] || Key.TurnContent[0].IsEmpty() ||
            Key.TurnContent[1].IsEmpty() || Key.TurnFrameCount[0] < 2 ||
            Key.TurnFrameCount[1] < 2 || Key.TurnFrameCount[0] > 120 ||
            Key.TurnFrameCount[1] > 120)) ||
        !FMath::IsFinite(Duration) || Duration <= 0.0)
        return nullptr;
    FScopeLock Lock(&State->Mutex);
    for (int32 Index = 0; Index < State->Entries.Num(); ++Index)
    {
        const auto Existing = State->Entries[Index];
        if (Existing->Matches(Key, Count, Duration, bLoop, bFullFrameCoverage))
        {
            if (Existing->bCancelled)
            {
                State->Entries.RemoveAt(Index);
                break;
            }
            if (Index != State->Entries.Num() - 1)
            {
                State->Entries.RemoveAt(Index);
                State->Entries.Add(Existing);
            }
            return Existing;
        }
    }
    if (State->Entries.Num() >= MaxEntries)
    {
        int32 Victim = INDEX_NONE;
        for (int32 Index = 0; Index < State->Entries.Num(); ++Index)
            if (State->Entries[Index]->CanEvictLocked())
            {
                Victim = Index;
                break;
            }
        // Keep an active preparation intact when a crowd introduces more
        // variants than the cache can retain. The new variant tries later.
        if (Victim == INDEX_NONE) return nullptr;
        // A dormant partial track may be evicted under the fixed entry bound.
        // Complete and failed handles remain immutable even after eviction.
        auto& Evicted = State->Entries[Victim];
        const bool bComplete = Evicted->Key.Policy == 2 ? Evicted->StancePlanState == 3 :
            (Evicted->Accepted == Evicted->Seeds.Num() &&
                Evicted->ValidatedIntervals == Evicted->IntervalStates.Num());
        if (!bComplete && !Evicted->bFailed)
        {
            Evicted->bCancelled = true;
            Evicted->PausedLegacyJob.Reset();
            Evicted->PausedStanceJob.Reset();
        }
        State->Entries.RemoveAt(Victim);
    }
    const auto Entry = MakeShared<FFlowFestPreparedMotionEntry, ESPMode::ThreadSafe>(
        TWeakPtr<FFlowFestPreparedMotionCacheState, ESPMode::ThreadSafe>(State), Key,
        Count, Duration, bLoop, bFullFrameCoverage);
    State->Entries.Add(Entry);
    return Entry;
}

#if WITH_DEV_AUTOMATION_TESTS
int32 FFlowFestPreparedMotionCache::GetOutstandingForTests() const
{
    FScopeLock Lock(&State->Mutex);
    return State->ActiveWorkCount();
}

int32 FFlowFestPreparedMotionCache::GetCaptureOutstandingForTests() const
{
    FScopeLock Lock(&State->Mutex);
    return State->CaptureOutstanding;
}
#endif
