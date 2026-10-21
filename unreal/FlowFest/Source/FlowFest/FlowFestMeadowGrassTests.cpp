// Material graph inspection needs editor data, which cooked game targets omit.
#if WITH_DEV_AUTOMATION_TESTS && WITH_EDITOR
#include "Misc/AutomationTest.h"
#include "Engine/StaticMesh.h"
#include "Materials/Material.h"
#include "Materials/MaterialExpressionPerInstanceCustomData.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestMeadowGrassAssetsTest, "FlowFest.Environment.MeadowGrass",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// The import contract the ecology component relies on: three Nanite grass meshes at
// their authored heights, sharing one two-sided foliage material whose colour reads
// each instance's dryness and brightness.
bool FFlowFestMeadowGrassAssetsTest::RunTest(const FString& Parameters)
{
    struct FExpected { const TCHAR* Asset; float MinHeightCm; float MaxHeightCm; };
    const FExpected Pieces[] = {
        {TEXT("MeadowPatch"), 35.f, 55.f},
        {TEXT("StubbleTuft"), 10.f, 20.f},
        {TEXT("SeedStalks"), 60.f, 100.f},
    };
    for (const FExpected& Piece : Pieces)
    {
        const FString Path = FString::Printf(TEXT("/Game/FlowFest/Assets/Meadow/%s.%s"), Piece.Asset, Piece.Asset);
        const UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *Path);
        if (!TestNotNull(*FString::Printf(TEXT("%s imported"), Piece.Asset), Mesh)) continue;
        const float Height = Mesh->GetBoundingBox().Max.Z;
        TestTrue(*FString::Printf(TEXT("%s height %.1f cm"), Piece.Asset, Height), Height >= Piece.MinHeightCm && Height <= Piece.MaxHeightCm);
        TestTrue(*FString::Printf(TEXT("%s is Nanite"), Piece.Asset), Mesh->IsNaniteEnabled());
        const UMaterial* Material = Mesh->GetMaterial(0) ? Mesh->GetMaterial(0)->GetMaterial() : nullptr;
        if (!TestNotNull(*FString::Printf(TEXT("%s has a material"), Piece.Asset), Material)) continue;
        TestEqual(*FString::Printf(TEXT("%s material"), Piece.Asset), Material->GetName(), FString(TEXT("M_MeadowGrass")));
        TestTrue(*FString::Printf(TEXT("%s is two-sided foliage"), Piece.Asset),
            Material->IsTwoSided() && Material->GetShadingModels().HasShadingModel(MSM_TwoSidedFoliage));
        // Voxelized Nanite foliage falls back to the default material (black blades) without this usage.
        TestTrue(*FString::Printf(TEXT("%s material allows voxels"), Piece.Asset), Material->GetUsageByFlag(MATUSAGE_Voxels));
        TSet<int32> Channels;
        for (const UMaterialExpression* Expression : Material->GetExpressions())
            if (const UMaterialExpressionPerInstanceCustomData* Data = Cast<UMaterialExpressionPerInstanceCustomData>(Expression))
                Channels.Add(Data->DataIndex);
        TestTrue(*FString::Printf(TEXT("%s colour reads dryness and brightness per instance"), Piece.Asset), Channels.Contains(0) && Channels.Contains(1));
    }
    return true;
}
#endif
