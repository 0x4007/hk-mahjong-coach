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
  readonly dynamic?: boolean;
  readonly dynamicId?: number;
  readonly linearVelocity?: PhysicsVector;
  readonly angularVelocity?: PhysicsVector;
  readonly restitution?: number;
  readonly friction?: number;
  readonly linearDamping?: number;
  readonly angularDamping?: number;
}

export interface PhysicsMovement {
  readonly position: PhysicsVector;
  readonly grounded: boolean;
  readonly collisions: number;
}

export interface PhysicsBodyState {
  readonly dynamicId: number;
  readonly center: PhysicsVector;
  readonly rotation: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly w: number;
  };
}

export interface MahjongPhysicsRuntime {
  readonly move: (position: PhysicsVector, desiredDelta: PhysicsVector) => PhysicsMovement;
  /** Replace coarse colliders for streamed scene content, including static boxes. */
  readonly setDynamicBoxes: (boxes: readonly PhysicsBox[]) => void;
  readonly applyImpulseToDynamicBody: (
    dynamicId: number,
    linearVelocity: PhysicsVector,
    angularVelocity: PhysicsVector,
  ) => void;
  readonly getDynamicBodyStates: () => readonly PhysicsBodyState[];
  readonly dispose: () => void;
}

// The browser should normally use Rapier. Keep a small AABB controller for
// browsers where the optional WASM module cannot initialise (for example a
// restricted WebView). The scene traversal code consumes the same runtime
// interface in both cases, so ledge/vault/wall ordering does not silently
// disappear when the fallback is selected.
const FALLBACK_CAPSULE_RADIUS = 0.26;
const FALLBACK_CAPSULE_HALF_HEIGHT = 0.6;
const FALLBACK_CAPSULE_CENTER_HEIGHT = FALLBACK_CAPSULE_HALF_HEIGHT + FALLBACK_CAPSULE_RADIUS;
const FALLBACK_AUTOSTEP_HEIGHT = 0.28;
const FALLBACK_EPSILON = 0.0005;

const fallbackVerticalOverlap = (centerY: number, box: PhysicsBox): boolean => {
  const bottom = centerY - FALLBACK_CAPSULE_CENTER_HEIGHT;
  const top = centerY + FALLBACK_CAPSULE_CENTER_HEIGHT;
  const boxBottom = box.center.y - box.halfExtents.y;
  const boxTop = box.center.y + box.halfExtents.y;
  return bottom < boxTop - FALLBACK_EPSILON && top > boxBottom + FALLBACK_EPSILON;
};

const fallbackHorizontalOverlap = (centerX: number, centerZ: number, box: PhysicsBox): boolean => {
  const minX = box.center.x - box.halfExtents.x - FALLBACK_CAPSULE_RADIUS;
  const maxX = box.center.x + box.halfExtents.x + FALLBACK_CAPSULE_RADIUS;
  const minZ = box.center.z - box.halfExtents.z - FALLBACK_CAPSULE_RADIUS;
  const maxZ = box.center.z + box.halfExtents.z + FALLBACK_CAPSULE_RADIUS;
  return (
    centerX >= minX - FALLBACK_EPSILON &&
    centerX <= maxX + FALLBACK_EPSILON &&
    centerZ >= minZ - FALLBACK_EPSILON &&
    centerZ <= maxZ + FALLBACK_EPSILON
  );
};

const fallbackSupportTop = (
  centerX: number,
  centerY: number,
  centerZ: number,
  boxes: readonly PhysicsBox[],
): { readonly box: PhysicsBox; readonly topY: number } | null => {
  const feetY = centerY - FALLBACK_CAPSULE_CENTER_HEIGHT;
  let best: { readonly box: PhysicsBox; readonly topY: number } | null = null;
  for (const box of boxes) {
    const topY = box.center.y + box.halfExtents.y;
    if (
      topY > feetY + FALLBACK_EPSILON ||
      feetY - topY > 0.14 + FALLBACK_EPSILON ||
      !fallbackHorizontalOverlap(centerX, centerZ, box)
    ) {
      continue;
    }
    if (best === null || topY > best.topY) {
      best = { box, topY };
    }
  }
  return best;
};

/**
 * Coarse, deterministic fallback for the Rapier character controller.
 * Rotated boxes are treated as their world-space AABB; this is intentionally
 * conservative, while the normal Rapier path remains authoritative where it
 * is available.
 */
export const createFallbackMahjongPhysics = (
  staticBoxes: readonly PhysicsBox[],
): MahjongPhysicsRuntime => {
  let activeBoxes: readonly PhysicsBox[] = [...staticBoxes];

  const move = (position: PhysicsVector, desiredDelta: PhysicsVector): PhysicsMovement => {
    let next: PhysicsVector = { ...position };
    const collisionBoxes = new Set<PhysicsBox>();

    // Resolve vertical motion first. This lets a jump clear a short obstacle
    // before horizontal movement is tested, while a falling capsule still
    // lands on a box top instead of tunnelling through it.
    const desiredY = position.y + desiredDelta.y;
    let verticalResolved = false;
    if (desiredDelta.y < -FALLBACK_EPSILON) {
      for (const box of activeBoxes) {
        if (!fallbackHorizontalOverlap(position.x, position.z, box)) {
          continue;
        }
        const boxTop = box.center.y + box.halfExtents.y;
        const startFeet = position.y - FALLBACK_CAPSULE_CENTER_HEIGHT;
        const nextFeet = desiredY - FALLBACK_CAPSULE_CENTER_HEIGHT;
        if (startFeet >= boxTop - FALLBACK_EPSILON && nextFeet <= boxTop + FALLBACK_EPSILON) {
          next = { ...next, y: boxTop + FALLBACK_CAPSULE_CENTER_HEIGHT };
          collisionBoxes.add(box);
          verticalResolved = true;
          break;
        }
      }
      if (!verticalResolved) {
        next = { ...next, y: desiredY };
      }
    } else if (desiredDelta.y > FALLBACK_EPSILON) {
      next = { ...next, y: desiredY };
      for (const box of activeBoxes) {
        if (!fallbackHorizontalOverlap(position.x, position.z, box)) {
          continue;
        }
        const boxBottom = box.center.y - box.halfExtents.y;
        const startHead = position.y + FALLBACK_CAPSULE_CENTER_HEIGHT;
        const nextHead = desiredY + FALLBACK_CAPSULE_CENTER_HEIGHT;
        if (startHead <= boxBottom + FALLBACK_EPSILON && nextHead >= boxBottom - FALLBACK_EPSILON) {
          next = { ...next, y: boxBottom - FALLBACK_CAPSULE_CENTER_HEIGHT };
          collisionBoxes.add(box);
          verticalResolved = true;
          break;
        }
      }
    }

    const moveAxis = (axis: "x" | "z", amount: number): void => {
      if (Math.abs(amount) <= FALLBACK_EPSILON) {
        return;
      }
      const candidate = next[axis] + amount;
      for (const box of activeBoxes) {
        if (!fallbackVerticalOverlap(next.y, box)) {
          continue;
        }
        const candidateX = axis === "x" ? candidate : next.x;
        const candidateZ = axis === "z" ? candidate : next.z;
        if (!fallbackHorizontalOverlap(candidateX, candidateZ, box)) {
          continue;
        }

        const topY = box.center.y + box.halfExtents.y;
        const feetY = next.y - FALLBACK_CAPSULE_CENTER_HEIGHT;
        const stepHeight = topY - feetY;
        const canAutostep =
          desiredDelta.y <= FALLBACK_EPSILON &&
          stepHeight > FALLBACK_EPSILON &&
          stepHeight <= FALLBACK_AUTOSTEP_HEIGHT + FALLBACK_EPSILON &&
          feetY <= topY + FALLBACK_EPSILON;
        if (canAutostep) {
          const steppedY = topY + FALLBACK_CAPSULE_CENTER_HEIGHT;
          if (!fallbackVerticalOverlap(steppedY, box)) {
            next = { ...next, y: steppedY, [axis]: candidate };
            collisionBoxes.add(box);
            return;
          }
        }

        const minAxis =
          axis === "x" ? box.center.x - box.halfExtents.x : box.center.z - box.halfExtents.z;
        const maxAxis =
          axis === "x" ? box.center.x + box.halfExtents.x : box.center.z + box.halfExtents.z;
        const safeAxis =
          amount > 0
            ? minAxis - FALLBACK_CAPSULE_RADIUS - FALLBACK_EPSILON
            : maxAxis + FALLBACK_CAPSULE_RADIUS + FALLBACK_EPSILON;
        next = { ...next, [axis]: safeAxis };
        collisionBoxes.add(box);
        return;
      }
      next = { ...next, [axis]: candidate };
    };

    moveAxis("x", desiredDelta.x);
    moveAxis("z", desiredDelta.z);

    // A horizontal move can arrive over a support that was not underneath the
    // capsule at the start of the frame. Snap only while descending or already
    // level; upward motion must remain airborne.
    let grounded = false;
    if (desiredDelta.y <= FALLBACK_EPSILON) {
      const support = fallbackSupportTop(next.x, next.y, next.z, activeBoxes);
      if (support !== null) {
        const supportedY = support.topY + FALLBACK_CAPSULE_CENTER_HEIGHT;
        if (next.y <= supportedY + 0.14 + FALLBACK_EPSILON) {
          next = { ...next, y: supportedY };
          grounded = true;
          collisionBoxes.add(support.box);
        }
      }
    }

    return {
      position: next,
      grounded,
      collisions: collisionBoxes.size,
    };
  };

  return {
    move,
    setDynamicBoxes: (boxes) => {
      activeBoxes = [...staticBoxes, ...boxes.filter((box) => box.dynamic !== true)];
    },
    applyImpulseToDynamicBody: () => {
      // Dynamic props are intentionally visual-only in the fallback.
    },
    getDynamicBodyStates: () => [],
    dispose: () => {
      activeBoxes = [];
    },
  };
};

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

const addDynamicBox = (
  world: RAPIER.World,
  box: PhysicsBox & { readonly dynamicId: number },
): { body: RAPIER.RigidBody; collider: RAPIER.Collider } => {
  const rotation = toRotation(box.rotationX ?? 0, box.rotationY ?? 0, box.rotationZ ?? 0);
  const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(box.center.x, box.center.y, box.center.z)
    .setRotation(rotation);
  if (box.linearDamping !== undefined) {
    bodyDesc.setLinearDamping(box.linearDamping);
  }
  if (box.angularDamping !== undefined) {
    bodyDesc.setAngularDamping(box.angularDamping);
  }
  const body = world.createRigidBody(bodyDesc);
  if (box.linearVelocity !== undefined) {
    body.setLinvel(box.linearVelocity, true);
  }
  if (box.angularVelocity !== undefined) {
    body.setAngvel(box.angularVelocity, true);
  }
  const colliderDesc = RAPIER.ColliderDesc.cuboid(
    box.halfExtents.x,
    box.halfExtents.y,
    box.halfExtents.z,
  );
  if (box.restitution !== undefined) {
    colliderDesc.setRestitution(box.restitution);
  }
  if (box.friction !== undefined) {
    colliderDesc.setFriction(box.friction);
  }
  return {
    body,
    collider: world.createCollider(colliderDesc, body),
  };
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
  const dynamicColliders: RAPIER.Collider[] = [];
  const streamedStaticColliders: RAPIER.Collider[] = [];
  const dynamicBodies = new Map<number, RAPIER.RigidBody>();
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
  let dynamicsEnabled = false;

  return {
    move: (position, desiredDelta) => {
      world.step();
      characterCollider.setTranslation(position);
      characterController.computeColliderMovement(characterCollider, desiredDelta);
      const movement = characterController.computedMovement();
      const nextPosition: PhysicsVector = {
        x: position.x + movement.x,
        y: position.y + movement.y,
        z: position.z + movement.z,
      };
      characterCollider.setTranslation(nextPosition);
      if (dynamicsEnabled) {
        world.step();
      }
      return {
        position: nextPosition,
        grounded: characterController.computedGrounded(),
        collisions: characterController.numComputedCollisions(),
      };
    },
    setDynamicBoxes: (boxes) => {
      for (const collider of streamedStaticColliders) {
        world.removeCollider(collider, true);
      }
      streamedStaticColliders.length = 0;
      for (const collider of dynamicColliders) {
        world.removeCollider(collider, true);
      }
      dynamicColliders.length = 0;
      dynamicBodies.clear();
      for (const box of boxes) {
        if (box.dynamic !== true) {
          streamedStaticColliders.push(addStaticBox(world, box));
          continue;
        }
        if (box.dynamicId === undefined) {
          continue;
        }
        const { body, collider } = addDynamicBox(world, { ...box, dynamicId: box.dynamicId });
        dynamicBodies.set(box.dynamicId, body);
        dynamicColliders.push(collider);
      }
      dynamicsEnabled = dynamicColliders.length > 0 || streamedStaticColliders.length > 0;
      // Rebuild the broad phase immediately so a newly streamed chunk is
      // solid on the next movement query rather than one simulation step
      // later.
      world.step();
      dynamicsEnabled = dynamicColliders.length > 0 || streamedStaticColliders.length > 0;
    },
    getDynamicBodyStates: () => {
      const states: PhysicsBodyState[] = [];
      for (const [dynamicId, body] of dynamicBodies.entries()) {
        const bodyPosition = body.translation();
        const bodyRotation = body.rotation();
        states.push({
          dynamicId,
          center: {
            x: bodyPosition.x,
            y: bodyPosition.y,
            z: bodyPosition.z,
          },
          rotation: {
            x: bodyRotation.x,
            y: bodyRotation.y,
            z: bodyRotation.z,
            w: bodyRotation.w,
          },
        });
      }
      return states;
    },
    applyImpulseToDynamicBody: (dynamicId, linearVelocity, angularVelocity) => {
      const body = dynamicBodies.get(dynamicId);
      if (body === undefined) {
        return;
      }
      const currentLinearVelocity = body.linvel();
      body.setLinvel(
        {
          x: currentLinearVelocity.x + linearVelocity.x,
          y: currentLinearVelocity.y + linearVelocity.y,
          z: currentLinearVelocity.z + linearVelocity.z,
        },
        true,
      );
      const currentAngularVelocity = body.angvel();
      body.setAngvel(
        {
          x: currentAngularVelocity.x + angularVelocity.x,
          y: currentAngularVelocity.y + angularVelocity.y,
          z: currentAngularVelocity.z + angularVelocity.z,
        },
        true,
      );
    },
    dispose: () => {
      world.removeCharacterController(characterController);
      for (const collider of [
        ...staticColliders,
        ...streamedStaticColliders,
        ...dynamicColliders,
      ]) {
        world.removeCollider(collider, true);
      }
      world.free();
    },
  };
};
