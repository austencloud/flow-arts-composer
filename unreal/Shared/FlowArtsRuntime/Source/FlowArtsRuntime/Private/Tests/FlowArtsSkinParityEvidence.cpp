#if WITH_DEV_AUTOMATION_TESTS
#include "FlowArtsRuntimeMotion.h"
#include "FlowArtsSkinnedClearance.h"
#include "FlowArtsArmClearance.h"
#include "Async/Async.h"

#include "Animation/AnimNodeBase.h"
#include "Animation/Skeleton.h"
#include "BoneContainer.h"
#include "BonePose.h"
#include "Dom/JsonObject.h"
#include "Engine/SkeletalMesh.h"
#include "HAL/FileManager.h"
#include "Misc/AutomationTest.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/MemStack.h"
#include "Misc/Parse.h"
#include "Rendering/SkeletalMeshRenderData.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

// Opt-in evidence capture. It samples only the imported-source pose and does
// not invoke the clearance solver or mutate installed assets.
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsSkinParityEvidenceTest,
    "FlowArts.Replay.SkinParityEvidence",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsSkinParityEvidenceTest::RunTest(const FString& Parameters)
{
    FString MotionPath, OutputPath, PosePath;
    if (!FParse::Value(FCommandLine::Get(), TEXT("FlowArtsSkinParityMotion="), MotionPath) ||
        !FParse::Value(FCommandLine::Get(), TEXT("FlowArtsSkinParityOutput="), OutputPath))
    {
        AddError(TEXT("Skin parity evidence requires -FlowArtsSkinParityMotion=<motion.json> and -FlowArtsSkinParityOutput=<csv>"));
        return false;
    }
    FString MotionJson;
    TSharedPtr<FJsonObject> Json;
    if (!FFileHelper::LoadFileToString(MotionJson, *MotionPath) ||
        !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(MotionJson), Json) || !Json)
    {
        AddError(TEXT("Cannot load exact portable motion JSON"));
        return false;
    }
    const FString CharacterId = Json->GetStringField(TEXT("characterId"));
    const FString RigHash = Json->GetObjectField(TEXT("skeleton"))->GetStringField(TEXT("rigSHA256"));
    const FString Key = CharacterId.Replace(TEXT("-"), TEXT("_"));
    const FString MeshPath = FString::Printf(TEXT("/Game/FlowFest/Characters/%s/SK_%s.SK_%s"),
        *Key, *Key, *Key);
    USkeletalMesh* Mesh = LoadObject<USkeletalMesh>(nullptr, *MeshPath);
    if (!TestNotNull(TEXT("Exact imported skeletal mesh"), Mesh)) return false;
    TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Motion;
    FString Error;
    if (!TestTrue(*FString::Printf(TEXT("Load exact imported source motion: %s"), *Error),
        FFlowArtsRuntimeMotion::LoadFromFile(MotionPath, CharacterId, RigHash, Mesh, Motion, Error))) return false;
    if (!TestNotNull(TEXT("Parsed source motion"), Motion.Get())) return false;

    const FReferenceSkeleton& Reference = Mesh->GetRefSkeleton();
    const FBoxSphereBounds Bounds = Mesh->GetBounds();
    const float Height = Bounds.BoxExtent.Z * 2.f;
    if (!TestTrue(TEXT("Finite imported mesh height"), FMath::IsFinite(Height) && Height > 1.f)) return false;
    const float Scale = 190.5f / Height;
    const float Lift = Reference.GetBoneName(0) == TEXT("Hips") ? 0.f :
        -(Bounds.Origin.Z - Bounds.BoxExtent.Z) * Scale;
    const FTransform Presentation(FQuat(FVector::UpVector, -HALF_PI), FVector(0, 0, Lift), FVector(Scale));
    TSharedPtr<FJsonObject> EvidenceBones;
    if (FParse::Value(FCommandLine::Get(), TEXT("FlowArtsSkinParityPose="), PosePath))
    {
        FString EvidenceText;
        TSharedPtr<FJsonObject> Evidence;
        if (!FFileHelper::LoadFileToString(EvidenceText, *PosePath) ||
            !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(EvidenceText), Evidence) ||
            !Evidence || Evidence->GetStringField(TEXT("characterId")) != CharacterId)
        {
            AddError(TEXT("Pose evidence must contain the matching character"));
            return false;
        }
        EvidenceBones = Evidence->GetObjectField(TEXT("bones"));
    }

    TArray<FBoneIndexType> Required;
    for (int32 I = 0; I < Reference.GetNum(); ++I) Required.Add(I);
    const FMemMark Mark(FMemStack::Get());
    FBoneContainer Container(Required, UE::Anim::FCurveFilterSettings(), *Mesh);
    FPoseContext Pose(Container);
    Pose.ResetToRefPose();
    if (!TestTrue(TEXT("Exact t=0 imported-source pose samples"), Motion->SamplePose(Pose, 0., Presentation))) return false;
    FCSPose<FCompactPose> Component;
    Component.InitPose(Pose.Pose);
    const FReferenceSkeleton& Skeleton = Mesh->GetSkeleton()->GetReferenceSkeleton();
    TArray<FTransform> Posed;
    Posed.SetNum(Reference.GetNum());
    for (int32 I = 0; I < Reference.GetNum(); ++I)
    {
        const int32 SkeletonIndex = Skeleton.FindBoneIndex(Reference.GetBoneName(I));
        if (!TestTrue(TEXT("Reference bone maps into sampled skeleton"), SkeletonIndex != INDEX_NONE)) return false;
        const FCompactPoseBoneIndex Compact = Container.GetCompactPoseIndexFromSkeletonIndex(SkeletonIndex);
        if (!TestTrue(TEXT("Reference bone maps into compact pose"), Compact.GetInt() != INDEX_NONE)) return false;
        Posed[I] = Component.GetComponentSpaceTransform(Compact);
        if (EvidenceBones)
        {
            const TArray<TSharedPtr<FJsonValue>>* Values = nullptr;
            if (!EvidenceBones->TryGetArrayField(Reference.GetBoneName(I).ToString(), Values) || Values->Num() != 10)
            {
                AddError(FString::Printf(TEXT("Pose evidence is missing bone %s"), *Reference.GetBoneName(I).ToString()));
                return false;
            }
            double V[10];
            for (int32 K = 0; K < 10; ++K)
            {
                V[K] = (*Values)[K]->AsNumber();
                if (!FMath::IsFinite(V[K])) { AddError(TEXT("Nonfinite pose evidence")); return false; }
            }
            const FTransform PerformerPose(FQuat(V[3], V[4], V[5], V[6]),
                FVector(V[0], V[1], V[2]), FVector(V[7], V[8], V[9]));
            Posed[I] = PerformerPose.GetRelativeTransform(Presentation);
        }
    }

    FFlowArtsSkinnedClearanceData Skin;
    if (!TestTrue(*FString::Printf(TEXT("Build exact imported CPU skin: %s"), *Error),
        FFlowArtsSkinnedClearance::Build(Mesh, Skin, Error))) return false;
    if (FParse::Param(FCommandLine::Get(), TEXT("FlowArtsSkinParityCertificate")))
    {
        TArray<FFlowArtsContactWitness> Contacts;
        FFlowArtsArmPairContactWitness Pair;
        const uint8 Mask = FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(
            Skin, Posed, .3f, 3, true, &Contacts, {}, {}, 0, 0, nullptr, &Pair);
        AddInfo(FString::Printf(TEXT("Exact supplied-pose certificate upper=%d pair=%d contacts=%d pairTriangles=%d/%d"),
            Mask & 3, !!(Mask & 4), Contacts.Num(), Pair.LeftTriangleIndex, Pair.RightTriangleIndex));
    }
    const FSkeletalMeshRenderData* RenderData = Mesh->GetResourceForRendering();
    if (!TestTrue(TEXT("Imported LOD0 render data exists"), RenderData && !RenderData->LODRenderData.IsEmpty())) return false;
    const auto& Positions = RenderData->LODRenderData[0].StaticVertexBuffers.PositionVertexBuffer;
    if (!TestEqual(TEXT("Skin and position vertex counts agree"), Skin.Vertices.Num(), static_cast<int32>(Positions.GetNumVertices())))
        return false;

    FString Csv = FString::Printf(TEXT("# motion=%s,character=%s,sample=0,vertices=%d,scale=%.9g,lift=%.9g\n"),
        *MotionPath, *CharacterId, Skin.Vertices.Num(), Scale, Lift);
    Csv += TEXT("index,bindX,bindY,bindZ,posedX,posedY,posedZ,dominantBone,dominantWeight\n");
    Csv.Reserve(Skin.Vertices.Num() * 145);
    for (int32 V = 0; V < Skin.Vertices.Num(); ++V)
    {
        const auto& Vertex = Skin.Vertices[V];
        FVector Position = FVector::ZeroVector;
        int32 Dominant = INDEX_NONE;
        float Largest = -1.f;
        for (int32 I = Vertex.FirstInfluence; I < Vertex.FirstInfluence + Vertex.InfluenceCount; ++I)
        {
            const auto& Influence = Skin.Influences[I];
            if (!Posed.IsValidIndex(Influence.Bone))
            {
                AddError(TEXT("Skin influence refers to absent sampled bone"));
                return false;
            }
            Position += Posed[Influence.Bone].TransformPosition(Influence.BoneLocalPosition) * Influence.Weight;
            if (Influence.Weight > Largest) { Largest = Influence.Weight; Dominant = Influence.Bone; }
        }
        const FVector Bind = Presentation.TransformPosition(FVector(Positions.VertexPosition(V)));
        const FVector Skinned = Presentation.TransformPosition(Position);
        Csv += FString::Printf(TEXT("%d,%.9g,%.9g,%.9g,%.9g,%.9g,%.9g,%s,%.9g\n"),
            V, Bind.X, Bind.Y, Bind.Z, Skinned.X, Skinned.Y, Skinned.Z,
            Dominant == INDEX_NONE ? TEXT("unknown") : *Reference.GetBoneName(Dominant).ToString(), Largest);
    }
    if (!FFileHelper::SaveStringToFile(Csv, *OutputPath))
    {
        AddError(FString::Printf(TEXT("Cannot write skin parity evidence: %s"), *OutputPath));
        return false;
    }
    FString InfluencePath;
    if (FParse::Value(FCommandLine::Get(), TEXT("FlowArtsSkinParityInfluences="), InfluencePath))
    {
        FString Influences = TEXT("vertex,bone,localX,localY,localZ,weight\n");
        for (int32 V = 0; V < Skin.Vertices.Num(); ++V)
        {
            const auto& Vertex = Skin.Vertices[V];
            for (int32 I = Vertex.FirstInfluence; I < Vertex.FirstInfluence + Vertex.InfluenceCount; ++I)
            {
                const auto& Influence = Skin.Influences[I];
                const FVector P = Influence.BoneLocalPosition;
                Influences += FString::Printf(TEXT("%d,%s,%.17g,%.17g,%.17g,%.17g\n"), V,
                    *Reference.GetBoneName(Influence.Bone).ToString(), P.X, P.Y, P.Z, double(Influence.Weight));
            }
        }
        if (!FFileHelper::SaveStringToFile(Influences, *InfluencePath))
        {
            AddError(FString::Printf(TEXT("Cannot write skin influences: %s"), *InfluencePath));
            return false;
        }
    }
    if (FParse::Param(FCommandLine::Get(), TEXT("FlowArtsPrepareSnapshotEvidence")))
    {
        FFlowArtsArmClearancePreparationSnapshot Snapshot;
        {
            FFlowArtsArmClearanceRigEnvelope TemporaryEnvelope;
            if (!TestTrue(TEXT("Measure temporary preparation envelope"),
                FFlowArtsArmClearance::MeasureRig(Mesh,TemporaryEnvelope,Error))) return false;
            FPoseContext TemporaryPose(Container);
            TemporaryPose.ResetToRefPose();
            if (!TestTrue(TEXT("Sample temporary preparation pose"),Motion->SamplePose(TemporaryPose,0.,Presentation))) return false;
            if (!TestTrue(TEXT("Capture independent immutable preparation geometry"),
                FFlowArtsArmClearance::CapturePreparationSnapshot(TemporaryPose,{}, {},TemporaryEnvelope,
                    Presentation.GetScale3D(),Snapshot))) return false;
        }
        // Both envelope and FPoseContext above have expired. Execute on an actual
        // worker to exercise callback ownership rather than merely copying structs.
        auto Future=Async(EAsyncExecution::ThreadPool,[Snapshot]()
        {
            FFlowArtsArmClearancePreparedSeed Seed;
            FFlowArtsArmClearanceResult Result;
            const bool bBuilt=FFlowArtsArmClearance::PrepareCandidate(Snapshot,0,nullptr,Seed,Result);
            return TPair<bool,FFlowArtsArmClearanceResult>(bBuilt,MoveTemp(Result));
        });
        const auto Prepared=Future.Get();
        TestTrue(TEXT("Expired capture scopes remain usable on a worker"),Prepared.Key);
        TestTrue(TEXT("Worker performs fresh skin certification"),Prepared.Value.SkinnedQueryCount>0);
        for(int32 Side=0;Side<2;++Side)
            TestTrue(TEXT("Worker source control preserves exact wrist"),Prepared.Value.Arms[Side].Wrist.GetLocation().Equals(
                Snapshot.Geometry.Arms[Side].Wrist.GetLocation(),.001));
    }
    AddInfo(FString::Printf(TEXT("Wrote exact imported-source CPU skin: %s (%d vertices)"),
        *OutputPath, Skin.Vertices.Num()));
    return true;
}
#endif
