using UnrealBuildTool;

public class ComposerViewerTarget : TargetRules
{
    public ComposerViewerTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.V7;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_8;
        ExtraModuleNames.Add("ComposerViewer");
    }
}
