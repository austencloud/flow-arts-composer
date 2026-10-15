using UnrealBuildTool;
public class MuseumGameTarget : TargetRules
{
    public MuseumGameTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.V6;
        ExtraModuleNames.Add("MuseumGame");
    }
}
