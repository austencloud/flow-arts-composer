#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "FlowFestHUD.generated.h"

UCLASS()
class FLOWFEST_API AFlowFestHUD : public AHUD
{
    GENERATED_BODY()
public:
    AFlowFestHUD();
    virtual void DrawHUD() override;
    virtual void NotifyHitBoxClick(FName BoxName) override;
    virtual void NotifyHitBoxBeginCursorOver(FName BoxName) override { Hovered = BoxName; }
    virtual void NotifyHitBoxEndCursorOver(FName BoxName) override { if (Hovered == BoxName) Hovered = NAME_None; }
private:
    UPROPERTY() TObjectPtr<UFont> RuntimeFont;
    void DrawLabel(const FString& Text, FLinearColor Color, float X, float Y, UFont* Font, float Scale);
    void DrawWardrobe(class AFlowFestCharacter* Traveler);
    FName Hovered;
    int32 PropPage = 0;
};
