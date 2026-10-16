#pragma once
#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "MuseumHUD.generated.h"

UCLASS()
class MUSEUMGAME_API AMuseumHUD : public AHUD
{
    GENERATED_BODY()
public:
    virtual void DrawHUD() override;
};
