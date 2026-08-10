#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"

#include "MahjongCinematicPawn.generated.h"

class UCameraComponent;
class USceneComponent;

UCLASS()
class HKMAHJONGCOACH_API AMahjongCinematicPawn : public APawn
{
    GENERATED_BODY()

public:
    AMahjongCinematicPawn();

private:
    UPROPERTY(VisibleAnywhere, Category = "Presentation")
    TObjectPtr<USceneComponent> SceneRoot;

    UPROPERTY(VisibleAnywhere, Category = "Presentation")
    TObjectPtr<UCameraComponent> Camera;
};
