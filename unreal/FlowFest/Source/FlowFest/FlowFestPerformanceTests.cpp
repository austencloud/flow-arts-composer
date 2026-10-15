#if WITH_DEV_AUTOMATION_TESTS
#include "FlowFestAvatarComponent.h"
#include "FlowFestPropComponent.h"

#include "Components/SceneComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Dom/JsonObject.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "Misc/AutomationTest.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
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

struct FScopedMotionWorld
{
    UWorld* World = nullptr;
    ~FScopedMotionWorld() { if (World) World->DestroyWorld(false); }
};
}

bool FFlowFestMotionIntegrationTest::RunTest(const FString& Parameters)
{
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
        if (!TestTrue(*FString::Printf(TEXT("Native rig loads: %s"), *CharacterId.ToString()), Avatar->SetCharacter(CharacterId))) continue;
        if (!TestTrue(*FString::Printf(TEXT("Hands bind: %s"), *CharacterId.ToString()),
            HeldProp->BindHands(Avatar->GetBodyMesh()))) continue;
        USkeletalMeshComponent* Body = Avatar->GetBodyMesh();
        for (const TSharedPtr<FJsonValue>& PropValue : *Props)
        {
            const FString Family = PropValue->AsObject()->GetStringField(TEXT("id"));
            if (!TestTrue(*FString::Printf(TEXT("Base mesh loads: %s/%s"), *CharacterId.ToString(), *Family),
                HeldProp->Equip(FName(*Family)) && HeldProp->IsReady())) continue;
            float FamilyPeakGrip = 0.f;
            float FamilyPeakAnchor = 0.f;
            FString FamilyOffender;
            for (int32 Variant = 0; Variant < 2; ++Variant)
            {
                const FName Profile = UFlowFestAvatarComponent::ResolvePerformanceProfile(FName(*Family), Variant);
                const FString Case = CharacterId.ToString() + TEXT("/") + Profile.ToString();
                if (!TestTrue(*FString::Printf(TEXT("Captured prop roots load: %s"), *Case),
                    HeldProp->LoadPerformance(CharacterId, Profile))) continue;
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
                for (int32 Warmup = 0; Warmup < 14; ++Warmup)
                {
                    Fixture.World->TimeSeconds += .1;
                    Body->TickAnimation(.1f, false);
                    Body->RefreshBoneTransforms();
                }
                float CasePeakGrip = 0.f;
                float CasePeakAnchor = 0.f;
                bool bPoseValid = true;
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
                    bPoseValid &= FMath::IsFinite(Error) && FMath::IsFinite(AnchorError) &&
                        !HeldProp->IsEnteringPerformance() &&
                        Finite(HeldProp->GetPropRootTransform(true).GetLocation()) &&
                        Finite(HeldProp->GetPropRootTransform(false).GetLocation());
                    CasePeakGrip = FMath::Max(CasePeakGrip, Error);
                    CasePeakAnchor = FMath::Max(CasePeakAnchor, AnchorError);
                }
                TestTrue(*FString::Printf(TEXT("Finite pose and shared clock: %s"), *Case), bPoseValid);
                if (CasePeakGrip > GlobalPeakGrip) { GlobalPeakGrip = CasePeakGrip; GlobalOffender = Case; }
                if (CasePeakGrip > FamilyPeakGrip) { FamilyPeakGrip = CasePeakGrip; FamilyOffender = Case; }
                GlobalPeakAnchor = FMath::Max(GlobalPeakAnchor, CasePeakAnchor);
                FamilyPeakAnchor = FMath::Max(FamilyPeakAnchor, CasePeakAnchor);
                TestTrue(*FString::Printf(TEXT("Grip within %.1f cm: %s (peak %.2f cm)"), GripToleranceCm, *Case, CasePeakGrip),
                    CasePeakGrip <= GripToleranceCm);
                TestTrue(*FString::Printf(TEXT("Prop root anchor within %.1f cm: %s (peak %.2f cm)"), GripToleranceCm, *Case, CasePeakAnchor),
                    CasePeakAnchor <= GripToleranceCm);
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
    TestEqual(TEXT("All 16 rigs by 41 families by two routines were sampled"), SampledProfiles, 16 * 41 * 2);
    return true;
}
#endif
