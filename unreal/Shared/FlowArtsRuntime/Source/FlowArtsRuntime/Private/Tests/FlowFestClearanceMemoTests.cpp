#if WITH_DEV_AUTOMATION_TESTS
#include "FlowFestAnimInstance.h"
#include "FlowFestPropComponent.h"
#include "Components/SceneComponent.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "HAL/PlatformProcess.h"
#include "HAL/ThreadSafeCounter.h"
#include "Misc/AutomationTest.h"
#include "UObject/Package.h"
#include "UObject/UObjectGlobals.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestClearanceMemoTest,
    "FlowArts.Runtime.ClearanceExactMemo",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowFestClearanceMemoTest::RunTest(const FString& Parameters)
{
    // Earlier runtime tests destroy their performers while preparation may be
    // active. Those orphaned workers must relinquish the shared production slots.
    auto& SharedCache = FFlowFestPreparedMotionCache::Get();
    const double DrainDeadline = FPlatformTime::Seconds() + 2.0;
    while (SharedCache.GetOutstandingForTests() != 0 && FPlatformTime::Seconds() < DrainDeadline)
        FPlatformProcess::Sleep(0.01f);
    TestEqual(TEXT("Destroyed performers release shared preparation workers"),
        SharedCache.GetOutstandingForTests(), 0);
    FFlowFestPreparedMotionCache IsolatedCache;
    FFlowFestClearanceMemoKey Original;
    Original.LocalPose.Add(FTransform::Identity);
    Original.LocalPose.Add(FTransform(FQuat(FVector::UpVector, .3), FVector(2, 3, 4), FVector(100)));
    Original.SkeletonIndices = {0, 5};
    Original.Props[0].Add({FVector(1, 2, 3), FVector(4, 5, 6), 1.6f});
    Original.Generation = 17;
    Original.Flags = 7;
    TestTrue(TEXT("Identical repeated evaluated input can reuse its certificate"), Original.Equals(Original));
    auto Changed = Original;
    TestTrue(TEXT("An independent exact copy matches"), Original.Equals(Changed));
    Changed.LocalPose[1].AddToTranslation(FVector(1.e-10, 0, 0));
    TestFalse(TEXT("Sub-tolerance source movement must invalidate"), Original.Equals(Changed));
    Changed = Original;
    Changed.LocalPose[0].SetRotation(FQuat(FVector::RightVector, 1.e-10));
    TestFalse(TEXT("Even tiny bone rotation invalidates"), Original.Equals(Changed));
    Changed = Original;
    Changed.LocalPose[0].SetScale3D(FVector(1, 1, 1.0000000001));
    TestFalse(TEXT("Bone scale invalidates"), Original.Equals(Changed));
    Changed = Original;
    Changed.ComponentToWorldScale.Z += .000001;
    TestFalse(TEXT("World scale changes correction bounds and invalidates"), Original.Equals(Changed));
    Changed = Original;
    Changed.SkeletonIndices[1] = 6;
    TestFalse(TEXT("Same-size compact bone remapping invalidates"), Original.Equals(Changed));
    Changed = Original;
    Changed.Props[0][0].End.Z += .01;
    TestFalse(TEXT("Prop endpoint invalidates"), Original.Equals(Changed));
    Changed = Original;
    Changed.Props[0][0].RadiusCm += .01f;
    TestFalse(TEXT("Prop radius invalidates"), Original.Equals(Changed));
    Changed = Original;
    Changed.Props[1] = Changed.Props[0];
    TestFalse(TEXT("Opposite prop presence invalidates"), Original.Equals(Changed));
    for (uint8 Flag : {uint8(1), uint8(2), uint8(4)})
    {
        Changed = Original;
        Changed.Flags ^= Flag;
        TestFalse(TEXT("Every solver policy invalidates"), Original.Equals(Changed));
    }
    Changed = Original;
    ++Changed.Generation;
    TestFalse(TEXT("Seek/reset generation invalidates even an identical pose"), Original.Equals(Changed));
    Changed = Original;
    Changed.Skeleton = GetTransientPackage();
    TestFalse(TEXT("Skeleton identity invalidates"), Original.Equals(Changed));
    Changed = Original;
    Changed.Mesh = GetTransientPackage();
    TestFalse(TEXT("Rig mesh identity invalidates"), Original.Equals(Changed));

    FFlowArtsArmClearanceHistory Before, After;
    TestTrue(TEXT("Unchanged temporal response is settled"),
        FFlowFestAnimProxy::IsClearanceResponseSettled(Before, After, FVector::OneVector));
    After.ContactHandTranslationCm[0].X = .001;
    TestFalse(TEXT("An active identical pose must continue moving toward clearance"),
        FFlowFestAnimProxy::IsClearanceResponseSettled(Before, After, FVector::OneVector));
    After = Before;
    After.ContactTorsoRotationVector.Y = .001;
    TestFalse(TEXT("An active identical pose must continue its torso response"),
        FFlowFestAnimProxy::IsClearanceResponseSettled(Before, After, FVector::OneVector));
    After = Before;
    After.ContactElbowAngleRadians[1] = .001;
    TestFalse(TEXT("An active identical pose must continue its elbow response"),
        FFlowFestAnimProxy::IsClearanceResponseSettled(Before, After, FVector::OneVector));
    After = Before;
    After.ContactHandTranslationCm[1].Z = .00005;
    TestTrue(TEXT("Sub-micron hand change is settled at unit scale"),
        FFlowFestAnimProxy::IsClearanceResponseSettled(Before, After, FVector::OneVector));
    TestFalse(TEXT("Convergence is measured in world centimeters"),
        FFlowFestAnimProxy::IsClearanceResponseSettled(Before, After, FVector(10)));

    FVector DisplayedArms[4] = {};
    FFlowArtsArmClearancePreparedSeed StanceEntry;
    StanceEntry.bValid = true;
    StanceEntry.TorsoRotation = FQuat(FVector::RightVector, FMath::DegreesToRadians(15.));
    TestFalse(TEXT("A neutral body sample cannot introduce the planned fifteen-degree torso lean in one frame"),
        FFlowFestAnimProxy::IsStanceEntryContinuous(DisplayedArms, FQuat::Identity,
            StanceEntry, 1.f / 60.f));
    StanceEntry.TorsoRotation = FQuat(FVector::RightVector, FMath::DegreesToRadians(.5));
    TestTrue(TEXT("A subdegree advancing correction can enter the prepared track"),
        FFlowFestAnimProxy::IsStanceEntryContinuous(DisplayedArms, FQuat::Identity,
            StanceEntry, 1.f / 60.f));
    StanceEntry.SolvedElbows[0].X = .51;
    TestFalse(TEXT("An abrupt elbow branch cannot enter with an otherwise smooth torso"),
        FFlowFestAnimProxy::IsStanceEntryContinuous(DisplayedArms, FQuat::Identity,
            StanceEntry, 1.f / 60.f));
    double PreviousProgress = 0.;
    double MaxOneFrameCorrectionDegrees = 0.;
    for (int32 Frame = 1; Frame <= 15; ++Frame)
    {
        const double Progress = FFlowFestAnimProxy::StanceEntryProgress(Frame / 60., 0., 5.);
        MaxOneFrameCorrectionDegrees = FMath::Max(MaxOneFrameCorrectionDegrees,
            15. * (Progress - PreviousProgress));
        PreviousProgress = Progress;
    }
    TestTrue(TEXT("Fifteen-degree entry eases over a quarter second without an angular snap"),
        MaxOneFrameCorrectionDegrees <= 1.55 && FMath::IsNearlyEqual(PreviousProgress, 1., 1.e-6));
    const double PausedProgress = FFlowFestAnimProxy::StanceEntryProgress(.1, 0., 5.);
    TestTrue(TEXT("Entry advances only with the shared performance clock"),
        PausedProgress > 0. && PausedProgress <
        FFlowFestAnimProxy::StanceEntryProgress(.15, 0., 5.));
    TestTrue(TEXT("Entry follows a continuous phase across the cyclic seam"),
        FMath::IsNearlyEqual(FFlowFestAnimProxy::StanceEntryProgress(.1, 4.9, 5.),
            FFlowFestAnimProxy::StanceEntryProgress(5.1, 4.9, 5.), 1.e-6));
    TestTrue(TEXT("A full quarter-second entry fits after the return turn"),
        FFlowFestPreparedMotionPhase::NeutralWindowCovers(4.6, 5., 1., 4., .3));
    TestTrue(TEXT("Neutral entry may cross the clip seam before the next outward turn"),
        FFlowFestPreparedMotionPhase::NeutralWindowCovers(.6, 5., 1., 4., .3));
    TestFalse(TEXT("Entry waits when the outward turn would start before the ease completes"),
        FFlowFestPreparedMotionPhase::NeutralWindowCovers(.75, 5., 1., 4., .3));
    TestFalse(TEXT("A frame in the outward turn cannot begin entry"),
        FFlowFestPreparedMotionPhase::NeutralWindowCovers(1.05, 5., 1., 4., .3));

    FFlowFestPreparedMotionKey Prep;
    Prep.Payload = TEXT("validated-motion-a");
    Prep.PropId = TEXT("staff");
    Prep.Mesh = GetTransientPackage();
    Prep.LocalProps[0].Add({FVector(1, 2, 3), FVector(4, 5, 6), 1.5f});
    Prep.GripCalibration[0].bValid = true;
    Prep.GripCalibration[0].PalmNormal = FVector::UpVector;
    Prep.Policy = 1;
    auto ChangedPrep = Prep;
    TestTrue(TEXT("Shared prepared motion accepts exact copied inputs"), Prep.Equals(ChangedPrep));
    ChangedPrep.WorldScale.Z += .000001;
    TestFalse(TEXT("Changed world scale cannot reuse a prepared track"), Prep.Equals(ChangedPrep));
    ChangedPrep = Prep;
    ChangedPrep.LocalProps[0][0].RadiusCm += .01f;
    TestFalse(TEXT("Changed prop collision geometry cannot reuse a prepared track"), Prep.Equals(ChangedPrep));
    ChangedPrep = Prep;
    ChangedPrep.GripCalibration[0].PalmNormal.X += .01;
    TestFalse(TEXT("Changed palm calibration cannot reuse a prepared track"), Prep.Equals(ChangedPrep));
    ChangedPrep = Prep;
    ChangedPrep.Payload = TEXT("validated-motion-b");
    TestFalse(TEXT("Different imported motion cannot reuse a prepared track"), Prep.Equals(ChangedPrep));
    ChangedPrep = Prep;
    ChangedPrep.PropTrackIdentity = TEXT("reimported-prop-sidecar");
    TestFalse(TEXT("Changed native prop trajectory cannot reuse a prepared track"), Prep.Equals(ChangedPrep));
    USceneComponent* FirstClip = NewObject<USceneComponent>(GetTransientPackage());
    USceneComponent* ReloadedClip = NewObject<USceneComponent>(GetTransientPackage());
    Prep.MotionIdentity = TEXT("/Game/FlowFest/SameCookedClip:480:30:1");
    Prep.MotionClipIncarnation = FObjectKey(FirstClip);
    ChangedPrep = Prep;
    ChangedPrep.MotionClipIncarnation = FObjectKey(ReloadedClip);
    TestFalse(TEXT("A dormant cooked track cannot be reused by a new clip incarnation"),
        Prep.Equals(ChangedPrep));
    ChangedPrep = Prep;
    ChangedPrep.Policy = 2;
    TestFalse(TEXT("Changed solver policy cannot reuse a prepared track"), Prep.Equals(ChangedPrep));

    int32 First = INDEX_NONE, Second = INDEX_NONE;
    float Fraction = -1.f;
    TestTrue(TEXT("A loop can bracket its final interval"),
        FFlowFestPreparedMotionPhase::Bracket(9.75, 10.0, 4, true, First, Second, Fraction));
    TestTrue(TEXT("The final loop knot interpolates to the first"),
        First == 3 && Second == 0 && FMath::IsNearlyEqual(Fraction, .9f));
    TestTrue(TEXT("Negative seek wraps to the same cyclic phase"),
        FFlowFestPreparedMotionPhase::Bracket(-.25, 10.0, 4, true, First, Second, Fraction));
    TestTrue(TEXT("Wrapped phase keeps the same neighbor pair"),
        First == 3 && Second == 0 && FMath::IsNearlyEqual(Fraction, .9f));
    TestTrue(TEXT("One-shot endpoint can be queried"),
        FFlowFestPreparedMotionPhase::Bracket(100.0, 10.0, 4, false, First, Second, Fraction));
    TestTrue(TEXT("One-shot playback clamps at its final knot"),
        First == 3 && Second == 3 && Fraction == 0.f);
    TestEqual(TEXT("One-shot final knot samples the exact end"),
        FFlowFestPreparedMotionPhase::KnotSeconds(3, 10.0, 4, false), 10.0);

    FFlowArtsArmClearancePreparedSeed SeedA, SeedB;
    SeedA.bValid = SeedB.bValid = true;
    SeedA.bAbsoluteControls = SeedB.bAbsoluteControls = true;
    for (int32 Side = 0; Side < 2; ++Side)
        SeedA.ElbowPole[Side] = SeedB.ElbowPole[Side] = FVector::ForwardVector;
    SeedB.HandTranslationCm[0].X = 9.0;
    TestTrue(TEXT("Nine centimeters over one source frame is continuous"),
        FFlowFestPreparedMotionPhase::Continuous(SeedA, SeedB, 1.0 / 30.0, 30));
    SeedB.HandTranslationCm[0].X = 11.0;
    TestFalse(TEXT("A correction over ten centimeters per frame cannot publish"),
        FFlowFestPreparedMotionPhase::Continuous(SeedA, SeedB, 1.0 / 30.0, 30));
    SeedB.HandTranslationCm[0] = FVector::ZeroVector;
    SeedB.TorsoRotation = FQuat(FVector::UpVector, FMath::DegreesToRadians(20.0));
    TestFalse(TEXT("A sudden torso turn cannot publish"),
        FFlowFestPreparedMotionPhase::Continuous(SeedA, SeedB, 1.0 / 30.0, 30));

    Prep.Skin = MakeShared<FFlowArtsSkinnedClearanceData, ESPMode::ThreadSafe>();
    TestFalse(TEXT("A clip beyond the bounded full-frame capacity cannot publish a partial track"),
        IsolatedCache.Acquire(Prep, FFlowFestPreparedMotionCache::MaxKnots, 20., true, false).IsValid());
    TestTrue(TEXT("A 480-frame built-in clip fits the source cache bound"),
        IsolatedCache.Acquire(Prep, 480, 16., true, true).IsValid());
    TArray<TSharedPtr<FFlowFestPreparedMotionEntry, ESPMode::ThreadSafe>> CrowdEntries;
    for (int32 Variant = 0; Variant < 16; ++Variant)
    {
        FFlowFestPreparedMotionKey CrowdKey = Prep;
        CrowdKey.Payload = FName(*FString::Printf(TEXT("memo-crowd-%d"), Variant));
        auto Entry = IsolatedCache.Acquire(CrowdKey, 4, 10.0, true, true);
        TestTrue(TEXT("Crowd-sized distinct track fits the bounded cache"), Entry.IsValid());
        if (!Entry.IsValid()) continue;
        int32 Knot = INDEX_NONE;
        double Time = -1.0;
        FFlowArtsArmClearancePreparedSeed Previous;
        bool bHasPrevious = true;
        TestTrue(TEXT("Initial phase knot can be claimed once"),
            Entry->ClaimNext(Knot, Time, Previous, bHasPrevious));
        TestTrue(TEXT("The first knot is phase zero without a prior seed"),
            Knot == 0 && Time == 0.0 && !bHasPrevious);
        Entry->Fail(Knot);
        TestTrue(TEXT("An infeasible track is terminal"), Entry->IsFailed());
        CrowdEntries.Add(Entry);
    }
    for (int32 Variant = 0; Variant < CrowdEntries.Num(); ++Variant)
    {
        FFlowFestPreparedMotionKey CrowdKey = Prep;
        CrowdKey.Payload = FName(*FString::Printf(TEXT("memo-crowd-%d"), Variant));
        const auto Repeated = IsolatedCache.Acquire(
            CrowdKey, 4, 10.0, true, true);
        TestTrue(TEXT("Crowd revisit reuses terminal result without another search"),
            Repeated == CrowdEntries[Variant] && Repeated->IsFailed());
    }

    const auto NewEntry = [&Prep, &IsolatedCache](const TCHAR* Payload)
    {
        FFlowFestPreparedMotionKey Key = Prep;
        Key.Payload = FName(Payload);
        return IsolatedCache.Acquire(Key, 3, 9.0, false, true);
    };
    auto Skipped = NewEntry(TEXT("memo-skipped-evaluate"));
    auto Parallel = NewEntry(TEXT("memo-parallel"));
    auto Third = NewEntry(TEXT("memo-third"));
    auto Fourth = NewEntry(TEXT("memo-fourth"));
    TestTrue(TEXT("Lifecycle entries acquired"), Skipped.IsValid() && Parallel.IsValid() &&
        Third.IsValid() && Fourth.IsValid());
    if (Skipped.IsValid() && Parallel.IsValid() && Third.IsValid() && Fourth.IsValid())
    {
        int32 SkippedIndex = INDEX_NONE, ParallelIndex = INDEX_NONE, ThirdIndex = INDEX_NONE;
        double Seconds = 0.0;
        FFlowArtsArmClearancePreparedSeed Previous;
        bool bHasPrevious = false;
        TestTrue(TEXT("Skipped Evaluate reserves a worker slot"),
            Skipped->ClaimNext(SkippedIndex, Seconds, Previous, bHasPrevious));
        TestTrue(TEXT("Parallel variant reserves the second slot"),
            Parallel->ClaimNext(ParallelIndex, Seconds, Previous, bHasPrevious));
        TestFalse(TEXT("A third variant waits while both claims are live"),
            Third->ClaimNext(ThirdIndex, Seconds, Previous, bHasPrevious));
        Skipped->AbandonClaim(SkippedIndex, false);
        Skipped->AbandonClaim(SkippedIndex, false);
        TestTrue(TEXT("Skipped Evaluate can reclaim its released phase"),
            Skipped->ClaimNext(SkippedIndex, Seconds, Previous, bHasPrevious));
        Skipped->Fail(SkippedIndex);
        Skipped->Fail(SkippedIndex);
        TestTrue(TEXT("One terminal claim releases exactly one slot"),
            Third->ClaimNext(ThirdIndex, Seconds, Previous, bHasPrevious));
        int32 FourthIndex = INDEX_NONE;
        TestFalse(TEXT("Duplicate completion cannot release another variant's slot"),
            Fourth->ClaimNext(FourthIndex, Seconds, Previous, bHasPrevious));
        Parallel->Fail(ParallelIndex);
        TestTrue(TEXT("The parallel slot releases on its own completion"),
            Fourth->ClaimNext(FourthIndex, Seconds, Previous, bHasPrevious));
        Third->Fail(ThirdIndex);
        Fourth->Fail(FourthIndex);
    }

    auto Orphan = NewEntry(TEXT("memo-orphan-worker"));
    auto Recovered = NewEntry(TEXT("memo-after-orphan"));
    auto Waiting = NewEntry(TEXT("memo-waiting-after-orphan"));
    TestTrue(TEXT("Short-session lifecycle entries acquired"),
        Orphan.IsValid() && Recovered.IsValid() && Waiting.IsValid());
    if (Orphan.IsValid() && Recovered.IsValid() && Waiting.IsValid())
    {
        Orphan->AddConsumer();
        Orphan->AddConsumer();
        int32 OrphanIndex = INDEX_NONE, RecoveredIndex = INDEX_NONE, WaitingIndex = INDEX_NONE;
        double Seconds = 0.0;
        FFlowArtsArmClearancePreparedSeed Previous;
        bool bHasPrevious = false;
        TestTrue(TEXT("An observed entry can start asynchronous preparation"),
            Orphan->ClaimNext(OrphanIndex, Seconds, Previous, bHasPrevious));
        const auto LegacyCapture = Orphan->ReadProgress();
        TestEqual(TEXT("Telemetry identifies the claimed legacy capture"),
            LegacyCapture.Stage, FString(TEXT("legacy-capture")));
        TestEqual(TEXT("Telemetry observes the aggregate occupied slot"),
            LegacyCapture.GlobalActive, 1);
        const auto Steps = MakeShared<FThreadSafeCounter, ESPMode::ThreadSafe>();
        Orphan->Submit(OrphanIndex, [Steps](FFlowArtsArmClearancePreparedSeed&)
        {
            Steps->Increment();
            FPlatformProcess::Sleep(0.01f);
            return EFlowFestPreparationStep::Continue;
        });
        TestTrue(TEXT("Another variant occupies the second worker slot"),
            Recovered->ClaimNext(RecoveredIndex, Seconds, Previous, bHasPrevious));
        TestFalse(TEXT("A third variant waits while both slots are occupied"),
            Waiting->ClaimNext(WaitingIndex, Seconds, Previous, bHasPrevious));
        Orphan->RemoveConsumer();
        TestFalse(TEXT("One remaining performer keeps shared preparation alive"),
            Orphan->IsCancelled());
        Orphan->RemoveConsumer();
        const double ReleaseDeadline = FPlatformTime::Seconds() + 2.0;
        while (IsolatedCache.GetOutstandingForTests() != 1 && FPlatformTime::Seconds() < ReleaseDeadline)
            FPlatformProcess::Sleep(0.01f);
        TestEqual(TEXT("Dormant worker returns exactly its own occupied slot"),
            IsolatedCache.GetOutstandingForTests(), 1);
        TestTrue(TEXT("The released slot admits another variant"),
            Waiting->ClaimNext(WaitingIndex, Seconds, Previous, bHasPrevious));
        TestFalse(TEXT("The unfinished track remains resumable"), Orphan->IsFailed());
        const int32 ParkedSteps = Steps->GetValue();
        FPlatformProcess::Sleep(0.03f);
        TestEqual(TEXT("Dormant worker does no further work"), Steps->GetValue(), ParkedSteps);
        Recovered->Fail(RecoveredIndex);
        Waiting->Fail(WaitingIndex);
        for (int32 Session = 0; Session < 2; ++Session)
        {
            auto Restarted = NewEntry(TEXT("memo-orphan-worker"));
            TestTrue(TEXT("A later short turn reuses its exact partial track"),
                Restarted == Orphan);
            if (!Restarted.IsValid()) break;
            Restarted->AddConsumer();
            const int32 StepsBeforeResume = Steps->GetValue();
            const double ProgressDeadline = FPlatformTime::Seconds() + 2.0;
            while (Steps->GetValue() == StepsBeforeResume && FPlatformTime::Seconds() < ProgressDeadline)
                FPlatformProcess::Sleep(0.01f);
            TestTrue(TEXT("A resumed short turn advances the parked search"),
                Steps->GetValue() > StepsBeforeResume);
            Restarted->RemoveConsumer();
            const double ParkDeadline = FPlatformTime::Seconds() + 2.0;
            while (IsolatedCache.GetOutstandingForTests() != 0 && FPlatformTime::Seconds() < ParkDeadline)
                FPlatformProcess::Sleep(0.01f);
            TestEqual(TEXT("Each short turn parks without retaining a worker slot"),
                IsolatedCache.GetOutstandingForTests(), 0);
        }
        auto WrongIdentity = NewEntry(TEXT("memo-different-motion"));
        TestTrue(TEXT("A changed motion cannot inherit partial worker state"),
            WrongIdentity.IsValid() && WrongIdentity != Orphan);
    }

    FFlowFestPreparedMotionKey StanceKey = Prep;
    StanceKey.Payload = TEXT("memo-short-stance-capture");
    StanceKey.Policy = 2;
    for (int32 Turn = 0; Turn < 2; ++Turn)
    {
        StanceKey.TurnClips[Turn] = GetTransientPackage();
        StanceKey.TurnClipIncarnation[Turn] = FObjectKey(GetTransientPackage());
        StanceKey.TurnContent[Turn] = FString::Printf(TEXT("source-sha:%d:fbx-sha"), Turn);
        StanceKey.TurnDuration[Turn] = 1.0;
        StanceKey.TurnHeading[Turn] = Turn ? -90. : 90.;
        StanceKey.TurnFrameCount[Turn] = 2;
    }
    auto PartialStance = IsolatedCache.Acquire(StanceKey, 2, 1., true, true);
    TestTrue(TEXT("A full-track stance capture can be retained"), PartialStance.IsValid());
    if (PartialStance.IsValid())
    {
        PartialStance->AddConsumer();
        int32 Turn = INDEX_NONE, Index = INDEX_NONE;
        double Seconds = -1.;
        TestTrue(TEXT("First short turn captures a native turn frame"),
            PartialStance->ClaimTurnCapture(Turn, Index, Seconds));
        const auto TurnClaim = PartialStance->ReadProgress();
        TestEqual(TEXT("Telemetry distinguishes native turn capture from source capture"),
            TurnClaim.Stage, FString(TEXT("turn-capture")));
        TestEqual(TEXT("Telemetry counts the claimed shared capture slot"),
            TurnClaim.GlobalCaptures, 1);
        FFlowFestStanceTurnFrame Frame;
        Frame.Seconds = Seconds;
        PartialStance->CompleteTurnCapture(Turn, Index, Frame);
        const auto TurnComplete = PartialStance->ReadProgress();
        TestEqual(TEXT("Telemetry retains native turn progress after the claim releases"),
            TurnComplete.CapturedTurns, 1);
        TestEqual(TEXT("Telemetry reports waiting when the next turn frame has no claim"),
            TurnComplete.Stage, FString(TEXT("turn-wait")));
        PartialStance->RemoveConsumer();
        TestFalse(TEXT("Ending a short turn retains unfinished source capture"),
            PartialStance->IsFailed());
        auto SameStance = IsolatedCache.Acquire(StanceKey, 2, 1., true, true);
        TestTrue(TEXT("Next turn resumes the exact stance capture"), SameStance == PartialStance);
        if (SameStance.IsValid())
        {
            SameStance->AddConsumer();
            int32 NextTurn = INDEX_NONE, NextIndex = INDEX_NONE;
            TestTrue(TEXT("Next turn captures the next native source frame"),
                SameStance->ClaimTurnCapture(NextTurn, NextIndex, Seconds));
            TestTrue(TEXT("An already captured frame is not repeated"),
                NextTurn != Turn || NextIndex != Index);
            SameStance->AbandonTurnCapture(NextTurn, NextIndex, false);
            SameStance->RemoveConsumer();
        }
        auto OtherStanceKey = StanceKey;
        OtherStanceKey.TurnContent[0] += TEXT(":reimport");
        TestTrue(TEXT("A reimported turn cannot reuse prior captured frames"),
            IsolatedCache.Acquire(OtherStanceKey, 2, 1., true, true) != PartialStance);
        OtherStanceKey = StanceKey;
        OtherStanceKey.TurnClipIncarnation[0] = FObjectKey(ReloadedClip);
        TestTrue(TEXT("A reloaded turn cannot reuse prior captured frames at the same path"),
            IsolatedCache.Acquire(OtherStanceKey, 2, 1., true, true) != PartialStance);
    }

    // Two arbitrary-time captures can share one evaluation without changing
    // the immutable turn data. Releasing either claim must free exactly one slot.
    FFlowFestPreparedMotionCache BatchCache;
    auto BatchKey = StanceKey;
    BatchKey.TurnContent[0] += TEXT(":batch");
    auto SerialKey = StanceKey;
    SerialKey.TurnContent[0] += TEXT(":serial");
    auto Batch = BatchCache.Acquire(BatchKey, 2, 1., true, true);
    auto Serial = BatchCache.Acquire(SerialKey, 2, 1., true, true);
    TestTrue(TEXT("Independent batch and serial tracks exist"), Batch.IsValid() && Serial.IsValid());
    if (Batch.IsValid() && Serial.IsValid())
    {
        int32 TurnA = INDEX_NONE, TurnB = INDEX_NONE;
        int32 IndexA = INDEX_NONE, IndexB = INDEX_NONE;
        double SecondsA = -1., SecondsB = -1.;
        TestTrue(TEXT("Batch claims first native turn frame"),
            Batch->ClaimTurnCapture(TurnA, IndexA, SecondsA));
        TestTrue(TEXT("Batch claims distinct second native turn frame"),
            Batch->ClaimTurnCapture(TurnB, IndexB, SecondsB));
        TestTrue(TEXT("Batch claims are deterministic adjacent frames"),
            TurnA == 0 && TurnB == 0 && IndexA == 0 && IndexB == 1);
        TestEqual(TEXT("Two captures occupy the aggregate bound"),
            BatchCache.GetOutstandingForTests(), 2);
        TestEqual(TEXT("Both occupied slots are capture claims"),
            BatchCache.GetCaptureOutstandingForTests(), 2);
        int32 BlockedTurn = INDEX_NONE, BlockedIndex = INDEX_NONE;
        double BlockedSeconds = -1.;
        TestFalse(TEXT("Another entry cannot exceed the global capture bound"),
            Serial->ClaimTurnCapture(BlockedTurn, BlockedIndex, BlockedSeconds));
        Batch->AbandonTurnCapture(TurnB, IndexB, false);
        Batch->AbandonTurnCapture(TurnB, IndexB, false);
        TestEqual(TEXT("Duplicate release preserves the other capture reservation"),
            BatchCache.GetOutstandingForTests(), 1);
        TestTrue(TEXT("Released frame is reclaimed at the same deterministic time"),
            Batch->ClaimTurnCapture(TurnB, IndexB, SecondsB) && TurnB == 0 && IndexB == 1);
        const auto MakeFrame = [](double Seconds, int32 FrameIndex)
        {
            FFlowFestStanceTurnFrame Frame;
            Frame.Seconds = Seconds;
            Frame.Hips = FTransform(FQuat::Identity, FVector(10. * FrameIndex, 2., 90.));
            Frame.Feet[0] = FTransform(FQuat::Identity, FVector(3. * FrameIndex, -8., 0.));
            Frame.Feet[1] = FTransform(FQuat::Identity, FVector(3. * FrameIndex, 8., 0.));
            return Frame;
        };
        Batch->CompleteTurnCapture(TurnA, IndexA, MakeFrame(SecondsA, IndexA));
        Batch->CompleteTurnCapture(TurnB, IndexB, MakeFrame(SecondsB, IndexB));
        for (int32 FrameIndex = 0; FrameIndex < 2; ++FrameIndex)
        {
            int32 Turn = INDEX_NONE, Index = INDEX_NONE;
            double Seconds = -1.;
            TestTrue(TEXT("Serial baseline claims one frame after prior completion"),
                Serial->ClaimTurnCapture(Turn, Index, Seconds));
            if (Turn == 0 && Index == FrameIndex)
                Serial->CompleteTurnCapture(Turn, Index, MakeFrame(Seconds, Index));
            else Serial->AbandonTurnCapture(Turn, Index, true);
        }
        for (int32 FrameIndex = 0; FrameIndex < 2; ++FrameIndex)
        {
            FFlowFestStanceTurnFrame Batched, Single;
            TestTrue(TEXT("Both capture schedules publish the same source frame"),
                Batch->ReadCapturedTurnFrameForTests(0, FrameIndex, Batched) &&
                Serial->ReadCapturedTurnFrameForTests(0, FrameIndex, Single) &&
                Batched.Seconds == Single.Seconds && Batched.Hips.Equals(Single.Hips) &&
                Batched.Feet[0].Equals(Single.Feet[0]) &&
                Batched.Feet[1].Equals(Single.Feet[1]));
        }
        TestEqual(TEXT("Completed batch and serial captures release every slot"),
            BatchCache.GetOutstandingForTests(), 0);

        auto Legacy = BatchCache.Acquire(Prep, 2, 1., true, true);
        TestTrue(TEXT("Legacy reservation shares the same aggregate bound"), Legacy.IsValid());
        if (Legacy.IsValid())
        {
            int32 LegacyIndex = INDEX_NONE;
            double LegacySeconds = -1.;
            FFlowArtsArmClearancePreparedSeed Previous;
            bool bHasPrevious = false;
            TestTrue(TEXT("Legacy capture reserves one aggregate slot"),
                Legacy->ClaimNext(LegacyIndex, LegacySeconds, Previous, bHasPrevious));
            int32 Turn = INDEX_NONE, Index = INDEX_NONE;
            double Seconds = -1.;
            TestTrue(TEXT("One turn capture can coexist with one legacy reservation"),
                Batch->ClaimTurnCapture(Turn, Index, Seconds));
            TestFalse(TEXT("A third capture cannot bypass a reserved worker slot"),
                Serial->ClaimTurnCapture(Turn, Index, Seconds));
            Batch->AbandonTurnCapture(Turn, Index, false);
            Legacy->AbandonClaim(LegacyIndex, false);
            TestEqual(TEXT("Mixed capture cancellation returns both aggregate slots"),
                BatchCache.GetOutstandingForTests(), 0);
        }
    }

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestPreparedPropKeyTest,
    "FlowArts.Runtime.PreparedPropCanonicalKey",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowFestPreparedPropKeyTest::RunTest(const FString& Parameters)
{
    UWorld::InitializationValues Settings;
    Settings.AllowAudioPlayback(false).CreatePhysicsScene(false).CreateNavigation(false).CreateAISystem(false);
    UWorld* World = UWorld::CreateWorld(EWorldType::Game, false,
        MakeUniqueObjectName(GetTransientPackage(), UWorld::StaticClass(), TEXT("PreparedPropKeyWorld")),
        GetTransientPackage(), true, ERHIFeatureLevel::Num, &Settings);
    if (!TestNotNull(TEXT("Canonical key transient world"), World)) return false;
    struct FDestroyWorld { UWorld* Value; ~FDestroyWorld() { Value->DestroyWorld(false); } } Cleanup{World};
    FFlowFestPreparedMotionKey Keys[2];
    for (int32 Index = 0; Index < 2; ++Index)
    {
        AActor* Actor = World->SpawnActor<AActor>();
        if (!TestNotNull(TEXT("Canonical key performer"), Actor)) return false;
        USceneComponent* Root = NewObject<USceneComponent>(Actor);
        Actor->SetRootComponent(Root);
        Root->RegisterComponent();
        Root->SetWorldLocation(FVector(Index ? 17342.125 : -918.5, Index ? -42.75 : 810.25, 0));
        Root->SetWorldRotation(FQuat(FVector::UpVector, Index ? 1.1 : -0.37));
        UFlowFestPropComponent* Prop = NewObject<UFlowFestPropComponent>(Actor);
        Prop->RegisterComponent();
        Prop->Initialize(Root);
        if (!TestTrue(TEXT("Same catalog prop equips in both world transforms"),
            Prop->Equip(TEXT("staff")) && Prop->IsReady())) return false;
        if (!TestTrue(TEXT("Canonical prop capsules are available"),
            Prop->SnapshotPerformanceLocalClearanceCapsules(
                Keys[Index].LocalProps[0], Keys[Index].LocalProps[1]))) return false;
        Keys[Index].Payload = TEXT("same-validated-motion");
        Keys[Index].PropId = Prop->GetPropId();
        Keys[Index].Mesh = UWorld::StaticClass();
        Keys[Index].WorldScale = FVector::OneVector;
        Keys[Index].Policy = 1;
    }
    TestTrue(TEXT("Same exact prop geometry shares a key across actor positions and rotations"),
        Keys[0].Equals(Keys[1]));
    Keys[1].LocalProps[1][0].RadiusCm += .01f;
    TestFalse(TEXT("A local prop geometry change splits the key"), Keys[0].Equals(Keys[1]));
    return true;
}
#endif
