#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "FlowArtsRuntimeMotion.h"
#include "FlowFestPhraseStage.generated.h"

class ACameraActor;
class UFlowFestAvatarComponent;
class UFlowFestPropComponent;
class UTextRenderComponent;


// Phrase stage: two staff spinners play the phrase brain's schedule (planted, turning and
// travelling phrases at the schedule's tempo) on a small lit stage. The schedule file is
// `Content/FlowFest/Assets/Jam/Data/phrase-stage-schedule.json`, written by
// `Tools/export-phrase-stage.ts`. Metres and radians in the jam's frame (x east, z south, yaw 0
// faces +x and turns toward +z); Unreal X = x, Y = z, and Unreal yaw degrees = yaw radians.
namespace FlowFestPhraseStage
{
enum class EMode : uint8 { Planted, Turning, Travelling };

struct FPhrase
{
    float StartBeat = 0.f;
    float Beats = 0.f;
    FString SequenceId;
    FString SequenceName;
    int32 Repeats = 1;
    FString Plane;
    EMode Mode = EMode::Planted;
    float FacingStart = 0.f;
    float FacingEnd = 0.f;
    bool bHasPath = false;
    FVector2D From = FVector2D::ZeroVector;
    FVector2D To = FVector2D::ZeroVector;
    int32 Steps = 0;
    /** Footfall k (1-based) of a walk lands on StartBeat + k * BeatsPerStep. */
    float BeatsPerStep = 1.f;
    /** A turn's length from StartBeat (2 = quarter turn, 3 = half turn); 0 when the file names none. */
    float TurnBeats = 0.f;
    /** Feet planted, props held still at the start of the named sequence. */
    bool bRest = false;
    /** Props only: feet and turns stay on the beat. */
    float JitterBeats = 0.f;
    float TempoDrift = 0.f;
};

struct FPerformer
{
    FString Id;
    int32 Seed = 0;
    FName CharacterId;
    FString PropFamily;
    float Skill = .5f, Style = .5f, Energy = .5f;
    FVector2D Home = FVector2D::ZeroVector;
    float AreaRadius = 1.f;
    TArray<FPhrase> Phrases;
};

struct FSchedule
{
    FString Version;
    float TempoBpm = 120.f;
    float LengthBeats = 0.f;
    bool bFixture = false;
    TArray<FPerformer> Performers;
};

FLOWFEST_API FString SchedulePath();
FLOWFEST_API bool ParseSchedule(const FString& Json, FSchedule& Out, FString& Error);
FLOWFEST_API bool LoadSchedule(FSchedule& Out, FString& Error);
/** The phrase playing at a beat (wrapped into the schedule's length), or INDEX_NONE. */
FLOWFEST_API int32 PhraseIndexAt(const FPerformer& Performer, float Beat);
FLOWFEST_API const TCHAR* ModeName(EMode Mode);
/** The schedule's angle wrap, into (-pi, pi]. */
FLOWFEST_API float WrapAngle(float Angle);
/** Beats into the phrase's sequence at a beat into the phrase (the browser's scoreBeat). */
FLOWFEST_API float ScoreBeat(const FPhrase& Phrase, float LocalBeat);

/** One captured phrase routine: a runtime motion bundle under Content/FlowFest/PhraseStage. */
struct FPhraseMotionEntry
{
    FString CharacterId, PropType, Plane, SequenceId, SequenceName, File, SequenceSHA256;
    float SecondsPerStep = .5f;
};
FLOWFEST_API FString PhraseMotionDir();
/** Every phrase-motions-*.json index in the folder, merged. Empty (not an error) before any capture. */
FLOWFEST_API bool LoadPhraseMotionIndex(TArray<FPhraseMotionEntry>& Out, FString& Error);
FLOWFEST_API const FPhraseMotionEntry* FindPhraseMotion(const TArray<FPhraseMotionEntry>& Index, FName CharacterId,
    FName PropId, const FPhrase& Phrase);

// body response (2026-10-23): the browser planner's hips and feet for one phrase motion, read
// from the `<motion base>.body.json` sidecar beside it (format `flow-fest-body-response-v1`,
// see Tools/native-capture-README.md). Performer frame: +x the performer's left, +z toward the
// audience (the grid facing), y up, metres; yaw radians, same sign as the schedule yaw.
struct FBodyResponseStep
{
    int32 Side = 0; // 0 = performer-left
    float StartStep = 0.f, EndStep = 0.f, LiftM = 0.f;
};
struct FBodyResponseTrack
{
    int32 StepCount = 0;
    int32 SamplesPerStep = 0;
    bool bLoop = true;
    /** Hips offset and body yaw: x, y (a duck when negative), z, yaw. */
    TArray<FVector4f> Offset;
    /** Each foot's planted offset from the native footprint and its yaw: x, z, lift, yaw. */
    TArray<FVector4f> Feet[2];
    TArray<FBodyResponseStep> Steps;
    /** Optional: the twist the chest keeps against the body yaw, radians per sample (empty when absent). */
    TArray<float> ChestYaw;
};
struct FBodyResponseSample
{
    FVector4f Offset = FVector4f(0.f, 0.f, 0.f, 0.f);
    FVector4f Feet[2] = {FVector4f(0.f, 0.f, 0.f, 0.f), FVector4f(0.f, 0.f, 0.f, 0.f)};
    /** Swing progress 0..1 of a listed step, or -1 while the foot is planted. */
    float Swing[2] = {-1.f, -1.f};
    float ChestYaw = 0.f;
};
/** The sidecar beside a phrase motion file: `Motions/x.motion.json` -> `Motions/x.body.json`. */
FLOWFEST_API FString BodyResponseFile(const FString& MotionFile);
FLOWFEST_API bool ParseBodyResponse(const FString& Json, FBodyResponseTrack& Out, FString& Error);
/** Linear between samples at a score step (steps into the sequence), wrapped and continuous across a looping seam. */
FLOWFEST_API FBodyResponseSample SampleBodyResponse(const FBodyResponseTrack& Track, float ScoreStep);

/** Half the distance between the two feet's centre lines, metres. */
constexpr float FootGaugeM = .11f;

/** Where a foot stands from LandBeat until the next plant lifts it. Side 0 = performer-left. */
struct FPlant
{
    float LiftBeat = -1.f;
    float LandBeat = -1.f;
    FVector2D At = FVector2D::ZeroVector;
    float Yaw = 0.f;
    float LiftM = 0.f;
};

struct FBodyKey
{
    float Beat = 0.f;
    FVector2D Centre = FVector2D::ZeroVector;
    float Yaw = 0.f; // unwrapped
};

struct FWalkWindow
{
    float Start = 0.f, End = 0.f, Weight = 0.f;
};

/** The whole schedule's footwork for one performer: every footprint, the body track between them. */
struct FLOWFEST_API FGait
{
    TArray<FPlant> Plants[2];
    TArray<FBodyKey> Body;
    TArray<FWalkWindow> Walking;
    TArray<TPair<float, int32>> Landings; // beat, side; sorted
    float LengthBeats = 0.f;
};

struct FLOWFEST_API FGaitSample
{
    FVector2D Foot[2] = {FVector2D::ZeroVector, FVector2D::ZeroVector};
    float FootYaw[2] = {0.f, 0.f};
    float LiftM[2] = {0.f, 0.f};
    /** Swing progress 0..1, or -1 while the foot is planted. */
    float Swing[2] = {-1.f, -1.f};
    FVector2D Centre = FVector2D::ZeroVector;
    float Yaw = 0.f;
    float WalkWeight = 0.f;
    /** Gait cycle, 0 at a left landing and .5 at a right landing. */
    float Cycle = 0.f;
    bool bStepping = false;
};

/** Plans every footprint: walks land footfall k on StartBeat + k * BeatsPerStep, turns step within
 *  TurnBeats, and the feet never take the props' timing jitter. */
FLOWFEST_API FGait PlanGait(const FPerformer& Performer, float LengthBeats);
FLOWFEST_API FGaitSample SampleGait(const FGait& Gait, float Beat);
FLOWFEST_API FVector2D LeftOf(float Yaw);

/** One spinner on the stage. Plain struct so tests can drive it in a transient world. */
struct FLOWFEST_API FRig
{
    FPerformer Spec;
    FGait Gait;
    AActor* Actor = nullptr;
    UFlowFestAvatarComponent* Avatar = nullptr;
    UFlowFestPropComponent* Prop = nullptr;
    UTextRenderComponent* Label = nullptr;
    FVector Origin = FVector::ZeroVector;
    int32 PhraseIndex = INDEX_NONE;
    FName Profile = NAME_None;
    FName Finish = NAME_None;
    float HeelStrikeCycle = 0.f; // Walk clip phase (0..1) of the left heel strike
    float WalkLength = 1.f;
    float IdleLength = 1.f;
    float IdleTime = 0.f;
    float BaseRate = 1.f;
    FGaitSample Last;
    /** Each phrase's captured routine, aligned with Spec.Phrases; null plays the built-in fallback. */
    TArray<TSharedPtr<const FFlowArtsRuntimeMotion, ESPMode::ThreadSafe>> PhraseMotions;
    TArray<float> PhraseSecondsPerStep;
    bool bRuntimeRoutine = false;
    int32 FallbackPhrases = 0;
    // body response (2026-10-23): opt-in (-BodyResponse); each phrase's sidecar, aligned with Spec.Phrases.
    bool bBodyResponse = false;
    TArray<TSharedPtr<const FBodyResponseTrack, ESPMode::ThreadSafe>> PhraseBodyTracks;
    bool bBodyResponseActive = false;
    FVector BodyResponseOffsetCm = FVector::ZeroVector;
    float BodyResponseYawDegrees = 0.f;
    float BodyResponseLiftCm[2] = {0.f, 0.f};
    float BodyResponseChestYawDegrees = 0.f;
    float HandHoldErrorCm[2] = {-1.f, -1.f};

    bool Spawn(UWorld* World, const FPerformer& Performer, float LengthBeats, const FVector& StageOrigin, FName PropId,
        FName InFinish, bool bLabel, FString& Error);
    /** Loads every phrase's routine from the index. Returns how many phrases have one. */
    int32 LoadPhraseMotions(const TArray<FPhraseMotionEntry>& Index);
    /** The routine clock for a beat into the given phrase, seconds. */
    float RoutineSeconds(int32 Index, float LocalBeat) const;
    /** Places the body and props for a beat. Call before the body mesh evaluates this frame. */
    void Update(const FSchedule& Schedule, float Beat, float DeltaSeconds);
    FVector World(const FVector2D& P, float HeightCm = 0.f) const { return Origin + FVector(P.X * 100.f, P.Y * 100.f, HeightCm); }
};
}

/** The -FlowFestPhraseStage scene: stage, lights, two spinners, labels, orbit camera, proof capture. */
UCLASS()
class FLOWFEST_API AFlowFestPhraseStage : public AActor
{
    GENERATED_BODY()
public:
    AFlowFestPhraseStage();
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;

private:
    FlowFestPhraseStage::FSchedule Schedule;
    TArray<FlowFestPhraseStage::FRig> Rigs;
    UPROPERTY(Transient) TObjectPtr<ACameraActor> Camera;
    UPROPERTY(Transient) TObjectPtr<UTextRenderComponent> Caption;
    UPROPERTY(Transient) TArray<TObjectPtr<class USpotLightComponent>> Spots;
    FVector StageCentre = FVector::ZeroVector;
    float Beat = 0.f;
    float StartBeat = 0.f;
    double Elapsed = 0.0;
    float OrbitYaw = -90.f, OrbitPitch = -13.f, OrbitDistance = 820.f;
    bool bUserOrbit = false;
    /** body response (2026-10-23) proof camera: frame one performer by id (-FlowFestPhraseStageFocus=). */
    FString FocusId;
    /** body response (2026-10-23) probe: per-frame hand and staff positions as CSV (-FlowFestPhraseStageHandLog=). */
    FString HandLogPath;
    FString HandLog;
    int32 HandLogFrame = 0;
    void LogHands(bool bFlush);
    bool bReady = false;
    double ReadySince = 0.0;
    FString RecordDir;
    float RecordSeconds = 20.f;
    int32 RecordedFrames = 0;
    TSet<FString> StillPlanes;
    float ExitAfter = 0.f;
    double StatSince = 0.0;
    double StatGame = 0.0, StatDraw = 0.0, StatGpu = 0.0;
    int32 StatFrames = 0;
    void BuildStage();
    void ApplyPerfLevers();
    void UpdateCamera(float DeltaSeconds);
    void UpdateLights();
    void LogStats();
};
