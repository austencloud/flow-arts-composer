#if WITH_DEV_AUTOMATION_TESTS
#include "FlowArtsPerformanceLibrary.h"
#include "FlowArtsPerformanceSession.h"
#include "FlowFestAvatarComponent.h"
#include "FlowFestPropComponent.h"

#include "Components/SceneComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "Misc/AutomationTest.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "HAL/FileManager.h"
#include "UObject/UObjectGlobals.h"

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
    const TArray<const FFlowArtsPerformanceEntry*> Entries = Library.ForTarget(TEXT("x-bot"), TEXT("staff"));
    if (!TestTrue(TEXT("Installed library has a prepared x-bot/staff entry"), !Entries.IsEmpty())) return false;
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
    Avatar->Initialize(Root, TEXT("x-bot"));
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
    const auto Step = [World, Body, Avatar](float Seconds)
    {
        World->TimeSeconds += Seconds;
        Body->TickAnimation(Seconds, false);
        Body->RefreshBoneTransforms();
        Avatar->TickComponent(Seconds, LEVELTICK_All, nullptr);
    };
    const auto Finite = [](const FVector& Point)
    {
        return FMath::IsFinite(Point.X) && FMath::IsFinite(Point.Y) && FMath::IsFinite(Point.Z);
    };

    Session.SetRate(1.25f);
    Session.Pause(true);
    Session.Seek(Session.GetLength() * .2f);
    Step(.05f);
    const float FirstTime = Session.GetTime();
    const FVector FirstHand = Body->GetSocketLocation(TEXT("LeftHand"));
    const FVector FirstProp = Prop->GetPropRootTransform(true).GetLocation();
    TestTrue(TEXT("Paused seek chooses the shared clock"),
        FMath::IsNearlyEqual(FirstTime, Session.GetLength() * .2f, .002f));
    TestTrue(TEXT("Paused seek evaluates finite body and prop transforms"),
        Finite(FirstHand) && Finite(FirstProp) && FMath::IsFinite(Prop->GetPropAnchorErrorCm()));

    Session.Seek(Session.GetLength() * .7f);
    Step(.05f);
    const FVector SecondHand = Body->GetSocketLocation(TEXT("LeftHand"));
    const FVector SecondProp = Prop->GetPropRootTransform(true).GetLocation();
    TestTrue(TEXT("Seek moves the body and paired prop to another sample"),
        FVector::Distance(FirstHand, SecondHand) > .1f && FVector::Distance(FirstProp, SecondProp) > .1f);
    TestTrue(TEXT("Paired prop remains near the captured hand anchor"),
        FMath::IsFinite(Prop->GetPropAnchorErrorCm()) && Prop->GetPropAnchorErrorCm() < 8.f);
    Step(.1f);
    TestTrue(TEXT("Pause holds the body and prop sample through ticks"),
        FMath::IsNearlyEqual(Session.GetTime(), Session.GetLength() * .7f, .002f) &&
        FVector::Distance(SecondHand, Body->GetSocketLocation(TEXT("LeftHand"))) < .01f &&
        FVector::Distance(SecondProp, Prop->GetPropRootTransform(true).GetLocation()) < .01f);

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
    return true;
}
#endif
