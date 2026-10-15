using UnrealBuildTool;
public class MuseumGameEditorTarget : TargetRules
{
    public MuseumGameEditorTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.V6;
        ExtraModuleNames.Add("MuseumGame");
    }
}
