#if WITH_DEV_AUTOMATION_TESTS
#include "FlowFestPhraseStage.h"
#include "FlowFestAnimInstance.h"
#include "FlowFestAvatarComponent.h"
#include "FlowFestPropComponent.h"
#include "FlowArtsRuntimeMotion.h"
#include "HAL/FileManager.h"
#include "Misc/Paths.h"

#include "Components/SkeletalMeshComponent.h"
#include "Dom/JsonObject.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "Misc/AutomationTest.h"
#include "Misc/FileHelper.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "UObject/UObjectGlobals.h"

using namespace FlowFestPhraseStage;

namespace
{
constexpr EAutomationTestFlags PhraseStageTestFlags = EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter;

bool LoadForTest(FAutomationTestBase& Test, FSchedule& Out)
{
    FString Error;
    const bool bLoaded = LoadSchedule(Out, Error);
    if (!bLoaded) Test.AddError(Error);
    return bLoaded;
}

float SegmentDistance(const FVector2D& P, const FVector2D& A, const FVector2D& B)
{
    const FVector2D D = B - A;
    const float T = D.SizeSquared() > 1e-8f ? FMath::Clamp(FVector2D::DotProduct(P - A, D) / D.SizeSquared(), 0.f, 1.f) : 0.f;
    return FVector2D::Distance(P, A + D * T);
}
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestPhraseStageScheduleTest, "FlowFest.PhraseStage.ScheduleParses", PhraseStageTestFlags)

bool FFlowFestPhraseStageScheduleTest::RunTest(const FString& Parameters)
{
    FSchedule Schedule;
    if (!LoadForTest(*this, Schedule)) return false;
    TestEqual(TEXT("Schedule version"), Schedule.Version, FString(TEXT("flow-fest-phrase-schedule-v1")));
    TestTrue(TEXT("Positive tempo"), Schedule.TempoBpm > 0.f);
    TestFalse(TEXT("The stage reads the brain's schedule, not the fixture"), Schedule.bFixture);
    TestEqual(TEXT("Two staff spinners on the stage"), Schedule.Performers.Num(), 2);
    for (const FPerformer& Performer : Schedule.Performers)
    {
        TestFalse(*(Performer.Id + TEXT(" has a character")), Performer.CharacterId.IsNone());
        TestTrue(*(Performer.Id + TEXT(" has a stage area")), Performer.AreaRadius > 0.f);
        // A performer starts at home: the first walk leaves from wherever the last one ended, from home.
        FVector2D At = Performer.Home;
        for (const FPhrase& Phrase : Performer.Phrases)
            if (Phrase.bHasPath)
            {
                TestTrue(*FString::Printf(TEXT("%s walk at beat %.0f leaves from where the last ended"), *Performer.Id, Phrase.StartBeat),
                    FVector2D::Distance(Phrase.From, At) < .01f);
                At = Phrase.To;
            }
        float Next = 0.f;
        for (const FPhrase& Phrase : Performer.Phrases)
        {
            TestTrue(*FString::Printf(TEXT("%s phrase at %.0f follows the last"), *Performer.Id, Phrase.StartBeat), Phrase.StartBeat >= Next - .001f);
            Next = Phrase.StartBeat + Phrase.Beats;
            if (Phrase.Mode == EMode::Turning)
                TestTrue(TEXT("Turns name their length"), Phrase.TurnBeats > 0.f && Phrase.TurnBeats <= Phrase.Beats);
            if (Phrase.Mode == EMode::Travelling)
            {
                TestTrue(TEXT("Travelling phrases carry a path"), Phrase.bHasPath && Phrase.Steps >= 2 && Phrase.BeatsPerStep > 0.f);
                TestTrue(TEXT("Travelling stays inside the performer's area"),
                    FVector2D::Distance(Phrase.To, Performer.Home) <= Performer.AreaRadius + .01f);
            }
            else TestFalse(TEXT("Only travelling phrases carry a path"), Phrase.bHasPath);
        }
        TestTrue(*(Performer.Id + TEXT(" fills the schedule")), FMath::IsNearlyEqual(Next, Schedule.LengthBeats, .001f));
    }
    // A malformed schedule is refused with a reason.
    FSchedule Bad;
    FString Error;
    TestFalse(TEXT("Unknown mode is refused"), ParseSchedule(TEXT(R"({"version":"flow-fest-phrase-schedule-v1","tempoBpm":120,"lengthBeats":8,
        "performers":[{"id":"x","characterId":"ch07","phrases":[{"startBeat":0,"beats":8,"mode":"hopping"}]}]})"), Bad, Error));
    TestTrue(TEXT("Refusal names the mode"), Error.Contains(TEXT("hopping")));
    TestFalse(TEXT("Travelling without a path is refused"), ParseSchedule(TEXT(R"({"version":"flow-fest-phrase-schedule-v1","tempoBpm":120,"lengthBeats":8,
        "performers":[{"id":"x","characterId":"ch07","phrases":[{"startBeat":0,"beats":8,"mode":"travelling","path":null}]}]})"), Bad, Error));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestPhraseStagePhraseAtBeatTest, "FlowFest.PhraseStage.PhraseAtBeat", PhraseStageTestFlags)

bool FFlowFestPhraseStagePhraseAtBeatTest::RunTest(const FString& Parameters)
{
    FSchedule Schedule;
    if (!LoadForTest(*this, Schedule)) return false;
    // Read the file's phrases directly, independently of the parser, and compare at every quarter beat.
    FString Text;
    TSharedPtr<FJsonObject> Root;
    if (!TestTrue(TEXT("Schedule file reads"), FFileHelper::LoadFileToString(Text, *SchedulePath()) &&
        FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Root) && Root.IsValid())) return false;
    const TArray<TSharedPtr<FJsonValue>>& Performers = Root->GetArrayField(TEXT("performers"));
    int32 Checked = 0;
    for (int32 P = 0; P < Performers.Num() && P < Schedule.Performers.Num(); ++P)
    {
        const TArray<TSharedPtr<FJsonValue>>& Phrases = Performers[P]->AsObject()->GetArrayField(TEXT("phrases"));
        for (float Beat = 0.f; Beat < Schedule.LengthBeats; Beat += .25f)
        {
            TSharedPtr<FJsonObject> Expected;
            for (const TSharedPtr<FJsonValue>& Value : Phrases)
            {
                const TSharedPtr<FJsonObject> Q = Value->AsObject();
                const double Start = Q->GetNumberField(TEXT("startBeat"));
                if (Beat >= Start && Beat < Start + Q->GetNumberField(TEXT("beats"))) Expected = Q;
            }
            const int32 Index = PhraseIndexAt(Schedule.Performers[P], Beat);
            if (!Expected.IsValid())
            {
                TestEqual(TEXT("No phrase where the file has none"), Index, int32(INDEX_NONE));
                continue;
            }
            if (!TestTrue(*FString::Printf(TEXT("%s has a phrase at beat %.2f"), *Schedule.Performers[P].Id, Beat), Index != INDEX_NONE)) return false;
            const FPhrase& Phrase = Schedule.Performers[P].Phrases[Index];
            if (Phrase.SequenceId != Expected->GetStringField(TEXT("sequenceId")) ||
                FString(ModeName(Phrase.Mode)) != Expected->GetStringField(TEXT("mode")) ||
                Phrase.Plane != Expected->GetStringField(TEXT("plane")) ||
                !FMath::IsNearlyEqual(Phrase.StartBeat, float(Expected->GetNumberField(TEXT("startBeat")))))
            {
                AddError(FString::Printf(TEXT("%s at beat %.2f: playing %s %s %s, the file says %s %s %s"), *Schedule.Performers[P].Id, Beat,
                    *Phrase.SequenceId, ModeName(Phrase.Mode), *Phrase.Plane, *Expected->GetStringField(TEXT("sequenceId")),
                    *Expected->GetStringField(TEXT("mode")), *Expected->GetStringField(TEXT("plane"))));
                return false;
            }
            ++Checked;
        }
    }
    TestTrue(TEXT("Beats were compared"), Checked > 500);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestPhraseStageTravelTest, "FlowFest.PhraseStage.TravelOnPath", PhraseStageTestFlags)

bool FFlowFestPhraseStageTravelTest::RunTest(const FString& Parameters)
{
    FSchedule Schedule;
    if (!LoadForTest(*this, Schedule)) return false;
    int32 Travels = 0;
    for (const FPerformer& Performer : Schedule.Performers)
    {
        const FGait Gait = PlanGait(Performer, Schedule.LengthBeats);
        for (const FPhrase& Phrase : Performer.Phrases)
        {
            if (Phrase.Mode != EMode::Travelling) continue;
            ++Travels;
            float Worst = 0.f;
            for (float Beat = Phrase.StartBeat; Beat <= Phrase.StartBeat + Phrase.Beats; Beat += 1.f / 30.f)
                Worst = FMath::Max(Worst, SegmentDistance(SampleGait(Gait, Beat).Centre, Phrase.From, Phrase.To));
            TestTrue(*FString::Printf(TEXT("%s at beat %.0f: the body stays on the path (worst %.2f cm)"), *Performer.Id, Phrase.StartBeat, Worst * 100.f), Worst < .01f);
            const float Arrival = Phrase.StartBeat + Phrase.Steps * Phrase.BeatsPerStep;
            for (float Beat = Arrival; Beat < Phrase.StartBeat + Phrase.Beats; Beat += .25f)
            {
                const FGaitSample Stand = SampleGait(Gait, Beat);
                if (!TestTrue(*FString::Printf(TEXT("%s at beat %.0f stands at path.to from the last footfall (beat %.2f, %.2f cm off)"), *Performer.Id,
                    Phrase.StartBeat, Beat, FVector2D::Distance(Stand.Centre, Phrase.To) * 100.f), FVector2D::Distance(Stand.Centre, Phrase.To) < .01f && !Stand.bStepping)) break;
            }
            const FGaitSample Mid = SampleGait(Gait, Phrase.StartBeat + Phrase.Steps * Phrase.BeatsPerStep * .5f);
            const float Along = FVector2D::DotProduct(Mid.Centre - Phrase.From, (Phrase.To - Phrase.From).GetSafeNormal());
            TestTrue(TEXT("Halfway through the steps the body is partway along"), Along > .1f && Along < FVector2D::Distance(Phrase.From, Phrase.To) - .1f);
            // Footfall k lands exactly on StartBeat + k * BeatsPerStep (never the props' jitter), beside the path.
            TArray<float> Lands;
            for (int32 Side = 0; Side < 2; ++Side)
                for (const FPlant& Plant : Gait.Plants[Side])
                {
                    if (Plant.LandBeat <= Phrase.StartBeat || Plant.LandBeat > Phrase.StartBeat + Phrase.Beats) continue;
                    Lands.Add(Plant.LandBeat);
                    TestTrue(TEXT("Footprints run beside the path"), SegmentDistance(Plant.At, Phrase.From, Phrase.To) <= FootGaugeM + .005f);
                }
            Lands.Sort();
            if (TestEqual(TEXT("One footprint per scheduled step"), Lands.Num(), Phrase.Steps))
                for (int32 K = 1; K <= Lands.Num(); ++K)
                    TestTrue(*FString::Printf(TEXT("%s at beat %.0f: footfall %d lands on beat %.3f (planned %.3f)"), *Performer.Id, Phrase.StartBeat, K,
                        Phrase.StartBeat + K * Phrase.BeatsPerStep, Lands[K - 1]), FMath::IsNearlyEqual(Lands[K - 1], Phrase.StartBeat + K * Phrase.BeatsPerStep, 1.e-4f));
        }
    }
    TestTrue(TEXT("The schedule has travelling phrases"), Travels >= 2);
    int32 Turns = 0;
    for (const FPerformer& Performer : Schedule.Performers)
    {
        const FGait Gait = PlanGait(Performer, Schedule.LengthBeats);
        for (const FPhrase& Phrase : Performer.Phrases)
        {
            if (Phrase.Mode != EMode::Turning) continue;
            ++Turns;
            const FGaitSample Done = SampleGait(Gait, Phrase.StartBeat + Phrase.TurnBeats + .01f);
            TestTrue(*FString::Printf(TEXT("%s turn at beat %.0f faces %.2f after %.0f beats (faces %.2f)"), *Performer.Id, Phrase.StartBeat, Phrase.FacingEnd,
                Phrase.TurnBeats, WrapAngle(Done.Yaw)), FMath::Abs(WrapAngle(Done.Yaw - Phrase.FacingEnd)) < .01f && !Done.bStepping);
        }
    }
    TestTrue(TEXT("The schedule has turns"), Turns >= 2);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestPhraseStageFeetTest, "FlowFest.PhraseStage.PlantedFeetDoNotSlide", PhraseStageTestFlags)

bool FFlowFestPhraseStageFeetTest::RunTest(const FString& Parameters)
{
    FSchedule Schedule;
    if (!LoadForTest(*this, Schedule)) return false;
    UWorld::InitializationValues WorldSettings;
    WorldSettings.AllowAudioPlayback(false).CreatePhysicsScene(false).CreateNavigation(false).CreateAISystem(false);
    UWorld* World = UWorld::CreateWorld(EWorldType::Game, false,
        MakeUniqueObjectName(GetTransientPackage(), UWorld::StaticClass(), TEXT("FlowFestPhraseStageTestWorld")),
        GetTransientPackage(), true, ERHIFeatureLevel::Num, &WorldSettings);
    if (!TestNotNull(TEXT("Transient stage world"), World)) return false;
    struct FDestroyWorld { UWorld* Value; ~FDestroyWorld() { Value->DestroyWorld(false); } } Cleanup{World};

    for (const FPerformer& Performer : Schedule.Performers)
    {
        FRig Rig;
        FString Error;
        const bool bSpawned = Rig.Spawn(World, Performer, Schedule.LengthBeats, FVector::ZeroVector, TEXT("fire_double_staff"), NAME_None, false, Error);
        if (!TestTrue(*FString::Printf(TEXT("%s spawns %s"), *Performer.Id, *Error), bSpawned)) return false;
        TArray<FPhraseMotionEntry> Index;
        if (LoadPhraseMotionIndex(Index, Error)) Rig.LoadPhraseMotions(Index);
        USkeletalMeshComponent* Body = Rig.Avatar->GetBodyMesh();
        UFlowFestAnimInstance* Anim = Cast<UFlowFestAnimInstance>(Body->GetAnimInstance());
        const float Dt = 1.f / 30.f;
        float Beat = 0.f;
        const auto Step = [&](float NextBeat)
        {
            Rig.Update(Schedule, NextBeat, Dt);
            World->TimeSeconds += Dt;
            Body->TickAnimation(Dt, false);
            Body->RefreshBoneTransforms();
            Rig.Avatar->TickComponent(Dt, LEVELTICK_All, nullptr);
            Rig.Prop->TickComponent(Dt, LEVELTICK_All, nullptr);
            Beat = NextBeat;
        };
        const float BeatsPerFrame = Dt * Schedule.TempoBpm / 60.f;
        // Settle into the routine, then watch every frame of the first planted and first travelling phrase.
        for (int32 I = 0; I < 15; ++I) Step(0.f);
        TestTrue(*(Performer.Id + TEXT(" plays a captured routine")), Anim->IsPerforming());
        TestTrue(*(Performer.Id + TEXT(" applies the walking layer")), Anim->GetLowerBodyLayerResult().bApplied);
        const FName Bones[2] = {TEXT("LeftFoot"), TEXT("RightFoot")};
        int32 Planted = 0, Travelling = 0;
        for (const FPhrase& Phrase : Performer.Phrases)
        {
            if (Phrase.Mode == EMode::Planted && Planted++ == 0)
            {
                const float From = Phrase.StartBeat + .5f, To = Phrase.StartBeat + FMath::Min(Phrase.Beats, 12.f) - .5f;
                for (float B = Beat; B < From; B += BeatsPerFrame) Step(B);
                FVector Start[2] = {Body->GetSocketLocation(Bones[0]), Body->GetSocketLocation(Bones[1])};
                float Worst = 0.f;
                for (float B = From; B < To; B += BeatsPerFrame)
                {
                    Step(B);
                    for (int32 Side = 0; Side < 2; ++Side) Worst = FMath::Max(Worst, float(FVector::Distance(Body->GetSocketLocation(Bones[Side]), Start[Side])));
                }
                TestTrue(*FString::Printf(TEXT("%s: planted feet stay put over beats %.1f-%.1f (worst %.2f cm)"), *Performer.Id, From, To, Worst), Worst < .5f);
                const FFlowFestLowerBodyLayerResult Result = Anim->GetLowerBodyLayerResult();
                TestTrue(*FString::Printf(TEXT("%s: both ankles reach their footprints (%.2f, %.2f cm)"), *Performer.Id, Result.ReachErrorCm[0], Result.ReachErrorCm[1]),
                    Result.ReachErrorCm[0] < .5f && Result.ReachErrorCm[1] < .5f);
                AddInfo(FString::Printf(TEXT("%s planted: worst ankle drift %.3f cm, hip drop %.1f cm"), *Performer.Id, Worst, Result.PelvisDropCm));
            }
            if (Phrase.Mode == EMode::Travelling && Travelling++ == 0)
            {
                // While a foot is down mid-walk it must not skate either; it may only move while it swings.
                for (float B = Beat; B < Phrase.StartBeat; B += BeatsPerFrame) Step(B);
                FVector Anchor[2];
                int32 Held[2] = {0, 0};
                float Worst = 0.f, Moved = 0.f, Reach = 0.f;
                const FVector Begin = Body->GetSocketLocation(Bones[0]);
                for (float B = Phrase.StartBeat; B < Phrase.StartBeat + Phrase.Beats; B += BeatsPerFrame)
                {
                    Step(B);
                    const FFlowFestLowerBodyLayerResult Result = Anim->GetLowerBodyLayerResult();
                    for (int32 Side = 0; Side < 2; ++Side)
                    {
                        Reach = FMath::Max(Reach, Result.ReachErrorCm[Side]);
                        if (Rig.Last.Swing[Side] >= 0.f) { Held[Side] = 0; continue; }
                        const FVector Foot = Body->GetSocketLocation(Bones[Side]);
                        if (Held[Side]++ == 0) Anchor[Side] = Foot;
                        else Worst = FMath::Max(Worst, float(FVector::Distance(Foot, Anchor[Side])));
                    }
                    Moved = FMath::Max(Moved, float(FVector::Dist2D(Body->GetSocketLocation(Bones[0]), Begin)));
                }
                TestTrue(*FString::Printf(TEXT("%s: stance feet hold while walking (worst %.2f cm)"), *Performer.Id, Worst), Worst < .75f);
                TestTrue(*FString::Printf(TEXT("%s: the left foot travels with the body (%.0f cm)"), *Performer.Id, Moved),
                    Moved > 100.f * FVector2D::Distance(Phrase.From, Phrase.To) - 15.f);
                TestTrue(*FString::Printf(TEXT("%s: footprints within reach while walking (worst %.2f cm)"), *Performer.Id, Reach), Reach < 1.f);
                AddInfo(FString::Printf(TEXT("%s travelling: worst stance drift %.3f cm, worst reach error %.2f cm"), *Performer.Id, Worst, Reach));
            }
        }
        Rig.Actor->Destroy();
    }
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestPhraseStageUpperBodyTest, "FlowFest.PhraseStage.UpperBodyFollowsPhrase", PhraseStageTestFlags)

bool FFlowFestPhraseStageUpperBodyTest::RunTest(const FString& Parameters)
{
    FSchedule Schedule;
    if (!LoadForTest(*this, Schedule)) return false;
    // The capture's own record of each routine, read here independently of the stage's loader:
    // (character, plane, sequence) -> the captured sequence's hash, seconds per step, beats covered.
    struct FExpected { FString SequenceSHA256; float SecondsPerStep = 0.f; };
    TMap<FString, FExpected> Expected;
    float CoveredBeats = TNumericLimits<float>::Max();
    TArray<FString> Files;
    IFileManager::Get().FindFiles(Files, *(PhraseMotionDir() / TEXT("phrase-motions-*.json")), true, false);
    if (!TestTrue(TEXT("Captured phrase routines are imported (run the phrase capture, see native-capture-README.md)"), Files.Num() > 0)) return false;
    float WidestCover = 0.f;
    for (const FString& Name : Files)
    {
        FString Text;
        TSharedPtr<FJsonObject> Root;
        if (!TestTrue(*(Name + TEXT(" reads")), FFileHelper::LoadFileToString(Text, *(PhraseMotionDir() / Name)) &&
            FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Root) && Root.IsValid())) return false;
        double MaxBeats = 0.0;
        WidestCover = FMath::Max(WidestCover, Root->TryGetNumberField(TEXT("maxBeats"), MaxBeats) ? float(MaxBeats) : TNumericLimits<float>::Max());
        for (const TSharedPtr<FJsonValue>& Value : Root->GetArrayField(TEXT("motions")))
        {
            const TSharedPtr<FJsonObject> M = Value->AsObject();
            Expected.FindOrAdd(M->GetStringField(TEXT("characterId")) + TEXT("|") + M->GetStringField(TEXT("plane")) + TEXT("|") + M->GetStringField(TEXT("sequenceId")),
                {M->GetStringField(TEXT("sequenceSHA256")), float(Root->GetNumberField(TEXT("secondsPerStep")))});
        }
    }
    CoveredBeats = WidestCover;

    UWorld::InitializationValues WorldSettings;
    WorldSettings.AllowAudioPlayback(false).CreatePhysicsScene(false).CreateNavigation(false).CreateAISystem(false);
    UWorld* World = UWorld::CreateWorld(EWorldType::Game, false,
        MakeUniqueObjectName(GetTransientPackage(), UWorld::StaticClass(), TEXT("FlowFestPhraseStageUpperBodyWorld")),
        GetTransientPackage(), true, ERHIFeatureLevel::Num, &WorldSettings);
    if (!TestNotNull(TEXT("Transient stage world"), World)) return false;
    struct FDestroyWorld { UWorld* Value; ~FDestroyWorld() { Value->DestroyWorld(false); } } Cleanup{World};
    TArray<FPhraseMotionEntry> Index;
    FString Error;
    if (!TestTrue(*(TEXT("Phrase motion index loads ") + Error), LoadPhraseMotionIndex(Index, Error))) return false;

    int32 Checked = 0;
    for (const FPerformer& Performer : Schedule.Performers)
    {
        FRig Rig;
        if (!TestTrue(*FString::Printf(TEXT("%s spawns %s"), *Performer.Id, *Error),
            Rig.Spawn(World, Performer, Schedule.LengthBeats, FVector::ZeroVector, TEXT("fire_double_staff"), NAME_None, false, Error))) return false;
        Rig.LoadPhraseMotions(Index);
        USkeletalMeshComponent* Body = Rig.Avatar->GetBodyMesh();
        UFlowFestAnimInstance* Anim = Cast<UFlowFestAnimInstance>(Body->GetAnimInstance());
        const float Dt = 1.f / 30.f;
        for (const FPhrase& Phrase : Performer.Phrases)
        {
            if (Phrase.StartBeat >= CoveredBeats) continue;
            const FExpected* Want = Expected.Find(Performer.CharacterId.ToString() + TEXT("|") + Phrase.Plane + TEXT("|") + Phrase.SequenceId);
            if (!TestNotNull(*FString::Printf(TEXT("%s phrase at beat %.0f (%s, %s) was captured"), *Performer.Id, Phrase.StartBeat, *Phrase.SequenceName, *Phrase.Plane), Want))
                continue;
            for (const float Local : {.5f, Phrase.Beats * .5f, Phrase.Beats - .5f})
            {
                const float Beat = Phrase.StartBeat + Local;
                Rig.Update(Schedule, Beat, Dt);
                World->TimeSeconds += Dt;
                Body->TickAnimation(Dt, false);
                Body->RefreshBoneTransforms();
                Rig.Avatar->TickComponent(Dt, LEVELTICK_All, nullptr);
                Rig.Prop->TickComponent(Dt, LEVELTICK_All, nullptr);
                const TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Active = Anim->GetRuntimeMotion();
                const FString What = FString::Printf(TEXT("%s at beat %.1f (%s, %s)"), *Performer.Id, Beat, *Phrase.SequenceName, *Phrase.Plane);
                if (!TestTrue(*(What + TEXT(" plays a captured routine")), Active.IsValid() && Anim->IsPerforming())) continue;
                TestEqual(*(What + TEXT(": the active routine was captured in the phrase's plane")), Active->GetCapturePlane(), Phrase.Plane);
                TestEqual(*(What + TEXT(": the active routine is the phrase's sequence")), Active->GetSequenceSHA256(), Want->SequenceSHA256);
                // The routine's clock follows the score: rests hold the first frame, drift and jitter shift it.
                const float Duration = Active->GetDurationSeconds();
                const float Score = Phrase.bRest ? 0.f : (Local - Phrase.JitterBeats) * (1.f + Phrase.TempoDrift);
                const float Want_ = FMath::Fmod(FMath::Fmod(Score * Want->SecondsPerStep, Duration) + Duration, Duration);
                const float Got = Anim->GetPerformanceTime();
                const float Off = FMath::Min(FMath::Abs(Got - Want_), Duration - FMath::Abs(Got - Want_));
                TestTrue(*FString::Printf(TEXT("%s: routine clock %.3f s, the score says %.3f s"), *What, Got, Want_), Off < 1.e-3f);
                ++Checked;
            }
        }
        AddInfo(FString::Printf(TEXT("%s: %d phrases fell back to a built-in routine"), *Performer.Id, Rig.FallbackPhrases));
        Rig.Actor->Destroy();
    }
    TestTrue(TEXT("Beats were checked on both performers"), Checked >= 30);
    if (CoveredBeats < Schedule.LengthBeats) AddWarning(FString::Printf(TEXT("Routines cover phrases starting before beat %.0f of %.0f"), CoveredBeats, Schedule.LengthBeats));
    return true;
}
// body response (2026-10-23): the sidecar parses, samples linearly and joins its loop seam.
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestPhraseStageBodyResponseTest, "FlowFest.PhraseStage.BodyResponseSidecar", PhraseStageTestFlags)

bool FFlowFestPhraseStageBodyResponseTest::RunTest(const FString& Parameters)
{
    TestEqual(TEXT("Sidecar sits beside the motion"), BodyResponseFile(TEXT("Motions/ch07_x_wall_ab.motion.json")), FString(TEXT("Motions/ch07_x_wall_ab.body.json")));
    // Two steps, two samples a step: x ramps 0, .1, .2, .3 and the loop returns to 0.
    const FString Json = TEXT(R"({"version":"flow-fest-body-response-v1","stepCount":2,"samplesPerStep":2,"loop":true,
        "offset":[[0,0,0,3.1],[0.1,-0.05,0,-3.1],[0.2,0,0,0],[0.3,0,0,0]],
        "feet":{"left":[[0,0,0,0],[0,0,0.07,0],[0,0,0,0],[0,0,0,0]],"right":[[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]},
        "steps":[{"foot":"left","startStep":0.25,"endStep":0.75,"liftM":0.07},{"foot":"right","startStep":1.9,"endStep":2.1,"liftM":0.05}]})");
    FBodyResponseTrack Track;
    FString Error;
    if (!TestTrue(*(TEXT("Sidecar parses: ") + Error), ParseBodyResponse(Json, Track, Error))) return false;
    const FBodyResponseSample Mid = SampleBodyResponse(Track, .25f);
    TestTrue(TEXT("Linear between samples"), FMath::IsNearlyEqual(Mid.Offset.X, .05f, 1.e-4f) && FMath::IsNearlyEqual(Mid.Offset.Y, -.025f, 1.e-4f));
    TestTrue(TEXT("Yaw takes the short way across +-pi"), FMath::Abs(WrapAngle(Mid.Offset.W - PI)) < .1f);
    TestTrue(TEXT("Foot lift peaks on its sample"), FMath::IsNearlyEqual(SampleBodyResponse(Track, .5f).Feet[0].Z, .07f, 1.e-4f));
    TestTrue(TEXT("Swing progress inside a step"), FMath::IsNearlyEqual(SampleBodyResponse(Track, .5f).Swing[0], .5f, 1.e-4f) && SampleBodyResponse(Track, 1.f).Swing[0] < 0.f);
    TestTrue(TEXT("A step straddling the seam swings on both sides"), SampleBodyResponse(Track, .05f).Swing[1] > .5f && SampleBodyResponse(Track, 1.95f).Swing[1] < .5f);
    // Just before the seam the last sample blends toward the first, not toward nothing.
    const float BeforeSeam = SampleBodyResponse(Track, 1.99f).Offset.X, AfterSeam = SampleBodyResponse(Track, 2.01f).Offset.X;
    TestTrue(FString::Printf(TEXT("Continuous across the loop seam (%.3f, %.3f)"), BeforeSeam, AfterSeam), FMath::Abs(BeforeSeam - AfterSeam) < .03f);
    TestTrue(TEXT("Score steps wrap to the step count"), FMath::IsNearlyEqual(SampleBodyResponse(Track, 4.5f).Offset.X, .1f, 1.e-4f));
    FBodyResponseTrack Wrong;
    TestFalse(TEXT("A track of the wrong length is refused"), ParseBodyResponse(Json.Replace(TEXT("[0.3,0,0,0]],"), TEXT("[0.3,0,0,0],[0,0,0,0]],")), Wrong, Error));
    TestTrue(TEXT("No chestYaw samples to zero"), Track.ChestYaw.IsEmpty() && SampleBodyResponse(Track, .5f).ChestYaw == 0.f);
    // Optional chest twist: one number a sample, linear between them; a wrong count is refused.
    FBodyResponseTrack Chest;
    const FString WithChest = Json.Replace(TEXT("\"steps\":"), TEXT("\"chestYaw\":[0,-0.2,-0.3,0],\"steps\":"));
    if (TestTrue(*(TEXT("Sidecar with chestYaw parses: ") + Error), ParseBodyResponse(WithChest, Chest, Error)))
        TestTrue(TEXT("chestYaw is linear between samples"), FMath::IsNearlyEqual(SampleBodyResponse(Chest, .75f).ChestYaw, -.25f, 1.e-4f));
    TestFalse(TEXT("A chestYaw of the wrong length is refused"), ParseBodyResponse(Json.Replace(TEXT("\"steps\":"), TEXT("\"chestYaw\":[0,0],\"steps\":")), Wrong, Error));
    return true;
}
#endif
