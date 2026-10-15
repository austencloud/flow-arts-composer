using UnrealBuildTool;

public class FlowArtsRuntime : ModuleRules
{
    public FlowArtsRuntime(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new[]
        {
            "Core", "CoreUObject", "Engine", "ProceduralMeshComponent"
        });

        PrivateDependencyModuleNames.AddRange(new[]
        {
            "AnimationCore", "Json"
        });
    }
}
