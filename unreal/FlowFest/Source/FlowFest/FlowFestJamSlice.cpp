#include "FlowFestJamSlice.h"
#include "FlowArtsNiagaraEffectComponent.h"
#include "FlowFestAnimInstance.h"
#include "FlowFestAvatarComponent.h"
#include "FlowFestCharacter.h"
#include "FlowFestPropComponent.h"
#include "FlowFestWorld.h"
#include "Blueprint/WidgetTree.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Components/CanvasPanel.h"
#include "Components/CanvasPanelSlot.h"
#include "Components/Image.h"
#include "Components/InputComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/TextBlock.h"
#include "ContentStreaming.h"
#include "DynamicRHI.h"
#include "DynamicResolutionState.h"
#include "Engine/Engine.h"
#include "Engine/Texture2D.h"
#include "Engine/World.h"
#include "Framework/Application/SlateApplication.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "HAL/IConsoleManager.h"
#include "HAL/PlatformFileManager.h"
#include "Kismet/KismetSystemLibrary.h"
#include "Misc/App.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "RenderTimer.h"
#include "Scalability.h"
#include "ShaderCompiler.h"
#include "Styling/CoreStyle.h"
#include "UnrealClient.h"
#include "UObject/UObjectGlobals.h"
#if WITH_EDITOR
#include "AssetCompilingManager.h"
#endif

using namespace FlowFestJam;

namespace
{
float Ease(float X) { X = FMath::Clamp(X, 0.f, 1.f); return X * X * (3.f - 2.f * X); }
const TCHAR* GroupNames[] = { TEXT("inside"), TEXT("outside"), TEXT("watching"), TEXT("safety"), TEXT("dj") };
constexpr float FadeSeconds = .9f;
}

// ---- overlay -------------------------------------------------------------------------------

TSharedRef<SWidget> UFlowFestJamOverlay::RebuildWidget()
{
    if (WidgetTree && !WidgetTree->RootWidget)
    {
        UCanvasPanel* Root = WidgetTree->ConstructWidget<UCanvasPanel>(UCanvasPanel::StaticClass(), TEXT("Root"));
        WidgetTree->RootWidget = Root;
        // Dusk, top to bottom: night blue, a violet band, the last amber at the horizon, dark ground.
        constexpr int32 Rows = 256;
        Gradient = UTexture2D::CreateTransient(1, Rows, PF_B8G8R8A8);
        Gradient->SRGB = true;
        Gradient->Filter = TF_Bilinear;
        const FLinearColor Stops[] = { FColor(10, 13, 34), FColor(30, 30, 70), FColor(88, 50, 92), FColor(214, 128, 78), FColor(30, 20, 26) };
        const float At[] = { 0.f, .34f, .6f, .79f, 1.f };
        FColor* Pixels = static_cast<FColor*>(Gradient->GetPlatformData()->Mips[0].BulkData.Lock(LOCK_READ_WRITE));
        for (int32 Y = 0; Y < Rows; ++Y)
        {
            const float V = Y / float(Rows - 1);
            int32 S = 0;
            while (S < 3 && V > At[S + 1]) ++S;
            const float T = Ease((V - At[S]) / (At[S + 1] - At[S]));
            Pixels[Y] = FMath::Lerp(Stops[S], Stops[S + 1], T).ToFColor(false);
        }
        Gradient->GetPlatformData()->Mips[0].BulkData.Unlock();
        Gradient->UpdateResource();

        const auto Place = [Root](UWidget* Widget, const FAnchors& Anchors, const FVector2D& Alignment, const FVector2D& Position, const FVector2D& Size, bool bAutoSize)
        {
            UCanvasPanelSlot* Placed = Root->AddChildToCanvas(Widget);
            Placed->SetAnchors(Anchors);
            Placed->SetAlignment(Alignment);
            Placed->SetPosition(Position);
            Placed->SetSize(Size);
            Placed->SetAutoSize(bAutoSize);
            return Placed;
        };
        Dusk = WidgetTree->ConstructWidget<UImage>(UImage::StaticClass(), TEXT("Dusk"));
        Dusk->SetBrushFromTexture(Gradient);
        Place(Dusk, FAnchors(0, 0, 1, 1), FVector2D::ZeroVector, FVector2D::ZeroVector, FVector2D::ZeroVector, false)->SetOffsets(FMargin(0));

        Title = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass(), TEXT("Title"));
        Title->SetText(FText::FromString(TEXT("Dusk at Middle Earth")));
        Title->SetFont(FCoreStyle::GetDefaultFontStyle("Light", 46));
        Title->SetColorAndOpacity(FSlateColor(FLinearColor(1.f, .93f, .84f)));
        Title->SetJustification(ETextJustify::Center);
        Place(Title, FAnchors(.5f, .44f), FVector2D(.5f, .5f), FVector2D::ZeroVector, FVector2D::ZeroVector, true);

        Subtitle = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass(), TEXT("Subtitle"));
        Subtitle->SetText(FText::FromString(TEXT("Flow Fest  ·  the fire circle, Thursday night")));
        Subtitle->SetFont(FCoreStyle::GetDefaultFontStyle("Regular", 15));
        Subtitle->SetColorAndOpacity(FSlateColor(FLinearColor(.86f, .78f, .74f)));
        Subtitle->SetJustification(ETextJustify::Center);
        Place(Subtitle, FAnchors(.5f, .44f), FVector2D(.5f, .5f), FVector2D(0, 46), FVector2D::ZeroVector, true);

        Track = WidgetTree->ConstructWidget<UImage>(UImage::StaticClass(), TEXT("Track"));
        Track->SetColorAndOpacity(FLinearColor(1.f, .9f, .8f, .16f));
        Place(Track, FAnchors(.5f, .44f), FVector2D(.5f, .5f), FVector2D(0, 96), FVector2D(320, 3), false);
        Fill = WidgetTree->ConstructWidget<UImage>(UImage::StaticClass(), TEXT("Fill"));
        Fill->SetColorAndOpacity(FLinearColor(1.f, .62f, .3f, .9f));
        Place(Fill, FAnchors(.5f, .44f), FVector2D(0.f, .5f), FVector2D(-160, 96), FVector2D(0, 3), false);

        Hint = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass(), TEXT("Hint"));
        Hint->SetFont(FCoreStyle::GetDefaultFontStyle("Regular", 14));
        Hint->SetColorAndOpacity(FSlateColor(FLinearColor(1.f, .94f, .86f)));
        Hint->SetJustification(ETextJustify::Center);
        Hint->SetRenderOpacity(0.f);
        Place(Hint, FAnchors(.5f, .93f), FVector2D(.5f, .5f), FVector2D::ZeroVector, FVector2D::ZeroVector, true);
        ApplyOpacity();
    }
    return Super::RebuildWidget();
}

void UFlowFestJamOverlay::ApplyOpacity()
{
    if (!Dusk) return;
    Dusk->SetRenderOpacity(LoadingOpacity);
    Track->SetRenderOpacity(LoadingOpacity);
    Fill->SetRenderOpacity(LoadingOpacity);
    // The title is the loading screen's, and then the opening's card over the scene.
    const float Words = FMath::Max(LoadingOpacity, TitleOpacity);
    Title->SetRenderOpacity(Words);
    Subtitle->SetRenderOpacity(Words * .85f);
}

void UFlowFestJamOverlay::SetLoading(float Opacity, float InProgress)
{
    LoadingOpacity = FMath::Clamp(Opacity, 0.f, 1.f);
    if (Fill)
        if (UCanvasPanelSlot* FillSlot = Cast<UCanvasPanelSlot>(Fill->Slot)) FillSlot->SetSize(FVector2D(320.f * FMath::Clamp(InProgress, 0.f, 1.f), 3.f));
    ApplyOpacity();
}

void UFlowFestJamOverlay::SetTitle(float Opacity)
{
    TitleOpacity = FMath::Clamp(Opacity, 0.f, 1.f);
    ApplyOpacity();
}

void UFlowFestJamOverlay::SetHint(const FText& Text, float Opacity)
{
    if (!Hint) return;
    if (!Text.IsEmpty()) Hint->SetText(Text);
    Hint->SetRenderOpacity(FMath::Clamp(Opacity, 0.f, 1.f));
}

// ---- slice ---------------------------------------------------------------------------------

UFlowFestJamSlice::UFlowFestJamSlice()
{
    PrimaryComponentTick.bCanEverTick = true;
    PrimaryComponentTick.TickGroup = TG_PostPhysics;
}

void UFlowFestJamSlice::BeginPlay()
{
    Super::BeginPlay();
    Character = Cast<AFlowFestCharacter>(GetOwner());
    const TCHAR* Line = FCommandLine::Get();
    bWatch = FParse::Param(Line, TEXT("FlowFestJamWatch"));
    bExitWhenDone = FParse::Param(Line, TEXT("FlowFestJamExit"));
    FParse::Value(Line, TEXT("FlowFestJamRecord="), RecordDir);
    FParse::Value(Line, TEXT("FlowFestJamRecordSeconds="), RecordSeconds);
    FParse::Value(Line, TEXT("FlowFestJamNightSeconds="), NightSeconds);
    FParse::Value(Line, TEXT("FlowFestJamExitAfter="), ExitAfter);
    FParse::Value(Line, TEXT("FlowFestJamExactBodies="), ExactLimit);
    FParse::Value(Line, TEXT("FlowFestJamLevers="), Levers);
    FParse::Value(Line, TEXT("FlowFestJamFireDistance="), FireDistanceCm);
    bThrottleSpinners = FParse::Param(Line, TEXT("FlowFestJamThrottleSpinners"));
    FParse::Value(Line, TEXT("FlowFestJamShots="), ShotsAt);
    ShotDir = FPaths::ProjectSavedDir() / TEXT("Polish/Jam/People");
    NightSeconds = FMath::Clamp(NightSeconds, 5.f, 1800.f);
    RecordSeconds = FMath::Clamp(RecordSeconds, 1.f, 120.f);
    if (!RecordDir.IsEmpty())
    {
        // A recording advances the world at a steady 30 Hz however long each frame takes to
        // write, so the video plays at the speed the jam would.
        FApp::SetFixedDeltaTime(1.0 / 30.0);
        FApp::SetUseFixedTimeStep(true);
        IFileManager::Get().MakeDirectory(*RecordDir, true);
    }
    if (Character)
    {
        Character->Phase = EFlowFestPhase::NightFreeRoam;
        Character->Jam = EFlowFestJam::NotStarted;
    }
    // The editor's on-screen notes ("Preparing Shaders") would print over the loading screen.
    GAreScreenMessagesEnabled = false;
    LoadStarted = FPlatformTime::Seconds();
    StatSince = LoadStarted;
    Stage = EStage::Waiting;
    UE_LOG(LogTemp, Display, TEXT("FlowFestJam slice: %s%s"), bWatch ? TEXT("watch") : TEXT("play"), RecordDir.IsEmpty() ? TEXT("") : *(TEXT(", recording to ") + RecordDir));
}

void UFlowFestJamSlice::Begin()
{
    Layout = Jam->GetLayout();
    APlayerController* PC = Cast<APlayerController>(Character->GetController());
    Overlay = CreateWidget<UFlowFestJamOverlay>(PC, UFlowFestJamOverlay::StaticClass());
    if (Overlay) { Overlay->AddToViewport(100); Overlay->SetLoading(1.f, 0.f); }
    FActorSpawnParameters Params;
    Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
    Camera = GetWorld()->SpawnActor<ACameraActor>(ACameraActor::StaticClass(), FTransform::Identity, Params);
    if (Camera) Camera->GetCameraComponent()->SetFieldOfView(62.f), Camera->GetCameraComponent()->bConstrainAspectRatio = false;
    // The player waits at the handover while the opening plays.
    const FVector Start = Jam->Ground(Layout.Handover, 110.f);
    Character->SetActorLocationAndRotation(Start, FRotator(0.f, UnrealYaw(Layout.HandoverYaw), 0.f), false, nullptr, ETeleportType::TeleportPhysics);
    Character->bPhotoFly = false;
    Character->bFirstPerson = false;
    Character->GetCharacterMovement()->SetMovementMode(MOVE_Walking);
    Character->SyncModeVisuals();
    // The festival's ambience loops are synthesised (sine chirps and voices); the jam plays
    // silent until recorded night ambience replaces them. M still turns them on.
    Character->bSoundEnabled = false;
    World->SetSoundEnabled(false);
    if (Levers & LeverScalability)
    {
        // At night the moon is the only shadowing light and Lumen lights little but the fires;
        // High instead of Epic for shadows, global illumination and reflections costs no visible
        // detail there. High anti-aliasing keeps TSR history at screen resolution instead of
        // double, which matters on the low pass through the trees. This process only; nothing is saved.
        Scalability::FQualityLevels Quality = Scalability::GetQualityLevels();
        Quality.ShadowQuality = FMath::Min(Quality.ShadowQuality, 2);
        Quality.GlobalIlluminationQuality = FMath::Min(Quality.GlobalIlluminationQuality, 2);
        Quality.ReflectionQuality = FMath::Min(Quality.ReflectionQuality, 2);
        Quality.AntiAliasingQuality = FMath::Min(Quality.AntiAliasingQuality, 2);
        Scalability::SetQualityLevels(Quality, true);
        // The sun moves every frame of the opening, so its shadow pages are redrawn every frame;
        // while it moves they are drawn at half resolution, which the soft low sun hides.
        if (IConsoleVariable* Moving = IConsoleManager::Get().FindConsoleVariable(TEXT("r.Shadow.Virtual.ResolutionLodBiasDirectionalMoving")))
            Moving->Set(1.f, ECVF_SetByCode);
        // Dynamic resolution holds the GPU near 15 ms: full resolution while there is headroom, down
        // to 70% (which TSR upscales) only where the dusk sky and the fires together run over.
        const auto SetCVar = [](const TCHAR* Name, float Value)
        {
            if (IConsoleVariable* Var = IConsoleManager::Get().FindConsoleVariable(Name)) Var->Set(Value, ECVF_SetByCode);
        };
        SetCVar(TEXT("r.DynamicRes.FrameTimeBudget"), 16.6f);
        SetCVar(TEXT("r.DynamicRes.MinScreenPercentage"), 70.f);
        SetCVar(TEXT("r.DynamicRes.MaxScreenPercentage"), 100.f);
        SetCVar(TEXT("r.DynamicRes.OperationMode"), 2.f);
    }
    if (PC)
    {
        PC->SetIgnoreMoveInput(true);
        PC->SetIgnoreLookInput(true);
        if (Camera) PC->SetViewTarget(Camera);
        AnyKeyInput = NewObject<UInputComponent>(this, TEXT("JamAnyKey"));
        AnyKeyInput->Priority = 100;
        FInputKeyBinding& Binding = AnyKeyInput->BindKey(EKeys::AnyKey, IE_Pressed, this, &UFlowFestJamSlice::OnAnyKey);
        Binding.bConsumeInput = false;
        PC->PushInputComponent(AnyKeyInput);
    }
    FVector Eye, Look;
    float Sun = 0.f;
    SampleShot(Layout, 0.f, Eye, Look, Sun);
    World->SetTimeOfDay(SolveClockHour(Sun));
    PlaceCamera(Jam->Ground(FVector2D(Eye.X, Eye.Y), Eye.Z * 100.f), Jam->Ground(FVector2D(Look.X, Look.Y), Look.Z * 100.f));
    FullNightClock = SolveClockHour(MidMayElevation(22.5f));
    Stage = EStage::Loading;
}

void UFlowFestJamSlice::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
    if (!Character) return;
    if (Stage == EStage::Waiting)
    {
        World = Character->GetFestivalWorld();
        Jam = World ? World->FindComponentByClass<UFlowFestJamComponent>() : nullptr;
        if (Jam && Character->GetController()) Begin();
        else if (FPlatformTime::Seconds() - LoadStarted > 60.0)
        {
            UE_LOG(LogTemp, Error, TEXT("FlowFestJam slice: the festival world or its jam never appeared"));
            LoadStarted = FPlatformTime::Seconds();
        }
        return;
    }
    StageSeconds += DeltaTime;
    if (Stage == EStage::Loading) TickLoading(DeltaTime);
    else if (Stage == EStage::Opening) TickOpening(DeltaTime);
    else if (Stage == EStage::Play) TickPlay(DeltaTime);
    else if (Stage == EStage::Watch) TickWatch(DeltaTime);
    if (ShotsAt > 0.f && Stage == EStage::Watch && SinceReveal >= ShotsAt) TickShots(DeltaTime);
    if (Stage != EStage::Loading)
    {
        SinceReveal += DeltaTime;
        if (Overlay) Overlay->SetLoading(1.f - Ease(SinceReveal / FadeSeconds), 1.f);
    }
    BudgetBodies();
    Record();
    LogStats(DeltaTime);
    if (ExitAfter > 0.f && Stage != EStage::Loading && SinceReveal >= ExitAfter)
        UKismetSystemLibrary::QuitGame(this, Cast<APlayerController>(Character->GetController()), EQuitPreference::Quit, false);
}

void UFlowFestJamSlice::TickLoading(float DeltaTime)
{
    // Hold the opening's first frame and sun while the jam spawns and poses everyone.
    const FReadinessReport Ready = FReadinessReport::Of(*Jam);
    const bool bShaders = !GShaderCompilingManager || GShaderCompilingManager->GetNumRemainingJobs() == 0;
    bool bAssets = !IsAsyncLoading();
#if WITH_EDITOR
    bAssets = bAssets && FAssetCompilingManager::Get().GetNumRemainingAssets() == 0;
#endif
    const bool bStreaming = IStreamingManager::Get().GetNumWantingResources() == 0;
    const bool bAll = Ready.bPeople && bShaders && bAssets && bStreaming;
    // A few frames rendered with everything in place before the fade.
    ReadyFrames = bAll ? ReadyFrames + 1 : 0;
    const float Target = .55f * Ready.Fraction + .2f * bShaders + .15f * bAssets + .1f * bStreaming;
    Progress = FMath::Max(Progress, FMath::Min(Target, Progress + DeltaTime * .8f));
    if (Overlay) Overlay->SetLoading(1.f, Progress);
    const double Waited = FPlatformTime::Seconds() - LoadStarted;
    if (!bLoadingShot && !RecordDir.IsEmpty() && Waited > 4.0)
    {
        bLoadingShot = true;
        FScreenshotRequest::RequestScreenshot(RecordDir / TEXT("loading.png"), true, false);
    }
    if (Waited - LoadingLoggedAt >= 3.0)
    {
        LoadingLoggedAt = Waited;
        UE_LOG(LogTemp, Display, TEXT("FlowFestJam loading %.1f s: people %s (%.0f%%), shader jobs %d, assets %s, streaming wants %d"),
            Waited, Ready.bPeople ? TEXT("ready") : TEXT("posing"), 100.f * Ready.Fraction, GShaderCompilingManager ? GShaderCompilingManager->GetNumRemainingJobs() : 0,
            bAssets ? TEXT("loaded") : TEXT("loading"), IStreamingManager::Get().GetNumWantingResources());
    }
    if (ReadyFrames >= 6) Reveal(false);
    else if (Waited > 60.0)
    {
        UE_LOG(LogTemp, Warning, TEXT("FlowFestJam loading timed out after 60 s: people %s, shader jobs %d, assets %s, streaming wants %d"),
            Ready.bPeople ? TEXT("ready") : TEXT("NOT ready"), GShaderCompilingManager ? GShaderCompilingManager->GetNumRemainingJobs() : 0,
            bAssets ? TEXT("loaded") : TEXT("STILL LOADING"), IStreamingManager::Get().GetNumWantingResources());
        Reveal(true);
    }
}

UFlowFestJamSlice::FReadinessReport UFlowFestJamSlice::FReadinessReport::Of(const UFlowFestJamComponent& Jam)
{
    FReadinessReport Report;
    Report.Counts = Jam.GetReadiness();
    int32 Want = 0, Have = 0;
    Report.bPeople = true;
    for (int32 G = 0; G < 5; ++G)
    {
        const UFlowFestJamComponent::FReadiness& R = Report.Counts;
        Want += R.Present[G] + R.Out[G];
        Have += R.Spawned[G] + R.Shown[G];
        Report.bPeople &= R.Spawned[G] == R.Present[G] && R.Shown[G] == R.Out[G];
    }
    Report.Fraction = Want > 0 ? float(Have) / Want : 1.f;
    return Report;
}

void UFlowFestJamSlice::Reveal(bool bTimedOut)
{
    const FReadinessReport Ready = FReadinessReport::Of(*Jam);
    const UFlowFestJamComponent::FReadiness& R = Ready.Counts;
    FString Groups;
    for (int32 G = 0; G < 5; ++G)
    {
        Groups += FString::Printf(TEXT("%s%s %d/%d dressed, %d/%d posed"), G ? TEXT("; ") : TEXT(""), GroupNames[G], R.Spawned[G], R.Expected[G], R.Shown[G], R.Out[G]);
        if (bTimedOut && (R.Spawned[G] < R.Present[G] || R.Shown[G] < R.Out[G]))
            UE_LOG(LogTemp, Warning, TEXT("FlowFestJam never ready: %s %d of %d spawned without body or prop, %d of %d out never posed"),
                GroupNames[G], R.Present[G] - R.Spawned[G], R.Present[G], R.Out[G] - R.Shown[G], R.Out[G]);
        if (R.Present[G] < R.Expected[G])
            UE_LOG(LogTemp, Warning, TEXT("FlowFestJam: %d %s in the layout were left out (character failed to load)"), R.Expected[G] - R.Present[G], GroupNames[G]);
    }
    UE_LOG(LogTemp, Display, TEXT("FlowFestJam reveal after %.1f s%s: %s"), FPlatformTime::Seconds() - LoadStarted, bTimedOut ? TEXT(" (timed out)") : TEXT(""), *Groups);
    Stage = EStage::Opening;
    StageSeconds = 0.f;
    SinceReveal = 0.f;
}

FVector UFlowFestJamSlice::ClearOfPeople(const FVector& Eye) const
{
    // The opening and the orbit keep the camera at least 0.8 m from everybody, the player
    // included: it starts to rise 2 m from a person and is a full 0.8 m over their head by the
    // time it is within 0.8 m of them. The lift depends only on where the camera is, so it never
    // jumps.
    float Lift = 0.f;
    const auto Clear = [&Eye, &Lift](const USkeletalMeshComponent* Body)
    {
        if (!Body || !Body->IsVisible() || Body->GetOwner()->IsHidden()) return;
        const FVector Feet = Body->GetComponentLocation();
        // Distance from the edge of a body about 25 cm in radius.
        const float Edge = FMath::Max(0.f, float(FVector2D::Distance(FVector2D(Eye), FVector2D(Feet))) - 25.f);
        if (Edge >= 200.f) return;
        const float Over = Feet.Z + 190.f + 80.f - Eye.Z;
        if (Over > 0.f) Lift = FMath::Max(Lift, Over * Ease((200.f - Edge) / 120.f));
    };
    for (const TWeakObjectPtr<USkeletalMeshComponent>& Weak : Budgeted) Clear(Weak.Get());
    // The player's visible body is its own skeletal mesh; the character's mesh stays hidden.
    if (Character) Character->ForEachComponent<USkeletalMeshComponent>(false, Clear);
    return Eye + FVector(0.f, 0.f, Lift);
}

void UFlowFestJamSlice::PlaceCamera(const FVector& Eye, const FVector& Look)
{
    if (Camera) Camera->SetActorLocationAndRotation(Eye, (Look - Eye).Rotation());
}

void UFlowFestJamSlice::TickOpening(float DeltaTime)
{
    // The opening clock starts with the fade.
    const float T = FMath::Min(StageSeconds, ShotLength(Layout));
    FVector Eye, Look;
    float Sun = 0.f;
    SampleShot(Layout, T, Eye, Look, Sun);
    World->SetTimeOfDay(SolveClockHour(Sun));
    PlaceCamera(ClearOfPeople(Jam->Ground(FVector2D(Eye.X, Eye.Y), Eye.Z * 100.f)), Jam->Ground(FVector2D(Look.X, Look.Y), Look.Z * 100.f));
    // Dusk lift. From the sun touching the trees until the circle is lit, the light falls faster
    // than the festival lets auto exposure adapt, and the picture sinks to black. The opening
    // camera lets it adapt one stop further and sits half a stop under it, so the picture reads as
    // dusk rather than day: in from 14 s, full by 20 s, and gone again by the end of the shot,
    // when the night look takes over unchanged.
    if (Camera)
    {
        UCameraComponent* View = Camera->GetCameraComponent();
        FPostProcessSettings& Post = View->PostProcessSettings;
        Post.bOverride_AutoExposureMinBrightness = Post.bOverride_AutoExposureBias = true;
        Post.AutoExposureMinBrightness = -1.f;
        Post.AutoExposureBias = -.5f;
        View->PostProcessBlendWeight = Ease((T - 14.f) / 6.f) * (1.f - Ease((T - ShotLength(Layout) + 5.f) / 5.f));
    }
    // The card: in over the first seconds of the shot, held, then gone; any key sends it early.
    float Card = Ease((StageSeconds - 1.6f) / 1.4f) * (1.f - Ease((StageSeconds - 7.5f) / 1.5f));
    if (bTitleSkipped) Card *= 1.f - Ease((StageSeconds - TitleSkippedAt) / .4f);
    if (Overlay) Overlay->SetTitle(Card);
    if (StageSeconds >= ShotLength(Layout) || bOpeningSkipped)
    {
        NightStartClock = World->GetTimeOfDay();
        NightProgress = 0.f;
        if (Overlay) Overlay->SetTitle(0.f);
        if (bWatch)
        {
            const FVector2D From = FVector2D(Eye.X, Eye.Y) - Layout.Centre;
            OrbitAngle = FMath::Atan2(From.Y, From.X);
            OrbitRadius = From.Size();
            Stage = EStage::Watch;
            StageSeconds = 0.f;
        }
        else Handover();
    }
}

void UFlowFestJamSlice::OnAnyKey(FKey Key)
{
    if (Stage != EStage::Opening || Key.IsMouseButton() && Key != EKeys::LeftMouseButton) return;
    if (!bTitleSkipped) { bTitleSkipped = true; TitleSkippedAt = StageSeconds; return; }
    // A second key, once the card is gone, cuts to the handover.
    if (StageSeconds - TitleSkippedAt > .4f && !bWatch) bOpeningSkipped = true;
}

void UFlowFestJamSlice::Handover()
{
    APlayerController* PC = Cast<APlayerController>(Character->GetController());
    const FVector Start = Jam->Ground(Layout.Handover, 110.f);
    Character->SetActorLocationAndRotation(Start, FRotator(0.f, UnrealYaw(Layout.HandoverYaw), 0.f), false, nullptr, ETeleportType::TeleportPhysics);
    if (PC)
    {
        if (AnyKeyInput) PC->PopInputComponent(AnyKeyInput);
        PC->SetControlRotation(FRotator(-10.f, UnrealYaw(Layout.HandoverYaw), 0.f));
        PC->ResetIgnoreMoveInput();
        PC->ResetIgnoreLookInput();
        PC->SetViewTargetWithBlend(Character, 1.8f, VTBlend_EaseInOut, 2.f);
    }
    DefaultArm = Character->CameraBoom->TargetArmLength;
    DefaultSocket = Character->CameraBoom->SocketOffset;
    DefaultFov = Character->FollowCamera->FieldOfView;
    Stage = EStage::Play;
    StageSeconds = 0.f;
    UE_LOG(LogTemp, Display, TEXT("FlowFestJam handover at clock %.2f (sun %.1f); the night builds to %.2f over %.0f s"),
        NightStartClock, ModelElevation(NightStartClock), FullNightClock, NightSeconds);
}

void UFlowFestJamSlice::TickNight(float DeltaTime)
{
    NightProgress = FMath::Min(1.f, NightProgress + DeltaTime / NightSeconds);
    World->SetTimeOfDay(FMath::Lerp(NightStartClock, FullNightClock, NightProgress));
}

void UFlowFestJamSlice::TickPlay(float DeltaTime)
{
    TickNight(DeltaTime);
    APlayerController* PC = Cast<APlayerController>(Character->GetController());
    const FVector At = Character->GetActorLocation();
    const float RopeM = Jam->DistanceToRopeCm(At) / 100.f;
    const bool bInside = Jam->IsInside(At);
    const float Speed = Character->GetVelocity().Size2D() / 100.f;
    const bool bFlowing = Character->IsFlowPlaying();
    bUsedFlow |= bFlowing;

    // Sit: hold the seat until E or a movement key, then rise before walking again.
    if (bSeated)
    {
        SitElapsed += DeltaTime;
        if (StandRemaining < 0.f && SitElapsed > 1.2f && (Character->bForward || Character->bBack || Character->bLeft || Character->bRight)) StandRemaining = FFlowFestActivityPose::RestRiseSeconds;
        if (StandRemaining >= 0.f)
        {
            StandRemaining -= DeltaTime;
            if (StandRemaining <= 0.f)
            {
                bSeated = false;
                StandRemaining = -1.f;
                if (PC) PC->ResetIgnoreMoveInput();
            }
        }
    }

    // Linger: standing still near the circle eases the boom lower and wider, to take it in.
    const bool bStill = Speed < Layout.LingerSpeed && RopeM < Layout.LingerRadius && !Character->bFirstPerson && !Character->bPhotoFly;
    LingerSeconds = bStill ? LingerSeconds + DeltaTime : 0.f;
    const float Want = LingerSeconds >= Layout.LingerSettle || (bSeated && RopeM < Layout.LingerRadius) ? 1.f : 0.f;
    LingerBlend = FMath::Lerp(LingerBlend, Want, 1.f - FMath::Exp(-DeltaTime / (Want > LingerBlend ? 1.6f : .5f)));
    if (!Character->bFirstPerson && !Character->bPhotoFly && !Character->bInVehicle)
    {
        Character->CameraBoom->TargetArmLength = DefaultArm + 190.f * LingerBlend;
        Character->CameraBoom->SocketOffset = DefaultSocket + FVector(0.f, 0.f, -48.f * LingerBlend);
        Character->FollowCamera->SetFieldOfView(DefaultFov + 9.f * LingerBlend);
    }

    // Join: stepping in through the gap lights the player's props at the flame, as the
    // performers do; leaving the circle puts them out.
    if (bInside && !bWasInside && FVector2D::Distance(FVector2D(World->GetRootComponent()->GetComponentTransform().InverseTransformPosition(At)) / 100.f, Layout.Entrance) < 6.f
        && Character->Props && !bLit)
    {
        Character->Props->SetFinish(TEXT("fire"));
        bLit = true;
        UE_LOG(LogTemp, Display, TEXT("FlowFestJam join: the player came in through the gap and lit up"));
    }
    else if (!bInside && bWasInside && bLit && RopeM > 1.f)
    {
        Character->Props->SetFinish(NAME_None);
        bLit = false;
    }
    if (bInside != bWasInside && RopeM > .4f) bWasInside = bInside;

    // One quiet hint near the circle, for the verbs not yet used.
    FString Text;
    if (RopeM < 12.f && !bSeated)
    {
        if (!bInside && !bUsedSit) Text = bUsedFlow ? TEXT("E  sit at the edge") : TEXT("E  sit      Q  flow");
        else if (!bUsedFlow) Text = TEXT("Q  flow");
    }
    HintOpacity = FMath::FInterpTo(HintOpacity, Text.IsEmpty() ? 0.f : .62f, DeltaTime, 1.4f);
    if (Overlay) Overlay->SetHint(FText::FromString(Text), HintOpacity);
}

void UFlowFestJamSlice::TickWatch(float DeltaTime)
{
    TickNight(DeltaTime);
    // A slow circuit a little outside the rope, above the spinners' heads, settling from the last key.
    OrbitAngle += DeltaTime * 2.f * PI / 150.f;
    const float Settle = Ease(StageSeconds / 6.f);
    const float Radius = FMath::Lerp(OrbitRadius, 17.f, Settle);
    const FVector2D Eye = Layout.Centre + FVector2D(FMath::Cos(OrbitAngle), FMath::Sin(OrbitAngle)) * Radius;
    PlaceCamera(ClearOfPeople(Jam->Ground(Eye, FMath::Lerp(170.f, 330.f, Settle))), Jam->Ground(Layout.Centre, 110.f));
}

bool UFlowFestJamSlice::OverridePose(EFlowFestBodyActivity& Activity, float& Elapsed, float& ExitRemaining) const
{
    if (!bSeated) return false;
    Activity = EFlowFestBodyActivity::FloorRest;
    Elapsed = SitElapsed;
    ExitRemaining = StandRemaining;
    return true;
}

void UFlowFestJamSlice::Interact()
{
    if (Stage != EStage::Play) return;
    APlayerController* PC = Cast<APlayerController>(Character->GetController());
    if (bSeated)
    {
        if (StandRemaining < 0.f && SitElapsed > 1.2f) StandRemaining = FFlowFestActivityPose::RestRiseSeconds;
        return;
    }
    const FVector At = Character->GetActorLocation();
    // Sit on the grass at the edge: outside the rope, within a few metres of it, standing still.
    if (Jam->IsInside(At) || Jam->DistanceToRopeCm(At) > 600.f || Character->IsFlowPlaying() || !Character->GetCharacterMovement()->IsMovingOnGround()) return;
    Character->GetCharacterMovement()->StopMovementImmediately();
    if (PC) PC->SetIgnoreMoveInput(true);
    bSeated = true;
    bUsedSit = true;
    SitElapsed = 0.f;
    StandRemaining = -1.f;
    UE_LOG(LogTemp, Display, TEXT("FlowFestJam sit at the edge, %.1f m from the rope"), Jam->DistanceToRopeCm(At) / 100.f);
}

void UFlowFestJamSlice::Record()
{
    if (RecordDir.IsEmpty() || Stage == EStage::Loading || Stage == EStage::Waiting) return;
    if (SinceReveal <= RecordSeconds)
    {
        FScreenshotRequest::RequestScreenshot(RecordDir / FString::Printf(TEXT("frame-%04d.png"), RecordedFrames++), true, false);
        return;
    }
    if (bExitWhenDone)
    {
        UE_LOG(LogTemp, Display, TEXT("FlowFestJam recording done: %d frames at 30 fps in %s"), RecordedFrames, *RecordDir);
        bExitWhenDone = false;
        UKismetSystemLibrary::QuitGame(this, Cast<APlayerController>(Character->GetController()), EQuitPreference::Quit, false);
    }
}

FString UFlowFestJamSlice::StageName() const
{
    switch (Stage)
    {
    case EStage::Loading: return TEXT("loading");
    case EStage::Opening: return TEXT("opening");
    case EStage::Play: return FString::Printf(TEXT("night %.2f"), NightProgress);
    case EStage::Watch: return FString::Printf(TEXT("watch night %.2f"), NightProgress);
    default: return TEXT("waiting");
    }
}

// The figures `stat unit` shows, from the same engine counters, averaged and logged every 5 s.
float UFlowFestJamSlice::ResolutionPercent()
{
    FDynamicResolutionStateInfos Infos;
    GEngine->GetDynamicResolutionCurrentStateInfos(Infos);
    return Infos.Status == EDynamicResolutionStatus::Enabled ? 100.f * Infos.ResolutionFractionApproximations[GDynamicPrimaryResolutionFraction] : -1.f; // -1: dynamic resolution is off
}

void UFlowFestJamSlice::LogStats(float DeltaTime)
{
    StatFrame += FApp::GetDeltaTime() > 0.0 && !FApp::UseFixedTimeStep() ? DeltaTime * 1000.0 : 0.0;
    StatGame += FPlatformTime::ToMilliseconds(GGameThreadTime);
    StatDraw += FPlatformTime::ToMilliseconds(GRenderThreadTime);
    StatGpu += FPlatformTime::ToMilliseconds(RHIGetGPUFrameCycles(0));
    ++StatFrames;
    // A spinner whose performance clock did not move this frame showed the same staff angle twice.
    for (const TWeakObjectPtr<USkeletalMeshComponent>& Weak : Budgeted)
    {
        const USkeletalMeshComponent* Body = Weak.Get();
        if (!Body || !Body->WasRecentlyRendered() || !IsSpinning(Body)) continue;
        const float Time = Cast<UFlowFestAnimInstance>(Body->GetAnimInstance())->GetPerformanceTime();
        if (const float* Last = SpinTimes.Find(Weak))
        {
            ++SpinSamples;
            if (Time != *Last) ++SpinAdvances;
        }
        SpinTimes.Add(Weak, Time);
    }
    const double Now = FPlatformTime::Seconds();
    if (Now - StatSince < 5.0) return;
    const double Wall = (Now - StatSince) * 1000.0 / StatFrames;
    const double SpinShare = SpinSamples > 0 ? static_cast<double>(SpinAdvances) / SpinSamples : 0.0;
    UE_LOG(LogTemp, Display, TEXT("FlowFestJam stat unit [%s]: fps %.1f  frame %.1f ms  game %.1f  draw %.1f  gpu %.1f  (%d frames, clock %.2f, %d lit, %d near the entrance, %d bodies budgeted, clearance %d exact %d capsules %d skipped, %d exact switches, resolution %.0f%%, %d spinning, on-screen spinners pose %.0f%% of frames = %.1f poses/s%s)"),
        *StageName(), 1000.0 / Wall, Wall, StatGame / StatFrames, StatDraw / StatFrames, StatGpu / StatFrames, StatFrames,
        World ? World->GetTimeOfDay() : 0.f, Jam ? Jam->CountFireLit() : 0, Jam ? Jam->CountNearEntrance(6.f) : 0, BudgetedBodies, ExactBodies, Budgeted.Num() - ExactBodies - SkippedBodies, SkippedBodies, ExactSwitches,
        ResolutionPercent(), SpinningBodies, 100.0 * SpinShare, SpinShare * 1000.0 / Wall, bThrottleSpinners ? TEXT(", spinners throttled") : TEXT(""));
    StatFrame = StatGame = StatDraw = StatGpu = 0.0;
    StatFrames = 0;
    SpinSamples = SpinAdvances = 0;
    StatSince = Now;
}

void UFlowFestJamSlice::BudgetBodies()
{
    // The shared arm clearance solves a body on every evaluation and costs milliseconds a
    // body, so a frame affords only a handful. Update-rate optimisation evaluates large,
    // near bodies every frame and small, far ones every few frames, interpolating between;
    // spinners are the exception (RateSpinners). The festival's own crowd stops casting
    // shadows here, and with the shadow lever (the default) the jam's people do too.
    const double Now = FPlatformTime::Seconds();
    if (Now - ClearanceBudgetedAt >= .25)
    {
        ClearanceBudgetedAt = Now;
        BudgetClearance();
        RateSpinners();
    }
    if (Now - BudgetedAt < 2.0) return;
    BudgetedAt = Now;
    for (TObjectIterator<USkeletalMeshComponent> It; It; ++It)
    {
        USkeletalMeshComponent* Body = *It;
        if (Body->GetWorld() != GetWorld() || !Body->IsRegistered() || Body->bEnableUpdateRateOptimizations) continue;
        if (!Body->GetOwner() || Body->GetOwner() == Character) continue;
        // Spinners turn the rate back off (RateSpinners); dress each body once.
        bool bSeen = false;
        Dressed.Add(Body, &bSeen);
        if (bSeen) continue;
        if (Cast<UFlowFestAnimInstance>(Body->GetAnimInstance())) Budgeted.Add(Body);
        Body->bEnableUpdateRateOptimizations = true;
        if (FAnimUpdateRateParameters* Rate = Body->AnimUpdateRateParams)
        {
            Rate->bInterpolateSkippedFrames = true;
            Rate->bShouldUseLodMap = false;
            Rate->MaxEvalRateForInterpolation = 6;
            Rate->BaseNonRenderedUpdateRate = 8;
            // Screen size above .55: every frame; then every 2nd, 3rd, 4th, 5th, and 6th below .05.
            Rate->BaseVisibleDistanceFactorThesholds = { .55f, .32f, .18f, .1f, .05f };
        }
        if (Levers & LeverShadows)
        {
            // Nobody in the crowd draws into the moon's shadow map: a moving body redraws its
            // pages every frame, and at night the shadows are too faint to read anyway.
            TArray<UPrimitiveComponent*> Parts;
            Body->GetOwner()->GetComponents<UPrimitiveComponent>(Parts);
            for (UPrimitiveComponent* Part : Parts) Part->SetCastShadow(false);
        }
        else if (!Jam->OwnsActor(Body->GetOwner())) Body->SetCastShadow(false);
        if (Levers & LeverFire)
            if (UFlowArtsNiagaraEffectComponent* Fire = Body->GetOwner()->FindComponentByClass<UFlowArtsNiagaraEffectComponent>())
                Fire->MaxActiveDistanceCm = FireDistanceCm;
        ++BudgetedBodies;
    }
}

bool UFlowFestJamSlice::IsSpinning(const USkeletalMeshComponent* Body)
{
    const UFlowFestAnimInstance* Anim = Cast<UFlowFestAnimInstance>(Body->GetAnimInstance());
    const UFlowFestPropComponent* Prop = Body->GetOwner()->FindComponentByClass<UFlowFestPropComponent>();
    return Anim && Prop && Prop->HasVisibleGrip() && Anim->GetPerformanceLength() > 0.f && Anim->GetPerformanceWeight() > 0.f;
}

void UFlowFestJamSlice::RateSpinners()
{
    // A spinner's performance clock, and with it the prop it carries, moves on only when its
    // body evaluates. On the size-on-screen rate most spinners at the circle evaluated every
    // 2nd to 6th frame, so a staff turned at 10 to 30 steps a second however fast the game
    // ran. Spinners evaluate every frame; watchers and walkers keep the rate.
    SpinningBodies = 0;
    for (const TWeakObjectPtr<USkeletalMeshComponent>& Weak : Budgeted)
    {
        USkeletalMeshComponent* Body = Weak.Get();
        if (!Body) continue;
        const bool bSpinning = IsSpinning(Body);
        SpinningBodies += bSpinning;
        Body->bEnableUpdateRateOptimizations = !bSpinning || bThrottleSpinners;
    }
}

void UFlowFestJamSlice::BudgetClearance()
{
    // Arm clearance keeps a spun prop off the body. Empty-handed watchers have nothing to keep
    // off, so they skip it. The duet partner and the spinner nearest the camera, within
    // 9 m, keep the exact solve; every other spinner solves against the estimated body
    // capsules. A body newly made exact pays for a few cold solves and its prepared motion for
    // several seconds, so the choice changes rarely: an exact body stays exact for at least
    // 6 s, counts as 40% nearer than it is, and lets go only past 12 m.
    if (!(Levers & LeverClearance)) return;
    const APlayerController* Controller = Cast<APlayerController>(Character->GetController());
    if (!Controller || !Controller->PlayerCameraManager) return;
    const FVector Eye = Controller->PlayerCameraManager->GetCameraLocation();
    const AActor* Partner = Jam->GetDuetPartner();
    const double Now = FPlatformTime::Seconds();
    struct FSpinner { USkeletalMeshComponent* Body; UFlowFestAnimInstance* Anim; float Score; bool bHeld; };
    TArray<FSpinner> Spinners;
    TMap<TWeakObjectPtr<USkeletalMeshComponent>, double> NextExact;
    ExactBodies = SkippedBodies = 0;
    Budgeted.RemoveAll([](const TWeakObjectPtr<USkeletalMeshComponent>& Body) { return !Body.IsValid(); });
    const auto MakeExact = [&](USkeletalMeshComponent* Body, UFlowFestAnimInstance* Anim)
    {
        const double* Since = ExactSince.Find(Body);
        if (!Since) ++ExactSwitches;
        NextExact.Add(Body, Since ? *Since : Now);
        Anim->SetClearanceBudget(EFlowFestClearanceBudget::Exact);
        ++ExactBodies;
    };
    for (const TWeakObjectPtr<USkeletalMeshComponent>& Weak : Budgeted)
    {
        USkeletalMeshComponent* Body = Weak.Get();
        UFlowFestAnimInstance* Anim = Cast<UFlowFestAnimInstance>(Body->GetAnimInstance());
        if (!Anim) continue;
        const UFlowFestPropComponent* Prop = Body->GetOwner()->FindComponentByClass<UFlowFestPropComponent>();
        if (!Prop || !Prop->HasVisibleGrip())
        {
            Anim->SetClearanceBudget(EFlowFestClearanceBudget::Skip);
            ++SkippedBodies;
            continue;
        }
        if (Body->GetOwner() == Partner)
        {
            MakeExact(Body, Anim);
            continue;
        }
        const double* Since = ExactSince.Find(Body);
        const float Distance = FVector::Dist(Eye, Body->Bounds.Origin);
        const bool bHeld = Since && Now - *Since < 6.0;
        if (!bHeld && Distance > (Since ? 1200.f : 900.f))
        {
            if (Since) ++ExactSwitches;
            Anim->SetClearanceBudget(EFlowFestClearanceBudget::Capsules);
            continue;
        }
        Spinners.Add({Body, Anim, Distance * (Since ? .6f : 1.f), bHeld});
    }
    // Held bodies first, then nearest.
    Spinners.Sort([](const FSpinner& A, const FSpinner& B) { return A.bHeld != B.bHeld ? A.bHeld : A.Score < B.Score; });
    for (int32 Index = 0; Index < Spinners.Num(); ++Index)
    {
        if (Index < ExactLimit)
        {
            MakeExact(Spinners[Index].Body, Spinners[Index].Anim);
            continue;
        }
        if (ExactSince.Contains(Spinners[Index].Body)) ++ExactSwitches;
        Spinners[Index].Anim->SetClearanceBudget(EFlowFestClearanceBudget::Capsules);
    }
    ExactSince = MoveTemp(NextExact);
}

void UFlowFestJamSlice::TickShots(float DeltaTime)
{
    // Review stills: a chair sitter from both sides, the front, behind and above, the circle from
    // above the entrance, and the crowd wide. Each view holds a moment so every body in it
    // has evaluated at its own rate before the still is taken.
    static const TCHAR* Names[] = { TEXT("chair-side"), TEXT("chair-other-side"), TEXT("chair-front"), TEXT("chair-behind"), TEXT("chair-top"), TEXT("chair2-side"), TEXT("circle"), TEXT("circle-centre"), TEXT("wide") };
    constexpr int32 Count = UE_ARRAY_COUNT(Names);
    if (ShotIndex >= Count)
    {
        // Quit a moment after the last still so it is written.
        ShotHeld += DeltaTime;
        if (bExitWhenDone && ShotHeld > .5f) UKismetSystemLibrary::QuitGame(this, Cast<APlayerController>(Character->GetController()), EQuitPreference::Quit, false);
        return;
    }
    FVector2D ChairAt;
    float ChairYaw = 0.f;
    const bool bChair = Jam->GetChairSitter(ShotIndex == 5 ? 5 : 0, ChairAt, ChairYaw);
    const FVector2D F = Facing(ChairYaw), R(-F.Y, F.X);
    const FVector2D In = Layout.Inward.GetSafeNormal(), Across(-In.Y, In.X);
    FVector Eye, Look;
    switch (ShotIndex)
    {
    case 0: case 5: Eye = Jam->Ground(ChairAt + R * 2.2f + F * .3f, 95.f); Look = Jam->Ground(ChairAt + F * .15f, 60.f); break;
    case 1: Eye = Jam->Ground(ChairAt - R * 2.2f + F * .3f, 95.f); Look = Jam->Ground(ChairAt + F * .15f, 60.f); break;
    case 2: Eye = Jam->Ground(ChairAt + F * 1.4f, 95.f); Look = Jam->Ground(ChairAt, 60.f); break;
    case 3: Eye = Jam->Ground(ChairAt - F * 1.6f + R * 1.4f, 150.f); Look = Jam->Ground(ChairAt, 60.f); break;
    case 4: Eye = Jam->Ground(ChairAt - F * .05f, 330.f); Look = Jam->Ground(ChairAt + F * .05f, 0.f); break;
    // Above the clearing, clear of the canopy; from the centre, where outward spinners show their backs.
    case 6: Eye = Jam->Ground(Layout.Centre - In * 5.f, 2600.f); Look = Jam->Ground(Layout.Centre, 0.f); break;
    case 7: Eye = Jam->Ground(Layout.Centre, 260.f); Look = Jam->Ground(Layout.Centre + Across * 12.f, 90.f); break;
    default: Eye = Jam->Ground(Layout.Centre - In * 13.f + Across * 3.f, 380.f); Look = Jam->Ground(Layout.Centre + In * 16.f, 120.f); break;
    }
    if (ShotIndex <= 5 && !bChair)
    {
        UE_LOG(LogTemp, Warning, TEXT("FlowFestJam shot %s: no chair sitter shown"), Names[ShotIndex]);
        ++ShotIndex;
        return;
    }
    PlaceCamera(Eye, Look);
    // Review stills lift the exposure so the poses read at night; the light itself is unchanged.
    if (Camera)
    {
        FPostProcessSettings& Post = Camera->GetCameraComponent()->PostProcessSettings;
        Post.bOverride_AutoExposureBias = true;
        Post.AutoExposureBias = ShotIndex <= 5 ? 3.5f : 2.f;
        Post.bOverride_AutoExposureMinBrightness = false;
        Camera->GetCameraComponent()->PostProcessBlendWeight = 1.f;
    }
    ShotHeld += DeltaTime;
    if (ShotHeld < 1.5f) return;
    const FString Path = ShotDir / FString::Printf(TEXT("%s.png"), Names[ShotIndex]);
    FScreenshotRequest::RequestScreenshot(Path, false, false);
    UE_LOG(LogTemp, Display, TEXT("FlowFestJam shot %s at clock %.2f, %.0f s after the reveal: %s"), Names[ShotIndex], World->GetTimeOfDay(), SinceReveal, *Path);
    ShotHeld = 0.f;
    ++ShotIndex;
}
