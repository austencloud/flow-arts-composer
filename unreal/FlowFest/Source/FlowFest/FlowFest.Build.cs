using UnrealBuildTool;
public class FlowFest : ModuleRules
{
    public FlowFest(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new[] { "Core", "CoreUObject", "Engine", "AnimationCore", "InputCore", "ProceduralMeshComponent", "Json", "JsonUtilities", "AssetRegistry", "Slate", "SlateCore" });
    }
}
