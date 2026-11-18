import type { KnowledgeNode, KnowledgeEdge } from "../../core/contracts/knowledge-intelligence.ts";
import { validateKnowledgeNode, validateKnowledgeEdge, detectDuplicateNodes, detectPrerequisiteCycles } from "../../core/knowledge-intelligence.ts";

export interface ValidationInput {
	nodes: KnowledgeNode[];
	edges: KnowledgeEdge[];
}

export interface ValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
	decision: "approved" | "revise" | "rejected";
}

export function validateKnowledgeGraph(input: ValidationInput): ValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	const nodeIds = new Set(input.nodes.map((n) => n.id));
	for (const n of input.nodes) {
		errors.push(...validateKnowledgeNode(n).map((e) => `${n.id}: ${e}`));
	}
	for (const e of input.edges) {
		errors.push(...validateKnowledgeEdge(e, nodeIds).map((err) => `${e.id}: ${err}`));
	}
	const dups = detectDuplicateNodes(input.nodes);
	for (const d of dups) warnings.push(`duplicate node ${d}`);
	const cycle = detectPrerequisiteCycles(input.nodes, input.edges);
	if (cycle.hasCycle) errors.push(`prerequisite cycle detected: ${cycle.cycle.join(" -> ")}`);
	const valid = errors.length === 0;
	return {
		valid,
		errors,
		warnings,
		decision: valid ? (warnings.length ? "revise" : "approved") : "rejected",
	};
}