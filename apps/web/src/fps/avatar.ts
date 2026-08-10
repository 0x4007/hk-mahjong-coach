import * as THREE from "three";
import type { FpsPublicAvatarSnapshot, FpsVector3 } from "@hk-mahjong/fps";

export const FPS_AVATAR_SOCKET_NAMES = [
  "head",
  "chest",
  "weapon",
  "muzzle",
  "leftHand",
  "rightHand",
  "feet",
] as const;

/** Camera layer used for local world-body parts that must remain in the scene but not in the
 * first-person camera. The shadow/reflection paths can still inspect these meshes. */
export const FIRST_PERSON_BODY_LAYER = 2;

export interface AvatarDefinition {
  readonly modelId: string;
  readonly displayName: string;
  readonly scale: number;
  readonly capsule: {
    readonly radius: number;
    readonly height: number;
    readonly eyeHeight: number;
  };
  readonly sockets: typeof FPS_AVATAR_SOCKET_NAMES;
  readonly palette: {
    readonly body: number;
    readonly accent: number;
    readonly visor: number;
  };
  readonly supports: { readonly crouch: boolean; readonly weaponSocket: boolean };
}

export const FALLBACK_AVATAR_DEFINITION: AvatarDefinition = {
  modelId: "fallback-mannequin-v1",
  displayName: "Fallback mannequin",
  scale: 1,
  capsule: { radius: 0.38, height: 1.8, eyeHeight: 1.55 },
  sockets: FPS_AVATAR_SOCKET_NAMES,
  palette: { body: 0xdde7e5, accent: 0x19b6c9, visor: 0x263f48 },
  supports: { crouch: true, weaponSocket: true },
};

export const AVATAR_DEFINITIONS: Readonly<Record<string, AvatarDefinition>> = {
  [FALLBACK_AVATAR_DEFINITION.modelId]: FALLBACK_AVATAR_DEFINITION,
};

const meshFlags = (mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>): void => {
  mesh.visible = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
};

const makeMesh = (
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
): THREE.Mesh => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData.firstPersonOccluder =
    name === "head" || name === "chest" || name === "leftArm" || name === "rightArm";
  meshFlags(mesh);
  return mesh;
};

const socket = (name: (typeof FPS_AVATAR_SOCKET_NAMES)[number]): THREE.Group => {
  const group = new THREE.Group();
  group.name = name;
  return group;
};

/** Creates an opaque deterministic mannequin when an authored avatar asset is absent. */
export const createFallbackAvatar = (
  snapshot: Pick<
    FpsPublicAvatarSnapshot,
    "playerId" | "displayName" | "modelId" | "position" | "equippedWeaponId"
  >,
  definition: AvatarDefinition = AVATAR_DEFINITIONS[snapshot.modelId] ?? FALLBACK_AVATAR_DEFINITION,
): THREE.Group => {
  const root = new THREE.Group();
  root.name = `avatar:${snapshot.playerId}`;
  root.userData = {
    entityId: snapshot.playerId,
    displayName: snapshot.displayName,
    modelId: definition.modelId,
    fallback: definition.modelId === FALLBACK_AVATAR_DEFINITION.modelId,
    diagnosticWarning:
      snapshot.modelId === definition.modelId ? null : "missing_avatar_asset_fallback",
  };
  root.scale.setScalar(definition.scale);
  root.position.set(snapshot.position.x, snapshot.position.y, snapshot.position.z);

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: definition.palette.body,
    roughness: 0.64,
    metalness: 0.08,
    transparent: false,
    depthWrite: true,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: definition.palette.accent,
    roughness: 0.42,
    metalness: 0.2,
    transparent: false,
    depthWrite: true,
  });
  const visorMaterial = new THREE.MeshStandardMaterial({
    color: definition.palette.visor,
    roughness: 0.22,
    metalness: 0.3,
    transparent: false,
    depthWrite: true,
  });
  const body = new THREE.Group();
  body.name = "body-meshes";
  body.add(
    makeMesh(new THREE.CapsuleGeometry(0.34, 0.68, 8, 12), bodyMaterial, "chest"),
    makeMesh(new THREE.SphereGeometry(0.24, 16, 10), visorMaterial, "head"),
    makeMesh(new THREE.CapsuleGeometry(0.1, 0.55, 6, 8), accentMaterial, "leftArm"),
    makeMesh(new THREE.CapsuleGeometry(0.1, 0.55, 6, 8), accentMaterial, "rightArm"),
    makeMesh(new THREE.CapsuleGeometry(0.12, 0.7, 6, 8), bodyMaterial, "leftLeg"),
    makeMesh(new THREE.CapsuleGeometry(0.12, 0.7, 6, 8), bodyMaterial, "rightLeg"),
  );
  body.children[0]?.position.set(0, 1.06, 0);
  body.children[1]?.position.set(0, 1.72, 0);
  body.children[2]?.position.set(-0.48, 1.08, 0);
  body.children[3]?.position.set(0.48, 1.08, 0);
  body.children[4]?.position.set(-0.18, 0.4, 0);
  body.children[5]?.position.set(0.18, 0.4, 0);
  root.add(body);

  const socketRoot = new THREE.Group();
  socketRoot.name = "sockets";
  const socketPositions: Readonly<Record<(typeof FPS_AVATAR_SOCKET_NAMES)[number], FpsVector3>> = {
    head: { x: 0, y: 1.72, z: 0 },
    chest: { x: 0, y: 1.12, z: 0 },
    weapon: { x: 0.56, y: 1.18, z: -0.2 },
    muzzle: { x: 0.56, y: 1.18, z: -0.65 },
    leftHand: { x: -0.35, y: 1.15, z: -0.18 },
    rightHand: { x: 0.35, y: 1.15, z: -0.18 },
    feet: { x: 0, y: 0, z: 0 },
  };
  for (const name of definition.sockets) {
    const child = socket(name);
    const position = socketPositions[name];
    child.position.set(position.x, position.y, position.z);
    socketRoot.add(child);
  }
  const weapon = makeMesh(
    new THREE.BoxGeometry(0.14, 0.16, 0.62),
    new THREE.MeshStandardMaterial({
      color: 0x20282b,
      roughness: 0.28,
      metalness: 0.56,
      emissive: 0x000000,
      emissiveIntensity: 0,
    }),
    "avatar-weapon",
  );
  weapon.userData.firstPersonOccluder = true;
  weapon.userData.avatarWeaponId = snapshot.equippedWeaponId;
  weapon.position.set(0, 0, -0.3);
  socketRoot.getObjectByName("weapon")?.add(weapon);
  root.add(socketRoot);
  root.updateMatrixWorld(true);
  return root;
};

export interface AvatarDiagnostic {
  readonly entityId: string;
  readonly modelId: string;
  readonly fallback: boolean;
  readonly worldPosition: FpsVector3;
  readonly bounds: { readonly min: FpsVector3; readonly max: FpsVector3 };
  readonly meshCount: number;
  readonly visibleMeshes: number;
  readonly rootVisible: boolean;
  readonly layerMasks: readonly number[];
  readonly lastSnapshotTick: number;
  readonly diagnosticWarning: string | null;
}

/** Keep the world avatar present for shadows, mirrors, and spectators while excluding only the
 * upper body that would intersect the local first-person camera. */
export const applyFirstPersonWorldBodyPolicy = (root: THREE.Group, firstPerson: boolean): void => {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object.userData.firstPersonOccluder !== true) return;
    object.layers.set(firstPerson ? FIRST_PERSON_BODY_LAYER : 0);
  });
  root.userData.firstPersonBodyPolicy = firstPerson
    ? "upper-body-camera-occluded"
    : "full-world-body";
  root.updateMatrixWorld(true);
};

export const applyAvatarSnapshot = (root: THREE.Group, snapshot: FpsPublicAvatarSnapshot): void => {
  root.position.set(snapshot.position.x, snapshot.position.y, snapshot.position.z);
  root.rotation.y = snapshot.rotation.yaw;
  root.rotation.z = snapshot.alive ? 0 : -Math.PI / 2;
  root.scale.y = snapshot.locomotion === "crouch" ? 0.72 : 1;
  root.visible = snapshot.lifecycle !== "spectator" && snapshot.lifecycle !== "disconnected";
  root.userData.networkVisible = root.visible;
  root.userData.avatarAction = snapshot.action;
  const weapon = root.getObjectByName("avatar-weapon");
  if (weapon instanceof THREE.Mesh) {
    const isRifle = snapshot.equippedWeaponId === "rifle";
    weapon.scale.z = isRifle ? 1.45 : 1;
    weapon.userData.avatarWeaponId = snapshot.equippedWeaponId;
    const materials = weapon.material as THREE.Material | THREE.Material[];
    const material = Array.isArray(materials)
      ? materials.find(
          (candidate): candidate is THREE.MeshStandardMaterial =>
            candidate instanceof THREE.MeshStandardMaterial,
        )
      : materials;
    if (material instanceof THREE.MeshStandardMaterial) {
      material.emissive.setHex(snapshot.action === "fire" ? 0xff6c3a : 0x000000);
      material.emissiveIntensity = snapshot.action === "fire" ? 1.4 : 0;
    }
  }
  root.userData.lastSnapshotTick = snapshot.stateTick;
  root.updateMatrixWorld(true);
};

/** Apply authoritative weapon/action state to the camera-relative first-person viewmodel. */
export const applyViewmodelSnapshot = (
  viewmodel: THREE.Group,
  snapshot: FpsPublicAvatarSnapshot,
): void => {
  const active = snapshot.lifecycle !== "spectator" && snapshot.lifecycle !== "disconnected";
  viewmodel.visible = active;
  viewmodel.userData.networkVisible = active;
  viewmodel.userData.avatarAction = snapshot.action;
  viewmodel.userData.avatarWeaponId = snapshot.equippedWeaponId;
  viewmodel.userData.lastSnapshotTick = snapshot.stateTick;
  viewmodel.userData.locomotion = snapshot.locomotion;
  viewmodel.position.y = snapshot.locomotion === "crouch" ? -0.08 : 0;
  viewmodel.rotation.z = snapshot.alive ? 0 : -0.16;
  const weapon = viewmodel.getObjectByName("viewmodel-weapon");
  if (weapon instanceof THREE.Mesh) {
    const isRifle = snapshot.equippedWeaponId === "rifle";
    weapon.scale.z = isRifle ? 1.45 : 1;
    weapon.userData.avatarWeaponId = snapshot.equippedWeaponId;
    weapon.position.y = snapshot.action === "reload" ? -0.08 : 0;
    weapon.rotation.x = snapshot.action === "reload" ? -0.7 : 0;
    const materials = weapon.material as THREE.Material | THREE.Material[];
    const material = Array.isArray(materials)
      ? materials.find(
          (candidate): candidate is THREE.MeshStandardMaterial =>
            candidate instanceof THREE.MeshStandardMaterial,
        )
      : materials;
    if (material instanceof THREE.MeshStandardMaterial) {
      material.emissive.setHex(snapshot.action === "fire" ? 0xff6c3a : 0x000000);
      material.emissiveIntensity = snapshot.action === "fire" ? 1.4 : 0;
    }
  }
  viewmodel.updateMatrixWorld(true);
};

export const avatarDiagnostic = (root: THREE.Group, snapshotTick: number): AvatarDiagnostic => {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  let meshCount = 0;
  let visibleMeshes = 0;
  const layerMasks = new Set<number>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshCount += 1;
    layerMasks.add(object.layers.mask);
    if (root.visible && object.visible) visibleMeshes += 1;
  });
  return {
    entityId: String(root.userData.entityId ?? root.name),
    modelId: String(root.userData.modelId ?? FALLBACK_AVATAR_DEFINITION.modelId),
    fallback: root.userData.fallback === true,
    worldPosition: { x: root.position.x, y: root.position.y, z: root.position.z },
    bounds: {
      min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
      max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z },
    },
    meshCount,
    visibleMeshes,
    rootVisible: root.visible,
    layerMasks: [...layerMasks].sort((left, right) => left - right),
    lastSnapshotTick: snapshotTick,
    diagnosticWarning:
      typeof root.userData.diagnosticWarning === "string" ? root.userData.diagnosticWarning : null,
  };
};

export interface FirstPersonAvatarPresentation {
  readonly worldAvatar: THREE.Group;
  readonly viewmodel: THREE.Group;
}

/** Keeps the camera-relative viewmodel separate from the world-space collision/avatar body. */
export const createFirstPersonAvatarPresentation = (
  snapshot: Pick<
    FpsPublicAvatarSnapshot,
    "playerId" | "displayName" | "modelId" | "position" | "equippedWeaponId"
  >,
): FirstPersonAvatarPresentation => {
  const worldAvatar = createFallbackAvatar(snapshot);
  worldAvatar.name = `local-world-avatar:${snapshot.playerId}`;
  const viewmodel = new THREE.Group();
  viewmodel.name = `local-viewmodel:${snapshot.playerId}`;
  viewmodel.renderOrder = 100;
  viewmodel.userData = { entityId: snapshot.playerId, representation: "first-person-viewmodel" };
  const armMaterial = new THREE.MeshStandardMaterial({ color: 0xc4d0cf, roughness: 0.68 });
  const weaponMaterial = new THREE.MeshStandardMaterial({
    color: 0x20282b,
    roughness: 0.28,
    metalness: 0.56,
  });
  const leftArm = makeMesh(
    new THREE.CapsuleGeometry(0.08, 0.48, 6, 8),
    armMaterial,
    "viewmodel-left-hand",
  );
  const rightArm = makeMesh(
    new THREE.CapsuleGeometry(0.08, 0.48, 6, 8),
    armMaterial,
    "viewmodel-right-hand",
  );
  const weapon = makeMesh(
    new THREE.BoxGeometry(0.14, 0.16, 0.62),
    weaponMaterial,
    "viewmodel-weapon",
  );
  leftArm.position.set(-0.34, -0.32, -0.72);
  leftArm.rotation.x = -0.35;
  rightArm.position.set(0.34, -0.28, -0.72);
  rightArm.rotation.x = -0.35;
  weapon.position.set(0.22, -0.2, -0.98);
  viewmodel.add(leftArm, rightArm, weapon);
  viewmodel.traverse((object) => {
    object.layers.set(1);
  });
  return { worldAvatar, viewmodel };
};
