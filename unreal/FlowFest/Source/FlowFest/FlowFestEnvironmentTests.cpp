// Material graph inspection needs editor data, which cooked game targets omit.
#if WITH_DEV_AUTOMATION_TESTS && WITH_EDITOR
#include "Misc/AutomationTest.h"
#include "Dom/JsonObject.h"
#include "Engine/StaticMesh.h"
#include "Engine/Texture.h"
#include "Materials/Material.h"
#include "Materials/MaterialExpressionTextureSample.h"
#include "Materials/MaterialInterface.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Sound/SoundWave.h"
#include "FlowFestWorld.h"

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

    const TSharedPtr<FJsonObject>* Surface = nullptr;
    if (TestTrue(TEXT("Registered ground family exists"), Site->TryGetObjectField(TEXT("groundSurface"), Surface) && Surface))
    {
        const int32 Width = (*Surface)->GetIntegerField(TEXT("width"));
        const int32 Height = (*Surface)->GetIntegerField(TEXT("height"));
        TArray<uint8> Mask;
        TestTrue(TEXT("Registered ground mask loads"),
            FFileHelper::LoadFileToArray(Mask, *(FPaths::ProjectContentDir() / TEXT("Data/ground-family-mask.rgba"))));
        TestEqual(TEXT("Registered ground mask has four channels per pixel"), Mask.Num(), Width * Height * 4);
        if (Mask.Num() == Width * Height * 4)
        {
            int32 Packed = 0, Meadow = 0, Litter = 0;
            for (int32 Pixel = 0; Pixel < Width * Height; ++Pixel)
            {
                Packed += Mask[Pixel * 4] > 127;
                Meadow += Mask[Pixel * 4 + 1] > 127;
                Litter += Mask[Pixel * 4 + 2] > 127;
            }
            TestTrue(TEXT("Registered ground mask distinguishes roads, clearing and woodland"),
                Packed > 100 && Meadow > 100 && Litter > 100);
        }
    }
    UMaterial* GroundMaterial = LoadObject<UMaterial>(nullptr,
        TEXT("/Game/FlowFest/Materials/M_Ground.M_Ground"));
    if (TestNotNull(TEXT("Imported registered ground material"), GroundMaterial))
    {
        TSet<FString> GroundTextures;
        for (const TObjectPtr<UMaterialExpression>& Expression : GroundMaterial->GetExpressions())
        {
            if (const UMaterialExpressionTextureSample* Sample = Cast<UMaterialExpressionTextureSample>(Expression.Get()))
            {
                TestNotNull(TEXT("Ground texture sample is bound"), Sample->Texture.Get());
                if (Sample->Texture) GroundTextures.Add(Sample->Texture->GetName());
            }
        }
        for (const TCHAR* Name : { TEXT("TerrainOrtho"), TEXT("GroundFamilyMask"), TEXT("GroundDetail"),
                                   TEXT("GroundMeadow"), TEXT("GroundLitter"), TEXT("GroundDamp") })
            TestTrue(*FString::Printf(TEXT("Ground material uses %s"), Name), GroundTextures.Contains(Name));
    }

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

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestSunPathTest, "FlowFest.Environment.SunPath",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowFestSunPathTest::RunTest(const FString& Parameters)
{
    // Toward the sun, in site axes: +X east, +Y south, +Z up.
    const auto TowardSun = [](float Hour) { return -AFlowFestWorld::SunRotationAt(Hour).Vector(); };
    TestTrue(TEXT("Morning sun is in the east"), TowardSun(9.f).X > .5f);
    TestTrue(TEXT("Noon sun is due south and high"), TowardSun(12.f).Y > .3f && FMath::Abs(TowardSun(12.f).X) < .01f && TowardSun(12.f).Z > .9f);
    TestTrue(TEXT("Evening sun is in the west"), TowardSun(17.5f).X < -.9f);
    TestTrue(TEXT("Dawn sun is north of east"), TowardSun(6.f).X > .9f && TowardSun(6.f).Y < 0.f);
    TestTrue(TEXT("Shadows swing through the afternoon"),
        FMath::Abs(FRotator::NormalizeAxis(AFlowFestWorld::SunRotationAt(17.5f).Yaw - AFlowFestWorld::SunRotationAt(13.f).Yaw)) > 60.f);
    TestTrue(TEXT("Sun is below the horizon at night"), TowardSun(23.f).Z < 0.f);
    return true;
}
#endif
