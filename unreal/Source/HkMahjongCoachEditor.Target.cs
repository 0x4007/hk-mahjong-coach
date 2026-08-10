using UnrealBuildTool;

public class HkMahjongCoachEditorTarget : TargetRules
{
    public HkMahjongCoachEditorTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.V7;
        IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
        ExtraModuleNames.Add("HkMahjongCoach");
    }
}
