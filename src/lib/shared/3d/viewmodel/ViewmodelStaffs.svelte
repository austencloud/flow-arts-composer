<script lang="ts">
  /**
   * ViewmodelStaffs Component
   *
   * Renders the player's staffs in first-person view.
   * These are positioned relative to the camera (like holding props in front of you).
   *
   * Uses LAYER_VIEWMODEL so they're only visible to the first-person camera.
   *
   * Key design decisions:
   * - Staffs are positioned in camera-local space
   * - No arms for now - just floating props (can add later)
   * - Wider FOV-friendly positioning to avoid wall clipping
   */

  import { T, useThrelte } from "@threlte/core";
  import { Quaternion, Euler, Vector3 } from "three";
  import type { PropState3D } from "@austencloud/scene-3d";
  import { userProportionsState } from "@austencloud/scene-3d";
  import { LAYER_VIEWMODEL, reactivePropHandPalette } from "@austencloud/scene-3d";
  import { CameraMode } from "$lib/shared/3d/camera/types";

  interface Props {
    /** Blue prop state (left hand) */
    leftPropState: PropState3D | null;
    /** Red prop state (right hand) */
    rightPropState: PropState3D | null;
    /** Current camera mode - only render in first-person */
    cameraMode: CameraMode;
    /** Whether to show blue prop */
    showLeft?: boolean;
    /** Whether to show red prop */
    showRight?: boolean;
  }

  let {
    leftPropState,
    rightPropState,
    cameraMode,
    showLeft = true,
    showRight = true,
  }: Props = $props();

  // Only render in first-person mode
  const isFirstPerson = $derived(cameraMode === CameraMode.FIRST_PERSON);

  // Get camera from Threlte context for positioning
  const { camera } = useThrelte();

  // Staff dimensions from user proportions
  const staffLength = $derived(userProportionsState.staffLength);
  const staffThickness = $derived(
    userProportionsState.dimensions.staffRadius * 2
  );

  // T-bar dimensions - proportional to staff (same as Staff3D)
  const tBarLength = $derived(staffLength * 0.228);
  const tBarThickness = $derived(staffThickness);

  // Half length for positioning end caps
  const halfLength = $derived(staffLength / 2);

  // The hand colors every other prop is painted in
  const colors = $derived({
    left: reactivePropHandPalette("blue"),
    right: reactivePropHandPalette("red"),
  });

  // Viewmodel configuration
  const VIEWMODEL_CONFIG = {
    // How much to scale down prop positions for viewmodel
    // Props are ~300 units from center in world space, viewmodel should be ~100 units in front
    positionScale: 0.4,
    // Forward offset to bring props closer to camera
    forwardOffset: -60,
    // Down offset (viewmodel is below eye level)
    downOffset: -30,
  };

  /**
   * Transform prop world position to viewmodel position (camera-local space).
   *
   * The prop's worldPosition is relative to the grid center (in front of avatar).
   * We transform this to camera-local coordinates so the staffs appear to float
   * in front of the player's view, animated based on the actual motion data.
   */
  function getViewmodelPosition(
    propState: PropState3D | null
  ): [number, number, number] {
    const cam = camera.current;
    if (!cam || !propState) return [0, 0, 0];

    // Get the prop's position relative to the grid center
    // This is already in the correct coordinate system (X = right, Y = up, Z = forward)
    const propPos = propState.worldPosition;

    // Scale and offset for viewmodel appearance
    // The prop positions from the animation are large (grid radius ~300)
    // We scale them down for the viewmodel which is closer to the camera
    const viewmodelLocal = new Vector3(
      propPos.x * VIEWMODEL_CONFIG.positionScale,
      propPos.y * VIEWMODEL_CONFIG.positionScale + VIEWMODEL_CONFIG.downOffset,
      propPos.z * VIEWMODEL_CONFIG.positionScale + VIEWMODEL_CONFIG.forwardOffset
    );

    // Transform from camera-local to world space
    viewmodelLocal.applyQuaternion(cam.quaternion);
    viewmodelLocal.add(cam.position);

    return [viewmodelLocal.x, viewmodelLocal.y, viewmodelLocal.z];
  }

  /**
   * Calculate viewmodel rotation for a staff.
   *
   * The prop's worldRotation already encodes the staff orientation.
   * We combine this with the camera rotation so the staffs appear
   * to rotate correctly in the player's view.
   */
  function getViewmodelRotation(
    propState: PropState3D | null
  ): [number, number, number] {
    const cam = camera.current;
    if (!cam) return [0, 0, 0];

    // Get the prop's rotation from animation data
    const propQuat = propState?.worldRotation ?? new Quaternion();

    // The cylinder is vertical by default, rotate 90° to make horizontal
    const horizontalQuat = new Quaternion().setFromEuler(
      new Euler(0, 0, Math.PI / 2)
    );

    // Combine: horizontal -> prop rotation -> camera rotation
    // This makes the staff rotate with both the animation AND the camera
    const finalQuat = cam.quaternion
      .clone()
      .multiply(propQuat)
      .multiply(horizontalQuat);

    const euler = new Euler().setFromQuaternion(finalQuat);
    return [euler.x, euler.y, euler.z];
  }

  // Reactive positions and rotations (now based on actual prop positions)
  const leftPosition = $derived(getViewmodelPosition(leftPropState));
  const rightPosition = $derived(getViewmodelPosition(rightPropState));
  const leftRotation = $derived(getViewmodelRotation(leftPropState));
  const rightRotation = $derived(getViewmodelRotation(rightPropState));
</script>

{#if isFirstPerson}
  <!-- Blue staff (left hand) -->
  {#if showLeft && leftPropState}
    <T.Group
      position={leftPosition}
      rotation={leftRotation}
      layers={LAYER_VIEWMODEL}
    >
      <!-- Main staff body -->
      <T.Mesh>
        <T.CylinderGeometry
          args={[staffThickness, staffThickness, staffLength, 16, 1]}
        />
        <T.MeshStandardMaterial
          color={colors.left.main}
          roughness={0.3}
          metalness={0.2}
        />
      </T.Mesh>

      <!-- T-bar at thumb end -->
      <T.Group position={[0, halfLength, 0]}>
        <T.Mesh rotation={[0, 0, Math.PI / 2]}>
          <T.CylinderGeometry
            args={[tBarThickness, tBarThickness, tBarLength, 12, 1]}
          />
          <T.MeshStandardMaterial
            color={colors.left.main}
            roughness={0.3}
            metalness={0.2}
          />
        </T.Mesh>
        <T.Mesh position={[-tBarLength / 2, 0, 0]}>
          <T.SphereGeometry args={[tBarThickness, 12, 12]} />
          <T.MeshStandardMaterial
            color={colors.left.dark}
            roughness={0.3}
            metalness={0.2}
          />
        </T.Mesh>
        <T.Mesh position={[tBarLength / 2, 0, 0]}>
          <T.SphereGeometry args={[tBarThickness, 12, 12]} />
          <T.MeshStandardMaterial
            color={colors.left.dark}
            roughness={0.3}
            metalness={0.2}
          />
        </T.Mesh>
      </T.Group>

      <!-- Rounded cap at other end -->
      <T.Mesh position={[0, -halfLength, 0]}>
        <T.SphereGeometry args={[staffThickness, 16, 16]} />
        <T.MeshStandardMaterial
          color={colors.left.dark}
          roughness={0.3}
          metalness={0.2}
        />
      </T.Mesh>

      <!-- Center grip ring -->
      <T.Mesh>
        <T.TorusGeometry
          args={[staffThickness * 1.15, staffThickness * 0.15, 12, 24]}
        />
        <T.MeshStandardMaterial color="white" roughness={0.4} metalness={0.1} />
      </T.Mesh>
    </T.Group>
  {/if}

  <!-- Red staff (right hand) -->
  {#if showRight && rightPropState}
    <T.Group
      position={rightPosition}
      rotation={rightRotation}
      layers={LAYER_VIEWMODEL}
    >
      <!-- Main staff body -->
      <T.Mesh>
        <T.CylinderGeometry
          args={[staffThickness, staffThickness, staffLength, 16, 1]}
        />
        <T.MeshStandardMaterial
          color={colors.right.main}
          roughness={0.3}
          metalness={0.2}
        />
      </T.Mesh>

      <!-- T-bar at thumb end -->
      <T.Group position={[0, halfLength, 0]}>
        <T.Mesh rotation={[0, 0, Math.PI / 2]}>
          <T.CylinderGeometry
            args={[tBarThickness, tBarThickness, tBarLength, 12, 1]}
          />
          <T.MeshStandardMaterial
            color={colors.right.main}
            roughness={0.3}
            metalness={0.2}
          />
        </T.Mesh>
        <T.Mesh position={[-tBarLength / 2, 0, 0]}>
          <T.SphereGeometry args={[tBarThickness, 12, 12]} />
          <T.MeshStandardMaterial
            color={colors.right.dark}
            roughness={0.3}
            metalness={0.2}
          />
        </T.Mesh>
        <T.Mesh position={[tBarLength / 2, 0, 0]}>
          <T.SphereGeometry args={[tBarThickness, 12, 12]} />
          <T.MeshStandardMaterial
            color={colors.right.dark}
            roughness={0.3}
            metalness={0.2}
          />
        </T.Mesh>
      </T.Group>

      <!-- Rounded cap at other end -->
      <T.Mesh position={[0, -halfLength, 0]}>
        <T.SphereGeometry args={[staffThickness, 16, 16]} />
        <T.MeshStandardMaterial
          color={colors.right.dark}
          roughness={0.3}
          metalness={0.2}
        />
      </T.Mesh>

      <!-- Center grip ring -->
      <T.Mesh>
        <T.TorusGeometry
          args={[staffThickness * 1.15, staffThickness * 0.15, 12, 24]}
        />
        <T.MeshStandardMaterial color="white" roughness={0.4} metalness={0.1} />
      </T.Mesh>
    </T.Group>
  {/if}
{/if}
