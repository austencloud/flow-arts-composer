#include "FlowFestCharacter.h"
#include "FlowFestWorld.h"
#include "FlowFestAvatarComponent.h"
#include "FlowFestPropComponent.h"
#include "FlowArtsPerformancePanel.h"
#include "FlowArtsPerformanceSession.h"
#include "FlowFestAnimInstance.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/InputComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Containers/Set.h"
#include "Animation/AnimInstance.h"
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
#include "Misc/App.h"
#include "Misc/Paths.h"
#include "Misc/Parse.h"
#include "Misc/FileHelper.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "UnrealClient.h"
#include "HighResScreenshot.h"
#include "FlowFestJam.h"
#include "FlowFestJamSlice.h"

namespace
{
constexpr float InteractionRadius = 1800.f;
constexpr float ArriveRadius = 2600.f;
constexpr float VehicleRadius = 3400.f;

float OnFootSpeedCmPerSecond(float ForwardInput, float RightInput, bool bSprint)
{
    if (!bSprint) return 185.f;
    const float InputMagnitude = FVector2D(ForwardInput, RightInput).Size();
    const float BackwardFraction = InputMagnitude > SMALL_NUMBER
        ? FMath::Clamp(-ForwardInput / InputMagnitude, 0.f, 1.f) : 0.f;
    return FMath::Lerp(440.f, 280.f, BackwardFraction);
}

void WriteMotionEvidence(const FString& ImagePath, UFlowFestAvatarComponent* Avatar)
{
    if (!FParse::Param(FCommandLine::Get(), TEXT("FlowFestPoseEvidence"))) return;
    USkeletalMeshComponent* Body = Avatar->GetBodyMesh();
    if (!Body || !Body->GetAttachParent()) return;
    const FTransform Performer = Body->GetAttachParent()->GetComponentTransform();
    const auto Root = MakeShared<FJsonObject>();
    Root->SetStringField(TEXT("characterId"), Avatar->GetCharacterId().ToString());
    Root->SetNumberField(TEXT("seconds"), Avatar->GetPerformanceTime());
    const FName SelectedMotion = Avatar->GetMotionName();
    const FVector WorldVelocity = Avatar->GetOwner()->GetVelocity();
    const auto Locomotion = MakeShared<FJsonObject>();
    Locomotion->SetStringField(TEXT("selectedMotion"), SelectedMotion.ToString());
    Locomotion->SetNumberField(TEXT("worldTimeSeconds"), Avatar->GetWorld()->GetTimeSeconds());
    Locomotion->SetNumberField(TEXT("worldDeltaSeconds"), Avatar->GetWorld()->GetDeltaSeconds());
    Locomotion->SetNumberField(TEXT("appDeltaSeconds"), FApp::GetDeltaTime());
    Locomotion->SetNumberField(TEXT("speedCmPerSecond"), WorldVelocity.Size2D());
    TArray<TSharedPtr<FJsonValue>> VelocityValues;
    for (double Value : {WorldVelocity.X, WorldVelocity.Y, WorldVelocity.Z})
        VelocityValues.Add(MakeShared<FJsonValueNumber>(Value));
    Locomotion->SetArrayField(TEXT("worldVelocityCmPerSecond"), VelocityValues);
    if (const auto* Anim = Cast<UFlowFestAnimInstance>(Body->GetAnimInstance()))
    {
        Locomotion->SetNumberField(TEXT("selectedMotionTimeSeconds"), Anim->GetMotionTime(SelectedMotion));
        Locomotion->SetNumberField(TEXT("selectedMotionRate"), Anim->GetMotionRate(SelectedMotion));
        Locomotion->SetNumberField(TEXT("walkTimeSeconds"), Anim->GetMotionTime(TEXT("Walk")));
        Locomotion->SetNumberField(TEXT("walkRate"), Anim->GetMotionRate(TEXT("Walk")));
        Locomotion->SetNumberField(TEXT("runTimeSeconds"), Anim->GetMotionTime(TEXT("Run")));
        Locomotion->SetNumberField(TEXT("runRate"), Anim->GetMotionRate(TEXT("Run")));
    }
    Root->SetObjectField(TEXT("locomotion"), Locomotion);
    const auto Bones = MakeShared<FJsonObject>();
    for (int32 Index = 0; Index < Body->GetNumBones(); ++Index)
    {
        const FName Name = Body->GetBoneName(Index);
        const FTransform Xf = Body->GetSocketTransform(Name).GetRelativeTransform(Performer);
        const FVector P = Xf.GetLocation(), S = Xf.GetScale3D(); const FQuat Q = Xf.GetRotation();
        TArray<TSharedPtr<FJsonValue>> Values;
        for (double Value : {P.X, P.Y, P.Z, Q.X, Q.Y, Q.Z, Q.W, S.X, S.Y, S.Z})
            Values.Add(MakeShared<FJsonValueNumber>(Value));
        Bones->SetArrayField(Name.ToString(), Values);
    }
    Root->SetObjectField(TEXT("bones"), Bones);
    const auto Attachments = MakeShared<FJsonObject>();
    TArray<UStaticMeshComponent*> MeshComponents;
    Avatar->GetOwner()->GetComponents<UStaticMeshComponent>(MeshComponents);
    for (const UStaticMeshComponent* Component : MeshComponents)
    {
        if (!Component->GetName().StartsWith(TEXT("Meal"))) continue;
        const auto Attachment = MakeShared<FJsonObject>();
        const FVector Scale = Component->GetComponentScale();
        const FVector Extent = Component->Bounds.BoxExtent;
        const FVector Position = Performer.InverseTransformPosition(Component->GetComponentLocation());
        Attachment->SetBoolField(TEXT("visible"), Component->IsVisible());
        Attachment->SetStringField(TEXT("socket"), Component->GetAttachSocketName().ToString());
        for (const auto& Field : {TPair<FString, FVector>(TEXT("worldScale"), Scale),
            TPair<FString, FVector>(TEXT("halfExtentCm"), Extent),
            TPair<FString, FVector>(TEXT("positionCm"), Position)})
        {
            TArray<TSharedPtr<FJsonValue>> Values;
            for (double Value : {Field.Value.X, Field.Value.Y, Field.Value.Z})
                Values.Add(MakeShared<FJsonValueNumber>(Value));
            Attachment->SetArrayField(Field.Key, Values);
        }
        Attachments->SetObjectField(Component->GetName(), Attachment);
    }
    Root->SetObjectField(TEXT("attachments"), Attachments);
    if (const auto* Anim = Cast<UFlowFestAnimInstance>(Body->GetAnimInstance()))
    {
        const auto& Result = Anim->GetArmClearance();
        const auto Clearance = MakeShared<FJsonObject>();
        Clearance->SetBoolField(TEXT("preparedSeedApplied"), Anim->WasPreparedSeedApplied());
        Clearance->SetBoolField(TEXT("groundedStanceActive"), Anim->IsGroundedStanceActive());
        Clearance->SetBoolField(TEXT("measured"), Result.bMeasuredSurface);
        Clearance->SetBoolField(TEXT("feasible"), Result.bFeasible);
        Clearance->SetNumberField(TEXT("worstPenetrationCm"), Result.WorstPenetrationCm);
        Clearance->SetNumberField(TEXT("wristPositionErrorCm"), Result.WorstWristPositionErrorCm);
        Clearance->SetNumberField(TEXT("wristAngleErrorDeg"), Result.WorstWristAngleErrorDeg);
        Clearance->SetNumberField(TEXT("solveMicroseconds"), Result.SolveMicroseconds);
        Clearance->SetNumberField(TEXT("skinnedUpperTorsoClearMask"), Result.SkinnedUpperTorsoClearMask);
        Clearance->SetNumberField(TEXT("forearmBodyClearMask"), Result.ForearmBodyClearMask);
        Clearance->SetNumberField(TEXT("forearmHeadClearMask"), Result.ForearmHeadClearMask);
        Clearance->SetBoolField(TEXT("skinnedArmPairClear"), Result.bSkinnedArmPairClear);
        Clearance->SetNumberField(TEXT("skinnedQueryCount"), Result.SkinnedQueryCount);
        Clearance->SetNumberField(TEXT("handAvoidanceExactQueries"), Result.HandAvoidanceExactQueries);
        Clearance->SetBoolField(TEXT("skinnedCacheAvailable"), Result.bSkinnedCacheAvailable);
        Clearance->SetBoolField(TEXT("skinnedCallbackAvailable"), Result.bSkinnedCallbackAvailable);
        Clearance->SetNumberField(TEXT("skinnedSkipReasons"), Result.SkinnedSkipReasons);
        Clearance->SetNumberField(TEXT("warmRefinementQueries"), Result.WarmRefinementQueryCount);
        Clearance->SetNumberField(TEXT("softRefinementQueries"), Result.SoftRefinementQueryCount);
        Clearance->SetNumberField(TEXT("skinnedBestOtherObstacleCm"), Result.SkinnedBestOtherObstacleCm);
        Clearance->SetBoolField(TEXT("sharedTranslationAllowed"), Result.bSharedTranslationAllowed);
        Clearance->SetNumberField(TEXT("sharedCandidateCount"), Result.SharedCandidateCount);
        Clearance->SetNumberField(TEXT("sharedHeadPropRejectedCount"), Result.SharedHeadPropRejectedCount);
        Clearance->SetNumberField(TEXT("sharedReachRejectedCount"), Result.SharedReachRejectedCount);
        Clearance->SetNumberField(TEXT("sharedNoIKCount"), Result.SharedNoIKCount);
        Clearance->SetNumberField(TEXT("sharedRankedSeedCount"), Result.SharedRankedSeedCount);
        Clearance->SetNumberField(TEXT("sharedFullSearchCount"), Result.SharedFullSearchCount);
        Clearance->SetNumberField(TEXT("bestSharedPenetrationCm"), Result.BestSharedPenetrationCm);
        Clearance->SetNumberField(TEXT("worstObstacleKind"), Result.WorstObstacleKind);
        Clearance->SetNumberField(TEXT("worstObstacleIndex"), Result.WorstObstacleIndex);
        Clearance->SetNumberField(TEXT("worstArm"), Result.WorstArm);
        Clearance->SetNumberField(TEXT("worstSegment"), Result.WorstSegment);
        Clearance->SetNumberField(TEXT("surfacePaddingCm"), 0.3);
        const auto VectorJson = [](const FVector& Value)
        {
            TArray<TSharedPtr<FJsonValue>> Values;
            for (double Number : {Value.X, Value.Y, Value.Z}) Values.Add(MakeShared<FJsonValueNumber>(Number));
            return Values;
        };
        const auto TransformJson = [](const FTransform& Value)
        {
            const FVector P = Value.GetLocation(), S = Value.GetScale3D(); const FQuat Q = Value.GetRotation();
            TArray<TSharedPtr<FJsonValue>> Values;
            for (double Number : {P.X, P.Y, P.Z, Q.X, Q.Y, Q.Z, Q.W, S.X, S.Y, S.Z})
                Values.Add(MakeShared<FJsonValueNumber>(Number));
            return Values;
        };
        // Compare the socket and visible mesh in world space: composing exported
        // relative transforms can misreport grip drift for a mirrored prop mesh.
        if (const UFlowFestPropComponent* Prop = Avatar->GetOwner()->FindComponentByClass<UFlowFestPropComponent>())
        {
            const auto GripTiming = MakeShared<FJsonObject>();
            for (const bool bLeft : {true, false})
            {
                const FString Side = bLeft ? TEXT("left") : TEXT("right");
                const FTransform Socket = Body->GetSocketTransform(bLeft ? TEXT("LeftHand") : TEXT("RightHand"));
                const FTransform PropRoot = Prop->GetPropRootTransform(bLeft);
                GripTiming->SetArrayField(Side + TEXT("SocketWorld"), TransformJson(Socket));
                GripTiming->SetArrayField(Side + TEXT("PropRootWorld"), TransformJson(PropRoot));
                GripTiming->SetArrayField(Side + TEXT("PropRootToSocket"), TransformJson(PropRoot.GetRelativeTransform(Socket)));
                const FString MeshName = bLeft ? TEXT("FlowFestLeftPropMesh") : TEXT("FlowFestRightPropMesh");
                for (const UStaticMeshComponent* Mesh : MeshComponents)
                {
                    if (Mesh->GetName() != MeshName) continue;
                    GripTiming->SetArrayField(Side + TEXT("PropMeshWorld"), TransformJson(Mesh->GetComponentTransform()));
                    GripTiming->SetArrayField(Side + TEXT("PropMeshToRoot"), TransformJson(
                        Mesh->GetComponentTransform().GetRelativeTransform(PropRoot)));
                    break;
                }
            }
            Clearance->SetObjectField(TEXT("gripTiming"), GripTiming);
        }
        Clearance->SetArrayField(TEXT("sharedPerformanceTranslationCm"), VectorJson(Result.SharedPerformanceTranslationCm));
        Clearance->SetArrayField(TEXT("leftHandCorrectionCm"), VectorJson(Result.AppliedHandTranslationCm[0]));
        Clearance->SetArrayField(TEXT("rightHandCorrectionCm"), VectorJson(Result.AppliedHandTranslationCm[1]));
        Clearance->SetArrayField(TEXT("leftHandCorrectionWorldCm"), VectorJson(Body->GetComponentTransform().TransformVector(Result.AppliedHandTranslationCm[0])));
        Clearance->SetArrayField(TEXT("rightHandCorrectionWorldCm"), VectorJson(Body->GetComponentTransform().TransformVector(Result.AppliedHandTranslationCm[1])));
        Clearance->SetNumberField(TEXT("perHandCorrectionLimitCm"), Result.HandCorrectionLimitCm);
        TArray<TSharedPtr<FJsonValue>> ClavicleAngles, UpperTwistAngles;
        for (int32 Side = 0; Side < 2; ++Side)
        {
            ClavicleAngles.Add(MakeShared<FJsonValueNumber>(Result.ClavicleProtractionDeg[Side]));
            UpperTwistAngles.Add(MakeShared<FJsonValueNumber>(Result.UpperAxialTwistDeg[Side]));
        }
        Clearance->SetArrayField(TEXT("clavicleProtractionDeg"), ClavicleAngles);
        Clearance->SetArrayField(TEXT("upperAxialTwistDeg"), UpperTwistAngles);
        Clearance->SetArrayField(TEXT("meshToPerformer"), TransformJson(Body->GetComponentTransform().GetRelativeTransform(Performer)));
        TArray<TSharedPtr<FJsonValue>> ArmValues;
        for (const auto& Arm : Result.Arms)
        {
            const auto Value = MakeShared<FJsonObject>();
            Value->SetBoolField(TEXT("hasClavicle"), Arm.bHasClavicle);
            Value->SetArrayField(TEXT("clavicle"), TransformJson(Arm.Clavicle));
            Value->SetArrayField(TEXT("upper"), TransformJson(Arm.Upper));
            Value->SetArrayField(TEXT("elbow"), TransformJson(Arm.Elbow));
            Value->SetArrayField(TEXT("wrist"), TransformJson(Arm.Wrist));
            Value->SetNumberField(TEXT("upperRadiusCm"), Arm.UpperRadiusCm);
            Value->SetNumberField(TEXT("forearmRadiusCm"), Arm.ForearmRadiusCm);
            TArray<TSharedPtr<FJsonValue>> Points;
            for (const FVector& Point : Arm.UpperTorsoPoints)
                Points.Add(MakeShared<FJsonValueArray>(VectorJson(Point)));
            Value->SetArrayField(TEXT("upperTorsoPoints"), Points);
            ArmValues.Add(MakeShared<FJsonValueObject>(Value));
        }
        Clearance->SetArrayField(TEXT("arms"), ArmValues);
        TArray<TSharedPtr<FJsonValue>> HullValues;
        for (const auto& Hull : Result.TorsoHulls)
        {
            TArray<TSharedPtr<FJsonValue>> Planes;
            for (const auto& Plane : Hull.Planes)
            {
                auto Values = VectorJson(Plane.Normal);
                Values.Add(MakeShared<FJsonValueNumber>(Plane.OffsetCm));
                Planes.Add(MakeShared<FJsonValueArray>(Values));
            }
            HullValues.Add(MakeShared<FJsonValueArray>(Planes));
        }
        Clearance->SetArrayField(TEXT("torsoHulls"), HullValues);
        TArray<TSharedPtr<FJsonValue>> CapsuleValues;
        for (const auto& Capsule : Result.BodyCapsules)
        {
            const auto Value = MakeShared<FJsonObject>();
            Value->SetArrayField(TEXT("start"), VectorJson(Capsule.Start));
            Value->SetArrayField(TEXT("end"), VectorJson(Capsule.End));
            Value->SetNumberField(TEXT("radiusCm"), Capsule.RadiusCm);
            CapsuleValues.Add(MakeShared<FJsonValueObject>(Value));
        }
        Clearance->SetArrayField(TEXT("bodyCapsules"), CapsuleValues);
        TArray<TSharedPtr<FJsonValue>> PropSides;
        for (const auto& Side : Result.OriginalHeldPropCapsules)
        {
            TArray<TSharedPtr<FJsonValue>> PropCapsules;
            for (const auto& Capsule : Side)
            {
                const auto Value = MakeShared<FJsonObject>();
                Value->SetArrayField(TEXT("start"), VectorJson(Capsule.Start));
                Value->SetArrayField(TEXT("end"), VectorJson(Capsule.End));
                Value->SetNumberField(TEXT("radiusCm"), Capsule.RadiusCm);
                PropCapsules.Add(MakeShared<FJsonValueObject>(Value));
            }
            PropSides.Add(MakeShared<FJsonValueArray>(PropCapsules));
        }
        Clearance->SetArrayField(TEXT("originalHeldPropCapsules"), PropSides);
        const auto PropTransforms = MakeShared<FJsonObject>();
        for (const UStaticMeshComponent* Component : MeshComponents)
            if (!Component->GetName().StartsWith(TEXT("Meal")) && Component->GetStaticMesh())
                PropTransforms->SetArrayField(Component->GetName(), TransformJson(
                    Component->GetComponentTransform().GetRelativeTransform(Body->GetComponentTransform())));
        Clearance->SetObjectField(TEXT("staticMeshTransforms"), PropTransforms);
        Root->SetObjectField(TEXT("clearance"), Clearance);
    }
    FString Json;
    FJsonSerializer::Serialize(Root, TJsonWriterFactory<>::Create(&Json));
    FFileHelper::SaveStringToFile(Json, *(FPaths::ChangeExtension(ImagePath, TEXT("pose.json"))));
}
}

AFlowFestCharacter::AFlowFestCharacter()
{
    PrimaryActorTick.bCanEverTick = true;
    GetCapsuleComponent()->InitCapsuleSize(42.f, 92.f);
    GetCharacterMovement()->MaxWalkSpeed = 185.f;
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
    FParse::Value(FCommandLine::Get(), TEXT("FlowFestMotion="), RuntimeMotionPath);
    FParse::Value(FCommandLine::Get(), TEXT("FlowFestActivity="), ActivityEvidence);
    FParse::Value(FCommandLine::Get(), TEXT("FlowFestActivityTime="), ActivityEvidenceTime);
    FParse::Value(FCommandLine::Get(), TEXT("FlowFestActivityExit="), ActivityEvidenceExit);
    bActivityEvidencePlayback = FParse::Param(FCommandLine::Get(), TEXT("FlowFestActivityPlayback"));
    FParse::Value(FCommandLine::Get(), TEXT("FlowFestFlowStopAt="), ShowcaseStopAt);
    ReviewSite = ReviewSite.ToLower();
    bReviewMode = ReviewSite == TEXT("gate") || ReviewSite == TEXT("camp") || ReviewSite == TEXT("fire") || ReviewSite == TEXT("overview") || ReviewSite == TEXT("woods") || ReviewSite == TEXT("upper") || ReviewSite.StartsWith(TEXT("jam-"));
    FParse::Value(FCommandLine::Get(), TEXT("FlowFestCapture="), CapturePath);
    bAutoExit = FParse::Param(FCommandLine::Get(), TEXT("FlowFestAutoExit"));
    bSmoke = FParse::Param(FCommandLine::Get(), TEXT("FlowFestSmoke"));
    bLibraryReview = FParse::Param(FCommandLine::Get(), TEXT("FlowFestLibrary"));
    if (!CapturePath.IsEmpty() && (FPaths::IsRelative(CapturePath) || !CapturePath.EndsWith(TEXT(".png"), ESearchCase::IgnoreCase)))
    {
        UE_LOG(LogTemp, Error, TEXT("FlowFestCapture must be an absolute .png path"));
        CapturePath.Empty();
    }
    if (!CapturePath.IsEmpty())
    {
        FParse::Value(FCommandLine::Get(), TEXT("FlowFestCaptureFrames="), CaptureFrames);
        FParse::Value(FCommandLine::Get(), TEXT("FlowFestCaptureStart="), CaptureStart);
        FParse::Value(FCommandLine::Get(), TEXT("FlowFestCaptureInterval="), CaptureInterval);
        CaptureFrames = FMath::Clamp(CaptureFrames, 1, 300);
        CaptureStart = FMath::Clamp(CaptureStart, 0.f, 300.f);
        CaptureInterval = FMath::Clamp(CaptureInterval, 1.f / 30.f, 5.f);
        // A screenshot may stall wall time. Review sequences use the same
        // 30 Hz simulation step so that stalls cannot skip animation poses.
        if (CaptureFrames > 1)
        {
            FApp::SetFixedDeltaTime(1.0 / 30.0);
            FApp::SetUseFixedTimeStep(true);
            UE_LOG(LogTemp, Display, TEXT("FlowFestVisual fixed 30 Hz capture; not a performance benchmark"));
        }
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
    Avatar->BindPerformanceProp(Props);
    SyncModeVisuals();
    if (FParse::Param(FCommandLine::Get(), TEXT("FlowFestWardrobe"))) ToggleWardrobe();
    // Jam polish: -FlowFestJam plays the jam slice instead of the journey.
    if (FParse::Param(FCommandLine::Get(), TEXT("FlowFestJam")))
    {
        JamSlice = NewObject<UFlowFestJamSlice>(this, TEXT("JamSlice"));
        JamSlice->RegisterComponent();
    }
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
    if (JamSlice) bInitialPlacementDone = true; // Jam polish: the slice places the player and sets the clock.
    if (FestivalWorld && !bInitialPlacementDone)
    {
        if (bReviewMode) PlaceReviewCamera();
        else SetActorLocation(FestivalWorld->GetLandmark(TEXT("start")) + FVector(0, 0, 110), false);
        bInitialPlacementDone = true;
        if (!bReviewMode) ApplyPhaseTime();
        SyncPlayerCamp();
        if (Showcase == TEXT("flow") || Showcase == TEXT("idle") || Showcase == TEXT("ride") || Showcase == TEXT("jump") || Showcase == TEXT("walk"))
        {
            Phase = EFlowFestPhase::FestivalNight;
            SetActorLocationAndRotation(FestivalWorld->GetLandmark(TEXT("workshop")) + FVector(0, 0, 110), FRotator::ZeroRotator, false);
            FestivalWorld->SetTimeOfDay(17.f);
            if (Showcase == TEXT("ride")) bOnEUC = true;
            SyncModeVisuals();
            // Keep the review camera independent of the actor's facing.
            bUseControllerRotationYaw = false;
            CameraBoom->bDoCollisionTest = false;
            float CameraDistance = 350.f, CameraYaw = 145.f, CameraPitch = -6.f, CameraHeight = 0.f;
            float ShowcaseEast = 0.f, ShowcaseSouth = 0.f;
            FParse::Value(FCommandLine::Get(), TEXT("FlowFestCameraDistance="), CameraDistance);
            FParse::Value(FCommandLine::Get(), TEXT("FlowFestCameraYaw="), CameraYaw);
            FParse::Value(FCommandLine::Get(), TEXT("FlowFestCameraPitch="), CameraPitch);
            FParse::Value(FCommandLine::Get(), TEXT("FlowFestCameraHeight="), CameraHeight);
            FParse::Value(FCommandLine::Get(), TEXT("FlowFestShowcaseEast="), ShowcaseEast);
            FParse::Value(FCommandLine::Get(), TEXT("FlowFestShowcaseSouth="), ShowcaseSouth);
            FVector ShowcasePosition = GetActorLocation() + FVector(FMath::Clamp(ShowcaseEast, -50.f, 50.f), FMath::Clamp(ShowcaseSouth, -50.f, 50.f), 0.f) * 100.f;
            ShowcasePosition.Z = FestivalWorld->SampleGround(ShowcasePosition.X * .01f, ShowcasePosition.Y * .01f) + 110.f;
            SetActorLocation(ShowcasePosition, false);
            CameraBoom->TargetArmLength = FMath::Clamp(CameraDistance, 80.f, 1000.f);
            CameraBoom->SocketOffset = FVector(0, 0, FMath::Clamp(CameraHeight, -100.f, 100.f));
            if (AController* C = GetController()) C->SetControlRotation(FRotator(FMath::Clamp(CameraPitch, -80.f, 80.f), CameraYaw, 0));
        }
        float ReviewHour = -1.f;
        if ((bReviewMode || !Showcase.IsEmpty()) &&
            FParse::Value(FCommandLine::Get(), TEXT("FlowFestHour="), ReviewHour) &&
            FMath::IsFinite(ReviewHour) && ReviewHour >= 0.f && ReviewHour <= 24.f)
            FestivalWorld->SetTimeOfDay(ReviewHour);
    }

    StartupSeconds += DeltaSeconds;
    if (!RuntimeMotionPath.IsEmpty() && !bRuntimeMotionLoaded && bInitialPlacementDone &&
        StartupSeconds >= 2.f && GetCharacterMovement()->IsMovingOnGround())
    {
        bRuntimeMotionLoaded = true;
        FString Error;
        FFlowArtsPerformanceSession Session(Avatar, Props);
        if (Session.ImportMotionFile(RuntimeMotionPath, Error))
        {
            float MotionTime = -1.f;
            if (FParse::Value(FCommandLine::Get(), TEXT("FlowFestMotionTime="), MotionTime) && MotionTime >= 0.f)
            {
                Avatar->SeekPerformance(MotionTime);
                Avatar->SetPerformancePaused(true);
            }
            UE_LOG(LogTemp, Display, TEXT("FlowFestRuntimeMotion PASS profile=%s duration=%.3f"),
                *Avatar->GetPerformanceProfile().ToString(), Avatar->GetPerformanceLength());
        }
        else UE_LOG(LogTemp, Error, TEXT("FlowFestRuntimeMotion FAIL: %s"), *Error);
    }
    if (bLibraryReview && !bLibraryReviewOpened && bInitialPlacementDone &&
        StartupSeconds >= 3.f && GetCharacterMovement()->IsMovingOnGround())
    {
        bLibraryReviewOpened = true;
        OpenPerformanceLibrary();
        UE_LOG(LogTemp, Display, TEXT("FlowFestLibrary opened through player adapter"));
    }
    // Wait for CharacterMovement to settle after the showcase teleport.
    if (RuntimeMotionPath.IsEmpty() && Showcase == TEXT("flow") && !bShowcaseStarted && StartupSeconds >= 2.f && !GetCharacterMovement()->IsFalling())
    {
        bShowcaseStarted = true;
        ToggleStaff();
    }
    if (Showcase == TEXT("flow") && bShowcaseStarted && !bShowcaseStopped &&
        ShowcaseStopAt > 2.f && StartupSeconds >= ShowcaseStopAt)
    {
        bShowcaseStopped = true;
        StopFlow();
    }
    // Review-only input follows the same movement and animation path as play.
    if (Showcase == TEXT("walk")) bForward = StartupSeconds >= 22.f && StartupSeconds < 27.f;
    if (Showcase == TEXT("jump") && !bShowcaseStarted && StartupSeconds >= 24.7f && GetCharacterMovement()->IsMovingOnGround())
    {
        bShowcaseStarted = true;
        JumpOrRise();
    }
    if ((bReviewMode || !Showcase.IsEmpty() || !CapturePath.IsEmpty()) && StartupSeconds >= 10.f)
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
    if (!CapturePath.IsEmpty() && !bCaptureRequested && CapturedFrames < CaptureFrames &&
        StartupSeconds >= CaptureStart + CapturedFrames * CaptureInterval)
    {
        if (GEngine && GEngine->GameViewport && GEngine->GameViewport->Viewport)
        {
            ActiveCapturePath = CapturedFrames == 0 ? CapturePath :
                FPaths::GetPath(CapturePath) / FString::Printf(TEXT("%s-%03d.png"), *FPaths::GetBaseFilename(CapturePath), CapturedFrames);
            WriteMotionEvidence(ActiveCapturePath, Avatar);
            CapturePreviousTimestamp = IFileManager::Get().GetTimeStamp(*ActiveCapturePath);
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
            if (bLibraryReview)
            {
                // Slate is composited after the high-resolution scene pass.
                FScreenshotRequest::RequestScreenshot(ActiveCapturePath, true, false);
                bCaptureRequested = true;
            }
            else
            {
                FHighResScreenshotConfig& Screenshot = GetHighResScreenshotConfig();
                Screenshot.SetFilename(ActiveCapturePath);
                Screenshot.SetResolution(1920, 1080);
                bCaptureRequested = GEngine->GameViewport->Viewport->TakeHighResScreenShot();
            }
            UE_LOG(LogTemp, Display, TEXT("Flow Fest screenshot %s frame=%d time=%.3f: %s"), bCaptureRequested ? TEXT("requested") : TEXT("failed"), CapturedFrames, StartupSeconds, *ActiveCapturePath);
            ReportFrameTiming();
        }
    }
    if (bCaptureRequested && FPlatformFileManager::Get().GetPlatformFile().FileExists(*ActiveCapturePath)
        && IFileManager::Get().GetTimeStamp(*ActiveCapturePath) > CapturePreviousTimestamp)
    {
        ++CapturedFrames;
        bCaptureRequested = false;
        bCaptureReady = CapturedFrames == CaptureFrames;
        UE_LOG(LogTemp, Display, TEXT("Flow Fest screenshot written (%d/%d): %s"), CapturedFrames, CaptureFrames, *ActiveCapturePath);
    }
    const float ExitSeconds = FMath::Max(40.f, CaptureStart + (CaptureFrames - 1) * CaptureInterval + 15.f);
    // A capture review is complete once every requested image has reached disk.
    // Smoke journeys retain their full simulation window and failure deadline.
    if (bAutoExit && ((!bSmoke && bCaptureReady) || StartupSeconds >= ExitSeconds))
    {
        ReportFrameTiming();
        const bool bCaptureFailed = !CapturePath.IsEmpty() && !bCaptureReady;
        const bool bSmokeFailed = bSmoke && (!bSmokeRan || !bSmokePassed);
        if (bCaptureFailed) UE_LOG(LogTemp, Error, TEXT("Flow Fest screenshot was not written before auto-exit"));
        if (bSmokeFailed) UE_LOG(LogTemp, Error, TEXT("Flow Fest smoke failed before auto-exit"));
        FPlatformMisc::RequestExitWithStatus(false, bCaptureFailed || bSmokeFailed ? 1 : 0);
    }

    SyncPerformanceActivity();

    float ForwardInput = bWardrobeOpen ? 0.f : (bForward ? 1.f : 0.f) - (bBack ? 1.f : 0.f);
    float RightInput = bWardrobeOpen ? 0.f : (bRight ? 1.f : 0.f) - (bLeft ? 1.f : 0.f);
    if (VisitorAction != EFlowFestVisitorAction::None &&
        (!FMath::IsNearlyZero(ForwardInput) || !FMath::IsNearlyZero(RightInput) || bPhotoFly || bOnEUC || bWardrobeOpen || GetCharacterMovement()->IsFalling()))
        { EndVisitorActivity(); SaveProgress(); }
    TickVisitorActivity(DeltaSeconds);
    if (VisitorStandRemaining > 0.f)
    {
        ForwardInput = RightInput = 0.f;
        GetCharacterMovement()->StopMovementImmediately();
    }
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
        // Walk reviews keep a front-facing camera while moving in the body's forward direction.
        const FRotator ViewYaw(0.f, Showcase == TEXT("walk") ? GetActorRotation().Yaw : GetControlRotation().Yaw, 0.f);
        AddMovementInput(ViewYaw.Vector(), ForwardInput);
        AddMovementInput(FRotationMatrix(ViewYaw).GetUnitAxis(EAxis::Y), RightInput);
    }
    if (bPhotoFly) AddMovementInput(FVector::UpVector, (bRise ? 1.f : 0.f) - (bDescend ? 1.f : 0.f));

    // The only authored reverse gait travels about 117 cm/s at 1x. Keep an S
    // sprint within its 2.4x cadence range, with diagonal input interpolating
    // smoothly toward the normal lateral sprint speed.
    const float Speed = bPhotoFly ? 1600.f : bInVehicle ? (bSprint ? 2100.f : 1400.f)
        : bOnEUC ? 1050.f : OnFootSpeedCmPerSecond(ForwardInput, RightInput, bSprint);
    GetCharacterMovement()->MaxWalkSpeed = Speed;
    GetCharacterMovement()->MaxFlySpeed = Speed;
    if (Phase == EFlowFestPhase::DriveIn && bInVehicle && !bPhotoFly && !FMath::IsNearlyZero(ForwardInput))
        Energy = FMath::Max(0.f, Energy - DeltaSeconds * .075f);

    if (IsFlowPlaying())
    {
        if (Phase == EFlowFestPhase::NightFreeRoam && Jam == EFlowFestJam::Active) JamSpinSeconds += DeltaSeconds;
    }
    Avatar->SetMotion(GetVelocity(), GetCharacterMovement()->IsFalling(), bOnEUC && !bWardrobeOpen);
    if (FestivalWorld && !ActivityEvidence.IsEmpty())
    {
        const EFlowFestBodyActivity Activity = ActivityEvidence == TEXT("carry") ? EFlowFestBodyActivity::Carry :
            ActivityEvidence == TEXT("eat") ? EFlowFestBodyActivity::Eat :
            ActivityEvidence == TEXT("sit") ? EFlowFestBodyActivity::FloorRest : EFlowFestBodyActivity::None;
        // Let captures warm up before advancing the same activity clock used
        // by attendees. The default remains an exact, frozen pose review.
        const float EvidenceAdvance = bActivityEvidencePlayback
            ? FMath::Max(0.f, StartupSeconds - (CapturePath.IsEmpty() ? 0.f : CaptureStart)) : 0.f;
        const float ExitRemaining = ActivityEvidenceExit < 0.f ? -1.f
            : FMath::Max(0.f, ActivityEvidenceExit - EvidenceAdvance);
        FestivalWorld->SetActivityEvidence(Avatar, Props, Activity,
            FMath::Max(0.f, ActivityEvidenceTime + EvidenceAdvance), ExitRemaining);
    }
    else if (Showcase.IsEmpty()) SyncVisitorActivityPose();
    if (bOnEUC && !bWardrobeOpen) EUCWheel->AddLocalRotation(FRotator(0, 0, FMath::RadiansToDegrees(GetVelocity().Dot(GetActorForwardVector()) * DeltaSeconds / 36.3f)));
    Props->SetHandTransforms(Avatar->GetHandTransform(true), Avatar->GetHandTransform(false));
    if (FestivalWorld)
    {
        const bool bAtFire = Near(TEXT("fire"), 24.f);
        FestivalWorld->SetPlayerCrowdPresence(GetActorLocation(), bAtFire, bAtFire && IsFlowPlaying());
        FestivalWorld->SetJamSoundActive(bAtFire && (IsFlowPlaying() || Jam == EFlowFestJam::Active));
    }
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
    Input->BindKey(EKeys::H, IE_Pressed, this, &AFlowFestCharacter::GreetNearby);
    Input->BindKey(EKeys::One, IE_Pressed, this, &AFlowFestCharacter::SelectOne);
    Input->BindKey(EKeys::Two, IE_Pressed, this, &AFlowFestCharacter::SelectTwo);
    Input->BindKey(EKeys::Three, IE_Pressed, this, &AFlowFestCharacter::SelectThree);
    Input->BindKey(EKeys::C, IE_Pressed, this, &AFlowFestCharacter::ToggleWardrobe);
    Input->BindKey(EKeys::F, IE_Pressed, this, &AFlowFestCharacter::ToggleFirstPerson);
    Input->BindKey(EKeys::P, IE_Pressed, this, &AFlowFestCharacter::TogglePhotoFly);
    Input->BindKey(EKeys::V, IE_Pressed, this, &AFlowFestCharacter::ToggleEUC);
    Input->BindKey(EKeys::Q, IE_Pressed, this, &AFlowFestCharacter::ToggleStaff);
    Input->BindKey(EKeys::R, IE_Pressed, this, &AFlowFestCharacter::CyclePerformance);
    Input->BindKey(EKeys::M, IE_Pressed, this, &AFlowFestCharacter::ToggleSound);
    Input->BindKey(EKeys::T, IE_Pressed, this, &AFlowFestCharacter::TravelToObjective);
    Input->BindKey(EKeys::G, IE_Pressed, this, &AFlowFestCharacter::CycleTime);
    Input->BindKey(EKeys::F5, IE_Pressed, this, &AFlowFestCharacter::SaveProgress);
    Input->BindKey(EKeys::F6, IE_Pressed, this, &AFlowFestCharacter::OpenPerformanceLibrary);
    Input->BindKey(EKeys::F9, IE_Pressed, this, &AFlowFestCharacter::LoadProgress);
    Input->BindKey(EKeys::F10, IE_Pressed, this, &AFlowFestCharacter::Restart);
    Input->BindKey(EKeys::Escape, IE_Pressed, this, &AFlowFestCharacter::QuitGame);
}

void AFlowFestCharacter::LookX(float Value) { if (!bWardrobeOpen) AddControllerYawInput(Value); }
void AFlowFestCharacter::LookY(float Value) { if (!bWardrobeOpen) AddControllerPitchInput(-Value); }
void AFlowFestCharacter::JumpOrRise()
{
    if (bWardrobeOpen) return;
    if (VisitorAction == EFlowFestVisitorAction::Rest) { EndVisitorActivity(); SaveProgress(); }
    if (VisitorStandRemaining > 0.f) return;
    if (bPhotoFly) bRise = true; else if (!bInVehicle) Jump();
}
void AFlowFestCharacter::StopJumpOrRise() { bRise = false; StopJumping(); }
void AFlowFestCharacter::QuitGame() { if (bWardrobeOpen) { ToggleWardrobe(); return; } ReportFrameTiming(); FPlatformMisc::RequestExit(false); }

void AFlowFestCharacter::ReportFrameTiming()
{
    if ((!bReviewMode && Showcase.IsEmpty() && CapturePath.IsEmpty()) || bTimingReported || CaptureFrames > 1) return;
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
    if (!FestivalWorld) { Notify(TEXT("Festival world is loading")); return; }
    if (bPhotoFly) { Notify(TEXT("Leave photo flight to interact [P]")); return; }
    if (JamSlice) { JamSlice->Interact(); return; } // Jam polish: E sits at the rope's edge in the slice.
    if (TryVisitorActivity()) return;
    if (bReviewMode) { Notify(TEXT("Explore on foot; F10 starts the Thursday journey.")); return; }
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
        if (bOnEUC && Jam != EFlowFestJam::Completed) { Notify(TEXT("Park the wheel [V] before entering the circle")); return; }
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

FString AFlowFestCharacter::VisitorActivityHint() const
{
    if (!FestivalWorld || bInVehicle || bPhotoFly || bOnEUC || bWardrobeOpen) return FString();
    if (VisitorStandRemaining > 0.f) return TEXT("STANDING UP");
    if (VisitorAction != EFlowFestVisitorAction::None)
        return FString::Printf(TEXT("%s  %ds  /  E TO FINISH EARLY"),
            VisitorAction == EFlowFestVisitorAction::Eat ? TEXT("EATING") : TEXT("RESTING"), FMath::CeilToInt(VisitorActionRemaining));
    if (!bReviewMode && Phase < EFlowFestPhase::FestivalNight) return FString();
    if (Near(TEXT("food"), 6.f)) return TEXT("E  GET FOOD + WATER");
    if ((bReviewMode || Phase != EFlowFestPhase::NightReturn) &&
        (Near(TEXT("camp-lower"), 7.f) || Near(TEXT("camp-upper"), 7.f) || Near(TEXT("camp-car"), 7.f)))
        return TEXT("E  REST AT CAMP");
    return FString();
}

bool AFlowFestCharacter::TryVisitorActivity()
{
    if (VisitorStandRemaining > 0.f) return true;
    const FString Hint = VisitorActivityHint();
    if (!Hint.IsEmpty())
    {
        if (VisitorAction != EFlowFestVisitorAction::None) { EndVisitorActivity(); SaveProgress(); return true; }
        StopFlow();
        GetCharacterMovement()->StopMovementImmediately();
        VisitorAction = Near(TEXT("food"), 6.f) ? EFlowFestVisitorAction::Eat : EFlowFestVisitorAction::Rest;
        VisitorActionRemaining = VisitorAction == EFlowFestVisitorAction::Eat ? 12.f : 20.f;
        SyncModeVisuals();
        Notify(VisitorAction == EFlowFestVisitorAction::Eat ? TEXT("Take a food and water break; move to leave.") : TEXT("Rest a while; move to leave."));
        SaveProgress();
        return true;
    }
    return false;
}

void AFlowFestCharacter::GreetNearby()
{
    if (!FestivalWorld || bInVehicle || bOnEUC || bPhotoFly || bWardrobeOpen) return;
    FString Reply;
    if (FestivalWorld->GreetNearbyAttendee(GetActorLocation(), Reply))
    {
        Notify(Reply);
        SaveProgress();
    }
    else Notify(TEXT("Come closer to someone taking a break to say hello."));
}

void AFlowFestCharacter::EndVisitorActivity()
{
    if (VisitorAction == EFlowFestVisitorAction::Rest)
    {
        VisitorRestElapsed = FMath::Max(0.f, 20.f - VisitorActionRemaining);
        VisitorStandRemaining = FFlowFestActivityPose::RestRiseSeconds;
    }
    VisitorAction = EFlowFestVisitorAction::None;
    VisitorActionRemaining = 0.f;
    SyncModeVisuals();
}

void AFlowFestCharacter::TickVisitorActivity(float DeltaSeconds)
{
    VisitorStandRemaining = FMath::Max(0.f, VisitorStandRemaining - DeltaSeconds);
    if (!bPhotoFly && !bWardrobeOpen && !bInVehicle)
    {
        Hunger = FMath::Min(100.f, Hunger + DeltaSeconds * .025f);
        Energy = FMath::Max(0.f, Energy - DeltaSeconds * (IsFlowPlaying() ? .07f : GetVelocity().Size2D() > 100.f ? .035f : .008f));
    }
    if (VisitorAction == EFlowFestVisitorAction::None) return;
    const float ActionStep = FMath::Min(DeltaSeconds, VisitorActionRemaining);
    if (VisitorAction == EFlowFestVisitorAction::Eat) Hunger = FMath::Max(0.f, Hunger - ActionStep * 4.f);
    else Energy = FMath::Min(100.f, Energy + ActionStep * 1.5f);
    VisitorActionRemaining = FMath::Max(0.f, VisitorActionRemaining - DeltaSeconds);
    if (VisitorActionRemaining <= 0.f) { EndVisitorActivity(); SaveProgress(); Notify(TEXT("Ready to head back out")); }
}

void AFlowFestCharacter::SyncVisitorActivityPose()
{
    if (!FestivalWorld) return;
    EFlowFestBodyActivity Activity = EFlowFestBodyActivity::None;
    float Elapsed = 0.f, ExitRemaining = -1.f;
    if (VisitorStandRemaining > 0.f)
    {
        Activity = EFlowFestBodyActivity::FloorRest;
        Elapsed = VisitorRestElapsed;
        ExitRemaining = VisitorStandRemaining;
    }
    else if (VisitorAction == EFlowFestVisitorAction::Rest)
    {
        Activity = EFlowFestBodyActivity::FloorRest;
        Elapsed = FMath::Max(0.f, 20.f - VisitorActionRemaining);
    }
    else if (VisitorAction == EFlowFestVisitorAction::Eat)
    {
        Activity = EFlowFestBodyActivity::Eat;
        Elapsed = FMath::Max(0.f, 12.f - VisitorActionRemaining);
    }
    else if (!bInVehicle && !bPhotoFly && !bOnEUC && !bWardrobeOpen &&
        !bStaffSpinning && Props && Props->IsReady()) Activity = EFlowFestBodyActivity::Carry;
    // Jam polish: the slice's sit at the rope's edge, with the prop put away.
    const bool bJamSeated = JamSlice && JamSlice->OverridePose(Activity, Elapsed, ExitRemaining);
    // The adapter owns meal visibility; passing no prop preserves performance finishes.
    FestivalWorld->SetActivityEvidence(Avatar, nullptr, Activity, Elapsed, ExitRemaining);
    if (Props) Props->SetVisible(bWardrobeOpen || (!bJamSeated && !bInVehicle && !bPhotoFly &&
        VisitorAction == EFlowFestVisitorAction::None && VisitorStandRemaining <= 0.f));
}

FString AFlowFestCharacter::GetNearbyIntent() const
{
    const FString Intent = FestivalWorld && !bPhotoFly && !bInVehicle ? FestivalWorld->GetNearbyAttendeeIntent(GetActorLocation()) : FString();
    return Intent.IsEmpty() ? Intent : Intent + TEXT("  /  H SAY HELLO");
}

void AFlowFestCharacter::SelectOne()
{
    if (bWardrobeOpen) return;
    if (Phase == EFlowFestPhase::Loadout) { LoadoutChoice = 0; DepartureChoice = 0; Notify(TEXT("Early departure. Full energy. [E] depart")); }
    else if (Phase == EFlowFestPhase::ChooseCamp) { Camp = EFlowFestCamp::LowerTent; bInVehicle = true; Advance(EFlowFestPhase::CampArrival); }
}
void AFlowFestCharacter::SelectTwo()
{
    if (bWardrobeOpen) return;
    if (Phase == EFlowFestPhase::Loadout) { LoadoutChoice = 1; DepartureChoice = 1; Notify(TEXT("Afternoon departure. [E] depart")); }
    else if (Phase == EFlowFestPhase::ChooseCamp) { Camp = EFlowFestCamp::UpperTent; bInVehicle = true; Advance(EFlowFestPhase::CampArrival); }
}
void AFlowFestCharacter::SelectThree()
{
    if (bWardrobeOpen) return;
    if (Phase == EFlowFestPhase::Loadout) { LoadoutChoice = 2; DepartureChoice = 2; Notify(TEXT("Evening departure. [E] depart")); }
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
    if (VisitorAction == EFlowFestVisitorAction::Rest) { EndVisitorActivity(); SaveProgress(); }
    if (VisitorStandRemaining > 0.f) { Notify(TEXT("Stand up before leaving")); return; }
    StopFlow();
    bPhotoFly = !bPhotoFly;
    GetCharacterMovement()->SetMovementMode(bPhotoFly ? MOVE_Flying : MOVE_Walking);
    SyncModeVisuals();
    Notify(bPhotoFly ? TEXT("Photo flight; [P] return to the journey") : TEXT("Journey movement restored"));
}
void AFlowFestCharacter::ToggleEUC()
{
    if (bWardrobeOpen) return;
    if (VisitorAction == EFlowFestVisitorAction::Rest) { EndVisitorActivity(); SaveProgress(); }
    if (VisitorStandRemaining > 0.f) { Notify(TEXT("Stand up before mounting the wheel")); return; }
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
    if (VisitorAction != EFlowFestVisitorAction::None) { EndVisitorActivity(); SaveProgress(); }
    if (VisitorStandRemaining > 0.f) { Notify(TEXT("Stand up before flowing")); return; }
    if (bStaffSpinning) { StopFlow(); return; }
    const FName Profile = UFlowFestAvatarComponent::ResolvePerformanceProfile(EquippedPropId, PerformanceVariant);
    FFlowArtsPerformanceSession Session(Avatar, Props);
    FString PerformanceError;
    if (!Session.PlayBuiltIn(Profile, PerformanceError))
    {
        StopFlow();
        Notify(TEXT("This performance could not load"));
        return;
    }
    GetCharacterMovement()->StopMovementImmediately();
    bStaffSpinning = true;
    Props->ResetFinish();
}
void AFlowFestCharacter::CyclePerformance()
{
    if (bWardrobeOpen) return;
    const bool bResume = bStaffSpinning;
    if (bResume) StopFlow();
    PerformanceVariant = (PerformanceVariant + 1) % 2;
    if (bResume) ToggleStaff();
    Notify(PerformanceVariant == 0 ? TEXT("Flow routine A") : TEXT("Flow routine B"));
}
void AFlowFestCharacter::OpenPerformanceLibrary()
{
    if (bWardrobeOpen) { Notify(TEXT("Close the wardrobe to open the performance library")); return; }
    if (bInVehicle || bPhotoFly || bOnEUC) { Notify(TEXT("Step onto the ground to open the performance library")); return; }
    if (VisitorAction == EFlowFestVisitorAction::Rest) { EndVisitorActivity(); SaveProgress(); }
    if (VisitorStandRemaining > 0.f) { Notify(TEXT("Stand up before opening the performance library")); return; }
    bForward = bBack = bLeft = bRight = bSprint = bRise = bDescend = false;
    GetCharacterMovement()->StopMovementImmediately();
    if (APlayerController* Player = Cast<APlayerController>(GetController()))
        FFlowArtsPerformancePanel::Open(Player, Avatar, Props);
}

void AFlowFestCharacter::SyncPerformanceActivity()
{
    // Shared library sessions start through the avatar rather than ToggleStaff.
    if (!bStaffSpinning && Avatar->GetPerformanceLength() > 0.f)
    {
        if (VisitorAction != EFlowFestVisitorAction::None) { EndVisitorActivity(); SaveProgress(); }
        GetCharacterMovement()->StopMovementImmediately();
        bStaffSpinning = true;
    }
}

bool AFlowFestCharacter::IsFlowPlaying() const
{
    return bStaffSpinning && Avatar->GetPerformanceLength() > 0.f && !Avatar->IsPerformancePaused();
}

void AFlowFestCharacter::ToggleSound()
{
    bSoundEnabled = !bSoundEnabled;
    if (FestivalWorld) FestivalWorld->SetSoundEnabled(bSoundEnabled);
    Notify(bSoundEnabled ? TEXT("Festival sound on") : TEXT("Festival sound muted"));
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
    // The woods view stands at eye height inside the densest stand, south of the gate, looking into it.
    const bool bWoods = ReviewSite == TEXT("woods");
    // The upper view stands in the open field south-east of the upper camp, looking north-west
    // across it to the tents along the tree line.
    const bool bUpper = ReviewSite == TEXT("upper");
    FVector Target = bWoods ? FestivalWorld->ToWorld(205.f, -42.f, 120.f) :
        bUpper ? FestivalWorld->ToWorld(-58.f, -136.f, 160.f) : FestivalWorld->GetLandmark(Landmark) + FVector(0, 0, 160);
    // The camp view looks into the 5:30 PM sun, a little to its left so the sun sits in frame.
    const FVector IntoSun = -AFlowFestWorld::SunRotationAt(17.5f).Vector().GetSafeNormal2D();
    const FVector Offset = ReviewSite == TEXT("overview") ? FVector(-8500, -8500, 10500) :
        ReviewSite == TEXT("fire") ? FVector(-1100, -900, 0) :
        ReviewSite == TEXT("camp") ? -IntoSun.RotateAngleAxis(-10.f, FVector::UpVector) * 1720.f : FVector(-2200, -1900, 600);
    FVector Position = bWoods ? FestivalWorld->ToWorld(236.f, -64.f, 100.f) : bUpper ? FestivalWorld->ToWorld(-34.f, -112.f, 230.f) : Target + Offset;
    if (ReviewSite == TEXT("fire") || ReviewSite == TEXT("camp"))
        Position.Z = FestivalWorld->SampleGround(Position.X * .01f, Position.Y * .01f) + (ReviewSite == TEXT("camp") ? 230.f : 100.f);
    // Jam polish: the fire view and the jam views stand where the jam layout puts them, outside the rope.
    if (const UFlowFestJamComponent* JamSite = FestivalWorld->FindComponentByClass<UFlowFestJamComponent>())
        if (FVector Eye, Look; JamSite->ReviewShot(ReviewSite, Eye, Look))
        {
            Target = Look + FVector(0, 0, 68);
            Position = Eye - FVector(0, 0, 68);
        }
    GetCharacterMovement()->StopMovementImmediately();
    GetCharacterMovement()->SetMovementMode(MOVE_Flying);
    bPhotoFly = true;
    bFirstPerson = true;
    CameraBoom->TargetArmLength = 0.f;
    CameraBoom->SocketOffset = FVector(25, 0, 68);
    Avatar->SetPresentation(false, true);
    SetActorLocation(Position, false);
    if (AController* C = GetController()) C->SetControlRotation((Target - Position - FVector(0, 0, 68)).Rotation());
    FestivalWorld->SetTimeOfDay(bWoods ? 15.f : bUpper ? 17.5f : ReviewSite == TEXT("gate") ? 16.f : ReviewSite == TEXT("fire") || ReviewSite.StartsWith(TEXT("jam-")) ? 23.f : ReviewSite == TEXT("camp") ? 17.5f : 17.f);
    SyncModeVisuals();
    if (FParse::Param(FCommandLine::Get(), TEXT("FlowFestExplore")))
    {
        Position.Z = FestivalWorld->SampleGround(Position.X * .01f, Position.Y * .01f) + 110.f;
        SetActorLocation(Position, false);
        bPhotoFly = false;
        bFirstPerson = false;
        bInVehicle = false;
        bOnEUC = false;
        GetCharacterMovement()->SetMovementMode(MOVE_Walking);
        SyncModeVisuals();
        Notify(TEXT("Explore the festival: WASD move, Q flow, H greet, E food or rest. F10 starts the journey."));
        UE_LOG(LogTemp, Display, TEXT("FlowFestExplore ready on foot at %s"), *ReviewSite);
    }
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
    Props->SetVisible(bWardrobeOpen || (!bInVehicle && !bPhotoFly &&
        VisitorAction == EFlowFestVisitorAction::None && VisitorStandRemaining <= 0.f));
    // A_Ride contains the production pedal-contact pose relative to wheel ground.
    AvatarRoot->SetRelativeLocation(FVector(0, 0, -92.f));
    CameraBoom->bDoCollisionTest = !bWardrobeOpen;
    CameraBoom->TargetArmLength = bWardrobeOpen ? 340.f : (bFirstPerson || bPhotoFly) ? 0.f : bInVehicle ? 680.f : 420.f;
    CameraBoom->SocketOffset = bWardrobeOpen ? FVector(0, 150, -10) : (bFirstPerson || bPhotoFly) ? FVector(25, 0, 68) : FVector(0, 0, 65);
    // Keep the standing body facing the view yaw so S and A/D are real
    // backward and strafe travel in the avatar's local frame. The vehicle
    // keeps its steering yaw; the unicycle still faces its travel direction.
    bUseControllerRotationYaw = !bInVehicle && !bOnEUC && !bPhotoFly;
    GetCharacterMovement()->bOrientRotationToMovement = !bInVehicle && (bOnEUC || bPhotoFly);
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
    Avatar->BindPerformanceProp(Props);
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
    Avatar->BindPerformanceProp(Props);
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
    // Jam polish: the -Jam slice never writes over the journey's save.
    if (JamSlice) return;
    UFlowFestSaveGame* Save = Cast<UFlowFestSaveGame>(UGameplayStatics::CreateSaveGameObject(UFlowFestSaveGame::StaticClass()));
    if (!Save) return;
    Save->Phase = Phase; Save->Camp = Camp; Save->Jam = Jam;
    Save->LoadoutChoice = LoadoutChoice; Save->DepartureChoice = DepartureChoice;
    Save->Energy = Energy; Save->Position = GetActorLocation(); Save->Rotation = GetActorRotation();
    Save->Hunger = Hunger; Save->VisitorAction = VisitorAction; Save->VisitorActionRemaining = VisitorActionRemaining;
    Save->VisitorStandRemaining = VisitorStandRemaining; Save->VisitorRestElapsed = VisitorRestElapsed;
    Save->CrowdState = FestivalWorld ? FestivalWorld->SaveCrowdState() : FString();
    Save->bExplorationOnly = bReviewMode;
    Save->Hour = FestivalWorld ? FestivalWorld->GetTimeOfDay() : 15.f;
    Save->bInVehicle = bInVehicle; Save->bCampBuilt = bCampBuilt;
    Save->CharacterId = CharacterId; Save->PropId = EquippedPropId; Save->bOnEUC = bOnEUC;
    Save->bSoundEnabled = bSoundEnabled; Save->PerformanceVariant = PerformanceVariant;
    if (!UGameplayStatics::SaveGameToSlot(Save, SaveSlot(), 0)) Notify(TEXT("Save failed"));
}

bool AFlowFestCharacter::ValidateSave(const UFlowFestSaveGame* S) const
{
    if (!S || S->Version < 1 || S->Version > UFlowFestSaveGame::CurrentVersion || static_cast<uint8>(S->Phase) > static_cast<uint8>(EFlowFestPhase::Morning)
        || static_cast<uint8>(S->Camp) > static_cast<uint8>(EFlowFestCamp::CarCamp)
        || static_cast<uint8>(S->Jam) > static_cast<uint8>(EFlowFestJam::Completed)
        || !FMath::IsFinite(S->Energy) || S->Energy < 0.f || S->Energy > 100.f
        || !FMath::IsFinite(S->Hour) || S->Hour < 0.f || S->Hour >= 24.f
        || S->LoadoutChoice < 0 || S->LoadoutChoice > 2 || S->DepartureChoice < 0 || S->DepartureChoice > 2
        || S->Position.ContainsNaN() || S->Rotation.ContainsNaN() || S->Position.GetAbsMax() > 1000000.f) return false;
    if (S->Version >= 3 && (!FMath::IsFinite(S->Hunger) || S->Hunger < 0.f || S->Hunger > 100.f
        || static_cast<uint8>(S->VisitorAction) > static_cast<uint8>(EFlowFestVisitorAction::Rest)
        || !FMath::IsFinite(S->VisitorActionRemaining) || S->VisitorActionRemaining < 0.f || S->VisitorActionRemaining > 20.f)) return false;
    if (S->Version >= 4 && (!FMath::IsFinite(S->VisitorStandRemaining) || S->VisitorStandRemaining < 0.f ||
        S->VisitorStandRemaining > FFlowFestActivityPose::RestRiseSeconds ||
        !FMath::IsFinite(S->VisitorRestElapsed) || S->VisitorRestElapsed < 0.f || S->VisitorRestElapsed > 20.f ||
        (S->VisitorStandRemaining > 0.f && (S->VisitorAction != EFlowFestVisitorAction::None ||
            S->bInVehicle || S->bOnEUC)))) return false;
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
    bReviewMode = Save->bExplorationOnly; bFirstPerson = false;
    LoadoutChoice = Save->LoadoutChoice; DepartureChoice = Save->DepartureChoice;
    Energy = Save->Energy; bInVehicle = Save->bInVehicle; bCampBuilt = Save->bCampBuilt;
    Hunger = Save->Hunger;
    VisitorAction = Save->VisitorAction;
    VisitorActionRemaining = Save->VisitorActionRemaining;
    VisitorStandRemaining = Save->Version >= 4 ? Save->VisitorStandRemaining : 0.f;
    VisitorRestElapsed = Save->Version >= 4 ? Save->VisitorRestElapsed : 0.f;
    if (VisitorActionRemaining <= 0.f || bInVehicle || Save->bOnEUC) VisitorAction = EFlowFestVisitorAction::None;
    bOnEUC = Save->bOnEUC && !bInVehicle; bPhotoFly = false; bStaffSpinning = false;
    CharacterId = Save->CharacterId; EquippedPropId = Save->PropId;
    bSoundEnabled = Save->bSoundEnabled;
    PerformanceVariant = FMath::Clamp(Save->PerformanceVariant, 0, 1);
    Avatar->SetCharacter(CharacterId); Props->Equip(EquippedPropId);
    Props->BindHands(Avatar->GetBodyMesh());
    Avatar->BindPerformanceProp(Props);
    JamSpinSeconds = 0.f;
    GetCharacterMovement()->SetMovementMode(MOVE_Walking);
    if (VisitorStandRemaining > 0.f) GetCharacterMovement()->StopMovementImmediately();
    SetActorLocationAndRotation(Save->Position, Save->Rotation, false);
    if (FestivalWorld) FestivalWorld->SetTimeOfDay(Save->Hour);
    if (FestivalWorld) FestivalWorld->SetSoundEnabled(bSoundEnabled);
    if (FestivalWorld && (Save->CrowdState.IsEmpty() || !FestivalWorld->RestoreCrowdState(Save->CrowdState)))
    {
        FestivalWorld->ResetCrowd();
        UE_LOG(LogTemp, Display, TEXT("Saved crowd state was absent or invalid; crowd restarted for the saved time of day"));
    }
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
    Hunger = 15.f; VisitorAction = EFlowFestVisitorAction::None; VisitorActionRemaining = 0.f;
    VisitorStandRemaining = VisitorRestElapsed = 0.f;
    bInVehicle = false; bOnEUC = false; bPhotoFly = false; bCampBuilt = false; bStaffSpinning = false;
    JamSpinSeconds = 0.f;
    GetCharacterMovement()->SetMovementMode(MOVE_Walking);
    if (FestivalWorld) SetActorLocation(FestivalWorld->GetLandmark(TEXT("start")) + FVector(0, 0, 110), false);
    ApplyPhaseTime();
    if (FestivalWorld) FestivalWorld->ResetCrowd();
    SyncModeVisuals(); SaveProgress(); Notify(TEXT("New Thursday started"));
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
        // Continue through real Tick/input handling rather than manually ending rest.
        bInVehicle = false;
        Phase = EFlowFestPhase::FestivalNight;
        // Keep the camp journey coherent for the persistence checks that follow.
        Camp = EFlowFestCamp::LowerTent;
        bCampBuilt = true;
        Jam = EFlowFestJam::NotStarted;
        SetActorLocation(FestivalWorld->GetLandmark(TEXT("camp-lower")) + FVector(0, 0, 110), false);
        SyncModeVisuals();
        SmokeDriveStage = 5;
        SmokeStageStartSeconds = StartupSeconds;
        return false;
    }
    if (SmokeDriveStage == 5)
    {
        if (!GetCharacterMovement()->IsMovingOnGround())
        {
            if (StageSeconds <= 3.f) return false;
            CheckDrive(false, TEXT("rest input test settles on camp ground"));
            return true;
        }
        GetCharacterMovement()->StopMovementImmediately();
        Interact();
        CheckDrive(VisitorAction == EFlowFestVisitorAction::Rest, TEXT("rest input test enters production camp activity"));
        SmokeDriveStage = 6;
        SmokeStageStartSeconds = StartupSeconds;
        return false;
    }
    if (SmokeDriveStage == 6 && StageSeconds >= .6f)
    {
        CheckDrive(VisitorAction == EFlowFestVisitorAction::Rest, TEXT("rest remains active before movement input"));
        SmokeStageStartLocation = GetActorLocation();
        bForward = true;
        SmokeDriveStage = 7;
        SmokeStageStartSeconds = StartupSeconds;
        return false;
    }
    if (SmokeDriveStage == 7)
    {
        if (VisitorAction == EFlowFestVisitorAction::Rest)
        {
            // Tick consumes the held key below; fail promptly if it never does.
            if (StageSeconds <= 1.f) return false;
            CheckDrive(false, TEXT("held forward input reaches production activity cancellation"));
            bForward = false;
            return true;
        }
        CheckDrive(VisitorAction == EFlowFestVisitorAction::None, TEXT("held forward input ends rest"));
        if (VisitorStandRemaining > 0.f)
        {
            CheckDrive(FVector::DistSquaredXY(GetActorLocation(), SmokeStageStartLocation) <= 1.f,
                TEXT("held forward input cannot displace player during rise"));
            if (StageSeconds <= FFlowFestActivityPose::RestRiseSeconds + 1.f) return false;
            CheckDrive(false, TEXT("rise completes under held movement input"));
        }
        CheckDrive(StageSeconds >= FFlowFestActivityPose::RestRiseSeconds - .1f,
            TEXT("held input preserves the full rise delay"));
        SmokeStageStartLocation = GetActorLocation();
        SmokeStageStartSeconds = StartupSeconds;
        SmokeDriveStage = 8;
        return false;
    }
    if (SmokeDriveStage == 8 && StageSeconds >= .35f)
    {
        CheckDrive(bForward && VisitorStandRemaining == 0.f &&
            FVector::DistSquaredXY(GetActorLocation(), SmokeStageStartLocation) > FMath::Square(10.f),
            TEXT("held forward input resumes travel after rise"));
        bForward = false;
        GetCharacterMovement()->StopMovementImmediately();
        UE_LOG(LogTemp, Display, TEXT("FlowFestSmoke activity movement: held input blocked through rise then travel resumed"));
        SmokeDriveStage = 9;
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
    auto ExpectMealAndProps = [this, &Expect](bool bEating, bool bBite, const TCHAR* Label)
    {
        // Observe the production adapter's owned components, without forcing an evidence pose.
        SyncVisitorActivityPose();
        TArray<UStaticMeshComponent*> Meshes;
        GetComponents<UStaticMeshComponent>(Meshes);
        int32 MealParts = 0;
        bool bVisibilityMatches = true;
        for (const UStaticMeshComponent* Mesh : Meshes)
        {
            const FName Name = Mesh->GetFName();
            if (Name == TEXT("MealBowl") || Name == TEXT("MealFood"))
            {
                ++MealParts;
                bVisibilityMatches &= Mesh->IsVisible() == bEating;
            }
            else if (Name == TEXT("MealBite"))
            {
                ++MealParts;
                bVisibilityMatches &= Mesh->IsVisible() == bBite;
            }
        }
        Expect(MealParts == 3 && bVisibilityMatches && Props && Props->HasVisibleGrip() == !bEating, Label);
    };
    auto MoveTo = [this](const TCHAR* Id)
    {
        SetActorLocation(FestivalWorld->GetLandmark(Id) + FVector(0, 0, 110), false);
    };
    Expect(CharacterChoices.Num() == 16 && PropChoices.Num() == 71, TEXT("complete deployed character and prop catalogs"));
    Expect(FMath::IsNearlyEqual(OnFootSpeedCmPerSecond(-1.f, 0.f, true), 280.f)
        && FMath::IsNearlyEqual(OnFootSpeedCmPerSecond(1.f, 0.f, true), 440.f)
        && FMath::IsNearlyEqual(OnFootSpeedCmPerSecond(0.f, 1.f, true), 440.f)
        && OnFootSpeedCmPerSecond(-1.f, 1.f, true) > 280.f
        && OnFootSpeedCmPerSecond(-1.f, 1.f, true) < 440.f,
        TEXT("backward sprint cap preserves lateral and forward travel"));
    const FName PreviousCharacter = CharacterId, PreviousProp = EquippedPropId;
    auto CheckPose = [this, &Expect](const FString& Label)
    {
        USkeletalMeshComponent* Body = Avatar->GetBodyMesh();
        for (int32 Settle = 0; Settle < 24; ++Settle) Body->TickAnimation(.05f, false);
        Body->RefreshBoneTransforms();
        const FVector Origin = AvatarRoot->GetComponentLocation();
        const FVector Hips = Body->GetSocketLocation(TEXT("Hips")) - Origin;
        const FVector Head = Body->GetSocketLocation(TEXT("Head")) - Origin;
        const FVector Foot = Body->GetSocketLocation(TEXT("LeftFoot")) - Origin;
        Expect(!Hips.ContainsNaN() && Hips.Size() < 240.f && Head.Z > 50.f && Head.Z < 260.f
            && Foot.Z > -50.f && Foot.Z < 200.f, *FString::Printf(TEXT("plausible imported pose %s"), *Label));
        UE_LOG(LogTemp, Display, TEXT("FlowFestPose %s hips=%s head=%s foot=%s"), *Label, *Hips.ToString(), *Head.ToString(), *Foot.ToString());
    };
    int32 FamilyProfilesLoaded = 0;
    for (const FFlowFestChoice& Choice : CharacterChoices)
    {
        Expect(Avatar->SetCharacter(Choice.Id), *FString::Printf(TEXT("load character %s and locomotion"), *Choice.Id.ToString()));
        CheckPose(Choice.Id.ToString() + TEXT("/Idle"));
        Expect(Props->BindHands(Avatar->GetBodyMesh()), *FString::Printf(TEXT("palm attachment for %s"), *Choice.Id.ToString()));
        FString Key = Choice.Id.ToString().Replace(TEXT("-"), TEXT("_"));
        Expect(LoadObject<UObject>(nullptr, *FString::Printf(TEXT("/Game/FlowFest/Characters/%s/A_Ride.A_Ride"), *Key)) != nullptr,
            *FString::Printf(TEXT("pedal-contact ride for %s"), *Choice.Id.ToString()));
        Avatar->SetMotion(FVector::ZeroVector, false, true);
        CheckPose(Choice.Id.ToString() + TEXT("/Ride"));
        const FTransform AvatarFrame = AvatarRoot->GetComponentTransform();
        const FVector LeftRideFoot = AvatarFrame.InverseTransformPosition(Avatar->GetBodyMesh()->GetSocketLocation(TEXT("LeftFoot")));
        const FVector RightRideFoot = AvatarFrame.InverseTransformPosition(Avatar->GetBodyMesh()->GetSocketLocation(TEXT("RightFoot")));
        // Foot joints sit above each shoe sole; the captured rigs have different
        // ankle origins. Check both sides in the vehicle frame, independent of yaw.
        Expect(LeftRideFoot.Y > -27.f && LeftRideFoot.Y < -18.f && RightRideFoot.Y > 18.f && RightRideFoot.Y < 27.f
            && LeftRideFoot.X > -16.f && LeftRideFoot.X < 2.f && RightRideFoot.X > -16.f && RightRideFoot.X < 2.f
            && LeftRideFoot.Z > 30.f && LeftRideFoot.Z < 50.f && RightRideFoot.Z > 30.f && RightRideFoot.Z < 50.f,
            *FString::Printf(TEXT("mounted feet align with native wheel for %s"), *Choice.Id.ToString()));
        for (const TCHAR* Profile : {TEXT("FirePoi"), TEXT("FireHoop"), TEXT("Juggler"), TEXT("LedFlow")})
        {
            const FName PhysicalProp = FCString::Strcmp(Profile, TEXT("FirePoi")) == 0 ? FName(TEXT("poi"))
                : FCString::Strcmp(Profile, TEXT("FireHoop")) == 0 ? FName(TEXT("bighoop"))
                : FCString::Strcmp(Profile, TEXT("Juggler")) == 0 ? FName(TEXT("club")) : FName(TEXT("capsule_baton"));
            Expect(Props->Equip(PhysicalProp), TEXT("matching legacy performance prop"));
            Expect(Avatar->PlayPerformance(FName(Profile)), *FString::Printf(TEXT("production performance %s/%s"), *Choice.Id.ToString(), Profile));
            Expect(FMath::IsNearlyEqual(Avatar->GetPerformanceLength(), 16.f, .001f), TEXT("performance has exact 16-second loop duration"));
            Avatar->SetPerformancePhase(.5f / 16.f);
            CheckPose(Choice.Id.ToString() + TEXT("/") + Profile);
            Expect(Props->LoadPerformance(Choice.Id, FName(Profile)), *FString::Printf(TEXT("prop motion %s/%s"), *Choice.Id.ToString(), Profile));
            Props->SetPerformanceTime(.5f);
            Props->ClearPerformanceTransforms();
            Avatar->StopPerformance();
        }
        TSet<FName> SeenFamilyProfiles;
        for (const FFlowFestChoice& PropChoice : PropChoices)
        {
            const FName ProfileA = UFlowFestAvatarComponent::ResolvePerformanceProfile(PropChoice.Id, 0);
            const FName ProfileB = UFlowFestAvatarComponent::ResolvePerformanceProfile(PropChoice.Id, 1);
            if (ProfileA.IsNone() || ProfileB.IsNone() || ProfileA == ProfileB)
            {
                Expect(false, *FString::Printf(TEXT("valid family profiles for %s"), *PropChoice.Id.ToString()));
                continue;
            }
            if (SeenFamilyProfiles.Contains(ProfileA) && SeenFamilyProfiles.Contains(ProfileB)) continue;
            const bool bEquipped = Props->Equip(PropChoice.Id) && Props->IsReady();
            Expect(bEquipped, *FString::Printf(TEXT("matching family performance prop %s"), *PropChoice.Id.ToString()));
            if (!bEquipped) continue;
            for (const FName Profile : {ProfileA, ProfileB})
            {
                if (SeenFamilyProfiles.Contains(Profile)) continue;
                SeenFamilyProfiles.Add(Profile);
                const FString Label = Choice.Id.ToString() + TEXT("/") + Profile.ToString();
                const bool bPropLoaded = Props->LoadPerformance(Choice.Id, Profile);
                const bool bBodyLoaded = Avatar->PlayPerformance(Profile);
                const bool bExactLength = bBodyLoaded && FMath::IsNearlyEqual(Avatar->GetPerformanceLength(), 16.f, .001f);
                Expect(bPropLoaded && bBodyLoaded && bExactLength,
                    *FString::Printf(TEXT("cooked family body, prop track and 16-second loop %s"), *Label));
                if (bPropLoaded && bBodyLoaded && bExactLength) ++FamilyProfilesLoaded;
                Props->ClearPerformanceTransforms();
                Avatar->StopPerformance();
            }
        }
        Expect(SeenFamilyProfiles.Num() == 82,
            *FString::Printf(TEXT("82 unique family routines for %s"), *Choice.Id.ToString()));
    }
    Expect(FamilyProfilesLoaded == 1312, TEXT("all 1312 cooked family performances load"));
    UE_LOG(LogTemp, Display, TEXT("FlowFestSmoke cooked family performances loaded: %d/1312"), FamilyProfilesLoaded);
    for (const FFlowFestChoice& Choice : PropChoices)
    {
        Expect(Props->Equip(Choice.Id) && Props->IsReady(), *FString::Printf(TEXT("load both hands for %s"), *Choice.Id.ToString()));
        Props->SetFinish(TEXT("fire")); Props->SetVisible(false); Props->SetVisible(true);
        Props->SetFinish(TEXT("led")); Props->SetFinish(TEXT("none"));
    }
    Avatar->SetCharacter(PreviousCharacter); Props->Equip(PreviousProp); Props->BindHands(Avatar->GetBodyMesh()); Avatar->BindPerformanceProp(Props);
    Expect(EUCMesh->GetStaticMesh() && EUCWheel->GetStaticMesh(), TEXT("authored unicycle body and rotating wheel"));
    ChooseCharacter(TEXT("ch44")); ChooseProp(TEXT("fan:day_white_covered"));
    const bool PreviousSoundEnabled = bSoundEnabled;
    const int32 PreviousPerformanceVariant = PerformanceVariant;
    bSoundEnabled = false;
    PerformanceVariant = 1;
    SaveProgress();
    const UFlowFestSaveGame* SelectionSave = Cast<UFlowFestSaveGame>(UGameplayStatics::LoadGameFromSlot(SaveSlot(), 0));
    Expect(ValidateSave(SelectionSave), TEXT("selection persistence starts from a valid saved journey"));
    Avatar->SetCharacter(PreviousCharacter); CharacterId = PreviousCharacter;
    Props->Equip(PreviousProp); EquippedPropId = PreviousProp;
    bSoundEnabled = true;
    PerformanceVariant = 0;
    LoadProgress();
    Expect(CharacterId == TEXT("ch44") && EquippedPropId == TEXT("fan:day_white_covered"), TEXT("selected character and prop variant persistence"));
    Expect(!bSoundEnabled && PerformanceVariant == 1, TEXT("sound and routine selection persistence"));
    bSoundEnabled = PreviousSoundEnabled;
    PerformanceVariant = PreviousPerformanceVariant;
    FestivalWorld->SetSoundEnabled(bSoundEnabled);
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
        Expect(bUseControllerRotationYaw && !GetCharacterMovement()->bOrientRotationToMovement,
            TEXT("on-foot view facing leaves reverse and strafe gait reachable"));
        Interact(); Expect(Phase == EFlowFestPhase::WalkToFestival && bCampBuilt, TEXT("make camp"));
        MoveTo(CampIndex == 0 ? TEXT("food") : TEXT("workshop")); Interact();
        Expect(Phase == EFlowFestPhase::FestivalNight, TEXT("workshop"));
        Expect(VisitorAction == EFlowFestVisitorAction::None, TEXT("workshop progression takes priority over nearby food"));
        if (CampIndex == 0)
        {
            Hunger = 80.f;
            MoveTo(TEXT("food")); Interact();
            Expect(VisitorAction == EFlowFestVisitorAction::Eat && Phase == EFlowFestPhase::FestivalNight,
                TEXT("food stop shares crowd landmark without advancing journey"));
            ExpectMealAndProps(true, false, TEXT("food entry shows meal and hides carried props"));
            TickVisitorActivity(1.5f);
            ExpectMealAndProps(true, true, TEXT("production eating phase shows the bite"));
            TickVisitorActivity(1.5f);
            Expect(Hunger < 69.f && VisitorActionRemaining == 9.f, TEXT("food restores hunger over elapsed action time"));
            SaveProgress();
            const FString CrowdBeforeLoad = FestivalWorld->SaveCrowdState();
            EndVisitorActivity(); Hunger = 100.f;
            LoadProgress();
            Expect(VisitorAction == EFlowFestVisitorAction::Eat && VisitorActionRemaining == 9.f && Hunger < 69.f,
                TEXT("food break and needs resume from save"));
            Expect(FestivalWorld->SaveCrowdState() == CrowdBeforeLoad, TEXT("journey load restores attendee intentions"));
            Interact();
            Expect(VisitorAction == EFlowFestVisitorAction::None, TEXT("food break can end early"));
            ExpectMealAndProps(false, false, TEXT("early food exit removes all meal parts and restores carried props"));
            Interact();
            Expect(VisitorAction == EFlowFestVisitorAction::Eat, TEXT("natural food completion starts through interaction"));
            TickVisitorActivity(12.f);
            Expect(VisitorAction == EFlowFestVisitorAction::None && VisitorActionRemaining == 0.f,
                TEXT("food break completes naturally"));
            ExpectMealAndProps(false, false, TEXT("natural food exit removes all meal parts and restores carried props"));
            Interact();
            Expect(VisitorAction == EFlowFestVisitorAction::Eat, TEXT("food break can resume"));
            ToggleStaff();
            Expect(VisitorAction == EFlowFestVisitorAction::None && bStaffSpinning,
                TEXT("flow cancels the food break"));
            LoadProgress();
            Expect(VisitorAction == EFlowFestVisitorAction::None && VisitorActionRemaining == 0.f,
                TEXT("load does not resurrect a food break canceled by flow"));
            Interact();
            const FName LibraryProfile = UFlowFestAvatarComponent::ResolvePerformanceProfile(EquippedPropId, PerformanceVariant);
            Expect(Props->LoadPerformance(CharacterId, LibraryProfile) && Avatar->PlayPerformance(LibraryProfile),
                TEXT("library target starts through the shared avatar and prop owners"));
            SyncPerformanceActivity();
            Expect(VisitorAction == EFlowFestVisitorAction::None && IsFlowPlaying(),
                TEXT("library playback joins flow state and ends the food break"));
            Avatar->SetPerformancePaused(true);
            const float EnergyBeforePause = Energy;
            TickVisitorActivity(1.f);
            Expect(bStaffSpinning && !IsFlowPlaying() && FMath::IsNearlyEqual(Energy, EnergyBeforePause - .008f, .001f),
                TEXT("paused flow retains its session without earning active flow or consuming flow energy"));
            Avatar->SetPerformancePaused(false);
            Expect(IsFlowPlaying(), TEXT("library resume restores active flow"));
            LoadProgress();
            Expect(!bStaffSpinning && VisitorAction == EFlowFestVisitorAction::None,
                TEXT("library cancellation of a break persists across load"));
            MoveTo(CampIds[CampIndex]); Energy = 40.f; Interact();
            Expect(VisitorAction == EFlowFestVisitorAction::Rest, TEXT("player can rest at the same camp as attendees"));
            TickVisitorActivity(20.f);
            Expect(VisitorAction == EFlowFestVisitorAction::None && Energy > 69.f && Energy <= 100.f,
                TEXT("camp rest finishes and restores bounded energy"));
            Expect(FMath::IsNearlyEqual(VisitorStandRemaining, FFlowFestActivityPose::RestRiseSeconds),
                TEXT("completed rest starts the full standing transition"));
            ToggleStaff();
            Expect(!bStaffSpinning && VisitorStandRemaining > 0.f,
                TEXT("rest exit cannot start flow before standing"));
            TickVisitorActivity(.55f);
            Expect(VisitorStandRemaining > 0.f && VisitorStandRemaining < FFlowFestActivityPose::RestRiseSeconds,
                TEXT("standing transition advances before releasing movement"));
            const float SavedStandRemaining = VisitorStandRemaining;
            const float SavedRestElapsed = VisitorRestElapsed;
            SaveProgress();
            VisitorStandRemaining = VisitorRestElapsed = 0.f;
            LoadProgress();
            Expect(FMath::IsNearlyEqual(VisitorStandRemaining, SavedStandRemaining) &&
                FMath::IsNearlyEqual(VisitorRestElapsed, SavedRestElapsed),
                TEXT("save/load preserves the standing pose and remaining delay"));
            ToggleStaff();
            Expect(!bStaffSpinning && VisitorStandRemaining > 0.f,
                TEXT("loaded standing transition still blocks flow"));
            TickVisitorActivity(.6f);
            Expect(VisitorStandRemaining == 0.f, TEXT("standing transition releases movement when complete"));
        }
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
    case EFlowFestPhase::Loadout: return TEXT("1 Early   2 Afternoon   3 Evening. Choose character and gear with C; E to depart.");
    case EFlowFestPhase::ChooseCamp: return TEXT("1 Lower tent   2 Upper tent   3 Car camp");
    case EFlowFestPhase::NightFreeRoam:
        if (Jam == EFlowFestJam::Completed) return TEXT("Your turn is complete. Press E to head back to camp.");
        return Jam == EFlowFestJam::Active ? TEXT("Flow [Q], then press E to finish the jam.") : TEXT("Enter the circle on foot and press E.");
    case EFlowFestPhase::Morning: return TEXT("The first night is complete. Explore Friday or press F10 for a new Thursday.");
    default: return TEXT("Follow the marker. Press E when you reach the objective.");
    }
}

FString AFlowFestCharacter::GetInteractHint() const
{
    const FString ActivityHint = VisitorActivityHint();
    if (!ActivityHint.IsEmpty()) return ActivityHint;
    if (bReviewMode) return TEXT("F10  BEGIN JOURNEY");
    if (Phase == EFlowFestPhase::ChooseCamp) return TEXT("1 / 2 / 3  CHOOSE CAMP");
    if (Phase == EFlowFestPhase::Morning) return TEXT("F10  NEW JOURNEY");
    if (Phase == EFlowFestPhase::Loadout) return TEXT("E  DEPART");
    const float Meters = GetObjectiveDistanceMeters();
    if (Meters > (Phase == EFlowFestPhase::VehicleSettle ? 34.f : 26.f)) return FString::Printf(TEXT("%.0f m TO OBJECTIVE"), Meters);
    return TEXT("E  INTERACT");
}
