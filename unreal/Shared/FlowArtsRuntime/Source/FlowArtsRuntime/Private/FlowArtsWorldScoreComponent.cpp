#include "FlowArtsWorldScoreComponent.h"
#include "FlowArtsPerformanceLibrary.h"
#include "FlowArtsPerformancePictographs.h"
#include "FlowArtsPerformanceSession.h"
#include "FlowFestAvatarComponent.h"
#include "FlowFestPropComponent.h"
#include "Engine/World.h"
#include "Engine/Texture2D.h"
#include "GameFramework/PlayerController.h"
#include "Camera/PlayerCameraManager.h"
#include "ImageUtils.h"
#include "Materials/MaterialInterface.h"
#include "UObject/ConstructorHelpers.h"
#include "UObject/StrongObjectPtr.h"
#include "Brushes/SlateRoundedBoxBrush.h"
#include "Styling/CoreStyle.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Notifications/SProgressBar.h"
#include "Widgets/SOverlay.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/Text/STextBlock.h"

namespace
{
FLinearColor Ink(const TCHAR* Hex) { return FLinearColor(FColor::FromHex(Hex)); }
const FLinearColor Paper = Ink(TEXT("F1EEE6"));
const FLinearColor Quiet = Ink(TEXT("AEB9BC"));
const FLinearColor Gold = Ink(TEXT("DCBE83"));

FSlateFontInfo Font(int32 Size, bool Bold = false)
{
    return FCoreStyle::GetDefaultFontStyle(Bold ? TEXT("Bold") : TEXT("Regular"), Size);
}

const FSlateRoundedBoxBrush& PanelBrush()
{
    static const FSlateRoundedBoxBrush Brush(Ink(TEXT("10191D")), 14.f, Ink(TEXT("8E7753")), 2.f);
    return Brush;
}

const FSlateRoundedBoxBrush& ImageWellBrush()
{
    static const FSlateRoundedBoxBrush Brush(Ink(TEXT("F4F0E8")), 8.f);
    return Brush;
}
}

struct FFlowArtsWorldScoreState
{
    struct FImage
    {
        TStrongObjectPtr<UTexture2D> Texture;
        FSlateBrush Brush;

        explicit FImage(UTexture2D* InTexture) : Texture(InTexture)
        {
            Brush.SetResourceObject(InTexture);
            Brush.ImageSize = FVector2f(InTexture->GetSizeX(), InTexture->GetSizeY());
            Brush.DrawAs = ESlateBrushDrawType::Image;
        }
    };

    FFlowArtsPerformanceLibrary Library;
    FFlowArtsPerformancePictographs Pictures;
    FFlowArtsPerformanceSession Session;
    TMap<FString, TSharedPtr<FImage>> Images;

    FFlowArtsWorldScoreState(UFlowFestAvatarComponent* Avatar, UFlowFestPropComponent* Prop)
        : Session(Avatar, Prop) {}

    bool RefreshSelection() { return Session.AttachCurrent(Library) && Sequence() != nullptr; }

    const FFlowArtsPictographSequence* Sequence() const
    {
        const FFlowArtsPerformanceEntry* Entry = Session.GetSelected();
        return Entry ? Pictures.Find(*Entry) : nullptr;
    }

    const FFlowArtsPictographStep* Step() const
    {
        const FFlowArtsPictographSequence* Score = Sequence();
        const int32 Index = Score ? Score->FindStep(Session.GetTime()) : INDEX_NONE;
        return Score && Score->Steps.IsValidIndex(Index) ? &Score->Steps[Index] : nullptr;
    }

    const FSlateBrush* Image()
    {
        const FFlowArtsPictographStep* Current = Step();
        if (!Current) return nullptr;
        if (const TSharedPtr<FImage>* Existing = Images.Find(Current->ImagePath))
            return Existing->IsValid() ? &(*Existing)->Brush : nullptr;
        TSharedPtr<FImage> Picture;
        if (UTexture2D* Texture = FImageUtils::ImportFileAsTexture2D(Current->ImagePath))
        {
            Texture->Filter = TF_Trilinear;
            Picture = MakeShared<FImage>(Texture);
        }
        Images.Add(Current->ImagePath, Picture);
        return Picture.IsValid() ? &Picture->Brush : nullptr;
    }

    FText StepText() const
    {
        const FFlowArtsPictographSequence* Score = Sequence();
        const FFlowArtsPictographStep* Current = Step();
        if (!Current || !Score) return FText::FromString(TEXT("Ready to perform"));
        return FText::FromString(FString::Printf(TEXT("%02d / %02d    %s"),
            Current->Index + 1, Score->Steps.Num(), *Current->Letter));
    }

    FText TimeText() const
    {
        const float Time = Session.GetTime();
        const float Length = Session.GetLength();
        return FText::FromString(FString::Printf(TEXT("%02d:%02d  /  %02d:%02d"),
            FMath::FloorToInt(Time) / 60, FMath::FloorToInt(Time) % 60,
            FMath::FloorToInt(Length) / 60, FMath::FloorToInt(Length) % 60));
    }

    TOptional<float> Progress() const
    {
        const float Length = Session.GetLength();
        return Length > SMALL_NUMBER ? FMath::Clamp(Session.GetTime() / Length, 0.f, 1.f) : 0.f;
    }
};

UFlowArtsWorldScoreComponent::UFlowArtsWorldScoreComponent()
{
    static ConstructorHelpers::FObjectFinder<UMaterialInterface> ScoreMaterial(
        TEXT("/FlowArtsRuntime/Effects/Materials/M_WorldScore.M_WorldScore"));
    PrimaryComponentTick.bCanEverTick = true;
    SetWidgetSpace(EWidgetSpace::World);
    SetDrawSize(FVector2D(540.f, 760.f));
    SetPivot(FVector2D(.5f, .5f));
    SetTwoSided(false);
    SetBlendMode(EWidgetBlendMode::Opaque);
    if (ScoreMaterial.Succeeded()) SetMaterial(0, ScoreMaterial.Object);
    SetCollisionEnabled(ECollisionEnabled::NoCollision);
    SetRedrawTime(1.f / 30.f);
    SetVisibility(false);
}

bool UFlowArtsWorldScoreComponent::ShowPerformance(UFlowFestAvatarComponent* Avatar,
    UFlowFestPropComponent* Prop, const FString& DisplayTitle)
{
    SetVisibility(false);
    SetSlateWidget(nullptr);
    ScoreState.Reset();
    if (!Avatar || !Prop) return false;

    TSharedRef<FFlowArtsWorldScoreState> State = MakeShared<FFlowArtsWorldScoreState>(Avatar, Prop);
    FString Error;
    if (!FFlowArtsPerformanceLibrary::LoadFromProject(State->Library, Error) ||
        !FFlowArtsPerformancePictographs::LoadFromProject(State->Library, State->Pictures, Error))
    {
        UE_LOG(LogTemp, Warning, TEXT("World score unavailable: %s"), *Error);
        return false;
    }
    if (!State->RefreshSelection() || !State->Sequence() || State->Sequence()->Steps.IsEmpty())
    {
        UE_LOG(LogTemp, Warning, TEXT("World score unavailable: no pictograph score matches the current prepared performance"));
        return false;
    }
    ScoreState = State;

    TSharedRef<SWidget> Slate = SNew(SBorder).BorderImage(&PanelBrush()).Padding(24)
        [SNew(SVerticalBox)
            + SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 14)
            [SNew(STextBlock).Text(FText::FromString(DisplayTitle)).Font(Font(29, true))
                .ColorAndOpacity(Paper).AutoWrapText(true)]
            + SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0, 0, 0, 14)
            [SNew(SBox).WidthOverride(420.f).HeightOverride(420.f)
            [SNew(SBorder).BorderImage(&ImageWellBrush()).Padding(10)
                [SNew(SOverlay)
                    + SOverlay::Slot().HAlign(HAlign_Fill).VAlign(VAlign_Fill)
                    [SNew(SImage).Image_Lambda([State] { return State->Image(); })]
                    + SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Center)
                    [SNew(STextBlock).Text(FText::FromString(TEXT("Follow the movement")))
                        .Font(Font(20)).ColorAndOpacity(Ink(TEXT("3C474A")))
                        .Visibility_Lambda([State] { return State->Image() ? EVisibility::Collapsed : EVisibility::Visible; })]]]]
            + SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 10)
            [SNew(STextBlock).Text_Lambda([State] { return State->StepText(); })
                .Font(Font(25, true)).ColorAndOpacity(Paper)]
            + SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 14)
            [SNew(SProgressBar).Percent_Lambda([State] { return State->Progress(); })
                .FillColorAndOpacity(Gold)]
            + SVerticalBox::Slot().AutoHeight()
            [SNew(STextBlock).Text_Lambda([State] { return State->TimeText(); })
                .Font(Font(18)).ColorAndOpacity(Quiet)]];
    SetSlateWidget(Slate);
    SetVisibility(true);
    return true;
}

void UFlowArtsWorldScoreComponent::TickComponent(float DeltaTime, ELevelTick TickType,
    FActorComponentTickFunction* ThisTickFunction)
{
    if (ScoreState.IsValid())
    {
        const APlayerController* Player = GetWorld() ? GetWorld()->GetFirstPlayerController() : nullptr;
        const APlayerCameraManager* Camera = Player ? Player->PlayerCameraManager : nullptr;
        const bool bNear = Camera && FVector::DistSquared(Camera->GetCameraLocation(), GetComponentLocation()) < FMath::Square(1200.f)
            && ScoreState->RefreshSelection();
        if (IsVisible() != bNear) SetVisibility(bNear);
    }
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
}

void UFlowArtsWorldScoreComponent::OnUnregister()
{
    SetSlateWidget(nullptr);
    ScoreState.Reset();
    Super::OnUnregister();
}
