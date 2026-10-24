#include "FlowFestJam.h"
#include "FlowFestWorld.h"
#include "FlowFestAvatarComponent.h"
#include "Camera/PlayerCameraManager.h"
#include "FlowFestPropComponent.h"
#include "FlowFestActivityPose.h"
#include "FlowArtsPerformanceSession.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Dom/JsonObject.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "GameFramework/Pawn.h"
#include "Kismet/GameplayStatics.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "NiagaraComponent.h"
#include "NiagaraSystem.h"
#include "ProceduralMeshComponent.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace FlowFestJam
{
namespace
{
FVector2D Point(const TSharedPtr<FJsonObject>& O) { return O.IsValid() ? FVector2D(O->GetNumberField(TEXT("x")), O->GetNumberField(TEXT("z"))) : FVector2D::ZeroVector; }
FVector2D PointField(const TSharedPtr<FJsonObject>& O, const TCHAR* Name)
{
    const TSharedPtr<FJsonObject>* Child = nullptr;
    return O->TryGetObjectField(Name, Child) ? Point(*Child) : FVector2D::ZeroVector;
}
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
bool Bool(const TSharedPtr<FJsonObject>& O, const TCHAR* Name)
{
    bool Value = false;
    if (O.IsValid()) O->TryGetBoolField(Name, Value);
    return Value;
}
const TArray<TSharedPtr<FJsonValue>>& Arr(const TSharedPtr<FJsonObject>& O, const TCHAR* Name)
{
    static const TArray<TSharedPtr<FJsonValue>> Empty;
    const TArray<TSharedPtr<FJsonValue>>* Out = nullptr;
    return O.IsValid() && O->TryGetArrayField(Name, Out) && Out ? *Out : Empty;
}
TArray<FVector2D> Line(const TArray<TSharedPtr<FJsonValue>>& Values)
{
    TArray<FVector2D> Out;
    for (const TSharedPtr<FJsonValue>& V : Values) Out.Add(Point(V->AsObject()));
    return Out;
}
void Seeds(const TSharedPtr<FJsonObject>& O, float Out[4])
{
    const TArray<TSharedPtr<FJsonValue>>& S = Arr(O, TEXT("seeds"));
    for (int32 I = 0; I < 4; ++I) Out[I] = I < S.Num() ? float(S[I]->AsNumber()) : .5f;
}
FLinearColor Colour(const TArray<TSharedPtr<FJsonValue>>& V, const FLinearColor& Default)
{
    return V.Num() >= 3 ? FLinearColor(V[0]->AsNumber(), V[1]->AsNumber(), V[2]->AsNumber()) : Default;
}
float SegmentDistance(const FVector2D& P, const FVector2D& A, const FVector2D& B)
{
    const FVector2D D = B - A;
    const float T = D.SizeSquared() > 1e-8f ? FMath::Clamp(FVector2D::DotProduct(P - A, D) / D.SizeSquared(), 0.f, 1.f) : 0.f;
    return FVector2D::Distance(P, A + D * T);
}
float Smooth(float X) { X = FMath::Clamp(X, 0.f, 1.f); return X * X * (3.f - 2.f * X); }
// Deterministic hash, never the clock.
float Hash01(int32 A, int32 B)
{
    uint32 X = uint32(A) * 747796405u + uint32(B) * 2891336453u + 277803737u;
    X = ((X >> ((X >> 28u) + 4u)) ^ X) * 277803737u;
    return float((X >> 22u) ^ X) / 4294967295.f;
}
constexpr float Latitude = 39.59f, Declination = 18.78f, SolarNoon = 13.591f;
}

FString LayoutPath() { return FPaths::ProjectContentDir() / TEXT("FlowFest/Assets/Jam/Data/jam-layout.json"); }

bool ParseLayout(const FString& Json, FLayout& Out, FString& Error)
{
    TSharedPtr<FJsonObject> Root;
    if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json), Root) || !Root.IsValid()) { Error = TEXT("jam-layout.json does not parse"); return false; }
    Out = FLayout();
    Out.Version = int32(Num(Root, TEXT("version")));
    if (Out.Version != 2) { Error = FString::Printf(TEXT("jam layout version %d, expected 2"), Out.Version); return false; }
    Out.Centre = PointField(Root, TEXT("centre"));
    Out.Boundary = Line(Arr(Root, TEXT("boundary")));
    Out.Perimeter = Num(Root, TEXT("perimeterMeters"));
    const TSharedPtr<FJsonObject>* EntranceObject = nullptr;
    if (Root->TryGetObjectField(TEXT("entrance"), EntranceObject))
    {
        const TSharedPtr<FJsonObject>& E = *EntranceObject;
        Out.Entrance = Point(E);
        Out.Inward = PointField(E, TEXT("inward"));
        Out.GapStart = Num(E, TEXT("gapStart"));
        Out.GapEnd = Num(E, TEXT("gapEnd"));
        const TArray<FVector2D> Posts = Line(Arr(E, TEXT("posts")));
        for (int32 I = 0; I < 2 && I < Posts.Num(); ++I) Out.Posts[I] = Posts[I];
        const TSharedPtr<FJsonObject>* Arch = nullptr;
        if (E->TryGetObjectField(TEXT("archway"), Arch)) { Out.Archway = Point(*Arch); Out.ArchwayYaw = Num(*Arch, TEXT("yaw")); }
        Out.Flame = PointField(E, TEXT("flame"));
        for (const TSharedPtr<FJsonValue>& F : Arr(E, TEXT("funnel"))) Out.Funnel.Add(Line(F->AsArray()));
    }
    for (const TSharedPtr<FJsonValue>& R : Arr(Root, TEXT("rope"))) Out.Rope.Add(Line(R->AsArray()));
    Out.Queue = Line(Arr(Root, TEXT("queue")));
    for (const TSharedPtr<FJsonValue>& V : Arr(Root, TEXT("obstacles")))
    {
        const TSharedPtr<FJsonObject> O = V->AsObject();
        Out.Obstacles.Add({Str(O, TEXT("id")), Point(O), Num(O, TEXT("radius"))});
    }
    for (const TSharedPtr<FJsonValue>& V : Arr(Root, TEXT("stations")))
    {
        const TSharedPtr<FJsonObject> O = V->AsObject();
        FStation S{Str(O, TEXT("id")), Point(O), Num(O, TEXT("yaw")), Str(O, TEXT("towel")) != TEXT("ground"), Bool(O, TEXT("occupied")), int32(Num(O, TEXT("chairColour")))};
        Out.Stations.Add(S);
    }
    for (const TSharedPtr<FJsonValue>& V : Arr(Root, TEXT("dressing")))
    {
        const TSharedPtr<FJsonObject> O = V->AsObject();
        Out.Dressing.Add({Str(O, TEXT("id")), Str(O, TEXT("kind")), Point(O), Num(O, TEXT("yaw")), int32(Num(O, TEXT("colour"))), Str(O, TEXT("carries"))});
    }
    for (const TSharedPtr<FJsonValue>& V : Arr(Root, TEXT("spectators")))
    {
        const TSharedPtr<FJsonObject> O = V->AsObject();
        Out.Spectators.Add({Str(O, TEXT("id")), Point(O), Num(O, TEXT("yaw")), Num(O, TEXT("order"))});
    }
    for (const TSharedPtr<FJsonValue>& V : Arr(Root, TEXT("performers")))
    {
        const TSharedPtr<FJsonObject> O = V->AsObject();
        FPerformer P;
        P.Id = Str(O, TEXT("id")); P.Prop = Str(O, TEXT("prop")); P.Finish = Str(O, TEXT("finish"));
        P.bJuggler = Bool(O, TEXT("juggler")); P.bFacesAudience = Bool(O, TEXT("facesAudience"));
        P.Start = PointField(O, TEXT("start")); P.Order = Num(O, TEXT("order"));
        Seeds(O, P.Seeds);
        Out.Performers.Add(P);
    }
    for (const TSharedPtr<FJsonValue>& V : Arr(Root, TEXT("outsideSpinners")))
    {
        const TSharedPtr<FJsonObject> O = V->AsObject();
        FOutsideSpinner S;
        S.Id = Str(O, TEXT("id")); S.Prop = Str(O, TEXT("prop")); S.Anchor = Str(O, TEXT("anchor"));
        S.bJuggler = Bool(O, TEXT("juggler")); S.At = Point(O); S.Yaw = Num(O, TEXT("yaw"));
        S.WanderRadius = Num(O, TEXT("wanderRadius"), 1.f); S.Order = Num(O, TEXT("order"));
        Seeds(O, S.Seeds);
        Out.OutsideSpinners.Add(S);
    }
    const TSharedPtr<FJsonObject>* Booth = nullptr;
    if (Root->TryGetObjectField(TEXT("djBooth"), Booth))
    {
        Out.Booth = Point(*Booth); Out.BoothYaw = Num(*Booth, TEXT("yaw"));
        Out.BoothWidth = Num(*Booth, TEXT("width"), 2.4f); Out.BoothDepth = Num(*Booth, TEXT("depth"), 1.1f);
        Out.BeatsPerMinute = Num(*Booth, TEXT("beatsPerMinute"), 118.f); Out.BeatUntilHour = Num(*Booth, TEXT("untilHour"), 26.f);
    }
    for (const TSharedPtr<FJsonValue>& V : Arr(Root, TEXT("stringLights")))
    {
        const TSharedPtr<FJsonObject> O = V->AsObject();
        FStringLight Run;
        Run.Id = Str(O, TEXT("id")); Run.Sag = Num(O, TEXT("sag"), .4f); Run.BulbSpacing = Num(O, TEXT("bulbSpacing"), .5f);
        for (const TSharedPtr<FJsonValue>& A : Arr(O, TEXT("anchors")))
        {
            const TSharedPtr<FJsonObject> P = A->AsObject();
            Run.Anchors.Add(FVector(Num(P, TEXT("x")), Num(P, TEXT("z")), Num(P, TEXT("height"))));
        }
        Out.StringLights.Add(Run);
    }
    const TSharedPtr<FJsonObject>* Handover = nullptr;
    if (Root->TryGetObjectField(TEXT("handover"), Handover)) { Out.Handover = Point(*Handover); Out.HandoverYaw = Num(*Handover, TEXT("yaw")); }
    for (const TSharedPtr<FJsonValue>& V : Arr(Root, TEXT("openingShot")))
    {
        const TSharedPtr<FJsonObject> O = V->AsObject();
        FShotKey K;
        K.Seconds = Num(O, TEXT("seconds")); K.At = Point(O); K.Height = Num(O, TEXT("heightAboveGround"));
        K.Look = FVector2D(Num(O, TEXT("lookX")), Num(O, TEXT("lookZ"))); K.LookHeight = Num(O, TEXT("lookHeightAboveGround"));
        K.SunElevation = Num(O, TEXT("sunElevationDegrees"));
        Out.Opening.Add(K);
    }
    for (const TSharedPtr<FJsonValue>& V : Arr(Root, TEXT("night")))
    {
        const TSharedPtr<FJsonObject> O = V->AsObject();
        Out.Night.Add({Num(O, TEXT("hour")), Num(O, TEXT("inside")), Num(O, TEXT("watching"))});
    }
    const TSharedPtr<FJsonObject>* Light = nullptr;
    if (Root->TryGetObjectField(TEXT("light"), Light))
    {
        Out.RopeOnBelow = Num(*Light, TEXT("ropeOnBelowDegrees"), 1.f);
        Out.RopeFullBelow = Num(*Light, TEXT("ropeFullBelowDegrees"), -5.f);
        Out.RopeColour = Colour(Arr(*Light, TEXT("ropeColour")), Out.RopeColour);
        Out.RopeDrift = Colour(Arr(*Light, TEXT("ropeDriftColour")), Out.RopeDrift);
        Out.RopeDriftSeconds = Num(*Light, TEXT("ropeDriftSeconds"), 90.f);
        Out.MaxFireAtOnce = int32(Num(*Light, TEXT("maxFireAtOnce"), 18.f));
    }
    const TSharedPtr<FJsonObject>* Interaction = nullptr;
    if (Root->TryGetObjectField(TEXT("interaction"), Interaction))
    {
        const TSharedPtr<FJsonObject>& I = *Interaction;
        Out.LingerSpeed = Num(I, TEXT("lingerSpeedMetersPerSecond"), .6f);
        Out.LingerRadius = Num(I, TEXT("lingerRadiusMeters"), 9.f);
        Out.LingerSettle = Num(I, TEXT("lingerSettleSeconds"), 2.5f);
        Out.NoticeSeconds = Num(I, TEXT("noticeSeconds"), 6.f);
        Out.DuetSeconds = Num(I, TEXT("duetSeconds"), 18.f);
        Out.NoticeRadius = Num(I, TEXT("noticeRadiusMeters"), 14.f);
    }
    if (Out.Boundary.Num() < 8 || Out.Rope.IsEmpty() || Out.Performers.IsEmpty()) { Error = TEXT("jam layout is missing its boundary, rope or performers"); return false; }
    return true;
}

bool LoadLayout(FLayout& Out, FString& Error)
{
    FString Text;
    if (!FFileHelper::LoadFileToString(Text, *LayoutPath())) { Error = FString::Printf(TEXT("missing %s; run npx tsx unreal/FlowFest/Tools/export-jam.ts"), *LayoutPath()); return false; }
    return ParseLayout(Text, Out, Error);
}

bool Inside(const TArray<FVector2D>& Loop, const FVector2D& P)
{
    bool bIn = false;
    for (int32 I = 0, J = Loop.Num() - 1; I < Loop.Num(); J = I++)
    {
        const FVector2D& A = Loop[I]; const FVector2D& B = Loop[J];
        if ((A.Y > P.Y) != (B.Y > P.Y) && P.X < (B.X - A.X) * (P.Y - A.Y) / (B.Y - A.Y) + A.X) bIn = !bIn;
    }
    return bIn;
}

float DistanceToLine(const TArray<FVector2D>& Points, const FVector2D& P, bool bClosed)
{
    float Best = TNumericLimits<float>::Max();
    const int32 Count = Points.Num();
    for (int32 I = 0; I + 1 < Count + (bClosed ? 1 : 0); ++I)
        Best = FMath::Min(Best, SegmentDistance(P, Points[I], Points[(I + 1) % Count]));
    return Count == 1 ? FVector2D::Distance(P, Points[0]) : Best;
}

float DistanceToRope(const FLayout& Layout, const FVector2D& P)
{
    float Best = TNumericLimits<float>::Max();
    for (const TArray<FVector2D>& Run : Layout.Rope) Best = FMath::Min(Best, DistanceToLine(Run, P, false));
    return Best;
}

FVector2D KeepInside(const FLayout& Layout, const FVector2D& P)
{
    FVector2D Q = P;
    for (int32 Step = 0; Step < 24; ++Step)
    {
        if (Inside(Layout.Boundary, Q) && DistanceToLine(Layout.Boundary, Q, true) >= RopeClearance) return Q;
        Q = FMath::Lerp(Q, Layout.Centre, .15f);
    }
    return Layout.Centre;
}

float MidMayElevation(float RealHour)
{
    const float Phi = FMath::DegreesToRadians(Latitude), Delta = FMath::DegreesToRadians(Declination);
    const float HourAngle = FMath::DegreesToRadians((RealHour - SolarNoon) * 15.f);
    return FMath::RadiansToDegrees(FMath::Asin(FMath::Sin(Phi) * FMath::Sin(Delta) + FMath::Cos(Phi) * FMath::Cos(Delta) * FMath::Cos(HourAngle)));
}

float EquivalentHour(float SunElevation, bool bMorning)
{
    const float Phi = FMath::DegreesToRadians(Latitude), Delta = FMath::DegreesToRadians(Declination);
    const float CosH = (FMath::Sin(FMath::DegreesToRadians(SunElevation)) - FMath::Sin(Phi) * FMath::Sin(Delta)) / (FMath::Cos(Phi) * FMath::Cos(Delta));
    const float Hours = FMath::RadiansToDegrees(FMath::Acos(FMath::Clamp(CosH, -1.f, 1.f))) / 15.f;
    return bMorning ? SolarNoon + 24.f - Hours : SolarNoon + Hours;
}

float ModelElevation(float ClockHour) { return -AFlowFestWorld::SunRotationAt(ClockHour).Pitch; }

float SolveClockHour(float SunElevation)
{
    // The model's evening runs from 68 degrees at noon to -68 at midnight, monotonically.
    float Low = 12.f, High = 24.f;
    for (int32 I = 0; I < 40; ++I)
    {
        const float Mid = .5f * (Low + High);
        if (ModelElevation(Mid) > SunElevation) Low = Mid; else High = Mid;
    }
    return .5f * (Low + High);
}

float RopeGlow(const FLayout& Layout, float SunElevation)
{
    const float Span = FMath::Max(.01f, Layout.RopeOnBelow - Layout.RopeFullBelow);
    return Smooth((Layout.RopeOnBelow - SunElevation) / Span);
}

FVector2D NightAt(const FLayout& Layout, float RealHour)
{
    const TArray<FNightKey>& K = Layout.Night;
    if (K.IsEmpty()) return FVector2D(1, 1);
    if (RealHour <= K[0].Hour) return FVector2D(K[0].Inside, K[0].Watching);
    for (int32 I = 1; I < K.Num(); ++I)
        if (RealHour <= K[I].Hour)
        {
            const float T = (RealHour - K[I - 1].Hour) / FMath::Max(.001f, K[I].Hour - K[I - 1].Hour);
            return FVector2D(FMath::Lerp(K[I - 1].Inside, K[I].Inside, T), FMath::Lerp(K[I - 1].Watching, K[I].Watching, T));
        }
    return FVector2D(K.Last().Inside, K.Last().Watching);
}

FVector2D NightForClock(const FLayout& Layout, float ClockHour)
{
    const float Elevation = ModelElevation(ClockHour);
    if (RopeGlow(Layout, Elevation) <= 0.f) return FVector2D::ZeroVector;
    return NightAt(Layout, EquivalentHour(Elevation, ClockHour < 12.f));
}

float ShotLength(const FLayout& Layout) { return Layout.Opening.IsEmpty() ? 0.f : Layout.Opening.Last().Seconds; }

void SampleShot(const FLayout& Layout, float Seconds, FVector& Eye, FVector& Look, float& SunElevation)
{
    const TArray<FShotKey>& K = Layout.Opening;
    if (K.IsEmpty()) { Eye = FVector(Layout.Handover, 1.7f); Look = FVector(Layout.Centre, 1.f); SunElevation = -7.f; return; }
    int32 I = 1;
    while (I < K.Num() - 1 && Seconds > K[I].Seconds) ++I;
    const FShotKey& A = K[FMath::Max(0, I - 1)];
    const FShotKey& B = K[FMath::Min(I, K.Num() - 1)];
    const float Raw = FMath::Clamp((Seconds - A.Seconds) / FMath::Max(.001f, B.Seconds - A.Seconds), 0.f, 1.f);
    // Catmull-Rom through the keys keeps the descent one unbroken move; ease the very ends.
    const FShotKey& P0 = K[FMath::Max(0, I - 2)];
    const FShotKey& P3 = K[FMath::Min(K.Num() - 1, I + 1)];
    const float T = (I == 1 || I == K.Num() - 1) ? Raw : Raw;
    auto Cr = [T](float p0, float p1, float p2, float p3)
    {
        return .5f * ((2.f * p1) + (-p0 + p2) * T + (2.f * p0 - 5.f * p1 + 4.f * p2 - p3) * T * T + (-p0 + 3.f * p1 - 3.f * p2 + p3) * T * T * T);
    };
    Eye = FVector(Cr(P0.At.X, A.At.X, B.At.X, P3.At.X), Cr(P0.At.Y, A.At.Y, B.At.Y, P3.At.Y), FMath::Max(.8f, Cr(P0.Height, A.Height, B.Height, P3.Height)));
    Look = FVector(Cr(P0.Look.X, A.Look.X, B.Look.X, P3.Look.X), Cr(P0.Look.Y, A.Look.Y, B.Look.Y, P3.Look.Y), Cr(P0.LookHeight, A.LookHeight, B.LookHeight, P3.LookHeight));
    SunElevation = FMath::Lerp(A.SunElevation, B.SunElevation, FMath::InterpEaseInOut(0.f, 1.f, Raw, 1.6f));
}

FVector2D Drift(const FVector2D& Home, float Radius, const float S[4], float Seconds)
{
    const float A = Seconds * (.031f + .023f * S[0]) + S[1] * 6.283f;
    const float B = Seconds * (.019f + .017f * S[2]) + S[3] * 6.283f;
    return Home + FVector2D(FMath::Sin(A) + .45f * FMath::Sin(2.3f * B), FMath::Cos(B) + .45f * FMath::Sin(1.7f * A)) * (Radius / 1.45f);
}

FName PropIdFor(const FString& Prop, bool bJuggler, bool bLed)
{
    if (bJuggler || Prop == TEXT("clubs")) return TEXT("club");
    if (Prop == TEXT("poi") || Prop == TEXT("rope-dart")) return TEXT("poi");
    if (Prop == TEXT("staff")) return TEXT("staff");
    if (Prop == TEXT("dragon-staff")) return TEXT("bigstaff");
    if (Prop == TEXT("double-staff")) return TEXT("fire_double_staff");
    if (Prop == TEXT("fans")) return bLed ? TEXT("fan:day_black_bare") : TEXT("fan:fire_black_bare");
    if (Prop == TEXT("hoop")) return TEXT("bighoop");
    return TEXT("poi");
}

TArray<FVector> StringBulbs(const FStringLight& Run)
{
    TArray<FVector> Out;
    for (int32 I = 1; I < Run.Anchors.Num(); ++I)
    {
        const FVector A = Run.Anchors[I - 1], B = Run.Anchors[I];
        const float Span = FVector2D::Distance(FVector2D(A), FVector2D(B));
        const int32 Count = FMath::Max(1, FMath::RoundToInt(Span / FMath::Max(.1f, Run.BulbSpacing)));
        for (int32 K = I == 1 ? 0 : 1; K <= Count; ++K)
        {
            const float T = float(K) / Count;
            FVector P = FMath::Lerp(A, B, T);
            P.Z -= Run.Sag * 4.f * T * (1.f - T);
            Out.Add(P);
        }
    }
    return Out;
}
}

using namespace FlowFestJam;

namespace
{
constexpr float Cm = 100.f;
UStaticMesh* JamMesh(const TCHAR* Name)
{
    return LoadObject<UStaticMesh>(nullptr, *FString::Printf(TEXT("/Game/FlowFest/Assets/Jam/SM_Jam_%s.SM_Jam_%s"), Name, Name), nullptr, LOAD_NoWarn | LOAD_Quiet);
}
UMaterialInterface* JamMaterial(const TCHAR* Name)
{
    return LoadObject<UMaterialInterface>(nullptr, *FString::Printf(TEXT("/Game/FlowFest/Assets/Jam/%s.%s"), Name, Name), nullptr, LOAD_NoWarn | LOAD_Quiet);
}
UStaticMesh* Basic(const TCHAR* Name) { return LoadObject<UStaticMesh>(nullptr, *FString::Printf(TEXT("/Engine/BasicShapes/%s.%s"), Name, Name)); }

// Camp-chair fabric, blankets and nylon: festival colours that are not yet sun-faded.
const FLinearColor ChairColours[] = { {.035f, .07f, .19f}, {.05f, .16f, .07f}, {.3f, .04f, .03f}, {.12f, .12f, .12f}, {.03f, .2f, .22f}, {.42f, .14f, .02f}, {.16f, .05f, .2f}, {.02f, .02f, .022f} };
const FLinearColor BlanketColours[] = { {.45f, .1f, .05f}, {.08f, .2f, .3f}, {.5f, .36f, .08f}, {.18f, .3f, .12f}, {.32f, .08f, .22f}, {.55f, .5f, .42f} };
const FLinearColor PlasticColours[] = { {.55f, .55f, .52f}, {.06f, .2f, .45f}, {.45f, .06f, .04f}, {.06f, .3f, .12f}, {.5f, .38f, .05f} };
const FLinearColor NylonColours[] = { {.5f, .1f, .25f}, {.08f, .3f, .45f}, {.45f, .4f, .06f}, {.12f, .12f, .14f} };
template <int32 N> const FLinearColor& Pick(const FLinearColor (&Palette)[N], int32 Index) { return Palette[((Index % N) + N) % N]; }

// A tube through points, with radius in centimetres; one section of a procedural mesh.
void AddTube(UProceduralMeshComponent* Mesh, int32 Section, const TArray<FVector>& Points, float Radius, int32 Sides = 6)
{
    TArray<FVector> V; TArray<int32> T; TArray<FVector> N; TArray<FVector2D> UV; TArray<FLinearColor> C; TArray<FProcMeshTangent> Tan;
    float Along = 0.f;
    for (int32 I = 0; I < Points.Num(); ++I)
    {
        const FVector Dir = (Points[FMath::Min(I + 1, Points.Num() - 1)] - Points[FMath::Max(I - 1, 0)]).GetSafeNormal();
        const FVector Side = FVector::CrossProduct(Dir, FVector::UpVector).GetSafeNormal();
        const FVector Up = FVector::CrossProduct(Side, Dir);
        if (I > 0) Along += FVector::Distance(Points[I], Points[I - 1]);
        for (int32 S = 0; S <= Sides; ++S)
        {
            const float A = 2.f * PI * S / Sides;
            const FVector Normal = Side * FMath::Cos(A) + Up * FMath::Sin(A);
            V.Add(Points[I] + Normal * Radius); N.Add(Normal); UV.Add(FVector2D(Along / 100.f, float(S) / Sides)); C.Add(FLinearColor::White);
        }
        if (I == 0) continue;
        const int32 Row = (I - 1) * (Sides + 1), Next = I * (Sides + 1);
        for (int32 S = 0; S < Sides; ++S)
            T.Append({Row + S, Next + S, Row + S + 1, Row + S + 1, Next + S, Next + S + 1});
    }
    Mesh->CreateMeshSection_LinearColor(Section, V, T, N, UV, C, Tan, false);
}
}

// Jam polish
void AFlowFestWorld::BuildJam()
{
    FLayout Layout;
    FString Error;
    if (!LoadLayout(Layout, Error))
    {
        UE_LOG(LogTemp, Error, TEXT("Flow Fest jam not built: %s"), *Error);
        return;
    }
    // The fire landmark is the jam's centre now: the journey's "fire circle" and the crowd's
    // fire turns lead there. The old bonfire, benches and shadowed fire light are gone.
    Landmarks.Add(TEXT("fire"), Layout.Centre);
    // The crowd's fire watchers stand behind the jam's own spectators, outside the rope and
    // off the walk, the funnel and the structures.
    {
        TArray<FVector2D> Spots;
        for (int32 I = 0; I < Layout.Boundary.Num(); I += 9)
        {
            const FVector2D P = Layout.Boundary[I];
            const FVector2D Out = (P - Layout.Centre).GetSafeNormal();
            const FVector2D Spot = P + Out * (3.6f + 1.2f * Hash01(I, 3));
            bool bClear = FVector2D::Distance(Spot, Layout.Entrance) > 7.f && DistanceToLine(Layout.Queue, Spot, false) > 2.5f;
            for (const TArray<FVector2D>& F : Layout.Funnel) bClear &= DistanceToLine(F, Spot, false) > 2.f;
            for (const FObstacle& O : Layout.Obstacles) bClear &= FVector2D::Distance(Spot, O.At) > O.Radius + .6f;
            if (bClear) Spots.Add(Spot);
        }
        Crowd.SetFireWatchSpots(Spots);
    }

    Jam = NewObject<UFlowFestJamComponent>(this, TEXT("Jam"));
    Jam->RegisterComponent();

    // Instance groups with a per-instance colour in custom data 0-2.
    const auto Group = [this](const TCHAR* Name, UStaticMesh* Fallback = nullptr, UMaterialInterface* FallbackMaterial = nullptr) -> UHierarchicalInstancedStaticMeshComponent*
    {
        UStaticMesh* Mesh = JamMesh(Name);
        UHierarchicalInstancedStaticMeshComponent* G = AddInstanceGroup(Mesh ? Mesh : Fallback, FString(TEXT("Jam_")) + Name, Mesh ? nullptr : FallbackMaterial);
        if (!Mesh) UE_LOG(LogTemp, Warning, TEXT("Flow Fest jam mesh missing: SM_Jam_%s; run Tools/import-jam.py"), Name);
        if (G) { G->SetNumCustomDataFloats(3); G->SetCastShadow(true); }
        return G;
    };
    const auto Put = [this](UHierarchicalInstancedStaticMeshComponent* G, const FVector2D& At, float YawDegrees, const FLinearColor& Colour = FLinearColor::White, float Lift = 0.f, const FVector& Scale = FVector::OneVector)
    {
        if (!G) return;
        const int32 I = G->AddInstance(FTransform(FRotator(0.f, YawDegrees, 0.f), FVector(At.X * Cm, At.Y * Cm, SurfaceAt(At.X, At.Y) + Lift), Scale));
        const float Data[] = { Colour.R, Colour.G, Colour.B };
        G->SetCustomData(I, Data);
    };

    UMaterialInterface* RopeMaterial = JamMaterial(TEXT("M_Jam_Rope"));
    UMaterialInterface* GlowMaterial = JamMaterial(TEXT("M_Jam_RopeGlow"));
    UMaterialInterface* Wood = LoadMaterial(TEXT("M_Wood"));

    // The rope runs post to post around the circle at knee height and sags between them.
    // The glow is in the rope's own material and a soft halo tube around it; bloom does the rest.
    UHierarchicalInstancedStaticMeshComponent* RopePosts = Group(TEXT("RopePost"), Basic(TEXT("Cylinder")), Wood);
    UHierarchicalInstancedStaticMeshComponent* FunnelStakes = Group(TEXT("FunnelStake"), Basic(TEXT("Cylinder")), Wood);
    const bool bRealPosts = JamMesh(TEXT("RopePost")) != nullptr;
    const auto RunRope = [&](const TArray<FVector2D>& Line, float PostHeightCm, float SagCm, float Spacing, UHierarchicalInstancedStaticMeshComponent* Posts, bool bRealPost, float Glow, const TCHAR* Name)
    {
        // Resample at a post spacing; each post is a knot, with sagging points between.
        TArray<float> Lengths; Lengths.Add(0.f);
        for (int32 I = 1; I < Line.Num(); ++I) Lengths.Add(Lengths.Last() + FVector2D::Distance(Line[I], Line[I - 1]));
        const float Total = Lengths.Last();
        if (Total < .5f) return;
        const int32 Spans = FMath::Max(1, FMath::RoundToInt(Total / Spacing));
        auto At = [&](float D)
        {
            int32 I = 1;
            while (I < Lengths.Num() - 1 && Lengths[I] < D) ++I;
            const float T = (D - Lengths[I - 1]) / FMath::Max(.001f, Lengths[I] - Lengths[I - 1]);
            return FMath::Lerp(Line[I - 1], Line[I], FMath::Clamp(T, 0.f, 1.f));
        };
        TArray<FVector> Points;
        constexpr int32 PerSpan = 6;
        for (int32 S = 0; S <= Spans; ++S)
        {
            const FVector2D P = At(Total * S / Spans);
            const float Ground = SurfaceAt(P.X, P.Y);
            if (Posts)
            {
                const float Yaw = FMath::RadiansToDegrees(FMath::Atan2(P.Y - Layout.Centre.Y, P.X - Layout.Centre.X));
                if (bRealPost) Put(Posts, P, Yaw, FLinearColor::White, -6.f);
                else Posts->AddInstance(FTransform(FRotator::ZeroRotator, FVector(P.X * Cm, P.Y * Cm, Ground + PostHeightCm * .5f), FVector(.04f, .04f, (PostHeightCm + 8.f) / 100.f)));
            }
            if (S == Spans) { Points.Add(FVector(P.X * Cm, P.Y * Cm, Ground + PostHeightCm - 3.f)); break; }
            for (int32 K = 0; K < PerSpan; ++K)
            {
                const float T = float(K) / PerSpan;
                const FVector2D Q = At(Total * (S + T) / Spans);
                Points.Add(FVector(Q.X * Cm, Q.Y * Cm, SurfaceAt(Q.X, Q.Y) + PostHeightCm - 3.f - SagCm * 4.f * T * (1.f - T)));
            }
        }
        UProceduralMeshComponent* Mesh = NewObject<UProceduralMeshComponent>(this, FName(Name));
        Mesh->SetupAttachment(SiteRoot);
        Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        Mesh->SetCastShadow(false);
        AddTube(Mesh, 0, Points, 1.1f);
        if (GlowMaterial) AddTube(Mesh, 1, Points, 4.5f, 8);
        Mesh->RegisterComponent();
        if (RopeMaterial)
        {
            UMaterialInstanceDynamic* M = UMaterialInstanceDynamic::Create(RopeMaterial, this);
            M->SetScalarParameterValue(TEXT("GlowScale"), Glow);
            Mesh->SetMaterial(0, M);
            Jam->AddRopeMaterial(M);
        }
        else Mesh->SetMaterial(0, LoadMaterial(TEXT("M_Ember")));
        if (GlowMaterial)
        {
            UMaterialInstanceDynamic* M = UMaterialInstanceDynamic::Create(GlowMaterial, this);
            M->SetScalarParameterValue(TEXT("GlowScale"), Glow);
            Mesh->SetMaterial(1, M);
            Jam->AddGlowMaterial(M);
        }
    };
    for (int32 R = 0; R < Layout.Rope.Num(); ++R)
        RunRope(Layout.Rope[R], 72.f, 9.f, 3.1f, RopePosts, bRealPosts, 1.f, *FString::Printf(TEXT("JamRope%d"), R));
    // The funnel from the dip to the gap posts: low lines on short stakes, barely lit.
    const bool bRealStakes = JamMesh(TEXT("FunnelStake")) != nullptr;
    for (int32 F = 0; F < Layout.Funnel.Num(); ++F)
        RunRope(Layout.Funnel[F], 48.f, 6.f, 2.f, FunnelStakes, bRealStakes, .12f, *FString::Printf(TEXT("JamFunnel%d"), F));

    // Safety stations: a chair facing in, a wet towel over its back or folded on the grass.
    UHierarchicalInstancedStaticMeshComponent* Chairs = Group(TEXT("CampChair"));
    UHierarchicalInstancedStaticMeshComponent* Towels = Group(TEXT("SafetyTowel"));
    UHierarchicalInstancedStaticMeshComponent* Folded = Group(TEXT("SafetyTowelFolded"));
    for (const FStation& S : Layout.Stations)
    {
        Put(Chairs, S.At, UnrealYaw(S.Yaw), Pick(ChairColours, S.ChairColour));
        if (S.bTowelOnBack) Put(Towels, S.At, UnrealYaw(S.Yaw));
        else Put(Folded, S.At + FVector2D(-FMath::Sin(S.Yaw), FMath::Cos(S.Yaw)) * .55f, UnrealYaw(S.Yaw) + 12.f);
    }
    // The edge: the camp gear people bring to sit and watch.
    TMap<FString, UHierarchicalInstancedStaticMeshComponent*> Kinds;
    Kinds.Add(TEXT("chair"), Chairs);
    Kinds.Add(TEXT("wagon"), Group(TEXT("FoldingWagon")));
    Kinds.Add(TEXT("lantern"), Group(TEXT("LedLantern")));
    Kinds.Add(TEXT("couch"), Group(TEXT("InflatableCouch")));
    Kinds.Add(TEXT("blanket"), Group(TEXT("Blanket")));
    Kinds.Add(TEXT("cooler"), Group(TEXT("Cooler")));
    Kinds.Add(TEXT("yoga-mat"), Group(TEXT("YogaMat")));
    TMap<FString, UHierarchicalInstancedStaticMeshComponent*> Carried;
    for (const FDressing& D : Layout.Dressing)
    {
        UHierarchicalInstancedStaticMeshComponent** G = Kinds.Find(D.Kind);
        if (!G || !*G) continue;
        const FLinearColor Colour = D.Kind == TEXT("blanket") || D.Kind == TEXT("yoga-mat") ? Pick(BlanketColours, D.Colour)
            : D.Kind == TEXT("couch") ? Pick(NylonColours, D.Colour)
            : D.Kind == TEXT("cooler") || D.Kind == TEXT("wagon") ? Pick(PlasticColours, D.Colour) : Pick(ChairColours, D.Colour);
        Put(*G, D.At, UnrealYaw(D.Yaw), Colour);
        if (D.Carries.IsEmpty()) continue;
        // A spare prop lies on the blanket or sticks out of the wagon.
        const FName PropId = PropIdFor(D.Carries, D.Carries == TEXT("clubs"), false);
        FString Family = PropId.ToString(), Variant = TEXT("default");
        Family.Split(TEXT(":"), &Family, &Variant);
        const FString Key = Family + TEXT("_") + Variant;
        UHierarchicalInstancedStaticMeshComponent*& PropGroup = Carried.FindOrAdd(Key);
        if (!PropGroup)
        {
            UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *FString::Printf(TEXT("/Game/FlowFest/Props/%s.%s"), *Key, *Key), nullptr, LOAD_NoWarn | LOAD_Quiet);
            PropGroup = AddInstanceGroup(Mesh, TEXT("JamCarried_") + Key);
        }
        if (!PropGroup) continue;
        const bool bWagon = D.Kind == TEXT("wagon");
        // Prop meshes run along +Y; on a blanket they lie flat, from a wagon they lean out.
        const FRotator Rotation = bWagon ? FRotator(0.f, UnrealYaw(D.Yaw), 62.f) : FRotator(0.f, UnrealYaw(D.Yaw) + 35.f, 0.f);
        PropGroup->AddInstance(FTransform(Rotation, FVector(D.At.X * Cm, D.At.Y * Cm, SurfaceAt(D.At.X, D.At.Y) + (bWagon ? 55.f : 4.f))));
    }

    // The entrance: taller gap posts, and the lighting flame just inside the gap.
    UNiagaraSystem* Fire = LoadObject<UNiagaraSystem>(nullptr, TEXT("/FlowArtsRuntime/Effects/NS_PropFire.NS_PropFire"));
    {
        UHierarchicalInstancedStaticMeshComponent* Stand = Group(TEXT("LightingFlameStand"), Basic(TEXT("Cylinder")), LoadMaterial(TEXT("M_Structures_Steel")));
        const FVector2D F = Layout.Flame;
        const bool bRealStand = JamMesh(TEXT("LightingFlameStand")) != nullptr;
        const float Yaw = FMath::RadiansToDegrees(FMath::Atan2(-Layout.Inward.Y, -Layout.Inward.X));
        if (bRealStand) Put(Stand, F, Yaw);
        else if (Stand) Stand->AddInstance(FTransform(FRotator::ZeroRotator, FVector(F.X * Cm, F.Y * Cm, SurfaceAt(F.X, F.Y) + 45.f), FVector(.12f, .12f, .9f)));
        const FVector Wick(F.X * Cm, F.Y * Cm, SurfaceAt(F.X, F.Y) + 92.f);
        USceneComponent* FlameRoot = NewObject<USceneComponent>(this, TEXT("JamLightingFlame"));
        FlameRoot->SetupAttachment(SiteRoot);
        FlameRoot->SetRelativeLocation(Wick);
        FlameRoot->RegisterComponent();
        if (Fire)
        {
            UNiagaraComponent* Flame = NewObject<UNiagaraComponent>(this, TEXT("JamLightingFlameFx"));
            Flame->SetAsset(Fire);
            Flame->SetupAttachment(FlameRoot);
            Flame->SetRelativeRotation(FRotator(0.f, 0.f, 90.f));
            Flame->SetRelativeScale3D(FVector(1.6f));
            Flame->SetCastShadow(false);
            Flame->SetAutoActivate(true);
            Flame->RegisterComponent();
            Flame->Activate(true);
        }
        UPointLightComponent* Light = NewObject<UPointLightComponent>(this, TEXT("JamLightingFlameLight"));
        Light->SetupAttachment(FlameRoot);
        Light->SetRelativeLocation(FVector(0, 0, 18.f));
        Light->SetIntensityUnits(ELightUnits::Candelas);
        Light->SetIntensity(14.f);
        Light->SetAttenuationRadius(650.f);
        Light->SetSourceRadius(6.f);
        Light->SetLightColor(FLinearColor(1.f, .5f, .2f));
        Light->SetCastShadows(false);
        Light->RegisterComponent();
        Jam->SetLightingFlame(Light, FlameRoot);
    }

    // The DJ booth at the stage edge, its speakers on stands either side.
    {
        const float Yaw = UnrealYaw(Layout.BoothYaw);
        const FVector2D Front = Facing(Layout.BoothYaw);
        const FVector2D Right(-Front.Y, Front.X);
        Put(Group(TEXT("DjTable")), Layout.Booth, Yaw);
        UHierarchicalInstancedStaticMeshComponent* Speakers = Group(TEXT("PaSpeaker"));
        for (const float Side : {-1.f, 1.f})
            Put(Speakers, Layout.Booth + Right * Side * (Layout.BoothWidth * .5f + .55f) + Front * .2f, Yaw + Side * 8.f);
    }
    // String lights: small warm bulbs on a sagging wire, no floodlight.
    {
        UHierarchicalInstancedStaticMeshComponent* Bulbs = Group(TEXT("StringBulb"), Basic(TEXT("Sphere")), JamMaterial(TEXT("M_Jam_BulbGlow")));
        const bool bRealBulb = JamMesh(TEXT("StringBulb")) != nullptr;
        UMaterialInterface* Wire = JamMaterial(TEXT("M_Jam_MeshBlack"));
        for (int32 R = 0; R < Layout.StringLights.Num(); ++R)
        {
            const TArray<FVector> Points = StringBulbs(Layout.StringLights[R]);
            TArray<FVector> WirePoints;
            for (const FVector& P : Points)
            {
                const FVector At(P.X * Cm, P.Y * Cm, SurfaceAt(P.X, P.Y) + P.Z * Cm);
                WirePoints.Add(At);
                if (Bulbs) Bulbs->AddInstance(FTransform(FRotator::ZeroRotator, At - FVector(0, 0, bRealBulb ? 0.f : 5.f), bRealBulb ? FVector::OneVector : FVector(.06f)));
            }
            UProceduralMeshComponent* Mesh = NewObject<UProceduralMeshComponent>(this, FName(*FString::Printf(TEXT("JamStringWire%d"), R)));
            Mesh->SetupAttachment(SiteRoot);
            Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
            Mesh->SetCastShadow(false);
            AddTube(Mesh, 0, WirePoints, .35f, 4);
            Mesh->RegisterComponent();
            if (Wire) Mesh->SetMaterial(0, Wire);
        }
        if (Bulbs) Bulbs->SetCastShadow(false);
    }
    // A spare LED vision club resting on a cooler by the walk, for the close-up review.
    if (UStaticMesh* Club = JamMesh(TEXT("LedVisionClub")))
    {
        const FVector2D At = Layout.Handover + Facing(Layout.HandoverYaw + PI * .5f) * 1.6f;
        UHierarchicalInstancedStaticMeshComponent* Cooler = Kinds.FindRef(TEXT("cooler"));
        Put(Cooler, At, UnrealYaw(Layout.HandoverYaw) + 20.f, Pick(PlasticColours, 1));
        UStaticMeshComponent* Showpiece = NewObject<UStaticMeshComponent>(this, TEXT("JamClubShowpiece"));
        Showpiece->SetupAttachment(SiteRoot);
        Showpiece->SetStaticMesh(Club);
        Showpiece->SetRelativeLocation(FVector(At.X * Cm, At.Y * Cm, SurfaceAt(At.X, At.Y) + 46.f));
        Showpiece->SetRelativeRotation(FRotator(0.f, UnrealYaw(Layout.HandoverYaw) + 70.f, 0.f));
        Showpiece->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        Showpiece->RegisterComponent();
        if (UMaterialInterface* Glow = JamMaterial(TEXT("M_Jam_ClubGlow")))
        {
            UMaterialInstanceDynamic* M = UMaterialInstanceDynamic::Create(Glow, this);
            M->SetVectorParameterValue(TEXT("Colour"), FLinearColor(.2f, .5f, 1.f));
            Showpiece->SetMaterial(0, M);
            Jam->AddBoothScreen(M);
        }
    }
    // Night glows on the kit (lantern globes, bulbs, the laptop) follow the rope.
    for (UHierarchicalInstancedStaticMeshComponent* G : InstanceGroups)
        if (G && G->GetName().StartsWith(TEXT("Jam_")))
            for (int32 Slot = 0; Slot < G->GetNumMaterials(); ++Slot)
                if (UMaterialInterface* M = G->GetMaterial(Slot); M && M->GetName().Contains(TEXT("Glow")))
                    Jam->AddBoothScreen(G->CreateDynamicMaterialInstance(Slot));
    Jam->Setup(this, Layout);
    UE_LOG(LogTemp, Display, TEXT("Flow Fest jam: rope %.1f m, %d stations, %d edge pieces, %d inside, %d outside, %d watchers"),
        Layout.Perimeter, Layout.Stations.Num(), Layout.Dressing.Num(), Layout.Performers.Num(), Layout.OutsideSpinners.Num(), Layout.Spectators.Num());
}

UFlowFestJamComponent::UFlowFestJamComponent()
{
    PrimaryComponentTick.bCanEverTick = true;
    PrimaryComponentTick.TickGroup = TG_PrePhysics;
}

FVector UFlowFestJamComponent::Ground(const FVector2D& P, float HeightCm) const
{
    if (!World) return FVector::ZeroVector;
    return World->GetRootComponent()->GetComponentTransform().TransformPosition(FVector(P.X * Cm, P.Y * Cm, World->SurfaceAt(P.X, P.Y) + HeightCm));
}

void UFlowFestJamComponent::Setup(AFlowFestWorld* InWorld, const FLayout& InLayout)
{
    World = InWorld;
    Layout = InLayout;
    SpawnPeople();
    SetComponentTickEnabled(true);
}

UFlowFestJamComponent::FPerson* UFlowFestJamComponent::Spawn(EKind Kind, int32 Source, const FVector2D& At, float Yaw, FName AvatarId, FName PropId)
{
    // Diagnostic: -FlowFestJamPeople=N caps how many people the jam spawns, for frame-cost bisection.
    static const int32 Cap = [] { int32 Value = MAX_int32; FParse::Value(FCommandLine::Get(), TEXT("FlowFestJamPeople="), Value); return Value; }();
    if (People.Num() >= Cap) return nullptr;
    FActorSpawnParameters Params;
    Params.Owner = World;
    Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
    AActor* Actor = GetWorld()->SpawnActor<AActor>(AActor::StaticClass(), Ground(At), FRotator(0.f, UnrealYaw(Yaw), 0.f), Params);
    if (!Actor) return nullptr;
    USceneComponent* Feet = NewObject<USceneComponent>(Actor, TEXT("Feet"));
    Actor->SetRootComponent(Feet);
    Feet->RegisterComponent();
    Actor->SetActorLocationAndRotation(Ground(At), FRotator(0.f, UnrealYaw(Yaw), 0.f));
    FPerson Person;
    Person.Actor = Actor;
    Person.Kind = Kind;
    Person.Source = Source;
    Person.Home = Person.At = Person.Target = At;
    Person.Yaw = Person.HomeYaw = Yaw;
    Person.Body = AvatarId;
    Person.Avatar = NewObject<UFlowFestAvatarComponent>(Actor, TEXT("Avatar"));
    Person.Avatar->RegisterComponent();
    Person.Avatar->Initialize(Feet, AvatarId);
    Person.Avatar->SetFootstepsEnabled(false);
    // Nobody stands in as a placeholder: a character that fails to load is left out and logged.
    if (!Person.Avatar->GetBodyMesh() || !Person.Avatar->GetBodyMesh()->GetSkeletalMeshAsset())
    {
        UE_LOG(LogTemp, Warning, TEXT("Flow Fest jam: character %s did not load; person left out"), *AvatarId.ToString());
        Actor->Destroy();
        return nullptr;
    }
    if (USkeletalMeshComponent* Body = Person.Avatar->GetBodyMesh())
    {
        Body->VisibilityBasedAnimTickOption = EVisibilityBasedAnimTickOption::OnlyTickPoseWhenRendered;
        Body->SetCastShadow(true);
    }
    Person.Avatar->SetPresentation(true, false);
    if (!PropId.IsNone() && Person.Avatar->GetBodyMesh() && Person.Avatar->GetBodyMesh()->GetSkeletalMeshAsset())
    {
        Person.Prop = NewObject<UFlowFestPropComponent>(Actor, TEXT("Prop"));
        Person.Prop->RegisterComponent();
        Person.Prop->Initialize(Feet);
        if (Person.Prop->Equip(PropId))
        {
            Person.Prop->BindHands(Person.Avatar->GetBodyMesh());
            Person.Avatar->BindPerformanceProp(Person.Prop);
            Person.Prop->SetFinish(NAME_None);
        }
        else
        {
            Person.Prop->DestroyComponent();
            Person.Prop = nullptr;
        }
    }
    Person.Avatar->SetMotion(FVector::ZeroVector, false, false);
    People.Add(Person);
    FPerson& Added = People.Last();
    SetOut(Added, false);
    return &Added;
}

void UFlowFestJamComponent::SpawnPeople()
{
    static const FName Avatars[] = { TEXT("ch07"), TEXT("ch21"), TEXT("ch10"), TEXT("ch42"), TEXT("ch18"), TEXT("ch01"), TEXT("ch34"),
        TEXT("ch12"), TEXT("ch24"), TEXT("ch44"), TEXT("ch22"), TEXT("ch41"), TEXT("remy"), TEXT("ch26") };
    int32 Next = 0;
    const auto Body = [&Next]() { return Avatars[(Next++ * 5) % UE_ARRAY_COUNT(Avatars)]; };
    for (int32 I = 0; I < Layout.Performers.Num(); ++I)
    {
        const FPerformer& P = Layout.Performers[I];
        if (FPerson* Person = Spawn(Inside, I, P.Start, FMath::Atan2(Layout.Centre.Y - P.Start.Y, Layout.Centre.X - P.Start.X), Body(), PropIdFor(P.Prop, P.bJuggler, false)))
        {
            Person->Order = P.Order; FMemory::Memcpy(Person->Seeds, P.Seeds, sizeof(P.Seeds));
            Person->WanderRadius = 3.f;
            Person->Profile = UFlowFestAvatarComponent::ResolvePerformanceProfile(PropIdFor(P.Prop, P.bJuggler, false), P.Seeds[2] > .5f ? 1 : 0);
            Person->Finish = TEXT("fire");
        }
    }
    for (int32 I = 0; I < Layout.OutsideSpinners.Num(); ++I)
    {
        const FOutsideSpinner& S = Layout.OutsideSpinners[I];
        if (FPerson* Person = Spawn(Outside, I, S.At, S.Yaw, Body(), PropIdFor(S.Prop, S.bJuggler, true)))
        {
            Person->Order = S.Order; FMemory::Memcpy(Person->Seeds, S.Seeds, sizeof(S.Seeds));
            Person->WanderRadius = S.WanderRadius;
            Person->Profile = UFlowFestAvatarComponent::ResolvePerformanceProfile(PropIdFor(S.Prop, S.bJuggler, true), S.Seeds[2] > .5f ? 1 : 0);
            Person->Finish = TEXT("led");
        }
    }
    // Half the watchers sit: in the nearest free camp chair within 3 m, else on a blanket or mat
    // within 3 m. Anyone with neither close by stands at their spot.
    TArray<int32> Sitting;
    Sitting.Init(0, Layout.Dressing.Num());
    int32 InChairs = 0, OnRugs = 0;
    const auto Nearest = [this, &Sitting](const FVector2D& From, TFunctionRef<bool(const FDressing&, int32)> Free)
    {
        int32 Best = INDEX_NONE;
        float BestDistance = 3.f;
        for (int32 D = 0; D < Layout.Dressing.Num(); ++D)
        {
            const float Distance = FVector2D::Distance(Layout.Dressing[D].At, From);
            if (Distance < BestDistance && Free(Layout.Dressing[D], Sitting[D])) { BestDistance = Distance; Best = D; }
        }
        return Best;
    };
    for (int32 I = 0; I < Layout.Spectators.Num(); ++I)
    {
        const FSpectator& S = Layout.Spectators[I];
        FPerson* Person = Spawn(Spectator, I, S.At, S.Yaw, Body(), NAME_None);
        if (!Person) continue;
        Person->Order = S.Order;
        if (Hash01(I, 41) >= .5f) continue;
        const int32 Chair = Nearest(S.At, [](const FDressing& D, int32 Taken) { return D.Kind == TEXT("chair") && Taken == 0; });
        if (Chair != INDEX_NONE && SeatInChair(*Person, Layout.Dressing[Chair].At, Layout.Dressing[Chair].Yaw))
        {
            ++Sitting[Chair];
            ++InChairs;
            continue;
        }
        const int32 Rug = Nearest(S.At, [](const FDressing& D, int32 Taken)
            { return (D.Kind == TEXT("blanket") && Taken < 2) || (D.Kind == TEXT("yoga-mat") && Taken == 0); });
        if (Rug == INDEX_NONE) continue;
        const FDressing& D = Layout.Dressing[Rug];
        Person->At = Person->Home = Person->Target = D.At + (D.Kind == TEXT("blanket") ? Facing(D.Yaw + PI * .5f) * (Sitting[Rug] ? .32f : -.32f) : FVector2D::ZeroVector);
        Person->Yaw = Person->HomeYaw = FMath::Atan2(Layout.Centre.Y - Person->At.Y, Layout.Centre.X - Person->At.X);
        Person->bSeated = true;
        ++Sitting[Rug];
        ++OnRugs;
    }
    UE_LOG(LogTemp, Display, TEXT("Flow Fest jam watchers: %d in chairs, %d on blankets and mats, %d standing"),
        InChairs, OnRugs, Layout.Spectators.Num() - InChairs - OnRugs);
    for (int32 I = 0; I < Layout.Stations.Num(); ++I)
    {
        const FStation& S = Layout.Stations[I];
        if (!S.bOccupied) continue;
        // The safety stands beside the chair, a step to its right, watching the spinners.
        const FVector2D At = S.At + FVector2D(-FMath::Sin(S.Yaw), FMath::Cos(S.Yaw)) * .75f;
        if (FPerson* Person = Spawn(Safety, I, At, S.Yaw, Body(), NAME_None)) Person->Order = .05f * Hash01(I, 9);
    }
    const FVector2D Behind = Layout.Booth - Facing(Layout.BoothYaw) * .85f;
    if (FPerson* DJ = Spawn(EKind::DJ, 0, Behind, Layout.BoothYaw, TEXT("ch26"), NAME_None)) DJ->Order = 0.f;
    UE_LOG(LogTemp, Display, TEXT("Flow Fest jam people: %d"), People.Num());
}

void UFlowFestJamComponent::SetOut(FPerson& Person, bool bOut)
{
    Person.bOut = bOut;
    Person.bShown = false;
    if (!IsValid(Person.Actor)) return;
    // Someone stepping out stays hidden while their body poses for a moment (Reveal), so nobody
    // is ever seen in the bind pose, mid-sit or with a prop and no hands on it.
    Person.Actor->SetActorHiddenInGame(true);
    Person.RevealAt = Elapsed + .6f;
    if (Person.Avatar) Person.Avatar->SetComponentTickEnabled(bOut);
    if (USkeletalMeshComponent* Mesh = Person.Avatar ? Person.Avatar->GetBodyMesh() : nullptr)
    {
        Mesh->SetComponentTickEnabled(bOut);
        Mesh->VisibilityBasedAnimTickOption = bOut ? EVisibilityBasedAnimTickOption::AlwaysTickPoseAndRefreshBones : EVisibilityBasedAnimTickOption::OnlyTickPoseWhenRendered;
    }
    if (Person.Prop)
    {
        Person.Prop->SetComponentTickEnabled(bOut);
        Person.Prop->SetVisible(false);
        if (!bOut) { StopPlaying(Person); Person.Prop->SetFinish(NAME_None); Person.LightState = 255; }
    }
}

void UFlowFestJamComponent::Reveal(FPerson& Person)
{
    Person.bShown = true;
    Person.Actor->SetActorHiddenInGame(false);
    if (USkeletalMeshComponent* Mesh = Person.Avatar ? Person.Avatar->GetBodyMesh() : nullptr)
        Mesh->VisibilityBasedAnimTickOption = EVisibilityBasedAnimTickOption::OnlyTickPoseWhenRendered;
    if (Person.Prop) Person.Prop->SetVisible(true);
    Person.LightState = 255;
}

// The camp chair (author-jam.py) has its sling at 0.45 m, sagging to about 0.42 m, from 0.24 m
// behind its centre to 0.24 m in front, and the backrest leaning back from 0.24 m behind. A
// sitter's hip joints rest about 9 cm above the sling, so 0.51 m up, 0.11 m behind the chair
// centre, which puts the seat of the trousers against the back. FloorRest lowers the hips by
// .91 of the leg height times the seat weight and slides them 13 cm (scaled) back, so a partial
// weight lands the joints at chair height and leaves the shins near vertical. The weight is
// held by passing a rise clock that eases to exactly it.
bool UFlowFestJamComponent::SeatInChair(FPerson& Person, const FVector2D& ChairAt, float ChairYaw)
{
    constexpr float JointHeightCm = 51.f, JointBehindM = .11f;
    USkeletalMeshComponent* Body = Person.Avatar ? Person.Avatar->GetBodyMesh() : nullptr;
    const USkeletalMesh* Mesh = Body ? Body->GetSkeletalMeshAsset() : nullptr;
    if (!Mesh || !IsValid(Person.Actor)) return false;
    const FReferenceSkeleton& Ref = Mesh->GetRefSkeleton();
    const auto Rest = [&Ref](const TCHAR* Name, FVector& Out)
    {
        int32 Index = Ref.FindBoneIndex(Name);
        if (Index == INDEX_NONE) return false;
        FTransform T = FTransform::Identity;
        for (; Index != INDEX_NONE; Index = Ref.GetParentIndex(Index)) T = T * Ref.GetRefBonePose()[Index];
        Out = T.GetLocation();
        return true;
    };
    FVector Hips, LeftFoot, RightFoot, LeftHip, RightHip;
    if (!Rest(TEXT("Hips"), Hips) || !Rest(TEXT("LeftFoot"), LeftFoot) || !Rest(TEXT("RightFoot"), RightFoot)
        || !Rest(TEXT("LeftUpLeg"), LeftHip) || !Rest(TEXT("RightUpLeg"), RightHip)) return false;
    const float Leg = Hips.Z - FMath::Min(LeftFoot.Z, RightFoot.Z);
    if (Leg <= 1.f) return false;
    const float BodyScale = FMath::Clamp(Leg / 90.f, .55f, 1.65f);
    Person.Actor->SetActorLocationAndRotation(Ground(ChairAt), FRotator(0.f, UnrealYaw(ChairYaw), 0.f));
    const FTransform ToActor = Body->GetComponentTransform().GetRelativeTransform(Person.Actor->GetActorTransform());
    const FVector Joints = (LeftHip + RightHip) * .5f;
    const float Seat = FMath::Clamp((ToActor.TransformPosition(Joints).Z - JointHeightCm) / (ToActor.GetScale3D().Z * .91f * Leg), .2f, 1.f);
    const FVector Settled = ToActor.TransformPosition(Joints - FVector::UpVector * .91f * Leg * Seat - FVector::YAxisVector * 13.f * BodyScale * Seat);
    // Settled is in the actor's frame (X forward, Y right); turn it into the jam frame.
    const FVector2D Forward = Facing(ChairYaw), Right(-Forward.Y, Forward.X);
    const FVector2D Offset = (Forward * Settled.X + Right * Settled.Y) / Cm;
    Person.At = Person.Home = Person.Target = ChairAt - Forward * JointBehindM - Offset;
    Person.Yaw = Person.HomeYaw = ChairYaw;
    Person.Actor->SetActorLocationAndRotation(Ground(Person.At), FRotator(0.f, UnrealYaw(ChairYaw), 0.f));
    Person.bSeated = Person.bChair = true;
    Person.ChairAt = ChairAt;
    Person.ChairExit = FFlowFestActivityPose::RestRiseSeconds * (.5f - FMath::Sin(FMath::Asin(1.f - 2.f * Seat) / 3.f));
    return true;
}

// A routine played through the shared performance solver costs tens of milliseconds of
// worker time a frame (the festival crowd allows two fire turns for that reason), so only
// the few performers nearest the view play their solved routine. Everyone else in a turn
// spins their lit prop in hand, which reads the same from across the circle. UpdateSolved
// hands the solved slots round as the view moves.
void UFlowFestJamComponent::StartPlaying(FPerson& Person, float Phase)
{
    if (!Person.Prop || Person.Profile.IsNone()) return;
    Person.bPlaying = true;
    Person.bSolved = false;
    Person.SpinPhase = FMath::Frac(Phase) * 2.f * PI;
    static const bool bNoFinish = FParse::Param(FCommandLine::Get(), TEXT("FlowFestJamNoFinish")); // diagnostic
    if (!bNoFinish) Person.Prop->SetFinish(Person.Finish);
    Person.LightState = 255;
    const int32 Index = int32(&Person - People.GetData());
    if (Index == DuetIndex) Solve(Person, Phase);
}

bool UFlowFestJamComponent::Solve(FPerson& Person, float Phase)
{
    if (Person.bSolved) return true;
    FFlowArtsPerformanceSession Session(Person.Avatar, Person.Prop);
    FString PerformanceError;
    Person.Prop->SetSpin(false, 0.f);
    if (!Session.PlayBuiltIn(Person.Profile, PerformanceError))
    {
        UE_LOG(LogTemp, Warning, TEXT("Flow Fest jam performer %d could not play %s: %s"), Person.Source, *Person.Profile.ToString(), *PerformanceError);
        return false;
    }
    Person.bSolved = true;
    Person.Avatar->SetPerformancePhase(FMath::Frac(Phase));
    Person.Prop->SetFinish(Person.Finish);
    Person.LightState = 255;
    return true;
}

void UFlowFestJamComponent::Unsolve(FPerson& Person)
{
    if (!Person.bSolved) return;
    Person.Avatar->StopPerformance();
    if (Person.Prop) Person.Prop->ClearPerformanceTransforms();
    Person.bSolved = false;
}

void UFlowFestJamComponent::StopPlaying(FPerson& Person)
{
    Unsolve(Person);
    if (Person.Prop) Person.Prop->SetSpin(false, 0.f);
    Person.bPlaying = false;
}

void UFlowFestJamComponent::UpdateSolved()
{
    static const int32 Slots = [] { int32 Value = 4; FParse::Value(FCommandLine::Get(), TEXT("FlowFestJamSolved="), Value); return FMath::Clamp(Value, 0, 64); }();
    FVector View = FVector::ZeroVector;
    if (const APlayerCameraManager* Camera = UGameplayStatics::GetPlayerCameraManager(this, 0)) View = Camera->GetCameraLocation();
    const FVector Local = World->GetRootComponent()->GetComponentTransform().InverseTransformPosition(View);
    const FVector2D Eye = FVector2D(Local.X, Local.Y) / Cm;
    // Rank everyone in a turn by distance, the current solvers 3 m nearer so slots do not flicker.
    TArray<TPair<float, int32>> Ranked;
    for (int32 I = 0; I < People.Num(); ++I)
    {
        const FPerson& Person = People[I];
        if (!Person.bOut || !Person.bPlaying || I == DuetIndex) continue;
        Ranked.Add({FVector2D::Distance(Person.At, Eye) - (Person.bSolved ? 3.f : 0.f), I});
    }
    Ranked.Sort([](const TPair<float, int32>& A, const TPair<float, int32>& B) { return A.Key < B.Key; });
    const int32 Free = FMath::Max(0, Slots - (DuetIndex != INDEX_NONE && People[DuetIndex].bSolved ? 1 : 0));
    for (int32 R = Free; R < Ranked.Num(); ++R) Unsolve(People[Ranked[R].Value]);
    for (int32 R = 0; R < FMath::Min(Free, Ranked.Num()); ++R)
    {
        FPerson& Person = People[Ranked[R].Value];
        if (!Person.bSolved) Solve(Person, Person.SpinPhase / (2.f * PI));
    }
}

// Prop wick lights: one per hand, no shadows, wide and soft so they light faces from below.
// UpdateEffects sets the catalogue intensity and shadows on every finish change, so a person is
// reconfigured when its light state changes; between changes only the fire flicker is pushed.
void UFlowFestJamComponent::ApplyLights(bool bForce)
{
    const float Seconds = Elapsed;
    for (int32 Index = 0; Index < People.Num(); ++Index)
    {
        FPerson& Person = People[Index];
        if (!Person.Prop || !IsValid(Person.Actor)) continue;
        const bool bFire = Person.bOut && Person.Finish == TEXT("fire") && Person.bPlaying;
        const bool bLed = Person.bOut && Person.Finish == TEXT("led") && Person.bPlaying;
        const uint8 State = bFire ? 1 : bLed ? 2 : 0;
        if (State == 0 && Person.LightState == 0 && !bForce) continue;
        const bool bConfigure = bForce || State != Person.LightState;
        Person.LightState = State;
        TArray<UPointLightComponent*> Lights;
        Person.Actor->GetComponents<UPointLightComponent>(Lights);
        const float Flicker = .82f + .12f * FMath::Sin(Seconds * 9.1f + Index * 1.7f) + .06f * FMath::Sin(Seconds * 17.3f + Index);
        TSet<USceneComponent*> Lit;
        for (UPointLightComponent* Light : Lights)
        {
            if (!bConfigure)
            {
                if (bFire && Light->IsVisible()) Light->SetIntensity(7.5f * Flicker);
                continue;
            }
            const bool bFirst = !Lit.Contains(Light->GetAttachParent());
            Lit.Add(Light->GetAttachParent());
            const bool bOn = bFirst && State != 0;
            Light->SetCastShadows(false);
            Light->SetVisibility(bOn);
            if (!bOn) continue;
            Light->SetIntensityUnits(ELightUnits::Candelas);
            Light->SetAttenuationRadius(bFire ? 520.f : 260.f);
            Light->SetIntensity(bFire ? 7.5f * Flicker : .8f);
            Light->SetLightColor(bFire ? FLinearColor(1.f, .45f, .14f) : FLinearColor(.25f, .55f, 1.f));
        }
    }
}

void UFlowFestJamComponent::UpdatePerson(FPerson& Person, int32 Index, float DeltaTime)
{
    const FVector2D Night = bShowAll ? FVector2D(1, 1) : CurrentNight;
    const float Level = Person.Kind == Inside || Person.Kind == Outside ? Night.X : Night.Y;
    bool bWant = Person.Kind == EKind::DJ ? CurrentGlow > 0.f : Person.Kind == Safety ? CurrentGlow > 0.f && Night.X > 0.f : Person.Order < Level;
    // Performers stepping in come one or two at a time: the next waits (unseen, in the queue
    // outside) while two are already near the entrance.
    if (bWant && !Person.bOut && Person.Kind == Inside && Elapsed > 1.5f && CountNearEntrance(6.f) >= 2) bWant = false;
    if (bWant != Person.bOut)
    {
        SetOut(Person, bWant);
        if (bWant)
        {
            Person.StateUntil = Elapsed;
            if (Person.Kind == Inside && Elapsed > 1.5f)
            {
                // A performer stepping in comes through the gap and stops at the lighting flame.
                Person.At = Layout.Flame - Layout.Inward * 1.1f + FVector2D(Layout.Inward.Y, -Layout.Inward.X) * (Hash01(Index, 5) - .5f);
                Person.Target = Layout.Flame - Layout.Inward * .55f;
                Person.bWalking = true;
                Person.Turn = 1.f; // lighting pending
            }
        }
    }
    if (!Person.bOut || !IsValid(Person.Actor)) return;

    const FVector2D Player = PlayerAt;
    const bool bNoticed = bPlayerFlowing && FlowSeconds >= Layout.NoticeSeconds && FVector2D::Distance(Player, Person.At) < Layout.NoticeRadius;
    const bool bDuet = DuetIndex == Index;
    FVector2D Velocity = FVector2D::ZeroVector;
    float WantYaw = Person.Yaw;

    if (Person.Kind == Inside)
    {
        if (bDuet)
        {
            // Walk to about 3 m from the player, on the circle side, then mirror their routine.
            const FVector2D Toward = (Layout.Centre - Player).GetSafeNormal();
            Person.Target = KeepInside(Layout, Player + (Toward.IsNearlyZero() ? FVector2D(1, 0) : Toward) * 3.f);
        }
        else if (!Person.bWalking && Elapsed >= Person.StateUntil && Person.Turn <= 0.f)
        {
            // Move on after a turn: a few metres to a new spot, then play again.
            const float Hold = 22.f + 26.f * Hash01(Index, int32(Elapsed / 7.f));
            Person.Target = KeepInside(Layout, Drift(Person.Home, 4.f, Person.Seeds, Elapsed + 40.f));
            if (FVector2D::Distance(Person.Target, Person.At) > 1.2f) { Person.bWalking = true; StopPlaying(Person); }
            Person.StateUntil = Elapsed + Hold;
        }
        if (Person.bWalking || bDuet)
        {
            const FVector2D To = Person.Target - Person.At;
            const float D = To.Size();
            if (D > (Person.Turn > 0.f ? .9f : .25f))
            {
                if (Person.bPlaying && !bDuet) StopPlaying(Person);
                if (bDuet && Person.bPlaying && D > 1.f) StopPlaying(Person);
                Velocity = To / D * FMath::Min(1.3f, D * 1.2f);
                WantYaw = FMath::Atan2(To.Y, To.X);
            }
            else if (Person.Turn > 0.f)
            {
                // At the flame: hold the wicks in it for a couple of seconds, then walk in.
                WantYaw = FMath::Atan2(Layout.Flame.Y - Person.At.Y, Layout.Flame.X - Person.At.X);
                Person.Turn -= DeltaTime / 2.4f;
                if (Person.Turn <= .45f && Person.Prop) { Person.Prop->SetFinish(Person.Finish); Person.LightState = 255; }
                if (Person.Turn <= 0.f)
                {
                    Person.Target = KeepInside(Layout, Layout.Performers[Person.Source].Start);
                    Person.Home = Person.Target;
                }
            }
            else
            {
                Person.bWalking = false;
                if (!bDuet) Person.StateUntil = Elapsed + 22.f + 20.f * Person.Seeds[0];
            }
        }
        if (!Person.bWalking && !Person.bPlaying)
        {
            if (bDuet)
            {
                const FName Before = Person.Profile;
                if (!PlayerProfile.IsNone()) Person.Profile = PlayerProfile;
                StartPlaying(Person, PlayerPhase);
                if (!Person.bPlaying) Person.Profile = Before;
            }
            else StartPlaying(Person, Person.Seeds[1] + Elapsed * .01f);
        }
        // Spinning, they face out to the crowd round the rope, each a little off square and
        // wandering slowly; only a duet partner or someone noticing the player turns in.
        if (!Person.bWalking)
            WantYaw = bDuet || bNoticed ? FMath::Atan2(Player.Y - Person.At.Y, Player.X - Person.At.X)
                : FMath::Atan2(Person.At.Y - Layout.Centre.Y, Person.At.X - Layout.Centre.X)
                    + (Layout.Performers[Person.Source].bFacesAudience ? .12f : .35f) * FMath::Sin(Elapsed * .05f + Person.Seeds[3] * 6.f);
        if (bDuet && Person.bSolved && FMath::Abs(Person.Avatar->GetPerformancePhase() - PlayerPhase) > .04f && FMath::Abs(Person.Avatar->GetPerformancePhase() - PlayerPhase) < .96f)
            Person.Avatar->SetPerformancePhase(PlayerPhase);
    }
    else if (Person.Kind == Outside)
    {
        // LED spinners drift within their wander radius and play continuously.
        const FVector2D Target = Drift(Person.Home, Person.WanderRadius, Person.Seeds, Elapsed);
        const FVector2D To = Target - Person.At;
        Velocity = To * .5f;
        if (!Person.bPlaying) StartPlaying(Person, Person.Seeds[1]);
        // Facing the open ground in front of them (their layout yaw), not the circle.
        WantYaw = bNoticed ? FMath::Atan2(Player.Y - Person.At.Y, Player.X - Person.At.X) : Person.HomeYaw + .25f * FMath::Sin(Elapsed * .07f + Person.Seeds[0] * 6.f);
    }
    else if (Person.Kind == EKind::DJ)
    {
        WantYaw = Layout.BoothYaw + .25f * FMath::Sin(Elapsed * .3f);
    }
    else if (Person.bChair)
    {
        // A camp chair does not swivel: chair sitters keep facing the way the chair does.
        WantYaw = Person.HomeYaw;
    }
    else
    {
        WantYaw = bNoticed ? FMath::Atan2(Player.Y - Person.At.Y, Player.X - Person.At.X)
            : Person.HomeYaw + .3f * FMath::Sin(Elapsed * .11f + Index);
    }

    // Keep inside performers from walking through each other.
    if (Person.Kind == Inside && !Velocity.IsNearlyZero() && Person.Turn <= 0.f)
        for (int32 J = 0; J < People.Num(); ++J)
            if (J != Index && People[J].bOut && People[J].Kind == Inside)
            {
                const FVector2D Away = Person.At - People[J].At;
                const float D = Away.Size();
                if (D > .01f && D < 2.2f) Velocity += Away / D * (2.2f - D) * .6f;
            }
    Person.At += Velocity * DeltaTime;
    Person.Yaw = Person.Yaw + FMath::FindDeltaAngleRadians(Person.Yaw, WantYaw) * FMath::Min(1.f, DeltaTime * 2.5f);
    FVector Foot = Ground(Person.At);
    if (Person.Kind == EKind::DJ)
    {
        // Bob to the beat, a little behind it, like someone listening in their headphones.
        const float Beat = Elapsed * Layout.BeatsPerMinute / 60.f;
        Foot.Z -= 2.2f * FMath::Square(FMath::Sin(PI * Beat));
    }
    Person.Actor->SetActorLocationAndRotation(Foot, FRotator(0.f, UnrealYaw(Person.Yaw), 0.f));
    const FVector WorldVelocity = World->GetRootComponent()->GetComponentTransform().TransformVectorNoScale(FVector(Velocity.X, Velocity.Y, 0.f) * Cm);
    if (!Person.bSolved)
    {
        if (Person.bPlaying && Person.Prop)
        {
            Person.SpinPhase += DeltaTime * (5.2f + 1.6f * Person.Seeds[3]);
            Person.Prop->SetSpin(true, Person.SpinPhase);
        }
        Person.Avatar->SetMotion(WorldVelocity, false, false);
        const EFlowFestBodyActivity Activity = Person.bSeated && (Person.bChair || !bNoticed) ? EFlowFestBodyActivity::FloorRest
            : Person.Prop && !Person.bPlaying ? EFlowFestBodyActivity::Carry : EFlowFestBodyActivity::None;
        Person.Avatar->SetActivityPose(Activity, Person.bSeated ? 20.f : 0.f, Person.bChair ? Person.ChairExit : -1.f);
        if (Person.Prop) Person.Prop->SetHandTransforms(Person.Avatar->GetHandTransform(true), Person.Avatar->GetHandTransform(false));
    }
    if (!Person.bShown && Elapsed >= Person.RevealAt) Reveal(Person);
}

int32 UFlowFestJamComponent::CountNearEntrance(float Radius) const
{
    int32 Count = 0;
    for (const FPerson& P : People) Count += P.bOut && P.Kind == Inside && FVector2D::Distance(P.At, Layout.Flame) < Radius;
    return Count;
}

bool UFlowFestJamComponent::GetChairSitter(int32 Nth, FVector2D& ChairAt, float& ChairYaw) const
{
    for (const FPerson& P : People)
        if (P.bChair && P.bShown && Nth-- == 0) { ChairAt = P.ChairAt; ChairYaw = P.HomeYaw; return true; }
    return false;
}

bool UFlowFestJamComponent::OwnsActor(const AActor* Actor) const
{
    return People.ContainsByPredicate([Actor](const FPerson& P) { return P.Actor == Actor; });
}

const AActor* UFlowFestJamComponent::GetDuetPartner() const
{
    return People.IsValidIndex(DuetIndex) ? People[DuetIndex].Actor : nullptr;
}

void UFlowFestJamComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
    if (!World) return;
    Elapsed += DeltaTime;
    const float Clock = World->GetTimeOfDay();
    const float Elevation = ModelElevation(Clock);
    const float Glow = RopeGlow(Layout, Elevation);
    const FVector2D Night = NightForClock(Layout, Clock);
    // Rope glow: warm white drifting slowly toward amber and back.
    const float Drift01 = .5f - .5f * FMath::Cos(2.f * PI * Elapsed / FMath::Max(1.f, Layout.RopeDriftSeconds));
    const FLinearColor RopeColour = FMath::Lerp(Layout.RopeColour, Layout.RopeDrift, Drift01);
    for (UMaterialInstanceDynamic* M : RopeMaterials) if (M) { M->SetScalarParameterValue(TEXT("Glow"), Glow); M->SetVectorParameterValue(TEXT("Colour"), RopeColour); }
    for (UMaterialInstanceDynamic* M : GlowMaterials) if (M) { M->SetScalarParameterValue(TEXT("Glow"), Glow); M->SetVectorParameterValue(TEXT("Colour"), RopeColour); }
    for (UMaterialInstanceDynamic* M : ScreenMaterials) if (M) M->SetScalarParameterValue(TEXT("Glow"), Glow);
    CurrentGlow = Glow;
    CurrentNight = Night;
    if (FlameLight)
    {
        const float Flicker = .86f + .09f * FMath::Sin(Elapsed * 7.3f) + .05f * FMath::Sin(Elapsed * 15.1f + 1.1f);
        FlameLight->SetIntensity(14.f * Flicker * FMath::Max(.3f, Glow));
    }
    // The player, from their pawn: flowing is a performance playing on their avatar.
    if (const APawn* Pawn = UGameplayStatics::GetPlayerPawn(this, 0))
    {
        const FVector Local = World->GetRootComponent()->GetComponentTransform().InverseTransformPosition(Pawn->GetActorLocation());
        PlayerAt = FVector2D(Local.X, Local.Y) / Cm;
        const UFlowFestAvatarComponent* Avatar = Pawn->FindComponentByClass<UFlowFestAvatarComponent>();
        const FName Profile = Avatar && Avatar->GetBodyMesh() && Avatar->GetBodyMesh()->IsVisible() ? Avatar->GetPerformanceProfile() : NAME_None;
        bPlayerFlowing = !Profile.IsNone();
        PlayerProfile = Profile;
        PlayerPhase = bPlayerFlowing ? Avatar->GetPerformancePhase() : 0.f;
    }
    FlowSeconds = bPlayerFlowing ? FlowSeconds + DeltaTime : 0.f;
    // Duet: after long enough flowing near the circle, the nearest free fire performer comes over.
    if (bPlayerFlowing && FlowSeconds >= Layout.DuetSeconds && DuetIndex == INDEX_NONE && DistanceToRope(Layout, PlayerAt) < 16.f)
    {
        float Best = 20.f;
        for (int32 I = 0; I < People.Num(); ++I)
            if (People[I].Kind == Inside && People[I].bOut && People[I].Turn <= 0.f && People[I].Prop)
            {
                const float D = FVector2D::Distance(People[I].At, PlayerAt);
                if (D < Best) { Best = D; DuetIndex = I; }
            }
        if (DuetIndex != INDEX_NONE) { StopPlaying(People[DuetIndex]); People[DuetIndex].bWalking = true; }
    }
    else if (!bPlayerFlowing && DuetIndex != INDEX_NONE)
    {
        FPerson& Partner = People[DuetIndex];
        DuetIndex = INDEX_NONE;
        StopPlaying(Partner);
        Partner.Profile = UFlowFestAvatarComponent::ResolvePerformanceProfile(Partner.Prop ? Partner.Prop->GetPropId() : NAME_None, Partner.Seeds[2] > .5f ? 1 : 0);
        Partner.Target = KeepInside(Layout, Partner.Home);
        Partner.bWalking = true;
    }
    for (int32 I = 0; I < People.Num(); ++I) UpdatePerson(People[I], I, DeltaTime);
    if (Elapsed - SolvedAt > 1.5f) { SolvedAt = Elapsed; UpdateSolved(); }
    ++LogFrames;
    if (int32(Elapsed / 10.f) != int32((Elapsed - DeltaTime) / 10.f))
    {
        int32 Solved = 0, Playing = 0;
        for (const FPerson& Person : People) { Playing += Person.bPlaying; Solved += Person.bSolved; }
        UE_LOG(LogTemp, Display, TEXT("FlowFestJam state: clock %.2f sun %.1f glow %.2f night %.2f/%.2f inside %d outside %d watching %d safety %d fire %d duet %d playing %d solved %d frame %.1f ms"),
            Clock, Elevation, Glow, Night.X, Night.Y, CountActive(Inside), CountActive(Outside), CountActive(Spectator), CountActive(Safety), CountFireLit(), DuetIndex != INDEX_NONE, Playing, Solved,
            1000.f * (Elapsed - LogSince) / FMath::Max(1, LogFrames));
        LogSince = Elapsed;
        LogFrames = 0;
    }
    ApplyLights();
}

bool UFlowFestJamComponent::IsInside(const FVector& WorldPosition) const
{
    if (!World) return false;
    const FVector Local = World->GetRootComponent()->GetComponentTransform().InverseTransformPosition(WorldPosition);
    return FlowFestJam::Inside(Layout.Boundary, FVector2D(Local.X, Local.Y) / Cm);
}

float UFlowFestJamComponent::DistanceToRopeCm(const FVector& WorldPosition) const
{
    if (!World) return 1e9f;
    const FVector Local = World->GetRootComponent()->GetComponentTransform().InverseTransformPosition(WorldPosition);
    return DistanceToRope(Layout, FVector2D(Local.X, Local.Y) / Cm) * Cm;
}

void UFlowFestJamComponent::SetPlayer(const FVector&, bool, FName, float) {}

int32 UFlowFestJamComponent::CountActive(int32 Kind) const
{
    int32 Count = 0;
    for (const FPerson& P : People) Count += P.bOut && int32(P.Kind) == Kind;
    return Count;
}

int32 UFlowFestJamComponent::CountFireLit() const
{
    int32 Count = 0;
    for (const FPerson& P : People) Count += P.bOut && P.bPlaying && P.Finish == TEXT("fire");
    return Count;
}

bool UFlowFestJamComponent::ReviewShot(const FString& Site, FVector& Eye, FVector& Look) const
{
    const auto Shot = [this, &Eye, &Look](const FVector2D& From, float EyeHeight, const FVector2D& To, float LookHeight)
    {
        Eye = Ground(From, EyeHeight * Cm);
        Look = Ground(To, LookHeight * Cm);
        return true;
    };
    if (Site == TEXT("fire"))
        // South of the rope, looking north across the circle toward the entrance and the woods;
        // the low sun from the west throws the chairs' shadows across the frame.
        return Shot(FVector2D(Layout.Centre.X - 2.5f, Layout.Centre.Y + 22.f), 1.75f, Layout.Centre, 1.1f);
    if (Site == TEXT("jam-entrance"))
    {
        const FVector2D Side(Layout.Inward.Y, -Layout.Inward.X);
        return Shot(Layout.Flame + Layout.Inward * 5.5f + Side * 2.2f, 1.65f, FMath::Lerp(Layout.Flame, Layout.Archway, .45f), 1.2f);
    }
    if (Site == TEXT("jam-stage"))
    {
        const FVector2D Front = Facing(Layout.BoothYaw);
        const FVector2D Right(-Front.Y, Front.X);
        return Shot(Layout.Booth + Front * 7.5f + Right * 3.f, 1.8f, Layout.Booth + Right * -.8f, 1.9f);
    }
    if (Site == TEXT("jam-outside"))
    {
        // Behind the LED spinners under the east canopy, the fire circle beyond them.
        for (const FObstacle& O : Layout.Obstacles)
            if (O.Id == TEXT("W2"))
            {
                const FVector2D Out = (O.At - Layout.Centre).GetSafeNormal();
                return Shot(O.At + Out * 7.f + FVector2D(Out.Y, -Out.X) * 2.f, 1.7f, Layout.Centre, 1.2f);
            }
        return false;
    }
    if (Site == TEXT("jam-club"))
    {
        const FVector2D At = Layout.Handover + Facing(Layout.HandoverYaw + PI * .5f) * 1.6f;
        const FVector2D From = At + Facing(Layout.HandoverYaw + 2.4f) * .75f;
        Eye = Ground(From, 78.f);
        Look = Ground(At, 50.f);
        return true;
    }
    return false;
}

UFlowFestJamComponent::FReadiness UFlowFestJamComponent::GetReadiness() const
{
    FReadiness R;
    R.Expected[Inside] = Layout.Performers.Num();
    R.Expected[Outside] = Layout.OutsideSpinners.Num();
    R.Expected[Spectator] = Layout.Spectators.Num();
    for (const FStation& S : Layout.Stations) R.Expected[Safety] += S.bOccupied;
    R.Expected[EKind::DJ] = 1;
    for (const FPerson& P : People)
    {
        const USkeletalMeshComponent* Body = P.Avatar ? P.Avatar->GetBodyMesh() : nullptr;
        const bool bDressed = IsValid(P.Actor) && Body && Body->GetSkeletalMeshAsset();
        const bool bPropped = P.Kind != Inside && P.Kind != Outside ? true : P.Prop && P.Prop->IsReady();
        ++R.Present[P.Kind];
        R.Spawned[P.Kind] += bDressed && bPropped;
        R.Out[P.Kind] += P.bOut;
        R.Shown[P.Kind] += P.bOut && P.bShown;
    }
    return R;
}
