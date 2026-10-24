#if WITH_DEV_AUTOMATION_TESTS
#include "FlowArtsRuntimeMotion.h"
#include "FlowFestPropComponent.h"
#include "Components/SceneComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "Misc/AutomationTest.h"
#include "Animation/AnimNodeBase.h"
#include "Animation/Skeleton.h"
#include "BoneContainer.h"
#include "BonePose.h"
#include "Dom/JsonObject.h"
#include "Engine/SkeletalMesh.h"
#include "HAL/FileManager.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/MemStack.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
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
FString MotionTestHash(const FString& Json)
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
    FString Hash;
    for (const uint8 Byte : Digest) Hash += FString::Printf(TEXT("%02x"), Byte);
    return Hash;
#else
    return FString();
#endif
}
}


IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsRuntimeRetargetTest,
    "FlowArts.Runtime.PortableMotionRetarget",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsRuntimeRetargetTest::RunTest(const FString& Parameters)
{
    const FQuat SourceBindRotation(FVector::XAxisVector, HALF_PI);
    const FQuat WorldChange(FVector::YAxisVector, HALF_PI);
    const FQuat NativeBindRotation(FVector::ZAxisVector, HALF_PI);
    const FTransform SourceBind(SourceBindRotation, FVector(1, 2, 3), FVector(2));
    const FTransform SourceFrame(WorldChange * SourceBindRotation,
        FVector(120, -25, 80), FVector(3));
    const FTransform NativeBind(NativeBindRotation, FVector(-50, 30, 20), FVector(4));
    const FTransform Result = FFlowArtsRuntimeMotion::RetargetWorldPose(
        SourceBind, SourceFrame, NativeBind);

    TestTrue(TEXT("Captured performer joint position survives a different native bind"),
        Result.GetLocation().Equals(SourceFrame.GetLocation(), .001f));
    TestTrue(TEXT("World delta rotates native axes in the correct order"),
        Result.GetRotation().Equals(WorldChange * NativeBindRotation, .0001f));
    TestTrue(TEXT("Source animation scale ratio preserves native presentation scale"),
        Result.GetScale3D().Equals(FVector(6), .0001f));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsRuntimeLocalHierarchyTest,
    "FlowArts.Runtime.PortableMotion.LocalHierarchyInterpolation",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsRuntimeLocalHierarchyTest::RunTest(const FString& Parameters)
{
    const FQuat QuarterTurn(FVector::ZAxisVector, HALF_PI);
    const TArray<FTransform> A = {
        FTransform::Identity,
        FTransform(FQuat::Identity, FVector(100, 0, 0))};
    const TArray<FTransform> B = {
        FTransform(QuarterTurn),
        FTransform(FQuat::Identity, FVector(100, 0, 0))};
    const TArray<int32> Parents = {INDEX_NONE, 0};
    TArray<FTransform> World;
    World.SetNumUninitialized(2);
    FFlowArtsRuntimeMotion::InterpolateLocalHierarchy(A, B, Parents, .5f, World);
    const FVector Expected(100.f * UE_SQRT_2 * .5f, 100.f * UE_SQRT_2 * .5f, 0.f);
    TestTrue(TEXT("Interpolated child follows its rotating parent's arc"),
        World[1].GetLocation().Equals(Expected, .01f));
    TestTrue(TEXT("Child midpoint is not a component-space chord"),
        FVector::Dist(World[1].GetLocation(), FVector(50, 50, 0)) > 20.f);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsImportedMotionTest,
    "FlowArts.Runtime.ImportedMotion.ActualRig",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsImportedMotionTest::RunTest(const FString& Parameters)
{
    FString Directory;
    if (!FParse::Value(FCommandLine::Get(), TEXT("FlowFestMotionTestDir="), Directory) ||
        !IFileManager::Get().DirectoryExists(*Directory))
    {
        AddError(TEXT("ImportedMotion requires -FlowFestMotionTestDir=<directory containing exported .motion.json files>"));
        return false;
    }
    TArray<FString> Files;
    IFileManager::Get().FindFilesRecursive(Files, *Directory, TEXT("*.motion.json"), true, false);
    if (Files.IsEmpty())
    {
        AddError(TEXT("ImportedMotion found no exported .motion.json files"));
        return false;
    }
    FString CatalogJson;
    TSharedPtr<FJsonObject> Catalog;
    const TSharedPtr<FJsonObject>* Rigs = nullptr;
    if (!FFileHelper::LoadFileToString(CatalogJson,
            *FPaths::Combine(FPaths::ProjectContentDir(), TEXT("Data/runtime-rigs.json"))) ||
        !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(CatalogJson), Catalog) ||
        !Catalog || !Catalog->TryGetObjectField(TEXT("rigs"), Rigs) || !Rigs)
    {
        AddError(TEXT("Cannot load trusted runtime-rigs.json catalog"));
        return false;
    }
    Files.Sort();
    bool bCheckedNameVariants = false;
    bool bCheckedLegacyEquip = false;
    bool bCheckedCapturePlane = false;
    bool bCheckedFileLimit = false;
    for (const FString& File : Files)
    {
        FString Json, Character, RigHash;
        TSharedPtr<FJsonObject> Root;
        if (!FFileHelper::LoadFileToString(Json, *File) ||
            !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json), Root) || !Root ||
            !Root->TryGetStringField(TEXT("characterId"), Character) ||
            !(*Rigs)->TryGetStringField(Character, RigHash))
        {
            AddError(FString::Printf(TEXT("Missing file identity or trusted catalog entry: %s"), *File));
            continue;
        }
        FString Key = Character.Replace(TEXT("-"), TEXT("_"));
        const FString MeshPath = FString::Printf(TEXT("/Game/FlowFest/Characters/%s/SK_%s.SK_%s"), *Key, *Key, *Key);
        USkeletalMesh* Mesh = LoadObject<USkeletalMesh>(nullptr, *MeshPath);
        if (!TestNotNull(*FString::Printf(TEXT("Actual rig for %s"), *File), Mesh)) continue;

        TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Motion;
        FString Error;
        const bool bLoaded = FFlowArtsRuntimeMotion::LoadFromFile(File, Character, RigHash, Mesh, Motion, Error);
        if (!TestTrue(*FString::Printf(TEXT("Parse exported motion %s: %s"), *File, *Error), bLoaded)) continue;
        if (!TestTrue(TEXT("Successful import supplies immutable motion"), Motion.IsValid())) continue;

        if (!bCheckedFileLimit)
        {
            bCheckedFileLimit = true;
            const FString OversizedPath = FPaths::ProjectSavedDir() / TEXT("FlowArtsOversizedMotionTest.motion.json");
            IFileManager::Get().Delete(*OversizedPath);
            {
                TUniquePtr<FArchive> Writer(IFileManager::Get().CreateFileWriter(*OversizedPath));
                if (TestTrue(TEXT("Create oversized motion fixture"), Writer.IsValid()))
                {
                    // Seek over the body so the test does not allocate a huge JSON string.
                    Writer->Seek(256ll * 1024 * 1024);
                    uint8 Tail = 0;
                    Writer->Serialize(&Tail, 1);
                    Writer->Close();
                }
            }
            if (TestTrue(TEXT("Oversized motion fixture exceeds import cap"),
                    IFileManager::Get().FileSize(*OversizedPath) > 256ll * 1024 * 1024))
            {
                TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Rejected = Motion;
                FString LimitError;
                TestFalse(TEXT("Oversized motion is rejected before JSON loading"),
                    FFlowArtsRuntimeMotion::LoadFromFile(OversizedPath, Character, RigHash, Mesh, Rejected, LimitError));
                TestFalse(TEXT("Oversized import clears output"), Rejected.IsValid());
                TestTrue(TEXT("Oversized import reports the file limit"), LimitError.Contains(TEXT("too large")));
            }
            IFileManager::Get().Delete(*OversizedPath);
        }

        if (!bCheckedCapturePlane)
        {
            bCheckedCapturePlane = true;
            TestEqual(TEXT("Legacy motion defaults to wall"), Motion->GetCapturePlane(), FString(TEXT("wall")));
            TSharedPtr<FJsonObject> PlaneRoot;
            if (TestTrue(TEXT("Parse source for capture-plane cases"),
                    FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json), PlaneRoot) && PlaneRoot.IsValid()))
            {
                const FString PropId = PlaneRoot->GetStringField(TEXT("propId"));
                const FString SequenceHash = PlaneRoot->GetStringField(TEXT("sequenceSHA256"));
                const bool bLoop = PlaneRoot->GetBoolField(TEXT("loop"));
                for (const FString& Plane : {FString(TEXT("wheel")), FString(TEXT("floor"))})
                {
                    PlaneRoot->SetStringField(TEXT("capturePlane"), Plane);
                    const FString Identity = FString::Printf(
                        TEXT("{\"capturePlane\":\"%s\",\"characterId\":\"%s\",\"loop\":%s,\"propId\":\"%s\",\"rigSHA256\":\"%s\",\"sequenceSHA256\":\"%s\"}"),
                        *Plane, *Character, bLoop ? TEXT("true") : TEXT("false"), *PropId, *RigHash, *SequenceHash);
                    PlaneRoot->SetStringField(TEXT("bundleIdentitySHA256"), MotionTestHash(Identity));
                    FString PlaneJson;
                    FJsonSerializer::Serialize(PlaneRoot.ToSharedRef(), TJsonWriterFactory<>::Create(&PlaneJson));
                    TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> PlaneMotion;
                    TestTrue(*FString::Printf(TEXT("%s identity imports: %s"), *Plane, *Error),
                        FFlowArtsRuntimeMotion::Parse(PlaneJson, Character, RigHash, Mesh, PlaneMotion, Error));
                    if (PlaneMotion.IsValid()) TestEqual(TEXT("Imported capture plane"), PlaneMotion->GetCapturePlane(), Plane);
                }
                PlaneRoot->SetStringField(TEXT("capturePlane"), TEXT("wheel"));
                PlaneRoot->SetStringField(TEXT("bundleIdentitySHA256"), Root->GetStringField(TEXT("bundleIdentitySHA256")));
                FString Mismatch;
                FJsonSerializer::Serialize(PlaneRoot.ToSharedRef(), TJsonWriterFactory<>::Create(&Mismatch));
                TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> RejectedPlane;
                TestFalse(TEXT("Plane identity mismatch rejected"), FFlowArtsRuntimeMotion::Parse(
                    Mismatch, Character, RigHash, Mesh, RejectedPlane, Error));
                PlaneRoot->SetStringField(TEXT("capturePlane"), TEXT("unknown"));
                FString Unknown;
                FJsonSerializer::Serialize(PlaneRoot.ToSharedRef(), TJsonWriterFactory<>::Create(&Unknown));
                TestFalse(TEXT("Unknown capture plane rejected"), FFlowArtsRuntimeMotion::Parse(
                    Unknown, Character, RigHash, Mesh, RejectedPlane, Error));
                PlaneRoot->SetStringField(TEXT("capturePlane"), TEXT("wall"));
                FString ExplicitWall;
                FJsonSerializer::Serialize(PlaneRoot.ToSharedRef(), TJsonWriterFactory<>::Create(&ExplicitWall));
                TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> WallMotion;
                TestTrue(TEXT("Explicit wall retains legacy identity"), FFlowArtsRuntimeMotion::Parse(
                    ExplicitWall, Character, RigHash, Mesh, WallMotion, Error));
            }
        }

        const FReferenceSkeleton& Native = Mesh->GetRefSkeleton();
        const FBoxSphereBounds Bounds = Mesh->GetBounds();
        const float Height = Bounds.BoxExtent.Z * 2.f;
        if (!TestTrue(TEXT("Actual rig has usable normalization bounds"), Height > 1.f)) continue;
        const float Scale = 190.5f / Height;
        const float Lift = Native.GetBoneName(0) == TEXT("Hips") ? 0.f :
            -(Bounds.Origin.Z - Bounds.BoxExtent.Z) * Scale;
        // Match the avatar's standing presentation, including RootNode1 floor correction.
        const FTransform Presentation(FQuat(FVector::UpVector, -HALF_PI),
            FVector(0, 0, Lift), FVector(Scale));
        TArray<FBoneIndexType> Required;
        for (int32 Index = 0; Index < Native.GetNum(); ++Index) Required.Add(Index);
        const FMemMark Mark(FMemStack::Get());
        FBoneContainer Bones(Required, UE::Anim::FCurveFilterSettings(), *Mesh);
        const FReferenceSkeleton& Skeleton = Mesh->GetSkeleton()->GetReferenceSkeleton();
        const TArray<TSharedPtr<FJsonValue>>& SourceBones = Root->GetObjectField(TEXT("skeleton"))->GetArrayField(TEXT("bones"));
        const TArray<TSharedPtr<FJsonValue>>& Frames = Root->GetArrayField(TEXT("frames"));
        TMap<FName, int32> SourceByName;
        for (int32 Index = 0; Index < SourceBones.Num(); ++Index)
        {
            const FString SourceName = SourceBones[Index]->AsObject()->GetStringField(TEXT("name"));
            // Use native names as the test oracle, independently of the importer's
            // namespace parser. An accepted capture must supply these exact suffixes.
            for (int32 NativeIndex = 0; NativeIndex < Native.GetNum(); ++NativeIndex)
            {
                const FName Name = Native.GetBoneName(NativeIndex);
                if (SourceName.EndsWith(Name.ToString(), ESearchCase::CaseSensitive))
                    SourceByName.Add(Name, Index);
            }
        }
        int32 CheckedBones = 0;
        for (const int32 FrameIndex : {0, Frames.Num() / 2, Frames.Num() - 1})
        {
            FPoseContext Pose(Bones);
            Pose.ResetToRefPose();
            TestTrue(TEXT("Sample actual rig pose"), Motion->SamplePose(Pose,
                static_cast<double>(FrameIndex) / Motion->GetSampleRate(), Presentation));
            if (Motion->HasDynamicGrip())
            {
                const double GripTime = static_cast<double>(FrameIndex) / Motion->GetSampleRate();
                const auto& FrameObject = Frames[FrameIndex]->AsObject();
                const auto& LocalValues = FrameObject->GetArrayField(TEXT("palmLocal"));
                float Relaxation;
                FVector Local[2], Oracle[2], NativeLocal[2];
                TestTrue(TEXT("Dynamic grip samples with the pose clock"), Motion->SampleGrip(GripTime, Relaxation, Local[0], Local[1]));
                TestTrue(TEXT("Authored grip retargets into native hand space"),
                    Motion->SampleNativeGrip(GripTime, Presentation, NativeLocal[0], NativeLocal[1]));
                FCSPose<FCompactPose> GripComponent;
                GripComponent.InitPose(Pose.Pose);
                TestTrue(TEXT("Captured relaxation is preserved"), FMath::IsNearlyEqual(Relaxation,
                    static_cast<float>(FrameObject->GetNumberField(TEXT("gripRelaxation"))), 1e-6f));
                TestTrue(TEXT("Independent source palms sample"), Motion->SampleSourcePalms(GripTime, Oracle[0], Oracle[1]));
                for (int32 Side = 0; Side < 2; ++Side)
                {
                    const FVector ExpectedLocal(LocalValues[Side * 3]->AsNumber(), LocalValues[Side * 3 + 1]->AsNumber(),
                        LocalValues[Side * 3 + 2]->AsNumber());
                    TestTrue(TEXT("Source-local socket is not changed by import"), Local[Side].Equals(ExpectedLocal, 1e-6));
                    const int32* HandIndex = SourceByName.Find(Side == 0 ? FName(TEXT("LeftHand")) : FName(TEXT("RightHand")));
                    if (!TestNotNull(TEXT("Source oracle has captured hand"), HandIndex)) continue;
                    const auto& Hand = FrameObject->GetArrayField(TEXT("bones"))[*HandIndex]->AsArray();
                    const FQuat SourceRotation(Hand[3]->AsNumber(), Hand[4]->AsNumber(), Hand[5]->AsNumber(), Hand[6]->AsNumber());
                    const FVector SourceScale(Hand[7]->AsNumber(), Hand[8]->AsNumber(), Hand[9]->AsNumber());
                    const FVector SourcePosition(Hand[0]->AsNumber(), Hand[1]->AsNumber(), Hand[2]->AsNumber());
                    const FVector SourcePalm = SourceRotation.GetNormalized().RotateVector(SourceScale * ExpectedLocal) + SourcePosition;
                    const FVector ExpectedWorld(SourcePalm.Z * 100.0, -SourcePalm.X * 100.0, SourcePalm.Y * 100.0);
                    TestTrue(TEXT("Palm oracle comes from source hand and finger socket, independently of prop"),
                        Oracle[Side].Equals(ExpectedWorld, .002));
                    const int32 NativeHand = Skeleton.FindBoneIndex(Side == 0 ? FName(TEXT("LeftHand")) : FName(TEXT("RightHand")));
                    if (!TestTrue(TEXT("Retargeted socket has a native hand"), NativeHand != INDEX_NONE)) continue;
                    const FCompactPoseBoneIndex CompactHand = Bones.GetCompactPoseIndexFromSkeletonIndex(NativeHand);
                    if (!TestTrue(TEXT("Retargeted socket has an evaluated hand"), CompactHand.GetInt() != INDEX_NONE)) continue;
                    const FVector NativeWorldPalm = Presentation.TransformPosition(
                        GripComponent.GetComponentSpaceTransform(CompactHand).TransformPosition(NativeLocal[Side]));
                    TestTrue(*FString::Printf(TEXT("%s frame %d side %d preserves strict socket despite refined finger curls (%.6f cm)"),
                        *FPaths::GetCleanFilename(File), FrameIndex, Side, FVector::Dist(ExpectedWorld, NativeWorldPalm)),
                        NativeWorldPalm.Equals(ExpectedWorld, .002));
                }
            }
            FCSPose<FCompactPose> Component;
            Component.InitPose(Pose.Pose);
            const auto& Captured = Frames[FrameIndex]->AsObject()->GetArrayField(TEXT("bones"));
            int32 Fingers = 0, Wrists = 0;
            for (int32 Index = 0; Index < Native.GetNum(); ++Index)
            {
                const FName Name = Native.GetBoneName(Index);
                const FString Text = Name.ToString();
                const bool bWrist = Text == TEXT("LeftHand") || Text == TEXT("RightHand");
                const bool bFinger = Text.StartsWith(TEXT("LeftHand")) || Text.StartsWith(TEXT("RightHand"));
                if (!bWrist && !bFinger) continue;
                const int32* Source = SourceByName.Find(Name);
                if (!TestNotNull(*FString::Printf(TEXT("Captured %s"), *Text), Source)) continue;
                const int32 SkeletonIndex = Skeleton.FindBoneIndex(Name);
                if (!TestTrue(TEXT("Hand bone exists in native skeleton"), SkeletonIndex != INDEX_NONE)) continue;
                const FCompactPoseBoneIndex Compact = Bones.GetCompactPoseIndexFromSkeletonIndex(SkeletonIndex);
                if (!TestTrue(TEXT("Hand bone exists in compact pose"), Compact.GetInt() != INDEX_NONE)) continue;
                const auto& V = Captured[*Source]->AsArray();
                const FVector Expected(V[2]->AsNumber() * 100., -V[0]->AsNumber() * 100., V[1]->AsNumber() * 100.);
                const FVector Actual = Presentation.TransformPosition(Component.GetComponentSpaceTransform(Compact).GetLocation());
                TestTrue(*FString::Printf(TEXT("%s frame %d %s performer position (error %.6f cm)"),
                    *FPaths::GetCleanFilename(File), FrameIndex, *Text, FVector::Dist(Expected, Actual)),
                    Actual.Equals(Expected, .02f));
                if (bWrist) ++Wrists; else ++Fingers;
                ++CheckedBones;
            }
            TestEqual(TEXT("Both captured wrists checked"), Wrists, 2);
            TestTrue(TEXT("Captured finger descendants checked"), Fingers >= 6);
        }
        TestTrue(TEXT("Start, middle, and final hand poses checked"), CheckedBones >= 24);

        if (Motion->HasDynamicGrip())
        {
            // Off-key sampling and a different presentation must preserve the
            // captured socket too, including the clamped nonloop endpoint.
            for (const double Seconds : {.37 / Motion->GetSampleRate(), Motion->GetDurationSeconds() + .1})
            {
                const FTransform AlternatePresentation(FQuat(FVector::UpVector, .43),
                    FVector(7., -11., 19.), FVector(Scale * 1.3));
                FPoseContext Pose(Bones);
                Pose.ResetToRefPose();
                FVector NativeLocal[2], SourceWorld[2];
                TestTrue(TEXT("Sample alternate presentation"), Motion->SamplePose(Pose, Seconds, AlternatePresentation));
                TestTrue(TEXT("Sample interpolated authored socket"),
                    Motion->SampleNativeGrip(Seconds, AlternatePresentation, NativeLocal[0], NativeLocal[1]));
                TestTrue(TEXT("Sample interpolated source palm"), Motion->SampleSourcePalms(Seconds, SourceWorld[0], SourceWorld[1]));
                FCSPose<FCompactPose> Component;
                Component.InitPose(Pose.Pose);
                for (int32 Side = 0; Side < 2; ++Side)
                {
                    const int32 HandIndex = Skeleton.FindBoneIndex(Side == 0 ? FName(TEXT("LeftHand")) : FName(TEXT("RightHand")));
                    if (!TestTrue(TEXT("Interpolated socket has native hand"), HandIndex != INDEX_NONE)) continue;
                    const FCompactPoseBoneIndex Compact = Bones.GetCompactPoseIndexFromSkeletonIndex(HandIndex);
                    if (!TestTrue(TEXT("Interpolated socket has evaluated hand"), Compact.GetInt() != INDEX_NONE)) continue;
                    const FVector Actual = AlternatePresentation.TransformPosition(
                        Component.GetComponentSpaceTransform(Compact).TransformPosition(NativeLocal[Side]));
                    TestTrue(TEXT("Native socket follows source interpolation independently of presentation"),
                        Actual.Equals(SourceWorld[Side], .002));
                }
            }
        }

        if (!bCheckedNameVariants)
        {
            bCheckedNameVariants = true;
            // Exercise importer compatibility and the new measured-contact gate
            // against a real skeleton. Native rendered contact is checked separately.
            const auto CheckContactMetadata = [this, &Json, &Character, &RigHash, Mesh](
                const TCHAR* Label, const TFunction<void(TSharedPtr<FJsonObject>&)>& Change, bool bExpected)
            {
                TSharedPtr<FJsonObject> Candidate;
                if (!TestTrue(TEXT("Clone capture for contact metadata"),
                    FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json), Candidate))) return;
                Candidate->SetStringField(TEXT("captureRevision"), TEXT("monotonic-grip-validated-v4"));
                for (const auto& Frame : Candidate->GetArrayField(TEXT("frames")))
                    Frame->AsObject()->RemoveField(TEXT("propVisibility"));
                const auto Grip = MakeShared<FJsonObject>();
                Grip->SetStringField(TEXT("measurement"), TEXT("same-frame-calibrated-palm-to-rendered-grip"));
                Grip->SetStringField(TEXT("contactMode"), TEXT("prop-authoritative"));
                Grip->SetStringField(TEXT("reachPolicy"), TEXT("paired-body-final-socket-v1"));
                Grip->SetNumberField(TEXT("maxErrorCm"), 0.2);
                Grip->SetNumberField(TEXT("limitCm"), 0.2);
                Grip->SetNumberField(TEXT("sideSamples"), Candidate->GetNumberField(TEXT("frameCount")) * 2.0);
                Candidate->SetObjectField(TEXT("gripValidation"), Grip);
                Change(Candidate);
                FString CandidateJson, ContactError;
                FJsonSerializer::Serialize(Candidate.ToSharedRef(), TJsonWriterFactory<>::Create(&CandidateJson));
                TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> CandidateMotion;
                const bool bAccepted = FFlowArtsRuntimeMotion::Parse(CandidateJson, Character, RigHash, Mesh, CandidateMotion, ContactError);
                TestEqual(Label, bAccepted, bExpected);
                if (bAccepted && Candidate->GetStringField(TEXT("captureRevision")) != TEXT("monotonic-dynamic-grip-v5"))
                {
                    float Relaxation = 1.f;
                    FVector Left(1), Right(1);
                    TestFalse(TEXT("Older captures do not invent dynamic grip data"), CandidateMotion->HasDynamicGrip());
                    TestFalse(TEXT("Older captures require native fallback"), CandidateMotion->SampleGrip(0.0, Relaxation, Left, Right));
                    TestTrue(TEXT("Unavailable dynamic grip clears outputs"), Relaxation == 0.f && Left.IsZero() && Right.IsZero());
                }
            };
            CheckContactMetadata(TEXT("Measured v4 accepts the 2mm boundary"), [](auto&) {}, true);
            CheckContactMetadata(TEXT("Contact count covers only visible props"), [](auto& Candidate)
            {
                for (const auto& Frame : Candidate->GetArrayField(TEXT("frames")))
                    Frame->AsObject()->SetArrayField(TEXT("propVisibility"),
                        {MakeShared<FJsonValueBoolean>(false), MakeShared<FJsonValueBoolean>(true)});
                Candidate->GetObjectField(TEXT("gripValidation"))->SetNumberField(TEXT("sideSamples"),
                    Candidate->GetNumberField(TEXT("frameCount")));
            }, true);
            CheckContactMetadata(TEXT("Missing visible contact samples still reject"), [](auto& Candidate)
            {
                Candidate->GetObjectField(TEXT("gripValidation"))->SetNumberField(TEXT("sideSamples"), 0.0);
            }, false);
            CheckContactMetadata(TEXT("No props require no fictitious grip samples"), [](auto& Candidate)
            {
                for (const auto& Frame : Candidate->GetArrayField(TEXT("frames")))
                    Frame->AsObject()->SetArrayField(TEXT("propVisibility"),
                        {MakeShared<FJsonValueBoolean>(false), MakeShared<FJsonValueBoolean>(false)});
                Candidate->GetObjectField(TEXT("gripValidation"))->SetNumberField(TEXT("sideSamples"), 0.0);
                Candidate->GetObjectField(TEXT("gripValidation"))->SetNumberField(TEXT("maxErrorCm"), 0.0);
            }, true);
            CheckContactMetadata(TEXT("Visibility rejects numeric coercion"), [](auto& Candidate)
            {
                Candidate->GetArrayField(TEXT("frames")).Last()->AsObject()->SetArrayField(TEXT("propVisibility"),
                    {MakeShared<FJsonValueNumber>(0), MakeShared<FJsonValueBoolean>(true)});
            }, false);
            CheckContactMetadata(TEXT("Visibility requires exactly two hands"), [](auto& Candidate)
            {
                Candidate->GetArrayField(TEXT("frames"))[0]->AsObject()->SetArrayField(TEXT("propVisibility"),
                    {MakeShared<FJsonValueBoolean>(false)});
            }, false);
            CheckContactMetadata(TEXT("Legacy v3 needs no contact metadata"), [](auto& Candidate)
            {
                Candidate->SetStringField(TEXT("captureRevision"), TEXT("clock-isolated-body-v3"));
                Candidate->RemoveField(TEXT("gripValidation"));
            }, true);
            CheckContactMetadata(TEXT("Unknown capture revision rejected"), [](auto& Candidate)
            { Candidate->SetStringField(TEXT("captureRevision"), TEXT("unknown-v5")); }, false);
            CheckContactMetadata(TEXT("V4 requires actual contact metadata"), [](auto& Candidate)
            { Candidate->RemoveField(TEXT("gripValidation")); }, false);
            CheckContactMetadata(TEXT("Contact gap above 2mm rejected"), [](auto& Candidate)
            { Candidate->GetObjectField(TEXT("gripValidation"))->SetNumberField(TEXT("maxErrorCm"), 0.20001); }, false);
            CheckContactMetadata(TEXT("Negative contact error rejected"), [](auto& Candidate)
            { Candidate->GetObjectField(TEXT("gripValidation"))->SetNumberField(TEXT("maxErrorCm"), -0.001); }, false);
            CheckContactMetadata(TEXT("Relaxed contact limit rejected"), [](auto& Candidate)
            { Candidate->GetObjectField(TEXT("gripValidation"))->SetNumberField(TEXT("limitCm"), 1.0); }, false);
            CheckContactMetadata(TEXT("Incomplete contact sample count rejected"), [](auto& Candidate)
            { Candidate->GetObjectField(TEXT("gripValidation"))->SetNumberField(TEXT("sideSamples"), 1.0); }, false);
            CheckContactMetadata(TEXT("Wrist-only contact measurement rejected"), [](auto& Candidate)
            { Candidate->GetObjectField(TEXT("gripValidation"))->SetStringField(TEXT("measurement"), TEXT("wrist-to-root")); }, false);
            CheckContactMetadata(TEXT("Unknown contact policy rejected"), [](auto& Candidate)
            { Candidate->GetObjectField(TEXT("gripValidation"))->SetStringField(TEXT("contactMode"), TEXT("legacy")); }, false);
            CheckContactMetadata(TEXT("Unknown reach policy rejected"), [](auto& Candidate)
            { Candidate->GetObjectField(TEXT("gripValidation"))->SetStringField(TEXT("reachPolicy"), TEXT("legacy")); }, false);
            const auto AddDynamicGrip = [](TSharedPtr<FJsonObject>& Candidate)
            {
                Candidate->SetStringField(TEXT("captureRevision"), TEXT("monotonic-dynamic-grip-v5"));
                for (const auto& Value : Candidate->GetArrayField(TEXT("frames")))
                {
                    const auto& Row = Value->AsObject();
                    Row->SetNumberField(TEXT("gripRelaxation"), .25);
                    TArray<TSharedPtr<FJsonValue>> Palm;
                    for (double Number : {.02, .03, .04, -.02, .03, .04}) Palm.Add(MakeShared<FJsonValueNumber>(Number));
                    Row->SetArrayField(TEXT("palmLocal"), Palm);
                }
            };
            CheckContactMetadata(TEXT("V5 accepts complete dynamic grip channels"), AddDynamicGrip, true);
            CheckContactMetadata(TEXT("V5 rejects missing relaxation on any frame"), [&AddDynamicGrip](auto& Candidate)
            {
                AddDynamicGrip(Candidate);
                Candidate->GetArrayField(TEXT("frames")).Last()->AsObject()->RemoveField(TEXT("gripRelaxation"));
            }, false);
            for (const double InvalidRelaxation : {-.001, 1.001})
                CheckContactMetadata(TEXT("V5 rejects unbounded relaxation"), [&AddDynamicGrip, InvalidRelaxation](auto& Candidate)
                {
                    AddDynamicGrip(Candidate);
                    Candidate->GetArrayField(TEXT("frames"))[0]->AsObject()->SetNumberField(TEXT("gripRelaxation"), InvalidRelaxation);
                }, false);
            CheckContactMetadata(TEXT("V5 requires both local sockets"), [&AddDynamicGrip](auto& Candidate)
            {
                AddDynamicGrip(Candidate);
                Candidate->GetArrayField(TEXT("frames"))[0]->AsObject()->RemoveField(TEXT("palmLocal"));
            }, false);
            CheckContactMetadata(TEXT("V5 rejects incomplete socket coordinates"), [&AddDynamicGrip](auto& Candidate)
            {
                AddDynamicGrip(Candidate);
                const auto& Row = Candidate->GetArrayField(TEXT("frames"))[0]->AsObject();
                auto Palm = Row->GetArrayField(TEXT("palmLocal"));
                Palm.Pop();
                Row->SetArrayField(TEXT("palmLocal"), Palm);
            }, false);
            CheckContactMetadata(TEXT("V5 rejects socket outside bounded hand space"), [&AddDynamicGrip](auto& Candidate)
            {
                AddDynamicGrip(Candidate);
                const auto& Row = Candidate->GetArrayField(TEXT("frames"))[0]->AsObject();
                auto Palm = Row->GetArrayField(TEXT("palmLocal"));
                Palm[3] = MakeShared<FJsonValueNumber>(.6);
                Row->SetArrayField(TEXT("palmLocal"), Palm);
            }, false);
            // Reuse the real imported rig with a simple numeric prop oracle, then
            // exercise both timing modes independently of browser capture math.
            for (const double Duration : {.25, 1.01, .001})
            for (const bool bLoop : {true, false})
            {
                TSharedPtr<FJsonObject> Timed;
                if (!TestTrue(TEXT("Clone capture for fractional clock"),
                    FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json), Timed))) continue;
                const int32 Intervals = FMath::CeilToInt(Duration * 30.0);
                const int32 Count = Intervals + (bLoop ? 0 : 1);
                TArray<TSharedPtr<FJsonValue>> TimedFrames;
                int32 VisibleSamples = 0;
                for (int32 Index = 0; Index < Count; ++Index)
                {
                    const auto Row = MakeShared<FJsonObject>();
                    Row->SetArrayField(TEXT("bones"), Frames[0]->AsObject()->GetArrayField(TEXT("bones")));
                    TArray<TSharedPtr<FJsonValue>> Prop = Frames[0]->AsObject()->GetArrayField(TEXT("prop"));
                    Prop[0] = MakeShared<FJsonValueNumber>(static_cast<double>(Index));
                    Row->SetArrayField(TEXT("prop"), Prop);
                    Row->SetArrayField(TEXT("propVisibility"),
                        {MakeShared<FJsonValueBoolean>(Index % 2 == 0), MakeShared<FJsonValueBoolean>(Index % 3 == 0)});
                    VisibleSamples += (Index % 2 == 0 ? 1 : 0) + (Index % 3 == 0 ? 1 : 0);
                    if (Motion->HasDynamicGrip())
                    {
                        const double Fraction = static_cast<double>(Index) / FMath::Max(1, Count - 1);
                        Row->SetNumberField(TEXT("gripRelaxation"), Fraction);
                        TArray<TSharedPtr<FJsonValue>> Palm;
                        for (double Number : {.1 * Fraction, .02, .03, -.1 * Fraction, .02, .03}) Palm.Add(MakeShared<FJsonValueNumber>(Number));
                        Row->SetArrayField(TEXT("palmLocal"), Palm);
                    }
                    TimedFrames.Add(MakeShared<FJsonValueObject>(Row));
                }
                Timed->SetArrayField(TEXT("frames"), TimedFrames);
                Timed->SetNumberField(TEXT("frameCount"), Count);
                if (Timed->HasTypedField<EJson::Object>(TEXT("gripValidation")))
                    Timed->GetObjectField(TEXT("gripValidation"))->SetNumberField(TEXT("sideSamples"), VisibleSamples);
                Timed->SetNumberField(TEXT("durationSeconds"), Duration);
                Timed->SetBoolField(TEXT("loop"), bLoop);
                const FString Identity = FString::Printf(
                    TEXT("{\"characterId\":\"%s\",\"loop\":%s,\"propId\":\"%s\",\"rigSHA256\":\"%s\",\"sequenceSHA256\":\"%s\"}"),
                    *Character, bLoop ? TEXT("true") : TEXT("false"),
                    *Timed->GetStringField(TEXT("propId")), *RigHash, *Timed->GetStringField(TEXT("sequenceSHA256")));
                Timed->SetStringField(TEXT("bundleIdentitySHA256"), MotionTestHash(Identity));
                FString TimedJson;
                FJsonSerializer::Serialize(Timed.ToSharedRef(), TJsonWriterFactory<>::Create(&TimedJson));
                TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> TimedMotion;
                if (!TestTrue(*FString::Printf(TEXT("Fractional %.3fs loop=%d imports: %s"), Duration, bLoop, *Error),
                    FFlowArtsRuntimeMotion::Parse(TimedJson, Character, RigHash, Mesh, TimedMotion, Error))) continue;
                Timed->SetNumberField(TEXT("durationSeconds"), Duration - .00001);
                FString RetimedJson;
                FJsonSerializer::Serialize(Timed.ToSharedRef(), TJsonWriterFactory<>::Create(&RetimedJson));
                TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Retimed;
                TestTrue(TEXT("Same frames with a distinct valid clock import"), FFlowArtsRuntimeMotion::Parse(RetimedJson, Character, RigHash, Mesh, Retimed, Error));
                if (Retimed.IsValid()) TestTrue(TEXT("Distinct clocks do not alias playback profiles"), Retimed->GetProfile() != TimedMotion->GetProfile());
                TestTrue(TEXT("Effective rate preserves exact duration"),
                    FMath::IsNearlyEqual(TimedMotion->GetSampleRate(), Intervals / Duration, 1e-10));
                const auto CheckSample = [this, &TimedMotion](double Seconds, double Expected)
                {
                    TArray<float> Values;
                    if (TestTrue(TEXT("Sample fractional prop clock"), TimedMotion->SamplePropFrame(Seconds, Values)))
                        TestTrue(TEXT("Fractional interpolant or endpoint is exact"), FMath::IsNearlyEqual(Values[0], static_cast<float>(Expected), 1e-5f));
                    if (TimedMotion->HasDynamicGrip())
                    {
                        float Relaxation;
                        FVector Left, Right;
                        TestTrue(TEXT("Grip shares fractional prop clock"), TimedMotion->SampleGrip(Seconds, Relaxation, Left, Right));
                        const double ExpectedFraction = Expected / FMath::Max(1, TimedMotion->GetFrameCount() - 1);
                        TestTrue(TEXT("Grip relaxation interpolates across loop and terminal"), FMath::IsNearlyEqual(Relaxation, static_cast<float>(ExpectedFraction), 1e-5f));
                        TestTrue(TEXT("Both source sockets share the interpolated phase"),
                            Left.Equals(FVector(.1 * ExpectedFraction, .02, .03), 1e-5) &&
                            Right.Equals(FVector(-.1 * ExpectedFraction, .02, .03), 1e-5));
                    }
                };
                CheckSample(0.0, 0.0);
                CheckSample(Duration / Intervals * .5, Intervals == 1 && bLoop ? 0.0 : .5);
                CheckSample(Duration, bLoop ? 0.0 : Intervals);
                CheckSample(Duration * 2, bLoop ? 0.0 : Intervals);
                if (bLoop)
                {
                    CheckSample(Duration - Duration / Intervals * .5, (Intervals - 1) * .5);
                    CheckSample(-Duration / Intervals * .5, (Intervals - 1) * .5);
                }
                else CheckSample(Duration - Duration / Intervals * .25, Intervals - .25);
                const auto CheckVisibility = [this, &TimedMotion](double Seconds, int32 Frame)
                {
                    bool Visible[2] = {false, false};
                    TestTrue(TEXT("Visibility samples on fractional clock"), TimedMotion->SamplePropVisibility(Seconds, Visible));
                    TestTrue(TEXT("Visibility holds frame instead of crossfading"),
                        Visible[0] == (Frame % 2 == 0) && Visible[1] == (Frame % 3 == 0));
                };
                CheckVisibility(0.0, 0);
                CheckVisibility(Duration / Intervals * .5, 0);
                if (Count > 1) CheckVisibility(Duration / Intervals, 1);
                CheckVisibility(Duration, bLoop ? 0 : Intervals);
                CheckVisibility(Duration * 2, bLoop ? 0 : Intervals);
                CheckVisibility(Duration - Duration / Intervals * .25, Intervals - 1);
                if (bLoop) CheckVisibility(-Duration / Intervals * .25, Intervals - 1);
            }

            // Rename the same actual capture, including parent references. All
            // supported namespace spellings must produce identical sampled poses.
            TMap<FString, FString> CanonicalNames;
            for (const auto& Pair : SourceByName)
                CanonicalNames.Add(SourceBones[Pair.Value]->AsObject()->GetStringField(TEXT("name")), Pair.Key.ToString());
            const double Seconds = static_cast<double>(Frames.Num() / 2) / Motion->GetSampleRate();
            FPoseContext ExpectedPose(Bones);
            ExpectedPose.ResetToRefPose();
            TestTrue(TEXT("Reference sample for namespace variants"), Motion->SamplePose(ExpectedPose, Seconds, Presentation));
            for (const FString Prefix : {FString(), FString(TEXT("mixamorig:")), FString(TEXT("mixamorig")),
                FString(TEXT("mixamorig12:")), FString(TEXT("mixamorig12")), FString(TEXT("mixamorigCustom:"))})
            {
                TSharedPtr<FJsonObject> Renamed;
                if (!TestTrue(TEXT("Clone capture for namespace regression"),
                    FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json), Renamed) && Renamed.IsValid())) continue;
                for (const auto& Value : Renamed->GetObjectField(TEXT("skeleton"))->GetArrayField(TEXT("bones")))
                {
                    const auto& Row = Value->AsObject();
                    const FString Name = Row->GetStringField(TEXT("name"));
                    if (const FString* Canonical = CanonicalNames.Find(Name)) Row->SetStringField(TEXT("name"), Prefix + *Canonical);
                    FString Parent;
                    if (Row->TryGetStringField(TEXT("parent"), Parent))
                        if (const FString* Canonical = CanonicalNames.Find(Parent)) Row->SetStringField(TEXT("parent"), Prefix + *Canonical);
                }
                FString RenamedJson;
                FJsonSerializer::Serialize(Renamed.ToSharedRef(), TJsonWriterFactory<>::Create(&RenamedJson));
                TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> RenamedMotion;
                const bool bAccepted = FFlowArtsRuntimeMotion::Parse(RenamedJson, Character, RigHash, Mesh, RenamedMotion, Error);
                if (Prefix == TEXT("mixamorigCustom:"))
                {
                    TestFalse(TEXT("Arbitrary word after Mixamo prefix cannot alias native bones"), bAccepted);
                    continue;
                }
                if (!TestTrue(*FString::Printf(TEXT("Namespace '%s' imports: %s"), *Prefix, *Error), bAccepted)) continue;
                FPoseContext ActualPose(Bones);
                ActualPose.ResetToRefPose();
                TestTrue(TEXT("Sample renamed capture"), RenamedMotion->SamplePose(ActualPose, Seconds, Presentation));
                for (FCompactPoseBoneIndex Bone : ExpectedPose.Pose.ForEachBoneIndex())
                    TestTrue(*FString::Printf(TEXT("Namespace '%s' preserves bone %d pose"), *Prefix, Bone.GetInt()),
                        ActualPose.Pose[Bone].Equals(ExpectedPose.Pose[Bone], .0001f));
            }
        }

        // Geometry length is independent of the skeletal/sequence identity.
        const bool bHadLength = Root->HasField(TEXT("effectivePropLengthCm"));
        const double OriginalLength = bHadLength ? Root->GetNumberField(TEXT("effectivePropLengthCm")) : 0.0;
        TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> SizedMotion;
        for (const double Length : {87.770825, 0.0, -1.0, 1001.0})
        {
            Root->SetNumberField(TEXT("effectivePropLengthCm"), Length);
            FString WithLength;
            FJsonSerializer::Serialize(Root.ToSharedRef(), TJsonWriterFactory<>::Create(&WithLength));
            TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Sized;
            const bool bAccepted = FFlowArtsRuntimeMotion::Parse(WithLength, Character, RigHash, Mesh, Sized, Error);
            TestEqual(TEXT("Only positive bounded renderer lengths import"), bAccepted, Length > 0.0 && Length <= 1000.0);
            if (bAccepted)
            {
                TestTrue(TEXT("Renderer length survives import"), FMath::IsNearlyEqual(Sized->GetEffectivePropLengthCm(), static_cast<float>(Length)));
                SizedMotion = Sized;
            }
        }
        Root->RemoveField(TEXT("effectivePropLengthCm"));
        FString LegacyJson;
        FJsonSerializer::Serialize(Root.ToSharedRef(), TJsonWriterFactory<>::Create(&LegacyJson));
        TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Legacy;
        if (TestTrue(TEXT("Legacy export without length still imports"), FFlowArtsRuntimeMotion::Parse(LegacyJson, Character, RigHash, Mesh, Legacy, Error)))
        {
            TestEqual(TEXT("Legacy export retains catalog length fallback"), Legacy->GetEffectivePropLengthCm(), 0.0f);
            TestTrue(TEXT("Different geometry cannot resume the same runtime profile"), SizedMotion.IsValid() && SizedMotion->GetProfile() != Legacy->GetProfile());
            TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Repeat;
            TestTrue(TEXT("Same validated payload imports repeatedly"), FFlowArtsRuntimeMotion::Parse(LegacyJson, Character, RigHash, Mesh, Repeat, Error));
            if (Repeat.IsValid()) TestEqual(TEXT("Identical payload retains playback identity"), Repeat->GetProfile(), Legacy->GetProfile());

            const TSharedPtr<FJsonObject> FirstFrame = Frames[0]->AsObject();
            TArray<TSharedPtr<FJsonValue>> Prop = FirstFrame->GetArrayField(TEXT("prop"));
            const TSharedPtr<FJsonValue> OriginalPosition = Prop[0];
            Prop[0] = MakeShared<FJsonValueNumber>(Prop[0]->AsNumber() + .001);
            FirstFrame->SetArrayField(TEXT("prop"), Prop);
            FString ChangedJson;
            FJsonSerializer::Serialize(Root.ToSharedRef(), TJsonWriterFactory<>::Create(&ChangedJson));
            TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Changed;
            TestTrue(TEXT("Changed captured transform preserves legacy bundle validation"), FFlowArtsRuntimeMotion::Parse(ChangedJson, Character, RigHash, Mesh, Changed, Error));
            if (Changed.IsValid()) TestTrue(TEXT("Changed captured transform has distinct playback identity"), Changed->GetProfile() != Legacy->GetProfile());
            Prop[0] = OriginalPosition;
            FirstFrame->SetArrayField(TEXT("prop"), Prop);

            if (!bCheckedLegacyEquip && Legacy->GetPropFamily() == TEXT("staff") && SizedMotion.IsValid())
            {
                bCheckedLegacyEquip = true;
                UWorld::InitializationValues Settings;
                Settings.AllowAudioPlayback(false).CreatePhysicsScene(false).CreateNavigation(false).CreateAISystem(false);
                UWorld* World = UWorld::CreateWorld(EWorldType::Game, false,
                    MakeUniqueObjectName(GetTransientPackage(), UWorld::StaticClass(), TEXT("RuntimeLengthWorld")),
                    GetTransientPackage(), true, ERHIFeatureLevel::Num, &Settings);
                if (TestNotNull(TEXT("Transient runtime length world"), World))
                {
                    struct FDestroyWorld { UWorld* Value; ~FDestroyWorld() { Value->DestroyWorld(false); } } Cleanup{World};
                    AActor* Actor = World->SpawnActor<AActor>();
                    if (TestNotNull(TEXT("Runtime length prop owner"), Actor))
                    {
                        USceneComponent* Scene = NewObject<USceneComponent>(Actor);
                        Actor->SetRootComponent(Scene);
                        Scene->RegisterComponent();
                        UFlowFestPropComponent* Props = NewObject<UFlowFestPropComponent>(Actor);
                        Props->RegisterComponent();
                        Props->Initialize(Scene);
                        TestTrue(TEXT("Runtime staff equips"), Props->Equip(TEXT("staff")));
                        TestTrue(TEXT("Captured resize installs"), Props->LoadRuntimePerformance(SizedMotion));
                        UStaticMeshComponent* Left = FindObject<UStaticMeshComponent>(Actor, TEXT("FlowFestLeftPropMesh"));
                        UStaticMeshComponent* Right = FindObject<UStaticMeshComponent>(Actor, TEXT("FlowFestRightPropMesh"));
                        if (TestNotNull(TEXT("Left runtime prop mesh"), Left) && TestNotNull(TEXT("Right runtime prop mesh"), Right))
                        {
                            TestFalse(TEXT("Captured resize actually changes authored scale"), FMath::IsNearlyEqual(Left->GetRelativeScale3D().Y, 1.0));
                            TestTrue(TEXT("Legacy motion replaces resized motion"), Props->LoadRuntimePerformance(Legacy));
                            TestTrue(TEXT("Legacy restores both catalog dimensions"), FMath::IsNearlyEqual(Left->GetRelativeScale3D().Y, 1.0) && FMath::IsNearlyEqual(Right->GetRelativeScale3D().Y, 1.0));
                            Root->SetNumberField(TEXT("effectivePropLengthCm"), 1000.0);
                            FString OversizedJson;
                            FJsonSerializer::Serialize(Root.ToSharedRef(), TJsonWriterFactory<>::Create(&OversizedJson));
                            TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Oversized;
                            if (TestTrue(TEXT("Schema accepts bounded length before catalog validation"), FFlowArtsRuntimeMotion::Parse(OversizedJson, Character, RigHash, Mesh, Oversized, Error)))
                                TestFalse(TEXT("Catalog out-of-range resize rejects transactionally"), Props->LoadRuntimePerformance(Oversized));
                            Root->RemoveField(TEXT("effectivePropLengthCm"));
                            TestTrue(TEXT("Rejected resize preserves both visible dimensions"), FMath::IsNearlyEqual(Left->GetRelativeScale3D().Y, 1.0) && FMath::IsNearlyEqual(Right->GetRelativeScale3D().Y, 1.0));
                            TestTrue(TEXT("Rejected resize preserves playable old track"), Props->SetPerformanceTime(0.f));
                            TSharedPtr<FJsonObject> HiddenSource;
                            FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(LegacyJson), HiddenSource);
                            for (const auto& Frame : HiddenSource->GetArrayField(TEXT("frames")))
                                Frame->AsObject()->SetArrayField(TEXT("propVisibility"),
                                    {MakeShared<FJsonValueBoolean>(false), MakeShared<FJsonValueBoolean>(true)});
                            if (HiddenSource->HasTypedField<EJson::Object>(TEXT("gripValidation")))
                                HiddenSource->GetObjectField(TEXT("gripValidation"))->SetNumberField(TEXT("sideSamples"),
                                    HiddenSource->GetNumberField(TEXT("frameCount")));
                            FString HiddenJson;
                            FJsonSerializer::Serialize(HiddenSource.ToSharedRef(), TJsonWriterFactory<>::Create(&HiddenJson));
                            TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Hidden;
                            if (TestTrue(TEXT("Single-hand score imports"), FFlowArtsRuntimeMotion::Parse(HiddenJson, Character, RigHash, Mesh, Hidden, Error)))
                            {
                                TestTrue(TEXT("Single-hand score installs"), Props->LoadRuntimePerformance(Hidden));
                                TestTrue(TEXT("Single-hand score presents"), Props->SetPerformanceTime(.1f));
                                TestTrue(TEXT("Hidden prop mesh stays hidden"), !Left->IsVisible() && Right->IsVisible());
                                TArray<FFlowArtsClearanceCapsule> LeftCapsules, RightCapsules;
                                Props->SampleClearanceCapsules(Hidden->GetProfile(), .1f, FTransform::Identity,
                                    LeftCapsules, RightCapsules);
                                TestTrue(TEXT("Hidden hand has no invisible collision cover"), LeftCapsules.IsEmpty() && !RightCapsules.IsEmpty());
                                Props->SetVisible(false);
                                TestTrue(TEXT("Stowing hides both hands"), !Left->IsVisible() && !Right->IsVisible());
                                Props->SetVisible(true);
                                TestTrue(TEXT("Restoring retains score visibility"), !Left->IsVisible() && Right->IsVisible());
                                Props->ClearPerformanceTransforms();
                                TestTrue(TEXT("Leaving score restores normal carrying props"), Left->IsVisible() && Right->IsVisible());
                                // The fixture itself may intentionally hide a hand. Build an explicit
                                // legacy payload without this optional channel to test its default.
                                for (const auto& Frame : HiddenSource->GetArrayField(TEXT("frames")))
                                    Frame->AsObject()->RemoveField(TEXT("propVisibility"));
                                if (HiddenSource->HasTypedField<EJson::Object>(TEXT("gripValidation")))
                                    HiddenSource->GetObjectField(TEXT("gripValidation"))->SetNumberField(TEXT("sideSamples"),
                                        HiddenSource->GetNumberField(TEXT("frameCount")) * 2.0);
                                FString DefaultVisibilityJson;
                                FJsonSerializer::Serialize(HiddenSource.ToSharedRef(), TJsonWriterFactory<>::Create(&DefaultVisibilityJson));
                                TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> DefaultVisibility;
                                if (TestTrue(TEXT("Legacy visibility payload imports"), FFlowArtsRuntimeMotion::Parse(DefaultVisibilityJson, Character, RigHash, Mesh, DefaultVisibility, Error)))
                                {
                                    TestTrue(TEXT("Legacy score replaces hidden score"), Props->LoadRuntimePerformance(DefaultVisibility));
                                    TestTrue(TEXT("Legacy visibility defaults to both hands"), Left->IsVisible() && Right->IsVisible());
                                }
                            }
                        }
                    }
                }
            }
        }
        if (bHadLength) Root->SetNumberField(TEXT("effectivePropLengthCm"), OriginalLength);

        TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Rejected = Motion;
        TestFalse(TEXT("Wrong trusted rig rejected"), FFlowArtsRuntimeMotion::Parse(Json, Character,
            FString::ChrN(64, '0'), Mesh, Rejected, Error));
        TestFalse(TEXT("Rejected import clears output"), Rejected.IsValid());
        TestFalse(TEXT("Truncated capture rejected"), FFlowArtsRuntimeMotion::Parse(Json.Left(Json.Len() / 2),
            Character, RigHash, Mesh, Rejected, Error));
        const double OriginalCount = Root->GetNumberField(TEXT("frameCount"));
        Root->SetNumberField(TEXT("frameCount"), OriginalCount + 1);
        FString Incomplete;
        FJsonSerializer::Serialize(Root.ToSharedRef(), TJsonWriterFactory<>::Create(&Incomplete));
        TestFalse(TEXT("Missing declared frame rejected despite valid JSON"), FFlowArtsRuntimeMotion::Parse(Incomplete,
            Character, RigHash, Mesh, Rejected, Error));
        Root->SetNumberField(TEXT("frameCount"), OriginalCount);
        Root->SetStringField(TEXT("propId"), Root->GetStringField(TEXT("propFamily")) + TEXT(":tampered"));
        FString Tampered;
        FJsonSerializer::Serialize(Root.ToSharedRef(), TJsonWriterFactory<>::Create(&Tampered));
        TestFalse(TEXT("Inconsistent bundle identity rejected"), FFlowArtsRuntimeMotion::Parse(Tampered,
            Character, RigHash, Mesh, Rejected, Error));
    }
    return !HasAnyErrors();
}
#endif
