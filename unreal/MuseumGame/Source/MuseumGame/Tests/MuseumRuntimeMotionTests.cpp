#if WITH_DEV_AUTOMATION_TESTS
#include "../MuseumPerformerStation.h"
#include "FlowArtsPerformanceLibrary.h"
#include "FlowArtsPerformanceSession.h"
#include "FlowArtsRuntimeMotion.h"
#include "FlowFestAvatarComponent.h"
#include "FlowFestPropComponent.h"

#include "Components/SkeletalMeshComponent.h"
#include "Dom/JsonObject.h"
#include "Engine/World.h"
#include "HAL/FileManager.h"
#include "Misc/AutomationTest.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "UObject/UObjectGlobals.h"

// Both inputs must be genuine Composer exports with different edited scores.
// The importer validates the rig digest, score digest and native bone mapping.
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMuseumRuntimeMotionTest,
    "FlowArts.Museum.RuntimeMotion.Replacement",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FMuseumRuntimeMotionTest::RunTest(const FString& Parameters)
{
    struct FFixture { FString Path, SequenceHash; };
    const auto ReadFixture = [this](const TCHAR* Switch, FFixture& Fixture) {
        if (!FParse::Value(FCommandLine::Get(), Switch, Fixture.Path))
        {
            AddError(FString::Printf(TEXT("Museum runtime test requires %s<exported .motion.json>"), Switch));
            return false;
        }
        Fixture.Path = Fixture.Path.TrimStartAndEnd();
        Fixture.Path.RemoveFromStart(TEXT("\""));
        Fixture.Path.RemoveFromEnd(TEXT("\""));
        if (Fixture.Path.IsEmpty() ||
            !IFileManager::Get().FileExists(*Fixture.Path))
        {
            AddError(FString::Printf(TEXT("Museum runtime test requires %s<exported .motion.json>"), Switch));
            return false;
        }
        FString Json;
        TSharedPtr<FJsonObject> Root;
        FString Character, Prop;
        if (!FFileHelper::LoadFileToString(Json, *Fixture.Path) ||
            !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json), Root) || !Root ||
            !Root->TryGetStringField(TEXT("characterId"), Character) ||
            !Root->TryGetStringField(TEXT("propId"), Prop) ||
            !Root->TryGetStringField(TEXT("sequenceSHA256"), Fixture.SequenceHash) ||
            Character != TEXT("x-bot") ||
            (Prop != TEXT("fire_double_staff") && Prop != TEXT("fire_double_staff:default")) ||
            Fixture.SequenceHash.IsEmpty())
        {
            AddError(FString::Printf(TEXT("Fixture must be an x-bot / fire_double_staff Composer export: %s"), *Fixture.Path));
            return false;
        }
        return true;
    };
    FFixture A, B;
    if (!ReadFixture(TEXT("MuseumMotionTestA="), A) ||
        !ReadFixture(TEXT("MuseumMotionTestB="), B)) return false;
    if (!TestTrue(TEXT("Two exports contain distinct edited sequences"),
        A.Path != B.Path && A.SequenceHash != B.SequenceHash)) return false;

    UWorld::InitializationValues Settings;
    Settings.AllowAudioPlayback(false).CreatePhysicsScene(false).CreateNavigation(false).CreateAISystem(false);
    UWorld* World = UWorld::CreateWorld(EWorldType::Game, false,
        MakeUniqueObjectName(GetTransientPackage(), UWorld::StaticClass(), TEXT("MuseumRuntimeMotionWorld")),
        GetTransientPackage(), true, ERHIFeatureLevel::Num, &Settings);
    if (!TestNotNull(TEXT("Isolated Museum game world"), World)) return false;
    struct FDestroyWorld { UWorld* Value; ~FDestroyWorld() { Value->DestroyWorld(false); } } Cleanup{World};
    AMuseumPerformerStation* Station = World->SpawnActor<AMuseumPerformerStation>();
    if (!TestNotNull(TEXT("Physical Museum station"), Station) ||
        !TestTrue(TEXT("Composer station configures"), Station->ConfigureComposerPreview(TEXT("composer-runtime-test")))) return false;
    UFlowFestAvatarComponent* Avatar = Station->GetAvatar();
    UFlowFestPropComponent* Prop = Station->GetProp();
    if (!TestNotNull(TEXT("Station exposes avatar"), Avatar) ||
        !TestNotNull(TEXT("Station exposes physical prop"), Prop)) return false;
    if (!TestTrue(TEXT("Station has ready x-bot and exact double staff"),
        Station->IsReady() && Station->IsPropReady() &&
        Station->GetCharacterId() == TEXT("x-bot") &&
        Avatar->GetCharacterId() == TEXT("x-bot") &&
        Station->GetPropId() == TEXT("fire_double_staff:default") &&
        Prop->GetPropId() == TEXT("fire_double_staff:default") &&
        Avatar->GetBodyMesh() && Avatar->GetBodyMesh()->GetSkeletalMeshAsset())) return false;
    TestEqual(TEXT("Preview label before import"), Station->GetDisplayLabel(), FString(TEXT("Composer preview")));

    const auto Step = [&](float Seconds) {
        World->TimeSeconds += Seconds;
        USkeletalMeshComponent* Body = Avatar->GetBodyMesh();
        Body->TickAnimation(Seconds, false);
        Body->RefreshBoneTransforms();
        Avatar->TickComponent(Seconds, LEVELTICK_All, nullptr);
        Prop->TickComponent(Seconds, LEVELTICK_All, nullptr);
    };
    FString Error;
    const bool bFirstLoaded = Station->LoadMotionFile(A.Path, Error);
    if (!TestTrue(*FString::Printf(TEXT("Station imports first Composer export: %s"), *Error),
        bFirstLoaded)) return false;
    const auto FirstMotion = Avatar->GetRuntimeMotion();
    if (!TestTrue(TEXT("First import installs immutable motion"), FirstMotion.IsValid())) return false;
    TestEqual(TEXT("First edited sequence identity"), FirstMotion->GetSequenceSHA256(), A.SequenceHash);
    TestEqual(TEXT("Station profile follows imported motion"), Station->GetProfile(), FirstMotion->GetProfile());
    TestEqual(TEXT("Station label follows Composer preview"), Station->GetDisplayLabel(), FString(TEXT("Composer preview")));
    FFlowArtsPerformanceSession Session(Avatar, Prop);
    FFlowArtsPerformanceLibrary EmptyLibrary;
    if (!TestTrue(TEXT("Shared transport discovers the station import"), Session.AttachCurrent(EmptyLibrary)) ||
        !TestNotNull(TEXT("Shared transport selects imported entry"), Session.GetSelected())) return false;
    TestEqual(TEXT("Shared selection profile"), Session.GetSelected()->Profile, Station->GetProfile());
    TestTrue(TEXT("First import uses capture duration"),
        FMath::IsNearlyEqual(Session.GetLength(), FirstMotion->GetDurationSeconds(), .00001f));

    Session.SetRate(1.25f);
    Session.Seek(Session.GetLength() * .37f);
    Station->TogglePlayback();
    const float PausedTime = Session.GetTime();
    Step(.025f);
    TestTrue(TEXT("Station toggle pauses shared transport at sought time"),
        Station->IsPaused() && Session.IsPaused() && Session.GetTime() == PausedTime &&
        FMath::IsNearlyEqual(PausedTime, Session.GetLength() * .37f, .002f) && Session.GetRate() == 1.25f);

    const FString MissingPath = FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("MuseumRuntimeMotionTests"),
        TEXT("missing.motion.json"));
    if (!TestFalse(TEXT("Missing file is absent before rejection"), IFileManager::Get().FileExists(*MissingPath))) return false;
    TestFalse(TEXT("Station rejects missing motion"), Station->LoadMotionFile(MissingPath, Error));
    TestTrue(TEXT("Rejected import gives an error"), !Error.IsEmpty());
    Step(.025f);
    TestTrue(TEXT("Rejected import preserves motion, profile, clock, rate and pause"),
        Station->IsReady() && Avatar->GetRuntimeMotion() == FirstMotion &&
        Station->GetProfile() == FirstMotion->GetProfile() &&
        Session.GetTime() == PausedTime && Session.GetRate() == 1.25f && Session.IsPaused());

    Station->TogglePlayback();
    TestTrue(TEXT("Station toggle resumes the imported motion"), Station->IsPlaying() && !Session.IsPaused());
    Station->RestartPlayback();
    TestTrue(TEXT("Station restart resets and resumes shared transport"),
        Station->IsPlaying() && FMath::IsNearlyZero(Session.GetTime()));

    const bool bSecondLoaded = Station->LoadMotionFile(B.Path, Error);
    if (!TestTrue(*FString::Printf(TEXT("Same station imports replacement Composer export: %s"), *Error),
        bSecondLoaded)) return false;
    const auto SecondMotion = Avatar->GetRuntimeMotion();
    if (!TestTrue(TEXT("Replacement installs a new immutable payload"),
        SecondMotion.IsValid() && SecondMotion != FirstMotion)) return false;
    TestEqual(TEXT("Second edited sequence identity"), SecondMotion->GetSequenceSHA256(), B.SequenceHash);
    TestTrue(TEXT("Replacement changes actual score identity on the same performer"),
        SecondMotion->GetSequenceSHA256() != FirstMotion->GetSequenceSHA256() &&
        Station->GetAvatar() == Avatar && Station->GetProp() == Prop &&
        Station->GetProfile() == SecondMotion->GetProfile() &&
        Station->GetPropId() == TEXT("fire_double_staff:default"));
    FFlowArtsPerformanceSession Reopened(Avatar, Prop);
    if (!TestTrue(TEXT("Fresh shared transport discovers replacement"), Reopened.AttachCurrent(EmptyLibrary)) ||
        !TestNotNull(TEXT("Replacement selection"), Reopened.GetSelected())) return false;
    TestEqual(TEXT("Replacement selection profile"), Reopened.GetSelected()->Profile, SecondMotion->GetProfile());
    TestTrue(TEXT("Replacement clock uses second capture duration"),
        FMath::IsNearlyEqual(Reopened.GetLength(), SecondMotion->GetDurationSeconds(), .00001f));
    Reopened.Pause(true);
    Reopened.Seek(Reopened.GetLength() * .23f);
    Step(.025f);
    TestTrue(TEXT("Replaced body and physical prop evaluate finite frames"),
        FMath::IsFinite(Reopened.GetTime()) &&
        !Avatar->GetHandTransform(true).ContainsNaN() &&
        !Avatar->GetHandTransform(false).ContainsNaN() &&
        !Prop->GetPropRootTransform(true).ContainsNaN() &&
        !Prop->GetPropRootTransform(false).ContainsNaN());
    AddInfo(FString::Printf(TEXT("Museum station replaced edited sequence %s with %s without a world or performer rebuild"),
        *A.SequenceHash, *B.SequenceHash));
    return true;
}
#endif
