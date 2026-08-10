#include "MahjongCinematicPawn.h"

#include "Camera/CameraComponent.h"
#include "Components/SceneComponent.h"

AMahjongCinematicPawn::AMahjongCinematicPawn()
{
    PrimaryActorTick.bCanEverTick = false;
    AutoPossessPlayer = EAutoReceiveInput::Player0;

    SceneRoot = CreateDefaultSubobject<USceneComponent>(TEXT("SceneRoot"));
    RootComponent = SceneRoot;

    Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
    Camera->SetupAttachment(SceneRoot);
    Camera->SetRelativeLocation(FVector(610.0f, -690.0f, 360.0f));
    Camera->SetRelativeRotation((FVector(0.0f, 20.0f, 110.0f) - Camera->GetRelativeLocation()).Rotation());
    Camera->FieldOfView = 47.0f;
    Camera->bConstrainAspectRatio = false;
}
