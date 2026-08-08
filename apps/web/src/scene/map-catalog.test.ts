import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_VISUAL_MAP_ID,
  getVisualMapDefinition,
  normalizeVisualMapId,
  VISUAL_MAP_CATALOG,
} from "./map-catalog.js";
import {
  createDebuggingTwoMap,
  createWarehouseFog,
  DEBUGGING_TWO_BOX_CELL_PITCH,
  DEBUGGING_TWO_BOX_SIZE,
  DEBUGGING_TWO_BOX_GAP,
  DEBUGGING_TWO_BOX_STACK_PITCH,
  DEBUGGING_TWO_RACK_BLINKING_ENABLED,
  DEBUGGING_TWO_RACK_LED_BARS_PER_RACK,
  DEBUGGING_TWO_RACK_LED_BAR_DEPTH,
  DEBUGGING_TWO_RACK_LED_BAR_HEIGHT,
  DEBUGGING_TWO_RACK_LED_BAR_WIDTH,
  DEBUGGING_TWO_WORLD_BOUNDS,
} from "./debugging-two-map.js";
import { generateWeaponPickupsOnEdges, WEAPON_IDS } from "./weapons.js";

describe("visual map catalog", () => {
  it("names the current authored map Debugging 01", () => {
    expect(DEFAULT_VISUAL_MAP_ID).toBe("debugging-01");
    expect(getVisualMapDefinition(DEFAULT_VISUAL_MAP_ID).label).toBe("Debugging 01");
  });

  it("contains selectable, uniquely identified map definitions", () => {
    const ids = VISUAL_MAP_CATALOG.map((map) => map.id);
    expect(ids).toEqual(["debugging-01", "debugging-02"]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(VISUAL_MAP_CATALOG.every((map) => map.description.length > 0)).toBe(true);
    expect(getVisualMapDefinition("debugging-01").generation).toBe("authored");
    expect(getVisualMapDefinition("debugging-02").generation).toBe("procedural");
    expect(getVisualMapDefinition("debugging-02").label).toBe("Warehouse");
    expect(getVisualMapDefinition("debugging-02").description).toBe("Industrial warehouse");
    expect(getVisualMapDefinition("debugging-02").document).toBeUndefined();
  });

  it("falls back to Debugging 01 for an unknown query value", () => {
    expect(normalizeVisualMapId("DEBUGGING-02")).toBe("debugging-02");
    expect(normalizeVisualMapId("unknown-map")).toBe(DEFAULT_VISUAL_MAP_ID);
    expect(normalizeVisualMapId(null)).toBe(DEFAULT_VISUAL_MAP_ID);
  });

  it("places one copy of every weapon at equal intervals around the Warehouse edges", () => {
    const pickups = generateWeaponPickupsOnEdges("debugging-02-test", DEBUGGING_TWO_WORLD_BOUNDS);
    expect(pickups).toHaveLength(WEAPON_IDS.length);
    expect(pickups.map((pickup) => pickup.weapon)).toEqual([...WEAPON_IDS]);
    expect(pickups.filter((pickup) => pickup.starter === true)).toHaveLength(1);

    const edgeMargin = 4;
    const minX = DEBUGGING_TWO_WORLD_BOUNDS.minX + edgeMargin;
    const maxX = DEBUGGING_TWO_WORLD_BOUNDS.maxX - edgeMargin;
    const minZ = DEBUGGING_TWO_WORLD_BOUNDS.minZ + edgeMargin;
    const maxZ = DEBUGGING_TWO_WORLD_BOUNDS.maxZ - edgeMargin;
    const width = maxX - minX;
    const depth = maxZ - minZ;
    const perimeter = 2 * (width + depth);
    const distances = pickups
      .map(({ position: [x, , z] }) => {
        if (Math.abs(z - minZ) < 0.0001) {
          return x - minX;
        }
        if (Math.abs(x - maxX) < 0.0001) {
          return width + z - minZ;
        }
        if (Math.abs(z - maxZ) < 0.0001) {
          return width + depth + maxX - x;
        }
        return width * 2 + depth + maxZ - z;
      })
      .sort((left, right) => left - right);
    const expectedSpacing = perimeter / WEAPON_IDS.length;
    for (let index = 1; index < distances.length; index += 1) {
      expect((distances[index] ?? 0) - (distances[index - 1] ?? 0)).toBeCloseTo(expectedSpacing, 8);
    }
    expect((distances[0] ?? 0) + perimeter - (distances[distances.length - 1] ?? 0)).toBeCloseTo(
      expectedSpacing,
      8,
    );
  });

  it("generates deterministic supported data-center racks with matching physics", () => {
    const firstScene = new THREE.Scene();
    const secondScene = new THREE.Scene();
    const first = createDebuggingTwoMap(firstScene, "warehouse-seed");
    const second = createDebuggingTwoMap(secondScene, "warehouse-seed");
    const rackRoot = first.root.getObjectByName("DebuggingTwoDataCenterRacks");
    const rackBodyMesh = rackRoot?.getObjectByName("DataCenterRackBodies");
    const industrialLighting = firstScene.getObjectByName("DebuggingTwoIndustrialLighting");
    const lights: THREE.Light[] = [];
    industrialLighting?.traverse((object) => {
      if (object instanceof THREE.Light) {
        lights.push(object);
      }
    });

    expect(first.variant).toBe("Ice-blue data center");
    expect(first.physicsBoxes.length).toBeGreaterThan(50);
    expect(first.physicsBoxes).toEqual(second.physicsBoxes);
    expect(first.root.userData.generation).toBe("warehouse-data-center-v1");
    expect(first.root.userData.physicsGeneration).toBe("warehouse-supported-piles-v5");
    expect(first.root.userData.boxSizeMeters).toBe(DEBUGGING_TWO_BOX_SIZE);
    expect(first.root.userData.boxGapMeters).toBe(DEBUGGING_TWO_BOX_GAP);
    expect(first.root.userData.boxCount).toBeGreaterThan(300);
    expect(first.root.userData.wallCount).toBeGreaterThanOrEqual(2);
    expect(first.root.userData.wallCrateCount).toBeGreaterThan(60);
    const warehouseStructure = first.root.getObjectByName("DebuggingTwoWarehouseStructure");
    expect(warehouseStructure?.userData.bakedAreaLighting).toBe(true);
    expect(warehouseStructure?.userData.generation).toBe("warehouse-wall-area-bake-v2-dim-bottom");
    const bakedWalls = warehouseStructure?.children.filter(
      (child) => child.userData.warehouseWall === true,
    );
    expect(bakedWalls).toHaveLength(4);
    expect(first.textures).toHaveLength(5);
    expect(first.textures.every((texture) => texture instanceof THREE.DataTexture)).toBe(true);
    expect(first.textures.map((texture) => texture.name)).toEqual([
      "WarehouseFloorLightMap:center",
      "WarehouseWallLightMap:north",
      "WarehouseWallLightMap:south",
      "WarehouseWallLightMap:east",
      "WarehouseWallLightMap:west",
    ]);
    expect(first.textures.every((texture) => texture.userData.bakedAreaLighting === true)).toBe(
      true,
    );
    expect(
      (bakedWalls ?? []).every((wall) => {
        if (!(wall instanceof THREE.Mesh)) {
          return false;
        }
        const mesh = wall as unknown as {
          readonly material: THREE.Material | THREE.Material[];
          readonly geometry: THREE.BufferGeometry;
          readonly castShadow: boolean;
          readonly receiveShadow: boolean;
        };
        if (Array.isArray(mesh.material)) {
          return false;
        }
        const material: THREE.Material = mesh.material;
        const geometry: THREE.BufferGeometry = mesh.geometry;
        return (
          material instanceof THREE.MeshBasicMaterial &&
          material.lightMap instanceof THREE.DataTexture &&
          material.userData.bakedAreaLighting === true &&
          material.userData.dynamicLightingDisabled === true &&
          !mesh.castShadow &&
          !mesh.receiveShadow &&
          Object.prototype.hasOwnProperty.call(geometry.attributes, "uv1") &&
          Object.prototype.hasOwnProperty.call(geometry.attributes, "uv2")
        );
      }),
    ).toBe(true);
    expect(rackRoot?.userData.generation).toBe("data-center-racks-v1");
    expect(rackRoot?.userData.iceBlue).toBe(true);
    expect(DEBUGGING_TWO_RACK_BLINKING_ENABLED).toBe(true);
    expect(rackRoot?.userData.blinkingLedGroups).toBe(3);
    expect(rackRoot?.userData.blinkingDisabled).toBe(false);
    expect(rackRoot?.userData.blinkMaterial).toBe("opaque-base-alpha-glow");
    expect(rackRoot?.userData.alphaGlowGroups).toBe(4);
    expect(rackRoot?.userData.ledLayout).toBe("four-sided-status-bars-v1");
    expect(rackRoot?.userData.ledBarsPerRack).toBe(DEBUGGING_TWO_RACK_LED_BARS_PER_RACK);
    expect(rackRoot?.userData.ledBarWidth).toBe(DEBUGGING_TWO_RACK_LED_BAR_WIDTH);
    expect(rackRoot?.userData.ledBarHeight).toBe(DEBUGGING_TWO_RACK_LED_BAR_HEIGHT);
    expect(rackRoot?.userData.ledBarDepth).toBe(DEBUGGING_TWO_RACK_LED_BAR_DEPTH);
    expect(rackRoot?.userData.pixelVariation).toBe("seeded-four-sided-bar-blink-v1");
    expect(rackBodyMesh).toBeInstanceOf(THREE.InstancedMesh);
    const instancedRackBodies = rackBodyMesh as THREE.InstancedMesh;
    expect(instancedRackBodies.count).toBe(first.root.userData.boxCount);
    instancedRackBodies.geometry.computeBoundingBox();
    const geometryBounds = instancedRackBodies.geometry.boundingBox;
    expect(geometryBounds).not.toBeNull();
    if (geometryBounds !== null) {
      const geometrySize = new THREE.Vector3();
      geometryBounds.getSize(geometrySize);
      expect(geometrySize.x).toBeCloseTo(0.84, 5);
      expect(geometrySize.y).toBeCloseTo(0.96, 5);
      expect(geometrySize.z).toBeCloseTo(0.8, 5);
    }
    const steadyLeds = rackRoot?.getObjectByName("DataCenterRackLEDsSteady");
    expect(steadyLeds).toBeInstanceOf(THREE.InstancedMesh);
    expect((steadyLeds as THREE.InstancedMesh | undefined)?.count).toBeGreaterThan(0);
    expect((steadyLeds as THREE.InstancedMesh | undefined)?.count).toBeLessThan(
      (first.root.userData.boxCount as number) * DEBUGGING_TWO_RACK_LED_BARS_PER_RACK,
    );
    const ledGeometry = (steadyLeds as THREE.InstancedMesh | undefined)?.geometry;
    ledGeometry?.computeBoundingBox();
    const ledBounds = ledGeometry?.boundingBox;
    expect(ledBounds).not.toBeNull();
    if (ledBounds !== null && ledBounds !== undefined) {
      const ledSize = new THREE.Vector3();
      ledBounds.getSize(ledSize);
      expect(ledSize.x).toBeCloseTo(DEBUGGING_TWO_RACK_LED_BAR_WIDTH, 5);
      expect(ledSize.y).toBeCloseTo(DEBUGGING_TWO_RACK_LED_BAR_HEIGHT, 5);
      expect(ledSize.z).toBeCloseTo(DEBUGGING_TWO_RACK_LED_BAR_DEPTH, 5);
      expect(ledSize.x).toBeLessThan(0.1);
      expect(ledSize.y).toBeGreaterThan(ledSize.x);
    }
    const blinkingLeds =
      rackRoot?.children.filter((child) => child.userData.blinking === true) ?? [];
    expect(blinkingLeds).toHaveLength(3);
    expect(steadyLeds).toBeInstanceOf(THREE.InstancedMesh);
    expect((steadyLeds as THREE.InstancedMesh).material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect((steadyLeds as THREE.InstancedMesh).material).toHaveProperty("fog", false);
    expect((steadyLeds as THREE.InstancedMesh).material).toHaveProperty("transparent", false);
    expect((steadyLeds as THREE.InstancedMesh).instanceColor).toBeNull();
    const ledGlows =
      rackRoot?.children.filter((child) => child.userData.rackLedGlow === true) ?? [];
    expect(ledGlows).toHaveLength(4);
    expect(
      ledGlows.every(
        (child) =>
          child instanceof THREE.InstancedMesh &&
          child.count > 0 &&
          child.material instanceof THREE.MeshBasicMaterial &&
          !child.material.fog &&
          child.material.transparent &&
          !child.material.depthWrite &&
          child.material.blending === THREE.AdditiveBlending,
      ),
    ).toBe(true);
    const blinkingPixelCount = blinkingLeds.reduce(
      (count, child) => count + (child instanceof THREE.InstancedMesh ? child.count : 0),
      0,
    );
    expect(
      blinkingPixelCount + (steadyLeds instanceof THREE.InstancedMesh ? steadyLeds.count : 0),
    ).toBe((first.root.userData.boxCount as number) * DEBUGGING_TWO_RACK_LED_BARS_PER_RACK);
    expect(
      blinkingLeds.every(
        (child) =>
          child instanceof THREE.InstancedMesh &&
          child.count > 0 &&
          typeof child.onBeforeRender === "function" &&
          child.material instanceof THREE.MeshBasicMaterial &&
          !child.material.fog &&
          !child.material.transparent &&
          child.userData.opaqueBlink === true,
      ),
    ).toBe(true);
    expect(
      first.physicsBoxes.every((box) => box.halfExtents.x === DEBUGGING_TWO_BOX_SIZE / 2),
    ).toBe(true);
    expect(
      first.physicsBoxes.every((box) => box.halfExtents.z === DEBUGGING_TWO_BOX_SIZE / 2),
    ).toBe(true);
    expect(
      first.physicsBoxes.every((box) => box.halfExtents.y === DEBUGGING_TWO_BOX_SIZE / 2),
    ).toBe(true);
    expect(first.physicsBoxes.every((box) => box.rotationX === 0 && box.rotationZ === 0)).toBe(
      true,
    );
    const rotatedPhysicsBoxes = first.physicsBoxes.filter(
      (box) => Math.abs(box.rotationY ?? 0) > 0.05,
    );
    expect(rotatedPhysicsBoxes.length).toBeGreaterThan(100);
    const variedCenters = first.physicsBoxes.filter(
      (box) =>
        Math.abs(box.center.x - Math.round(box.center.x)) > 0.05 ||
        Math.abs(box.center.y - Math.round(box.center.y)) > 0.05 ||
        Math.abs(box.center.z - Math.round(box.center.z)) > 0.05,
    );
    expect(variedCenters.length).toBeGreaterThan(100);
    const minimumClearSeparation = DEBUGGING_TWO_BOX_SIZE + DEBUGGING_TWO_BOX_GAP - 0.000001;
    let hasIntersectingPair = false;
    for (let firstIndex = 0; firstIndex < first.physicsBoxes.length; firstIndex += 1) {
      const firstBox = first.physicsBoxes[firstIndex];
      if (firstBox === undefined) {
        continue;
      }
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < first.physicsBoxes.length;
        secondIndex += 1
      ) {
        const secondBox = first.physicsBoxes[secondIndex];
        if (secondBox === undefined) {
          continue;
        }
        const separated =
          Math.abs(firstBox.center.x - secondBox.center.x) >= minimumClearSeparation ||
          Math.abs(firstBox.center.y - secondBox.center.y) >= minimumClearSeparation ||
          Math.abs(firstBox.center.z - secondBox.center.z) >= minimumClearSeparation;
        if (!separated) {
          hasIntersectingPair = true;
          break;
        }
      }
      if (hasIntersectingPair) {
        break;
      }
    }
    expect(hasIntersectingPair).toBe(false);
    const upperBoxes = first.physicsBoxes.filter(
      (box) => box.center.y > DEBUGGING_TWO_BOX_SIZE / 2 + 0.000001,
    );
    expect(
      upperBoxes.every((upperBox) =>
        first.physicsBoxes.some(
          (supportBox) =>
            Math.abs(supportBox.center.x - upperBox.center.x) < 0.000001 &&
            Math.abs(supportBox.center.z - upperBox.center.z) < 0.000001 &&
            Math.abs(supportBox.center.y - (upperBox.center.y - DEBUGGING_TWO_BOX_STACK_PITCH)) <
              0.000001,
        ),
      ),
    ).toBe(true);
    expect(DEBUGGING_TWO_BOX_CELL_PITCH).toBeGreaterThan(
      DEBUGGING_TWO_BOX_SIZE + DEBUGGING_TWO_BOX_GAP,
    );
    const firstBoxMatrix = new THREE.Matrix4();
    const firstBoxPosition = new THREE.Vector3();
    const firstBoxRotation = new THREE.Quaternion();
    const firstBoxScale = new THREE.Vector3();
    instancedRackBodies.getMatrixAt(0, firstBoxMatrix);
    firstBoxMatrix.decompose(firstBoxPosition, firstBoxRotation, firstBoxScale);
    const firstPhysicsBox = first.physicsBoxes[0];
    expect(firstPhysicsBox).toBeDefined();
    if (firstPhysicsBox !== undefined) {
      // InstancedMesh stores matrices in float32, so a five-decimal check is
      // the useful precision for the render/physics centre contract.
      expect(firstBoxPosition.x).toBeCloseTo(firstPhysicsBox.center.x, 5);
      expect(firstBoxPosition.y).toBeCloseTo(firstPhysicsBox.center.y, 5);
      expect(firstBoxPosition.z).toBeCloseTo(firstPhysicsBox.center.z, 5);
      expect(firstBoxScale.x).toBeCloseTo(1, 5);
      expect(firstBoxScale.y).toBeCloseTo(1, 5);
      expect(firstBoxScale.z).toBeCloseTo(1, 5);
      expect(firstBoxRotation.angleTo(new THREE.Quaternion())).toBeGreaterThan(0.05);
      const expectedRotation = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          firstPhysicsBox.rotationX ?? 0,
          firstPhysicsBox.rotationY ?? 0,
          firstPhysicsBox.rotationZ ?? 0,
          "XYZ",
        ),
      );
      expect(firstBoxRotation.angleTo(expectedRotation)).toBeLessThan(0.0001);
    }
    expect(first.physicsBoxes.every((box) => Math.abs(box.center.x) > 3)).toBe(true);
    expect(lights.filter((light) => light instanceof THREE.SpotLight)).toHaveLength(1);
    expect(lights.filter((light) => light instanceof THREE.RectAreaLight)).toHaveLength(0);
    expect(lights.filter((light) => light instanceof THREE.PointLight)).toHaveLength(0);
    expect(lights.filter((light) => light instanceof THREE.HemisphereLight)).toHaveLength(0);
    const emergencyLightGroup = firstScene.getObjectByName("WarehouseEmergencyLights");
    expect(emergencyLightGroup?.userData.generation).toBe(
      "emergency-fixtures-v2-no-runtime-lights",
    );
    expect(
      emergencyLightGroup?.children.filter((child) =>
        child.name.startsWith("WarehouseEmergencyLight:"),
      ),
    ).toHaveLength(4);
    const laneEmergencyLightGroup = firstScene.getObjectByName("WarehouseLaneEmergencyLights");
    expect(laneEmergencyLightGroup?.userData.generation).toBe("floor-led-lanes-v2");
    expect(
      laneEmergencyLightGroup?.children.filter((child) =>
        child.name.startsWith("WarehouseLaneEmergencyLight:"),
      ),
    ).toHaveLength(12);
    expect(laneEmergencyLightGroup?.children.map((child) => child.position.toArray())).toEqual([
      [-12, 0.028, -30],
      [-12, 0.028, -18],
      [-12, 0.028, -6],
      [-12, 0.028, 6],
      [-12, 0.028, 18],
      [-12, 0.028, 30],
      [12, 0.028, -30],
      [12, 0.028, -18],
      [12, 0.028, -6],
      [12, 0.028, 6],
      [12, 0.028, 18],
      [12, 0.028, 30],
    ]);
    const laneLed = laneEmergencyLightGroup?.getObjectByName("WarehouseLaneEmergencyLightLens");
    expect(laneLed).toBeInstanceOf(THREE.Mesh);
    expect((laneLed as THREE.Mesh | undefined)?.geometry).toBeInstanceOf(THREE.BoxGeometry);
    const centralSpotlight = lights.find((light) => light instanceof THREE.SpotLight);
    expect(centralSpotlight?.name).toBe("WarehouseCentralSpotlight");
    expect(centralSpotlight?.position.x).toBe(0);
    expect(centralSpotlight?.position.y).toBeCloseTo(7.25, 8);
    expect(centralSpotlight?.position.z).toBe(0);
    expect(centralSpotlight?.castShadow).toBe(false);
    expect(industrialLighting?.getObjectByName("WarehouseCentralSpotlightShaft")).toBeInstanceOf(
      THREE.Mesh,
    );
    expect(industrialLighting?.getObjectByName("WarehouseCentralSpotlightPool")).toBeInstanceOf(
      THREE.Mesh,
    );
    const perimeterLights = firstScene.getObjectByName("WarehousePerimeterLights");
    expect(perimeterLights?.userData.generation).toBe("yellow-perimeter-leds-v1");
    const yellowPerimeterLeds = perimeterLights?.getObjectByName("WarehouseYellowPerimeterLEDs");
    expect(yellowPerimeterLeds).toBeInstanceOf(THREE.InstancedMesh);
    if (yellowPerimeterLeds instanceof THREE.InstancedMesh) {
      expect(yellowPerimeterLeds.count).toBeGreaterThan(100);
      expect(yellowPerimeterLeds.castShadow).toBe(false);
      expect(yellowPerimeterLeds.receiveShadow).toBe(false);
      expect(yellowPerimeterLeds.material).toBeInstanceOf(THREE.MeshBasicMaterial);
      if (yellowPerimeterLeds.material instanceof THREE.MeshBasicMaterial) {
        expect(yellowPerimeterLeds.material.color.getHex()).toBe(0xffd42e);
      }
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const positions: THREE.Vector3[] = [];
      for (let index = 0; index < yellowPerimeterLeds.count; index += 1) {
        yellowPerimeterLeds.getMatrixAt(index, matrix);
        matrix.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
        positions.push(position.clone());
      }
      expect(Math.min(...positions.map((point) => point.x))).toBeCloseTo(-46.65, 2);
      expect(Math.max(...positions.map((point) => point.x))).toBeCloseTo(46.65, 2);
      expect(Math.min(...positions.map((point) => point.z))).toBeCloseTo(-34.65, 2);
      expect(Math.max(...positions.map((point) => point.z))).toBeCloseTo(34.65, 2);
      expect(positions.every((point) => Math.abs(point.y - 0.028) < 0.0001)).toBe(true);
    }
    expect(firstScene.background).toEqual(new THREE.Color(0x000000));
    expect(firstScene.fog).toBeInstanceOf(THREE.Fog);
    expect(firstScene.fog).toEqual(createWarehouseFog());
    if (firstScene.fog instanceof THREE.Fog) {
      expect(firstScene.fog.color.getHex()).toBe(0x07131c);
      expect(firstScene.fog.near).toBe(10);
      expect(firstScene.fog.far).toBe(92);
    }
    expect(firstScene.environment).toBeNull();
    const warehousePlatform = first.root.getObjectByName("DebuggingTwoWarehousePlatform");
    expect(warehousePlatform).toBeInstanceOf(THREE.Mesh);
    if (warehousePlatform instanceof THREE.Mesh) {
      expect(warehousePlatform.material).toBeInstanceOf(THREE.MeshBasicMaterial);
      if (warehousePlatform.material instanceof THREE.MeshBasicMaterial) {
        expect(warehousePlatform.material.color.getHex()).toBe(0x000000);
        expect(warehousePlatform.material.lightMap).toBeInstanceOf(THREE.DataTexture);
        expect(warehousePlatform.material.userData.bakedAreaLighting).toBe(true);
        expect(warehousePlatform.material.userData.dynamicLightingDisabled).toBe(true);
        expect(warehousePlatform.material.userData.floorColor).toBe("black");
      }
      expect(warehousePlatform.castShadow).toBe(false);
      expect(warehousePlatform.receiveShadow).toBe(false);
      expect(warehousePlatform.userData.generation).toBe("warehouse-floor-area-bake-v1-center");
      const platformGeometry = (
        warehousePlatform as unknown as {
          readonly geometry: THREE.BufferGeometry;
        }
      ).geometry;
      expect(platformGeometry.getAttribute("uv1")).toBeDefined();
      expect(platformGeometry.getAttribute("uv2")).toBeDefined();
    }
  });
});
