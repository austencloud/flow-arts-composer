#if WITH_DEV_AUTOMATION_TESTS
#include "FlowArtsPerformanceLibrary.h"
#include "FlowArtsPerformanceSession.h"
#include "FlowFestAvatarComponent.h"
#include "FlowFestPropComponent.h"
#include "FlowFestAnimInstance.h"
#include "FlowArtsArmClearance.h"

#include "Components/SceneComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "Misc/AutomationTest.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "HAL/FileManager.h"
#include "UObject/UObjectGlobals.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsDynamicGripChannelTest,
    "FlowArts.Runtime.DynamicGripChannel",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsDynamicGripChannelTest::RunTest(const FString& Parameters)
{
    FFlowFestGripCalibration Calibration;
    Calibration.Longitudinal = FVector::XAxisVector;
    Calibration.PalmNormal = FVector::YAxisVector;
    Calibration.Transverse = FVector::ZAxisVector;
    Calibration.Fallback = FVector(0.52, 0., 0.);
    Calibration.bValid = true;
    // The posed joint origins describe a 0.2-unit cylinder around (0.8,0.2).
    const FVector Channel = MeasureFlowFestGripChannel(Calibration,
        FVector(.8, 0., .1), FVector(1., .2, .2), FVector(.8, .4, .3));
    TestTrue(TEXT("Closed fingers locate the cylinder center and transverse plane"),
        Channel.Equals(FVector(.8, .2, .2), 1.e-5));
    const FVector Scaled = MeasureFlowFestGripChannel(Calibration,
        FVector(8., 0., 1.), FVector(10., 2., 2.), FVector(8., 4., 3.));
    TestTrue(TEXT("Cylinder fit has unit-independent ratios"),
        Scaled.Equals(FVector(8., 2., 2.), 1.e-4));
    const FVector Open = MeasureFlowFestGripChannel(Calibration,
        FVector(.8, 0., 0.), FVector(1.2, 0., 0.), FVector(1.6, 0., 0.));
    TestTrue(TEXT("Straight fingers retain the calibrated fallback"),
        Open.Equals(Calibration.Fallback, 1.e-6));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsPerformanceSessionTest,
    "FlowArts.Runtime.PreparedPerformanceSession",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsPerformanceSessionTest::RunTest(const FString& Parameters)
{
    FFlowArtsPerformanceLibrary Library;
    FString Error;
    if (!TestTrue(TEXT("Installed prepared library loads"),
        FFlowArtsPerformanceLibrary::LoadFromProject(Library, Error)))
    {
        AddError(Error);
        return false;
    }
    const TArray<const FFlowArtsPerformanceEntry*> Entries = Library.ForTarget(TEXT("ch01"), TEXT("staff"));
    if (!TestTrue(TEXT("Installed library has a prepared ch01/staff legacy entry"), !Entries.IsEmpty())) return false;
    const FFlowArtsPerformanceEntry* Entry = Entries[0];

    UWorld::InitializationValues WorldSettings;
    WorldSettings.AllowAudioPlayback(false).CreatePhysicsScene(false).CreateNavigation(false).CreateAISystem(false);
    UWorld* World = UWorld::CreateWorld(EWorldType::Game, false,
        MakeUniqueObjectName(GetTransientPackage(), UWorld::StaticClass(), TEXT("PreparedPerformanceSessionWorld")),
        GetTransientPackage(), true, ERHIFeatureLevel::Num, &WorldSettings);
    if (!TestNotNull(TEXT("Transient performance world"), World)) return false;
    struct FDestroyWorld { UWorld* Value; ~FDestroyWorld() { Value->DestroyWorld(false); } } Cleanup{World};

    AActor* Actor = World->SpawnActor<AActor>();
    if (!TestNotNull(TEXT("Transient performer"), Actor)) return false;
    USceneComponent* Root = NewObject<USceneComponent>(Actor);
    Actor->SetRootComponent(Root);
    Root->RegisterComponent();
    UFlowFestAvatarComponent* Avatar = NewObject<UFlowFestAvatarComponent>(Actor);
    UFlowFestPropComponent* Prop = NewObject<UFlowFestPropComponent>(Actor);
    Avatar->RegisterComponent();
    Prop->RegisterComponent();
    Avatar->Initialize(Root, TEXT("ch01"));
    Prop->Initialize(Root);
    USkeletalMeshComponent* Body = Avatar->GetBodyMesh();
    if (!TestNotNull(TEXT("Prepared body mesh"), Body) ||
        !TestTrue(TEXT("Prepared hands bind"), Prop->BindHands(Body)) ||
        !TestTrue(TEXT("Prepared staff equips"), Prop->Equip(TEXT("staff")) && Prop->IsReady())) return false;

    FFlowArtsPerformanceSession Session(Avatar, Prop);
    if (!TestTrue(TEXT("Exact prepared entry plays"), Session.Play(*Entry, nullptr, Error)))
    {
        AddError(Error);
        return false;
    }
    TestTrue(TEXT("Session retains selected entry"), Session.GetSelected() == Entry);
    TestTrue(TEXT("Prepared clip has duration"), Session.GetLength() > 0.f);
    const auto Step = [World, Body, Avatar, Prop](float Seconds)
    {
        World->TimeSeconds += Seconds;
        Body->TickAnimation(Seconds, false);
        Body->RefreshBoneTransforms();
        Avatar->TickComponent(Seconds, LEVELTICK_All, nullptr);
        Prop->TickComponent(Seconds, LEVELTICK_All, nullptr);
    };
    const auto Finite = [](const FVector& Point)
    {
        return FMath::IsFinite(Point.X) && FMath::IsFinite(Point.Y) && FMath::IsFinite(Point.Z);
    };

    Session.SetRate(1.25f);
    Session.Pause(true);
    Step(.05f);
    if (const UFlowFestAnimInstance* EntryAnimator = Cast<UFlowFestAnimInstance>(Body->GetAnimInstance()))
    {
        TestTrue(TEXT("Entering performance attaches visible props to calibrated palms"),
            FMath::IsFinite(Prop->GetActualGripErrorCm()) && Prop->GetActualGripErrorCm() <= .2f);
        TArray<FFlowArtsClearanceCapsule> Rendered[2];
        if (Prop->SampleClearanceCapsules(NAME_None, 0.f, Body->GetComponentTransform(),
            Rendered[0], Rendered[1]))
        {
            const FFlowArtsArmClearanceResult& EntryResult = EntryAnimator->GetArmClearance();
            for (int32 Side = 0; Side < 2; ++Side)
            {
                const TArray<FFlowArtsClearanceCapsule>& Certified = EntryResult.OriginalHeldPropCapsules[Side];
                TestEqual(TEXT("Entering performance keeps certified prop capsule count"),
                    Rendered[Side].Num(), Certified.Num());
                // During a soft entry the solver can move each wrist separately.
                // Its candidate capsules follow that wrist, whereas OriginalHeldPropCapsules
                // deliberately retain the pre-solve pose.
                const FVector CandidateShift = EntryResult.Arms[Side].Wrist.GetLocation()
                    - EntryResult.OriginalWrists[Side];
                for (int32 Capsule = 0; Capsule < FMath::Min(Rendered[Side].Num(), Certified.Num()); ++Capsule)
                {
                    TestTrue(TEXT("Entering performance renders certified prop capsule geometry"),
                        Rendered[Side][Capsule].Start.Equals(Certified[Capsule].Start + CandidateShift, .02f) &&
                        Rendered[Side][Capsule].End.Equals(Certified[Capsule].End + CandidateShift, .02f) &&
                        FMath::IsNearlyEqual(Rendered[Side][Capsule].RadiusCm, Certified[Capsule].RadiusCm, .001f));
                }
            }
        }
    }
    for (int32 Index = 0; Index < 20; ++Index) Step(.1f);
    Session.Seek(0.f);
    Step(.05f);
    TestTrue(TEXT("Legacy staff begins with visible prop grips on calibrated palms"),
        FMath::IsFinite(Prop->GetActualGripErrorCm()) && Prop->GetActualGripErrorCm() <= .2f);
    // The installed staff score repeats at a half-cycle: .2 and .7 differ
    // by only .056 cm at its prop root. Choose visibly distinct source frames
    // (.125 and .7) so a frozen body or prop cannot satisfy the seek check.
    Session.Seek(Session.GetLength() * .125f);
    Step(.05f);
    const float FirstTime = Session.GetTime();
    const FVector FirstHand = Body->GetSocketLocation(TEXT("LeftHand"));
    const FVector FirstProp = Prop->GetPropRootTransform(true).GetLocation();
    TestTrue(TEXT("Paused seek chooses the shared clock"),
        FMath::IsNearlyEqual(FirstTime, Session.GetLength() * .125f, .002f));
    TestTrue(TEXT("Paused seek evaluates finite body and prop transforms"),
        Finite(FirstHand) && Finite(FirstProp) && FMath::IsFinite(Prop->GetPropAnchorErrorCm()));

    Session.Seek(Session.GetLength() * .7f);
    Step(.05f);
    const FVector SecondHand = Body->GetSocketLocation(TEXT("LeftHand"));
    const FTransform SecondLeftProp = Prop->GetPropRootTransform(true);
    const FTransform SecondRightProp = Prop->GetPropRootTransform(false);
    const FVector SecondProp = SecondLeftProp.GetLocation();
    TestTrue(TEXT("Seek moves the body and paired prop to another sample"),
        FVector::Distance(FirstHand, SecondHand) > .1f && FVector::Distance(FirstProp, SecondProp) > .1f);
    TestTrue(TEXT("Settled legacy props meet the calibrated visible palms"),
        FMath::IsFinite(Prop->GetActualGripErrorCm()) && Prop->GetActualGripErrorCm() <= .2f);
    if (const UFlowFestAnimInstance* LegacyAnimator = Cast<UFlowFestAnimInstance>(Body->GetAnimInstance()))
    {
        FFlowFestGripCalibration Calibrations[2];
        FVector EvaluatedPalm[2];
        if (!TestTrue(TEXT("Legacy prepared clip has calibrated dynamic grip geometry"),
            Prop->GetGripCalibrations(Calibrations) &&
            LegacyAnimator->GetEvaluatedPalmLocalOffsets(EvaluatedPalm))) return false;
        for (int32 Side = 0; Side < 2; ++Side)
        {
            const TCHAR* Names[2][4] = {
                {TEXT("LeftHand"), TEXT("LeftHandMiddle1"), TEXT("LeftHandMiddle2"), TEXT("LeftHandMiddle3")},
                {TEXT("RightHand"), TEXT("RightHandMiddle1"), TEXT("RightHandMiddle2"), TEXT("RightHandMiddle3")}};
            const FTransform Hand = Body->GetSocketTransform(Names[Side][0], RTS_World);
            const FVector Expected = MeasureFlowFestGripChannel(Calibrations[Side],
                Hand.InverseTransformPosition(Body->GetSocketLocation(Names[Side][1])),
                Hand.InverseTransformPosition(Body->GetSocketLocation(Names[Side][2])),
                Hand.InverseTransformPosition(Body->GetSocketLocation(Names[Side][3])));
            TestTrue(TEXT("Legacy socket follows this frame's posed middle-finger channel"),
                EvaluatedPalm[Side].Equals(Expected, .02f));
        }
    }
    TestTrue(TEXT("Paired prop remains near the captured hand anchor"),
        FMath::IsFinite(Prop->GetPropAnchorErrorCm()) && Prop->GetPropAnchorErrorCm() < 8.f);
    Step(.1f);
    TestTrue(TEXT("Pause holds the body and prop sample through ticks"),
        FMath::IsNearlyEqual(Session.GetTime(), Session.GetLength() * .7f, .002f) &&
        FVector::Distance(SecondHand, Body->GetSocketLocation(TEXT("LeftHand"))) < .01f &&
        SecondLeftProp.Equals(Prop->GetPropRootTransform(true), .01f) &&
        SecondRightProp.Equals(Prop->GetPropRootTransform(false), .01f));

    // The solver works in skeletal component space; normalized character
    // presentation and a moving/rotating owner must transform its one common
    // offset without rotating the source pattern or accumulating on pause.
    const FTransform OriginalOwner = Actor->GetActorTransform();
    Actor->SetActorTransform(FTransform(FRotator(0.f, 61.f, 0.f), FVector(120.f, -80.f, 15.f), FVector(1.25f)));
    Prop->SetPerformanceTime(Session.GetTime());
    const FTransform Unshifted[2] = {Prop->GetPropRootTransform(true), Prop->GetPropRootTransform(false)};
    const FVector ComponentShift(2.f, 7.f, 3.f);
    const FVector ExpectedWorldShift = Body->GetComponentTransform().TransformVector(ComponentShift);
    Prop->SetPerformanceTime(Session.GetTime(), 1.f, nullptr, ComponentShift);
    const FTransform Shifted[2] = {Prop->GetPropRootTransform(true), Prop->GetPropRootTransform(false)};
    Prop->SetPerformanceTime(Session.GetTime(), 1.f, nullptr, ComponentShift);
    for (int32 Side = 0; Side < 2; ++Side)
    {
        TestTrue(TEXT("Common correction uses full mesh transform and preserves prop orientation"),
            (Shifted[Side].GetLocation() - Unshifted[Side].GetLocation()).Equals(ExpectedWorldShift, .001f) &&
            Shifted[Side].GetRotation().Equals(Unshifted[Side].GetRotation(), .0001f));
        TestTrue(TEXT("Repeated paused correction never accumulates"),
            Shifted[Side].Equals(Prop->GetPropRootTransform(Side == 0), .001f));
    }
    TestTrue(TEXT("Common correction preserves relative paired prop geometry"),
        (Shifted[0].GetLocation() - Shifted[1].GetLocation()).Equals(
            Unshifted[0].GetLocation() - Unshifted[1].GetLocation(), .001f));
    Prop->SetPerformanceTime(Session.GetTime());
    TestTrue(TEXT("Zero correction restores immutable sampled roots"),
        Unshifted[0].Equals(Prop->GetPropRootTransform(true), .001f) &&
        Unshifted[1].Equals(Prop->GetPropRootTransform(false), .001f));
    Actor->SetActorTransform(OriginalOwner);
    Step(0.f);

    FString TransferJson;
    FFlowArtsPerformanceSession Reopened(Avatar, Prop);
    TestTrue(TEXT("Reopened controls attach without changing playback"), Reopened.AttachCurrent(Library) &&
        Reopened.GetSelected() == Entry && Reopened.IsPaused() &&
        FMath::IsNearlyEqual(Reopened.GetTime(), Session.GetLength() * .7f, .002f));
    if (!TestTrue(TEXT("Reopened performance copies transfer"), Reopened.CopyTransfer(TransferJson))) return false;
    const FString EvidenceDirectory = FPaths::ProjectSavedDir() / TEXT("Automation");
    IFileManager::Get().MakeDirectory(*EvidenceDirectory, true);
    TestTrue(TEXT("Native transfer evidence saved"), FFileHelper::SaveStringToFile(TransferJson,
        *(EvidenceDirectory / TEXT("PerformanceTransfer.json")), FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM));
    FFlowArtsPerformanceTransfer Transfer;
    if (!TestTrue(TEXT("Copied transfer parses"),
        FFlowArtsPerformanceLibrary::ParseTransfer(TransferJson, Transfer, Error))) return false;
    TestEqual(TEXT("Transfer retains exact sequence text"), Transfer.SequenceJson, Entry->SequenceJson);
    TestEqual(TEXT("Transfer retains exact sequence hash"), Transfer.SequenceSHA256, Entry->SequenceSHA256);
    TestEqual(TEXT("Transfer retains selected character"), Transfer.CharacterId, Entry->CharacterId);
    TestEqual(TEXT("Transfer retains selected prop family"), Transfer.PropFamily, Entry->PropFamily);
    TestTrue(TEXT("Transfer retains playback state"), Transfer.bPaused &&
        FMath::IsNearlyEqual(Transfer.Phase, .7f, .0001f) && FMath::IsNearlyEqual(Transfer.Rate, 1.25f));
    const TArray<const FFlowArtsPerformanceEntry*> Matches = Library.Find(Transfer);
    TestTrue(TEXT("Copied transfer matches its exact prepared entry"), Matches.Num() == 1 && Matches[0] == Entry);
    if (!TestTrue(TEXT("Exact transfer restores the same session"), Session.Play(*Entry, &Transfer, Error))) return false;
    Step(.05f);
    TestTrue(TEXT("Restored transfer stays paused at its sample and rate"), Session.IsPaused() &&
        FMath::IsNearlyEqual(Session.GetTime(), Session.GetLength() * .7f, .002f) &&
        FMath::IsNearlyEqual(Session.GetRate(), 1.25f));
    TestTrue(TEXT("Restored body and prop evaluate the same paused sample"),
        Finite(Body->GetSocketLocation(TEXT("LeftHand"))) &&
        Finite(Prop->GetPropRootTransform(true).GetLocation()) &&
        Prop->GetPropAnchorErrorCm() < 8.f);

    const float BeforeRejectedPlay = Session.GetTime();
    Transfer.Phase = 1.f;
    TestFalse(TEXT("Out-of-range direct transfer is refused"), Session.Play(*Entry, &Transfer, Error));
    TestTrue(TEXT("Invalid direct transfer preserves active playback"), Session.GetSelected() == Entry &&
        Session.IsPaused() && FMath::IsNearlyEqual(Session.GetTime(), BeforeRejectedPlay, .002f));
    Transfer.Phase = .7f;
    Transfer.PropFamily = TEXT("poi");
    TestFalse(TEXT("Mismatched transfer selection is refused"), Session.Play(*Entry, &Transfer, Error));
    TestTrue(TEXT("Selection refusal preserves active playback"), Session.GetSelected() == Entry &&
        Session.IsPaused() && FMath::IsNearlyEqual(Session.GetTime(), BeforeRejectedPlay, .002f));
    FFlowArtsPerformanceEntry Unsupported = *Entry;
    Unsupported.Profile = TEXT("MissingPreparedProfile");
    TestFalse(TEXT("Missing prepared body profile is refused"), Session.Play(Unsupported, nullptr, Error));
    TestTrue(TEXT("Missing profile preserves active playback"), Session.GetSelected() == Entry &&
        Session.IsPaused() && FMath::IsNearlyEqual(Session.GetTime(), BeforeRejectedPlay, .002f));

    Session.Pause(false);
    Step(.05f);
    TestTrue(TEXT("Resume advances at transferred rate"),
        FMath::IsNearlyEqual(Session.GetTime() - BeforeRejectedPlay, .0625f, .002f));
    Session.Restart();
    TestTrue(TEXT("Restart returns to zero and resumes"),
        FMath::IsNearlyZero(Session.GetTime()) && !Session.IsPaused());

    const FFlowArtsPerformanceEntry* Other = nullptr;
    for (const FFlowArtsPerformanceEntry* Candidate : Entries)
        if (Candidate->Profile != Entry->Profile) { Other = Candidate; break; }
    if (!TestNotNull(TEXT("Transition regression requires two distinct prepared staff routines"), Other)) return false;
    UFlowFestAnimInstance* Animator = Cast<UFlowFestAnimInstance>(Body->GetAnimInstance());
    if (!TestNotNull(TEXT("Transition animator"), Animator)) return false;
    for (int32 Index = 0; Index < 20; ++Index) Step(.1f);
    if (!TestTrue(TEXT("Second routine starts a real outgoing transition"),
        Session.Play(*Other, nullptr, Error) && Animator->GetOutgoingPerformanceCount() > 0)) return false;
    float TargetOnlyMismatchCm = 0.f;
    const auto CheckTransition = [&](float IncomingWeight, const TCHAR* Label)
    {
        // Advance the real .30-second response to an exact blend fraction.
        for (int32 Index = 0; Index < 64 && Animator->GetPerformanceWeight() < IncomingWeight - .0001f; ++Index)
        {
            const float Remaining = -.30f * FMath::Loge((1.f - IncomingWeight) /
                (1.f - Animator->GetPerformanceWeight()));
            Step(FMath::Clamp(Remaining, .00001f, .05f));
        }
        TestTrue(*FString::Printf(TEXT("%s reaches requested incoming weight"), Label),
            FMath::IsNearlyEqual(Animator->GetPerformanceWeight(), IncomingWeight, .002f));
        TestTrue(*FString::Printf(TEXT("%s still has an outgoing source"), Label),
            Animator->GetOutgoingPerformanceCount() > 0);
        FVector PalmLocal[2];
        if (!TestTrue(TEXT("Evaluated palm points are available"),
            Animator->GetEvaluatedPalmLocalOffsets(PalmLocal))) return;
        const FVector GripWorld[2] = {
            Body->GetSocketTransform(TEXT("LeftHand"), RTS_World).TransformPosition(PalmLocal[0]),
            Body->GetSocketTransform(TEXT("RightHand"), RTS_World).TransformPosition(PalmLocal[1])};
        const FTransform BeforeOffset[2] = {Prop->GetPropRootTransform(true), Prop->GetPropRootTransform(false)};
        Prop->SetPerformanceTime(Animator->GetPerformanceTime(), Animator->GetPerformanceWeight(), Animator, ComponentShift);
        TestTrue(*FString::Printf(TEXT("%s evaluated-wrist anchoring never applies a second offset"), Label),
            BeforeOffset[0].Equals(Prop->GetPropRootTransform(true), .001f) &&
            BeforeOffset[1].Equals(Prop->GetPropRootTransform(false), .001f));
        Prop->SetPerformanceTime(Animator->GetPerformanceTime(), Animator->GetPerformanceWeight(), Animator,
            Animator->GetArmClearance().SharedPerformanceTranslationCm);
        TestTrue(*FString::Printf(TEXT("%s actual prop grips stay on evaluated wrists"), Label),
            FMath::IsFinite(Prop->GetActualGripErrorCm()) && Prop->GetActualGripErrorCm() < .1f);
        TArray<FFlowArtsClearanceCapsule> Sampled[2], Rendered[2], TargetOnly[2];
        const FTransform MeshWorld = Body->GetComponentTransform();
        if (!TestTrue(*FString::Printf(TEXT("%s shared transition geometry samples"), Label),
            Prop->SampleClearanceCapsules(Animator->GetPerformanceProfile(), Animator->GetPerformanceTime(),
                MeshWorld, Sampled[0], Sampled[1], nullptr, Animator, GripWorld))) return;
        // NAME_None samples the actual scene components, independently of any track.
        if (!TestTrue(*FString::Printf(TEXT("%s rendered geometry samples"), Label),
            Prop->SampleClearanceCapsules(NAME_None, 0.f, MeshWorld, Rendered[0], Rendered[1]))) return;
        Prop->SampleClearanceCapsules(Animator->GetPerformanceProfile(), Animator->GetPerformanceTime(),
            MeshWorld, TargetOnly[0], TargetOnly[1]);
        for (int32 Side = 0; Side < 2; ++Side)
        {
            TestEqual(*FString::Printf(TEXT("%s side %d capsule count matches visible mesh"), Label, Side),
                Sampled[Side].Num(), Rendered[Side].Num());
            for (int32 Index = 0; Index < FMath::Min(Sampled[Side].Num(), Rendered[Side].Num()); ++Index)
            {
                const FFlowArtsClearanceCapsule& A = Sampled[Side][Index];
                const FFlowArtsClearanceCapsule& B = Rendered[Side][Index];
                TestTrue(*FString::Printf(TEXT("%s side %d sampled capsule matches rendered endpoints/radius"), Label, Side),
                    A.Start.Equals(B.Start, .02f) && A.End.Equals(B.End, .02f) &&
                    FMath::IsNearlyEqual(A.RadiusCm, B.RadiusCm, .001f));
                if (TargetOnly[Side].IsValidIndex(Index))
                    TargetOnlyMismatchCm = FMath::Max(TargetOnlyMismatchCm,
                        FVector::Distance(TargetOnly[Side][Index].Start, B.Start));
            }
        }
    };
    CheckTransition(.25f, TEXT("Quarter transition"));
    CheckTransition(.50f, TEXT("Half transition"));
    CheckTransition(.75f, TEXT("Three-quarter transition"));
    if (!TestTrue(TEXT("An unfinished switch can be interrupted by the first routine"),
        Session.Play(*Entry, nullptr, Error) && Animator->GetOutgoingPerformanceCount() > 0)) return false;
    CheckTransition(.50f, TEXT("Interrupted half transition"));
    TestTrue(TEXT("Fixture exposes target-only obstacle mismatch rather than identical tracks"),
        TargetOnlyMismatchCm > .1f);
    TestTrue(TEXT("Unlisted legacy built-in still plays its prepared clip"),
        Session.PlayBuiltIn(Entry->Profile, Error) && !Avatar->GetRuntimeMotion());
    TestTrue(TEXT("Direct legacy playback clears stale session selection"), Session.GetSelected() == nullptr);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsRuntimeFamilyOverrideTest,
    "FlowArts.Runtime.FamilyOverrideSession",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsRuntimeFamilyOverrideTest::RunTest(const FString& Parameters)
{
    FFlowArtsPerformanceLibrary Library;
    FString Error;
    if (!TestTrue(TEXT("Prepared library loads"), FFlowArtsPerformanceLibrary::LoadFromProject(Library, Error))) return false;
    const auto Entries = Library.ForTarget(TEXT("x-bot"), TEXT("staff"));
    const FFlowArtsPerformanceEntry* A = nullptr;
    const FFlowArtsPerformanceEntry* B = nullptr;
    for (const auto* Entry : Entries)
    {
        if (Entry->Profile == TEXT("P_staff_A")) A = Entry;
        if (Entry->Profile == TEXT("P_staff_B")) B = Entry;
    }
    if (!TestNotNull(TEXT("Override A score"), A) || !TestNotNull(TEXT("Override B score"), B)) return false;

    UWorld::InitializationValues Settings;
    Settings.AllowAudioPlayback(false).CreatePhysicsScene(false).CreateNavigation(false).CreateAISystem(false);
    UWorld* World = UWorld::CreateWorld(EWorldType::Game, false,
        MakeUniqueObjectName(GetTransientPackage(), UWorld::StaticClass(), TEXT("FamilyOverrideSessionWorld")),
        GetTransientPackage(), true, ERHIFeatureLevel::Num, &Settings);
    if (!TestNotNull(TEXT("Transient override world"), World)) return false;
    struct FDestroyWorld { UWorld* Value; ~FDestroyWorld() { Value->DestroyWorld(false); } } Cleanup{World};
    AActor* Actor = World->SpawnActor<AActor>();
    if (!TestNotNull(TEXT("Override performer"), Actor)) return false;
    USceneComponent* Root = NewObject<USceneComponent>(Actor);
    Actor->SetRootComponent(Root);
    Root->RegisterComponent();
    UFlowFestAvatarComponent* Avatar = NewObject<UFlowFestAvatarComponent>(Actor);
    UFlowFestPropComponent* Prop = NewObject<UFlowFestPropComponent>(Actor);
    Avatar->RegisterComponent();
    Prop->RegisterComponent();
    Avatar->Initialize(Root, TEXT("x-bot"));
    Prop->Initialize(Root);
    if (!TestTrue(TEXT("Override target is ready"), Prop->BindHands(Avatar->GetBodyMesh()) &&
        Prop->Equip(TEXT("staff")) && Prop->IsReady())) return false;
    FFlowArtsPerformanceSession Session(Avatar, Prop);
    FFlowArtsPerformanceTransfer Transfer;
    Transfer.SequenceSHA256 = A->SequenceSHA256;
    Transfer.SequenceJson = A->SequenceJson;
    Transfer.CharacterId = A->CharacterId;
    Transfer.PropFamily = A->PropFamily;
    Transfer.Phase = .37f;
    Transfer.Rate = 1.25f;
    Transfer.bPaused = true;
    if (!TestTrue(TEXT("Packaged A plays with exact transfer"), Session.Play(*A, &Transfer, Error)))
    {
        AddError(Error);
        return false;
    }
    const auto Motion = Avatar->GetRuntimeMotion();
    TestTrue(TEXT("Built-in override installs complete runtime motion and original selection"),
        Motion.IsValid() && Session.GetSelected() == A && Session.IsPaused() &&
        FMath::IsNearlyEqual(Session.GetTime(), Session.GetLength() * .37f, .002f) &&
        FMath::IsNearlyEqual(Session.GetRate(), 1.25f));
    FFlowArtsPerformanceSession Reopened(Avatar, Prop);
    TestTrue(TEXT("Reopened controls recover the exact prepared entry"),
        Reopened.AttachCurrent(Library) && Reopened.GetSelected() == A);
    FString TransferJson;
    TestTrue(TEXT("Reopened transfer retains prepared identity"), Reopened.CopyTransfer(TransferJson) &&
        TransferJson.Contains(A->SequenceSHA256));

    FFlowArtsPerformanceEntry WrongScore = *A;
    WrongScore.SequenceSHA256 = B->SequenceSHA256;
    WrongScore.SequenceJson = B->SequenceJson;
    TestFalse(TEXT("A profile cannot select a B score bundle"), Session.Play(WrongScore, nullptr, Error));
    TestTrue(TEXT("Identity rejection leaves the playing override intact"),
        Session.GetSelected() == A && Avatar->GetRuntimeMotion() == Motion && Session.IsPaused());

    const FString EmptyDirectory = FPaths::ProjectSavedDir() / TEXT("Automation") /
        (FString(TEXT("MissingFamilyOverride-")) + FGuid::NewGuid().ToString());
    Session.SetFamilyOverrideDirectoryForTests(EmptyDirectory);
    TestFalse(TEXT("Declared override never silently falls back when manifest is absent"),
        Session.Play(*A, nullptr, Error));
    TestTrue(TEXT("Missing declaration preserves previous playback"),
        Session.GetSelected() == A && Avatar->GetRuntimeMotion() == Motion && Session.IsPaused());

    const FString BadDirectory = FPaths::ProjectSavedDir() / TEXT("Automation") /
        (FString(TEXT("InvalidFamilyOverride-")) + FGuid::NewGuid().ToString());
    IFileManager::Get().MakeDirectory(*BadDirectory, true);
    const FString BadManifest = BadDirectory / TEXT("manifest.json");
    struct FDeleteManifest { FString Path, Directory; ~FDeleteManifest() {
        IFileManager::Get().Delete(*Path); IFileManager::Get().DeleteDirectory(*Directory);
    } } Delete{BadManifest, BadDirectory};
    if (!TestTrue(TEXT("Malformed override fixture writes"), FFileHelper::SaveStringToFile(TEXT("{}"), *BadManifest)))
        return false;
    Session.SetFamilyOverrideDirectoryForTests(BadDirectory);
    TestFalse(TEXT("Malformed declared override never silently falls back"), Session.Play(*A, nullptr, Error));
    TestTrue(TEXT("Malformed declaration preserves previous playback"),
        Session.GetSelected() == A && Avatar->GetRuntimeMotion() == Motion && Session.IsPaused());
    return true;
}
#endif
