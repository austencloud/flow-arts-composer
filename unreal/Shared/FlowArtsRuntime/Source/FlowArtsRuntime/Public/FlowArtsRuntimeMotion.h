#pragma once

#include "CoreMinimal.h"
#include "Templates/SharedPointer.h"

class USkeletalMesh;
struct FPoseContext;

/** Immutable sampled production-performer motion, loaded from a portable score bundle. */
class FLOWARTSRUNTIME_API FFlowArtsRuntimeMotion
{
public:
    FFlowArtsRuntimeMotion() = default;
    static bool LoadFromFile(const FString& Path, const FString& ExpectedCharacterId,
        const FString& ExpectedRigSHA256, const USkeletalMesh* NativeMesh,
        TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe>& Out, FString& Error);
    static bool Parse(const FString& Json, const FString& ExpectedCharacterId,
        const FString& ExpectedRigSHA256, const USkeletalMesh* NativeMesh,
        TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe>& Out, FString& Error);

    bool SamplePose(FPoseContext& Output, double Seconds, const FTransform& MeshPresentation) const;
    bool SamplePropFrame(double Seconds, TArray<float>& OutValues) const;
    /** Discrete per-hand presence; older captures keep both props visible. */
    bool SamplePropVisibility(double Seconds, bool (&OutVisible)[2]) const;
    // Socket coordinates are source hand-local metres, before native retargeting.
    // Strict contact preserves this authored socket while refining the fingers.
    bool SampleGrip(double Seconds, float& OutRelaxation, FVector& OutLeftSourcePalmLocal,
        FVector& OutRightSourcePalmLocal) const;
    /** Preserve the authored socket in the retargeted native hand's local basis. */
    bool SampleNativeGrip(double Seconds, const FTransform& MeshPresentation,
        FVector& OutLeftNativePalmLocal, FVector& OutRightNativePalmLocal) const;
    bool HasDynamicGrip() const { return bDynamicGrip; }
    bool SampleSourcePalms(double Seconds, FVector& OutLeftPerformerCm,
        FVector& OutRightPerformerCm) const;
    static FTransform RetargetWorldPose(const FTransform& SourceBind,
        const FTransform& SourceFrame, const FTransform& NativeBindWorld);
    /** Blend parent-local capture keys, then compose their performer-space hierarchy. */
    static void InterpolateLocalHierarchy(TArrayView<const FTransform> A, TArrayView<const FTransform> B,
        TArrayView<const int32> Parents, float Alpha, TArrayView<FTransform> OutWorld);

    float GetDurationSeconds() const { return static_cast<float>(DurationSeconds); }
    int32 GetFrameCount() const { return Frames.Num(); }
    int32 GetFps() const { return Fps; }
    double GetSampleRate() const { return (bLoop ? Frames.Num() : Frames.Num() - 1) / DurationSeconds; }
    bool IsLooping() const { return bLoop; }
    const FString& GetCharacterId() const { return CharacterId; }
    const FString& GetPropFamily() const { return PropFamily; }
    const FString& GetPropId() const { return PropId; }
    const FString& GetCapturePlane() const { return CapturePlane; }
    const FString& GetSequenceJson() const { return SequenceJson; }
    const FString& GetSequenceSHA256() const { return SequenceSHA256; }
    // Zero preserves the equipped catalog geometry for older exports.
    float GetEffectivePropLengthCm() const { return EffectivePropLengthCm; }
    FName GetProfile() const { return Profile; }

private:
    struct FBone
    {
        FName Name;
        int32 Parent = INDEX_NONE;
        int32 NativeIndex = INDEX_NONE;
        FTransform SourceBind;
        FTransform NativeBind;
    };
    struct FFrame
    {
        TArray<FTransform> Bones;
        TArray<FTransform> LocalBones;
        TArray<float> Prop;
        bool PropVisible[2] = {true, true};
        float GripRelaxation = 0.f;
        FVector SourcePalmLocal[2] = {FVector::ZeroVector, FVector::ZeroVector};
    };
    void FramePair(double Seconds, int32& A, int32& B, float& Alpha) const;

    FString CharacterId;
    FString PropFamily;
    FString PropId;
    FString CapturePlane = TEXT("wall");
    FString SequenceJson;
    FString SequenceSHA256;
    FName Profile;
    int32 Fps = 30;
    double DurationSeconds = 0.0;
    float EffectivePropLengthCm = 0.0f;
    bool bLoop = true;
    bool bDynamicGrip = false;
    int32 SourceHandIndices[2] = {INDEX_NONE, INDEX_NONE};
    TArray<FBone> Bones;
    TArray<int32> SourceParents;
    TArray<FFrame> Frames;
    TArray<int32> NativeToSource;
    TArray<FName> NativeNames;
    TArray<FTransform> NativeRefComponent;
};
