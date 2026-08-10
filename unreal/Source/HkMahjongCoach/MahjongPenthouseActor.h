#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"

#include "MahjongPenthouseActor.generated.h"

class UBoxReflectionCaptureComponent;
class UDirectionalLightComponent;
class UExponentialHeightFogComponent;
class UMaterialInstanceDynamic;
class UMaterialInterface;
class UPostProcessComponent;
class URectLightComponent;
class USkyLightComponent;
class UStaticMesh;
class UStaticMeshComponent;
class USceneComponent;

UCLASS()
class HKMAHJONGCOACH_API AMahjongPenthouseActor : public AActor
{
    GENERATED_BODY()

public:
    AMahjongPenthouseActor();

protected:
    virtual void BeginPlay() override;

private:
    UPROPERTY(VisibleAnywhere, Category = "Presentation")
    TObjectPtr<USceneComponent> SceneRoot;

    UPROPERTY(Transient)
    TObjectPtr<UStaticMesh> CubeMesh;

    UPROPERTY(Transient)
    TObjectPtr<UStaticMesh> CylinderMesh;

    UPROPERTY(Transient)
    TObjectPtr<UMaterialInterface> BaseMaterial;

    UPROPERTY(Transient)
    TArray<TObjectPtr<UStaticMeshComponent>> Geometry;

    UPROPERTY(Transient)
    TArray<TObjectPtr<UMaterialInstanceDynamic>> Materials;

    UPROPERTY(Transient)
    TObjectPtr<UDirectionalLightComponent> SunLight;

    UPROPERTY(Transient)
    TObjectPtr<USkyLightComponent> SkyLight;

    UPROPERTY(Transient)
    TObjectPtr<UExponentialHeightFogComponent> Fog;

    UPROPERTY(Transient)
    TObjectPtr<UPostProcessComponent> PostProcess;

    UPROPERTY(Transient)
    TObjectPtr<UBoxReflectionCaptureComponent> ReflectionCapture;

    UPROPERTY(Transient)
    TArray<TObjectPtr<URectLightComponent>> AreaLights;

    UPROPERTY(Transient)
    TMap<FString, TObjectPtr<UMaterialInstanceDynamic>> MaterialCache;

    UMaterialInstanceDynamic* MakeMaterial(
        const FLinearColor& Color,
        float Roughness,
        float Metallic = 0.0f,
        float Emissive = 0.0f
    );

    UStaticMeshComponent* AddBox(
        const FVector& Location,
        const FVector& Dimensions,
        const FLinearColor& Color,
        float Roughness = 0.55f,
        float Metallic = 0.0f,
        float Emissive = 0.0f
    );

    UStaticMeshComponent* AddCylinder(
        const FVector& Location,
        float Radius,
        float Height,
        const FLinearColor& Color,
        float Roughness = 0.55f,
        float Metallic = 0.0f,
        float Emissive = 0.0f
    );

    void BuildPenthouse();
    void BuildTable();
    void BuildSkyline();
    void BuildLighting();
};
