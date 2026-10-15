#include "MuseumHUD.h"
#include "MuseumCharacter.h"
#include "MuseumWorld.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "GameFramework/PlayerController.h"

namespace
{
TArray<FString> Wrap(const FString& Source, int32 Limit)
{
    TArray<FString> Words;
    Source.ParseIntoArrayWS(Words);
    TArray<FString> Lines;
    FString Line;
    for (const FString& Word : Words)
    {
        if (Line.Len() + Word.Len() + 1 > Limit && !Line.IsEmpty()) { Lines.Add(Line); Line.Empty(); }
        Line += Line.IsEmpty() ? Word : TEXT(" ") + Word;
    }
    if (!Line.IsEmpty()) Lines.Add(Line);
    return Lines;
}
}

void AMuseumHUD::DrawHUD()
{
    Super::DrawHUD();
    if (!Canvas || !PlayerOwner) return;
    const AMuseumCharacter* Visitor = Cast<AMuseumCharacter>(PlayerOwner->GetPawn());
    if (!Visitor) return;
    const AMuseumWorld* Museum = Visitor->GetMuseumWorld();
    const float W = Canvas->SizeX;
    const float H = Canvas->SizeY;
    UFont* Font = GEngine ? GEngine->GetSmallFont() : nullptr;
    const FLinearColor Cream(.94f, .88f, .70f);
    const FLinearColor Soft(.75f, .79f, .84f);
    DrawRect(FLinearColor(.015f, .02f, .025f, .88f), 16, 16, 415, 90);
    DrawText(TEXT("THE KINETIC ARCHIVE"), Cream, 30, 26, Font, 1.5f);
    if (Museum)
    {
        const FMuseumRoom* Room = Museum->RoomAt(Visitor->GetActorLocation());
        DrawText(Room ? Room->Name : TEXT("Between galleries"), Soft, 30, 59, Font, 1.1f);
        DrawText(FString::Printf(TEXT("%d rooms  |  %d exhibits  |  %d figures"), Museum->GetRooms().Num(), Museum->GetExhibitCount(), Museum->GetPerformerCount()), Soft, 30, 82, Font, .85f);
    }
    DrawText(TEXT("WASD + mouse  |  E examine  |  F5 save  |  F9 load  |  R entrance"), Soft, 22, H - 32, Font, 1.f);
    if (!Visitor->GetNotice().IsEmpty()) DrawText(Visitor->GetNotice(), Cream, W * .42f, 30, Font, 1.2f);
    if (const FMuseumExhibit* Exhibit = Visitor->GetOpenExhibit())
    {
        const float X = FMath::Max(40.f, (W - 800.f) / 2.f);
        const float PanelW = FMath::Min(800.f, W - 80.f);
        const float Y = H * .16f;
        DrawRect(FLinearColor(.025f, .033f, .035f, .96f), X, Y, PanelW, H * .65f);
        DrawText(Exhibit->Title, Cream, X + 35, Y + 28, Font, 1.6f);
        if (!Exhibit->Subtitle.IsEmpty()) DrawText(Exhibit->Subtitle, Soft, X + 35, Y + 62, Font, 1.f);
        float LineY = Y + 110;
        for (const FString& Line : Wrap(Exhibit->Body, 83))
        {
            DrawText(Line, FLinearColor::White, X + 35, LineY, Font, 1.1f);
            LineY += 25;
        }
        if (!Exhibit->Footer.IsEmpty()) DrawText(Exhibit->Footer, Soft, X + 35, FMath::Min(LineY + 20, Y + H * .58f), Font, .95f);
        DrawText(TEXT("E CLOSE"), Cream, X + PanelW - 105, Y + H * .60f, Font, 1.f);
    }
    else if (const FMuseumExhibit* Exhibit = Visitor->GetNearbyExhibit())
    {
        DrawRect(FLinearColor(.025f, .033f, .035f, .88f), W / 2 - 220, H - 105, 440, 55);
        DrawText(FString::Printf(TEXT("E  EXAMINE  %s"), *Exhibit->Title), Cream, W / 2 - 200, H - 88, Font, 1.f);
    }
}
