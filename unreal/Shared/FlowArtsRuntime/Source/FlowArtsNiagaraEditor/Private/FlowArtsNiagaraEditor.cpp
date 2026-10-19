#include "Modules/ModuleManager.h"

#include "AssetRegistry/AssetRegistryModule.h"
#include "HAL/IConsoleManager.h"
#include "Misc/PackageName.h"
#include "Misc/App.h"
#include "NiagaraEditorUtilities.h"
#include "NiagaraGraph.h"
#include "EdGraph/EdGraphPin.h"
#include "NiagaraNodeFunctionCall.h"
#include "NiagaraScriptSource.h"
#include "ViewModels/Stack/NiagaraParameterHandle.h"
#include "ViewModels/Stack/NiagaraStackGraphUtilities.h"
#include "NiagaraEmitter.h"
#include "NiagaraEmitterHandle.h"
#include "NiagaraRibbonRendererProperties.h"
#include "NiagaraScript.h"
#include "NiagaraSpriteRendererProperties.h"
#include "NiagaraSystem.h"
#include "NiagaraSystemFactoryNew.h"
#include "Materials/MaterialInterface.h"
#include "UObject/Package.h"
#include "UObject/SavePackage.h"

namespace
{
constexpr TCHAR SystemPackage[] = TEXT("/FlowArtsRuntime/Effects/NS_PropFire");

void DumpTemplateInputs()
{
    const TCHAR* Paths[] = {
        TEXT("/Niagara/DefaultAssets/Templates/Emitters/Fountain.Fountain"),
        TEXT("/Niagara/DefaultAssets/Templates/Emitters/HangingParticulates.HangingParticulates"),
        TEXT("/Niagara/DefaultAssets/Templates/Emitters/LocationBasedRibbon.LocationBasedRibbon")
    };
    for (const TCHAR* Path : Paths)
    {
        UNiagaraEmitter* Emitter = LoadObject<UNiagaraEmitter>(nullptr, Path);
        if (!Emitter) continue;
        UE_LOG(LogTemp, Display, TEXT("Niagara template: %s"), Path);
        const FVersionedNiagaraEmitterData* Data = Emitter->GetEmitterData(Emitter->GetExposedVersion().VersionGuid);
        if (!Data) continue;
        TArray<UNiagaraScript*> Scripts;
        Data->GetScripts(Scripts);
        for (const UNiagaraScript* Script : Scripts)
        {
            if (!Script) continue;
            TArray<FNiagaraVariable> Variables;
            Script->RapidIterationParameters.GetParameters(Variables);
            for (const FNiagaraVariable& Variable : Variables)
                UE_LOG(LogTemp, Display, TEXT("  %s | %s"),
                    *Variable.GetName().ToString(), *Variable.GetType().GetName());
        }
    }
}

template<typename T>
bool SetInput(FVersionedNiagaraEmitterData& Data, const TCHAR* Suffix, const T& Value)
{
    TArray<UNiagaraScript*> Scripts;
    Data.GetScripts(Scripts);
    bool bMatched = false;
    for (UNiagaraScript* Script : Scripts)
    {
        if (!Script) continue;
        TArray<FNiagaraVariable> Variables;
        Script->RapidIterationParameters.GetParameters(Variables);
        for (const FNiagaraVariable& Variable : Variables)
        {
            if (!Variable.GetName().ToString().EndsWith(Suffix) ||
                Variable.GetType() != FNiagaraTypeDefinition::Get<T>() ||
                Variable.GetSizeInBytes() != sizeof(T)) continue;
            bMatched |= Script->RapidIterationParameters.SetParameterData(
                reinterpret_cast<const uint8*>(&Value), Variable);
        }
    }
    if (!bMatched)
    {
        UE_LOG(LogTemp, Error, TEXT("Niagara template has no expected input: %s"), Suffix);
    }
    return bMatched;
}

bool SetSpawnRate(FVersionedNiagaraEmitterData& Data, float Rate)
{
    UNiagaraScriptSource* Source = Cast<UNiagaraScriptSource>(Data.GraphSource);
    if (!Source || !Source->NodeGraph) return false;
    TArray<UNiagaraNodeFunctionCall*> Functions;
    Source->NodeGraph->GetNodesOfClass(Functions);
    for (UNiagaraNodeFunctionCall* Function : Functions)
    {
        if (!Function || !Function->GetFunctionName().StartsWith(TEXT("SpawnRate"))) continue;
        const FName AliasedInput(*(Function->GetFunctionName() + TEXT(".SpawnRate")));
        UEdGraphPin& Pin = FNiagaraStackGraphUtilities::GetOrCreateStackFunctionInputOverridePin(
            *Function, FNiagaraParameterHandle(AliasedInput), FNiagaraTypeDefinition::GetFloatDef(), FGuid(), FGuid());
        // Templates may drive rate with a dynamic input; this effect has a strict constant budget.
        Pin.BreakAllPinLinks();
        Pin.DefaultValue = FString::SanitizeFloat(Rate);
        Pin.GetOwningNode()->PinDefaultValueChanged(&Pin);
        Source->NodeGraph->NotifyGraphChanged();
        return true;
    }
    UE_LOG(LogTemp, Error, TEXT("Niagara fountain stack has no SpawnRate module"));
    return false;
}

bool TuneEmitter(FNiagaraEmitterHandle& Handle, int32 Kind, UMaterialInterface* Material)
{
    FVersionedNiagaraEmitterData* Data = Handle.GetEmitterData();
    if (!Data || !Material) return false;
    // Keep the flame core on its wick through pause and pose changes. Embers
    // and ribbons remain in world space to preserve their movement history.
    Data->bLocalSpace = Kind == 0;
    if (Kind == 2)
    {
        const FVersionedNiagaraEmitter Instance = Handle.GetInstance();
        const TArray<UNiagaraRendererProperties*> OldRenderers = Data->GetRenderers();
        for (UNiagaraRendererProperties* Renderer : OldRenderers)
            Instance.Emitter->RemoveRenderer(Renderer, Instance.Version);
        UNiagaraRibbonRendererProperties* Ribbon = NewObject<UNiagaraRibbonRendererProperties>(Instance.Emitter);
        Ribbon->Material = Material;
        // Constructor bindings use particle UniqueID order; no external location-event source is needed.
        Instance.Emitter->AddRenderer(Ribbon, Instance.Version);
    }
    int32 AssignedRenderers = 0;
    for (UNiagaraRendererProperties* Renderer : Data->GetRenderers())
    {
        if (auto* Sprite = Cast<UNiagaraSpriteRendererProperties>(Renderer))
        {
            Sprite->Material = Material;
            ++AssignedRenderers;
        }
        if (auto* Ribbon = Cast<UNiagaraRibbonRendererProperties>(Renderer))
        {
            Ribbon->Material = Material;
            ++AssignedRenderers;
        }
    }
    if (!AssignedRenderers) return false;

    const bool bTrail = Kind == 2;
    const bool bEmber = Kind == 1;
    bool bTuned = SetSpawnRate(*Data, bTrail ? 70.f : (bEmber ? 3.f : 18.f));
    bTuned &= SetInput(*Data, TEXT("InitializeParticle.Lifetime Min"), bTrail ? 0.22f : (bEmber ? 0.25f : 0.15f));
    bTuned &= SetInput(*Data, TEXT("InitializeParticle.Lifetime Max"), bTrail ? 0.22f : (bEmber ? 0.7f : 0.34f));
    bTuned &= SetInput(*Data, TEXT("InitializeParticle.Color"), FLinearColor::White);
    bTuned &= SetInput(*Data, TEXT("ShapeLocation.Sphere Radius"), bTrail ? 0.f : (bEmber ? 0.5f : 1.f));
    // The fountain cone is reduced from a ballistic jet to centimetre-scale wick buoyancy.
    bTuned &= SetInput(*Data, TEXT("AddVelocity.Cone Angle"), bEmber ? 24.f : 8.f);
    bTuned &= SetInput(*Data, TEXT("AddVelocity.Cone Axis"), FVector3f(0.f, 0.f, 1.f));
    bTuned &= SetInput(*Data, TEXT("AddVelocity.Velocity Speed Scale"), bTrail ? 0.f : 1.f);
    bTuned &= SetInput(*Data, TEXT("RandomRangeFloat.Minimum"), bTrail ? 0.f : (bEmber ? 12.f : 8.f));
    bTuned &= SetInput(*Data, TEXT("RandomRangeFloat.Maximum"), bTrail ? 0.f : (bEmber ? 28.f : 18.f));
    bTuned &= SetInput(*Data, TEXT("GravityForce.Gravity"), FVector3f(0.f, 0.f, bTrail ? 0.f : 12.f));
    bTuned &= SetInput(*Data, TEXT("Drag.Drag"), bTrail ? 0.f : 1.5f);
    if (bTrail)
    {
        bTuned &= SetInput(*Data, TEXT("InitializeParticle.Ribbon Width"), 2.f);
    }
    else
    {
        bTuned &= SetInput(*Data, TEXT("InitializeParticle.Uniform Sprite Size Min"), bEmber ? 0.6f : 3.8f);
        bTuned &= SetInput(*Data, TEXT("InitializeParticle.Uniform Sprite Size Max"), bEmber ? 1.4f : 6.5f);
    }
    return bTuned;
}
bool ValidateCompiledSystem(UNiagaraSystem& System)
{
    // IsValid permits pending compilation and scalability-disabled emitters. Authoring
    // requires every authored CPU emitter to have complete, successful executable data.
    if (System.HasOutstandingCompilationRequests(true) ||
        System.GetEmitterHandles().Num() != 3 ||
        System.GetEmitterCompiledData().Num() != System.GetEmitterHandles().Num())
    {
        UE_LOG(LogTemp, Error, TEXT("NS_PropFire compilation incomplete: Outstanding=%d Emitters=%d CompiledEmitters=%d"),
            System.HasOutstandingCompilationRequests(true), System.GetEmitterHandles().Num(), System.GetEmitterCompiledData().Num());
        return false;
    }
    auto ValidateScript = [](const UNiagaraScript* Script)
    {
        if (!Script)
        {
            UE_LOG(LogTemp, Error, TEXT("NS_PropFire has a missing executable script"));
            return false;
        }
        const ENiagaraScriptCompileStatus Status = Script->GetLastCompileStatus();
        const bool bCurrent = Status == ENiagaraScriptCompileStatus::NCS_UpToDate ||
            Status == ENiagaraScriptCompileStatus::NCS_UpToDateWithWarnings;
        if (!bCurrent || Script->IsScriptCompilationPending(false) || !Script->DidScriptCompilationSucceed(false))
        {
            UE_LOG(LogTemp, Error, TEXT("NS_PropFire script validation failed: %s Status=%d Pending=%d Succeeded=%d Error=%s"),
                *Script->GetPathName(), static_cast<int32>(Status), Script->IsScriptCompilationPending(false),
                Script->DidScriptCompilationSucceed(false), *Script->GetVMExecutableData().ErrorMsg);
            return false;
        }
        return true;
    };
    const UNiagaraScript* Spawn = System.GetSystemSpawnScript();
    const UNiagaraScript* Update = System.GetSystemUpdateScript();
    if (!ValidateScript(Spawn) || !ValidateScript(Update)) return false;
    if (Spawn->GetVMExecutableData().Attributes != Update->GetVMExecutableData().Attributes)
    {
        UE_LOG(LogTemp, Error, TEXT("NS_PropFire system spawn/update attributes disagree"));
        return false;
    }
    for (const FNiagaraEmitterHandle& Handle : System.GetEmitterHandles())
    {
        const FVersionedNiagaraEmitterData* Data = Handle.GetEmitterData();
        if (!Handle.GetIsEnabled() || !Data || Data->SimTarget != ENiagaraSimTarget::CPUSim ||
            !Data->IsValid() || !Data->IsReadyToRun())
        {
            UE_LOG(LogTemp, Error, TEXT("NS_PropFire emitter %s must be enabled, CPU simulated, valid and compilation complete"), *Handle.GetName().ToString());
            return false;
        }
        TArray<UNiagaraScript*> Scripts;
        Data->GetScripts(Scripts);
        for (const UNiagaraScript* Script : Scripts)
        {
            if (!ValidateScript(Script)) return false;
        }
    }
    return System.IsValid();
}

/** Run in an editor project with the plugin mounted: FlowArts.BuildNiagara */
void BuildPropFire()
{
    if (LoadObject<UNiagaraSystem>(nullptr, TEXT("/FlowArtsRuntime/Effects/NS_PropFire.NS_PropFire")))
    {
        UE_LOG(LogTemp, Display, TEXT("NS_PropFire already exists; delete it in the Content Browser before rebuilding"));
        return;
    }

    // Niagara's shipped editable emitters supply the native particle stacks.
    struct FTemplate { const TCHAR* Path; const TCHAR* Purpose; };
    const FTemplate Templates[] = {
        {TEXT("/Niagara/DefaultAssets/Templates/Emitters/Fountain.Fountain"), TEXT("wick flame core")},
        {TEXT("/Niagara/DefaultAssets/Templates/Emitters/Fountain.Fountain"), TEXT("embers")},
        {TEXT("/Niagara/DefaultAssets/Templates/Emitters/Fountain.Fountain"), TEXT("movement trail")},
    };
    TArray<UNiagaraEmitter*> Emitters;
    for (const FTemplate& Template : Templates)
    {
        UNiagaraEmitter* Emitter = LoadObject<UNiagaraEmitter>(nullptr, Template.Path);
        if (!Emitter)
        {
            UE_LOG(LogTemp, Error, TEXT("Missing Niagara %s template: %s"), Template.Purpose, Template.Path);
            return;
        }
        Emitters.Add(Emitter);
    }
    const TCHAR* MaterialPaths[] = {
        TEXT("/FlowArtsRuntime/Effects/Materials/M_NiagaraFlame.M_NiagaraFlame"),
        TEXT("/FlowArtsRuntime/Effects/Materials/M_NiagaraEmber.M_NiagaraEmber"),
        TEXT("/FlowArtsRuntime/Effects/Materials/M_NiagaraTrail.M_NiagaraTrail")
    };
    TArray<UMaterialInterface*> Materials;
    for (const TCHAR* Path : MaterialPaths)
    {
        UMaterialInterface* Material = LoadObject<UMaterialInterface>(nullptr, Path);
        if (!Material)
        {
            UE_LOG(LogTemp, Error, TEXT("Create Niagara material first: %s"), Path);
            return;
        }
        Materials.Add(Material);
    }

    UPackage* Package = CreatePackage(SystemPackage);
    UNiagaraSystem* System = NewObject<UNiagaraSystem>(Package, TEXT("NS_PropFire"),
        RF_Public | RF_Standalone | RF_Transactional);
    UNiagaraSystemFactoryNew::InitializeSystem(System, true);
    bool bTuned = true;
    for (int32 Index = 0; Index < Emitters.Num(); ++Index)
    {
        UNiagaraEmitter* Emitter = Emitters[Index];
        const FGuid Version = Emitter->GetExposedVersion().VersionGuid;
        FNiagaraEditorUtilities::AddEmitterToSystem(*System, *Emitter, Version, true);
        FNiagaraEmitterHandle& Handle = System->GetEmitterHandles().Last();
        const FName Names[] = {TEXT("WickFlame"), TEXT("WickEmbers"), TEXT("WickTrail")};
        Handle.SetName(Names[Index], *System);
        bTuned &= TuneEmitter(Handle, Index, Materials[Index]);
    }
    if (!bTuned)
    {
        UE_LOG(LogTemp, Error, TEXT("Niagara template tuning failed; NS_PropFire was not saved"));
        return;
    }
    System->RequestCompile(false);
    System->WaitForCompilationComplete();
    // Headless compilation proves executable data, not renderer/PSO readiness.
    if (!ValidateCompiledSystem(*System) || (FApp::CanEverRender() && !System->IsReadyToRun()))
    {
        UE_LOG(LogTemp, Error, TEXT("NS_PropFire failed Niagara compilation or has an invalid emitter; asset was not saved. See preceding Niagara compiler errors."));
        return;
    }
    Package->MarkPackageDirty();
    FAssetRegistryModule::AssetCreated(System);
    const FString Filename = FPackageName::LongPackageNameToFilename(
        SystemPackage, FPackageName::GetAssetPackageExtension());
    const bool bSaved = UPackage::SavePackage(Package, System, *Filename, FSavePackageArgs());
    if (bSaved)
    {
        UE_LOG(LogTemp, Display, TEXT("Flow Arts Niagara saved: %s (three compiled editable CPU emitters; %s)"),
            *Filename, FApp::CanEverRender() ? TEXT("RHI readiness passed") : TEXT("RHI runtime readiness unverified"));
    }
    else
    {
        UE_LOG(LogTemp, Error, TEXT("Flow Arts Niagara save failed: %s"), *Filename);
    }
}
}

class FFlowArtsNiagaraEditorModule final : public IModuleInterface
{
public:
    virtual void StartupModule() override
    {
        Command = IConsoleManager::Get().RegisterConsoleCommand(
            TEXT("FlowArts.BuildNiagara"),
            TEXT("Create the editable Flow Arts prop fire Niagara system from engine templates."),
            FConsoleCommandDelegate::CreateStatic(&BuildPropFire),
            ECVF_Default);
        DumpCommand = IConsoleManager::Get().RegisterConsoleCommand(
            TEXT("FlowArts.DumpNiagara"),
            TEXT("Dump the template emitter rapid iteration inputs for effect tuning."),
            FConsoleCommandDelegate::CreateStatic(&DumpTemplateInputs),
            ECVF_Default);
    }

    virtual void ShutdownModule() override
    {
        if (Command)
            IConsoleManager::Get().UnregisterConsoleObject(Command);
        if (DumpCommand)
            IConsoleManager::Get().UnregisterConsoleObject(DumpCommand);
    }

private:
    IConsoleObject* Command = nullptr;
    IConsoleObject* DumpCommand = nullptr;
};

IMPLEMENT_MODULE(FFlowArtsNiagaraEditorModule, FlowArtsNiagaraEditor)
