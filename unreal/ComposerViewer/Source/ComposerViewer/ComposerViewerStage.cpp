#include "ComposerViewerStage.h"
#include "ComposerViewerPerformer.h"
#include "Async/Async.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
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
    Performer = GetWorld()->SpawnActor<AComposerViewerPerformer>();
    bStaffReady = Performer && Performer->Configure(TEXT("performer-0"), TEXT("ch01"), TEXT("staff"), 1.f);
    if (!bStaffReady)
    {
        UE_LOG(LogTemp, Error, TEXT("ComposerViewer: prepared ch01/staff/A assets are unavailable"));
        if (Performer) Performer->Destroy();
        Performer = nullptr;
    }
    else SelectedPerformerId = TEXT("performer-0");
    AComposerViewerPerformer* FanProbe = GetWorld()->SpawnActor<AComposerViewerPerformer>();
    bFanReady = FanProbe && FanProbe->Configure(TEXT("asset-probe"), TEXT("ch01"), TEXT("fan"), 1.f);
    if (FanProbe) FanProbe->Destroy();
    if (!bFanReady) UE_LOG(LogTemp, Warning, TEXT("ComposerViewer: prepared ch01/fan/A assets are unavailable"));
}

void AComposerViewerStage::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if (!bCameraBound)
    {
        if (APlayerController* Player = GetWorld()->GetFirstPlayerController())
        {
            Player->SetViewTarget(Camera);
            bCameraBound = true;
        }
    }
    if (!bInputBound) BindInput();
    if (bInputBound && bCameraBound) SetActorTickEnabled(false);
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

TSharedPtr<FJsonObject> AComposerViewerStage::MakeState() const
{
    auto State = MakeShared<FJsonObject>();
    auto Capabilities = MakeShared<FJsonObject>();
    Capabilities->SetNumberField(TEXT("maxPerformers"), 1);
    Capabilities->SetArrayField(TEXT("characterIds"), bStaffReady || bFanReady
        ? Strings({TEXT("ch01")}) : TArray<TSharedPtr<FJsonValue>>());
    TArray<TSharedPtr<FJsonValue>> PropIds;
    if (bStaffReady) PropIds.Add(MakeShared<FJsonValueString>(TEXT("staff")));
    if (bFanReady) PropIds.Add(MakeShared<FJsonValueString>(TEXT("fan")));
    Capabilities->SetArrayField(TEXT("propIds"), PropIds);
    Capabilities->SetArrayField(TEXT("cameraModes"), Strings({TEXT("snap"), TEXT("orbit"), TEXT("pan"), TEXT("zoom"), TEXT("preset"), TEXT("focus")}));
    Capabilities->SetArrayField(TEXT("playbackActions"), Strings({TEXT("pause"), TEXT("resume"), TEXT("restart"), TEXT("rate")}));
    State->SetObjectField(TEXT("capabilities"), Capabilities);
    TArray<TSharedPtr<FJsonValue>> Performers;
    if (Performer)
    {
        auto PerformerState = MakeShared<FJsonObject>();
        PerformerState->SetStringField(TEXT("performerId"), Performer->GetPerformerId());
        PerformerState->SetStringField(TEXT("characterId"), Performer->GetCharacterId().ToString());
        PerformerState->SetStringField(TEXT("propId"), Performer->GetPropId().ToString());
        const FVector P = Performer->GetActorLocation();
        PerformerState->SetObjectField(TEXT("position"), Point2(-P.Y / 100.0, P.X / 100.0));
        PerformerState->SetNumberField(TEXT("facingAngle"), -FMath::DegreesToRadians(Performer->GetActorRotation().Yaw));
        Performers.Add(MakeShared<FJsonValueObject>(PerformerState));
    }
    State->SetArrayField(TEXT("performers"), Performers);
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
    if (Performer)
    {
        auto Clip = MakeShared<FJsonObject>();
        const FString Prop = Performer->GetPropId().ToString();
        Clip->SetStringField(TEXT("id"), FString::Printf(TEXT("ch01/%s/A"), *Prop));
        Clip->SetStringField(TEXT("title"), Prop == TEXT("staff") ? TEXT("Staff practice loop") : TEXT("Fan practice loop"));
        Clip->SetStringField(TEXT("provenance"), Prop == TEXT("staff")
            ? TEXT("sealed family capture; not an exact Composer score")
            : TEXT("legacy prepared family capture; not an exact Composer score"));
        Playback->SetObjectField(TEXT("preparedClip"), Clip);
        Playback->SetStringField(TEXT("status"), Performer->IsPlaying() ? TEXT("playing") : TEXT("paused"));
        Playback->SetNumberField(TEXT("rate"), Performer->GetRate());
        Playback->SetNumberField(TEXT("phase"), Performer->GetPhase());
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
        Session = IncomingSession;
        Revision = IncomingRevision;
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
        else if (!Performer || Performer->GetPerformerId() != PerformerId)
            { ErrorCode = TEXT("unknown_performer"); ErrorMessage = TEXT("Performer ID is not present"); }
        else { Performer->Destroy(); Performer = nullptr; SelectedPerformerId.Empty(); bOk = true; }
    }
    else if (Type == TEXT("select"))
    {
        FString PerformerId;
        if (Payload.IsValid() && Payload->TryGetStringField(TEXT("performerId"), PerformerId) &&
            Performer && Performer->GetPerformerId() == PerformerId)
            { SelectedPerformerId = PerformerId; bOk = true; }
        else if (Payload.IsValid() && Payload->HasTypedField<EJson::Null>(TEXT("performerId")))
            { SelectedPerformerId.Empty(); bOk = true; }
        else { ErrorCode = TEXT("unknown_performer"); ErrorMessage = TEXT("Performer ID is not present"); }
    }
    else if (Type == TEXT("camera")) bOk = SetCamera(Payload, ErrorCode, ErrorMessage);
    else if (Type == TEXT("playback")) bOk = SetPlayback(Payload, ErrorCode, ErrorMessage);
    else { ErrorCode = TEXT("unsupported_action"); ErrorMessage = TEXT("Unknown viewer command"); }
    if (bOk) Revision = IncomingRevision;
    SendResult(PlayerId, Id, bOk, ErrorCode, ErrorMessage);
}

bool AComposerViewerStage::SetPerformer(const TSharedPtr<FJsonObject>& Payload, FString& ErrorCode, FString& ErrorMessage)
{
    FString Id, Character, Prop;
    double X, Z, Facing;
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
    if (Performer && Performer->GetPerformerId() != Id)
        { ErrorCode = TEXT("cast_limit"); ErrorMessage = TEXT("This native preview supports one performer"); return false; }
    if (Character != TEXT("ch01") || (Prop == TEXT("staff") && !bStaffReady) ||
        (Prop == TEXT("fan") && !bFanReady) || (Prop != TEXT("staff") && Prop != TEXT("fan")))
        { ErrorCode = TEXT("unsupported_asset"); ErrorMessage = TEXT("This character and prop are not prepared for native playback"); return false; }
    const FVector Location(Z * 100, -X * 100, 0);
    const FRotator Rotation(0, -FMath::RadiansToDegrees(Facing), 0);
    if (Performer && Performer->GetCharacterId().ToString() == Character && Performer->GetPropId().ToString() == Prop)
    {
        Performer->SetActorLocationAndRotation(Location, Rotation);
        return true;
    }
    AComposerViewerPerformer* Replacement = GetWorld()->SpawnActor<AComposerViewerPerformer>(
        AComposerViewerPerformer::StaticClass(), Location, Rotation);
    if (!Replacement || !Replacement->Configure(Id, FName(*Character), FName(*Prop), Performer ? Performer->GetRate() : 1.f))
    {
        if (Replacement) Replacement->Destroy();
        ErrorCode = TEXT("unsupported_asset"); ErrorMessage = TEXT("Prepared body or prop track could not be loaded"); return false;
    }
    if (Performer)
    {
        Replacement->SetPlaying(Performer->IsPlaying());
        Performer->Destroy();
    }
    Performer = Replacement;
    SelectedPerformerId = Id;
    return true;
}

bool AComposerViewerStage::SetCamera(const TSharedPtr<FJsonObject>& Payload, FString& ErrorCode, FString& ErrorMessage)
{
    if (!Payload.IsValid() || !Camera)
        { ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Camera payload is missing"); return false; }
    FString Mode;
    if (!Payload->TryGetStringField(TEXT("mode"), Mode)) Mode = TEXT("snap");
    FVector Position = Camera->GetActorLocation();
    FVector Target = CameraTarget;
    const float Distance = FVector::Distance(Position, Target);
    if (Mode == TEXT("snap"))
    {
        if (!WorldPoint(ObjectField(Payload, TEXT("position")), Position) ||
            !WorldPoint(ObjectField(Payload, TEXT("target")), Target) ||
            FVector::Distance(Position, Target) < 10)
            { ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Camera position and target are invalid"); return false; }
        CameraMode = TEXT("orbit");
    }
    else if (Mode == TEXT("orbit"))
    {
        double DeltaX, DeltaY;
        if (!Number(Payload, TEXT("deltaX"), DeltaX) || !Number(Payload, TEXT("deltaY"), DeltaY) ||
            FMath::Abs(DeltaX) > 1 || FMath::Abs(DeltaY) > 1)
            { ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Orbit deltas are invalid"); return false; }
        FVector Offset = Position - Target;
        const float Yaw = FMath::Atan2(Offset.Y, Offset.X) - DeltaX * 2 * PI;
        const float Elevation = FMath::Clamp(FMath::Asin(Offset.Z / Distance) + float(DeltaY) * PI,
            -1.35f, 1.35f);
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
        const FVector Translation = (-Camera->GetActorRightVector() * DeltaX + Camera->GetActorUpVector() * DeltaY) * Distance;
        Position += Translation;
        Target += Translation;
        CameraMode = TEXT("pan");
    }
    else if (Mode == TEXT("zoom"))
    {
        double Delta;
        if (!Number(Payload, TEXT("delta"), Delta) || FMath::Abs(Delta) > 2)
            { ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Zoom delta is invalid"); return false; }
        const float NewDistance = FMath::Clamp(Distance * FMath::Exp(float(Delta)), 130.f, 2500.f);
        Position = Target + (Position - Target).GetSafeNormal() * NewDistance;
        CameraMode = TEXT("zoom");
    }
    else if (Mode == TEXT("focus"))
    {
        FString Id;
        if (!Payload->TryGetStringField(TEXT("performerId"), Id) || !Performer || Performer->GetPerformerId() != Id)
            { ErrorCode = TEXT("unknown_performer"); ErrorMessage = TEXT("Focus target is not present"); return false; }
        Target = Performer->GetActorLocation() + FVector(0, 0, 110);
        Position = Target + (Position - CameraTarget).GetSafeNormal() * 520.f;
        CameraMode = TEXT("focus");
    }
    else if (Mode == TEXT("preset"))
    {
        FString Preset;
        if (!Payload->TryGetStringField(TEXT("preset"), Preset))
            { ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Camera preset is missing"); return false; }
        Target = Performer ? Performer->GetActorLocation() + FVector(0, 0, 110) : FVector(0, 0, 110);
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
    return true;
}

bool AComposerViewerStage::SetPlayback(const TSharedPtr<FJsonObject>& Payload, FString& ErrorCode, FString& ErrorMessage)
{
    FString Action;
    if (!Payload.IsValid() || !Payload->TryGetStringField(TEXT("action"), Action))
        { ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Playback action is missing"); return false; }
    if (!Performer)
        { ErrorCode = TEXT("unavailable"); ErrorMessage = TEXT("There is no prepared performer to play"); return false; }
    if (Action == TEXT("pause")) Performer->SetPlaying(false);
    else if (Action == TEXT("resume")) Performer->SetPlaying(true);
    else if (Action == TEXT("restart")) Performer->Restart();
    else if (Action == TEXT("rate"))
    {
        double Rate;
        if (!Number(Payload, TEXT("rate"), Rate) || !Performer->SetRate(float(Rate)))
            { ErrorCode = TEXT("invalid_payload"); ErrorMessage = TEXT("Playback rate must be 0.5–1.75"); return false; }
    }
    else { ErrorCode = TEXT("unsupported_action"); ErrorMessage = TEXT("Playback action is not available"); return false; }
    return true;
}
