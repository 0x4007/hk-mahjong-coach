#include "MahjongVisualGameMode.h"

#include "MahjongCinematicPawn.h"
#include "MahjongPenthouseActor.h"
#include "Engine/Engine.h"

AMahjongVisualGameMode::AMahjongVisualGameMode()
{
    DefaultPawnClass = AMahjongCinematicPawn::StaticClass();
}

void AMahjongVisualGameMode::StartPlay()
{
    Super::StartPlay();

    if (GEngine)
    {
        GEngine->AddOnScreenDebugMessage(-1, 3.f, FColor::Cyan, TEXT("MahjongVisualGameMode::StartPlay"));
    }
    UE_LOG(LogTemp, Display, TEXT("MahjongVisualGameMode::StartPlay"));

    if (UWorld* World = GetWorld())
    {
        FActorSpawnParameters SpawnParameters;
        SpawnParameters.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
        AMahjongPenthouseActor* Spawned = World->SpawnActor<AMahjongPenthouseActor>(
            AMahjongPenthouseActor::StaticClass(),
            FVector::ZeroVector,
            FRotator::ZeroRotator,
            SpawnParameters
        );

        if (Spawned != nullptr)
        {
            UE_LOG(LogTemp, Display, TEXT("Spawned MahjongPenthouseActor at runtime"));
        }
        else
        {
            UE_LOG(LogTemp, Error, TEXT("Failed to spawn MahjongPenthouseActor"));
        }
    }
    else
    {
        UE_LOG(LogTemp, Error, TEXT("MahjongVisualGameMode has no UWorld"));
    }
}
