// Material graph inspection needs editor data, which cooked game targets omit.
#if WITH_DEV_AUTOMATION_TESTS && WITH_EDITOR
#include "Misc/AutomationTest.h"
#include "Engine/StaticMesh.h"
#include "Materials/Material.h"
#include "Materials/MaterialExpressionPerInstanceCustomData.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestParkedCarAssetsTest, "FlowFest.Environment.ParkedCarBodies",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// The import contract BuildVehicles relies on: every web catalogue body exists at its
// measured length with the tyres at z = 0, and each painted body reads its colour from
// per-instance data. Lengths come from flow-fest-parked-car-catalog.ts.
bool FFlowFestParkedCarAssetsTest::RunTest(const FString& Parameters)
{
    struct FExpected { const TCHAR* Asset; float LengthCm; const TCHAR* PaintMaterial; };
    const FExpected Bodies[] = {
        {TEXT("FairheavenSedan"), 500.f, TEXT("Fairheaven_LT80_Bodymat")},
        {TEXT("FairheavenWagon"), 503.f, TEXT("Fairheaven_LT80_Bodymat")},
        {TEXT("LightbodyPickup"), 493.f, TEXT("krmlgtbdy85_Bodymat")},
        {TEXT("BokarooSuv"), 459.f, TEXT("BUCKAROO_67_Bodymat")},
        {TEXT("AceHatchback"), 384.f, TEXT("Ace11_Bodymat")},
        {TEXT("T2Camper"), 428.f, nullptr},
    };
    for (const FExpected& Body : Bodies)
    {
        const FString Path = FString::Printf(TEXT("/Game/FlowFest/Assets/Car/%s/SM_%s.SM_%s"), Body.Asset, Body.Asset, Body.Asset);
        const UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *Path);
        if (!TestNotNull(*FString::Printf(TEXT("%s imported"), Body.Asset), Mesh)) continue;
        const FBox Box = Mesh->GetBoundingBox();
        TestEqual(*FString::Printf(TEXT("%s nose-to-tail length"), Body.Asset), static_cast<float>(Box.GetSize().X), Body.LengthCm, 2.f);
        TestEqual(*FString::Printf(TEXT("%s tyres rest on z = 0"), Body.Asset), static_cast<float>(Box.Min.Z), 0.f, 1.f);
        TestTrue(*FString::Printf(TEXT("%s has collision"), Body.Asset), Mesh->GetBodySetup() != nullptr);
        if (!Body.PaintMaterial) continue;
        bool bPainted = false;
        for (const FStaticMaterial& Slot : Mesh->GetStaticMaterials())
        {
            const UMaterial* Material = Slot.MaterialInterface ? Slot.MaterialInterface->GetMaterial() : nullptr;
            // Unreal numbers repeat names across folders (Fairheaven_LT80_Bodymat_001).
            if (Material && (Material->GetName() == Body.PaintMaterial || Material->GetName().StartsWith(FString(Body.PaintMaterial) + TEXT("_0"))))
                bPainted = Cast<UMaterialExpressionPerInstanceCustomData3Vector>(Material->GetEditorOnlyData()->BaseColor.Expression) != nullptr;
        }
        TestTrue(*FString::Printf(TEXT("%s body paint comes from each instance"), Body.Asset), bPainted);
    }
    return true;
}
#endif
