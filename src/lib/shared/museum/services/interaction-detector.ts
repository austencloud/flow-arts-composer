import type { ExhibitSlot } from "#lib/shared/museum/domain/museum-types.js";
import type { InteractionTarget } from "#lib/shared/museum/services/types.js";

const INTERACTION_DISTANCE = 3.0; // meters
const INTERACTION_ANGLE = Math.PI / 4; // 45 degrees

/**
 * Find the closest interactable exhibit slot within interaction distance and angle.
 */
export function findInteractableSlot(
  playerPosition: { x: number; y: number; z: number },
  cameraDirection: { x: number; y: number; z: number },
  slots: ExhibitSlot[]
): InteractionTarget | null {
  let closest: InteractionTarget | null = null;

  for (const slot of slots) {
    if (slot.type !== "wall") continue;

    const dx = slot.position.x - playerPosition.x;
    const dz = slot.position.z - playerPosition.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance > INTERACTION_DISTANCE) continue;

    // Check if player is looking at the slot
    const dirLength = Math.sqrt(cameraDirection.x ** 2 + cameraDirection.z ** 2);
    if (dirLength < 0.001) continue;

    const dotProduct = (dx * cameraDirection.x + dz * cameraDirection.z) / (distance * dirLength);
    const angle = Math.acos(Math.min(1, Math.max(-1, dotProduct)));

    if (angle > INTERACTION_ANGLE) continue;

    if (!closest || distance < closest.distance) {
      closest = { slot, distance };
    }
  }

  return closest;
}
