#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ComposerViewerStage.generated.h"

class ACameraActor;
class AComposerViewerPerformer;
class IPixelStreaming2Streamer;
class UStaticMeshComponent;
class UDirectionalLightComponent;
class USkyLightComponent;
class UPointLightComponent;
class USceneComponent;
class FJsonObject;

/** Native scene and versioned adapter for Composer's existing web controls. */
UCLASS()
class COMPOSERVIEWER_API AComposerViewerStage : public AActor
{
    GENERATED_BODY()
public:
    AComposerViewerStage();
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;

private:
    UPROPERTY() TObjectPtr<USceneComponent> Root;
    UPROPERTY() TObjectPtr<UStaticMeshComponent> Floor;
    UPROPERTY() TObjectPtr<UStaticMeshComponent> Dais;
    UPROPERTY() TObjectPtr<UDirectionalLightComponent> KeyLight;
    UPROPERTY() TObjectPtr<UPointLightComponent> RimLight;
    UPROPERTY() TObjectPtr<USkyLightComponent> FillLight;
    UPROPERTY() TObjectPtr<ACameraActor> Camera;
    UPROPERTY() TObjectPtr<AComposerViewerPerformer> Performer;
    FString Session;
    FString SelectedPerformerId;
    int32 Revision = 0;
    bool bInputBound = false;
    bool bCameraBound = false;
    bool bStaffReady = false;
    bool bFanReady = false;
    TArray<FString> SupportedPropIds;
    FVector CameraTarget = FVector(0, 0, 110);
    FString CameraMode = TEXT("orbit");
    TWeakPtr<IPixelStreaming2Streamer> Streamer;

    void BindInput();
    void HandleCommand(const FString& PlayerId, const FString& Descriptor);
    void SendResult(const FString& PlayerId, const FString& ReplyTo, bool bOk,
        const FString& ErrorCode = FString(), const FString& ErrorMessage = FString());
    TSharedPtr<FJsonObject> MakeState() const;
    bool SetPerformer(const TSharedPtr<FJsonObject>& Payload, FString& ErrorCode, FString& ErrorMessage);
    bool SetCamera(const TSharedPtr<FJsonObject>& Payload, FString& ErrorCode, FString& ErrorMessage);
    bool SetPlayback(const TSharedPtr<FJsonObject>& Payload, FString& ErrorCode, FString& ErrorMessage);
    void AimCamera();
    void LoadSupportedPropIds();
};
