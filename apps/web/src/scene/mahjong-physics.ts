import * as RAPIER from "@dimforge/rapier3d-compat";

export interface PhysicsVector {
  x: number;
  y: number;
  z: number;
}

export interface PhysicsBox {
  readonly center: PhysicsVector;
  readonly halfExtents: PhysicsVector;
  readonly rotationX?: number;
  readonly rotationY?: number;
  readonly rotationZ?: number;
}

export interface PhysicsMovement {
  readonly position: PhysicsVector;
  readonly grounded: boolean;
  readonly collisions: number;
}

export interface MahjongPhysicsRuntime {
  readonly move: (position: PhysicsVector, desiredDelta: PhysicsVector) => PhysicsMovement;
  /** Replace coarse colliders for streamed or otherwise dynamic scene content. */
  readonly setDynamicBoxes: (boxes: readonly PhysicsBox[]) => void;
  readonly dispose: () => void;
}

let rapierInitialization: Promise<void> | null = null;

const ensureRapierInitialized = (): Promise<void> => {
  rapierInitialization ??= RAPIER.init();
  return rapierInitialization;
};

const toRotation = (rotationX: number, rotationY: number, rotationZ: number): RAPIER.Rotation => {
  const halfX = rotationX / 2;
  const halfY = rotationY / 2;
  const halfZ = rotationZ / 2;
  const sinX = Math.sin(halfX);
  const cosX = Math.cos(halfX);
  const sinY = Math.sin(halfY);
  const cosY = Math.cos(halfY);
  const sinZ = Math.sin(halfZ);
  const cosZ = Math.cos(halfZ);
  return {
    // XYZ Euler order; yaw-only streamed city boxes retain their prior
    // convention while X/Z rotation supports true sloped walkable surfaces.
    x: sinX * cosY * cosZ + cosX * sinY * sinZ,
    y: cosX * sinY * cosZ - sinX * cosY * sinZ,
    z: cosX * cosY * sinZ + sinX * sinY * cosZ,
    w: cosX * cosY * cosZ - sinX * sinY * sinZ,
  };
};

const addStaticBox = (world: RAPIER.World, box: PhysicsBox): RAPIER.Collider => {
  let descriptor = RAPIER.ColliderDesc.cuboid(
    box.halfExtents.x,
    box.halfExtents.y,
    box.halfExtents.z,
  ).setTranslation(box.center.x, box.center.y, box.center.z);
  if (box.rotationX !== undefined || box.rotationY !== undefined || box.rotationZ !== undefined) {
    descriptor = descriptor.setRotation(
      toRotation(box.rotationX ?? 0, box.rotationY ?? 0, box.rotationZ ?? 0),
    );
  }
  return world.createCollider(descriptor);
};

/**
 * Creates the browser collision world. Rendering geometry intentionally does
 * not become physics geometry implicitly; callers provide simplified static
 * boxes and may replace a separate dynamic box set as streamed content changes.
 */
export const createMahjongPhysics = async (
  staticBoxes: readonly PhysicsBox[],
): Promise<MahjongPhysicsRuntime> => {
  await ensureRapierInitialized();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const staticColliders: RAPIER.Collider[] = [];
  for (const box of staticBoxes) {
    staticColliders.push(addStaticBox(world, box));
  }
  // Build Rapier's broad phase before the first character query. Static
  // colliders added after a world step otherwise are not visible to the
  // controller until the next simulation update.
  world.step();

  const characterController = world.createCharacterController(0.01);
  characterController.setUp({ x: 0, y: 1, z: 0 });
  characterController.setSlideEnabled(true);
  characterController.enableAutostep(0.28, 0.2, false);
  characterController.enableSnapToGround(0.12);
  const characterCollider = world.createCollider(
    RAPIER.ColliderDesc.capsule(0.6, 0.26).setTranslation(0, 0.86, 0),
  );
  let dynamicColliders: RAPIER.Collider[] = [];

  return {
    move: (position, desiredDelta) => {
      characterCollider.setTranslation(position);
      characterController.computeColliderMovement(characterCollider, desiredDelta);
      const movement = characterController.computedMovement();
      const nextPosition: PhysicsVector = {
        x: position.x + movement.x,
        y: position.y + movement.y,
        z: position.z + movement.z,
      };
      characterCollider.setTranslation(nextPosition);
      return {
        position: nextPosition,
        grounded: characterController.computedGrounded(),
        collisions: characterController.numComputedCollisions(),
      };
    },
    setDynamicBoxes: (boxes) => {
      for (const collider of dynamicColliders) {
        world.removeCollider(collider, true);
      }
      dynamicColliders = boxes.map((box) => addStaticBox(world, box));
      // Rebuild the broad phase immediately so a newly streamed chunk is
      // solid on the next movement query rather than one simulation step
      // later.
      world.step();
    },
    dispose: () => {
      world.removeCharacterController(characterController);
      for (const collider of [...staticColliders, ...dynamicColliders]) {
        world.removeCollider(collider, true);
      }
      world.free();
    },
  };
};
