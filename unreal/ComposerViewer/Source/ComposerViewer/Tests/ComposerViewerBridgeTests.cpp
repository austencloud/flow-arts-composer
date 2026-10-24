#if WITH_DEV_AUTOMATION_TESTS
#include "../ComposerViewerStage.h"
#include "../ComposerViewerPerformer.h"

#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Camera/CameraActor.h"
#include "Engine/World.h"
#include "Misc/AutomationTest.h"
#include "UObject/UObjectGlobals.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FComposerViewerBridgeTest,
    "FlowArts.ComposerViewer.Bridge.Commands",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FComposerViewerBridgeTest::RunTest(const FString& Parameters)
{
    UWorld::InitializationValues Settings;
    Settings.AllowAudioPlayback(false).CreatePhysicsScene(false).CreateNavigation(false).CreateAISystem(false);
    UWorld* World = UWorld::CreateWorld(EWorldType::Game, false,
        MakeUniqueObjectName(GetTransientPackage(), UWorld::StaticClass(), TEXT("ComposerViewerBridgeWorld")),
        GetTransientPackage(), true, ERHIFeatureLevel::Num, &Settings);
    if (!TestNotNull(TEXT("Isolated viewer world"), World)) return false;
    struct FDestroyWorld { UWorld* Value; ~FDestroyWorld() { Value->DestroyWorld(false); } } Cleanup{World};

    AComposerViewerStage* Stage = World->SpawnActor<AComposerViewerStage>();
    AComposerViewerPerformer* First = World->SpawnActor<AComposerViewerPerformer>();
    AComposerViewerPerformer* Second = World->SpawnActor<AComposerViewerPerformer>();
    if (!TestNotNull(TEXT("Viewer stage"), Stage) ||
        !TestNotNull(TEXT("First performer"), First) ||
        !TestNotNull(TEXT("Second performer"), Second)) return false;
    TestTrue(TEXT("Composer vertical FOV converts for landscape viewport"),
        FMath::IsNearlyEqual(AComposerViewerStage::HorizontalFovForVertical(50.f, 16.f / 9.f), 79.316f, 0.01f));
    TestTrue(TEXT("Square viewport preserves vertical FOV"),
        FMath::IsNearlyEqual(AComposerViewerStage::HorizontalFovForVertical(50.f, 1.f), 50.f, 0.01f));
    Stage->Camera = World->SpawnActor<ACameraActor>();
    if (!TestNotNull(TEXT("Camera for gesture checks"), Stage->Camera.Get())) return false;
    const auto CameraDelta = [](const TCHAR* Mode, double X, double Y)
    {
        auto Payload = MakeShared<FJsonObject>();
        Payload->SetStringField(TEXT("mode"), Mode);
        Payload->SetNumberField(TEXT("deltaX"), X);
        Payload->SetNumberField(TEXT("deltaY"), Y);
        return Payload;
    };
    const auto ResetCamera = [&]()
    {
        Stage->CameraTarget = FVector(0, 0, 110);
        Stage->Camera->SetActorLocation(FVector(500, 0, 110));
        Stage->AimCamera();
        Stage->bComposerCameraFov = true;
        Stage->ComposerVerticalFov = 50.f;
    };
    FString CameraCode, CameraMessage;
    ResetCamera();
    TestTrue(TEXT("Right drag orbits toward native positive Y (Web negative X)"),
        Stage->SetCamera(CameraDelta(TEXT("orbit"), .1, 0), CameraCode, CameraMessage));
    TestTrue(TEXT("Right orbit has Web camera-controls direction"), Stage->Camera->GetActorLocation().Y > 0);
    ResetCamera();
    TestTrue(TEXT("Down drag raises orbit camera"),
        Stage->SetCamera(CameraDelta(TEXT("orbit"), 0, .1), CameraCode, CameraMessage));
    TestTrue(TEXT("Orbit vertical speed is two pi radians per viewport"),
        FMath::IsNearlyEqual(Stage->Camera->GetActorLocation().Z, 110.f + 500.f * FMath::Sin(.2f * PI), 1.f));
    ResetCamera();
    TestTrue(TEXT("Right drag trucks the camera left"),
        Stage->SetCamera(CameraDelta(TEXT("pan"), .1, 0), CameraCode, CameraMessage));
    const float ExpectedPan = 500.f * 2.f * FMath::Tan(FMath::DegreesToRadians(25.f)) * .1f;
    TestTrue(TEXT("Pan uses Web field-of-view scale and direction"),
        FMath::IsNearlyEqual(Stage->Camera->GetActorLocation().Y, ExpectedPan, 1.f));
    ResetCamera();
    auto Zoom = MakeShared<FJsonObject>();
    Zoom->SetStringField(TEXT("mode"), TEXT("zoom"));
    Zoom->SetNumberField(TEXT("delta"), .2);
    Zoom->SetNumberField(TEXT("cursorX"), .5);
    Zoom->SetNumberField(TEXT("cursorY"), 0);
    TestTrue(TEXT("Wheel zoom accepts cursor location"), Stage->SetCamera(Zoom, CameraCode, CameraMessage));
    TestTrue(TEXT("Zoom uses exponential Web distance scale"),
        FMath::IsNearlyEqual(FVector::Distance(Stage->Camera->GetActorLocation(), Stage->CameraTarget),
            500.f * FMath::Exp(.2f), 1.f));
    TestTrue(TEXT("Off-center zoom moves the pivot toward the cursor"), Stage->CameraTarget.Y > 0);
    ResetCamera();
    auto ProjectionZoom = MakeShared<FJsonObject>();
    ProjectionZoom->SetStringField(TEXT("mode"), TEXT("fov"));
    ProjectionZoom->SetNumberField(TEXT("verticalFov"), 60);
    TestTrue(TEXT("Trackpad projection zoom accepts field of view"),
        Stage->SetCamera(ProjectionZoom, CameraCode, CameraMessage));
    TestTrue(TEXT("Projection zoom leaves camera position unchanged"),
        Stage->Camera->GetActorLocation().Equals(FVector(500, 0, 110), .01f));
    TestTrue(TEXT("Projection zoom leaves target unchanged"),
        Stage->CameraTarget.Equals(FVector(0, 0, 110), .01f));
    TestTrue(TEXT("Projection zoom updates vertical field of view"),
        FMath::IsNearlyEqual(Stage->ComposerVerticalFov, 60.f, .01f));
    First->PerformerId = TEXT("first");
    Second->PerformerId = TEXT("second");
    First->CharacterId = TEXT("test-rig");
    Second->CharacterId = TEXT("test-rig");
    First->PropId = TEXT("staff");
    Second->PropId = TEXT("staff");
    Stage->Performers.Add(TEXT("first"), First);
    Stage->Performers.Add(TEXT("second"), Second);
    Stage->SelectedPerformerId = TEXT("first");
    Stage->RigHashes.Add(TEXT("test-rig"), FString::ChrN(64, TEXT('a')));
    Stage->SupportedCharacterIds.Add(TEXT("test-rig"));
    Stage->SupportedPropIds.Add(TEXT("staff"));
    const TSharedPtr<FJsonObject> InitialPlayback = Stage->MakeState()->GetObjectField(TEXT("playback"));
    TestTrue(TEXT("Actor without an installed clip reports no prepared clip"),
        InitialPlayback->HasTypedField<EJson::Null>(TEXT("preparedClip")));
    TestEqual(TEXT("Actor without an installed clip is unavailable"),
        InitialPlayback->GetStringField(TEXT("status")), FString(TEXT("unavailable")));

    const auto PerformerUpdate = [](const TCHAR* Effect)
    {
        auto Payload = MakeShared<FJsonObject>();
        Payload->SetStringField(TEXT("performerId"), TEXT("first"));
        Payload->SetStringField(TEXT("characterId"), TEXT("test-rig"));
        Payload->SetStringField(TEXT("propId"), TEXT("staff"));
        Payload->SetNumberField(TEXT("facingAngle"), 0);
        auto Position = MakeShared<FJsonObject>();
        Position->SetNumberField(TEXT("x"), 0);
        Position->SetNumberField(TEXT("z"), 0);
        Payload->SetObjectField(TEXT("position"), Position);
        if (Effect) Payload->SetStringField(TEXT("effect"), Effect);
        return Payload;
    };
    FString Code, Message;
    TestTrue(TEXT("Uniform LED effect applies to existing performer"),
        Stage->SetPerformer(PerformerUpdate(TEXT("led")), Code, Message));
    TestEqual(TEXT("Selected effect is recorded"), First->GetEffect(), FString(TEXT("led")));
    TestFalse(TEXT("Unsupported charcoal effect is rejected"),
        Stage->SetPerformer(PerformerUpdate(TEXT("charcoal")), Code, Message));
    TestEqual(TEXT("Rejected effect preserves previous choice"), First->GetEffect(), FString(TEXT("led")));
    TestTrue(TEXT("Omitted effect preserves performer choice"),
        Stage->SetPerformer(PerformerUpdate(nullptr), Code, Message));
    TestEqual(TEXT("Retained effect is visible in scene state"),
        Stage->MakeState()->GetArrayField(TEXT("performers"))[0]->AsObject()->GetStringField(TEXT("effect")),
        FString(TEXT("led")));
    TestTrue(TEXT("None disables the uniform finish"),
        Stage->SetPerformer(PerformerUpdate(TEXT("none")), Code, Message));
    TestEqual(TEXT("None is not confused with omitted default"), First->GetEffect(), FString(TEXT("none")));

    const auto Transfer = [](const TCHAR* PerformerId, const TCHAR* TransferId, int32 Chunks, int32 Bytes)
    {
        auto Payload = MakeShared<FJsonObject>();
        Payload->SetStringField(TEXT("performerId"), PerformerId);
        Payload->SetStringField(TEXT("transferId"), TransferId);
        Payload->SetNumberField(TEXT("totalChunks"), Chunks);
        Payload->SetNumberField(TEXT("totalBytes"), Bytes);
        return Payload;
    };
    const auto Chunk = [](const TCHAR* TransferId, int32 Index, const FString& Data)
    {
        auto Payload = MakeShared<FJsonObject>();
        Payload->SetStringField(TEXT("transferId"), TransferId);
        Payload->SetNumberField(TEXT("index"), Index);
        Payload->SetStringField(TEXT("data"), Data);
        return Payload;
    };
    TestFalse(TEXT("Reject transfer larger than 64 MiB"),
        Stage->BeginMotion(Transfer(TEXT("first"), TEXT("oversize"), 1, 64 * 1024 * 1024 + 1), Code, Message));
    TestFalse(TEXT("Transfer ID cannot contain a path"),
        Stage->BeginMotion(Transfer(TEXT("first"), TEXT("../escape"), 1, 1), Code, Message));
    TestTrue(TEXT("Start bounded transfer for known performer"),
        Stage->BeginMotion(Transfer(TEXT("first"), TEXT("one"), 2, 3), Code, Message));
    TestFalse(TEXT("Only one transfer can own the buffer"),
        Stage->BeginMotion(Transfer(TEXT("second"), TEXT("two"), 1, 1), Code, Message));
    TestEqual(TEXT("Busy transfer error"), Code, FString(TEXT("transfer_busy")));
    TestTrue(TEXT("Accept first chunk"), Stage->MotionChunk(Chunk(TEXT("one"), 0, TEXT("a")), Code, Message));
    TestTrue(TEXT("Identical retry is idempotent"), Stage->MotionChunk(Chunk(TEXT("one"), 0, TEXT("a")), Code, Message));
    TestEqual(TEXT("Retry does not count bytes twice"), Stage->MotionReceivedChars, int64(1));
    TestFalse(TEXT("Conflicting retry cannot overwrite accepted bytes"),
        Stage->MotionChunk(Chunk(TEXT("one"), 0, TEXT("b")), Code, Message));
    TestEqual(TEXT("Conflict error"), Code, FString(TEXT("chunk_conflict")));
    TestFalse(TEXT("Chunk cannot exceed declared bytes"),
        Stage->MotionChunk(Chunk(TEXT("one"), 1, TEXT("bcd")), Code, Message));
    TestFalse(TEXT("Incomplete transfer cannot commit"),
        Stage->CommitMotion(Chunk(TEXT("one"), 0, TEXT("unused")), Code, Message));
    TestEqual(TEXT("Missing chunk error"), Code, FString(TEXT("transfer_incomplete")));
    TestTrue(TEXT("Remaining chunk can arrive after incomplete commit"),
        Stage->MotionChunk(Chunk(TEXT("one"), 1, TEXT("bc")), Code, Message));

    // A new browser session must invalidate an incomplete or abandoned upload.
    Stage->HandleCommand(TEXT("test-player"),
        TEXT("{\"v\":1,\"session\":\"new-session\",\"revision\":0,\"id\":\"hello\",\"type\":\"hello\",\"payload\":{}}"));
    TestTrue(TEXT("Hello invalidates transfer ID"), Stage->MotionTransferId.IsEmpty());
    TestEqual(TEXT("Hello frees buffered chunks"), Stage->MotionChunks.Num(), 0);
    TestFalse(TEXT("Late chunk from old session is rejected"),
        Stage->MotionChunk(Chunk(TEXT("one"), 1, TEXT("bc")), Code, Message));

    const auto Sync = [](bool bPlaying, double Rate, const TCHAR* SecondId)
    {
        auto Payload = MakeShared<FJsonObject>();
        Payload->SetStringField(TEXT("action"), TEXT("sync"));
        Payload->SetBoolField(TEXT("playing"), bPlaying);
        Payload->SetNumberField(TEXT("rate"), Rate);
        TArray<TSharedPtr<FJsonValue>> Entries;
        for (const auto& Pair : { TPair<FString, double>(TEXT("first"), 1.25), TPair<FString, double>(SecondId, 2.75) })
        {
            auto Entry = MakeShared<FJsonObject>();
            Entry->SetStringField(TEXT("performerId"), Pair.Key);
            Entry->SetNumberField(TEXT("seconds"), Pair.Value);
            Entries.Add(MakeShared<FJsonValueObject>(Entry));
        }
        Payload->SetArrayField(TEXT("performers"), Entries);
        return Payload;
    };
    TestTrue(TEXT("One sync addresses both performers"),
        Stage->SetPlayback(Sync(true, 1.5, TEXT("second")), Code, Message));
    TestTrue(TEXT("First starts playing"), First->IsPlaying());
    TestTrue(TEXT("Second starts playing"), Second->IsPlaying());
    TestEqual(TEXT("First receives canonical rate"), First->GetRate(), 1.5f);
    TestEqual(TEXT("Second receives canonical rate"), Second->GetRate(), 1.5f);
    TestFalse(TEXT("Unknown performer aborts entire sync"),
        Stage->SetPlayback(Sync(false, 1.f, TEXT("unknown")), Code, Message));
    TestTrue(TEXT("Failed sync preserves first playing state"), First->IsPlaying());
    TestTrue(TEXT("Failed sync preserves second playing state"), Second->IsPlaying());
    TestEqual(TEXT("Failed sync preserves first rate"), First->GetRate(), 1.5f);
    TestTrue(TEXT("Pause sync reaches both performers"),
        Stage->SetPlayback(Sync(false, 1.f, TEXT("second")), Code, Message));
    TestFalse(TEXT("First pauses"), First->IsPlaying());
    TestFalse(TEXT("Second pauses"), Second->IsPlaying());
    TestEqual(TEXT("Scene state lists both performers"),
        Stage->MakeState()->GetArrayField(TEXT("performers")).Num(), 2);
    return true;
}
#endif
