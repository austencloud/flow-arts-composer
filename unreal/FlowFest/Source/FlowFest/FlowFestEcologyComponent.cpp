#include "FlowFestEcologyComponent.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Dom/JsonObject.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Engine/StaticMesh.h"

namespace
{
float Num(const TSharedPtr<FJsonObject>& Object, const TCHAR* Key, float Default = 0.f)
{
    double Value = Default;
    return Object->TryGetNumberField(Key, Value) ? static_cast<float>(Value) : Default;
}

UStaticMesh* EcologyMesh(const TCHAR* Name)
{
    const FString Path = FString::Printf(TEXT("/Game/FlowFest/Assets/Ecology/%s.%s"), Name, Name);
    return LoadObject<UStaticMesh>(nullptr, *Path);
}
}

UFlowFestEcologyComponent::UFlowFestEcologyComponent()
{
    PrimaryComponentTick.bCanEverTick = false;
}

bool UFlowFestEcologyComponent::BuildFromSite()
{
    FString Source;
    if (!FFileHelper::LoadFileToString(Source, *(FPaths::ProjectContentDir() / TEXT("Data/site.json")))) return false;
    TSharedPtr<FJsonObject> Site;
    if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Source), Site) || !Site.IsValid()) return false;

    struct FFamily { const TCHAR* Asset; const TCHAR* Species; };
    const FFamily Families[] = {
        { TEXT("ForestGrass"), TEXT("grass") },
        { TEXT("DampSedge"), TEXT("damp-sedge-tussock") },
        { TEXT("HazelShrub"), TEXT("woodland-hazel-shrub") },
    };
    int32 Total = 0;
    for (int32 FamilyIndex = 0; FamilyIndex < 3; ++FamilyIndex)
    {
        UStaticMesh* Mesh = EcologyMesh(Families[FamilyIndex].Asset);
        if (!Mesh)
        {
            UE_LOG(LogTemp, Warning, TEXT("Flow Fest ecology mesh unavailable: %s"), Families[FamilyIndex].Asset);
            continue;
        }
        UHierarchicalInstancedStaticMeshComponent* Group = NewObject<UHierarchicalInstancedStaticMeshComponent>(GetOwner());
        Group->SetStaticMesh(Mesh);
        Group->SetupAttachment(this);
        Group->RegisterComponent();
        Group->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        Group->SetCastShadow(FamilyIndex != 0);
        Group->SetCullDistances(800, FamilyIndex == 0 ? 5800 : 9000);
        for (int32 Slot = 0; Slot < Mesh->GetStaticMaterials().Num(); ++Slot)
        {
            UMaterialInterface* ParentMaterial = Mesh->GetMaterial(Slot);
            if (!ParentMaterial) continue;
            UMaterialInstanceDynamic* Dynamic = UMaterialInstanceDynamic::Create(ParentMaterial, this);
            Dynamic->SetScalarParameterValue(TEXT("WindStrength"), WindStrength);
            Group->SetMaterial(Slot, Dynamic);
            WindMaterials.Add(Dynamic);
        }
        Groups.Add(Group);
        const TArray<TSharedPtr<FJsonValue>>* Items = nullptr;
        if (!Site->TryGetArrayField(FamilyIndex == 0 ? TEXT("grass") : TEXT("groundLife"), Items) || !Items) continue;
        const float SourceHeightCm = FMath::Max(1.f, Mesh->GetBounds().BoxExtent.Z * 2.f);
        for (const TSharedPtr<FJsonValue>& Value : *Items)
        {
            const TSharedPtr<FJsonObject> Placement = Value->AsObject();
            if (!Placement.IsValid()) continue;
            if (FamilyIndex != 0 && Placement->GetStringField(TEXT("species")) != Families[FamilyIndex].Species) continue;
            const float East = Num(Placement, TEXT("x"));
            const float South = Num(Placement, TEXT("z"));
            // Exported y is already relative to the site's NAVD88 vertical origin.
            const float Ground = Num(Placement, TEXT("y")) * 100.f;
            const float Rotation = -FMath::RadiansToDegrees(Num(Placement, TEXT("rotation")));
            FVector Scale;
            if (FamilyIndex == 0)
            {
                const float Height = Num(Placement, TEXT("heightMeters"), 0.35f) * 100.f / SourceHeightCm;
                // The authored GLB contains several grass blades. Preserve its silhouette while
                // matching the exported patch height and avoiding giant close-ground clumps.
                Scale = FVector(Height);
            }
            else Scale = FVector(Num(Placement, TEXT("scale"), 1.f));
            Group->AddInstance(FTransform(FRotator(0.f, Rotation, 0.f), FVector(East * 100.f, South * 100.f, Ground), Scale));
            ++Total;
        }
    }
    UE_LOG(LogTemp, Display, TEXT("Flow Fest native ecology: %d source placements in %d families"), Total, Groups.Num());
    return Total > 0;
}

void UFlowFestEcologyComponent::SetViewDistances(float GrassNearCm, float GrassFarCm, float UnderstoryFarCm)
{
    for (int32 Index = 0; Index < Groups.Num(); ++Index)
        if (Groups[Index]) Groups[Index]->SetCullDistances(FMath::RoundToInt(GrassNearCm), FMath::RoundToInt(Index == 0 ? GrassFarCm : UnderstoryFarCm));
}

void UFlowFestEcologyComponent::SetWindStrength(float Strength)
{
    WindStrength = FMath::Clamp(Strength, 0.f, 1.f);
    for (UMaterialInstanceDynamic* Material : WindMaterials)
        if (Material) Material->SetScalarParameterValue(TEXT("WindStrength"), WindStrength);
}
