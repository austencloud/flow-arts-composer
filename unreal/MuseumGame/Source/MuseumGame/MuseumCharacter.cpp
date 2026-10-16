#include "MuseumCharacter.h"
#include "MuseumWorld.h"
#include "MuseumPerformerStation.h"
#include "FlowArtsPerformancePanel.h"
#include "MuseumSaveGame.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/InputComponent.h"
#include "EngineUtils.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "HAL/PlatformTime.h"
#include "InputCoreTypes.h"

namespace
{
const FString SaveSlot = TEXT("MuseumGameNative1");
constexpr float WalkSpeedCmPerSecond = 450.f;
constexpr float SprintSpeedCmPerSecond = 750.f;
constexpr float BaselineSpeedCmPerSecond = 290.f;
const FVector SmokeLaneStart(24.f * 50.f, 305.f * 50.f, 180.f);
}

AMuseumCharacter::AMuseumCharacter()
{
    PrimaryActorTick.bCanEverTick = true;
    // Match MuseumPhysicsProvider's 0.15m visitor collision disc.
    GetCapsuleComponent()->InitCapsuleSize(15.f, 90.f);
    GetCharacterMovement()->MaxWalkSpeed = WalkSpeedCmPerSecond;
    GetCharacterMovement()->JumpZVelocity = 380.f;
    GetCharacterMovement()->AirControl = .25f;
    Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("MuseumCamera"));
    Camera->SetupAttachment(GetCapsuleComponent());
    Camera->SetRelativeLocation(FVector(0, 0, 72));
    Camera->bUsePawnControlRotation = true;
    // Authored caves use MuseumPostProcessing's fixed 1.1 exposure. Tick enables
    // these overrides there; older native galleries retain their auto exposure.
    Camera->PostProcessSettings.AutoExposureMethod = AEM_Manual;
    Camera->PostProcessSettings.AutoExposureApplyPhysicalCameraExposure = false;
    Camera->PostProcessSettings.AutoExposureBias = FMath::Log2(1.1f);
    bUseControllerRotationYaw = true;
}

void AMuseumCharacter::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if (!Museum)
        for (TActorIterator<AMuseumWorld> It(GetWorld()); It; ++It) { Museum = *It; break; }
    if (!bReviewStartApplied && Museum && Museum->IsLoaded())
    {
        bReviewStartApplied = true;
        bMovementSmoke = FParse::Param(FCommandLine::Get(), TEXT("MuseumMovementSmoke"));
        bProgressionSmoke = FParse::Param(FCommandLine::Get(), TEXT("MuseumProgressionSmoke"));
        bMovementBaseline = bMovementSmoke && FParse::Param(FCommandLine::Get(), TEXT("MuseumMovementBaseline"));
        if (bMovementSmoke)
        {
            const float InitialYawError = Controller
                ? FMath::Abs(FMath::FindDeltaAngleDegrees(GetControlRotation().Yaw, Museum->GetSpawnRotation().Yaw))
                : 360.f;
            if (InitialYawError > 1.f)
            {
                UE_LOG(LogTemp, Error, TEXT("MUSEUM_MOVEMENT_SMOKE FAIL: initial spawn yaw error=%.1fdeg"), InitialYawError);
            }
            else
            {
                MovementSmokeStage = 0;
                MovementSmokeTotalWallStart = FPlatformTime::Seconds();
                SetActorLocation(SmokeLaneStart, false, nullptr, ETeleportType::TeleportPhysics);
                Controller->SetControlRotation(FRotator(0.f, -90.f, 0.f));
                UpdateWalkSpeed();
            }
        }
        int32 TileX = 0, TileY = 0, Yaw = 0;
        if (!bMovementSmoke && FParse::Value(FCommandLine::Get(), TEXT("MuseumStartX="), TileX)
            && FParse::Value(FCommandLine::Get(), TEXT("MuseumStartY="), TileY)
            && FParse::Value(FCommandLine::Get(), TEXT("MuseumStartYaw="), Yaw))
        {
            float StartZ = 250.f;
            float StartPitch = 0.f;
            FParse::Value(FCommandLine::Get(), TEXT("MuseumStartZ="), StartZ);
            FParse::Value(FCommandLine::Get(), TEXT("MuseumStartPitch="), StartPitch);
            SetActorLocation(FVector(TileX * 50.f, TileY * 50.f, StartZ), false, nullptr, ETeleportType::TeleportPhysics);
            if (Controller) Controller->SetControlRotation(FRotator(StartPitch, Yaw, 0));
            if (FParse::Param(FCommandLine::Get(), TEXT("MuseumShot"))) ReviewScreenshotDelay = 2.f;
            UE_LOG(LogTemp, Display, TEXT("MuseumGame review start: tile %d,%d z %.0f yaw %d pitch %.0f"), TileX, TileY, StartZ, Yaw, StartPitch);
        }
    }
    if (ReviewScreenshotDelay >= 0.f)
    {
        ReviewScreenshotDelay -= DeltaSeconds;
        if (ReviewScreenshotDelay < 0.f)
            if (APlayerController* Player = Cast<APlayerController>(Controller))
                Player->ConsoleCommand(FParse::Param(FCommandLine::Get(), TEXT("MuseumLibraryReview"))
                    ? TEXT("Shot showui") : TEXT("HighResShot 1"));
    }
    NearbyExhibit = Museum ? Museum->NearestExhibit(GetActorLocation(), 190.f) : nullptr;
    NearbyPerformer = Museum ? Museum->NearestPerformerStation(GetActorLocation(), 220.f) : nullptr;
    if (!bLibraryReviewApplied && NearbyPerformer && FParse::Param(FCommandLine::Get(), TEXT("MuseumLibraryReview")))
    {
        bLibraryReviewApplied = true;
        OpenPerformanceLibrary();
    }
    const bool bFixedCaveExposure = Museum && Museum->UsesAuthoredCaveLighting(GetActorLocation());
    Camera->PostProcessSettings.bOverride_AutoExposureMethod = bFixedCaveExposure;
    Camera->PostProcessSettings.bOverride_AutoExposureApplyPhysicalCameraExposure = bFixedCaveExposure;
    Camera->PostProcessSettings.bOverride_AutoExposureBias = bFixedCaveExposure;
    if (Museum && Museum->IsLoaded() && !bProgressionSmoke)
        Museum->UpdateFireProgress(GetActorLocation(), DeltaSeconds);
    if (NoticeTime > 0) { NoticeTime -= DeltaSeconds; if (NoticeTime <= 0) Notice.Empty(); }
    if (!bMovementSmoke)
    {
        const APlayerController* Player = Cast<APlayerController>(Controller);
        const bool bShiftHeld = Player && (Player->IsInputKeyDown(EKeys::LeftShift) || Player->IsInputKeyDown(EKeys::RightShift));
        if (bSprinting != bShiftHeld) { bSprinting = bShiftHeld; UpdateWalkSpeed(); }
    }
    if (bMovementSmoke && MovementSmokeStage >= 0) RunMovementSmoke(DeltaSeconds);
}

void AMuseumCharacter::SetupPlayerInputComponent(UInputComponent* Input)
{
    Super::SetupPlayerInputComponent(Input);
    Input->BindAxis(TEXT("MoveForward"), this, &AMuseumCharacter::MoveForward);
    Input->BindAxis(TEXT("MoveRight"), this, &AMuseumCharacter::MoveRight);
    Input->BindAxis(TEXT("Turn"), this, &APawn::AddControllerYawInput);
    Input->BindAxis(TEXT("LookUp"), this, &APawn::AddControllerPitchInput);
    Input->BindAction(TEXT("Sprint"), IE_Pressed, this, &AMuseumCharacter::SetSprint);
    Input->BindAction(TEXT("Sprint"), IE_Released, this, &AMuseumCharacter::ClearSprint);
    Input->BindAction(TEXT("Interact"), IE_Pressed, this, &AMuseumCharacter::Interact);
    Input->BindAction(TEXT("TogglePerformance"), IE_Pressed, this, &AMuseumCharacter::TogglePerformance);
    Input->BindAction(TEXT("RestartPerformance"), IE_Pressed, this, &AMuseumCharacter::RestartPerformance);
    Input->BindKey(EKeys::F6, IE_Pressed, this, &AMuseumCharacter::OpenPerformanceLibrary);
    Input->BindAction(TEXT("Jump"), IE_Pressed, this, &ACharacter::Jump);
    Input->BindAction(TEXT("Jump"), IE_Released, this, &ACharacter::StopJumping);
    Input->BindAction(TEXT("Save"), IE_Pressed, this, &AMuseumCharacter::SaveProgress);
    Input->BindAction(TEXT("Load"), IE_Pressed, this, &AMuseumCharacter::LoadProgress);
    Input->BindAction(TEXT("Reset"), IE_Pressed, this, &AMuseumCharacter::ResetToEntrance);
    Input->BindAction(TEXT("Quit"), IE_Pressed, this, &AMuseumCharacter::QuitGame);
}

void AMuseumCharacter::MoveForward(float Value)
{
    if (!FMath::IsNearlyZero(Value) && OpenExhibitId.IsEmpty())
        AddMovementInput(FRotationMatrix(FRotator(0, GetControlRotation().Yaw, 0)).GetUnitAxis(EAxis::X), Value);
}
void AMuseumCharacter::MoveRight(float Value)
{
    if (!FMath::IsNearlyZero(Value) && OpenExhibitId.IsEmpty())
        AddMovementInput(FRotationMatrix(FRotator(0, GetControlRotation().Yaw, 0)).GetUnitAxis(EAxis::Y), Value);
}

void AMuseumCharacter::SetSprint()
{
    bSprinting = true;
    UpdateWalkSpeed();
}

void AMuseumCharacter::ClearSprint()
{
    const APlayerController* Player = Cast<APlayerController>(Controller);
    bSprinting = Player && (Player->IsInputKeyDown(EKeys::LeftShift) || Player->IsInputKeyDown(EKeys::RightShift));
    UpdateWalkSpeed();
}

void AMuseumCharacter::UpdateWalkSpeed()
{
    GetCharacterMovement()->MaxWalkSpeed = bMovementBaseline ? BaselineSpeedCmPerSecond
        : bSprinting && OpenExhibitId.IsEmpty() ? SprintSpeedCmPerSecond : WalkSpeedCmPerSecond;
}

void AMuseumCharacter::RunMovementSmoke(float DeltaSeconds)
{
    UCharacterMovementComponent* Movement = GetCharacterMovement();
    const float Delta = FMath::Max(0.f, DeltaSeconds);
    MovementSmokeElapsed += Delta;
    ++MovementSmokeFrames;
    MovementSmokeTotalGameTime += Delta;
    ++MovementSmokeTotalFrames;

    auto Fail = [this](const TCHAR* Reason)
    {
        UE_LOG(LogTemp, Error, TEXT("MUSEUM_MOVEMENT_SMOKE FAIL: %s stage=%d pos=%s mode=%d"),
            Reason, MovementSmokeStage, *GetActorLocation().ToString(),
            static_cast<int32>(GetCharacterMovement()->MovementMode));
        MovementSmokeStage = -1;
    };
    auto Advance = [this](int32 NextStage)
    {
        MovementSmokeStage = NextStage;
        MovementSmokeElapsed = 0.f;
        MovementSmokeSampleTime = 0.f;
        MovementSmokeFrames = 0;
        MovementSmokeWallStart = FPlatformTime::Seconds();
        MovementSmokeStart = GetActorLocation();
    };
    auto ResetLane = [this, Movement, &Advance](int32 NextStage)
    {
        ClearSprint();
        Movement->StopMovementImmediately();
        SetActorLocation(SmokeLaneStart, false, nullptr, ETeleportType::TeleportPhysics);
        Advance(NextStage);
    };
    auto Sample = [this, Delta, &Advance, &Fail](const TCHAR* Name, float Expected, float& Result, int32 NextStage)
    {
        MovementSmokeSampleTime += Delta;
        if (MovementSmokeElapsed < 1.f) return;
        const FVector Travel = GetActorLocation() - MovementSmokeStart;
        const float DistanceCm = FVector2D(Travel.X, Travel.Y).Size();
        Result = DistanceCm / FMath::Max(MovementSmokeSampleTime, KINDA_SMALL_NUMBER);
        const double WallSeconds = FPlatformTime::Seconds() - MovementSmokeWallStart;
        UE_LOG(LogTemp, Display, TEXT("MUSEUM_MOVEMENT_SMOKE %s distance=%.1fcm game=%.3fs wall=%.3fs game/wall=%.2f fps=%.1f frames=%d speed=%.1fcm/s expected=%.0fcm/s"),
            Name, DistanceCm, MovementSmokeSampleTime, WallSeconds,
            MovementSmokeSampleTime / FMath::Max(WallSeconds, .001), MovementSmokeFrames / FMath::Max(WallSeconds, .001),
            MovementSmokeFrames, Result, Expected);
        if (Result < Expected * .92f || Result > Expected * 1.08f)
        {
            Fail(TEXT("steady travel outside grounded movement bound"));
            return;
        }
        Advance(NextStage);
    };

    if (!Movement->IsMovingOnGround())
    {
        if (MovementSmokeStage == 0 || MovementSmokeStage == 3 || MovementSmokeStage == 8 || MovementSmokeStage == 12)
        {
            if (MovementSmokeElapsed > 2.f) Fail(TEXT("entrance floor never grounded after teleport"));
            return;
        }
        Fail(TEXT("left entrance floor during movement"));
        return;
    }

    switch (MovementSmokeStage)
    {
    case 0: // Spawn must settle on the real floor before measuring.
        if (MovementSmokeElapsed >= .25f) Advance(1);
        break;
    case 1: // Accelerate before the steady walk window.
        MoveForward(1.f);
        if (MovementSmokeElapsed >= .35f) Advance(2);
        break;
    case 2:
        MoveForward(1.f);
        Sample(TEXT("walk"), bMovementBaseline ? BaselineSpeedCmPerSecond : WalkSpeedCmPerSecond,
            MovementSmokeWalkCmPerSecond, bMovementBaseline ? 12 : 3);
        if (MovementSmokeStage == 3) ResetLane(3);
        else if (MovementSmokeStage == 12)
        {
            MovementSmokeMeasuredGameTime = MovementSmokeTotalGameTime;
            MovementSmokeMeasuredWallTime = FPlatformTime::Seconds() - MovementSmokeTotalWallStart;
            MovementSmokeMeasuredFrames = MovementSmokeTotalFrames;
            ResetToEntrance();
        }
        break;
    case 3:
        if (MovementSmokeElapsed >= .25f) { SetSprint(); Advance(4); }
        break;
    case 4:
        MoveForward(1.f);
        if (MovementSmokeElapsed >= .45f) Advance(5);
        break;
    case 5:
        MoveForward(1.f);
        Sample(TEXT("sprint"), SprintSpeedCmPerSecond, MovementSmokeSprintCmPerSecond, 6);
        if (MovementSmokeStage == 6) ClearSprint();
        break;
    case 6: // Keep walking while the velocity brakes to the walk limit.
        MoveForward(1.f);
        if (MovementSmokeElapsed >= .30f) Advance(7);
        break;
    case 7:
        MoveForward(1.f);
        Sample(TEXT("return-walk"), WalkSpeedCmPerSecond, MovementSmokeReturnCmPerSecond, 8);
        if (MovementSmokeStage == 8) ResetLane(8);
        break;
    case 8:
        if (MovementSmokeElapsed >= .25f) Advance(9);
        break;
    case 9:
        MoveForward(1.f);
        MoveRight(1.f);
        if (MovementSmokeElapsed >= .35f) Advance(10);
        break;
    case 10:
        MoveForward(1.f);
        MoveRight(1.f);
        Sample(TEXT("diagonal"), WalkSpeedCmPerSecond, MovementSmokeDiagonalCmPerSecond, 11);
        break;
    case 11: // No input: real CharacterMovement braking must stop the body.
        if (MovementSmokeElapsed >= .45f)
        {
            const FVector Travel = GetActorLocation() - MovementSmokeStart;
            MovementSmokeStopDistanceCm = FVector2D(Travel.X, Travel.Y).Size();
            UE_LOG(LogTemp, Display, TEXT("MUSEUM_MOVEMENT_SMOKE stop distance=%.1fcm velocity=%.1fcm/s"),
                MovementSmokeStopDistanceCm, Movement->Velocity.Size2D());
            if (MovementSmokeStopDistanceCm > 100.f || Movement->Velocity.Size2D() > 1.f)
                Fail(TEXT("stop did not brake"));
            else
            {
                MovementSmokeMeasuredGameTime = MovementSmokeTotalGameTime;
                MovementSmokeMeasuredWallTime = FPlatformTime::Seconds() - MovementSmokeTotalWallStart;
                MovementSmokeMeasuredFrames = MovementSmokeTotalFrames;
                ResetToEntrance();
                Advance(12);
            }
        }
        break;
    case 12:
        if (MovementSmokeElapsed >= .5f)
        {
            if (APlayerController* Player = Cast<APlayerController>(Controller))
                Player->ConsoleCommand(TEXT("HighResShot 1"));
            Advance(13);
        }
        break;
    case 13:
        if (MovementSmokeElapsed >= .10f)
        {
            UE_LOG(LogTemp, Display, TEXT("MUSEUM_MOVEMENT_SMOKE PASS: baseline=%d walk=%.1f sprint=%.1f return=%.1f diagonal=%.1f stop=%.1fcm screenshot=HighResShot game=%.3fs wall=%.3fs game/wall=%.2f fps=%.1f frames=%d"),
                bMovementBaseline ? 1 : 0, MovementSmokeWalkCmPerSecond, MovementSmokeSprintCmPerSecond,
                MovementSmokeReturnCmPerSecond, MovementSmokeDiagonalCmPerSecond,
                MovementSmokeStopDistanceCm, MovementSmokeMeasuredGameTime, MovementSmokeMeasuredWallTime,
                MovementSmokeMeasuredGameTime / FMath::Max(MovementSmokeMeasuredWallTime, .001),
                MovementSmokeMeasuredFrames / FMath::Max(MovementSmokeMeasuredWallTime, .001), MovementSmokeMeasuredFrames);
            MovementSmokeStage = -1;
        }
        break;
    }
}

void AMuseumCharacter::Interact()
{
    if (!OpenExhibitId.IsEmpty()) { OpenExhibitId.Empty(); UpdateWalkSpeed(); return; }
    if (NearbyExhibit)
    {
        OpenExhibitId = NearbyExhibit->Id;
        UpdateWalkSpeed();
        ViewedExhibits.Add(OpenExhibitId);
    }
}

void AMuseumCharacter::TogglePerformance()
{
    if (!OpenExhibitId.IsEmpty() || !NearbyPerformer) return;
    if (Museum && Museum->IsFireStation(NearbyPerformer)) return;
    NearbyPerformer->TogglePlayback();
    ShowNotice(FString::Printf(TEXT("%s: %s"), *NearbyPerformer->GetDisplayLabel(), *NearbyPerformer->GetPlaybackStatus()));
}

void AMuseumCharacter::RestartPerformance()
{
    if (!OpenExhibitId.IsEmpty() || !NearbyPerformer) return;
    if (Museum && Museum->IsFireStation(NearbyPerformer)) return;
    NearbyPerformer->RestartPlayback();
    ShowNotice(FString::Printf(TEXT("%s: %s"), *NearbyPerformer->GetDisplayLabel(), *NearbyPerformer->GetPlaybackStatus()));
}

void AMuseumCharacter::OpenPerformanceLibrary()
{
    if (!OpenExhibitId.IsEmpty() || !NearbyPerformer) { ShowNotice(TEXT("Approach a performer to open the library")); return; }
    if (APlayerController* Player = Cast<APlayerController>(Controller))
        FFlowArtsPerformancePanel::Open(Player, NearbyPerformer->GetAvatar(), NearbyPerformer->GetProp());
}

const FMuseumExhibit* AMuseumCharacter::GetOpenExhibit() const
{
    if (!Museum || OpenExhibitId.IsEmpty()) return nullptr;
    const FMuseumExhibit* Exhibit = Museum->NearestExhibit(GetActorLocation(), 190.f);
    return Exhibit && Exhibit->Id == OpenExhibitId ? Exhibit : nullptr;
}

void AMuseumCharacter::ShowNotice(const FString& Message)
{
    Notice = Message;
    NoticeTime = 3.f;
}

void AMuseumCharacter::SaveProgress()
{
    UMuseumSaveGame* Save = Cast<UMuseumSaveGame>(UGameplayStatics::CreateSaveGameObject(UMuseumSaveGame::StaticClass()));
    if (!Save) { ShowNotice(TEXT("Could not create save")); return; }
    Save->PlayerLocation = GetActorLocation();
    Save->PlayerRotation = GetControlRotation();
    for (const FString& Id : ViewedExhibits) Save->ViewedExhibits.Add(Id);
    if (Museum) Save->FireProgress = Museum->GetFireProgress();
    ShowNotice(UGameplayStatics::SaveGameToSlot(Save, SaveSlot, 0) ? TEXT("Progress saved") : TEXT("Save failed"));
}

void AMuseumCharacter::LoadProgress()
{
    UMuseumSaveGame* Save = Cast<UMuseumSaveGame>(UGameplayStatics::LoadGameFromSlot(SaveSlot, 0));
    if (!Save || (Save->Version != 1 && Save->Version != 2) || Save->PlayerLocation.ContainsNaN()) { ShowNotice(TEXT("No valid native save")); return; }
    if (Museum) Museum->RestoreFireProgress(Save->Version == 2 ? Save->FireProgress : FMuseumFireProgress());
    SetActorLocation(Save->PlayerLocation, false, nullptr, ETeleportType::TeleportPhysics);
    if (Controller) Controller->SetControlRotation(Save->PlayerRotation);
    ViewedExhibits.Reset();
    for (const FString& Id : Save->ViewedExhibits) ViewedExhibits.Add(Id);
    OpenExhibitId.Empty();
    UpdateWalkSpeed();
    ShowNotice(TEXT("Progress loaded"));
}

void AMuseumCharacter::ResetToEntrance()
{
    if (!Museum || !Museum->IsLoaded()) return;
    ConsumeMovementInputVector();
    GetCharacterMovement()->ClearAccumulatedForces();
    GetCharacterMovement()->StopMovementImmediately();
    SetActorLocation(Museum->GetSpawnLocation(), false, nullptr, ETeleportType::TeleportPhysics);
    if (Controller) Controller->SetControlRotation(Museum->GetSpawnRotation());
    OpenExhibitId.Empty();
    UpdateWalkSpeed();
    ShowNotice(TEXT("Returned to entrance"));
}

void AMuseumCharacter::QuitGame()
{
    if (APlayerController* Player = Cast<APlayerController>(Controller)) Player->ConsoleCommand(TEXT("quit"));
}
