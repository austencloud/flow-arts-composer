#if WITH_DEV_AUTOMATION_TESTS
#include "FlowArtsPerformanceLibrary.h"
#include "FlowArtsPerformanceSession.h"
#include "FlowArtsRuntimeMotion.h"
#include "FlowFestAvatarComponent.h"
#include "FlowFestPropComponent.h"
#include "Animation/AnimNodeBase.h"
#include "Animation/AnimSequence.h"
#include "Animation/AnimationPoseData.h"
#include "Animation/Skeleton.h"
#include "BoneContainer.h"
#include "BonePose.h"
#include "Components/SceneComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Dom/JsonObject.h"
#include "Engine/World.h"
#include "Engine/SkeletalMesh.h"
#include "GameFramework/Actor.h"
#include "HAL/FileManager.h"
#include "Misc/AutomationTest.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/MemStack.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "UObject/UObjectGlobals.h"

namespace
{
struct FParityWorst
{
    double Error = 0.0;
    double Seconds = 0.0;
    FString Name;
    void Include(double Candidate, double Time, const FString& Label)
    {
        if (Candidate > Error) { Error = Candidate; Seconds = Time; Name = Label; }
    }
};

bool ReadJsonFile(const FString& Path, TSharedPtr<FJsonObject>& Out)
{
    FString Text;
    return FFileHelper::LoadFileToString(Text, *Path) &&
        FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Out) && Out.IsValid();
}

bool ReadPropRoot(const TArray<TSharedPtr<FJsonValue>>& Values, int32 Start, FTransform& Out)
{
    if (Values.Num() != 28) return false;
    double N[7];
    for (int32 Index = 0; Index < 7; ++Index)
        if (!Values[Start + Index].IsValid() || !Values[Start + Index]->TryGetNumber(N[Index]) ||
            !FMath::IsFinite(N[Index])) return false;
    const FQuat Rotation(N[3], N[4], N[5], N[6]);
    if (!FMath::IsNearlyEqual(Rotation.SizeSquared(), 1.0, .02)) return false;
    Out = FTransform(Rotation.GetNormalized(), FVector(N[0], N[1], N[2]));
    return true;
}

FTransform InterpolateRoot(const FTransform& A, const FTransform& B, float Alpha)
{
    return FTransform(FQuat::Slerp(A.GetRotation(), B.GetRotation(), Alpha).GetNormalized(),
        FMath::Lerp(A.GetLocation(), B.GetLocation(), Alpha));
}

double AngularErrorDeg(const FQuat& A, const FQuat& B)
{
    return FMath::RadiansToDegrees(A.AngularDistance(B));
}
}

// Acceptance oracle for one real captured score and its prepared, cooked profile.
// The portable file is generated from the same raw capture by the production
// bundle builder. No mock pose or invented profile is accepted.
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsRuntimeParityTest,
    "FlowArts.Runtime.PortableMotion.CookedParity",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsRuntimeParityTest::RunTest(const FString& Parameters)
{
    FString MotionPath, ProfileName, CaptureSHA256;
    if (!FParse::Value(FCommandLine::Get(), TEXT("FlowArtsParityMotion="), MotionPath) ||
        !FParse::Value(FCommandLine::Get(), TEXT("FlowArtsParityProfile="), ProfileName) ||
        !FParse::Value(FCommandLine::Get(), TEXT("FlowArtsParityCaptureSHA256="), CaptureSHA256))
    {
        AddError(TEXT("Parity requires -FlowArtsParityMotion=<real .motion.json> -FlowArtsParityProfile=<matching cooked profile> -FlowArtsParityCaptureSHA256=<raw capture SHA-256 from fixture builder>"));
        return false;
    }
    MotionPath = MotionPath.TrimStartAndEnd();
    MotionPath.RemoveFromStart(TEXT("\""));
    MotionPath.RemoveFromEnd(TEXT("\""));
    TSharedPtr<FJsonObject> MotionJson, RigCatalog;
    const TSharedPtr<FJsonObject>* Rigs = nullptr;
    FString Character, PropId, RigHash, ScoreHash, ScoreJson;
    if (!ReadJsonFile(MotionPath, MotionJson) ||
        !MotionJson->TryGetStringField(TEXT("characterId"), Character) ||
        !MotionJson->TryGetStringField(TEXT("propId"), PropId) ||
        !MotionJson->TryGetStringField(TEXT("sequenceSHA256"), ScoreHash) ||
        !MotionJson->TryGetStringField(TEXT("sequenceJson"), ScoreJson) ||
        !ReadJsonFile(FPaths::ProjectContentDir() / TEXT("Data/runtime-rigs.json"), RigCatalog) ||
        !RigCatalog->TryGetObjectField(TEXT("rigs"), Rigs) || !Rigs ||
        !(*Rigs)->TryGetStringField(Character, RigHash))
    {
        AddError(TEXT("Parity fixture identity or trusted runtime-rigs.json is unavailable"));
        return false;
    }
    if (!TestEqual(TEXT("Pinned parity character"), Character, FString(TEXT("x-bot"))) ||
        !TestTrue(TEXT("Source score hash is valid"), FFlowArtsPerformanceLibrary::VerifySnapshot(ScoreHash, ScoreJson)))
        return false;
    FString Family = PropId.ToLower();
    int32 Colon = INDEX_NONE;
    if (Family.FindChar(TEXT(':'), Colon)) Family.LeftInline(Colon);
    FFlowArtsPerformanceLibrary Library;
    FString Error;
    if (!TestTrue(*FString::Printf(TEXT("Load real prepared library: %s"), *Error),
            FFlowArtsPerformanceLibrary::LoadFromProject(Library, Error))) return false;
    const FFlowArtsPerformanceEntry* Entry = nullptr;
    for (const FFlowArtsPerformanceEntry& Candidate : Library.GetEntries())
    {
        if (Candidate.CharacterId != FName(*Character) || Candidate.PropFamily != FName(*Family)) continue;
        if (Candidate.Profile == FName(*ProfileName)) Entry = &Candidate;
    }
    if (!TestNotNull(TEXT("Exact cooked library entry"), Entry)) return false;
    if (!TestTrue(TEXT("Cooked entry and runtime source have identical score hash and text"),
        Entry->SequenceSHA256 == ScoreHash && Entry->SequenceJson == ScoreJson)) return false;
    FString Key = Character.Replace(TEXT("-"), TEXT("_"));
    const FString Folder = FString::Printf(TEXT("/Game/FlowFest/Characters/%s"), *Key);
    const FString MeshPath = Folder / FString::Printf(TEXT("SK_%s.SK_%s"), *Key, *Key);
    const FString ClipPath = Folder / FString::Printf(TEXT("A_Flow_%s.A_Flow_%s"), *ProfileName, *ProfileName);
    USkeletalMesh* Mesh = LoadObject<USkeletalMesh>(nullptr, *MeshPath);
    UAnimSequence* Clip = LoadObject<UAnimSequence>(nullptr, *ClipPath);
    if (!TestNotNull(TEXT("Cooked native skeletal mesh"), Mesh) ||
        !TestNotNull(TEXT("Cooked native animation"), Clip) ||
        !TestTrue(TEXT("Cooked clip uses exact native skeleton"), Clip->GetSkeleton() == Mesh->GetSkeleton())) return false;
    TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Motion;
    if (!TestTrue(*FString::Printf(TEXT("Load source motion: %s"), *Error),
        FFlowArtsRuntimeMotion::LoadFromFile(MotionPath, Character, RigHash, Mesh, Motion, Error)) ||
        !TestTrue(TEXT("Source motion loaded"), Motion.IsValid())) return false;
    if (!TestTrue(TEXT("Validated source identities exactly match fixture and cooked entry"),
        Motion->GetCharacterId() == Character && Motion->GetPropId() == PropId &&
        Motion->GetPropFamily() == Family && Motion->GetSequenceSHA256() == Entry->SequenceSHA256 &&
        Motion->GetSequenceJson() == Entry->SequenceJson)) return false;
    const double Duration = Motion->GetDurationSeconds();
    if (!TestTrue(TEXT("Cooked body and source have same full-loop duration"),
        Motion->IsLooping() && FMath::IsNearlyEqual(Clip->GetPlayLength(), Duration, .001) &&
        FMath::IsNearlyEqual(Entry->DurationSeconds, Duration, .001) && Motion->GetFrameCount() >= 30)) return false;
    const FString PropPath = FPaths::ProjectContentDir() / TEXT("Data/PropMotion") /
        FString::Printf(TEXT("%s_%s.json"), *Key, *ProfileName);
    TSharedPtr<FJsonObject> PropJson;
    const TArray<TSharedPtr<FJsonValue>>* CookedFrames = nullptr;
    double CookedFps = 0.0;
    FString CookedCharacter, CookedProfile, CookedFamily, CookedCaptureSHA256;
    if (!ReadJsonFile(PropPath, PropJson) ||
        !PropJson->TryGetStringField(TEXT("character"), CookedCharacter) ||
        !PropJson->TryGetStringField(TEXT("profile"), CookedProfile) ||
        !PropJson->TryGetStringField(TEXT("propId"), CookedFamily) ||
        !PropJson->TryGetStringField(TEXT("sourceSHA256"), CookedCaptureSHA256) ||
        !PropJson->TryGetNumberField(TEXT("fps"), CookedFps) ||
        !PropJson->TryGetArrayField(TEXT("frames"), CookedFrames) || !CookedFrames ||
        CookedCharacter != Character || CookedProfile != ProfileName || CookedFamily != Family ||
        CookedCaptureSHA256 != CaptureSHA256 || CaptureSHA256.Len() != 64 ||
        !FMath::IsNearlyEqual(CookedFps, Motion->GetSampleRate(), 1.e-6) ||
        CookedFrames->Num() != Motion->GetFrameCount())
    {
        AddError(FString::Printf(TEXT("Cooked prop identity, fps or frame count differs from source: %s"), *PropPath));
        return false;
    }

    UWorld::InitializationValues Settings;
    Settings.AllowAudioPlayback(false).CreatePhysicsScene(false).CreateNavigation(false).CreateAISystem(false);
    UWorld* World = UWorld::CreateWorld(EWorldType::Game, false,
        MakeUniqueObjectName(GetTransientPackage(), UWorld::StaticClass(), TEXT("RuntimeParityWorld")),
        GetTransientPackage(), true, ERHIFeatureLevel::Num, &Settings);
    if (!TestNotNull(TEXT("Parity world"), World)) return false;
    struct FDestroyWorld { UWorld* Value; ~FDestroyWorld() { Value->DestroyWorld(false); } } Cleanup{World};
    AActor* Actor = World->SpawnActor<AActor>();
    if (!TestNotNull(TEXT("Parity performer"), Actor)) return false;
    USceneComponent* Root = NewObject<USceneComponent>(Actor);
    Actor->SetRootComponent(Root);
    Root->RegisterComponent();
    UFlowFestAvatarComponent* Avatar = NewObject<UFlowFestAvatarComponent>(Actor);
    UFlowFestPropComponent* Prop = NewObject<UFlowFestPropComponent>(Actor);
    Avatar->RegisterComponent(); Prop->RegisterComponent();
    Avatar->Initialize(Root, FName(*Character)); Prop->Initialize(Root);
    USkeletalMeshComponent* Body = Avatar->GetBodyMesh();
    if (!TestNotNull(TEXT("Real avatar body"), Body) ||
        !TestTrue(TEXT("Exact captured prop and length equip"),
            Prop->Equip(FName(*PropId), Motion->GetEffectivePropLengthCm())) ||
        !TestTrue(TEXT("Prop binds actual x-bot hands"), Prop->BindHands(Body))) return false;
    const FTransform Presentation = Body->GetRelativeTransform();
    const FReferenceSkeleton& Skeleton = Mesh->GetRefSkeleton();
    TArray<FBoneIndexType> Required;
    for (int32 Index = 0; Index < Skeleton.GetNum(); ++Index) Required.Add(Index);
    const FMemMark Mark(FMemStack::Get());
    FBoneContainer Container(Required, UE::Anim::FCurveFilterSettings(), *Mesh);
    const float TipRadiusCm = Motion->GetEffectivePropLengthCm() * .5f;
    if (!TestTrue(TEXT("Source capture explicitly pins the measured prop length"),
        TipRadiusCm >= 20.f && TipRadiusCm <= 250.f)) return false;
    FParityWorst BonePosition, BonePositionKeys, BonePositionFractional;
    FParityWorst BonePositionFingers, BonePositionOther, BoneAngle, PropRoot, PropTip, PropAngle;
    const double FrameSeconds = Duration / Motion->GetFrameCount();
    int32 SampleCount = 0, BoneCount = 0;
    // Four samples in every frame interval, plus one just before and after
    // the loop seam. Fractional checks catch interpolation bugs hidden at keys.
    TArray<double> Times;
    for (int32 Index = 0; Index < Motion->GetFrameCount(); ++Index)
        for (double Fraction : {0.0, .25, .5, .75}) Times.Add((Index + Fraction) * FrameSeconds);
    Times.Add(Duration - FrameSeconds * .125);
    Times.Add(Duration + FrameSeconds * .125);
    for (const double Time : Times)
    {
        const bool bKeyFrame = SampleCount < Motion->GetFrameCount() * 4 && SampleCount % 4 == 0;
        const double Wrapped = FMath::Fmod(Time, Duration);
        FPoseContext RuntimePose(Container), CookedPose(Container);
        RuntimePose.ResetToRefPose(); CookedPose.ResetToRefPose();
        if (!TestTrue(TEXT("Runtime source pose samples"), Motion->SamplePose(RuntimePose, Time, Presentation))) return false;
        FAnimationPoseData CookedData(CookedPose);
        Clip->GetAnimationPose(CookedData, FAnimExtractContext(static_cast<float>(Wrapped), false));
        FCSPose<FCompactPose> RuntimeComponents, CookedComponents;
        RuntimeComponents.InitPose(RuntimePose.Pose);
        CookedComponents.InitPose(CookedPose.Pose);
        for (int32 Index = 0; Index < Skeleton.GetNum(); ++Index)
        {
            const FCompactPoseBoneIndex Bone = Container.GetCompactPoseIndexFromSkeletonIndex(Index);
            if (Bone.GetInt() == INDEX_NONE) continue;
            const FTransform Runtime = RuntimeComponents.GetComponentSpaceTransform(Bone) * Presentation;
            const FTransform Cooked = CookedComponents.GetComponentSpaceTransform(Bone) * Presentation;
            const FString Name = Skeleton.GetBoneName(Index).ToString();
            const double PositionError = FVector::Dist(Runtime.GetLocation(), Cooked.GetLocation());
            BonePosition.Include(PositionError, Time, Name);
            (bKeyFrame ? BonePositionKeys : BonePositionFractional).Include(PositionError, Time, Name);
            const bool bFinger = Name.Contains(TEXT("Thumb")) || Name.Contains(TEXT("Index")) ||
                Name.Contains(TEXT("Middle")) || Name.Contains(TEXT("Ring")) || Name.Contains(TEXT("Pinky"));
            (bFinger ? BonePositionFingers : BonePositionOther).Include(PositionError, Time, Name);
            BoneAngle.Include(AngularErrorDeg(Runtime.GetRotation(), Cooked.GetRotation()), Time, Name);
            ++BoneCount;
        }
        TArray<float> SourceValues;
        if (!TestTrue(TEXT("Runtime prop source samples"), Motion->SamplePropFrame(Time, SourceValues)) ||
            !TestEqual(TEXT("Runtime prop frame has complete root/grip/visual values"), SourceValues.Num(), 28)) return false;
        const double Frame = Wrapped * CookedFps;
        const int32 A = FMath::Clamp(FMath::FloorToInt(Frame), 0, CookedFrames->Num() - 1);
        const int32 B = (A + 1) % CookedFrames->Num();
        const float Alpha = static_cast<float>(FMath::Clamp(Frame - A, 0.0, 1.0));
        const TArray<TSharedPtr<FJsonValue>>* AValues = nullptr;
        const TArray<TSharedPtr<FJsonValue>>* BValues = nullptr;
        if (!(*CookedFrames)[A]->TryGetArray(AValues) || !AValues ||
            !(*CookedFrames)[B]->TryGetArray(BValues) || !BValues) { AddError(TEXT("Cooked prop frame malformed")); return false; }
        for (int32 Side = 0; Side < 2; ++Side)
        {
            FTransform Raw, Start, End;
            if (!ReadPropRoot(*AValues, Side * 7, Start) ||
                !ReadPropRoot(*BValues, Side * 7, End)) { AddError(TEXT("Cooked prop root malformed")); return false; }
            const FTransform Cooked = InterpolateRoot(Start, End, Alpha);
            const FQuat SourceRotation(SourceValues[Side * 7 + 3], SourceValues[Side * 7 + 4],
                SourceValues[Side * 7 + 5], SourceValues[Side * 7 + 6]);
            Raw = FTransform(SourceRotation.GetNormalized(), FVector(SourceValues[Side * 7],
                SourceValues[Side * 7 + 1], SourceValues[Side * 7 + 2]));
            const FString SideName = Side == 0 ? TEXT("left") : TEXT("right");
            PropRoot.Include(FVector::Dist(Raw.GetLocation(), Cooked.GetLocation()), Time, SideName);
            PropAngle.Include(AngularErrorDeg(Raw.GetRotation(), Cooked.GetRotation()), Time, SideName);
            for (float Sign : {-1.f, 1.f})
            {
                const FVector Offset(0.f, Sign * TipRadiusCm, 0.f);
                PropTip.Include(FVector::Dist(Raw.TransformPosition(Offset), Cooked.TransformPosition(Offset)),
                    Time, SideName + (Sign < 0.f ? TEXT(" near tip") : TEXT(" far tip")));
            }
        }
        ++SampleCount;
    }
    AddInfo(FString::Printf(TEXT("Parity source=%s cooked=%s prop=%s length=%.2fcm samples=%d bones=%d"),
        *MotionPath, *ProfileName, *PropId, TipRadiusCm * 2.f, SampleCount, BoneCount));
    const auto Report = [&](const TCHAR* Label, const FParityWorst& Worst, double Limit, const TCHAR* Unit)
    {
        const FString Detail = FString::Printf(TEXT("%s maximum %.6f%s at %.6fs (%s), limit %.3f%s"),
            Label, Worst.Error, Unit, Worst.Seconds, *Worst.Name, Limit, Unit);
        AddInfo(Detail);
        TestTrue(*Detail, Worst.Error <= Limit);
    };
    // These tolerances cover asset compression and decimal capture rounding;
    // they are small enough to expose wrong axes, profile or clock mapping.
    Report(TEXT("Body joint position"), BonePosition, .5, TEXT("cm"));
    const auto Diagnose = [&](const TCHAR* Label, const FParityWorst& Worst)
    {
        AddInfo(FString::Printf(TEXT("%s maximum %.6fcm at %.6fs (%s)"),
            Label, Worst.Error, Worst.Seconds, *Worst.Name));
    };
    Diagnose(TEXT("Body key position"), BonePositionKeys);
    Diagnose(TEXT("Body fractional position"), BonePositionFractional);
    Diagnose(TEXT("Body finger position"), BonePositionFingers);
    Diagnose(TEXT("Body other position"), BonePositionOther);
    Report(TEXT("Body joint rotation"), BoneAngle, 1.0, TEXT("deg"));
    Report(TEXT("Prop root position"), PropRoot, .05, TEXT("cm"));
    Report(TEXT("Prop root rotation"), PropAngle, .1, TEXT("deg"));
    Report(TEXT("Prop tip position"), PropTip, .1, TEXT("cm"));

    // Drive the public session on real assets as well as sampling the raw
    // tracks above. The sampled comparison intentionally precedes stance and
    // collision adjustment so those corrections cannot hide wrong input poses.
    FFlowArtsPerformanceSession Session(Avatar, Prop);
    const auto Step = [&](float Seconds)
    {
        World->TimeSeconds += Seconds;
        Body->TickAnimation(Seconds, false);
        Body->RefreshBoneTransforms();
        Avatar->TickComponent(Seconds, LEVELTICK_All, nullptr);
        Prop->TickComponent(Seconds, LEVELTICK_All, nullptr);
    };
    if (!TestTrue(*FString::Printf(TEXT("Play cooked profile: %s"), *Error), Session.Play(*Entry, nullptr, Error))) return false;
    Session.SetRate(1.25f); Session.Pause(true); Session.Seek(static_cast<float>(Duration * .375));
    Step(.05f);
    if (!TestTrue(TEXT("Cooked pause, fractional seek and rate hold"), Session.IsPaused() &&
        FMath::IsNearlyEqual(Session.GetTime(), Duration * .375, .002) && Session.GetRate() == 1.25f)) return false;
    const float Held = Session.GetTime();
    Step(.05f);
    TestTrue(TEXT("Paused cooked clock stays fixed"), Session.GetTime() == Held);
    Session.Pause(false); Session.Seek(static_cast<float>(Duration - .01)); Step(.02f);
    TestTrue(TEXT("Cooked public clock wraps at seam"), Session.GetTime() < .1f);
    if (!TestTrue(*FString::Printf(TEXT("Import same real source through public API: %s"), *Error),
        Session.ImportMotionFile(MotionPath, Error))) return false;
    TestTrue(TEXT("Import installs exact source score and prop"), Avatar->GetRuntimeMotion() == Motion ||
        (Avatar->GetRuntimeMotion().IsValid() &&
         Avatar->GetRuntimeMotion()->GetSequenceSHA256() == Entry->SequenceSHA256 &&
         Avatar->GetRuntimeMotion()->GetPropId() == PropId));
    Session.SetRate(.75f); Session.Pause(true); Session.Seek(static_cast<float>(Duration * .625)); Step(.05f);
    TestTrue(TEXT("Runtime public pause, seek and rate hold"), Session.IsPaused() &&
        FMath::IsNearlyEqual(Session.GetTime(), Duration * .625, .002) && Session.GetRate() == .75f);
    TArray<float> AuthoredAtSeek;
    if (Motion->SamplePropFrame(Session.GetTime(), AuthoredAtSeek) && AuthoredAtSeek.Num() == 28)
    {
        const FVector LeftAuthored(AuthoredAtSeek[0], AuthoredAtSeek[1], AuthoredAtSeek[2]);
        const FVector RightAuthored(AuthoredAtSeek[7], AuthoredAtSeek[8], AuthoredAtSeek[9]);
        AddInfo(FString::Printf(TEXT("Post-evaluation prop root offsets at %.6fs: left %.4fcm, right %.4fcm (stance/collision/entry may adjust these; raw track parity is asserted above)"),
            Session.GetTime(), FVector::Dist(Prop->GetPropRootTransform(true).GetLocation(), LeftAuthored),
            FVector::Dist(Prop->GetPropRootTransform(false).GetLocation(), RightAuthored)));
    }
    Session.Pause(false); Session.Seek(static_cast<float>(Duration - .01)); Step(.03f);
    TestTrue(TEXT("Runtime public clock wraps at seam"), Session.GetTime() < .1f);
    if (!TestTrue(*FString::Printf(TEXT("Transition from runtime source back to real cooked profile: %s"), *Error),
        Session.Play(*Entry, nullptr, Error))) return false;
    Step(.025f);
    TestTrue(TEXT("Original prepared profile restored after runtime playback"),
        Session.GetSelected() == Entry && Avatar->GetPerformanceProfile() == Entry->Profile &&
        !Avatar->GetRuntimeMotion().IsValid());
    return !HasAnyErrors();
}
#endif
