#if WITH_DEV_AUTOMATION_TESTS
#include "FlowFestPropComponent.h"

#include "Components/PointLightComponent.h"
#include "Components/SceneComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Dom/JsonObject.h"
#include "Engine/StaticMesh.h"
#include "StaticMeshResources.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "KismetProceduralMeshLibrary.h"
#include "Materials/MaterialInterface.h"
#include "Misc/AutomationTest.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "ProceduralMeshComponent.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "UObject/UObjectGlobals.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsImportedWickAlignmentTest,
    "FlowArts.Props.ImportedWickAlignment",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

namespace
{
struct FScopedWickWorld
{
    UWorld* World = nullptr;
    ~FScopedWickWorld() { if (World) World->DestroyWorld(false); }
};

UStaticMeshComponent* FindPropMesh(AActor* Owner, const FName Name)
{
    TArray<UStaticMeshComponent*> Components;
    Owner->GetComponents(Components);
    for (UStaticMeshComponent* Mesh : Components)
        if (Mesh && Mesh->GetFName() == Name) return Mesh;
    return nullptr;
}

TArray<FVector> ReadWickVertices(UStaticMesh* Mesh)
{
    TArray<FVector> Result;
    if (!Mesh) return Result;
    // The section info map is editor-only; the render data's sections carry the material index in cooked
    // builds too, where this test also compiles (Development targets build automation tests).
    const FStaticMeshRenderData* RenderData = Mesh->GetRenderData();
    if (!RenderData || RenderData->LODResources.Num() == 0) return Result;
    const FStaticMeshLODResources& Lod = RenderData->LODResources[0];
    for (int32 SectionIndex = 0; SectionIndex < Lod.Sections.Num(); ++SectionIndex)
    {
        const int32 MaterialIndex = Lod.Sections[SectionIndex].MaterialIndex;
        const TArray<FStaticMaterial>& Materials = Mesh->GetStaticMaterials();
        if (!Materials.IsValidIndex(MaterialIndex)) continue;
        const FString MaterialName = Materials[MaterialIndex].MaterialInterface
            ? Materials[MaterialIndex].MaterialInterface->GetName() : FString();
        if (!MaterialName.Contains(TEXT("Wick"))) continue;
        TArray<FVector> Vertices, Normals;
        TArray<int32> Triangles;
        TArray<FVector2D> UVs;
        TArray<FProcMeshTangent> Tangents;
        UKismetProceduralMeshLibrary::GetSectionFromStaticMesh(
            Mesh, 0, SectionIndex, Vertices, Triangles, Normals, UVs, Tangents);
        Result.Append(Vertices);
    }
    return Result;
}
}

bool FFlowArtsImportedWickAlignmentTest::RunTest(const FString& Parameters)
{
    FString Text;
    const FString CatalogPath = FPaths::ProjectContentDir() / TEXT("Data/props.json");
    TSharedPtr<FJsonObject> Catalog;
    if (!TestTrue(TEXT("Imported prop catalog loads"),
        FFileHelper::LoadFileToString(Text, *CatalogPath) &&
        FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Catalog) && Catalog.IsValid())) return false;
    const TArray<TSharedPtr<FJsonValue>>* Props = nullptr;
    if (!TestTrue(TEXT("Prop catalog contains families"),
        Catalog->TryGetArrayField(TEXT("props"), Props) && Props)) return false;

    FScopedWickWorld Fixture;
    UWorld::InitializationValues WorldSettings;
    WorldSettings.AllowAudioPlayback(false).CreatePhysicsScene(false).CreateNavigation(false).CreateAISystem(false);
    const FName WorldName = MakeUniqueObjectName(GetTransientPackage(), UWorld::StaticClass(),
        FName(TEXT("FlowFestWickTestWorld")));
    Fixture.World = UWorld::CreateWorld(EWorldType::Game, false, WorldName, GetTransientPackage(), true,
        ERHIFeatureLevel::Num, &WorldSettings);
    if (!TestNotNull(TEXT("Transient prop world"), Fixture.World)) return false;
    AActor* Actor = Fixture.World->SpawnActor<AActor>();
    if (!TestNotNull(TEXT("Transient prop actor"), Actor)) return false;
    USceneComponent* Root = NewObject<USceneComponent>(Actor);
    Actor->SetRootComponent(Root);
    Root->RegisterComponent();
    UFlowFestPropComponent* Prop = NewObject<UFlowFestPropComponent>(Actor);
    Prop->RegisterComponent();
    Prop->Initialize(Root);
    Prop->SetHandTransforms(
        FTransform(FRotator(11.f, -37.f, 8.f), FVector(-40.f, 20.f, 12.f)),
        FTransform(FRotator(-9.f, 83.f, -5.f), FVector(45.f, -10.f, 30.f)));
    UStaticMeshComponent* Meshes[] = {
        FindPropMesh(Actor, TEXT("FlowFestLeftPropMesh")),
        FindPropMesh(Actor, TEXT("FlowFestRightPropMesh"))
    };
    if (!TestNotNull(TEXT("Left imported mesh component"), Meshes[0]) ||
        !TestNotNull(TEXT("Right imported mesh component"), Meshes[1])) return false;

    int32 FireVariants = 0;
    for (const TSharedPtr<FJsonValue>& PropValue : *Props)
    {
        const TSharedPtr<FJsonObject> Family = PropValue->AsObject();
        if (!Family.IsValid()) continue;
        const TArray<TSharedPtr<FJsonValue>>* Variants = nullptr;
        if (!Family->TryGetArrayField(TEXT("variants"), Variants) || !Variants) continue;
        for (const TSharedPtr<FJsonValue>& VariantValue : *Variants)
        {
            const TSharedPtr<FJsonObject> Variant = VariantValue->AsObject();
            const TArray<TSharedPtr<FJsonValue>>* Attachments = nullptr;
            if (!Variant.IsValid() || !Variant->TryGetArrayField(TEXT("effectAttachments"), Attachments) ||
                !Attachments || Attachments->IsEmpty() || !(*Attachments)[0]->AsObject().IsValid() ||
                (*Attachments)[0]->AsObject()->GetStringField(TEXT("type")) != TEXT("fire")) continue;
            ++FireVariants;
            const FString Selection = Family->GetStringField(TEXT("id")) + TEXT(":") + Variant->GetStringField(TEXT("id"));
            const int32 LengthCases = Family->GetStringField(TEXT("id")) == TEXT("fire_double_staff") ? 2 : 1;
            for (int32 LengthCase = 0; LengthCase < LengthCases; ++LengthCase)
            {
                const float LengthCm = LengthCase ? 120.f : 0.f;
                if (!TestTrue(*FString::Printf(TEXT("Equip %s length %.0f"), *Selection, LengthCm),
                    Prop->Equip(FName(*Selection), LengthCm))) continue;
                // The pose changes after Equip, so an effect stuck at the previous
                // root position cannot pass merely because its local offset is right.
                Prop->SetHandTransforms(
                    FTransform(FRotator(-7.f, 51.f, 14.f), FVector(-18.f, -32.f, 45.f)),
                    FTransform(FRotator(15.f, -68.f, 4.f), FVector(33.f, 25.f, 19.f)));
                TArray<UPointLightComponent*> Lights;
                Actor->GetComponents(Lights);
                for (int32 Hand = 0; Hand < 2; ++Hand)
                {
                    UStaticMeshComponent* Mesh = Meshes[Hand];
                    const TArray<FVector> WickVertices = ReadWickVertices(Mesh->GetStaticMesh());
                    if (!TestTrue(*FString::Printf(TEXT("%s hand %d has imported wick geometry"), *Selection, Hand),
                        !WickVertices.IsEmpty())) continue;
                    int32 Count = 0;
                    for (UPointLightComponent* Light : Lights)
                    {
                        if (!Light || !Light->IsRegistered() || Light->GetAttachParent() != Mesh->GetAttachParent()) continue;
                        ++Count;
                        // Compare the actual component attachment with LOD0 wick vertices
                        // after the imported mesh's mirror, length scale, and hand pose.
                        const FVector WickSite = Mesh->GetComponentTransform().InverseTransformPosition(Light->GetComponentLocation());
                        float NearestCm = TNumericLimits<float>::Max();
                        for (const FVector& Vertex : WickVertices)
                            NearestCm = FMath::Min(NearestCm, FVector::Distance(WickSite, Vertex));
                        TestTrue(*FString::Printf(TEXT("%s hand %d attachment %d reaches imported wick (%.2f cm)"),
                            *Selection, Hand, Count, NearestCm), NearestCm < 4.f);
                    }
                    TestEqual(*FString::Printf(TEXT("%s hand %d has every wick attachment"), *Selection, Hand),
                        Count, Attachments->Num());
                }
            }
        }
    }
    TestTrue(TEXT("Catalog fire variants were exercised"), FireVariants >= 12);
    return true;
}
#endif
