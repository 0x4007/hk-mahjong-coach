import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  DEFAULT_FPS_ARENA,
  buildFpsMapDiagnostic,
  integrateFpsMovement,
  reconcileFpsPrediction,
  type FpsInputCommand,
  type FpsSnapshot,
} from "@hk-mahjong/fps";
import {
  applyAvatarSnapshot,
  applyFirstPersonWorldBodyPolicy,
  applyViewmodelSnapshot,
  avatarDiagnostic,
  createFirstPersonAvatarPresentation,
  FIRST_PERSON_BODY_LAYER,
} from "./avatar.js";
import { DEFAULT_FPS_CONTROL_BINDINGS, type FpsControlBindings } from "./accessibility.js";
import { RemotePlayerRenderer } from "./remote-players.js";

export interface FpsArenaSceneProps {
  readonly snapshot: FpsSnapshot | null;
  readonly playerId: string | null;
  readonly onInput?: (
    input: Omit<
      FpsInputCommand,
      | "protocolVersion"
      | "matchId"
      | "playerId"
      | "inputSequence"
      | "clientTimestampMs"
      | "acknowledgedServerTick"
    >,
  ) => void;
  readonly cameraMode: "firstPerson" | "thirdPerson";
  readonly quality: "low" | "medium" | "high";
  readonly reducedMotion?: boolean;
  readonly controlBindings?: FpsControlBindings;
  readonly onCorrectionDistance?: (distance: number) => void;
}

const arenaBounds = { minX: -18, maxX: 18, minZ: -12, maxZ: 12 };

const makeMaterial = (color: number, roughness = 0.75): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.06 });

export const FpsArenaScene = ({
  snapshot,
  playerId,
  onInput,
  cameraMode,
  quality,
  reducedMotion = false,
  controlBindings = DEFAULT_FPS_CONTROL_BINDINGS,
  onCorrectionDistance,
}: FpsArenaSceneProps): React.JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef(snapshot);
  const inputCallbackRef = useRef(onInput);
  const cameraModeRef = useRef(cameraMode);
  const qualityRef = useRef(quality);
  const reducedMotionRef = useRef(reducedMotion);
  const controlBindingsRef = useRef(controlBindings);
  const correctionCallbackRef = useRef(onCorrectionDistance);
  snapshotRef.current = snapshot;
  inputCallbackRef.current = onInput;
  cameraModeRef.current = cameraMode;
  qualityRef.current = quality;
  reducedMotionRef.current = reducedMotion;
  controlBindingsRef.current = controlBindings;
  correctionCallbackRef.current = onCorrectionDistance;

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x081216);
    scene.fog = new THREE.Fog(0x081216, 16, 74);
    const camera = new THREE.PerspectiveCamera(76, 1, 0.05, 120);
    camera.layers.enable(0);
    camera.layers.enable(1);
    camera.position.set(0, 1.55, 8);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(quality === "low" ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = quality !== "low";
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
    renderer.domElement.className = "fps-arena-canvas";
    renderer.domElement.setAttribute("aria-label", "Competitive FPS Slayer arena");
    renderer.domElement.dataset.avatarDiagnostic = "fallback-mannequin-v1";
    renderer.domElement.dataset.mapId = DEFAULT_FPS_ARENA.mapId;
    renderer.domElement.dataset.mapHash = "pending-snapshot";
    renderer.domElement.dataset.quality = quality;
    container.append(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xc5ffff, 0x061014, 1.8);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffe3ba, 3.4);
    key.position.set(-8, 16, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(
        arenaBounds.maxX - arenaBounds.minX,
        arenaBounds.maxZ - arenaBounds.minZ,
      ),
      makeMaterial(0x1c2c30),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.name = "slayer-collision-floor";
    scene.add(floor);
    const grid = new THREE.GridHelper(36, 36, 0x2d818b, 0x1f4348);
    grid.position.y = 0.01;
    grid.material.transparent = true;
    grid.material.opacity = 0.4;
    scene.add(grid);
    const coverMaterial = makeMaterial(0xe2eee9);
    for (const [id, position, size, color] of [
      ["center-cover", [0, 1.05, 0], [2.8, 2.1, 9], 0xe2eee9],
      ["west-cover", [-9.35, 0.8, 0], [4.3, 1.6, 2.4], 0x8ed3d5],
      ["east-cover", [9.35, 0.8, 0], [4.3, 1.6, 2.4], 0x8ed3d5],
    ] as const) {
      const material = coverMaterial.clone();
      material.color.setHex(color);
      const cover = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
      cover.name = `collision-${id}`;
      cover.position.set(position[0], position[1], position[2]);
      cover.castShadow = true;
      cover.receiveShadow = true;
      scene.add(cover);
    }
    const boundary = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(36, 0.2, 24)),
      new THREE.LineBasicMaterial({ color: 0xe95656, transparent: true, opacity: 0.7 }),
    );
    boundary.position.y = 0.1;
    scene.add(boundary);

    const previewSnapshot = snapshotRef.current?.players[0];
    const localSeedSnapshot = previewSnapshot ?? {
      playerId: playerId ?? "preview-local",
      displayName: "Local player",
      modelId: "fallback-mannequin-v1",
      teamId: null,
      position: { x: -4, y: 0, z: 4 },
      rotation: { yaw: 0, pitch: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      locomotion: "idle" as const,
      equippedWeaponId: "pistol" as const,
      action: "none" as const,
      health: 100,
      shield: 50,
      alive: true,
      spawnProtectionEndsAtTick: null,
      stateTick: 0,
      lifecycle: "alive" as const,
    };
    const localPresentation = createFirstPersonAvatarPresentation(localSeedSnapshot);
    localPresentation.worldAvatar.userData.representation = "local-world-avatar";
    const initialThirdPerson = cameraMode === "thirdPerson";
    applyFirstPersonWorldBodyPolicy(localPresentation.worldAvatar, !initialThirdPerson);
    if (initialThirdPerson) camera.layers.enable(FIRST_PERSON_BODY_LAYER);
    scene.add(localPresentation.worldAvatar);
    camera.add(localPresentation.viewmodel);
    scene.add(camera);
    const remotePlayers = new RemotePlayerRenderer(scene, playerId ?? localSeedSnapshot.playerId);
    let disposed = false;
    const keys = new Set<string>();
    let lookX = 0;
    let lookY = 0;
    let fire = false;
    let crouch = false;
    let sprint = false;
    let jump = false;
    let reload = false;
    let selectedWeaponId: "pistol" | "rifle" = "pistol";
    let lastFire = false;
    let sequence = 0;
    let predictedPosition = { ...localSeedSnapshot.position };
    let predictedVelocity = { x: 0, y: 0, z: 0 };
    let predictedYaw = localSeedSnapshot.rotation.yaw;
    let predictedPitch = localSeedSnapshot.rotation.pitch;
    let predictedGrounded = true;
    let lastServerTick = -1;
    let lastQuality = quality;
    let lastThirdPerson = initialThirdPerson;
    let lastAppliedSnapshotId: string | null = null;
    const pendingInputs: FpsInputCommand[] = [];
    const onKeyDown = (event: KeyboardEvent): void => {
      keys.add(event.code);
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") sprint = true;
      if (event.code === "ControlLeft" || event.code === "ControlRight") crouch = true;
      if (event.code === "Space") jump = true;
      if (event.code === "KeyR") reload = true;
      if (event.code === "Digit1") selectedWeaponId = "pistol";
      if (event.code === "Digit2") selectedWeaponId = "rifle";
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      keys.delete(event.code);
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") sprint = false;
      if (event.code === "ControlLeft" || event.code === "ControlRight") crouch = false;
      if (event.code === "Space") jump = false;
      if (event.code === "KeyR") reload = false;
    };
    const onMouseMove = (event: MouseEvent): void => {
      if (document.pointerLockElement !== renderer.domElement) return;
      lookX = THREE.MathUtils.clamp(event.movementX * 0.0018, -0.35, 0.35);
      lookY = THREE.MathUtils.clamp(event.movementY * 0.0018, -0.35, 0.35);
      predictedYaw += lookX;
      predictedPitch = THREE.MathUtils.clamp(predictedPitch + lookY, -1.45, 1.45);
    };
    const onMouseDown = (event: MouseEvent): void => {
      if (event.button === 0) {
        fire = true;
        if (document.pointerLockElement !== renderer.domElement)
          void renderer.domElement.requestPointerLock();
      }
    };
    const onMouseUp = (event: MouseEvent): void => {
      if (event.button === 0) fire = false;
    };
    const onResize = (): void => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousemove", onMouseMove);
    renderer.domElement.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("resize", onResize);
    onResize();

    const sendInput = (): void => {
      const current = snapshotRef.current;
      if (current === null || playerId === null || inputCallbackRef.current === undefined) return;
      const bindings = controlBindingsRef.current;
      const moveX = (keys.has(bindings.right) ? 1 : 0) - (keys.has(bindings.left) ? 1 : 0);
      const moveY = (keys.has(bindings.forward) ? 1 : 0) - (keys.has(bindings.backward) ? 1 : 0);
      const actionNonce = fire && !lastFire ? `fire-${String(sequence)}` : null;
      inputCallbackRef.current({
        moveX: THREE.MathUtils.clamp(moveX, -1, 1),
        moveY: THREE.MathUtils.clamp(moveY, -1, 1),
        lookDeltaX: lookX,
        lookDeltaY: lookY,
        buttons: {
          forward: moveY > 0,
          backward: moveY < 0,
          left: moveX < 0,
          right: moveX > 0,
          sprint,
          crouch,
          jump,
          fire,
          reload,
        },
        selectedWeaponId,
        actionNonce,
      });
      pendingInputs.push({
        protocolVersion: 1,
        matchId: current.matchId,
        playerId,
        inputSequence: sequence,
        clientTimestampMs: performance.timeOrigin + performance.now(),
        acknowledgedServerTick: current.serverTick,
        moveX: THREE.MathUtils.clamp(moveX, -1, 1),
        moveY: THREE.MathUtils.clamp(moveY, -1, 1),
        lookDeltaX: lookX,
        lookDeltaY: lookY,
        buttons: {
          forward: moveY > 0,
          backward: moveY < 0,
          left: moveX < 0,
          right: moveX > 0,
          sprint,
          crouch,
          jump,
          fire,
          reload,
        },
        selectedWeaponId,
        actionNonce,
      });
      while (pendingInputs.length > 180) pendingInputs.shift();
      sequence += 1;
      lastFire = fire;
      lookX = 0;
      lookY = 0;
      jump = false;
    };
    const inputTimer = window.setInterval(sendInput, 50);
    let frame = 0;
    let previous = performance.now();
    const render = (now: number): void => {
      if (disposed) return;
      const delta = Math.min(0.1, (now - previous) / 1000);
      previous = now;
      renderer.domElement.dataset.frameTimeMs = (delta * 1000).toFixed(2);
      const current = snapshotRef.current;
      if (lastQuality !== qualityRef.current) {
        lastQuality = qualityRef.current;
        renderer.setPixelRatio(
          lastQuality === "low"
            ? 1
            : Math.min(window.devicePixelRatio, lastQuality === "high" ? 2 : 1.5),
        );
        renderer.shadowMap.enabled = lastQuality !== "low";
        renderer.domElement.dataset.quality = lastQuality;
      }
      if (current !== null) {
        const mapDiagnostic = buildFpsMapDiagnostic(DEFAULT_FPS_ARENA, current.players);
        renderer.domElement.dataset.mapId = mapDiagnostic.mapId;
        renderer.domElement.dataset.mapHash = mapDiagnostic.mapHash;
        renderer.domElement.dataset.mapCollision = JSON.stringify(mapDiagnostic.collision);
        renderer.domElement.dataset.mapCapsules = JSON.stringify(mapDiagnostic.capsules);
        renderer.domElement.dataset.mapSpawnRays = JSON.stringify(mapDiagnostic.spawnRays);
        renderer.domElement.dataset.mapVisibilityTests = JSON.stringify(
          mapDiagnostic.visibilityTests,
        );
        const freshFullSnapshot = current.full && current.snapshotId !== lastAppliedSnapshotId;
        if (freshFullSnapshot) {
          pendingInputs.length = 0;
          lastServerTick = -1;
        }
        lastAppliedSnapshotId = current.snapshotId;
        remotePlayers.applySnapshots(current.players, now, freshFullSnapshot);
        remotePlayers.update(now, reducedMotionRef.current);
        const remoteDiagnostics = remotePlayers.getDiagnostics();
        renderer.domElement.dataset.remoteAvatarCount = String(remoteDiagnostics.length);
        renderer.domElement.dataset.remoteAvatarDiagnostics = JSON.stringify(remoteDiagnostics);
        const local = current.players.find((candidate) => candidate.playerId === playerId);
        if (local !== undefined) {
          if (current.serverTick !== lastServerTick) {
            const acknowledged = current.privatePlayer.lastAcceptedInputSequence;
            while (pendingInputs[0] !== undefined && pendingInputs[0].inputSequence <= acknowledged)
              pendingInputs.shift();
            const reconciled = reconcileFpsPrediction(DEFAULT_FPS_ARENA, local, pendingInputs);
            predictedPosition = { ...reconciled.state.position };
            predictedVelocity = { ...reconciled.state.velocity };
            predictedYaw = reconciled.state.yaw;
            predictedPitch = reconciled.state.pitch;
            predictedGrounded = reconciled.state.grounded;
            renderer.domElement.dataset.correctionDistance =
              reconciled.correctionDistance.toFixed(3);
            correctionCallbackRef.current?.(reconciled.correctionDistance);
            lastServerTick = current.serverTick;
          }
          const bindings = controlBindingsRef.current;
          const moveX = (keys.has(bindings.right) ? 1 : 0) - (keys.has(bindings.left) ? 1 : 0);
          const moveY =
            (keys.has(bindings.forward) ? 1 : 0) - (keys.has(bindings.backward) ? 1 : 0);
          const predicted = integrateFpsMovement(DEFAULT_FPS_ARENA, {
            position: predictedPosition,
            velocity: predictedVelocity,
            moveX,
            moveY,
            yaw: predictedYaw,
            sprint,
            crouch,
            jump: jump && predictedGrounded,
            grounded: predictedGrounded,
            deltaSeconds: delta,
          });
          predictedPosition = predicted.position;
          predictedVelocity = predicted.velocity;
          predictedGrounded = predicted.grounded;
          const body = localPresentation.worldAvatar;
          applyAvatarSnapshot(localPresentation.worldAvatar, local);
          applyViewmodelSnapshot(localPresentation.viewmodel, local);
          const viewmodelWeapon = localPresentation.viewmodel.getObjectByName("viewmodel-weapon");
          renderer.domElement.dataset.viewmodelVisible = String(
            localPresentation.viewmodel.visible,
          );
          renderer.domElement.dataset.viewmodelWeapon = String(
            viewmodelWeapon?.userData.avatarWeaponId ?? local.equippedWeaponId,
          );
          renderer.domElement.dataset.viewmodelAction = String(
            localPresentation.viewmodel.userData.avatarAction ?? local.action,
          );
          body.position.set(predictedPosition.x, predictedPosition.y, predictedPosition.z);
          body.rotation.y = predictedYaw;
          body.updateMatrixWorld(true);
          const thirdPerson = cameraModeRef.current === "thirdPerson";
          if (thirdPerson !== lastThirdPerson) {
            lastThirdPerson = thirdPerson;
            applyFirstPersonWorldBodyPolicy(body, !thirdPerson);
            if (thirdPerson) camera.layers.enable(FIRST_PERSON_BODY_LAYER);
            else camera.layers.disable(FIRST_PERSON_BODY_LAYER);
          }
          localPresentation.viewmodel.visible = !thirdPerson;
          renderer.domElement.dataset.viewmodelVisible = String(
            localPresentation.viewmodel.visible,
          );
          const target = new THREE.Vector3(
            predictedPosition.x,
            predictedPosition.y + (thirdPerson ? 1.1 : 1.55),
            predictedPosition.z,
          );
          if (thirdPerson) {
            const desired = new THREE.Vector3(
              predictedPosition.x - Math.sin(predictedYaw) * 4.2,
              predictedPosition.y + 2.6,
              predictedPosition.z + Math.cos(predictedYaw) * 4.2,
            );
            camera.position.lerp(desired, reducedMotionRef.current ? 1 : 1 - Math.exp(-8 * delta));
            camera.lookAt(target);
          } else {
            camera.position.lerp(target, reducedMotionRef.current ? 1 : 1 - Math.exp(-12 * delta));
            camera.rotation.order = "YXZ";
            camera.rotation.y = predictedYaw;
            camera.rotation.x = predictedPitch;
          }
          const diagnostic = avatarDiagnostic(localPresentation.worldAvatar, current.serverTick);
          renderer.domElement.dataset.avatarMeshCount = String(diagnostic.meshCount);
          renderer.domElement.dataset.avatarVisibleMeshes = String(diagnostic.visibleMeshes);
          renderer.domElement.dataset.avatarRootVisible = String(diagnostic.rootVisible);
          renderer.domElement.dataset.avatarLayerMasks = diagnostic.layerMasks.join(",");
          renderer.domElement.dataset.avatarBodyPolicy = String(
            body.userData.firstPersonBodyPolicy ?? "unknown",
          );
          renderer.domElement.dataset.avatarSnapshotTick = String(diagnostic.lastSnapshotTick);
        }
      }
      frame = requestAnimationFrame(render);
      renderer.render(scene, camera);
      renderer.domElement.dataset.drawCalls = String(renderer.info.render.calls);
      renderer.domElement.dataset.triangles = String(renderer.info.render.triangles);
    };
    frame = requestAnimationFrame(render);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.clearInterval(inputTimer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("resize", onResize);
      remotePlayers.dispose();
      scene.remove(localPresentation.worldAvatar);
      localPresentation.viewmodel.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const mesh = object as unknown as {
          readonly geometry: THREE.BufferGeometry;
          readonly material: THREE.Material | THREE.Material[];
        };
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          for (const material of mesh.material) material.dispose();
        } else {
          mesh.material.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [playerId]);

  return <div className="fps-arena-scene" ref={containerRef} />;
};
