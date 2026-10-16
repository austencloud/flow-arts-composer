using UnrealBuildTool;
public class MuseumGameEditorTarget : TargetRules
{
    public MuseumGameEditorTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.V7;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_8;
        ExtraModuleNames.Add("MuseumGame");
    }
}
