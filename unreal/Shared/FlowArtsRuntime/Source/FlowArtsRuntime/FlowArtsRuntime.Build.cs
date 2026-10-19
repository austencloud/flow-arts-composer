using UnrealBuildTool;

public class FlowArtsRuntime : ModuleRules
{
    public FlowArtsRuntime(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new[]
        {
            "Core", "CoreUObject", "Engine", "ProceduralMeshComponent", "UMG", "Niagara"
        });

        PrivateDependencyModuleNames.AddRange(new[]
        {
            "AnimationCore", "Json", "Slate", "SlateCore", "InputCore", "ApplicationCore"
        });
        if (Target.Platform == UnrealTargetPlatform.Win64)
        {
            PublicSystemLibraries.Add("bcrypt.lib");
        }
    }
}
