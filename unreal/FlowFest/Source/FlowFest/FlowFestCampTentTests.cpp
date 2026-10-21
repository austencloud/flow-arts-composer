// Material graph inspection needs editor data, which cooked game targets omit.
#if WITH_DEV_AUTOMATION_TESTS && WITH_EDITOR
#include "Misc/AutomationTest.h"
#include "Engine/StaticMesh.h"
#include "Materials/Material.h"
#include "Materials/MaterialExpressionPerInstanceCustomData.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestCampTentAssetsTest, "FlowFest.Environment.CampTents",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// The import contract BuildCamps relies on: each camp piece exists at its authored
// height, and its fly or canopy fabric reads the colour BuildCamps gives each instance.
bool FFlowFestCampTentAssetsTest::RunTest(const FString& Parameters)
{
    struct FExpected { const TCHAR* Asset; float HeightCm; const TCHAR* Fabric; };
    const FExpected Pieces[] = {
        {TEXT("Tent"), 155.f, TEXT("Tent_fly_nylon")},
        {TEXT("DomeTent"), 144.f, TEXT("Tent_fly_nylon")},
        {TEXT("CampCanopy"), 275.f, TEXT("Canopy_fabric")},
        {TEXT("Canopy"), 305.f, TEXT("Canopy_fabric")},
    };
    for (const FExpected& Piece : Pieces)
    {
        const FString Path = FString::Printf(TEXT("/Game/FlowFest/Assets/Set/%s.%s"), Piece.Asset, Piece.Asset);
        const UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *Path);
        if (!TestNotNull(*FString::Printf(TEXT("%s imported"), Piece.Asset), Mesh)) continue;
        TestEqual(*FString::Printf(TEXT("%s height"), Piece.Asset), static_cast<float>(Mesh->GetBoundingBox().Max.Z), Piece.HeightCm, 3.f);
        bool bPainted = false;
        for (const FStaticMaterial& Slot : Mesh->GetStaticMaterials())
        {
            const UMaterial* Material = Slot.MaterialInterface ? Slot.MaterialInterface->GetMaterial() : nullptr;
            if (Material && Material->GetName() == Piece.Fabric)
                bPainted = Cast<UMaterialExpressionPerInstanceCustomData3Vector>(Material->GetEditorOnlyData()->BaseColor.Expression) != nullptr;
        }
        TestTrue(*FString::Printf(TEXT("%s fabric colour comes from each instance"), Piece.Asset), bPainted);
    }
    return true;
}
#endif
