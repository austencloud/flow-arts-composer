#if WITH_DEV_AUTOMATION_TESTS
#include "FlowArtsRuntimeMotion.h"
#include "FlowFestAnimInstance.h"

#include "Animation/AnimInstanceProxy.h"
#include "BoneContainer.h"
#include "BonePose.h"
#include "Components/SceneComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Dom/JsonObject.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "Misc/AutomationTest.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/MemStack.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestCapturedPoseTest,
    "FlowArts.Replay.CapturedPosePolicy",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowFestCapturedPoseTest::RunTest(const FString& Parameters)
{
    FString MotionPath;
    if (!FParse::Value(FCommandLine::Get(), TEXT("FlowArtsReplayMotion="), MotionPath))
    {
        AddError(TEXT("Captured-pose regression requires -FlowArtsReplayMotion=<portable .motion.json>"));
        return false;
    }
    FString CharacterId = TEXT("x-bot");
    FParse::Value(FCommandLine::Get(), TEXT("FlowArtsReplayCharacter="), CharacterId);

    FString CatalogText, RigHash;
    TSharedPtr<FJsonObject> Catalog;
    const TSharedPtr<FJsonObject>* Rigs = nullptr;
    if (!FFileHelper::LoadFileToString(CatalogText,
            *(FPaths::ProjectContentDir() / TEXT("Data/runtime-rigs.json"))) ||
        !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(CatalogText), Catalog) || !Catalog ||
        !Catalog->TryGetObjectField(TEXT("rigs"), Rigs) || !Rigs ||
        !(*Rigs)->TryGetStringField(CharacterId, RigHash))
    {
        AddError(TEXT("Captured-pose regression requires the installed trusted runtime-rigs entry"));
        return false;
    }

    const FString CharacterKey = CharacterId.Replace(TEXT("-"), TEXT("_"));
    const FString MeshPath = FString::Printf(TEXT("/Game/FlowFest/Characters/%s/SK_%s.SK_%s"),
        *CharacterKey, *CharacterKey, *CharacterKey);
    USkeletalMesh* Mesh = LoadObject<USkeletalMesh>(nullptr, *MeshPath);
    if (!TestNotNull(TEXT("Installed catalog character mesh"), Mesh)) return false;

    TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Motion;
    FString Error;
    if (!FFlowArtsRuntimeMotion::LoadFromFile(MotionPath, CharacterId, RigHash, Mesh, Motion, Error))
    {
        AddError(FString::Printf(TEXT("Portable motion schema/rig validation failed: %s"), *Error));
        return false;
    }

    UWorld::InitializationValues Settings;
    Settings.InitializeScenes(false).AllowAudioPlayback(false).CreatePhysicsScene(false)
        .CreateNavigation(false).CreateAISystem(false).ShouldSimulatePhysics(false).CreateFXSystem(false);
    UWorld* World = UWorld::CreateWorld(EWorldType::Game, false,
        MakeUniqueObjectName(GetTransientPackage(), UWorld::StaticClass(), TEXT("CapturedPoseWorld")),
        GetTransientPackage(), true, ERHIFeatureLevel::Num, &Settings);
    if (!TestNotNull(TEXT("Scene-less captured-pose world"), World)) return false;
    struct FDestroyWorld
    {
        UWorld* Value;
        ~FDestroyWorld() { Value->DestroyWorld(false); }
    } Cleanup{World};

    AActor* Actor = World->SpawnActor<AActor>();
    if (!TestNotNull(TEXT("Captured-pose performer"), Actor)) return false;
    USceneComponent* Root = NewObject<USceneComponent>(Actor);
    Actor->SetRootComponent(Root);
    Root->RegisterComponent();
    USkeletalMeshComponent* Body = NewObject<USkeletalMeshComponent>(Actor);
    Body->SetupAttachment(Root);
    Body->SetSkeletalMeshAsset(Mesh);
    Body->SetEnableAnimation(false);
    Body->SetComponentTickEnabled(false);
    Body->RegisterComponent();
    Body->SetComponentTickEnabled(false);
    Body->SetComponentSpaceTransformsDoubleBuffering(false);

    UFlowFestAnimInstance* Animator = NewObject<UFlowFestAnimInstance>(Body);
    Animator->StartRuntimePerformance(Motion, EFlowFestRuntimePosePolicy::PreserveCapturedPose);
    const double Seconds = Motion->GetDurationSeconds() * .371;
    Animator->SeekPerformance(static_cast<float>(Seconds));
    // Deliberately create a native-only pose change. The opted-in renderer must
    // bypass it, while the default policy below must demonstrate the contrast.
    Animator->SetFootCorrection(8.f, 0.f);
    FFlowFestAnimProxy& Proxy = Animator->GetProxyOnGameThread<FFlowFestAnimProxy>();
    Proxy.Initialize(Animator);
    Proxy.PreUpdate(Animator, 0.f);

    TArray<FBoneIndexType> Required;
    for (int32 Index = 0; Index < Mesh->GetRefSkeleton().GetNum(); ++Index) Required.Add(Index);
    FMemMark Mark(FMemStack::Get());
    FBoneContainer& Bones = Proxy.GetRequiredBones();
    Bones.InitializeTo(Required, UE::Anim::FCurveFilterSettings(), *Mesh);
    FPoseContext Evaluated(&Proxy), Expected(&Proxy);
    Evaluated.ResetToRefPose();
    Expected.ResetToRefPose();
    if (!TestTrue(TEXT("Captured runtime pose evaluates through the native proxy"), Proxy.Evaluate(Evaluated)) ||
        !TestTrue(TEXT("Direct captured runtime sample succeeds"),
            Motion->SamplePose(Expected, Seconds, Body->GetRelativeTransform()))) return false;

    int32 ComparedBones = 0;
    double MaxPositionErrorCm = 0.0;
    double MaxAngleErrorDeg = 0.0;
    for (int32 Index = 0; Index < Mesh->GetRefSkeleton().GetNum(); ++Index)
    {
        const FCompactPoseBoneIndex Bone = Bones.GetCompactPoseIndexFromSkeletonIndex(Index);
        if (Bone.GetInt() == INDEX_NONE) continue;
        const FTransform& Actual = Evaluated.Pose[Bone];
        const FTransform& Direct = Expected.Pose[Bone];
        MaxPositionErrorCm = FMath::Max(MaxPositionErrorCm,
            FVector::Distance(Actual.GetLocation(), Direct.GetLocation()));
        MaxAngleErrorDeg = FMath::Max(MaxAngleErrorDeg,
            FMath::RadiansToDegrees(Actual.GetRotation().AngularDistance(Direct.GetRotation())));
        ++ComparedBones;
    }
    if (!TestTrue(TEXT("Captured-pose comparison covers the actual rig"), ComparedBones > 0) ||
        !TestTrue(FString::Printf(TEXT("PreserveCapturedPose leaves sampled bone positions unchanged (max %.5f cm)"),
                MaxPositionErrorCm), MaxPositionErrorCm < .001) ||
        !TestTrue(FString::Printf(TEXT("PreserveCapturedPose leaves sampled bone rotations unchanged (max %.5f deg)"),
                MaxAngleErrorDeg), MaxAngleErrorDeg < .001)) return false;

    if (!TestTrue(TEXT("Explicit captured playback selects preserve policy"),
            Animator->GetRuntimePosePolicy() == EFlowFestRuntimePosePolicy::PreserveCapturedPose) ||
        !TestFalse(TEXT("Captured playback does not publish a clearance-ready result"),
            Proxy.GetArmClearance().bFeasible) ||
        !TestFalse(TEXT("Captured playback does not apply a clearance correction"),
            Proxy.GetArmClearance().bApplied) ||
        !TestFalse(TEXT("Captured playback does not publish a prepared-motion certificate"),
            Proxy.IsPreparedMotionReady())) return false;

    Animator->StartRuntimePerformance(Motion);
    if (!TestTrue(TEXT("Restart without opt-in restores game clearance policy"),
            Animator->GetRuntimePosePolicy() == EFlowFestRuntimePosePolicy::GameClearance)) return false;
    Animator->SeekPerformance(static_cast<float>(Seconds));
    Proxy.PreUpdate(Animator, 0.f);
    const FReferenceSkeleton& Reference = Mesh->GetRefSkeleton();
    const int32 LeftFootSkeletonIndex = Reference.FindBoneIndex(TEXT("LeftFoot"));
    if (!TestTrue(TEXT("Native foot-correction fixture has the production left-leg chain"),
            LeftFootSkeletonIndex != INDEX_NONE &&
            Reference.FindBoneIndex(TEXT("LeftUpLeg")) != INDEX_NONE &&
            Reference.FindBoneIndex(TEXT("LeftLeg")) != INDEX_NONE)) return false;
    const FCompactPoseBoneIndex LeftFoot = Bones.GetCompactPoseIndexFromSkeletonIndex(LeftFootSkeletonIndex);
    if (!TestTrue(TEXT("Native foot-correction target is in the evaluated compact pose"),
            LeftFoot.GetInt() != INDEX_NONE)) return false;
    FPoseContext DefaultPolicyPose(&Proxy);
    DefaultPolicyPose.ResetToRefPose();
    if (!TestTrue(TEXT("Default game-clearance policy evaluates after restart"), Proxy.Evaluate(DefaultPolicyPose)))
        return false;
    FCSPose<FCompactPose> ExpectedComponents, DefaultComponents;
    ExpectedComponents.InitPose(Expected.Pose);
    DefaultComponents.InitPose(DefaultPolicyPose.Pose);
    const double LeftFootDeltaCm = FVector::Distance(
        DefaultComponents.GetComponentSpaceTransform(LeftFoot).GetLocation(),
        ExpectedComponents.GetComponentSpaceTransform(LeftFoot).GetLocation());
    if (!TestTrue(FString::Printf(TEXT("Default policy applies injected native foot correction (left-foot component-space delta %.3f cm)"),
            LeftFootDeltaCm), LeftFootDeltaCm > 4.f)) return false;
    return true;
}
#endif
