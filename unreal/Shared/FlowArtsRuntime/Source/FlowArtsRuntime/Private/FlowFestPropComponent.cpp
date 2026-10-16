#include "FlowFestPropComponent.h"
#include "FlowFestAnimInstance.h"
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
    LeftVisualRoot = NewObject<USceneComponent>(GetOwner(), TEXT("FlowFestLeftPropVisual"));
    LeftVisualRoot->SetupAttachment(LeftRoot);
    LeftVisualRoot->RegisterComponent();
    RightVisualRoot = NewObject<USceneComponent>(GetOwner(), TEXT("FlowFestRightPropVisual"));
    RightVisualRoot->SetupAttachment(RightRoot);
    RightVisualRoot->RegisterComponent();
    // Wrist positions follow the scaled character, but the physical props
    // retain their authored centimeter dimensions across normalized rigs.
    LeftRoot->SetAbsolute(false, false, true);
    RightRoot->SetAbsolute(false, false, true);
    LeftMesh = CreateMesh(TEXT("FlowFestLeftPropMesh"), LeftVisualRoot);
    RightMesh = CreateMesh(TEXT("FlowFestRightPropMesh"), RightVisualRoot);
    SetVisible(bVisible);
}

bool UFlowFestPropComponent::BindHands(USkeletalMeshComponent* BodyMesh)
{
    if (!BodyMesh || !LeftRoot || !RightRoot || !BodyMesh->GetSkeletalMeshAsset()) return false;
    if (BodyMesh->GetBoneIndex(TEXT("LeftHand")) == INDEX_NONE ||
        BodyMesh->GetBoneIndex(TEXT("RightHand")) == INDEX_NONE ||
        BodyMesh->GetBoneIndex(TEXT("LeftHandMiddle1")) == INDEX_NONE ||
        BodyMesh->GetBoneIndex(TEXT("RightHandMiddle1")) == INDEX_NONE ||
        BodyMesh->GetBoneIndex(TEXT("LeftHandIndex1")) == INDEX_NONE ||
        BodyMesh->GetBoneIndex(TEXT("RightHandIndex1")) == INDEX_NONE ||
        BodyMesh->GetBoneIndex(TEXT("LeftHandPinky1")) == INDEX_NONE ||
        BodyMesh->GetBoneIndex(TEXT("RightHandPinky1")) == INDEX_NONE) return false;
    auto Grip = [BodyMesh](FName HandName, FName MiddleName, FName IndexName, FName PinkyName,
                           FQuat& Basis, FVector& Offset)
    {
        const FTransform Hand = BodyMesh->GetSocketTransform(HandName, RTS_World);
        const FVector Middle = Hand.InverseTransformPosition(BodyMesh->GetSocketLocation(MiddleName));
        const FVector Index = Hand.InverseTransformPosition(BodyMesh->GetSocketLocation(IndexName));
        const FVector Pinky = Hand.InverseTransformPosition(BodyMesh->GetSocketLocation(PinkyName));
        if (Middle.IsNearlyZero()) return false;
        const FVector Longitudinal = Middle.GetSafeNormal();
        FVector Transverse = Pinky - Index;
        Transverse -= Longitudinal * FVector::DotProduct(Transverse, Longitudinal);
        if (!Transverse.Normalize()) return false;
        // Match the web grip calibration: Index1 -> Pinky1 points toward the
        // staff's -Y end. The grip center lies 65% along wrist -> Middle1.
        Basis = FQuat::FindBetweenNormals(FVector::YAxisVector, -Transverse);
        Offset = Middle * .65f;
        return true;
    };
    FQuat NewLeftBasis, NewRightBasis;
    FVector NewLeftOffset, NewRightOffset;
    if (!Grip(TEXT("LeftHand"), TEXT("LeftHandMiddle1"), TEXT("LeftHandIndex1"), TEXT("LeftHandPinky1"), NewLeftBasis, NewLeftOffset) ||
        !Grip(TEXT("RightHand"), TEXT("RightHandMiddle1"), TEXT("RightHandIndex1"), TEXT("RightHandPinky1"), NewRightBasis, NewRightOffset)) return false;
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
    return LeftRoot && RightRoot && LeftVisualRoot && RightVisualRoot &&
        LeftMesh && RightMesh && LeftMesh->GetStaticMesh() && RightMesh->GetStaticMesh();
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
    LeftVisualRoot->SetRelativeRotation(FQuat::Identity);
    RightVisualRoot->SetRelativeRotation(FQuat::Identity);
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
            LeftEffectLights.Add(AddLight(LeftVisualRoot));
            RightEffectLights.Add(AddLight(RightVisualRoot));
            LeftFlames.Add(AddFlame(GetOwner(), LeftVisualRoot, Location));
            RightFlames.Add(AddFlame(GetOwner(), RightVisualRoot, Location));
            LeftLEDs.Add(AddLED(GetOwner(), LeftVisualRoot, Location));
            RightLEDs.Add(AddLED(GetOwner(), RightVisualRoot, Location));
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
        TransitionLeftVisual = LeftVisualRoot->GetRelativeRotation().Quaternion();
        TransitionRightVisual = RightVisualRoot->GetRelativeRotation().Quaternion();
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
    LeftVisualRoot->SetRelativeRotation(FQuat::Slerp(TransitionLeftVisual, FQuat::Identity, Alpha));
    RightVisualRoot->SetRelativeRotation(FQuat::Slerp(TransitionRightVisual, FQuat::Identity, Alpha));
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
        (Schema != TEXT("flow-fest-prop-motion-v1") && Schema != TEXT("flow-fest-prop-motion-v2") &&
         Schema != TEXT("flow-fest-prop-motion-v3")) ||
        (Schema != TEXT("flow-fest-prop-motion-v1") &&
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
    const bool bGrip = Schema != TEXT("flow-fest-prop-motion-v1");
    const bool bVisual = Schema == TEXT("flow-fest-prop-motion-v3");
    double SourceFrameCount = 0;
    // Captured festival profiles retain their fixed loop; authored consumers
    // may supply a different length when the paired body clip matches it.
    const FString ProfileName = Profile.ToString();
    const bool bProductionProfile = ProfileName.StartsWith(TEXT("P_")) ||
        ProfileName == TEXT("FirePoi") || ProfileName == TEXT("FireHoop") ||
        ProfileName == TEXT("Juggler") || ProfileName == TEXT("LedFlow");
    const int32 FrameCount = Frames->Num();
    if (!Root->TryGetNumberField(TEXT("sourceFrameCount"), SourceFrameCount) ||
        SourceFrameCount != FrameCount || Fps != 30.0 ||
        (bProductionProfile && FrameCount != 480) ||
        (!bProductionProfile && (FrameCount < 2 || FrameCount > 18000)))
        return false;
    TArray<FPropMotionFrame> Parsed;
    Parsed.Reserve(Frames->Num());
    for (const TSharedPtr<FJsonValue>& Entry : *Frames)
    {
        const TArray<TSharedPtr<FJsonValue>>* Values = nullptr;
        if (!Entry.IsValid() || !Entry->TryGetArray(Values) || !Values ||
            Values->Num() != (bVisual ? 28 : bGrip ? 20 : 14))
            return false;
        double N[28]{};
        for (int32 I = 0; I < Values->Num(); ++I)
        {
            if (!(*Values)[I].IsValid() || !(*Values)[I]->TryGetNumber(N[I]) || !FMath::IsFinite(N[I]))
                return false;
        }
        if (bVisual)
        {
            for (int32 Offset : {20, 24})
            {
                const double SizeSquared = N[Offset]*N[Offset] + N[Offset+1]*N[Offset+1] +
                    N[Offset+2]*N[Offset+2] + N[Offset+3]*N[Offset+3];
                if (SizeSquared < .99 || SizeSquared > 1.01) return false;
            }
        }
        auto Transform = [&N](int32 Offset)
        {
            FQuat Rotation(N[Offset+3], N[Offset+4], N[Offset+5], N[Offset+6]);
            Rotation.Normalize();
            return FTransform(Rotation, FVector(N[Offset], N[Offset+1], N[Offset+2]));
        };
        auto Visual = [&N](int32 Offset)
        {
            FQuat Rotation(N[Offset], N[Offset+1], N[Offset+2], N[Offset+3]);
            return Rotation.GetNormalized();
        };
        Parsed.Add({Transform(0), Transform(7), FVector(N[14], N[15], N[16]),
            FVector(N[17], N[18], N[19]), bVisual ? Visual(20) : FQuat::Identity,
            bVisual ? Visual(24) : FQuat::Identity});
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
        SwitchLeftVisual = LeftVisualRoot->GetRelativeRotation().Quaternion();
        SwitchRightVisual = RightVisualRoot->GetRelativeRotation().Quaternion();
    }
    if (bSwitchingPerformance)
        OutgoingPerformanceTracks.Add({MoveTemp(PerformanceFrames), PerformanceFps, PerformanceProfile});
    else
        OutgoingPerformanceTracks.Reset();
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

bool UFlowFestPropComponent::SampleCapturedWrists(FName Profile, float Seconds,
    FVector& LeftWorld, FVector& RightWorld) const
{
    if (!bHasGripSamples || !AvatarRoot || !FMath::IsFinite(Seconds)) return false;
    const TArray<FPropMotionFrame>* Frames = nullptr;
    float Fps = 0.f;
    if (Profile == PerformanceProfile)
    {
        Frames = &PerformanceFrames;
        Fps = PerformanceFps;
    }
    else
    {
        for (const FPropMotionTrack& Track : OutgoingPerformanceTracks)
        {
            if (Track.Profile == Profile)
            {
                Frames = &Track.Frames;
                Fps = Track.Fps;
                break;
            }
        }
    }
    if (!Frames || Frames->IsEmpty() || Fps <= 0.f) return false;
    const float Frame = FMath::Fmod(FMath::Max(0.f, Seconds) * Fps,
        static_cast<float>(Frames->Num()));
    const int32 First = FMath::FloorToInt(Frame);
    const int32 Second = (First + 1) % Frames->Num();
    const float Alpha = Frame - First;
    const FTransform RootWorld = AvatarRoot->GetComponentTransform();
    LeftWorld = RootWorld.TransformPosition(FMath::Lerp(
        (*Frames)[First].LeftGrip, (*Frames)[Second].LeftGrip, Alpha));
    RightWorld = RootWorld.TransformPosition(FMath::Lerp(
        (*Frames)[First].RightGrip, (*Frames)[Second].RightGrip, Alpha));
    return !LeftWorld.ContainsNaN() && !RightWorld.ContainsNaN();
}

bool UFlowFestPropComponent::SetPerformanceTime(float Seconds, float PoseWeight, const UFlowFestAnimInstance* Animator)
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
    bool bBlendOutgoing = false;
    FVector BlendedLeftGrip = FVector::ZeroVector, BlendedRightGrip = FVector::ZeroVector;
    FVector BlendedLeftAnchor = FVector::ZeroVector, BlendedRightAnchor = FVector::ZeroVector;
    FQuat BlendedLeftVisual = FQuat::Identity, BlendedRightVisual = FQuat::Identity;
    if (Animator && AvatarRoot && BoundBodyMesh)
    {
        const int32 Count = Animator->GetOutgoingPerformanceCount();
        // The avatar may still carry a fading clip from a previous prop family.
        // Its prop data is no longer equipped, so that weight must follow the
        // live wrist as a natural hand attachment instead of shifting the
        // indices of this family's outgoing tracks.
        bBlendOutgoing = Count > 0;
    }
    if (bBlendOutgoing)
    {
        const FTransform RootWorld = AvatarRoot->GetComponentTransform();
        const FQuat Spin = bSpin ? FQuat(FVector::UpVector, SpinPhase) : FQuat::Identity;
        const auto Natural = [this, &RootWorld, Spin](FName HandName, const FQuat& Basis, const FVector& Offset)
        {
            const FTransform Hand = BoundBodyMesh->GetSocketTransform(HandName, RTS_World);
            return FTransform(Hand.GetRotation() * Basis * Spin, Hand.TransformPosition(Offset))
                .GetRelativeTransform(RootWorld);
        };
        FTransform Left = FTransform::Identity, Right = FTransform::Identity;
        float Total = 0.f;
        auto Add = [&Left, &Right, &Total, &BlendedLeftGrip, &BlendedRightGrip,
            &BlendedLeftAnchor, &BlendedRightAnchor, &BlendedLeftVisual, &BlendedRightVisual]
            (const FTransform& NextLeft, const FTransform& NextRight,
             const FVector& LeftGrip, const FVector& RightGrip,
             const FQuat& NextLeftVisual, const FQuat& NextRightVisual, float Weight)
        {
            if (Weight <= 0.f) return;
            if (Total <= 0.f)
            {
                Left = NextLeft; Right = NextRight;
                BlendedLeftVisual = NextLeftVisual;
                BlendedRightVisual = NextRightVisual;
            }
            else
            {
                FTransform L, R;
                const float Fraction = Weight / (Total + Weight);
                L.Blend(Left, NextLeft, Fraction);
                R.Blend(Right, NextRight, Fraction);
                Left = L; Right = R;
                BlendedLeftVisual = FQuat::Slerp(BlendedLeftVisual, NextLeftVisual, Fraction).GetNormalized();
                BlendedRightVisual = FQuat::Slerp(BlendedRightVisual, NextRightVisual, Fraction).GetNormalized();
            }
            BlendedLeftGrip += LeftGrip * Weight;
            BlendedRightGrip += RightGrip * Weight;
            BlendedLeftAnchor += NextLeft.InverseTransformPosition(LeftGrip) * Weight;
            BlendedRightAnchor += NextRight.InverseTransformPosition(RightGrip) * Weight;
            Total += Weight;
        };
        const FVector NaturalLeftGrip = RootWorld.InverseTransformPosition(
            BoundBodyMesh->GetSocketLocation(TEXT("LeftHand")));
        const FVector NaturalRightGrip = RootWorld.InverseTransformPosition(
            BoundBodyMesh->GetSocketLocation(TEXT("RightHand")));
        float OutgoingWeight = 0.f;
        TArray<bool> UsedTracks;
        UsedTracks.Init(false, OutgoingPerformanceTracks.Num());
        for (int32 Index = 0; Index < Animator->GetOutgoingPerformanceCount(); ++Index)
        {
            float Time = 0.f, Weight = 0.f;
            FName Profile = NAME_None;
            if (!Animator->GetOutgoingPerformanceSample(Index, Time, Weight, Profile)) continue;
            int32 TrackIndex = INDEX_NONE;
            for (int32 Candidate = 0; Candidate < OutgoingPerformanceTracks.Num(); ++Candidate)
            {
                if (!UsedTracks[Candidate] && OutgoingPerformanceTracks[Candidate].Profile == Profile)
                {
                    TrackIndex = Candidate;
                    UsedTracks[Candidate] = true;
                    break;
                }
            }
            if (TrackIndex == INDEX_NONE) continue;
            const FPropMotionTrack& Track = OutgoingPerformanceTracks[TrackIndex];
            if (Track.Frames.IsEmpty()) continue;
            const float TrackFrame = FMath::Fmod(FMath::Max(0.f, Time) * Track.Fps, static_cast<float>(Track.Frames.Num()));
            const int32 I = FMath::FloorToInt(TrackFrame), J = (I + 1) % Track.Frames.Num();
            const float Fraction = TrackFrame - I;
            FTransform L, R;
            L.Blend(Track.Frames[I].Left, Track.Frames[J].Left, Fraction);
            R.Blend(Track.Frames[I].Right, Track.Frames[J].Right, Fraction);
            Add(L, R, FMath::Lerp(Track.Frames[I].LeftGrip, Track.Frames[J].LeftGrip, Fraction),
                FMath::Lerp(Track.Frames[I].RightGrip, Track.Frames[J].RightGrip, Fraction),
                FQuat::Slerp(Track.Frames[I].LeftVisual, Track.Frames[J].LeftVisual, Fraction),
                FQuat::Slerp(Track.Frames[I].RightVisual, Track.Frames[J].RightVisual, Fraction), Weight);
            OutgoingWeight += Weight;
        }
        for (int32 Candidate = UsedTracks.Num() - 1; Candidate >= 0; --Candidate)
            if (!UsedTracks[Candidate]) OutgoingPerformanceTracks.RemoveAt(Candidate);
        Add(Blend(A.Left, B.Left), Blend(A.Right, B.Right),
            FMath::Lerp(A.LeftGrip, B.LeftGrip, Alpha), FMath::Lerp(A.RightGrip, B.RightGrip, Alpha),
            FQuat::Slerp(A.LeftVisual, B.LeftVisual, Alpha),
            FQuat::Slerp(A.RightVisual, B.RightVisual, Alpha), FMath::Clamp(PoseWeight, 0.f, 1.f));
        const float NaturalWeight = FMath::Max(0.f, 1.f - OutgoingWeight - FMath::Clamp(PoseWeight, 0.f, 1.f));
        Add(Natural(TEXT("LeftHand"), LeftGripBasis, LeftGripOffset),
            Natural(TEXT("RightHand"), RightGripBasis, RightGripOffset),
            NaturalLeftGrip, NaturalRightGrip, FQuat::Identity, FQuat::Identity, NaturalWeight);
        if (Total > SMALL_NUMBER)
        {
            BlendedLeftGrip /= Total; BlendedRightGrip /= Total;
            BlendedLeftAnchor /= Total; BlendedRightAnchor /= Total;
            // A linear blend of two prop-root translations and two local grip
            // offsets is not a rigid grip constraint. Solve each blended root
            // against the wrist actually evaluated by the skeletal pose.
            Left.SetLocation(NaturalLeftGrip - Left.GetRotation().RotateVector(BlendedLeftAnchor));
            Right.SetLocation(NaturalRightGrip - Right.GetRotation().RotateVector(BlendedRightAnchor));
            bSwitchingPerformance = false;
            SetPerformanceTransforms(Left, Right, 1.f);
            LeftVisualRoot->SetRelativeRotation(BlendedLeftVisual);
            RightVisualRoot->SetRelativeRotation(BlendedRightVisual);
            bEnteringPerformance = OutgoingWeight > .001f || PoseWeight < .999f;
        }
    }
    else
    {
        SetPerformanceTransforms(Blend(A.Left, B.Left), Blend(A.Right, B.Right), PoseWeight);
        const FQuat LeftVisual = FQuat::Slerp(A.LeftVisual, B.LeftVisual, Alpha).GetNormalized();
        const FQuat RightVisual = FQuat::Slerp(A.RightVisual, B.RightVisual, Alpha).GetNormalized();
        const float Weight = FMath::Clamp(PoseWeight, 0.f, 1.f);
        LeftVisualRoot->SetRelativeRotation(FQuat::Slerp(
            bSwitchingPerformance ? SwitchLeftVisual : FQuat::Identity, LeftVisual, Weight));
        RightVisualRoot->SetRelativeRotation(FQuat::Slerp(
            bSwitchingPerformance ? SwitchRightVisual : FQuat::Identity, RightVisual, Weight));
    }
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
        if (bBlendOutgoing)
        {
            const FVector LeftHandLocal = RootWorld.InverseTransformPosition(
                BoundBodyMesh->GetSocketLocation(TEXT("LeftHand")));
            const FVector RightHandLocal = RootWorld.InverseTransformPosition(
                BoundBodyMesh->GetSocketLocation(TEXT("RightHand")));
            GripErrorCm = FMath::Max(FVector::Distance(LeftHandLocal, BlendedLeftGrip),
                FVector::Distance(RightHandLocal, BlendedRightGrip));
            PropAnchorErrorCm = FMath::Max(FVector::Distance(
                BoundBodyMesh->GetSocketLocation(TEXT("LeftHand")),
                LeftRoot->GetComponentTransform().TransformPosition(BlendedLeftAnchor)),
                FVector::Distance(BoundBodyMesh->GetSocketLocation(TEXT("RightHand")),
                RightRoot->GetComponentTransform().TransformPosition(BlendedRightAnchor)));
        }
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

FQuat UFlowFestPropComponent::GetVisualRotation(bool bLeft) const
{
    const USceneComponent* Root = bLeft ? LeftVisualRoot : RightVisualRoot;
    return Root ? Root->GetRelativeRotation().Quaternion() : FQuat::Identity;
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
