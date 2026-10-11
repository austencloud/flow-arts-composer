import { describe, it, expect, beforeEach } from 'vitest';
import {
	SpeciesRotationManager,
	type VisitorGroup,
} from '#lib/shared/3d/environments/scenes/ocean/runtime/fauna/fish/fish-species.js';

describe('SpeciesRotationManager', () => {
	let manager: SpeciesRotationManager;

	beforeEach(() => {
		manager = new SpeciesRotationManager(324, 87);
	});

	it('initializes with zero active visitor groups', () => {
		expect(manager.activeGroups.length).toBe(0);
	});

	it('allocates GPU texture slots for a visitor group', () => {
		const slots = manager.allocateSlots(10);
		expect(slots).not.toBeNull();
		expect(slots!.startIndex).toBe(87);
		expect(slots!.count).toBe(10);
	});

	it('refuses allocation when slots are full', () => {
		manager.allocateSlots(200);
		const second = manager.allocateSlots(200);
		expect(second).toBeNull();
	});

	it('releases slots on despawn', () => {
		const slots = manager.allocateSlots(50);
		expect(slots).not.toBeNull();
		manager.releaseSlots(slots!);
		const reslots = manager.allocateSlots(50);
		expect(reslots).not.toBeNull();
		expect(reslots!.startIndex).toBe(87);
	});

	it('tick spawns a visitor group after cooldown', () => {
		const spawned: VisitorGroup[] = [];
		for (let i = 0; i < 100; i++) {
			const group = manager.tick(1.0);
			if (group) spawned.push(group);
		}
		expect(spawned.length).toBeGreaterThan(0);
	});

	it('tick despawns expired visitor groups', () => {
		const group = manager.tick(999);
		if (group) {
			expect(manager.activeGroups.length).toBe(1);
			const duration = group.remainingTime;
			manager.tick(duration + 1);
			const stillHasOriginal = manager.activeGroups.some(
				(g) => g.slots.startIndex === group.slots.startIndex
			);
			expect(stillHasOriginal).toBe(false);
		}
	});

	it('limits active groups to 3 max', () => {
		for (let i = 0; i < 500; i++) manager.tick(1.0);
		expect(manager.activeGroups.length).toBeLessThanOrEqual(3);
	});
});
