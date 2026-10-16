using UnrealBuildTool;

public class ComposerViewer : ModuleRules
{
    public ComposerViewer(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new[] {
            "Core", "CoreUObject", "Engine", "Json", "FlowArtsRuntime",
            "PixelStreaming2", "PixelStreaming2Core", "PixelStreaming2Input"
        });
    }
}
