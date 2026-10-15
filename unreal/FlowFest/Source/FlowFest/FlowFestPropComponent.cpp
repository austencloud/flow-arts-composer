#include "FlowFestPropComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/SceneComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "ProceduralMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInterface.h"
#include "HAL/PlatformFileManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Dom/JsonObject.h"
#include "Engine/World.h"

namespace
{
TSharedPtr<FJsonObject> LoadPropCatalog()
{
    FString Text;
    const FString Path = FPaths::ProjectContentDir() / TEXT("Data/props.json");
    if (!FFileHelper::LoadFileToString(Text, *Path))
    {
        UE_LOG(LogTemp, Error, TEXT("Flow Fest prop catalog missing: %s"), *Path);
        return nullptr;
    }
    TSharedPtr<FJsonObject> Root;
    if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Root) || !Root.IsValid())
    {
        UE_LOG(LogTemp, Error, TEXT("Flow Fest prop catalog invalid: %s"), *Path);
        return nullptr;
    }
    return Root;
}

const TSharedPtr<FJsonObject> FindProp(const TSharedPtr<FJsonObject>& Catalog, const FString& Id)
{
    if (!Catalog.IsValid()) return nullptr;
    const TArray<TSharedPtr<FJsonValue>>* Props = nullptr;
    if (!Catalog->TryGetArrayField(TEXT("props"), Props)) return nullptr;
    for (const TSharedPtr<FJsonValue>& Entry : *Props)
    {
        const TSharedPtr<FJsonObject> Object = Entry->AsObject();
        if (Object.IsValid() && Object->GetStringField(TEXT("id")) == Id) return Object;
    }
    return nullptr;
}

const TSharedPtr<FJsonObject> FindVariant(const TSharedPtr<FJsonObject>& Prop, const FString& VariantId)
{
    if (!Prop.IsValid()) return nullptr;
    const TArray<TSharedPtr<FJsonValue>>* Variants = nullptr;
    if (!Prop->TryGetArrayField(TEXT("variants"), Variants)) return nullptr;
    for (const TSharedPtr<FJsonValue>& Entry : *Variants)
    {
        const TSharedPtr<FJsonObject> Object = Entry->AsObject();
        if (Object.IsValid() && Object->GetStringField(TEXT("id")) == VariantId) return Object;
    }
    return nullptr;
}

UProceduralMeshComponent* AddFlame(AActor* Owner, USceneComponent* Root, const FVector& Location)
{
    UMaterialInterface* Material = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/FlowFest/Materials/M_FireFlame.M_FireFlame"));
    if (!Material) return nullptr;
    UProceduralMeshComponent* Mesh = NewObject<UProceduralMeshComponent>(Owner);
    Mesh->SetupAttachment(Root);
    Mesh->SetRelativeLocation(Location);
    if (!Location.IsNearlyZero())
        Mesh->SetRelativeRotation(FQuat::FindBetweenNormals(FVector::YAxisVector, Location.GetSafeNormal()));
    Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Mesh->SetCastShadow(false);
    TArray<FVector> Vertices;
    TArray<int32> Triangles;
    TArray<FVector> Normals;
    TArray<FVector2D> UVs;
    TArray<FLinearColor> Colors;
    for (int32 Plane = 0; Plane < 2; ++Plane)
    {
        const FVector Across = Plane == 0 ? FVector::ForwardVector : FVector::UpVector;
        const FVector Normal = Plane == 0 ? FVector::UpVector : FVector::ForwardVector;
        const int32 Start = Vertices.Num();
        Vertices.Append({-Across * 3.5f, Across * 3.5f,
            -Across * 3.5f + FVector(0, 12.f, 0), Across * 3.5f + FVector(0, 12.f, 0)});
        Triangles.Append({Start, Start + 2, Start + 1, Start + 1, Start + 2, Start + 3});
        for (int32 I = 0; I < 4; ++I) { Normals.Add(Normal); Colors.Add(FLinearColor::White); }
        UVs.Append({FVector2D(0, 0), FVector2D(1, 0), FVector2D(0, 1), FVector2D(1, 1)});
    }
    TArray<FProcMeshTangent> Tangents;
    Mesh->CreateMeshSection_LinearColor(0, Vertices, Triangles, Normals, UVs, Colors, Tangents, false);
    Mesh->SetMaterial(0, Material);
    if (UMaterialInterface* Sparks = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/FlowFest/Materials/M_FireSparks.M_FireSparks")))
    {
        TArray<FVector> SparkVertices = Vertices;
        for (FVector& Vertex : SparkVertices) Vertex.Y *= 1.5f;
        Mesh->CreateMeshSection_LinearColor(1, SparkVertices, Triangles, Normals, UVs, Colors, Tangents, false);
        Mesh->SetMaterial(1, Sparks);
    }
    Mesh->RegisterComponent();
    return Mesh;
}

UStaticMeshComponent* AddLED(AActor* Owner, USceneComponent* Root, const FVector& Location)
{
    UStaticMesh* Sphere = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Sphere.Sphere"));
    UMaterialInterface* Material = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/FlowFest/Props/M_PropLED.M_PropLED"));
    if (!Sphere || !Material) return nullptr;
    UStaticMeshComponent* Mesh = NewObject<UStaticMeshComponent>(Owner);
    Mesh->SetupAttachment(Root);
    Mesh->SetStaticMesh(Sphere);
    Mesh->SetMaterial(0, Material);
    Mesh->SetRelativeLocation(Location);
    Mesh->SetRelativeScale3D(FVector(.032f));
    Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Mesh->SetCastShadow(false);
    Mesh->RegisterComponent();
    return Mesh;
}
}

UFlowFestPropComponent::UFlowFestPropComponent()
{
    PrimaryComponentTick.bCanEverTick = true;
    PrimaryComponentTick.TickGroup = TG_PostUpdateWork;
}

void UFlowFestPropComponent::Initialize(USceneComponent* Parent)
{
    if (!Parent || LeftRoot || !GetOwner()) return;
    AvatarRoot = Parent;
    auto CreateRoot = [this, Parent](const TCHAR* Name)
    {
        USceneComponent* Root = NewObject<USceneComponent>(GetOwner(), Name);
        Root->SetupAttachment(Parent);
        Root->RegisterComponent();
        return Root;
    };
    auto CreateMesh = [this](const TCHAR* Name, USceneComponent* Root)
    {
        UStaticMeshComponent* Mesh = NewObject<UStaticMeshComponent>(GetOwner(), Name);
        Mesh->SetupAttachment(Root);
        Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        Mesh->SetCastShadow(true);
        Mesh->RegisterComponent();
        return Mesh;
    };
    LeftRoot = CreateRoot(TEXT("FlowFestLeftPropRoot"));
    RightRoot = CreateRoot(TEXT("FlowFestRightPropRoot"));
    // Wrist positions follow the scaled character, but the physical props
    // retain their authored centimeter dimensions across normalized rigs.
    LeftRoot->SetAbsolute(false, false, true);
    RightRoot->SetAbsolute(false, false, true);
    LeftMesh = CreateMesh(TEXT("FlowFestLeftPropMesh"), LeftRoot);
    RightMesh = CreateMesh(TEXT("FlowFestRightPropMesh"), RightRoot);
    SetVisible(bVisible);
}

bool UFlowFestPropComponent::BindHands(USkeletalMeshComponent* BodyMesh)
{
    if (!BodyMesh || !LeftRoot || !RightRoot || !BodyMesh->GetSkeletalMeshAsset()) return false;
    if (BodyMesh->GetBoneIndex(TEXT("LeftHand")) == INDEX_NONE ||
        BodyMesh->GetBoneIndex(TEXT("RightHand")) == INDEX_NONE ||
        BodyMesh->GetBoneIndex(TEXT("LeftHandMiddle1")) == INDEX_NONE ||
        BodyMesh->GetBoneIndex(TEXT("RightHandMiddle1")) == INDEX_NONE) return false;
    auto Grip = [BodyMesh](FName HandName, FName FingerName, FQuat& Basis, FVector& Offset)
    {
        const FTransform Hand = BodyMesh->GetSocketTransform(HandName, RTS_World);
        const FVector FingerWorld = BodyMesh->GetSocketLocation(FingerName);
        const FVector FingerLocal = Hand.InverseTransformPosition(FingerWorld);
        if (FingerLocal.IsNearlyZero()) return false;
        // The authored prop axis is +Y. Aim it along the actual palm/finger
        // direction, using this rig's hand basis rather than the wrist quaternion.
        Basis = FQuat::FindBetweenNormals(FVector::YAxisVector, FingerLocal.GetSafeNormal());
        Offset = FingerLocal * .4f; // hold within the palm, past the wrist joint
        return true;
    };
    FQuat NewLeftBasis, NewRightBasis;
    FVector NewLeftOffset, NewRightOffset;
    if (!Grip(TEXT("LeftHand"), TEXT("LeftHandMiddle1"), NewLeftBasis, NewLeftOffset) ||
        !Grip(TEXT("RightHand"), TEXT("RightHandMiddle1"), NewRightBasis, NewRightOffset)) return false;
    LeftRoot->AttachToComponent(BodyMesh, FAttachmentTransformRules::SnapToTargetNotIncludingScale, TEXT("LeftHand"));
    RightRoot->AttachToComponent(BodyMesh, FAttachmentTransformRules::SnapToTargetNotIncludingScale, TEXT("RightHand"));
    BoundBodyMesh = BodyMesh;
    AddTickPrerequisiteComponent(BodyMesh);
    bPerformancePose = false;
    bEnteringPerformance = false;
    bReturningToHands = false;
    LeftGripBasis = NewLeftBasis;
    RightGripBasis = NewRightBasis;
    LeftGripOffset = NewLeftOffset;
    RightGripOffset = NewRightOffset;
    UpdatePose();
    return true;
}

bool UFlowFestPropComponent::IsReady() const
{
    return LeftRoot && RightRoot && LeftMesh && RightMesh && LeftMesh->GetStaticMesh() && RightMesh->GetStaticMesh();
}

bool UFlowFestPropComponent::Equip(FName PropId, float LengthCm)
{
    if (!LeftRoot || !RightRoot) return false;
    FString Id = PropId.ToString().ToLower();
    FString Variant = TEXT("default");
    if (int32 Colon = INDEX_NONE; Id.FindChar(TEXT(':'), Colon))
    {
        Variant = Id.Mid(Colon + 1);
        Id.LeftInline(Colon);
    }
    const TSharedPtr<FJsonObject> Prop = FindProp(LoadPropCatalog(), Id);
    if (!Prop.IsValid())
    {
        UE_LOG(LogTemp, Warning, TEXT("Unknown physical prop: %s"), *Id);
        return false;
    }
    if (Variant == TEXT("default"))
    {
        if (Id == TEXT("fan") || Id == TEXT("bigfan")) Variant = TEXT("pictograph");
        else if (Id == TEXT("triad") || Id == TEXT("bigtriad") || Id == TEXT("quiad")) Variant = TEXT("fire");
        else if (Id == TEXT("triangle")) Variant = TEXT("corner");
        else if (Id == TEXT("buugeng") || Id == TEXT("bigbuugeng")) Variant = TEXT("matching-a");
    }
    const TSharedPtr<FJsonObject> Build = FindVariant(Prop, Variant);
    if (!Build.IsValid())
    {
        UE_LOG(LogTemp, Warning, TEXT("Unknown %s prop variant: %s"), *Id, *Variant);
        return false;
    }
    const FString LeftPath = Build->GetStringField(TEXT("mesh"));
    UStaticMesh* LeftAsset = LoadObject<UStaticMesh>(nullptr, *LeftPath);
    if (!LeftAsset)
    {
        UE_LOG(LogTemp, Error, TEXT("Prop mesh not imported: %s"), *LeftPath);
        return false;
    }
    FString RightPath;
    Build->TryGetStringField(TEXT("rightMesh"), RightPath);
    UStaticMesh* RightAsset = RightPath.IsEmpty() ? LeftAsset : LoadObject<UStaticMesh>(nullptr, *RightPath);
    if (!RightAsset) return false;
    LeftMesh->SetStaticMesh(LeftAsset);
    RightMesh->SetStaticMesh(RightAsset);
    double AuthoredLength = 0;
    Prop->TryGetNumberField(TEXT("authoredLengthCm"), AuthoredLength);
    bool bAdjustable = false;
    Prop->TryGetBoolField(TEXT("lengthAdjustable"), bAdjustable);
    const float LongScale = bAdjustable && LengthCm > 0.f && AuthoredLength > 0 ? FMath::Clamp(LengthCm / static_cast<float>(AuthoredLength), .1f, 5.f) : 1.f;
    // Avatar import maps source X to UE -Y. Mirror the baked prop's numeric
    // X axis once so the sampled root rotation remains a proper quaternion.
    LeftMesh->SetRelativeScale3D(FVector(-1.f, LongScale, 1.f));
    RightMesh->SetRelativeScale3D(FVector(-1.f, LongScale, 1.f));
    for (UPointLightComponent* Light : LeftEffectLights) if (Light) Light->DestroyComponent();
    for (UPointLightComponent* Light : RightEffectLights) if (Light) Light->DestroyComponent();
    for (UProceduralMeshComponent* Flame : LeftFlames) if (Flame) Flame->DestroyComponent();
    for (UProceduralMeshComponent* Flame : RightFlames) if (Flame) Flame->DestroyComponent();
    for (UStaticMeshComponent* LED : LeftLEDs) if (LED) LED->DestroyComponent();
    for (UStaticMeshComponent* LED : RightLEDs) if (LED) LED->DestroyComponent();
    LeftEffectLights.Empty();
    RightEffectLights.Empty();
    LeftFlames.Empty();
    RightFlames.Empty();
    LeftLEDs.Empty();
    RightLEDs.Empty();
    const TArray<TSharedPtr<FJsonValue>>* Effects = nullptr;
    if (Build->TryGetArrayField(TEXT("effectAttachments"), Effects) && Effects)
    {
        for (int32 Index = 0; Index < Effects->Num(); ++Index)
        {
            const TSharedPtr<FJsonObject> Effect = (*Effects)[Index]->AsObject();
            const TArray<TSharedPtr<FJsonValue>>* Offset = nullptr;
            if (!Effect.IsValid() || !Effect->TryGetArrayField(TEXT("offsetCm"), Offset) || !Offset || Offset->Num() != 3) continue;
            const FVector Location(-(*Offset)[0]->AsNumber(), (*Offset)[1]->AsNumber() * LongScale, (*Offset)[2]->AsNumber());
            auto AddLight = [this, Location](USceneComponent* Root)
            {
                UPointLightComponent* Light = NewObject<UPointLightComponent>(GetOwner());
                Light->SetupAttachment(Root);
                Light->SetRelativeLocation(Location);
                Light->SetAttenuationRadius(150.f);
                Light->SetIntensity(0.f);
                Light->RegisterComponent();
                return Light;
            };
            LeftEffectLights.Add(AddLight(LeftRoot));
            RightEffectLights.Add(AddLight(RightRoot));
            LeftFlames.Add(AddFlame(GetOwner(), LeftRoot, Location));
            RightFlames.Add(AddFlame(GetOwner(), RightRoot, Location));
            LeftLEDs.Add(AddLED(GetOwner(), LeftRoot, Location));
            RightLEDs.Add(AddLED(GetOwner(), RightRoot, Location));
        }
    }
    EquippedPropId = PropId;
    if (Effects && !Effects->IsEmpty())
    {
        const TSharedPtr<FJsonObject> First = (*Effects)[0]->AsObject();
        DefaultFinish = First.IsValid() ? FName(*First->GetStringField(TEXT("type"))) : NAME_None;
    }
    else DefaultFinish = NAME_None;
    EffectFinish = DefaultFinish;
    UpdateEffects();
    SetVisible(bVisible);
    UpdatePose();
    return true;
}

void UFlowFestPropComponent::SetHandTransforms(FTransform Left, FTransform Right)
{
    LeftHand = Left;
    RightHand = Right;
    UpdatePose();
}

void UFlowFestPropComponent::SetPerformanceTransforms(const FTransform& LeftLocalToAvatarRoot, const FTransform& RightLocalToAvatarRoot, float PoseWeight)
{
    if (!AvatarRoot || !LeftRoot || !RightRoot) return;
    if (!bPerformancePose)
    {
        LeftRoot->AttachToComponent(AvatarRoot, FAttachmentTransformRules::KeepWorldTransform);
        RightRoot->AttachToComponent(AvatarRoot, FAttachmentTransformRules::KeepWorldTransform);
        bPerformancePose = true;
        bReturningToHands = false;
        bEnteringPerformance = true;
        TransitionStart = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.f;
        TransitionLeft = LeftRoot->GetRelativeTransform();
        TransitionRight = RightRoot->GetRelativeTransform();
    }
    // The body clip is blended in skeletal pose space. Use that exact blend
    // weight for held props so a transition does not send a prop along its
    // captured orbit while the wrist is still in the previous body pose.
    const float Alpha = FMath::Clamp(PoseWeight, 0.f, 1.f);
    FTransform Left = LeftLocalToAvatarRoot, Right = RightLocalToAvatarRoot;
    if (bSwitchingPerformance && Alpha < .999f)
    {
        // A routine change can happen immediately after ClearPerformanceTransforms.
        // Hold the visible prop pose from that instant while the new body clip
        // fades in, even if the hand attachment moved during the mesh tick.
        Left.Blend(SwitchLeft, LeftLocalToAvatarRoot, Alpha);
        Right.Blend(SwitchRight, RightLocalToAvatarRoot, Alpha);
        bEnteringPerformance = true;
    }
    else if (BoundBodyMesh && Alpha < .999f)
    {
        const FQuat Spin = bSpin ? FQuat(FVector::UpVector, SpinPhase) : FQuat::Identity;
        const auto Natural = [this, Spin](FName HandName, const FQuat& Basis, const FVector& Offset)
        {
            const FTransform Hand = BoundBodyMesh->GetSocketTransform(HandName, RTS_World);
            const FTransform World(Hand.GetRotation() * Basis * Spin, Hand.TransformPosition(Offset));
            return World.GetRelativeTransform(AvatarRoot->GetComponentTransform());
        };
        Left.Blend(Natural(TEXT("LeftHand"), LeftGripBasis, LeftGripOffset), LeftLocalToAvatarRoot, Alpha);
        Right.Blend(Natural(TEXT("RightHand"), RightGripBasis, RightGripOffset), RightLocalToAvatarRoot, Alpha);
        bEnteringPerformance = true;
    }
    else bEnteringPerformance = false;
    if (Alpha >= .999f) bSwitchingPerformance = false;
    LeftRoot->SetRelativeTransform(Left);
    RightRoot->SetRelativeTransform(Right);
}

void UFlowFestPropComponent::ClearPerformanceTransforms()
{
    if (!bPerformancePose) return;
    bPerformancePose = false;
    bEnteringPerformance = false;
    GripErrorCm = 0.f;
    PeakGripErrorCm = 0.f;
    PropAnchorErrorCm = 0.f;
    PeakPropAnchorErrorCm = 0.f;
    GripSampleCount = 0;
    if (BoundBodyMesh)
    {
        LeftRoot->AttachToComponent(BoundBodyMesh, FAttachmentTransformRules::KeepWorldTransform, TEXT("LeftHand"));
        RightRoot->AttachToComponent(BoundBodyMesh, FAttachmentTransformRules::KeepWorldTransform, TEXT("RightHand"));
        TransitionLeft = LeftRoot->GetRelativeTransform();
        TransitionRight = RightRoot->GetRelativeTransform();
        TransitionStart = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.f;
        bReturningToHands = true;
    }
}

void UFlowFestPropComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
    if (!bReturningToHands || !LeftRoot || !RightRoot) return;
    const float Alpha = FMath::Clamp(((GetWorld() ? GetWorld()->GetTimeSeconds() : TransitionStart) - TransitionStart) / .18f, 0.f, 1.f);
    FTransform Left, Right;
    Left.Blend(TransitionLeft, FTransform(LeftGripBasis, LeftGripOffset), Alpha);
    Right.Blend(TransitionRight, FTransform(RightGripBasis, RightGripOffset), Alpha);
    LeftRoot->SetRelativeTransform(Left);
    RightRoot->SetRelativeTransform(Right);
    if (Alpha >= 1.f) bReturningToHands = false;
}

bool UFlowFestPropComponent::LoadPerformance(FName CharacterId, FName Profile)
{
    // A motion capture is valid only for the exact prop family it was made
    // with. Variant meshes share that family's grip and trajectory contract.
    FString EquippedFamily = EquippedPropId.ToString().ToLower();
    int32 Colon = INDEX_NONE;
    if (EquippedFamily.FindChar(TEXT(':'), Colon)) EquippedFamily.LeftInline(Colon);
    if (EquippedFamily.IsEmpty()) return false;
    FString Character = CharacterId.ToString();
    Character.ReplaceInline(TEXT("-"), TEXT("_"));
    const FString Path = FPaths::ProjectContentDir() / TEXT("Data/PropMotion") /
        FString::Printf(TEXT("%s_%s.json"), *Character, *Profile.ToString());
    FString Text;
    TSharedPtr<FJsonObject> Root;
    if (!FFileHelper::LoadFileToString(Text, *Path) ||
        !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Root) || !Root.IsValid())
    {
        UE_LOG(LogTemp, Warning, TEXT("Flow Fest prop motion unavailable: %s"), *Path);
        return false;
    }
    FString Schema;
    FString CapturedCharacter, CapturedProfile;
    double Fps = 0;
    const TArray<TSharedPtr<FJsonValue>>* Frames = nullptr;
    FString CapturedFamily;
    if (!Root->TryGetStringField(TEXT("schema"), Schema) ||
        (Schema != TEXT("flow-fest-prop-motion-v1") && Schema != TEXT("flow-fest-prop-motion-v2")) ||
        (Schema == TEXT("flow-fest-prop-motion-v2") &&
            (!Root->TryGetStringField(TEXT("character"), CapturedCharacter) ||
             !Root->TryGetStringField(TEXT("profile"), CapturedProfile) ||
             CapturedCharacter != CharacterId.ToString() || CapturedProfile != Profile.ToString())) ||
        !Root->TryGetStringField(TEXT("propId"), CapturedFamily) ||
        !CapturedFamily.Equals(EquippedFamily, ESearchCase::IgnoreCase) ||
        !Root->TryGetNumberField(TEXT("fps"), Fps) || Fps <= 0 ||
        !Root->TryGetArrayField(TEXT("frames"), Frames) || !Frames || Frames->IsEmpty())
    {
        UE_LOG(LogTemp, Warning, TEXT("Flow Fest prop performance mismatch: %s needs %s"), *Path, *EquippedFamily);
        return false;
    }
    const bool bGrip = Schema == TEXT("flow-fest-prop-motion-v2");
    double SourceFrameCount = 0;
    if (bGrip && (!Root->TryGetNumberField(TEXT("sourceFrameCount"), SourceFrameCount) ||
        SourceFrameCount != Frames->Num() || Fps != 30.0 || Frames->Num() != 480))
        return false;
    TArray<FPropMotionFrame> Parsed;
    Parsed.Reserve(Frames->Num());
    for (const TSharedPtr<FJsonValue>& Entry : *Frames)
    {
        const TArray<TSharedPtr<FJsonValue>>* Values = nullptr;
        if (!Entry.IsValid() || !Entry->TryGetArray(Values) || !Values || Values->Num() != (bGrip ? 20 : 14))
            return false;
        double N[20]{};
        for (int32 I = 0; I < Values->Num(); ++I)
        {
            if (!(*Values)[I].IsValid() || !(*Values)[I]->TryGetNumber(N[I]) || !FMath::IsFinite(N[I]))
                return false;
        }
        auto Transform = [&N](int32 Offset)
        {
            FQuat Rotation(N[Offset+3], N[Offset+4], N[Offset+5], N[Offset+6]);
            Rotation.Normalize();
            return FTransform(Rotation, FVector(N[Offset], N[Offset+1], N[Offset+2]));
        };
        Parsed.Add({Transform(0), Transform(7), FVector(N[14], N[15], N[16]), FVector(N[17], N[18], N[19])});
    }
    // LoadPerformance precedes the avatar's clip switch. Capture the prop's
    // current world-space pose now, before its temporary hand attachment can
    // inherit the incoming skeletal pose on the next animation tick.
    bSwitchingPerformance = !PerformanceFrames.IsEmpty() &&
        (bPerformancePose || bReturningToHands) && AvatarRoot && LeftRoot && RightRoot;
    if (bSwitchingPerformance)
    {
        const FTransform RootWorld = AvatarRoot->GetComponentTransform();
        SwitchLeft = LeftRoot->GetComponentTransform().GetRelativeTransform(RootWorld);
        SwitchRight = RightRoot->GetComponentTransform().GetRelativeTransform(RootWorld);
    }
    PerformanceFrames = MoveTemp(Parsed);
    PerformanceFps = static_cast<float>(Fps);
    PerformanceProfile = Profile;
    bHasGripSamples = bGrip;
    GripErrorCm = 0.f;
    PeakGripErrorCm = 0.f;
    PropAnchorErrorCm = 0.f;
    PeakPropAnchorErrorCm = 0.f;
    GripSampleCount = 0;
    return true;
}

bool UFlowFestPropComponent::SetPerformanceTime(float Seconds, float PoseWeight)
{
    if (PerformanceFrames.IsEmpty() || !FMath::IsFinite(Seconds)) return false;
    const float Frame = FMath::Fmod(FMath::Max(0.f, Seconds) * PerformanceFps,
        static_cast<float>(PerformanceFrames.Num()));
    const int32 First = FMath::FloorToInt(Frame);
    const int32 Second = (First + 1) % PerformanceFrames.Num();
    const float Alpha = Frame - First;
    const FPropMotionFrame& A = PerformanceFrames[First];
    const FPropMotionFrame& B = PerformanceFrames[Second];
    auto Blend = [Alpha](const FTransform& From, const FTransform& To)
    {
        return FTransform(FQuat::Slerp(From.GetRotation(), To.GetRotation(), Alpha).GetNormalized(),
            FMath::Lerp(From.GetLocation(), To.GetLocation(), Alpha));
    };
    SetPerformanceTransforms(Blend(A.Left, B.Left), Blend(A.Right, B.Right), PoseWeight);
    if (bHasGripSamples && BoundBodyMesh && AvatarRoot)
    {
        const FTransform RootWorld = AvatarRoot->GetComponentTransform();
        const float Weight = FMath::Clamp(PoseWeight, 0.f, 1.f);
        const FQuat Spin = bSpin ? FQuat(FVector::UpVector, SpinPhase) : FQuat::Identity;
        const auto Error = [this, &RootWorld, &A, &B, Alpha, Weight, Spin]
            (FName HandName, const FTransform& First, const FTransform& Second,
             const FVector& FirstGrip, const FVector& SecondGrip,
             const FQuat& Basis, const FVector& Offset, const USceneComponent* PropRoot)
        {
            const FTransform Hand = BoundBodyMesh->GetSocketTransform(HandName, RTS_World);
            const FVector HandLocal = RootWorld.InverseTransformPosition(Hand.GetLocation());
            const FVector CapturedGrip = FMath::Lerp(FirstGrip, SecondGrip, Alpha);
            const float CapturedError = FVector::Distance(HandLocal, CapturedGrip);
            const FVector AuthoredAnchor = FMath::Lerp(
                First.InverseTransformPosition(FirstGrip), Second.InverseTransformPosition(SecondGrip), Alpha);
            const FTransform Natural(FTransform(Hand.GetRotation() * Basis * Spin,
                Hand.TransformPosition(Offset)).GetRelativeTransform(RootWorld));
            const FVector NaturalAnchor = Natural.InverseTransformPosition(HandLocal);
            const FVector Anchor = FMath::Lerp(NaturalAnchor, AuthoredAnchor, Weight);
            const float RootError = FVector::Distance(Hand.GetLocation(),
                PropRoot->GetComponentTransform().TransformPosition(Anchor));
            return FVector2D(CapturedError, RootError);
        };
        const FVector2D LeftError = Error(TEXT("LeftHand"), A.Left, B.Left, A.LeftGrip, B.LeftGrip,
            LeftGripBasis, LeftGripOffset, LeftRoot);
        const FVector2D RightError = Error(TEXT("RightHand"), A.Right, B.Right, A.RightGrip, B.RightGrip,
            RightGripBasis, RightGripOffset, RightRoot);
        GripErrorCm = FMath::Max(LeftError.X, RightError.X);
        PropAnchorErrorCm = FMath::Max(LeftError.Y, RightError.Y);
        if (!bEnteringPerformance)
        {
            PeakGripErrorCm = FMath::Max(PeakGripErrorCm, GripErrorCm);
            PeakPropAnchorErrorCm = FMath::Max(PeakPropAnchorErrorCm, PropAnchorErrorCm);
            ++GripSampleCount;
            if (GripSampleCount % 300 == 0 && (GripErrorCm > 15.f || PropAnchorErrorCm > 15.f))
                UE_LOG(LogTemp, Warning, TEXT("Flow Fest grip drift captured=%.1f cm prop=%.1f cm: %s / %s"),
                    GripErrorCm, PropAnchorErrorCm, *EquippedPropId.ToString(), *PerformanceProfile.ToString());
        }
    }
    return true;
}

FTransform UFlowFestPropComponent::GetPropRootTransform(bool bLeft) const
{
    const USceneComponent* Root = bLeft ? LeftRoot : RightRoot;
    return Root ? Root->GetComponentTransform() : FTransform::Identity;
}

void UFlowFestPropComponent::SetVisible(bool bNewVisible)
{
    bVisible = bNewVisible;
    if (LeftRoot) LeftRoot->SetVisibility(bVisible, true);
    if (RightRoot) RightRoot->SetVisibility(bVisible, true);
    UpdateEffects();
}

void UFlowFestPropComponent::SetSpin(bool bNewSpin, float Phase)
{
    bSpin = bNewSpin;
    SpinPhase = Phase;
    UpdatePose();
}

void UFlowFestPropComponent::SetFinish(FName Finish)
{
    const FString Value = Finish.ToString().ToLower();
    EffectFinish = Value == TEXT("fire") || Value == TEXT("led") ? FName(*Value) : NAME_None;
    UpdateEffects();
}

void UFlowFestPropComponent::ResetFinish()
{
    EffectFinish = DefaultFinish;
    UpdateEffects();
}

void UFlowFestPropComponent::UpdateEffects()
{
    const bool bFire = EffectFinish == TEXT("fire");
    const bool bLed = EffectFinish == TEXT("led");
    for (const TArray<TObjectPtr<UPointLightComponent>>* Group : { &LeftEffectLights, &RightEffectLights })
    {
        for (UPointLightComponent* Light : *Group)
        {
            if (!Light) continue;
            Light->SetLightColor(bFire ? FLinearColor(1.f,.19f,.03f) : FLinearColor(.05f,.45f,1.f));
            Light->SetIntensity(bVisible ? (bFire ? 650.f : bLed ? 200.f : 0.f) : 0.f);
        }
    }
    for (const TArray<TObjectPtr<UProceduralMeshComponent>>* Group : { &LeftFlames, &RightFlames })
        for (UProceduralMeshComponent* Flame : *Group)
            if (Flame) Flame->SetVisibility(bVisible && bFire);
    for (const TArray<TObjectPtr<UStaticMeshComponent>>* Group : { &LeftLEDs, &RightLEDs })
        for (UStaticMeshComponent* LED : *Group)
            if (LED) LED->SetVisibility(bVisible && bLed);
}

void UFlowFestPropComponent::UpdatePose()
{
    if (!LeftRoot || !RightRoot) return;
    if (bPerformancePose || bReturningToHands) return;
    const FQuat Spin = bSpin ? FQuat(FVector::UpVector, SpinPhase) : FQuat::Identity;
    if (BoundBodyMesh)
    {
        LeftRoot->SetRelativeTransform(FTransform(LeftGripBasis * Spin, LeftGripOffset));
        RightRoot->SetRelativeTransform(FTransform(RightGripBasis * Spin, RightGripOffset));
        return;
    }
    LeftRoot->SetWorldTransform(FTransform(Spin * LeftHand.GetRotation(), LeftHand.GetLocation(), LeftHand.GetScale3D()));
    RightRoot->SetWorldTransform(FTransform(Spin * RightHand.GetRotation(), RightHand.GetLocation(), RightHand.GetScale3D()));
}
