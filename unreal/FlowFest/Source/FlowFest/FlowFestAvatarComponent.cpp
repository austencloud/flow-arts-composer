#include "FlowFestAvatarComponent.h"

#include "Animation/AnimSequence.h"
#include "Components/SceneComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/World.h"
#include "ReferenceSkeleton.h"
#include "UObject/UObjectGlobals.h"

namespace
{
constexpr const TCHAR* RequiredMotions[] = {
    TEXT("Idle"), TEXT("Walk"), TEXT("Run"), TEXT("Jump"), TEXT("Fall"), TEXT("Land"),
    TEXT("Backward"), TEXT("StrafeLeft"), TEXT("StrafeRight"),
    TEXT("RunStrafeLeft"), TEXT("RunStrafeRight")
};

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
    PrimaryComponentTick.bCanEverTick = false;
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
    }
    else
    {
        BodyMesh->AttachToComponent(Parent, FAttachmentTransformRules::SnapToTargetNotIncludingScale);
    }
    SetCharacter(InitialCharacterId);
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
    // Avatar3D.setHeight uses the original mesh bounds and lifts its lowest point
    // to the floor. The FBX exporter also shifts the foot bone, so use the
    // imported mesh bounds here to avoid carrying that intermediate offset.
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
    // FBX's raw lateral X is source lateral X, and raw +Y is source +Z.
    // Actor +X faces source +Z after this yaw; source +X (left hand) is -Y.
    const FQuat Facing = FQuat(FVector::UpVector, -HALF_PI);
    const FTransform Presentation(Facing, FVector(0.f, 0.f, -ImportedFloor * BodyScale), FVector(BodyScale));
    // Commit only after every asset and attachment bone has passed validation.
    CharacterId = NewCharacterId;
    Clips = MoveTemp(NewClips);
    PerformanceClip = nullptr;
    CurrentMotion = NAME_None;
    bWasInAir = false;
    LandingUntil = 0.f;
    BodyMesh->SetSkeletalMeshAsset(Mesh);
    BodyMesh->SetRelativeTransform(Presentation);
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
    const bool bLoop = Motion != TEXT("Jump") && Motion != TEXT("Land");
    BodyMesh->PlayAnimation(*Clip, bLoop);
    CurrentMotion = Motion;
    return true;
}

void UFlowFestAvatarComponent::SetMotion(FVector WorldVelocity, bool bInAir, bool bMounted)
{
    if (!BodyMesh || !BodyMesh->GetSkeletalMeshAsset() || PerformanceClip)
        return;
    const float Now = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.f;
    if (bMounted)
    {
        bWasInAir = false;
        PlayMotion(TEXT("Ride"));
        return;
    }
    if (bInAir)
    {
        LandingUntil = 0.f;
        // The authored takeoff plays once; airborne fall then holds until landing.
        if (!bWasInAir) PlayMotion(TEXT("Jump"));
        else if (WorldVelocity.Z < -30.f) PlayMotion(TEXT("Fall"));
        bWasInAir = true;
        return;
    }
    if (bWasInAir)
    {
        bWasInAir = false;
        const auto* Land = Clips.Find(TEXT("Land"));
        LandingUntil = Now + (Land && *Land ? (*Land)->GetPlayLength() : 0.f);
        PlayMotion(TEXT("Land"));
        return;
    }
    if (Now < LandingUntil)
        return;

    const FVector Local = AttachParent ? AttachParent->GetComponentTransform().InverseTransformVectorNoScale(WorldVelocity) : WorldVelocity;
    const float Speed = FVector2D(Local.X, Local.Y).Size();
    // Separation between walk and run thresholds avoids rapid clip toggling.
    const bool bRunning = Speed > (CurrentMotion.ToString().StartsWith(TEXT("Run")) ? 370.f : 430.f);
    if (Speed < (CurrentMotion == TEXT("Idle") ? 20.f : 9.f))
        PlayMotion(TEXT("Idle"));
    else if (Local.X < -FMath::Abs(Local.Y) * .75f)
        PlayMotion(TEXT("Backward"));
    else if (Local.Y < -FMath::Abs(Local.X) * .75f)
        PlayMotion(bRunning ? TEXT("RunStrafeLeft") : TEXT("StrafeLeft"));
    else if (Local.Y > FMath::Abs(Local.X) * .75f)
        PlayMotion(bRunning ? TEXT("RunStrafeRight") : TEXT("StrafeRight"));
    else
        PlayMotion(bRunning ? TEXT("Run") : TEXT("Walk"));
}

FTransform UFlowFestAvatarComponent::GetHandTransform(bool bLeft) const
{
    if (!BodyMesh || !BodyMesh->GetSkeletalMeshAsset())
        return FTransform::Identity;
    const FName Bone = bLeft ? FName(TEXT("LeftHand")) : FName(TEXT("RightHand"));
    return BodyMesh->GetBoneIndex(Bone) != INDEX_NONE ? BodyMesh->GetSocketTransform(Bone, RTS_World) : FTransform::Identity;
}

bool UFlowFestAvatarComponent::PlayPerformance(FName Profile, bool bLoop)
{
    const FString Name = Profile.ToString();
    bool bValidName = !Name.IsEmpty();
    for (int32 Index = 0; Index < Name.Len(); ++Index)
        bValidName &= FChar::IsAlnum(Name[Index]);
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
    BodyMesh->PlayAnimation(Clip, bLoop);
    CurrentMotion = NAME_None;
    return true;
}

void UFlowFestAvatarComponent::StopPerformance()
{
    PerformanceClip = nullptr;
    CurrentMotion = NAME_None;
    PlayMotion(TEXT("Idle"));
}

float UFlowFestAvatarComponent::GetPerformanceTime() const
{
    return PerformanceClip && BodyMesh ? BodyMesh->GetPosition() : 0.f;
}
