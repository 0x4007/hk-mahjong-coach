#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"

#include "MahjongVisualGameMode.generated.h"

UCLASS()
class HKMAHJONGCOACH_API AMahjongVisualGameMode : public AGameModeBase
{
    GENERATED_BODY()

public:
    AMahjongVisualGameMode();

protected:
    virtual void StartPlay() override;
};
