#include "FlowArtsSkinnedClearance.h"
#include "FlowArtsArmClearance.h"
#include "Misc/AutomationTest.h"
#include "Animation/AnimNodeBase.h"
#include "Animation/Skeleton.h"
#include "BoneContainer.h"
#include "BonePose.h"
#include "Dom/JsonObject.h"
#include "Engine/SkeletalMesh.h"
#include "Misc/FileHelper.h"
#include "Misc/MemStack.h"
#include "Misc/Paths.h"
#include "Serialization/JsonSerializer.h"

#if WITH_DEV_AUTOMATION_TESTS
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsOpenCoverFallbackTest,
    "FlowArts.Clearance.OpenCoverFallback",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsOpenCoverFallbackTest::RunTest(const FString& Parameters)
{
    FFlowArtsSkinnedClearanceData Data;
    Data.ReferenceBoneCount = 2;
    Data.UncappedArmBone[0] = 0;
    Data.UncappedArmBone[1] = 1;
    Data.OpenBodyBone = 1;
    const FVector Positions[6] = {
        FVector(0, 0, 0), FVector(0, 1, 0), FVector(0, 0, 1),
        FVector(10, 0, 0), FVector(10, 1, 0), FVector(10, 0, 1)};
    for (int32 I = 0; I < 6; ++I)
    {
        Data.Vertices.Add({I, 1});
        Data.Influences.Add({I < 3 ? 0 : 1, Positions[I], 1.f});
        Data.ReferencedVertices.Add(I);
    }
    Data.ReferencedBones = {0, 1};
    Data.UpperTriangles[0].Add({FIntVector(0, 1, 2), FVector(.5, .5, .5)});
    Data.OpenBodyTriangles = {FIntVector(3, 4, 5)};
    Data.OpenBodyComponents = {{3, 4, 5}};
    Data.bOpenBodyCoverComplete = true;
    Data.OpenBodyPropTriangles = Data.OpenBodyTriangles;
    Data.OpenBodyPropComponents = Data.OpenBodyComponents;
    Data.bOpenBodyPropCoverComplete = true;
    Data.OpenArmTriangles[0] = {FIntVector(0, 1, 2)};
    Data.OpenArmTriangles[1] = {FIntVector(3, 4, 5)};
    Data.OpenArmComponents[0] = {{0, 1, 2}};
    Data.OpenArmComponents[1] = {{3, 4, 5}};
    Data.bOpenArmCoverComplete[0] = Data.bOpenArmCoverComplete[1] = true;
    TArray<FTransform> Pose = {FTransform::Identity, FTransform::Identity};
    TestEqual(TEXT("separated open sleeve/body and arms certify"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data, Pose, .3f, 1, true), uint8(5));
    FFlowArtsClearanceCapsule FarProp;
    FarProp.Start = FVector(20, 0, 0);
    FarProp.End = FVector(20, 0, 1);
    FarProp.RadiusCm = 1.f;
    const TArray<FFlowArtsClearanceCapsule> Props = {FarProp};
    TestEqual(TEXT("open opposite and held props certify by component gaps"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data, Pose, .3f, 0, false,
            nullptr, {}, Props, 1, 2), uint8(72));
    Pose[1].SetLocation(FVector(-10, 0, 0));
    TestEqual(TEXT("posed overlap rejects open upper and arm pair"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data, Pose, .3f, 1, true), uint8(0));
    Pose[1] = FTransform::Identity;
    const FVector Enclosing[3] = {
        FVector(0, -1, -1), FVector(0, 3, -1), FVector(0, -1, 3)};
    for (const FVector& Point : Enclosing)
    {
        const int32 Index = Data.Vertices.Num();
        Data.Vertices.Add({Data.Influences.Num(), 1});
        Data.Influences.Add({1, Point, 1.f});
        Data.ReferencedVertices.Add(Index);
    }
    Data.OpenBodyTriangles = {FIntVector(6, 7, 8)};
    Data.OpenBodyComponents = {{6, 7, 8}};
    TestEqual(TEXT("enclosing coplanar open body cannot certify contained sleeve"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data, Pose, .3f, 1, false), uint8(0));
    Data.OpenBodyComponents.Reset();
    TestEqual(TEXT("missing original body component rejects upper"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data, Pose, .3f, 1, false), uint8(0));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsNativeOpenCoverCallbackTest,
    "FlowArts.Clearance.NativeOpenCoverCallback",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsNativeOpenCoverCallbackTest::RunTest(const FString&)
{
    FString Json;
    TSharedPtr<FJsonObject> Catalog;
    const TArray<TSharedPtr<FJsonValue>>* Characters = nullptr;
    if (!TestTrue(TEXT("installed character catalog"),
        FFileHelper::LoadFileToString(Json, *(FPaths::ProjectContentDir() / TEXT("Data/characters.json"))) &&
        FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json), Catalog) &&
        Catalog.IsValid() && Catalog->TryGetArrayField(TEXT("characters"), Characters))) return false;
    FString MeshPath;
    for (const auto& Value : *Characters)
    {
        const TSharedPtr<FJsonObject>* Entry = nullptr;
        FString Id;
        if (Value.IsValid() && Value->TryGetObject(Entry) && Entry && Entry->IsValid() &&
            (*Entry)->TryGetStringField(TEXT("id"), Id) && Id == TEXT("ch01"))
        {
            (*Entry)->TryGetStringField(TEXT("mesh"), MeshPath);
            break;
        }
    }
    if (!TestTrue(TEXT("ch01 mesh registered"), !MeshPath.IsEmpty())) return false;
    USkeletalMesh* Mesh = LoadObject<USkeletalMesh>(nullptr, *MeshPath);
    if (!TestNotNull(TEXT("native ch01 mesh"), Mesh)) return false;
    FFlowArtsArmClearanceRigEnvelope Envelope;
    FString Error;
    if (!TestTrue(TEXT("native ch01 measured"),
        FFlowArtsArmClearance::MeasureRig(Mesh, Envelope, Error)))
    { AddError(Error); return false; }
    if (!TestNotNull(TEXT("ch01 skin cache"), Envelope.SkinnedClearance.Get())) return false;
    const auto& Skin = *Envelope.SkinnedClearance;
    TestTrue(TEXT("original open torso cover complete"), Skin.bOpenBodyCoverComplete);
    TestTrue(TEXT("original open arm covers complete"),
        Skin.bOpenArmCoverComplete[0] && Skin.bOpenArmCoverComplete[1]);
    TestTrue(TEXT("original open held-body cover complete"), Skin.bOpenBodyPropCoverComplete);
    TArray<FBoneIndexType> Required;
    const auto& Ref = Mesh->GetRefSkeleton();
    for (int32 I = 0; I < Ref.GetNum(); ++I) Required.Add(I);
    const FMemMark Mark(FMemStack::Get());
    FBoneContainer Container(Required, UE::Anim::FCurveFilterSettings(), *Mesh);
    FPoseContext Native(Container);
    Native.ResetToRefPose();
    FFlowArtsArmClearancePreparationSnapshot Snapshot;
    FFlowArtsArmClearance::CapturePreparationSnapshot(
        Native, {}, {}, Envelope, FVector::OneVector, Snapshot);
    const auto& Geometry = Snapshot.Geometry;
    TestTrue(TEXT("native ch01 upper callback installed"),
        Geometry.bCanCertifySkinnedUpperTorso && bool(Geometry.CertifySkinnedUpperTorso));
    TestTrue(TEXT("native ch01 pair callback installed"), Geometry.bCanCertifySkinnedArmPair);
    TestTrue(TEXT("native ch01 opposite prop callback installed"), bool(Geometry.CertifySkinnedOppositeProps));
    TestTrue(TEXT("native ch01 held-body callback installed"), bool(Geometry.CertifySkinnedHeldPropBody));
    if (!Geometry.CertifySkinnedUpperTorso) return false;
    const uint8 Mask = Geometry.CertifySkinnedUpperTorso(Geometry.Arms, FQuat::Identity, true);
    TestEqual(TEXT("native callback returns only requested upper/pair bits"), Mask & uint8(~7), uint8(0));
    return true;
}
#endif
