#include "FlowArtsPerformancePanel.h"
#include "FlowArtsPerformanceLibrary.h"
#include "FlowArtsPerformanceSession.h"
#include "FlowFestAvatarComponent.h"
#include "FlowFestPropComponent.h"
#include "Framework/Application/SlateApplication.h"
#include "Engine/GameViewportClient.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "HAL/PlatformApplicationMisc.h"
#include "Input/Reply.h"
#include "InputCoreTypes.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Input/SSlider.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Layout/SSeparator.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/Text/STextBlock.h"

namespace
{
struct FPanelState
{
    FFlowArtsPerformanceLibrary Library;
    FFlowArtsPerformanceSession Session;
    TArray<const FFlowArtsPerformanceEntry*> Matches;
    TArray<const FFlowArtsPerformanceEntry*> VisibleEntries;
    TOptional<FFlowArtsPerformanceTransfer> PendingTransfer;
    FString Notice;
    TWeakPtr<SWidget> Overlay;
    TWeakObjectPtr<UGameViewportClient> Viewport;
    TWeakObjectPtr<APlayerController> Player;
    bool bOldMouseCursor = false;

    FPanelState(APlayerController* InPlayer, UFlowFestAvatarComponent* Avatar, UFlowFestPropComponent* Prop)
        : Session(Avatar, Prop), Player(InPlayer), bOldMouseCursor(InPlayer && InPlayer->bShowMouseCursor) {}

    void Close()
    {
        if (UGameViewportClient* Client = Viewport.Get())
            if (TSharedPtr<SWidget> Target = Overlay.Pin()) Client->RemoveViewportWidgetContent(Target.ToSharedRef());
        Overlay.Reset();
        if (APlayerController* Controller = Player.Get())
        {
            Controller->SetInputMode(FInputModeGameOnly());
            Controller->bShowMouseCursor = bOldMouseCursor;
        }
    }
};

class SFlowArtsPerformancePanel : public SCompoundWidget
{
public:
    SLATE_BEGIN_ARGS(SFlowArtsPerformancePanel) {}
        SLATE_ARGUMENT(TSharedPtr<FPanelState>, State)
    SLATE_END_ARGS()

    void Construct(const FArguments& Args)
    {
        State = Args._State;
        State->VisibleEntries = State->Matches;
        Entries = SNew(SVerticalBox);
        RebuildEntries();

        ChildSlot
        [SNew(SBorder).Padding(16)
            [SNew(SVerticalBox)
                + SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 8)
                [SNew(STextBlock).Text(FText::FromString(TEXT("Prepared performances")))]
                + SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 8)
                [SNew(STextBlock).Text(FText::FromString(FString::Printf(TEXT("%s  ·  %s"),
                    *State->Session.GetCharacterId().ToString(), *State->Session.GetPropFamily().ToString())))]
                + SVerticalBox::Slot().FillHeight(1)
                [SNew(SScrollBox) + SScrollBox::Slot() [Entries.ToSharedRef()]]
                + SVerticalBox::Slot().AutoHeight().Padding(0, 4)
                [SNew(SButton).Text(FText::FromString(TEXT("Show all prepared performances")))
                    .OnClicked_Lambda([this]()
                    {
                        State->PendingTransfer.Reset();
                        State->VisibleEntries = State->Matches;
                        RebuildEntries();
                        State->Notice.Empty();
                        return FReply::Handled();
                    })]
                + SVerticalBox::Slot().AutoHeight().Padding(0, 8)
                [SNew(SSeparator)]
                + SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 7)
                [SNew(STextBlock).Text_Lambda([this]()
                {
                    return FText::FromString(FString::Printf(TEXT("%.1f / %.1f s   ·   %.2fx   ·   %s"),
                        State->Session.GetTime(), State->Session.GetLength(), State->Session.GetRate(),
                        State->Session.GetLength() <= 0.f ? TEXT("Ready") :
                            State->Session.IsPaused() ? TEXT("Paused") : TEXT("Playing")));
                })]
                + SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 8)
                [SNew(SSlider).Value_Lambda([this]()
                    { const float Length = State->Session.GetLength(); return Length > 0 ? State->Session.GetTime() / Length : 0.f; })
                    .OnValueChanged_Lambda([this](float Fraction)
                    { State->Session.Seek(Fraction * State->Session.GetLength()); })]
                + SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 8)
                [SNew(SHorizontalBox)
                    + SHorizontalBox::Slot().FillWidth(1).Padding(2, 0)
                    [SNew(SButton).Text_Lambda([this]()
                        { return FText::FromString(State->Session.IsPaused() ? TEXT("Resume") : TEXT("Pause")); })
                        .OnClicked_Lambda([this]()
                        { State->Session.Pause(!State->Session.IsPaused()); return FReply::Handled(); })]
                    + SHorizontalBox::Slot().FillWidth(1).Padding(2, 0)
                    [SNew(SButton).Text(FText::FromString(TEXT("Restart")))
                        .OnClicked_Lambda([this]()
                        { State->Session.Restart(); return FReply::Handled(); })]
                    + SHorizontalBox::Slot().FillWidth(1).Padding(2, 0)
                    [SNew(SButton).Text(FText::FromString(TEXT("Slower")))
                        .OnClicked_Lambda([this]()
                        { State->Session.SetRate(State->Session.GetRate() - .25f); return FReply::Handled(); })]
                    + SHorizontalBox::Slot().FillWidth(1).Padding(2, 0)
                    [SNew(SButton).Text(FText::FromString(TEXT("Faster")))
                        .OnClicked_Lambda([this]()
                        { State->Session.SetRate(State->Session.GetRate() + .25f); return FReply::Handled(); })]]
                + SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 8)
                [SNew(SHorizontalBox)
                    + SHorizontalBox::Slot().FillWidth(1).Padding(2, 0)
                    [SNew(SButton).Text(FText::FromString(TEXT("Paste Composer transfer")))
                        .OnClicked_Lambda([this]()
                        {
                            FString Clipboard, Error;
                            FPlatformApplicationMisc::ClipboardPaste(Clipboard);
                            FFlowArtsPerformanceTransfer Transfer;
                            if (!FFlowArtsPerformanceLibrary::ParseTransfer(Clipboard, Transfer, Error))
                                State->Notice = Error;
                            else
                            {
                                const TArray<const FFlowArtsPerformanceEntry*> Matches = State->Library.Find(Transfer);
                                if (Matches.IsEmpty()) State->Notice = TEXT("No exact prepared match for this transfer; preparation is required");
                                else if (Matches.Num() > 1)
                                {
                                    State->PendingTransfer = Transfer;
                                    State->VisibleEntries.Reset();
                                    for (const FFlowArtsPerformanceEntry* Match : Matches)
                                        if (State->Matches.Contains(Match)) State->VisibleEntries.Add(Match);
                                    RebuildEntries();
                                    if (State->VisibleEntries.IsEmpty())
                                    {
                                        State->PendingTransfer.Reset();
                                        State->Notice = TEXT("This transfer does not match the selected performer and prop");
                                    }
                                    else State->Notice = TEXT("Multiple prepared matches; choose the performance above to apply this transfer");
                                }
                                else State->Notice = State->Session.Play(*Matches[0], &Transfer, Error)
                                    ? TEXT("Transfer loaded") : Error;
                            }
                            return FReply::Handled();
                        })]
                    + SHorizontalBox::Slot().FillWidth(1).Padding(2, 0)
                    [SNew(SButton).Text(FText::FromString(TEXT("Copy to Composer /performance")))
                        .OnClicked_Lambda([this]()
                        {
                            FString Transfer;
                            if (State->Session.CopyTransfer(Transfer))
                            {
                                FPlatformApplicationMisc::ClipboardCopy(*Transfer);
                                State->Notice = TEXT("Copied. In Composer, open /performance and paste the transfer.");
                            }
                            else State->Notice = TEXT("Choose a prepared performance first");
                            return FReply::Handled();
                        })]]
                + SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 8)
                [SNew(STextBlock).Text_Lambda([this]() { return FText::FromString(State->Notice); }).AutoWrapText(true)]
                + SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Right)
                [SNew(SButton).Text(FText::FromString(TEXT("Close  ·  Esc")))
                    .OnClicked_Lambda([this]() { State->Close(); return FReply::Handled(); })]]];
    }

    virtual FReply OnKeyDown(const FGeometry& Geometry, const FKeyEvent& Event) override
    {
        if (Event.GetKey() == EKeys::Escape || Event.GetKey() == EKeys::F6)
        {
            State->Close();
            return FReply::Handled();
        }
        return SCompoundWidget::OnKeyDown(Geometry, Event);
    }

    virtual bool SupportsKeyboardFocus() const override { return true; }

private:
    TSharedPtr<FPanelState> State;
    TSharedPtr<SVerticalBox> Entries;

    void RebuildEntries()
    {
        Entries->ClearChildren();
        for (const FFlowArtsPerformanceEntry* Entry : State->VisibleEntries)
            Entries->AddSlot().AutoHeight().Padding(0, 2)
            [SNew(SButton)
                .Text(FText::FromString(FString::Printf(TEXT("%s  |  %s  |  %.1f s"),
                    *Entry->Title, *Entry->Profile.ToString(), Entry->DurationSeconds)))
                .OnClicked_Lambda([this, Entry]()
                {
                    FString Error;
                    const FFlowArtsPerformanceTransfer* Transfer = State->PendingTransfer.IsSet()
                        ? &State->PendingTransfer.GetValue() : nullptr;
                    const bool bPlayed = State->Session.Play(*Entry, Transfer, Error);
                    State->Notice = bPlayed ? FString::Printf(TEXT("Playing %s"), *Entry->Title) : Error;
                    if (bPlayed)
                    {
                        State->PendingTransfer.Reset();
                        State->VisibleEntries = State->Matches;
                        RebuildEntries();
                    }
                    return FReply::Handled();
                })];
        if (State->VisibleEntries.IsEmpty())
            Entries->AddSlot().AutoHeight().Padding(0, 8)
            [SNew(STextBlock).Text(FText::FromString(TEXT("No prepared performance fits this character and prop. Preparation is required.")))
                .AutoWrapText(true)];
    }
};
}

void FFlowArtsPerformancePanel::Open(APlayerController* Player,
    UFlowFestAvatarComponent* Avatar, UFlowFestPropComponent* Prop)
{
    if (!Player || !Avatar || !Prop || !FSlateApplication::IsInitialized()) return;
    static TWeakPtr<FPanelState> Active;
    if (TSharedPtr<FPanelState> Existing = Active.Pin()) Existing->Close();
    UGameViewportClient* Viewport = Player->GetWorld() ? Player->GetWorld()->GetGameViewport() : nullptr;
    if (!Viewport) return;
    TSharedRef<FPanelState> State = MakeShared<FPanelState>(Player, Avatar, Prop);
    Active = State;
    State->Viewport = Viewport;
    FString Error;
    if (!FFlowArtsPerformanceLibrary::LoadFromProject(State->Library, Error)) State->Notice = Error;
    State->Matches = State->Library.ForTarget(State->Session.GetCharacterId(), State->Session.GetPropFamily());
    State->Session.AttachCurrent(State->Library);
    TSharedRef<SFlowArtsPerformancePanel> Content = SNew(SFlowArtsPerformancePanel).State(State);
    TSharedRef<SWidget> Overlay = SNew(SOverlay)
        + SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Center).Padding(12)
        [SNew(SBox).WidthOverride(560).HeightOverride(500)[Content]];
    State->Overlay = Overlay;
    Viewport->AddViewportWidgetContent(Overlay, 100);
    FInputModeUIOnly InputMode;
    InputMode.SetWidgetToFocus(Content);
    Player->SetInputMode(InputMode);
    Player->bShowMouseCursor = true;
    FSlateApplication::Get().SetKeyboardFocus(Content, EFocusCause::SetDirectly);
}
