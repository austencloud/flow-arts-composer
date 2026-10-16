#include "FlowArtsPerformancePictographs.h"
#include "HAL/FileManager.h"
#include "HAL/PlatformFileManager.h"
#include "Misc/AutomationTest.h"
#include "Misc/FileHelper.h"
#include "Misc/Guid.h"
#include "Misc/Paths.h"

#if WITH_DEV_AUTOMATION_TESTS
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsPerformancePictographsTest,
    "FlowArts.PerformancePictographs.SealedTimeline",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsPerformancePictographsTest::RunTest(const FString& Parameters)
{
    const FString SequenceHash = TEXT("b1416d3478183be349db90db3390a741d47af73f286dc42ba65b5d8a3f08a99f");
    const FString ImageHash = TEXT("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const FString LibraryJson = FString::Printf(TEXT("{\"schema\":\"tka-performance-library-v1\",\"entries\":[{"
        "\"id\":\"x-bot/M_Test\",\"characterId\":\"x-bot\",\"profile\":\"M_Test\",\"propFamily\":\"staff\","
        "\"title\":\"Test\",\"sequenceSHA256\":\"%s\","
        "\"sequenceJson\":\"{\\\"steps\\\":[{\\\"letter\\\":\\\"D\\\",\\\"duration\\\":1},{\\\"letter\\\":\\\"E\\\",\\\"duration\\\":1}]}\","
        "\"durationSeconds\":1,\"scoreUnitsPerSecond\":2}]}"), *SequenceHash);
    FFlowArtsPerformanceLibrary Library;
    FString Error;
    if (!TestTrue(TEXT("Fixture library parses"), FFlowArtsPerformanceLibrary::Parse(LibraryJson, Library, Error)))
        return false;

    const FString DataDir = FPaths::ProjectSavedDir() / TEXT("PictographTest-") + FGuid::NewGuid().ToString();
    const FString ImageDir = DataDir / TEXT("Pictographs") /
        (SequenceHash + TEXT("-staff-light-v1"));
    if (!TestTrue(TEXT("Test image directory created"),
        FPlatformFileManager::Get().GetPlatformFile().CreateDirectoryTree(*ImageDir))) return false;
    const TArray<uint8> ImageBytes{ 'a', 'b', 'c' };
    TestTrue(TEXT("First image written"), FFileHelper::SaveArrayToFile(ImageBytes, *(ImageDir / TEXT("step-0000.png"))));
    TestTrue(TEXT("Second image written"), FFileHelper::SaveArrayToFile(ImageBytes, *(ImageDir / TEXT("step-0001.png"))));

    const FString Sidecar = FString::Printf(TEXT("{\"schema\":\"tka-performance-pictographs-v1\",\"entries\":[{"
        "\"id\":\"x-bot/M_Test\",\"sequenceSHA256\":\"%s\",\"steps\":["
        "{\"index\":0,\"letter\":\"D\",\"startSeconds\":0,\"endSeconds\":0.5,\"image\":\"Pictographs/%s-staff-light-v1/step-0000.png\",\"imageSHA256\":\"%s\"},"
        "{\"index\":1,\"letter\":\"E\",\"startSeconds\":0.5,\"endSeconds\":1,\"image\":\"Pictographs/%s-staff-light-v1/step-0001.png\",\"imageSHA256\":\"%s\"}]}]}"),
        *SequenceHash, *SequenceHash, *ImageHash, *SequenceHash, *ImageHash);
    FFlowArtsPerformancePictographs Pictographs;
    TestTrue(TEXT("Valid sealed images and timeline load"),
        FFlowArtsPerformancePictographs::Parse(Sidecar, Library, DataDir, Pictographs, Error));
    const FFlowArtsPictographSequence* Sequence = Pictographs.Find(Library.GetEntries()[0]);
    if (TestNotNull(TEXT("Exact library entry finds pictographs"), Sequence))
    {
        TestEqual(TEXT("Initial step"), Sequence->FindStep(0.f), 0);
        TestEqual(TEXT("Before boundary"), Sequence->FindStep(.499f), 0);
        TestEqual(TEXT("Boundary selects next step"), Sequence->FindStep(.5f), 1);
        TestEqual(TEXT("Duration endpoint remains visible"), Sequence->FindStep(1.f), 1);
        TestEqual(TEXT("After duration is out of range"), Sequence->FindStep(1.001f), INDEX_NONE);
        TestEqual(TEXT("Negative time is out of range"), Sequence->FindStep(-.01f), INDEX_NONE);
    }

    FFlowArtsPerformanceEntry StaleEntry = Library.GetEntries()[0];
    StaleEntry.SequenceSHA256[0] = TEXT('a');
    TestTrue(TEXT("Stale library hash cannot find images"), Pictographs.Find(StaleEntry) == nullptr);
    const FString Traversal = Sidecar.Replace(
        *FString::Printf(TEXT("Pictographs/%s-staff-light-v1/step-0000.png"), *SequenceHash), TEXT("../outside.png"));
    TestFalse(TEXT("Traversal image path rejected"),
        FFlowArtsPerformancePictographs::Parse(Traversal, Library, DataDir, Pictographs, Error));
    TestNotNull(TEXT("Failed parse preserves previous valid sidecar"), Pictographs.Find(Library.GetEntries()[0]));
    TestFalse(TEXT("Malformed sidecar rejected"),
        FFlowArtsPerformancePictographs::Parse(TEXT("{"), Library, DataDir, Pictographs, Error));
    const FString StaleSidecar = Sidecar.Replace(
        *FString::Printf(TEXT("\"sequenceSHA256\":\"%s\""), *SequenceHash),
        TEXT("\"sequenceSHA256\":\"a1416d3478183be349db90db3390a741d47af73f286dc42ba65b5d8a3f08a99f\""));
    TestFalse(TEXT("Sidecar hash must match the sealed library"),
        FFlowArtsPerformancePictographs::Parse(StaleSidecar, Library, DataDir, Pictographs, Error));
    const FString WrongLetter = Sidecar.Replace(TEXT("\"letter\":\"D\""), TEXT("\"letter\":\"Z\""));
    TestFalse(TEXT("Letter must match sealed sequence"),
        FFlowArtsPerformancePictographs::Parse(WrongLetter, Library, DataDir, Pictographs, Error));
    const FString WrongTime = Sidecar.Replace(TEXT("\"endSeconds\":0.5"), TEXT("\"endSeconds\":0.7"));
    TestFalse(TEXT("Timeline cannot drift from capture"),
        FFlowArtsPerformancePictographs::Parse(WrongTime, Library, DataDir, Pictographs, Error));
    const FString WrongHash = Sidecar.Replace(*ImageHash, TEXT("aa7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
    TestFalse(TEXT("Image byte hash mismatch rejected"),
        FFlowArtsPerformancePictographs::Parse(WrongHash, Library, DataDir, Pictographs, Error));
    IFileManager::Get().DeleteDirectory(*DataDir, false, true);
    return true;
}
#endif
