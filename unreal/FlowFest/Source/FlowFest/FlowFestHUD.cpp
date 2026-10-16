#include "FlowFestHUD.h"
#include "FlowFestCharacter.h"
#include "FlowFestWorld.h"
#include "CanvasItem.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"
#include "GameFramework/PlayerController.h"
#include "UObject/ConstructorHelpers.h"

AFlowFestHUD::AFlowFestHUD()
{
    static ConstructorHelpers::FObjectFinder<UFont> FontAsset(TEXT("/Engine/EngineFonts/Roboto.Roboto"));
    RuntimeFont = FontAsset.Object;
}

void AFlowFestHUD::DrawLabel(const FString& Text, FLinearColor Color, float X, float Y, UFont* Font, float Scale)
{
    // Rasterize at the final pixel size instead of enlarging a small bitmap font.
    if (!RuntimeFont) { DrawText(Text, Color, X, Y, Font, Scale); return; }
    const int32 PointSize = FMath::Max(8, FMath::RoundToInt(11.f * Scale));
    // Canvas requires a UFont-backed face; a standalone Slate composite is silently skipped.
    const FSlateFontInfo Face(RuntimeFont, PointSize);
    FCanvasTextItem Item(FVector2D(X, Y), FText::FromString(Text), Face, Color);
    Canvas->DrawItem(Item);
}

void AFlowFestHUD::DrawHUD()
{
    Super::DrawHUD();
    if (!Canvas || !PlayerOwner || !GEngine) return;
    AFlowFestCharacter* Traveler = Cast<AFlowFestCharacter>(PlayerOwner->GetPawn());
    if (!Traveler) return;
    if (Traveler->IsWardrobeOpen()) { DrawWardrobe(Traveler); return; }

    const float W = Canvas->SizeX;
    const float H = Canvas->SizeY;
    const float Scale = FMath::Clamp(W / 1920.f, .72f, 1.25f);
    const float Pad = 28.f * Scale;
    const float PanelWidth = FMath::Min(670.f * Scale, W - 2.f * Pad);
    const FLinearColor Ink(.95f, .94f, .88f, 1.f);
    const FLinearColor Muted(.72f, .77f, .75f, 1.f);
    const FLinearColor Accent(.94f, .66f, .31f, 1.f);
    const FLinearColor Surface(.035f, .075f, .09f, .86f);
    const FLinearColor Line(.25f, .40f, .40f, .9f);
    UFont* Medium = GEngine->GetMediumFont();
    UFont* Small = GEngine->GetSmallFont();

    DrawRect(Surface, Pad, Pad, PanelWidth, 199.f * Scale);
    DrawRect(Accent, Pad, Pad, 5.f * Scale, 199.f * Scale);
    DrawLabel(Traveler->Phase == EFlowFestPhase::Morning ? TEXT("FLOW FEST  /  FRIDAY MORNING") : TEXT("FLOW FEST  /  THURSDAY ARRIVAL"), Accent, Pad + 22.f * Scale, Pad + 17.f * Scale, Small, 1.22f * Scale);
    const FString Title = Traveler->GetObjectiveTitle();
    DrawLabel(Title, Ink, Pad + 22.f * Scale, Pad + 51.f * Scale, Medium, (Title.Len() > 37 ? 1.8f : 2.1f) * Scale);
    const FString Detail = Traveler->GetObjectiveDetail();
    const int32 MaxDetailChars = W < 1100.f ? 43 : 75;
    int32 BreakAt = INDEX_NONE;
    if (Detail.Len() > MaxDetailChars) BreakAt = Detail.Find(TEXT(" "), ESearchCase::CaseSensitive, ESearchDir::FromEnd, MaxDetailChars);
    DrawLabel(BreakAt > 0 ? Detail.Left(BreakAt) : Detail, Muted, Pad + 22.f * Scale, Pad + 102.f * Scale, Small, 1.18f * Scale);
    if (BreakAt > 0) DrawLabel(Detail.Mid(BreakAt + 1), Muted, Pad + 22.f * Scale, Pad + 120.f * Scale, Small, 1.18f * Scale);
    DrawRect(Line, Pad + 22.f * Scale, Pad + 145.f * Scale, PanelWidth - 44.f * Scale, 1.f * Scale);
    DrawLabel(Traveler->GetInteractHint(), Accent, Pad + 22.f * Scale, Pad + 157.f * Scale, Medium, 1.35f * Scale);
    const FString Notice = Traveler->GetNotice();
    if (!Notice.IsEmpty())
    {
        DrawRect(Surface, Pad, Pad + 210.f * Scale, PanelWidth, 43.f * Scale);
        DrawLabel(Notice, Ink, Pad + 16.f * Scale, Pad + 221.f * Scale, Small, 1.08f * Scale);
    }

    const float StatusWidth = 250.f * Scale;
    const float StatusX = W - StatusWidth - Pad;
    DrawRect(Surface, StatusX, Pad, StatusWidth, 143.f * Scale);
    DrawLabel(Traveler->GetModeLabel(), Accent, StatusX + 16.f * Scale, Pad + 15.f * Scale, Small, 1.3f * Scale);
    const AFlowFestWorld* FestivalWorld = Traveler->GetFestivalWorld();
    if (FestivalWorld)
    {
        float Hours = FestivalWorld->GetTimeOfDay();
        const int32 HH = FMath::FloorToInt(Hours);
        const int32 MM = FMath::FloorToInt((Hours - HH) * 60.f);
        DrawLabel(FString::Printf(TEXT("%02d:%02d  /  %s"), HH, MM, Traveler->Phase == EFlowFestPhase::Morning ? TEXT("FRIDAY") : TEXT("THURSDAY")), Ink,
            StatusX + 16.f * Scale, Pad + 48.f * Scale, Small, 1.15f * Scale);
    }
    DrawLabel(FString::Printf(TEXT("ENERGY  %d%%"), FMath::RoundToInt(Traveler->Energy)), Muted,
        StatusX + 16.f * Scale, Pad + 81.f * Scale, Small, 1.12f * Scale);
    DrawLabel(FString::Printf(TEXT("HUNGER  %d%%"), FMath::RoundToInt(Traveler->Hunger)), Muted,
        StatusX + 16.f * Scale, Pad + 106.f * Scale, Small, 1.12f * Scale);
    const FString NearbyIntent = Traveler->GetNearbyIntent();
    if (!NearbyIntent.IsEmpty())
    {
        const float IntentY = Pad + (Notice.IsEmpty() ? 210.f : 263.f) * Scale;
        DrawRect(Surface, Pad, IntentY, PanelWidth, 66.f * Scale);
        int32 IntentBreak = NearbyIntent.Len() > 66 ? NearbyIntent.Find(TEXT(" "), ESearchCase::CaseSensitive, ESearchDir::FromEnd, 66) : INDEX_NONE;
        DrawLabel(IntentBreak > 0 ? NearbyIntent.Left(IntentBreak) : NearbyIntent, Ink, Pad + 16.f * Scale, IntentY + 10.f * Scale, Small, 1.05f * Scale);
        if (IntentBreak > 0) DrawLabel(NearbyIntent.Mid(IntentBreak + 1), Muted, Pad + 16.f * Scale, IntentY + 34.f * Scale, Small, 1.05f * Scale);
    }

    // A restrained in-world direction cue. It reports distance but does not complete objectives.
    if (Traveler->Phase != EFlowFestPhase::Loadout && Traveler->Phase != EFlowFestPhase::ChooseCamp && Traveler->Phase != EFlowFestPhase::Morning)
    {
        const FVector Delta = Traveler->GetObjectiveLocation() - Traveler->GetActorLocation();
        const float RelativeYaw = FMath::DegreesToRadians(FMath::FindDeltaAngleDegrees(PlayerOwner->GetControlRotation().Yaw, Delta.Rotation().Yaw));
        const float CenterX = W * .5f;
        const float MarkerY = H - 155.f * Scale;
        DrawRect(Surface, CenterX - 108.f * Scale, MarkerY - 13.f * Scale, 216.f * Scale, 47.f * Scale);
        const float TipX = CenterX + FMath::Clamp(FMath::Sin(RelativeYaw) * 75.f * Scale, -75.f * Scale, 75.f * Scale);
        DrawLabel(TEXT("^"), Accent, TipX - 6.f * Scale, MarkerY - 14.f * Scale, Medium, 1.2f * Scale);
        DrawLabel(FString::Printf(TEXT("%.0f m"), Traveler->GetObjectiveDistanceMeters()), Ink, CenterX - 28.f * Scale, MarkerY + 15.f * Scale, Small, 1.1f * Scale);
    }

    const float FooterH = 64.f * Scale;
    DrawRect(Surface, Pad, H - FooterH - Pad, W - 2.f * Pad, FooterH);
    DrawLabel(TEXT("WASD MOVE  |  MOUSE LOOK  |  SHIFT SPRINT  |  SPACE JUMP  |  E INTERACT  |  Q FLOW  |  V EUC  |  C CHARACTER + GEAR"), Ink,
        Pad + 15.f * Scale, H - FooterH - Pad + 11.f * Scale, Small, 1.08f * Scale);
    DrawLabel(TEXT("H HELLO  |  R ROUTINE  |  F6 LIBRARY  |  M SOUND  |  F CAMERA  |  P FLY  |  T TRAVEL  |  G LIGHT  |  F5 SAVE  |  F9 LOAD  |  F10 RESTART"), Muted,
        Pad + 15.f * Scale, H - FooterH - Pad + 36.f * Scale, Small, 1.03f * Scale);

    // Minimal crosshair remains visible over complex terrain.
    DrawRect(Ink, W * .5f - 2.f * Scale, H * .5f - 2.f * Scale, 4.f * Scale, 4.f * Scale);
}

void AFlowFestHUD::DrawWardrobe(AFlowFestCharacter* Traveler)
{
    const float W = Canvas->SizeX, H = Canvas->SizeY;
    const float S = FMath::Min(W / 1920.f, H / 1080.f);
    const float X = W - 910.f * S, Y = 38.f * S, PW = 872.f * S;
    const FLinearColor Ink(.96f, .95f, .90f), Muted(.62f, .72f, .72f), Accent(.97f, .69f, .34f);
    const FLinearColor Surface(.025f, .054f, .066f, .96f), Button(.075f, .11f, .12f, 1.f);
    UFont* Font = GEngine->GetSmallFont();
    DrawRect(Surface, X, Y, PW, H - 76.f * S);
    DrawRect(Accent, X, Y, PW, 3.f * S);
    auto Text = [&](const FString& Label, float DX, float DY, FLinearColor Color, float Size = 1.4f)
    { DrawLabel(Label, Color, X + DX * S, Y + DY * S, Font, Size * S); };
    auto Choice = [&](const FString& Label, FName Key, float DX, float DY, float Width, bool Selected)
    {
        const bool Over = Hovered == Key;
        const float BX = X + DX * S, BY = Y + DY * S;
        DrawRect(Selected ? FLinearColor(.20f, .24f, .22f) : Over ? FLinearColor(.12f, .19f, .20f) : Button, BX, BY, Width * S, 42.f * S);
        if (Selected) DrawRect(Accent, BX, BY, 3.f * S, 42.f * S);
        DrawLabel(Label, Selected ? Accent : Ink, BX + 12.f * S, BY + 12.f * S, Font, (Label.Len() > 35 ? 1.02f : 1.22f) * S);
        AddHitBox(FVector2D(BX, BY), FVector2D(Width * S, 42.f * S), Key, true);
    };
    Text(TEXT("CHARACTER + GEAR"), 26, 25, Accent, 2.f);
    Text(TEXT("Choose your character and the props you bring."), 26, 67, Muted);
    Text(TEXT("CHARACTER"), 26, 115, Muted, 1.15f);
    const auto& Characters = Traveler->GetCharacters();
    for (int32 I = 0; I < Characters.Num(); ++I)
        Choice(Characters[I].Name, FName(*(TEXT("character:") + Characters[I].Id.ToString())), 26.f + (I % 4) * 207.f,
            143.f + (I / 4) * 50.f, 195.f, Characters[I].Id == Traveler->GetCharacterId());

    const auto& Props = Traveler->GetProps();
    constexpr int32 PageSize = 18;
    const int32 PageCount = FMath::Max(1, FMath::DivideAndRoundUp(Props.Num(), PageSize));
    PropPage = FMath::Clamp(PropPage, 0, PageCount - 1);
    Text(FString::Printf(TEXT("PROP LIBRARY   /   %d CHOICES"), Props.Num()), 26, 370, Muted, 1.15f);
    Text(FString::Printf(TEXT("%d / %d"), PropPage + 1, PageCount), 758, 370, Muted, 1.15f);
    for (int32 Cell = 0; Cell < PageSize; ++Cell)
    {
        const int32 I = PropPage * PageSize + Cell;
        if (!Props.IsValidIndex(I)) break;
        Choice(Props[I].Name, FName(*(TEXT("prop:") + Props[I].Id.ToString())), 26.f + (Cell % 2) * 414.f,
            401.f + (Cell / 2) * 50.f, 402.f, Props[I].Id == Traveler->GetEquippedPropId());
    }
    Choice(TEXT("< PREVIOUS"), TEXT("previous"), 26, 873, 195, false);
    Choice(TEXT("NEXT >"), TEXT("next"), 233, 873, 195, false);
    Choice(TEXT("BACK TO FESTIVAL  [C]"), TEXT("close"), 440, 873, 402, false);
    Text(TEXT("Selections save automatically with your journey."), 26, 944, Muted, 1.2f);

    FString CharacterName = Traveler->GetCharacterId().ToString();
    FString PropName = Traveler->GetEquippedPropId().ToString();
    for (const auto& Item : Characters) if (Item.Id == Traveler->GetCharacterId()) CharacterName = Item.Name;
    for (const auto& Item : Props) if (Item.Id == Traveler->GetEquippedPropId()) PropName = Item.Name;
    DrawRect(Surface, 38.f * S, H - 150.f * S, 680.f * S, 112.f * S);
    DrawLabel(CharacterName, Ink, 62.f * S, H - 132.f * S, GEngine->GetMediumFont(), 1.5f * S);
    DrawLabel(PropName, Accent, 62.f * S, H - 84.f * S, Font, 1.4f * S);
    const FString Notice = Traveler->GetNotice();
    if (!Notice.IsEmpty()) DrawLabel(Notice, Accent, 62.f * S, 48.f * S, Font, 1.4f * S);
}

void AFlowFestHUD::NotifyHitBoxClick(FName BoxName)
{
    Super::NotifyHitBoxClick(BoxName);
    AFlowFestCharacter* Traveler = PlayerOwner ? Cast<AFlowFestCharacter>(PlayerOwner->GetPawn()) : nullptr;
    if (!Traveler || !Traveler->IsWardrobeOpen()) return;
    const FString Key = BoxName.ToString();
    if (Key.StartsWith(TEXT("character:"))) Traveler->ChooseCharacter(FName(*Key.Mid(10)));
    else if (Key.StartsWith(TEXT("prop:"))) Traveler->ChooseProp(FName(*Key.Mid(5)));
    else if (BoxName == TEXT("previous")) --PropPage;
    else if (BoxName == TEXT("next")) ++PropPage;
    else if (BoxName == TEXT("close")) Traveler->ToggleWardrobe();
}
