using UnrealBuildTool;
public class MuseumGameTarget : TargetRules
{
    public MuseumGameTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.V7;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_8;
        ExtraModuleNames.Add("MuseumGame");
    }
}
