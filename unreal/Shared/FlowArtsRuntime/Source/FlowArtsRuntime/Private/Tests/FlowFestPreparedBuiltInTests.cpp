#if WITH_DEV_AUTOMATION_TESTS
#include "FlowFestAnimInstance.h"
#include "FlowFestPropComponent.h"
#include "FlowFestStancePlan.h"
#include "FlowArtsArmClearance.h"
#include "Animation/AnimNodeBase.h"
#include "Animation/AnimSequence.h"
#include "Animation/AnimData/IAnimationDataModel.h"
#include "Animation/Skeleton.h"
#include "BoneContainer.h"
#include "BonePose.h"
#include "Components/SceneComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/BoxComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "Misc/AutomationTest.h"
#include "Misc/MemStack.h"
#include "UObject/UObjectGlobals.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestPreparedBuiltInRequestTest,
    "FlowArts.Runtime.PreparedBuiltInRequest",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowFestPreparedBuiltInRequestTest::RunTest(const FString& Parameters)
{
    const FString Folder = TEXT("/Game/FlowFest/Characters/x_bot");
    USkeletalMesh* Mesh = LoadObject<USkeletalMesh>(nullptr,
        TEXT("/Game/FlowFest/Characters/x_bot/SK_x_bot.SK_x_bot"));
    UAnimSequence* Clip = LoadObject<UAnimSequence>(nullptr,
        TEXT("/Game/FlowFest/Characters/x_bot/A_Flow_P_staff_A.A_Flow_P_staff_A"));
    if (!TestTrue(TEXT("Installed ordinary staff performance and rig match"),
        Mesh && Clip && Clip->GetSkeleton() == Mesh->GetSkeleton())) return false;

    UWorld::InitializationValues Settings;
    Settings.InitializeScenes(true).AllowAudioPlayback(false).CreatePhysicsScene(true)
        .CreateNavigation(false).CreateAISystem(false).ShouldSimulatePhysics(false).CreateFXSystem(false);
    UWorld* World = UWorld::CreateWorld(EWorldType::Game, false,
        MakeUniqueObjectName(GetTransientPackage(), UWorld::StaticClass(), TEXT("FlowFestBuiltInPrep")),
        GetTransientPackage(), true, ERHIFeatureLevel::Num, &Settings);
    if (!TestNotNull(TEXT("Native preparation test world"), World)) return false;
    struct FWorldCleanup
    {
        UWorld* Value;
        ~FWorldCleanup() { Value->DestroyWorld(false); }
    } Cleanup{World};
    AActor* Owner = World->SpawnActor<AActor>();
    if (!TestNotNull(TEXT("Native preparation owner"), Owner)) return false;
    USceneComponent* Root = NewObject<USceneComponent>(Owner);
    Owner->SetRootComponent(Root);
    Root->RegisterComponent();
    USkeletalMeshComponent* Body = NewObject<USkeletalMeshComponent>(Owner);
    Body->SetupAttachment(Root);
    Body->SetSkeletalMeshAsset(Mesh);
    const FBoxSphereBounds Bounds = Mesh->GetBounds();
    // This fixture forces a terminal cache entry. Give its measured rig a
    // distinct exact scale so other tests using the ordinary avatar cannot
    // inherit that artificial failure from the process-wide cache.
    const float Scale = 190.5f / (Bounds.BoxExtent.Z * 2.f) * 1.000137f;
    const float Lift = Mesh->GetRefSkeleton().GetBoneName(0) == TEXT("Hips") ? 0.f :
        -(Bounds.Origin.Z - Bounds.BoxExtent.Z) * Scale;
    Body->SetRelativeTransform(FTransform(FQuat(FVector::UpVector, -HALF_PI),
        FVector(0, 0, Lift), FVector(Scale)));
    Body->SetEnableAnimation(false);
    Body->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Body->RegisterComponent();
    Body->SetComponentTickEnabled(false);
    Body->SetComponentSpaceTransformsDoubleBuffering(false);
    auto& Bind = Body->GetEditableComponentSpaceTransforms();
    const auto& Reference = Mesh->GetRefSkeleton();
    Bind = Reference.GetRefBonePose();
    for (int32 Index = 0; Index < Bind.Num(); ++Index)
    {
        const int32 Parent = Reference.GetParentIndex(Index);
        if (Parent != INDEX_NONE) Bind[Index] *= Bind[Parent];
    }
    UFlowFestPropComponent* Prop = NewObject<UFlowFestPropComponent>(Owner);
    Prop->Initialize(Root);
    if (!TestTrue(TEXT("Ordinary staff sidecar and grip bind through production loading"),
        Prop->Equip(TEXT("staff:default")) && Prop->LoadPerformance(TEXT("x-bot"), TEXT("P_staff_A")) &&
        Prop->BindHands(Body) && Prop->HasVisibleGrip())) return false;
    UFlowFestAnimInstance* Animator = NewObject<UFlowFestAnimInstance>(Body);
    Animator->Configure({}, Folder);
    Animator->SetGripSource(Prop);
    Animator->StartPerformance(Clip, true, TEXT("P_staff_A"));
    Animator->SeekPerformance(0.f);
    FFlowFestAnimProxy& Proxy = Animator->GetProxyOnGameThread<FFlowFestAnimProxy>();
    Proxy.Initialize(Animator);
    TArray<FBoneIndexType> Required;
    for (int32 Index = 0; Index < Reference.GetNum(); ++Index) Required.Add(Index);
    FMemMark Mark(FMemStack::Get());
    Proxy.GetRequiredBones().InitializeTo(Required, UE::Anim::FCurveFilterSettings(), *Mesh);
    Proxy.PreUpdate(Animator, 0.f);
    const FString Request = Proxy.DescribePreparationForTests();
    AddInfo(FString::Printf(TEXT("Ordinary native request: %s; clip %.6fs at %.6fHz with %d sampled keys"),
        *Request, Clip->GetPlayLength(), Clip->GetSamplingFrameRate().AsDecimal(),
        Clip->GetNumberOfSampledKeys()));
    if (!TestTrue(TEXT("Ordinary built-in playback requests a full source-rate prepared track"),
        Request.Contains(TEXT("policy=1 legacy=0/480")))) return false;
    // Fail before Evaluate submits a legacy worker. This fixture exercises
    // independent stance capture with the aggregate work bound fully free.
    if (!TestTrue(TEXT("A failed legacy correction is terminal"),
        Proxy.FailLegacyPreparationForTests())) return false;
    FPoseContext ReferencePose(&Proxy);
    ReferencePose.ResetToRefPose();
    if (!TestTrue(TEXT("Ordinary initial performance pose evaluates"),
        Proxy.Evaluate(ReferencePose))) return false;
    FFlowFestStancePose StandingPose;
    if (!TestTrue(TEXT("Standing native rig has a complete pose"),
        FFlowFestStancePlan::Capture(ReferencePose, StandingPose))) return false;
    FFlowArtsArmClearanceRigEnvelope Envelope;
    FString MeasureError;
    if (!TestTrue(TEXT("Standing native rig exposes weighted foot surfaces"),
        FFlowArtsArmClearance::MeasureRig(Mesh, Envelope, MeasureError))) return false;
    FFlowArtsArmClearancePreparationSnapshot Snapshot;
    const bool bCaptured = FFlowArtsArmClearance::CapturePreparationSnapshot(ReferencePose,
        {}, {}, Envelope, Body->GetComponentTransform().GetScale3D(), Snapshot);
    AddInfo(FString::Printf(TEXT("Built-in fixture snapshot: complete=%d skin=%d pair=%d upper=%d capture=%d pairGeometry=%d upperGeometry=%d upperQuery=%d segmentQuery=%d footQuery=%d bones=%d"),
        Envelope.IsComplete(), bool(Envelope.SkinnedClearance),
        Envelope.SkinnedClearance ? Envelope.SkinnedClearance->bCanCertifyArmPair : false,
        Envelope.SkinnedClearance ? Envelope.SkinnedClearance->bTorsoCoveredByClosedBody : false,
        bCaptured, Snapshot.Geometry.bCanCertifySkinnedArmPair,
        Snapshot.Geometry.bCanCertifySkinnedUpperTorso,
        bool(Snapshot.Geometry.CertifySkinnedUpperTorso),
        bool(Snapshot.Geometry.CertifySkinnedSegments),
        bool(Snapshot.EvaluateFootSurfaces), ReferencePose.Pose.GetNumBones()));
    if (!TestTrue(TEXT("Standing native foot geometry captures"),
        bCaptured && bool(Snapshot.EvaluateFootSurfaces))) return false;
    TArray<FVector> FootSurfaces[2];
    if (!TestTrue(TEXT("Standing weighted foot surfaces evaluate"),
        Snapshot.EvaluateFootSurfaces(StandingPose.Components, FootSurfaces[0], FootSurfaces[1]) &&
        !FootSurfaces[0].IsEmpty() && !FootSurfaces[1].IsEmpty())) return false;
    double SoleHeight = TNumericLimits<double>::Max();
    for (const auto& Side : FootSurfaces)
        for (const FVector& Point : Side)
            SoleHeight = FMath::Min(SoleHeight,
                Body->GetComponentTransform().TransformPosition(Point).Z);
    AActor* Ground = World->SpawnActor<AActor>();
    if (!TestNotNull(TEXT("Static grounded preparation fixture"), Ground)) return false;
    UBoxComponent* Floor = NewObject<UBoxComponent>(Ground);
    Ground->SetRootComponent(Floor);
    Floor->SetBoxExtent(FVector(1000., 1000., 10.));
    Floor->SetMobility(EComponentMobility::Static);
    Floor->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
    Floor->SetCollisionResponseToAllChannels(ECR_Block);
    Floor->SetWorldLocation(FVector(0., 0., SoleHeight - 10.));
    Floor->RegisterComponent();
    Proxy.SetPreparationCapturePolicyForTests(2, 1.);
    Proxy.PreUpdate(Animator, 0.f);
    if (!TestTrue(TEXT("Ordinary playback requests grounded whole-track preparation after legacy failure"),
        Proxy.DescribePreparationForTests().Contains(TEXT("policy=2")))) return false;
    if (!TestEqual(TEXT("Grounded proxy reserves two pending source captures"),
        Proxy.GetPendingPreparationCaptureCountForTests(), 2)) return false;
    if (!TestEqual(TEXT("Both pending claims occupy the shared cache bound"),
        FFlowFestPreparedMotionCache::Get().GetCaptureOutstandingForTests(), 2)) return false;
    Proxy.Initialize(Animator);
    if (!TestEqual(TEXT("Reinitializing before Evaluate releases both pending claims"),
        FFlowFestPreparedMotionCache::Get().GetCaptureOutstandingForTests(), 0)) return false;
    Proxy.GetRequiredBones().InitializeTo(Required, UE::Anim::FCurveFilterSettings(), *Mesh);

    auto CaptureTwoStanceSourcePoses = [&](int32 Limit, FFlowFestStancePose (&Poses)[2],
        bool& bSawTwoInOneEvaluate) -> bool
    {
        Proxy.SetPreparationCapturePolicyForTests(Limit, 1.);
        const int32 EarlierCaptures = Proxy.GetNativePreparationCaptureCountForTests();
        bSawTwoInOneEvaluate = false;
        Proxy.PreUpdate(Animator, 0.f);
        for (int32 Attempt = 0; Attempt < 128 &&
            Proxy.GetNativePreparationCaptureCountForTests() < EarlierCaptures + 2; ++Attempt)
        {
            const int32 BeforeEvaluate = Proxy.GetNativePreparationCaptureCountForTests();
            FPoseContext Output(&Proxy);
            Output.ResetToRefPose();
            if (!TestTrue(TEXT("Ordinary built-in pose evaluates during stance capture"),
                Proxy.Evaluate(Output))) return false;
            const int32 Extracted = Proxy.GetNativePreparationCaptureCountForTests() - BeforeEvaluate;
            if (!TestTrue(TEXT("One evaluation stays inside its capture limit"),
                Extracted <= Limit)) return false;
            bSawTwoInOneEvaluate |= Extracted == 2;
            if (Proxy.GetNativePreparationCaptureCountForTests() < EarlierCaptures + 2)
                Proxy.PreUpdate(Animator, 0.f);
        }
        AddInfo(FString::Printf(TEXT("Native source capture limit=%d state=%s samples=%d twoInOne=%d"),
            Limit, *Proxy.DescribePreparationForTests(),
            Proxy.GetNativePreparationCaptureCountForTests() - EarlierCaptures,
            bSawTwoInOneEvaluate));
        const int32 Captured = Proxy.GetNativePreparationCaptureCountForTests() - EarlierCaptures;
        // A first single capture can be followed by a two-capture evaluation.
        if (!TestTrue(TEXT("Native source capture progresses after failed legacy correction"),
            Captured >= 2 && Captured <= 3)) return false;
        for (int32 Index = 0; Index < 2; ++Index)
            if (!TestTrue(TEXT("Captured native source pose is retained in the immutable track"),
                Proxy.ReadCapturedStancePoseForTests(Index, Poses[Index]))) return false;
        return true;
    };

    FFlowFestStancePose SerialPoses[2], BatchedPoses[2];
    bool bSerialDoubled = false, bBatchDoubled = false;
    if (!CaptureTwoStanceSourcePoses(1, SerialPoses, bSerialDoubled)) return false;
    if (!TestFalse(TEXT("Serial extraction never batches two source samples"), bSerialDoubled))
        return false;
    // A fresh key with identical physical inputs isolates the second capture
    // schedule without changing the calibrated hand-to-prop transform.
    Proxy.SetPreparationIdentitySaltForTests(TEXT("batched-native-source"));
    Proxy.PreUpdate(Animator, 0.f);
    if (!TestTrue(TEXT("A distinct identity gets a fresh grounded preparation key"),
        Proxy.DescribePreparationForTests().Contains(TEXT("policy=2")) &&
        Proxy.DescribePreparationForTests().Contains(TEXT("stance=0/960")))) return false;
    if (!CaptureTwoStanceSourcePoses(2, BatchedPoses, bBatchDoubled)) return false;
    if (!TestTrue(TEXT("Two source samples are extracted in one actual proxy evaluation"),
        bBatchDoubled)) return false;
    for (int32 Index = 0; Index < 2; ++Index)
    {
        if (!TestEqual(TEXT("Serial and batch source poses use the same compact skeleton"),
            SerialPoses[Index].Components.Num(), BatchedPoses[Index].Components.Num())) return false;
        for (int32 Bone = 0; Bone < SerialPoses[Index].Components.Num(); ++Bone)
        {
            const FTransform& Serial = SerialPoses[Index].Components[Bone];
            const FTransform& Batched = BatchedPoses[Index].Components[Bone];
            if (!TestTrue(TEXT("Batched extraction preserves native position and grip correction"),
                FVector::Distance(Serial.GetTranslation(), Batched.GetTranslation()) <= .01)) return false;
            const double AngleDegrees = FMath::RadiansToDegrees(
                Serial.GetRotation().AngularDistance(Batched.GetRotation()));
            if (AngleDegrees > .01)
                AddInfo(FString::Printf(TEXT("Rotation difference frame=%d bone=%d angle=%.9f degrees"),
                    Index, Bone, AngleDegrees));
            if (!TestTrue(TEXT("Batched extraction preserves native joint rotation"),
                AngleDegrees <= .01)) return false;
            if (!TestTrue(TEXT("Batched extraction preserves native bone scale"),
                Serial.GetScale3D().Equals(Batched.GetScale3D(), .0001))) return false;
        }
    }
    return true;
}
#endif
