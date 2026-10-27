#include "FlowFestPhraseStage.h"
#include "FlowArtsPerformanceSession.h"
#include "FlowFestAnimInstance.h"
#include "FlowFestAvatarComponent.h"
#include "FlowFestPropComponent.h"
#include "FlowArtsRuntimeMotion.h"
#include "HAL/FileManager.h"
#include "Animation/AnimSequence.h"
#include "Animation/Skeleton.h"
#include "AnimationRuntime.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/PostProcessComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/SpotLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/TextRenderComponent.h"
#include "ContentStreaming.h"
#include "DynamicRHI.h"
#include "DynamicResolutionState.h"
#include "Dom/JsonObject.h"
#include "Engine/Engine.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "HAL/IConsoleManager.h"
#include "InputCoreTypes.h"
#include "Kismet/KismetSystemLibrary.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
#include "Misc/App.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "RenderTimer.h"
#include "Scalability.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "ShaderCompiler.h"
#include "UnrealClient.h"
#if WITH_EDITOR
#include "AssetCompilingManager.h"
#endif

namespace FlowFestPhraseStage
{
namespace
{
float Num(const TSharedPtr<FJsonObject>& O, const TCHAR* Name, float Default = 0.f)
{
    double Value = Default;
    return O.IsValid() && O->TryGetNumberField(Name, Value) ? float(Value) : Default;
}
FString Str(const TSharedPtr<FJsonObject>& O, const TCHAR* Name)
{
    FString Value;
    if (O.IsValid()) O->TryGetStringField(Name, Value);
    return Value;
}
TSharedPtr<FJsonObject> Obj(const TSharedPtr<FJsonObject>& O, const TCHAR* Name)
{
    const TSharedPtr<FJsonObject>* Child = nullptr;
    return O.IsValid() && O->TryGetObjectField(Name, Child) && Child ? *Child : nullptr;
}
const TArray<TSharedPtr<FJsonValue>>& Arr(const TSharedPtr<FJsonObject>& O, const TCHAR* Name)
{
    static const TArray<TSharedPtr<FJsonValue>> Empty;
    const TArray<TSharedPtr<FJsonValue>>* Out = nullptr;
    return O.IsValid() && O->TryGetArrayField(Name, Out) && Out ? *Out : Empty;
}
FVector2D Point(const TSharedPtr<FJsonObject>& O) { return O.IsValid() ? FVector2D(Num(O, TEXT("x")), Num(O, TEXT("z"))) : FVector2D::ZeroVector; }
float Smooth(float X) { X = FMath::Clamp(X, 0.f, 1.f); return X * X * (3.f - 2.f * X); }
// Deterministic hash, never the clock (the jam's).
float Hash01(int32 A, int32 B)
{
    uint32 X = uint32(A) * 747796405u + uint32(B) * 2891336453u + 277803737u;
    X = ((X >> ((X >> 28u) + 4u)) ^ X) * 277803737u;
    return float((X >> 22u) ^ X) / 4294967295.f;
}
constexpr float Never = -1.e6f;
}

float WrapAngle(float A)
{
    while (A > PI) A -= 2.f * PI;
    while (A <= -PI) A += 2.f * PI;
    return A;
}
namespace { float Wrap(float A) { return WrapAngle(A); } }

float ScoreBeat(const FPhrase& Phrase, float LocalBeat)
{
    return Phrase.bRest ? 0.f : (LocalBeat - Phrase.JitterBeats) * (1.f + Phrase.TempoDrift);
}

FString SchedulePath() { return FPaths::ProjectContentDir() / TEXT("FlowFest/Assets/Jam/Data/phrase-stage-schedule.json"); }

const TCHAR* ModeName(EMode Mode)
{
    return Mode == EMode::Travelling ? TEXT("travelling") : Mode == EMode::Turning ? TEXT("turning") : TEXT("planted");
}

bool ParseSchedule(const FString& Json, FSchedule& Out, FString& Error)
{
    Out = {};
    TSharedPtr<FJsonObject> Root;
    if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json), Root) || !Root.IsValid()) { Error = TEXT("phrase schedule is not JSON"); return false; }
    Out.Version = Str(Root, TEXT("version"));
    if (Out.Version != TEXT("flow-fest-phrase-schedule-v1")) { Error = FString::Printf(TEXT("unknown phrase schedule version '%s'"), *Out.Version); return false; }
    Out.TempoBpm = Num(Root, TEXT("tempoBpm"), 120.f);
    Out.LengthBeats = Num(Root, TEXT("lengthBeats"));
    Root->TryGetBoolField(TEXT("fixture"), Out.bFixture);
    if (Out.TempoBpm <= 0.f || Out.LengthBeats <= 0.f) { Error = TEXT("phrase schedule needs a positive tempoBpm and lengthBeats"); return false; }
    for (const TSharedPtr<FJsonValue>& Value : Arr(Root, TEXT("performers")))
    {
        const TSharedPtr<FJsonObject> P = Value->AsObject();
        FPerformer& Performer = Out.Performers.AddDefaulted_GetRef();
        Performer.Id = Str(P, TEXT("id"));
        Performer.Seed = int32(Num(P, TEXT("seed")));
        Performer.CharacterId = FName(*Str(P, TEXT("characterId")));
        Performer.PropFamily = Str(P, TEXT("propFamily"));
        const TSharedPtr<FJsonObject> Personality = Obj(P, TEXT("personality"));
        Performer.Skill = Num(Personality, TEXT("skill"), .5f);
        Performer.Style = Num(Personality, TEXT("style"), .5f);
        Performer.Energy = Num(Personality, TEXT("energy"), .5f);
        Performer.Home = Point(Obj(P, TEXT("home")));
        Performer.AreaRadius = Num(P, TEXT("areaRadius"), 1.f);
        float NextBeat = 0.f;
        for (const TSharedPtr<FJsonValue>& PhraseValue : Arr(P, TEXT("phrases")))
        {
            const TSharedPtr<FJsonObject> Q = PhraseValue->AsObject();
            FPhrase& Phrase = Performer.Phrases.AddDefaulted_GetRef();
            Phrase.StartBeat = Num(Q, TEXT("startBeat"));
            Phrase.Beats = Num(Q, TEXT("beats"));
            Phrase.SequenceId = Str(Q, TEXT("sequenceId"));
            Phrase.SequenceName = Str(Q, TEXT("sequenceName"));
            Phrase.Repeats = int32(Num(Q, TEXT("repeats"), 1.f));
            Phrase.Plane = Str(Q, TEXT("plane"));
            const FString Mode = Str(Q, TEXT("mode"));
            if (Mode == TEXT("planted")) Phrase.Mode = EMode::Planted;
            else if (Mode == TEXT("turning")) Phrase.Mode = EMode::Turning;
            else if (Mode == TEXT("travelling")) Phrase.Mode = EMode::Travelling;
            else { Error = FString::Printf(TEXT("%s phrase at beat %.0f has unknown mode '%s'"), *Performer.Id, Phrase.StartBeat, *Mode); return false; }
            Phrase.FacingStart = Num(Q, TEXT("facingStart"));
            Phrase.FacingEnd = Num(Q, TEXT("facingEnd"), Phrase.FacingStart);
            if (const TSharedPtr<FJsonObject> Path = Obj(Q, TEXT("path")))
            {
                Phrase.bHasPath = true;
                Phrase.From = Point(Obj(Path, TEXT("from")));
                Phrase.To = Point(Obj(Path, TEXT("to")));
                Phrase.Steps = int32(Num(Path, TEXT("steps")));
                Phrase.BeatsPerStep = Num(Path, TEXT("beatsPerStep"), 1.f);
            }
            Phrase.TurnBeats = Num(Q, TEXT("turnBeats"));
            if (Q.IsValid()) Q->TryGetBoolField(TEXT("rest"), Phrase.bRest);
            const TSharedPtr<FJsonObject> Timing = Obj(Q, TEXT("timing"));
            Phrase.JitterBeats = FMath::Clamp(Num(Timing, TEXT("jitterBeats")), -.15f, .15f);
            Phrase.TempoDrift = FMath::Clamp(Num(Timing, TEXT("tempoDrift")), -.1f, .1f);
            if (Phrase.Beats <= 0.f || Phrase.StartBeat < NextBeat - .001f)
            {
                Error = FString::Printf(TEXT("%s phrases overlap or are empty at beat %.2f"), *Performer.Id, Phrase.StartBeat);
                return false;
            }
            if (Phrase.Mode == EMode::Travelling && (!Phrase.bHasPath || Phrase.Steps < 2 || Phrase.BeatsPerStep <= 0.f ||
                Phrase.Steps * Phrase.BeatsPerStep > Phrase.Beats + .001f))
            {
                Error = FString::Printf(TEXT("%s travelling phrase at beat %.0f needs a path with steps"), *Performer.Id, Phrase.StartBeat);
                return false;
            }
            NextBeat = Phrase.StartBeat + Phrase.Beats;
        }
        if (Performer.Id.IsEmpty() || Performer.CharacterId.IsNone() || Performer.Phrases.IsEmpty())
        {
            Error = TEXT("every performer needs an id, a characterId and phrases");
            return false;
        }
    }
    if (Out.Performers.IsEmpty()) { Error = TEXT("phrase schedule has no performers"); return false; }
    return true;
}

bool LoadSchedule(FSchedule& Out, FString& Error)
{
    FString Text;
    if (!FFileHelper::LoadFileToString(Text, *SchedulePath()))
    {
        Error = FString::Printf(TEXT("missing %s; run npx tsx unreal/FlowFest/Tools/export-phrase-stage.ts"), *SchedulePath());
        return false;
    }
    return ParseSchedule(Text, Out, Error);
}

FString PhraseMotionDir() { return FPaths::ProjectContentDir() / TEXT("FlowFest/PhraseStage"); }

bool LoadPhraseMotionIndex(TArray<FPhraseMotionEntry>& Out, FString& Error)
{
    Out.Reset();
    TArray<FString> Files;
    IFileManager::Get().FindFiles(Files, *(PhraseMotionDir() / TEXT("phrase-motions-*.json")), true, false);
    Files.Sort();
    for (const FString& Name : Files)
    {
        FString Text;
        TSharedPtr<FJsonObject> Root;
        if (!FFileHelper::LoadFileToString(Text, *(PhraseMotionDir() / Name)) ||
            !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Root) || !Root.IsValid() ||
            Str(Root, TEXT("schema")) != TEXT("flow-fest-phrase-motion-index-v1"))
        {
            Error = FString::Printf(TEXT("%s is not a phrase motion index"), *Name);
            return false;
        }
        const float SecondsPerStep = Num(Root, TEXT("secondsPerStep"), 60.f / FMath::Max(1.f, Num(Root, TEXT("tempoBpm"), 120.f)));
        for (const TSharedPtr<FJsonValue>& Value : Arr(Root, TEXT("motions")))
        {
            const TSharedPtr<FJsonObject> M = Value->AsObject();
            FPhraseMotionEntry Entry{Str(M, TEXT("characterId")), Str(M, TEXT("propType")), Str(M, TEXT("plane")),
                Str(M, TEXT("sequenceId")), Str(M, TEXT("sequenceName")), Str(M, TEXT("file")), Str(M, TEXT("sequenceSHA256")), SecondsPerStep};
            // A later index names the same routine again; keep the first, every index is add-only,
            // except that a full-grid recapture (a -g52 file, 2026-10-23) replaces an older capture.
            const auto Recaptured = [](const FPhraseMotionEntry& E) { return E.File.EndsWith(TEXT("-g52.motion.json")); };
            FPhraseMotionEntry* Same = Out.FindByPredicate([&Entry](const FPhraseMotionEntry& E) { return E.CharacterId == Entry.CharacterId &&
                E.PropType == Entry.PropType && E.Plane == Entry.Plane && E.SequenceId == Entry.SequenceId; });
            if (!Same) Out.Add(MoveTemp(Entry));
            else if (Recaptured(Entry) && !Recaptured(*Same)) *Same = MoveTemp(Entry);
        }
    }
    return true;
}

const FPhraseMotionEntry* FindPhraseMotion(const TArray<FPhraseMotionEntry>& Index, FName CharacterId, FName PropId, const FPhrase& Phrase)
{
    const FString Character = CharacterId.ToString(), Prop = PropId.ToString();
    return Index.FindByPredicate([&](const FPhraseMotionEntry& E)
    {
        return E.CharacterId == Character && E.PropType == Prop && E.Plane == Phrase.Plane && E.SequenceId == Phrase.SequenceId;
    });
}

// body response (2026-10-23)
FString BodyResponseFile(const FString& MotionFile)
{
    FString Base = MotionFile;
    if (!Base.RemoveFromEnd(TEXT(".motion.json"))) Base.RemoveFromEnd(TEXT(".json"));
    return Base + TEXT(".body.json");
}

namespace
{
// body response (2026-10-23): rows of at least four numbers.
bool ReadRows(const TArray<TSharedPtr<FJsonValue>>& Rows, TArray<FVector4f>& Out)
{
    Out.Reset(Rows.Num());
    for (const TSharedPtr<FJsonValue>& Row : Rows)
    {
        const TArray<TSharedPtr<FJsonValue>>* Values = nullptr;
        if (!Row.IsValid() || !Row->TryGetArray(Values) || !Values || Values->Num() < 4) return false;
        float V[4];
        for (int32 I = 0; I < 4; ++I)
        {
            double D = 0.0;
            if (!(*Values)[I].IsValid() || !(*Values)[I]->TryGetNumber(D) || !FMath::IsFinite(D)) return false;
            V[I] = float(D);
        }
        Out.Emplace(V[0], V[1], V[2], V[3]);
    }
    return true;
}
}

bool ParseBodyResponse(const FString& Json, FBodyResponseTrack& Out, FString& Error)
{
    Out = {};
    TSharedPtr<FJsonObject> Root;
    if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json), Root) || !Root.IsValid()) { Error = TEXT("body response sidecar is not JSON"); return false; }
    if (Str(Root, TEXT("version")) != TEXT("flow-fest-body-response-v1")) { Error = FString::Printf(TEXT("unknown body response version '%s'"), *Str(Root, TEXT("version"))); return false; }
    Out.StepCount = int32(Num(Root, TEXT("stepCount")));
    Out.SamplesPerStep = int32(Num(Root, TEXT("samplesPerStep")));
    Root->TryGetBoolField(TEXT("loop"), Out.bLoop);
    if (Out.StepCount <= 0 || Out.SamplesPerStep <= 0) { Error = TEXT("body response needs a positive stepCount and samplesPerStep"); return false; }
    const int32 Expected = Out.StepCount * Out.SamplesPerStep + (Out.bLoop ? 0 : 1);
    const TSharedPtr<FJsonObject> Feet = Obj(Root, TEXT("feet"));
    if (!ReadRows(Arr(Root, TEXT("offset")), Out.Offset) || !ReadRows(Arr(Feet, TEXT("left")), Out.Feet[0]) ||
        !ReadRows(Arr(Feet, TEXT("right")), Out.Feet[1]))
    {
        Error = TEXT("body response offset and feet rows need four finite numbers each");
        return false;
    }
    if (Out.Offset.Num() != Expected || Out.Feet[0].Num() != Expected || Out.Feet[1].Num() != Expected)
    {
        Error = FString::Printf(TEXT("body response needs %d samples (offset %d, left %d, right %d)"), Expected, Out.Offset.Num(), Out.Feet[0].Num(), Out.Feet[1].Num());
        return false;
    }
    for (const TSharedPtr<FJsonValue>& Value : Arr(Root, TEXT("steps")))
    {
        const TSharedPtr<FJsonObject> S = Value->AsObject();
        const FString Foot = Str(S, TEXT("foot"));
        if (Foot != TEXT("left") && Foot != TEXT("right")) { Error = FString::Printf(TEXT("body response step names foot '%s'"), *Foot); return false; }
        Out.Steps.Add({Foot == TEXT("left") ? 0 : 1, Num(S, TEXT("startStep")), Num(S, TEXT("endStep")), Num(S, TEXT("liftM"))});
    }
    // Optional chest twist, one finite number per sample.
    for (const TSharedPtr<FJsonValue>& Value : Arr(Root, TEXT("chestYaw")))
    {
        double V = 0.0;
        if (!Value.IsValid() || !Value->TryGetNumber(V) || !FMath::IsFinite(V)) { Error = TEXT("body response chestYaw needs finite numbers"); return false; }
        Out.ChestYaw.Add(float(V));
    }
    if (!Out.ChestYaw.IsEmpty() && Out.ChestYaw.Num() != Expected)
    {
        Error = FString::Printf(TEXT("body response chestYaw needs %d samples (has %d)"), Expected, Out.ChestYaw.Num());
        return false;
    }
    return true;
}

FBodyResponseSample SampleBodyResponse(const FBodyResponseTrack& Track, float ScoreStep)
{
    FBodyResponseSample Out;
    const int32 Count = Track.Offset.Num();
    if (Count == 0 || Track.StepCount <= 0) return Out;
    const float Period = float(Track.StepCount);
    float Step = ScoreStep;
    float U = 0.f;
    int32 I0 = 0, I1 = 0;
    if (Track.bLoop)
    {
        Step = FMath::Fmod(FMath::Fmod(ScoreStep, Period) + Period, Period);
        U = Step * Track.SamplesPerStep;
        I0 = FMath::Clamp(FMath::FloorToInt(U), 0, Count - 1);
        I1 = (I0 + 1) % Count; // the last sample blends into the first: no pop at the seam
    }
    else
    {
        Step = FMath::Clamp(ScoreStep, 0.f, Period);
        U = Step * Track.SamplesPerStep;
        I0 = FMath::Clamp(FMath::FloorToInt(U), 0, Count - 1);
        I1 = FMath::Min(I0 + 1, Count - 1);
    }
    const float A = FMath::Clamp(U - I0, 0.f, 1.f);
    // Yaw takes the short way between samples.
    const auto Blend = [A](const FVector4f& P, const FVector4f& Q)
    {
        return FVector4f(FMath::Lerp(P.X, Q.X, A), FMath::Lerp(P.Y, Q.Y, A), FMath::Lerp(P.Z, Q.Z, A), P.W + A * WrapAngle(Q.W - P.W));
    };
    Out.Offset = Blend(Track.Offset[I0], Track.Offset[I1]);
    for (int32 Side = 0; Side < 2; ++Side) Out.Feet[Side] = Blend(Track.Feet[Side][I0], Track.Feet[Side][I1]);
    if (Track.ChestYaw.Num() == Count) Out.ChestYaw = Track.ChestYaw[I0] + A * WrapAngle(Track.ChestYaw[I1] - Track.ChestYaw[I0]);
    for (const FBodyResponseStep& S : Track.Steps)
    {
        const float Length = S.EndStep - S.StartStep;
        if (Length <= 1.e-4f) continue;
        // A step may straddle the seam of a looping track.
        for (const float T : {Step, Step + Period, Step - Period})
            if (T >= S.StartStep && T <= S.EndStep) Out.Swing[S.Side] = (T - S.StartStep) / Length;
    }
    return Out;
}

int32 PhraseIndexAt(const FPerformer& Performer, float Beat)
{
    for (int32 Index = Performer.Phrases.Num() - 1; Index >= 0; --Index)
    {
        const FPhrase& Phrase = Performer.Phrases[Index];
        if (Beat >= Phrase.StartBeat) return Beat < Phrase.StartBeat + Phrase.Beats ? Index : INDEX_NONE;
    }
    return INDEX_NONE;
}

namespace
{
// The label font has no Greek, so the letters are spelled out; long names are cut.
FString LabelName(const FString& Name)
{
    static const TPair<const TCHAR*, const TCHAR*> Letters[] = {
        {TEXT("Σ"), TEXT("Sigma")}, {TEXT("Δ"), TEXT("Delta")}, {TEXT("Θ"), TEXT("Theta")}, {TEXT("θ"), TEXT("theta")},
        {TEXT("Ω"), TEXT("Omega")}, {TEXT("Φ"), TEXT("Phi")}, {TEXT("Ψ"), TEXT("Psi")}, {TEXT("Λ"), TEXT("Lambda")},
        {TEXT("Γ"), TEXT("Gamma")}, {TEXT("α"), TEXT("alpha")}, {TEXT("β"), TEXT("beta")}, {TEXT("ζ"), TEXT("zeta")}};
    FString Out = Name;
    for (const auto& Letter : Letters) Out.ReplaceInline(Letter.Key, *FString::Printf(TEXT(" %s "), Letter.Value), ESearchCase::CaseSensitive);
    while (Out.ReplaceInline(TEXT("  "), TEXT(" "))) {}
    Out.ReplaceInline(TEXT(" -"), TEXT("-"));
    Out.TrimStartAndEndInline();
    return Out.Len() > 34 ? Out.Left(32).TrimEnd() + TEXT("...") : Out;
}
}

FVector2D LeftOf(float Yaw) { return FVector2D(FMath::Sin(Yaw), -FMath::Cos(Yaw)); }

namespace
{
// destination-walk-plan.ts: steady steps, then a 0.95 and a 0.55 mean step into the mark.
TArray<float> StepDistances(float Distance, int32 Steps)
{
    TArray<float> Out;
    const float Mean = Distance / Steps;
    if (Steps < 3) { Out.Init(Mean, Steps); return Out; }
    const float Penultimate = Mean * .95f, Terminal = Mean * .55f;
    Out.Init((Distance - Penultimate - Terminal) / (Steps - 2), Steps - 2);
    Out.Add(Penultimate);
    float Prefix = 0.f;
    for (const float D : Out) Prefix += D;
    Out.Add(Distance - Prefix);
    return Out;
}
}

FGait PlanGait(const FPerformer& Performer, float LengthBeats)
{
    FGait Gait;
    Gait.LengthBeats = LengthBeats;
    if (Performer.Phrases.IsEmpty()) return Gait;
    // Every performer starts the night at home, facing the first phrase's facing.
    const FPhrase& First = Performer.Phrases[0];
    FVector2D FootAt[2];
    float FootYaw[2];
    for (int32 Side = 0; Side < 2; ++Side)
    {
        FootAt[Side] = Performer.Home + LeftOf(First.FacingStart) * (Side == 0 ? FootGaugeM : -FootGaugeM);
        FootYaw[Side] = First.FacingStart;
        Gait.Plants[Side].Add({Never, Never, FootAt[Side], FootYaw[Side], 0.f});
    }
    const auto Mid = [&FootAt]() { return (FootAt[0] + FootAt[1]) * .5f; };
    const auto MeanYaw = [&FootYaw]() { return (FootYaw[0] + FootYaw[1]) * .5f; };
    Gait.Body.Add({Never, Mid(), MeanYaw()});
    // A step: the foot lifts SwingBeats before it lands, exactly on its beat (the props' jitter
    // never reaches the feet). The body holds still while both feet are down and moves between
    // the two double-support poses while a foot swings.
    const auto Step = [&](int32 Side, float LandBeat, float SwingBeats, const FVector2D& At, float Yaw, float LiftM)
    {
        const float LiftBeat = LandBeat - SwingBeats;
        if (LiftBeat > Gait.Body.Last().Beat) Gait.Body.Add({LiftBeat, Mid(), MeanYaw()});
        FootAt[Side] = At;
        FootYaw[Side] = Yaw;
        Gait.Plants[Side].Add({LiftBeat, LandBeat, At, Yaw, LiftM});
        Gait.Landings.Add({LandBeat, Side});
        Gait.Body.Add({LandBeat, Mid(), MeanYaw()});
    };
    int32 GaitSteps = 0; // footfalls walked before this phrase (the browser's departure gait step)
    for (const FPhrase& Phrase : Performer.Phrases)
    {
        if (Phrase.Mode == EMode::Turning)
        {
            // An authored stepping turn over TurnBeats from the phrase start: the foot on the
            // turning side opens first, the feet alternate, and the last two steps close the
            // stance at the new facing. Then the performer stands there.
            const float Current = MeanYaw();
            const float From = Current + Wrap(Phrase.FacingStart - Current);
            const float Delta = Wrap(Phrase.FacingEnd - Phrase.FacingStart);
            if (FMath::Abs(Delta) < 1.e-3f) continue;
            const float TurnBeats = FMath::Min(Phrase.TurnBeats > 0.f ? Phrase.TurnBeats : 2.f, Phrase.Beats);
            const int32 Steps = FMath::Max(2, 2 * FMath::CeilToInt(FMath::Abs(Delta) / HALF_PI - 1.e-3f));
            const float Interval = TurnBeats / Steps;
            const FVector2D Centre = Mid();
            const int32 FirstSide = Delta > 0.f ? 1 : 0; // yaw toward +z turns right
            for (int32 K = 0; K < Steps; ++K)
            {
                const int32 Side = (FirstSide + K) % 2;
                const float Yaw = From + Delta * FMath::Min(1.f, float(K + 1) / float(Steps - 1));
                Step(Side, Phrase.StartBeat + (K + 1) * Interval, .7f * Interval,
                    Centre + LeftOf(Yaw) * (Side == 0 ? FootGaugeM : -FootGaugeM), Yaw, .05f);
            }
            Gait.Walking.Add({Phrase.StartBeat + .3f * Interval, Phrase.StartBeat + TurnBeats, .35f});
        }
        else if (Phrase.Mode == EMode::Travelling)
        {
            // The walk keeps its facing. Footfall k lands on StartBeat + k * BeatsPerStep with the
            // browser's step lengths; each landing foot reaches half the next step ahead of the
            // body, the second-last lands on the mark, and the last closes beside it, so the
            // performer stands at path.to from the final footfall on.
            const FVector2D From = Mid(), To = Phrase.To;
            const float Distance = FVector2D::Distance(From, To);
            const int32 Steps = FMath::Max(2, Phrase.Steps);
            const float Bps = Phrase.BeatsPerStep;
            const float Current = MeanYaw();
            const float Heading = Current + Wrap(Phrase.FacingStart - Current);
            const FVector2D Direction = Distance > 1.e-4f ? (To - From) / Distance : FVector2D::ZeroVector;
            const TArray<float> Lengths = StepDistances(Distance, Steps);
            float Boundary = 0.f;
            for (int32 K = 1; K <= Steps; ++K)
            {
                Boundary = K == Steps ? Distance : Boundary + Lengths[K - 1];
                const float Lead = K < Steps - 1 ? .5f * Lengths[K] : K == Steps - 1 ? Lengths[K] : 0.f;
                const float Along = FMath::Min(Boundary + Lead, Distance);
                // destination-walk-plan.ts: footfall k is the left foot when (gait steps + k) is even.
                const int32 Side = (GaitSteps + K) % 2 == 0 ? 0 : 1;
                Step(Side, Phrase.StartBeat + K * Bps, .8f * FMath::Min(Bps, 1.f),
                    From + Direction * Along + LeftOf(Heading) * (Side == 0 ? FootGaugeM : -FootGaugeM), Heading, .1f);
            }
            GaitSteps += Steps;
            Gait.Walking.Add({Phrase.StartBeat + .2f * FMath::Min(Bps, 1.f), Phrase.StartBeat + Steps * Bps, 1.f});
        }
        else if (!Phrase.bRest)
        {
            // A planted phrase turns the whole performer, grid and all, to its new facing over its
            // first pass (Austen, 2026-10-27), as flow-fest-phrase-playback.ts eases the root: a
            // pair of steps for each 30 degrees or part of it, the outside foot first, each pair
            // landing where the eased facing has reached. The body response only trims on top.
            const float Current = MeanYaw();
            const float From = Current + Wrap(Phrase.FacingStart - Current);
            const float Delta = Wrap(Phrase.FacingEnd - Phrase.FacingStart);
            if (FMath::Abs(Delta) < 1.e-3f) continue;
            const float Span = FMath::Min(Phrase.Beats / FMath::Max(1, Phrase.Repeats), Phrase.Beats);
            const int32 Pairs = FMath::Max(1, FMath::CeilToInt(FMath::Abs(Delta) / FMath::DegreesToRadians(30.f) - 1.e-3f));
            const float Interval = Span / Pairs;
            const FVector2D Centre = Mid();
            const int32 FirstSide = Delta > 0.f ? 1 : 0;
            for (int32 K = 0; K < Pairs; ++K)
            {
                const float Yaw = From + Delta * Smooth(float(K + 1) / float(Pairs));
                const float Land = Phrase.StartBeat + (K + 1) * Interval;
                for (int32 Foot = 0; Foot < 2; ++Foot)
                {
                    const int32 Side = (FirstSide + Foot) % 2;
                    Step(Side, Land - (1 - Foot) * .5f * Interval, .35f * Interval,
                        Centre + LeftOf(Yaw) * (Side == 0 ? FootGaugeM : -FootGaugeM), Yaw, .05f);
                }
            }
        }
    }
    Gait.Landings.Sort([](const TPair<float, int32>& A, const TPair<float, int32>& B) { return A.Key < B.Key; });
    return Gait;
}

FGaitSample SampleGait(const FGait& Gait, float Beat)
{
    FGaitSample Out;
    for (int32 Side = 0; Side < 2; ++Side)
    {
        const TArray<FPlant>& Plants = Gait.Plants[Side];
        if (Plants.IsEmpty()) continue;
        int32 Index = 0;
        while (Index + 1 < Plants.Num() && Plants[Index + 1].LandBeat <= Beat) ++Index;
        const FPlant& Now = Plants[Index];
        Out.Foot[Side] = Now.At;
        Out.FootYaw[Side] = Now.Yaw;
        if (Index + 1 < Plants.Num() && Plants[Index + 1].LiftBeat <= Beat)
        {
            const FPlant& Next = Plants[Index + 1];
            const float Alpha = FMath::Clamp((Beat - Next.LiftBeat) / FMath::Max(Next.LandBeat - Next.LiftBeat, 1.e-3f), 0.f, 1.f);
            Out.Foot[Side] = FMath::Lerp(Now.At, Next.At, Smooth(Alpha));
            Out.FootYaw[Side] = FMath::Lerp(Now.Yaw, Next.Yaw, Smooth(Alpha));
            Out.LiftM[Side] = Next.LiftM * FMath::Sin(PI * Alpha);
            Out.Swing[Side] = Alpha;
            Out.bStepping = true;
        }
    }
    if (!Gait.Body.IsEmpty())
    {
        int32 Index = 0;
        while (Index + 1 < Gait.Body.Num() && Gait.Body[Index + 1].Beat <= Beat) ++Index;
        const FBodyKey& A = Gait.Body[Index];
        const FBodyKey& B = Gait.Body[FMath::Min(Index + 1, Gait.Body.Num() - 1)];
        const float T = B.Beat > A.Beat ? FMath::Clamp((Beat - A.Beat) / (B.Beat - A.Beat), 0.f, 1.f) : 0.f;
        Out.Centre = FMath::Lerp(A.Centre, B.Centre, T);
        Out.Yaw = FMath::Lerp(A.Yaw, B.Yaw, T);
    }
    for (const FWalkWindow& Window : Gait.Walking)
        Out.WalkWeight = FMath::Max(Out.WalkWeight, Window.Weight * Smooth((Beat - Window.Start + .25f) / .5f) * Smooth((Window.End - Beat + .25f) / .5f));
    int32 Last = INDEX_NONE;
    while (Last + 1 < Gait.Landings.Num() && Gait.Landings[Last + 1].Key <= Beat) ++Last;
    if (Last != INDEX_NONE)
    {
        const float Base = Gait.Landings[Last].Value == 0 ? 0.f : .5f;
        const bool bNext = Last + 1 < Gait.Landings.Num() && Gait.Landings[Last + 1].Key - Gait.Landings[Last].Key < 2.5f;
        Out.Cycle = Base + (bNext ? .5f * FMath::Clamp((Beat - Gait.Landings[Last].Key) / (Gait.Landings[Last + 1].Key - Gait.Landings[Last].Key), 0.f, 1.f) : 0.f);
    }
    return Out;
}

namespace
{
// Walk clip phase of the left heel strike: where the left foot leads the right furthest.
float MeasureHeelStrike(const UAnimSequence* Walk, const FVector& ForwardComponent)
{
    const USkeleton* Skeleton = Walk ? Walk->GetSkeleton() : nullptr;
    if (!Skeleton || Walk->GetPlayLength() <= 0.f) return 0.f;
    const FReferenceSkeleton& Reference = Skeleton->GetReferenceSkeleton();
    const int32 Feet[2] = {Reference.FindBoneIndex(TEXT("LeftFoot")), Reference.FindBoneIndex(TEXT("RightFoot"))};
    if (Feet[0] == INDEX_NONE || Feet[1] == INDEX_NONE) return 0.f;
    const auto Component = [Walk, &Reference](int32 Bone, double Seconds)
    {
        FTransform Out = FTransform::Identity;
        for (int32 Index = Bone; Index != INDEX_NONE; Index = Reference.GetParentIndex(Index))
        {
            FTransform Local;
            Walk->GetBoneTransform(Local, FSkeletonPoseBoneIndex(Index), FAnimExtractContext(Seconds, false), false);
            Out = Out * Local;
        }
        return Out.GetLocation();
    };
    float Best = -BIG_NUMBER, BestPhase = 0.f;
    constexpr int32 Samples = 64;
    for (int32 I = 0; I < Samples; ++I)
    {
        const double Seconds = Walk->GetPlayLength() * I / Samples;
        const float Lead = FVector::DotProduct(Component(Feet[0], Seconds) - Component(Feet[1], Seconds), ForwardComponent);
        if (Lead > Best) { Best = Lead; BestPhase = float(I) / Samples; }
    }
    return BestPhase;
}
UAnimSequence* CharacterClip(FName CharacterId, const TCHAR* Motion)
{
    return LoadObject<UAnimSequence>(nullptr, *FString::Printf(TEXT("/Game/FlowFest/Characters/%s/A_%s.A_%s"), *CharacterId.ToString(), Motion, Motion));
}
}

bool FRig::Spawn(UWorld* InWorld, const FPerformer& Performer, float LengthBeats, const FVector& StageOrigin, FName PropId,
    FName InFinish, bool bLabel, FString& Error)
{
    Spec = Performer;
    Gait = PlanGait(Performer, LengthBeats);
    Origin = StageOrigin;
    Finish = InFinish;
    const FGaitSample Start = SampleGait(Gait, 0.f);
    FActorSpawnParameters Params;
    Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
    const FRotator Facing(0.f, FMath::RadiansToDegrees(Start.Yaw), 0.f);
    Actor = InWorld->SpawnActor<AActor>(AActor::StaticClass(), World(Start.Centre), Facing, Params);
    if (!Actor) { Error = TEXT("could not spawn the performer"); return false; }
    USceneComponent* Feet = NewObject<USceneComponent>(Actor, TEXT("Feet"));
    Actor->SetRootComponent(Feet);
    Feet->RegisterComponent();
    Actor->SetActorLocationAndRotation(World(Start.Centre), Facing);
    Avatar = NewObject<UFlowFestAvatarComponent>(Actor, TEXT("Avatar"));
    Avatar->RegisterComponent();
    Avatar->Initialize(Feet, Performer.CharacterId);
    Avatar->SetFootstepsEnabled(false);
    USkeletalMeshComponent* Body = Avatar->GetBodyMesh();
    if (!Body || !Body->GetSkeletalMeshAsset()) { Error = FString::Printf(TEXT("character %s did not load"), *Performer.CharacterId.ToString()); return false; }
    // The planner moves the body every frame; evaluate it whether or not it is on screen.
    Body->VisibilityBasedAnimTickOption = EVisibilityBasedAnimTickOption::AlwaysTickPoseAndRefreshBones;
    Body->SetCastShadow(true);
    Avatar->SetPresentation(true, false);
    Prop = NewObject<UFlowFestPropComponent>(Actor, TEXT("Prop"));
    Prop->RegisterComponent();
    Prop->Initialize(Feet);
    if (!Prop->Equip(PropId)) { Error = FString::Printf(TEXT("prop %s did not equip"), *PropId.ToString()); return false; }
    Prop->BindHands(Body);
    Avatar->BindPerformanceProp(Prop);
    Prop->SetFinish(NAME_None);
    UFlowFestAnimInstance* Anim = Cast<UFlowFestAnimInstance>(Body->GetAnimInstance());
    if (!Anim) { Error = TEXT("the body has no Flow Fest animation instance"); return false; }
    // The captured hands follow the prop exactly; the costly arm clearance stays off (the spec
    // accepts staff-through-body clipping on this stage).
    Anim->SetClearanceBudget(EFlowFestClearanceBudget::Skip);
    const UAnimSequence* Walk = CharacterClip(Performer.CharacterId, TEXT("Walk"));
    const UAnimSequence* Idle = CharacterClip(Performer.CharacterId, TEXT("Idle"));
    if (!Walk || !Idle) { Error = FString::Printf(TEXT("character %s is missing A_Walk or A_Idle"), *Performer.CharacterId.ToString()); return false; }
    WalkLength = FMath::Max(Walk->GetPlayLength(), .1f);
    IdleLength = FMath::Max(Idle->GetPlayLength(), .1f);
    IdleTime = Hash01(Performer.Seed, 99) * IdleLength;
    HeelStrikeCycle = MeasureHeelStrike(Walk, Body->GetRelativeTransform().InverseTransformVectorNoScale(FVector::ForwardVector));
    if (bLabel)
    {
        Label = NewObject<UTextRenderComponent>(Actor, TEXT("Label"));
        Label->SetupAttachment(Feet);
        Label->RegisterComponent();
        Label->SetAbsolute(false, true, false);
        Label->SetRelativeLocation(FVector(0.f, 0.f, 238.f));
        Label->SetHorizontalAlignment(EHTA_Center);
        Label->SetVerticalAlignment(EVRTA_TextBottom);
        Label->SetWorldSize(13.f);
        Label->SetTextRenderColor(FColor(255, 236, 205));
        Label->SetCastShadow(false);
    }
    return true;
}

namespace
{
FString RigHashFor(FName CharacterId)
{
    // The phrase import writes its own rig hashes; the packaged catalog is the fallback.
    for (const FString& Path : {PhraseMotionDir() / TEXT("runtime-rigs.json"), FPaths::ProjectContentDir() / TEXT("Data/runtime-rigs.json")})
    {
        FString Text, Hash;
        TSharedPtr<FJsonObject> Root;
        if (FFileHelper::LoadFileToString(Text, *Path) && FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Root) &&
            Root.IsValid() && Obj(Root, TEXT("rigs")).IsValid() && Obj(Root, TEXT("rigs"))->TryGetStringField(CharacterId.ToString(), Hash))
            return Hash;
    }
    return FString();
}
}

int32 FRig::LoadPhraseMotions(const TArray<FPhraseMotionEntry>& Index)
{
    PhraseMotions.Init(nullptr, Spec.Phrases.Num());
    PhraseSecondsPerStep.Init(.5f, Spec.Phrases.Num());
    if (!Avatar || !Avatar->GetBodyMesh() || !Prop) return 0;
    const FString RigHash = RigHashFor(Spec.CharacterId);
    TMap<FString, TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe>> Loaded;
    // body response (2026-10-23): each motion's sidecar, read once per file.
    PhraseBodyTracks.Init(nullptr, Spec.Phrases.Num());
    TMap<FString, TSharedPtr<const FBodyResponseTrack, ESPMode::ThreadSafe>> BodyLoaded;
    int32 Found = 0;
    for (int32 I = 0; I < Spec.Phrases.Num(); ++I)
    {
        const FPhraseMotionEntry* Entry = FindPhraseMotion(Index, Spec.CharacterId, Prop->GetPropId(), Spec.Phrases[I]);
        if (!Entry) continue;
        if (bBodyResponse) // body response (2026-10-23)
        {
            if (const auto* Cached = BodyLoaded.Find(Entry->File)) PhraseBodyTracks[I] = *Cached;
            else
            {
                const FString Path = PhraseMotionDir() / BodyResponseFile(Entry->File);
                TSharedPtr<FBodyResponseTrack, ESPMode::ThreadSafe> Track;
                FString Text, Error;
                if (FFileHelper::LoadFileToString(Text, *Path))
                {
                    Track = MakeShared<FBodyResponseTrack, ESPMode::ThreadSafe>();
                    if (!ParseBodyResponse(Text, *Track, Error))
                    {
                        UE_LOG(LogTemp, Warning, TEXT("Flow Fest phrase stage: %s body response %s: %s"), *Spec.Id, *Path, *Error);
                        Track.Reset();
                    }
                }
                BodyLoaded.Add(Entry->File, Track);
                PhraseBodyTracks[I] = Track;
            }
        }
        PhraseSecondsPerStep[I] = Entry->SecondsPerStep;
        if (const auto* Cached = Loaded.Find(Entry->File)) { PhraseMotions[I] = *Cached; ++Found; continue; }
        TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Motion;
        FString Error;
        if (!FFlowArtsRuntimeMotion::LoadFromFile(PhraseMotionDir() / Entry->File, Spec.CharacterId.ToString(), RigHash,
            Avatar->GetBodyMesh()->GetSkeletalMeshAsset(), Motion, Error))
        {
            UE_LOG(LogTemp, Warning, TEXT("Flow Fest phrase stage: %s cannot load %s: %s"), *Spec.Id, *Entry->File, *Error);
            Loaded.Add(Entry->File, nullptr);
            continue;
        }
        Loaded.Add(Entry->File, Motion);
        PhraseMotions[I] = Motion;
        ++Found;
    }
    return Found;
}

float FRig::RoutineSeconds(int32 Index, float LocalBeat) const
{
    if (!Spec.Phrases.IsValidIndex(Index)) return 0.f;
    const float SecondsPerStep = PhraseSecondsPerStep.IsValidIndex(Index) ? PhraseSecondsPerStep[Index] : .5f;
    // The capture is one step per beat at the schedule's tempo and loops round the sequence.
    return ScoreBeat(Spec.Phrases[Index], LocalBeat) * SecondsPerStep;
}

void FRig::Update(const FSchedule& Schedule, float Beat, float DeltaSeconds)
{
    if (!IsValid(Actor) || !Avatar || !Avatar->GetBodyMesh()) return;
    const float Length = FMath::Max(Gait.LengthBeats, 1.f);
    const float B = FMath::Fmod(FMath::Fmod(Beat, Length) + Length, Length);
    const FGaitSample S = SampleGait(Gait, B);
    Last = S;
    const float YawDegrees = FMath::RadiansToDegrees(S.Yaw);
    Actor->SetActorLocationAndRotation(World(S.Centre), FRotator(0.f, YawDegrees, 0.f));
    UFlowFestAnimInstance* Anim = Cast<UFlowFestAnimInstance>(Avatar->GetBodyMesh()->GetAnimInstance());

    // Each phrase plays its own captured routine (its sequence in its plane), switched at the
    // phrase boundary with a quarter-beat crossfade; the prop crossfades with the hands.
    const int32 Index = PhraseIndexAt(Spec, B);
    const TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe> Motion =
        PhraseMotions.IsValidIndex(Index) ? PhraseMotions[Index] : nullptr;
    const float LocalBeat = Index != INDEX_NONE ? B - Spec.Phrases[Index].StartBeat : 0.f;
    if (Index != PhraseIndex)
    {
        PhraseIndex = Index;
        if (Index != INDEX_NONE)
        {
            const FPhrase& Phrase = Spec.Phrases[Index];
            bool bPlayed = false;
            if (Motion && Anim && Prop->LoadRuntimePerformance(Motion))
            {
                if (!bRuntimeRoutine) Avatar->PlayRuntimePerformance(Motion);
                Anim->StartPhraseRoutine(Motion, RoutineSeconds(Index, LocalBeat), .25f * 60.f / Schedule.TempoBpm);
                Profile = Motion->GetProfile();
                bRuntimeRoutine = bPlayed = true;
                Prop->SetFinish(Finish);
            }
            if (!bPlayed)
            {
                // No capture for this phrase yet: the built-in routine A or B by sequence id.
                ++FallbackPhrases;
                UE_LOG(LogTemp, Warning, TEXT("Flow Fest phrase stage: %s has no captured routine for %s (%s) at beat %.0f; playing a built-in one"),
                    *Spec.Id, *Phrase.SequenceName, *Phrase.Plane, Phrase.StartBeat);
                const FName Next = UFlowFestAvatarComponent::ResolvePerformanceProfile(Prop->GetPropId(), int32(GetTypeHash(Phrase.SequenceId) % 2u));
                FFlowArtsPerformanceSession Session(Avatar, Prop);
                FString PerformanceError;
                if (Next != Profile && Session.PlayBuiltIn(Next, PerformanceError))
                {
                    if (Profile.IsNone()) Avatar->SetPerformancePhase(Hash01(Spec.Seed, 7));
                    Profile = Next;
                    Prop->SetFinish(Finish);
                }
                else if (Next != Profile)
                    UE_LOG(LogTemp, Warning, TEXT("Flow Fest phrase stage: %s could not play %s: %s"), *Spec.Id, *Next.ToString(), *PerformanceError);
                bRuntimeRoutine = false;
            }
            if (Label)
                Label->SetText(FText::FromString(FString::Printf(TEXT("%s  ·  %s%s\n%s"), *FString(Phrase.bRest ? TEXT("rest") : ModeName(Phrase.Mode)).ToUpper(),
                    *Phrase.Plane, bPlayed ? TEXT("") : TEXT("  ·  built-in"), *LabelName(Phrase.SequenceName))));
        }
    }
    if (bRuntimeRoutine && Anim && Index != INDEX_NONE)
    {
        Anim->SetPhraseRoutineClock(RoutineSeconds(Index, LocalBeat));
        Anim->SetPerformanceRate(1.f + Spec.Phrases[Index].TempoDrift);
    }
    else if (!bRuntimeRoutine)
    {
        // Built-in routines were captured at 60 BPM, one step a second: on the beat, halved above 90 BPM.
        float Rate = Schedule.TempoBpm / 60.f;
        while (Rate > 1.5f) Rate *= .5f;
        while (Rate < .5f) Rate *= 2.f;
        Avatar->SetPerformanceRate(Rate * (Index != INDEX_NONE ? 1.f + Spec.Phrases[Index].TempoDrift : 1.f));
    }

    FFlowFestLowerBodyLayer Layer;
    Layer.bEnabled = true;
    Layer.Motions[0] = TEXT("Idle");
    Layer.Motions[1] = TEXT("Walk");
    IdleTime = FMath::Fmod(IdleTime + DeltaSeconds, IdleLength);
    Layer.MotionTimes[0] = IdleTime;
    Layer.MotionTimes[1] = FMath::Frac(HeelStrikeCycle + S.Cycle) * WalkLength;
    Layer.MotionBlend = S.WalkWeight;
    Layer.BodyYawDegrees = YawDegrees;
    Layer.PelvisYawDegrees = YawDegrees;
    for (int32 Side = 0; Side < 2; ++Side)
    {
        Layer.FootGround[Side] = World(S.Foot[Side]);
        Layer.FootYawDegrees[Side] = FMath::RadiansToDegrees(S.FootYaw[Side]);
        Layer.FootLiftCm[Side] = S.LiftM[Side] * 100.f;
        // Heel off as the foot lifts, toe up as it reaches for the floor.
        Layer.FootPitchDegrees[Side] = S.Swing[Side] >= 0.f ? 14.f * FMath::Sin(2.f * PI * S.Swing[Side]) * (S.LiftM[Side] > 0.f ? 1.f : 0.f) : 0.f;
    }
    // Weight over the stance foot while walking; a slow side-to-side shift while planted.
    const FVector2D Left = LeftOf(S.Yaw);
    const float Sway = S.WalkWeight * 1.5f * FMath::Sin(2.f * PI * S.Cycle);
    const float Settle = (1.f - S.WalkWeight) * (S.bStepping ? 0.f : 1.f);
    const float Shift = Settle * 2.5f * FMath::Sin(2.f * PI * B / 4.f + Spec.Seed);
    Layer.PelvisOffsetCm = FVector(Left.X, Left.Y, 0.f) * (Sway + Shift) +
        FVector(0.f, 0.f, -2.5f * S.WalkWeight - .5f * Settle * FMath::Abs(FMath::Sin(2.f * PI * B / 4.f + Spec.Seed)));

    // body response (2026-10-23): a planted (or resting) phrase with a sidecar adds the planner's
    // hips offset, duck and body yaw and each foot's planted offset, yaw and lift. The performer
    // frame maps onto the stage as the schedule's own conversion does: +x along LeftOf(S.Yaw),
    // +z along the facing (cos, sin), metres to centimetres through World(). Pelvis yaw turns
    // the whole body about the hips (the chest keeps the sidecar's chestYaw back), and the hands
    // return to their captured grips, so the staffs stay in the grid frame while the body moves.
    // Walks and turns keep the native footwork; it fades in and out over half a beat.
    bBodyResponseActive = false;
    BodyResponseOffsetCm = FVector::ZeroVector;
    BodyResponseYawDegrees = BodyResponseLiftCm[0] = BodyResponseLiftCm[1] = BodyResponseChestYawDegrees = 0.f;
    const FBodyResponseTrack* Track = bBodyResponse && bRuntimeRoutine && PhraseBodyTracks.IsValidIndex(Index) ? PhraseBodyTracks[Index].Get() : nullptr;
    if (Track && Spec.Phrases[Index].Mode == EMode::Planted)
    {
        const FPhrase& Phrase = Spec.Phrases[Index];
        const FBodyResponseSample R = SampleBodyResponse(*Track, ScoreBeat(Phrase, LocalBeat));
        const float Weight = Smooth(LocalBeat / .5f) * Smooth((Phrase.Beats - LocalBeat) / .5f) * (1.f - S.WalkWeight);
        const FVector2D Forward(FMath::Cos(S.Yaw), FMath::Sin(S.Yaw));
        const auto Stage = [&Left, &Forward](float X, float Z) { return Left * X + Forward * Z; };
        BodyResponseOffsetCm = FVector(Stage(R.Offset.X, R.Offset.Z) * 100.f, R.Offset.Y * 100.f) * Weight;
        BodyResponseYawDegrees = FMath::RadiansToDegrees(R.Offset.W) * Weight;
        Layer.PelvisOffsetCm += BodyResponseOffsetCm;
        Layer.PelvisYawDegrees += BodyResponseYawDegrees;
        BodyResponseChestYawDegrees = FMath::RadiansToDegrees(R.ChestYaw) * Weight;
        Layer.UpperYawDegrees = BodyResponseYawDegrees;
        Layer.ChestYawDegrees = BodyResponseChestYawDegrees;
        Layer.bHoldHands = true;
        Layer.HandsStayCm = BodyResponseOffsetCm;
        for (int32 Side = 0; Side < 2; ++Side)
        {
            // The native footprint turns about the hips' ground point by the foot's planted yaw, then shifts.
            const float FootYaw = R.Feet[Side].W * Weight;
            const FVector2D Arm = S.Foot[Side] - S.Centre;
            const FVector2D Turned(Arm.X * FMath::Cos(FootYaw) - Arm.Y * FMath::Sin(FootYaw), Arm.X * FMath::Sin(FootYaw) + Arm.Y * FMath::Cos(FootYaw));
            Layer.FootGround[Side] = World(S.Centre + Turned + Stage(R.Feet[Side].X, R.Feet[Side].Y) * Weight);
            Layer.FootYawDegrees[Side] += FMath::RadiansToDegrees(FootYaw);
            BodyResponseLiftCm[Side] = FMath::Max(0.f, R.Feet[Side].Z) * 100.f * Weight;
            Layer.FootLiftCm[Side] += BodyResponseLiftCm[Side];
            // Heel off as it lifts, toe reaching for the floor as it lands, as the walk does.
            if (R.Swing[Side] >= 0.f && BodyResponseLiftCm[Side] > 0.f)
                Layer.FootPitchDegrees[Side] += Weight * 14.f * FMath::Sin(2.f * PI * R.Swing[Side]);
        }
        bBodyResponseActive = Weight > 0.f;
    }
    if (Anim) Anim->SetLowerBodyLayer(Layer);
    if (bBodyResponse && Anim) // body response (2026-10-23): the last evaluation's hand hold, for the stats line
    {
        const FFlowFestLowerBodyLayerResult Held = Anim->GetLowerBodyLayerResult();
        HandHoldErrorCm[0] = Held.HandHoldErrorCm[0];
        HandHoldErrorCm[1] = Held.HandHoldErrorCm[1];
    }
}
}

using namespace FlowFestPhraseStage;

namespace
{
UStaticMesh* Basic(const TCHAR* Name) { return LoadObject<UStaticMesh>(nullptr, *FString::Printf(TEXT("/Engine/BasicShapes/%s.%s"), Name, Name)); }
void SetCVar(const TCHAR* Name, float Value)
{
    if (IConsoleVariable* Var = IConsoleManager::Get().FindConsoleVariable(Name)) Var->Set(Value, ECVF_SetByCode);
}
}

AFlowFestPhraseStage::AFlowFestPhraseStage()
{
    PrimaryActorTick.bCanEverTick = true;
    PrimaryActorTick.TickGroup = TG_PrePhysics;
    SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("Root")));
}

void AFlowFestPhraseStage::BeginPlay()
{
    Super::BeginPlay();
    const TCHAR* Line = FCommandLine::Get();
    FParse::Value(Line, TEXT("FlowFestPhraseStageRecord="), RecordDir);
    FParse::Value(Line, TEXT("FlowFestPhraseStageRecordSeconds="), RecordSeconds);
    FParse::Value(Line, TEXT("FlowFestPhraseStageExitAfter="), ExitAfter);
    FParse::Value(Line, TEXT("FlowFestPhraseStageStartBeat="), StartBeat);
    RecordSeconds = FMath::Clamp(RecordSeconds, 1.f, 120.f);
    // body response (2026-10-23) proof camera: a fixed orbit (no sweep) and an optional performer to frame.
    if (FParse::Value(Line, TEXT("FlowFestPhraseStageOrbitYaw="), OrbitYaw)) bUserOrbit = true;
    FParse::Value(Line, TEXT("FlowFestPhraseStageOrbitPitch="), OrbitPitch);
    FParse::Value(Line, TEXT("FlowFestPhraseStageOrbitDistance="), OrbitDistance);
    FParse::Value(Line, TEXT("FlowFestPhraseStageFocus="), FocusId);
    FParse::Value(Line, TEXT("FlowFestPhraseStageHandLog="), HandLogPath);
    OrbitPitch = FMath::Clamp(OrbitPitch, -60.f, -3.f);
    OrbitDistance = FMath::Clamp(OrbitDistance, 150.f, 1600.f);
    const bool bBodyResponse = FParse::Param(Line, TEXT("BodyResponse")); // body response (2026-10-23), off by default
    Beat = StartBeat;
    if (!RecordDir.IsEmpty() || !HandLogPath.IsEmpty())
    {
        // The world advances a steady 30 Hz however long a frame takes to write (and the hand
        // logs of two runs land on the same beats).
        FApp::SetFixedDeltaTime(1.0 / 30.0);
        FApp::SetUseFixedTimeStep(true);
        if (!RecordDir.IsEmpty()) IFileManager::Get().MakeDirectory(*RecordDir, true);
    }
    GAreScreenMessagesEnabled = false;
    BuildStage();
    ApplyPerfLevers();
    FString Error;
    if (!LoadSchedule(Schedule, Error))
    {
        UE_LOG(LogTemp, Error, TEXT("Flow Fest phrase stage: %s"), *Error);
        if (Caption) Caption->SetText(FText::FromString(TEXT("Phrase stage: ") + Error));
        return;
    }
    TArray<FPhraseMotionEntry> MotionIndex;
    if (!LoadPhraseMotionIndex(MotionIndex, Error)) UE_LOG(LogTemp, Error, TEXT("Flow Fest phrase stage: %s"), *Error);
    // Each spinner's spot sits on their home, read from the schedule.
    for (int32 Side = 0; Side < Spots.Num() && Side < Schedule.Performers.Num(); ++Side)
    {
        const FVector2D Home = Schedule.Performers[Side].Home;
        const FVector Aim(Home.X * 100.f, Home.Y * 100.f + 40.f, 90.f);
        const FVector From(Aim.X + (Home.X < 0.f ? -250.f : 230.f), 620.f, 620.f);
        Spots[Side]->SetRelativeLocationAndRotation(From, (Aim - From).Rotation());
        StageCentre.X += Home.X * 100.f / Schedule.Performers.Num();
    }
    // Fire staffs: the staff family's fire model (same 90 cm centre-grip staff) with the jam's fire.
    for (const FPerformer& Performer : Schedule.Performers)
    {
        const FName PropId = Performer.PropFamily == TEXT("staff") ? FName(TEXT("fire_double_staff")) : FName(*Performer.PropFamily);
        FRig& Rig = Rigs.AddDefaulted_GetRef();
        if (!Rig.Spawn(GetWorld(), Performer, Schedule.LengthBeats, GetActorLocation(), PropId, TEXT("fire"), true, Error))
        {
            UE_LOG(LogTemp, Error, TEXT("Flow Fest phrase stage: %s: %s"), *Performer.Id, *Error);
            Rigs.Pop();
            continue;
        }
        // This actor places each body before the body evaluates; the prop follows the body.
        USkeletalMeshComponent* Body = Rig.Avatar->GetBodyMesh();
        Body->PrimaryComponentTick.AddPrerequisite(this, PrimaryActorTick);
        Rig.Avatar->PrimaryComponentTick.AddPrerequisite(Body, Body->PrimaryComponentTick);
        Rig.Prop->PrimaryComponentTick.AddPrerequisite(Rig.Avatar, Rig.Avatar->PrimaryComponentTick);
        Rig.bBodyResponse = bBodyResponse; // body response (2026-10-23)
        const int32 Captured = Rig.LoadPhraseMotions(MotionIndex);
        UE_LOG(LogTemp, Display, TEXT("Flow Fest phrase stage: %s has captured routines for %d of %d phrases"), *Performer.Id, Captured, Performer.Phrases.Num());
        if (bBodyResponse) // body response (2026-10-23): once per rig, whether any sidecar was found
        {
            int32 Tracks = 0, Planted = 0;
            for (int32 I = 0; I < Rig.PhraseBodyTracks.Num(); ++I)
                if (Rig.PhraseBodyTracks[I]) { ++Tracks; Planted += Performer.Phrases[I].Mode == EMode::Planted ? 1 : 0; }
            UE_LOG(LogTemp, Display, TEXT("Flow Fest phrase stage: body response: %s %s (%d of %d phrases have a track, %d of them planted)"), *Performer.Id,
                Tracks > 0 ? TEXT("found a track") : TEXT("found no track"), Tracks, Performer.Phrases.Num(), Planted);
        }
        Rig.Update(Schedule, Beat, 0.f);
    }
    UE_LOG(LogTemp, Display, TEXT("Flow Fest phrase stage: %d spinners, %.0f beats at %.0f BPM%s%s"), Rigs.Num(), Schedule.LengthBeats, Schedule.TempoBpm,
        Schedule.bFixture ? TEXT(", FIXTURE schedule") : TEXT(""), RecordDir.IsEmpty() ? TEXT("") : *(TEXT(", recording to ") + RecordDir));
}

void AFlowFestPhraseStage::BuildStage()
{
    USceneComponent* Root = GetRootComponent();
    const auto Add = [this, Root](auto* Component)
    {
        Component->SetupAttachment(Root);
        Component->RegisterComponent();
        return Component;
    };
    // A 12 x 9 m floor with the engine's world grid (1 m squares) so steps read against it, on dark ground.
    UStaticMeshComponent* Ground = Add(NewObject<UStaticMeshComponent>(this, TEXT("Ground")));
    Ground->SetStaticMesh(Basic(TEXT("Plane")));
    Ground->SetRelativeLocation(FVector(0.f, 0.f, -1.f));
    Ground->SetRelativeScale3D(FVector(200.f, 200.f, 1.f));
    if (UMaterialInterface* Base = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial")))
    {
        UMaterialInstanceDynamic* Dark = UMaterialInstanceDynamic::Create(Base, this);
        Dark->SetVectorParameterValue(TEXT("Color"), FLinearColor(.035f, .03f, .028f));
        Ground->SetMaterial(0, Dark);
    }
    UStaticMeshComponent* Floor = Add(NewObject<UStaticMeshComponent>(this, TEXT("Floor")));
    Floor->SetStaticMesh(Basic(TEXT("Plane")));
    Floor->SetRelativeScale3D(FVector(12.f, 9.f, 1.f));
    Floor->SetRelativeLocation(FVector(0.f, 50.f, 0.f));
    Floor->SetMaterial(0, LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/EngineMaterials/WorldGridMaterial.WorldGridMaterial")));
    // Dusk: a low warm sun, the sky, fog for depth, and a warm spot on each spinner's area.
    UDirectionalLightComponent* Sun = Add(NewObject<UDirectionalLightComponent>(this, TEXT("Sun")));
    Sun->SetRelativeRotation(FRotator(-9.f, -55.f, 0.f));
    Sun->SetIntensity(2.5f);
    Sun->SetLightColor(FLinearColor(1.f, .6f, .36f));
    Sun->SetAtmosphereSunLight(true);
    Sun->SetCastShadows(true);
    Add(NewObject<USkyAtmosphereComponent>(this, TEXT("Sky")));
    USkyLightComponent* SkyLight = Add(NewObject<USkyLightComponent>(this, TEXT("SkyLight")));
    SkyLight->bRealTimeCapture = true;
    SkyLight->SetIntensity(1.f);
    UExponentialHeightFogComponent* Fog = Add(NewObject<UExponentialHeightFogComponent>(this, TEXT("Fog")));
    Fog->SetFogDensity(.015f);
    for (int32 Side = 0; Side < 2; ++Side)
    {
        USpotLightComponent* Spot = Add(NewObject<USpotLightComponent>(this, Side == 0 ? TEXT("SpotLeft") : TEXT("SpotRight")));
        Spots.Add(Spot);
        const FVector Aim(Side == 0 ? -170.f : 190.f, 40.f, 90.f);
        const FVector From(Side == 0 ? -420.f : 420.f, 620.f, 620.f);
        Spot->SetRelativeLocation(From);
        Spot->SetRelativeRotation((Aim - From).Rotation());
        Spot->SetIntensityUnits(ELightUnits::Candelas);
        Spot->SetIntensity(2200.f);
        Spot->SetAttenuationRadius(2400.f);
        Spot->SetInnerConeAngle(16.f);
        Spot->SetOuterConeAngle(30.f);
        Spot->SetLightColor(FLinearColor(1.f, .86f, .72f));
        Spot->SetCastShadows(true);
    }
    UPostProcessComponent* Post = Add(NewObject<UPostProcessComponent>(this, TEXT("Exposure")));
    Post->bUnbound = true;
    Post->Settings.bOverride_AutoExposureMinBrightness = true;
    Post->Settings.bOverride_AutoExposureMaxBrightness = true;
    Post->Settings.AutoExposureMinBrightness = 1.f;
    Post->Settings.AutoExposureMaxBrightness = 4.f;
    Caption = Add(NewObject<UTextRenderComponent>(this, TEXT("Caption")));
    Caption->SetRelativeLocation(FVector(0.f, -360.f, 260.f));
    Caption->SetHorizontalAlignment(EHTA_Center);
    Caption->SetWorldSize(16.f);
    Caption->SetTextRenderColor(FColor(200, 190, 175));
    Caption->SetCastShadow(false);
    FActorSpawnParameters Params;
    Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
    Camera = GetWorld()->SpawnActor<ACameraActor>(ACameraActor::StaticClass(), FTransform::Identity, Params);
    if (Camera)
    {
        Camera->GetCameraComponent()->SetFieldOfView(55.f);
        Camera->GetCameraComponent()->bConstrainAspectRatio = false;
    }
    if (APlayerController* PC = GetWorld()->GetFirstPlayerController())
    {
        if (Camera) PC->SetViewTarget(Camera);
        PC->SetIgnoreMoveInput(true);
        PC->bShowMouseCursor = true;
        FInputModeGameAndUI Mode;
        Mode.SetHideCursorDuringCapture(false);
        Mode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
        PC->SetInputMode(Mode);
    }
    UpdateCamera(0.f);
}

// The jam slice's levers: High scalability, half-resolution moving sun shadows, and dynamic
// resolution holding the frame near 16.6 ms. This process only; nothing is saved.
void AFlowFestPhraseStage::ApplyPerfLevers()
{
    Scalability::FQualityLevels Quality = Scalability::GetQualityLevels();
    const float Resolution = Quality.ResolutionQuality;
    Quality.SetFromSingleQualityLevel(2);
    Quality.ResolutionQuality = Resolution;
    Scalability::SetQualityLevels(Quality, true);
    SetCVar(TEXT("r.Shadow.Virtual.ResolutionLodBiasDirectionalMoving"), 1.f);
    SetCVar(TEXT("r.DynamicRes.FrameTimeBudget"), 16.6f);
    SetCVar(TEXT("r.DynamicRes.MinScreenPercentage"), 70.f);
    SetCVar(TEXT("r.DynamicRes.MaxScreenPercentage"), 100.f);
    SetCVar(TEXT("r.DynamicRes.OperationMode"), 2.f);
}

void AFlowFestPhraseStage::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    Elapsed += DeltaSeconds;
    if (!bReady)
    {
        // Hold the first beat while shaders, assets and textures settle, then start the clock.
        bool bSettled = !IsAsyncLoading() && (!GShaderCompilingManager || GShaderCompilingManager->GetNumRemainingJobs() == 0) &&
            IStreamingManager::Get().GetNumWantingResources() == 0;
#if WITH_EDITOR
        bSettled = bSettled && FAssetCompilingManager::Get().GetNumRemainingAssets() == 0;
#endif
        if (!bSettled || Elapsed < 2.0) ReadySince = Elapsed;
        if (Elapsed - ReadySince > 1.0 || Elapsed > 90.0)
        {
            bReady = true;
            ReadySince = Elapsed;
            StatSince = FPlatformTime::Seconds();
            UE_LOG(LogTemp, Display, TEXT("Flow Fest phrase stage: ready after %.1f s"), Elapsed);
        }
    }
    else Beat += DeltaSeconds * Schedule.TempoBpm / 60.f;
    for (FRig& Rig : Rigs) Rig.Update(Schedule, Beat, DeltaSeconds);
    UpdateLights();
    UpdateCamera(DeltaSeconds);
    if (Caption && Schedule.LengthBeats > 0.f)
        Caption->SetText(FText::FromString(FString::Printf(TEXT("PHRASE STAGE%s  ·  %.0f BPM  ·  beat %d / %.0f"),
            Schedule.bFixture ? TEXT("  ·  FIXTURE SCHEDULE") : TEXT(""), Schedule.TempoBpm,
            FMath::FloorToInt(FMath::Fmod(Beat, Schedule.LengthBeats)), Schedule.LengthBeats)));
    if (!bReady) return;
    const double Running = Elapsed - ReadySince;
    if (!RecordDir.IsEmpty())
    {
        if (Running < RecordSeconds)
        {
            // Name a still for each plane: the first frame where a spinner has stood in a captured
            // routine of that plane for two beats (not a rest, not mid-turn).
            for (const FRig& Rig : Rigs)
            {
                if (!Rig.Spec.Phrases.IsValidIndex(Rig.PhraseIndex) || !Rig.bRuntimeRoutine) continue;
                const FPhrase& Phrase = Rig.Spec.Phrases[Rig.PhraseIndex];
                const float Local = FMath::Fmod(Beat, Schedule.LengthBeats) - Phrase.StartBeat;
                if (Phrase.Mode != EMode::Planted || Phrase.bRest || Local < 2.f || StillPlanes.Contains(Phrase.Plane)) continue;
                StillPlanes.Add(Phrase.Plane);
                FFileHelper::SaveStringToFile(FString::Printf(TEXT("%s %04d %s\n"), *Phrase.Plane, RecordedFrames, *Rig.Spec.Id),
                    *(RecordDir / TEXT("stills.txt")), FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM, &IFileManager::Get(), FILEWRITE_Append);
            }
            FScreenshotRequest::RequestScreenshot(RecordDir / FString::Printf(TEXT("frame-%04d.png"), RecordedFrames++), true, false);
        }
        else if (ExitAfter <= 0.f) ExitAfter = RecordSeconds + .5f;
    }
    LogStats();
    LogHands(false);
    if (ExitAfter > 0.f && Running >= ExitAfter)
    {
        LogHands(true);
        UE_LOG(LogTemp, Display, TEXT("Flow Fest phrase stage: exiting after %.1f s (%d frames recorded)"), Running, RecordedFrames);
        ExitAfter = 0.f;
        UKismetSystemLibrary::QuitGame(this, GetWorld()->GetFirstPlayerController(), EQuitPreference::Quit, false);
    }
}

void AFlowFestPhraseStage::UpdateCamera(float DeltaSeconds)
{
    if (!Camera) return;
    if (APlayerController* PC = GetWorld()->GetFirstPlayerController())
    {
        if (PC->IsInputKeyDown(EKeys::LeftMouseButton) || PC->IsInputKeyDown(EKeys::RightMouseButton))
        {
            float X = 0.f, Y = 0.f;
            PC->GetInputMouseDelta(X, Y);
            if (X != 0.f || Y != 0.f) bUserOrbit = true;
            OrbitYaw += X * 2.5f;
            OrbitPitch = FMath::Clamp(OrbitPitch + Y * 2.5f, -60.f, -3.f);
        }
        if (PC->WasInputKeyJustPressed(EKeys::MouseScrollUp)) OrbitDistance = FMath::Max(300.f, OrbitDistance * .9f);
        if (PC->WasInputKeyJustPressed(EKeys::MouseScrollDown)) OrbitDistance = FMath::Min(1600.f, OrbitDistance * 1.1f);
    }
    // Until someone drags, the camera sweeps slowly from the audience side to each flank.
    if (!bUserOrbit) OrbitYaw = -90.f + 40.f * FMath::Sin(2.f * PI * float(Elapsed - ReadySince) / 36.f);
    const FRotator View(OrbitPitch, OrbitYaw, 0.f);
    FVector Target = GetActorLocation() + StageCentre + FVector(0.f, 45.f, 110.f);
    if (!FocusId.IsEmpty()) // body response (2026-10-23) proof camera
        if (const FRig* Focus = Rigs.FindByPredicate([this](const FRig& Rig) { return Rig.Spec.Id == FocusId && IsValid(Rig.Actor); }))
            Target = Focus->Actor->GetActorLocation() + FVector(0.f, 0.f, 100.f);
    Camera->SetActorLocationAndRotation(Target - View.Vector() * OrbitDistance, View);
    const FVector Eye = Camera->GetActorLocation();
    for (FRig& Rig : Rigs)
        if (Rig.Label)
        {
            const FVector To = Eye - Rig.Label->GetComponentLocation();
            Rig.Label->SetWorldRotation(FRotator(0.f, To.Rotation().Yaw, 0.f));
        }
    if (Caption) Caption->SetWorldRotation(FRotator(0.f, (Eye - Caption->GetComponentLocation()).Rotation().Yaw, 0.f));
}

// The jam's wick lights: the first light on each burning end, warm, soft, no shadows, flickering.
void AFlowFestPhraseStage::UpdateLights()
{
    for (int32 Index = 0; Index < Rigs.Num(); ++Index)
    {
        FRig& Rig = Rigs[Index];
        if (!IsValid(Rig.Actor) || Rig.Profile.IsNone()) continue;
        TArray<UPointLightComponent*> Lights;
        Rig.Actor->GetComponents<UPointLightComponent>(Lights);
        const float Flicker = .82f + .12f * FMath::Sin(Elapsed * 9.1f + Index * 1.7f) + .06f * FMath::Sin(Elapsed * 17.3f + Index);
        TSet<USceneComponent*> Lit;
        for (UPointLightComponent* Light : Lights)
        {
            const bool bOn = !Lit.Contains(Light->GetAttachParent());
            Lit.Add(Light->GetAttachParent());
            Light->SetCastShadows(false);
            Light->SetVisibility(bOn);
            if (!bOn) continue;
            Light->SetIntensityUnits(ELightUnits::Candelas);
            Light->SetAttenuationRadius(520.f);
            Light->SetIntensity(7.5f * Flicker);
            Light->SetLightColor(FLinearColor(1.f, .45f, .14f));
        }
    }
}

// The figures `stat unit` shows, from the same engine counters, averaged and logged every 5 s,
// with the gait probe: how far a planted foot's ankle moved while it should have stood still.
void AFlowFestPhraseStage::LogStats()
{
    StatGame += FPlatformTime::ToMilliseconds(GGameThreadTime);
    StatDraw += FPlatformTime::ToMilliseconds(GRenderThreadTime);
    StatGpu += FPlatformTime::ToMilliseconds(RHIGetGPUFrameCycles(0));
    ++StatFrames;
    const double Now = FPlatformTime::Seconds();
    if (Now - StatSince < 5.0 || StatFrames == 0) return;
    const double Wall = (Now - StatSince) * 1000.0 / StatFrames;
    FDynamicResolutionStateInfos Infos;
    GEngine->GetDynamicResolutionCurrentStateInfos(Infos);
    const float Resolution = Infos.Status == EDynamicResolutionStatus::Enabled ? 100.f * Infos.ResolutionFractionApproximations[GDynamicPrimaryResolutionFraction] : -1.f;
    FString Bodies;
    for (const FRig& Rig : Rigs)
    {
        const UFlowFestAnimInstance* Anim = Rig.Avatar ? Cast<UFlowFestAnimInstance>(Rig.Avatar->GetBodyMesh()->GetAnimInstance()) : nullptr;
        const FFlowFestLowerBodyLayerResult Result = Anim ? Anim->GetLowerBodyLayerResult() : FFlowFestLowerBodyLayerResult();
        Bodies += FString::Printf(TEXT("  %s: %s layer=%d drop=%.1fcm reach=%.1f/%.1fcm"), *Rig.Spec.Id,
            Rig.PhraseIndex != INDEX_NONE ? ModeName(Rig.Spec.Phrases[Rig.PhraseIndex].Mode) : TEXT("-"), int32(Result.bApplied),
            Result.PelvisDropCm, Result.ReachErrorCm[0], Result.ReachErrorCm[1]);
        if (Rig.bBodyResponseActive) // body response (2026-10-23)
            Bodies += FString::Printf(TEXT(" body=(%.1f,%.1f,%.1f)cm yaw=%.0f chest=%.0f lift=%.1f/%.1fcm hold=%.1f/%.1fcm"), Rig.BodyResponseOffsetCm.X,
                Rig.BodyResponseOffsetCm.Y, Rig.BodyResponseOffsetCm.Z, Rig.BodyResponseYawDegrees, Rig.BodyResponseChestYawDegrees,
                Rig.BodyResponseLiftCm[0], Rig.BodyResponseLiftCm[1], Rig.HandHoldErrorCm[0], Rig.HandHoldErrorCm[1]);
    }
    UE_LOG(LogTemp, Display, TEXT("FlowFestPhraseStage stat unit [beat %.1f]: fps %.1f  frame %.1f ms  game %.1f  draw %.1f  gpu %.1f  (%d frames, resolution %.0f%%)%s"),
        Beat, 1000.0 / Wall, Wall, StatGame / StatFrames, StatDraw / StatFrames, StatGpu / StatFrames, StatFrames, Resolution, *Bodies);
    StatGame = StatDraw = StatGpu = 0.0;
    StatFrames = 0;
    StatSince = Now;
}

// body response (2026-10-23): one CSV row per rig per frame, in the stage's world centimetres,
// for comparing hand and staff positions across runs at the same beats (the log forces 30 Hz).
void AFlowFestPhraseStage::LogHands(bool bFlush)
{
    if (HandLogPath.IsEmpty()) return;
    if (HandLogFrame == 0)
        HandLog = TEXT("frame,beat,rig,phrase,mode,body,rootX,rootY,rootZ,yaw,lhX,lhY,lhZ,rhX,rhY,rhZ,lsX,lsY,lsZ,rsX,rsY,rsZ\n");
    for (const FRig& Rig : Rigs)
    {
        if (!Rig.Actor || !Rig.Avatar || !Rig.Prop) continue;
        const USkeletalMeshComponent* Body = Rig.Avatar->GetBodyMesh();
        const FVector Root = Rig.Actor->GetActorLocation();
        const FVector Hand[2] = {Body->GetSocketLocation(TEXT("LeftHand")), Body->GetSocketLocation(TEXT("RightHand"))};
        const FVector Staff[2] = {Rig.Prop->GetPropRootTransform(true).GetLocation(), Rig.Prop->GetPropRootTransform(false).GetLocation()};
        HandLog += FString::Printf(TEXT("%d,%.4f,%s,%d,%s,%d,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f\n"),
            HandLogFrame, Beat, *Rig.Spec.Id, Rig.PhraseIndex,
            Rig.Spec.Phrases.IsValidIndex(Rig.PhraseIndex) ? ModeName(Rig.Spec.Phrases[Rig.PhraseIndex].Mode) : TEXT("-"),
            int32(Rig.bBodyResponseActive), Root.X, Root.Y, Root.Z, Rig.Actor->GetActorRotation().Yaw,
            Hand[0].X, Hand[0].Y, Hand[0].Z, Hand[1].X, Hand[1].Y, Hand[1].Z, Staff[0].X, Staff[0].Y, Staff[0].Z, Staff[1].X, Staff[1].Y, Staff[1].Z);
    }
    ++HandLogFrame;
    if (bFlush || HandLog.Len() > (1 << 20))
    {
        FFileHelper::SaveStringToFile(HandLog, *HandLogPath, FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM, &IFileManager::Get(), FILEWRITE_Append);
        HandLog.Reset();
    }
}
