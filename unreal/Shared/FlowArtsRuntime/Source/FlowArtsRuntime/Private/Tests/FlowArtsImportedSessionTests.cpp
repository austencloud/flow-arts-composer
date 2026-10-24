#if WITH_DEV_AUTOMATION_TESTS
#include "FlowArtsPerformanceLibrary.h"
#include "FlowArtsPerformanceSession.h"
#include "FlowArtsRuntimeMotion.h"
#include "FlowFestAvatarComponent.h"
#include "FlowFestAnimInstance.h"
#include "FlowFestPropComponent.h"

#include "Components/SceneComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Dom/JsonObject.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "HAL/FileManager.h"
#include "Misc/AutomationTest.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "UObject/UObjectGlobals.h"

// File-backed API acceptance, not a Slate interaction test. Require fresh real
// exports rather than manufacturing an identity that bypasses the importer.
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsImportedSessionTest,
    "FlowArts.Runtime.ImportedMotion.Session",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsImportedSessionTest::RunTest(const FString& Parameters)
{
    FString Directory;
    if (!FParse::Value(FCommandLine::Get(), TEXT("FlowFestMotionTestDir="), Directory) ||
        !IFileManager::Get().DirectoryExists(*Directory))
    {
        AddError(TEXT("Imported session requires -FlowFestMotionTestDir=<fresh exported fixtures>"));
        return false;
    }
    struct FFixture { FString Path, Character, Prop; };
    TArray<FString> Files;
    IFileManager::Get().FindFilesRecursive(Files, *Directory, TEXT("*.motion.json"), true, false);
    Files.Sort();
    TArray<FFixture> Fixtures;
    int32 MirroredIndex = INDEX_NONE;
    for (const FString& File : Files)
    {
        FString Json;
        TSharedPtr<FJsonObject> Object;
        FFixture Fixture;
        Fixture.Path = File;
        if (!FFileHelper::LoadFileToString(Json, *File) ||
            !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json), Object) || !Object ||
            !Object->TryGetStringField(TEXT("characterId"), Fixture.Character) ||
            !Object->TryGetStringField(TEXT("propId"), Fixture.Prop))
        {
            AddError(FString::Printf(TEXT("Cannot read exported fixture identity: %s"), *File));
            return false;
        }
        if (Fixture.Prop == TEXT("buugeng:mirrored-ba")) MirroredIndex = Fixtures.Num();
        Fixtures.Add(MoveTemp(Fixture));
    }
    if (!TestTrue(TEXT("Fixture set contains an exact buugeng:mirrored-ba export"),
        Fixtures.IsValidIndex(MirroredIndex))) return false;
    const FFixture& Mirrored = Fixtures[MirroredIndex];
    const FFixture* Other = Fixtures.FindByPredicate([&](const FFixture& Fixture) {
        return Fixture.Character == Mirrored.Character && Fixture.Path != Mirrored.Path &&
            Fixture.Prop != Mirrored.Prop;
    });
    if (!TestNotNull(TEXT("Fixture set contains another prop export for the same character"), Other)) return false;

    UWorld::InitializationValues Settings;
    Settings.AllowAudioPlayback(false).CreatePhysicsScene(false).CreateNavigation(false).CreateAISystem(false);
    UWorld* World = UWorld::CreateWorld(EWorldType::Game, false,
        MakeUniqueObjectName(GetTransientPackage(), UWorld::StaticClass(), TEXT("ImportedSessionWorld")),
        GetTransientPackage(), true, ERHIFeatureLevel::Num, &Settings);
    if (!TestNotNull(TEXT("Transient import world"), World)) return false;
    struct FDestroyWorld { UWorld* Value; ~FDestroyWorld() { Value->DestroyWorld(false); } } Cleanup{World};
    AActor* Actor = World->SpawnActor<AActor>();
    if (!TestNotNull(TEXT("Import performer"), Actor)) return false;
    USceneComponent* Root = NewObject<USceneComponent>(Actor);
    Actor->SetRootComponent(Root);
    Root->RegisterComponent();
    UFlowFestAvatarComponent* Avatar = NewObject<UFlowFestAvatarComponent>(Actor);
    UFlowFestPropComponent* Prop = NewObject<UFlowFestPropComponent>(Actor);
    Avatar->RegisterComponent();
    Prop->RegisterComponent();
    Avatar->Initialize(Root, FName(*Mirrored.Character));
    Prop->Initialize(Root);
    USkeletalMeshComponent* Body = Avatar->GetBodyMesh();
    if (!TestNotNull(TEXT("Imported body"), Body) ||
        !TestTrue(TEXT("Real hands bind"), Prop->BindHands(Body))) return false;
    FFlowArtsPerformanceSession Session(Avatar, Prop);
    FString Error;
    if (!TestTrue(TEXT("Preflight fixture prop equips"), Prop->Equip(FName(*Mirrored.Prop)))) return false;
    UClass* AnimatorClass = Body->GetAnimInstance() ? Body->GetAnimInstance()->GetClass() : nullptr;
    if (!TestNotNull(TEXT("Preflight fixture has runtime animator"), AnimatorClass)) return false;
    Body->SetAnimInstanceClass(nullptr);
    const FTransform PreflightLeft = Prop->GetPropRootTransform(true);
    const FTransform PreflightRight = Prop->GetPropRootTransform(false);
    TestFalse(TEXT("Missing body animator rejects import before prop installation"),
        Session.ImportMotionFile(Mirrored.Path, Error));
    TestTrue(TEXT("Body preflight explains unavailable animation"), Error.Contains(TEXT("animation is not ready")));
    TestTrue(TEXT("Body preflight preserves props and selection"), !Session.GetSelected() &&
        PreflightLeft.Equals(Prop->GetPropRootTransform(true), 0.f) &&
        PreflightRight.Equals(Prop->GetPropRootTransform(false), 0.f));
    // Recreate through the production setup so its clip map and asset folder
    // are restored along with the animation instance.
    if (!TestTrue(TEXT("Character setup restores animation after preflight failure"),
        Avatar->SetCharacter(FName(*Mirrored.Character)))) return false;
    const auto Step = [&](float Seconds) {
        World->TimeSeconds += Seconds;
        Body->TickAnimation(Seconds, false);
        Body->RefreshBoneTransforms();
        Avatar->TickComponent(Seconds, LEVELTICK_All, nullptr);
        Prop->TickComponent(Seconds, LEVELTICK_All, nullptr);
    };
    const auto Import = [&](const FFixture& Fixture) {
        if (!TestTrue(TEXT("Exact fixture prop equips"), Prop->Equip(FName(*Fixture.Prop)) && Prop->IsReady())) return false;
        const bool bLoaded = Session.ImportMotionFile(Fixture.Path, Error);
        if (!TestTrue(*FString::Printf(TEXT("Real ImportMotionFile succeeds: %s (%s)"), *Fixture.Path, *Error), bLoaded)) return false;
        const auto Motion = Avatar->GetRuntimeMotion();
        if (!TestTrue(TEXT("Import installs immutable runtime payload"), Motion.IsValid()) ||
            !TestNotNull(TEXT("Import selects runtime entry"), Session.GetSelected())) return false;
        TestEqual(TEXT("Exact variant survives import"), Motion->GetPropId(), Fixture.Prop);
        TestEqual(TEXT("Runtime selection uses payload profile"), Session.GetSelected()->Profile, Motion->GetProfile());
        TestTrue(TEXT("Runtime clock uses exact capture duration"),
            FMath::IsNearlyEqual(Session.GetLength(), Motion->GetDurationSeconds(), .00001f));
        return true;
    };
    if (!Import(Mirrored)) return false;
    Session.SetRate(1.25f);
    Session.Pause(true);
    Session.Seek(Session.GetLength() * .37f);
    Step(.05f);

    // Equip is an explicit independent mutation. Snapshot AFTER equipping the
    // wrong build, so any later change is attributable to the rejected import.
    if (!TestTrue(TEXT("Different same-family variant equips"), Prop->Equip(TEXT("buugeng:mirrored-ab")))) return false;
    const auto BeforeMotion = Avatar->GetRuntimeMotion();
    const FName BeforeProfile = Session.GetSelected()->Profile;
    const float BeforeTime = Session.GetTime(), BeforeLength = Session.GetLength();
    const FTransform BeforeLeft = Prop->GetPropRootTransform(true), BeforeRight = Prop->GetPropRootTransform(false);
    TestFalse(TEXT("Same family with wrong exact mirrored build is rejected"),
        Session.ImportMotionFile(Mirrored.Path, Error));
    TestTrue(TEXT("Variant refusal explains required exact build"), Error.Contains(TEXT("buugeng:mirrored-ba")));
    TestTrue(TEXT("Rejected import preserves payload, selection, clock, rate and pause"),
        Avatar->GetRuntimeMotion() == BeforeMotion && Session.GetSelected() &&
        Session.GetSelected()->Profile == BeforeProfile && Session.GetTime() == BeforeTime &&
        Session.GetLength() == BeforeLength && Session.GetRate() == 1.25f && Session.IsPaused());
    TestTrue(TEXT("Rejected import leaves equipped variant and prop transforms unchanged"),
        Prop->GetPropId() == TEXT("buugeng:mirrored-ab") &&
        BeforeLeft.Equals(Prop->GetPropRootTransform(true), 0.f) &&
        BeforeRight.Equals(Prop->GetPropRootTransform(false), 0.f));
    Step(.025f);
    TestTrue(TEXT("Refused import leaves paused clock held through evaluation"), Session.GetTime() == BeforeTime);
    Session.Pause(false);
    const float AdvanceSeconds = FMath::Min(.02f, BeforeLength * .1f / 1.25f);
    Step(AdvanceSeconds);
    TestTrue(TEXT("Refused import leaves original playback able to advance"),
        FMath::IsNearlyEqual(Session.GetTime(), BeforeTime + AdvanceSeconds * 1.25f, .002f));

    if (!Import(Mirrored)) return false;
    Session.SetRate(1.25f);
    Session.Pause(true);
    Session.Seek(Session.GetLength() * .7f);
    Step(.05f);
    const float PausedTime = Session.GetTime();
    Step(.025f);
    TestTrue(TEXT("Imported pause and seek hold shared clock"), Session.IsPaused() &&
        FMath::IsNearlyEqual(PausedTime, Session.GetLength() * .7f, .002f) && Session.GetTime() == PausedTime);
    FFlowArtsPerformanceLibrary EmptyLibrary;
    FFlowArtsPerformanceSession Reopened(Avatar, Prop);
    if (!TestTrue(TEXT("Reopen discovers runtime import without prepared library entry"),
        Reopened.AttachCurrent(EmptyLibrary))) return false;
    TestTrue(TEXT("Reopen preserves runtime identity and transport state"),
        Reopened.GetSelected()->Profile == Session.GetSelected()->Profile && Reopened.IsPaused() &&
        Reopened.GetTime() == PausedTime && Reopened.GetRate() == 1.25f);
    FString TransferJson;
    FFlowArtsPerformanceTransfer Transfer;
    if (!TestTrue(TEXT("Imported session copies score"), Reopened.CopyTransfer(TransferJson)) ||
        !TestTrue(TEXT("Copied imported score parses"),
            FFlowArtsPerformanceLibrary::ParseTransfer(TransferJson, Transfer, Error))) return false;
    const auto CurrentMotion = Avatar->GetRuntimeMotion();
    TestTrue(TEXT("Copy score retains exact source snapshot and target"),
        Transfer.SequenceJson == CurrentMotion->GetSequenceJson() &&
        Transfer.SequenceSHA256 == CurrentMotion->GetSequenceSHA256() &&
        Transfer.CharacterId == FName(*Mirrored.Character) && Transfer.PropFamily == TEXT("buugeng"));
    TestTrue(TEXT("Copy score retains phase, rate and pause"), Transfer.bPaused &&
        FMath::IsNearlyEqual(Transfer.Phase, .7f, .0001f) && Transfer.Rate == 1.25f);

    // Reimport the actual file, including quoted-path handling, then interrupt
    // its entry with another genuine capture. This exercises the import API,
    // not prepared-entry Play or generated in-memory bundle mutations.
    if (!TestTrue(TEXT("Same exact file reloads from a quoted path"),
        Session.ImportMotionFile(FString::Printf(TEXT("\"%s\""), *Mirrored.Path), Error))) return false;
    Step(.025f);
    const FName ReloadProfile = Avatar->GetRuntimeMotion()->GetProfile();
    if (!Import(*Other)) return false;
    TestTrue(TEXT("Switch installs distinct actual payload"), Avatar->GetRuntimeMotion()->GetProfile() != ReloadProfile);
    const UFlowFestAnimInstance* Animator = Cast<UFlowFestAnimInstance>(Body->GetAnimInstance());
    TestTrue(TEXT("Imported switch retains a real outgoing track for entry blending"),
        Animator && Animator->GetOutgoingPerformanceCount() > 0);
    Step(.025f);
    Session.Pause(true);
    Session.Seek(Session.GetLength() * .2f);
    Step(.025f);
    TestTrue(TEXT("Incoming imported track responds to pause and seek during entry"),
        Session.IsPaused() && FMath::IsNearlyEqual(Session.GetTime(), Session.GetLength() * .2f, .002f));
    if (!Import(Mirrored)) return false;
    Step(.025f);
    Session.Restart();
    TestTrue(TEXT("Restart of replaced runtime track resumes at zero"),
        !Session.IsPaused() && FMath::IsNearlyZero(Session.GetTime()));
    TSet<FString> ImportedCharacters;
    for (const FFixture& Fixture : Fixtures)
    {
        if (!TestTrue(TEXT("Exported fixture character installs through production setup"),
            Avatar->SetCharacter(FName(*Fixture.Character))) ||
            !TestTrue(TEXT("Fixture character binds real prop hands"), Prop->BindHands(Body)) ||
            !Import(Fixture)) return false;
        Session.Pause(true);
        Session.Seek(Session.GetLength() * .37f);
        Step(.05f);
        TestTrue(TEXT("Imported fixture evaluates on its selected character and exact clock"),
            Avatar->GetCharacterId() == FName(*Fixture.Character) &&
            FMath::IsNearlyEqual(Session.GetTime(), Session.GetLength() * .37f, .002f));
        ImportedCharacters.Add(Fixture.Character);
    }
    AddInfo(FString::Printf(TEXT("Real runtime imports evaluated %d exported payloads across %d unique character rigs"),
        Fixtures.Num(), ImportedCharacters.Num()));
    AddInfo(FString::Printf(TEXT("Imported session API acceptance used %s and %s"), *Mirrored.Path, *Other->Path));
    return true;
}
#endif
