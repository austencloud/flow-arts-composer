using UnrealBuildTool;
public class FlowFest : ModuleRules
{
    public FlowFest(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new[] { "Core", "CoreUObject", "Engine", "FlowArtsRuntime", "AnimationCore", "InputCore", "ProceduralMeshComponent", "Json", "JsonUtilities", "AssetRegistry", "Slate", "SlateCore", "DynamicWind" });
        // DynamicWindSubsystem.h includes the plugin's Internal log header, which only engine modules see by default.
        PrivateIncludePaths.Add(System.IO.Path.Combine(EngineDirectory, "Plugins", "Experimental", "DynamicWind", "Source", "DynamicWind", "Internal"));
    }
}
