#include "MahjongPenthouseActor.h"

#include "Components/BoxReflectionCaptureComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/PostProcessComponent.h"
#include "Components/RectLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

namespace MahjongVisual
{
    const FLinearColor ArchitecturalWhite(0.86f, 0.89f, 0.88f, 1.0f);
    const FLinearColor StructuralGray(0.38f, 0.45f, 0.47f, 1.0f);
    const FLinearColor Charcoal(0.035f, 0.055f, 0.065f, 1.0f);
    const FLinearColor TileIvory(0.90f, 0.85f, 0.72f, 1.0f);
    const FLinearColor AccentRed(0.86f, 0.035f, 0.02f, 1.0f);
    const FLinearColor AccentCyan(0.02f, 0.72f, 0.82f, 1.0f);
    const FLinearColor SkylineMid(0.12f, 0.18f, 0.21f, 1.0f);
    const FLinearColor SkylineLight(0.30f, 0.38f, 0.40f, 1.0f);
}

AMahjongPenthouseActor::AMahjongPenthouseActor()
{
    PrimaryActorTick.bCanEverTick = false;

    SceneRoot = CreateDefaultSubobject<USceneComponent>(TEXT("PenthouseRoot"));
    SceneRoot->SetMobility(EComponentMobility::Static);
    RootComponent = SceneRoot;

    static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeAsset(
        TEXT("/Engine/BasicShapes/Cube.Cube")
    );
    if (CubeAsset.Succeeded())
    {
        CubeMesh = CubeAsset.Object;
    }

    static ConstructorHelpers::FObjectFinder<UStaticMesh> CylinderAsset(
        TEXT("/Engine/BasicShapes/Cylinder.Cylinder")
    );
    if (CylinderAsset.Succeeded())
    {
        CylinderMesh = CylinderAsset.Object;
    }

    static ConstructorHelpers::FObjectFinder<UMaterialInterface> MaterialAsset(
        TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial")
    );
    if (MaterialAsset.Succeeded())
    {
        BaseMaterial = MaterialAsset.Object;
    }
}

void AMahjongPenthouseActor::BeginPlay()
{
    Super::BeginPlay();
    BuildPenthouse();
    BuildTable();
    BuildSkyline();
    BuildLighting();
}

UMaterialInstanceDynamic* AMahjongPenthouseActor::MakeMaterial(
    const FLinearColor& Color,
    const float Roughness,
    const float Metallic,
    const float Emissive
)
{
    if (BaseMaterial == nullptr)
    {
        return nullptr;
    }

    const FString Key = FString::Printf(
        TEXT("%0.3f:%0.3f:%0.3f:%0.3f:%0.3f:%0.3f"),
        Color.R,
        Color.G,
        Color.B,
        Roughness,
        Metallic,
        Emissive
    );
    if (TObjectPtr<UMaterialInstanceDynamic>* Existing = MaterialCache.Find(Key))
    {
        return Existing->Get();
    }

    UMaterialInstanceDynamic* Material = UMaterialInstanceDynamic::Create(BaseMaterial, this);
    if (Material == nullptr)
    {
        return nullptr;
    }

    // BasicShapeMaterial has used both Color and BaseColor across UE5 releases.
    // Setting both keeps this procedural fixture portable between 5.4 and 5.6.
    Material->SetVectorParameterValue(TEXT("Color"), Color);
    Material->SetVectorParameterValue(TEXT("BaseColor"), Color);
    Material->SetScalarParameterValue(TEXT("Roughness"), Roughness);
    Material->SetScalarParameterValue(TEXT("Metallic"), Metallic);
    Material->SetVectorParameterValue(TEXT("EmissiveColor"), Color * Emissive);
    Material->SetScalarParameterValue(TEXT("EmissiveStrength"), Emissive);

    Materials.Add(Material);
    MaterialCache.Add(Key, Material);
    return Material;
}

UStaticMeshComponent* AMahjongPenthouseActor::AddBox(
    const FVector& Location,
    const FVector& Dimensions,
    const FLinearColor& Color,
    const float Roughness,
    const float Metallic,
    const float Emissive
)
{
    if (CubeMesh == nullptr)
    {
        return nullptr;
    }

    UStaticMeshComponent* Component = NewObject<UStaticMeshComponent>(this);
    Component->SetStaticMesh(CubeMesh);
    Component->SetRelativeLocation(Location);
    Component->SetRelativeScale3D(Dimensions / 100.0f);
    Component->SetMobility(EComponentMobility::Static);
    Component->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Component->SetCastShadow(Emissive < 0.01f);
    if (UMaterialInstanceDynamic* Material = MakeMaterial(Color, Roughness, Metallic, Emissive))
    {
        Component->SetMaterial(0, Material);
    }
    Component->AttachToComponent(SceneRoot, FAttachmentTransformRules::KeepRelativeTransform);
    Component->RegisterComponent();
    Geometry.Add(Component);
    return Component;
}

UStaticMeshComponent* AMahjongPenthouseActor::AddCylinder(
    const FVector& Location,
    const float Radius,
    const float Height,
    const FLinearColor& Color,
    const float Roughness,
    const float Metallic,
    const float Emissive
)
{
    if (CylinderMesh == nullptr)
    {
        return nullptr;
    }

    UStaticMeshComponent* Component = NewObject<UStaticMeshComponent>(this);
    Component->SetStaticMesh(CylinderMesh);
    Component->SetRelativeLocation(Location);
    Component->SetRelativeScale3D(FVector(Radius / 50.0f, Radius / 50.0f, Height / 100.0f));
    Component->SetMobility(EComponentMobility::Static);
    Component->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Component->SetCastShadow(Emissive < 0.01f);
    if (UMaterialInstanceDynamic* Material = MakeMaterial(Color, Roughness, Metallic, Emissive))
    {
        Component->SetMaterial(0, Material);
    }
    Component->AttachToComponent(SceneRoot, FAttachmentTransformRules::KeepRelativeTransform);
    Component->RegisterComponent();
    Geometry.Add(Component);
    return Component;
}

void AMahjongPenthouseActor::BuildPenthouse()
{
    const FLinearColor WindowFrame(0.05f, 0.09f, 0.11f, 1.0f);
    const FLinearColor WarmWhite(0.74f, 0.79f, 0.76f, 1.0f);

    AddBox(FVector(0.0f, 0.0f, -18.0f), FVector(2800.0f, 2400.0f, 36.0f), MahjongVisual::Charcoal, 0.38f, 0.15f);
    AddBox(FVector(-1380.0f, 0.0f, 610.0f), FVector(40.0f, 2400.0f, 1240.0f), MahjongVisual::ArchitecturalWhite, 0.74f);
    AddBox(FVector(1380.0f, 0.0f, 610.0f), FVector(40.0f, 2400.0f, 1240.0f), MahjongVisual::ArchitecturalWhite, 0.74f);
    AddBox(FVector(0.0f, 1080.0f, 1240.0f), FVector(2800.0f, 40.0f, 40.0f), MahjongVisual::ArchitecturalWhite, 0.74f);
    AddBox(FVector(0.0f, -1080.0f, 1240.0f), FVector(2800.0f, 40.0f, 40.0f), WarmWhite, 0.74f);

    // Mullions keep the skyline legible while giving the room a designed scale.
    for (int32 Index = -3; Index <= 3; ++Index)
    {
        AddBox(FVector(Index * 390.0f, 1040.0f, 620.0f), FVector(16.0f, 28.0f, 1200.0f), WindowFrame, 0.28f, 0.62f);
    }
    AddBox(FVector(0.0f, 1035.0f, 1030.0f), FVector(2800.0f, 28.0f, 16.0f), MahjongVisual::AccentCyan, 0.24f, 0.2f, 3.0f);
    AddBox(FVector(0.0f, 1035.0f, 180.0f), FVector(2800.0f, 28.0f, 10.0f), MahjongVisual::AccentCyan, 0.28f, 0.2f, 1.6f);

    // Architectural red is used as a single directional gesture.
    AddBox(FVector(-1130.0f, -600.0f, 540.0f), FVector(20.0f, 780.0f, 1080.0f), MahjongVisual::AccentRed, 0.28f, 0.1f, 1.2f);
    AddBox(FVector(-1130.0f, -195.0f, 1085.0f), FVector(220.0f, 24.0f, 24.0f), MahjongVisual::AccentRed, 0.26f, 0.1f, 1.5f);

    // A restrained teacher panel reserves negative space for future UI.
    AddBox(FVector(-850.0f, 700.0f, 580.0f), FVector(360.0f, 16.0f, 520.0f), WindowFrame, 0.32f, 0.2f);
    AddBox(FVector(-850.0f, 688.0f, 580.0f), FVector(320.0f, 8.0f, 480.0f), MahjongVisual::AccentCyan, 0.3f, 0.1f, 0.7f);

    // Low furniture silhouettes frame the table without competing with it.
    AddBox(FVector(-940.0f, 300.0f, 150.0f), FVector(420.0f, 300.0f, 300.0f), MahjongVisual::StructuralGray, 0.78f);
    AddBox(FVector(920.0f, 270.0f, 130.0f), FVector(520.0f, 260.0f, 260.0f), MahjongVisual::StructuralGray, 0.82f);
    AddBox(FVector(930.0f, 270.0f, 280.0f), FVector(420.0f, 220.0f, 16.0f), MahjongVisual::AccentRed, 0.4f, 0.05f);
    AddCylinder(FVector(1030.0f, -380.0f, 380.0f), 35.0f, 760.0f, WindowFrame, 0.42f, 0.72f);
    AddBox(FVector(1030.0f, -380.0f, 770.0f), FVector(180.0f, 180.0f, 20.0f), MahjongVisual::AccentCyan, 0.3f, 0.25f, 0.65f);
}

void AMahjongPenthouseActor::BuildTable()
{
    AddBox(FVector(0.0f, -40.0f, 88.0f), FVector(202.0f, 202.0f, 18.0f), MahjongVisual::Charcoal, 0.3f, 0.25f);
    AddBox(FVector(0.0f, -40.0f, 101.0f), FVector(168.0f, 168.0f, 8.0f), FLinearColor(0.09f, 0.22f, 0.22f, 1.0f), 0.28f, 0.15f);
    AddBox(FVector(0.0f, -40.0f, 106.0f), FVector(148.0f, 148.0f, 3.0f), MahjongVisual::AccentCyan, 0.23f, 0.15f, 0.4f);
    AddBox(FVector(0.0f, -40.0f, 109.0f), FVector(136.0f, 136.0f, 3.0f), FLinearColor(0.035f, 0.08f, 0.09f, 1.0f), 0.5f);

    for (const float X : {-72.0f, 72.0f})
    {
        for (const float Y : {-112.0f, 32.0f})
        {
            AddBox(FVector(X, Y, 42.0f), FVector(24.0f, 24.0f, 82.0f), MahjongVisual::StructuralGray, 0.42f, 0.55f);
        }
    }

    const FLinearColor TileFace = MahjongVisual::TileIvory;
    const FLinearColor TileBack(0.03f, 0.12f, 0.14f, 1.0f);
    for (int32 Index = 0; Index < 13; ++Index)
    {
        const float X = -72.0f + Index * 12.0f;
        AddBox(FVector(X, -153.0f, 122.0f), FVector(9.0f, 24.0f, 34.0f), TileFace, 0.28f);
        AddBox(FVector(X, -165.7f, 130.0f), FVector(5.0f, 1.3f, 22.0f),
            Index % 3 == 0 ? MahjongVisual::AccentRed : MahjongVisual::AccentCyan,
            0.24f,
            0.05f,
            0.3f
        );
    }
    for (int32 Index = 0; Index < 18; ++Index)
    {
        const float X = -101.0f + Index * 12.0f;
        AddBox(FVector(X, 55.0f, 123.0f), FVector(9.0f, 24.0f, 34.0f), TileBack, 0.34f);
    }
    for (int32 Index = 0; Index < 12; ++Index)
    {
        const float Y = -103.0f + Index * 12.0f;
        AddBox(FVector(-106.0f, Y, 122.0f), FVector(24.0f, 9.0f, 34.0f), TileFace, 0.3f);
        AddBox(FVector(106.0f, Y, 122.0f), FVector(24.0f, 9.0f, 34.0f), TileBack, 0.34f);
    }

    // Four quiet cyan station marks establish the future hand/discard anchors.
    AddBox(FVector(0.0f, -136.0f, 111.0f), FVector(74.0f, 3.0f, 3.0f), MahjongVisual::AccentCyan, 0.26f, 0.1f, 0.45f);
    AddBox(FVector(0.0f, 56.0f, 111.0f), FVector(74.0f, 3.0f, 3.0f), MahjongVisual::AccentCyan, 0.26f, 0.1f, 0.45f);
    AddBox(FVector(-96.0f, -40.0f, 111.0f), FVector(3.0f, 74.0f, 3.0f), MahjongVisual::AccentCyan, 0.26f, 0.1f, 0.45f);
    AddBox(FVector(96.0f, -40.0f, 111.0f), FVector(3.0f, 74.0f, 3.0f), MahjongVisual::AccentCyan, 0.26f, 0.1f, 0.45f);
}

void AMahjongPenthouseActor::BuildSkyline()
{
    struct FBuilding
    {
        float X;
        float Y;
        float Width;
        float Depth;
        float Height;
        FLinearColor Color;
    };

    const TArray<FBuilding> Buildings = {
        {-1060.0f, 820.0f, 170.0f, 150.0f, 520.0f, MahjongVisual::SkylineMid},
        {-850.0f, 790.0f, 130.0f, 120.0f, 760.0f, MahjongVisual::SkylineLight},
        {-640.0f, 830.0f, 220.0f, 180.0f, 420.0f, MahjongVisual::SkylineMid},
        {-390.0f, 760.0f, 155.0f, 140.0f, 650.0f, MahjongVisual::SkylineLight},
        {20.0f, 810.0f, 240.0f, 190.0f, 470.0f, MahjongVisual::SkylineMid},
        {420.0f, 780.0f, 180.0f, 150.0f, 700.0f, MahjongVisual::SkylineLight},
        {700.0f, 835.0f, 250.0f, 200.0f, 390.0f, MahjongVisual::SkylineMid},
        {1030.0f, 790.0f, 160.0f, 140.0f, 580.0f, MahjongVisual::SkylineLight}
    };

    for (const FBuilding& Building : Buildings)
    {
        AddBox(
            FVector(Building.X, Building.Y, Building.Height * 0.5f),
            FVector(Building.Width, Building.Depth, Building.Height),
            Building.Color,
            0.86f
        );
        AddBox(
            FVector(Building.X, Building.Y - Building.Depth * 0.51f, Building.Height * 0.62f),
            FVector(Building.Width * 0.76f, 5.0f, 4.0f),
            MahjongVisual::AccentCyan,
            0.3f,
            0.1f,
            0.25f
        );
    }

    // Midtown landmark: stepped tower, observation crown, and a thin spire.
    AddBox(FVector(220.0f, 700.0f, 330.0f), FVector(130.0f, 120.0f, 660.0f), MahjongVisual::SkylineLight, 0.7f);
    AddBox(FVector(220.0f, 700.0f, 700.0f), FVector(96.0f, 94.0f, 80.0f), MahjongVisual::SkylineLight, 0.68f);
    AddBox(FVector(220.0f, 700.0f, 780.0f), FVector(64.0f, 64.0f, 80.0f), MahjongVisual::SkylineLight, 0.65f);
    AddCylinder(FVector(220.0f, 700.0f, 940.0f), 7.0f, 300.0f, MahjongVisual::AccentCyan, 0.24f, 0.35f, 0.9f);

    for (int32 Index = 0; Index < 8; ++Index)
    {
        AddBox(
            FVector(-1120.0f + Index * 310.0f, 665.0f, 115.0f),
            FVector(190.0f, 20.0f, 4.0f),
            MahjongVisual::AccentCyan,
            0.26f,
            0.1f,
            0.18f
        );
    }
}

void AMahjongPenthouseActor::BuildLighting()
{
    SunLight = NewObject<UDirectionalLightComponent>(this, TEXT("SunLight"));
    SunLight->AttachToComponent(SceneRoot, FAttachmentTransformRules::KeepRelativeTransform);
    SunLight->SetRelativeRotation(FRotator(-38.0f, -28.0f, 0.0f));
    SunLight->Intensity = 7.5f;
    SunLight->LightColor = FColor(255, 238, 215);
    SunLight->bUseTemperature = true;
    SunLight->Temperature = 5100.0f;
    SunLight->ShadowResolutionScale = 2.0f;
    SunLight->SetMobility(EComponentMobility::Movable);
    SunLight->RegisterComponent();

    SkyLight = NewObject<USkyLightComponent>(this, TEXT("SkyLight"));
    SkyLight->AttachToComponent(SceneRoot, FAttachmentTransformRules::KeepRelativeTransform);
    SkyLight->Intensity = 0.8f;
    SkyLight->LightColor = FColor(180, 220, 235);
    SkyLight->SetMobility(EComponentMobility::Movable);
    SkyLight->RegisterComponent();
    SkyLight->RecaptureSky();

    Fog = NewObject<UExponentialHeightFogComponent>(this, TEXT("CityHaze"));
    Fog->AttachToComponent(SceneRoot, FAttachmentTransformRules::KeepRelativeTransform);
    Fog->FogDensity = 0.0025f;
    Fog->FogHeightFalloff = 0.32f;
    Fog->SetFogInscatteringColor(FLinearColor(174.0f / 255.0f, 203.0f / 255.0f, 207.0f / 255.0f));
    Fog->DirectionalInscatteringExponent = 2.0f;
    Fog->DirectionalInscatteringStartDistance = 500.0f;
    Fog->SetMobility(EComponentMobility::Movable);
    Fog->RegisterComponent();

    for (const FVector& Location : {FVector(-700.0f, 340.0f, 900.0f), FVector(760.0f, 260.0f, 760.0f)})
    {
        URectLightComponent* Area = NewObject<URectLightComponent>(this);
        Area->AttachToComponent(SceneRoot, FAttachmentTransformRules::KeepRelativeTransform);
        Area->SetRelativeLocation(Location);
        Area->SetRelativeRotation((FVector(0.0f, 0.0f, 100.0f) - Location).Rotation());
        Area->SetMobility(EComponentMobility::Movable);
        Area->Intensity = 4200.0f;
        Area->LightColor = FColor(205, 239, 246);
        Area->SourceWidth = 520.0f;
        Area->SourceHeight = 350.0f;
        Area->AttenuationRadius = 1800.0f;
        Area->RegisterComponent();
        AreaLights.Add(Area);
    }

    PostProcess = NewObject<UPostProcessComponent>(this, TEXT("CinematicPostProcess"));
    PostProcess->AttachToComponent(SceneRoot, FAttachmentTransformRules::KeepRelativeTransform);
    PostProcess->bUnbound = true;
    PostProcess->Priority = 10.0f;
    PostProcess->Settings.bOverride_BloomIntensity = true;
    PostProcess->Settings.BloomIntensity = 0.18f;
    PostProcess->Settings.bOverride_VignetteIntensity = true;
    PostProcess->Settings.VignetteIntensity = 0.18f;
    PostProcess->Settings.bOverride_SceneFringeIntensity = true;
    PostProcess->Settings.SceneFringeIntensity = 0.15f;
    PostProcess->Settings.bOverride_ColorSaturation = true;
    PostProcess->Settings.ColorSaturation = FVector4(1.04f, 1.04f, 1.04f, 1.0f);
    PostProcess->Settings.bOverride_ColorContrast = true;
    PostProcess->Settings.ColorContrast = FVector4(1.06f, 1.06f, 1.06f, 1.0f);
    PostProcess->RegisterComponent();

    ReflectionCapture = NewObject<UBoxReflectionCaptureComponent>(this, TEXT("PenthouseReflection"));
    ReflectionCapture->AttachToComponent(SceneRoot, FAttachmentTransformRules::KeepRelativeTransform);
    ReflectionCapture->SetRelativeLocation(FVector(0.0f, 80.0f, 480.0f));
    ReflectionCapture->BoxTransitionDistance = 220.0f;
    ReflectionCapture->RegisterComponent();
}
