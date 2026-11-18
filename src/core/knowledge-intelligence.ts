// Pure helpers for the Knowledge Graph & Prerequisite Intelligence Engine.
import type {
	KnowledgeNode,
	KnowledgeEdge,
	KnowledgeEdgeType,
	MasteryState,
	StudentConceptMastery,
	LearningEvidence,
	AgentEvaluation,
	AgentDecision,
} from "./contracts/knowledge-intelligence.ts";

export const PREREQUISITE_EDGE_TYPES: KnowledgeEdgeType[] = ["requires", "builds_on"];

export function isPrerequisiteEdge(type: KnowledgeEdgeType): boolean {
	return type === "requires" || type === "builds_on";
}

export function validateKnowledgeNode(node: Partial<KnowledgeNode>): string[] {
	const errors: string[] = [];
	if (!node.id) errors.push("missing id");
	if (!node.name) errors.push("missing name");
	if (!node.type) errors.push("missing type");
	if (node.difficulty !== undefined && (node.difficulty < 0 || node.difficulty > 1)) errors.push("difficulty out of range");
	if (node.confidence !== undefined && (node.confidence < 0 || node.confidence > 1)) errors.push("confidence out of range");
	return errors;
}

export function validateKnowledgeEdge(edge: Partial<KnowledgeEdge>, nodeIds: Set<string>): string[] {
	const errors: string[] = [];
	if (!edge.id) errors.push("missing id");
	if (!edge.source) errors.push("missing source");
	if (!edge.target) errors.push("missing target");
	if (!edge.type) errors.push("missing type");
	if (edge.source && !nodeIds.has(edge.source)) errors.push(`unknown source node ${edge.source}`);
	if (edge.target && !nodeIds.has(edge.target)) errors.push(`unknown target node ${edge.target}`);
	if (edge.source && edge.target && edge.source === edge.target) errors.push("self-loop");
	if (edge.confidence !== undefined && (edge.confidence < 0 || edge.confidence > 1)) errors.push("confidence out of range");
	return errors;
}

export function detectDuplicateNodes(nodes: KnowledgeNode[]): string[] {
	const seen = new Map<string, number>();
	const dups: string[] = [];
	for (const n of nodes) {
		const key = `${n.type}::${n.name.toLowerCase().trim()}`;
		const c = seen.get(key) ?? 0;
		if (c > 0) dups.push(n.id);
		seen.set(key, c + 1);
	}
	return dups;
}

export interface CycleResult {
	hasCycle: boolean;
	cycle: string[];
}

export function detectPrerequisiteCycles(nodes: KnowledgeNode[], edges: KnowledgeEdge[]): CycleResult {
	const nodeIds = new Set(nodes.map((n) => n.id));
	const adj = new Map<string, string[]>();
	for (const n of nodes) adj.set(n.id, []);
	for (const e of edges) {
		if (!isPrerequisiteEdge(e.type)) continue;
		if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
		adj.get(e.source)!.push(e.target);
	}
	const color = new Map<string, 0 | 1 | 2>(); // 0 unvisited,1 visiting,2 done
	const parent = new Map<string, string | null>();
	let cycle: string[] = [];
	function dfs(u: string): boolean {
		color.set(u, 1);
		for (const v of adj.get(u) ?? []) {
			if (!color.has(v) || color.get(v) === 0) {
				color.set(v, 0);
				parent.set(v, u);
				if (dfs(v)) return true;
			} else if (color.get(v) === 1) {
				// back edge u->v
				cycle = [v, u];
				let cur = u;
				while (parent.get(cur) && parent.get(cur) !== v) {
					cur = parent.get(cur)!;
					cycle.splice(1, 0, cur);
				}
				return true;
			}
		}
		color.set(u, 2);
		return false;
	}
	for (const n of nodes) {
		if (!color.has(n.id)) {
			color.set(n.id, 0);
			parent.set(n.id, null);
			if (dfs(n.id)) break;
		}
	}
	return { hasCycle: cycle.length > 0, cycle };
}

export function getPrerequisites(conceptId: string, edges: KnowledgeEdge[]): string[] {
	return edges.filter((e) => e.target === conceptId && isPrerequisiteEdge(e.type)).map((e) => e.source);
}

export function getDependents(conceptId: string, edges: KnowledgeEdge[]): string[] {
	return edges.filter((e) => e.source === conceptId && isPrerequisiteEdge(e.type)).map((e) => e.target);
}

export function transitivePrerequisites(conceptId: string, edges: KnowledgeEdge[]): string[] {
	const result = new Set<string>();
	const stack = [...getPrerequisites(conceptId, edges)];
	while (stack.length) {
		const cur = stack.pop()!;
		if (result.has(cur)) continue;
		result.add(cur);
		stack.push(...getPrerequisites(cur, edges));
	}
	return [...result];
}

export function topologicalOrder(conceptIds: string[], edges: KnowledgeEdge[]): string[] | null {
	const idSet = new Set(conceptIds);
	const indeg = new Map<string, number>();
	const adj = new Map<string, string[]>();
	for (const id of conceptIds) {
		indeg.set(id, 0);
		adj.set(id, []);
	}
	for (const e of edges) {
		if (!isPrerequisiteEdge(e.type)) continue;
		if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
		adj.get(e.source)!.push(e.target);
		indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
	}
	const q: string[] = [];
	for (const [id, d] of indeg) if (d === 0) q.push(id);
	const out: string[] = [];
	while (q.length) {
		const u = q.shift()!;
		out.push(u);
		for (const v of adj.get(u) ?? []) {
			const nd = (indeg.get(v) ?? 1) - 1;
			indeg.set(v, nd);
			if (nd === 0) q.push(v);
		}
	}
	if (out.length !== conceptIds.length) return null;
	return out;
}

export function computeMasteryState(evidence: LearningEvidence[]): MasteryState {
	const total = evidence.length;
	if (total === 0) return "not_introduced";
	const avgScore = evidence.reduce((a, e) => a + (e.score ?? (e.correct ? 1 : 0)), 0) / total;
	const independentRatio = evidence.filter((e) => e.independent).length / total;
	const consistent = evidence.every((e) => e.correct) || evidence.every((e) => !e.correct) ? false : true;
	if (avgScore < 0.4) return "developing";
	if (avgScore < 0.65) return "developing";
	if (avgScore < 0.85 || total < 3) return "proficient";
	if (!consistent) return "inconsistent";
	if (independentRatio < 0.5) return "needs_reinforcement";
	return "strong_mastery";
}

export function classifyConfidence(evidenceCount: number): "low" | "moderate" | "high" | "confirmed" {
	if (evidenceCount < 3) return "low";
	if (evidenceCount < 8) return "moderate";
	if (evidenceCount < 15) return "high";
	return "confirmed";
}

export function validateAgentEvaluation(ev: Partial<AgentEvaluation>): string[] {
	const errors: string[] = [];
	if (!ev.id) errors.push("missing id");
	if (!ev.decision) errors.push("missing decision");
	if (ev.overallQuality === undefined) errors.push("missing overallQuality");
	if (!ev.criteria) errors.push("missing criteria");
	if (ev.criteria) {
		for (const k of ["factualAccuracy", "relationshipAccuracy", "prerequisiteValidity", "evidenceQuality", "logicalConsistency", "pedagogicalQuality"] as const) {
			const v = ev.criteria[k];
			if (v === undefined) errors.push(`missing criteria.${k}`);
			else if (v < 0 || v > 100) errors.push(`criteria.${k} out of range`);
		}
	}
	if (!Array.isArray(ev.identifiedErrors)) errors.push("missing identifiedErrors");
	if (!Array.isArray(ev.unsupportedClaims)) errors.push("missing unsupportedClaims");
	if (!Array.isArray(ev.missingEvidence)) errors.push("missing missingEvidence");
	if (!Array.isArray(ev.recommendedChanges)) errors.push("missing recommendedChanges");
	return errors;
}

export interface KnowledgeGraphValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
	decision: "approved" | "revise" | "rejected";
}

export function validateKnowledgeGraphInput(nodes: any[], edges: any[]): KnowledgeGraphValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	const nodeIds = new Set(nodes.map((n: any) => n.id));
	for (const n of nodes) {
		errors.push(...validateKnowledgeNode(n).map((e) => `${n.id}: ${e}`));
	}
	for (const e of edges) {
		errors.push(...validateKnowledgeEdge(e, nodeIds).map((err) => `${e.id}: ${err}`));
	}
	const dups = detectDuplicateNodes(nodes as any);
	for (const d of dups) warnings.push(`duplicate node ${d}`);
	const cycle = detectPrerequisiteCycles(nodes as any, edges as any);
	if (cycle.hasCycle) errors.push(`prerequisite cycle detected: ${cycle.cycle.join(" -> ")}`);
	const valid = errors.length === 0;
	return { valid, errors, warnings, decision: valid ? (warnings.length ? "revise" : "approved") : "rejected" };
}

// Compatibility aliases for alternate naming.
export const detectCycles = detectPrerequisiteCycles;
export const classifyMastery = computeMasteryState;
export const validateGraph = validateKnowledgeGraphInput;
export const topologicalSort = topologicalOrder;

export function defaultEvaluationCriteria() {
	return {
		factualAccuracy: 0,
		relationshipAccuracy: 0,
		prerequisiteValidity: 0,
		evidenceQuality: 0,
		logicalConsistency: 0,
		pedagogicalQuality: 0,
	};
}