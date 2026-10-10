// Re-exported: geometry now lives in shared 3D services (see
// src/lib/shared/3d/services/swept-volume/swept-volume-builder.ts) so it can be
// reused outside the dodge lab (e.g. a wall-plane feasibility scanner).
export * from "#lib/shared/3d/services/swept-volume/swept-volume-builder.js";
