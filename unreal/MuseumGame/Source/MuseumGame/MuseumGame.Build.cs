using UnrealBuildTool;
public class MuseumGame : ModuleRules
{
    public MuseumGame(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new[] { "Core", "CoreUObject", "Engine", "InputCore", "Json", "JsonUtilities", "Slate", "SlateCore", "FlowArtsRuntime" });
    }
}
