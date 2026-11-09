/**
 * Instanced Vegetation Renderer
 *
 * Uses Three.js InstancedMesh for GPU-efficient rendering of vegetation.
 * A single draw call renders thousands of trees/rocks/grass.
 *
 * Architecture:
 * - Batches vegetation by CATEGORY (tree, rock, bush, etc.) not individual model
 * - 12 categories = max 12 InstancedMesh draw calls (vs. 329 if per-model)
 * - Uses the new 329-model system via ModelRegistry
 * - Maintains backward compatibility with legacy VegetationType
 *
 * Features:
 * - Automatic batching by vegetation category
 * - Dynamic instance buffer updates
 * - LOD support with procedural fallback
 * - Frustum culling at batch level (bounds cover every live instance)
 * - Model variety through random selection within categories
 */

import {
  InstancedMesh,
  Object3D,
  Matrix4,
  Vector3,
  Quaternion,
  Euler,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  MeshStandardMaterial,
  MeshLambertMaterial,
  type Scene,
  type Material,
} from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { VegetationData } from "../workers/chunk-generator.worker";
import { ModelCache } from "./model-cache";
import type { VegetationCategory } from "../vegetation/domain/vegetation-categories";
import { SCATTER_CATEGORIES } from "../vegetation/domain/vegetation-categories";


/**
 * Legacy vegetation types for backward compatibility with worker
 */
export type LegacyVegetationType =
  | "tree1" | "tree2" | "tree3"
  | "rock1" | "rock2"
  | "bush1" | "bush2"
  | "grass";

/**
 * All supported vegetation types (legacy + new categories)
 */
export type VegetationType = LegacyVegetationType | VegetationCategory;

interface VegetationBatch {
  mesh: InstancedMesh;
  instances: Map<string, number>; // chunkKey -> startIndex
  instanceCount: number;
  maxInstances: number;
  dirty: boolean;
}

interface VegetationConfig {
  maxInstancesPerCategory: number;
  maxGrassInstances: number;
  useGLTFModels: boolean;
  useNewModelSystem: boolean;
}


const DEFAULT_CONFIG: VegetationConfig = {
  maxInstancesPerCategory: 10000, // Per category (tree, rock, etc.)
  maxGrassInstances: 50000,
  useGLTFModels: true,
  useNewModelSystem: true, // Enable the 329-model system
};

// Map legacy types to categories
const LEGACY_TO_CATEGORY: Record<LegacyVegetationType, VegetationCategory> = {
  tree1: "tree",
  tree2: "tree",
  tree3: "tree",
  rock1: "rock",
  rock2: "rock",
  bush1: "bush",
  bush2: "bush",
  grass: "grass",
};


export class VegetationManager {
  private scene: Scene;
  private config: VegetationConfig;
  private batches: Map<VegetationCategory, VegetationBatch> = new Map();
  private legacyBatches: Map<LegacyVegetationType, VegetationBatch> = new Map();
  private chunkVegetation: Map<string, VegetationData[]> = new Map();
  private modelCache: ModelCache | null = null;
  private initialized = false;
  private useNewSystem = false;
  private materialCache = new Map<string, Material>();

  // Temporary objects for matrix composition (avoid GC)
  private tempObject = new Object3D();
  private tempMatrix = new Matrix4();
  private tempPosition = new Vector3();
  private tempQuaternion = new Quaternion();
  private tempScale = new Vector3();
  private tempEuler = new Euler();

  constructor(scene: Scene, config: Partial<VegetationConfig> = {}) {
    this.scene = scene;
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.useGLTFModels) {
      this.modelCache = new ModelCache();
    } else {
      this.initProceduralBatches();
    }
  }

  /**
   * Initialize with GLTF models (async)
   */
  async initWithModels(): Promise<void> {
    if (this.initialized) return;

    if (this.modelCache && this.config.useNewModelSystem) {
      try {
        await this.modelCache.initRegistry();

        // Preload categories we'll use for scattering
        const categoriesToPreload: VegetationCategory[] = ["tree", "pine", "rock", "bush", "grass", "flower"];
        await Promise.all(
          categoriesToPreload.map(cat => this.modelCache!.preloadCategory(cat))
        );

        this.initCategoryBatches();
        this.useNewSystem = true;
      } catch (error) {
        console.warn("[VegetationManager] Failed to initialize new model system, falling back to legacy", error);
        await this.initLegacySystem();
      }
    } else if (this.modelCache) {
      await this.initLegacySystem();
    } else {
      this.initProceduralBatches();
    }

    this.initialized = true;
  }

  private async initLegacySystem(): Promise<void> {
    try {
      await this.modelCache!.preloadForestModels();
      this.initLegacyBatchesWithGLTF();
      this.useNewSystem = false;
    } catch (error) {
      console.warn("[VegetationManager] Failed to load GLTF models, falling back to procedural", error);
      this.initProceduralBatches();
    }
  }

  // CATEGORY-BASED INITIALIZATION (New System)

  private initCategoryBatches(): void {
    const maxPerCategory = this.config.maxInstancesPerCategory;
    const registry = this.modelCache?.getRegistry();

    // Create a batch for each scatter category
    for (const category of SCATTER_CATEGORIES) {
      const maxInstances = category === "grass" ? this.config.maxGrassInstances : maxPerCategory;

      // Try to get a model from the registry first
      let geometry: BufferGeometry;
      let material: Material;

      if (registry?.isInitialized()) {
        // Get all models in this category and pick one for the batch geometry
        const models = registry.getModelsInCategory(category);
        if (models.length > 0) {
          // Use the first available cached model as the "representative" geometry
          const cachedModel = registry.getCachedModel(models[0]!.id);
          if (cachedModel) {
            geometry = cachedModel.geometry;
            material = cachedModel.material;
          } else {
            // Model not cached yet, fall back to procedural
            const procedural = this.getProceduralGeometryForCategory(category);
            geometry = procedural.geometry;
            material = procedural.material;
          }
        } else {
          // No models in this category, use procedural
          const procedural = this.getProceduralGeometryForCategory(category);
          geometry = procedural.geometry;
          material = procedural.material;
        }
      } else {
        // Registry not ready, use procedural
        const procedural = this.getProceduralGeometryForCategory(category);
        geometry = procedural.geometry;
        material = procedural.material;
      }

      this.createCategoryBatch(category, geometry, material, maxInstances);
    }
  }

  private createCategoryBatch(
    category: VegetationCategory,
    geometry: BufferGeometry,
    material: Material,
    maxInstances: number
  ): void {
    const mesh = new InstancedMesh(geometry, material, maxInstances);
    mesh.count = 0;
    // Culling stays on: commitInstances() keeps the mesh's bounding sphere
    // around every live instance, so three.js no longer tests the base model's
    // bounds at the origin.
    mesh.frustumCulled = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `vegetation_${category}`;

    // Initialize all matrices to identity
    const identity = new Matrix4();
    for (let i = 0; i < maxInstances; i++) {
      mesh.setMatrixAt(i, identity);
    }
    mesh.instanceMatrix.needsUpdate = true;

    this.scene.add(mesh);

    this.batches.set(category, {
      mesh,
      instances: new Map(),
      instanceCount: 0,
      maxInstances,
      dirty: false,
    });
  }

  private getProceduralGeometryForCategory(category: VegetationCategory): { geometry: BufferGeometry; material: Material } {
    const cached = this.materialCache.get(category);
    if (cached) {
      return { geometry: this.createGeometryForCategory(category), material: cached };
    }

    const result = this.createProceduralGeometryAndMaterial(category);
    this.materialCache.set(category, result.material);
    return result;
  }

  private createGeometryForCategory(category: VegetationCategory): BufferGeometry {
    switch (category) {
      case "tree":
      case "pine":
      case "palm":
        return this.createTreeGeometry();
      case "rock":
        return this.createRockGeometry();
      case "bush": {
        const bushGeom = this.createTreeGeometry();
        bushGeom.scale(0.3, 0.4, 0.3);
        return bushGeom;
      }
      case "grass":
      case "flower":
        return this.createGrassGeometry();
      case "mushroom":
        return this.createMushroomGeometry();
      case "log":
        return this.createLogGeometry();
      case "cactus":
        return this.createCactusGeometry();
      default:
        return new BufferGeometry();
    }
  }

  private createProceduralGeometryAndMaterial(category: VegetationCategory): { geometry: BufferGeometry; material: Material } {
    switch (category) {
      case "tree":
      case "pine":
      case "palm":
        return {
          geometry: this.createTreeGeometry(),
          material: new MeshStandardMaterial({
            color: category === "pine" ? 0x1a472a : category === "palm" ? 0x228b22 : 0x2d5a27,
            flatShading: true,
            roughness: 0.85,
            metalness: 0.0,
          }),
        };
      case "rock":
        return {
          geometry: this.createRockGeometry(),
          material: new MeshStandardMaterial({
            color: 0x696969,
            flatShading: true,
            roughness: 0.75,
            metalness: 0.1,
          }),
        };
      case "bush": {
        const bushGeom = this.createTreeGeometry();
        bushGeom.scale(0.3, 0.4, 0.3);
        return {
          geometry: bushGeom,
          material: new MeshStandardMaterial({
            color: 0x3d6b2d,
            flatShading: true,
            roughness: 0.9,
            metalness: 0.0,
          }),
        };
      }
      case "grass":
        return {
          geometry: this.createGrassGeometry(),
          material: new MeshLambertMaterial({
            color: 0x4a7c3f,
            flatShading: true,
            side: 2,
          }),
        };
      case "flower":
        return {
          geometry: this.createGrassGeometry(),
          material: new MeshLambertMaterial({
            color: 0xff69b4,
            flatShading: true,
            side: 2,
          }),
        };
      case "mushroom":
        return {
          geometry: this.createMushroomGeometry(),
          material: new MeshStandardMaterial({
            color: 0xcd853f,
            flatShading: true,
            roughness: 0.9,
          }),
        };
      case "log":
        return {
          geometry: this.createLogGeometry(),
          material: new MeshStandardMaterial({
            color: 0x8b4513,
            flatShading: true,
            roughness: 0.9,
          }),
        };
      case "cactus":
        return {
          geometry: this.createCactusGeometry(),
          material: new MeshStandardMaterial({
            color: 0x228b22,
            flatShading: true,
            roughness: 0.8,
          }),
        };
      default:
        return {
          geometry: new BufferGeometry(),
          material: new MeshStandardMaterial(),
        };
    }
  }

  // ==========================================================================
  // LEGACY INITIALIZATION (Backward Compatibility)
  // ==========================================================================

  private initProceduralBatches(): void {
    const maxPerType = this.config.maxInstancesPerCategory;

    // Create tree batches
    const treeGeometry = this.createTreeGeometry();
    const treeMaterial = new MeshStandardMaterial({
      color: 0x2d5a27,
      flatShading: true,
      roughness: 0.85,
      metalness: 0.0,
    });
    this.createLegacyBatch("tree1", treeGeometry.clone(), treeMaterial.clone(), maxPerType);
    this.createLegacyBatch("tree2", treeGeometry.clone(), treeMaterial.clone(), maxPerType);
    this.createLegacyBatch("tree3", treeGeometry.clone(), treeMaterial.clone(), maxPerType);

    // Create rock batches
    const rockGeometry = this.createRockGeometry();
    const rockMaterial = new MeshStandardMaterial({
      color: 0x696969,
      flatShading: true,
      roughness: 0.75,
      metalness: 0.1,
    });
    this.createLegacyBatch("rock1", rockGeometry.clone(), rockMaterial.clone(), maxPerType);
    this.createLegacyBatch("rock2", rockGeometry.clone(), rockMaterial.clone(), maxPerType);

    // Create bush batches
    const bushGeometry = this.createTreeGeometry();
    bushGeometry.scale(0.3, 0.4, 0.3);
    const bushMaterial = new MeshStandardMaterial({
      color: 0x3d6b2d,
      flatShading: true,
      roughness: 0.9,
      metalness: 0.0,
    });
    this.createLegacyBatch("bush1", bushGeometry.clone(), bushMaterial.clone(), maxPerType);
    this.createLegacyBatch("bush2", bushGeometry.clone(), bushMaterial.clone(), maxPerType);

    // Create grass batch
    const grassGeometry = this.createGrassGeometry();
    const grassMaterial = new MeshLambertMaterial({
      color: 0x4a7c3f,
      flatShading: true,
      side: 2,
    });
    this.createLegacyBatch("grass", grassGeometry, grassMaterial, this.config.maxGrassInstances);
  }

  private initLegacyBatchesWithGLTF(): void {
    if (!this.modelCache) return;

    const maxPerType = this.config.maxInstancesPerCategory;

    // Create batches for each legacy tree variant
    for (const treeType of ["tree1", "tree2", "tree3"] as LegacyVegetationType[]) {
      const model = this.modelCache.getModel(treeType);
      if (model) {
        this.createLegacyBatch(treeType, model.geometry.clone(), model.material.clone(), maxPerType);
      }
    }

    // Create batches for each rock variant
    for (const rockType of ["rock1", "rock2"] as LegacyVegetationType[]) {
      const model = this.modelCache.getModel(rockType);
      if (model) {
        this.createLegacyBatch(rockType, model.geometry.clone(), model.material.clone(), maxPerType);
      }
    }

    // Create batches for each bush variant
    for (const bushType of ["bush1", "bush2"] as LegacyVegetationType[]) {
      const model = this.modelCache.getModel(bushType);
      if (model) {
        this.createLegacyBatch(bushType, model.geometry.clone(), model.material.clone(), maxPerType);
      }
    }

    // Grass still uses procedural
    const grassGeometry = this.createGrassGeometry();
    const grassMaterial = new MeshLambertMaterial({
      color: 0x4a7c3f,
      flatShading: true,
      side: 2,
    });
    this.createLegacyBatch("grass", grassGeometry, grassMaterial, this.config.maxGrassInstances);
  }

  private createLegacyBatch(
    type: LegacyVegetationType,
    geometry: BufferGeometry,
    material: Material,
    maxInstances: number
  ): void {
    const mesh = new InstancedMesh(geometry, material, maxInstances);
    mesh.count = 0;
    // Culling stays on: commitInstances() keeps the mesh's bounding sphere
    // around every live instance, so three.js no longer tests the base model's
    // bounds at the origin.
    mesh.frustumCulled = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `vegetation_${type}`;

    // Initialize all matrices to identity
    const identity = new Matrix4();
    for (let i = 0; i < maxInstances; i++) {
      mesh.setMatrixAt(i, identity);
    }
    mesh.instanceMatrix.needsUpdate = true;

    this.scene.add(mesh);

    this.legacyBatches.set(type, {
      mesh,
      instances: new Map(),
      instanceCount: 0,
      maxInstances,
      dirty: false,
    });
  }

  // ==========================================================================
  // PROCEDURAL GEOMETRY
  // ==========================================================================

  private createTreeGeometry(): BufferGeometry {
    const geometries: BufferGeometry[] = [];

    // Trunk
    const trunk = new CylinderGeometry(0.4, 0.6, 3, 6);
    trunk.translate(0, 1.5, 0);

    // Foliage layers
    const foliage1 = new ConeGeometry(3, 4, 7);
    foliage1.translate(0, 5, 0);

    const foliage2 = new ConeGeometry(2.2, 3.5, 7);
    foliage2.translate(0, 7.5, 0);

    const foliage3 = new ConeGeometry(1.4, 3, 7);
    foliage3.translate(0, 9.5, 0);

    geometries.push(trunk, foliage1, foliage2, foliage3);

    const merged = BufferGeometryUtils.mergeGeometries(geometries);
    if (!merged) {
      const fallback = new ConeGeometry(2, 8, 6);
      fallback.translate(0, 4, 0);
      return fallback;
    }

    return merged;
  }

  private createRockGeometry(): BufferGeometry {
    const geometry = new DodecahedronGeometry(1, 0);

    const positions = geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i);
      positions.setY(i, y * 0.6);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    return geometry;
  }

  private createGrassGeometry(): BufferGeometry {
    const geometry = new BufferGeometry();

    const positions = new Float32Array([
      -0.05, 0, 0,
      0.05, 0, 0,
      0, 0.5, 0,
    ]);

    const normals = new Float32Array([
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
    ]);

    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));

    return geometry;
  }

  private createMushroomGeometry(): BufferGeometry {
    const geometries: BufferGeometry[] = [];

    // Stem
    const stem = new CylinderGeometry(0.1, 0.15, 0.3, 6);
    stem.translate(0, 0.15, 0);

    // Cap
    const cap = new ConeGeometry(0.25, 0.15, 8);
    cap.rotateX(Math.PI);
    cap.translate(0, 0.35, 0);

    geometries.push(stem, cap);

    const merged = BufferGeometryUtils.mergeGeometries(geometries);
    return merged ?? new BufferGeometry();
  }

  private createLogGeometry(): BufferGeometry {
    const geometry = new CylinderGeometry(0.3, 0.35, 2, 8);
    geometry.rotateZ(Math.PI / 2);
    geometry.translate(0, 0.25, 0);
    return geometry;
  }

  private createCactusGeometry(): BufferGeometry {
    const geometries: BufferGeometry[] = [];

    // Main body
    const body = new CylinderGeometry(0.3, 0.35, 1.5, 8);
    body.translate(0, 0.75, 0);

    // Arms
    const arm1 = new CylinderGeometry(0.15, 0.15, 0.6, 6);
    arm1.rotateZ(Math.PI / 4);
    arm1.translate(0.4, 1.0, 0);

    const arm2 = new CylinderGeometry(0.15, 0.15, 0.5, 6);
    arm2.rotateZ(-Math.PI / 4);
    arm2.translate(-0.35, 0.8, 0);

    geometries.push(body, arm1, arm2);

    const merged = BufferGeometryUtils.mergeGeometries(geometries);
    return merged ?? new BufferGeometry();
  }

  // ==========================================================================
  // CHUNK VEGETATION MANAGEMENT
  // ==========================================================================

  /**
   * Add vegetation for a chunk
   */
  addChunkVegetation(
    chunkKey: string,
    chunkWorldX: number,
    chunkWorldZ: number,
    vegetation: VegetationData[]
  ): void {
    if (vegetation.length === 0) return;

    // Store vegetation data
    this.chunkVegetation.set(chunkKey, vegetation);

    if (this.useNewSystem) {
      // New system: group by category
      const byCategory = new Map<VegetationCategory, VegetationData[]>();
      for (const v of vegetation) {
        const category = this.getCategory(v.type);
        const list = byCategory.get(category) || [];
        list.push(v);
        byCategory.set(category, list);
      }

      for (const [category, items] of byCategory) {
        this.addToCategoryBatch(category, chunkKey, chunkWorldX, chunkWorldZ, items);
      }
    } else {
      // Legacy system: group by type
      const byType = new Map<LegacyVegetationType, VegetationData[]>();
      for (const v of vegetation) {
        if (this.isLegacyType(v.type)) {
          const list = byType.get(v.type as LegacyVegetationType) || [];
          list.push(v);
          byType.set(v.type as LegacyVegetationType, list);
        }
      }

      for (const [type, items] of byType) {
        this.addToLegacyBatch(type, chunkKey, chunkWorldX, chunkWorldZ, items);
      }
    }
  }

  /**
   * Remove vegetation for a chunk
   */
  removeChunkVegetation(chunkKey: string): void {
    const vegetation = this.chunkVegetation.get(chunkKey);
    if (!vegetation) return;

    if (this.useNewSystem) {
      const categories = new Set(vegetation.map(v => this.getCategory(v.type)));
      for (const category of categories) {
        this.removeFromCategoryBatch(category, chunkKey);
      }
    } else {
      const types = new Set(
        vegetation
          .filter(v => this.isLegacyType(v.type))
          .map(v => v.type as LegacyVegetationType)
      );
      for (const type of types) {
        this.removeFromLegacyBatch(type, chunkKey);
      }
    }

    this.chunkVegetation.delete(chunkKey);
  }

  private getCategory(type: string): VegetationCategory {
    if (type in LEGACY_TO_CATEGORY) {
      return LEGACY_TO_CATEGORY[type as LegacyVegetationType];
    }
    // Assume it's already a category
    return type as VegetationCategory;
  }

  private isLegacyType(type: string): type is LegacyVegetationType {
    return type in LEGACY_TO_CATEGORY;
  }

  private addToCategoryBatch(
    category: VegetationCategory,
    chunkKey: string,
    chunkWorldX: number,
    chunkWorldZ: number,
    items: VegetationData[]
  ): void {
    const batch = this.batches.get(category);
    if (!batch) return;

    const startIndex = batch.instanceCount;
    const count = Math.min(items.length, batch.maxInstances - batch.instanceCount);

    if (count <= 0) return;

    for (let i = 0; i < count; i++) {
      const item = items[i]!;
      const instanceIndex = startIndex + i;

      this.tempPosition.set(
        chunkWorldX + item.x,
        item.y,
        chunkWorldZ + item.z
      );
      this.tempEuler.set(0, item.rotation, 0);
      this.tempQuaternion.setFromEuler(this.tempEuler);
      this.tempScale.setScalar(item.scale);

      this.tempObject.position.copy(this.tempPosition);
      this.tempObject.quaternion.copy(this.tempQuaternion);
      this.tempObject.scale.copy(this.tempScale);
      this.tempObject.updateMatrix();

      batch.mesh.setMatrixAt(instanceIndex, this.tempObject.matrix);
    }

    batch.instances.set(chunkKey, startIndex);
    batch.instanceCount += count;
    this.commitInstances(batch);
  }

  private addToLegacyBatch(
    type: LegacyVegetationType,
    chunkKey: string,
    chunkWorldX: number,
    chunkWorldZ: number,
    items: VegetationData[]
  ): void {
    const batch = this.legacyBatches.get(type);
    if (!batch) return;

    const startIndex = batch.instanceCount;
    const count = Math.min(items.length, batch.maxInstances - batch.instanceCount);

    if (count <= 0) return;

    for (let i = 0; i < count; i++) {
      const item = items[i]!;
      const instanceIndex = startIndex + i;

      this.tempPosition.set(
        chunkWorldX + item.x,
        item.y,
        chunkWorldZ + item.z
      );
      this.tempEuler.set(0, item.rotation, 0);
      this.tempQuaternion.setFromEuler(this.tempEuler);
      this.tempScale.setScalar(item.scale);

      this.tempObject.position.copy(this.tempPosition);
      this.tempObject.quaternion.copy(this.tempQuaternion);
      this.tempObject.scale.copy(this.tempScale);
      this.tempObject.updateMatrix();

      batch.mesh.setMatrixAt(instanceIndex, this.tempObject.matrix);
    }

    batch.instances.set(chunkKey, startIndex);
    batch.instanceCount += count;
    this.commitInstances(batch);
  }

  private removeFromCategoryBatch(category: VegetationCategory, chunkKey: string): void {
    const batch = this.batches.get(category);
    if (!batch) return;

    batch.instances.delete(chunkKey);
    batch.dirty = true;
  }

  private removeFromLegacyBatch(type: LegacyVegetationType, chunkKey: string): void {
    const batch = this.legacyBatches.get(type);
    if (!batch) return;

    batch.instances.delete(chunkKey);
    batch.dirty = true;
  }

  /**
   * Publishes a batch's instance writes: the draw count, the matrix upload, and
   * bounds that cover every live instance. three.js culls an InstancedMesh by
   * its own boundingSphere, so it must be recomputed whenever instances move;
   * a stale sphere would cull trees that are on screen.
   */
  private commitInstances(batch: VegetationBatch): void {
    const mesh = batch.mesh;
    mesh.count = batch.instanceCount;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    // The box is only used by raycasts; let three.js rebuild it on demand.
    mesh.boundingBox = null;
  }

  /**
   * Rebuild dirty batches (called periodically)
   */
  rebuildDirtyBatches(): void {
    if (this.useNewSystem) {
      for (const [category, batch] of this.batches) {
        if (!batch.dirty) continue;
        this.rebuildCategoryBatch(category, batch);
      }
    } else {
      for (const [type, batch] of this.legacyBatches) {
        if (!batch.dirty) continue;
        this.rebuildLegacyBatch(type, batch);
      }
    }
  }

  private rebuildCategoryBatch(category: VegetationCategory, batch: VegetationBatch): void {
    batch.instanceCount = 0;

    for (const [chunkKey, vegetation] of this.chunkVegetation) {
      const items = vegetation.filter(v => this.getCategory(v.type) === category);
      if (items.length === 0) continue;

      const parts = chunkKey.split(",").map(Number);
      const chunkWorldX = (parts[0] ?? 0) * 32;
      const chunkWorldZ = (parts[2] ?? 0) * 32;

      const startIndex = batch.instanceCount;
      const count = Math.min(items.length, batch.maxInstances - batch.instanceCount);

      for (let i = 0; i < count; i++) {
        const item = items[i]!;
        const instanceIndex = startIndex + i;

        this.tempPosition.set(
          chunkWorldX + item.x,
          item.y,
          chunkWorldZ + item.z
        );
        this.tempEuler.set(0, item.rotation, 0);
        this.tempQuaternion.setFromEuler(this.tempEuler);
        this.tempScale.setScalar(item.scale);

        this.tempObject.position.copy(this.tempPosition);
        this.tempObject.quaternion.copy(this.tempQuaternion);
        this.tempObject.scale.copy(this.tempScale);
        this.tempObject.updateMatrix();

        batch.mesh.setMatrixAt(instanceIndex, this.tempObject.matrix);
      }

      batch.instances.set(chunkKey, startIndex);
      batch.instanceCount += count;
    }

    this.commitInstances(batch);
    batch.dirty = false;
  }

  private rebuildLegacyBatch(type: LegacyVegetationType, batch: VegetationBatch): void {
    batch.instanceCount = 0;

    for (const [chunkKey, vegetation] of this.chunkVegetation) {
      const items = vegetation.filter(v => v.type === type);
      if (items.length === 0) continue;

      const parts = chunkKey.split(",").map(Number);
      const chunkWorldX = (parts[0] ?? 0) * 32;
      const chunkWorldZ = (parts[2] ?? 0) * 32;

      const startIndex = batch.instanceCount;
      const count = Math.min(items.length, batch.maxInstances - batch.instanceCount);

      for (let i = 0; i < count; i++) {
        const item = items[i]!;
        const instanceIndex = startIndex + i;

        this.tempPosition.set(
          chunkWorldX + item.x,
          item.y,
          chunkWorldZ + item.z
        );
        this.tempEuler.set(0, item.rotation, 0);
        this.tempQuaternion.setFromEuler(this.tempEuler);
        this.tempScale.setScalar(item.scale);

        this.tempObject.position.copy(this.tempPosition);
        this.tempObject.quaternion.copy(this.tempQuaternion);
        this.tempObject.scale.copy(this.tempScale);
        this.tempObject.updateMatrix();

        batch.mesh.setMatrixAt(instanceIndex, this.tempObject.matrix);
      }

      batch.instances.set(chunkKey, startIndex);
      batch.instanceCount += count;
    }

    this.commitInstances(batch);
    batch.dirty = false;
  }

  // ==========================================================================
  // STATS & CLEANUP
  // ==========================================================================

  getStats(): { trees: number; rocks: number; bushes: number; grass: number; totalCategories?: number } {
    if (this.useNewSystem) {
      return {
        trees: (this.batches.get("tree")?.instanceCount ?? 0) +
               (this.batches.get("pine")?.instanceCount ?? 0) +
               (this.batches.get("palm")?.instanceCount ?? 0),
        rocks: this.batches.get("rock")?.instanceCount ?? 0,
        bushes: this.batches.get("bush")?.instanceCount ?? 0,
        grass: this.batches.get("grass")?.instanceCount ?? 0,
        totalCategories: this.batches.size,
      };
    } else {
      return {
        trees:
          (this.legacyBatches.get("tree1")?.instanceCount ?? 0) +
          (this.legacyBatches.get("tree2")?.instanceCount ?? 0) +
          (this.legacyBatches.get("tree3")?.instanceCount ?? 0),
        rocks:
          (this.legacyBatches.get("rock1")?.instanceCount ?? 0) +
          (this.legacyBatches.get("rock2")?.instanceCount ?? 0),
        bushes:
          (this.legacyBatches.get("bush1")?.instanceCount ?? 0) +
          (this.legacyBatches.get("bush2")?.instanceCount ?? 0),
        grass: this.legacyBatches.get("grass")?.instanceCount ?? 0,
      };
    }
  }

  /** Whether the vegetation batches draw into the sun's shadow map. */
  setCastShadow(enabled: boolean): void {
    for (const batch of this.batches.values()) batch.mesh.castShadow = enabled;
    for (const batch of this.legacyBatches.values()) batch.mesh.castShadow = enabled;
  }

  /**
   * Set visibility of all vegetation batches
   */
  setVisible(visible: boolean): void {
    for (const batch of this.batches.values()) {
      batch.mesh.visible = visible;
    }
    for (const batch of this.legacyBatches.values()) {
      batch.mesh.visible = visible;
    }
  }

  dispose(): void {
    // Dispose category batches
    for (const batch of this.batches.values()) {
      this.scene.remove(batch.mesh);
      batch.mesh.geometry.dispose();
      if (Array.isArray(batch.mesh.material)) {
        batch.mesh.material.forEach(m => m.dispose());
      } else {
        batch.mesh.material.dispose();
      }
    }
    this.batches.clear();

    // Dispose legacy batches
    for (const batch of this.legacyBatches.values()) {
      this.scene.remove(batch.mesh);
      batch.mesh.geometry.dispose();
      if (Array.isArray(batch.mesh.material)) {
        batch.mesh.material.forEach(m => m.dispose());
      } else {
        batch.mesh.material.dispose();
      }
    }
    this.legacyBatches.clear();

    // Dispose cached materials
    for (const mat of this.materialCache.values()) {
      mat.dispose();
    }
    this.materialCache.clear();

    this.chunkVegetation.clear();

    // Dispose model cache
    this.modelCache?.dispose();
    this.modelCache = null;
  }
}
