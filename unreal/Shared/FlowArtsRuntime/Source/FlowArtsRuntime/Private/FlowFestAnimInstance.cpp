#include "FlowFestAnimInstance.h"
#include "FlowFestPropComponent.h"
#include "FlowArtsRuntimeMotion.h"

#include "Animation/AnimNodeBase.h"
#include "Animation/AnimSequence.h"
#include "Animation/AnimationPoseData.h"
#include "AnimationRuntime.h"
#include "Animation/Skeleton.h"
#include "Engine/SkeletalMesh.h"
#include "TwoBoneIK.h"
#include "BonePose.h"
#include "HAL/PlatformTime.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Components/SkeletalMeshComponent.h"
#if WITH_EDITOR
#include "Animation/AnimData/IAnimationDataModel.h"
#endif
#include "Dom/JsonObject.h"
#include "HAL/FileManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Engine/World.h"
#include "CollisionQueryParams.h"

DEFINE_LOG_CATEGORY_STATIC(LogFlowFestPoseParity, Log, All);

static FVector ComponentPatternNormal(const FString& CapturePlane,
    const FTransform& MeshPresentation)
{
    // Source Three axes are (right, up, forward). RuntimeMotion converts them
    // to Unreal (forward, -right, up) before removing mesh presentation.
    const FVector SourceNormal = CapturePlane == TEXT("wall") ? FVector::ForwardVector :
        CapturePlane == TEXT("wheel") ? -FVector::RightVector :
        CapturePlane == TEXT("floor") ? FVector::UpVector : FVector::ZeroVector;
    return MeshPresentation.InverseTransformVectorNoScale(SourceNormal).GetSafeNormal();
}

static FVector InferPlanarHandNormal(const TArray<FFlowFestStanceSourceFrame>& Frames)
{
    if (Frames.Num() < 4) return FVector::ZeroVector;
    FVector Normals[2];
    for (int32 Side = 0; Side < 2; ++Side)
    {
        const FVector Anchor = Frames[0].Hands[Side];
        FVector Longest = FVector::ZeroVector;
        for (const auto& Frame : Frames)
        {
            const FVector Delta = Frame.Hands[Side] - Anchor;
            if (Delta.SizeSquared() > Longest.SizeSquared()) Longest = Delta;
        }
        if (Longest.SizeSquared() < 25.) return FVector::ZeroVector;
        FVector Cross = FVector::ZeroVector;
        for (const auto& Frame : Frames)
        {
            const FVector Candidate = FVector::CrossProduct(Longest, Frame.Hands[Side] - Anchor);
            if (Candidate.SizeSquared() > Cross.SizeSquared()) Cross = Candidate;
        }
        // A line admits infinitely many planes. Require substantial span in
        // both directions before assigning a depth axis to a legacy clip.
        if (Cross.SizeSquared() < 625.) return FVector::ZeroVector;
        Normals[Side] = Cross.GetSafeNormal();
        for (const auto& Frame : Frames)
            if (FMath::Abs(FVector::DotProduct(Frame.Hands[Side] - Anchor,
                Normals[Side])) > 2.) return FVector::ZeroVector;
    }
    if (FMath::Abs(FVector::DotProduct(Normals[0], Normals[1])) < .95)
        return FVector::ZeroVector;
    FVector Normal = Normals[0];
    FVector Lateral = Frames[0].Shoulders[1] - Frames[0].Shoulders[0];
    Lateral.Z = 0.;
    if (!Lateral.Normalize()) return FVector::ZeroVector;
    const FVector Forward = FVector::CrossProduct(Lateral, FVector::UpVector).GetSafeNormal();
    const FVector Reference = FMath::Abs(FVector::DotProduct(Normal, Forward)) > .25
        ? Forward : Lateral;
    if (FVector::DotProduct(Normal, Reference) < 0.) Normal *= -1.;
    return Normal;
}

static FString CookedSafeClipIdentity(const UAnimSequence* Clip)
{
    if (!Clip) return {};
    const FFrameRate Rate = Clip->GetSamplingFrameRate();
    // The cache key separately carries FObjectKey's index and serial, so a
    // same-path cooked clip reload cannot reuse a dormant track. The editor
    // GUID also detects an in-place edit while that UObject remains live.
    FString Identity = FString::Printf(TEXT("%s:%d:%d:%d"), *Clip->GetPathName(),
        Clip->GetNumberOfSampledKeys(),
        Rate.Numerator, Rate.Denominator);
#if WITH_EDITOR
    if (const IAnimationDataModel* Model = Clip->GetDataModel())
        Identity += TEXT(":") + Model->GenerateGuid().ToString(EGuidFormats::Digits);
#endif
    return Identity;
}

static bool IsSha256(const FString& Value)
{
    if (Value.Len() != 64) return false;
    for (const TCHAR Digit : Value)
        if (!FChar::IsHexDigit(Digit)) return false;
    return true;
}

static bool LoadStanceTurnMetadata(const FString& Folder,
    FFlowFestStanceTurn (&Turns)[2], FString (&Content)[2])
{
    static TSharedPtr<FJsonObject> Catalog;
    static bool bLoaded = false;
    if (!bLoaded)
    {
        bLoaded = true;
        FString Text;
        if (FFileHelper::LoadFileToString(Text, *(FPaths::ProjectContentDir() / TEXT("Data/characters.json"))))
            FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Catalog);
    }
    if (!Catalog.IsValid()) return false;
    const TArray<TSharedPtr<FJsonValue>>* Characters = nullptr;
    if (!Catalog->TryGetArrayField(TEXT("characters"), Characters)) return false;
    for (const TSharedPtr<FJsonValue>& Value : *Characters)
    {
        const TSharedPtr<FJsonObject> Character = Value->AsObject();
        if (!Character.IsValid() || Character->GetStringField(TEXT("folder")) != Folder) continue;
        const TSharedPtr<FJsonObject>* Retarget = nullptr;
        if (!Character->TryGetObjectField(TEXT("turnRetarget"), Retarget)) return false;
        for (int32 Turn = 0; Turn < 2; ++Turn)
        {
            const TSharedPtr<FJsonObject>* Clip = nullptr;
            if (!(*Retarget)->TryGetObjectField(Turn == 0 ? TEXT("TurnLeft") : TEXT("TurnRight"), Clip))
                return false;
            FString Asset, SourceSha, FbxSha;
            if (!(*Clip)->TryGetStringField(TEXT("asset"), Asset) ||
                !(*Clip)->TryGetStringField(TEXT("sourceSha256"), SourceSha) ||
                !(*Clip)->TryGetStringField(TEXT("fbxSha256"), FbxSha) ||
                !IsSha256(SourceSha) || !IsSha256(FbxSha)) return false;
            const TCHAR* Name = Turn == 0 ? TEXT("A_TurnLeft") : TEXT("A_TurnRight");
            if (Asset != FString::Printf(TEXT("%s/%s.%s"), *Folder, Name, Name)) return false;
            Content[Turn] = Asset + TEXT(":") + SourceSha + TEXT(":") + FbxSha;
            FFlowFestStanceTurn& Out = Turns[Turn];
            Out.Duration = (*Clip)->GetNumberField(TEXT("durationSeconds"));
            Out.HeadingDegrees = (*Clip)->GetNumberField(TEXT("headingDegrees"));
            const int32 Frames = static_cast<int32>((*Clip)->GetNumberField(TEXT("frameCount")));
            if (Frames < 2 || Frames > 120 || !FMath::IsFinite(Out.Duration) ||
                Out.Duration <= 0. || !FMath::IsFinite(Out.HeadingDegrees)) return false;
            Out.Frames.SetNum(Frames);
            const TSharedPtr<FJsonObject>* Windows = nullptr;
            if (!(*Clip)->TryGetObjectField(TEXT("supportWindows"), Windows)) return false;
            for (int32 Side = 0; Side < 2; ++Side)
            {
                const TArray<TSharedPtr<FJsonValue>>* Spans = nullptr;
                if (!(*Windows)->TryGetArrayField(Side == 0 ? TEXT("left") : TEXT("right"), Spans) ||
                    Spans->Num() < 2) return false;
                double Longest = -1.;
                for (int32 Span = 0; Span + 1 < Spans->Num(); ++Span)
                {
                    const auto Before = (*Spans)[Span]->AsObject();
                    const auto After = (*Spans)[Span + 1]->AsObject();
                    if (!Before.IsValid() || !After.IsValid()) return false;
                    const double Departure = Before->GetNumberField(TEXT("endSeconds"));
                    const double Landing = After->GetNumberField(TEXT("startSeconds"));
                    if (Landing - Departure > Longest)
                    {
                        Longest = Landing - Departure;
                        Out.SwingStart[Side] = Departure;
                        Out.SwingEnd[Side] = Landing;
                    }
                }
                if (!(Out.SwingStart[Side] >= 0. && Out.SwingEnd[Side] > Out.SwingStart[Side] &&
                    Out.SwingEnd[Side] <= Out.Duration)) return false;
            }
        }
        return true;
    }
    return false;
}

static bool BuildStancePrototype(const TArray<FFlowFestStanceKnot>& Knots,
    FFlowFestStanceTurn (&Turns)[2], double Duration, const FVector& GroundOrigin,
    const FVector& GroundNormal, const FVector& PatternNormal, const FVector& WorldScale,
    FFlowFestStancePlan& Out, FString& Error)
{
    Error.Reset();
    if (Knots.Num() < 4 || Knots.Num() % 2 != 0 || !Knots[0].Pose.IsValid())
    { Error = TEXT("Invalid captured source knots"); return false; }
    if (WorldScale.ContainsNaN() || WorldScale.X <= 0. ||
        !FMath::IsNearlyEqual(WorldScale.X, WorldScale.Y, .001 * WorldScale.X) ||
        !FMath::IsNearlyEqual(WorldScale.X, WorldScale.Z, .001 * WorldScale.X))
    { Error = TEXT("Unsupported mesh world scale"); return false; }
    TArray<FFlowFestStanceSourceFrame> Frames;
    Frames.Reserve(Knots.Num() / 2);
    for (int32 Index = 0; Index < Knots.Num(); Index += 2)
    {
        const auto& Pose = Knots[Index].Pose;
        if (!Pose.IsValid())
        { Error = FString::Printf(TEXT("Invalid source pose at knot %d"), Index); return false; }
        FFlowFestStanceSourceFrame Frame;
        Frame.Seconds = Knots[Index].Seconds;
        for (int32 Side = 0; Side < 2; ++Side)
        {
            Frame.Shoulders[Side] = Pose.Components[Pose.Upper[Side + 2]].GetLocation();
            Frame.Hands[Side] = Pose.Components[Pose.End[Side + 2]].GetLocation();
        }
        Frames.Add(Frame);
    }
    Out.Duration = Duration;
    Out.Outward = MoveTemp(Turns[1]);
    Out.Return = MoveTemp(Turns[0]);
    Out.HipPivot = Knots[0].Pose.Components[Knots[0].Pose.Hips].GetLocation();
    Out.GroundOrigin = GroundOrigin;
    Out.GroundNormal = GroundNormal;
    Out.PatternNormal = PatternNormal.IsNearlyZero() ? InferPlanarHandNormal(Frames) : PatternNormal;
    Out.bGroundValidated = !GroundNormal.ContainsNaN() &&
        FMath::Abs(GroundNormal.SizeSquared() - 1.) < 1.e-4 && GroundNormal.Z > .996;
    Out.GroundPenetrationToleranceCm = .5 / WorldScale.X;
    Out.GroundContactToleranceCm = 2. / WorldScale.X;
    Out.SwingFootLiftCm = 2. / WorldScale.X;
    TArray<FVector> FootSurfaces[2];
    if (!Knots[0].Clearance.EvaluateFootSurfaces ||
        !Knots[0].Clearance.EvaluateFootSurfaces(Knots[0].Pose.Components,
            FootSurfaces[0], FootSurfaces[1]) ||
        FootSurfaces[0].IsEmpty() || FootSurfaces[1].IsEmpty())
    { Error = TEXT("Initial foot surfaces unavailable"); return false; }
    if (!Out.InitializeGroundedSupport(Knots[0].Pose, FootSurfaces,
        5. / WorldScale.X, &Error)) return false;
    if (!FFlowFestStancePlan::SeedTiming(Frames, Duration, Out.Outward.Duration,
        Out.Return.Duration, Out.Controls, Error)) return false;
    FVector Lateral = Frames[0].Shoulders[1] - Frames[0].Shoulders[0];
    Lateral.Z = 0.;
    if (!Lateral.Normalize())
    { Error = TEXT("Degenerate initial shoulder frame"); return false; }
    const FVector Forward = FVector::CrossProduct(Lateral, FVector::UpVector).GetSafeNormal();
    Out.Controls.HeadingDegrees = 90.;
    Out.Controls.HipTranslationCm = Forward * 20. + Lateral * 10.;
    return Out.IsValid(&Error);
}

void UFlowFestAnimInstance::Configure(const TMap<FName, TObjectPtr<UAnimSequence>>& InMotions,
    const FString& InCharacterFolder)
{
    MotionClips.Empty(); MotionNames.Empty(); MotionTimes.Empty(); MotionRates.Empty(); MotionTargetRates.Empty(); MotionWeights.Empty();
    CharacterFolderPath = InCharacterFolder;
    IdleGripFamily = NAME_None;
    IdleGripClip = nullptr;
    for (int32 Turn = 0; Turn < 2; ++Turn)
    {
        StanceTurnClips[Turn] = nullptr;
        StanceTurnMetadata[Turn] = {};
        StanceTurnContent[Turn].Reset();
    }
    FFlowFestStanceTurn LoadedTurns[2];
    FString LoadedContent[2];
    if (LoadStanceTurnMetadata(InCharacterFolder, LoadedTurns, LoadedContent))
        for (int32 Turn = 0; Turn < 2; ++Turn)
        {
            const TCHAR* Name = Turn == 0 ? TEXT("A_TurnLeft") : TEXT("A_TurnRight");
            const FString Path = FString::Printf(TEXT("%s/%s.%s"), *InCharacterFolder, Name, Name);
            UAnimSequence* Clip = LoadObject<UAnimSequence>(nullptr, *Path);
            const USkeletalMeshComponent* Body = GetSkelMeshComponent();
            if (!Clip || !Body || !Body->GetSkeletalMeshAsset() ||
                Clip->GetSkeleton() != Body->GetSkeletalMeshAsset()->GetSkeleton() ||
                FMath::Abs(Clip->GetPlayLength() - LoadedTurns[Turn].Duration) > .02) continue;
            StanceTurnClips[Turn] = Clip;
            StanceTurnMetadata[Turn] = MoveTemp(LoadedTurns[Turn]);
            StanceTurnContent[Turn] = LoadedContent[Turn] + TEXT(":") +
                CookedSafeClipIdentity(Clip);
        }
    for (const auto& Pair : InMotions)
    {
        MotionNames.Add(Pair.Key);
        MotionClips.Add(Pair.Value);
        MotionTimes.Add(0.f);
        MotionRates.Add(1.f);
        MotionTargetRates.Add(1.f);
        MotionWeights.Add(Pair.Key == TEXT("Idle") ? 1.f : 0.f);
    }
    TargetMotion = TEXT("Idle");
    PerformanceClip = nullptr;
    PerformanceClipContentIdentity.Reset();
    PerformanceMotion.Reset();
    RuntimePosePolicy = EFlowFestRuntimePosePolicy::GameClearance;
    PerformanceProfile = NAME_None;
    OutgoingPerformanceClips.Empty();
    OutgoingPerformanceMotions.Empty();
    OutgoingPerformanceTimes.Empty();
    OutgoingPerformanceWeights.Empty();
    OutgoingPerformanceRates.Empty();
    OutgoingPerformanceLoops.Empty();
    OutgoingPerformanceProfiles.Empty();
    PerformanceTime = 0.f;
    PerformanceWeight = 0.f;
    PerformanceRate = 1.f;
    bPerformanceTarget = false;
    bPerformancePaused = false;
    ActivityPose = {};
    ActivityWeight = 0.f;
    ++PoseDiscontinuity;
    FString EnvelopeError;
    ArmEnvelope = {};
    if (const USkeletalMeshComponent* Mesh = GetSkelMeshComponent())
        if (!FFlowArtsArmClearance::MeasureRig(Mesh->GetSkeletalMeshAsset(), ArmEnvelope, EnvelopeError))
            UE_LOG(LogTemp, Warning, TEXT("Flow arm envelope %s: %s"), *InCharacterFolder, *EnvelopeError);
}

bool UFlowFestAnimInstance::SetMotion(FName Name)
{
    if (!MotionNames.Contains(Name)) return false;
    if (Name != TargetMotion && (Name == TEXT("Jump") || Name == TEXT("Land")))
    {
        const int32 Index = MotionNames.IndexOfByKey(Name);
        if (MotionTimes.IsValidIndex(Index)) MotionTimes[Index] = 0.f;
    }
    TargetMotion = Name;
    return true;
}

void UFlowFestAnimInstance::SetMotionRate(FName Name, float Rate)
{
    const int32 Index = MotionNames.IndexOfByKey(Name);
    if (MotionTargetRates.IsValidIndex(Index) && FMath::IsFinite(Rate))
        MotionTargetRates[Index] = FMath::Clamp(Rate, .55f, 2.4f);
}

void UFlowFestAnimInstance::SetMotionTime(FName Name, float Seconds)
{
    const int32 Index = MotionNames.IndexOfByKey(Name);
    if (MotionTimes.IsValidIndex(Index) && MotionClips.IsValidIndex(Index) && MotionClips[Index] && FMath::IsFinite(Seconds))
        MotionTimes[Index] = FMath::Clamp(Seconds, 0.f, MotionClips[Index]->GetPlayLength());
}

float UFlowFestAnimInstance::GetMotionRate(FName Name) const
{
    const int32 Index = MotionNames.IndexOfByKey(Name);
    return MotionRates.IsValidIndex(Index) ? MotionRates[Index] : 0.f;
}

float UFlowFestAnimInstance::GetMotionTime(FName Name) const
{
    const int32 Index = MotionNames.IndexOfByKey(Name);
    return MotionTimes.IsValidIndex(Index) ? MotionTimes[Index] : 0.f;
}

void UFlowFestAnimInstance::StartPerformance(UAnimSequence* Clip, bool bLoop, FName Profile)
{
    // Keep the outgoing pose alive across StopPerformance/StartPerformance in
    // the same frame. The next clip starts at zero weight, so a routine switch
    // has a real source pose to fade from even when locomotion is fully faded.
    if ((PerformanceClip || PerformanceMotion) && PerformanceWeight > .0001f)
    {
        OutgoingPerformanceClips.Add(PerformanceClip);
        OutgoingPerformanceMotions.Add(PerformanceMotion);
        OutgoingPerformanceTimes.Add(PerformanceTime);
        OutgoingPerformanceWeights.Add(PerformanceWeight);
        OutgoingPerformanceRates.Add(PerformanceRate);
        OutgoingPerformanceLoops.Add(bPerformanceLoop);
        OutgoingPerformanceProfiles.Add(PerformanceProfile);
    }
    // An interrupted A -> B -> A switch can find A still fading out. Resume
    // that exact clip and clock instead of evaluating two copies of A on
    // opposite sides of B in a sequential skeletal rotation blend. Besides
    // avoiding a one-frame pose jump, this preserves its existing blend weight.
    float ResumedTime = 0.f;
    float ResumedWeight = 0.f;
    for (int32 Index = OutgoingPerformanceClips.Num() - 1; Index >= 0; --Index)
    {
        if (bPhraseFreshClock || // Phrase stage
            OutgoingPerformanceClips[Index] != Clip || OutgoingPerformanceProfiles[Index] != Profile)
            continue;
        ResumedTime = OutgoingPerformanceTimes[Index];
        ResumedWeight = OutgoingPerformanceWeights[Index];
        OutgoingPerformanceClips.RemoveAt(Index);
        OutgoingPerformanceMotions.RemoveAt(Index);
        OutgoingPerformanceTimes.RemoveAt(Index);
        OutgoingPerformanceWeights.RemoveAt(Index);
        OutgoingPerformanceRates.RemoveAt(Index);
        OutgoingPerformanceLoops.RemoveAt(Index);
        OutgoingPerformanceProfiles.RemoveAt(Index);
        break;
    }
    PerformanceClip = Clip;
    PerformanceClipContentIdentity = CookedSafeClipIdentity(Clip);
    PerformanceMotion.Reset();
    RuntimePosePolicy = EFlowFestRuntimePosePolicy::GameClearance;
    PerformanceProfile = Profile;
    PerformanceTime = ResumedTime;
    PerformanceWeight = ResumedWeight;
    PerformanceRate = 1.f;
    bPerformanceLoop = bLoop;
    bPerformanceTarget = true;
    bPerformancePaused = false;
}

void UFlowFestAnimInstance::StartRuntimePerformance(TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Motion,
    EFlowFestRuntimePosePolicy PosePolicy)
{
    if (!Motion) return;
    StartPerformance(nullptr, Motion->IsLooping(), Motion->GetProfile());
    PerformanceMotion = MoveTemp(Motion);
    RuntimePosePolicy = PosePolicy;
}

// Phrase stage
void UFlowFestAnimInstance::StartPhraseRoutine(TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Motion,
    float StartSeconds, float BlendSeconds)
{
    if (!Motion) return;
    bPhraseFreshClock = true;
    StartRuntimePerformance(MoveTemp(Motion));
    bPhraseFreshClock = false;
    PhraseBlendSeconds = FMath::Max(0.f, BlendSeconds);
    const float Length = GetPerformanceLength();
    PerformanceTime = bPerformanceLoop && Length > SMALL_NUMBER ? FMath::Fmod(FMath::Fmod(StartSeconds, Length) + Length, Length)
        : FMath::Clamp(StartSeconds, 0.f, Length);
}

float UFlowFestAnimInstance::GetPerformanceLength() const
{
    return PerformanceMotion ? PerformanceMotion->GetDurationSeconds()
        : PerformanceClip ? PerformanceClip->GetPlayLength() : 0.f;
}

void UFlowFestAnimInstance::SetGripSource(UFlowFestPropComponent* Prop)
{
    GripSource = Prop;
    IdleGripFamily = NAME_None;
    IdleGripClip = nullptr;
}

void UFlowFestAnimInstance::UpdateIdleGripClip()
{
    if (!GripSource.IsValid() || !GripSource->HasVisibleGrip()) return;
    FString Family = GripSource->GetPropId().ToString().ToLower();
    int32 Colon = INDEX_NONE;
    if (Family.FindChar(TEXT(':'), Colon)) Family.LeftInline(Colon);
    if (Family.IsEmpty() || FName(*Family) == IdleGripFamily) return;
    IdleGripFamily = FName(*Family);
    // The web applies SQUARE to every equipped prop, then calibrates finger
    // contact against that family's geometry. Use a settled authored frame
    // from the matching rig and family for idle and travel only.
    const FString Name = FString::Printf(TEXT("A_Flow_P_%s_A"), *Family);
    const FString Path = FString::Printf(TEXT("%s/%s.%s"), *CharacterFolderPath, *Name, *Name);
    UAnimSequence* Clip = LoadObject<UAnimSequence>(nullptr, *Path);
    const USkeletalMeshComponent* Mesh = GetSkelMeshComponent();
    IdleGripClip = Clip && Mesh && Mesh->GetSkeletalMeshAsset() &&
        Clip->GetSkeleton() == Mesh->GetSkeletalMeshAsset()->GetSkeleton() && Clip->GetPlayLength() >= 4.f
        ? Clip : nullptr;
    if (!IdleGripClip)
        UE_LOG(LogTemp, Error, TEXT("Missing or mismatched Flow Fest grip capture: %s"), *Path);
}

void UFlowFestAnimInstance::StopPerformance()
{
    bPerformanceTarget = false;
    bPerformancePaused = false;
    TargetMotion = TEXT("Idle");
}

void UFlowFestAnimInstance::SetPerformancePhase(float NormalizedPhase)
{
    if (bPerformanceTarget && GetPerformanceLength() > 0.f && FMath::IsFinite(NormalizedPhase))
    {
        PerformanceTime = (bPerformanceLoop ? FMath::Frac(FMath::Max(0.f, NormalizedPhase))
            : FMath::Clamp(NormalizedPhase, 0.f, 1.f)) * GetPerformanceLength();
        ++PoseDiscontinuity;
    }
}

void UFlowFestAnimInstance::SetPerformanceRate(float Rate)
{
    if (FMath::IsFinite(Rate)) PerformanceRate = FMath::Clamp(Rate, .5f, 1.75f);
}

void UFlowFestAnimInstance::SetPerformancePaused(bool bPaused)
{
    if (bPerformanceTarget && GetPerformanceLength() > 0.f) bPerformancePaused = bPaused;
}

void UFlowFestAnimInstance::SettlePerformanceBlend()
{
    ++PoseDiscontinuity;
    // A transport jump names one exact pose. Keeping an outgoing clip at its
    // previous clock would blend that pose with an unrelated instant.
    OutgoingPerformanceClips.Empty();
    OutgoingPerformanceMotions.Empty();
    OutgoingPerformanceTimes.Empty();
    OutgoingPerformanceWeights.Empty();
    OutgoingPerformanceRates.Empty();
    OutgoingPerformanceLoops.Empty();
    OutgoingPerformanceProfiles.Empty();
    PerformanceWeight = 1.f;
    for (float& Weight : MotionWeights) Weight = 0.f;
}

void UFlowFestAnimInstance::SeekPerformance(float Seconds)
{
    if (!bPerformanceTarget || GetPerformanceLength() <= 0.f || !FMath::IsFinite(Seconds)) return;
    const float Length = GetPerformanceLength();
    PerformanceTime = FMath::Clamp(Seconds, 0.f, FMath::Max(0.f, Length));
    SettlePerformanceBlend();
}

void UFlowFestAnimInstance::RestartPerformance()
{
    if (!bPerformanceTarget || GetPerformanceLength() <= 0.f) return;
    SeekPerformance(0.f);
    bPerformancePaused = false;
}

float UFlowFestAnimInstance::GetMotionWeight(FName Name) const
{
    const int32 Index = MotionNames.IndexOfByKey(Name);
    return MotionWeights.IsValidIndex(Index) ? MotionWeights[Index] : 0.f;
}

float UFlowFestAnimInstance::GetOutgoingPerformanceWeight() const
{
    float Sum = 0.f;
    for (const float Weight : OutgoingPerformanceWeights) Sum += Weight;
    return Sum;
}

bool UFlowFestAnimInstance::GetOutgoingPerformanceSample(int32 Index, float& Seconds, float& Weight, FName& Profile) const
{
    if (!OutgoingPerformanceTimes.IsValidIndex(Index)) return false;
    Seconds = OutgoingPerformanceTimes[Index];
    Weight = OutgoingPerformanceWeights[Index];
    Profile = OutgoingPerformanceProfiles[Index];
    return true;
}

void UFlowFestAnimInstance::SetFootCorrection(float LeftCm, float RightCm)
{
    FootCorrectionCm[0] = FMath::Clamp(LeftCm, -12.f, 14.f);
    FootCorrectionCm[1] = FMath::Clamp(RightCm, -12.f, 14.f);
}

void UFlowFestAnimInstance::SetActivityPose(EFlowFestBodyActivity Activity, float ElapsedSeconds, float ExitSecondsRemaining)
{
    if (!FMath::IsFinite(ElapsedSeconds) || !FMath::IsFinite(ExitSecondsRemaining)) return;
    // Keep the departing action while its weight falls, so cancelling an
    // intention does not pop straight back to the locomotion pose.
    if (Activity != EFlowFestBodyActivity::None)
    {
        ActivityPose.Activity = Activity;
        ActivityPose.ElapsedSeconds = FMath::Max(0.f, ElapsedSeconds);
        ActivityPose.ExitSecondsRemaining = ExitSecondsRemaining;
    }
    ActivityPose.Weight = Activity == EFlowFestBodyActivity::None ? 0.f : 1.f;
}

const FFlowArtsArmClearanceResult& UFlowFestAnimInstance::GetArmClearance() const
{
    return GetProxyOnGameThread<FFlowFestAnimProxy>().GetArmClearance();
}

bool UFlowFestAnimInstance::WasPreparedSeedApplied() const
{
    return GetProxyOnGameThread<FFlowFestAnimProxy>().WasPreparedSeedApplied();
}

bool UFlowFestAnimInstance::IsGroundedStanceActive() const
{
    return GetProxyOnGameThread<FFlowFestAnimProxy>().IsGroundedStanceActive();
}

#if WITH_DEV_AUTOMATION_TESTS
bool UFlowFestAnimInstance::IsPreparedMotionReady() const
{
    return GetProxyOnGameThread<FFlowFestAnimProxy>().IsPreparedMotionReady();
}

bool UFlowFestAnimInstance::IsPreparedMotionFailed() const
{
    return GetProxyOnGameThread<FFlowFestAnimProxy>().IsPreparedMotionFailed();
}

#endif

bool UFlowFestAnimInstance::GetCertifiedPropSample(FTransform (&Roots)[2], FQuat (&Visuals)[2]) const
{
    return GetProxyOnGameThread<FFlowFestAnimProxy>().GetCertifiedPropSample(Roots, Visuals);
}

bool UFlowFestAnimInstance::GetEvaluatedPalmLocalOffsets(FVector (&Offsets)[2]) const
{
    return GetProxyOnGameThread<FFlowFestAnimProxy>().GetEvaluatedPalmLocalOffsets(Offsets);
}

// Phrase stage
FFlowFestLowerBodyLayerResult UFlowFestAnimInstance::GetLowerBodyLayerResult() const
{
    return GetProxyOnGameThread<FFlowFestAnimProxy>().GetLowerBodyLayerResult();
}

bool FFlowFestAnimProxy::GetEvaluatedPalmLocalOffsets(FVector (&Offsets)[2]) const
{
    if (!bEvaluatedPalmOffsetsValid) return false;
    Offsets[0] = PalmLocalOffset[0];
    Offsets[1] = PalmLocalOffset[1];
    return true;
}

bool FFlowFestAnimProxy::GetCertifiedPropSample(FTransform (&Roots)[2], FQuat (&Visuals)[2]) const
{
    if (!bSampledPropRootsValid) return false;
    for (int32 Side = 0; Side < 2; ++Side)
    {
        Roots[Side] = SampledPropRootAvatar[Side];
        Visuals[Side] = SampledPropVisual[Side];
    }
    return true;
}

void UFlowFestAnimInstance::Advance(float DeltaSeconds)
{
    if (!FMath::IsFinite(DeltaSeconds)) return;
    if (bPerformancePaused && bPerformanceTarget && GetPerformanceLength() > 0.f) return;
    const float Dt = FMath::Clamp(DeltaSeconds, 0.f, .1f);
    if (ActivityPose.Weight == 0.f) ActivityPose.ElapsedSeconds += Dt;
    ActivityWeight = FMath::Lerp(ActivityWeight, bPerformanceTarget ? 0.f : ActivityPose.Weight,
        1.f - FMath::Exp(-Dt / .20f));
    // All channels have continuous, independent clocks. A newly selected gait
    // never snaps a pose back to its first frame while its weight is rising.
    for (int32 Index = 0; Index < MotionClips.Num(); ++Index)
    {
        MotionRates[Index] = FMath::Lerp(MotionRates[Index], MotionTargetRates[Index], 1.f - FMath::Exp(-Dt / .12f));
        if (const UAnimSequence* Clip = MotionClips[Index])
        {
            const float Length = Clip->GetPlayLength();
            if (Length > SMALL_NUMBER)
            {
                const bool bOneShot = MotionNames[Index] == TEXT("Jump") || MotionNames[Index] == TEXT("Land");
                MotionTimes[Index] = bOneShot
                    ? FMath::Min(MotionTimes[Index] + Dt * MotionRates[Index], Length)
                    : FMath::Fmod(MotionTimes[Index] + Dt * MotionRates[Index], Length);
            }
        }
    }
    if (PerformanceClip || PerformanceMotion)
    {
        const float Length = GetPerformanceLength();
        if (Length > SMALL_NUMBER)
            PerformanceTime = bPerformanceLoop
                ? FMath::Fmod(PerformanceTime + Dt * PerformanceRate, Length)
                : FMath::Min(PerformanceTime + Dt * PerformanceRate, Length);
        // Phrase stage: the stage's score names this frame's routine time exactly.
        if (bPhraseClockPending && Length > SMALL_NUMBER)
            PerformanceTime = bPerformanceLoop ? FMath::Fmod(FMath::Fmod(PhraseClockSeconds, Length) + Length, Length)
                : FMath::Clamp(PhraseClockSeconds, 0.f, Length);
    }
    bPhraseClockPending = false; // Phrase stage
    for (int32 Index = 0; Index < OutgoingPerformanceClips.Num(); ++Index)
    {
        const float Length = OutgoingPerformanceMotions[Index]
            ? OutgoingPerformanceMotions[Index]->GetDurationSeconds()
            : OutgoingPerformanceClips[Index]->GetPlayLength();
        if (Length > SMALL_NUMBER)
            OutgoingPerformanceTimes[Index] = OutgoingPerformanceLoops[Index]
                ? FMath::Fmod(OutgoingPerformanceTimes[Index] + Dt * OutgoingPerformanceRates[Index], Length)
                : FMath::Min(OutgoingPerformanceTimes[Index] + Dt * OutgoingPerformanceRates[Index], Length);
    }
    // A finite response time creates true per-bone pose blends, including
    // interrupted transitions, rather than swapping PlayAnimation assets.
    const float MotionAlpha = 1.f - FMath::Exp(-Dt / .18f);
    // Source wrist paths can move sharply at a routine switch. Give the
    // incoming and outgoing performance poses time to meet at the grip.
    // Phrase stage: a phrase switch asks for its own blend (about 95% done after BlendSeconds).
    const float PerformanceAlpha = 1.f - FMath::Exp(-Dt / (PhraseBlendSeconds > 0.f ? PhraseBlendSeconds / 3.f : .30f));
    for (int32 Index = 0; Index < MotionWeights.Num(); ++Index)
    {
        const float Goal = MotionNames[Index] == TargetMotion && !bPerformanceTarget ? 1.f : 0.f;
        MotionWeights[Index] = FMath::Lerp(MotionWeights[Index], Goal, MotionAlpha);
    }
    PerformanceWeight = FMath::Lerp(PerformanceWeight, bPerformanceTarget ? 1.f : 0.f, PerformanceAlpha);
    for (int32 Index = OutgoingPerformanceWeights.Num() - 1; Index >= 0; --Index)
    {
        OutgoingPerformanceWeights[Index] *= 1.f - PerformanceAlpha;
        if (OutgoingPerformanceWeights[Index] < .0001f)
        {
            OutgoingPerformanceClips.RemoveAt(Index);
            OutgoingPerformanceMotions.RemoveAt(Index);
            OutgoingPerformanceTimes.RemoveAt(Index);
            OutgoingPerformanceWeights.RemoveAt(Index);
            OutgoingPerformanceRates.RemoveAt(Index);
            OutgoingPerformanceLoops.RemoveAt(Index);
            OutgoingPerformanceProfiles.RemoveAt(Index);
        }
    }
    if (!bPerformanceTarget && PerformanceWeight < .0001f)
    {
        PerformanceWeight = 0.f;
        PerformanceClip = nullptr;
        PerformanceMotion.Reset();
        RuntimePosePolicy = EFlowFestRuntimePosePolicy::GameClearance;
        PerformanceTime = 0.f;
    }
    // Locomotion and performance have different response times. Keep their
    // combined blend normalized so the pose never gains or loses influence.
    float TotalWeight = PerformanceWeight;
    for (const float Weight : MotionWeights) TotalWeight += Weight;
    for (const float Weight : OutgoingPerformanceWeights) TotalWeight += Weight;
    if (TotalWeight > SMALL_NUMBER)
    {
        const float InvTotal = 1.f / TotalWeight;
        PerformanceWeight *= InvTotal;
        for (float& Weight : MotionWeights) Weight *= InvTotal;
        for (float& Weight : OutgoingPerformanceWeights) Weight *= InvTotal;
    }
}

FAnimInstanceProxy* UFlowFestAnimInstance::CreateAnimInstanceProxy()
{
    return new FFlowFestAnimProxy(this);
}

void UFlowFestAnimInstance::DestroyAnimInstanceProxy(FAnimInstanceProxy* InProxy)
{
    delete static_cast<FFlowFestAnimProxy*>(InProxy);
}

namespace
{
bool ExactClearanceTransform(const FTransform& A, const FTransform& B)
{
    const FVector AP = A.GetTranslation(), BP = B.GetTranslation();
    const FVector AS = A.GetScale3D(), BS = B.GetScale3D();
    const FQuat AQ = A.GetRotation(), BQ = B.GetRotation();
    return AP.X == BP.X && AP.Y == BP.Y && AP.Z == BP.Z &&
        AS.X == BS.X && AS.Y == BS.Y && AS.Z == BS.Z &&
        AQ.X == BQ.X && AQ.Y == BQ.Y && AQ.Z == BQ.Z && AQ.W == BQ.W;
}
}

bool FFlowFestClearanceMemoKey::Equals(const FFlowFestClearanceMemoKey& Other) const
{
    if (Skeleton != Other.Skeleton || Mesh != Other.Mesh || Skin != Other.Skin ||
        Generation != Other.Generation || Flags != Other.Flags ||
        ComponentToWorldScale.X != Other.ComponentToWorldScale.X ||
        ComponentToWorldScale.Y != Other.ComponentToWorldScale.Y ||
        ComponentToWorldScale.Z != Other.ComponentToWorldScale.Z ||
        SkeletonIndices != Other.SkeletonIndices || LocalPose.Num() != Other.LocalPose.Num()) return false;
    for (int32 Index = 0; Index < LocalPose.Num(); ++Index)
        if (!ExactClearanceTransform(LocalPose[Index], Other.LocalPose[Index])) return false;
    for (int32 Side = 0; Side < 2; ++Side)
    {
        if (Props[Side].Num() != Other.Props[Side].Num()) return false;
        for (int32 Index = 0; Index < Props[Side].Num(); ++Index)
        {
            const auto& A = Props[Side][Index];
            const auto& B = Other.Props[Side][Index];
            if (A.Start.X != B.Start.X || A.Start.Y != B.Start.Y || A.Start.Z != B.Start.Z ||
                A.End.X != B.End.X || A.End.Y != B.End.Y || A.End.Z != B.End.Z || A.RadiusCm != B.RadiusCm) return false;
        }
    }
    return true;
}

void FFlowFestAnimProxy::Initialize(UAnimInstance* Instance)
{
    ReleasePendingPreparedKnots();
    SetPreparedTrack(nullptr);
    FAnimInstanceProxy::Initialize(Instance);
    bClearanceMemoValid = false;
    ArmClearanceHistory.Reset();
}

FFlowFestAnimProxy::~FFlowFestAnimProxy()
{
    ReleasePendingPreparedKnots();
    SetPreparedTrack(nullptr);
}

void FFlowFestAnimProxy::ReleasePendingPreparedKnots()
{
    for (auto& Pending : PendingPreparedKnots)
    {
        Pending.Release();
        Pending = {};
    }
    PendingPreparedKnotCount = 0;
}

void FFlowFestAnimProxy::SetPreparedTrack(
    TSharedPtr<FFlowFestPreparedMotionEntry, ESPMode::ThreadSafe> Next)
{
    // Track acquisition and consumer changes are serialized by the proxy's game-thread lifecycle.
    if (PreparedTrack == Next) return;
    if (Next.IsValid()) Next->AddConsumer();
    if (PreparedTrack.IsValid()) PreparedTrack->RemoveConsumer();
    PreparedTrack = MoveTemp(Next);
    bStanceEntryRamping = false;
    bStanceEntryFeetCaptured = false;
    StanceEntryCaptureAttempts = 0;
}

bool FFlowFestAnimProxy::ValidateStanceGroundPoint(const FTransform& ComponentFoot,
    const FVector* FootProbesLocal, const UWorld* World, const AActor* Owner,
    double MaxPenetrationCm) const
{
    if (!World || !Owner || !FootProbesLocal || ComponentFoot.ContainsNaN()) return false;
    const FVector ExpectedGround = MeshToWorld.TransformPosition(StanceGroundOrigin);
    const FVector ExpectedNormal = MeshToWorld.TransformVectorNoScale(StanceGroundNormal).GetSafeNormal();
    FCollisionQueryParams Query(SCENE_QUERY_STAT(FlowFestStanceFootGround), false, Owner);
    for (int32 Probe = 0; Probe < FFlowFestStancePlan::TerrainProbeCount; ++Probe)
    {
        if (FootProbesLocal[Probe].ContainsNaN()) return false;
        const FVector PointWorld = MeshToWorld.TransformPosition(
            ComponentFoot.TransformPosition(FootProbesLocal[Probe]));
        FHitResult Hit;
        if (!World->LineTraceSingleByChannel(Hit, PointWorld + FVector(0, 0, 40),
            PointWorld - FVector(0, 0, 250), ECC_Visibility, Query) ||
            !Hit.GetComponent() || Hit.GetComponent()->GetMobility() != EComponentMobility::Static ||
            Hit.ImpactNormal.Z < .996 ||
            FMath::Abs(FVector::DotProduct(Hit.ImpactPoint - ExpectedGround,
                ExpectedNormal)) > 1.5 ||
            (MaxPenetrationCm >= 0. && FVector::DotProduct(PointWorld - Hit.ImpactPoint,
                ExpectedNormal) < -MaxPenetrationCm)) return false;
    }
    return true;
}

#if WITH_DEV_AUTOMATION_TESTS
bool FFlowFestAnimProxy::FailLegacyPreparationForTests()
{
    if (!PreparedTrack.IsValid() || PreparedTrack->IsStanceTrack()) return false;
    PreparedTrack->MarkFailedForTests();
    return PreparedTrack->IsFailed();
}

FString FFlowFestAnimProxy::DescribePreparationForTests() const
{
    return FString::Printf(TEXT("%s requested=%d ground=%d groundChecked=%d groundRejected=%d moved=%d turnClips=%d/%d turnContent=%d/%d"),
        PreparedTrack.IsValid() ? *PreparedTrack->DescribeForTests() : TEXT("no track"),
        bStanceRequested, bStanceGroundValid, bStanceGroundChecked, bStanceGroundRejected,
        bStanceMoved, StanceTurnClips[0] != nullptr, StanceTurnClips[1] != nullptr,
        !StanceTurnContent[0].IsEmpty(), !StanceTurnContent[1].IsEmpty());
}
#endif

bool FFlowFestAnimProxy::IsClearanceResponseSettled(const FFlowArtsArmClearanceHistory& Before,
    const FFlowArtsArmClearanceHistory& After, const FVector& ComponentToWorldScale)
{
    const FVector TorsoDelta=After.ContactTorsoRotationVector-Before.ContactTorsoRotationVector;
    if (TorsoDelta.ContainsNaN() || TorsoDelta.SizeSquared()>1.e-12) return false;
    for (int32 Side = 0; Side < 2; ++Side)
    {
        const FVector Delta = (After.ContactHandTranslationCm[Side] - Before.ContactHandTranslationCm[Side]) * ComponentToWorldScale;
        const double AngleDelta = After.ContactElbowAngleRadians[Side] - Before.ContactElbowAngleRadians[Side];
        if (Delta.ContainsNaN() || Delta.SizeSquared() > 1.e-8 ||
            !FMath::IsFinite(AngleDelta) || FMath::Abs(AngleDelta) > 1.e-6) return false;
    }
    return true;
}

bool FFlowFestAnimProxy::IsStanceEntryContinuous(const FVector (&PreviousArms)[4],
    const FQuat& PreviousTorso, const FFlowArtsArmClearancePreparedSeed& Next,
    float DeltaSeconds)
{
    if (!Next.bValid || PreviousTorso.ContainsNaN() || Next.TorsoRotation.ContainsNaN() ||
        !FMath::IsFinite(DeltaSeconds) || DeltaSeconds < 0.f) return false;
    // The neutral body sample can still carry a full prepared torso correction.
    // Limit admission to one advancing frame's correction, even after a hitch.
    const double MaxTorsoDegrees = FMath::Min(1., 60. * double(DeltaSeconds));
    if (FMath::RadiansToDegrees(PreviousTorso.AngularDistance(Next.TorsoRotation)) >
        MaxTorsoDegrees + 1.e-4) return false;
    for (int32 Side = 0; Side < 2; ++Side)
    {
        if (PreviousArms[Side * 2].ContainsNaN() || PreviousArms[Side * 2 + 1].ContainsNaN() ||
            Next.SolvedElbows[Side].ContainsNaN() || Next.SolvedWrists[Side].ContainsNaN() ||
            FVector::Dist(PreviousArms[Side * 2], Next.SolvedElbows[Side]) > .5 ||
            FVector::Dist(PreviousArms[Side * 2 + 1], Next.SolvedWrists[Side]) > .5) return false;
    }
    return true;
}

double FFlowFestAnimProxy::StanceEntryProgress(double CurrentSeconds, double StartSeconds,
    double DurationSeconds)
{
    if (!FMath::IsFinite(CurrentSeconds) || !FMath::IsFinite(StartSeconds) ||
        !FMath::IsFinite(DurationSeconds) || DurationSeconds <= .25) return 0.;
    double Elapsed = CurrentSeconds - StartSeconds;
    if (Elapsed < 0.) Elapsed += DurationSeconds;
    const double Linear = FMath::Clamp(Elapsed / .25, 0., 1.);
    return Linear * Linear * (3. - 2. * Linear);
}

bool FFlowFestAnimProxy::IsNeutralStanceEntrySample(const FFlowFestStanceSample& Sample)
{
    return Sample.bSupport[0] && Sample.bSupport[1] &&
        FMath::Abs(Sample.ExcursionWeight) <= 1.e-6 &&
        Sample.BodyDelta.GetRotation().AngularDistance(FQuat::Identity) <= 1.e-5 &&
        Sample.BodyDelta.GetScale3D().Equals(FVector::OneVector, 1.e-6) &&
        Sample.BodyDelta.GetTranslation().Equals(Sample.NeutralBodyOffsetCm, .001);
}

bool FFlowFestAnimProxy::BlendStanceEntrySample(const FFlowFestStanceSample& Target,
    const FTransform (&SourceFeet)[2], double Progress, FFlowFestStanceSample& Out)
{
    if (!IsNeutralStanceEntrySample(Target) || !FMath::IsFinite(Progress) ||
        Progress < 0. || Progress > 1. || SourceFeet[0].ContainsNaN() ||
        SourceFeet[1].ContainsNaN()) return false;
    const FFlowFestStanceSample FullTarget = Target;
    Out = FullTarget;
    Out.BodyDelta.Blend(FTransform::Identity, FullTarget.BodyDelta, Progress);
    for (int32 Side = 0; Side < 2; ++Side)
        Out.Feet[Side].Blend(SourceFeet[Side], FullTarget.Feet[Side], Progress);
    return true;
}

bool FFlowFestAnimProxy::AreStanceFootSurfacesGrounded(const TArray<FVector> (&Surfaces)[2],
    const FVector& GroundOrigin, const FVector& GroundNormal,
    double PenetrationToleranceCm, double ContactToleranceCm, bool bRequireContact)
{
    if (GroundOrigin.ContainsNaN() || GroundNormal.ContainsNaN() ||
        !FMath::IsFinite(PenetrationToleranceCm) || PenetrationToleranceCm < 0. ||
        !FMath::IsFinite(ContactToleranceCm) || ContactToleranceCm < 0.) return false;
    for (int32 Side = 0; Side < 2; ++Side)
    {
        if (Surfaces[Side].IsEmpty()) return false;
        double Minimum = TNumericLimits<double>::Max();
        for (const FVector& Point : Surfaces[Side])
        {
            if (Point.ContainsNaN()) return false;
            Minimum = FMath::Min(Minimum,
                FVector::DotProduct(Point - GroundOrigin, GroundNormal));
        }
        if (Minimum < -PenetrationToleranceCm ||
            (bRequireContact && Minimum > ContactToleranceCm)) return false;
    }
    return true;
}

void FFlowFestAnimProxy::PreUpdate(UAnimInstance* Instance, float DeltaSeconds)
{
    FAnimInstanceProxy::PreUpdate(Instance, DeltaSeconds);
    UFlowFestAnimInstance* Source = CastChecked<UFlowFestAnimInstance>(Instance);
    Source->UpdateIdleGripClip();
    // UE calls proxy PreUpdate before NativeUpdateAnimation. Advance here so
    // the pose evaluated this tick and the prop sampled after mesh tick agree.
    Source->Advance(DeltaSeconds);
    const auto NextPolicy = Source->PerformanceMotion ? Source->RuntimePosePolicy
        : EFlowFestRuntimePosePolicy::GameClearance;
    if (RuntimePosePolicy != NextPolicy ||
        ClearanceBudget != Source->ClearanceBudget) // Jam polish
    {
        RuntimePosePolicy = NextPolicy;
        ClearanceBudget = Source->ClearanceBudget; // Jam polish
        ReleasePendingPreparedKnots();
        SetPreparedTrack(nullptr);
        ArmClearanceHistory.Reset();
        ArmClearance = {};
        bClearanceMemoValid = false;
        bLastUsedPreparedSeed = false;
        bLastSolvedArmsValid = false;
        bLastSolvedTorsoValid = false;
        bLastCapturedWristsValid = false;
        bStanceActive = false;
        bStanceRequested = false;
        StanceAttemptSource = nullptr;
    }
    bClearancePlaybackPaused = Source->IsPerformancePaused() && Source->bPerformanceTarget &&
        Source->GetPerformanceLength() > 0.f;
    if (PoseDiscontinuity != Source->PoseDiscontinuity)
    {
        PoseDiscontinuity = Source->PoseDiscontinuity;
        bExplicitStanceSeek = true;
        bStanceActive = false;
        bStanceEntryRamping = false;
        bStanceEntryFeetCaptured = false;
        StanceEntryCaptureAttempts = 0;
        ArmClearanceHistory.Reset();
        bClearanceMemoValid = false;
        bLastCapturedWristsValid = false;
        bLastSolvedArmsValid = false;
        bLastSolvedTorsoValid = false;
    }
    ActivityPose = Source->ActivityPose;
    ActivityPose.Weight = Source->ActivityWeight;
    ArmEnvelope = Source->ArmEnvelope;
    for (int32 Turn = 0; Turn < 2; ++Turn)
    {
        StanceTurnClips[Turn] = Source->StanceTurnClips[Turn].Get();
        StanceTurnMetadata[Turn] = Source->StanceTurnMetadata[Turn];
        StanceTurnContent[Turn] = Source->StanceTurnContent[Turn];
    }
    Clips.Reset(); RuntimeMotions.Reset(); bMotionSamples.Reset(); Times.Reset(); Weights.Reset();
    IdleGripClip = Source->GripSource.IsValid() && Source->GripSource->HasVisibleGrip()
        ? Source->IdleGripClip.Get() : nullptr;
    for (int32 Index = 0; Index < Source->MotionClips.Num(); ++Index)
    {
        const float Weight = Source->MotionWeights[Index];
        if (Weight <= 0.0001f) continue;
        Clips.Add(Source->MotionClips[Index].Get());
        RuntimeMotions.Add(nullptr);
        bMotionSamples.Add(true);
        Times.Add(Source->MotionTimes[Index]);
        Weights.Add(Weight);
    }
    for (int32 Index = 0; Index < Source->OutgoingPerformanceClips.Num(); ++Index)
    {
        Clips.Add(Source->OutgoingPerformanceClips[Index].Get());
        RuntimeMotions.Add(Source->OutgoingPerformanceMotions[Index]);
        bMotionSamples.Add(false);
        Times.Add(Source->OutgoingPerformanceTimes[Index]);
        Weights.Add(Source->OutgoingPerformanceWeights[Index]);
    }
    if ((Source->PerformanceClip || Source->PerformanceMotion) && Source->PerformanceWeight > .0001f)
    {
        Clips.Add(Source->PerformanceClip.Get());
        RuntimeMotions.Add(Source->PerformanceMotion);
        bMotionSamples.Add(false);
        Times.Add(Source->PerformanceTime);
        Weights.Add(Source->PerformanceWeight);
    }
    MeshToWorld = Source->GetSkelMeshComponent()
        ? Source->GetSkelMeshComponent()->GetComponentTransform() : FTransform::Identity;
    MeshPresentation = Source->GetSkelMeshComponent()
        ? Source->GetSkelMeshComponent()->GetRelativeTransform() : FTransform::Identity;
    // Strict web contact freezes the original grip socket before refining
    // individual fingers. Re-measuring those refined curls moves the wrist.
    // Preserve imported sockets through retargeting; legacy clips retain their
    // posed-finger calculation, including during a mixed-source transition.
    bDynamicGrip = false;
    GripRelaxation = 0.f;
    AuthoredGripWeight = 0.f;
    AuthoredPalmLocal[0] = AuthoredPalmLocal[1] = FVector::ZeroVector;
    float GripWeight = 0.f;
    bool bGripChannelsValid = true;
    for (int32 Index = 0; Index < RuntimeMotions.Num(); ++Index)
    {
        if (bMotionSamples[Index]) continue;
        float Relaxation = 0.f;
        FVector SourceLeft, SourceRight;
        if (RuntimeMotions[Index] && RuntimeMotions[Index]->HasDynamicGrip())
        {
            FVector NativeLeft, NativeRight;
            if (!RuntimeMotions[Index]->SampleGrip(Times[Index], Relaxation, SourceLeft, SourceRight) ||
                !RuntimeMotions[Index]->SampleNativeGrip(Times[Index], MeshPresentation, NativeLeft, NativeRight))
            {
                bGripChannelsValid = false;
                break;
            }
            AuthoredPalmLocal[0] += NativeLeft * Weights[Index];
            AuthoredPalmLocal[1] += NativeRight * Weights[Index];
            AuthoredGripWeight += Weights[Index];
        }
        GripRelaxation += Relaxation * Weights[Index];
        GripWeight += Weights[Index];
    }
    bDynamicGrip = bGripChannelsValid && GripWeight > .0001f;
    if (bDynamicGrip) GripRelaxation = FMath::Clamp(GripRelaxation / GripWeight, 0.f, 1.f);
    if (bDynamicGrip && AuthoredGripWeight > .0001f)
    {
        AuthoredPalmLocal[0] /= AuthoredGripWeight;
        AuthoredPalmLocal[1] /= AuthoredGripWeight;
        AuthoredGripWeight = FMath::Clamp(AuthoredGripWeight / GripWeight, 0.f, 1.f);
    }
    else AuthoredGripWeight = 0.f;
    FootCorrectionCm[0] = Source->FootCorrectionCm[0];
    FootCorrectionCm[1] = Source->FootCorrectionCm[1];
    LowerBodyLayer = Source->LowerBodyLayer; // Phrase stage
    for (int32 Slot = 0; Slot < 3; ++Slot) // Phrase stage
    {
        const int32 Index = Source->MotionNames.IndexOfByKey(Slot < 2 ? LowerBodyLayer.Motions[Slot] : FName(TEXT("Idle")));
        const UAnimSequence* Clip = LowerBodyLayer.bEnabled && Source->MotionClips.IsValidIndex(Index) ? Source->MotionClips[Index].Get() : nullptr;
        (Slot < 2 ? LowerBodyClips[Slot] : LowerBodyReference) = Clip;
    }
    bCapturedWristsValid = false;
    bVisibleGripTargetsValid = false;
    bVisibleGripTargetSide[0] = false;
    bVisibleGripTargetSide[1] = false;
    bSampledPropRootsValid = false;
    bEvaluatedPalmOffsetsValid = false;
    // Local-bone rotation blends can bow a wrist far outside the path between
    // two authored hand samples. Follow the weighted captured wrist path for
    // a fully performing body, including interrupted routine changes. The
    // same proxy clock drives both the body and prop root before evaluation.
    float MotionWeight = 0.f;
    for (float Weight : Source->MotionWeights) MotionWeight += Weight;
    const float PerformanceWeight = Source->PerformanceWeight + Source->GetOutgoingPerformanceWeight();
    const TCHAR* GroundProbeReason = TEXT("not-requested");
    double GroundHitNormalZ = 0.;
    double GroundLocalNormalZ = 0.;
    int32 GroundHitMobility = -1;
    const UPrimitiveComponent* GroundHitComponent = nullptr;
    if ((Source->PerformanceClip || Source->PerformanceMotion) && PerformanceWeight > .99f && MotionWeight < .01f)
    {
        if (const UFlowFestPropComponent* Prop = Source->GripSource.Get())
        {
            FVector LeftSum = FVector::ZeroVector, RightSum = FVector::ZeroVector;
            FVector LeftGripSum = FVector::ZeroVector, RightGripSum = FVector::ZeroVector;
            float SampledWeight = 0.f;
            const auto Add = [&Prop, &LeftSum, &RightSum, &LeftGripSum, &RightGripSum, &SampledWeight]
                (FName Profile, float Time, float Weight)
            {
                if (Weight < .001f) return;
                FVector Left, Right, LeftGrip, RightGrip;
                if (!Prop->SampleCapturedWrists(Profile, Time, Left, Right) ||
                    !Prop->SampleVisibleGrips(Profile, Time, LeftGrip, RightGrip)) return;
                LeftSum += Left * Weight;
                RightSum += Right * Weight;
                LeftGripSum += LeftGrip * Weight;
                RightGripSum += RightGrip * Weight;
                SampledWeight += Weight;
            };
            for (int32 Index = 0; Index < Source->OutgoingPerformanceClips.Num(); ++Index)
                Add(Source->OutgoingPerformanceProfiles[Index], Source->OutgoingPerformanceTimes[Index],
                    Source->OutgoingPerformanceWeights[Index]);
            Add(Source->PerformanceProfile, Source->PerformanceTime, Source->PerformanceWeight);
            if (SampledWeight > PerformanceWeight - .001f && SampledWeight > .99f &&
                Prop->GetPalmLocalOffsets(PalmLocalOffset))
            {
                CapturedWristComponent[0] = MeshToWorld.InverseTransformPosition(LeftSum / SampledWeight);
                CapturedWristComponent[1] = MeshToWorld.InverseTransformPosition(RightSum / SampledWeight);
                VisibleGripComponent[0] = MeshToWorld.InverseTransformPosition(LeftGripSum / SampledWeight);
                VisibleGripComponent[1] = MeshToWorld.InverseTransformPosition(RightGripSum / SampledWeight);
                if (Source->GetOutgoingPerformanceWeight() > .05f && bLastCapturedWristsValid)
                {
                    // A newly selected routine can put its hand far from the
                    // outgoing pose. Limit the first steps of that source
                    // path so the attached prop and wrist travel together.
                    const float MaxStepCm = FMath::Max(1.f, DeltaSeconds * 300.f);
                    for (int32 Hand = 0; Hand < 2; ++Hand)
                    {
                        const FVector Delta = CapturedWristComponent[Hand] - LastCapturedWristComponent[Hand];
                        const FVector Clamped = LastCapturedWristComponent[Hand] + Delta.GetClampedToMaxSize(MaxStepCm);
                        VisibleGripComponent[Hand] += Clamped - CapturedWristComponent[Hand];
                        CapturedWristComponent[Hand] = Clamped;
                    }
                }
                LastCapturedWristComponent[0] = CapturedWristComponent[0];
                LastCapturedWristComponent[1] = CapturedWristComponent[1];
                bLastCapturedWristsValid = true;
                bCapturedWristsValid = true;
                bVisibleGripTargetsValid = true;
                // Hidden capture anchors are neutral prop placeholders. The
                // authored skeletal hand remains the target on that side.
                bool IncomingVisible[2] = {true, true};
                const bool bVisibilitySampled = Source->PerformanceMotion
                    ? Source->PerformanceMotion->SamplePropVisibility(Source->PerformanceTime, IncomingVisible)
                    : Prop && Prop->SamplePerformanceVisibility(Source->PerformanceProfile,
                        Source->PerformanceTime, IncomingVisible);
                if (bVisibilitySampled)
                {
                    bVisibleGripTargetSide[0] = IncomingVisible[0];
                    bVisibleGripTargetSide[1] = IncomingVisible[1];
                }
            }
        }
    }
    if (!bCapturedWristsValid) bLastCapturedWristsValid = false;
    LeftPropCapsules.Reset(); RightPropCapsules.Reset();
    HandLocalPropCapsules[0].Reset(); HandLocalPropCapsules[1].Reset();
    if (const UFlowFestPropComponent* Prop = Source->GripSource.Get())
    {
        Prop->GetPalmLocalOffsets(PalmLocalOffset);
        bDynamicGrip = bDynamicGrip && Prop->GetGripCalibrations(GripCalibration);
        // Use the same outgoing/incoming blend as visible prop placement.
        // The fixed grips include this frame's transition travel limit.
        FVector GripWorld[2];
        if (bVisibleGripTargetsValid)
        {
            for (int32 Side = 0; Side < 2; ++Side)
            {
                if (bVisibleGripTargetSide[Side])
                    GripWorld[Side] = MeshToWorld.TransformPosition(VisibleGripComponent[Side]);
                else if (const USkeletalMeshComponent* Body = Source->GetSkelMeshComponent())
                    GripWorld[Side] = Body->GetSocketTransform(
                        Side == 0 ? TEXT("LeftHand") : TEXT("RightHand"), RTS_World)
                        .TransformPosition(PalmLocalOffset[Side]);
                else
                    GripWorld[Side] = MeshToWorld.TransformPosition(CapturedWristComponent[Side]);
            }
        }
        if (Source->IsPerforming())
        {
            FVector SampledRootWorld[2];
            bSampledPropRootsValid = Prop->SampleClearanceCapsules(Source->PerformanceProfile, Source->PerformanceTime,
                MeshToWorld, LeftPropCapsules, RightPropCapsules, nullptr, Source,
                bVisibleGripTargetsValid ? GripWorld : nullptr, SampledRootWorld,
                SampledPropRootAvatar, SampledPropVisual);
            if (bSampledPropRootsValid)
                for (int32 Side = 0; Side < 2; ++Side)
                    SampledPropRootComponent[Side] = MeshToWorld.InverseTransformPosition(SampledRootWorld[Side]);
        }
        else
            Prop->SnapshotHandLocalClearanceCapsules(HandLocalPropCapsules[0], HandLocalPropCapsules[1], HandLocalGripOffsets);
    }
    ReleasePendingPreparedKnots();
    bPreparedPlaybackEligible = false;
    const UFlowFestPropComponent* PrepProp = Source->GripSource.Get();
    const USkeletalMeshComponent* PrepMesh = Source->GetSkelMeshComponent();
    if (RuntimePosePolicy == EFlowFestRuntimePosePolicy::GameClearance &&
        (Source->PerformanceMotion || Source->PerformanceClip) && PrepProp && PrepMesh &&
        ArmEnvelope.IsComplete() &&
        ClearanceBudget == EFlowFestClearanceBudget::Exact && // Jam polish
        Source->PerformanceWeight > .99f && Source->GetOutgoingPerformanceWeight() < .01f &&
        MotionWeight < .01f && ActivityPose.Weight <= .001f && bVisibleGripTargetsValid &&
        PrepProp->GetPropId() != NAME_None)
    {
        const auto Motion = Source->PerformanceMotion;
        const UAnimSequence* NativeClip = Source->PerformanceClip.Get();
        const void* SourceIdentity = Motion ? static_cast<const void*>(Motion.Get()) :
            static_cast<const void*>(NativeClip);
        const double SourceDuration = Motion ? Motion->GetDurationSeconds() :
            NativeClip ? NativeClip->GetPlayLength() : 0.;
        const double NativeRate = NativeClip ? NativeClip->GetSamplingFrameRate().AsDecimal() : 0.;
        const int32 SourceFps = Motion ? Motion->GetFps() : FMath::RoundToInt(NativeRate);
        const bool bSourceLoop = Motion ? Motion->IsLooping() : Source->bPerformanceLoop;
        const int32 SourceFrames = Motion ? Motion->GetFrameCount() : NativeClip ?
            NativeClip->GetNumberOfSampledKeys() - (bSourceLoop ? 1 : 0) : 0;
        const bool bNativeRateValid = !NativeClip ||
            (SourceFrames > 1 && SourceFps > 0 &&
             FMath::IsNearlyEqual(NativeRate, double(SourceFps), 1.e-4) &&
             FMath::IsNearlyEqual(SourceDuration * SourceFps,
                double(bSourceLoop ? SourceFrames : SourceFrames - 1), 1.e-3));
        if (StanceAttemptSource != SourceIdentity)
        {
            StanceAttemptSource = SourceIdentity;
            bStanceRequested = false;
            bStanceMoved = false;
            bStanceActive = false;
            bStanceEntryRamping = false;
            bStanceEntryFeetCaptured = false;
            StanceEntryCaptureAttempts = 0;
            bStanceGroundChecked = false;
            bStanceGroundRejected = false;
        }
        if (!bStanceMoved && PreparedTrack.IsValid() && !PreparedTrack->IsStanceTrack() && PreparedTrack->IsFailed())
            bStanceRequested = true;
        UWorld* StanceWorld = Source->GetWorld();
        const AActor* StanceOwner = PrepMesh->GetOwner();
        const bool bStanceClipsReady = StanceTurnClips[0] && StanceTurnClips[1] &&
            !StanceTurnContent[0].IsEmpty() && !StanceTurnContent[1].IsEmpty();
        const bool bStationary = !bStanceGroundValid ||
            (MeshToWorld.GetLocation().Equals(StanceStationaryMeshToWorld.GetLocation(), .1) &&
             MeshToWorld.GetRotation().AngularDistance(StanceStationaryMeshToWorld.GetRotation()) < .001);
        if (!bStationary) { bStanceMoved = true; bStanceRequested = false; bStanceActive = false; bStanceEntryRamping = false; bStanceEntryFeetCaptured = false; }
        const bool bHadGround = bStanceGroundValid;
        bStanceGroundValid = false;
        GroundProbeReason = !bStanceRequested ? TEXT("not-requested") :
            !bStanceClipsReady ? TEXT("turn-clips-unavailable") :
            !bStationary ? TEXT("performer-moved") :
            !StanceWorld || !StanceOwner ? TEXT("missing-world-or-owner") :
            !bSourceLoop ? TEXT("nonloop") :
            SourceFrames > FFlowFestPreparedMotionCache::MaxKnots ? TEXT("too-many-frames") :
            TEXT("trace-miss");
        if (bStanceRequested && bStanceClipsReady && bStationary && StanceWorld && StanceOwner &&
            bSourceLoop && SourceFrames <= FFlowFestPreparedMotionCache::MaxKnots)
        {
            const FVector Origin = MeshToWorld.GetLocation();
            FCollisionQueryParams Query(SCENE_QUERY_STAT(FlowFestStanceGround), false, StanceOwner);
            FHitResult Hit;
            if (StanceWorld->LineTraceSingleByChannel(Hit, Origin + FVector(0, 0, 150),
                Origin - FVector(0, 0, 250), ECC_Visibility, Query))
            {
                GroundHitNormalZ = Hit.ImpactNormal.Z;
                GroundHitComponent = Hit.GetComponent();
                GroundHitMobility = GroundHitComponent ? int32(GroundHitComponent->GetMobility()) : -1;
                GroundProbeReason = GroundHitNormalZ <= .996 ? TEXT("world-slope") :
                    !Hit.GetComponent() ? TEXT("missing-hit-component") :
                    Hit.GetComponent()->GetMobility() != EComponentMobility::Static ? TEXT("nonstatic-ground") :
                    TEXT("local-normal");
                if (GroundHitNormalZ > .996 && Hit.GetComponent() &&
                    Hit.GetComponent()->GetMobility() == EComponentMobility::Static)
                {
                    const FVector LocalPoint = MeshToWorld.InverseTransformPosition(Hit.ImpactPoint);
                    const FVector LocalNormal = MeshToWorld.InverseTransformVectorNoScale(Hit.ImpactNormal).GetSafeNormal();
                    GroundLocalNormalZ = LocalNormal.Z;
                    bStanceGroundValid = LocalNormal.Z > .996;
                    if (bHadGround && bStanceGroundValid &&
                        (FMath::Abs(FVector::DotProduct(LocalPoint - StanceGroundOrigin,
                            StanceGroundNormal)) > .1 ||
                         !LocalNormal.Equals(StanceGroundNormal, 1.e-4)))
                    {
                        GroundProbeReason = TEXT("ground-changed");
                        bStanceMoved = true;
                        bStanceGroundValid = false;
                        bStanceActive = false;
                        bStanceEntryRamping = false;
                        bStanceEntryFeetCaptured = false;
                    }
                    if (bStanceGroundValid)
                    {
                        GroundProbeReason = TEXT("ok");
                        if (!bHadGround)
                        {
                            StanceGroundOrigin = LocalPoint;
                            StanceGroundNormal = LocalNormal;
                            StanceStationaryMeshToWorld = MeshToWorld;
                        }
                    }
                }
            }
        }
        FFlowFestPreparedMotionKey PrepKey;
        PrepKey.Payload = Source->PerformanceProfile;
        PrepKey.MotionIdentity = Motion ? Motion->GetSequenceSHA256() :
            bNativeRateValid ? Source->PerformanceClipContentIdentity : FString();
#if WITH_DEV_AUTOMATION_TESTS
        // Native capture parity tests need a fresh immutable key with identical
        // geometry; changing physical scale would change the corrected grip.
        if (!PrepKey.MotionIdentity.IsEmpty() && !PreparationIdentitySaltForTests.IsEmpty())
            PrepKey.MotionIdentity += TEXT("|test:") + PreparationIdentitySaltForTests;
#endif
        PrepKey.MotionClipIncarnation = FObjectKey(NativeClip);
        PrepKey.PropTrackIdentity = PrepProp->GetPerformanceTrackIdentity();
        PrepKey.PropId = PrepProp->GetPropId();
        PrepKey.Mesh = PrepMesh->GetSkeletalMeshAsset();
        PrepKey.Skin = ArmEnvelope.SkinnedClearance;
        PrepKey.MeshPresentation = MeshPresentation;
        PrepKey.WorldScale = MeshToWorld.GetScale3D();
        PrepKey.Policy = bStanceRequested && bStanceGroundValid ? 2 : 1;
        if (PrepKey.Policy == 2)
        {
            PrepKey.GroundOrigin = StanceGroundOrigin;
            PrepKey.GroundNormal = StanceGroundNormal;
            PrepKey.PatternNormal = Motion ?
                ComponentPatternNormal(Motion->GetCapturePlane(), MeshPresentation) : FVector::ZeroVector;
            for (int32 Turn = 0; Turn < 2; ++Turn)
            {
                PrepKey.TurnClips[Turn] = StanceTurnClips[Turn];
                PrepKey.TurnClipIncarnation[Turn] = FObjectKey(StanceTurnClips[Turn]);
                PrepKey.TurnContent[Turn] = StanceTurnContent[Turn];
                PrepKey.TurnDuration[Turn] = StanceTurnMetadata[Turn].Duration;
                PrepKey.TurnHeading[Turn] = StanceTurnMetadata[Turn].HeadingDegrees;
                PrepKey.TurnFrameCount[Turn] = StanceTurnMetadata[Turn].Frames.Num();
                for (int32 Side = 0; Side < 2; ++Side)
                {
                    PrepKey.SwingStart[Turn][Side] = StanceTurnMetadata[Turn].SwingStart[Side];
                    PrepKey.SwingEnd[Turn][Side] = StanceTurnMetadata[Turn].SwingEnd[Side];
                }
            }
        }
        PrepProp->GetPalmLocalOffsets(PrepKey.PalmLocal);
        PrepProp->GetGripCalibrations(PrepKey.GripCalibration);
        if (!PrepProp->SnapshotPerformanceLocalClearanceCapsules(
            PrepKey.LocalProps[0], PrepKey.LocalProps[1]))
            PrepKey.Payload = NAME_None;
        if (PrepKey.MotionIdentity.IsEmpty() || PrepKey.PropTrackIdentity.IsEmpty() ||
            !bNativeRateValid || SourceFrames < 2)
            PrepKey.Payload = NAME_None;
        const int32 KnotCount = FMath::Clamp(SourceFrames, 2,
            FFlowFestPreparedMotionCache::MaxKnots);
        const bool bFullFrameCoverage = SourceFrames <= FFlowFestPreparedMotionCache::MaxKnots;
        if (!PreparedTrack.IsValid() || !PreparedTrack->Matches(PrepKey, KnotCount,
            SourceDuration, bSourceLoop, bFullFrameCoverage))
        {
            SetPreparedTrack(FFlowFestPreparedMotionCache::Get().Acquire(PrepKey, KnotCount,
                SourceDuration, bSourceLoop, bFullFrameCoverage));
            bStanceActive = false;
            bStanceEntryRamping = false;
            bStanceEntryFeetCaptured = false;
            StanceEntryCaptureAttempts = 0;
            bStanceGroundChecked = false;
            bStanceGroundRejected = false;
            StanceGroundCheck = 0;
            if (PrepKey.Policy == 2) StanceStationaryMeshToWorld = MeshToWorld;
        }
        PreparedPlaybackSeconds = Source->PerformanceTime;
        PreparedPlaybackDuration = SourceDuration;
        bPreparedPlaybackEligible = PreparedTrack.IsValid();
        if (PreparedTrack.IsValid() && !PreparedTrack->IsReady() && !PreparedTrack->IsFailed())
        {
            PreparedTrack->ResumePendingPreparation();
            const double CaptureClaimStartedAt = FPlatformTime::Seconds();
            for (int32 CaptureSlot = 0; CaptureSlot < PreparationCaptureLimit; ++CaptureSlot)
            {
            // A second arbitrary-time extraction is useful only when its game-thread
            // setup is cheap. The matching Evaluate loop has the same budget check.
            if (CaptureSlot > 0 && FPlatformTime::Seconds() - CaptureClaimStartedAt > PreparationCaptureBudgetSeconds)
            {
                ++PreparationSecondCaptureDeferred;
                break;
            }
            FFlowArtsArmClearancePreparedSeed Previous;
            bool bHasPrevious = false;
            bool bMidpoint = false;
            int32 Index = INDEX_NONE;
            double Seconds = 0.0;
            int32 Turn = INDEX_NONE;
            bool bClaimed = false;
            bool bTurnCapture = false;
            bool bStanceCapture = false;
            if (PreparedTrack->IsStanceTrack())
            {
                bClaimed = PreparedTrack->ClaimTurnCapture(Turn, Index, Seconds);
                bTurnCapture = bClaimed;
                if (!bClaimed)
                {
                    bClaimed = PreparedTrack->ClaimStanceCapture(Index, Seconds);
                    bStanceCapture = bClaimed;
                }
            }
            else bClaimed = PreparedTrack->ClaimNext(Index, Seconds, Previous, bHasPrevious);
            if (!bClaimed && !PreparedTrack->IsStanceTrack())
            {
                FFlowArtsArmClearancePreparedSeed A, B;
                double IntervalSeconds = 0.0;
                bClaimed = PreparedTrack->ClaimValidation(Index, Seconds, IntervalSeconds, A, B);
                if (bClaimed)
                {
                    bMidpoint = true;
                    bHasPrevious = FFlowFestPreparedMotionPhase::Continuous(
                        A, B, IntervalSeconds, SourceFps) &&
                        FFlowArtsArmClearance::InterpolatePreparedSeed(
                            A, B, 0.5, Previous);
                    if (!bHasPrevious) PreparedTrack->FailValidation(Index);
                }
            }
            if (bClaimed && (!bMidpoint || bHasPrevious))
            {
                auto& Pending = PendingPreparedKnots[PendingPreparedKnotCount];
                Pending.Entry = PreparedTrack;
                Pending.Motion = Motion;
                Pending.NativeClip = NativeClip;
                Pending.Index = Index;
                Pending.Seconds = Seconds;
                Pending.Previous = MoveTemp(Previous);
                Pending.bHasPrevious = bHasPrevious;
                Pending.bMidpoint = bMidpoint;
                Pending.bTurn = bTurnCapture;
                Pending.bStance = bStanceCapture;
                Pending.Turn = Turn;
                Pending.TurnClip = bTurnCapture ? StanceTurnClips[Turn] : nullptr;
                Pending.bClaimed = true;
                if (bTurnCapture)
                {
                    ++PendingPreparedKnotCount;
                    continue;
                }
                Pending.PalmLocal[0] = PrepKey.PalmLocal[0];
                Pending.PalmLocal[1] = PrepKey.PalmLocal[1];
                Pending.bValid = Motion ? Motion->SamplePropVisibility(Seconds, Pending.bVisible) :
                    PrepProp->SamplePerformanceVisibility(Source->PerformanceProfile,
                        Seconds, Pending.bVisible);
                TArray<float> PropValues;
                if (Motion) Pending.bValid = Pending.bValid && Motion->SamplePropFrame(Seconds, PropValues);
                FVector GripsWorld[2], RootsWorld[2] = {FVector::ZeroVector, FVector::ZeroVector};
                Pending.bValid = Pending.bValid && PrepProp->SampleVisibleGrips(
                    Source->PerformanceProfile, Seconds, GripsWorld[0], GripsWorld[1]);
                if (Pending.bValid)
                {
                    PrepProp->SampleClearanceCapsules(Source->PerformanceProfile, Seconds, MeshToWorld,
                        Pending.Props[0], Pending.Props[1], Motion ? &PropValues : nullptr,
                        nullptr, nullptr, RootsWorld);
                    for (int32 Side = 0; Side < 2; ++Side)
                    {
                        Pending.SampledRootComponent[Side] = MeshToWorld.InverseTransformPosition(RootsWorld[Side]);
                        Pending.VisibleGripComponent[Side] = MeshToWorld.InverseTransformPosition(GripsWorld[Side]);
                        if (Pending.bVisible[Side] && Pending.Props[Side].IsEmpty()) Pending.bValid = false;
                    }
                }
                if (!Pending.bValid)
                {
                    if (bStanceCapture) Pending.Entry->FailStanceCapture(Index);
                    else if (bMidpoint) Pending.Entry->FailValidation(Index);
                    else Pending.Entry->Fail(Index);
                    Pending.bClaimed = false;
                }
                else ++PendingPreparedKnotCount;
            }
            if (!bClaimed) break;
            }
            if (PreparedTrack->IsStanceTrack() && PendingPreparedKnotCount == 0)
            {
                TArray<FFlowFestStanceKnot> Knots;
                FFlowFestStanceTurn Turns[2];
                if (PreparedTrack->ClaimStancePlan(Knots, Turns))
                {
                    FFlowFestStancePlan Prototype;
                    FString PrototypeError;
                    if (BuildStancePrototype(Knots, Turns, SourceDuration,
                        StanceGroundOrigin, StanceGroundNormal,
                        PrepKey.PatternNormal,
                        MeshToWorld.GetScale3D(), Prototype, PrototypeError))
                        PreparedTrack->SubmitStancePlan(MoveTemp(Prototype), MoveTemp(Knots), SourceFps);
                    else
                    {
                        if (FParse::Param(FCommandLine::Get(), TEXT("FlowFestPreparationTelemetry")))
                            UE_LOG(LogTemp, Display, TEXT("Stance prototype rejected: %s"), *PrototypeError);
                        PreparedTrack->FailStancePlan();
                    }
                }
            }
        }
        if (PreparedTrack.IsValid() && PreparedTrack->IsStanceTrack() &&
            !bStanceGroundChecked && !bStanceGroundRejected && bStanceGroundValid &&
            PreparedTrack->ReadStanceCandidate(StanceCandidate))
        {
            // World queries stay on PreUpdate. Check the actual planned landing and
            // swing feet, including turn boundaries, before this consumer can play it.
            constexpr int32 UniformChecks = 64;
            const auto& Plan = StanceCandidate;
            const double Start = Plan.Controls.StartSeconds;
            const double OutEnd = Start + Plan.Outward.Duration;
            const double BackStart = Plan.Controls.ReturnSeconds;
            const double Extra[] = {Start, OutEnd, BackStart, BackStart + Plan.Return.Duration,
                Start + Plan.Outward.SwingStart[0], Start + Plan.Outward.SwingEnd[0],
                Start + Plan.Outward.SwingStart[1], Start + Plan.Outward.SwingEnd[1],
                BackStart + Plan.Return.SwingStart[0], BackStart + Plan.Return.SwingEnd[0],
                BackStart + Plan.Return.SwingStart[1], BackStart + Plan.Return.SwingEnd[1]};
            const double CheckTime = StanceGroundCheck < UniformChecks
                ? Plan.Duration * StanceGroundCheck / UniformChecks
                : Extra[StanceGroundCheck - UniformChecks];
            FFlowFestStanceSample Sample;
            bool bValid = Plan.bFootTerrainProbesValid && Plan.Sample(CheckTime, Sample);
            for (int32 Side = 0; Side < 2 && bValid; ++Side)
                bValid = ValidateStanceGroundPoint(Sample.Feet[Side],
                    Plan.FootTerrainProbesLocal[Side], StanceWorld, StanceOwner);
            if (!bValid) bStanceGroundRejected = true;
            else if (++StanceGroundCheck == UniformChecks + UE_ARRAY_COUNT(Extra))
                bStanceGroundChecked = PreparedTrack->PublishStanceCandidate(true);
        }
        if ((bStanceActive || bStanceEntryRamping) && bStanceGroundChecked && StanceWorld && StanceOwner)
        {
            FFlowFestStanceSample Current;
            const bool bCurrentValid = StanceCandidate.Sample(Source->PerformanceTime, Current) &&
                StanceCandidate.bFootTerrainProbesValid &&
                ValidateStanceGroundPoint(Current.Feet[0],
                    StanceCandidate.FootTerrainProbesLocal[0], StanceWorld, StanceOwner) &&
                ValidateStanceGroundPoint(Current.Feet[1],
                    StanceCandidate.FootTerrainProbesLocal[1], StanceWorld, StanceOwner);
            if (!bCurrentValid)
            {
                bStanceMoved = true;
                bStanceActive = false;
                bStanceEntryRamping = false;
                bStanceEntryFeetCaptured = false;
            }
            else if (bStanceEntryRamping && bStanceEntryFeetCaptured)
            {
                FFlowFestStanceSample Transition;
                const double Progress = StanceEntryProgress(Source->PerformanceTime,
                    StanceEntryStartSeconds, StanceCandidate.Duration);
                const bool bTransitionGroundValid = BlendStanceEntrySample(Current,
                    StanceEntrySourceFeet, Progress, Transition) &&
                    ValidateStanceGroundPoint(Transition.Feet[0],
                        StanceCandidate.FootTerrainProbesLocal[0], StanceWorld, StanceOwner, .5) &&
                    ValidateStanceGroundPoint(Transition.Feet[1],
                        StanceCandidate.FootTerrainProbesLocal[1], StanceWorld, StanceOwner, .5);
                if (!bTransitionGroundValid)
                {
                    bStanceEntryRamping = false;
                    bStanceEntryFeetCaptured = false;
                }
            }
        }
    }
    else
        SetPreparedTrack(nullptr);

    // This is deliberately sampled on the game thread: owner names and clip
    // identities never enter the worker, while ReadProgress locks one cache state.
    if (FParse::Param(FCommandLine::Get(), TEXT("FlowFestPreparationTelemetry")) &&
        (Source->PerformanceMotion || Source->PerformanceClip))
    {
        const FFlowFestPreparedMotionProgress Progress = PreparedTrack.IsValid() ?
            PreparedTrack->ReadProgress() : FFlowFestPreparedMotionProgress{};
        const FString Stage = PreparedTrack.IsValid() ? Progress.Stage :
            (bPreparedPlaybackEligible ? TEXT("no-entry") : TEXT("ineligible"));
        const double Now = FPlatformTime::Seconds();
        const bool bNewEntry = PreparationTelemetryEntry != PreparedTrack.Get();
        const bool bTerminal = Progress.bReady || Progress.bFailed || Progress.bCancelled;
        if (bNewEntry || (Stage != PreparationTelemetryStage &&
                (bTerminal || Now - PreparationTelemetryLastLogSeconds >= 1.)) ||
            Now - PreparationTelemetryLastLogSeconds >= 5.)
        {
            const AActor* OwnerActor = Source->GetSkelMeshComponent() ?
                Source->GetSkelMeshComponent()->GetOwner() : nullptr;
            const FString ClipName = Source->PerformanceMotion ?
                Source->PerformanceMotion->GetSequenceSHA256() :
                Source->PerformanceClip ? Source->PerformanceClip->GetName() : TEXT("none");
            UE_LOG(LogTemp, Display,
                TEXT("Prepared stage owner=%s class=%s profile=%s clip=%s entry=%p policy=%u stage=%s turns=%d/%d source=%d/%d legacy=%d/%d validation=%d/%d consumers=%d active=%d capture=%d worker=%d eligible=%d stanceRequested=%d ground=%d groundReason=%s groundHit=%s groundHitClass=%s groundHitNormalZ=%.6f groundLocalNormalZ=%.6f groundHitMobility=%d meshUpZ=%.6f groundChecked=%d groundRejected=%d performanceSeconds=%.3f proxyCaptures=%llu meanCaptureMs=%.3f maxCaptureMs=%.3f secondDeferred=%llu"),
                OwnerActor ? *OwnerActor->GetName() : TEXT("none"),
                OwnerActor ? *OwnerActor->GetClass()->GetName() : TEXT("none"),
                *Source->GetPerformanceProfile().ToString(), *ClipName,
                static_cast<const void*>(PreparedTrack.Get()), Progress.Policy, *Stage,
                Progress.CapturedTurns, Progress.TotalTurns,
                Progress.CapturedSource, Progress.TotalSource,
                Progress.AcceptedLegacy, Progress.TotalLegacy,
                Progress.ValidatedLegacy, Progress.TotalValidation,
                Progress.Consumers, Progress.GlobalActive, Progress.GlobalCaptures,
                Progress.GlobalWorkers, bPreparedPlaybackEligible, bStanceRequested,
                bStanceGroundValid, GroundProbeReason,
                GroundHitComponent ? *GroundHitComponent->GetName() : TEXT("none"),
                GroundHitComponent ? *GroundHitComponent->GetClass()->GetName() : TEXT("none"),
                GroundHitNormalZ, GroundLocalNormalZ, GroundHitMobility,
                MeshToWorld.GetUnitAxis(EAxis::Z).Z,
                bStanceGroundChecked, bStanceGroundRejected,
                Source->PerformanceTime,
                static_cast<unsigned long long>(PreparationCaptureCount),
                PreparationCaptureCount ? PreparationCaptureTotalMs / double(PreparationCaptureCount) : 0.,
                PreparationCaptureMaxMs,
                static_cast<unsigned long long>(PreparationSecondCaptureDeferred));
            PreparationTelemetryEntry = PreparedTrack.Get();
            PreparationTelemetryStage = Stage;
            PreparationTelemetryLastLogSeconds = Now;
        }
    }
}

static bool MeasurePosedGrip(const FPoseContext& Output, const FFlowFestGripCalibration& Calibration,
    int32 Side, float Relaxation, FVector& OutPalm)
{
    if (!Calibration.bValid) return false;
    const FBoneContainer& Bones = Output.Pose.GetBoneContainer();
    const USkeleton* Skeleton = Bones.GetSkeletonAsset();
    if (!Skeleton) return false;
    const FReferenceSkeleton& Reference = Skeleton->GetReferenceSkeleton();
    static const FName Names[2][7] = {
        {TEXT("LeftHand"), TEXT("LeftHandMiddle1"), TEXT("LeftHandMiddle2"),
         TEXT("LeftHandMiddle3"), TEXT("LeftHandIndex1"), TEXT("LeftHandIndex2"), TEXT("LeftHandIndex3")},
        {TEXT("RightHand"), TEXT("RightHandMiddle1"), TEXT("RightHandMiddle2"),
         TEXT("RightHandMiddle3"), TEXT("RightHandIndex1"), TEXT("RightHandIndex2"), TEXT("RightHandIndex3")}};
    FCompactPoseBoneIndex Indices[7];
    const int32 RequiredBones = Relaxation > 1.e-4f ? 7 : 4;
    for (int32 Index = 0; Index < RequiredBones; ++Index)
    {
        const int32 SkeletonIndex = Reference.FindBoneIndex(Names[Side][Index]);
        if (SkeletonIndex == INDEX_NONE) return false;
        Indices[Index] = Bones.GetCompactPoseIndexFromSkeletonIndex(SkeletonIndex);
        if (Indices[Index].GetInt() == INDEX_NONE) return false;
    }
    FCSPose<FCompactPose> ComponentPose;
    ComponentPose.InitPose(Output.Pose);
    const FTransform& Hand = ComponentPose.GetComponentSpaceTransform(Indices[0]);
    FVector Points[6];
    const int32 RequiredPoints = RequiredBones - 1;
    for (int32 Index = 0; Index < RequiredPoints; ++Index)
        Points[Index] = Hand.InverseTransformPosition(
            ComponentPose.GetComponentSpaceTransform(Indices[Index + 1]).GetLocation());
    OutPalm = MeasureFlowFestGripChannel(Calibration, Points[0], Points[1], Points[2]);
    if (Relaxation > 1.e-4f)
    {
        const FVector IndexChannel = MeasureFlowFestGripChannel(Calibration, Points[3], Points[4], Points[5]);
        OutPalm = FMath::Lerp(OutPalm, IndexChannel, Relaxation);
    }
    return !OutPalm.ContainsNaN();
}

static bool CaptureArmPositions(const FPoseContext& Output, FVector (&Positions)[4])
{
    const FBoneContainer& Bones = Output.Pose.GetBoneContainer();
    const USkeleton* Skeleton = Bones.GetSkeletonAsset();
    if (!Skeleton) return false;
    FCSPose<FCompactPose> Component;
    Component.InitPose(Output.Pose);
    const FName Names[4] = {TEXT("LeftForeArm"), TEXT("LeftHand"),
        TEXT("RightForeArm"), TEXT("RightHand")};
    for (int32 Index = 0; Index < 4; ++Index)
    {
        const int32 SkeletonIndex = Skeleton->GetReferenceSkeleton().FindBoneIndex(Names[Index]);
        if (SkeletonIndex == INDEX_NONE) return false;
        const FCompactPoseBoneIndex Bone = Bones.GetCompactPoseIndexFromSkeletonIndex(SkeletonIndex);
        if (Bone.GetInt() == INDEX_NONE) return false;
        Positions[Index] = Component.GetComponentSpaceTransform(Bone).GetLocation();
    }
    return true;
}

static bool CaptureHandTransforms(const FPoseContext& Output, FTransform (&Hands)[2])
{
    const FBoneContainer& Bones = Output.Pose.GetBoneContainer();
    const USkeleton* Skeleton = Bones.GetSkeletonAsset();
    if (!Skeleton) return false;
    FCSPose<FCompactPose> Component;
    Component.InitPose(Output.Pose);
    for (int32 Side = 0; Side < 2; ++Side)
    {
        const int32 SkeletonIndex = Skeleton->GetReferenceSkeleton().FindBoneIndex(
            Side == 0 ? TEXT("LeftHand") : TEXT("RightHand"));
        if (SkeletonIndex == INDEX_NONE) return false;
        const FCompactPoseBoneIndex Bone = Bones.GetCompactPoseIndexFromSkeletonIndex(SkeletonIndex);
        if (Bone.GetInt() == INDEX_NONE) return false;
        Hands[Side] = Component.GetComponentSpaceTransform(Bone);
    }
    return true;
}

bool FFlowFestAnimProxy::Evaluate(FPoseContext& Output)
{
    ArmClearance = {};
    FFlowArtsArmClearancePreparedSeed StancePlaybackSeed;
    FTransform PreparedHandTargets[2] = {FTransform::Identity, FTransform::Identity};
    TArray<FTransform> PreStanceLocalPose;
    bool bUseStanceSeed = false;
    bool bCaptureStanceEntry = false;
    bool bStanceEntryTrial = false;
    bool bStanceEntryCompletes = false;
    bLastUsedPreparedSeed = false;
#if WITH_DEV_AUTOMATION_TESTS
    const bool bPoseParity = FParse::Param(FCommandLine::Get(), TEXT("FlowFestPoseParity"));
    const bool bRenderBypassClearance = FParse::Param(FCommandLine::Get(), TEXT("FlowFestRenderBypassClearance"));
    auto LogPoseStage = [&](const TCHAR* Stage, FPoseContext& Pose, double SampleSeconds)
    {
        if (!bPoseParity) return;
        const FBoneContainer& Container = Pose.Pose.GetBoneContainer();
        const USkeleton* Skeleton = Container.GetSkeletonAsset();
        if (!Skeleton) return;
        FCSPose<FCompactPose> Component;
        Component.InitPose(Pose.Pose);
        const FReferenceSkeleton& Reference = Skeleton->GetReferenceSkeleton();
        UE_LOG(LogFlowFestPoseParity, Display,
            TEXT("PoseParity proxy=%p stage=%s time=%.9f capturedWrists=%d gripTargets=%d bypassClearance=%d"),
            static_cast<const void*>(this), Stage, SampleSeconds, int32(bCapturedWristsValid), int32(bVisibleGripTargetsValid),
            int32(bRenderBypassClearance));
        for (const TCHAR* Name : {TEXT("Spine2"), TEXT("LeftArm"), TEXT("LeftForeArm"),
            TEXT("LeftHand"), TEXT("RightArm"), TEXT("RightForeArm"), TEXT("RightHand")})
        {
            const int32 SkeletonIndex = Reference.FindBoneIndex(FName(Name));
            if (SkeletonIndex == INDEX_NONE) continue;
            const FCompactPoseBoneIndex Index = Container.GetCompactPoseIndexFromSkeletonIndex(SkeletonIndex);
            if (Index.GetInt() == INDEX_NONE) continue;
            const FTransform& Bone = Component.GetComponentSpaceTransform(Index);
            const FQuat Q = Bone.GetRotation();
            const FVector P = Bone.GetLocation();
            const FVector S = Bone.GetScale3D();
            UE_LOG(LogFlowFestPoseParity, Display,
                TEXT("PoseParity proxy=%p stage=%s bone=%s p=(%.9f,%.9f,%.9f) q=(%.9f,%.9f,%.9f,%.9f) s=(%.9f,%.9f,%.9f)"),
                static_cast<const void*>(this), Stage, Name, P.X, P.Y, P.Z, Q.X, Q.Y, Q.Z, Q.W, S.X, S.Y, S.Z);
        }
        for (int32 Side = 0; Side < 2; ++Side)
        {
            const int32 SkeletonIndex = Reference.FindBoneIndex(
                Side == 0 ? TEXT("LeftHand") : TEXT("RightHand"));
            if (SkeletonIndex == INDEX_NONE) continue;
            const FCompactPoseBoneIndex Index = Container.GetCompactPoseIndexFromSkeletonIndex(SkeletonIndex);
            if (Index.GetInt() == INDEX_NONE) continue;
            if (!bEvaluatedPalmOffsetsValid || !bVisibleGripTargetSide[Side]) continue;
            const FVector Palm = Component.GetComponentSpaceTransform(Index).TransformPosition(PalmLocalOffset[Side]);
            const FVector Grip = VisibleGripComponent[Side];
            UE_LOG(LogFlowFestPoseParity, Display,
                TEXT("PoseParity proxy=%p stage=%s side=%d palm=(%.9f,%.9f,%.9f) grip=(%.9f,%.9f,%.9f) errorCm=%.9f visible=%d"),
                static_cast<const void*>(this), Stage, Side, Palm.X, Palm.Y, Palm.Z, Grip.X, Grip.Y, Grip.Z,
                FVector::Distance(Palm, Grip), int32(bVisibleGripTargetSide[Side]));
        }
    };
#endif
    double PreparedCaptureElapsedSeconds = 0.;
    int32 PreparedCapturesEvaluated = 0;
    auto RecordPreparedCapture = [this, &PreparedCaptureElapsedSeconds](double StartedAt)
    {
        const double Milliseconds = (FPlatformTime::Seconds() - StartedAt) * 1000.;
        PreparedCaptureElapsedSeconds += Milliseconds * .001;
        ++PreparationCaptureCount;
        PreparationCaptureTotalMs += Milliseconds;
        PreparationCaptureMaxMs = FMath::Max(PreparationCaptureMaxMs, Milliseconds);
        if (FParse::Param(FCommandLine::Get(), TEXT("FlowFestPreparationTelemetry")) &&
            (PreparationCaptureCount == 1 || PreparationCaptureCount % 64 == 0))
            UE_LOG(LogTemp, Display,
                TEXT("Prepared capture proxy=%p knots=%llu lastMs=%.3f meanMs=%.3f maxMs=%.3f secondDeferred=%llu"),
                static_cast<const void*>(this),
                static_cast<unsigned long long>(PreparationCaptureCount), Milliseconds,
                PreparationCaptureTotalMs / double(PreparationCaptureCount), PreparationCaptureMaxMs,
                static_cast<unsigned long long>(PreparationSecondCaptureDeferred));
    };
    for (int32 Slot = 0; Slot < PendingPreparedKnotCount; ++Slot)
    {
        auto& Pending = PendingPreparedKnots[Slot];
        if (!Pending.bClaimed || !Pending.bTurn || !Pending.Entry.IsValid()) continue;
        if (PreparedCapturesEvaluated > 0 && PreparedCaptureElapsedSeconds > PreparationCaptureBudgetSeconds)
        {
            Pending.Release();
            Pending = {};
            ++PreparationSecondCaptureDeferred;
            continue;
        }
        const double CaptureStartedAt = FPlatformTime::Seconds();
        FPoseContext TurnPose(Output);
        TurnPose.ResetToRefPose();
        FAnimationPoseData TurnData(TurnPose);
        if (Pending.TurnClip)
            Pending.TurnClip->GetAnimationPose(TurnData, FAnimExtractContext(Pending.Seconds, false));
        FFlowFestStancePose Native;
        if (Pending.TurnClip && FFlowFestStancePlan::Capture(TurnPose, Native))
        {
            FFlowFestStanceTurnFrame Frame;
            Frame.Seconds = Pending.Seconds;
            Frame.Hips = Native.Components[Native.Hips];
            for (int32 Side = 0; Side < 2; ++Side)
                Frame.Feet[Side] = Native.Components[Native.End[Side]];
            Pending.Entry->CompleteTurnCapture(Pending.Turn, Pending.Index, Frame);
        }
        else Pending.Entry->AbandonTurnCapture(Pending.Turn, Pending.Index, true);
        Pending.bClaimed = false;
        Pending = {};
        ++PreparedCapturesEvaluated;
        RecordPreparedCapture(CaptureStartedAt);
    }
    if (Clips.IsEmpty())
    {
        ReleasePendingPreparedKnots();
        Output.ResetToRefPose();
        return true;
    }
    FPoseContext GripPose(Output);
    if (IdleGripClip)
    {
        GripPose.ResetToRefPose();
        FAnimationPoseData GripData(GripPose);
        IdleGripClip->GetAnimationPose(GripData, FAnimExtractContext(4.f, false));
    }
    // Blend every active source in local bone space. Sequential normalized
    // weighted blending is algebraically equivalent to the full weighted sum.
    float Accumulated = 0.f;
    for (int32 Index = 0; Index < Clips.Num(); ++Index)
    {
        FPoseContext Sample(Output);
        Sample.ResetToRefPose();
        FAnimationPoseData SampleData(Sample);
        if (RuntimeMotions[Index])
            RuntimeMotions[Index]->SamplePose(Sample, Times[Index], MeshPresentation);
        else
            Clips[Index]->GetAnimationPose(SampleData, FAnimExtractContext(Times[Index], false));
#if WITH_DEV_AUTOMATION_TESTS
        if (bPoseParity && RuntimeMotions[Index])
        {
            // Log the raw imported pose before the optional grip overlay.
            LogPoseStage(TEXT("imported-source"), Sample, Times[Index]);
            FVector SourcePalms[2];
            if (RuntimeMotions[Index]->SampleSourcePalms(Times[Index], SourcePalms[0], SourcePalms[1]))
                for (int32 Side = 0; Side < 2; ++Side)
                    UE_LOG(LogFlowFestPoseParity, Display,
                        TEXT("PoseParity proxy=%p stage=source time=%.9f side=%d palmPerformerCm=(%.9f,%.9f,%.9f)"),
                        static_cast<const void*>(this), Times[Index], Side, SourcePalms[Side].X, SourcePalms[Side].Y, SourcePalms[Side].Z);
        }
#endif
        if (IdleGripClip && bMotionSamples[Index])
        {
            const FBoneContainer& Bones = Output.Pose.GetBoneContainer();
            const USkeleton* SkeletonAsset = Bones.GetSkeletonAsset();
            if (SkeletonAsset)
            {
                const FReferenceSkeleton& Reference = SkeletonAsset->GetReferenceSkeleton();
                static const TArray<FName> FingerBones = []
                {
                    TArray<FName> Names;
                    for (const TCHAR* Side : {TEXT("Left"), TEXT("Right")})
                        for (const TCHAR* Finger : {TEXT("Thumb"), TEXT("Index"), TEXT("Middle"), TEXT("Ring"), TEXT("Pinky")})
                            for (int32 Joint = 1; Joint <= 3; ++Joint)
                                Names.Add(FName(*FString::Printf(TEXT("%sHand%s%d"), Side, Finger, Joint)));
                    return Names;
                }();
                for (const FName BoneName : FingerBones)
                {
                    const int32 SkeletonIndex = Reference.FindBoneIndex(BoneName);
                    if (SkeletonIndex == INDEX_NONE) continue;
                    const FCompactPoseBoneIndex BoneIndex = Bones.GetCompactPoseIndexFromSkeletonIndex(SkeletonIndex);
                    if (BoneIndex.GetInt() == INDEX_NONE) continue;
                    Sample.Pose[BoneIndex].SetRotation(GripPose.Pose[BoneIndex].GetRotation());
                }
            }
        }
        const float Weight = Weights[Index];
        if (Accumulated <= SMALL_NUMBER)
        {
            Output.Pose = MoveTemp(Sample.Pose);
            Output.Curve = MoveTemp(Sample.Curve);
            Output.CustomAttributes = MoveTemp(Sample.CustomAttributes);
            Accumulated = Weight;
        }
        else
        {
            FAnimationPoseData OutputData(Output);
            FAnimationRuntime::BlendTwoPosesTogetherInPlace(OutputData, SampleData,
                Accumulated / (Accumulated + Weight));
            Accumulated += Weight;
        }
    }
    if (RuntimePosePolicy == EFlowFestRuntimePosePolicy::GameClearance && FMath::Abs(FootCorrectionCm[0]) > .05f)
        CorrectFoot(Output, TEXT("LeftUpLeg"), TEXT("LeftLeg"), TEXT("LeftFoot"), FootCorrectionCm[0]);
    if (RuntimePosePolicy == EFlowFestRuntimePosePolicy::GameClearance && FMath::Abs(FootCorrectionCm[1]) > .05f)
        CorrectFoot(Output, TEXT("RightUpLeg"), TEXT("RightLeg"), TEXT("RightFoot"), FootCorrectionCm[1]);
    LowerBodyResult = {}; // Phrase stage
    if (LowerBodyLayer.bEnabled) // Phrase stage
        FlowFestLowerBodyLayer::Apply(Output, LowerBodyLayer, LowerBodyClips, LowerBodyReference, MeshToWorld, MeshPresentation, LowerBodyResult);
    if (bDynamicGrip)
    {
        FVector Measured[2];
        if (AuthoredGripWeight >= 1.f - .0001f)
        {
            PalmLocalOffset[0] = AuthoredPalmLocal[0];
            PalmLocalOffset[1] = AuthoredPalmLocal[1];
        }
        else if (MeasurePosedGrip(Output, GripCalibration[0], 0, GripRelaxation, Measured[0]) &&
            MeasurePosedGrip(Output, GripCalibration[1], 1, GripRelaxation, Measured[1]))
        {
            PalmLocalOffset[0] = FMath::Lerp(Measured[0], AuthoredPalmLocal[0], AuthoredGripWeight);
            PalmLocalOffset[1] = FMath::Lerp(Measured[1], AuthoredPalmLocal[1], AuthoredGripWeight);
        }
    }
    bEvaluatedPalmOffsetsValid = true;
    if (RuntimePosePolicy == EFlowFestRuntimePosePolicy::PreserveCapturedPose)
    {
        // The editor already solved this pose. Native IK, activity and clearance
        // corrections would make a renderer switch change the choreography.
        // Keep calibrated palm offsets for prop following, but claim no clearance.
        ArmClearance = {};
        bLastUsedPreparedSeed = false;
#if WITH_DEV_AUTOMATION_TESTS
        LogPoseStage(TEXT("final-captured-pose"), Output, Times.IsEmpty() ? 0.0 : Times.Last());
#endif
        return true;
    }
#if WITH_DEV_AUTOMATION_TESTS
    LogPoseStage(TEXT("blended-before-CorrectHand"), Output, Times.IsEmpty() ? 0.0 : Times.Last());
#endif
    if (bVisibleGripTargetsValid)
    {
        if (bVisibleGripTargetSide[0])
            CorrectHand(Output, TEXT("LeftArm"), TEXT("LeftForeArm"), TEXT("LeftHand"),
                VisibleGripComponent[0], PalmLocalOffset[0]);
        if (bVisibleGripTargetSide[1])
            CorrectHand(Output, TEXT("RightArm"), TEXT("RightForeArm"), TEXT("RightHand"),
                VisibleGripComponent[1], PalmLocalOffset[1]);
    }
#if WITH_DEV_AUTOMATION_TESTS
    LogPoseStage(TEXT("after-CorrectHand"), Output, Times.IsEmpty() ? 0.0 : Times.Last());
#endif
    if (bPreparedPlaybackEligible && bStanceGroundChecked && !bStanceGroundRejected &&
        !bStanceMoved && PreparedTrack.IsValid() && PreparedTrack->IsStanceTrack()
#if WITH_DEV_AUTOMATION_TESTS
        && !bRenderBypassClearance
#endif
        )
    {
        FFlowFestStanceSample StanceSample;
        FFlowArtsArmClearancePreparedSeed First, Second;
        float Alpha = 0.f;
        if (PreparedTrack->ReadStanceSample(PreparedPlaybackSeconds, StanceSample,
            First, Second, Alpha) &&
            FFlowArtsArmClearance::InterpolatePreparedSeed(First, Second, Alpha, StancePlaybackSeed))
        {
            if (!bStanceActive)
            {
                const bool bNeutral = IsNeutralStanceEntrySample(StanceSample);
                const bool bEntryWindow = bNeutral && PreparedTrack->CanBeginStanceEntry(
                    PreparedPlaybackSeconds, .25);
                const bool bCorrectionContinuous = bLastSolvedArmsValid &&
                    bLastSolvedTorsoValid && IsStanceEntryContinuous(LastSolvedArmPosition,
                        LastSolvedTorsoRotation, StancePlaybackSeed, GetDeltaSeconds());
                FFlowFestStancePose LivePose;
                const bool bSupportContinuous = !bStanceEntryRamping && bNeutral &&
                    StanceSample.NeutralBodyOffsetCm.IsNearlyZero(.001) &&
                    FFlowFestStancePlan::Capture(Output, LivePose) &&
                    LivePose.Components[LivePose.End[0]].Equals(StanceSample.Feet[0], .1) &&
                    LivePose.Components[LivePose.End[1]].Equals(StanceSample.Feet[1], .1);
                if (bExplicitStanceSeek || (!bStanceEntryRamping && bEntryWindow &&
                    bCorrectionContinuous && bSupportContinuous))
                {
                    bStanceActive = true;
                    bStanceEntryRamping = false;
                    bStanceEntryFeetCaptured = false;
                    bClearanceMemoValid = false;
                    ArmClearanceHistory.Reset();
                }
                else if (bStanceEntryRamping)
                {
                    // A missed tick must not carry the body into an outward turn
                    // while only the arm correction is being eased in.
                    if (!bNeutral || !bStanceEntryFeetCaptured) bStanceEntryRamping = false;
                    const double Progress = StanceEntryProgress(PreparedPlaybackSeconds,
                        StanceEntryStartSeconds, PreparedPlaybackDuration);
                    FFlowArtsArmClearancePreparedSeed Transition;
                    if (bStanceEntryRamping && FFlowArtsArmClearance::InterpolateTransitionSeed(StanceEntrySourceSeed,
                        StancePlaybackSeed, Progress, Transition) &&
                        BlendStanceEntrySample(StanceSample, StanceEntrySourceFeet,
                            Progress, StanceSample))
                    {
                        StancePlaybackSeed = MoveTemp(Transition);
                        bStanceEntryTrial = true;
                        bStanceEntryCompletes = Progress >= 1. - 1.e-6;
                    }
                    else { bStanceEntryRamping = false; bStanceEntryFeetCaptured = false; }
                }
                else if (bEntryWindow && StanceEntryCaptureAttempts < 3)
                    bCaptureStanceEntry = true;
            }
            if ((bStanceActive || bStanceEntryTrial) &&
                CaptureHandTransforms(Output, PreparedHandTargets))
            {
                PreStanceLocalPose.Reserve(Output.Pose.GetNumBones());
                for (const FCompactPoseBoneIndex Bone : Output.Pose.ForEachBoneIndex())
                    PreStanceLocalPose.Add(Output.Pose[Bone]);
                bUseStanceSeed = FFlowFestStancePlan::Apply(Output, StanceSample, nullptr, false);
                if (!bUseStanceSeed)
                {
                    for (const FCompactPoseBoneIndex Bone : Output.Pose.ForEachBoneIndex())
                        Output.Pose[Bone] = PreStanceLocalPose[Bone.GetInt()];
                    bStanceActive = false;
                    bStanceEntryRamping = false;
                    bStanceEntryFeetCaptured = false;
                    bStanceEntryTrial = false;
                    bStanceEntryCompletes = false;
                }
            }
            else if (bStanceActive || bStanceEntryTrial)
            {
                bStanceActive = false;
                bStanceEntryRamping = false;
                bStanceEntryFeetCaptured = false;
                bStanceEntryTrial = false;
                bStanceEntryCompletes = false;
            }
        }
        else
        {
            bStanceActive = false;
            bStanceEntryRamping = false;
            bStanceEntryFeetCaptured = false;
            bStanceEntryTrial = false;
            bStanceEntryCompletes = false;
        }
    }
    FFlowFestActivityPose::Apply(Output, ActivityPose);
#if WITH_DEV_AUTOMATION_TESTS
    LogPoseStage(TEXT("after-activity"), Output, Times.IsEmpty() ? 0.0 : Times.Last());
#endif
    if (bSampledPropRootsValid)
    {
        FCSPose<FCompactPose> CurrentBody;
        CurrentBody.InitPose(Output.Pose);
        const FBoneContainer& Bones = Output.Pose.GetBoneContainer();
        const USkeleton* SkeletonAsset = Bones.GetSkeletonAsset();
        if (SkeletonAsset)
            for (int32 Side = 0; Side < 2; ++Side)
            {
                const int32 SkeletonIndex = SkeletonAsset->GetReferenceSkeleton().FindBoneIndex(
                    Side == 0 ? TEXT("LeftHand") : TEXT("RightHand"));
                if (SkeletonIndex == INDEX_NONE) continue;
                const FCompactPoseBoneIndex HandIndex = Bones.GetCompactPoseIndexFromSkeletonIndex(SkeletonIndex);
                if (HandIndex.GetInt() == INDEX_NONE) continue;
                const FTransform& SourceHand = bUseStanceSeed ? PreparedHandTargets[Side] :
                    CurrentBody.GetComponentSpaceTransform(HandIndex);
                const FVector Palm = SourceHand
                    .TransformPosition(PalmLocalOffset[Side]);
                const FVector Offset = Palm - SampledPropRootComponent[Side];
                for (FFlowArtsClearanceCapsule& Capsule : Side == 0 ? LeftPropCapsules : RightPropCapsules)
                {
                    Capsule.Start += Offset;
                    Capsule.End += Offset;
                }
            }
    }
    if (!HandLocalPropCapsules[0].IsEmpty() || !HandLocalPropCapsules[1].IsEmpty())
    {
        FCSPose<FCompactPose> CurrentBody;
        CurrentBody.InitPose(Output.Pose);
        const FBoneContainer& Bones = Output.Pose.GetBoneContainer();
        for (int32 Side = 0; Side < 2; ++Side)
        {
            auto& Capsules = Side == 0 ? LeftPropCapsules : RightPropCapsules;
            Capsules.Reset();
            const USkeleton* SkeletonAsset = Bones.GetSkeletonAsset();
            if (!SkeletonAsset) continue;
            const int32 SkeletonIndex = SkeletonAsset->GetReferenceSkeleton().FindBoneIndex(
                Side == 0 ? TEXT("LeftHand") : TEXT("RightHand"));
            if (SkeletonIndex == INDEX_NONE) continue;
            const FCompactPoseBoneIndex HandIndex = Bones.GetCompactPoseIndexFromSkeletonIndex(SkeletonIndex);
            if (HandIndex.GetInt() == INDEX_NONE) continue;
            const FTransform& Hand = bUseStanceSeed ? PreparedHandTargets[Side] :
                CurrentBody.GetComponentSpaceTransform(HandIndex);
            const FTransform HandWorld = Hand * MeshToWorld;
            const FVector GripWorld = HandWorld.TransformPosition(HandLocalGripOffsets[Side]);
            for (const auto& Local : HandLocalPropCapsules[Side])
            {
                FFlowArtsClearanceCapsule Capsule;
                Capsule.Start = MeshToWorld.InverseTransformPosition(GripWorld + HandWorld.GetRotation().RotateVector(Local.Start));
                Capsule.End = MeshToWorld.InverseTransformPosition(GripWorld + HandWorld.GetRotation().RotateVector(Local.End));
                Capsule.RadiusCm = FMath::Max(1.f, Local.RadiusCm * float(MeshToWorld.GetSafeScaleReciprocal(MeshToWorld.GetScale3D()).GetAbsMax()));
                Capsules.Add(Capsule);
            }
        }
    }
    for (int32 Slot = 0; Slot < PendingPreparedKnotCount; ++Slot)
    {
        auto& Pending = PendingPreparedKnots[Slot];
        if (!Pending.bClaimed || Pending.bTurn || !Pending.Entry.IsValid() || !Pending.bValid) continue;
        if (PreparedCapturesEvaluated > 0 && PreparedCaptureElapsedSeconds > PreparationCaptureBudgetSeconds)
        {
            Pending.Release();
            Pending = {};
            ++PreparationSecondCaptureDeferred;
            continue;
        }
        const double CaptureStartedAt = FPlatformTime::Seconds();
        FPoseContext Knot(Output);
        Knot.ResetToRefPose();
        bool bKnotValid = false;
        if (Pending.Motion)
            bKnotValid = Pending.Motion->SamplePose(Knot, Pending.Seconds, MeshPresentation);
        else if (Pending.NativeClip)
        {
            FAnimationPoseData NativeData(Knot);
            Pending.NativeClip->GetAnimationPose(NativeData,
                FAnimExtractContext(Pending.Seconds, false));
            bKnotValid = true;
#if WITH_DEV_AUTOMATION_TESTS
            ++NativePreparationCaptureCountForTests;
#endif
        }
        if (bKnotValid && bDynamicGrip)
        {
            if (Pending.Motion && Pending.Motion->HasDynamicGrip())
            {
                bKnotValid = Pending.Motion->SampleNativeGrip(Pending.Seconds, MeshPresentation,
                    Pending.PalmLocal[0], Pending.PalmLocal[1]);
            }
            else bKnotValid = MeasurePosedGrip(Knot, GripCalibration[0], 0, 0.f, Pending.PalmLocal[0]) &&
                MeasurePosedGrip(Knot, GripCalibration[1], 1, 0.f, Pending.PalmLocal[1]);
        }
        if (bKnotValid)
        {
            if (Pending.bVisible[0])
                CorrectHand(Knot, TEXT("LeftArm"), TEXT("LeftForeArm"), TEXT("LeftHand"),
                    Pending.VisibleGripComponent[0], Pending.PalmLocal[0]);
            if (Pending.bVisible[1])
                CorrectHand(Knot, TEXT("RightArm"), TEXT("RightForeArm"), TEXT("RightHand"),
                    Pending.VisibleGripComponent[1], Pending.PalmLocal[1]);
            FCSPose<FCompactPose> Component;
            Component.InitPose(Knot.Pose);
            const FBoneContainer& KnotBones = Knot.Pose.GetBoneContainer();
            const USkeleton* KnotSkeleton = KnotBones.GetSkeletonAsset();
            bKnotValid = KnotSkeleton != nullptr;
            for (int32 Side = 0; Side < 2 && bKnotValid; ++Side)
            {
                if (!Pending.bVisible[Side]) continue;
                const int32 SkeletonIndex = KnotSkeleton->GetReferenceSkeleton().FindBoneIndex(
                    Side == 0 ? TEXT("LeftHand") : TEXT("RightHand"));
                if (SkeletonIndex == INDEX_NONE) { bKnotValid = false; break; }
                const FCompactPoseBoneIndex HandIndex = KnotBones.GetCompactPoseIndexFromSkeletonIndex(SkeletonIndex);
                if (HandIndex.GetInt() == INDEX_NONE) { bKnotValid = false; break; }
                const FVector Palm = Component.GetComponentSpaceTransform(HandIndex)
                    .TransformPosition(Pending.PalmLocal[Side]);
                const FVector Offset = Palm - Pending.SampledRootComponent[Side];
                for (FFlowArtsClearanceCapsule& Capsule : Pending.Props[Side])
                {
                    Capsule.Start += Offset;
                    Capsule.End += Offset;
                }
            }
        }
        FTransform CapturedHandTargets[2];
        if (bKnotValid && Pending.bStance)
            bKnotValid = CaptureHandTransforms(Knot, CapturedHandTargets);
        FFlowArtsArmClearancePreparationSnapshot Snapshot;
        if (bKnotValid && FFlowArtsArmClearance::CapturePreparationSnapshot(Knot,
            Pending.Props[0], Pending.Props[1], ArmEnvelope, MeshToWorld.GetScale3D(), Snapshot))
        {
            if (Pending.bStance)
            {
                Snapshot.Geometry.bHasPreparedHandTargets = true;
                for (int32 Side = 0; Side < 2; ++Side)
                    Snapshot.Geometry.PreparedHandTargets[Side] = CapturedHandTargets[Side];
                FFlowFestStanceKnot Captured;
                Captured.Seconds = Pending.Seconds;
                Captured.Clearance = MoveTemp(Snapshot);
                if (FFlowFestStancePlan::Capture(Knot, Captured.Pose))
                    Pending.Entry->CompleteStanceCapture(Pending.Index, MoveTemp(Captured));
                else Pending.Entry->FailStanceCapture(Pending.Index);
            }
            else
            {
            const auto Previous = Pending.Previous;
            const bool bHasPrevious = Pending.bHasPrevious;
            if (Pending.bMidpoint)
                Pending.Entry->SubmitValidation(Pending.Index,
                    [Snapshot = MoveTemp(Snapshot), Previous]() mutable
                    {
                        FFlowArtsArmClearancePreparedSeed Seed;
                        FFlowArtsArmClearanceResult Result;
                        return FFlowArtsArmClearance::PrepareCandidate(
                            Snapshot, 0, &Previous, Seed, Result) && Result.bFeasible;
                    });
            else Pending.Entry->Submit(Pending.Index,
                [Snapshot = MoveTemp(Snapshot), Previous, bHasPrevious,
                    Candidate = 0, BestCost = TNumericLimits<double>::Max(), bFound = false]
                (FFlowArtsArmClearancePreparedSeed& Selected) mutable
                {
                    const double StartedAt = FPlatformTime::Seconds();
                    for (; Candidate < FFlowArtsArmClearance::PreparationCandidateCount; ++Candidate)
                    {
                        if (Candidate > 0 && FPlatformTime::Seconds() - StartedAt > 0.05)
                            return EFlowFestPreparationStep::Continue;
                        FFlowArtsArmClearancePreparedSeed Seed;
                        FFlowArtsArmClearanceResult Result;
                        if (!FFlowArtsArmClearance::PrepareCandidate(Snapshot, Candidate,
                            bHasPrevious ? &Previous : nullptr, Seed, Result) || !Result.bFeasible) continue;
                        double Cost = Result.TotalPenetrationCm * 1000.0;
                        for (int32 Side = 0; Side < 2; ++Side)
                            Cost += 0.5 * FVector::DistSquared(Seed.SolvedWrists[Side],
                                Snapshot.Geometry.Arms[Side].Wrist.GetLocation()) +
                                0.125 * FVector::DistSquared(Seed.SolvedElbows[Side],
                                    Snapshot.Geometry.Arms[Side].Elbow.GetLocation());
                        if (bHasPrevious)
                            for (int32 Side = 0; Side < 2; ++Side)
                                Cost += FVector::DistSquared(Seed.SolvedWrists[Side], Previous.SolvedWrists[Side]) +
                                    0.25 * FVector::DistSquared(Seed.SolvedElbows[Side], Previous.SolvedElbows[Side]);
                        if (!bFound || Cost < BestCost)
                        {
                            bFound = true;
                            BestCost = Cost;
                            Selected = MoveTemp(Seed);
                        }
                    }
                    return bFound ? EFlowFestPreparationStep::Feasible :
                        EFlowFestPreparationStep::Failed;
                });
            }
        }
        else if (Pending.bStance)
            Pending.Entry->FailStanceCapture(Pending.Index);
        else if (Pending.bMidpoint)
            Pending.Entry->FailValidation(Pending.Index);
        else
            Pending.Entry->Fail(Pending.Index);
        Pending.bClaimed = false;
        Pending = {};
        ++PreparedCapturesEvaluated;
        RecordPreparedCapture(CaptureStartedAt);
    }
    ReleasePendingPreparedKnots();
    const double ClearanceStartedAt = FPlatformTime::Seconds();
#if WITH_DEV_AUTOMATION_TESTS
    if (bRenderBypassClearance)
    {
        // Diagnostic render only. Props still follow this evaluated hand pose;
        // no clearance verdict or cached certificate is created or reused.
        bClearanceMemoValid = false;
        LogPoseStage(TEXT("final-bypass-clearance"), Output, Times.IsEmpty() ? 0.0 : Times.Last());
        return true;
    }
#endif
    // Jam polish: an empty-handed crowd body keeps its authored pose; no verdict is cached.
    if (ClearanceBudget == EFlowFestClearanceBudget::Skip)
    {
        bClearanceMemoValid = false;
        return true;
    }
    const FFlowArtsArmClearanceRigEnvelope* SolveEnvelope = ArmEnvelope.IsComplete() &&
        ClearanceBudget == EFlowFestClearanceBudget::Exact ? &ArmEnvelope : nullptr; // Jam polish
    const bool bAllowTorso = ActivityPose.Activity != EFlowFestBodyActivity::Eat || ActivityPose.Weight <= .001f;
    const bool bPreserveWrist = bCapturedWristsValid || (ActivityPose.Weight > .001f &&
        (ActivityPose.Activity == EFlowFestBodyActivity::Eat || ActivityPose.Activity == EFlowFestBodyActivity::FloorRest));
    const bool bAllowSharedTranslation = bCapturedWristsValid && ActivityPose.Weight <= .001f;
    FFlowArtsArmClearancePreparationSnapshot StanceEntrySource;
    const bool bStanceEntrySourceValid = bCaptureStanceEntry && bAllowSharedTranslation &&
        ArmEnvelope.IsComplete() && FFlowArtsArmClearance::CapturePreparationSnapshot(Output,
            LeftPropCapsules, RightPropCapsules, ArmEnvelope,
            MeshToWorld.GetScale3D(), StanceEntrySource) && StanceEntrySource.bValid;
    FFlowFestClearanceMemoKey Key;
    const FBoneContainer& MemoBones = Output.Pose.GetBoneContainer();
    Key.Skeleton = MemoBones.GetSkeletonAsset();
    Key.Mesh = MemoBones.GetSkeletalMeshAsset();
    Key.Skin = ArmEnvelope.SkinnedClearance.Get();
    Key.ComponentToWorldScale = MeshToWorld.GetScale3D();
    Key.Generation = PoseDiscontinuity;
    Key.Flags = uint8(bAllowTorso) | (uint8(bPreserveWrist) << 1) | (uint8(bAllowSharedTranslation) << 2);
    Key.Flags |= uint8(ClearanceBudget != EFlowFestClearanceBudget::Exact) << 3; // Jam polish
    Key.Props[0] = LeftPropCapsules;
    Key.Props[1] = RightPropCapsules;
    for (const FCompactPoseBoneIndex Index : Output.Pose.ForEachBoneIndex())
    {
        Key.LocalPose.Add(Output.Pose[Index]);
        Key.SkeletonIndices.Add(MemoBones.GetSkeletonIndex(Index));
    }
    if (!bUseStanceSeed && bClearanceMemoValid &&
        (bClearancePlaybackPaused || bClearanceMemoSettled) && Key.Equals(ClearanceMemoKey))
    {
        for (const FCompactPoseBoneIndex Index : Output.Pose.ForEachBoneIndex())
            Output.Pose[Index] = ClearanceMemoPose[Index.GetInt()];
        ArmClearance = ClearanceMemoResult;
        ArmClearanceHistory = ClearanceMemoHistory;
        bLastUsedPreparedSeed = bClearanceMemoPreparedSeed;
        // The certificate is for exactly this pose/geometry; no new query ran.
        ArmClearance.SkinnedQueryCount = 0;
        ArmClearance.HandAvoidanceExactQueries = 0;
        ArmClearance.SolveMicroseconds = (FPlatformTime::Seconds() - ClearanceStartedAt) * 1000000.0;
    }
    else
    {
        const FFlowArtsArmClearanceHistory PreviousResponse = ArmClearanceHistory;
        FFlowArtsArmClearancePreparedSeed PreparedA, PreparedB, PreparedInterpolated;
        const FFlowArtsArmClearancePreparedSeed* PreparedSeed = nullptr;
        float PreparedAlpha = 0.f;
        if (bUseStanceSeed) PreparedSeed = &StancePlaybackSeed;
        else if (bPreparedPlaybackEligible && PreparedTrack.IsValid() &&
            !PreparedTrack->IsStanceTrack() &&
            PreparedTrack->ReadPair(PreparedPlaybackSeconds, PreparedA, PreparedB, PreparedAlpha) &&
            FFlowArtsArmClearance::InterpolatePreparedSeed(
                PreparedA, PreparedB, PreparedAlpha, PreparedInterpolated))
            PreparedSeed = &PreparedInterpolated;
        ArmClearance = FFlowArtsArmClearance::SolvePose(Output, ArmClearanceHistory,
            LeftPropCapsules, RightPropCapsules, SolveEnvelope, // Jam polish
            bAllowTorso, bPreserveWrist, bAllowSharedTranslation, PreparedSeed,
            MeshToWorld.GetScale3D(), nullptr, bUseStanceSeed ? PreparedHandTargets : nullptr);
        bool bTrialFeetValid = true;
        if (bUseStanceSeed && bStanceEntryTrial)
        {
            FFlowFestStancePose SolvedPose;
            TArray<FVector> FootSurfaces[2];
            bTrialFeetValid = StanceEntryEvaluateFootSurfaces &&
                FFlowFestStancePlan::Capture(Output, SolvedPose) &&
                StanceEntryEvaluateFootSurfaces(SolvedPose.Components,
                    FootSurfaces[0], FootSurfaces[1]) &&
                AreStanceFootSurfacesGrounded(FootSurfaces,
                    StanceCandidate.GroundOrigin, StanceCandidate.GroundNormal,
                    StanceCandidate.GroundPenetrationToleranceCm,
                    StanceCandidate.GroundContactToleranceCm, bStanceEntryCompletes);
        }
        bLastUsedPreparedSeed = PreparedSeed && !bStanceEntryTrial && ArmClearance.bFeasible &&
            ArmClearance.PreparedSeedQueryCount > 0;
        if (bUseStanceSeed && (ArmClearance.PreparedSeedQueryCount == 0 ||
            !ArmClearance.bFeasible || !bTrialFeetValid))
        {
            // A published knot does not certify this interpolated pose. Restore
            // the authored calibrated pose before running the ordinary response.
            for (const FCompactPoseBoneIndex Bone : Output.Pose.ForEachBoneIndex())
                Output.Pose[Bone] = PreStanceLocalPose[Bone.GetInt()];
            FFlowFestActivityPose::Apply(Output, ActivityPose);
            Key.LocalPose.Reset(Output.Pose.GetNumBones());
            for (const FCompactPoseBoneIndex Bone : Output.Pose.ForEachBoneIndex())
                Key.LocalPose.Add(Output.Pose[Bone]);
            ArmClearanceHistory.Reset();
            ArmClearance = FFlowArtsArmClearance::SolvePose(Output, ArmClearanceHistory,
                LeftPropCapsules, RightPropCapsules,
                SolveEnvelope, // Jam polish
                bAllowTorso, bPreserveWrist, bAllowSharedTranslation, nullptr,
                MeshToWorld.GetScale3D());
            bUseStanceSeed = false;
            bStanceActive = false;
            bStanceEntryRamping = false;
            bStanceEntryFeetCaptured = false;
            // A transition can fail while its captured live source differs from
            // the published target. Only a failed prepared endpoint invalidates
            // the candidate itself; an intermediate failure cancels this entry.
            if (!bStanceEntryTrial || bStanceEntryCompletes)
                bStanceGroundRejected = true;
            bLastUsedPreparedSeed = false;
        }
        else if (bUseStanceSeed && bStanceEntryTrial && bStanceEntryCompletes &&
            ArmClearance.PreparedSeedQueryCount > 0 && ArmClearance.bFeasible &&
            bTrialFeetValid)
        {
            bStanceEntryRamping = false;
            bStanceEntryFeetCaptured = false;
            bStanceActive = true;
            bLastUsedPreparedSeed = ArmClearance.bFeasible &&
                ArmClearance.PreparedSeedQueryCount > 0;
        }
        // Identical source frames still need time to converge while playback
        // advances. A pause freezes the last exact result immediately.
        bClearanceMemoSettled = GetDeltaSeconds() > 0.f &&
            IsClearanceResponseSettled(PreviousResponse, ArmClearanceHistory, Key.ComponentToWorldScale);
        ClearanceMemoKey = MoveTemp(Key);
        ClearanceMemoPose.Reset(Output.Pose.GetNumBones());
        for (const FCompactPoseBoneIndex Index : Output.Pose.ForEachBoneIndex())
            ClearanceMemoPose.Add(Output.Pose[Index]);
        ClearanceMemoResult = ArmClearance;
        ClearanceMemoHistory = ArmClearanceHistory;
        bClearanceMemoPreparedSeed = bLastUsedPreparedSeed;
        bClearanceMemoValid = true;
    }
    // Wait for a clear live source; colliding frames are not entry attempts.
    if (bCaptureStanceEntry && ArmClearance.bFeasible)
    {
        ++StanceEntryCaptureAttempts;
        FFlowFestStancePose LivePose;
        if (bStanceEntrySourceValid && !bUseStanceSeed &&
            ArmClearance.bFeasible && StanceEntrySource.EvaluateFootSurfaces &&
            FFlowFestStancePlan::Capture(Output, LivePose) &&
            FFlowArtsArmClearance::CaptureTransitionSeed(StanceEntrySource,
                ArmClearance, StanceEntrySourceSeed))
        {
            for (int32 Side = 0; Side < 2; ++Side)
                StanceEntrySourceFeet[Side] = LivePose.Components[LivePose.End[Side]];
            StanceEntryEvaluateFootSurfaces = MoveTemp(StanceEntrySource.EvaluateFootSurfaces);
            bStanceEntryFeetCaptured = true;
            StanceEntryStartSeconds = PreparedPlaybackSeconds;
            bStanceEntryRamping = true;
            bClearanceMemoValid = false;
            ArmClearanceHistory.Reset();
        }
    }
    bLastSolvedArmsValid = CaptureArmPositions(Output, LastSolvedArmPosition);
    LastSolvedTorsoRotation = ArmClearance.TorsoRotation;
    bLastSolvedTorsoValid = bLastSolvedArmsValid && !LastSolvedTorsoRotation.ContainsNaN();
    if (!bClearancePlaybackPaused) bExplicitStanceSeek = false;
#if WITH_DEV_AUTOMATION_TESTS
    LogPoseStage(TEXT("final-after-clearance"), Output, Times.IsEmpty() ? 0.0 : Times.Last());
#endif
    return true;
}

void FFlowFestAnimProxy::CorrectHand(FPoseContext& Output, FName UpperName, FName ElbowName,
    FName HandName, const FVector& VisibleGrip, const FVector& PalmLocal)
{
    const FBoneContainer& Bones = Output.Pose.GetBoneContainer();
    const USkeleton* SkeletonAsset = Bones.GetSkeletonAsset();
    if (!SkeletonAsset) return;
    const FReferenceSkeleton& Reference = SkeletonAsset->GetReferenceSkeleton();
    const int32 UpperSkeleton = Reference.FindBoneIndex(UpperName);
    const int32 ElbowSkeleton = Reference.FindBoneIndex(ElbowName);
    const int32 HandSkeleton = Reference.FindBoneIndex(HandName);
    if (UpperSkeleton == INDEX_NONE || ElbowSkeleton == INDEX_NONE || HandSkeleton == INDEX_NONE) return;
    const FCompactPoseBoneIndex Upper = Bones.GetCompactPoseIndexFromSkeletonIndex(UpperSkeleton);
    const FCompactPoseBoneIndex Elbow = Bones.GetCompactPoseIndexFromSkeletonIndex(ElbowSkeleton);
    const FCompactPoseBoneIndex Hand = Bones.GetCompactPoseIndexFromSkeletonIndex(HandSkeleton);
    if (Upper.GetInt() == INDEX_NONE || Elbow.GetInt() == INDEX_NONE || Hand.GetInt() == INDEX_NONE) return;
    FCSPose<FCompactPose> ComponentPose;
    ComponentPose.InitPose(Output.Pose);
    FTransform UpperTransform = ComponentPose.GetComponentSpaceTransform(Upper);
    FTransform ElbowTransform = ComponentPose.GetComponentSpaceTransform(Elbow);
    FTransform HandTransform = ComponentPose.GetComponentSpaceTransform(Hand);
    const FQuat HandRotation = HandTransform.GetRotation();
    const FVector Target = VisibleGrip - HandTransform.TransformVector(PalmLocal);
    if (FVector::DistSquared(HandTransform.GetLocation(), Target) < .01f) return;
    const FVector JointTarget = ElbowTransform.GetLocation();
    AnimationCore::SolveTwoBoneIK(UpperTransform, ElbowTransform, HandTransform,
        JointTarget, Target, false, 1.0, 1.0);
    HandTransform.SetRotation(HandRotation);
    ComponentPose.SetComponentSpaceTransform(Upper, UpperTransform);
    ComponentPose.SetComponentSpaceTransform(Elbow, ElbowTransform);
    ComponentPose.SetComponentSpaceTransform(Hand, HandTransform);
    FCSPose<FCompactPose>::ConvertComponentPosesToLocalPosesSafe(ComponentPose, Output.Pose);
}

void FFlowFestAnimProxy::CorrectFoot(FPoseContext& Output, FName UpperName, FName KneeName, FName FootName, float CorrectionCm)
{
    const FBoneContainer& Bones = Output.Pose.GetBoneContainer();
    const USkeleton* SkeletonAsset = Bones.GetSkeletonAsset();
    if (!SkeletonAsset) return;
    const FReferenceSkeleton& Reference = SkeletonAsset->GetReferenceSkeleton();
    const int32 UpperSkeleton = Reference.FindBoneIndex(UpperName);
    const int32 KneeSkeleton = Reference.FindBoneIndex(KneeName);
    const int32 FootSkeleton = Reference.FindBoneIndex(FootName);
    if (UpperSkeleton == INDEX_NONE || KneeSkeleton == INDEX_NONE || FootSkeleton == INDEX_NONE) return;
    const FCompactPoseBoneIndex Upper = Bones.GetCompactPoseIndexFromSkeletonIndex(UpperSkeleton);
    const FCompactPoseBoneIndex Knee = Bones.GetCompactPoseIndexFromSkeletonIndex(KneeSkeleton);
    const FCompactPoseBoneIndex Foot = Bones.GetCompactPoseIndexFromSkeletonIndex(FootSkeleton);
    if (Upper.GetInt() == INDEX_NONE || Knee.GetInt() == INDEX_NONE || Foot.GetInt() == INDEX_NONE) return;
    FCSPose<FCompactPose> ComponentPose;
    ComponentPose.InitPose(Output.Pose);
    FTransform UpperTransform = ComponentPose.GetComponentSpaceTransform(Upper);
    FTransform KneeTransform = ComponentPose.GetComponentSpaceTransform(Knee);
    FTransform FootTransform = ComponentPose.GetComponentSpaceTransform(Foot);
    const FVector Effector = FootTransform.GetLocation() + MeshToWorld.InverseTransformVector(FVector(0, 0, CorrectionCm));
    // Preserve the authored knee bend direction and limb length while the
    // sole follows the terrain. Never stretch limbs to chase a bad probe.
    const FVector JointTarget = KneeTransform.GetLocation();
    AnimationCore::SolveTwoBoneIK(UpperTransform, KneeTransform, FootTransform,
        JointTarget, Effector, false, 1.0, 1.0);
    ComponentPose.SetComponentSpaceTransform(Upper, UpperTransform);
    ComponentPose.SetComponentSpaceTransform(Knee, KneeTransform);
    ComponentPose.SetComponentSpaceTransform(Foot, FootTransform);
    FCSPose<FCompactPose>::ConvertComponentPosesToLocalPosesSafe(ComponentPose, Output.Pose);
}
