// Asset inspection needs editor data, which cooked game targets omit.
#if WITH_DEV_AUTOMATION_TESTS && WITH_EDITOR
#include "Misc/AutomationTest.h"
#include "Dom/JsonObject.h"
#include "DynamicWindSkeletalData.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestTreeAssetsTest, "FlowFest.Environment.Trees",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowFestTreeAssetsTest::RunTest(const FString& Parameters)
{
    FString Source;
    if (!TestTrue(TEXT("Exported site.json is present"),
        FFileHelper::LoadFileToString(Source, *(FPaths::ProjectContentDir() / TEXT("Data/site.json"))))) return false;
    TSharedPtr<FJsonObject> Site;
    if (!TestTrue(TEXT("Exported site.json parses"),
        FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Source), Site) && Site.IsValid())) return false;

    TSet<FString> Families;
    int32 Counts[2] = {0, 0};
    const TCHAR* Layers[2] = {TEXT("trees"), TEXT("backdropTrees")};
    for (int32 Layer = 0; Layer < 2; ++Layer)
    {
        const TArray<TSharedPtr<FJsonValue>>* Items = nullptr;
        if (!TestTrue(*FString::Printf(TEXT("%s placements exist"), Layers[Layer]),
            Site->TryGetArrayField(Layers[Layer], Items) && Items)) return false;
        for (const TSharedPtr<FJsonValue>& Item : *Items)
        {
            const TSharedPtr<FJsonObject> Object = Item->AsObject();
            FString Family;
            if (Object.IsValid() && Object->TryGetStringField(TEXT("family"), Family) && !Family.IsEmpty())
            {
                Families.Add(Family);
                ++Counts[Layer];
            }
        }
    }
    TestEqual(TEXT("Measured near placements"), Counts[0], 677);
    TestEqual(TEXT("Measured backdrop placements"), Counts[1], 2162);
    TestEqual(TEXT("Thirty-nine grown families"), Families.Num(), 39);

    for (const FString& Family : Families)
    {
        FString Normalized = Family;
        Normalized.ReplaceInline(TEXT("-"), TEXT("_"));
        const FString Folder = FString::Printf(TEXT("/Game/FlowFest/Assets/Trees/%s"), *Normalized);
        USkeletalMesh* Live = LoadObject<USkeletalMesh>(nullptr, *FString::Printf(TEXT("%s/%s_Live.%s_Live"), *Folder, *Normalized, *Normalized));
        if (TestNotNull(*FString::Printf(TEXT("Grown live tree %s"), *Family), Live))
        {
            TestTrue(*FString::Printf(TEXT("Live tree %s is Nanite"), *Family), Live->IsNaniteEnabled());
            TestTrue(*FString::Printf(TEXT("Live tree %s carries Dynamic Wind data"), *Family),
                Live->HasAssetUserDataOfClass(UDynamicWindSkeletalData::StaticClass()));
            TestTrue(*FString::Printf(TEXT("Live tree %s has materials"), *Family), !Live->GetMaterials().IsEmpty());
        }
        UStaticMesh* Far = LoadObject<UStaticMesh>(nullptr, *FString::Printf(TEXT("%s/%s_Far.%s_Far"), *Folder, *Normalized, *Normalized));
        if (TestNotNull(*FString::Printf(TEXT("Grown far tree %s"), *Family), Far))
        {
            TestTrue(*FString::Printf(TEXT("Far tree %s is Nanite"), *Family), Far->IsNaniteEnabled());
            TestTrue(*FString::Printf(TEXT("Far tree %s has materials"), *Family), !Far->GetStaticMaterials().IsEmpty());
        }
    }
    return true;
}
#endif
