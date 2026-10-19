#include "FlowArtsPerformancePanel.h"
#include "FlowArtsPerformanceLibrary.h"
#include "FlowArtsPerformancePictographs.h"
#include "FlowArtsPerformanceSession.h"
#include "FlowFestAvatarComponent.h"
#include "FlowFestPropComponent.h"
#include "Framework/Application/SlateApplication.h"
#include "Engine/GameViewportClient.h"
#include "Engine/UserInterfaceSettings.h"
#include "Engine/World.h"
#include "Engine/Texture2D.h"
#include "ImageUtils.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "UnrealClient.h"
#include "GameFramework/PlayerController.h"
#include "HAL/PlatformApplicationMisc.h"
#include "Input/Reply.h"
#include "InputCoreTypes.h"
#include "Brushes/SlateDynamicImageBrush.h"
#include "Brushes/SlateRoundedBoxBrush.h"
#include "UObject/StrongObjectPtr.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Input/SSlider.h"
#include "Widgets/Input/SSearchBox.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SDPIScaler.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Layout/SSeparator.h"
#include "Widgets/SOverlay.h"
#include "Widgets/SViewport.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/Text/STextBlock.h"
#include "Styling/CoreStyle.h"

namespace
{
FLinearColor Ink(const TCHAR* Hex) { return FLinearColor(FColor::FromHex(Hex)); }
const FLinearColor Text = Ink(TEXT("EEF0F3"));
const FLinearColor Muted = Ink(TEXT("A9B0BD"));
const FLinearColor Accent = Ink(TEXT("A8DBD3"));

FSlateFontInfo Font(int32 Size = 13, bool Bold = false)
{
    return FCoreStyle::GetDefaultFontStyle(Bold ? TEXT("Bold") : TEXT("Regular"), Size);
}

const FSlateRoundedBoxBrush& PanelBrush()
{
    static const FSlateRoundedBoxBrush Brush(Ink(TEXT("14171D")), 14.f, Ink(TEXT("343B47")), 1.f);
    return Brush;
}
const FSlateRoundedBoxBrush& WellBrush()
{
    static const FSlateRoundedBoxBrush Brush(Ink(TEXT("0C0E13")), 8.f);
    return Brush;
}
const FButtonStyle& ButtonStyle()
{
    static const FButtonStyle Style = [] {
        FButtonStyle Result;
        Result.SetNormal(FSlateRoundedBoxBrush(Ink(TEXT("242A34")), 6.f));
        Result.SetHovered(FSlateRoundedBoxBrush(Ink(TEXT("343E4D")), 6.f, Accent, 1.f));
        Result.SetPressed(FSlateRoundedBoxBrush(Ink(TEXT("405363")), 6.f, Accent, 1.f));
        Result.SetDisabled(FSlateRoundedBoxBrush(Ink(TEXT("1B2028")), 6.f));
        Result.SetNormalPadding(FMargin(10, 8));
        Result.SetPressedPadding(FMargin(10, 8));
        return Result;
    }();
    return Style;
}

const FSlateRoundedBoxBrush& SelectionBrush()
{
    static const FSlateRoundedBoxBrush Brush(FLinearColor::White, 8.f);
    return Brush;
}

const FSearchBoxStyle& SearchStyle()
{
    static const FSearchBoxStyle Style = [] {
        FSearchBoxStyle Result = FCoreStyle::Get().GetWidgetStyle<FSearchBoxStyle>(TEXT("SearchBox"));
        Result.TextBoxStyle.SetFont(Font(12));
        Result.TextBoxStyle.SetForegroundColor(Text);
        Result.TextBoxStyle.SetBackgroundImageNormal(FSlateRoundedBoxBrush(Ink(TEXT("0C0E13")), 6.f));
        Result.TextBoxStyle.SetBackgroundImageHovered(FSlateRoundedBoxBrush(Ink(TEXT("0C0E13")), 6.f, Muted, 1.f));
        Result.TextBoxStyle.SetBackgroundImageFocused(FSlateRoundedBoxBrush(Ink(TEXT("0C0E13")), 6.f, Accent, 1.f));
        Result.SetActiveFont(Font(12));
        return Result;
    }();
    return Style;
}

struct FPanelMetrics
{
    float Scale = 1.f;
    float Width = 400.f;
    float Height = 680.f;
};

FPanelMetrics GetPanelMetrics(const TWeakObjectPtr<UGameViewportClient>& WeakViewport)
{
    FPanelMetrics Metrics;
    UGameViewportClient* Viewport = WeakViewport.Get();
    if (!Viewport || !Viewport->Viewport) return Metrics;
    const FIntPoint Pixels = Viewport->Viewport->GetSizeXY();
    if (Pixels.X <= 0 || Pixels.Y <= 0) return Metrics;
    const TSharedPtr<SViewport> Widget = Viewport->GetGameViewportWidget();
    const float Platform = Widget.IsValid() ? FMath::Max(Widget->GetCachedGeometry().Scale, .01f) : 1.f;
    const float UI = FMath::Max(GetDefault<UUserInterfaceSettings>()->GetDPIScaleBasedOnSize(Pixels), .01f);
    // Keep the platform's readable text size when the game UI curve shrinks.
    Metrics.Scale = 1.f / FMath::Min(1.f, UI / Platform);
    const float Effective = UI * Metrics.Scale;
    Metrics.Width = FMath::Clamp(Pixels.X / Effective - 32.f, 0.f, 400.f);
    Metrics.Height = FMath::Clamp(Pixels.Y / Effective - 48.f, 0.f, 860.f);
    return Metrics;
}

struct FPanelState
{
    FFlowArtsPerformanceLibrary Library;
    FFlowArtsPerformancePictographs Pictographs;
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

struct FPanelImage
{
    // Slate brushes alone do not keep transient textures alive through GC.
    TStrongObjectPtr<UTexture2D> Texture;
    FSlateBrush Brush;
    explicit FPanelImage(UTexture2D* InTexture) : Texture(InTexture)
    {
        Brush.SetResourceObject(InTexture);
        Brush.ImageSize = FVector2f(InTexture->GetSizeX(), InTexture->GetSizeY());
        Brush.DrawAs = ESlateBrushDrawType::Image;
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
        StepRail = SNew(SHorizontalBox);
#if !UE_BUILD_SHIPPING
        // Reproduce a precise native review frame without changing the normal opening view.
        int32 ReviewStep = INDEX_NONE;
        if (FParse::Value(FCommandLine::Get(), TEXT("PerformanceReviewStep="), ReviewStep))
        {
            const auto* Pictures = SelectedPictures();
            if (Pictures && Pictures->Steps.IsValidIndex(ReviewStep))
            {
                State->Session.Pause(true);
                State->Session.Seek(Pictures->Steps[ReviewStep].StartSeconds);
                bBrowsingLibrary = false;
            }
        }
#endif
        RebuildEntries();
        RebuildSteps();
        ChildSlot
        [SNew(SBorder).BorderImage(&PanelBrush()).Padding(20)
        [SNew(SVerticalBox)
            + SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 16)
            [SNew(SHorizontalBox)
                + SHorizontalBox::Slot().FillWidth(1).VAlign(VAlign_Center)
                [SNew(SVerticalBox)
                    + SVerticalBox::Slot().AutoHeight()
                    [SNew(STextBlock).Text(FText::FromString(TEXT("Performances"))).Font(Font(22, true)).ColorAndOpacity(Text)]
                    + SVerticalBox::Slot().AutoHeight().Padding(0, 4, 0, 0)
                    [SNew(STextBlock).Font(Font(11)).ColorAndOpacity(Muted)
                        .Text(FText::FromString(FString::Printf(TEXT("%d sequences · %s"),
                            State->Matches.Num(), *State->Session.GetPropFamily().ToString())))]]
                + SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Top)
                [Action(TEXT("Close"), TEXT("Return to the game · Esc or F6"), [this] { State->Close(); })]]
            + SVerticalBox::Slot().FillHeight(1)
            [SNew(SVerticalBox)
            + SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 12)
            [SNew(SHorizontalBox)
                + SHorizontalBox::Slot().FillWidth(1).Padding(0, 0, 6, 0)
                [ViewTab(TEXT("Library"), true)]
                + SHorizontalBox::Slot().FillWidth(1)
                [ViewTab(TEXT("Now playing"), false)]]
            + SVerticalBox::Slot().FillHeight(1)
            [SNew(SScrollBox)
                + SScrollBox::Slot()
                [SNew(SVerticalBox)
                + SVerticalBox::Slot().AutoHeight()
                [SNew(SVerticalBox).Visibility_Lambda([this] { return bBrowsingLibrary ? EVisibility::Collapsed : EVisibility::Visible; })
                + SVerticalBox::Slot().AutoHeight()
                [SNew(SVerticalBox)
                    + SVerticalBox::Slot().AutoHeight()
                    [SNew(SVerticalBox).Visibility_Lambda([this] { return IsCompact() ? EVisibility::Collapsed : EVisibility::Visible; })
                        + SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 12) [ScoreHeading()]
                        + SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center) [PictureControl()]]
                    + SVerticalBox::Slot().AutoHeight()
                    [SNew(SHorizontalBox).Visibility_Lambda([this] { return IsCompact() ? EVisibility::Visible : EVisibility::Collapsed; })
                        + SHorizontalBox::Slot().AutoWidth() [PictureControl()]
                        + SHorizontalBox::Slot().FillWidth(1).VAlign(VAlign_Center).Padding(12, 0, 0, 0) [ScoreHeading()]]
                    + SVerticalBox::Slot().AutoHeight().Padding(0, 10, 0, 16)
                    [SNew(SScrollBox).Orientation(Orient_Horizontal)
                        + SScrollBox::Slot() [StepRail.ToSharedRef()]]
                    + SVerticalBox::Slot().AutoHeight()
                    [SNew(SVerticalBox).Visibility_Lambda([this] { return IsCompact() ? EVisibility::Visible : EVisibility::Collapsed; })
                        + SVerticalBox::Slot().AutoHeight() [SeekControl()]
                        + SVerticalBox::Slot().AutoHeight().Padding(0, 8, 0, 0) [SecondaryTransport()]]]]
                + SVerticalBox::Slot().AutoHeight()
                [SNew(SVerticalBox).Visibility_Lambda([this] { return bBrowsingLibrary ? EVisibility::Visible : EVisibility::Collapsed; })
                    + SVerticalBox::Slot().AutoHeight()
                    [SNew(SBox).HAlign(HAlign_Right)
                        .Visibility_Lambda([this] { return State->PendingTransfer.IsSet() ? EVisibility::Visible : EVisibility::Collapsed; })
                        [Action(TEXT("Show all"), TEXT("Clear the imported selection and search"), [this] {
                            State->PendingTransfer.Reset(); State->VisibleEntries = State->Matches;
                            Filter.Empty(); if (Search.IsValid()) Search->SetText(FText::GetEmpty());
                            State->Notice.Empty(); RebuildEntries();
                        })]]
                    + SVerticalBox::Slot().AutoHeight().Padding(0, 8, 0, 8)
                    [SNew(SBox).MinDesiredHeight(44)
                    [SAssignNew(Search, SSearchBox).Style(&SearchStyle())
                        .HintText(FText::FromString(TEXT("Find a sequence")))
                        .OnTextChanged_Lambda([this](const FText& Value) { Filter = Value.ToString(); RebuildEntries(); })]]
                    + SVerticalBox::Slot().AutoHeight()
                    [Entries.ToSharedRef()]]]]]
            + SVerticalBox::Slot().AutoHeight().Padding(0, 12, 0, 10)
            [SNew(SSeparator).ColorAndOpacity(Ink(TEXT("343B47")))]
            + SVerticalBox::Slot().AutoHeight()
            [SNew(SBox).Visibility_Lambda([this] { return IsCompact() ? EVisibility::Collapsed : EVisibility::Visible; })
                [PlaybackStatus()]]
            + SVerticalBox::Slot().AutoHeight()
            [SNew(SBox).Visibility_Lambda([this] { return IsCompact() ? EVisibility::Collapsed : EVisibility::Visible; })
                [SeekControl()]]
            + SVerticalBox::Slot().AutoHeight()
            [SNew(SHorizontalBox).Visibility_Lambda([this] { return IsCompact() ? EVisibility::Collapsed : EVisibility::Visible; })
                + SHorizontalBox::Slot().AutoWidth().Padding(0, 0, 6, 0) [PlayPauseControl()]
                + SHorizontalBox::Slot().FillWidth(1) [SecondaryTransport()]]
            + SVerticalBox::Slot().AutoHeight()
            [SNew(SHorizontalBox).Visibility_Lambda([this] { return IsCompact() ? EVisibility::Visible : EVisibility::Collapsed; })
                + SHorizontalBox::Slot().FillWidth(1).VAlign(VAlign_Center) [PlaybackStatus()]
                + SHorizontalBox::Slot().AutoWidth() [PlayPauseControl()]]
            + SVerticalBox::Slot().AutoHeight().Padding(0, 10, 0, 0)
            [SNew(SHorizontalBox)
                + SHorizontalBox::Slot().FillWidth(1).Padding(0, 0, 6, 0)
                [Action(TEXT("Paste score"), TEXT("Paste from Composer · load a copied performance when a prepared match exists"), [this] { PasteTransfer(); })]
                + SHorizontalBox::Slot().FillWidth(1)
                [Action(TEXT("Copy score"), TEXT("Copy performance and playback state for Composer's performance import page"), [this] { CopyTransfer(); })]]
            + SVerticalBox::Slot().AutoHeight().Padding(0, 8, 0, 0)
            [SNew(STextBlock).Font(Font(11)).ColorAndOpacity(Muted).AutoWrapText(true)
                .Visibility_Lambda([this] { return State->Notice.IsEmpty() ? EVisibility::Collapsed : EVisibility::Visible; })
                .Text_Lambda([this] { return FText::FromString(State->Notice); })]]];
    }

    virtual FReply OnPreviewKeyDown(const FGeometry& Geometry, const FKeyEvent& Event) override
    {
        if (Event.GetKey() == EKeys::Escape || Event.GetKey() == EKeys::F6)
        {
            State->Close();
            return FReply::Handled();
        }
        return SCompoundWidget::OnPreviewKeyDown(Geometry, Event);
    }
    virtual bool SupportsKeyboardFocus() const override { return true; }

private:
    TSharedPtr<FPanelState> State;
    TSharedPtr<SVerticalBox> Entries;
    TSharedPtr<SHorizontalBox> StepRail;
    TSharedPtr<SSearchBox> Search;
    TMap<FString, TSharedPtr<FPanelImage>> Images;
    FString Filter;
    bool bBrowsingLibrary = true;

    TSharedRef<SWidget> ViewTab(const TCHAR* Label, bool bLibrary)
    {
        return SNew(SButton).ButtonStyle(&ButtonStyle()).ContentPadding(FMargin(10, 10))
            .OnClicked_Lambda([this, bLibrary] { bBrowsingLibrary = bLibrary; return FReply::Handled(); })
            [SNew(STextBlock).Text(FText::FromString(Label)).Font(Font(12, true))
                .ColorAndOpacity_Lambda([this, bLibrary] { return bBrowsingLibrary == bLibrary ? Accent : Muted; })];
    }

    TSharedRef<SWidget> Action(const TCHAR* Label, const TCHAR* Tip, TFunction<void()> Callback)
    {
        const auto Handler = MakeShared<TFunction<void()>>(MoveTemp(Callback));
        return SNew(SBox).MinDesiredWidth(44).MinDesiredHeight(44)
            [SNew(SButton).ButtonStyle(&ButtonStyle()).ContentPadding(FMargin(10, 9))
            .ToolTipText(FText::FromString(Tip))
            .OnClicked_Lambda([Handler] { (*Handler)(); return FReply::Handled(); })
            [SNew(STextBlock).Font(Font(12)).ColorAndOpacity(Text)
                .Text(FText::FromString(Label)).Justification(ETextJustify::Center)]];
    }

    bool IsCompact() const { return GetPanelMetrics(State->Viewport).Height < 600.f; }

    TSharedRef<SWidget> ScoreHeading()
    {
        return SNew(SVerticalBox)
            + SVerticalBox::Slot().AutoHeight()
            [SNew(STextBlock).Font(Font(24, true)).ColorAndOpacity(Text).AutoWrapText(true)
                .Text_Lambda([this] { const auto* Entry = State->Session.GetSelected();
                    return FText::FromString(Entry ? Entry->Title : TEXT("Choose a sequence")); })]
            + SVerticalBox::Slot().AutoHeight().Padding(0, 6, 0, 0)
            [SNew(STextBlock).Font(Font(12)).ColorAndOpacity(Muted).AutoWrapText(true)
                .Text_Lambda([this] { return StepLabel(); })];
    }

    TSharedRef<SWidget> PictureControl()
    {
        return SNew(SBorder).BorderImage(&WellBrush()).Padding(8)
            [SNew(SBox)
                .WidthOverride_Lambda([this] { return FOptionalSize(PictureSize()); })
                .HeightOverride_Lambda([this] { return FOptionalSize(PictureSize()); })
                [SNew(SOverlay)
                    + SOverlay::Slot()
                    [SNew(SImage).Image_Lambda([this] { return CurrentImage(); })]
                    + SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Center)
                    [SNew(STextBlock).Font(Font(13)).ColorAndOpacity(Muted).AutoWrapText(true)
                        .Text(FText::FromString(TEXT("Pictograph unavailable")))
                        .Visibility_Lambda([this] { return CurrentImage() ? EVisibility::Collapsed : EVisibility::Visible; })]]];
    }

    TSharedRef<SWidget> PlaybackStatus()
    {
        return SNew(SHorizontalBox)
            + SHorizontalBox::Slot().FillWidth(1).VAlign(VAlign_Center)
            [SNew(STextBlock).Font(Font(11)).ColorAndOpacity(Muted).Text_Lambda([this] {
                return FText::FromString(FString::Printf(TEXT("%.1f / %.1f s"),
                    State->Session.GetTime(), State->Session.GetLength())); })]
            + SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
            [SNew(STextBlock).Font(Font(11)).ColorAndOpacity(Accent).Text_Lambda([this] {
                return FText::FromString(!State->Session.GetSelected() ? TEXT("Ready") :
                    State->Session.IsPaused() ? TEXT("Paused") : TEXT("Playing")); })];
    }

    TSharedRef<SWidget> SeekControl()
    {
        return SNew(SBox).HeightOverride(28)
            [SNew(SSlider).SliderBarColor(Ink(TEXT("424D5D"))).SliderHandleColor(Accent)
                .IsEnabled_Lambda([this] { return State->Session.GetSelected() != nullptr; })
                .Value_Lambda([this] { const float Length = State->Session.GetLength();
                    return Length > 0 ? State->Session.GetTime() / Length : 0.f; })
                .OnValueChanged_Lambda([this](float Fraction) { State->Session.Seek(Fraction * State->Session.GetLength()); })];
    }

    TSharedRef<SWidget> PlayPauseControl()
    {
        return SNew(SBox).MinDesiredHeight(44)
            [SNew(SButton).ButtonStyle(&ButtonStyle()).ContentPadding(FMargin(16, 9))
                .IsEnabled_Lambda([this] { return State->Session.GetSelected() != nullptr; })
                .OnClicked_Lambda([this] { State->Session.Pause(!State->Session.IsPaused()); return FReply::Handled(); })
                [SNew(STextBlock).Font(Font(13, true)).ColorAndOpacity(Text).Text_Lambda([this] {
                    return FText::FromString(State->Session.IsPaused() ? TEXT("Play") : TEXT("Pause")); })]];
    }

    TSharedRef<SWidget> SecondaryTransport()
    {
        return SNew(SHorizontalBox)
            + SHorizontalBox::Slot().AutoWidth()
            [Action(TEXT("Restart"), TEXT("Return to the first step"), [this] { State->Session.Restart(); })]
            + SHorizontalBox::Slot().FillWidth(1)
            [SNew(SBox)]
            + SHorizontalBox::Slot().AutoWidth()
            [Action(TEXT("−"), TEXT("Slower"), [this] { State->Session.SetRate(State->Session.GetRate() - .25f); })]
            + SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(8, 0)
            [SNew(STextBlock).Font(Font(12)).ColorAndOpacity(Text).Text_Lambda([this] {
                return FText::FromString(FString::Printf(TEXT("%.2g×"), State->Session.GetRate())); })]
            + SHorizontalBox::Slot().AutoWidth()
            [Action(TEXT("+"), TEXT("Faster"), [this] { State->Session.SetRate(State->Session.GetRate() + .25f); })];
    }

    float PictureSize() const
    {
        return FMath::Min(GetPanelMetrics(State->Viewport).Width - 72.f,
            IsCompact() ? 108.f : GetPanelMetrics(State->Viewport).Height < 760.f ? 120.f : 208.f);
    }
    const FFlowArtsPictographSequence* SelectedPictures() const
    {
        const auto* Entry = State->Session.GetSelected();
        return Entry ? State->Pictographs.Find(*Entry) : nullptr;
    }
    const FSlateBrush* ImageFor(const FFlowArtsPictographStep& Step)
    {
        if (const auto* Existing = Images.Find(Step.ImagePath)) return Existing->IsValid() ? &(*Existing)->Brush : nullptr;
        UTexture2D* Texture = FImageUtils::ImportFileAsTexture2D(Step.ImagePath);
        TSharedPtr<FPanelImage> Image;
        if (Texture)
        {
            Texture->Filter = TF_Trilinear;
            Image = MakeShared<FPanelImage>(Texture);
        }
        Images.Add(Step.ImagePath, Image);
        return Image ? &Image->Brush : nullptr;
    }
    const FSlateBrush* CurrentImage()
    {
        const auto* Pictures = SelectedPictures();
        const int32 Index = Pictures ? Pictures->FindStep(State->Session.GetTime()) : INDEX_NONE;
        return Index != INDEX_NONE ? ImageFor(Pictures->Steps[Index]) : nullptr;
    }
    FText StepLabel() const
    {
        const auto* Pictures = SelectedPictures();
        const int32 Index = Pictures ? Pictures->FindStep(State->Session.GetTime()) : INDEX_NONE;
        if (Index == INDEX_NONE) return FText::FromString(TEXT("Watch the performer · explore the score"));
        return FText::FromString(FString::Printf(TEXT("Step %d of %d · %s"), Index + 1,
            Pictures->Steps.Num(), *Pictures->Steps[Index].Letter));
    }
    void RebuildSteps()
    {
        StepRail->ClearChildren();
        const auto* Pictures = SelectedPictures();
        if (!Pictures) return;
        for (int32 Index = 0; Index < Pictures->Steps.Num(); ++Index)
        {
            const auto& Step = Pictures->Steps[Index];
            StepRail->AddSlot().AutoWidth().Padding(0, 0, 6, 0)
            [SNew(SBorder).BorderImage(&SelectionBrush()).Padding(2)
                .BorderBackgroundColor_Lambda([this, Index] {
                    const auto* Current = SelectedPictures();
                    return Current && Current->FindStep(State->Session.GetTime()) == Index
                        ? Accent : FLinearColor::Transparent;
                })
            [SNew(SButton).ButtonStyle(&ButtonStyle()).ContentPadding(FMargin(4))
                .ToolTipText(FText::FromString(FString::Printf(TEXT("Step %d · %s"), Index + 1, *Step.Letter)))
                .OnClicked_Lambda([this, Time = Step.StartSeconds] { State->Session.Seek(Time); return FReply::Handled(); })
                [SNew(SVerticalBox)
                    + SVerticalBox::Slot().AutoHeight()
                    [SNew(SBox).WidthOverride(48).HeightOverride(48)
                        [SNew(SImage).Image(ImageFor(Step))]]
                    + SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0, 3, 0, 0)
                    [SNew(STextBlock).Font(Font(10)).ColorAndOpacity(Text).Text(FText::AsNumber(Index + 1))]]]];
        }
    }
    void Play(const FFlowArtsPerformanceEntry* Entry)
    {
        FString Error;
        const auto* Transfer = State->PendingTransfer.IsSet() ? &State->PendingTransfer.GetValue() : nullptr;
        if (State->Session.Play(*Entry, Transfer, Error))
        {
            bBrowsingLibrary = false;
            State->PendingTransfer.Reset();
            State->VisibleEntries = State->Matches;
            State->Notice.Empty();
            RebuildSteps();
            RebuildEntries();
        }
        else State->Notice = Error;
    }
    void RebuildEntries()
    {
        Entries->ClearChildren();
        int32 Count = 0;
        for (const auto* Entry : State->VisibleEntries)
        {
            if (!Filter.IsEmpty() && !Entry->Title.Contains(Filter)) continue;
            ++Count;
            const auto* Pictures = State->Pictographs.Find(*Entry);
            const FSlateBrush* Thumb = Pictures && !Pictures->Steps.IsEmpty() ? ImageFor(Pictures->Steps[0]) : nullptr;
            Entries->AddSlot().AutoHeight().Padding(0, 0, 0, 6)
            [SNew(SButton).ButtonStyle(&ButtonStyle()).ContentPadding(FMargin(8))
                .OnClicked_Lambda([this, Entry] { Play(Entry); return FReply::Handled(); })
                [SNew(SHorizontalBox)
                    + SHorizontalBox::Slot().AutoWidth().Padding(0, 0, 10, 0)
                    [SNew(SBox).WidthOverride(48).HeightOverride(48) [SNew(SImage).Image(Thumb)]]
                    + SHorizontalBox::Slot().FillWidth(1).VAlign(VAlign_Center)
                    [SNew(SVerticalBox)
                        + SVerticalBox::Slot().AutoHeight()
                        [SNew(STextBlock).Font(Font(14, true)).ColorAndOpacity(Text).AutoWrapText(true)
                            .Text(FText::FromString(Entry->Title))]
                        + SVerticalBox::Slot().AutoHeight().Padding(0, 3, 0, 0)
                        [SNew(STextBlock).Font(Font(11)).ColorAndOpacity(Muted)
                            .Text(FText::FromString(Pictures ? FString::Printf(TEXT("%d steps · %.1f seconds"), Pictures->Steps.Num(), Entry->DurationSeconds)
                                : FString::Printf(TEXT("%.1f seconds"), Entry->DurationSeconds)))]]
                    + SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
                    [SNew(STextBlock).Font(Font(11)).ColorAndOpacity(Accent)
                        .Text_Lambda([this, Entry] { return FText::FromString(
                            State->Session.GetSelected() == Entry ? TEXT("Selected") : TEXT("Play")); })]]];
        }
        if (Count == 0)
            Entries->AddSlot().AutoHeight().Padding(0, 12)
            [SNew(STextBlock).Font(Font(13)).ColorAndOpacity(Muted).AutoWrapText(true)
                .Text(FText::FromString(Filter.IsEmpty() ? TEXT("No prepared sequences for this performer and prop.")
                    : TEXT("No sequences match your search.")))];
    }
    void PasteTransfer()
    {
        FString Clipboard, Error;
        FPlatformApplicationMisc::ClipboardPaste(Clipboard);
        FFlowArtsPerformanceTransfer Transfer;
        if (!FFlowArtsPerformanceLibrary::ParseTransfer(Clipboard, Transfer, Error)) { State->Notice = Error; return; }
        const auto Matches = State->Library.Find(Transfer);
        State->VisibleEntries.Reset();
        for (const auto* Match : Matches)
            if (State->Matches.Contains(Match)) State->VisibleEntries.Add(Match);
        State->PendingTransfer.Reset();
        if (State->VisibleEntries.IsEmpty())
        {
            State->VisibleEntries = State->Matches;
            State->Notice = Matches.IsEmpty()
                ? TEXT("This sequence needs animation preparation before it can play here.")
                : TEXT("This performance uses a different performer or prop.");
        }
        else
        {
            State->PendingTransfer = Transfer;
            if (State->VisibleEntries.Num() == 1) Play(State->VisibleEntries[0]);
            else
            {
                bBrowsingLibrary = true;
                State->Notice = TEXT("Choose a matching performance from the library.");
            }
        }
        Filter.Empty(); if (Search.IsValid()) Search->SetText(FText::GetEmpty());
        RebuildEntries();
    }
    void CopyTransfer()
    {
        FString Transfer;
        if (State->Session.CopyTransfer(Transfer))
        {
            FPlatformApplicationMisc::ClipboardCopy(*Transfer);
            State->Notice = TEXT("Copied. Open Composer's /performance page to paste and edit.");
        }
        else State->Notice = TEXT("Choose a sequence first.");
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
    if (!FFlowArtsPerformancePictographs::LoadFromProject(State->Library, State->Pictographs, Error))
        UE_LOG(LogTemp, Warning, TEXT("Performance pictographs unavailable: %s"), *Error);
    State->Matches = State->Library.ForTarget(State->Session.GetCharacterId(), State->Session.GetPropFamily());
    State->Session.AttachCurrent(State->Library);
    TSharedRef<SFlowArtsPerformancePanel> Content = SNew(SFlowArtsPerformancePanel).State(State);
    const TWeakObjectPtr<UGameViewportClient> WeakViewport = State->Viewport;
    TSharedRef<SWidget> Overlay = SNew(SOverlay)
        + SOverlay::Slot().HAlign(HAlign_Right).VAlign(VAlign_Center).Padding(16, 24)
        [SNew(SDPIScaler).DPIScale_Lambda([WeakViewport] { return GetPanelMetrics(WeakViewport).Scale; })
            [SNew(SBox)
                .WidthOverride_Lambda([WeakViewport] { return FOptionalSize(GetPanelMetrics(WeakViewport).Width); })
                .HeightOverride_Lambda([WeakViewport] { return FOptionalSize(GetPanelMetrics(WeakViewport).Height); })
                [Content]]];
    State->Overlay = Overlay;
    Viewport->AddViewportWidgetContent(Overlay, 100);
    FInputModeUIOnly InputMode;
    InputMode.SetWidgetToFocus(Content);
    Player->SetInputMode(InputMode);
    Player->bShowMouseCursor = true;
    FSlateApplication::Get().SetKeyboardFocus(Content, EFocusCause::SetDirectly);
}
