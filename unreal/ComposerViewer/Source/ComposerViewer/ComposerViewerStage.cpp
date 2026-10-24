#include "ComposerViewerStage.h"
#include "ComposerViewerPerformer.h"
#include "FlowArtsRuntimeMotion.h"
#include "Async/Async.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Camera/PlayerCameraManager.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/SceneComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "IPixelStreaming2InputHandler.h"
#include "IPixelStreaming2Module.h"
#include "IPixelStreaming2Streamer.h"
#include "Json.h"
#include "Materials/MaterialInterface.h"
#include "Engine/SkeletalMesh.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Containers/StringConv.h"

namespace
{
TSharedPtr<FJsonObject> Point2(double X, double Z)
{
    auto Point = MakeShared<FJsonObject>();
    Point->SetNumberField(TEXT("x"), X);
    Point->SetNumberField(TEXT("z"), Z);
    return Point;
}

TSharedPtr<FJsonObject> Point3(const FVector& Native)
{
    auto Point = MakeShared<FJsonObject>();
    Point->SetNumberField(TEXT("x"), -Native.Y / 100.0);
    Point->SetNumberField(TEXT("y"), Native.Z / 100.0);
    Point->SetNumberField(TEXT("z"), Native.X / 100.0);
    return Point;
}

TArray<TSharedPtr<FJsonValue>> Strings(std::initializer_list<const TCHAR*> Values)
{
    TArray<TSharedPtr<FJsonValue>> Result;
    for (const TCHAR* Value : Values) Result.Add(MakeShared<FJsonValueString>(Value));
    return Result;
}

bool Number(const TSharedPtr<FJsonObject>& Object, const TCHAR* Key, double& Value)
{
    return Object.IsValid() && Object->TryGetNumberField(Key, Value) && FMath::IsFinite(Value);
}

bool WorldPoint(const TSharedPtr<FJsonObject>& Object, FVector& Result)
{
    if (!Object.IsValid()) return false;
    double X, Y, Z;
    if (!Number(Object, TEXT("x"), X) || !Number(Object, TEXT("y"), Y) || !Number(Object, TEXT("z"), Z)) return false;
    if (FMath::Abs(X) > 1000 || FMath::Abs(Y) > 1000 || FMath::Abs(Z) > 1000) return false;
    Result = FVector(Z * 100, -X * 100, Y * 100);
    return true;
}

bool SerializeJson(const TSharedPtr<FJsonObject>& Object, FString& Result)
{
    return FJsonSerializer::Serialize(Object.ToSharedRef(), TJsonWriterFactory<>::Create(&Result));
}

TSharedPtr<FJsonObject> ObjectField(const TSharedPtr<FJsonObject>& Object, const TCHAR* Key)
{
    const TSharedPtr<FJsonObject>* Value = nullptr;
    return Object.IsValid() && Object->TryGetObjectField(Key, Value) && Value ? *Value : nullptr;
}
}

AComposerViewerStage::AComposerViewerStage()
{
    PrimaryActorTick.bCanEverTick = true;
    Root = CreateDefaultSubobject<USceneComponent>(TEXT("StageRoot"));
    SetRootComponent(Root);
    Floor = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("SlateFloor"));
    Floor->SetupAttachment(Root);
    Floor->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Dais = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("PerformanceDais"));
    Dais->SetupAttachment(Root);
    Dais->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    KeyLight = CreateDefaultSubobject<UDirectionalLightComponent>(TEXT("WarmKey"));
    KeyLight->SetupAttachment(Root);
    RimLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("CoolRim"));
    RimLight->SetupAttachment(Root);
    FillLight = CreateDefaultSubobject<USkyLightComponent>(TEXT("SoftFill"));
    FillLight->SetupAttachment(Root);
}

void AComposerViewerStage::BeginPlay()
{
    Super::BeginPlay();
    Floor->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube")));
    Floor->SetWorldLocation(FVector(0, 0, -38));
    Floor->SetWorldScale3D(FVector(30, 30, .7f));
    if (UMaterialInterface* Slate = LoadObject<UMaterialInterface>(nullptr,
        TEXT("/Game/FlowFest/Materials/M_Asphalt.M_Asphalt"))) Floor->SetMaterial(0, Slate);
    Dais->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cylinder.Cylinder")));
    Dais->SetRelativeLocation(FVector(0, 0, -8));
    Dais->SetRelativeScale3D(FVector(3.2f, 3.2f, .18f));
    if (UMaterialInterface* Metal = LoadObject<UMaterialInterface>(nullptr,
        TEXT("/Game/FlowFest/Materials/M_Metal.M_Metal"))) Dais->SetMaterial(0, Metal);
    // The camera looks in from +X. Shine the key toward -X so the visible face is lit.
    KeyLight->SetWorldRotation(FRotator(-38, 145, 0));
    KeyLight->SetIntensity(4.f);
    KeyLight->SetLightColor(FLinearColor(1.f, .91f, .83f));
    RimLight->SetRelativeLocation(FVector(-210, 240, 280));
    RimLight->SetIntensity(1600.f);
    RimLight->SetAttenuationRadius(850.f);
    RimLight->SetLightColor(FLinearColor(.36f, .62f, 1.f));
    FillLight->SetIntensity(.6f);
    UPointLightComponent* FaceFill = NewObject<UPointLightComponent>(this, TEXT("FaceFill"));
    FaceFill->SetupAttachment(Root);
    FaceFill->RegisterComponent();
    FaceFill->SetRelativeLocation(FVector(260, -180, 260));
    FaceFill->SetIntensity(1800.f);
    FaceFill->SetAttenuationRadius(700.f);
    FaceFill->SetLightColor(FLinearColor(.86f, .92f, 1.f));
    FaceFill->SetCastShadows(false);
    Camera = GetWorld()->SpawnActor<ACameraActor>();
    Camera->SetActorLocation(FVector(520, 0, 230));
    UCameraComponent* View = Camera->GetCameraComponent();
    View->SetConstraintAspectRatio(false);
    View->bOverrideAspectRatioAxisConstraint = true;
    View->SetAspectRatioAxisConstraint(EAspectRatioAxisConstraint::AspectRatio_MaintainXFOV);
    View->SetFieldOfView(50.f);
    AimCamera();
    if (APlayerController* Player = GetWorld()->GetFirstPlayerController())
    {
        Player->SetViewTarget(Camera);
        bCameraBound = true;
    }
    LoadAssetCatalog();
    AComposerViewerPerformer* Default = GetWorld()->SpawnActor<AComposerViewerPerformer>();
    if (!Default || !Default->Configure(TEXT("performer-0"), TEXT("ch01"), TEXT("staff"), 1.f) ||
        !Default->HasPreparedClip())
    {
        UE_LOG(LogTemp, Error, TEXT("ComposerViewer: prepared ch01/staff/A assets are unavailable"));
        if (Default) Default->Destroy();
    }
    else
    {
        Performers.Add(TEXT("performer-0"), Default);
        SelectedPerformerId = TEXT("performer-0");
        SupportedCharacterIds.AddUnique(TEXT("ch01"));
        SupportedPropIds.AddUnique(TEXT("staff"));
    }
}

void AComposerViewerStage::LoadAssetCatalog()
{
    SupportedPropIds.Empty();
    SupportedCharacterIds.Empty();
    RigHashes.Empty();

    FString RigText;
    TSharedPtr<FJsonObject> RigCatalog;
    const FString RigPath = FPaths::ProjectContentDir() / TEXT("Data/runtime-rigs.json");
    const TSharedPtr<FJsonObject>* Rigs = nullptr;
    if (FFileHelper::LoadFileToString(RigText, *RigPath) &&
        FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(RigText), RigCatalog) && RigCatalog.IsValid() &&
        RigCatalog->TryGetObjectField(TEXT("rigs"), Rigs) && Rigs && (*Rigs).IsValid())
    {
        for (const auto& Entry : (*Rigs)->Values)
        {
            FString Hash;
            if (!Entry.Value->TryGetString(Hash) || Hash.Len() != 64) continue;
            bool bHex = true;
            for (const TCHAR Digit : Hash) bHex &= FChar::IsHexDigit(Digit);
            if (!bHex) continue;
            const FString CharacterId(*Entry.Key);
            FString AssetId = CharacterId;
            AssetId.ReplaceInline(TEXT("-"), TEXT("_"));
            const FString MeshPath = FString::Printf(TEXT("/Game/FlowFest/Characters/%s/SK_%s.SK_%s"),
                *AssetId, *AssetId, *AssetId);
            if (!LoadObject<USkeletalMesh>(nullptr, *MeshPath)) continue;
            RigHashes.Add(CharacterId, Hash);
            SupportedCharacterIds.Add(CharacterId);
        }
        SupportedCharacterIds.Sort();
    }
    else UE_LOG(LogTemp, Warning, TEXT("ComposerViewer: runtime rig catalog unavailable from %s"), *RigPath);

    FString CatalogText;
    TSharedPtr<FJsonObject> Catalog;
    const FString CatalogPath = FPaths::ProjectContentDir() / TEXT("Data/props.json");
    if (!FFileHelper::LoadFileToString(CatalogText, *CatalogPath) ||
        !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(CatalogText), Catalog) || !Catalog.IsValid())
    {
        UE_LOG(LogTemp, Warning, TEXT("ComposerViewer: prop variants unavailable from %s"), *CatalogPath);
        return;
    }
    const TArray<TSharedPtr<FJsonValue>>* Props = nullptr;
    if (!Catalog->TryGetArrayField(TEXT("props"), Props) || !Props) return;
    for (const TSharedPtr<FJsonValue>& Entry : *Props)
    {
        const TSharedPtr<FJsonObject> Prop = Entry->AsObject();
        FString Family;
        if (!Prop.IsValid() || !Prop->TryGetStringField(TEXT("id"), Family) || Family.IsEmpty()) continue;
        SupportedPropIds.AddUnique(Family);
        const TArray<TSharedPtr<FJsonValue>>* Variants = nullptr;
        if (!Prop->TryGetArrayField(TEXT("variants"), Variants) || !Variants) continue;
        for (const TSharedPtr<FJsonValue>& EntryVariant : *Variants)
        {
            const TSharedPtr<FJsonObject> Variant = EntryVariant->AsObject();
            FString VariantId;
            if (!Variant.IsValid() || !Variant->TryGetStringField(TEXT("id"), VariantId) || VariantId.IsEmpty() ||
                VariantId.Contains(TEXT(":"))) continue;
            const FString FullId = Family + TEXT(":") + VariantId;
            SupportedPropIds.AddUnique(FullId);
        }
    }
    SupportedPropIds.Sort();
}

void AComposerViewerStage::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if (bComposerCameraFov) UpdateComposerCameraFov();
    if (!bCameraBound)
    {
        if (APlayerController* Player = GetWorld()->GetFirstPlayerController())
        {
            Player->SetViewTarget(Camera);
            bCameraBound = true;
        }
    }
    if (!bInputBound) BindInput();
    if (bInputBound && bCameraBound && !bComposerCameraFov) SetActorTickEnabled(false);
}

void AComposerViewerStage::BindInput()
{
    IPixelStreaming2Module& Module = IPixelStreaming2Module::Get();
    TSharedPtr<IPixelStreaming2Streamer> Active = Module.FindStreamer(Module.GetDefaultStreamerID());
    if (!Active) return;
    TSharedPtr<IPixelStreaming2InputHandler> Input = Active->GetInputHandler().Pin();
    if (!Input) return;
    Streamer = Active;
    TWeakObjectPtr<AComposerViewerStage> WeakThis(this);
    Input->RegisterMessageHandler(TEXT("UIInteraction"), [WeakThis](FString PlayerId, FMemoryReader Message)
    {
        if (Message.TotalSize() < sizeof(uint16)) return;
        uint16 Length = 0;
        Message << Length;
        if (Length == 0 || Length > 32767 || Message.TotalSize() - Message.Tell() < int64(Length) * int64(sizeof(TCHAR))) return;
        FString Descriptor;
        Descriptor.GetCharArray().SetNumUninitialized(Length + 1);
        Message.Serialize(Descriptor.GetCharArray().GetData(), int64(Length) * sizeof(TCHAR));
        Descriptor.GetCharArray()[Length] = 0;
        AsyncTask(ENamedThreads::GameThread, [WeakThis, PlayerId, Descriptor]()
        {
            if (AComposerViewerStage* Stage = WeakThis.Get()) Stage->HandleCommand(PlayerId, Descriptor);
        });
    });
    bInputBound = true;
    UE_LOG(LogTemp, Display, TEXT("ComposerViewer: UIInteraction bridge bound"));
}

void AComposerViewerStage::AimCamera()
{
    if (Camera) Camera->SetActorRotation((CameraTarget - Camera->GetActorLocation()).Rotation());
}

float AComposerViewerStage::HorizontalFovForVertical(float VerticalFov, float Aspect)
{
    return FMath::RadiansToDegrees(2.f * FMath::Atan(
        FMath::Tan(FMath::DegreesToRadians(VerticalFov) * .5f) * Aspect));
}

void AComposerViewerStage::UpdateComposerCameraFov()
{
    if (!bComposerCameraFov || !Camera) return;
    APlayerController* Player = GetWorld() ? GetWorld()->GetFirstPlayerController() : nullptr;
    if (!Player) return;
    int32 Width = 0, Height = 0;
    Player->GetViewportSize(Width, Height);
    if (Width <= 0 || Height <= 0 || (Width == CameraViewportWidth && Height == CameraViewportHeight)) return;
    CameraViewportWidth = Width;
    CameraViewportHeight = Height;
    Camera->GetCameraComponent()->SetFieldOfView(
        HorizontalFovForVertical(ComposerVerticalFov, float(Width) / float(Height)));
}

TSharedPtr<FJsonObject> AComposerViewerStage::MakeState() const
{
    auto State = MakeShared<FJsonObject>();
    auto Capabilities = MakeShared<FJsonObject>();
    Capabilities->SetNumberField(TEXT("maxPerformers"), 8);
    TArray<TSharedPtr<FJsonValue>> CharacterIds;
    for (const FString& Id : SupportedCharacterIds) CharacterIds.Add(MakeShared<FJsonValueString>(Id));
    Capabilities->SetArrayField(TEXT("characterIds"), CharacterIds);
    TArray<TSharedPtr<FJsonValue>> PropIds;
    for (const FString& Id : SupportedPropIds) PropIds.Add(MakeShared<FJsonValueString>(Id));
    Capabilities->SetArrayField(TEXT("propIds"), PropIds);
    Capabilities->SetArrayField(TEXT("cameraModes"), Strings({TEXT("snap"), TEXT("orbit"), TEXT("pan"), TEXT("zoom"), TEXT("fov"), TEXT("preset"), TEXT("focus")}));
    Capabilities->SetArrayField(TEXT("playbackActions"), Strings({TEXT("pause"), TEXT("resume"), TEXT("restart"), TEXT("rate"), TEXT("sync")}));
    State->SetObjectField(TEXT("capabilities"), Capabilities);
    TArray<TSharedPtr<FJsonValue>> PerformerStates;
    TArray<FString> SortedIds;
    Performers.GetKeys(SortedIds);
    SortedIds.Sort();
    for (const FString& Id : SortedIds)
    {
        const AComposerViewerPerformer* Performer = Performers.FindRef(Id);
        if (!Performer) continue;
        auto PerformerState = MakeShared<FJsonObject>();
        PerformerState->SetStringField(TEXT("performerId"), Performer->GetPerformerId());
        PerformerState->SetStringField(TEXT("characterId"), Performer->GetCharacterId().ToString());
        PerformerState->SetStringField(TEXT("propId"), Performer->GetPropId().ToString());
        if (!Performer->GetEffect().IsEmpty())
            PerformerState->SetStringField(TEXT("effect"), Performer->GetEffect());
        if (const auto Motion = Performer->GetRuntimeMotion(); Motion.IsValid())
            PerformerState->SetStringField(TEXT("runtimeClip"), Motion->GetSequenceSHA256());
        const FVector P = Performer->GetActorLocation();
        PerformerState->SetObjectField(TEXT("position"), Point2(-P.Y / 100.0, P.X / 100.0));
        PerformerState->SetNumberField(TEXT("facingAngle"), -FMath::DegreesToRadians(Performer->GetActorRotation().Yaw));
        PerformerStates.Add(MakeShared<FJsonValueObject>(PerformerState));
    }
    State->SetArrayField(TEXT("performers"), PerformerStates);
    if (SelectedPerformerId.IsEmpty()) State->SetField(TEXT("selectedPerformerId"), MakeShared<FJsonValueNull>());
    else State->SetStringField(TEXT("selectedPerformerId"), SelectedPerformerId);
    auto CameraState = MakeShared<FJsonObject>();
    CameraState->SetObjectField(TEXT("position"), Point3(Camera ? Camera->GetActorLocation() : FVector(520, 0, 230)));
    CameraState->SetObjectField(TEXT("target"), Point3(CameraTarget));
    CameraState->SetNumberField(TEXT("fov"), Camera ? Camera->GetCameraComponent()->FieldOfView : 50);
    CameraState->SetStringField(TEXT("mode"), CameraMode);
    CameraState->SetBoolField(TEXT("gestureComplete"), true);
    State->SetObjectField(TEXT("camera"), CameraState);
    auto Playback = MakeShared<FJsonObject>();
    const AComposerViewerPerformer* Selected = Performers.FindRef(SelectedPerformerId);
    if (!Selected && SortedIds.Num() > 0) Selected = Performers.FindRef(SortedIds[0]);
    if (Selected && (Selected->GetRuntimeMotion().IsValid() || Selected->HasPreparedClip()))
    {
        auto Clip = MakeShared<FJsonObject>();
        const auto Motion = Selected->GetRuntimeMotion();
        FString Family = Selected->GetPropId().ToString();
        int32 VariantSeparator = INDEX_NONE;
        if (Family.FindChar(TEXT(':'), VariantSeparator)) Family.LeftInline(VariantSeparator);
        if (Motion.IsValid())
        {
            Clip->SetStringField(TEXT("id"), Motion->GetSequenceSHA256());
            Clip->SetStringField(TEXT("title"), TEXT("Composer score"));
            Clip->SetStringField(TEXT("provenance"), TEXT("validated Composer runtime motion"));
            Playback->SetStringField(TEXT("runtimeClip"), Motion->GetSequenceSHA256());
        }
        else
        {
            Clip->SetStringField(TEXT("id"), FString::Printf(TEXT("%s/%s/A"), *Selected->GetCharacterId().ToString(), *Family));
            Clip->SetStringField(TEXT("title"), Family == TEXT("staff") ? TEXT("Staff practice loop") : TEXT("Fan practice loop"));
            Clip->SetStringField(TEXT("provenance"), Family == TEXT("staff")
                ? TEXT("sealed family capture; not an exact Composer score")
                : TEXT("legacy prepared family capture; not an exact Composer score"));
        }
        Playback->SetObjectField(TEXT("preparedClip"), Clip);
        Playback->SetStringField(TEXT("status"), Selected->IsPlaying() ? TEXT("playing") : TEXT("paused"));
        Playback->SetNumberField(TEXT("rate"), Selected->GetRate());
        Playback->SetNumberField(TEXT("phase"), Selected->GetPhase());
    }
    else
    {
        Playback->SetField(TEXT("preparedClip"), MakeShared<FJsonValueNull>());
        Playback->SetStringField(TEXT("status"), TEXT("unavailable"));
        Playback->SetNumberField(TEXT("rate"), 1);
        Playback->SetNumberField(TEXT("phase"), 0);
    }
    State->SetObjectField(TEXT("playback"), Playback);
    return State;
}

void AComposerViewerStage::SendResult(const FString& PlayerId, const FString& ReplyTo, bool bOk,
    const FString& ErrorCode, const FString& ErrorMessage)
{
    auto Result = MakeShared<FJsonObject>();
    Result->SetNumberField(TEXT("v"), 1);
    Result->SetStringField(TEXT("session"), Session);
    Result->SetNumberField(TEXT("revision"), Revision);
    Result->SetStringField(TEXT("type"), TEXT("result"));
    Result->SetStringField(TEXT("replyTo"), ReplyTo);
    Result->SetBoolField(TEXT("ok"), bOk);
    Result->SetObjectField(TEXT("state"), MakeState());
    if (!bOk)
    {
        auto Error = MakeShared<FJsonObject>();
        Error->SetStringField(TEXT("code"), ErrorCode);
        Error->SetStringField(TEXT("message"), ErrorMessage);
        Result->SetObjectField(TEXT("error"), Error);
    }
    FString Text;
    if (SerializeJson(Result, Text))
        if (TSharedPtr<IPixelStreaming2Streamer> Active = Streamer.Pin())
            Active->SendPlayerMessage(PlayerId, TEXT("Response"), Text);
}

void AComposerViewerStage::HandleCommand(const FString& PlayerId, const FString& Descriptor)
{
    TSharedPtr<FJsonObject> Command;
    if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Descriptor), Command) || !Command.IsValid()) return;
    FString Id, IncomingSession, Type;
    int32 Version = 0, IncomingRevision = -1;
    if (!Command->TryGetStringField(TEXT("id"), Id) || Id.IsEmpty() || Id.Len() > 128 ||
        !Command->TryGetStringField(TEXT("session"), IncomingSession) || IncomingSession.IsEmpty() || IncomingSession.Len() > 128 ||
        !Command->TryGetStringField(TEXT("type"), Type) ||
        !Command->TryGetNumberField(TEXT("v"), Version) ||
        !Command->TryGetNumberField(TEXT("revision"), IncomingRevision) || IncomingRevision < 0)
        return;
    if (Version != 1) { SendResult(PlayerId, Id, false, TEXT("unsupported_version"), TEXT("Bridge version must be 1")); return; }
    if (Type == TEXT("hello"))
    {
        APlayerController* Player = GetWorld()->GetFirstPlayerController();
        APlayerCameraManager* Manager = Player ? Player->PlayerCameraManager.Get() : nullptr;
        UCameraComponent* View = Camera ? Camera->GetCameraComponent() : nullptr;
        const FMinimalViewInfo* CachedView = Manager ? &Manager->GetCameraCacheView() : nullptr;
        int32 ViewportWidth = 0, ViewportHeight = 0;
        if (Player) Player->GetViewportSize(ViewportWidth, ViewportHeight);
        UE_LOG(LogTemp, Display,
            TEXT("ComposerViewer camera diagnostic: viewTarget=%s targetMatches=%d cameraManager=%d cameraComponent=%d componentConstrained=%d componentAspect=%.6f cachedConstrained=%d cachedAspect=%.6f viewport=%dx%d"),
            *GetNameSafe(Player ? Player->GetViewTarget() : nullptr),
            Player && Player->GetViewTarget() == Camera.Get() ? 1 : 0,
            Manager ? 1 : 0,
            View ? 1 : 0,
            View && View->bConstrainAspectRatio ? 1 : 0,
            View ? View->AspectRatio : 0.f,
            CachedView && CachedView->bConstrainAspectRatio ? 1 : 0,
            CachedView ? CachedView->AspectRatio : 0.f,
            ViewportWidth, ViewportHeight);
        Session = IncomingSession;
        Revision = IncomingRevision;
        ClearMotionTransfer();
        bComposerCameraFov = false;
        CameraViewportWidth = CameraViewportHeight = 0;
        if (Camera) Camera->GetCameraComponent()->SetFieldOfView(50.f);
        SendResult(PlayerId, Id, true);
        return;
    }
    if (Session != IncomingSession) { SendResult(PlayerId, Id, false, TEXT("stale_session"), TEXT("Start a new viewer session")); return; }
    if (IncomingRevision < Revision) { SendResult(PlayerId, Id, false, TEXT("stale_revision"), TEXT("Scene revision is outdated")); return; }
    const TSharedPtr<FJsonObject> Payload = ObjectField(Command, TEXT("payload"));
    FString ErrorCode, ErrorMessage;
    bool bOk = false;
    if (Type == TEXT("setPerformer")) bOk = SetPerformer(Payload, ErrorCode, ErrorMessage);
    else if (Type == TEXT("removePerformer"))
    {
        FString PerformerId;
        if (!Payload.IsValid() || !Payload->TryGetStringField(TEXT("performerId"), PerformerId))
            { ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Missing performer ID"); }
        else if (!Performers.Contains(PerformerId))
            { ErrorCode = TEXT("unknown_performer"); ErrorMessage = TEXT("Performer ID is not present"); }
        else
        {
            if (AComposerViewerPerformer* Actor = Performers.FindRef(PerformerId)) Actor->Destroy();
            Performers.Remove(PerformerId);
            if (SelectedPerformerId == PerformerId) SelectedPerformerId.Empty();
            if (MotionPerformerId == PerformerId) ClearMotionTransfer();
            bOk = true;
        }
    }
    else if (Type == TEXT("select"))
    {
        FString PerformerId;
        if (Payload.IsValid() && Payload->TryGetStringField(TEXT("performerId"), PerformerId) &&
            Performers.Contains(PerformerId))
            { SelectedPerformerId = PerformerId; bOk = true; }
        else if (Payload.IsValid() && Payload->HasTypedField<EJson::Null>(TEXT("performerId")))
            { SelectedPerformerId.Empty(); bOk = true; }
        else { ErrorCode = TEXT("unknown_performer"); ErrorMessage = TEXT("Performer ID is not present"); }
    }
    else if (Type == TEXT("camera")) bOk = SetCamera(Payload, ErrorCode, ErrorMessage);
    else if (Type == TEXT("playback")) bOk = SetPlayback(Payload, ErrorCode, ErrorMessage);
    else if (Type == TEXT("beginMotion")) bOk = BeginMotion(Payload, ErrorCode, ErrorMessage);
    else if (Type == TEXT("motionChunk")) bOk = MotionChunk(Payload, ErrorCode, ErrorMessage);
    else if (Type == TEXT("commitMotion")) bOk = CommitMotion(Payload, ErrorCode, ErrorMessage);
    else { ErrorCode = TEXT("unsupported_action"); ErrorMessage = TEXT("Unknown viewer command"); }
    if (bOk) Revision = IncomingRevision;
    SendResult(PlayerId, Id, bOk, ErrorCode, ErrorMessage);
}

bool AComposerViewerStage::SetPerformer(const TSharedPtr<FJsonObject>& Payload, FString& ErrorCode, FString& ErrorMessage)
{
    FString Id, Character, Prop, Effect;
    double X, Z, Facing;
    bool bComposerOwned = false;
    const TSharedPtr<FJsonObject> Position = ObjectField(Payload, TEXT("position"));
    if (!Payload.IsValid() || !Payload->TryGetStringField(TEXT("performerId"), Id) || Id.IsEmpty() || Id.Len() > 128 ||
        !Payload->TryGetStringField(TEXT("characterId"), Character) ||
        !Payload->TryGetStringField(TEXT("propId"), Prop) ||
        !Number(Position, TEXT("x"), X) || !Number(Position, TEXT("z"), Z) ||
        !Number(Payload, TEXT("facingAngle"), Facing) ||
        FMath::Abs(X) > 100 || FMath::Abs(Z) > 100 || FMath::Abs(Facing) > 1000)
    {
        ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Performer fields must be finite and in range"); return false;
    }
    if (Payload->HasField(TEXT("composerOwned")) && !Payload->TryGetBoolField(TEXT("composerOwned"), bComposerOwned))
        { ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Composer ownership flag is invalid"); return false; }
    AComposerViewerPerformer* Existing = Performers.FindRef(Id);
    if (Payload->HasField(TEXT("effect")) && !Payload->TryGetStringField(TEXT("effect"), Effect))
        { ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Performer effect must be a string"); return false; }
    if (!Payload->HasField(TEXT("effect")) && Existing) Effect = Existing->GetEffect();
    if (!(Effect.IsEmpty() || Effect == TEXT("none") || Effect == TEXT("fire") || Effect == TEXT("led")))
        { ErrorCode = TEXT("unsupported_effect"); ErrorMessage = TEXT("Native effects support none, fire, and led"); return false; }
    if (!Existing && Performers.Num() >= 8)
        { ErrorCode = TEXT("cast_limit"); ErrorMessage = TEXT("This native preview supports eight performers"); return false; }
    if ((!SupportedCharacterIds.Contains(Character) && !(Character == TEXT("ch01") && !RigHashes.Contains(Character))) ||
        !SupportedPropIds.Contains(Prop))
        { ErrorCode = TEXT("unsupported_asset"); ErrorMessage = TEXT("Character or prop is unavailable in the native catalog"); return false; }
    const FVector Location(Z * 100, -X * 100, 0);
    const FRotator Rotation(0, -FMath::RadiansToDegrees(Facing), 0);
    if (Existing && Existing->GetCharacterId().ToString() == Character && Existing->GetPropId().ToString() == Prop &&
        Existing->IsComposerOwned() == bComposerOwned)
    {
        Existing->SetActorLocationAndRotation(Location, Rotation);
        Existing->SetEffect(Effect);
        return true;
    }
    AComposerViewerPerformer* Replacement = GetWorld()->SpawnActor<AComposerViewerPerformer>(
        AComposerViewerPerformer::StaticClass(), Location, Rotation);
    if (!Replacement || !Replacement->Configure(Id, FName(*Character), FName(*Prop),
        Existing ? Existing->GetRate() : 1.f, bComposerOwned, Effect))
    {
        if (Replacement) Replacement->Destroy();
        ErrorCode = TEXT("unsupported_asset"); ErrorMessage = TEXT("Native body or prop asset could not be loaded"); return false;
    }
    if (Existing)
    {
        if (MotionPerformerId == Id) ClearMotionTransfer();
        FString PreviousFamily = Existing->GetPropId().ToString();
        FString NewFamily = Prop;
        int32 Separator = INDEX_NONE;
        if (PreviousFamily.FindChar(TEXT(':'), Separator)) PreviousFamily.LeftInline(Separator);
        if (NewFamily.FindChar(TEXT(':'), Separator)) NewFamily.LeftInline(Separator);
        if (PreviousFamily == NewFamily && Replacement->HasPreparedClip()) Replacement->SeekPerformance(Existing->GetPerformanceTime());
        if (Replacement->HasPreparedClip()) Replacement->SetPlaying(Existing->IsPlaying());
        Existing->Destroy();
    }
    Performers.Add(Id, Replacement);
    SelectedPerformerId = Id;
    return true;
}

bool AComposerViewerStage::SetCamera(const TSharedPtr<FJsonObject>& Payload, FString& ErrorCode, FString& ErrorMessage)
{
    if (!Payload.IsValid() || !Camera)
        { ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Camera payload is missing"); return false; }
    FString Mode;
    if (!Payload->TryGetStringField(TEXT("mode"), Mode)) Mode = TEXT("snap");
    double VerticalFov = 0;
    const bool bHasVerticalFov = Payload->HasField(TEXT("verticalFov"));
    if (bHasVerticalFov && (!Number(Payload, TEXT("verticalFov"), VerticalFov) ||
        VerticalFov < 1 || VerticalFov > 170))
        { ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Vertical field of view must be 1 to 170 degrees"); return false; }
    FVector Position = Camera->GetActorLocation();
    FVector Target = CameraTarget;
    const float Distance = FVector::Distance(Position, Target);
    int32 ViewportWidth = CameraViewportWidth, ViewportHeight = CameraViewportHeight;
    if (APlayerController* Player = GetWorld() ? GetWorld()->GetFirstPlayerController() : nullptr)
        Player->GetViewportSize(ViewportWidth, ViewportHeight);
    const float ViewportAspect = ViewportHeight > 0 ? float(ViewportWidth) / float(ViewportHeight) : 1.f;
    if (Mode == TEXT("snap"))
    {
        if (!WorldPoint(ObjectField(Payload, TEXT("position")), Position) ||
            !WorldPoint(ObjectField(Payload, TEXT("target")), Target) ||
            FVector::Distance(Position, Target) < 10)
            { ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Camera position and target are invalid"); return false; }
        CameraMode = TEXT("orbit");
    }
    else if (Mode == TEXT("fov"))
    {
        if (!bHasVerticalFov)
            { ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Vertical field of view is required"); return false; }
        CameraMode = TEXT("zoom");
    }
    else if (Mode == TEXT("orbit"))
    {
        double DeltaX, DeltaY;
        if (!Number(Payload, TEXT("deltaX"), DeltaX) || !Number(Payload, TEXT("deltaY"), DeltaY) ||
            FMath::Abs(DeltaX) > 1 || FMath::Abs(DeltaY) > 1)
            { ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Orbit deltas are invalid"); return false; }
        FVector Offset = Position - Target;
        // Web camera-controls uses the viewport height for both drag axes.
        // WorldPoint reverses Web X into native Y, so dragging right increases yaw.
        const float Yaw = FMath::Atan2(Offset.Y, Offset.X) + DeltaX * 2 * PI;
        const float Elevation = FMath::Clamp(FMath::Asin(Offset.Z / Distance) + float(DeltaY) * 2 * PI,
            0.f, PI * .5f - .01f);
        Position = Target + FVector(FMath::Cos(Yaw) * FMath::Cos(Elevation),
            FMath::Sin(Yaw) * FMath::Cos(Elevation), FMath::Sin(Elevation)) * Distance;
        CameraMode = TEXT("orbit");
    }
    else if (Mode == TEXT("pan"))
    {
        double DeltaX, DeltaY;
        if (!Number(Payload, TEXT("deltaX"), DeltaX) || !Number(Payload, TEXT("deltaY"), DeltaY) ||
            FMath::Abs(DeltaX) > 1 || FMath::Abs(DeltaY) > 1)
            { ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Pan deltas are invalid"); return false; }
        const float PanVerticalFov = bComposerCameraFov ? ComposerVerticalFov :
            FMath::RadiansToDegrees(2.f * FMath::Atan(FMath::Tan(FMath::DegreesToRadians(
                Camera->GetCameraComponent()->FieldOfView) * .5f) /
                FMath::Max(.1f, ViewportAspect)));
        const float ScreenScale = Distance * FMath::Tan(FMath::DegreesToRadians(PanVerticalFov) * .5f) * 2.f;
        const FVector Translation = (-Camera->GetActorRightVector() * DeltaX + Camera->GetActorUpVector() * DeltaY) * ScreenScale;
        Position += Translation;
        Target += Translation;
        CameraMode = TEXT("pan");
    }
    else if (Mode == TEXT("zoom"))
    {
        double Delta;
        if (!Number(Payload, TEXT("delta"), Delta) || FMath::Abs(Delta) > 2)
            { ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Zoom delta is invalid"); return false; }
        double CursorX = 0, CursorY = 0;
        if ((Payload->HasField(TEXT("cursorX")) && !Number(Payload, TEXT("cursorX"), CursorX)) ||
            (Payload->HasField(TEXT("cursorY")) && !Number(Payload, TEXT("cursorY"), CursorY)) ||
            FMath::Abs(CursorX) > 1 || FMath::Abs(CursorY) > 1)
            { ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Zoom cursor is invalid"); return false; }
        const float RequestedDistance = Distance * FMath::Exp(float(Delta));
        const float NewDistance = FMath::Clamp(RequestedDistance, bComposerCameraFov ? 100.f : 130.f, 2500.f);
        const FVector Direction = (Position - Target).GetSafeNormal();
        if (bComposerCameraFov)
        {
            // Keep the pointed-at screen location fixed while dollying. At the
            // orbit limits, continue travelling by moving the pivot with the lens.
            const float VerticalTangent = FMath::Tan(FMath::DegreesToRadians(ComposerVerticalFov) * .5f);
            const FVector CursorShift =
                (Camera->GetActorRightVector() * float(CursorX) * ViewportAspect +
                 Camera->GetActorUpVector() * float(CursorY)) *
                ((Distance - RequestedDistance) * VerticalTangent);
            Target += CursorShift + Direction * (RequestedDistance - NewDistance);
        }
        Position = Target + Direction * NewDistance;
        CameraMode = TEXT("zoom");
    }
    else if (Mode == TEXT("focus"))
    {
        FString Id;
        AComposerViewerPerformer* Focus = nullptr;
        if (!Payload->TryGetStringField(TEXT("performerId"), Id) || !(Focus = Performers.FindRef(Id)))
            { ErrorCode = TEXT("unknown_performer"); ErrorMessage = TEXT("Focus target is not present"); return false; }
        Target = Focus->GetActorLocation() + FVector(0, 0, 110);
        Position = Target + (Position - CameraTarget).GetSafeNormal() * 520.f;
        CameraMode = TEXT("focus");
    }
    else if (Mode == TEXT("preset"))
    {
        FString Preset;
        if (!Payload->TryGetStringField(TEXT("preset"), Preset))
            { ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Camera preset is missing"); return false; }
        AComposerViewerPerformer* Selected = Performers.FindRef(SelectedPerformerId);
        Target = Selected ? Selected->GetActorLocation() + FVector(0, 0, 110) : FVector(0, 0, 110);
        FVector Offset;
        if (Preset == TEXT("front")) Offset = FVector(520, 0, 120);
        else if (Preset == TEXT("back")) Offset = FVector(-520, 0, 120);
        else if (Preset == TEXT("left")) Offset = FVector(0, 520, 120);
        else if (Preset == TEXT("right")) Offset = FVector(0, -520, 120);
        else if (Preset == TEXT("top")) Offset = FVector(1, 0, 650);
        else if (Preset == TEXT("threeQuarter")) Offset = FVector(410, -410, 190);
        else { ErrorCode = TEXT("unsupported_action"); ErrorMessage = TEXT("Unknown camera preset"); return false; }
        Position = Target + Offset;
        CameraMode = TEXT("preset");
    }
    else { ErrorCode = TEXT("unsupported_action"); ErrorMessage = TEXT("Camera mode is not available"); return false; }
    CameraTarget = Target;
    Camera->SetActorLocation(Position);
    AimCamera();
    if (bHasVerticalFov)
    {
        bComposerCameraFov = true;
        ComposerVerticalFov = static_cast<float>(VerticalFov);
        CameraViewportWidth = CameraViewportHeight = 0;
        UpdateComposerCameraFov();
        SetActorTickEnabled(true);
    }
    return true;
}

bool AComposerViewerStage::SetPlayback(const TSharedPtr<FJsonObject>& Payload, FString& ErrorCode, FString& ErrorMessage)
{
    FString Action;
    if (!Payload.IsValid() || !Payload->TryGetStringField(TEXT("action"), Action))
        { ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Playback action is missing"); return false; }
    if (Action == TEXT("sync"))
    {
        const TArray<TSharedPtr<FJsonValue>>* Entries = nullptr;
        bool bPlaying = false;
        double Rate = 0;
        if (!Payload->TryGetArrayField(TEXT("performers"), Entries) || !Entries || Entries->Num() > 8 ||
            !Payload->TryGetBoolField(TEXT("playing"), bPlaying) ||
            !Number(Payload, TEXT("rate"), Rate) || Rate < .5 || Rate > 1.75)
            { ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Playback sync fields are invalid"); return false; }
        TMap<FString, double> Times;
        for (const TSharedPtr<FJsonValue>& Entry : *Entries)
        {
            const TSharedPtr<FJsonObject> Item = Entry.IsValid() ? Entry->AsObject() : nullptr;
            FString Id;
            double Seconds = 0;
            if (!Item.IsValid() || !Item->TryGetStringField(TEXT("performerId"), Id) ||
                !Number(Item, TEXT("seconds"), Seconds) || Seconds < 0 || Seconds > 86400 ||
                !Performers.Contains(Id) || Times.Contains(Id))
                { ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Playback sync performer or time is invalid"); return false; }
            Times.Add(Id, Seconds);
        }
        for (const auto& Entry : Times)
        {
            AComposerViewerPerformer* Actor = Performers.FindRef(Entry.Key);
            Actor->SetRate(static_cast<float>(Rate));
            Actor->SeekPerformance(static_cast<float>(Entry.Value));
            Actor->SetPlaying(bPlaying);
        }
        return true;
    }
    AComposerViewerPerformer* Selected = Performers.FindRef(SelectedPerformerId);
    if (!Selected || (!Selected->HasPreparedClip() && !Selected->GetRuntimeMotion().IsValid()))
        { ErrorCode = TEXT("unavailable"); ErrorMessage = TEXT("There is no loaded clip to play"); return false; }
    if (Action == TEXT("pause")) Selected->SetPlaying(false);
    else if (Action == TEXT("resume")) Selected->SetPlaying(true);
    else if (Action == TEXT("restart")) Selected->Restart();
    else if (Action == TEXT("rate"))
    {
        double Rate;
        if (!Number(Payload, TEXT("rate"), Rate) || !Selected->SetRate(float(Rate)))
            { ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Playback rate must be 0.5–1.75"); return false; }
    }
    else { ErrorCode = TEXT("unsupported_action"); ErrorMessage = TEXT("Playback action is not available"); return false; }
    return true;
}

void AComposerViewerStage::ClearMotionTransfer()
{
    MotionTransferId.Empty();
    MotionPerformerId.Empty();
    MotionChunks.Empty();
    MotionTotalBytes = 0;
    MotionReceivedChars = 0;
}

bool AComposerViewerStage::BeginMotion(const TSharedPtr<FJsonObject>& Payload, FString& ErrorCode, FString& ErrorMessage)
{
    FString PerformerId, TransferId;
    double TotalChunks = 0, TotalBytes = 0;
    if (!Payload.IsValid() || !Payload->TryGetStringField(TEXT("performerId"), PerformerId) ||
        !Payload->TryGetStringField(TEXT("transferId"), TransferId) ||
        TransferId.IsEmpty() || TransferId.Len() > 128 ||
        !Number(Payload, TEXT("totalChunks"), TotalChunks) ||
        !Number(Payload, TEXT("totalBytes"), TotalBytes) ||
        TotalChunks < 1 || TotalChunks > 8192 || static_cast<double>(static_cast<int64>(TotalChunks)) != TotalChunks ||
        TotalBytes < 1 || TotalBytes > 64.0 * 1024.0 * 1024.0 || static_cast<double>(static_cast<int64>(TotalBytes)) != TotalBytes ||
        !Performers.Contains(PerformerId) || !RigHashes.Contains(Performers.FindRef(PerformerId)->GetCharacterId().ToString()))
    {
        ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Motion transfer identity or bounds are invalid"); return false;
    }
    for (const TCHAR C : TransferId)
    {
        if (!FChar::IsAlnum(C) && C != TEXT('-') && C != TEXT('_'))
            { ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Motion transfer ID contains invalid characters"); return false; }
    }
    if (!MotionTransferId.IsEmpty())
        { ErrorCode = TEXT("transfer_busy"); ErrorMessage = TEXT("Finish the current motion transfer first"); return false; }
    MotionTransferId = TransferId;
    MotionPerformerId = PerformerId;
    MotionTotalBytes = static_cast<int64>(TotalBytes);
    MotionChunks.SetNum(static_cast<int32>(TotalChunks));
    return true;
}

bool AComposerViewerStage::MotionChunk(const TSharedPtr<FJsonObject>& Payload, FString& ErrorCode, FString& ErrorMessage)
{
    FString TransferId, Data;
    double Index = -1;
    if (!Payload.IsValid() || !Payload->TryGetStringField(TEXT("transferId"), TransferId) ||
        TransferId != MotionTransferId || MotionTransferId.IsEmpty() ||
        !Number(Payload, TEXT("index"), Index) || Index < 0 || Index >= MotionChunks.Num() ||
        static_cast<double>(static_cast<int64>(Index)) != Index || !Payload->TryGetStringField(TEXT("data"), Data) ||
        Data.IsEmpty() || Data.Len() > 24000)
    {
        ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Motion chunk identity, index, or size is invalid"); return false;
    }
    FString& Slot = MotionChunks[static_cast<int32>(Index)];
    if (!Slot.IsEmpty())
    {
        if (Slot == Data) return true;
        ErrorCode = TEXT("chunk_conflict"); ErrorMessage = TEXT("A different chunk already occupies this index"); return false;
    }
    if (MotionReceivedChars + Data.Len() > MotionTotalBytes)
        { ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Motion transfer exceeds declared size"); return false; }
    Slot = MoveTemp(Data);
    MotionReceivedChars += Slot.Len();
    return true;
}

bool AComposerViewerStage::CommitMotion(const TSharedPtr<FJsonObject>& Payload, FString& ErrorCode, FString& ErrorMessage)
{
    FString TransferId;
    if (!Payload.IsValid() || !Payload->TryGetStringField(TEXT("transferId"), TransferId) ||
        TransferId != MotionTransferId || MotionTransferId.IsEmpty())
        { ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Motion transfer ID is unknown"); return false; }
    int64 Characters = 0;
    for (const FString& Chunk : MotionChunks)
    {
        if (Chunk.IsEmpty())
            { ErrorCode = TEXT("transfer_incomplete"); ErrorMessage = TEXT("Motion transfer is missing chunks"); return false; }
        Characters += Chunk.Len();
    }
    FString Json;
    Json.Reserve(static_cast<int32>(Characters));
    for (const FString& Chunk : MotionChunks) Json += Chunk;
    if (FTCHARToUTF8(*Json).Length() != MotionTotalBytes)
    {
        ClearMotionTransfer();
        ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Motion transfer byte count does not match"); return false;
    }
    AComposerViewerPerformer* Actor = Performers.FindRef(MotionPerformerId);
    const FString* RigHash = Actor ? RigHashes.Find(Actor->GetCharacterId().ToString()) : nullptr;
    FString ValidationError;
    const bool bLoaded = Actor && RigHash && Actor->LoadRuntimeMotion(Json, *RigHash, ValidationError);
    ClearMotionTransfer();
    if (!bLoaded)
    {
        ErrorCode = TEXT("invalid_motion");
        ErrorMessage = ValidationError.IsEmpty() ? TEXT("Motion performer or rig is unavailable") : ValidationError;
        return false;
    }
    return true;
}
