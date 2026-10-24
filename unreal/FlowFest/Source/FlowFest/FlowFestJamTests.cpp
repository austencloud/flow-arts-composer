#if WITH_DEV_AUTOMATION_TESTS
#include "Misc/AutomationTest.h"
#include "FlowFestJam.h"
#include "FlowFestWorld.h"
#include "FlowFestAvatarComponent.h"

using namespace FlowFestJam;

namespace
{
bool Load(FAutomationTestBase& Test, FLayout& Layout)
{
    FString Error;
    const bool bLoaded = LoadLayout(Layout, Error);
    Test.TestTrue(FString::Printf(TEXT("jam-layout.json loads (%s)"), *Error), bLoaded);
    return bLoaded;
}
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestJamLayoutTest, "FlowFest.Jam.Layout",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)

// The C++ reading of the shared layout: a closed simple rope, its stations outside facing in,
// fire inside and LED outside, and nothing standing on the walk, the funnel or the entrance.
bool FFlowFestJamLayoutTest::RunTest(const FString&)
{
    FLayout L;
    if (!Load(*this, L)) return false;
    TestEqual(TEXT("layout version"), L.Version, 2);
    TestTrue(TEXT("boundary is a ring of points"), L.Boundary.Num() >= 64);
    TestTrue(TEXT("boundary closes on itself"), FVector2D::Distance(L.Boundary[0], L.Boundary.Last()) < 3.f);
    TestTrue(TEXT("the centre is inside"), Inside(L.Boundary, L.Centre));
    float Perimeter = 0.f;
    for (int32 I = 0; I < L.Boundary.Num(); ++I) Perimeter += FVector2D::Distance(L.Boundary[I], L.Boundary[(I + 1) % L.Boundary.Num()]);
    TestTrue(FString::Printf(TEXT("perimeter %.1f matches the file's %.1f"), Perimeter, L.Perimeter), FMath::IsNearlyEqual(Perimeter, L.Perimeter, 1.f));
    // Simple: no two non-adjacent boundary segments cross.
    int32 Crossings = 0;
    const auto Cross = [](const FVector2D& A, const FVector2D& B, const FVector2D& C, const FVector2D& D)
    {
        const auto Side = [](const FVector2D& P, const FVector2D& Q, const FVector2D& R) { return FVector2D::CrossProduct(Q - P, R - P); };
        return Side(A, B, C) * Side(A, B, D) < 0.f && Side(C, D, A) * Side(C, D, B) < 0.f;
    };
    const int32 N = L.Boundary.Num();
    for (int32 I = 0; I < N; ++I)
        for (int32 J = I + 2; J < N; ++J)
            if (!(I == 0 && J == N - 1) && Cross(L.Boundary[I], L.Boundary[(I + 1) % N], L.Boundary[J], L.Boundary[(J + 1) % N])) ++Crossings;
    TestEqual(TEXT("the rope never crosses itself"), Crossings, 0);
    // The rope runs post to post, leaving the entrance gap open.
    TestEqual(TEXT("one rope run"), L.Rope.Num(), 1);
    if (L.Rope.Num() == 1)
    {
        const TArray<FVector2D>& Rope = L.Rope[0];
        TestTrue(TEXT("rope starts at a gap post"), FVector2D::Distance(Rope[0], L.Posts[1]) < .3f || FVector2D::Distance(Rope[0], L.Posts[0]) < .3f);
        TestTrue(TEXT("rope ends at the other gap post"), FVector2D::Distance(Rope.Last(), L.Posts[0]) < .5f || FVector2D::Distance(Rope.Last(), L.Posts[1]) < .5f);
        TestTrue(TEXT("the gap is open at the entrance"), DistanceToRope(L, L.Entrance) > 1.2f);
    }
    TestEqual(TEXT("16 safety stations"), L.Stations.Num(), 16);
    for (const FStation& S : L.Stations)
    {
        TestFalse(FString::Printf(TEXT("%s sits outside the rope"), *S.Id), Inside(L.Boundary, S.At));
        const FVector2D In = (L.Centre - S.At).GetSafeNormal();
        TestTrue(FString::Printf(TEXT("%s faces into the circle"), *S.Id), FVector2D::DotProduct(Facing(S.Yaw), In) > .3f);
        TestTrue(FString::Printf(TEXT("%s keeps off the entrance"), *S.Id), FVector2D::Distance(S.At, L.Entrance) > 2.f);
    }
    // Nothing anyone sits on or stands at blocks the walk, the funnel or the gap.
    const auto Clear = [&L](const FVector2D& P, float Walk)
    {
        bool bOk = DistanceToLine(L.Queue, P, false) > Walk && FVector2D::Distance(P, L.Entrance) > 2.f;
        for (const TArray<FVector2D>& F : L.Funnel) bOk &= DistanceToLine(F, P, false) > .4f;
        return bOk;
    };
    int32 Blocking = 0;
    for (const FDressing& D : L.Dressing) Blocking += !Clear(D.At, .8f);
    for (const FSpectator& S : L.Spectators) Blocking += !Clear(S.At, .6f);
    TestEqual(TEXT("no dressing or watcher on the walk, the funnel or the gap"), Blocking, 0);
    // Fire inside, LED outside.
    TestEqual(TEXT("16 fire performers"), L.Performers.Num(), 16);
    for (const FPerformer& P : L.Performers)
    {
        TestEqual(FString::Printf(TEXT("%s finish"), *P.Id), P.Finish, FString(TEXT("fire")));
        TestTrue(FString::Printf(TEXT("%s starts inside with room to spin"), *P.Id), Inside(L.Boundary, P.Start) && DistanceToLine(L.Boundary, P.Start, true) > 1.f);
    }
    TestEqual(TEXT("18 outside spinners"), L.OutsideSpinners.Num(), 18);
    for (const FOutsideSpinner& S : L.OutsideSpinners)
    {
        TestFalse(FString::Printf(TEXT("%s stays outside"), *S.Id), Inside(L.Boundary, S.At));
        TestTrue(FString::Printf(TEXT("%s drifts clear of the rope"), *S.Id), DistanceToLine(L.Boundary, S.At, true) > S.WanderRadius);
        TestTrue(FString::Printf(TEXT("%s keeps off the walk and the funnel"), *S.Id), Clear(S.At, S.WanderRadius));
    }
    // The entry: the lighting flame stands just inside the gap, the archway outside it.
    TestTrue(TEXT("the lighting flame is inside the circle"), Inside(L.Boundary, L.Flame));
    TestTrue(TEXT("the lighting flame is about 1.8 m in from the gap"), FMath::IsNearlyEqual(FVector2D::Distance(L.Flame, L.Entrance), 1.8f, .6f));
    TestFalse(TEXT("the archway is outside"), Inside(L.Boundary, L.Archway));
    TestEqual(TEXT("two funnel lines"), L.Funnel.Num(), 2);
    TestFalse(TEXT("the handover is outside the rope"), Inside(L.Boundary, L.Handover));
    // The booth faces the circle.
    TestTrue(TEXT("the DJ booth faces the circle"), FVector2D::DotProduct(Facing(L.BoothYaw), (L.Centre - L.Booth).GetSafeNormal()) > .9f);
    TestEqual(TEXT("two string-light runs"), L.StringLights.Num(), 2);
    for (const FStringLight& Run : L.StringLights)
    {
        const TArray<FVector> Bulbs = StringBulbs(Run);
        TestTrue(FString::Printf(TEXT("%s has bulbs"), *Run.Id), Bulbs.Num() > 3);
        float Lowest = 1e9f;
        for (const FVector& B : Bulbs) Lowest = FMath::Min(Lowest, B.Z);
        TestTrue(FString::Printf(TEXT("%s sags but stays above head height"), *Run.Id), Lowest > 1.9f && Lowest < Run.Anchors[0].Z);
    }
    TestEqual(TEXT("opening has four keys"), L.Opening.Num(), 4);
    TestTrue(TEXT("the opening ends at eye height"), L.Opening.Num() == 4 && L.Opening.Last().Height < 2.f);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestJamYawTest, "FlowFest.Jam.Yaw",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)

// The layout's yaw is radians about +y, 0 facing +x and turning toward +z (south). Site x is
// Unreal X and site z is Unreal Y, and Unreal yaw turns +X toward +Y, so it is the same angle.
bool FFlowFestJamYawTest::RunTest(const FString&)
{
    TestEqual(TEXT("0 faces +X"), float(FRotator(0.f, UnrealYaw(0.f), 0.f).Vector().X), 1.f, 1e-4f);
    const FVector South = FRotator(0.f, UnrealYaw(HALF_PI), 0.f).Vector();
    TestTrue(TEXT("a quarter turn faces +Y, the site's +z"), South.Y > .999f);
    FLayout L;
    if (!Load(*this, L)) return false;
    // Unreal's facing for a station equals the site's facing vector.
    for (const FStation& S : L.Stations)
    {
        const FVector F = FRotator(0.f, UnrealYaw(S.Yaw), 0.f).Vector();
        TestTrue(*S.Id, FVector2D(F.X, F.Y).Equals(Facing(S.Yaw), 1e-3f));
    }
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestJamLightTest, "FlowFest.Jam.Light",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)

// The rope comes on by sun elevation and the performers follow the night curve, never before
// the rope glows, whatever the world's sun model is.
bool FFlowFestJamLightTest::RunTest(const FString&)
{
    FLayout L;
    if (!Load(*this, L)) return false;
    TestEqual(TEXT("rope dark above 1 degree"), RopeGlow(L, 2.f), 0.f);
    TestEqual(TEXT("rope full at -5 degrees"), RopeGlow(L, -5.f), 1.f);
    TestTrue(TEXT("rope half way between"), RopeGlow(L, -2.f) > .3f && RopeGlow(L, -2.f) < .7f);
    // The real mid-May sun at the site: sunset near 20:46, the lowest sun about -31.6 degrees.
    TestTrue(TEXT("sun near the horizon at 20:46"), FMath::Abs(MidMayElevation(20.77f)) < 1.2f);
    TestEqual(TEXT("lowest real sun"), MidMayElevation(25.591f), -31.6f, .3f);
    for (const float Hour : {17.5f, 20.5f, 22.5f, 23.5f})
        TestEqual(FString::Printf(TEXT("equivalent hour round trip %.1f"), Hour), EquivalentHour(MidMayElevation(Hour), false), Hour, .02f);
    TestEqual(TEXT("after midnight round trip"), EquivalentHour(MidMayElevation(27.f), true), 27.f, .02f);
    // The current model: solve its clock hour for an elevation and read it back.
    for (const float Elevation : {9.f, 3.f, -2.5f, -7.f, -17.36f})
        TestEqual(FString::Printf(TEXT("model hour for %.1f degrees"), Elevation), ModelElevation(SolveClockHour(Elevation)), Elevation, .05f);
    // Nobody is out before the rope glows, the jam is full at the real 22:30.
    for (float Clock = 12.f; Clock < 24.f; Clock += .05f)
    {
        const FVector2D Night = NightForClock(L, Clock);
        if (RopeGlow(L, ModelElevation(Clock)) <= 0.f && (Night.X > 0.f || Night.Y > 0.f))
        {
            AddError(FString::Printf(TEXT("performers out at %.2f before the rope glows"), Clock));
            break;
        }
    }
    const FVector2D Full = NightForClock(L, SolveClockHour(MidMayElevation(22.5f)));
    TestEqual(TEXT("the jam is full at the real 22:30"), float(Full.X), 1.f, .02f);
    TestEqual(TEXT("the edge is full at the real 22:30"), float(Full.Y), 1.f, .02f);
    TestEqual(TEXT("the rope is full then"), RopeGlow(L, MidMayElevation(22.5f)), 1.f);
    // Golden hour: rope dark, nobody out.
    TestEqual(TEXT("nobody out at golden hour"), float(NightForClock(L, SolveClockHour(MidMayElevation(17.5f))).X), 0.f);
    // The opening descends from the high rise to eye height behind the archway.
    FVector Eye, Look; float Sun = 0.f;
    SampleShot(L, 0.f, Eye, Look, Sun);
    TestEqual(TEXT("opening starts at 9 degrees"), Sun, 9.f, .01f);
    SampleShot(L, ShotLength(L), Eye, Look, Sun);
    TestEqual(TEXT("opening ends at -7 degrees"), Sun, -7.f, .01f);
    TestTrue(TEXT("opening ends outside the rope"), !Inside(L.Boundary, FVector2D(Eye)));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestJamPlacementTest, "FlowFest.Jam.Placement",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)

// Wandering performers stay inside the rope with room to spin; outside spinners stay out.
bool FFlowFestJamPlacementTest::RunTest(const FString&)
{
    FLayout L;
    if (!Load(*this, L)) return false;
    int32 Escapes = 0;
    for (const FPerformer& P : L.Performers)
        for (float T = 0.f; T < 600.f; T += 7.f)
        {
            const FVector2D Q = KeepInside(L, Drift(P.Start, 4.f, P.Seeds, T));
            Escapes += !Inside(L.Boundary, Q) || DistanceToLine(L.Boundary, Q, true) < RopeClearance - .01f;
        }
    TestEqual(TEXT("inside performers never wander onto the rope"), Escapes, 0);
    int32 Strays = 0;
    for (const FOutsideSpinner& S : L.OutsideSpinners)
        for (float T = 0.f; T < 600.f; T += 7.f)
            Strays += Inside(L.Boundary, Drift(S.At, S.WanderRadius, S.Seeds, T));
    TestEqual(TEXT("outside spinners never drift into the circle"), Strays, 0);
    // Catalogue props for every layout prop, fire and LED.
    for (const TCHAR* Prop : {TEXT("dragon-staff"), TEXT("staff"), TEXT("clubs"), TEXT("poi"), TEXT("double-staff"), TEXT("fans"), TEXT("hoop"), TEXT("rope-dart")})
    {
        TestFalse(Prop, PropIdFor(Prop, false, false).IsNone());
        TestFalse(Prop, UFlowFestAvatarComponent::ResolvePerformanceProfile(PropIdFor(Prop, false, true), 0).IsNone());
    }
    TestEqual(TEXT("jugglers carry clubs"), PropIdFor(TEXT("clubs"), true, true), FName(TEXT("club")));
    return true;
}
#endif
