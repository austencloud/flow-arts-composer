#include "FlowFestCharacter.h"
#include "FlowFestWorld.h"
#include "FlowFestAvatarComponent.h"
#include "FlowFestPropComponent.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/InputComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Animation/AnimInstance.h"
#include "Animation/AnimSingleNodeInstance.h"
#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "Kismet/GameplayStatics.h"
#include "UObject/ConstructorHelpers.h"
#include "InputCoreTypes.h"
#include "HAL/PlatformFileManager.h"
#include "HAL/FileManager.h"
#include "HAL/PlatformMisc.h"
#include "Misc/CommandLine.h"
#include "Misc/Paths.h"
#include "Misc/Parse.h"
#include "Misc/FileHelper.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "UnrealClient.h"
#include "HighResScreenshot.h"

namespace
{
constexpr float InteractionRadius = 1800.f;
constexpr float ArriveRadius = 2600.f;
constexpr float VehicleRadius = 3400.f;
}

AFlowFestCharacter::AFlowFestCharacter()
{
    PrimaryActorTick.bCanEverTick = true;
    GetCapsuleComponent()->InitCapsuleSize(42.f, 92.f);
    GetCharacterMovement()->MaxWalkSpeed = 380.f;
    GetCharacterMovement()->JumpZVelocity = 500.f;
    GetCharacterMovement()->AirControl = .35f;
    bUseControllerRotationYaw = false;
    GetCharacterMovement()->bOrientRotationToMovement = true;

    CameraBoom = CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraBoom"));
    CameraBoom->SetupAttachment(GetRootComponent());
    CameraBoom->TargetArmLength = 420.f;
    CameraBoom->bUsePawnControlRotation = true;
    CameraBoom->SocketOffset = FVector(0.f, 0.f, 65.f);
    CameraBoom->bDoCollisionTest = true;
    FollowCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("FollowCamera"));
    FollowCamera->SetupAttachment(CameraBoom, USpringArmComponent::SocketName);
    FollowCamera->bUsePawnControlRotation = false;

    static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(TEXT("/Engine/BasicShapes/Cube.Cube"));
    // The first bootstrap loads this class before importing the car. The cook
    // explicitly includes /Game/FlowFest, so this optional load keeps that pass clean.
    UStaticMesh* FestivalCar = LoadObject<UStaticMesh>(nullptr, TEXT("/Game/FlowFest/Assets/Car/SM_Car.SM_Car"), nullptr, LOAD_NoWarn | LOAD_Quiet);
    GetMesh()->SetVisibility(false);
    AvatarRoot = CreateDefaultSubobject<USceneComponent>(TEXT("AvatarRoot"));
    AvatarRoot->SetupAttachment(GetRootComponent());
    AvatarRoot->SetRelativeLocation(FVector(0, 0, -92));
    Avatar = CreateDefaultSubobject<UFlowFestAvatarComponent>(TEXT("FestivalAvatar"));
    Props = CreateDefaultSubobject<UFlowFestPropComponent>(TEXT("FlowProps"));

    CarMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("FestivalCar"));
    CarMesh->SetupAttachment(GetRootComponent());
    CarMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    CarMesh->SetRelativeLocation(CarVisualOffset);
    CarMesh->SetRelativeScale3D(FestivalCar ? CarVisualScale : FVector(2.6f, 1.35f, .65f));
    if (FestivalCar) CarMesh->SetStaticMesh(FestivalCar);
    else if (Cube.Succeeded()) CarMesh->SetStaticMesh(Cube.Object);
    CarMesh->SetVisibility(false);

    EUCMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("ElectricUnicycle"));
    EUCMesh->SetupAttachment(GetRootComponent());
    EUCMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    EUCMesh->SetRelativeLocation(FVector(0, 0, -92));
    // Match the imported rig: source forward becomes actor +X, lateral becomes -Y.
    EUCMesh->SetRelativeRotation(FRotator(0, -90, 0));
    EUCMesh->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Game/FlowFest/EUC/SM_EUC_Body.SM_EUC_Body"), nullptr, LOAD_NoWarn | LOAD_Quiet));
    EUCMesh->SetVisibility(false);
    EUCWheel = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("ElectricUnicycleWheel"));
    EUCWheel->SetupAttachment(EUCMesh);
    EUCWheel->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    EUCWheel->SetRelativeLocation(FVector(0, 0, 36.3f));
    EUCWheel->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Game/FlowFest/EUC/SM_EUC_Wheel.SM_EUC_Wheel"), nullptr, LOAD_NoWarn | LOAD_Quiet));
    EUCWheel->SetVisibility(false);
}

void AFlowFestCharacter::BeginPlay()
{
    Super::BeginPlay();
    FParse::Value(FCommandLine::Get(), TEXT("FlowFestReview="), ReviewSite);
    FParse::Value(FCommandLine::Get(), TEXT("FlowFestShowcase="), Showcase);
    ReviewSite = ReviewSite.ToLower();
    bReviewMode = ReviewSite == TEXT("gate") || ReviewSite == TEXT("camp") || ReviewSite == TEXT("fire") || ReviewSite == TEXT("overview");
    FParse::Value(FCommandLine::Get(), TEXT("FlowFestCapture="), CapturePath);
    bAutoExit = FParse::Param(FCommandLine::Get(), TEXT("FlowFestAutoExit"));
    bSmoke = FParse::Param(FCommandLine::Get(), TEXT("FlowFestSmoke"));
    if (!CapturePath.IsEmpty() && (FPaths::IsRelative(CapturePath) || !CapturePath.EndsWith(TEXT(".png"), ESearchCase::IgnoreCase)))
    {
        UE_LOG(LogTemp, Error, TEXT("FlowFestCapture must be an absolute .png path"));
        CapturePath.Empty();
    }
    if (APlayerController* PC = Cast<APlayerController>(GetController()))
    {
        PC->bShowMouseCursor = false;
        FInputModeGameOnly Mode;
        PC->SetInputMode(Mode);
    }
    LoadCatalogs();
    FString RequestedCharacter, RequestedProp;
    if (FParse::Value(FCommandLine::Get(), TEXT("FlowFestCharacter="), RequestedCharacter)) CharacterId = FName(*RequestedCharacter);
    if (FParse::Value(FCommandLine::Get(), TEXT("FlowFestProp="), RequestedProp)) EquippedPropId = FName(*RequestedProp);
    Avatar->Initialize(AvatarRoot, CharacterId);
    Props->Initialize(AvatarRoot);
    Props->Equip(EquippedPropId);
    Props->BindHands(Avatar->GetBodyMesh());
    SyncModeVisuals();
    if (FParse::Param(FCommandLine::Get(), TEXT("FlowFestWardrobe"))) ToggleWardrobe();
}

void AFlowFestCharacter::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if (!FestivalWorld)
    {
        for (TActorIterator<AFlowFestWorld> It(GetWorld()); It; ++It)
        {
            FestivalWorld = *It;
            break;
        }
    }
    if (FestivalWorld && !bInitialPlacementDone)
    {
        if (bReviewMode) PlaceReviewCamera();
        else SetActorLocation(FestivalWorld->GetLandmark(TEXT("start")) + FVector(0, 0, 110), false);
        bInitialPlacementDone = true;
        if (!bReviewMode) ApplyPhaseTime();
        SyncPlayerCamp();
        if (Showcase == TEXT("flow") || Showcase == TEXT("ride"))
        {
            Phase = EFlowFestPhase::FestivalNight;
            SetActorLocationAndRotation(FestivalWorld->GetLandmark(TEXT("workshop")) + FVector(0, 0, 110), FRotator::ZeroRotator, false);
            FestivalWorld->SetTimeOfDay(17.f);
            if (Showcase == TEXT("ride")) bOnEUC = true;
            SyncModeVisuals();
            CameraBoom->bDoCollisionTest = false;
            CameraBoom->TargetArmLength = 350.f;
            CameraBoom->SocketOffset = FVector(0, 0, 0);
            if (AController* C = GetController()) C->SetControlRotation(FRotator(-6.f, 145.f, 0));
        }
    }

    StartupSeconds += DeltaSeconds;
    // Wait for CharacterMovement to settle after the showcase teleport.
    if (Showcase == TEXT("flow") && !bShowcaseStarted && StartupSeconds >= 2.f && !GetCharacterMovement()->IsFalling())
    {
        bShowcaseStarted = true;
        ToggleStaff();
    }
    if (bReviewMode && StartupSeconds >= 10.f)
    {
        const float DeltaMs = DeltaSeconds * 1000.f;
        FrameDeltaTotalMs += DeltaMs;
        FrameDeltaMaxMs = FMath::Max(FrameDeltaMaxMs, DeltaMs);
        ++FrameSampleCount;
    }
    if (bSmoke && !bSmokeRan && FestivalWorld && bInitialPlacementDone && StartupSeconds >= 2.f)
    {
        if (RunSmokeDrive())
        {
            bSmokeRan = true;
            RunSmoke();
        }
    }
    if (!CapturePath.IsEmpty() && !bCaptureRequested && StartupSeconds >= 25.f)
    {
        if (GEngine && GEngine->GameViewport && GEngine->GameViewport->Viewport)
        {
            FHighResScreenshotConfig& Screenshot = GetHighResScreenshotConfig();
            CapturePreviousTimestamp = IFileManager::Get().GetTimeStamp(*CapturePath);
            Screenshot.SetFilename(CapturePath);
            Screenshot.SetResolution(1920, 1080);
            UE_LOG(LogTemp, Display, TEXT("FlowFestVisual character=%s body=%s bounds=%s camera=%s arm=%.1f"),
                *CharacterId.ToString(), *Avatar->GetBodyMesh()->GetComponentLocation().ToString(),
                *Avatar->GetBodyMesh()->Bounds.BoxExtent.ToString(), *FollowCamera->GetComponentLocation().ToString(), CameraBoom->TargetArmLength);
            USkeletalMeshComponent* Body = Avatar->GetBodyMesh();
            FVector2D BodyScreen;
            if (APlayerController* PC = Cast<APlayerController>(GetController())) PC->ProjectWorldLocationToScreen(Body->Bounds.Origin, BodyScreen);
            UE_LOG(LogTemp, Display, TEXT("FlowFestVisual pose hips=%s foot=%s hand=%s center=%s screen=%s visible=%d hidden=%d ownerNoSee=%d cameraRot=%s"),
                *Body->GetSocketLocation(TEXT("Hips")).ToString(), *Body->GetSocketLocation(TEXT("LeftFoot")).ToString(),
                *Body->GetSocketLocation(TEXT("LeftHand")).ToString(), *Body->Bounds.Origin.ToString(), *BodyScreen.ToString(),
                Body->IsVisible(), Body->bHiddenInGame, Body->bOwnerNoSee, *FollowCamera->GetComponentRotation().ToString());
            bCaptureRequested = GEngine->GameViewport->Viewport->TakeHighResScreenShot();
            UE_LOG(LogTemp, Display, TEXT("Flow Fest high-res screenshot %s: %s"), bCaptureRequested ? TEXT("requested") : TEXT("failed"), *CapturePath);
            ReportFrameTiming();
        }
    }
    if (bCaptureRequested && !bCaptureReady && FPlatformFileManager::Get().GetPlatformFile().FileExists(*CapturePath)
        && IFileManager::Get().GetTimeStamp(*CapturePath) > CapturePreviousTimestamp)
    {
        bCaptureReady = true;
        UE_LOG(LogTemp, Display, TEXT("Flow Fest screenshot written: %s"), *CapturePath);
    }
    if (bAutoExit && StartupSeconds >= 40.f)
    {
        ReportFrameTiming();
        const bool bCaptureFailed = !CapturePath.IsEmpty() && !bCaptureReady;
        const bool bSmokeFailed = bSmoke && (!bSmokeRan || !bSmokePassed);
        if (bCaptureFailed) UE_LOG(LogTemp, Error, TEXT("Flow Fest screenshot was not written before auto-exit"));
        if (bSmokeFailed) UE_LOG(LogTemp, Error, TEXT("Flow Fest smoke failed before auto-exit"));
        FPlatformMisc::RequestExitWithStatus(false, bCaptureFailed || bSmokeFailed ? 1 : 0);
    }

    const float ForwardInput = bWardrobeOpen ? 0.f : (bForward ? 1.f : 0.f) - (bBack ? 1.f : 0.f);
    const float RightInput = bWardrobeOpen ? 0.f : (bRight ? 1.f : 0.f) - (bLeft ? 1.f : 0.f);
    if (bStaffSpinning && (!FMath::IsNearlyZero(ForwardInput) || !FMath::IsNearlyZero(RightInput) || GetCharacterMovement()->IsFalling())) StopFlow();
    if (bInVehicle && !bPhotoFly)
    {
        if (!FMath::IsNearlyZero(ForwardInput))
        {
            const float TurnDegrees = RightInput * FMath::Sign(ForwardInput) * 80.f * DeltaSeconds;
            if (!FMath::IsNearlyZero(TurnDegrees))
            {
                AddActorWorldRotation(FRotator(0.f, TurnDegrees, 0.f));
                if (AController* DrivingController = GetController())
                {
                    FRotator ViewRotation = DrivingController->GetControlRotation();
                    ViewRotation.Yaw += TurnDegrees;
                    DrivingController->SetControlRotation(ViewRotation);
                }
            }
            AddMovementInput(GetActorForwardVector(), ForwardInput);
        }
    }
    else
    {
        const FRotator ViewYaw(0.f, GetControlRotation().Yaw, 0.f);
        AddMovementInput(ViewYaw.Vector(), ForwardInput);
        AddMovementInput(FRotationMatrix(ViewYaw).GetUnitAxis(EAxis::Y), RightInput);
    }
    if (bPhotoFly) AddMovementInput(FVector::UpVector, (bRise ? 1.f : 0.f) - (bDescend ? 1.f : 0.f));

    const float Speed = bPhotoFly ? 1600.f : bInVehicle ? (bSprint ? 2100.f : 1400.f) : bOnEUC ? 1050.f : bSprint ? 640.f : 380.f;
    GetCharacterMovement()->MaxWalkSpeed = Speed;
    GetCharacterMovement()->MaxFlySpeed = Speed;
    if (Phase == EFlowFestPhase::DriveIn && bInVehicle && !bPhotoFly && !FMath::IsNearlyZero(ForwardInput))
        Energy = FMath::Max(0.f, Energy - DeltaSeconds * .075f);

    if (bStaffSpinning)
    {
        if (Phase == EFlowFestPhase::NightFreeRoam && Jam == EFlowFestJam::Active) JamSpinSeconds += DeltaSeconds;
    }
    Avatar->SetMotion(GetVelocity(), GetCharacterMovement()->IsFalling(), bOnEUC && !bWardrobeOpen);
    if (bOnEUC && !bWardrobeOpen) EUCWheel->AddLocalRotation(FRotator(0, 0, FMath::RadiansToDegrees(GetVelocity().Dot(GetActorForwardVector()) * DeltaSeconds / 36.3f)));
    Props->SetHandTransforms(Avatar->GetHandTransform(true), Avatar->GetHandTransform(false));
    if (bStaffSpinning) Props->SetPerformanceTime(Avatar->GetPerformanceTime());
}

void AFlowFestCharacter::SetupPlayerInputComponent(UInputComponent* Input)
{
    Super::SetupPlayerInputComponent(Input);
    Input->BindKey(EKeys::W, IE_Pressed, this, &AFlowFestCharacter::SetForward);
    Input->BindKey(EKeys::W, IE_Released, this, &AFlowFestCharacter::ClearForward);
    Input->BindKey(EKeys::S, IE_Pressed, this, &AFlowFestCharacter::SetBack);
    Input->BindKey(EKeys::S, IE_Released, this, &AFlowFestCharacter::ClearBack);
    Input->BindKey(EKeys::A, IE_Pressed, this, &AFlowFestCharacter::SetLeft);
    Input->BindKey(EKeys::A, IE_Released, this, &AFlowFestCharacter::ClearLeft);
    Input->BindKey(EKeys::D, IE_Pressed, this, &AFlowFestCharacter::SetRight);
    Input->BindKey(EKeys::D, IE_Released, this, &AFlowFestCharacter::ClearRight);
    Input->BindKey(EKeys::LeftShift, IE_Pressed, this, &AFlowFestCharacter::SetSprint);
    Input->BindKey(EKeys::LeftShift, IE_Released, this, &AFlowFestCharacter::ClearSprint);
    Input->BindKey(EKeys::SpaceBar, IE_Pressed, this, &AFlowFestCharacter::JumpOrRise);
    Input->BindKey(EKeys::SpaceBar, IE_Released, this, &AFlowFestCharacter::StopJumpOrRise);
    Input->BindKey(EKeys::LeftControl, IE_Pressed, this, &AFlowFestCharacter::SetDescend);
    Input->BindKey(EKeys::LeftControl, IE_Released, this, &AFlowFestCharacter::ClearDescend);
    Input->BindAxisKey(EKeys::MouseX, this, &AFlowFestCharacter::LookX);
    Input->BindAxisKey(EKeys::MouseY, this, &AFlowFestCharacter::LookY);
    Input->BindKey(EKeys::E, IE_Pressed, this, &AFlowFestCharacter::Interact);
    Input->BindKey(EKeys::One, IE_Pressed, this, &AFlowFestCharacter::SelectOne);
    Input->BindKey(EKeys::Two, IE_Pressed, this, &AFlowFestCharacter::SelectTwo);
    Input->BindKey(EKeys::Three, IE_Pressed, this, &AFlowFestCharacter::SelectThree);
    Input->BindKey(EKeys::C, IE_Pressed, this, &AFlowFestCharacter::ToggleWardrobe);
    Input->BindKey(EKeys::F, IE_Pressed, this, &AFlowFestCharacter::ToggleFirstPerson);
    Input->BindKey(EKeys::P, IE_Pressed, this, &AFlowFestCharacter::TogglePhotoFly);
    Input->BindKey(EKeys::V, IE_Pressed, this, &AFlowFestCharacter::ToggleEUC);
    Input->BindKey(EKeys::Q, IE_Pressed, this, &AFlowFestCharacter::ToggleStaff);
    Input->BindKey(EKeys::T, IE_Pressed, this, &AFlowFestCharacter::TravelToObjective);
    Input->BindKey(EKeys::G, IE_Pressed, this, &AFlowFestCharacter::CycleTime);
    Input->BindKey(EKeys::F5, IE_Pressed, this, &AFlowFestCharacter::SaveProgress);
    Input->BindKey(EKeys::F9, IE_Pressed, this, &AFlowFestCharacter::LoadProgress);
    Input->BindKey(EKeys::F10, IE_Pressed, this, &AFlowFestCharacter::Restart);
    Input->BindKey(EKeys::Escape, IE_Pressed, this, &AFlowFestCharacter::QuitGame);
}

void AFlowFestCharacter::LookX(float Value) { if (!bWardrobeOpen) AddControllerYawInput(Value); }
void AFlowFestCharacter::LookY(float Value) { if (!bWardrobeOpen) AddControllerPitchInput(-Value); }
void AFlowFestCharacter::JumpOrRise() { if (bWardrobeOpen) return; if (bPhotoFly) bRise = true; else if (!bInVehicle) Jump(); }
void AFlowFestCharacter::StopJumpOrRise() { bRise = false; StopJumping(); }
void AFlowFestCharacter::QuitGame() { if (bWardrobeOpen) { ToggleWardrobe(); return; } ReportFrameTiming(); FPlatformMisc::RequestExit(false); }

void AFlowFestCharacter::ReportFrameTiming()
{
    if (!bReviewMode || bTimingReported) return;
    bTimingReported = true;
    if (FrameSampleCount > 0)
    {
        UE_LOG(LogTemp, Display, TEXT("FlowFestReview frame timing after 10s warmup: avg %.2f ms, max %.2f ms, samples %d (game frame delta, not GPU timing)"),
            FrameDeltaTotalMs / FrameSampleCount, FrameDeltaMaxMs, FrameSampleCount);
    }
    else
    {
        UE_LOG(LogTemp, Warning, TEXT("FlowFestReview frame timing: no samples after 10s warmup"));
    }
}

FString AFlowFestCharacter::CampLandmark() const
{
    switch (Camp)
    {
    case EFlowFestCamp::LowerTent: return TEXT("camp-lower");
    case EFlowFestCamp::UpperTent: return TEXT("camp-upper");
    case EFlowFestCamp::CarCamp: return TEXT("camp-car");
    default: return TEXT("start");
    }
}

FVector AFlowFestCharacter::GetObjectiveLocation() const
{
    if (!FestivalWorld) return GetActorLocation();
    switch (Phase)
    {
    case EFlowFestPhase::DriveIn: case EFlowFestPhase::GateCheckIn: return FestivalWorld->GetLandmark(TEXT("gate"));
    case EFlowFestPhase::CampArrival: case EFlowFestPhase::WalkHome: case EFlowFestPhase::MakeCamp:
    case EFlowFestPhase::NightReturn: return FestivalWorld->GetLandmark(CampLandmark());
    case EFlowFestPhase::VehicleSettle: return FestivalWorld->GetLandmark(Camp == EFlowFestCamp::CarCamp ? CampLandmark() : TEXT("parking"));
    case EFlowFestPhase::WalkToFestival: return FestivalWorld->GetLandmark(TEXT("workshop"));
    case EFlowFestPhase::FestivalNight: case EFlowFestPhase::NightFreeRoam: return FestivalWorld->GetLandmark(TEXT("fire"));
    default: return GetActorLocation();
    }
}

float AFlowFestCharacter::GetObjectiveDistanceMeters() const
{
    return FVector::Dist2D(GetActorLocation(), GetObjectiveLocation()) / 100.f;
}

bool AFlowFestCharacter::Near(const FString& Landmark, float RadiusMeters) const
{
    return FestivalWorld && FVector::Dist2D(GetActorLocation(), FestivalWorld->GetLandmark(Landmark)) <= RadiusMeters * 100.f;
}

void AFlowFestCharacter::Advance(EFlowFestPhase Next)
{
    Phase = Next;
    ApplyPhaseTime();
    SyncModeVisuals();
    Notify(GetObjectiveTitle());
    SaveProgress();
}

void AFlowFestCharacter::Interact()
{
    if (bWardrobeOpen) return;
    if (bReviewMode) { Notify(TEXT("Review camera active. F10 starts a new journey.")); return; }
    if (!FestivalWorld) { Notify(TEXT("Festival world is loading")); return; }
    if (bPhotoFly) { Notify(TEXT("Leave photo flight to interact [P]")); return; }
    switch (Phase)
    {
    case EFlowFestPhase::Loadout:
        bInVehicle = true;
        Energy = DepartureChoice == 0 ? 100.f : DepartureChoice == 1 ? 85.f : 70.f;
        Advance(EFlowFestPhase::DriveIn);
        return;
    case EFlowFestPhase::DriveIn:
        if (Near(TEXT("gate"), 26.f)) { bInVehicle = false; Advance(EFlowFestPhase::GateCheckIn); }
        else Notify(TEXT("Drive to the gate marker first"));
        return;
    case EFlowFestPhase::GateCheckIn:
        if (Near(TEXT("gate"), 18.f)) Advance(EFlowFestPhase::ChooseCamp);
        else Notify(TEXT("Return to check-in at the gate"));
        return;
    case EFlowFestPhase::ChooseCamp:
        Notify(TEXT("Choose campsite with 1, 2, or 3"));
        return;
    case EFlowFestPhase::CampArrival:
        if (Near(CampLandmark(), 26.f)) Advance(EFlowFestPhase::VehicleSettle);
        else Notify(TEXT("Travel to your selected campsite"));
        return;
    case EFlowFestPhase::VehicleSettle:
        if (Near(Camp == EFlowFestCamp::CarCamp ? CampLandmark() : TEXT("parking"), 34.f))
        {
            bInVehicle = false;
            Advance(Camp == EFlowFestCamp::CarCamp ? EFlowFestPhase::MakeCamp : EFlowFestPhase::WalkHome);
        }
        else Notify(TEXT("Stage the vehicle at the marked parking place"));
        return;
    case EFlowFestPhase::WalkHome:
        if (Near(CampLandmark(), 26.f)) Advance(EFlowFestPhase::MakeCamp);
        else Notify(TEXT("Walk back to your campsite"));
        return;
    case EFlowFestPhase::MakeCamp:
        if (Near(CampLandmark(), 18.f)) { bCampBuilt = true; Advance(EFlowFestPhase::WalkToFestival); }
        else Notify(TEXT("Make camp at your chosen site"));
        return;
    case EFlowFestPhase::WalkToFestival:
        if (Near(TEXT("workshop"), 26.f)) Advance(EFlowFestPhase::FestivalNight);
        else Notify(TEXT("Follow the trail to the workshop field"));
        return;
    case EFlowFestPhase::FestivalNight:
        if (Near(TEXT("fire"), 26.f)) Advance(EFlowFestPhase::NightFreeRoam);
        else Notify(TEXT("Find the fire circle before night falls"));
        return;
    case EFlowFestPhase::NightFreeRoam:
        if (!Near(TEXT("fire"), 18.f)) { Notify(TEXT("Return to the fire circle")); return; }
        if (bOnEUC) { Notify(TEXT("Park the wheel [V] before entering the circle")); return; }
        if (Jam == EFlowFestJam::NotStarted) { StopFlow(); Jam = EFlowFestJam::Active; JamSpinSeconds = 0.f; Notify(TEXT("You're in the circle. Flow [Q], then [E] to finish.")); }
        else if (Jam == EFlowFestJam::Active)
        {
            if (JamSpinSeconds < 2.f) { Notify(TEXT("Flow [Q] for a moment first")); return; }
            Jam = EFlowFestJam::Completed; StopFlow(); Notify(TEXT("Fire jam complete. [E] to head home."));
        }
        else Advance(EFlowFestPhase::NightReturn);
        SaveProgress();
        return;
    case EFlowFestPhase::NightReturn:
        if (Near(CampLandmark(), 18.f)) Advance(EFlowFestPhase::Morning);
        else Notify(TEXT("Find your campsite and sleep"));
        return;
    case EFlowFestPhase::Morning:
        Notify(TEXT("Friday morning. F10 starts a new Thursday."));
        return;
    }
}

void AFlowFestCharacter::SelectOne()
{
    if (bWardrobeOpen) return;
    if (Phase == EFlowFestPhase::Loadout) { LoadoutChoice = 0; DepartureChoice = 0; Notify(TEXT("Loadout: staff + tent. [E] depart")); }
    else if (Phase == EFlowFestPhase::ChooseCamp) { Camp = EFlowFestCamp::LowerTent; bInVehicle = true; Advance(EFlowFestPhase::CampArrival); }
}
void AFlowFestCharacter::SelectTwo()
{
    if (bWardrobeOpen) return;
    if (Phase == EFlowFestPhase::Loadout) { LoadoutChoice = 1; DepartureChoice = 1; Notify(TEXT("Loadout: LED staff + tent. Later departure. [E] depart")); }
    else if (Phase == EFlowFestPhase::ChooseCamp) { Camp = EFlowFestCamp::UpperTent; bInVehicle = true; Advance(EFlowFestPhase::CampArrival); }
}
void AFlowFestCharacter::SelectThree()
{
    if (bWardrobeOpen) return;
    if (Phase == EFlowFestPhase::Loadout) { LoadoutChoice = 2; DepartureChoice = 2; Notify(TEXT("Loadout: wheel + car camp. Evening arrival. [E] depart")); }
    else if (Phase == EFlowFestPhase::ChooseCamp) { Camp = EFlowFestCamp::CarCamp; bInVehicle = true; Advance(EFlowFestPhase::CampArrival); }
}

void AFlowFestCharacter::ToggleFirstPerson()
{
    if (bWardrobeOpen) return;
    bFirstPerson = !bFirstPerson;
    CameraBoom->TargetArmLength = bFirstPerson ? 0.f : (bInVehicle ? 680.f : 420.f);
    CameraBoom->SocketOffset = bFirstPerson ? FVector(25, 0, 68) : FVector(0, 0, 65);
    Avatar->SetPresentation(!bInVehicle && !bPhotoFly, bFirstPerson);
}
void AFlowFestCharacter::TogglePhotoFly()
{
    if (bWardrobeOpen) return;
    StopFlow();
    bPhotoFly = !bPhotoFly;
    GetCharacterMovement()->SetMovementMode(bPhotoFly ? MOVE_Flying : MOVE_Walking);
    SyncModeVisuals();
    Notify(bPhotoFly ? TEXT("Photo flight; [P] return to the journey") : TEXT("Journey movement restored"));
}
void AFlowFestCharacter::ToggleEUC()
{
    if (bWardrobeOpen) return;
    if (bInVehicle || bPhotoFly || Phase == EFlowFestPhase::Loadout ||
        (!bOnEUC && (Phase == EFlowFestPhase::NightReturn || Phase == EFlowFestPhase::Morning)))
        { Notify(TEXT("Wheel unavailable here")); return; }
    bOnEUC = !bOnEUC;
    StopFlow();
    SyncModeVisuals();
    Notify(bOnEUC ? TEXT("Electric unicycle") : TEXT("On foot"));
}
void AFlowFestCharacter::ToggleStaff()
{
    if (bWardrobeOpen) return;
    if (bInVehicle || bPhotoFly || bOnEUC) { Notify(TEXT("Step onto the ground to flow")); return; }
    if (bStaffSpinning) { StopFlow(); return; }
    const FString Id = EquippedPropId.ToString();
    const FName Profile = Id.StartsWith(TEXT("poi")) ? TEXT("FirePoi") : Id.Contains(TEXT("hoop")) ? TEXT("FireHoop") :
        Id.Contains(TEXT("club")) ? TEXT("Juggler") : TEXT("LedFlow");
    if (!Props->LoadPerformance(CharacterId, Profile) || !Avatar->PlayPerformance(Profile))
    {
        StopFlow();
        Notify(TEXT("This performance could not load"));
        return;
    }
    GetCharacterMovement()->StopMovementImmediately();
    bStaffSpinning = true;
    Props->SetFinish(Profile == TEXT("FirePoi") || Profile == TEXT("FireHoop") ? TEXT("fire") : TEXT("led"));
    Props->SetPerformanceTime(0.f);
}
void AFlowFestCharacter::StopFlow()
{
    bStaffSpinning = false;
    Avatar->StopPerformance();
    Props->ClearPerformanceTransforms();
    Props->ResetFinish();
}
void AFlowFestCharacter::TravelToObjective()
{
    if (bWardrobeOpen) return;
    if (!FestivalWorld || Phase == EFlowFestPhase::Loadout || Phase == EFlowFestPhase::ChooseCamp || Phase == EFlowFestPhase::Morning) return;
    const FVector Target = GetObjectiveLocation();
    if (FVector::Dist2D(Target, GetActorLocation()) < 1000.f) return;
    // Review aid only: progression still requires the correct local interaction.
    SetActorLocation(Target + FVector(-700.f, 0.f, 120.f), false);
    Notify(TEXT("Arrived near objective. Interact locally [E]."));
}
void AFlowFestCharacter::CycleTime()
{
    if (bWardrobeOpen) return;
    if (!FestivalWorld) return;
    const float Current = FestivalWorld->GetTimeOfDay();
    const float Presets[] = {16.f, 18.5f, 23.f, 8.1f};
    int32 ClosestIndex = 0;
    float ClosestDistance = TNumericLimits<float>::Max();
    for (int32 Index = 0; Index < UE_ARRAY_COUNT(Presets); ++Index)
    {
        const float Distance = FMath::Abs(Current - Presets[Index]);
        if (Distance < ClosestDistance) { ClosestDistance = Distance; ClosestIndex = Index; }
    }
    FestivalWorld->SetTimeOfDay(Presets[(ClosestIndex + 1) % UE_ARRAY_COUNT(Presets)]);
    Notify(TEXT("Review light preset changed; story progress unchanged"));
}

void AFlowFestCharacter::PlaceReviewCamera()
{
    if (!FestivalWorld) return;
    const FString Landmark = ReviewSite == TEXT("gate") ? TEXT("gate") : ReviewSite == TEXT("camp") ? TEXT("camp-lower") : TEXT("fire");
    const FVector Target = FestivalWorld->GetLandmark(Landmark) + FVector(0, 0, 160);
    const FVector Offset = ReviewSite == TEXT("overview") ? FVector(-8500, -8500, 10500) :
        ReviewSite == TEXT("fire") ? FVector(-1100, -900, 0) :
        ReviewSite == TEXT("camp") ? FVector(-1400, -1000, 0) : FVector(-2200, -1900, 600);
    FVector Position = Target + Offset;
    if (ReviewSite == TEXT("fire") || ReviewSite == TEXT("camp"))
        Position.Z = FestivalWorld->SampleGround(Position.X * .01f, Position.Y * .01f) + 100.f;
    GetCharacterMovement()->StopMovementImmediately();
    GetCharacterMovement()->SetMovementMode(MOVE_Flying);
    bPhotoFly = true;
    bFirstPerson = true;
    CameraBoom->TargetArmLength = 0.f;
    CameraBoom->SocketOffset = FVector(25, 0, 68);
    Avatar->SetPresentation(false, true);
    SetActorLocation(Position, false);
    if (AController* C = GetController()) C->SetControlRotation((Target - Position - FVector(0, 0, 68)).Rotation());
    FestivalWorld->SetTimeOfDay(ReviewSite == TEXT("gate") ? 16.f : ReviewSite == TEXT("fire") ? 23.f : ReviewSite == TEXT("camp") ? 17.5f : 17.f);
    SyncModeVisuals();
}

void AFlowFestCharacter::ApplyPhaseTime()
{
    if (!FestivalWorld) return;
    float Hour = 15.f;
    if (Phase == EFlowFestPhase::DriveIn || Phase == EFlowFestPhase::GateCheckIn || Phase == EFlowFestPhase::ChooseCamp || Phase == EFlowFestPhase::CampArrival || Phase == EFlowFestPhase::VehicleSettle)
        Hour = DepartureChoice == 0 ? 16.f : DepartureChoice == 1 ? 18.f : 19.25f;
    else if (Phase == EFlowFestPhase::WalkHome || Phase == EFlowFestPhase::MakeCamp || Phase == EFlowFestPhase::WalkToFestival || Phase == EFlowFestPhase::FestivalNight) Hour = 19.f;
    else if (Phase == EFlowFestPhase::NightFreeRoam || Phase == EFlowFestPhase::NightReturn) Hour = 23.f;
    else if (Phase == EFlowFestPhase::Morning) Hour = 8.1f;
    FestivalWorld->SetTimeOfDay(Hour);
}

void AFlowFestCharacter::SyncModeVisuals()
{
    CarMesh->SetVisibility(bInVehicle && !bPhotoFly && !bWardrobeOpen);
    Avatar->SetPresentation(bWardrobeOpen || (!bInVehicle && !bPhotoFly), bFirstPerson && !bWardrobeOpen);
    EUCMesh->SetVisibility(bOnEUC && !bInVehicle && !bPhotoFly && !bWardrobeOpen, true);
    Props->SetVisible(bWardrobeOpen || (!bInVehicle && !bPhotoFly));
    // A_Ride contains the production pedal-contact pose relative to wheel ground.
    AvatarRoot->SetRelativeLocation(FVector(0, 0, -92.f));
    CameraBoom->bDoCollisionTest = !bWardrobeOpen;
    CameraBoom->TargetArmLength = bWardrobeOpen ? 340.f : (bFirstPerson || bPhotoFly) ? 0.f : bInVehicle ? 680.f : 420.f;
    CameraBoom->SocketOffset = bWardrobeOpen ? FVector(0, 150, -10) : (bFirstPerson || bPhotoFly) ? FVector(25, 0, 68) : FVector(0, 0, 65);
    GetCharacterMovement()->bOrientRotationToMovement = !bInVehicle;
    SyncPlayerCamp();
}

void AFlowFestCharacter::SyncPlayerCamp()
{
    if (FestivalWorld) FestivalWorld->SetPlayerCamp(Camp == EFlowFestCamp::None ? FString() : CampLandmark(), bCampBuilt);
}

void AFlowFestCharacter::LoadCatalogs()
{
    auto Read = [](const TCHAR* File) -> TSharedPtr<FJsonObject>
    {
        FString Text;
        TSharedPtr<FJsonObject> Root;
        if (!FFileHelper::LoadFileToString(Text, *(FPaths::ProjectContentDir() / TEXT("Data") / File))
            || !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Root))
            UE_LOG(LogTemp, Error, TEXT("Flow Fest cannot read loadout catalog %s"), File);
        return Root;
    };
    const TArray<TSharedPtr<FJsonValue>>* Entries = nullptr;
    if (const TSharedPtr<FJsonObject> Root = Read(TEXT("characters.json")); Root && Root->TryGetArrayField(TEXT("characters"), Entries))
        for (const auto& Entry : *Entries)
        {
            const auto Row = Entry->AsObject();
            if (Row) CharacterChoices.Add({ FName(*Row->GetStringField(TEXT("id"))), Row->GetStringField(TEXT("name")), TEXT("Character") });
        }
    if (const TSharedPtr<FJsonObject> Root = Read(TEXT("props.json")); Root && Root->TryGetArrayField(TEXT("props"), Entries))
        for (const auto& Entry : *Entries)
        {
            const auto Row = Entry->AsObject();
            if (!Row) continue;
            const FString Id = Row->GetStringField(TEXT("id"));
            const FString Name = Row->GetStringField(TEXT("displayName"));
            const FString Category = Row->GetStringField(TEXT("category"));
            const TArray<TSharedPtr<FJsonValue>>* Variants = nullptr;
            if (!Row->TryGetArrayField(TEXT("variants"), Variants)) continue;
            for (int32 Index = 0; Index < Variants->Num(); ++Index)
            {
                const auto Variant = (*Variants)[Index]->AsObject();
                if (!Variant) continue;
                const FString VariantId = Variant->GetStringField(TEXT("id"));
                const FString Key = Index == 0 ? Id : Id + TEXT(":") + VariantId;
                FString Label = Name;
                if (Variants->Num() > 1)
                {
                    FString Finish = VariantId.Replace(TEXT("_"), TEXT(" ")).Replace(TEXT("-"), TEXT(" "));
                    Label += TEXT(" / ") + Finish;
                }
                PropChoices.Add({ FName(*Key), Label, Category });
            }
        }
    UE_LOG(LogTemp, Display, TEXT("Flow Fest loadout catalog: %d characters, %d prop choices"), CharacterChoices.Num(), PropChoices.Num());
}

void AFlowFestCharacter::ChooseCharacter(FName Id)
{
    if (!CharacterChoices.ContainsByPredicate([Id](const FFlowFestChoice& Choice) { return Choice.Id == Id; })) return;
    StopFlow();
    if (!Avatar->SetCharacter(Id)) { Notify(TEXT("Character asset could not load")); return; }
    CharacterId = Id;
    Props->BindHands(Avatar->GetBodyMesh());
    SyncModeVisuals();
    SaveProgress();
}

void AFlowFestCharacter::ChooseProp(FName Id)
{
    if (!PropChoices.ContainsByPredicate([Id](const FFlowFestChoice& Choice) { return Choice.Id == Id; })) return;
    StopFlow();
    if (!Props->Equip(Id)) { Notify(TEXT("Prop asset could not load")); return; }
    EquippedPropId = Id;
    Props->BindHands(Avatar->GetBodyMesh());
    SaveProgress();
}

void AFlowFestCharacter::ToggleWardrobe()
{
    StopFlow();
    bWardrobeOpen = !bWardrobeOpen;
    bForward = bBack = bLeft = bRight = bRise = bDescend = false;
    GetCharacterMovement()->StopMovementImmediately();
    if (APlayerController* PC = Cast<APlayerController>(GetController()))
    {
        PC->bShowMouseCursor = bWardrobeOpen;
        PC->bEnableClickEvents = bWardrobeOpen;
        PC->bEnableMouseOverEvents = bWardrobeOpen;
        if (bWardrobeOpen)
        {
            PreWardrobeView = PC->GetControlRotation();
            PC->SetControlRotation(FRotator(-7.f, GetActorRotation().Yaw + 155.f, 0));
            FInputModeGameAndUI Mode;
            Mode.SetHideCursorDuringCapture(false);
            PC->SetInputMode(Mode);
        }
        else
        {
            PC->SetControlRotation(PreWardrobeView);
            PC->SetInputMode(FInputModeGameOnly());
        }
    }
    SyncModeVisuals();
}

void AFlowFestCharacter::Notify(const FString& Message)
{
    SaveNotice = Message;
    SaveNoticeUntil = GetWorld()->GetTimeSeconds() + 4.f;
}

FString AFlowFestCharacter::GetNotice() const
{
    return GetWorld() && GetWorld()->GetTimeSeconds() < SaveNoticeUntil ? SaveNotice : FString();
}

void AFlowFestCharacter::SaveProgress()
{
    UFlowFestSaveGame* Save = Cast<UFlowFestSaveGame>(UGameplayStatics::CreateSaveGameObject(UFlowFestSaveGame::StaticClass()));
    if (!Save) return;
    Save->Phase = Phase; Save->Camp = Camp; Save->Jam = Jam;
    Save->LoadoutChoice = LoadoutChoice; Save->DepartureChoice = DepartureChoice;
    Save->Energy = Energy; Save->Position = GetActorLocation(); Save->Rotation = GetActorRotation();
    Save->Hour = FestivalWorld ? FestivalWorld->GetTimeOfDay() : 15.f;
    Save->bInVehicle = bInVehicle; Save->bCampBuilt = bCampBuilt;
    Save->CharacterId = CharacterId; Save->PropId = EquippedPropId; Save->bOnEUC = bOnEUC;
    if (!UGameplayStatics::SaveGameToSlot(Save, SaveSlot(), 0)) Notify(TEXT("Save failed"));
}

bool AFlowFestCharacter::ValidateSave(const UFlowFestSaveGame* S) const
{
    if (!S || (S->Version != 1 && S->Version != UFlowFestSaveGame::CurrentVersion) || static_cast<uint8>(S->Phase) > static_cast<uint8>(EFlowFestPhase::Morning)
        || static_cast<uint8>(S->Camp) > static_cast<uint8>(EFlowFestCamp::CarCamp)
        || static_cast<uint8>(S->Jam) > static_cast<uint8>(EFlowFestJam::Completed)
        || !FMath::IsFinite(S->Energy) || S->Energy < 0.f || S->Energy > 100.f
        || !FMath::IsFinite(S->Hour) || S->Hour < 0.f || S->Hour >= 24.f
        || S->LoadoutChoice < 0 || S->LoadoutChoice > 2 || S->DepartureChoice < 0 || S->DepartureChoice > 2
        || S->Position.ContainsNaN() || S->Rotation.ContainsNaN() || S->Position.GetAbsMax() > 1000000.f) return false;
    if (!CharacterChoices.ContainsByPredicate([S](const FFlowFestChoice& Choice) { return Choice.Id == S->CharacterId; })
        || !PropChoices.ContainsByPredicate([S](const FFlowFestChoice& Choice) { return Choice.Id == S->PropId; })) return false;
    const bool bNeedsCamp = S->Phase >= EFlowFestPhase::CampArrival;
    if ((S->Camp != EFlowFestCamp::None) != bNeedsCamp || (S->Phase == EFlowFestPhase::WalkHome && S->Camp == EFlowFestCamp::CarCamp)) return false;
    if ((S->Phase < EFlowFestPhase::WalkToFestival) != !S->bCampBuilt) return false;
    if (S->Phase < EFlowFestPhase::NightFreeRoam && S->Jam != EFlowFestJam::NotStarted) return false;
    if (S->Phase >= EFlowFestPhase::NightReturn && S->Jam != EFlowFestJam::Completed) return false;
    if (S->bInVehicle != (S->Phase == EFlowFestPhase::DriveIn || S->Phase == EFlowFestPhase::CampArrival || S->Phase == EFlowFestPhase::VehicleSettle)) return false;
    return true;
}

void AFlowFestCharacter::LoadProgress()
{
    if (bWardrobeOpen) ToggleWardrobe();
    UFlowFestSaveGame* Save = Cast<UFlowFestSaveGame>(UGameplayStatics::LoadGameFromSlot(SaveSlot(), 0));
    if (!ValidateSave(Save)) { Notify(TEXT("No valid native save; journey unchanged")); return; }
    StopFlow();
    Phase = Save->Phase; Camp = Save->Camp; Jam = Save->Jam;
    bReviewMode = false; bFirstPerson = false;
    LoadoutChoice = Save->LoadoutChoice; DepartureChoice = Save->DepartureChoice;
    Energy = Save->Energy; bInVehicle = Save->bInVehicle; bCampBuilt = Save->bCampBuilt;
    bOnEUC = Save->bOnEUC && !bInVehicle; bPhotoFly = false; bStaffSpinning = false;
    CharacterId = Save->CharacterId; EquippedPropId = Save->PropId;
    Avatar->SetCharacter(CharacterId); Props->Equip(EquippedPropId);
    Props->BindHands(Avatar->GetBodyMesh());
    JamSpinSeconds = 0.f;
    GetCharacterMovement()->SetMovementMode(MOVE_Walking);
    SetActorLocationAndRotation(Save->Position, Save->Rotation, false);
    if (FestivalWorld) FestivalWorld->SetTimeOfDay(Save->Hour);
    bInitialPlacementDone = true;
    SyncModeVisuals();
    Notify(TEXT("Native journey loaded"));
}

void AFlowFestCharacter::Restart()
{
    StopFlow();
    if (bWardrobeOpen) ToggleWardrobe();
    bReviewMode = false;
    bFirstPerson = false;
    Phase = EFlowFestPhase::Loadout; Camp = EFlowFestCamp::None; Jam = EFlowFestJam::NotStarted;
    Energy = 100.f; LoadoutChoice = 0; DepartureChoice = 0;
    bInVehicle = false; bOnEUC = false; bPhotoFly = false; bCampBuilt = false; bStaffSpinning = false;
    JamSpinSeconds = 0.f;
    GetCharacterMovement()->SetMovementMode(MOVE_Walking);
    if (FestivalWorld) SetActorLocation(FestivalWorld->GetLandmark(TEXT("start")) + FVector(0, 0, 110), false);
    ApplyPhaseTime(); SyncModeVisuals(); SaveProgress(); Notify(TEXT("New Thursday started"));
}

bool AFlowFestCharacter::RunSmokeDrive()
{
    auto CheckDrive = [this](bool Condition, const TCHAR* Label)
    {
        if (!Condition)
        {
            bSmokeDrivePassed = false;
            UE_LOG(LogTemp, Error, TEXT("FlowFestSmoke FAIL: %s"), Label);
        }
    };
    const float StageSeconds = StartupSeconds - SmokeStageStartSeconds;
    if (SmokeDriveStage == 0)
    {
        Restart();
        SelectOne();
        Interact();
        const FVector ToGate = FestivalWorld->GetLandmark(TEXT("gate")) - GetActorLocation();
        SetActorRotation(FRotator(0.f, ToGate.Rotation().Yaw, 0.f));
        if (AController* DrivingController = GetController())
        {
            FRotator ViewRotation = DrivingController->GetControlRotation();
            ViewRotation.Yaw = GetActorRotation().Yaw;
            DrivingController->SetControlRotation(ViewRotation);
        }
        CheckDrive(bInVehicle && !GetCharacterMovement()->bOrientRotationToMovement, TEXT("vehicle does not auto-face reverse input"));
        SmokeDriveStage = 1;
        SmokeStageStartSeconds = StartupSeconds;
        return false;
    }
    if (SmokeDriveStage == 1)
    {
        if (!GetCharacterMovement()->IsMovingOnGround())
        {
            if (StageSeconds <= 3.f) return false;
            CheckDrive(false, TEXT("vehicle settles on road before drive test"));
            return true;
        }
        GetCharacterMovement()->StopMovementImmediately();
        bForward = true;
        SmokeStageStartLocation = GetActorLocation();
        SmokeStageStartYaw = GetActorRotation().Yaw;
        SmokeStageStartSeconds = StartupSeconds;
        SmokeDriveStage = 2;
        return false;
    }
    if (SmokeDriveStage == 2 && StageSeconds >= .45f)
    {
        const FVector Heading = FRotator(0.f, SmokeStageStartYaw, 0.f).Vector();
        CheckDrive(FVector::DotProduct(GetActorLocation() - SmokeStageStartLocation, Heading) > 40.f
            && GetCharacterMovement()->IsMovingOnGround(), TEXT("grounded forward drive"));
        bRight = true;
        SmokeStageStartLocation = GetActorLocation();
        SmokeStageStartYaw = GetActorRotation().Yaw;
        SmokeStageStartSeconds = StartupSeconds;
        SmokeDriveStage = 3;
        return false;
    }
    if (SmokeDriveStage == 3 && StageSeconds >= .35f)
    {
        const FVector Heading = FRotator(0.f, SmokeStageStartYaw, 0.f).Vector();
        CheckDrive(FMath::FindDeltaAngleDegrees(SmokeStageStartYaw, GetActorRotation().Yaw) > 10.f
            && FVector::DotProduct(GetActorLocation() - SmokeStageStartLocation, Heading) > 30.f,
            TEXT("forward drive steers without strafing"));
        GetCharacterMovement()->StopMovementImmediately();
        bForward = false;
        bBack = true;
        SmokeStageStartLocation = GetActorLocation();
        SmokeStageStartYaw = GetActorRotation().Yaw;
        SmokeStageStartSeconds = StartupSeconds;
        SmokeDriveStage = 4;
        return false;
    }
    if (SmokeDriveStage == 4 && StageSeconds >= .45f)
    {
        const FVector Heading = FRotator(0.f, SmokeStageStartYaw, 0.f).Vector();
        CheckDrive(FMath::FindDeltaAngleDegrees(SmokeStageStartYaw, GetActorRotation().Yaw) < -10.f
            && FVector::DotProduct(GetActorLocation() - SmokeStageStartLocation, Heading) < -30.f
            && GetCharacterMovement()->IsMovingOnGround(), TEXT("grounded reverse drive and reverse steering"));
        bBack = false;
        bRight = false;
        GetCharacterMovement()->StopMovementImmediately();
        SmokeDriveStage = 5;
        return true;
    }
    return false;
}

void AFlowFestCharacter::RunSmoke()
{
    if (!FestivalWorld || bReviewMode) return;
    bool bPassed = bSmokeDrivePassed;
    auto Expect = [&bPassed](bool Condition, const TCHAR* Label)
    {
        if (!Condition) { bPassed = false; UE_LOG(LogTemp, Error, TEXT("FlowFestSmoke FAIL: %s"), Label); }
    };
    auto MoveTo = [this](const TCHAR* Id)
    {
        SetActorLocation(FestivalWorld->GetLandmark(Id) + FVector(0, 0, 110), false);
    };
    Expect(CharacterChoices.Num() == 16 && PropChoices.Num() == 65, TEXT("complete deployed character and prop catalogs"));
    const FName PreviousCharacter = CharacterId, PreviousProp = EquippedPropId;
    auto CheckPose = [this, &Expect](const FString& Label)
    {
        USkeletalMeshComponent* Body = Avatar->GetBodyMesh();
        Body->TickAnimation(0.f, false);
        Body->RefreshBoneTransforms();
        const FVector Origin = AvatarRoot->GetComponentLocation();
        const FVector Hips = Body->GetSocketLocation(TEXT("Hips")) - Origin;
        const FVector Head = Body->GetSocketLocation(TEXT("Head")) - Origin;
        const FVector Foot = Body->GetSocketLocation(TEXT("LeftFoot")) - Origin;
        Expect(!Hips.ContainsNaN() && Hips.Size() < 240.f && Head.Z > 50.f && Head.Z < 260.f
            && Foot.Z > -50.f && Foot.Z < 200.f, *FString::Printf(TEXT("plausible imported pose %s"), *Label));
        UE_LOG(LogTemp, Display, TEXT("FlowFestPose %s hips=%s head=%s foot=%s"), *Label, *Hips.ToString(), *Head.ToString(), *Foot.ToString());
    };
    for (const FFlowFestChoice& Choice : CharacterChoices)
    {
        Expect(Avatar->SetCharacter(Choice.Id), *FString::Printf(TEXT("load character %s and locomotion"), *Choice.Id.ToString()));
        CheckPose(Choice.Id.ToString() + TEXT("/Idle"));
        Expect(Props->BindHands(Avatar->GetBodyMesh()), *FString::Printf(TEXT("palm attachment for %s"), *Choice.Id.ToString()));
        FString Key = Choice.Id.ToString().Replace(TEXT("-"), TEXT("_"));
        Expect(LoadObject<UObject>(nullptr, *FString::Printf(TEXT("/Game/FlowFest/Characters/%s/A_Ride.A_Ride"), *Key)) != nullptr,
            *FString::Printf(TEXT("pedal-contact ride for %s"), *Choice.Id.ToString()));
        for (const TCHAR* Profile : {TEXT("FirePoi"), TEXT("FireHoop"), TEXT("Juggler"), TEXT("LedFlow")})
        {
            Expect(Avatar->PlayPerformance(FName(Profile)), *FString::Printf(TEXT("production performance %s/%s"), *Choice.Id.ToString(), Profile));
            if (UAnimSingleNodeInstance* Instance = Avatar->GetBodyMesh()->GetSingleNodeInstance())
            {
                Expect(FMath::IsNearlyEqual(Instance->GetLength(), 16.f, .001f), TEXT("performance has exact 16-second loop duration"));
                Instance->SetPosition(.5f, false);
            }
            CheckPose(Choice.Id.ToString() + TEXT("/") + Profile);
            Expect(Props->LoadPerformance(Choice.Id, FName(Profile)), *FString::Printf(TEXT("prop motion %s/%s"), *Choice.Id.ToString(), Profile));
            Props->SetPerformanceTime(.5f);
            Props->ClearPerformanceTransforms();
            Avatar->StopPerformance();
        }
    }
    for (const FFlowFestChoice& Choice : PropChoices)
    {
        Expect(Props->Equip(Choice.Id) && Props->IsReady(), *FString::Printf(TEXT("load both hands for %s"), *Choice.Id.ToString()));
        Props->SetFinish(TEXT("fire")); Props->SetVisible(false); Props->SetVisible(true);
        Props->SetFinish(TEXT("led")); Props->SetFinish(TEXT("none"));
    }
    Avatar->SetCharacter(PreviousCharacter); Props->Equip(PreviousProp); Props->BindHands(Avatar->GetBodyMesh());
    Expect(EUCMesh->GetStaticMesh() && EUCWheel->GetStaticMesh(), TEXT("authored unicycle body and rotating wheel"));
    ChooseCharacter(TEXT("ch44")); ChooseProp(TEXT("fan:day_white_covered"));
    SaveProgress();
    Avatar->SetCharacter(PreviousCharacter); CharacterId = PreviousCharacter;
    Props->Equip(PreviousProp); EquippedPropId = PreviousProp;
    LoadProgress();
    Expect(CharacterId == TEXT("ch44") && EquippedPropId == TEXT("fan:day_white_covered"), TEXT("selected character and prop variant persistence"));
    ChooseCharacter(PreviousCharacter); ChooseProp(PreviousProp);
    const TCHAR* CampIds[] = {TEXT("camp-lower"), TEXT("camp-upper"), TEXT("camp-car")};
    const EFlowFestCamp Camps[] = {EFlowFestCamp::LowerTent, EFlowFestCamp::UpperTent, EFlowFestCamp::CarCamp};
    for (int32 CampIndex = 0; CampIndex < UE_ARRAY_COUNT(CampIds); ++CampIndex)
    {
        Restart();
        if (CampIndex == 0) SelectThree();
        SelectOne(); Interact();
        Expect(Phase == EFlowFestPhase::DriveIn && bInVehicle && DepartureChoice == 0 && Energy == 100.f
            && FMath::IsNearlyEqual(FestivalWorld->GetTimeOfDay(), 16.f), TEXT("departure and reselected early loadout"));
        MoveTo(TEXT("gate")); Interact();
        Expect(Phase == EFlowFestPhase::GateCheckIn, TEXT("gate arrival"));
        Interact(); Expect(Phase == EFlowFestPhase::ChooseCamp, TEXT("check-in"));
        if (CampIndex == 0) SelectOne();
        else if (CampIndex == 1) SelectTwo();
        else SelectThree();
        Expect(Phase == EFlowFestPhase::CampArrival && Camp == Camps[CampIndex] && bInVehicle, TEXT("camp choice"));

        // An intermediate vehicle save must restore the camp, mode, and objective.
        SaveProgress();
        Phase = EFlowFestPhase::Loadout; Camp = EFlowFestCamp::None; bInVehicle = false;
        LoadProgress();
        Expect(Phase == EFlowFestPhase::CampArrival && Camp == Camps[CampIndex] && bInVehicle, TEXT("vehicle save/load"));

        MoveTo(CampIds[CampIndex]); Interact();
        Expect(Phase == EFlowFestPhase::VehicleSettle, TEXT("camp arrival"));
        if (Camps[CampIndex] == EFlowFestCamp::CarCamp)
        {
            Interact();
            Expect(Phase == EFlowFestPhase::MakeCamp && !bInVehicle, TEXT("car camp settles without parking walk"));
        }
        else
        {
            MoveTo(TEXT("parking")); Interact();
            Expect(Phase == EFlowFestPhase::WalkHome && !bInVehicle, TEXT("tent camp parking"));
            MoveTo(CampIds[CampIndex]); Interact();
            Expect(Phase == EFlowFestPhase::MakeCamp, TEXT("tent camp walk home"));
        }
        Interact(); Expect(Phase == EFlowFestPhase::WalkToFestival && bCampBuilt, TEXT("make camp"));
        MoveTo(TEXT("workshop")); Interact();
        Expect(Phase == EFlowFestPhase::FestivalNight, TEXT("workshop"));
        MoveTo(TEXT("fire")); Interact();
        Expect(Phase == EFlowFestPhase::NightFreeRoam, TEXT("fire circle"));
        Interact(); Expect(Jam == EFlowFestJam::Active, TEXT("join jam"));
        Interact(); Expect(Jam == EFlowFestJam::Active, TEXT("jam cannot skip spin"));
        ToggleStaff();
        Expect(bStaffSpinning, TEXT("player starts synchronized production flow"));
        StopFlow();
        JamSpinSeconds = 2.1f; Interact();
        Expect(Jam == EFlowFestJam::Completed, TEXT("complete jam"));
        if (CampIndex == 0)
        {
            ToggleEUC();
            Expect(bOnEUC, TEXT("wheel mounts after jam"));
        }
        Interact(); Expect(Phase == EFlowFestPhase::NightReturn, TEXT("head home"));
        if (CampIndex == 0)
        {
            ToggleEUC();
            Expect(!bOnEUC, TEXT("wheel can be parked during night return"));
            ToggleEUC();
            Expect(!bOnEUC, TEXT("wheel cannot be remounted during night return"));
        }
        MoveTo(CampIds[CampIndex]); Interact();
        Expect(Phase == EFlowFestPhase::Morning, TEXT("Friday morning"));

        UFlowFestSaveGame* Saved = Cast<UFlowFestSaveGame>(UGameplayStatics::LoadGameFromSlot(SaveSlot(), 0));
        Expect(ValidateSave(Saved) && Saved->Phase == EFlowFestPhase::Morning && Saved->Camp == Camps[CampIndex], TEXT("saved morning snapshot"));
        Phase = EFlowFestPhase::Loadout;
        LoadProgress();
        Expect(Phase == EFlowFestPhase::Morning && Camp == Camps[CampIndex] && Jam == EFlowFestJam::Completed && bCampBuilt, TEXT("load restored morning"));
    }
    UFlowFestSaveGame* Invalid = NewObject<UFlowFestSaveGame>(this);
    Invalid->Phase = EFlowFestPhase::Morning;
    Invalid->Camp = EFlowFestCamp::None;
    Expect(!ValidateSave(Invalid), TEXT("reject impossible snapshot"));
    if (bPassed)
    {
        UE_LOG(LogTemp, Display, TEXT("FlowFestSmoke PASS: all three native camp journeys and isolated save/load"));
    }
    else
    {
        UE_LOG(LogTemp, Error, TEXT("FlowFestSmoke FAIL: native camp journeys and isolated save/load"));
    }
    bSmokePassed = bPassed;
}

FString AFlowFestCharacter::GetModeLabel() const
{
    return bReviewMode ? TEXT("SITE REVIEW") : bPhotoFly ? TEXT("PHOTO FLIGHT") : bInVehicle ? TEXT("DRIVING") : bOnEUC ? TEXT("EUC") : bFirstPerson ? TEXT("FIRST PERSON") : TEXT("ON FOOT");
}

FString AFlowFestCharacter::GetObjectiveTitle() const
{
    if (bReviewMode) return FString::Printf(TEXT("Native site review  /  %s"), *ReviewSite.ToUpper());
    switch (Phase)
    {
    case EFlowFestPhase::Loadout: return TEXT("Pack for Flow Fest");
    case EFlowFestPhase::DriveIn: return TEXT("Drive the forest road to the gate");
    case EFlowFestPhase::GateCheckIn: return TEXT("Check in with the gate crew");
    case EFlowFestPhase::ChooseCamp: return TEXT("Choose a place to call home");
    case EFlowFestPhase::CampArrival: return TEXT("Drive to your chosen campsite");
    case EFlowFestPhase::VehicleSettle: return Camp == EFlowFestCamp::CarCamp ? TEXT("Settle your car at camp") : TEXT("Unload and stage the car at west parking");
    case EFlowFestPhase::WalkHome: return TEXT("Walk back to your campsite");
    case EFlowFestPhase::MakeCamp: return TEXT("Make camp");
    case EFlowFestPhase::WalkToFestival: return TEXT("Find the workshop field");
    case EFlowFestPhase::FestivalNight: return TEXT("Follow the lights to the fire circle");
    case EFlowFestPhase::NightFreeRoam: return Jam == EFlowFestJam::NotStarted ? TEXT("Join the fire jam") : Jam == EFlowFestJam::Active ? TEXT("Take your turn in the circle") : TEXT("Head back through the night");
    case EFlowFestPhase::NightReturn: return TEXT("Return to camp and sleep");
    case EFlowFestPhase::Morning: return TEXT("Friday morning at Flow Fest");
    }
    return TEXT("Flow Fest");
}

FString AFlowFestCharacter::GetObjectiveDetail() const
{
    if (bReviewMode) return TEXT("Measured festival site. F10 begins the playable Thursday journey.");
    switch (Phase)
    {
    case EFlowFestPhase::Loadout: return TEXT("1 Staff + tent   2 LED staff + later start   3 Wheel + car camp. Press E to depart.");
    case EFlowFestPhase::ChooseCamp: return TEXT("1 Lower tent   2 Upper tent   3 Car camp");
    case EFlowFestPhase::NightFreeRoam: return Jam == EFlowFestJam::Active ? TEXT("Flow [Q], then press E to finish the jam.") : TEXT("Enter the circle on foot and press E.");
    case EFlowFestPhase::Morning: return TEXT("The first night is complete. Explore Friday or press F10 for a new Thursday.");
    default: return TEXT("Follow the marker. Press E when you reach the objective.");
    }
}

FString AFlowFestCharacter::GetInteractHint() const
{
    if (bReviewMode) return TEXT("F10  BEGIN JOURNEY");
    if (Phase == EFlowFestPhase::ChooseCamp) return TEXT("1 / 2 / 3  CHOOSE CAMP");
    if (Phase == EFlowFestPhase::Morning) return TEXT("F10  NEW JOURNEY");
    if (Phase == EFlowFestPhase::Loadout) return TEXT("E  DEPART");
    const float Meters = GetObjectiveDistanceMeters();
    if (Meters > (Phase == EFlowFestPhase::VehicleSettle ? 34.f : 26.f)) return FString::Printf(TEXT("%.0f m TO OBJECTIVE"), Meters);
    return TEXT("E  INTERACT");
}
