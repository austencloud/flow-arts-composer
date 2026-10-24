// Material graph inspection needs editor data, which cooked game targets omit.
#if WITH_DEV_AUTOMATION_TESTS && WITH_EDITOR
#include "Misc/AutomationTest.h"
#include "Engine/StaticMesh.h"
#include "Materials/Material.h"
#include "Materials/MaterialExpressionPerInstanceCustomData.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestForestFloorAssetsTest, "FlowFest.Environment.ForestFloor",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

namespace
{
TSet<int32> CustomDataChannels(const UMaterial* Material)
{
    TSet<int32> Channels;
    for (const UMaterialExpression* Expression : Material->GetExpressions())
        if (const UMaterialExpressionPerInstanceCustomData* Data = Cast<UMaterialExpressionPerInstanceCustomData>(Expression))
            Channels.Add(Data->DataIndex);
    return Channels;
}
}

// The import contract the ecology component's forest floor relies on: four Nanite
// pieces at their authored sizes, litter and ferns coloured per instance, the log and
// stump in Megaplants bark, and the Megaplants dead branches it scatters.
bool FFlowFestForestFloorAssetsTest::RunTest(const FString& Parameters)
{
    struct FExpected { const TCHAR* Asset; float MinHeightCm; float MaxHeightCm; float MinWidthCm; };
    const FExpected Pieces[] = {
        {TEXT("LeafLitter"), 1.f, 6.f, 140.f},
        {TEXT("FernClump"), 35.f, 90.f, 60.f},
        {TEXT("FallenLog"), 25.f, 60.f, 380.f},
        {TEXT("Stump"), 35.f, 60.f, 70.f},
    };
    TMap<FString, const UStaticMesh*> Meshes;
    for (const FExpected& Piece : Pieces)
    {
        const FString Path = FString::Printf(TEXT("/Game/FlowFest/Assets/Floor/%s.%s"), Piece.Asset, Piece.Asset);
        const UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *Path);
        if (!TestNotNull(*FString::Printf(TEXT("%s imported"), Piece.Asset), Mesh)) continue;
        Meshes.Add(Piece.Asset, Mesh);
        const FBox Box = Mesh->GetBoundingBox();
        TestTrue(*FString::Printf(TEXT("%s height %.1f cm"), Piece.Asset, Box.Max.Z), Box.Max.Z >= Piece.MinHeightCm && Box.Max.Z <= Piece.MaxHeightCm);
        TestTrue(*FString::Printf(TEXT("%s width %.1f cm"), Piece.Asset, Box.GetSize().X), Box.GetSize().X >= Piece.MinWidthCm);
        TestTrue(*FString::Printf(TEXT("%s is Nanite"), Piece.Asset), Mesh->IsNaniteEnabled());
    }

    if (const UStaticMesh* const* Litter = Meshes.Find(TEXT("LeafLitter")))
    {
        const UMaterial* Material = (*Litter)->GetMaterial(0) ? (*Litter)->GetMaterial(0)->GetMaterial() : nullptr;
        if (TestNotNull(TEXT("Litter has a material"), Material))
        {
            TestEqual(TEXT("Litter material"), Material->GetName(), FString(TEXT("M_LeafLitter")));
            TestTrue(TEXT("Litter material renders in Nanite instances"),
                Material->GetUsageByFlag(MATUSAGE_Nanite) && Material->GetUsageByFlag(MATUSAGE_InstancedStaticMeshes));
            TestTrue(TEXT("Litter darkens per instance"), CustomDataChannels(Material).Contains(1));
        }
    }
    if (const UStaticMesh* const* Fern = Meshes.Find(TEXT("FernClump")))
    {
        const UMaterial* Material = (*Fern)->GetMaterial(0) ? (*Fern)->GetMaterial(0)->GetMaterial() : nullptr;
        if (TestNotNull(TEXT("Fern has a material"), Material))
        {
            TestEqual(TEXT("Fern material"), Material->GetName(), FString(TEXT("M_Fern")));
            TestTrue(TEXT("Fern is two-sided foliage"), Material->IsTwoSided() && Material->GetShadingModels().HasShadingModel(MSM_TwoSidedFoliage));
            // Voxelized Nanite foliage falls back to the default material without this usage.
            TestTrue(TEXT("Fern material allows voxels"), Material->GetUsageByFlag(MATUSAGE_Voxels));
            const TSet<int32> Channels = CustomDataChannels(Material);
            TestTrue(TEXT("Fern colour reads bronzing and brightness per instance"), Channels.Contains(0) && Channels.Contains(1));
        }
    }
    for (const TCHAR* Wood : { TEXT("FallenLog"), TEXT("Stump") })
        if (const UStaticMesh* const* Mesh = Meshes.Find(Wood))
        {
            TestEqual(*FString::Printf(TEXT("%s has bark and broken-end slots"), Wood), (*Mesh)->GetStaticMaterials().Num(), 2);
            for (const FStaticMaterial& Slot : (*Mesh)->GetStaticMaterials())
                TestTrue(*FString::Printf(TEXT("%s slot %s uses Megaplants wood"), Wood, *Slot.MaterialSlotName.ToString()),
                    Slot.MaterialInterface && Slot.MaterialInterface->GetPathName().StartsWith(TEXT("/Game/Megaplant_Library/")));
        }

    for (const TCHAR* Branch : { TEXT("Tree_European_Beech/Instances/Branch_European_Beech_Dead_01"), TEXT("Tree_Dead_Pine/Instances/Branch_Dead_Pine_00") })
    {
        const UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *FString::Printf(TEXT("/Game/Megaplant_Library/%s"), Branch));
        if (TestNotNull(*FString::Printf(TEXT("Dead branch %s loads"), Branch), Mesh))
            TestTrue(*FString::Printf(TEXT("Dead branch %s grows up from its base"), Branch), Mesh->GetBoundingBox().Min.Z > -1.f);
    }
    return true;
}
#endif
