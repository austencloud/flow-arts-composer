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
#if WITH_DEV_AUTOMATION_TESTS
    friend class FComposerViewerBridgeTest;
#endif
    UPROPERTY() TObjectPtr<USceneComponent> Root;
    UPROPERTY() TObjectPtr<UStaticMeshComponent> Floor;
    UPROPERTY() TObjectPtr<UStaticMeshComponent> Dais;
    UPROPERTY() TObjectPtr<UDirectionalLightComponent> KeyLight;
    UPROPERTY() TObjectPtr<UPointLightComponent> RimLight;
    UPROPERTY() TObjectPtr<USkyLightComponent> FillLight;
    UPROPERTY() TObjectPtr<ACameraActor> Camera;
    UPROPERTY() TMap<FString, TObjectPtr<AComposerViewerPerformer>> Performers;
    FString Session;
    FString SelectedPerformerId;
    int32 Revision = 0;
    bool bInputBound = false;
    bool bCameraBound = false;
    bool bComposerCameraFov = false;
    float ComposerVerticalFov = 50.f;
    int32 CameraViewportWidth = 0;
    int32 CameraViewportHeight = 0;
    TArray<FString> SupportedCharacterIds;
    TArray<FString> SupportedPropIds;
    TMap<FString, FString> RigHashes;
    FString MotionTransferId;
    FString MotionPerformerId;
    TArray<FString> MotionChunks;
    int64 MotionTotalBytes = 0;
    int64 MotionReceivedChars = 0;
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
    bool BeginMotion(const TSharedPtr<FJsonObject>& Payload, FString& ErrorCode, FString& ErrorMessage);
    bool MotionChunk(const TSharedPtr<FJsonObject>& Payload, FString& ErrorCode, FString& ErrorMessage);
    bool CommitMotion(const TSharedPtr<FJsonObject>& Payload, FString& ErrorCode, FString& ErrorMessage);
    void ClearMotionTransfer();
    void AimCamera();
    void UpdateComposerCameraFov();
    static float HorizontalFovForVertical(float VerticalFov, float Aspect);
    void LoadAssetCatalog();
};
