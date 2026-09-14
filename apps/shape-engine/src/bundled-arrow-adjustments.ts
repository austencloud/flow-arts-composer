// The installed renderer uses the versioned default/special placement tables
// bundled with this release. It has no live administrator adjustment session.
export function getGlobalAdjustmentRepository(): null { return null; }
export function isGlobalReadDisabled(): boolean { return true; }
export function setGlobalReadDisabled(_disabled: boolean): void {}
export async function initializeGlobalAdjustments(): Promise<void> {}
export function disposeGlobalAdjustments(): void {}
