using UnrealBuildTool;

public class HkMahjongCoachTarget : TargetRules
{
    public HkMahjongCoachTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.V7;
        IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
        ExtraModuleNames.Add("HkMahjongCoach");
    }
}
