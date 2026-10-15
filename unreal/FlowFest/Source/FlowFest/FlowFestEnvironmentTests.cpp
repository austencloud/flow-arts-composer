#if WITH_DEV_AUTOMATION_TESTS
#include "Misc/AutomationTest.h"
#include "Dom/JsonObject.h"
#include "Engine/StaticMesh.h"
#include "Materials/Material.h"
#include "Materials/MaterialExpressionTextureSample.h"
#include "Materials/MaterialInterface.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Sound/SoundWave.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestEnvironmentAssetsTest, "FlowFest.Environment.EcologyAndSoundAssets",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowFestEnvironmentAssetsTest::RunTest(const FString& Parameters)
{
    FString Source;
    if (!TestTrue(TEXT("Exported site.json is present"),
        FFileHelper::LoadFileToString(Source, *(FPaths::ProjectContentDir() / TEXT("Data/site.json"))))) return false;
    TSharedPtr<FJsonObject> Site;
    if (!TestTrue(TEXT("Exported site.json parses"),
        FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Source), Site) && Site.IsValid())) return false;

    const TArray<TSharedPtr<FJsonValue>>* Grass = nullptr;
    const TArray<TSharedPtr<FJsonValue>>* GroundLife = nullptr;
    if (!TestTrue(TEXT("Grass placements exist"), Site->TryGetArrayField(TEXT("grass"), Grass) && Grass)) return false;
    if (!TestTrue(TEXT("Understory placements exist"), Site->TryGetArrayField(TEXT("groundLife"), GroundLife) && GroundLife)) return false;
    TestTrue(TEXT("Source grass density retained"), Grass->Num() >= 20000);
    TestTrue(TEXT("Source understory retained"), GroundLife->Num() >= 20);

    const TSharedPtr<FJsonObject>* Audit = nullptr;
    if (TestTrue(TEXT("Ecology clearance audit exists"), Site->TryGetObjectField(TEXT("ecologyAudit"), Audit) && Audit))
    {
        TestEqual(TEXT("No grass intersects performer routes"), (*Audit)->GetIntegerField(TEXT("grassRouteIntrusions")), 0);
        TestEqual(TEXT("No understory intersects performer routes"), (*Audit)->GetIntegerField(TEXT("groundLifeRouteIntrusions")), 0);
    }
    for (const TCHAR* Name : { TEXT("ForestGrass"), TEXT("DampSedge"), TEXT("HazelShrub") })
    {
        const FString Path = FString::Printf(TEXT("/Game/FlowFest/Assets/Ecology/%s.%s"), Name, Name);
        UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *Path);
        if (TestNotNull(*FString::Printf(TEXT("Imported ecology mesh %s"), Name), Mesh))
        {
            TestTrue(*FString::Printf(TEXT("Ecology mesh %s has materials"), Name),
                !Mesh->GetStaticMaterials().IsEmpty());
            for (int32 Slot = 0; Slot < Mesh->GetStaticMaterials().Num(); ++Slot)
            {
                UMaterialInterface* Material = Mesh->GetMaterial(Slot);
                TestTrue(*FString::Printf(TEXT("Ecology material %s[%d] preserves double-sided source"), Name, Slot),
                    Material && Material->IsTwoSided());
                UMaterial* BaseMaterial = Material ? Material->GetMaterial() : nullptr;
                const FExpressionInput* Subsurface = BaseMaterial ?
                    BaseMaterial->GetExpressionInputForProperty(MP_SubsurfaceColor) : nullptr;
                TestTrue(*FString::Printf(TEXT("Ecology material %s[%d] has colored subsurface transmission"), Name, Slot),
                    Subsurface && Subsurface->Expression);
                int32 BoundSamples = 0;
                if (BaseMaterial)
                {
                    for (const TObjectPtr<UMaterialExpression>& Expression : BaseMaterial->GetExpressions())
                    {
                        if (const UMaterialExpressionTextureSample* Sample = Cast<UMaterialExpressionTextureSample>(Expression.Get()))
                        {
                            TestNotNull(*FString::Printf(TEXT("Ecology %s[%d] texture sample is bound"), Name, Slot),
                                Sample->Texture.Get());
                            BoundSamples += Sample->Texture ? 1 : 0;
                        }
                    }
                }
                TestTrue(*FString::Printf(TEXT("Ecology material %s[%d] uses source textures"), Name, Slot),
                    BoundSamples > 0);
            }
        }
    }
    for (const TCHAR* Name : { TEXT("WoodlandWind"), TEXT("Birds"), TEXT("Insects"), TEXT("Camp"), TEXT("Fire"), TEXT("Crowd") })
    {
        const FString Path = FString::Printf(TEXT("/Game/FlowFest/Audio/%s.%s"), Name, Name);
        USoundWave* Wave = LoadObject<USoundWave>(nullptr, *Path);
        if (TestNotNull(*FString::Printf(TEXT("Imported sound wave %s"), Name), Wave))
            TestTrue(*FString::Printf(TEXT("Sound wave %s loops"), Name), Wave->bLooping);
    }
    return true;
}
#endif
