using UnrealBuildTool;

public class FlowArtsNiagaraEditor : ModuleRules
{
    public FlowArtsNiagaraEditor(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PrivateDependencyModuleNames.AddRange(new[]
        {
            "Core", "CoreUObject", "Engine", "Niagara", "NiagaraEditor", "UnrealEd", "AssetRegistry"
        });
    }
}
