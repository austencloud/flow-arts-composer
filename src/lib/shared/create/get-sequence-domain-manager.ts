import {
	createSequence,
	updateStep,
} from './services/sequence-domain-manager';
import type { SequenceData } from '#lib/shared/foundation/domain/models/sequence-data.js';

/** Structural type matching what SequenceRepository expects. */
type SequenceDomainManager = {
	createSequence: (request: unknown) => SequenceData;
	updateStep: (sequence: SequenceData, stepIndex: number, stepData: unknown) => SequenceData;
};

export function getSequenceDomainManager(): SequenceDomainManager {
	return {
		createSequence: createSequence as SequenceDomainManager['createSequence'],
		updateStep: updateStep as SequenceDomainManager['updateStep'],
	};
}
