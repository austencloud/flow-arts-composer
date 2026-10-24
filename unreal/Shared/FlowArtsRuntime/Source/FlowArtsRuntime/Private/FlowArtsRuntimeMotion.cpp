#include "FlowArtsRuntimeMotion.h"

#include "FlowArtsPerformanceLibrary.h"
#include "Animation/AnimNodeBase.h"
#include "Animation/Skeleton.h"
#include "BonePose.h"
#include "Dom/JsonObject.h"
#include "Engine/SkeletalMesh.h"
#include "HAL/FileManager.h"
#include "Misc/FileHelper.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#if PLATFORM_WINDOWS
#include "Windows/WindowsHWrapper.h"
#include "Windows/AllowWindowsPlatformTypes.h"
THIRD_PARTY_INCLUDES_START
#include <bcrypt.h>
THIRD_PARTY_INCLUDES_END
#include "Windows/HideWindowsPlatformTypes.h"
#endif

namespace
{
constexpr int32 MaxFrames = 18001;
constexpr int32 MaxBones = 512;
constexpr int32 PropWidth = 28;
constexpr int64 MaxMotionFileBytes = 256ll * 1024 * 1024;

FString PayloadHash(const FString& Json)
{
#if PLATFORM_WINDOWS
    BCRYPT_ALG_HANDLE Algorithm = nullptr;
    if (BCryptOpenAlgorithmProvider(&Algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) < 0) return FString();
    const FTCHARToUTF8 Utf8(*Json);
    uint8 Digest[32]{};
    const NTSTATUS Status = BCryptHash(Algorithm, nullptr, 0,
        reinterpret_cast<PUCHAR>(const_cast<ANSICHAR*>(Utf8.Get())),
        static_cast<ULONG>(Utf8.Length()), Digest, sizeof(Digest));
    BCryptCloseAlgorithmProvider(Algorithm, 0);
    if (Status < 0) return FString();
    FString Result;
    Result.Reserve(64);
    for (const uint8 Byte : Digest) Result += FString::Printf(TEXT("%02x"), Byte);
    return Result;
#else
    return FString();
#endif
}

bool Hash(const FString& Value)
{
    if (Value.Len() != 64) return false;
    for (TCHAR C : Value)
        if (!((C >= '0' && C <= '9') || (C >= 'a' && C <= 'f'))) return false;
    return true;
}

bool FieldObject(const TSharedPtr<FJsonObject>& Object, const TCHAR* Name, const TSharedPtr<FJsonObject>*& Out)
{
    return Object.IsValid() && Object->TryGetObjectField(Name, Out) && Out && Out->IsValid();
}

bool FieldArray(const TSharedPtr<FJsonObject>& Object, const TCHAR* Name,
    const TArray<TSharedPtr<FJsonValue>>*& Out)
{
    return Object.IsValid() && Object->TryGetArrayField(Name, Out) && Out;
}

bool NumberArray(const TArray<TSharedPtr<FJsonValue>>* Values, int32 Width, TArray<float>& Out)
{
    if (!Values || Values->Num() != Width) return false;
    Out.Reset(Width);
    for (const TSharedPtr<FJsonValue>& Value : *Values)
    {
        double Number = 0;
        if (!Value.IsValid() || !Value->TryGetNumber(Number) || !FMath::IsFinite(Number) ||
            FMath::Abs(Number) > 1e8) return false;
        Out.Add(static_cast<float>(Number));
    }
    return true;
}

bool Transform(const TSharedPtr<FJsonValue>& Value, FTransform& Out)
{
    const TArray<TSharedPtr<FJsonValue>>* Elements = nullptr;
    TArray<float> V;
    if (!Value.IsValid() || !Value->TryGetArray(Elements) || !NumberArray(Elements, 10, V)) return false;
    const FQuat Q(-V[5], V[3], -V[4], V[6]);
    if (!FMath::IsNearlyEqual(Q.SizeSquared(), 1.f, .02f) ||
        V[7] <= 0.f || V[8] <= 0.f || V[9] <= 0.f) return false;
    // Three performer axes (x right, y up, z forward) -> Unreal (z, -x, y).
    Out = FTransform(Q.GetNormalized(), FVector(V[2], -V[0], V[1]) * 100.f,
        FVector(V[9], V[7], V[8]));
    return true;
}

bool NameKey(const FString& Value)
{
    if (Value.IsEmpty() || Value.Len() > 128) return false;
    for (TCHAR C : Value)
        if (!FChar::IsAlnum(C) && C != '_' && C != ':' && C != '-') return false;
    return true;
}

FString NativeBoneName(const FString& Source, const FReferenceSkeleton& Native)
{
    if (Native.FindBoneIndex(FName(*Source)) != INDEX_NONE) return Source;
    // GLTFLoader removes the colon from Mixamo namespaces. Numbered exports
    // therefore arrive as either mixamorig12:Hips or mixamorig12Hips.
    if (!Source.StartsWith(TEXT("mixamorig"), ESearchCase::CaseSensitive)) return Source;
    int32 Start = 9;
    while (Start < Source.Len() && Source[Start] >= '0' && Source[Start] <= '9') ++Start;
    if (Start < Source.Len() && Source[Start] == ':') ++Start;
    const FString Candidate = Source.Mid(Start);
    // Only remove a recognized namespace when the remainder is a native bone;
    // an unrelated word such as mixamorigCustom:Hips must not alias Hips.
    if (!Candidate.IsEmpty() && Native.FindBoneIndex(FName(*Candidate)) != INDEX_NONE) return Candidate;
    return Source;
}

void SlerpGroup(const TArray<float>& A, const TArray<float>& B, int32 Start, float Alpha,
    TArray<float>& Out)
{
    const FQuat QA(A[Start], A[Start + 1], A[Start + 2], A[Start + 3]);
    const FQuat QB(B[Start], B[Start + 1], B[Start + 2], B[Start + 3]);
    const FQuat Q = FQuat::Slerp(QA, QB, Alpha).GetNormalized();
    Out[Start] = Q.X; Out[Start + 1] = Q.Y;
    Out[Start + 2] = Q.Z; Out[Start + 3] = Q.W;
}
}

bool FFlowArtsRuntimeMotion::LoadFromFile(const FString& Path, const FString& ExpectedCharacterId,
    const FString& ExpectedRigSHA256, const USkeletalMesh* NativeMesh,
    TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe>& Out, FString& Error)
{
    Out.Reset();
    const int64 FileBytes = IFileManager::Get().FileSize(*Path);
    if (FileBytes > MaxMotionFileBytes)
    {
        Error = TEXT("Runtime motion file is too large");
        return false;
    }
    if (FileBytes < 0)
    {
        Error = FString::Printf(TEXT("Cannot read runtime motion file: %s"), *Path);
        return false;
    }
    FString Json;
    if (!FFileHelper::LoadFileToString(Json, *Path))
    {
        Error = FString::Printf(TEXT("Cannot read runtime motion file: %s"), *Path);
        return false;
    }
    return Parse(Json, ExpectedCharacterId, ExpectedRigSHA256, NativeMesh, Out, Error);
}

bool FFlowArtsRuntimeMotion::Parse(const FString& Json, const FString& ExpectedCharacterId,
    const FString& ExpectedRigSHA256, const USkeletalMesh* NativeMesh,
    TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe>& Out, FString& Error)
{
    Out.Reset();
    if (Json.Len() < 100 || Json.Len() > 256 * 1024 * 1024 || !NativeMesh ||
        ExpectedCharacterId.IsEmpty() || !Hash(ExpectedRigSHA256))
    {
        Error = TEXT("Runtime motion input or expected rig identity is missing");
        return false;
    }
    TSharedPtr<FJsonObject> Root;
    if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json), Root) || !Root.IsValid())
    {
        Error = TEXT("Runtime motion JSON is malformed");
        return false;
    }
    FString Schema, Revision, Character, Prop, Family, Space, RigHash, SequenceHash, Sequence,
        BundleHash, CapturePlane = TEXT("wall");
    double FpsValue = 0, FrameCountValue = 0, Duration = 0;
    bool bLoopValue = false;
    const TSharedPtr<FJsonObject>* Skeleton = nullptr;
    const TArray<TSharedPtr<FJsonValue>>* BoneRows = nullptr;
    const TArray<TSharedPtr<FJsonValue>>* FrameRows = nullptr;
    if (!Root->TryGetStringField(TEXT("schema"), Schema) || Schema != TEXT("flow-arts-runtime-motion-v1") ||
        !Root->TryGetStringField(TEXT("captureRevision"), Revision) ||
        (Revision != TEXT("clock-isolated-body-v3") && Revision != TEXT("monotonic-grip-validated-v4") &&
            Revision != TEXT("monotonic-dynamic-grip-v5")) ||
        !Root->TryGetStringField(TEXT("characterId"), Character) || Character != ExpectedCharacterId || !NameKey(Character) ||
        !Root->TryGetStringField(TEXT("propId"), Prop) || !NameKey(Prop) ||
        !Root->TryGetStringField(TEXT("propFamily"), Family) || !NameKey(Family) ||
        (!Prop.ToLower().StartsWith(Family.ToLower() + TEXT(":")) &&
            !Prop.Equals(Family, ESearchCase::IgnoreCase)) ||
        !Root->TryGetStringField(TEXT("sequenceJson"), Sequence) ||
        !Root->TryGetStringField(TEXT("sequenceSHA256"), SequenceHash) ||
        !FFlowArtsPerformanceLibrary::VerifySnapshot(SequenceHash, Sequence) ||
        !Root->TryGetStringField(TEXT("bundleIdentitySHA256"), BundleHash) || !Hash(BundleHash) ||
        !Root->TryGetNumberField(TEXT("fps"), FpsValue) || FpsValue != 30 ||
        !Root->TryGetNumberField(TEXT("frameCount"), FrameCountValue) ||
        !Root->TryGetNumberField(TEXT("durationSeconds"), Duration) || !FMath::IsFinite(Duration) ||
        !Root->TryGetBoolField(TEXT("loop"), bLoopValue) ||
        !FieldObject(Root, TEXT("skeleton"), Skeleton) ||
        !(*Skeleton)->TryGetStringField(TEXT("space"), Space) || Space != TEXT("three-performer-meters") ||
        !(*Skeleton)->TryGetStringField(TEXT("rigSHA256"), RigHash) || RigHash != ExpectedRigSHA256 ||
        !FieldArray(*Skeleton, TEXT("bones"), BoneRows) ||
        !FieldArray(Root, TEXT("frames"), FrameRows))
    {
        Error = TEXT("Runtime motion schema, score hash, or trusted rig identity is invalid");
        return false;
    }
    double EffectiveLength = 0.0;
    if (Root->HasField(TEXT("effectivePropLengthCm")) &&
        (!Root->TryGetNumberField(TEXT("effectivePropLengthCm"), EffectiveLength) ||
         !FMath::IsFinite(EffectiveLength) || EffectiveLength <= 0.0 || EffectiveLength > 1000.0))
    {
        Error = TEXT("Runtime motion effective prop length is invalid");
        return false;
    }
    if (Root->HasField(TEXT("capturePlane")) &&
        (!Root->TryGetStringField(TEXT("capturePlane"), CapturePlane) ||
         (CapturePlane != TEXT("wall") && CapturePlane != TEXT("wheel") && CapturePlane != TEXT("floor"))))
    {
        Error = TEXT("Runtime motion capture plane is invalid");
        return false;
    }
    const FString IdentityJson = CapturePlane == TEXT("wall")
        ? FString::Printf(
            TEXT("{\"characterId\":\"%s\",\"loop\":%s,\"propId\":\"%s\",\"rigSHA256\":\"%s\",\"sequenceSHA256\":\"%s\"}"),
            *Character, bLoopValue ? TEXT("true") : TEXT("false"), *Prop, *RigHash, *SequenceHash)
        : FString::Printf(
            TEXT("{\"capturePlane\":\"%s\",\"characterId\":\"%s\",\"loop\":%s,\"propId\":\"%s\",\"rigSHA256\":\"%s\",\"sequenceSHA256\":\"%s\"}"),
            *CapturePlane, *Character, bLoopValue ? TEXT("true") : TEXT("false"), *Prop, *RigHash, *SequenceHash);
    if (!FFlowArtsPerformanceLibrary::VerifySnapshot(BundleHash, IdentityJson))
    {
        Error = TEXT("Runtime motion bundle identity hash is stale");
        return false;
    }
    const int32 Count = FrameRows->Num();
    if (Count < 1 || Count > MaxFrames + (bLoopValue ? 0 : 1) || FrameCountValue != Count ||
        BoneRows->IsEmpty() || BoneRows->Num() > MaxBones ||
        Duration <= 0.0 || Duration > 600.0 ||
        (Duration != static_cast<double>(bLoopValue ? Count : Count - 1) / 30.0 &&
         FMath::CeilToInt(Duration * 30.0) != (bLoopValue ? Count : Count - 1)) ||
        (!bLoopValue && Count < 2))
    {
        Error = TEXT("Runtime motion sample count or duration is invalid");
        return false;
    }

    double ContactSideSamples = -1.0;
    if (Revision != TEXT("clock-isolated-body-v3"))
    {
        const TSharedPtr<FJsonObject>* Grip = nullptr;
        FString Measurement, ContactMode, ReachPolicy;
        double MaxErrorCm = 0.0, LimitCm = 0.0;
        // This records the exporter gate; native playback still measures contact
        // independently after retargeting and collision correction.
        if (!FieldObject(Root, TEXT("gripValidation"), Grip) ||
            !(*Grip)->TryGetStringField(TEXT("measurement"), Measurement) ||
            Measurement != TEXT("same-frame-calibrated-palm-to-rendered-grip") ||
            !(*Grip)->TryGetStringField(TEXT("contactMode"), ContactMode) || ContactMode != TEXT("prop-authoritative") ||
            !(*Grip)->TryGetStringField(TEXT("reachPolicy"), ReachPolicy) || ReachPolicy != TEXT("paired-body-final-socket-v1") ||
            !(*Grip)->TryGetNumberField(TEXT("maxErrorCm"), MaxErrorCm) || !FMath::IsFinite(MaxErrorCm) || MaxErrorCm < 0.0 ||
            !(*Grip)->TryGetNumberField(TEXT("limitCm"), LimitCm) || LimitCm != 0.2 || MaxErrorCm > LimitCm ||
            !(*Grip)->TryGetNumberField(TEXT("sideSamples"), ContactSideSamples) ||
            !FMath::IsFinite(ContactSideSamples) || ContactSideSamples < 0.0 || ContactSideSamples > Count * 2.0)
        {
            Error = TEXT("Runtime motion palm contact validation is missing or invalid");
            return false;
        }
    }

    TSharedPtr<FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Motion =
        MakeShared<FFlowArtsRuntimeMotion, ESPMode::ThreadSafe>();
    Motion->CharacterId = Character;
    Motion->PropId = Prop;
    Motion->PropFamily = Family;
    Motion->CapturePlane = CapturePlane;
    Motion->EffectivePropLengthCm = static_cast<float>(EffectiveLength);
    Motion->SequenceJson = Sequence;
    Motion->SequenceSHA256 = SequenceHash;
    Motion->DurationSeconds = Duration;
    Motion->bLoop = bLoopValue;
    Motion->bDynamicGrip = Revision == TEXT("monotonic-dynamic-grip-v5");
    TMap<FName, int32> SourceByName;
    Motion->Bones.Reserve(BoneRows->Num());
    for (const TSharedPtr<FJsonValue>& RowValue : *BoneRows)
    {
        const TSharedPtr<FJsonObject>* Row = nullptr;
        FString Name, ParentName;
        const TArray<TSharedPtr<FJsonValue>>* RestArray = nullptr;
        const TArray<TSharedPtr<FJsonValue>>* BindArray = nullptr;
        FTransform Rest, Bind;
        if (!RowValue.IsValid() || !RowValue->TryGetObject(Row) || !Row || !Row->IsValid() ||
            !(*Row)->TryGetStringField(TEXT("name"), Name) || !NameKey(Name) ||
            !FieldArray(*Row, TEXT("rest"), RestArray) || !FieldArray(*Row, TEXT("bind"), BindArray) ||
            !Transform(MakeShared<FJsonValueArray>(*RestArray), Rest) ||
            !Transform(MakeShared<FJsonValueArray>(*BindArray), Bind) ||
            SourceByName.Contains(FName(*Name)))
        {
            Error = TEXT("Runtime motion skeleton has an invalid or duplicate bone");
            return false;
        }
        FBone Bone;
        Bone.Name = FName(*Name);
        if ((*Row)->HasTypedField<EJson::String>(TEXT("parent")))
        {
            if (!(*Row)->TryGetStringField(TEXT("parent"), ParentName) ||
                !SourceByName.Contains(FName(*ParentName)))
            {
                Error = TEXT("Runtime motion source skeleton is not parent ordered");
                return false;
            }
            Bone.Parent = SourceByName[FName(*ParentName)];
        }
        Bone.SourceBind = Bind;
        Motion->SourceParents.Add(Bone.Parent);
        SourceByName.Add(Bone.Name, Motion->Bones.Num());
        Motion->Bones.Add(Bone);
    }

    const FReferenceSkeleton& Native = NativeMesh->GetRefSkeleton();
    const int32 NativeCount = Native.GetNum();
    if (NativeCount < 1 || NativeCount > MaxBones)
    {
        Error = TEXT("Native skeletal mesh has an unsupported bone count");
        return false;
    }
    Motion->NativeToSource.Init(INDEX_NONE, NativeCount);
    Motion->NativeNames.SetNum(NativeCount);
    Motion->NativeRefComponent.SetNum(NativeCount);
    TMap<FName, int32> SourceByNativeName;
    for (int32 Index = 0; Index < Motion->Bones.Num(); ++Index)
    {
        const FName Key(*NativeBoneName(Motion->Bones[Index].Name.ToString(), Native));
        if (SourceByNativeName.Contains(Key))
        {
            Error = TEXT("Runtime source skeleton has ambiguous native bone names");
            return false;
        }
        SourceByNativeName.Add(Key, Index);
    }
    for (int32 Index = 0; Index < NativeCount; ++Index)
    {
        const int32 Parent = Native.GetParentIndex(Index);
        const FTransform RefLocal = Native.GetRefBonePose()[Index];
        Motion->NativeRefComponent[Index] = Parent == INDEX_NONE ? RefLocal
            : RefLocal * Motion->NativeRefComponent[Parent];
        const FName Name = Native.GetBoneName(Index);
        Motion->NativeNames[Index] = Name;
        const int32* Source = SourceByNativeName.Find(Name);
        if (!Source)
        {
            if (Index == 0 && Name == TEXT("RootNode1")) continue;
            Error = FString::Printf(TEXT("Runtime source lacks native bone %s"), *Name.ToString());
            return false;
        }
        Motion->NativeToSource[Index] = *Source;
        Motion->Bones[*Source].NativeIndex = Index;
        if (Name == TEXT("LeftHand")) Motion->SourceHandIndices[0] = *Source;
        else if (Name == TEXT("RightHand")) Motion->SourceHandIndices[1] = *Source;
    }
    if (Motion->bDynamicGrip && (Motion->SourceHandIndices[0] == INDEX_NONE || Motion->SourceHandIndices[1] == INDEX_NONE))
    {
        Error = TEXT("Runtime dynamic grip requires both source hands");
        return false;
    }

    Motion->Frames.Reserve(Count);
    int32 VisibleSideSamples = 0;
    for (int32 FrameIndex = 0; FrameIndex < Count; ++FrameIndex)
    {
        const TSharedPtr<FJsonObject>* FrameObject = nullptr;
        const TArray<TSharedPtr<FJsonValue>>* Poses = nullptr;
        const TArray<TSharedPtr<FJsonValue>>* PropValues = nullptr;
        if (!(*FrameRows)[FrameIndex].IsValid() || !(*FrameRows)[FrameIndex]->TryGetObject(FrameObject) ||
            !FrameObject || !FrameObject->IsValid() ||
            !FieldArray(*FrameObject, TEXT("bones"), Poses) || Poses->Num() != Motion->Bones.Num() ||
            !FieldArray(*FrameObject, TEXT("prop"), PropValues))
        {
            Error = FString::Printf(TEXT("Runtime motion frame %d has missing tracks"), FrameIndex);
            return false;
        }
        FFrame Frame;
        if ((*FrameObject)->HasField(TEXT("propVisibility")))
        {
            const TArray<TSharedPtr<FJsonValue>>* Visibility = nullptr;
            if (!FieldArray(*FrameObject, TEXT("propVisibility"), Visibility) || Visibility->Num() != 2 ||
                !(*Visibility)[0].IsValid() || (*Visibility)[0]->Type != EJson::Boolean ||
                !(*Visibility)[1].IsValid() || (*Visibility)[1]->Type != EJson::Boolean)
            {
                Error = FString::Printf(TEXT("Runtime motion frame %d has invalid prop visibility"), FrameIndex);
                return false;
            }
            Frame.PropVisible[0] = (*Visibility)[0]->AsBool();
            Frame.PropVisible[1] = (*Visibility)[1]->AsBool();
        }
        VisibleSideSamples += (Frame.PropVisible[0] ? 1 : 0) + (Frame.PropVisible[1] ? 1 : 0);
        if (Motion->bDynamicGrip)
        {
            double Relaxation = 0.0;
            const TArray<TSharedPtr<FJsonValue>>* PalmValues = nullptr;
            TArray<float> Palm;
            if (!(*FrameObject)->TryGetNumberField(TEXT("gripRelaxation"), Relaxation) ||
                !FMath::IsFinite(Relaxation) || Relaxation < 0.0 || Relaxation > 1.0 ||
                !FieldArray(*FrameObject, TEXT("palmLocal"), PalmValues) || !NumberArray(PalmValues, 6, Palm))
            {
                Error = FString::Printf(TEXT("Runtime motion frame %d has missing or invalid dynamic grip data"), FrameIndex);
                return false;
            }
            Frame.GripRelaxation = static_cast<float>(Relaxation);
            for (int32 Side = 0; Side < 2; ++Side)
            {
                Frame.SourcePalmLocal[Side] = FVector(Palm[Side * 3], Palm[Side * 3 + 1], Palm[Side * 3 + 2]);
                if (Frame.SourcePalmLocal[Side].SizeSquared() > .25)
                {
                    Error = FString::Printf(TEXT("Runtime motion frame %d has a dynamic grip outside the hand"), FrameIndex);
                    return false;
                }
            }
        }
        Frame.Bones.Reserve(Poses->Num());
        for (const TSharedPtr<FJsonValue>& Pose : *Poses)
        {
            FTransform Xf;
            if (!Transform(Pose, Xf))
            {
                Error = FString::Printf(TEXT("Runtime motion frame %d has an invalid bone transform"), FrameIndex);
                return false;
            }
            Frame.Bones.Add(Xf);
        }
        // Captures carry performer-space component transforms. The cooked FBX
        // animates parent-local tracks, so cache those once at decode and blend
        // them before composing the hierarchy at playback.
        Frame.LocalBones.Reserve(Frame.Bones.Num());
        for (int32 BoneIndex = 0; BoneIndex < Frame.Bones.Num(); ++BoneIndex)
        {
            const int32 Parent = Motion->SourceParents[BoneIndex];
            Frame.LocalBones.Add(Parent == INDEX_NONE ? Frame.Bones[BoneIndex] :
                Frame.Bones[BoneIndex].GetRelativeTransform(Frame.Bones[Parent]));
        }
        if (!NumberArray(PropValues, PropWidth, Frame.Prop))
        {
            Error = FString::Printf(TEXT("Runtime motion frame %d has an invalid prop track"), FrameIndex);
            return false;
        }
        for (int32 QuatStart : {3, 10, 20, 24})
        {
            const FQuat Q(Frame.Prop[QuatStart], Frame.Prop[QuatStart + 1],
                Frame.Prop[QuatStart + 2], Frame.Prop[QuatStart + 3]);
            if (!FMath::IsNearlyEqual(Q.SizeSquared(), 1.f, .02f))
            {
                Error = FString::Printf(TEXT("Runtime motion frame %d has an invalid prop rotation"), FrameIndex);
                return false;
            }
        }
        Motion->Frames.Add(MoveTemp(Frame));
    }
    if (Revision != TEXT("clock-isolated-body-v3") && ContactSideSamples != VisibleSideSamples)
    {
        Error = TEXT("Runtime motion palm contact count does not match visible prop samples");
        return false;
    }
    // Bundle identity remains compatible with older exports. Playback identity must
    // also distinguish captured transforms, clocks and dimensions of valid payloads.
    const FString ValidatedPayloadHash = PayloadHash(Json);
    if (ValidatedPayloadHash.IsEmpty())
    {
        Error = TEXT("Runtime motion payload identity could not be computed");
        return false;
    }
    Motion->Profile = FName(*FString::Printf(TEXT("Runtime_%s"), *ValidatedPayloadHash));
    Out = Motion;
    Error.Empty();
    return true;
}

void FFlowArtsRuntimeMotion::FramePair(double Seconds, int32& A, int32& B, float& Alpha) const
{
    const double Safe = FMath::IsFinite(Seconds) ? Seconds : 0.0;
    if (!bLoop && Safe >= DurationSeconds)
    {
        A = B = Frames.Num() - 1;
        Alpha = 0.f;
        return;
    }
    const double Time = bLoop ? FMath::Fmod(FMath::Fmod(Safe, DurationSeconds) + DurationSeconds, DurationSeconds)
        : FMath::Clamp(Safe, 0.0, static_cast<double>(DurationSeconds));
    const double Frame = Time * GetSampleRate();
    A = FMath::Clamp(FMath::FloorToInt(Frame), 0, Frames.Num() - 1);
    B = bLoop ? (A + 1) % Frames.Num() : FMath::Min(A + 1, Frames.Num() - 1);
    Alpha = static_cast<float>(FMath::Clamp(Frame - A, 0.0, 1.0));
}

bool FFlowArtsRuntimeMotion::SamplePropFrame(double Seconds, TArray<float>& OutValues) const
{
    OutValues.Reset();
    if (Frames.IsEmpty()) return false;
    int32 A, B; float Alpha;
    FramePair(Seconds, A, B, Alpha);
    OutValues.SetNumUninitialized(PropWidth);
    for (int32 Index = 0; Index < PropWidth; ++Index)
        OutValues[Index] = FMath::Lerp(Frames[A].Prop[Index], Frames[B].Prop[Index], Alpha);
    for (int32 Start : {3, 10, 20, 24})
        SlerpGroup(Frames[A].Prop, Frames[B].Prop, Start, Alpha, OutValues);
    return true;
}

bool FFlowArtsRuntimeMotion::SamplePropVisibility(double Seconds, bool (&OutVisible)[2]) const
{
    OutVisible[0] = OutVisible[1] = true;
    if (Frames.IsEmpty()) return false;
    int32 A, B; float Alpha;
    FramePair(Seconds, A, B, Alpha);
    // Snap only arithmetic noise at a sample boundary; presence never crossfades.
    const FFrame& Frame = Frames[Alpha >= 1.f - 1e-6f ? B : A];
    OutVisible[0] = Frame.PropVisible[0];
    OutVisible[1] = Frame.PropVisible[1];
    return true;
}

bool FFlowArtsRuntimeMotion::SampleGrip(double Seconds, float& OutRelaxation,
    FVector& OutLeftSourcePalmLocal, FVector& OutRightSourcePalmLocal) const
{
    OutRelaxation = 0.f;
    OutLeftSourcePalmLocal = OutRightSourcePalmLocal = FVector::ZeroVector;
    if (!bDynamicGrip || Frames.IsEmpty()) return false;
    int32 A, B; float Alpha;
    FramePair(Seconds, A, B, Alpha);
    OutRelaxation = FMath::Lerp(Frames[A].GripRelaxation, Frames[B].GripRelaxation, Alpha);
    OutLeftSourcePalmLocal = FMath::Lerp(Frames[A].SourcePalmLocal[0], Frames[B].SourcePalmLocal[0], Alpha);
    OutRightSourcePalmLocal = FMath::Lerp(Frames[A].SourcePalmLocal[1], Frames[B].SourcePalmLocal[1], Alpha);
    return true;
}

bool FFlowArtsRuntimeMotion::SampleSourcePalms(double Seconds, FVector& OutLeftPerformerCm,
    FVector& OutRightPerformerCm) const
{
    OutLeftPerformerCm = OutRightPerformerCm = FVector::ZeroVector;
    if (!bDynamicGrip || Frames.IsEmpty()) return false;
    int32 A, B; float Alpha;
    FramePair(Seconds, A, B, Alpha);
    TArray<FTransform, TInlineAllocator<128>> SourceWorld;
    SourceWorld.SetNumUninitialized(Bones.Num());
    InterpolateLocalHierarchy(Frames[A].LocalBones, Frames[B].LocalBones, SourceParents, Alpha,
        MakeArrayView(SourceWorld.GetData(), SourceWorld.Num()));
    FVector Palms[2];
    for (int32 Side = 0; Side < 2; ++Side)
    {
        const FTransform& Hand = SourceWorld[SourceHandIndices[Side]];
        const FVector Local = FMath::Lerp(Frames[A].SourcePalmLocal[Side], Frames[B].SourcePalmLocal[Side], Alpha);
        // Captured hand transforms already use performer centimetres and the
        // (z,-x,y) native basis. Convert only the source-local point here.
        Palms[Side] = Hand.TransformPosition(FVector(Local.Z, -Local.X, Local.Y) * 100.0);
    }
    OutLeftPerformerCm = Palms[0];
    OutRightPerformerCm = Palms[1];
    return true;
}

bool FFlowArtsRuntimeMotion::SampleNativeGrip(double Seconds, const FTransform& MeshPresentation,
    FVector& OutLeftNativePalmLocal, FVector& OutRightNativePalmLocal) const
{
    OutLeftNativePalmLocal = OutRightNativePalmLocal = FVector::ZeroVector;
    FVector Source[2], Native[2];
    float Relaxation;
    if (!SampleGrip(Seconds, Relaxation, Source[0], Source[1])) return false;
    for (int32 Side = 0; Side < 2; ++Side)
    {
        const int32 SourceIndex = SourceHandIndices[Side];
        if (!Bones.IsValidIndex(SourceIndex)) return false;
        const FBone& Hand = Bones[SourceIndex];
        if (!NativeRefComponent.IsValidIndex(Hand.NativeIndex)) return false;
        const FTransform NativeBindWorld = NativeRefComponent[Hand.NativeIndex] * MeshPresentation;
        // RetargetWorldPose transfers the bind-to-pose world rotation and scale.
        // Transfer the socket through those same bind bases. It is a vector
        // from the wrist, so differing bind translations must not enter here.
        const FVector SourceLocalCm(Source[Side].Z * 100., -Source[Side].X * 100., Source[Side].Y * 100.);
        Native[Side] = NativeBindWorld.InverseTransformVector(Hand.SourceBind.TransformVector(SourceLocalCm));
        if (Native[Side].ContainsNaN()) return false;
    }
    OutLeftNativePalmLocal = Native[0];
    OutRightNativePalmLocal = Native[1];
    return true;
}

FTransform FFlowArtsRuntimeMotion::RetargetWorldPose(const FTransform& SourceBind,
    const FTransform& SourceFrame, const FTransform& NativeBindWorld)
{
    // Source positions already include performer ancestry. Only orientation
    // and scale need the native reference skeleton as a calibration basis.
    const FQuat WorldDelta = SourceFrame.GetRotation() * SourceBind.GetRotation().Inverse();
    const FVector RelativeScale = SourceFrame.GetScale3D() / SourceBind.GetScale3D();
    return FTransform((WorldDelta * NativeBindWorld.GetRotation()).GetNormalized(),
        SourceFrame.GetLocation(), NativeBindWorld.GetScale3D() * RelativeScale);
}

void FFlowArtsRuntimeMotion::InterpolateLocalHierarchy(TArrayView<const FTransform> A,
    TArrayView<const FTransform> B, TArrayView<const int32> Parents, float Alpha,
    TArrayView<FTransform> OutWorld)
{
    check(A.Num() == B.Num() && A.Num() == Parents.Num() && A.Num() == OutWorld.Num());
    for (int32 Index = 0; Index < A.Num(); ++Index)
    {
        FTransform Local;
        Local.Blend(A[Index], B[Index], Alpha);
        const int32 Parent = Parents[Index];
        check(Parent == INDEX_NONE || (Parent >= 0 && Parent < Index));
        OutWorld[Index] = Parent == INDEX_NONE ? Local : Local * OutWorld[Parent];
    }
}

bool FFlowArtsRuntimeMotion::SamplePose(FPoseContext& Output, double Seconds,
    const FTransform& MeshPresentation) const
{
    if (Frames.IsEmpty()) return false;
    int32 A, B; float Alpha;
    FramePair(Seconds, A, B, Alpha);
    const FBoneContainer& Container = Output.Pose.GetBoneContainer();
    const USkeleton* Skeleton = Container.GetSkeletonAsset();
    if (!Skeleton) return false;
    FCSPose<FCompactPose> Component;
    Component.InitPose(Output.Pose);
    TArray<FTransform, TInlineAllocator<128>> SourceWorld;
    SourceWorld.SetNumUninitialized(Bones.Num());
    InterpolateLocalHierarchy(Frames[A].LocalBones, Frames[B].LocalBones, SourceParents, Alpha,
        MakeArrayView(SourceWorld.GetData(), SourceWorld.Num()));
    const FReferenceSkeleton& Reference = Skeleton->GetReferenceSkeleton();
    const FTransform PresentationInverse = MeshPresentation.Inverse();
    for (int32 NativeIndex = 0; NativeIndex < NativeToSource.Num(); ++NativeIndex)
    {
        const int32 SourceIndex = NativeToSource[NativeIndex];
        if (SourceIndex == INDEX_NONE) continue;
        const int32 SkeletonIndex = Reference.FindBoneIndex(NativeNames[NativeIndex]);
        if (SkeletonIndex == INDEX_NONE) continue;
        const FCompactPoseBoneIndex Compact = Container.GetCompactPoseIndexFromSkeletonIndex(SkeletonIndex);
        if (Compact.GetInt() == INDEX_NONE) continue;
        const FTransform& Bind = Bones[SourceIndex].SourceBind;
        const FTransform NativeBindWorld = NativeRefComponent[NativeIndex] * MeshPresentation;
        // Both source transforms are already in performer space. Rotate the
        // native reference axes by the captured world-space bind-to-pose
        // change, while taking joint positions directly from the performer.
        const FTransform NativeWorld = RetargetWorldPose(Bind, SourceWorld[SourceIndex], NativeBindWorld);
        Component.SetComponentSpaceTransform(Compact, NativeWorld * PresentationInverse);
    }
    FCSPose<FCompactPose>::ConvertComponentPosesToLocalPosesSafe(Component, Output.Pose);
    return true;
}
