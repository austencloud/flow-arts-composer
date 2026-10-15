#include "MuseumCharacter.h"
#include "MuseumWorld.h"
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

namespace { const FString SaveSlot = TEXT("MuseumGameNative1"); }

AMuseumCharacter::AMuseumCharacter()
{
    PrimaryActorTick.bCanEverTick = true;
    GetCapsuleComponent()->InitCapsuleSize(35.f, 90.f);
    GetCharacterMovement()->MaxWalkSpeed = 290.f;
    GetCharacterMovement()->JumpZVelocity = 380.f;
    GetCharacterMovement()->AirControl = .25f;
    Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("MuseumCamera"));
    Camera->SetupAttachment(GetCapsuleComponent());
    Camera->SetRelativeLocation(FVector(0, 0, 72));
    Camera->bUsePawnControlRotation = true;
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
        int32 TileX = 0, TileY = 0, Yaw = 0;
        if (FParse::Value(FCommandLine::Get(), TEXT("MuseumStartX="), TileX)
            && FParse::Value(FCommandLine::Get(), TEXT("MuseumStartY="), TileY)
            && FParse::Value(FCommandLine::Get(), TEXT("MuseumStartYaw="), Yaw))
        {
            SetActorLocation(FVector(TileX * 50.f, TileY * 50.f, 250.f), false, nullptr, ETeleportType::TeleportPhysics);
            if (Controller) Controller->SetControlRotation(FRotator(0, Yaw, 0));
            if (FParse::Param(FCommandLine::Get(), TEXT("MuseumShot"))) ReviewScreenshotDelay = 2.f;
            UE_LOG(LogTemp, Display, TEXT("MuseumGame review start: tile %d,%d yaw %d"), TileX, TileY, Yaw);
        }
    }
    if (ReviewScreenshotDelay >= 0.f)
    {
        ReviewScreenshotDelay -= DeltaSeconds;
        if (ReviewScreenshotDelay < 0.f)
            if (APlayerController* Player = Cast<APlayerController>(Controller))
                Player->ConsoleCommand(TEXT("HighResShot 1"));
    }
    NearbyExhibit = Museum ? Museum->NearestExhibit(GetActorLocation(), 190.f) : nullptr;
    if (NoticeTime > 0) { NoticeTime -= DeltaSeconds; if (NoticeTime <= 0) Notice.Empty(); }
}

void AMuseumCharacter::SetupPlayerInputComponent(UInputComponent* Input)
{
    Super::SetupPlayerInputComponent(Input);
    Input->BindAxis(TEXT("MoveForward"), this, &AMuseumCharacter::MoveForward);
    Input->BindAxis(TEXT("MoveRight"), this, &AMuseumCharacter::MoveRight);
    Input->BindAxis(TEXT("Turn"), this, &APawn::AddControllerYawInput);
    Input->BindAxis(TEXT("LookUp"), this, &APawn::AddControllerPitchInput);
    Input->BindAction(TEXT("Interact"), IE_Pressed, this, &AMuseumCharacter::Interact);
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

void AMuseumCharacter::Interact()
{
    if (!OpenExhibitId.IsEmpty()) { OpenExhibitId.Empty(); return; }
    if (NearbyExhibit)
    {
        OpenExhibitId = NearbyExhibit->Id;
        ViewedExhibits.Add(OpenExhibitId);
    }
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
    ShowNotice(UGameplayStatics::SaveGameToSlot(Save, SaveSlot, 0) ? TEXT("Progress saved") : TEXT("Save failed"));
}

void AMuseumCharacter::LoadProgress()
{
    UMuseumSaveGame* Save = Cast<UMuseumSaveGame>(UGameplayStatics::LoadGameFromSlot(SaveSlot, 0));
    if (!Save || Save->Version != 1 || Save->PlayerLocation.ContainsNaN()) { ShowNotice(TEXT("No valid native save")); return; }
    SetActorLocation(Save->PlayerLocation, false, nullptr, ETeleportType::TeleportPhysics);
    if (Controller) Controller->SetControlRotation(Save->PlayerRotation);
    ViewedExhibits.Reset();
    for (const FString& Id : Save->ViewedExhibits) ViewedExhibits.Add(Id);
    OpenExhibitId.Empty();
    ShowNotice(TEXT("Progress loaded"));
}

void AMuseumCharacter::ResetToEntrance()
{
    if (!Museum || !Museum->IsLoaded()) return;
    SetActorLocation(Museum->GetSpawnLocation(), false, nullptr, ETeleportType::TeleportPhysics);
    OpenExhibitId.Empty();
    ShowNotice(TEXT("Returned to entrance"));
}

void AMuseumCharacter::QuitGame()
{
    if (APlayerController* Player = Cast<APlayerController>(Controller)) Player->ConsoleCommand(TEXT("quit"));
}
