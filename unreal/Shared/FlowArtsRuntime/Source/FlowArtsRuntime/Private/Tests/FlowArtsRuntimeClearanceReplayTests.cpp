#if WITH_DEV_AUTOMATION_TESTS
#include "FlowArtsRuntimeMotion.h"
#include "FlowArtsArmClearance.h"
#include "FlowFestAnimInstance.h"
#include "FlowFestPropComponent.h"
#include "FlowFestStancePlan.h"

#include "Animation/AnimNodeBase.h"
#include "Animation/AnimSequence.h"
#include "Animation/Skeleton.h"
#include "BoneContainer.h"
#include "BonePose.h"
#include "Components/SceneComponent.h"
#include "Components/BoxComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Dom/JsonObject.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "HAL/FileManager.h"
#include "HAL/PlatformProcess.h"
#include "HAL/PlatformTime.h"
#include "Misc/AutomationTest.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/MemStack.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "String/LexFromString.h"
#include "UObject/UObjectGlobals.h"

namespace
{
TArray<TSharedPtr<FJsonValue>> ReplayVector(const FVector& Value)
{
    return {MakeShared<FJsonValueNumber>(Value.X), MakeShared<FJsonValueNumber>(Value.Y),
        MakeShared<FJsonValueNumber>(Value.Z)};
}
}

// Deliberately outside FlowArts.Runtime: this opt-in diagnostic requires a
// supplied motion or activity mode and does not assert unresolved geometry clear.
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsRuntimeClearanceReplayTest,
    "FlowArts.Replay.RuntimeClearance",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsRuntimeClearanceReplayTest::RunTest(const FString& Parameters)
{
    const auto RunCharacter = [&](const FString& CharacterOverride, const FString& OutputOverride,
        const FString& MotionOverride,
        TSharedPtr<FJsonObject>& CompletedReport) -> bool
    {
    FAutomationTestExecutionInfo Before;
    GetExecutionInfo(Before);
    FString MotionPath, OutputPath, SampleText, Activity, CharacterId = TEXT("x-bot");
    FParse::Value(FCommandLine::Get(), TEXT("FlowArtsReplayActivity="), Activity);
    const bool bCarry = !Activity.IsEmpty();
    FParse::Value(FCommandLine::Get(), TEXT("FlowArtsReplayCharacter="), CharacterId);
    if (!CharacterOverride.IsEmpty()) CharacterId = CharacterOverride;
    if (bCarry && !Activity.Equals(TEXT("carry"), ESearchCase::IgnoreCase))
    {
        AddError(TEXT("Activity replay supports carry with an installed catalog rig"));
        return false;
    }
    bool bHasMotion = FParse::Value(FCommandLine::Get(), TEXT("FlowArtsReplayMotion="), MotionPath);
    if (!MotionOverride.IsEmpty())
    {
        MotionPath = MotionOverride;
        bHasMotion = true;
    }
    if (bCarry && bHasMotion)
    {
        AddError(TEXT("Choose either portable motion replay or activity replay"));
        return false;
    }
    if (!bCarry && !bHasMotion)
    {
        AddError(TEXT("Replay requires -FlowArtsReplayMotion=<portable .motion.json>, or -FlowArtsReplayActivity=carry; select its installed rig with -FlowArtsReplayCharacter=<rig>"));
        return false;
    }
    FParse::Value(FCommandLine::Get(), TEXT("FlowArtsReplayOutput="), OutputPath);
    if (!OutputOverride.IsEmpty()) OutputPath = OutputOverride;
    // Commas delimit samples, rather than terminating the command-line value.
    FParse::Value(FCommandLine::Get(), TEXT("FlowArtsReplaySamples="), SampleText, false);
    const bool bCycle = bCarry || FParse::Param(FCommandLine::Get(), TEXT("FlowArtsReplayCycle"));
    const bool bRequireClear = FParse::Param(FCommandLine::Get(), TEXT("FlowArtsReplayRequireClear"));
    int32 SampleFps = 30;
    FParse::Value(FCommandLine::Get(), TEXT("FlowArtsReplayFps="), SampleFps);
    int32 LoopCount = bCarry ? 1 : 2;
    FParse::Value(FCommandLine::Get(), TEXT("FlowArtsReplayLoops="), LoopCount);
    int32 PreparePasses = 0;
    FParse::Value(FCommandLine::Get(), TEXT("FlowArtsReplayPreparePasses="), PreparePasses);
    if (!TestTrue(TEXT("Optional preparation is bounded to 0..8 passes and portable motions"),
        PreparePasses >= 0 && PreparePasses <= 8 && (!bCarry || PreparePasses == 0))) return false;
    if (!TestTrue(TEXT("Replay cadence is bounded to 10..120 samples/second"), SampleFps >= 10 && SampleFps <= 120))
        return false;
    if (!TestTrue(TEXT("Replay loop count is bounded to 1..8"), LoopCount >= 1 && LoopCount <= 8)) return false;

    FString CatalogText, RigHash;
    TSharedPtr<FJsonObject> Catalog;
    const TSharedPtr<FJsonObject>* Rigs = nullptr;
    if (!FFileHelper::LoadFileToString(CatalogText, *(FPaths::ProjectContentDir() / TEXT("Data/runtime-rigs.json"))) ||
        !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(CatalogText), Catalog) || !Catalog ||
        !Catalog->TryGetObjectField(TEXT("rigs"), Rigs) || !Rigs ||
        !(*Rigs)->TryGetStringField(CharacterId, RigHash))
    {
        AddError(TEXT("Replay requires the installed trusted character runtime-rigs catalog entry"));
        return false;
    }
    FString CharacterKey = CharacterId.Replace(TEXT("-"), TEXT("_"));
    const FString Folder = FString::Printf(TEXT("/Game/FlowFest/Characters/%s"), *CharacterKey);
    const FString MeshPath = FString::Printf(TEXT("%s/SK_%s.SK_%s"), *Folder, *CharacterKey, *CharacterKey);
    USkeletalMesh* Mesh = LoadObject<USkeletalMesh>(nullptr, *MeshPath);
    if (!TestNotNull(TEXT("Installed catalog character skeletal mesh"), Mesh)) return false;
    TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Motion;
    FString Error;
    if (!bCarry && !FFlowArtsRuntimeMotion::LoadFromFile(MotionPath, CharacterId, RigHash, Mesh, Motion, Error))
    {
        AddError(FString::Printf(TEXT("Portable schema/rig validation failed: %s"), *Error));
        return false;
    }

    // Prop initialization registers real catalog mesh components and requires a
    // world. This scene-less world never ticks or creates rendering/physics/FX.
    // Motion mode exercises settled imported playback. Carry mode uses the same
    // production gait/activity evaluator and hand binding without a world tick.
    const bool bGroundedStance = FParse::Param(FCommandLine::Get(), TEXT("FlowArtsReplayGroundedStance"));
    UWorld::InitializationValues WorldSettings;
    WorldSettings.InitializeScenes(bGroundedStance).AllowAudioPlayback(false).CreatePhysicsScene(bGroundedStance)
        .CreateNavigation(false).CreateAISystem(false).ShouldSimulatePhysics(false).CreateFXSystem(false);
    UWorld* World = UWorld::CreateWorld(EWorldType::Game, false,
        MakeUniqueObjectName(GetTransientPackage(), UWorld::StaticClass(), TEXT("FlowArtsReplay")),
        GetTransientPackage(), true, ERHIFeatureLevel::Num, &WorldSettings);
    if (!TestNotNull(TEXT("Scene-less replay world"), World)) return false;
    struct FDestroyReplayWorld
    {
        UWorld* Value;
        ~FDestroyReplayWorld() { Value->DestroyWorld(false); }
    } Cleanup{World};
    AActor* Owner = World->SpawnActor<AActor>();
    if (!TestNotNull(TEXT("Transient production prop owner"), Owner)) return false;
    USceneComponent* Root = NewObject<USceneComponent>(Owner);
    Owner->SetRootComponent(Root);
    Root->RegisterComponent();
    Root->UpdateComponentToWorld();
    // Imported playback needs no socket consumers. Carry registers below so
    // engine socket queries recognize its explicitly published bone transforms.
    // Only the explicit proxy evaluates animation; this world never ticks.
    USkeletalMeshComponent* Body = NewObject<USkeletalMeshComponent>(Owner);
    Body->SetupAttachment(Root);
    Body->SetSkeletalMeshAsset(Mesh);
    const FBoxSphereBounds Bounds = Mesh->GetBounds();
    const float Height = Bounds.BoxExtent.Z * 2.f;
    if (!TestTrue(TEXT("Finite native rig presentation height"), FMath::IsFinite(Height) && Height > 1.f)) return false;
    const float Scale = 190.5f / Height;
    const float Lift = Mesh->GetRefSkeleton().GetBoneName(0) == TEXT("Hips") ? 0.f :
        -(Bounds.Origin.Z - Bounds.BoxExtent.Z) * Scale;
    // Same standing normalization as UFlowFestAvatarComponent::SetCharacter.
    Body->SetRelativeTransform(FTransform(FQuat(FVector::UpVector, -HALF_PI), FVector(0, 0, Lift), FVector(Scale)));
    Body->UpdateComponentToWorld();
    UFlowFestPropComponent* Prop = NewObject<UFlowFestPropComponent>(Owner);
    Prop->Initialize(Root);
    FString PropId = bCarry ? TEXT("staff:default") : Motion->GetPropId();
    if (bCarry) FParse::Value(FCommandLine::Get(), TEXT("FlowArtsReplayProp="), PropId);
    if (!TestTrue(TEXT("Actual catalog prop equips"), Prop->Equip(FName(*PropId)) && Prop->IsReady())) return false;
    TMap<FName, TObjectPtr<UAnimSequence>> Gaits;
    float Duration = bCarry ? 0.f : Motion->GetDurationSeconds();
    if (bCarry)
    {
        for (const TCHAR* Name : {TEXT("Idle"), TEXT("Walk")})
        {
            const FString Path = FString::Printf(TEXT("%s/A_%s.A_%s"), *Folder, Name, Name);
            UAnimSequence* Clip = LoadObject<UAnimSequence>(nullptr, *Path);
            if (!TestTrue(TEXT("Installed gait matches character skeleton"), Clip && Clip->GetSkeleton() == Mesh->GetSkeleton())) return false;
            Gaits.Add(FName(Name), Clip);
        }
        const FString GripPath = Folder / TEXT("A_Flow_P_staff_A.A_Flow_P_staff_A");
        UAnimSequence* Grip = LoadObject<UAnimSequence>(nullptr, *GripPath);
        if (!TestTrue(TEXT("Production carry finger capture exists and matches rig"),
            Grip && Grip->GetSkeleton() == Mesh->GetSkeleton() && Grip->GetPlayLength() >= 4.f)) return false;
        Duration = Gaits.FindChecked(TEXT("Walk"))->GetPlayLength();
        if (!TestTrue(TEXT("Finite nonzero walking cycle"), FMath::IsFinite(Duration) && Duration > 0.f)) return false;
    }
    else if (!TestTrue(TEXT("Actual portable prop/grip track installs"), Prop->LoadRuntimePerformance(Motion))) return false;
    {
        // UE socket queries reject transforms on an unregistered, uninitialized
        // skeletal component, even when its editable transform array is filled.
        // Registration initializes the reference pose and its validity flag.
        // Disable built-in animation/ticking: the proxy below remains the only
        // evaluator, and the world has neither a rendering nor physics scene.
        Body->SetEnableAnimation(false);
        Body->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        Body->RegisterComponent();
        Body->SetComponentTickEnabled(false);
        if (!TestTrue(TEXT("Socket source is registered without animation ticking"),
            Body->IsRegistered() && !Body->IsComponentTickEnabled())) return false;
        // Keep the manually published socket buffer readable without a tick.
        Body->SetComponentSpaceTransformsDoubleBuffering(false);
        auto& Bind = Body->GetEditableComponentSpaceTransforms();
        const auto& MeshReference = Mesh->GetRefSkeleton();
        Bind = MeshReference.GetRefBonePose();
        for (int32 Index = 0; Index < Bind.Num(); ++Index)
        {
            const int32 Parent = MeshReference.GetParentIndex(Index);
            if (Parent != INDEX_NONE) Bind[Index] *= Bind[Parent];
        }
        if (!TestTrue(TEXT("Production hand/finger grip binding succeeds"), Prop->BindHands(Body) && Prop->HasVisibleGrip())) return false;
    }
    FVector PalmLocal[2];
    if (!TestTrue(TEXT("Actual imported rig provides calibrated palm offsets"), Prop->GetPalmLocalOffsets(PalmLocal))) return false;
    UFlowFestAnimInstance* Animator = NewObject<UFlowFestAnimInstance>(Body);
    Animator->Configure(Gaits, Folder);
    Animator->SetGripSource(Prop);
    if (bCarry)
    {
        if (!TestTrue(TEXT("Production walking channel selects"), Animator->SetMotion(TEXT("Walk")))) return false;
        Animator->SetMotionRate(TEXT("Walk"), 1.f); // Authored walking speed: 184 cm/s.
        Animator->SetActivityPose(EFlowFestBodyActivity::Carry, 0.f, -1.f);
    }
    else
    {
        Animator->StartRuntimePerformance(Motion);
        Animator->SeekPerformance(0.f);
    }
    FFlowFestAnimProxy& Proxy = Animator->GetProxyOnGameThread<FFlowFestAnimProxy>();
    Proxy.Initialize(Animator);

    TArray<FFlowArtsClearanceCapsule> CarryExpected[2];
    bool bAuthoritativeCapsules = false;
    UStaticMeshComponent* CarryMeshes[2] = {};
    {
        // Independently read the installed producer metadata. Compare its local
        // endpoints against the actual rendered mesh transform, rather than
        // reproducing the consumer's attachment/mirroring/scale composition.
        // RequireMetadata applies to both captured performances and carrying.
        FString PropsText;
        TSharedPtr<FJsonObject> PropsCatalog;
        const TArray<TSharedPtr<FJsonValue>>* Props = nullptr;
        TSharedPtr<FJsonObject> Variant;
        FString BaseId, VariantId;
        PropId.Split(TEXT(":"), &BaseId, &VariantId);
        if (FFileHelper::LoadFileToString(PropsText, *(FPaths::ProjectContentDir() / TEXT("Data/props.json"))) &&
            FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(PropsText), PropsCatalog) && PropsCatalog &&
            PropsCatalog->TryGetArrayField(TEXT("props"), Props))
        {
            for (const auto& Value : *Props)
            {
                const auto Object = Value->AsObject();
                if (Object->GetStringField(TEXT("id")) != BaseId) continue;
                for (const auto& Build : Object->GetArrayField(TEXT("variants")))
                    if (Build->AsObject()->GetStringField(TEXT("id")) == VariantId) Variant = Build->AsObject();
            }
        }
        FString Space;
        bAuthoritativeCapsules = Variant && Variant->TryGetStringField(TEXT("clearanceSpace"), Space) &&
            Space == TEXT("ue-static-mesh-local-cm-v1");
        if (FParse::Param(FCommandLine::Get(), TEXT("FlowArtsReplayRequireMetadata")) &&
            !TestTrue(TEXT("Requested authoritative mesh-local capsule metadata exists"), bAuthoritativeCapsules)) return false;
        TArray<UStaticMeshComponent*> PropMeshes;
        Owner->GetComponents<UStaticMeshComponent>(PropMeshes);
        for (int32 Side = 0; Side < 2; ++Side)
        {
            UStaticMeshComponent* Actual = nullptr;
            const FName Name = Side == 0 ? TEXT("FlowFestLeftPropMesh") : TEXT("FlowFestRightPropMesh");
            for (UStaticMeshComponent* Candidate : PropMeshes)
                if (Candidate->GetFName() == Name) Actual = Candidate;
            if (!TestTrue(TEXT("Carry dimension reference uses actual equipped prop asset"),
                Actual && Actual->GetStaticMesh())) return false;
            CarryMeshes[Side] = Actual;
            const FVector WorldExtent = Actual->GetStaticMesh()->GetBoundingBox().GetExtent() *
                Actual->GetComponentScale().GetAbs();
            if (!TestTrue(TEXT("Actual carried prop retains finite human-scale centimeter dimensions"),
                !WorldExtent.ContainsNaN() && WorldExtent.GetMax() > .5 && WorldExtent.GetMax() < 150.)) return false;
            if (bAuthoritativeCapsules)
            {
                const auto& Values = Variant->GetArrayField(Side == 0 ? TEXT("clearanceCapsules") : TEXT("rightClearanceCapsules"));
                if (!TestTrue(TEXT("Authoritative complete capsule array has bounded size"), !Values.IsEmpty() && Values.Num() <= 16)) return false;
                for (const auto& Value : Values)
                {
                    const auto Object = Value->AsObject();
                    FFlowArtsClearanceCapsule Capsule;
                    const auto& Start = Object->GetArrayField(TEXT("start"));
                    const auto& End = Object->GetArrayField(TEXT("end"));
                    if (!TestTrue(TEXT("Mesh-local capsule coordinates have three axes"), Start.Num() == 3 && End.Num() == 3)) return false;
                    for (int32 Axis = 0; Axis < 3; ++Axis)
                    { Capsule.Start[Axis] = Start[Axis]->AsNumber(); Capsule.End[Axis] = End[Axis]->AsNumber(); }
                    Capsule.RadiusCm = Object->GetNumberField(TEXT("radiusCm"));
                    if (!TestTrue(TEXT("Mesh-local capsule is finite and positive"), !Capsule.Start.ContainsNaN() &&
                        !Capsule.End.ContainsNaN() && FMath::IsFinite(Capsule.RadiusCm) && Capsule.RadiusCm > 0.f)) return false;
                    CarryExpected[Side].Add(Capsule);
                }
            }
            else
            {
                const FBox Box = Actual->GetStaticMesh()->GetBoundingBox();
                const FVector Extent = Box.GetExtent();
                const FVector Scaled = Extent * Actual->GetComponentScale().GetAbs();
                const int32 Axis = Scaled.X >= Scaled.Y && Scaled.X >= Scaled.Z ? 0 : Scaled.Y >= Scaled.Z ? 1 : 2;
                FVector Along = FVector::ZeroVector; Along[Axis] = Extent[Axis];
                FFlowArtsClearanceCapsule Capsule;
                Capsule.Start = Box.GetCenter() - Along; Capsule.End = Box.GetCenter() + Along;
                Capsule.RadiusCm = FMath::Sqrt(FMath::Square(Scaled[(Axis + 1) % 3]) +
                    FMath::Square(Scaled[(Axis + 2) % 3])) / Actual->GetComponentScale().GetAbsMax();
                CarryExpected[Side].Add(Capsule);
            }
        }
    }

    TArray<float> Requested;
    if (bCycle)
    {
        // Two loops by default expose warm history behavior. Advance, rather
        // than seek, retains the production clock and wrap at each boundary.
        const int32 Intervals = FMath::CeilToInt(Duration * SampleFps);
        if (!bCarry && !Motion->IsLooping()) LoopCount = 1;
        if (bCarry)
        {
            const int32 Steps = FMath::CeilToInt(Duration * LoopCount * SampleFps);
            for (int32 Index = 0; Index <= Steps; ++Index)
                Requested.Add(FMath::Min(double(Index) / SampleFps, double(Duration) * LoopCount));
        }
        else for (int32 Index = 0; Index <= Intervals * LoopCount; ++Index)
            Requested.Add(Duration * (double(Index) / Intervals));
    }
    else
    {
        if (SampleText.IsEmpty()) SampleText = TEXT("3.223328,4.213357");
        TArray<FString> Tokens;
        SampleText.ParseIntoArray(Tokens, TEXT(","), true);
        for (const FString& Token : Tokens)
        {
            double Seconds = 0;
            if (!LexTryParseString(Seconds, *Token) || !FMath::IsFinite(Seconds) || Seconds < 0 ||
                Seconds > Motion->GetDurationSeconds())
            {
                AddError(FString::Printf(TEXT("Invalid replay sample: %s"), *Token));
                return false;
            }
            Requested.Add(static_cast<float>(Seconds));
        }
    }
    if (!TestTrue(TEXT("At least one requested sample"), !Requested.IsEmpty())) return false;
    TArray<FBoneIndexType> Required;
    for (int32 Index = 0; Index < Mesh->GetRefSkeleton().GetNum(); ++Index) Required.Add(Index);
    FMemMark Mark(FMemStack::Get());
    // Evaluate creates child FPoseContexts from Output. UE's context copy
    // constructor initializes through SourceContext.AnimInstanceProxy, so a
    // standalone FBoneContainer-only context is insufficient for this path.
    FBoneContainer& Bones = Proxy.GetRequiredBones();
    Bones.InitializeTo(Required, UE::Anim::FCurveFilterSettings(), *Mesh);
    const FReferenceSkeleton& Reference = Mesh->GetSkeleton()->GetReferenceSkeleton();
    FCompactPoseBoneIndex Hands[2] = {
        Bones.GetCompactPoseIndexFromSkeletonIndex(Reference.FindBoneIndex(TEXT("LeftHand"))),
        Bones.GetCompactPoseIndexFromSkeletonIndex(Reference.FindBoneIndex(TEXT("RightHand")))};
    if (!TestTrue(TEXT("Both normalized hand bones exist in compact pose"),
        Hands[0].GetInt() != INDEX_NONE && Hands[1].GetInt() != INDEX_NONE)) return false;

    if (bGroundedStance)
    {
        Proxy.PreUpdate(Animator, 0.f);
        FPoseContext Initial(&Proxy);
        Initial.ResetToRefPose();
        if (!TestTrue(TEXT("Native initial stance samples"), Proxy.Evaluate(Initial))) return false;
        FFlowFestStancePose InitialPose;
        if (!TestTrue(TEXT("Native initial stance has complete component bones"),
            FFlowFestStancePlan::Capture(Initial, InitialPose))) return false;
        FFlowArtsArmClearanceRigEnvelope Envelope;
        FString MeasureError;
        if (!TestTrue(TEXT("Native weighted foot geometry measures"),
            FFlowArtsArmClearance::MeasureRig(Mesh, Envelope, MeasureError))) return false;
        FFlowArtsArmClearancePreparationSnapshot Snapshot;
        if (!TestTrue(TEXT("Native weighted foot geometry captures"),
            FFlowArtsArmClearance::CapturePreparationSnapshot(Initial, {}, {}, Envelope,
                Body->GetComponentTransform().GetScale3D(), Snapshot) &&
            bool(Snapshot.EvaluateFootSurfaces))) return false;
        TArray<FVector> FootSurfaces[2];
        if (!TestTrue(TEXT("Native weighted foot surfaces evaluate"),
            Snapshot.EvaluateFootSurfaces(InitialPose.Components, FootSurfaces[0], FootSurfaces[1]) &&
            !FootSurfaces[0].IsEmpty() && !FootSurfaces[1].IsEmpty())) return false;
        double SoleHeight = TNumericLimits<double>::Max();
        for (const auto& Side : FootSurfaces)
            for (const FVector& Point : Side)
                SoleHeight = FMath::Min(SoleHeight,
                    Body->GetComponentTransform().TransformPosition(Point).Z);
        AActor* Ground = World->SpawnActor<AActor>();
        if (!TestNotNull(TEXT("Ground actor"), Ground)) return false;
        UBoxComponent* Floor = NewObject<UBoxComponent>(Ground);
        Ground->SetRootComponent(Floor);
        Floor->SetBoxExtent(FVector(1000., 1000., 10.));
        Floor->SetMobility(EComponentMobility::Static);
        Floor->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
        Floor->SetCollisionResponseToAllChannels(ECR_Block);
        Floor->SetWorldLocation(FVector(0., 0., SoleHeight - 10.));
        Floor->RegisterComponent();
        FHitResult GroundHit;
        FCollisionQueryParams Query;
        Query.AddIgnoredActor(Owner);
        if (!TestTrue(TEXT("Native stance floor is traceable"),
            World->LineTraceSingleByChannel(GroundHit, FVector(0., 0., SoleHeight + 100.),
                FVector(0., 0., SoleHeight - 100.), ECC_Visibility, Query) &&
            GroundHit.GetComponent() == Floor)) return false;
    }

    const bool bRequireStance = FParse::Param(FCommandLine::Get(), TEXT("FlowArtsReplayRequireStancePrepared"));
    const bool bRequirePrepared = bRequireStance || FParse::Param(FCommandLine::Get(), TEXT("FlowArtsReplayRequirePrepared"));
    const bool bRequirePreparationFailure = FParse::Param(FCommandLine::Get(), TEXT("FlowArtsReplayRequirePreparationFailure"));
    double PreparationTimeoutSeconds = bRequireStance ? 60.0 : 15.0;
    double RequestedPreparationTimeoutSeconds = 0.0;
    if (FParse::Value(FCommandLine::Get(), TEXT("FlowArtsReplayPreparationTimeout="), RequestedPreparationTimeoutSeconds) &&
        FMath::IsFinite(RequestedPreparationTimeoutSeconds))
        PreparationTimeoutSeconds = FMath::Clamp(RequestedPreparationTimeoutSeconds, 15.0, 180.0);
    double AsyncPreparationSeconds = 0.0;
    if (bRequirePrepared || bRequirePreparationFailure)
    {
        if (!TestFalse(TEXT("Prepared replay requires a runtime clip"), bCarry)) return false;
        if (!TestFalse(TEXT("Preparation expectations are exclusive"), bRequirePrepared && bRequirePreparationFailure)) return false;
        const double Started = FPlatformTime::Seconds();
        int32 NextDiagnosticSecond = 10;
        while (!(bRequireStance ? Proxy.IsStancePrepared() : Proxy.IsPreparedMotionReady()) &&
            !(bRequireStance ? Proxy.IsStancePreparationFailed() : Proxy.IsPreparedMotionFailed()) &&
            FPlatformTime::Seconds() - Started < PreparationTimeoutSeconds)
        {
            Proxy.PreUpdate(Animator, 0.f);
            FPoseContext PreparingPose(&Proxy);
            PreparingPose.ResetToRefPose();
            if (!TestTrue(TEXT("Preparation captures through the production proxy"), Proxy.Evaluate(PreparingPose))) return false;
            if (bRequireStance && FPlatformTime::Seconds() - Started >= NextDiagnosticSecond)
            {
                AddInfo(FString::Printf(TEXT("Stance preparation after %ds: %s"),
                    NextDiagnosticSecond, *Proxy.DescribePreparationForTests()));
                NextDiagnosticSecond += 10;
            }
            FPlatformProcess::Sleep(.001f);
        }
        AsyncPreparationSeconds = FPlatformTime::Seconds() - Started;
        if (bRequireStance)
            AddInfo(FString::Printf(TEXT("Stance preparation terminal after %.3fs: %s"),
                AsyncPreparationSeconds, *Proxy.DescribePreparationForTests()));
        if (bRequirePrepared &&
            (!TestTrue(TEXT("Known feasible clip publishes a complete prepared track"), Proxy.IsPreparedMotionReady()) ||
             !TestFalse(TEXT("Known feasible clip preparation does not fail"), Proxy.IsPreparedMotionFailed()))) return false;
        if (bRequireStance && !TestTrue(TEXT("Ground validated complete stance track publishes"),
            Proxy.IsStancePrepared())) return false;
        if (bRequirePreparationFailure &&
            (!TestTrue(TEXT("Unresolved clip terminates preparation without publishing"), Proxy.IsPreparedMotionFailed()) ||
             !TestFalse(TEXT("Failed preparation never publishes a partial track"), Proxy.IsPreparedMotionReady()) ||
             !TestFalse(TEXT("Ungrounded replay never publishes stance"), Proxy.IsStancePrepared()))) return false;
        Animator->SetPerformancePaused(true);
        Proxy.PreUpdate(Animator, 0.f);
        FPoseContext PausedPose(&Proxy);
        PausedPose.ResetToRefPose();
        if (!TestTrue(TEXT("Paused preparation fixture evaluates"), Proxy.Evaluate(PausedPose))) return false;
        for (int32 Repeat = 0; Repeat < 3; ++Repeat)
        {
            Proxy.PreUpdate(Animator, .1f);
            FPoseContext RepeatedPose(&Proxy);
            RepeatedPose.ResetToRefPose();
            if (!TestTrue(TEXT("Paused preparation fixture repeats"), Proxy.Evaluate(RepeatedPose))) return false;
            for (int32 Bone = 0; Bone < PausedPose.Pose.GetNumBones(); ++Bone)
                if (!TestTrue(TEXT("Paused prepared or failed playback keeps every bone stable"),
                    PausedPose.Pose[FCompactPoseBoneIndex(Bone)].Equals(
                        RepeatedPose.Pose[FCompactPoseBoneIndex(Bone)], 1.e-5f))) return false;
        }
        Animator->SetPerformancePaused(false);
        Animator->StartRuntimePerformance(Motion);
        Animator->SeekPerformance(0.f);
        Proxy.PreUpdate(Animator, 0.f);
        if (!TestEqual(TEXT("Restart retains completed preparation identity"), Proxy.IsPreparedMotionReady(), bRequirePrepared) ||
            !TestEqual(TEXT("Restart retains terminal failed preparation without retry"), Proxy.IsPreparedMotionFailed(), bRequirePreparationFailure)) return false;
        if (bRequireStance && !TestTrue(TEXT("Restart retains validated stance"), Proxy.IsStancePrepared())) return false;
    }

    // Prepare forward through the same production clock as playback. Seeking
    // each sample clears solver history and characterizes cold seeks instead of
    // a traversal. Looping passes retain history across the seam; a one-shot must
    // restart once per pass. Only numeric seeds survive the final playback seek.
    TArray<TSharedPtr<FJsonValue>> Preparation;
    const double PreparationStarted = FPlatformTime::Seconds();
    const int32 PreparationIntervals = FMath::CeilToInt(Duration * SampleFps);
    TSet<int32> PreparedClearIndices;
    float PreviousPreparationTime = 0.f;
    if (PreparePasses > 0) Animator->SeekPerformance(0.f);
    for (int32 Pass = 0; Pass < PreparePasses; ++Pass)
    {
        const double PassStarted = FPlatformTime::Seconds();
        int32 PassClear = 0;
        if (Pass > 0 && !Motion->IsLooping())
        {
            Animator->SeekPerformance(0.f);
            PreviousPreparationTime = 0.f;
        }
        for (int32 Step = 0; Step <= PreparationIntervals; ++Step)
        {
            const int32 Index = Step;
            const int32 ClockIndex = Motion->IsLooping() ? Pass * PreparationIntervals + Step : Step;
            const float Time = Duration * (double(ClockIndex) / PreparationIntervals);
            const float Delta = Time - PreviousPreparationTime;
            if (!TestTrue(TEXT("Preparation clock increments respect production .1s clamp"),
                Delta >= 0.f && Delta <= .10001f)) return false;
            Proxy.PreUpdate(Animator, Delta);
            PreviousPreparationTime = Time;
            FPoseContext PreparedPose(&Proxy);
            PreparedPose.ResetToRefPose();
            if (!TestTrue(TEXT("Preparation evaluates through the production proxy"), Proxy.Evaluate(PreparedPose))) return false;
            if (Proxy.GetArmClearance().bFeasible)
            {
                ++PassClear;
                PreparedClearIndices.Add(Index);
            }
        }
        TSharedRef<FJsonObject> Row = MakeShared<FJsonObject>();
        Row->SetNumberField(TEXT("pass"), Pass + 1);
        Row->SetStringField(TEXT("direction"), TEXT("forward"));
        Row->SetNumberField(TEXT("clearSamples"), PassClear);
        Row->SetNumberField(TEXT("sampleCount"), PreparationIntervals + 1);
        Row->SetNumberField(TEXT("unionClearSamples"), PreparedClearIndices.Num());
        Row->SetNumberField(TEXT("seconds"), FPlatformTime::Seconds() - PassStarted);
        Preparation.Add(MakeShared<FJsonValueObject>(Row));
        AddInfo(FString::Printf(TEXT("Preparation pass %d %s: %d/%d clear, union %d; %.3fs"),
            Pass + 1, TEXT("forward"), PassClear,
            PreparationIntervals + 1, PreparedClearIndices.Num(), FPlatformTime::Seconds() - PassStarted));
    }
    const double PreparationSeconds = FPlatformTime::Seconds() - PreparationStarted;
    if (PreparePasses > 0) Animator->SeekPerformance(0.f);

    TArray<TSharedPtr<FJsonValue>> Samples;
    TArray<double> Costs;
    int32 ClearCount = 0, TotalSoftQueries = 0, TotalWarmQueries = 0;
    double WorstResidual = 0;
    float PreviousRequested = 0;
    for (float RequestedSeconds : Requested)
    {
        if (!bCycle) Animator->SeekPerformance(RequestedSeconds);
        const float Delta = bCycle ? RequestedSeconds - PreviousRequested : 0.f;
        if (!TestTrue(TEXT("Sequential clock increments respect production .1s clamp"), Delta >= 0 && Delta <= .10001f))
            return false;
        if (bCarry) Animator->SetActivityPose(EFlowFestBodyActivity::Carry, RequestedSeconds, -1.f);
        if (bCarry)
        {
            TArray<FFlowArtsClearanceCapsule> Local[2];
            FVector Offsets[2];
            if (!TestTrue(TEXT("Visible carry snapshot retains both grips"),
                Prop->SnapshotHandLocalClearanceCapsules(Local[0], Local[1], Offsets) &&
                Local[0].Num() == CarryExpected[0].Num() && Local[1].Num() == CarryExpected[1].Num())) return false;
            for (int32 Side = 0; Side < 2; ++Side)
            {
                const FTransform HandWorld = Body->GetSocketTransform(
                    Side == 0 ? TEXT("LeftHand") : TEXT("RightHand"), RTS_World);
                const FTransform Rendered = CarryMeshes[Side]->GetComponentTransform();
                for (int32 Index = 0; Index < Local[Side].Num(); ++Index)
                {
                    const auto& Expected = CarryExpected[Side][Index];
                    const auto& Snapshot = Local[Side][Index];
                    const FVector Grip = HandWorld.TransformPosition(Offsets[Side]);
                    const FVector Start = Grip + HandWorld.GetRotation().RotateVector(Snapshot.Start);
                    const FVector End = Grip + HandWorld.GetRotation().RotateVector(Snapshot.End);
                    if (!TestTrue(TEXT("Hand-local snapshot endpoints match rendered mesh-local geometry, including mirrored props"),
                        FVector::Distance(Start, Rendered.TransformPosition(Expected.Start)) < .01 &&
                        FVector::Distance(End, Rendered.TransformPosition(Expected.End)) < .01) ||
                        !TestTrue(TEXT("Hand-local snapshot radius retains rendered absolute centimeter scale"),
                        FMath::Abs(Snapshot.RadiusCm - Expected.RadiusCm * Rendered.GetScale3D().GetAbsMax()) < .01)) return false;
                }
            }
        }
        Proxy.PreUpdate(Animator, Delta);
        PreviousRequested = RequestedSeconds;
        const float Seconds = bCarry ? Animator->GetMotionTime(TEXT("Walk")) : Animator->GetPerformanceTime();
        FPoseContext Pose(&Proxy);
        Pose.ResetToRefPose();
        const double Started = FPlatformTime::Seconds();
        if (!TestTrue(TEXT("Production animation proxy evaluates"), Proxy.Evaluate(Pose))) return false;
        if (!bCarry && !TestTrue(TEXT("Evaluated pose exposes its actual calibrated palm offsets"),
            Proxy.GetEvaluatedPalmLocalOffsets(PalmLocal))) return false;
        const double EvaluationUs = (FPlatformTime::Seconds() - Started) * 1000000.;
        const FFlowArtsArmClearanceResult& Result = Proxy.GetArmClearance();
        if (bRequirePrepared &&
            (!TestTrue(TEXT("Prepared playback applies its admitted seed after seek or advance"), Proxy.WasPreparedSeedApplied()) ||
             !TestTrue(TEXT("Prepared playback freshly certifies the actual solved pose"), Result.SkinnedQueryCount > 0) ||
             !TestTrue(TEXT("Known feasible prepared playback remains clear"), Result.bFeasible))) return false;
        if (bRequirePreparationFailure &&
            (!TestTrue(TEXT("Seek retains terminal preparation failure"), Proxy.IsPreparedMotionFailed()) ||
             !TestFalse(TEXT("Failed preparation never applies a seed"), Proxy.WasPreparedSeedApplied()))) return false;
        bool PropVisible[2] = {true, true};
        if (!bCarry && !TestTrue(TEXT("Score visibility samples at evaluated clock"),
            Motion->SamplePropVisibility(Seconds, PropVisible))) return false;
        if (!bCarry && !TestTrue(TEXT("Production captured-grip/shared-plane clearance path is active"),
            Result.bMeasuredSurface && Result.bSharedTranslationAllowed)) return false;
        FVector Captured[2], AuthoredGrips[2], SourcePalms[2];
        const bool bDynamicGrip = !bCarry && Motion->HasDynamicGrip();
        if (bDynamicGrip && !TestTrue(TEXT("Independent captured hand and socket oracle samples"),
            Motion->SampleSourcePalms(Seconds, SourcePalms[0], SourcePalms[1]))) return false;
        if (!bCarry && !TestTrue(TEXT("Source wrists and visible grips sample at evaluated clock"),
            Prop->SampleCapturedWrists(Motion->GetProfile(), Seconds, Captured[0], Captured[1]) &&
            Prop->SampleVisibleGrips(Motion->GetProfile(), Seconds, AuthoredGrips[0], AuthoredGrips[1]))) return false;
        FCSPose<FCompactPose> ComponentPose;
        ComponentPose.InitPose(Pose.Pose);
        // Publish the same evaluated pose that rendering/socket consumers receive.
        // The animation is not evaluated again and no world tick occurs.
        auto& ComponentFrames = Body->GetEditableComponentSpaceTransforms();
        for (int32 MeshIndex = 0; MeshIndex < Mesh->GetRefSkeleton().GetNum(); ++MeshIndex)
        {
            const int32 SkeletonIndex = Reference.FindBoneIndex(Mesh->GetRefSkeleton().GetBoneName(MeshIndex));
            const FCompactPoseBoneIndex Compact = Bones.GetCompactPoseIndexFromSkeletonIndex(SkeletonIndex);
            if (Compact.GetInt() != INDEX_NONE) ComponentFrames[MeshIndex] = ComponentPose.GetComponentSpaceTransform(Compact);
        }
        Body->UpdateChildTransforms();
        if (!bCarry && !TestTrue(TEXT("Rendered props consume the same evaluated pose and clock"),
            Prop->SetPerformanceTime(Seconds, Animator->GetPerformanceWeight(), Animator,
                Result.SharedPerformanceTranslationCm))) return false;
        double GripError = 0, SourceWristDeviationCm = 0, SourcePalmDeviationCm = 0;
        double SourceSocketCorrectionResidualCm = 0;
        double SourceSocketSideDisplacementCm[2] = {0, 0};
        double DeclaredHandCorrectionErrorCm = 0;
        FVector SolvedPalms[2] = {FVector::ZeroVector, FVector::ZeroVector};
        bool bRenderedCapsulesMatch = true;
        double MaxRenderedCapsuleErrorCm = 0, CapsuleStartErrorCm = 0, CapsuleEndErrorCm = 0, CapsuleRadiusErrorCm = 0;
        int32 CapsuleErrorSide = INDEX_NONE, CapsuleErrorIndex = INDEX_NONE;
        const FTransform MeshWorld = Body->GetComponentTransform();
        for (int32 Side = 0; !bCarry && Side < 2; ++Side)
        {
            const FTransform Hand = ComponentPose.GetComponentSpaceTransform(Hands[Side]);
            const FVector PalmWorld = MeshWorld.TransformPosition(Hand.TransformPosition(PalmLocal[Side]));
            SolvedPalms[Side] = PalmWorld;
            const FVector RenderedGrip = Prop->GetPropRootTransform(Side == 0).GetLocation();
            if (PropVisible[Side])
                GripError = FMath::Max(GripError, FVector::Distance(PalmWorld, RenderedGrip));
            SourceWristDeviationCm = FMath::Max(SourceWristDeviationCm,
                FVector::Distance(MeshWorld.TransformPosition(Hand.GetLocation()), Captured[Side]));
            if (PropVisible[Side])
                SourcePalmDeviationCm = FMath::Max(SourcePalmDeviationCm, FVector::Distance(PalmWorld, AuthoredGrips[Side]));
            if (bDynamicGrip && PropVisible[Side])
            {
                const FVector SourceAfterCommon = SourcePalms[Side] +
                    MeshWorld.TransformVector(Result.SharedPerformanceTranslationCm);
                SourceSocketSideDisplacementCm[Side] = FVector::Distance(PalmWorld, SourceAfterCommon);
                SourceSocketCorrectionResidualCm = FMath::Max(SourceSocketCorrectionResidualCm,
                    SourceSocketSideDisplacementCm[Side]);
                DeclaredHandCorrectionErrorCm = FMath::Max(DeclaredHandCorrectionErrorCm,
                    FVector::Distance(PalmWorld, SourceAfterCommon +
                        MeshWorld.TransformVector(Result.AppliedHandTranslationCm[Side])));
            }
            if (!TestEqual(TEXT("Certified prop capsule count matches independent imported metadata"),
                Result.OriginalHeldPropCapsules[Side].Num(), PropVisible[Side] ? CarryExpected[Side].Num() : 0)) return false;
            if (!TestEqual(TEXT("Rendered prop presence matches score at the evaluated clock"),
                CarryMeshes[Side]->IsVisible(), PropVisible[Side])) return false;
            if (!PropVisible[Side]) continue;
            const FTransform PropWorld = CarryMeshes[Side]->GetComponentTransform();
            for (int32 Index = 0; Index < CarryExpected[Side].Num(); ++Index)
            {
                const auto& Certified = Result.OriginalHeldPropCapsules[Side][Index];
                const auto& Local = CarryExpected[Side][Index];
                const FVector CertifiedTranslation = Result.SharedPerformanceTranslationCm + Result.AppliedHandTranslationCm[Side];
                const FVector Start = MeshWorld.TransformPosition(Certified.Start + CertifiedTranslation);
                const FVector End = MeshWorld.TransformPosition(Certified.End + CertifiedTranslation);
                const float Radius = Certified.RadiusCm * MeshWorld.GetScale3D().GetAbsMax();
                const FVector RenderedStart = PropWorld.TransformPosition(Local.Start);
                const FVector RenderedEnd = PropWorld.TransformPosition(Local.End);
                const double StartError = FVector::Distance(Start, RenderedStart);
                const double EndError = FVector::Distance(End, RenderedEnd);
                const double RadiusError = FMath::Abs(Radius - Local.RadiusCm * PropWorld.GetScale3D().GetAbsMax());
                bRenderedCapsulesMatch &= Start.Equals(RenderedStart, .02f) &&
                    End.Equals(RenderedEnd, .02f) && RadiusError < .02f;
                const double CapsuleError = FMath::Max3(StartError, EndError, RadiusError);
                if (CapsuleError > MaxRenderedCapsuleErrorCm)
                {
                    MaxRenderedCapsuleErrorCm = CapsuleError;
                    CapsuleErrorSide = Side;
                    CapsuleErrorIndex = Index;
                    CapsuleStartErrorCm = StartError;
                    CapsuleEndErrorCm = EndError;
                    CapsuleRadiusErrorCm = RadiusError;
                }
            }
        }
        if (!bCarry)
        {
            TestTrue(TEXT("Final evaluated calibrated palms remain within 2mm of actual rendered grips"),
                FMath::IsFinite(GripError) && GripError <= .2);
            if (bDynamicGrip)
            {
                // Keep the true source displacement visible. A deliberate hand
                // correction is not subtracted from this fidelity measurement.
                TestTrue(TEXT("Independent source sockets stay within the reported avoidance budget plus numerical tolerance"),
                    FMath::IsFinite(SourceSocketCorrectionResidualCm) && SourceSocketCorrectionResidualCm <= Result.HandCorrectionLimitCm + .02);
                TestTrue(TEXT("Published hand corrections explain the independently measured source displacement within 2mm"),
                    FMath::IsFinite(DeclaredHandCorrectionErrorCm) && DeclaredHandCorrectionErrorCm <= .2);
            }
            TestTrue(FString::Printf(TEXT("Final rendered capsules match solver geometry at %.6fs; side %d capsule %d: start %.6fcm end %.6fcm radius %.6fcm"),
                RequestedSeconds, CapsuleErrorSide, CapsuleErrorIndex, CapsuleStartErrorCm, CapsuleEndErrorCm, CapsuleRadiusErrorCm),
                bRenderedCapsulesMatch);
        }
        else
        {
            if (!TestTrue(TEXT("Carry uses measured soft-wrist clearance without performance translation"),
                Result.bMeasuredSurface && !Result.bSharedTranslationAllowed && !Animator->IsPerforming())) return false;
            if (RequestedSeconds >= .6f && !TestTrue(TEXT("Settled carry guards include both actual held props"),
                !Result.OriginalHeldPropCapsules[0].IsEmpty() && !Result.OriginalHeldPropCapsules[1].IsEmpty())) return false;
            for (int32 Side = 0; Side < 2; ++Side)
            {
                if (!TestEqual(TEXT("Carry retains every authoritative production guard capsule"),
                    Result.OriginalHeldPropCapsules[Side].Num(), CarryExpected[Side].Num())) return false;
                for (int32 Index = 0; Index < CarryExpected[Side].Num(); ++Index)
                {
                    const auto& Capsule = Result.OriginalHeldPropCapsules[Side][Index];
                    const auto& Expected = CarryExpected[Side][Index];
                    const FTransform PropWorld = CarryMeshes[Side]->GetComponentTransform();
                    const double Length = FVector::Distance(MeshWorld.TransformPosition(Capsule.Start), MeshWorld.TransformPosition(Capsule.End));
                    const double ExpectedLength = FVector::Distance(PropWorld.TransformPosition(Expected.Start), PropWorld.TransformPosition(Expected.End));
                    const double Radius = Capsule.RadiusCm * MeshWorld.GetScale3D().GetAbsMax();
                    if (!TestTrue(TEXT("Current-pose capsule retains actual prop world length across normalized rigs"),
                        FMath::Abs(Length - ExpectedLength) < .01) ||
                        !TestTrue(TEXT("Current-pose capsule retains actual prop world radius across normalized rigs"),
                        FMath::Abs(Radius - Expected.RadiusCm * PropWorld.GetScale3D().GetAbsMax()) < .01)) return false;
                }
            }
        }
        TestTrue(TEXT("Finite geometry result and bounded common correction"),
            FMath::IsFinite(Result.WorstPenetrationCm) && Result.SharedPerformanceTranslationCm.Size() <= 35.001);
        for (int32 Side = 0; Side < 2; ++Side)
            TestTrue(TEXT("Each published independent hand correction is finite and bounded to the reported physical correction limit"),
                !Result.AppliedHandTranslationCm[Side].ContainsNaN() &&
                FMath::IsFinite(Result.HandCorrectionLimitCm) && Result.HandCorrectionLimitCm >= 0 &&
                MeshWorld.TransformVector(Result.AppliedHandTranslationCm[Side]).Size() <= Result.HandCorrectionLimitCm + .0001);
        if (bRequireClear) TestTrue(FString::Printf(
            TEXT("Required clear replay sample %.6fs (residual %.6fcm kind %d segment %d arm %d)"),
            RequestedSeconds, Result.WorstPenetrationCm, Result.WorstObstacleKind,
            Result.WorstSegment, Result.WorstArm), Result.bFeasible);
        ClearCount += Result.bFeasible ? 1 : 0;
        TotalSoftQueries += Result.SoftRefinementQueryCount;
        TotalWarmQueries += Result.WarmRefinementQueryCount;
        WorstResidual = FMath::Max(WorstResidual, double(Result.WorstPenetrationCm));
        Costs.Add(EvaluationUs);
        TSharedRef<FJsonObject> Row = MakeShared<FJsonObject>();
        Row->SetNumberField(TEXT("requestedSeconds"), RequestedSeconds);
        Row->SetNumberField(TEXT("sourceSeconds"), Seconds);
        Row->SetBoolField(TEXT("feasible"), Result.bFeasible);
        Row->SetNumberField(TEXT("residualCm"), Result.WorstPenetrationCm);
        Row->SetNumberField(TEXT("actualPalmGripErrorCm"), GripError);
        Row->SetNumberField(TEXT("sourceWristDeviationCm"), SourceWristDeviationCm);
        Row->SetNumberField(TEXT("sourcePalmDeviationCm"), SourcePalmDeviationCm);
        Row->SetNumberField(TEXT("sourceSocketCorrectionResidualCm"), SourceSocketCorrectionResidualCm);
        Row->SetNumberField(TEXT("leftSourceSocketDisplacementCm"), SourceSocketSideDisplacementCm[0]);
        Row->SetNumberField(TEXT("rightSourceSocketDisplacementCm"), SourceSocketSideDisplacementCm[1]);
        Row->SetNumberField(TEXT("declaredHandCorrectionErrorCm"), DeclaredHandCorrectionErrorCm);
        Row->SetNumberField(TEXT("perHandCorrectionLimitCm"), Result.HandCorrectionLimitCm);
        Row->SetNumberField(TEXT("handAvoidanceExactQueries"), Result.HandAvoidanceExactQueries);
        Row->SetArrayField(TEXT("leftHandCorrectionCm"), ReplayVector(Result.AppliedHandTranslationCm[0]));
        Row->SetArrayField(TEXT("rightHandCorrectionCm"), ReplayVector(Result.AppliedHandTranslationCm[1]));
        Row->SetArrayField(TEXT("leftHandCorrectionWorldCm"), ReplayVector(MeshWorld.TransformVector(Result.AppliedHandTranslationCm[0])));
        Row->SetArrayField(TEXT("rightHandCorrectionWorldCm"), ReplayVector(MeshWorld.TransformVector(Result.AppliedHandTranslationCm[1])));
        Row->SetNumberField(TEXT("sourceSocketPairVectorErrorCm"), bDynamicGrip ?
            ((SolvedPalms[1] - SolvedPalms[0]) - (SourcePalms[1] - SourcePalms[0])).Size() : 0.0);
        Row->SetBoolField(TEXT("leftPropVisible"), PropVisible[0]);
        Row->SetBoolField(TEXT("rightPropVisible"), PropVisible[1]);
        Row->SetNumberField(TEXT("sourceGripPairVectorErrorCm"), bCarry ? 0.0 :
            ((SolvedPalms[1] - SolvedPalms[0]) - (AuthoredGrips[1] - AuthoredGrips[0])).Size());
        Row->SetNumberField(TEXT("maxRenderedCapsuleErrorCm"), MaxRenderedCapsuleErrorCm);
        Row->SetNumberField(TEXT("capsuleErrorSide"), CapsuleErrorSide);
        Row->SetNumberField(TEXT("capsuleErrorIndex"), CapsuleErrorIndex);
        Row->SetNumberField(TEXT("capsuleStartErrorCm"), CapsuleStartErrorCm);
        Row->SetNumberField(TEXT("capsuleEndErrorCm"), CapsuleEndErrorCm);
        Row->SetNumberField(TEXT("capsuleRadiusErrorCm"), CapsuleRadiusErrorCm);
        Row->SetNumberField(TEXT("solveMicroseconds"), Result.SolveMicroseconds);
        Row->SetNumberField(TEXT("evaluationMicroseconds"), EvaluationUs);
        Row->SetNumberField(TEXT("queries"), Result.SkinnedQueryCount);
        Row->SetNumberField(TEXT("rejectedGuideQueries"), Result.RejectedGuideQueryCount);
        Row->SetNumberField(TEXT("softRefinementQueries"), Result.SoftRefinementQueryCount);
        Row->SetNumberField(TEXT("warmRefinementQueries"), Result.WarmRefinementQueryCount);
        Row->SetNumberField(TEXT("preparedSeedQueries"), Result.PreparedSeedQueryCount);
        Row->SetNumberField(TEXT("skinnedSkipReasons"), Result.SkinnedSkipReasons);
        Row->SetNumberField(TEXT("bestOtherObstacleCm"), Result.SkinnedBestOtherObstacleCm);
        Row->SetBoolField(TEXT("skinnedCallbackAvailable"), Result.bSkinnedCallbackAvailable);
        Row->SetBoolField(TEXT("preserveWrist"), !bCarry);
        Row->SetBoolField(TEXT("sharedTranslationAllowed"), Result.bSharedTranslationAllowed);
        Row->SetNumberField(TEXT("walkWeight"), bCarry ? Animator->GetMotionWeight(TEXT("Walk")) : 0.f);
        Row->SetNumberField(TEXT("upperMask"), Result.SkinnedUpperTorsoClearMask);
        Row->SetNumberField(TEXT("forearmBodyMask"), Result.ForearmBodyClearMask);
        Row->SetNumberField(TEXT("forearmHeadMask"), Result.ForearmHeadClearMask);
        Row->SetNumberField(TEXT("oppositePropMask"), Result.SkinnedOppositePropClearMask);
        Row->SetNumberField(TEXT("heldPropBodyMask"), Result.SkinnedHeldPropBodyClearMask);
        Row->SetBoolField(TEXT("pairClear"), Result.bSkinnedArmPairClear);
        Row->SetNumberField(TEXT("kind"), Result.WorstObstacleKind);
        Row->SetNumberField(TEXT("obstacleIndex"), Result.WorstObstacleIndex);
        // Residual is a conservative proxy depth. A missing/rejected verdict
        // alone cannot distinguish a skin crossing from padding proximity.
        Row->SetStringField(TEXT("geometryVerdict"), Result.bFeasible ? TEXT("validated-clear") :
            Result.SkinnedQueryCount == 0 ? TEXT("unqueried-proxy-contact") : TEXT("not-certified-clear"));
        Row->SetNumberField(TEXT("segment"), Result.WorstSegment);
        Row->SetNumberField(TEXT("arm"), Result.WorstArm);
        Row->SetArrayField(TEXT("sharedComponentCm"), ReplayVector(Result.SharedPerformanceTranslationCm));
        Row->SetArrayField(TEXT("sharedWorldCm"), ReplayVector(MeshWorld.TransformVector(Result.SharedPerformanceTranslationCm)));
        TArray<TSharedPtr<FJsonValue>> TorsoCorrection;
        for (double Value : {Result.TorsoRotation.X, Result.TorsoRotation.Y,
            Result.TorsoRotation.Z, Result.TorsoRotation.W})
            TorsoCorrection.Add(MakeShared<FJsonValueNumber>(Value));
        Row->SetArrayField(TEXT("torsoCorrectionQuaternion"), TorsoCorrection);
        Row->SetNumberField(TEXT("leftClavicleCorrectionDegrees"), Result.ClavicleProtractionDeg[0]);
        Row->SetNumberField(TEXT("rightClavicleCorrectionDegrees"), Result.ClavicleProtractionDeg[1]);
        Row->SetNumberField(TEXT("leftPropCapsules"), Result.OriginalHeldPropCapsules[0].Num());
        Row->SetNumberField(TEXT("rightPropCapsules"), Result.OriginalHeldPropCapsules[1].Num());
        TArray<TSharedPtr<FJsonValue>> PropInputs;
        for (int32 Side = 0; Side < 2; ++Side)
        {
            TArray<TSharedPtr<FJsonValue>> Capsules;
            for (const FFlowArtsClearanceCapsule& Capsule : Result.OriginalHeldPropCapsules[Side])
            {
                TSharedRef<FJsonObject> Entry = MakeShared<FJsonObject>();
                Entry->SetArrayField(TEXT("start"), ReplayVector(Capsule.Start));
                Entry->SetArrayField(TEXT("end"), ReplayVector(Capsule.End));
                Entry->SetNumberField(TEXT("radiusCm"), Capsule.RadiusCm);
                Capsules.Add(MakeShared<FJsonValueObject>(Entry));
            }
            PropInputs.Add(MakeShared<FJsonValueArray>(Capsules));
        }
        Row->SetArrayField(TEXT("originalHeldPropCapsules"), PropInputs);
        // Same performer-relative convention as the game's pose evidence.
        // This exposes final-pose disagreement without reconstructing the solver.
        TSharedRef<FJsonObject> FinalBones = MakeShared<FJsonObject>();
        for (const FCompactPoseBoneIndex Index : Pose.Pose.ForEachBoneIndex())
        {
            const FTransform Transform = ComponentPose.GetComponentSpaceTransform(Index) * Body->GetRelativeTransform();
            const FVector P = Transform.GetLocation(), S = Transform.GetScale3D();
            const FQuat Q = Transform.GetRotation();
            TArray<TSharedPtr<FJsonValue>> Values;
            for (double Value : {P.X, P.Y, P.Z, Q.X, Q.Y, Q.Z, Q.W, S.X, S.Y, S.Z})
                Values.Add(MakeShared<FJsonValueNumber>(Value));
            FinalBones->SetArrayField(Reference.GetBoneName(Bones.GetSkeletonIndex(Index)).ToString(), Values);
        }
        Row->SetObjectField(TEXT("bones"), FinalBones);
        Samples.Add(MakeShared<FJsonValueObject>(Row));
        AddInfo(FString::Printf(TEXT("Replay %.6fs feasible=%d residual=%.6fcm kind=%d segment=%d arm=%d upper=%u pair=%d queries=%d solve=%.3fms eval=%.3fms soft=%d warm=%d skip=%u"),
            Seconds, Result.bFeasible, Result.WorstPenetrationCm, Result.WorstObstacleKind, Result.WorstSegment,
            Result.WorstArm, Result.SkinnedUpperTorsoClearMask, Result.bSkinnedArmPairClear,
            Result.SkinnedQueryCount, Result.SolveMicroseconds / 1000., EvaluationUs / 1000.,
            Result.SoftRefinementQueryCount, Result.WarmRefinementQueryCount, Result.SkinnedSkipReasons));
    }
    Costs.Sort();
    TSharedRef<FJsonObject> Report = MakeShared<FJsonObject>();
    Report->SetNumberField(TEXT("schemaVersion"), 1);
    Report->SetStringField(TEXT("motionPath"), bCarry ? TEXT("") : FPaths::ConvertRelativePathToFull(MotionPath));
    Report->SetStringField(TEXT("characterId"), CharacterId);
    Report->SetStringField(TEXT("sequenceSHA256"), bCarry ? TEXT("") : Motion->GetSequenceSHA256());
    Report->SetStringField(TEXT("activity"), bCarry ? TEXT("carry") : TEXT(""));
    Report->SetNumberField(TEXT("authoredWalkSpeedCmPerSecond"), bCarry ? 184.f : 0.f);
    Report->SetStringField(TEXT("rigSHA256"), RigHash);
    Report->SetStringField(TEXT("propId"), PropId);
    Report->SetStringField(TEXT("mode"), bCarry ? TEXT("sequential-production-carry-walk") : bCycle ? TEXT("sequential-production-clock") : TEXT("independent-seeks"));
    Report->SetNumberField(TEXT("durationSeconds"), Duration);
    Report->SetNumberField(TEXT("sampleFps"), SampleFps);
    Report->SetNumberField(TEXT("loops"), bCycle ? LoopCount : 0);
    Report->SetNumberField(TEXT("preparationPasses"), PreparePasses);
    Report->SetNumberField(TEXT("preparationSeconds"), PreparationSeconds);
    Report->SetBoolField(TEXT("requirePrepared"), bRequirePrepared);
    Report->SetBoolField(TEXT("requirePreparationFailure"), bRequirePreparationFailure);
    Report->SetBoolField(TEXT("preparedReady"), Proxy.IsPreparedMotionReady());
    Report->SetNumberField(TEXT("asyncPreparationSeconds"), AsyncPreparationSeconds);
    Report->SetArrayField(TEXT("preparation"), Preparation);
    Report->SetBoolField(TEXT("requireClear"), bRequireClear);
    Report->SetBoolField(TEXT("authoritativePropCapsules"), bAuthoritativeCapsules);
    Report->SetNumberField(TEXT("clearSamples"), ClearCount);
    Report->SetNumberField(TEXT("softRefinementQueries"), TotalSoftQueries);
    Report->SetNumberField(TEXT("warmRefinementQueries"), TotalWarmQueries);
    Report->SetNumberField(TEXT("sampleCount"), Samples.Num());
    Report->SetNumberField(TEXT("worstResidualCm"), WorstResidual);
    Report->SetNumberField(TEXT("evaluationP50Microseconds"), Costs[Costs.Num() / 2]);
    Report->SetNumberField(TEXT("evaluationP95Microseconds"), Costs[FMath::Min(Costs.Num() - 1, FMath::CeilToInt(Costs.Num() * .95) - 1)]);
    Report->SetArrayField(TEXT("samples"), Samples);
    CompletedReport = Report;
    AddInfo(FString::Printf(TEXT("Replay complete: %d/%d feasible; worst %.6fcm; evaluation p50 %.3fms p95 %.3fms. Geometry is reported, not waived."),
        ClearCount, Samples.Num(), WorstResidual, Costs[Costs.Num() / 2] / 1000.,
        Costs[FMath::Min(Costs.Num() - 1, FMath::CeilToInt(Costs.Num() * .95) - 1)] / 1000.));
    if (!OutputPath.IsEmpty())
    {
        FString Json;
        FJsonSerializer::Serialize(Report, TJsonWriterFactory<>::Create(&Json));
        IFileManager::Get().MakeDirectory(*FPaths::GetPath(FPaths::ConvertRelativePathToFull(OutputPath)), true);
        TestTrue(TEXT("Replay JSON evidence saves"), FFileHelper::SaveStringToFile(Json, *OutputPath,
            FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM));
    }
    if (bRequireClear) TestEqual(TEXT("Every requested replay sample must be geometrically feasible"), ClearCount, Samples.Num());
    FAutomationTestExecutionInfo After;
    GetExecutionInfo(After);
    return After.GetErrorTotal() == Before.GetErrorTotal();
    };

    FString FixtureDirectory;
    if (FParse::Value(FCommandLine::Get(), TEXT("FlowArtsReplayFixtureDirectory="), FixtureDirectory))
    {
        FString OutputPath, Activity, SingleMotion;
        FParse::Value(FCommandLine::Get(), TEXT("FlowArtsReplayOutput="), OutputPath);
        if (OutputPath.IsEmpty() ||
            FParse::Value(FCommandLine::Get(), TEXT("FlowArtsReplayActivity="), Activity) ||
            FParse::Value(FCommandLine::Get(), TEXT("FlowArtsReplayMotion="), SingleMotion) ||
            FParse::Param(FCommandLine::Get(), TEXT("FlowArtsReplayAllCharacters")))
        {
            AddError(TEXT("Fixture replay requires a summary output path and cannot combine with single motion, activity, or all-character carry mode"));
            return false;
        }
        TArray<FString> Files;
        FixtureDirectory = FPaths::ConvertRelativePathToFull(FixtureDirectory);
        IFileManager::Get().FindFiles(Files, *(FixtureDirectory / TEXT("*.motion.json")), true, false);
        Files.Sort();
        if (!TestTrue(TEXT("Fixture replay directory contains 1..128 top-level motion files"),
            Files.Num() > 0 && Files.Num() <= 128)) return false;
        TArray<TSharedPtr<FJsonValue>> Results;
        TSet<FString> Characters;
        int32 Passed = 0;
        for (const FString& File : Files)
        {
            const FString MotionPath = FixtureDirectory / File;
            const FString FixtureOutput = FPaths::GetPath(OutputPath) /
                (FPaths::GetBaseFilename(OutputPath) + TEXT("-") + FPaths::GetBaseFilename(File) + TEXT(".json"));
            FString Source, Character;
            TSharedPtr<FJsonObject> Payload, Report;
            bool bPassed = false;
            if (!FFileHelper::LoadFileToString(Source, *MotionPath) ||
                !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Source), Payload) ||
                !Payload || !Payload->TryGetStringField(TEXT("characterId"), Character) || Character.IsEmpty())
                AddError(FString::Printf(TEXT("Fixture has no readable motion character identity: %s"), *MotionPath));
            else
            {
                Characters.Add(Character);
                AddInfo(FString::Printf(TEXT("Replaying fixture %s on %s"), *File, *Character));
                // LoadFromFile still validates the complete payload and trusted
                // rig identity before any production pose is evaluated.
                bPassed = RunCharacter(Character, FixtureOutput, MotionPath, Report);
            }
            Passed += bPassed ? 1 : 0;
            TSharedRef<FJsonObject> Row = MakeShared<FJsonObject>();
            Row->SetStringField(TEXT("motionPath"), MotionPath);
            Row->SetStringField(TEXT("characterId"), Character);
            Row->SetBoolField(TEXT("passed"), bPassed);
            Row->SetBoolField(TEXT("completed"), Report.IsValid());
            Row->SetStringField(TEXT("reportPath"), FPaths::ConvertRelativePathToFull(FixtureOutput));
            if (Report)
            {
                Row->SetStringField(TEXT("propId"), Report->GetStringField(TEXT("propId")));
                for (const TCHAR* Field : {TEXT("clearSamples"), TEXT("sampleCount"), TEXT("worstResidualCm"),
                    TEXT("evaluationP50Microseconds"), TEXT("evaluationP95Microseconds")})
                    Row->SetNumberField(Field, Report->GetNumberField(Field));
            }
            Results.Add(MakeShared<FJsonValueObject>(Row));
        }
        TSharedRef<FJsonObject> Summary = MakeShared<FJsonObject>();
        Summary->SetNumberField(TEXT("schemaVersion"), 1);
        Summary->SetStringField(TEXT("fixtureDirectory"), FixtureDirectory);
        Summary->SetBoolField(TEXT("requireClear"), FParse::Param(FCommandLine::Get(), TEXT("FlowArtsReplayRequireClear")));
        Summary->SetNumberField(TEXT("fixtureCount"), Files.Num());
        Summary->SetNumberField(TEXT("characterCount"), Characters.Num());
        Summary->SetNumberField(TEXT("passedFixtures"), Passed);
        Summary->SetArrayField(TEXT("fixtures"), Results);
        FString Json;
        FJsonSerializer::Serialize(Summary, TJsonWriterFactory<>::Create(&Json));
        IFileManager::Get().MakeDirectory(*FPaths::GetPath(FPaths::ConvertRelativePathToFull(OutputPath)), true);
        TestTrue(TEXT("Fixture replay summary saves"), FFileHelper::SaveStringToFile(Json, *OutputPath,
            FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM));
        AddInfo(FString::Printf(TEXT("Fixture replay: %d/%d motions passed across %d characters; summary %s"),
            Passed, Files.Num(), Characters.Num(), *OutputPath));
        return Passed == Files.Num() && !HasAnyErrors();
    }
    if (!FParse::Param(FCommandLine::Get(), TEXT("FlowArtsReplayAllCharacters")))
    {
        TSharedPtr<FJsonObject> Report;
        return RunCharacter(FString(), FString(), FString(), Report) && !HasAnyErrors();
    }
    FString Activity, OutputPath, CatalogText;
    FParse::Value(FCommandLine::Get(), TEXT("FlowArtsReplayActivity="), Activity);
    FParse::Value(FCommandLine::Get(), TEXT("FlowArtsReplayOutput="), OutputPath);
    if (!Activity.Equals(TEXT("carry"), ESearchCase::IgnoreCase) || OutputPath.IsEmpty())
    {
        AddError(TEXT("All-character replay requires -FlowArtsReplayActivity=carry and -FlowArtsReplayOutput=<summary.json>"));
        return false;
    }
    TSharedPtr<FJsonObject> Catalog;
    const TSharedPtr<FJsonObject>* Rigs = nullptr;
    if (!FFileHelper::LoadFileToString(CatalogText, *(FPaths::ProjectContentDir() / TEXT("Data/runtime-rigs.json"))) ||
        !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(CatalogText), Catalog) || !Catalog ||
        !Catalog->TryGetObjectField(TEXT("rigs"), Rigs) || !Rigs || (*Rigs)->Values.IsEmpty())
    {
        AddError(TEXT("All-character replay requires a nonempty installed runtime-rigs catalog"));
        return false;
    }
    TArray<FString> Characters;
    for (const auto& Entry : (*Rigs)->Values) Characters.Add(FString(Entry.Key));
    Characters.Sort();
    TArray<TSharedPtr<FJsonValue>> Results;
    int32 Passed = 0;
    for (const FString& Character : Characters)
    {
        const FString RigOutput = FPaths::GetPath(OutputPath) /
            (FPaths::GetBaseFilename(OutputPath) + TEXT("-") + Character + TEXT(".json"));
        TSharedPtr<FJsonObject> Report;
        const bool bPassed = RunCharacter(Character, RigOutput, FString(), Report);
        Passed += bPassed ? 1 : 0;
        TSharedRef<FJsonObject> Row = MakeShared<FJsonObject>();
        Row->SetStringField(TEXT("characterId"), Character);
        Row->SetBoolField(TEXT("passed"), bPassed);
        Row->SetBoolField(TEXT("completed"), Report.IsValid());
        Row->SetStringField(TEXT("reportPath"), FPaths::ConvertRelativePathToFull(RigOutput));
        if (Report)
        {
            for (const TCHAR* Field : {TEXT("clearSamples"), TEXT("sampleCount"), TEXT("worstResidualCm"),
                TEXT("evaluationP50Microseconds"), TEXT("evaluationP95Microseconds")})
                Row->SetNumberField(Field, Report->GetNumberField(Field));
        }
        Results.Add(MakeShared<FJsonValueObject>(Row));
    }
    TSharedRef<FJsonObject> Summary = MakeShared<FJsonObject>();
    Summary->SetNumberField(TEXT("schemaVersion"), 1);
    Summary->SetStringField(TEXT("activity"), TEXT("carry"));
    Summary->SetBoolField(TEXT("requireClear"), FParse::Param(FCommandLine::Get(), TEXT("FlowArtsReplayRequireClear")));
    Summary->SetNumberField(TEXT("characterCount"), Characters.Num());
    Summary->SetNumberField(TEXT("passedCharacters"), Passed);
    Summary->SetArrayField(TEXT("characters"), Results);
    FString Json;
    FJsonSerializer::Serialize(Summary, TJsonWriterFactory<>::Create(&Json));
    IFileManager::Get().MakeDirectory(*FPaths::GetPath(FPaths::ConvertRelativePathToFull(OutputPath)), true);
    TestTrue(TEXT("All-character replay summary saves"), FFileHelper::SaveStringToFile(Json, *OutputPath,
        FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM));
    AddInfo(FString::Printf(TEXT("All-character carry replay: %d/%d rigs passed; summary %s"),
        Passed, Characters.Num(), *OutputPath));
    return Passed == Characters.Num() && !HasAnyErrors();
}
#endif
