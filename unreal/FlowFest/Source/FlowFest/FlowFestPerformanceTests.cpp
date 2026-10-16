#if WITH_DEV_AUTOMATION_TESTS
#include "FlowFestAvatarComponent.h"
#include "FlowFestPropComponent.h"

#include "Components/SceneComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Dom/JsonObject.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "Misc/AutomationTest.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "UObject/UObjectGlobals.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestMotionIntegrationTest, "FlowFest.Motion.AllNativeFamilies",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

namespace
{
TSharedPtr<FJsonObject> ReadCatalog(const TCHAR* Filename)
{
    FString Source;
    TSharedPtr<FJsonObject> Catalog;
    const FString Path = FPaths::ProjectContentDir() / TEXT("Data") / Filename;
    return FFileHelper::LoadFileToString(Source, *Path) &&
        FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Source), Catalog) ? Catalog : nullptr;
}

bool Finite(const FVector& V)
{
    return FMath::IsFinite(V.X) && FMath::IsFinite(V.Y) && FMath::IsFinite(V.Z);
}

bool FiniteUnit(const FQuat& Q)
{
    return FMath::IsFinite(Q.X) && FMath::IsFinite(Q.Y) &&
        FMath::IsFinite(Q.Z) && FMath::IsFinite(Q.W) &&
        FMath::Abs(Q.SizeSquared() - 1.f) < .01f;
}

bool ReadProbePoint(const TSharedPtr<FJsonObject>& Frame, const FString& Name, FVector& Point)
{
    const TArray<TSharedPtr<FJsonValue>>* Values = nullptr;
    if (!Frame.IsValid() || !Frame->TryGetArrayField(Name, Values) || !Values || Values->Num() != 3)
        return false;
    Point = FVector((*Values)[0]->AsNumber(), (*Values)[1]->AsNumber(), (*Values)[2]->AsNumber());
    return Finite(Point);
}

void LogIndependentGripProbe(const TSharedPtr<FJsonObject>& SourceFrame, const FString& Case,
    int32 FrameIndex, USkeletalMeshComponent* Body, const FTransform& AvatarFrame,
    UFlowFestPropComponent* Prop)
{
    if (!SourceFrame.IsValid() || !Body || !Prop) return;
    const auto NativeBone = [Body, &AvatarFrame](const FString& Name)
    {
        return AvatarFrame.InverseTransformPosition(Body->GetSocketLocation(FName(*Name)));
    };
    for (const FString Side : {FString(TEXT("Left")), FString(TEXT("Right"))})
    {
        FVector SourceArm, SourceElbow, SourceWrist, SourceFinger, SourcePivot;
        const FString Prefix = Side == TEXT("Left") ? TEXT("left") : TEXT("right");
        if (!ReadProbePoint(SourceFrame, Side + TEXT("Arm"), SourceArm) ||
            !ReadProbePoint(SourceFrame, Side + TEXT("ForeArm"), SourceElbow) ||
            !ReadProbePoint(SourceFrame, Side + TEXT("Hand"), SourceWrist) ||
            !ReadProbePoint(SourceFrame, Side + TEXT("HandMiddle1"), SourceFinger) ||
            !ReadProbePoint(SourceFrame, Prefix + TEXT("PropPivot"), SourcePivot)) continue;
        const FVector Arm = NativeBone(Side + TEXT("Arm"));
        const FVector Elbow = NativeBone(Side + TEXT("ForeArm"));
        const FVector Wrist = NativeBone(Side + TEXT("Hand"));
        const FVector Finger = NativeBone(Side + TEXT("HandMiddle1"));
        const FVector Pivot = AvatarFrame.InverseTransformPosition(
            Prop->GetPropRootTransform(Side == TEXT("Left")).GetLocation());
        UE_LOG(LogTemp, Display, TEXT("FlowFestIndependentGrip %s frame=%d side=%s importedArm=%s sourceArm=%s armError=%.3f importedElbow=%s sourceElbow=%s elbowError=%.3f importedWrist=%s sourceWrist=%s wristError=%.3f importedFinger=%s sourceFinger=%s fingerError=%.3f importedPivot=%s sourcePivot=%s pivotError=%.3f nativeFingerPivot=%.3f sourceFingerPivot=%.3f"),
            *Case, FrameIndex, *Side,
            *Arm.ToCompactString(), *SourceArm.ToCompactString(), FVector::Distance(Arm, SourceArm),
            *Elbow.ToCompactString(), *SourceElbow.ToCompactString(), FVector::Distance(Elbow, SourceElbow),
            *Wrist.ToCompactString(), *SourceWrist.ToCompactString(), FVector::Distance(Wrist, SourceWrist),
            *Finger.ToCompactString(), *SourceFinger.ToCompactString(), FVector::Distance(Finger, SourceFinger),
            *Pivot.ToCompactString(), *SourcePivot.ToCompactString(), FVector::Distance(Pivot, SourcePivot),
            FVector::Distance(Finger, Pivot), FVector::Distance(SourceFinger, SourcePivot));
    }
}

bool ReadVisualTrack(FName CharacterId, FName Profile, TArray<FQuat>& Left, TArray<FQuat>& Right)
{
    FString Character = CharacterId.ToString();
    Character.ReplaceInline(TEXT("-"), TEXT("_"));
    const FString Path = FPaths::ProjectContentDir() / TEXT("Data/PropMotion") /
        FString::Printf(TEXT("%s_%s.json"), *Character, *Profile.ToString());
    FString Source;
    TSharedPtr<FJsonObject> Motion;
    const TArray<TSharedPtr<FJsonValue>>* Frames = nullptr;
    if (!FFileHelper::LoadFileToString(Source, *Path) ||
        !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Source), Motion) ||
        !Motion.IsValid() || Motion->GetStringField(TEXT("schema")) != TEXT("flow-fest-prop-motion-v3") ||
        !Motion->TryGetArrayField(TEXT("frames"), Frames) || !Frames || Frames->Num() != 480)
        return false;
    Left.Reserve(Frames->Num());
    Right.Reserve(Frames->Num());
    for (const TSharedPtr<FJsonValue>& Frame : *Frames)
    {
        const TArray<TSharedPtr<FJsonValue>>* Values = nullptr;
        if (!Frame.IsValid() || !Frame->TryGetArray(Values) || !Values || Values->Num() != 28)
            return false;
        auto ReadQuat = [Values](int32 Offset)
        {
            return FQuat((*Values)[Offset]->AsNumber(), (*Values)[Offset + 1]->AsNumber(),
                (*Values)[Offset + 2]->AsNumber(), (*Values)[Offset + 3]->AsNumber());
        };
        const FQuat L = ReadQuat(20), R = ReadQuat(24);
        if (!FiniteUnit(L) || !FiniteUnit(R)) return false;
        Left.Add(L); Right.Add(R);
    }
    return true;
}

FQuat SampleVisualTrack(const TArray<FQuat>& Track, float Seconds)
{
    const float Frame = FMath::Fmod(FMath::Max(0.f, Seconds) * 30.f, static_cast<float>(Track.Num()));
    const int32 First = FMath::FloorToInt(Frame);
    return FQuat::Slerp(Track[First], Track[(First + 1) % Track.Num()], Frame - First).GetNormalized();
}

struct FGripDiagnosticSample
{
    int32 Index = 0;
    float Seconds = 0.f;
    float GripError = 0.f;
    float AnchorError = 0.f;
    FTransform AvatarRoot;
    FTransform LeftPropRoot;
    FTransform RightPropRoot;
    FVector Hips;
    FVector LeftHand;
    FVector RightHand;
};

void LogGripDiagnostics(const FString& Case, FName CharacterId, FName Profile,
    const TArray<FGripDiagnosticSample>& Samples)
{
    FString Character = CharacterId.ToString();
    Character.ReplaceInline(TEXT("-"), TEXT("_"));
    const FString Path = FPaths::ProjectContentDir() / TEXT("Data/PropMotion") /
        FString::Printf(TEXT("%s_%s.json"), *Character, *Profile.ToString());
    FString Source;
    TSharedPtr<FJsonObject> Motion;
    const TArray<TSharedPtr<FJsonValue>>* Frames = nullptr;
    if (!FFileHelper::LoadFileToString(Source, *Path) ||
        !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Source), Motion) ||
        !Motion.IsValid() || !Motion->TryGetArrayField(TEXT("frames"), Frames) || !Frames || Frames->IsEmpty())
    {
        UE_LOG(LogTemp, Warning, TEXT("FlowFestGripDiagnostics could not read %s"), *Path);
        return;
    }
    auto GetFrame = [Frames](int32 Index, FTransform& Left, FTransform& Right,
        FVector& LeftGrip, FVector& RightGrip)
    {
        const TArray<TSharedPtr<FJsonValue>>* Values = nullptr;
        if (!(*Frames)[Index]->TryGetArray(Values) || !Values || Values->Num() < 20) return false;
        auto N = [Values](int32 I) { return (*Values)[I]->AsNumber(); };
        auto Root = [&N](int32 I)
        {
            FQuat Q(N(I+3), N(I+4), N(I+5), N(I+6));
            Q.Normalize();
            return FTransform(Q, FVector(N(I), N(I+1), N(I+2)));
        };
        Left = Root(0); Right = Root(7);
        LeftGrip = FVector(N(14), N(15), N(16));
        RightGrip = FVector(N(17), N(18), N(19));
        return true;
    };
    for (const FGripDiagnosticSample& Sample : Samples)
    {
        const float Frame = FMath::Fmod(FMath::Max(0.f, Sample.Seconds) * 30.f, Frames->Num());
        const int32 First = FMath::FloorToInt(Frame);
        const int32 Second = (First + 1) % Frames->Num();
        const float Alpha = Frame - First;
        FTransform FirstLeft, FirstRight, SecondLeft, SecondRight;
        FVector FirstLeftGrip, FirstRightGrip, SecondLeftGrip, SecondRightGrip;
        if (!GetFrame(First, FirstLeft, FirstRight, FirstLeftGrip, FirstRightGrip) ||
            !GetFrame(Second, SecondLeft, SecondRight, SecondLeftGrip, SecondRightGrip)) continue;
        const FVector LeftGrip = FMath::Lerp(FirstLeftGrip, SecondLeftGrip, Alpha);
        const FVector RightGrip = FMath::Lerp(FirstRightGrip, SecondRightGrip, Alpha);
        const FVector LeftAnchor = FMath::Lerp(FirstLeft.InverseTransformPosition(FirstLeftGrip),
            SecondLeft.InverseTransformPosition(SecondLeftGrip), Alpha);
        const FVector RightAnchor = FMath::Lerp(FirstRight.InverseTransformPosition(FirstRightGrip),
            SecondRight.InverseTransformPosition(SecondRightGrip), Alpha);
        const FVector LeftPropAnchor = Sample.AvatarRoot.InverseTransformPosition(
            Sample.LeftPropRoot.TransformPosition(LeftAnchor));
        const FVector RightPropAnchor = Sample.AvatarRoot.InverseTransformPosition(
            Sample.RightPropRoot.TransformPosition(RightAnchor));
        const float LeftError = FVector::Distance(Sample.LeftHand, LeftGrip);
        const float RightError = FVector::Distance(Sample.RightHand, RightGrip);
        UE_LOG(LogTemp, Warning, TEXT("FlowFestGripDiagnostics %s sample=%d phase=%.5f grip=%.2f anchor=%.2f side=%s leftErr=%.2f rightErr=%.2f UE_hips=%s UE_L=%s captured_L=%s propAnchor_L=%s UE_R=%s captured_R=%s propAnchor_R=%s"),
            *Case, Sample.Index, Sample.Seconds / 16.f, Sample.GripError, Sample.AnchorError,
            LeftError >= RightError ? TEXT("left") : TEXT("right"), LeftError, RightError,
            *Sample.Hips.ToCompactString(), *Sample.LeftHand.ToCompactString(), *LeftGrip.ToCompactString(), *LeftPropAnchor.ToCompactString(),
            *Sample.RightHand.ToCompactString(), *RightGrip.ToCompactString(), *RightPropAnchor.ToCompactString());
    }
}

struct FScopedMotionWorld
{
    UWorld* World = nullptr;
    ~FScopedMotionWorld() { if (World) World->DestroyWorld(false); }
};
}

bool FFlowFestMotionIntegrationTest::RunTest(const FString& Parameters)
{
    FString FocusCharacter, FocusFamily, FocusVariant;
    const bool bGripProbe = FParse::Param(FCommandLine::Get(), TEXT("FlowFestGripProbe"));
    TSharedPtr<FJsonObject> GripProbe;
    if (bGripProbe)
    {
        FString ProbeText;
        const FString ProbePath = FPaths::ProjectSavedDir() / TEXT("diagnose-grip-report.json");
        if (!FFileHelper::LoadFileToString(ProbeText, *ProbePath) ||
            !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(ProbeText), GripProbe) || !GripProbe.IsValid())
            UE_LOG(LogTemp, Warning, TEXT("FlowFestGripProbe missing independent source report: %s"), *ProbePath);
    }
    FParse::Value(FCommandLine::Get(), TEXT("FlowFestMotionCharacter="), FocusCharacter);
    FParse::Value(FCommandLine::Get(), TEXT("FlowFestMotionFamily="), FocusFamily);
    FParse::Value(FCommandLine::Get(), TEXT("FlowFestMotionVariant="), FocusVariant);
    if (!TestTrue(TEXT("Focused routine must be A or B"), FocusVariant.IsEmpty() || FocusVariant == TEXT("A") || FocusVariant == TEXT("B"))) return false;
    const TSharedPtr<FJsonObject> CharacterCatalog = ReadCatalog(TEXT("characters.json"));
    const TSharedPtr<FJsonObject> PropCatalog = ReadCatalog(TEXT("props.json"));
    if (!TestTrue(TEXT("Character and prop catalogs load"), CharacterCatalog.IsValid() && PropCatalog.IsValid())) return false;
    const TArray<TSharedPtr<FJsonValue>>* Characters = nullptr;
    const TArray<TSharedPtr<FJsonValue>>* Props = nullptr;
    if (!TestTrue(TEXT("Character catalog has entries"),
        CharacterCatalog->TryGetArrayField(TEXT("characters"), Characters) && Characters && Characters->Num() == 16)) return false;
    if (!TestTrue(TEXT("Prop catalog has base families"),
        PropCatalog->TryGetArrayField(TEXT("props"), Props) && Props && Props->Num() == 41)) return false;

    FScopedMotionWorld Fixture;
    UWorld::InitializationValues WorldSettings;
    WorldSettings.AllowAudioPlayback(false).CreatePhysicsScene(false).CreateNavigation(false).CreateAISystem(false);
    const FName WorldName = MakeUniqueObjectName(GetTransientPackage(), UWorld::StaticClass(), FName(TEXT("FlowFestMotionTestWorld")));
    Fixture.World = UWorld::CreateWorld(EWorldType::Game, false, WorldName, GetTransientPackage(), true,
        ERHIFeatureLevel::Num, &WorldSettings);
    if (!TestNotNull(TEXT("Transient motion world"), Fixture.World)) return false;
    AActor* Performer = Fixture.World->SpawnActor<AActor>();
    if (!TestNotNull(TEXT("Motion test performer"), Performer)) return false;
    USceneComponent* Root = NewObject<USceneComponent>(Performer);
    Performer->SetRootComponent(Root);
    Root->RegisterComponent();
    UFlowFestAvatarComponent* Avatar = NewObject<UFlowFestAvatarComponent>(Performer);
    UFlowFestPropComponent* HeldProp = NewObject<UFlowFestPropComponent>(Performer);
    Avatar->RegisterComponent();
    HeldProp->RegisterComponent();

    const FString InitialId = (*Characters)[0]->AsObject()->GetStringField(TEXT("id"));
    Avatar->Initialize(Root, FName(*InitialId));
    HeldProp->Initialize(Root);
    if (!TestNotNull(TEXT("Native skinned body"), Avatar->GetBodyMesh()) ||
        !TestTrue(TEXT("Initial hand attachment"), HeldProp->BindHands(Avatar->GetBodyMesh()))) return false;
    Avatar->BindPerformanceProp(HeldProp);
    TArray<UStaticMeshComponent*> PropMeshComponents;
    Performer->GetComponents(PropMeshComponents);
    auto FindPropMesh = [&PropMeshComponents](const TCHAR* Name) -> UStaticMeshComponent*
    {
        for (UStaticMeshComponent* Mesh : PropMeshComponents)
            if (Mesh && Mesh->GetFName() == FName(Name)) return Mesh;
        return nullptr;
    };
    UStaticMeshComponent* LeftPropMesh = FindPropMesh(TEXT("FlowFestLeftPropMesh"));
    UStaticMeshComponent* RightPropMesh = FindPropMesh(TEXT("FlowFestRightPropMesh"));
    if (!TestNotNull(TEXT("Left physical prop mesh"), LeftPropMesh) ||
        !TestNotNull(TEXT("Right physical prop mesh"), RightPropMesh)) return false;

    // All 71 meshes must equip on the same native hands used by the routines.
    int32 VariantCount = 0;
    for (const TSharedPtr<FJsonValue>& PropValue : *Props)
    {
        const TSharedPtr<FJsonObject> Prop = PropValue->AsObject();
        if (!TestTrue(TEXT("Well-formed prop family"), Prop.IsValid())) return false;
        const FString Family = Prop->GetStringField(TEXT("id"));
        const TArray<TSharedPtr<FJsonValue>>* Variants = nullptr;
        if (!TestTrue(*FString::Printf(TEXT("Variants for %s"), *Family),
            Prop->TryGetArrayField(TEXT("variants"), Variants) && Variants && !Variants->IsEmpty())) return false;
        for (const TSharedPtr<FJsonValue>& VariantValue : *Variants)
        {
            const TSharedPtr<FJsonObject> Variant = VariantValue->AsObject();
            if (!Variant.IsValid()) return false;
            const FString Selection = Family + TEXT(":") + Variant->GetStringField(TEXT("id"));
            TestTrue(*FString::Printf(TEXT("Two imported meshes equip for %s"), *Selection),
                HeldProp->Equip(FName(*Selection)) && HeldProp->IsReady());
            ++VariantCount;
        }
    }
    TestEqual(TEXT("Every catalog mesh variant was checked"), VariantCount, 71);

    constexpr float GripToleranceCm = 3.f;
    float GlobalPeakGrip = 0.f;
    float GlobalPeakAnchor = 0.f;
    FString GlobalOffender;
    int32 SampledProfiles = 0;
    for (const TSharedPtr<FJsonValue>& CharacterValue : *Characters)
    {
        const TSharedPtr<FJsonObject> Character = CharacterValue->AsObject();
        if (!Character.IsValid()) return false;
        const FName CharacterId(*Character->GetStringField(TEXT("id")));
        if (!FocusCharacter.IsEmpty() && CharacterId.ToString() != FocusCharacter) continue;
        if (!TestTrue(*FString::Printf(TEXT("Native rig loads: %s"), *CharacterId.ToString()), Avatar->SetCharacter(CharacterId))) continue;
        if (!TestTrue(*FString::Printf(TEXT("Hands bind: %s"), *CharacterId.ToString()),
            HeldProp->BindHands(Avatar->GetBodyMesh()))) continue;
        USkeletalMeshComponent* Body = Avatar->GetBodyMesh();
        if (bGripProbe && Body && Body->GetSkeletalMeshAsset())
        {
            const FBoxSphereBounds Bounds = Body->GetSkeletalMeshAsset()->GetBounds();
            UE_LOG(LogTemp, Display, TEXT("FlowFestImportedBounds character=%s origin=%s extent=%s presentationScale=%s"),
                *CharacterId.ToString(), *Bounds.Origin.ToCompactString(),
                *Bounds.BoxExtent.ToCompactString(), *Body->GetRelativeScale3D().ToCompactString());
        }
        for (const TSharedPtr<FJsonValue>& PropValue : *Props)
        {
            const FString Family = PropValue->AsObject()->GetStringField(TEXT("id"));
            if (!FocusFamily.IsEmpty() && Family != FocusFamily) continue;
            if (!TestTrue(*FString::Printf(TEXT("Base mesh loads: %s/%s"), *CharacterId.ToString(), *Family),
                HeldProp->Equip(FName(*Family)) && HeldProp->IsReady())) continue;
            if (Family == TEXT("staff"))
            {
                // Compare the actual idle finger geometry with and without a
                // visible prop. A target-to-target wrist metric cannot detect
                // an open hand or a shaft aimed along the fingers.
                HeldProp->SetVisible(false);
                for (int32 Step = 0; Step < 20; ++Step)
                {
                    Fixture.World->TimeSeconds += .1f;
                    Body->TickAnimation(.1f, false);
                    Body->RefreshBoneTransforms();
                    HeldProp->TickComponent(.1f, LEVELTICK_All, nullptr);
                }
                const float RelaxedSpan[2] = {
                    FVector::Distance(Body->GetSocketLocation(TEXT("LeftHandIndex1")),
                        Body->GetSocketLocation(TEXT("LeftHandIndex3"))),
                    FVector::Distance(Body->GetSocketLocation(TEXT("RightHandIndex1")),
                        Body->GetSocketLocation(TEXT("RightHandIndex3")))};
                HeldProp->SetVisible(true);
                Fixture.World->TimeSeconds += .1f;
                Body->TickAnimation(.1f, false);
                Body->RefreshBoneTransforms();
                for (const bool bLeft : {true, false})
                {
                    const TCHAR* Hand = bLeft ? TEXT("LeftHand") : TEXT("RightHand");
                    const TCHAR* Middle = bLeft ? TEXT("LeftHandMiddle1") : TEXT("RightHandMiddle1");
                    const TCHAR* Index = bLeft ? TEXT("LeftHandIndex1") : TEXT("RightHandIndex1");
                    const TCHAR* IndexTip = bLeft ? TEXT("LeftHandIndex3") : TEXT("RightHandIndex3");
                    const TCHAR* Pinky = bLeft ? TEXT("LeftHandPinky1") : TEXT("RightHandPinky1");
                    const FVector WristWorld = Body->GetSocketLocation(Hand);
                    const FVector MiddleWorld = Body->GetSocketLocation(Middle);
                    const FVector Longitudinal = (MiddleWorld - WristWorld).GetSafeNormal();
                    FVector Transverse = Body->GetSocketLocation(Pinky) - Body->GetSocketLocation(Index);
                    Transverse -= Longitudinal * FVector::DotProduct(Transverse, Longitudinal);
                    Transverse.Normalize();
                    const FTransform PropRoot = HeldProp->GetPropRootTransform(bLeft);
                    const float AxisDot = FVector::DotProduct(
                        PropRoot.GetRotation().RotateVector(FVector::YAxisVector), -Transverse);
                    const float PalmError = FVector::Distance(PropRoot.GetLocation(),
                        FMath::Lerp(WristWorld, MiddleWorld, .65f));
                    const float GraspSpan = FVector::Distance(Body->GetSocketLocation(Index),
                        Body->GetSocketLocation(IndexTip));
                    const float OpenSpan = RelaxedSpan[bLeft ? 0 : 1];
                    UE_LOG(LogTemp, Display, TEXT("FlowFestIdleGrip rig=%s hand=%s axisDot=%.4f palm=%.3fcm indexSpan=%.3fcm relaxed=%.3fcm"),
                        *CharacterId.ToString(), Hand, AxisDot, PalmError, GraspSpan, OpenSpan);
                    TestTrue(*FString::Printf(TEXT("Transverse idle grip axis: %s/%s"), *CharacterId.ToString(), Hand),
                        AxisDot > .98f);
                    TestTrue(*FString::Printf(TEXT("Idle prop at palm: %s/%s"), *CharacterId.ToString(), Hand),
                        PalmError < 2.f);
                    TestTrue(*FString::Printf(TEXT("Equipped index finger curls: %s/%s"), *CharacterId.ToString(), Hand),
                        GraspSpan + .2f < OpenSpan);
                }
            }
            float FamilyPeakGrip = 0.f;
            float FamilyPeakAnchor = 0.f;
            FString FamilyOffender;
            for (int32 Variant = 0; Variant < 2; ++Variant)
            {
                if (!FocusVariant.IsEmpty() && Variant != (FocusVariant == TEXT("A") ? 0 : 1)) continue;
                const FName Profile = UFlowFestAvatarComponent::ResolvePerformanceProfile(FName(*Family), Variant);
                const FString Case = CharacterId.ToString() + TEXT("/") + Profile.ToString();
                if (!TestTrue(*FString::Printf(TEXT("Captured prop roots load: %s"), *Case),
                    HeldProp->LoadPerformance(CharacterId, Profile))) continue;
                TArray<FQuat> LeftVisualTrack, RightVisualTrack;
                if (!TestTrue(*FString::Printf(TEXT("Captured v3 visual body track loads: %s"), *Case),
                    ReadVisualTrack(CharacterId, Profile, LeftVisualTrack, RightVisualTrack))) continue;
                if (!TestTrue(*FString::Printf(TEXT("Skinned routine loads: %s"), *Case),
                    Avatar->PlayPerformance(Profile))) continue;
                const float Length = Avatar->GetPerformanceLength();
                if (!TestTrue(*FString::Printf(TEXT("Sixteen-second native loop: %s"), *Case),
                    FMath::IsNearlyEqual(Length, 16.f, .02f))) { Avatar->StopPerformance(); continue; }

                // Exercise the first blended pose with an actual registered prop root.
                Avatar->SetPerformancePhase(0.f);
                Fixture.World->TimeSeconds += .001;
                Body->TickAnimation(.001f, false);
                Body->RefreshBoneTransforms();
                Avatar->TickComponent(.001f, LEVELTICK_All, nullptr);
                TestTrue(*FString::Printf(TEXT("Finite entry anchor: %s"), *Case),
                    HeldProp->IsEnteringPerformance() &&
                    FMath::IsFinite(HeldProp->GetPropAnchorErrorCm()) &&
                    Finite(HeldProp->GetPropRootTransform(true).GetLocation()) &&
                    Finite(HeldProp->GetPropRootTransform(false).GetLocation()));

                // Settle the idle-to-performance blend before measuring source grip.
                for (int32 Warmup = 0; Warmup < 20; ++Warmup)
                {
                    Fixture.World->TimeSeconds += .1;
                    Body->TickAnimation(.1f, false);
                    Body->RefreshBoneTransforms();
                }
                float CasePeakGrip = 0.f;
                float CasePeakAnchor = 0.f;
                float CasePeakVisualDegrees = 0.f;
                float CasePeakVisualPointCm = 0.f;
                float SourceVisualVariationDegrees = 0.f;
                float RuntimeVisualVariationDegrees = 0.f;
                FQuat FirstActualLeft = FQuat::Identity;
                FQuat FirstActualRight = FQuat::Identity;
                bool bPoseValid = true;
                FGripDiagnosticSample PeakDiagnostic;
                TArray<FGripDiagnosticSample> LandmarkDiagnostics;
                // 32 evenly spaced samples plus both sides of the loop seam.
                for (int32 Sample = 0; Sample < 34; ++Sample)
                {
                    const float Seconds = Sample < 32 ? Sample * (Length / 32.f) :
                        (Sample == 32 ? Length - .02f : .02f);
                    Avatar->SetPerformancePhase(Seconds / Length);
                    Fixture.World->TimeSeconds += .25;
                    Body->TickAnimation(.001f, false);
                    Body->RefreshBoneTransforms();
                    Avatar->TickComponent(.001f, LEVELTICK_All, nullptr);
                    const FTransform Frame = Root->GetComponentTransform();
                    const FVector Hips = Frame.InverseTransformPosition(Body->GetSocketLocation(TEXT("Hips")));
                    const FVector Head = Frame.InverseTransformPosition(Body->GetSocketLocation(TEXT("Head")));
                    const FVector LeftHand = Frame.InverseTransformPosition(Body->GetSocketLocation(TEXT("LeftHand")));
                    const FVector RightHand = Frame.InverseTransformPosition(Body->GetSocketLocation(TEXT("RightHand")));
                    const FVector LeftFoot = Frame.InverseTransformPosition(Body->GetSocketLocation(TEXT("LeftFoot")));
                    const FVector RightFoot = Frame.InverseTransformPosition(Body->GetSocketLocation(TEXT("RightFoot")));
                    bPoseValid &= Finite(Hips) && Finite(Head) && Finite(LeftHand) && Finite(RightHand) &&
                        Finite(LeftFoot) && Finite(RightFoot) && Hips.Size() < 260.f &&
                        Head.Z > 20.f && Head.Z < 280.f && LeftHand.Size() < 320.f &&
                        RightHand.Size() < 320.f && LeftFoot.Z > -80.f && LeftFoot.Z < 260.f &&
                        RightFoot.Z > -80.f && RightFoot.Z < 260.f;
                    bPoseValid &= FMath::Abs(Avatar->GetPerformanceTime() - Seconds) < .03f;
                    const float Error = HeldProp->GetGripErrorCm();
                    const float AnchorError = HeldProp->GetPropAnchorErrorCm();
                    if (bGripProbe && GripProbe.IsValid() && Family == TEXT("staff") && Variant == 0 &&
                        (Sample == 0 || Sample == 2 || Sample == 4 || Sample == 8 ||
                         Sample == 12 || Sample == 16 || Sample == 24 || Sample == 28))
                    {
                        const TSharedPtr<FJsonObject>* ProbeCharacters = nullptr;
                        const TSharedPtr<FJsonObject>* SourceCharacter = nullptr;
                        const TSharedPtr<FJsonObject>* Frames = nullptr;
                        const TSharedPtr<FJsonObject>* SourceFrame = nullptr;
                        if (GripProbe->TryGetObjectField(TEXT("characters"), ProbeCharacters) && ProbeCharacters &&
                            (*ProbeCharacters)->TryGetObjectField(CharacterId.ToString(), SourceCharacter) && SourceCharacter &&
                            (*SourceCharacter)->TryGetObjectField(TEXT("staffALandmarksAvatarLocalCm"), Frames) && Frames &&
                            (*Frames)->TryGetObjectField(FString::FromInt(FMath::RoundToInt(Seconds * 30.f)), SourceFrame) && SourceFrame)
                            LogIndependentGripProbe(*SourceFrame, Case, FMath::RoundToInt(Seconds * 30.f),
                                Body, Frame, HeldProp);
                    }
                    for (const bool bLeft : {true, false})
                    {
                        const TArray<FQuat>& Track = bLeft ? LeftVisualTrack : RightVisualTrack;
                        UStaticMeshComponent* Mesh = bLeft ? LeftPropMesh : RightPropMesh;
                        const FQuat Expected = SampleVisualTrack(Track, Seconds);
                        const FQuat Actual = HeldProp->GetVisualRotation(bLeft);
                        bPoseValid &= FiniteUnit(Actual);
                        const float Degrees = FMath::RadiansToDegrees(Actual.AngularDistance(Expected));
                        CasePeakVisualDegrees = FMath::Max(CasePeakVisualDegrees, Degrees);
                        SourceVisualVariationDegrees = FMath::Max(SourceVisualVariationDegrees,
                            FMath::RadiansToDegrees(Expected.AngularDistance(Track[0])));
                        FQuat& FirstActual = bLeft ? FirstActualLeft : FirstActualRight;
                        if (Sample == 0) FirstActual = Actual;
                        RuntimeVisualVariationDegrees = FMath::Max(RuntimeVisualVariationDegrees,
                            FMath::RadiansToDegrees(Actual.AngularDistance(FirstActual)));
                        // A point away from the static mesh pivot must move with
                        // the captured body rotation through the real mesh hierarchy.
                        const FVector MeshPoint(17.f, 29.f, -11.f);
                        const FVector ActualWorld = Mesh->GetComponentTransform().TransformPosition(MeshPoint);
                        const FVector ExpectedWorld = HeldProp->GetPropRootTransform(bLeft).TransformPosition(
                            Expected.RotateVector(Mesh->GetRelativeTransform().TransformPosition(MeshPoint)));
                        bPoseValid &= Finite(ActualWorld) && Finite(ExpectedWorld);
                        CasePeakVisualPointCm = FMath::Max(CasePeakVisualPointCm,
                            FVector::Distance(ActualWorld, ExpectedWorld));
                    }
                    bPoseValid &= FMath::IsFinite(Error) && FMath::IsFinite(AnchorError) &&
                        !HeldProp->IsEnteringPerformance() &&
                        Finite(HeldProp->GetPropRootTransform(true).GetLocation()) &&
                        Finite(HeldProp->GetPropRootTransform(false).GetLocation());
                    if (Error > CasePeakGrip || (Sample == 0 && CasePeakGrip == 0.f))
                    {
                        CasePeakGrip = Error;
                        PeakDiagnostic = {Sample, Seconds, Error, AnchorError, Frame,
                            HeldProp->GetPropRootTransform(true), HeldProp->GetPropRootTransform(false),
                            Hips, LeftHand, RightHand};
                    }
                    CasePeakAnchor = FMath::Max(CasePeakAnchor, AnchorError);
                    if (Sample == 0 || Sample == 8 || Sample == 16 || Sample == 24 || Sample == 32)
                        LandmarkDiagnostics.Add({Sample, Seconds, Error, AnchorError, Frame,
                            HeldProp->GetPropRootTransform(true), HeldProp->GetPropRootTransform(false),
                            Hips, LeftHand, RightHand});
                }
                TestTrue(*FString::Printf(TEXT("Finite pose and shared clock: %s"), *Case), bPoseValid);
                TestTrue(*FString::Printf(TEXT("Captured visual body rotation within 0.5 degrees: %s (peak %.3f)"),
                    *Case, CasePeakVisualDegrees), CasePeakVisualDegrees <= .5f);
                TestTrue(*FString::Printf(TEXT("Physical prop mesh follows captured visual body within 1 cm: %s (peak %.3f)"),
                    *Case, CasePeakVisualPointCm), CasePeakVisualPointCm <= 1.f);
                if (Family == TEXT("staff") || Family == TEXT("poi"))
                {
                    TestTrue(*FString::Printf(TEXT("Source visual rotation animates: %s (%.2f degrees)"),
                        *Case, SourceVisualVariationDegrees), SourceVisualVariationDegrees > 2.f);
                    TestTrue(*FString::Printf(TEXT("Native visual rotation animates: %s (%.2f degrees)"),
                        *Case, RuntimeVisualVariationDegrees), RuntimeVisualVariationDegrees > 2.f);
                }
                if (CasePeakGrip > GripToleranceCm || CasePeakAnchor > GripToleranceCm)
                {
                    Body->UpdateBounds();
                    UE_LOG(LogTemp, Warning, TEXT("FlowFestGripDiagnostics %s meshHeight=%.2fcm bodyRelativeScale=%s"),
                        *Case, Body->Bounds.BoxExtent.Z * 2.f, *Body->GetRelativeScale3D().ToCompactString());
                    LandmarkDiagnostics.Add(PeakDiagnostic);
                    LogGripDiagnostics(Case, CharacterId, Profile, LandmarkDiagnostics);
                }
                if (CasePeakGrip > GlobalPeakGrip) { GlobalPeakGrip = CasePeakGrip; GlobalOffender = Case; }
                if (CasePeakGrip > FamilyPeakGrip) { FamilyPeakGrip = CasePeakGrip; FamilyOffender = Case; }
                GlobalPeakAnchor = FMath::Max(GlobalPeakAnchor, CasePeakAnchor);
                FamilyPeakAnchor = FMath::Max(FamilyPeakAnchor, CasePeakAnchor);
                TestTrue(*FString::Printf(TEXT("Grip within %.1f cm: %s (peak %.2f cm)"), GripToleranceCm, *Case, CasePeakGrip),
                    CasePeakGrip <= GripToleranceCm);
                TestTrue(*FString::Printf(TEXT("Prop root anchor within %.1f cm: %s (peak %.2f cm)"), GripToleranceCm, *Case, CasePeakAnchor),
                    CasePeakAnchor <= GripToleranceCm);
                if (Variant == 0 && FocusVariant.IsEmpty())
                {
                    // Exercise the same-frame routine change used by the game,
                    // then interrupt it before the .18 s body blend settles.
                    // The prop diagnostic evaluates its authored wrist anchor
                    // through the actual blended prop root against the live hand.
                    float SwitchPeakAnchor = 0.f;
                    float SwitchFirstStepCm = 0.f;
                    bool bSwitchFinite = true;
                    FString SwitchPeakLeg;
                    FString SwitchPeakHand;
                    FVector SwitchBeforeRoot = FVector::ZeroVector;
                    FVector SwitchAfterRoot = FVector::ZeroVector;
                    FVector SwitchBeforeWrist = FVector::ZeroVector;
                    FVector SwitchAfterWrist = FVector::ZeroVector;
                    auto TickSwitch = [&](float Delta, bool bFirstStep, const TCHAR* Leg)
                    {
                        const FVector BeforeLeft = HeldProp->GetPropRootTransform(true).GetLocation();
                        const FVector BeforeRight = HeldProp->GetPropRootTransform(false).GetLocation();
                        const FVector BeforeLeftWrist = Body->GetSocketLocation(TEXT("LeftHand"));
                        const FVector BeforeRightWrist = Body->GetSocketLocation(TEXT("RightHand"));
                        Fixture.World->TimeSeconds += Delta;
                        Body->TickAnimation(Delta, false);
                        Body->RefreshBoneTransforms();
                        Avatar->TickComponent(Delta, LEVELTICK_All, nullptr);
                        const FVector AfterLeft = HeldProp->GetPropRootTransform(true).GetLocation();
                        const FVector AfterRight = HeldProp->GetPropRootTransform(false).GetLocation();
                        const FVector AfterLeftWrist = Body->GetSocketLocation(TEXT("LeftHand"));
                        const FVector AfterRightWrist = Body->GetSocketLocation(TEXT("RightHand"));
                        const float Anchor = HeldProp->GetPropAnchorErrorCm();
                        bSwitchFinite &= Finite(AfterLeft) && Finite(AfterRight) &&
                            Finite(AfterLeftWrist) && Finite(AfterRightWrist) && FMath::IsFinite(Anchor);
                        SwitchPeakAnchor = FMath::Max(SwitchPeakAnchor, Anchor);
                        if (bFirstStep)
                        {
                            auto RecordStep = [&](const TCHAR* Hand, const FVector& BeforeRoot,
                                const FVector& AfterRoot, const FVector& BeforeWrist, const FVector& AfterWrist)
                            {
                                const float DistanceCm = FVector::Distance(BeforeRoot, AfterRoot);
                                if (DistanceCm <= SwitchFirstStepCm) return;
                                SwitchFirstStepCm = DistanceCm;
                                SwitchPeakLeg = Leg;
                                SwitchPeakHand = Hand;
                                SwitchBeforeRoot = BeforeRoot;
                                SwitchAfterRoot = AfterRoot;
                                SwitchBeforeWrist = BeforeWrist;
                                SwitchAfterWrist = AfterWrist;
                            };
                            RecordStep(TEXT("left"), BeforeLeft, AfterLeft, BeforeLeftWrist, AfterLeftWrist);
                            RecordStep(TEXT("right"), BeforeRight, AfterRight, BeforeRightWrist, AfterRightWrist);
                        }
                    };
                    auto SwitchTo = [&](int32 NextVariant)
                    {
                        const FName NextProfile = UFlowFestAvatarComponent::ResolvePerformanceProfile(FName(*Family), NextVariant);
                        if (!HeldProp->LoadPerformance(CharacterId, NextProfile)) return false;
                        Avatar->StopPerformance();
                        return Avatar->PlayPerformance(NextProfile);
                    };
                    if (TestTrue(*FString::Printf(TEXT("A to B switch loads: %s"), *Case), SwitchTo(1)))
                    {
                        for (int32 Step = 0; Step < 3; ++Step) TickSwitch(.02f, Step == 0, TEXT("A-to-B"));
                        if (TestTrue(*FString::Printf(TEXT("Interrupted B to A switch loads: %s"), *Case), SwitchTo(0)))
                            for (int32 Step = 0; Step < 10; ++Step) TickSwitch(.02f, Step == 0, TEXT("interrupted-B-to-A"));
                    }
                    if (Family.Contains(TEXT("buugeng")) || Family.Contains(TEXT("stick")))
                        UE_LOG(LogTemp, Warning, TEXT("FlowFestSwitchDiagnostics %s peak=%.2fcm leg=%s hand=%s root=%s->%s wrist=%s->%s"),
                            *Case, SwitchFirstStepCm, *SwitchPeakLeg, *SwitchPeakHand,
                            *SwitchBeforeRoot.ToCompactString(), *SwitchAfterRoot.ToCompactString(),
                            *SwitchBeforeWrist.ToCompactString(), *SwitchAfterWrist.ToCompactString());
                    TestTrue(*FString::Printf(TEXT("Finite A/B switch roots and anchors: %s"), *Case), bSwitchFinite);
                    TestTrue(*FString::Printf(TEXT("A/B switch wrist anchors within 10 cm: %s (peak %.2f cm)"),
                        *Case, SwitchPeakAnchor), SwitchPeakAnchor <= 10.f);
                    TestTrue(*FString::Printf(TEXT("A/B switch starts without prop jump: %s (first step %.2f cm)"),
                        *Case, SwitchFirstStepCm), SwitchFirstStepCm <= 15.f);
                }
                ++SampledProfiles;
                HeldProp->ClearPerformanceTransforms();
                Avatar->StopPerformance();
                TestTrue(*FString::Printf(TEXT("Exit blend starts: %s"), *Case), HeldProp->IsReturningToHands());
                Fixture.World->TimeSeconds += .2;
                Body->TickAnimation(.1f, false);
                Body->RefreshBoneTransforms();
                HeldProp->TickComponent(.2f, LEVELTICK_All, nullptr);
                const float ExitLeftCm = FVector::Distance(HeldProp->GetPropRootTransform(true).GetLocation(),
                    Body->GetSocketLocation(TEXT("LeftHand")));
                const float ExitRightCm = FVector::Distance(HeldProp->GetPropRootTransform(false).GetLocation(),
                    Body->GetSocketLocation(TEXT("RightHand")));
                TestTrue(*FString::Printf(TEXT("Exit returns props to live hands: %s"), *Case),
                    !HeldProp->IsReturningToHands() && FMath::IsFinite(ExitLeftCm) && FMath::IsFinite(ExitRightCm) &&
                    ExitLeftCm < 80.f && ExitRightCm < 80.f);
            }
            UE_LOG(LogTemp, Display, TEXT("FlowFestMotionGrip rig=%s family=%s capturedPeak=%.2fcm anchorPeak=%.2fcm offender=%s"),
                *CharacterId.ToString(), *Family, FamilyPeakGrip, FamilyPeakAnchor, *FamilyOffender);
        }
    }
    UE_LOG(LogTemp, Display, TEXT("FlowFestMotion sampled %d native rig/family/routine pairs; captured peak %.2f cm at %s; prop anchor peak %.2f cm"),
        SampledProfiles, GlobalPeakGrip, *GlobalOffender, GlobalPeakAnchor);
    const int32 ExpectedProfiles = (FocusCharacter.IsEmpty() ? 16 : 1) * (FocusFamily.IsEmpty() ? 41 : 1) * (FocusVariant.IsEmpty() ? 2 : 1);
    TestEqual(TEXT("Every requested rig, family and routine was sampled"), SampledProfiles, ExpectedProfiles);
    return true;
}
#endif
