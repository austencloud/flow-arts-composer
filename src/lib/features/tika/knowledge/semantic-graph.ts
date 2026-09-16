/**
 * TKA Semantic Knowledge Graph
 *
 * A node-based graph that maps relationships between TKA concepts.
 * Unlike the curriculum-focused knowledge-graph.ts, this captures
 * semantic relationships that help with:
 *
 * 1. Identifying WHY an error occurred (which relationship was violated?)
 * 2. Generating test scenarios from relationship edges
 * 3. Understanding concept dependencies
 * 4. Detecting misconceptions (commonly-confused-with relationships)
 *
 * The graph is designed to be:
 * - Queryable: Find related concepts quickly
 * - Extensible: Add new nodes and relationships easily
 * - Translatable: All text content supports multiple languages
 */

import type {
	KnowledgeNode,
	KnowledgeRelationship,
	KnowledgeGraph,
	KnowledgeNodeType,
	RelationshipType
} from '../evaluation/types';

const nodes: KnowledgeNode[] = [
	{
		id: 'grid',
		type: 'concept',
		name: { en: 'The Grid' },
		description: { en: 'The 8-point reference system where hands can be placed' },
		introducedAtLevel: 1,
		facts: [
			{ en: 'Has 8 points: 4 cardinal (N, E, S, W) and 4 intercardinal (NE, SE, SW, NW)' },
			{ en: 'Can operate in diamond mode (cardinals) or box mode (intercardinals)' }
		],
		sourceOfTruth: 'mcp-server/data/tka-glossary.json'
	},
	{
		id: 'placement',
		type: 'concept',
		name: { en: 'Placement' },
		description: { en: 'The spatial relationship between the two hands on the grid' },
		introducedAtLevel: 1,
		facts: [
			{ en: 'Describes WHERE hands are relative to each other' },
			{ en: 'Independent of props - only about hand placement' }
		]
	},
	{
		id: 'motion',
		type: 'concept',
		name: { en: 'Motion' },
		description: { en: 'How a hand moves (or does not move) during a beat' },
		introducedAtLevel: 1,
		facts: [
			{ en: 'Three types: static, shift, dash' },
			{ en: 'Defines the movement pattern, not the rotation' }
		]
	},
	{
		id: 'rotation',
		type: 'concept',
		name: { en: 'Rotation' },
		description: { en: 'The direction a prop spins relative to hand movement' },
		introducedAtLevel: 1,
		facts: [
			{ en: 'Two directions: pro (with) and anti (against)' },
			{ en: 'Independent of motion type' }
		]
	},
	{
		id: 'placement-alpha',
		type: 'term',
		name: { en: 'Alpha' },
		description: { en: 'Hands at opposite grid points' },
		introducedAtLevel: 1,
		facts: [
			{ en: 'Hands form a straight line through the center' },
			{ en: 'Examples: N/S, E/W, NE/SW, NW/SE' }
		],
		misconceptions: [
			{ en: 'Do NOT describe as "180 degrees apart" - say "opposite points"' }
		],
		sourceOfTruth: 'mcp-server/data/tka-glossary.json#alpha'
	},
	{
		id: 'placement-beta',
		type: 'term',
		name: { en: 'Beta' },
		description: { en: 'Both hands at the same grid point' },
		introducedAtLevel: 1,
		facts: [{ en: 'Both props share a single location' }],
		sourceOfTruth: 'mcp-server/data/tka-glossary.json#beta'
	},
	{
		id: 'placement-gamma',
		type: 'term',
		name: { en: 'Gamma' },
		description: { en: 'Hands form a right angle on adjacent grid points' },
		introducedAtLevel: 1,
		facts: [{ en: 'One hand is 90° away from the other' }],
		misconceptions: [
			{ en: 'Do NOT describe as "perpendicular" - say "right angle"' }
		],
		sourceOfTruth: 'mcp-server/data/tka-glossary.json#gamma'
	},
	{
		id: 'placement-zeta',
		type: 'term',
		name: { en: 'Zeta' },
		description: { en: 'Hands form an obtuse angle (skewed grid)' },
		introducedAtLevel: 4,
		facts: [
			{ en: 'One hand cardinal, one intercardinal' },
			{ en: 'Approximately 135° angle' }
		],
		sourceOfTruth: 'mcp-server/data/tka-glossary.json#zeta'
	},
	{
		id: 'placement-eta',
		type: 'term',
		name: { en: 'Eta' },
		description: { en: 'Hands form an acute angle (skewed grid)' },
		introducedAtLevel: 4,
		facts: [
			{ en: 'One hand cardinal, one intercardinal' },
			{ en: 'Approximately 45° angle' }
		],
		sourceOfTruth: 'mcp-server/data/tka-glossary.json#eta'
	},
	{
		id: 'motion-static',
		type: 'term',
		name: { en: 'Static' },
		description: { en: 'Hand stays at current grid point' },
		introducedAtLevel: 1,
		facts: [
			{ en: 'No hand movement' },
			{ en: 'Prop may still rotate' }
		],
		sourceOfTruth: 'mcp-server/data/tka-glossary.json#static'
	},
	{
		id: 'motion-shift',
		type: 'term',
		name: { en: 'Shift' },
		description: { en: 'Hand moves to adjacent grid point' },
		introducedAtLevel: 1,
		facts: [{ en: 'Movement of 90° around the grid' }],
		sourceOfTruth: 'mcp-server/data/tka-glossary.json#shift'
	},
	{
		id: 'motion-dash',
		type: 'term',
		name: { en: 'Dash' },
		description: { en: 'Hand moves to opposite grid point' },
		introducedAtLevel: 1,
		facts: [{ en: 'Movement of 180° across the grid' }],
		sourceOfTruth: 'mcp-server/data/tka-glossary.json#dash'
	},
	{
		id: 'rotation-pro',
		type: 'term',
		name: { en: 'Pro' },
		description: { en: 'Prop rotates with direction of hand travel' },
		introducedAtLevel: 1,
		facts: [
			{ en: 'Also called "prospin"' },
			{ en: 'Like a wheel rolling forward' }
		],
		sourceOfTruth: 'mcp-server/data/tka-glossary.json#pro'
	},
	{
		id: 'rotation-anti',
		type: 'term',
		name: { en: 'Anti' },
		description: { en: 'Prop rotates against direction of hand travel' },
		introducedAtLevel: 1,
		facts: [
			{ en: 'Also called "antispin"' },
			{ en: 'Creates petal patterns' }
		],
		sourceOfTruth: 'mcp-server/data/tka-glossary.json#anti'
	},
	{
		id: 'type-1',
		type: 'letter-type',
		name: { en: 'Type 1: Dual-Shift' },
		description: { en: 'Both hands shift (move to adjacent points)' },
		introducedAtLevel: 1,
		facts: [
			{ en: '22 letters: A through V' },
			{ en: 'Most common letter type' },
			{ en: 'BOTH hands SHIFT - this is what makes it Type 1' }
		],
		misconceptions: [
			{ en: 'Do NOT say "both hands move" - Types 3 and 5 also have both hands moving' },
			{ en: 'The distinguishing feature is that both hands SHIFT specifically' }
		],
		sourceOfTruth: 'mcp-server/data/letter-types.json#1'
	},
	{
		id: 'type-2',
		type: 'letter-type',
		name: { en: 'Type 2: Shift' },
		description: { en: 'One hand shifts, one stays static' },
		introducedAtLevel: 1,
		facts: [
			{ en: '8 letters: W, X, Y, Z, Σ, Δ, Θ, Ω' },
			{ en: 'Asymmetric movement' }
		],
		sourceOfTruth: 'mcp-server/data/letter-types.json#2'
	},
	{
		id: 'type-3',
		type: 'letter-type',
		name: { en: 'Type 3: Cross-Shift' },
		description: { en: 'One hand shifts, one hand dashes' },
		introducedAtLevel: 1,
		facts: [
			{ en: '8 letters: W-, X-, Y-, Z-, Σ-, Δ-, Θ-, Ω-' },
			{ en: 'Named with "-" suffix (naming convention, not modifier)' },
			{ en: 'BOTH hands move in Type 3 (one shifts, one dashes)' }
		],
		misconceptions: [
			{ en: 'The "-" suffix is a naming convention, NOT a dash motion modifier' },
			{ en: '"Sigma dash" means Σ- (Type 3), not Sigma with dash motion' }
		],
		sourceOfTruth: 'mcp-server/data/letter-types.json#3'
	},
	{
		id: 'type-4',
		type: 'letter-type',
		name: { en: 'Type 4: Dash' },
		description: { en: 'One hand dashes, one stays static' },
		introducedAtLevel: 1,
		facts: [
			{ en: '3 letters: Φ, Ψ, Λ' },
			{ en: 'Dramatic position changes' }
		],
		sourceOfTruth: 'mcp-server/data/letter-types.json#4'
	},
	{
		id: 'type-5',
		type: 'letter-type',
		name: { en: 'Type 5: Dual-Dash' },
		description: { en: 'Both hands dash (move to opposite points)' },
		introducedAtLevel: 1,
		facts: [
			{ en: '3 letters: Φ-, Ψ-, Λ-' },
			{ en: 'BOTH hands move in Type 5 (both dash)' }
		],
		sourceOfTruth: 'mcp-server/data/letter-types.json#5'
	},
	{
		id: 'type-6',
		type: 'letter-type',
		name: { en: 'Type 6: Static' },
		description: { en: 'Both hands remain stationary' },
		introducedAtLevel: 1,
		facts: [
			{ en: '3 letters: α, β, γ (lowercase Greek)' },
			{ en: 'Props may still rotate' }
		],
		sourceOfTruth: 'mcp-server/data/letter-types.json#6'
	},
	{
		id: 'rule-types-numbered',
		type: 'rule',
		name: { en: 'Types Are Numbered 1-6' },
		description: { en: 'Letter types use numbers, not letters' },
		introducedAtLevel: 1,
		facts: [
			{ en: '"Type 1" is correct' },
			{ en: '"Type A" is WRONG' }
		],
		misconceptions: [
			{ en: 'Users may say "Type A" or "Type B" - always correct to numbered' }
		]
	},
	{
		id: 'rule-dash-suffix',
		type: 'rule',
		name: { en: 'The Dash Suffix Convention' },
		description: { en: 'The "-" suffix in letter names indicates Type 3 or Type 5' },
		introducedAtLevel: 1,
		facts: [
			{ en: '"W-" is a Type 3 letter, NOT "W with dash motion"' },
			{ en: '"Φ-" is a Type 5 letter, NOT "Φ with dash motion"' },
			{ en: 'The "-" is part of the letter NAME, not a modifier' }
		],
		misconceptions: [
			{ en: 'Users may think "W dash" means W with dash motion' },
			{ en: 'The dash suffix is a NAMING convention, not a motion type' }
		]
	},
	{
		id: 'misconception-both-move',
		type: 'misconception',
		name: { en: 'Both Hands Move = Type 1' },
		description: { en: 'Incorrect belief that Type 1 is defined by both hands moving' },
		introducedAtLevel: 1,
		facts: [
			{ en: 'WRONG: "Type 1 is when both hands move"' },
			{ en: 'CORRECT: "Type 1 is when both hands SHIFT"' },
			{ en: 'Types 1, 3, and 5 all have both hands moving' }
		]
	},
	{
		id: 'misconception-dash-modifier',
		type: 'misconception',
		name: { en: 'Dash Suffix as Motion Modifier' },
		description: { en: 'Incorrect belief that "-" suffix adds dash motion' },
		introducedAtLevel: 1,
		facts: [
			{ en: 'WRONG: "W- is W with dash motion added"' },
			{ en: 'CORRECT: "W- is a separate Type 3 letter"' }
		]
	}
];

const relationships: KnowledgeRelationship[] = [
	{ from: 'placement-alpha', to: 'placement', type: 'is-a', strength: 'strict' },
	{ from: 'placement-beta', to: 'placement', type: 'is-a', strength: 'strict' },
	{ from: 'placement-gamma', to: 'placement', type: 'is-a', strength: 'strict' },
	{ from: 'placement-zeta', to: 'placement', type: 'is-a', strength: 'strict' },
	{ from: 'placement-eta', to: 'placement', type: 'is-a', strength: 'strict' },

	{
		from: 'placement-alpha',
		to: 'placement-beta',
		type: 'opposite-of',
		strength: 'strict',
		description: { en: 'Alpha (opposite points) vs Beta (same point)' }
	},

	{ from: 'motion-static', to: 'motion', type: 'is-a', strength: 'strict' },
	{ from: 'motion-shift', to: 'motion', type: 'is-a', strength: 'strict' },
	{ from: 'motion-dash', to: 'motion', type: 'is-a', strength: 'strict' },

	{
		from: 'motion-shift',
		to: 'motion-dash',
		type: 'related-to',
		strength: 'strong',
		description: { en: 'Shift (adjacent) vs Dash (opposite)' }
	},

	{ from: 'rotation-pro', to: 'rotation', type: 'is-a', strength: 'strict' },
	{ from: 'rotation-anti', to: 'rotation', type: 'is-a', strength: 'strict' },
	{
		from: 'rotation-pro',
		to: 'rotation-anti',
		type: 'opposite-of',
		strength: 'strict'
	},

	{
		from: 'type-1',
		to: 'motion-shift',
		type: 'has-property',
		strength: 'strict',
		description: { en: 'Type 1 uses shift for BOTH hands' }
	},
	{
		from: 'type-3',
		to: 'motion-shift',
		type: 'has-property',
		strength: 'strong',
		description: { en: 'Type 3 uses shift for ONE hand' }
	},
	{
		from: 'type-3',
		to: 'motion-dash',
		type: 'has-property',
		strength: 'strong',
		description: { en: 'Type 3 uses dash for ONE hand' }
	},
	{
		from: 'type-5',
		to: 'motion-dash',
		type: 'has-property',
		strength: 'strict',
		description: { en: 'Type 5 uses dash for BOTH hands' }
	},

	{
		from: 'type-1',
		to: 'type-3',
		type: 'commonly-confused-with',
		strength: 'strong',
		description: { en: 'Both have "both hands moving" but different motion types' }
	},
	{
		from: 'type-1',
		to: 'type-5',
		type: 'commonly-confused-with',
		strength: 'strong',
		description: { en: 'Both have "both hands moving" but different motion types' }
	},

	{
		from: 'misconception-both-move',
		to: 'type-1',
		type: 'related-to',
		strength: 'strong'
	},
	{
		from: 'misconception-both-move',
		to: 'type-3',
		type: 'related-to',
		strength: 'strong'
	},
	{
		from: 'misconception-both-move',
		to: 'type-5',
		type: 'related-to',
		strength: 'strong'
	},
	{
		from: 'misconception-dash-modifier',
		to: 'type-3',
		type: 'related-to',
		strength: 'strong'
	},
	{
		from: 'misconception-dash-modifier',
		to: 'rule-dash-suffix',
		type: 'related-to',
		strength: 'strict'
	},

	{ from: 'placement', to: 'grid', type: 'requires', strength: 'strict' },
	{ from: 'motion', to: 'grid', type: 'requires', strength: 'strict' },

	{
		from: 'placement-zeta',
		to: 'placement-gamma',
		type: 'prerequisite-for',
		strength: 'strict'
	},
	{
		from: 'placement-eta',
		to: 'placement-gamma',
		type: 'prerequisite-for',
		strength: 'strict'
	}
];

class SemanticKnowledgeGraph implements KnowledgeGraph {
	nodes: KnowledgeNode[];
	relationships: KnowledgeRelationship[];

	private nodeMap: Map<string, KnowledgeNode>;
	private outgoingEdges: Map<string, KnowledgeRelationship[]>;
	private incomingEdges: Map<string, KnowledgeRelationship[]>;

	constructor(nodes: KnowledgeNode[], relationships: KnowledgeRelationship[]) {
		this.nodes = nodes;
		this.relationships = relationships;

		this.nodeMap = new Map(nodes.map((n) => [n.id, n]));
		this.outgoingEdges = new Map();
		this.incomingEdges = new Map();

		for (const rel of relationships) {
			if (!this.outgoingEdges.has(rel.from)) {
				this.outgoingEdges.set(rel.from, []);
			}
			this.outgoingEdges.get(rel.from)!.push(rel);

			if (!this.incomingEdges.has(rel.to)) {
				this.incomingEdges.set(rel.to, []);
			}
			this.incomingEdges.get(rel.to)!.push(rel);
		}
	}

	getNode(id: string): KnowledgeNode | undefined {
		return this.nodeMap.get(id);
	}

	getRelated(nodeId: string, relationshipType?: RelationshipType): KnowledgeNode[] {
		const outgoing = this.outgoingEdges.get(nodeId) || [];
		const incoming = this.incomingEdges.get(nodeId) || [];

		const relatedIds = new Set<string>();

		for (const rel of [...outgoing, ...incoming]) {
			if (!relationshipType || rel.type === relationshipType) {
				const otherId = rel.from === nodeId ? rel.to : rel.from;
				relatedIds.add(otherId);
			}
		}

		return Array.from(relatedIds)
			.map((id) => this.nodeMap.get(id))
			.filter((n): n is KnowledgeNode => n !== undefined);
	}

	getPrerequisites(nodeId: string): KnowledgeNode[] {
		const incoming = this.incomingEdges.get(nodeId) || [];
		return incoming
			.filter((r) => r.type === 'prerequisite-for')
			.map((r) => this.nodeMap.get(r.from))
			.filter((n): n is KnowledgeNode => n !== undefined);
	}

	getMisconceptions(nodeId: string): string[] {
		const node = this.nodeMap.get(nodeId);
		if (!node?.misconceptions) return [];
		return node.misconceptions.map((m) => m.en).filter((m): m is string => !!m);
	}

	getConfusedWith(nodeId: string): KnowledgeNode[] {
		return this.getRelated(nodeId, 'commonly-confused-with');
	}

	getAllMisconceptions(): KnowledgeNode[] {
		return this.nodes.filter((n) => n.type === 'misconception');
	}

	getNodesByType(type: KnowledgeNodeType): KnowledgeNode[] {
		return this.nodes.filter((n) => n.type === type);
	}

	getNodesByLevel(level: 1 | 2 | 3 | 4): KnowledgeNode[] {
		return this.nodes.filter((n) => n.introducedAtLevel === level);
	}

	findPath(fromId: string, toId: string, maxDepth: number = 5): KnowledgeRelationship[] | null {
		const visited = new Set<string>();
		const queue: Array<{ nodeId: string; path: KnowledgeRelationship[] }> = [
			{ nodeId: fromId, path: [] }
		];

		while (queue.length > 0) {
			const { nodeId, path } = queue.shift()!;

			if (nodeId === toId) return path;
			if (path.length >= maxDepth) continue;
			if (visited.has(nodeId)) continue;

			visited.add(nodeId);

			const outgoing = this.outgoingEdges.get(nodeId) || [];
			for (const rel of outgoing) {
				queue.push({ nodeId: rel.to, path: [...path, rel] });
			}
		}

		return null;
	}
}

export const tkaKnowledgeGraph = new SemanticKnowledgeGraph(nodes, relationships);

export function getNodeById(id: string): KnowledgeNode | undefined {
	return tkaKnowledgeGraph.getNode(id);
}

export function findRelatedNodes(
	nodeId: string,
	relationshipType?: RelationshipType
): KnowledgeNode[] {
	return tkaKnowledgeGraph.getRelated(nodeId, relationshipType);
}

export function getMisconceptionsFor(nodeId: string): string[] {
	return tkaKnowledgeGraph.getMisconceptions(nodeId);
}

export function getAllKnownMisconceptions(): KnowledgeNode[] {
	return tkaKnowledgeGraph.getAllMisconceptions();
}
