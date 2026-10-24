#include "FlowFestPropComponent.h"
#include "FlowFestAnimInstance.h"
#include "FlowArtsArmClearance.h"
#include "FlowArtsRuntimeMotion.h"
#include "FlowArtsNiagaraEffectComponent.h"
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
#include "Misc/SecureHash.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Dom/JsonObject.h"
#include "Engine/World.h"
#include "NiagaraSystem.h"

namespace
{
bool PropFrameIndices(float Seconds, float Fps, int32 Count, bool bLoop,
    int32& First, int32& Second, float& Alpha)
{
    if (!FMath::IsFinite(Seconds) || Fps <= 0.f || Count <= 0) return false;
    const float Frame = bLoop
        ? FMath::Fmod(FMath::Max(0.f, Seconds) * Fps, static_cast<float>(Count))
        : FMath::Clamp(FMath::Max(0.f, Seconds) * Fps, 0.f, static_cast<float>(Count - 1));
    First = FMath::FloorToInt(Frame);
    Second = bLoop ? (First + 1) % Count : FMath::Min(First + 1, Count - 1);
    Alpha = Frame - First;
    return true;
}

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

bool ReadMeshClearanceCapsules(const TSharedPtr<FJsonObject>& Variant, const TCHAR* Field,
    TArray<FFlowArtsClearanceCapsule>& Out)
{
    Out.Reset();
    FString Space;
    const TArray<TSharedPtr<FJsonValue>>* Values = nullptr;
    if (!Variant.IsValid() || !Variant->TryGetStringField(TEXT("clearanceSpace"), Space) ||
        Space != TEXT("ue-static-mesh-local-cm-v1") ||
        !Variant->TryGetArrayField(Field, Values) || !Values || Values->IsEmpty() || Values->Num() > 16)
        return false;
    TArray<FFlowArtsClearanceCapsule> Parsed;
    const auto ReadVector = [](const TSharedPtr<FJsonObject>& Object, const TCHAR* Name, FVector& Result)
    {
        const TArray<TSharedPtr<FJsonValue>>* Coordinates = nullptr;
        if (!Object->TryGetArrayField(Name, Coordinates) || !Coordinates || Coordinates->Num() != 3) return false;
        for (int32 Axis = 0; Axis < 3; ++Axis)
        {
            double Value = 0;
            if (!(*Coordinates)[Axis].IsValid() || !(*Coordinates)[Axis]->TryGetNumber(Value) || !FMath::IsFinite(Value)) return false;
            Result[Axis] = Value;
        }
        return true;
    };
    for (const TSharedPtr<FJsonValue>& Value : *Values)
    {
        if (!Value.IsValid() || Value->Type != EJson::Object) return false;
        const TSharedPtr<FJsonObject> Object = Value->AsObject();
        FFlowArtsClearanceCapsule Capsule;
        double Radius = 0;
        if (!Object.IsValid() || !ReadVector(Object, TEXT("start"), Capsule.Start) ||
            !ReadVector(Object, TEXT("end"), Capsule.End) ||
            !Object->TryGetNumberField(TEXT("radiusCm"), Radius) || !FMath::IsFinite(Radius) ||
            Radius <= 0. || Radius > TNumericLimits<float>::Max()) return false;
        Capsule.RadiusCm = Radius;
        if (Capsule.RadiusCm <= 0.f) return false;
        Parsed.Add(Capsule);
    }
    Out = MoveTemp(Parsed);
    return true;
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
    // Keep the catalog flame meshes as a fallback when the plugin particle
    // system has not been installed in this project.
    if (LoadObject<UNiagaraSystem>(nullptr, TEXT("/FlowArtsRuntime/Effects/NS_PropFire.NS_PropFire")))
    {
        NiagaraEffects = NewObject<UFlowArtsNiagaraEffectComponent>(GetOwner(), TEXT("FlowFestNiagaraEffects"));
        NiagaraEffects->RegisterComponent();
        NiagaraEffects->Initialize(LeftVisualRoot, RightVisualRoot);
    }
    SetVisible(bVisible);
}

FVector MeasureFlowFestGripChannel(const FFlowFestGripCalibration& Calibration,
    const FVector& Proximal, const FVector& Middle, const FVector& Distal)
{
    const FVector Fallback = Calibration.Fallback;
    const double HandLength = Proximal.Length();
    if (!Calibration.bValid || !FMath::IsFinite(HandLength) || HandLength <= 1.e-4)
        return Fallback;
    const double Ax = FVector::DotProduct(Proximal, Calibration.Longitudinal);
    const double Ay = FVector::DotProduct(Proximal, Calibration.PalmNormal);
    const double Bx = FVector::DotProduct(Middle, Calibration.Longitudinal);
    const double By = FVector::DotProduct(Middle, Calibration.PalmNormal);
    const double Cx = FVector::DotProduct(Distal, Calibration.Longitudinal);
    const double Cy = FVector::DotProduct(Distal, Calibration.PalmNormal);
    const double Determinant = 2. * (Ax * (By - Cy) + Bx * (Cy - Ay) + Cx * (Ay - By));
    if (!FMath::IsFinite(Determinant) || FMath::Abs(Determinant) < HandLength * HandLength * 1.e-4)
        return Fallback;
    const double A2 = Ax * Ax + Ay * Ay;
    const double B2 = Bx * Bx + By * By;
    const double C2 = Cx * Cx + Cy * Cy;
    const double CenterLong = (A2 * (By - Cy) + B2 * (Cy - Ay) + C2 * (Ay - By)) / Determinant;
    const double CenterNormal = (A2 * (Cx - Bx) + B2 * (Ax - Cx) + C2 * (Bx - Ax)) / Determinant;
    const double RadiusRatio = FMath::Sqrt(FMath::Square(CenterLong - Ax) + FMath::Square(CenterNormal - Ay)) / HandLength;
    const double LongRatio = CenterLong / HandLength;
    const double NormalRatio = CenterNormal / HandLength;
    if (!FMath::IsFinite(RadiusRatio) || !FMath::IsFinite(LongRatio) || !FMath::IsFinite(NormalRatio) ||
        RadiusRatio < .08 || RadiusRatio > 1.5 || LongRatio < .5 || LongRatio > 1.25 ||
        NormalRatio < -.05 || NormalRatio > 1.25)
        return Fallback;
    const double TransverseCenter = (FVector::DotProduct(Proximal, Calibration.Transverse) +
        FVector::DotProduct(Middle, Calibration.Transverse) +
        FVector::DotProduct(Distal, Calibration.Transverse)) / 3.;
    const FVector Fitted = Calibration.Longitudinal * CenterLong +
        Calibration.PalmNormal * CenterNormal + Calibration.Transverse * TransverseCenter;
    const double Confidence = FMath::Clamp((.75 - RadiusRatio) / (.75 - .3), 0., 1.);
    return FMath::Lerp(Fallback, Fitted, Confidence);
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
                           FName ThumbName, FQuat& Basis, FVector& Offset, FFlowFestGripCalibration& Calibration)
    {
        const FTransform Hand = BodyMesh->GetSocketTransform(HandName, RTS_World);
        const FVector Middle = Hand.InverseTransformPosition(BodyMesh->GetSocketLocation(MiddleName));
        const FVector Index = Hand.InverseTransformPosition(BodyMesh->GetSocketLocation(IndexName));
        const FVector Pinky = Hand.InverseTransformPosition(BodyMesh->GetSocketLocation(PinkyName));
        const int32 ThumbIndex = BodyMesh->GetBoneIndex(ThumbName);
        const FVector Thumb = ThumbIndex != INDEX_NONE
            ? Hand.InverseTransformPosition(BodyMesh->GetSocketLocation(ThumbName)) : Middle;
        if (Middle.IsNearlyZero()) return false;
        const FVector Longitudinal = Middle.GetSafeNormal();
        FVector Transverse = Pinky - Index;
        Transverse -= Longitudinal * FVector::DotProduct(Transverse, Longitudinal);
        if (!Transverse.Normalize()) return false;
        // Match the web grip calibration: Index1 -> Pinky1 points toward the
        // staff's -Y end. Older tracks use the 65% neutral-palm fallback;
        // v5 measures the posed finger channel each frame.
        Basis = FQuat::FindBetweenNormals(FVector::YAxisVector, -Transverse);
        Offset = Middle * .65f;
        Calibration.Longitudinal = Longitudinal;
        Calibration.Transverse = Transverse;
        Calibration.PalmNormal = FVector::CrossProduct(Transverse, Longitudinal).GetSafeNormal();
        if (FVector::DotProduct(Calibration.PalmNormal, Thumb - Middle) < 0.f)
            Calibration.PalmNormal *= -1.f;
        Calibration.Fallback = Offset;
        Calibration.bValid = ThumbIndex != INDEX_NONE && !Calibration.PalmNormal.IsNearlyZero();
        return true;
    };
    FQuat NewLeftBasis, NewRightBasis;
    FVector NewLeftOffset, NewRightOffset;
    FFlowFestGripCalibration NewCalibrations[2];
    if (!Grip(TEXT("LeftHand"), TEXT("LeftHandMiddle1"), TEXT("LeftHandIndex1"), TEXT("LeftHandPinky1"),
            TEXT("LeftHandThumb1"), NewLeftBasis, NewLeftOffset, NewCalibrations[0]) ||
        !Grip(TEXT("RightHand"), TEXT("RightHandMiddle1"), TEXT("RightHandIndex1"), TEXT("RightHandPinky1"),
            TEXT("RightHandThumb1"), NewRightBasis, NewRightOffset, NewCalibrations[1])) return false;
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
    GripCalibrations[0] = NewCalibrations[0];
    GripCalibrations[1] = NewCalibrations[1];
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
    // Never consume partially valid metadata or infer a coordinate basis.
    ReadMeshClearanceCapsules(Build, TEXT("clearanceCapsules"), LeftMeshClearanceCapsules);
    ReadMeshClearanceCapsules(Build, TEXT("rightClearanceCapsules"), RightMeshClearanceCapsules);
    LeftVisualRoot->SetRelativeRotation(FQuat::Identity);
    RightVisualRoot->SetRelativeRotation(FQuat::Identity);
    double AuthoredLength = 0;
    Prop->TryGetNumberField(TEXT("authoredLengthCm"), AuthoredLength);
    bool bAdjustable = false;
    Prop->TryGetBoolField(TEXT("lengthAdjustable"), bAdjustable);
    const float LongScale = bAdjustable && LengthCm > 0.f && AuthoredLength > 0 ? FMath::Clamp(LengthCm / static_cast<float>(AuthoredLength), .1f, 5.f) : 1.f;
    // Avatar import maps source X to UE -Y. Mirror the baked prop's numeric
    // X axis once so the sampled root rotation remains a proper quaternion.
    // The FBX prop import also reverses source Y in the static mesh vertices;
    // attachment positions below must use that same mesh-local axis.
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
    TArray<FVector> WickOffsets;
    const TArray<TSharedPtr<FJsonValue>>* Effects = nullptr;
    if (Build->TryGetArrayField(TEXT("effectAttachments"), Effects) && Effects)
    {
        for (int32 Index = 0; Index < Effects->Num(); ++Index)
        {
            const TSharedPtr<FJsonObject> Effect = (*Effects)[Index]->AsObject();
            const TArray<TSharedPtr<FJsonValue>>* Offset = nullptr;
            if (!Effect.IsValid() || !Effect->TryGetArrayField(TEXT("offsetCm"), Offset) || !Offset || Offset->Num() != 3) continue;
            const FVector Location(-(*Offset)[0]->AsNumber(), -(*Offset)[1]->AsNumber() * LongScale, (*Offset)[2]->AsNumber());
            WickOffsets.Add(Location);
            auto AddLight = [this, Location](USceneComponent* Root)
            {
                UPointLightComponent* Light = NewObject<UPointLightComponent>(GetOwner());
                Light->SetupAttachment(Root);
                Light->SetRelativeLocation(Location);
                Light->SetAttenuationRadius(150.f);
                Light->SetIntensityUnits(ELightUnits::Lumens);
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
    if (NiagaraEffects)
    {
        NiagaraEffects->Configure(WickOffsets, PropId);
        NiagaraEffects->ResetHistory();
    }
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
    UpdateHandVisibility(true, true);
    if (!bPerformancePose) return;
    bPerformancePose = false;
    bEnteringPerformance = false;
    GripErrorCm = 0.f;
    PeakGripErrorCm = 0.f;
    PropAnchorErrorCm = 0.f;
    PeakPropAnchorErrorCm = 0.f;
    ActualGripErrorCm = 0.f;
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
    InstallPerformanceTrack(MoveTemp(Parsed), static_cast<float>(Fps), Profile, true, bGrip);
    PerformanceTrackIdentity = FSHA1::HashBuffer(*Text, Text.Len() * sizeof(TCHAR)).ToString();
    return true;
}

bool UFlowFestPropComponent::LoadRuntimePerformance(
    TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Motion)
{
    if (!Motion.IsValid() || !IsReady() || Motion->GetFrameCount() < 1 ||
        Motion->GetFps() <= 0 || Motion->GetProfile().IsNone()) return false;
    FString EquippedFamily = EquippedPropId.ToString().ToLower();
    int32 Colon = INDEX_NONE;
    if (EquippedFamily.FindChar(TEXT(':'), Colon)) EquippedFamily.LeftInline(Colon);
    if (!Motion->GetPropFamily().Equals(EquippedFamily, ESearchCase::IgnoreCase)) return false;

    TArray<FPropMotionFrame> Parsed;
    Parsed.Reserve(Motion->GetFrameCount());
    for (int32 Index = 0; Index < Motion->GetFrameCount(); ++Index)
    {
        TArray<float> Values;
        if (!Motion->SamplePropFrame(static_cast<double>(Index) / Motion->GetSampleRate(), Values) ||
            Values.Num() != 28) return false;
        for (const float Value : Values)
            if (!FMath::IsFinite(Value)) return false;
        const auto Rotation = [&Values](int32 Offset)
        {
            return FQuat(Values[Offset], Values[Offset + 1], Values[Offset + 2],
                Values[Offset + 3]).GetNormalized();
        };
        const auto Root = [&Values, &Rotation](int32 Offset)
        {
            return FTransform(Rotation(Offset + 3),
                FVector(Values[Offset], Values[Offset + 1], Values[Offset + 2]));
        };
        Parsed.Add({Root(0), Root(7), FVector(Values[14], Values[15], Values[16]),
            FVector(Values[17], Values[18], Values[19]), Rotation(20), Rotation(24)});
        if (!Motion->SamplePropVisibility(static_cast<double>(Index) / Motion->GetSampleRate(),
            Parsed.Last().PropVisible)) return false;
    }
    // Legacy captures omit length and were authored at the catalog dimension.
    // Resolve it explicitly so loading one cannot inherit a previous resize.
    {
        const TSharedPtr<FJsonObject> CatalogProp = FindProp(LoadPropCatalog(), EquippedFamily);
        if (!CatalogProp.IsValid()) return false;
        bool bAdjustable = false;
        double AuthoredLength = 0.0;
        CatalogProp->TryGetBoolField(TEXT("lengthAdjustable"), bAdjustable);
        CatalogProp->TryGetNumberField(TEXT("authoredLengthCm"), AuthoredLength);
        const float CapturedLength = Motion->GetEffectivePropLengthCm();
        if (bAdjustable && (!FMath::IsFinite(AuthoredLength) || AuthoredLength <= 0.0)) return false;
        const float ResolvedLength = CapturedLength > 0.f ? CapturedLength :
            (bAdjustable ? static_cast<float>(AuthoredLength) : 0.f);
        // A captured dimension must never silently hit Equip's interactive size clamp.
        if (bAdjustable && (AuthoredLength <= 0.0 ||
            ResolvedLength < AuthoredLength * .1 || ResolvedLength > AuthoredLength * 5.0)) return false;
        if (!Equip(EquippedPropId, ResolvedLength)) return false;
    }
    InstallPerformanceTrack(MoveTemp(Parsed), static_cast<float>(Motion->GetSampleRate()),
        Motion->GetProfile(), Motion->IsLooping(), true);
    PerformanceTrackIdentity = Motion->GetSequenceSHA256();
    return true;
}

void UFlowFestPropComponent::InstallPerformanceTrack(TArray<FPropMotionFrame>&& Frames,
    float Fps, FName Profile, bool bLoop, bool bHasGrips)
{
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
        OutgoingPerformanceTracks.Add({MoveTemp(PerformanceFrames), PerformanceFps,
            PerformanceProfile, bPerformanceLoop});
    else
        OutgoingPerformanceTracks.Reset();
    PerformanceFrames = MoveTemp(Frames);
    PerformanceFps = Fps;
    PerformanceProfile = Profile;
    bPerformanceLoop = bLoop;
    bHasGripSamples = bHasGrips;
    if (!PerformanceFrames.IsEmpty())
        UpdateHandVisibility(PerformanceFrames[0].PropVisible[0], PerformanceFrames[0].PropVisible[1]);
    GripErrorCm = 0.f;
    PeakGripErrorCm = 0.f;
    PropAnchorErrorCm = 0.f;
    PeakPropAnchorErrorCm = 0.f;
    ActualGripErrorCm = 0.f;
    GripSampleCount = 0;
}

bool UFlowFestPropComponent::SampleCapturedWrists(FName Profile, float Seconds,
    FVector& LeftWorld, FVector& RightWorld) const
{
    if (!bHasGripSamples || !AvatarRoot || !FMath::IsFinite(Seconds)) return false;
    const TArray<FPropMotionFrame>* Frames = nullptr;
    float Fps = 0.f;
    bool bLoop = true;
    if (Profile == PerformanceProfile)
    {
        Frames = &PerformanceFrames;
        Fps = PerformanceFps;
        bLoop = bPerformanceLoop;
    }
    else
    {
        for (const FPropMotionTrack& Track : OutgoingPerformanceTracks)
        {
            if (Track.Profile == Profile)
            {
                Frames = &Track.Frames;
                Fps = Track.Fps;
                bLoop = Track.bLoop;
                break;
            }
        }
    }
    if (!Frames || Frames->IsEmpty() || Fps <= 0.f) return false;
    int32 First = 0, Second = 0;
    float Alpha = 0.f;
    if (!PropFrameIndices(Seconds, Fps, Frames->Num(), bLoop, First, Second, Alpha)) return false;
    const FTransform RootWorld = AvatarRoot->GetComponentTransform();
    LeftWorld = RootWorld.TransformPosition(FMath::Lerp(
        (*Frames)[First].LeftGrip, (*Frames)[Second].LeftGrip, Alpha));
    RightWorld = RootWorld.TransformPosition(FMath::Lerp(
        (*Frames)[First].RightGrip, (*Frames)[Second].RightGrip, Alpha));
    return !LeftWorld.ContainsNaN() && !RightWorld.ContainsNaN();
}

bool UFlowFestPropComponent::GetPalmLocalOffsets(FVector (&Offsets)[2]) const
{
    if (!BoundBodyMesh || !bHasGripSamples || LeftGripOffset.ContainsNaN() || RightGripOffset.ContainsNaN())
        return false;
    Offsets[0] = LeftGripOffset;
    Offsets[1] = RightGripOffset;
    return true;
}

bool UFlowFestPropComponent::GetGripCalibrations(FFlowFestGripCalibration (&Calibrations)[2]) const
{
    if (!BoundBodyMesh || !bHasGripSamples || !GripCalibrations[0].bValid || !GripCalibrations[1].bValid)
        return false;
    Calibrations[0] = GripCalibrations[0];
    Calibrations[1] = GripCalibrations[1];
    return true;
}

bool UFlowFestPropComponent::SampleVisibleGrips(FName Profile, float Seconds,
    FVector& LeftWorld, FVector& RightWorld) const
{
    if (!bHasGripSamples || !AvatarRoot || !FMath::IsFinite(Seconds)) return false;
    const TArray<FPropMotionFrame>* Frames = nullptr;
    float Fps = 0.f;
    bool bLoop = true;
    if (Profile == PerformanceProfile)
    {
        Frames = &PerformanceFrames;
        Fps = PerformanceFps;
        bLoop = bPerformanceLoop;
    }
    else for (const FPropMotionTrack& Track : OutgoingPerformanceTracks)
        if (Track.Profile == Profile)
        {
            Frames = &Track.Frames;
            Fps = Track.Fps;
            bLoop = Track.bLoop;
            break;
        }
    if (!Frames || Frames->IsEmpty() || Fps <= 0.f) return false;
    int32 First = 0, Second = 0;
    float Alpha = 0.f;
    if (!PropFrameIndices(Seconds, Fps, Frames->Num(), bLoop, First, Second, Alpha)) return false;
    const FTransform RootWorld = AvatarRoot->GetComponentTransform();
    LeftWorld = RootWorld.TransformPosition(FMath::Lerp(
        (*Frames)[First].Left.GetLocation(), (*Frames)[Second].Left.GetLocation(), Alpha));
    RightWorld = RootWorld.TransformPosition(FMath::Lerp(
        (*Frames)[First].Right.GetLocation(), (*Frames)[Second].Right.GetLocation(), Alpha));
    return !LeftWorld.ContainsNaN() && !RightWorld.ContainsNaN();
}

bool UFlowFestPropComponent::SamplePerformanceVisibility(FName Profile, float Seconds,
    bool (&Visible)[2]) const
{
    if (Profile != PerformanceProfile || PerformanceFrames.IsEmpty() ||
        !FMath::IsFinite(Seconds) || PerformanceFps <= 0.f) return false;
    int32 First = 0, Second = 0;
    float Alpha = 0.f;
    if (!PropFrameIndices(Seconds, PerformanceFps, PerformanceFrames.Num(),
        bPerformanceLoop, First, Second, Alpha)) return false;
    const FPropMotionFrame& Frame = PerformanceFrames[Alpha >= 1.f - 1e-6f ? Second : First];
    Visible[0] = Frame.PropVisible[0];
    Visible[1] = Frame.PropVisible[1];
    return true;
}

bool UFlowFestPropComponent::SnapshotHandLocalClearanceCapsules(
    TArray<FFlowArtsClearanceCapsule>& LeftCapsules,
    TArray<FFlowArtsClearanceCapsule>& RightCapsules, FVector (&GripOffsets)[2]) const
{
    LeftCapsules.Reset(); RightCapsules.Reset();
    GripOffsets[0] = GripOffsets[1] = FVector::ZeroVector;
    if (!HasVisibleGrip() || bPerformancePose || bReturningToHands) return false;
    const auto Add = [](const UStaticMeshComponent* Mesh, const USceneComponent* Visual,
        const USceneComponent* Root, const TArray<FFlowArtsClearanceCapsule>& LocalCapsules,
        TArray<FFlowArtsClearanceCapsule>& Out)
    {
        const FBox Box = Mesh->GetStaticMesh()->GetBoundingBox();
        if (!Box.IsValid) return;
        // These are the same attachment transforms used to render socket-driven props.
        // Read them before worker evaluation, then keep only plain value data.
        // Absolute root scale retains the prop's centimeter size. Only its grip
        // offset inherits skeletal scale; apply that separately at evaluation.
        FTransform GripOrientation = Root->GetRelativeTransform();
        GripOrientation.SetTranslation(FVector::ZeroVector);
        const FTransform MeshToHand = Mesh->GetRelativeTransform() *
            Visual->GetRelativeTransform() * GripOrientation;
        if (!LocalCapsules.IsEmpty())
        {
            const double RadiusScale = MeshToHand.GetScale3D().GetAbs().GetMax();
            for (const FFlowArtsClearanceCapsule& Local : LocalCapsules)
            {
                FFlowArtsClearanceCapsule Capsule;
                Capsule.Start = MeshToHand.TransformPosition(Local.Start);
                Capsule.End = MeshToHand.TransformPosition(Local.End);
                Capsule.RadiusCm = Local.RadiusCm * RadiusScale;
                Out.Add(Capsule);
            }
            return;
        }
        const FVector Extent = Box.GetExtent();
        const FVector ScaledExtent = Extent * MeshToHand.GetScale3D().GetAbs();
        const int32 Axis = ScaledExtent.X >= ScaledExtent.Y && ScaledExtent.X >= ScaledExtent.Z ? 0 :
            ScaledExtent.Y >= ScaledExtent.Z ? 1 : 2;
        FVector Along = FVector::ZeroVector;
        Along[Axis] = Extent[Axis];
        const double A = ScaledExtent[(Axis + 1) % 3], B = ScaledExtent[(Axis + 2) % 3];
        FFlowArtsClearanceCapsule Capsule;
        Capsule.Start = MeshToHand.TransformPosition(Box.GetCenter() - Along);
        Capsule.End = MeshToHand.TransformPosition(Box.GetCenter() + Along);
        Capsule.RadiusCm = FMath::Sqrt(A * A + B * B);
        if (!Capsule.Start.ContainsNaN() && !Capsule.End.ContainsNaN() && FMath::IsFinite(Capsule.RadiusCm))
            Out.Add(Capsule);
    };
    if (HandVisible[0]) Add(LeftMesh, LeftVisualRoot, LeftRoot, LeftMeshClearanceCapsules, LeftCapsules);
    if (HandVisible[1]) Add(RightMesh, RightVisualRoot, RightRoot, RightMeshClearanceCapsules, RightCapsules);
    GripOffsets[0] = LeftRoot->GetRelativeLocation();
    GripOffsets[1] = RightRoot->GetRelativeLocation();
    return !LeftCapsules.IsEmpty() || !RightCapsules.IsEmpty();
}

bool UFlowFestPropComponent::SnapshotPerformanceLocalClearanceCapsules(
    TArray<FFlowArtsClearanceCapsule>& LeftCapsules,
    TArray<FFlowArtsClearanceCapsule>& RightCapsules) const
{
    LeftCapsules.Reset(); RightCapsules.Reset();
    if (!IsReady()) return false;
    const auto Add = [](const UStaticMeshComponent* Mesh, const USceneComponent* Visual,
        const TArray<FFlowArtsClearanceCapsule>& LocalCapsules,
        TArray<FFlowArtsClearanceCapsule>& Out)
    {
        const FBox Box = Mesh->GetStaticMesh()->GetBoundingBox();
        if (!Box.IsValid) return;
        // Performance sampling composes these static transforms with the
        // payload's visual quaternion and root. Neither world location nor
        // the component's current animated root belongs in the cache key.
        const FTransform VisualBase(FQuat::Identity, Visual->GetRelativeLocation(),
            Visual->GetRelativeScale3D());
        const FTransform MeshToRoot = Mesh->GetRelativeTransform() * VisualBase;
        const double RadiusScale = MeshToRoot.GetScale3D().GetAbs().GetMax();
        if (!LocalCapsules.IsEmpty())
        {
            for (const FFlowArtsClearanceCapsule& Local : LocalCapsules)
                Out.Add({MeshToRoot.TransformPosition(Local.Start),
                    MeshToRoot.TransformPosition(Local.End), float(Local.RadiusCm * RadiusScale)});
            return;
        }
        const FVector Extent = Box.GetExtent();
        const FVector ScaledExtent = Extent * MeshToRoot.GetScale3D().GetAbs();
        const int32 Axis = ScaledExtent.X >= ScaledExtent.Y && ScaledExtent.X >= ScaledExtent.Z ? 0 :
            ScaledExtent.Y >= ScaledExtent.Z ? 1 : 2;
        FVector Along = FVector::ZeroVector;
        Along[Axis] = Extent[Axis];
        const double A = ScaledExtent[(Axis + 1) % 3], B = ScaledExtent[(Axis + 2) % 3];
        Out.Add({MeshToRoot.TransformPosition(Box.GetCenter() - Along),
            MeshToRoot.TransformPosition(Box.GetCenter() + Along), float(FMath::Sqrt(A * A + B * B))});
    };
    Add(LeftMesh, LeftVisualRoot, LeftMeshClearanceCapsules, LeftCapsules);
    Add(RightMesh, RightVisualRoot, RightMeshClearanceCapsules, RightCapsules);
    return !LeftCapsules.IsEmpty() && !RightCapsules.IsEmpty();
}

bool UFlowFestPropComponent::SampleClearanceCapsules(FName Profile, float Seconds,
    const FTransform& MeshToWorld, TArray<FFlowArtsClearanceCapsule>& LeftCapsules,
    TArray<FFlowArtsClearanceCapsule>& RightCapsules, const TArray<float>* RuntimeValues,
    const UFlowFestAnimInstance* Animator, const FVector* CurrentGripWorld,
    FVector* SampledRootWorld, FTransform* SampledRootAvatar,
    FQuat* SampledVisual) const
{
    LeftCapsules.Reset();
    RightCapsules.Reset();
    if (!bVisible || !IsReady() || !AvatarRoot || MeshToWorld.ContainsNaN()) return false;

    const TArray<FPropMotionFrame>* Frames = nullptr;
    float Fps = 0.f;
    bool bLoop = true;
    if (Profile == PerformanceProfile && !PerformanceFrames.IsEmpty())
    {
        Frames = &PerformanceFrames;
        Fps = PerformanceFps;
        bLoop = bPerformanceLoop;
    }
    else if (Profile != NAME_None)
    {
        for (const FPropMotionTrack& Track : OutgoingPerformanceTracks)
            if (Track.Profile == Profile && !Track.Frames.IsEmpty())
            {
                Frames = &Track.Frames;
                Fps = Track.Fps;
                bLoop = Track.bLoop;
                break;
            }
    }

    FTransform SampledLeft, SampledRight;
    bool SampledVisibility[2] = {true, true};
    if (Frames)
    {
        int32 First = 0, Second = 0;
        float Alpha = 0.f;
        if (!PropFrameIndices(Seconds, Fps, Frames->Num(), bLoop, First, Second, Alpha)) return false;
        const FPropMotionFrame& VisibilityFrame = (*Frames)[Alpha >= 1.f - 1e-6f ? Second : First];
        SampledVisibility[0] = VisibilityFrame.PropVisible[0];
        SampledVisibility[1] = VisibilityFrame.PropVisible[1];
    }
    else if (Profile == NAME_None)
    {
        SampledVisibility[0] = HandVisible[0];
        SampledVisibility[1] = HandVisible[1];
    }
    FQuat SampledLeftVisual = FQuat::Identity, SampledRightVisual = FQuat::Identity;
    FBlendedPerformancePose Blended;
    const bool bBlended = Animator && SampleBlendedPerformancePose(Seconds,
        Animator->GetPerformanceWeight(), Animator, Blended, CurrentGripWorld);
    if (bBlended)
    {
        SampledLeft = Blended.Frame.Left;
        SampledRight = Blended.Frame.Right;
        SampledLeftVisual = Blended.Frame.LeftVisual;
        SampledRightVisual = Blended.Frame.RightVisual;
    }
    else if (RuntimeValues)
    {
        if (RuntimeValues->Num() != 28) return false;
        for (const float Value : *RuntimeValues)
            if (!FMath::IsFinite(Value)) return false;
        const auto Rotation = [RuntimeValues](int32 Offset)
        {
            return FQuat((*RuntimeValues)[Offset], (*RuntimeValues)[Offset + 1],
                (*RuntimeValues)[Offset + 2], (*RuntimeValues)[Offset + 3]).GetNormalized();
        };
        SampledLeft = FTransform(Rotation(3),
            FVector((*RuntimeValues)[0], (*RuntimeValues)[1], (*RuntimeValues)[2]));
        SampledRight = FTransform(Rotation(10),
            FVector((*RuntimeValues)[7], (*RuntimeValues)[8], (*RuntimeValues)[9]));
        SampledLeftVisual = Rotation(20);
        SampledRightVisual = Rotation(24);
    }
    else if (Frames)
    {
        if (!FMath::IsFinite(Seconds) || Fps <= 0.f) return false;
        int32 First = 0, Second = 0;
        float Alpha = 0.f;
        if (!PropFrameIndices(Seconds, Fps, Frames->Num(), bLoop, First, Second, Alpha)) return false;
        SampledLeft.Blend((*Frames)[First].Left, (*Frames)[Second].Left, Alpha);
        SampledRight.Blend((*Frames)[First].Right, (*Frames)[Second].Right, Alpha);
        SampledLeftVisual = FQuat::Slerp((*Frames)[First].LeftVisual, (*Frames)[Second].LeftVisual, Alpha).GetNormalized();
        SampledRightVisual = FQuat::Slerp((*Frames)[First].RightVisual, (*Frames)[Second].RightVisual, Alpha).GetNormalized();
    }
    else if (Profile != NAME_None)
    {
        // A requested performance track must never silently use a previous
        // frame's attached transform as its collision target.
        return false;
    }

    const FTransform AvatarToWorld = AvatarRoot->GetComponentTransform();
    if (SampledRootWorld)
    {
        SampledRootWorld[0] = AvatarToWorld.TransformPosition(SampledLeft.GetLocation());
        SampledRootWorld[1] = AvatarToWorld.TransformPosition(SampledRight.GetLocation());
    }
    if (SampledRootAvatar)
    {
        SampledRootAvatar[0] = SampledLeft;
        SampledRootAvatar[1] = SampledRight;
    }
    if (SampledVisual)
    {
        SampledVisual[0] = SampledLeftVisual;
        SampledVisual[1] = SampledRightVisual;
    }
    const FTransform WorldToMesh = MeshToWorld.Inverse();
    const float MinimumMeshScale = FMath::Max(.001f,
        FMath::Min3(FMath::Abs(MeshToWorld.GetScale3D().X),
            FMath::Abs(MeshToWorld.GetScale3D().Y), FMath::Abs(MeshToWorld.GetScale3D().Z)));
    const auto AddCapsule = [&](const UStaticMeshComponent* Mesh,
        const FTransform& SampledRoot, const FQuat& Visual,
        const TArray<FFlowArtsClearanceCapsule>& LocalCapsules, TArray<FFlowArtsClearanceCapsule>& Capsules)
    {
        if (!Mesh || !Mesh->GetStaticMesh()) return;
        const FBox Box = Mesh->GetStaticMesh()->GetBoundingBox();
        if (!Box.IsValid) return;
        const FVector Center = Box.GetCenter();
        const FVector Extent = Box.GetExtent();
        const FVector Scale = Mesh->GetRelativeScale3D().GetAbs();
        const FVector ScaledExtent = Extent * Scale;
        const int32 Axis = ScaledExtent.X >= ScaledExtent.Y && ScaledExtent.X >= ScaledExtent.Z ? 0 :
            ScaledExtent.Y >= ScaledExtent.Z ? 1 : 2;
        FVector Along = FVector::ZeroVector;
        Along[Axis] = Extent[Axis];
        const float OtherA = ScaledExtent[(Axis + 1) % 3];
        const float OtherB = ScaledExtent[(Axis + 2) % 3];
        const float Radius = FMath::Max(1.f, FMath::Sqrt(OtherA * OtherA + OtherB * OtherB) / MinimumMeshScale);
        const auto ToWorld = [&](const FVector& Point)
        {
            if (!Frames && !RuntimeValues && !bBlended) return Mesh->GetComponentTransform().TransformPosition(Point);
            const FVector InVisual = Mesh->GetRelativeTransform().TransformPosition(Point);
            const FVector InProp = Visual.RotateVector(InVisual);
            const FVector InAvatar = SampledRoot.TransformPosition(InProp);
            return AvatarToWorld.TransformPosition(InAvatar);
        };
        if (!LocalCapsules.IsEmpty())
        {
            // Match the composed component scale that renders the mesh. Taking
            // each parent's largest axis separately inflates the radius when
            // those axes differ (for example a length-adjusted spinning prop).
            const USceneComponent* VisualRoot = Mesh->GetAttachParent();
            const FTransform SampledVisualTransform(Visual,
                VisualRoot ? VisualRoot->GetRelativeLocation() : FVector::ZeroVector,
                VisualRoot ? VisualRoot->GetRelativeScale3D() : FVector::OneVector);
            const FTransform SampledMeshWorld = Mesh->GetRelativeTransform() *
                SampledVisualTransform * SampledRoot * AvatarToWorld;
            const double WorldRadiusScale = !Frames && !RuntimeValues && !bBlended
                ? Mesh->GetComponentTransform().GetScale3D().GetAbs().GetMax()
                : SampledMeshWorld.GetScale3D().GetAbs().GetMax();
            for (const FFlowArtsClearanceCapsule& Local : LocalCapsules)
            {
                FFlowArtsClearanceCapsule Capsule;
                Capsule.Start = WorldToMesh.TransformPosition(ToWorld(Local.Start));
                Capsule.End = WorldToMesh.TransformPosition(ToWorld(Local.End));
                Capsule.RadiusCm = Local.RadiusCm * WorldRadiusScale / MinimumMeshScale;
                if (!Capsule.Start.ContainsNaN() && !Capsule.End.ContainsNaN() &&
                    FMath::IsFinite(Capsule.RadiusCm) && Capsule.RadiusCm > 0.f) Capsules.Add(Capsule);
            }
            return;
        }
        FFlowArtsClearanceCapsule Capsule;
        Capsule.Start = WorldToMesh.TransformPosition(ToWorld(Center - Along));
        Capsule.End = WorldToMesh.TransformPosition(ToWorld(Center + Along));
        Capsule.RadiusCm = Radius;
        if (!Capsule.Start.ContainsNaN() && !Capsule.End.ContainsNaN()) Capsules.Add(Capsule);
    };
    if (SampledVisibility[0]) AddCapsule(LeftMesh, SampledLeft, SampledLeftVisual, LeftMeshClearanceCapsules, LeftCapsules);
    if (SampledVisibility[1]) AddCapsule(RightMesh, SampledRight, SampledRightVisual, RightMeshClearanceCapsules, RightCapsules);
    return !LeftCapsules.IsEmpty() || !RightCapsules.IsEmpty();
}

bool UFlowFestPropComponent::SampleBlendedPerformancePose(float Seconds, float PoseWeight,
    const UFlowFestAnimInstance* Animator, FBlendedPerformancePose& Out,
    const FVector* CurrentGripWorld) const
{
    if (!Animator || !AvatarRoot || !BoundBodyMesh || Animator->GetOutgoingPerformanceCount() <= 0)
        return false;
    if (PerformanceFrames.IsEmpty() || !FMath::IsFinite(Seconds)) return false;
    int32 First = 0, Second = 0;
    float Alpha = 0.f;
    if (!PropFrameIndices(Seconds, PerformanceFps, PerformanceFrames.Num(),
        bPerformanceLoop, First, Second, Alpha)) return false;
    const FPropMotionFrame& A = PerformanceFrames[First];
    const FPropMotionFrame& B = PerformanceFrames[Second];
    auto Blend = [Alpha](const FTransform& From, const FTransform& To)
    {
        return FTransform(FQuat::Slerp(From.GetRotation(), To.GetRotation(), Alpha).GetNormalized(),
            FMath::Lerp(From.GetLocation(), To.GetLocation(), Alpha));
    };
    FVector BlendedLeftGrip = FVector::ZeroVector, BlendedRightGrip = FVector::ZeroVector;
    FVector BlendedLeftAnchor = FVector::ZeroVector, BlendedRightAnchor = FVector::ZeroVector;
    FQuat BlendedLeftVisual = FQuat::Identity, BlendedRightVisual = FQuat::Identity;
    const FTransform RootWorld = AvatarRoot->GetComponentTransform();
    const FQuat Spin = bSpin ? FQuat(FVector::UpVector, SpinPhase) : FQuat::Identity;
    const auto Natural = [this, &RootWorld, Spin, CurrentGripWorld](FName HandName, const FQuat& Basis, const FVector& Offset)
    {
        FTransform Hand = BoundBodyMesh->GetSocketTransform(HandName, RTS_World);
        if (CurrentGripWorld) Hand.SetLocation(
            CurrentGripWorld[HandName == TEXT("LeftHand") ? 0 : 1] - Hand.TransformVector(Offset));
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
    const FVector NaturalLeftGrip = RootWorld.InverseTransformPosition(CurrentGripWorld
        ? CurrentGripWorld[0] : BoundBodyMesh->GetSocketTransform(TEXT("LeftHand"), RTS_World).TransformPosition(LeftGripOffset));
    const FVector NaturalRightGrip = RootWorld.InverseTransformPosition(CurrentGripWorld
        ? CurrentGripWorld[1] : BoundBodyMesh->GetSocketTransform(TEXT("RightHand"), RTS_World).TransformPosition(RightGripOffset));
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
        int32 I = 0, J = 0;
        float Fraction = 0.f;
        if (!PropFrameIndices(Time, Track.Fps, Track.Frames.Num(), Track.bLoop, I, J, Fraction)) continue;
        FTransform L, R;
        L.Blend(Track.Frames[I].Left, Track.Frames[J].Left, Fraction);
        R.Blend(Track.Frames[I].Right, Track.Frames[J].Right, Fraction);
        Add(L, R, FMath::Lerp(Track.Frames[I].LeftGrip, Track.Frames[J].LeftGrip, Fraction),
            FMath::Lerp(Track.Frames[I].RightGrip, Track.Frames[J].RightGrip, Fraction),
            FQuat::Slerp(Track.Frames[I].LeftVisual, Track.Frames[J].LeftVisual, Fraction),
            FQuat::Slerp(Track.Frames[I].RightVisual, Track.Frames[J].RightVisual, Fraction), Weight);
        OutgoingWeight += Weight;
    }
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
        // Captured prop roots are the visible grip points. Reanchor the
        // blended roots to the current palm after the skeletal pose evaluates.
        Left.SetLocation(NaturalLeftGrip);
        Right.SetLocation(NaturalRightGrip);
        Out.Frame.Left = Left;
        Out.Frame.Right = Right;
        Out.Frame.LeftGrip = BlendedLeftGrip;
        Out.Frame.RightGrip = BlendedRightGrip;
        Out.Frame.LeftVisual = BlendedLeftVisual;
        Out.Frame.RightVisual = BlendedRightVisual;
        Out.LeftAnchor = BlendedLeftAnchor;
        Out.RightAnchor = BlendedRightAnchor;
        Out.OutgoingWeight = OutgoingWeight;
        Out.UsedTracks = MoveTemp(UsedTracks);
        return true;
    }
    return false;
}

bool UFlowFestPropComponent::SetPerformanceTime(float Seconds, float PoseWeight, const UFlowFestAnimInstance* Animator,
    const FVector& SharedComponentTranslation)
{
    if (PerformanceFrames.IsEmpty() || !FMath::IsFinite(Seconds)) return false;
    FVector EvaluatedPalm[2] = {LeftGripOffset, RightGripOffset};
    if (Animator) Animator->GetEvaluatedPalmLocalOffsets(EvaluatedPalm);
    int32 First = 0, Second = 0;
    float Alpha = 0.f;
    if (!PropFrameIndices(Seconds, PerformanceFps, PerformanceFrames.Num(),
        bPerformanceLoop, First, Second, Alpha)) return false;
    const FPropMotionFrame& A = PerformanceFrames[First];
    const FPropMotionFrame& B = PerformanceFrames[Second];
    // Rebuild roots from the immutable source sample each tick. Apply the
    // arm solver's common hand-plane translation once, after that sampling.
    // Incoming score owns presence during a clip transition; collision sampling
    // uses the same discrete frame, so a hidden prop has no invisible collider.
    const FPropMotionFrame& VisibilityFrame = Alpha >= 1.f - 1e-6f ? B : A;
    UpdateHandVisibility(VisibilityFrame.PropVisible[0], VisibilityFrame.PropVisible[1]);
    const FVector WorldTranslation = BoundBodyMesh && !SharedComponentTranslation.ContainsNaN()
        ? BoundBodyMesh->GetComponentTransform().TransformVector(SharedComponentTranslation) : FVector::ZeroVector;
    const FVector AvatarTranslation = AvatarRoot
        ? AvatarRoot->GetComponentTransform().InverseTransformVector(WorldTranslation) : FVector::ZeroVector;
    auto Blend = [Alpha](const FTransform& From, const FTransform& To)
    {
        return FTransform(FQuat::Slerp(From.GetRotation(), To.GetRotation(), Alpha).GetNormalized(),
            FMath::Lerp(From.GetLocation(), To.GetLocation(), Alpha));
    };
    bool bBlendOutgoing = false;
    FVector BlendedLeftGrip = FVector::ZeroVector, BlendedRightGrip = FVector::ZeroVector;
    FVector BlendedLeftAnchor = FVector::ZeroVector, BlendedRightAnchor = FVector::ZeroVector;
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
        FBlendedPerformancePose Sample;
        // The blended sampler anchors to evaluated palms. Undo the deliberate
        // translation there, otherwise it would be applied a second time below.
        const FVector SourceGrips[] = {
            BoundBodyMesh->GetSocketTransform(TEXT("LeftHand"), RTS_World).TransformPosition(EvaluatedPalm[0]) - WorldTranslation,
            BoundBodyMesh->GetSocketTransform(TEXT("RightHand"), RTS_World).TransformPosition(EvaluatedPalm[1]) - WorldTranslation};
        if (!SampleBlendedPerformancePose(Seconds, PoseWeight, Animator, Sample, SourceGrips)) return false;
        BlendedLeftGrip = Sample.Frame.LeftGrip;
        BlendedRightGrip = Sample.Frame.RightGrip;
        BlendedLeftAnchor = Sample.LeftAnchor;
        BlendedRightAnchor = Sample.RightAnchor;
        for (int32 Candidate = Sample.UsedTracks.Num() - 1; Candidate >= 0; --Candidate)
            if (!Sample.UsedTracks[Candidate]) OutgoingPerformanceTracks.RemoveAt(Candidate);
        bSwitchingPerformance = false;
        SetPerformanceTransforms(Sample.Frame.Left, Sample.Frame.Right, 1.f);
        LeftVisualRoot->SetRelativeRotation(Sample.Frame.LeftVisual);
        RightVisualRoot->SetRelativeRotation(Sample.Frame.RightVisual);
        bEnteringPerformance = Sample.OutgoingWeight > .001f || PoseWeight < .999f;
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
    FTransform CertifiedRoots[2];
    FQuat CertifiedVisuals[2];
    if (Animator && Animator->GetCertifiedPropSample(CertifiedRoots, CertifiedVisuals))
    {
        // The same sampled orientations formed the candidate capsules before
        // the arm clearance query. Keep render geometry exactly on that pose.
        LeftRoot->SetRelativeRotation(CertifiedRoots[0].GetRotation());
        RightRoot->SetRelativeRotation(CertifiedRoots[1].GetRotation());
        LeftRoot->SetRelativeScale3D(CertifiedRoots[0].GetScale3D());
        RightRoot->SetRelativeScale3D(CertifiedRoots[1].GetScale3D());
        LeftVisualRoot->SetRelativeRotation(CertifiedVisuals[0]);
        RightVisualRoot->SetRelativeRotation(CertifiedVisuals[1]);
    }
    if (LeftRoot && RightRoot)
    {
        // During entry the natural attachment already follows the corrected
        // wrists. Only its authored share still needs the common translation.
        const float TranslationWeight = bBlendOutgoing || PoseWeight >= .999f
            ? 1.f : FMath::Clamp(PoseWeight, 0.f, 1.f);
        LeftRoot->SetRelativeLocation(LeftRoot->GetRelativeLocation() + AvatarTranslation * TranslationWeight);
        RightRoot->SetRelativeLocation(RightRoot->GetRelativeLocation() + AvatarTranslation * TranslationWeight);
        // The visible grip is the prop root.  The paired solver may clamp a
        // wrist at its reach boundary, so attach both rendered roots to the
        // evaluated palms that its candidate capsules used.
        if (Animator && BoundBodyMesh)
        {
            LeftRoot->SetWorldLocation(BoundBodyMesh->GetSocketTransform(TEXT("LeftHand"), RTS_World)
                .TransformPosition(EvaluatedPalm[0]));
            RightRoot->SetWorldLocation(BoundBodyMesh->GetSocketTransform(TEXT("RightHand"), RTS_World)
                .TransformPosition(EvaluatedPalm[1]));
        }
    }
    if (bHasGripSamples && BoundBodyMesh && AvatarRoot)
    {
        const FTransform RootWorld = AvatarRoot->GetComponentTransform();
        const float Weight = FMath::Clamp(PoseWeight, 0.f, 1.f);
        const FQuat Spin = bSpin ? FQuat(FVector::UpVector, SpinPhase) : FQuat::Identity;
        const auto Error = [this, &RootWorld, &A, &B, Alpha, Weight, Spin, AvatarTranslation]
            (FName HandName, const FTransform& First, const FTransform& Second,
             const FVector& FirstGrip, const FVector& SecondGrip,
             const FQuat& Basis, const FVector& Offset, const USceneComponent* PropRoot)
        {
            const FTransform Hand = BoundBodyMesh->GetSocketTransform(HandName, RTS_World);
            const FVector HandLocal = RootWorld.InverseTransformPosition(Hand.GetLocation());
            const FVector CapturedGrip = FMath::Lerp(FirstGrip, SecondGrip, Alpha) + AvatarTranslation;
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
            LeftGripBasis, EvaluatedPalm[0], LeftRoot);
        const FVector2D RightError = Error(TEXT("RightHand"), A.Right, B.Right, A.RightGrip, B.RightGrip,
            RightGripBasis, EvaluatedPalm[1], RightRoot);
        GripErrorCm = FMath::Max(LeftError.X, RightError.X);
        PropAnchorErrorCm = FMath::Max(LeftError.Y, RightError.Y);
        ActualGripErrorCm = FMath::Max(FVector::Distance(
            BoundBodyMesh->GetSocketTransform(TEXT("LeftHand"), RTS_World).TransformPosition(EvaluatedPalm[0]),
            LeftRoot->GetComponentLocation()), FVector::Distance(
            BoundBodyMesh->GetSocketTransform(TEXT("RightHand"), RTS_World).TransformPosition(EvaluatedPalm[1]),
            RightRoot->GetComponentLocation()));
        if (bBlendOutgoing)
        {
            const FVector LeftHandLocal = RootWorld.InverseTransformPosition(
                BoundBodyMesh->GetSocketLocation(TEXT("LeftHand")));
            const FVector RightHandLocal = RootWorld.InverseTransformPosition(
                BoundBodyMesh->GetSocketLocation(TEXT("RightHand")));
            GripErrorCm = FMath::Max(FVector::Distance(LeftHandLocal, BlendedLeftGrip + AvatarTranslation),
                FVector::Distance(RightHandLocal, BlendedRightGrip + AvatarTranslation));
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
                UE_LOG(LogTemp, Warning, TEXT("Flow Fest source grip deviation=%.1f cm actual prop grip error=%.1f cm: %s / %s"),
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
    if (LeftRoot) LeftRoot->SetVisibility(bVisible && HandVisible[0], true);
    if (RightRoot) RightRoot->SetVisibility(bVisible && HandVisible[1], true);
    UpdateEffects();
}

void UFlowFestPropComponent::UpdateHandVisibility(bool bLeft, bool bRight)
{
    if (HandVisible[0] == bLeft && HandVisible[1] == bRight) return;
    HandVisible[0] = bLeft;
    HandVisible[1] = bRight;
    SetVisible(bVisible);
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

void UFlowFestPropComponent::SyncEffectPlayback(float Seconds, bool bPaused, float PlaybackRate)
{
    if (NiagaraEffects && FMath::IsFinite(Seconds) && FMath::IsFinite(PlaybackRate))
        NiagaraEffects->SyncPlayback(Seconds, bPaused, PlaybackRate);
}

void UFlowFestPropComponent::ResetEffectHistory()
{
    if (NiagaraEffects) NiagaraEffects->ResetHistory();
}

void UFlowFestPropComponent::UpdateEffects()
{
    const bool bFire = EffectFinish == TEXT("fire");
    const bool bLed = EffectFinish == TEXT("led");
    if (NiagaraEffects) NiagaraEffects->SetPresentation(EffectFinish, bVisible);
    for (int32 Side = 0; Side < 2; ++Side)
    {
        const bool bHandVisible = bVisible && HandVisible[Side];
        const auto& Lights = Side == 0 ? LeftEffectLights : RightEffectLights;
        const auto& Flames = Side == 0 ? LeftFlames : RightFlames;
        const auto& LEDs = Side == 0 ? LeftLEDs : RightLEDs;
        for (UPointLightComponent* Light : Lights)
        {
            if (!Light) continue;
            Light->SetLightColor(bFire ? FLinearColor(1.f,.19f,.03f) : FLinearColor(.05f,.45f,1.f));
            Light->SetIntensity(bHandVisible ? (bFire ? 25.f : bLed ? 3.f : 0.f) : 0.f);
        }
        for (UProceduralMeshComponent* Flame : Flames)
            if (Flame) Flame->SetVisibility(bHandVisible && bFire &&
                (!NiagaraEffects || !NiagaraEffects->IsAvailable()));
        for (UStaticMeshComponent* LED : LEDs)
            if (LED) LED->SetVisibility(bHandVisible && bLed);
    }
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
