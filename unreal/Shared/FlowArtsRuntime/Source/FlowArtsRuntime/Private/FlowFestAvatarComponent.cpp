#include "FlowFestAvatarComponent.h"
#include "FlowFestAnimInstance.h"
#include "FlowFestFootstepComponent.h"
#include "FlowFestPropComponent.h"

#include "Animation/AnimSequence.h"
#include "Components/SceneComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/World.h"
#include "CollisionQueryParams.h"
#include "ReferenceSkeleton.h"
#include "UObject/UObjectGlobals.h"

namespace
{
constexpr const TCHAR* RequiredMotions[] = {
    TEXT("Idle"), TEXT("Walk"), TEXT("Run"), TEXT("Jump"), TEXT("Fall"), TEXT("Land"),
    TEXT("Backward"), TEXT("StrafeLeft"), TEXT("StrafeRight"),
    TEXT("RunStrafeLeft"), TEXT("RunStrafeRight")
};

// Source root travel per loop, measured after the 190.5 cm rig scale. The
// body clip clocks follow actor travel so planted feet do not drift at crowd
// speeds or while accelerating.
float AuthoredTravelCmPerSecond(FName Motion)
{
    if (Motion == TEXT("Walk")) return 184.f;
    if (Motion == TEXT("Run")) return 440.f;
    if (Motion == TEXT("Backward")) return 117.f;
    if (Motion == TEXT("StrafeLeft") || Motion == TEXT("StrafeRight")) return 177.f;
    if (Motion == TEXT("RunStrafeLeft") || Motion == TEXT("RunStrafeRight")) return 450.f;
    return 0.f;
}

// Source jump-up begins with an anticipatory crouch. At physical takeoff its
// feet start lifting at roughly 0.50 s. Falling-to-landing reaches floor
// contact at roughly 0.50 s; its remaining frames contain the landing settle.
constexpr float JumpTakeoffSourceSeconds = .50f;
constexpr float LandContactSourceSeconds = .50f;

bool IsDeployedId(FName Id)
{
    static const TSet<FName> Deployed = {
        TEXT("x-bot"), TEXT("y-bot"), TEXT("remy"), TEXT("ch26"),
        TEXT("ch01"), TEXT("ch07"), TEXT("ch10"), TEXT("ch12"),
        TEXT("ch18"), TEXT("ch21"), TEXT("ch22"), TEXT("ch24"),
        TEXT("ch34"), TEXT("ch41"), TEXT("ch42"), TEXT("ch44")
    };
    return Deployed.Contains(Id);
}
}

UFlowFestAvatarComponent::UFlowFestAvatarComponent()
{
    PrimaryComponentTick.bCanEverTick = true;
    PrimaryComponentTick.TickGroup = TG_PostUpdateWork;
}

void UFlowFestAvatarComponent::Initialize(USceneComponent* Parent, FName InitialCharacterId)
{
    if (!Parent || !Parent->GetOwner() || Parent->GetOwner() != GetOwner())
    {
        UE_LOG(LogTemp, Error, TEXT("Flow Fest avatar requires a scene parent owned by the same actor"));
        return;
    }
    AttachParent = Parent;
    if (!BodyMesh)
    {
        BodyMesh = NewObject<USkeletalMeshComponent>(GetOwner(), TEXT("FlowFestNativeBody"));
        BodyMesh->SetupAttachment(Parent);
        BodyMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        BodyMesh->SetRelativeTransform(FTransform::Identity);
        BodyMesh->RegisterComponent();
        AddTickPrerequisiteComponent(BodyMesh);
    }
    else
    {
        BodyMesh->AttachToComponent(Parent, FAttachmentTransformRules::SnapToTargetNotIncludingScale);
    }
    if (!Footsteps)
    {
        Footsteps = NewObject<UFlowFestFootstepComponent>(GetOwner());
        Footsteps->RegisterComponent();
    }
    Footsteps->SetEnabled(bFootstepsEnabled);
    SetCharacter(InitialCharacterId);
}

void UFlowFestAvatarComponent::SetFootstepsEnabled(bool bEnabled)
{
    bFootstepsEnabled = bEnabled;
    if (Footsteps) Footsteps->SetEnabled(bEnabled);
}

FString UFlowFestAvatarComponent::CharacterFolder() const
{
    FString Key = CharacterId.ToString();
    Key.ReplaceInline(TEXT("-"), TEXT("_"));
    return FString::Printf(TEXT("/Game/FlowFest/Characters/%s"), *Key);
}

bool UFlowFestAvatarComponent::SetCharacter(FName NewCharacterId)
{
    if (!BodyMesh)
    {
        UE_LOG(LogTemp, Error, TEXT("Flow Fest avatar %s was set before Initialize"), *NewCharacterId.ToString());
        return false;
    }
    if (!IsDeployedId(NewCharacterId))
    {
        UE_LOG(LogTemp, Error, TEXT("Unknown deployed Flow Fest character: %s"), *NewCharacterId.ToString());
        return false;
    }
    FString Key = NewCharacterId.ToString();
    Key.ReplaceInline(TEXT("-"), TEXT("_"));
    const FString Folder = FString::Printf(TEXT("/Game/FlowFest/Characters/%s"), *Key);
    const FString MeshPath = FString::Printf(TEXT("%s/SK_%s.SK_%s"), *Folder, *Key, *Key);
    USkeletalMesh* Mesh = LoadObject<USkeletalMesh>(nullptr, *MeshPath);
    if (!Mesh)
    {
        UE_LOG(LogTemp, Error, TEXT("Missing native skeletal mesh for %s: %s"), *NewCharacterId.ToString(), *MeshPath);
        return false;
    }
    TMap<FName, TObjectPtr<UAnimSequence>> NewClips;
    for (const TCHAR* Motion : RequiredMotions)
    {
        const FString Path = FString::Printf(TEXT("%s/A_%s.A_%s"), *Folder, Motion, Motion);
        UAnimSequence* Clip = LoadObject<UAnimSequence>(nullptr, *Path);
        if (!Clip || Clip->GetSkeleton() != Mesh->GetSkeleton())
        {
            UE_LOG(LogTemp, Error, TEXT("Missing or mismatched %s motion for %s: %s"), Motion, *NewCharacterId.ToString(), *Path);
            return false;
        }
        NewClips.Add(FName(Motion), Clip);
    }
    const FString RidePath = FString::Printf(TEXT("%s/A_Ride.A_Ride"), *Folder);
    UAnimSequence* Ride = LoadObject<UAnimSequence>(nullptr, *RidePath);
    if (!Ride || Ride->GetSkeleton() != Mesh->GetSkeleton())
    {
        UE_LOG(LogTemp, Error, TEXT("Missing or mismatched Ride motion for %s: %s"), *NewCharacterId.ToString(), *RidePath);
        return false;
    }
    NewClips.Add(TEXT("Ride"), Ride);
    const FReferenceSkeleton& RefSkeleton = Mesh->GetRefSkeleton();
    if (RefSkeleton.FindBoneIndex(TEXT("LeftHand")) == INDEX_NONE || RefSkeleton.FindBoneIndex(TEXT("RightHand")) == INDEX_NONE ||
        RefSkeleton.FindBoneIndex(TEXT("LeftFoot")) == INDEX_NONE || RefSkeleton.FindBoneIndex(TEXT("RightFoot")) == INDEX_NONE ||
        RefSkeleton.FindBoneIndex(TEXT("Hips")) == INDEX_NONE)
    {
        UE_LOG(LogTemp, Error, TEXT("Imported character %s lacks normalized hands, feet, or pelvis"), *NewCharacterId.ToString());
        return false;
    }
    // RootNode1 exports have a mesh floor offset that must be removed after
    // scaling. Hips-root exports retain the source root translation already;
    // lifting those meshes by their bounds shifts every animated joint above
    // its source position, including the mounted feet.
    const FBoxSphereBounds Bounds = Mesh->GetBounds();
    const float ImportedHeight = Bounds.BoxExtent.Z * 2.f;
    if (!FMath::IsFinite(ImportedHeight) || ImportedHeight < 1.f)
    {
        UE_LOG(LogTemp, Error, TEXT("Invalid imported height for Flow Fest character %s"), *NewCharacterId.ToString());
        return false;
    }
    constexpr float PresentationHeightCm = 190.5f;
    const float BodyScale = PresentationHeightCm / ImportedHeight;
    const float ImportedFloor = Bounds.Origin.Z - Bounds.BoxExtent.Z;
    const FName RootBone = RefSkeleton.GetBoneName(0);
    if (RootBone != TEXT("Hips") && RootBone != TEXT("RootNode1"))
    {
        UE_LOG(LogTemp, Error, TEXT("Unexpected root bone %s for Flow Fest character %s"), *RootBone.ToString(), *NewCharacterId.ToString());
        return false;
    }
    const float FloorLift = RootBone == TEXT("Hips") ? 0.f : -ImportedFloor * BodyScale;
    // FBX's raw lateral X is source lateral X, and raw +Y is source +Z.
    // Actor +X faces source +Z after this yaw; source +X (left hand) is -Y.
    const FQuat Facing = FQuat(FVector::UpVector, -HALF_PI);
    const FTransform Presentation(Facing, FVector(0.f, 0.f, FloorLift), FVector(BodyScale));
    // Commit only after every asset and attachment bone has passed validation.
    CharacterId = NewCharacterId;
    Clips = MoveTemp(NewClips);
    PerformanceClip = nullptr;
    CurrentMotion = NAME_None;
    bWasInAir = false;
    LandingUntil = 0.f;
    TakeoffUntil = 0.f;
    FootCorrectionCm[0] = FootCorrectionCm[1] = 0.f;
    BodyMesh->SetSkeletalMeshAsset(Mesh);
    StandingPresentation = Presentation;
    BodyMesh->SetRelativeTransform(Presentation);
    BodyMesh->SetAnimInstanceClass(UFlowFestAnimInstance::StaticClass());
    UFlowFestAnimInstance* Animator = Cast<UFlowFestAnimInstance>(BodyMesh->GetAnimInstance());
    if (!Animator)
    {
        UE_LOG(LogTemp, Error, TEXT("Flow Fest native animation instance failed for %s"), *CharacterId.ToString());
        return false;
    }
    Animator->Configure(Clips);
    Animator->SetGripSource(BoundProp);
    return PlayMotion(TEXT("Idle"));
}

void UFlowFestAvatarComponent::SetPresentation(bool bVisible, bool bOwnerNoSee)
{
    if (BodyMesh)
    {
        BodyMesh->SetVisibility(bVisible, true);
        BodyMesh->SetOwnerNoSee(bOwnerNoSee);
    }
}

bool UFlowFestAvatarComponent::PlayMotion(FName Motion)
{
    if (!BodyMesh || !BodyMesh->GetSkeletalMeshAsset() || CurrentMotion == Motion)
        return CurrentMotion == Motion;
    const auto* Clip = Clips.Find(Motion);
    if (!Clip || !*Clip)
    {
        UE_LOG(LogTemp, Error, TEXT("Character %s missing required motion %s"), *CharacterId.ToString(), *Motion.ToString());
        return false;
    }
    UFlowFestAnimInstance* Animator = Cast<UFlowFestAnimInstance>(BodyMesh->GetAnimInstance());
    if (!Animator || !Animator->SetMotion(Motion)) return false;
    CurrentMotion = Motion;
    return true;
}

void UFlowFestAvatarComponent::SetMotion(FVector WorldVelocity, bool bInAir, bool bMounted)
{
    if (!BodyMesh || !BodyMesh->GetSkeletalMeshAsset() || PerformanceClip)
        return;
    UFlowFestAnimInstance* Animator = Cast<UFlowFestAnimInstance>(BodyMesh->GetAnimInstance());
    const float Now = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.f;
    if (bMounted)
    {
        // The browser ride performer is 156.21 cm below its standing origin
        // for every deployed rig. The captured bone tracks omit that parent
        // translation, so place the whole skinned body in its mounted frame.
        FTransform MountedPresentation = StandingPresentation;
        MountedPresentation.AddToTranslation(FVector(0.f, 0.f, -156.21f));
        BodyMesh->SetRelativeTransform(MountedPresentation);
        bWasInAir = false;
        PlayMotion(TEXT("Ride"));
        return;
    }
    if (CurrentMotion == TEXT("Ride"))
        BodyMesh->SetRelativeTransform(StandingPresentation);
    if (bInAir)
    {
        LandingUntil = 0.f;
        // Keep takeoff through its authored lift. Descending then crossfades
        // into fall; a brief apex does not reset either one-shot clock.
        if (!bWasInAir)
        {
            const auto* Jump = Clips.Find(TEXT("Jump"));
            const float JumpLength = Jump && *Jump ? (*Jump)->GetPlayLength() : .75f;
            const float TakeoffSourceTime = FMath::Min(JumpTakeoffSourceSeconds, JumpLength * .75f);
            TakeoffUntil = Now + FMath::Max(.1f, JumpLength - TakeoffSourceTime);
            PlayMotion(TEXT("Jump"));
            if (Animator) Animator->SetMotionTime(TEXT("Jump"), TakeoffSourceTime);
        }
        else if (Now >= TakeoffUntil && WorldVelocity.Z < -30.f)
            PlayMotion(TEXT("Fall"));
        bWasInAir = true;
        return;
    }
    if (bWasInAir)
    {
        bWasInAir = false;
        const auto* Land = Clips.Find(TEXT("Land"));
        const float LandLength = Land && *Land ? (*Land)->GetPlayLength() : 0.f;
        const float ContactSourceTime = FMath::Min(LandContactSourceSeconds, LandLength * .75f);
        LandingUntil = Now + FMath::Max(.1f, LandLength - ContactSourceTime);
        PlayMotion(TEXT("Land"));
        if (Animator) Animator->SetMotionTime(TEXT("Land"), ContactSourceTime);
        return;
    }
    if (Now < LandingUntil)
        return;

    const FVector Local = AttachParent ? AttachParent->GetComponentTransform().InverseTransformVectorNoScale(WorldVelocity) : WorldVelocity;
    const float Speed = FVector2D(Local.X, Local.Y).Size();
    // Separation between walk and run thresholds avoids rapid clip toggling.
    const bool bRunning = Speed > (CurrentMotion.ToString().StartsWith(TEXT("Run")) ? 370.f : 430.f);
    FName SelectedMotion;
    if (Speed < (CurrentMotion == TEXT("Idle") ? 20.f : 9.f))
        SelectedMotion = TEXT("Idle");
    else if (Local.X < -FMath::Abs(Local.Y) * .75f)
        SelectedMotion = TEXT("Backward");
    else if (Local.Y < -FMath::Abs(Local.X) * .75f)
        SelectedMotion = bRunning ? FName(TEXT("RunStrafeLeft")) : FName(TEXT("StrafeLeft"));
    else if (Local.Y > FMath::Abs(Local.X) * .75f)
        SelectedMotion = bRunning ? FName(TEXT("RunStrafeRight")) : FName(TEXT("StrafeRight"));
    else
        SelectedMotion = bRunning ? FName(TEXT("Run")) : FName(TEXT("Walk"));
    if (PlayMotion(SelectedMotion) && Animator)
    {
        const float AuthoredSpeed = AuthoredTravelCmPerSecond(SelectedMotion);
        if (AuthoredSpeed > 0.f) Animator->SetMotionRate(SelectedMotion, Speed / AuthoredSpeed);
    }
}

FTransform UFlowFestAvatarComponent::GetHandTransform(bool bLeft) const
{
    if (!BodyMesh || !BodyMesh->GetSkeletalMeshAsset())
        return FTransform::Identity;
    const FName Bone = bLeft ? FName(TEXT("LeftHand")) : FName(TEXT("RightHand"));
    return BodyMesh->GetBoneIndex(Bone) != INDEX_NONE ? BodyMesh->GetSocketTransform(Bone, RTS_World) : FTransform::Identity;
}

FName UFlowFestAvatarComponent::ResolvePerformanceProfile(FName PropId, int32 Variant)
{
    FString Family = PropId.ToString().ToLower();
    int32 Colon = INDEX_NONE;
    if (Family.FindChar(TEXT(':'), Colon)) Family.LeftInline(Colon);
    if (Family.IsEmpty()) return NAME_None;
    for (const TCHAR Letter : Family)
        if (!FChar::IsAlnum(Letter) && Letter != TEXT('_')) return NAME_None;
    return FName(*FString::Printf(TEXT("P_%s_%c"), *Family, Variant % 2 == 0 ? TEXT('A') : TEXT('B')));
}

bool UFlowFestAvatarComponent::PlayPerformance(FName Profile, bool bLoop)
{
    const FString Name = Profile.ToString();
    bool bValidName = !Name.IsEmpty();
    for (int32 Index = 0; Index < Name.Len(); ++Index)
        bValidName &= FChar::IsAlnum(Name[Index]) || Name[Index] == TEXT('_');
    if (!bValidName || !BodyMesh || !BodyMesh->GetSkeletalMeshAsset())
        return false;
    const FString Path = FString::Printf(TEXT("%s/A_Flow_%s.A_Flow_%s"), *CharacterFolder(), *Name, *Name);
    UAnimSequence* Clip = LoadObject<UAnimSequence>(nullptr, *Path);
    if (!Clip || Clip->GetSkeleton() != BodyMesh->GetSkeletalMeshAsset()->GetSkeleton())
    {
        UE_LOG(LogTemp, Error, TEXT("Missing per-character performance clip %s for %s"), *Path, *CharacterId.ToString());
        return false;
    }
    PerformanceClip = Clip;
    BodyMesh->SetRelativeTransform(StandingPresentation);
    UFlowFestAnimInstance* Animator = Cast<UFlowFestAnimInstance>(BodyMesh->GetAnimInstance());
    if (!Animator) return false;
    Animator->StartPerformance(Clip, bLoop, Profile);
    CurrentMotion = NAME_None;
    return true;
}

void UFlowFestAvatarComponent::StopPerformance()
{
    PerformanceClip = nullptr;
    CurrentMotion = NAME_None;
    if (UFlowFestAnimInstance* Animator = BodyMesh ? Cast<UFlowFestAnimInstance>(BodyMesh->GetAnimInstance()) : nullptr)
        Animator->StopPerformance();
    if (BodyMesh)
        BodyMesh->SetRelativeTransform(StandingPresentation);
    PlayMotion(TEXT("Idle"));
}

float UFlowFestAvatarComponent::GetPerformanceTime() const
{
    const UFlowFestAnimInstance* Animator = BodyMesh ? Cast<UFlowFestAnimInstance>(BodyMesh->GetAnimInstance()) : nullptr;
    return PerformanceClip && Animator ? Animator->GetPerformanceTime() : 0.f;
}

float UFlowFestAvatarComponent::GetPerformanceLength() const
{
    return PerformanceClip ? PerformanceClip->GetPlayLength() : 0.f;
}

FName UFlowFestAvatarComponent::GetPerformanceProfile() const
{
    const UFlowFestAnimInstance* Animator = BodyMesh ? Cast<UFlowFestAnimInstance>(BodyMesh->GetAnimInstance()) : nullptr;
    return PerformanceClip && Animator ? Animator->GetPerformanceProfile() : NAME_None;
}

float UFlowFestAvatarComponent::GetPerformancePhase() const
{
    const float Length = GetPerformanceLength();
    return Length > SMALL_NUMBER ? GetPerformanceTime() / Length : 0.f;
}

void UFlowFestAvatarComponent::SetPerformancePhase(float NormalizedPhase)
{
    if (UFlowFestAnimInstance* Animator = BodyMesh ? Cast<UFlowFestAnimInstance>(BodyMesh->GetAnimInstance()) : nullptr)
        Animator->SetPerformancePhase(NormalizedPhase);
}

void UFlowFestAvatarComponent::SetPerformanceRate(float Rate)
{
    if (UFlowFestAnimInstance* Animator = BodyMesh ? Cast<UFlowFestAnimInstance>(BodyMesh->GetAnimInstance()) : nullptr)
        Animator->SetPerformanceRate(Rate);
}

void UFlowFestAvatarComponent::SetPerformancePaused(bool bPaused)
{
    if (UFlowFestAnimInstance* Animator = BodyMesh ? Cast<UFlowFestAnimInstance>(BodyMesh->GetAnimInstance()) : nullptr)
        Animator->SetPerformancePaused(bPaused);
}

bool UFlowFestAvatarComponent::IsPerformancePaused() const
{
    const UFlowFestAnimInstance* Animator = BodyMesh ? Cast<UFlowFestAnimInstance>(BodyMesh->GetAnimInstance()) : nullptr;
    return Animator && Animator->IsPerformancePaused();
}

void UFlowFestAvatarComponent::SeekPerformance(float Seconds)
{
    if (UFlowFestAnimInstance* Animator = BodyMesh ? Cast<UFlowFestAnimInstance>(BodyMesh->GetAnimInstance()) : nullptr)
        Animator->SeekPerformance(Seconds);
}

float UFlowFestAvatarComponent::GetPerformanceRate() const
{
    const UFlowFestAnimInstance* Animator = BodyMesh ? Cast<UFlowFestAnimInstance>(BodyMesh->GetAnimInstance()) : nullptr;
    return Animator ? Animator->GetPerformanceRate() : 1.f;
}

void UFlowFestAvatarComponent::RestartPerformance()
{
    if (UFlowFestAnimInstance* Animator = BodyMesh ? Cast<UFlowFestAnimInstance>(BodyMesh->GetAnimInstance()) : nullptr)
        Animator->RestartPerformance();
}

void UFlowFestAvatarComponent::BindPerformanceProp(UFlowFestPropComponent* Prop)
{
    if (Prop && Prop->GetOwner() != GetOwner()) return;
    BoundProp = Prop;
    if (UFlowFestAnimInstance* Animator = BodyMesh ? Cast<UFlowFestAnimInstance>(BodyMesh->GetAnimInstance()) : nullptr)
        Animator->SetGripSource(Prop);
}

void UFlowFestAvatarComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
    if (BodyMesh && GetWorld())
    {
        const bool bGroundedMotion = !PerformanceClip && !bWasInAir &&
            CurrentMotion != TEXT("Ride") && CurrentMotion != TEXT("Jump") && CurrentMotion != TEXT("Fall");
        FCollisionQueryParams Query(SCENE_QUERY_STAT(FlowFestFooting), false, GetOwner());
        FVector FootLocations[2] = {FVector::ZeroVector, FVector::ZeroVector};
        float FootGapsCm[2] = {TNumericLimits<float>::Max(), TNumericLimits<float>::Max()};
        for (int32 Side = 0; Side < 2; ++Side)
        {
            float Target = 0.f;
            const FName Bone = Side == 0 ? FName(TEXT("LeftFoot")) : FName(TEXT("RightFoot"));
            const FVector Foot = BodyMesh->GetSocketLocation(Bone);
            FootLocations[Side] = Foot;
            if (bGroundedMotion)
            {
                FHitResult Hit;
                if (GetWorld()->LineTraceSingleByChannel(Hit, Foot + FVector(0, 0, 35.f),
                    Foot - FVector(0, 0, 85.f), ECC_Visibility, Query))
                {
                    const float Gap = Foot.Z - Hit.ImpactPoint.Z;
                    FootGapsCm[Side] = Gap;
                    const float Contact = 1.f - FMath::SmoothStep(12.f, 32.f, Gap);
                    Target = FMath::Clamp((Hit.ImpactPoint.Z + 8.f - Foot.Z) * Contact, -12.f, 14.f);
                }
            }
            const float Alpha = 1.f - FMath::Exp(-FMath::Clamp(DeltaTime, 0.f, .1f) / .1f);
            FootCorrectionCm[Side] = FMath::Lerp(FootCorrectionCm[Side], Target, Alpha);
        }
        if (UFlowFestAnimInstance* Animator = Cast<UFlowFestAnimInstance>(BodyMesh->GetAnimInstance()))
            Animator->SetFootCorrection(FootCorrectionCm[0], FootCorrectionCm[1]);
        if (Footsteps) Footsteps->Evaluate(DeltaTime, CurrentMotion, bGroundedMotion,
            BodyMesh->IsVisible(), FootLocations, FootGapsCm);
    }
    if (BoundProp && PerformanceClip)
    {
        if (const UFlowFestAnimInstance* Animator = Cast<UFlowFestAnimInstance>(BodyMesh->GetAnimInstance()))
            BoundProp->SetPerformanceTime(Animator->GetPerformanceTime(), Animator->GetPerformanceWeight(), Animator);
    }
}
