#include "FlowArtsPerformanceLibrary.h"
#include "FlowArtsPerformanceSession.h"
#include "Misc/AutomationTest.h"
#include <limits>

#if WITH_DEV_AUTOMATION_TESTS
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsPerformanceLibraryTest,
    "FlowArts.PerformanceLibrary.ExactTransfer",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsPerformanceLibraryTest::RunTest(const FString& Parameters)
{
    const FString Hash = TEXT("44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a");
    const FString LibraryJson = FString::Printf(TEXT("{\"schema\":\"tka-performance-library-v1\",\"entries\":["
        "{\"id\":\"x-bot/M_Test\",\"characterId\":\"x-bot\",\"profile\":\"M_Test\",\"propFamily\":\"staff\","
        "\"title\":\"Test\",\"sequenceSHA256\":\"%s\",\"sequenceJson\":\"{}\",\"durationSeconds\":8,\"scoreUnitsPerSecond\":2}]}"), *Hash);
    FFlowArtsPerformanceLibrary Library;
    FString Error;
    TestTrue(TEXT("Valid sealed snapshot loads"), FFlowArtsPerformanceLibrary::Parse(LibraryJson, Library, Error));
    TestEqual(TEXT("One prepared entry"), Library.GetEntries().Num(), 1);

    FFlowArtsPerformanceTransfer Transfer;
    const FString TransferJson = FString::Printf(TEXT("{\"schema\":\"tka-performance-transfer-v1\","
        "\"sequenceSHA256\":\"%s\",\"sequenceJson\":\"{}\","
        "\"selection\":{\"characterId\":\"x-bot\",\"propFamily\":\"staff\"},"
        "\"playback\":{\"phase\":0.5,\"rate\":1,\"paused\":true}}"), *Hash);
    TestTrue(TEXT("Valid transfer parses"), FFlowArtsPerformanceLibrary::ParseTransfer(TransferJson, Transfer, Error));
    TestEqual(TEXT("Exact transfer finds one entry"), Library.Find(Transfer).Num(), 1);
    FFlowArtsPerformanceSession UnboundSession(nullptr, nullptr);
    const FFlowArtsPerformanceEntry& Entry = Library.GetEntries()[0];
    FFlowArtsPerformanceTransfer InvalidControls = Transfer;
    InvalidControls.Phase = 1.f;
    TestFalse(TEXT("Direct session rejects phase 1 before target access"),
        UnboundSession.Play(Entry, &InvalidControls, Error));
    TestEqual(TEXT("Phase error is explicit"), Error, FString(TEXT("Composer transfer phase or rate is out of range")));
    InvalidControls.Phase = std::numeric_limits<float>::quiet_NaN();
    TestFalse(TEXT("Direct session rejects nonfinite phase"), UnboundSession.Play(Entry, &InvalidControls, Error));
    InvalidControls.Phase = .5f;
    InvalidControls.Rate = 1.76f;
    TestFalse(TEXT("Direct session rejects unsupported rate"), UnboundSession.Play(Entry, &InvalidControls, Error));
    InvalidControls.Rate = std::numeric_limits<float>::infinity();
    TestFalse(TEXT("Direct session rejects nonfinite rate"), UnboundSession.Play(Entry, &InvalidControls, Error));
    Transfer.PropFamily = TEXT("poi");
    TestEqual(TEXT("Wrong selection cannot match"), Library.Find(Transfer).Num(), 0);
    Transfer.PropFamily = TEXT("staff");
    Transfer.SequenceJson = TEXT("{ }");
    TestEqual(TEXT("Same hash with altered text cannot match"), Library.Find(Transfer).Num(), 0);
    TestFalse(TEXT("Altered text fails hash verification"),
        FFlowArtsPerformanceLibrary::VerifySnapshot(Hash, Transfer.SequenceJson));

    FFlowArtsPerformanceTransfer Unused;
    FString Stale = TransferJson.Replace(TEXT("44136fa3"), TEXT("54136fa3"));
    TestFalse(TEXT("Stale transfer rejected"), FFlowArtsPerformanceLibrary::ParseTransfer(Stale, Unused, Error));
    TestFalse(TEXT("Malformed transfer rejected"), FFlowArtsPerformanceLibrary::ParseTransfer(TEXT("{"), Unused, Error));
    FString Unsupported = TransferJson.Replace(TEXT("tka-performance-transfer-v1"), TEXT("future-transfer"));
    TestFalse(TEXT("Unsupported schema rejected"), FFlowArtsPerformanceLibrary::ParseTransfer(Unsupported, Unused, Error));
    FString OutOfRange = TransferJson.Replace(TEXT("\"rate\":1"), TEXT("\"rate\":4"));
    TestFalse(TEXT("Unsupported playback rate rejected"), FFlowArtsPerformanceLibrary::ParseTransfer(OutOfRange, Unused, Error));
    FString StaleLibrary = LibraryJson.Replace(TEXT("44136fa3"), TEXT("54136fa3"));
    TestFalse(TEXT("Stale library rejected"), FFlowArtsPerformanceLibrary::Parse(StaleLibrary, Library, Error));
    TestEqual(TEXT("Failed load leaves previous valid library intact"), Library.GetEntries().Num(), 1);
    return true;
}
#endif
