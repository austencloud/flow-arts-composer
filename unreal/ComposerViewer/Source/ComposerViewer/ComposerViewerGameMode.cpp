#include "ComposerViewerGameMode.h"
#include "ComposerViewerStage.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "Engine/Engine.h"
#include "GameFramework/GameUserSettings.h"
#include "Misc/CommandLine.h"
#include "PixelStreaming2Delegates.h"

AComposerViewerGameMode::AComposerViewerGameMode()
{
    DefaultPawnClass = nullptr;
}

void AComposerViewerGameMode::StartPlay()
{
    Super::StartPlay();
    GetWorld()->SpawnActor<AComposerViewerStage>(AComposerViewerStage::StaticClass(),
        FVector::ZeroVector, FRotator::ZeroRotator);

    // A streamed host renders offscreen for whoever is connected, so with nobody
    // connected it only needs enough frames to keep the scene warm. Local runs
    // without Pixel Streaming keep the full rate.
    FString ConnectionUrl;
    if (!FParse::Value(FCommandLine::Get(), TEXT("PixelStreamingConnectionURL="), ConnectionUrl)) return;
    UPixelStreaming2Delegates* Delegates = UPixelStreaming2Delegates::Get();
    if (!Delegates) return;
    // Both events arrive on the game thread, so the cap changes before the next frame.
    Delegates->OnNewConnectionNative.AddUObject(this, &AComposerViewerGameMode::OnViewerJoined);
    Delegates->OnAllConnectionsClosedNative.AddUObject(this, &AComposerViewerGameMode::OnViewersGone);
    SetIdle(true);
}

void AComposerViewerGameMode::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    if (UPixelStreaming2Delegates* Delegates = UPixelStreaming2Delegates::Get())
    {
        Delegates->OnNewConnectionNative.RemoveAll(this);
        Delegates->OnAllConnectionsClosedNative.RemoveAll(this);
    }
    if (bIdle) CapFrameRate(WatchedMaxFps);
    bIdle = false;
    Super::EndPlay(EndPlayReason);
}

void AComposerViewerGameMode::OnViewerJoined(FString StreamerId, FString PlayerId)
{
    SetIdle(false);
}

void AComposerViewerGameMode::OnViewersGone(FString StreamerId)
{
    SetIdle(true);
}

void AComposerViewerGameMode::SetIdle(bool bNewIdle)
{
    if (bIdle == bNewIdle) return;
    bIdle = bNewIdle;
    CapFrameRate(bIdle ? IdleMaxFps : WatchedMaxFps);
    UE_LOG(LogTemp, Display, TEXT("ComposerViewer: %s, frame cap %.0f fps"),
        bIdle ? TEXT("no viewers") : TEXT("viewer connected"), bIdle ? IdleMaxFps : WatchedMaxFps);
}

void AComposerViewerGameMode::CapFrameRate(float MaxFps)
{
    if (!GEngine) return;
    // Game user settings apply their own limit (0, uncapped) over t.MaxFPS from the
    // ini at startup and on every re-apply, so the cap goes in both places.
    if (UGameUserSettings* Settings = GEngine->GetGameUserSettings()) Settings->SetFrameRateLimit(MaxFps);
    GEngine->SetMaxFPS(MaxFps);
}
