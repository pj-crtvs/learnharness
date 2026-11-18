import type { KnowledgeNode, KnowledgeEdge, RootCauseHypothesis, LearningEvidence, ConfidenceLabel } from "../../core/contracts/knowledge-intelligence.ts";
import { getPrerequisites, transitivePrerequisites } from "../../core/knowledge-intelligence.ts";

export interface RootCauseInput {
	targetConceptId: string;
	nodes: KnowledgeNode[];
	edges: KnowledgeEdge[];
	masteryByConcept: Record<string, { state: string; score: number }>;
	evidenceByConcept: Record<string, LearningEvidence[]>;
}

export interface SuspectedCause {
	conceptId: string;
	reason: string;
	supportingEvidence: string[];
	contradictingEvidence: string[];
	confidence: ConfidenceLabel;
	alternativeExplanations: string[];
}

export function investigateRootCause(input: RootCauseInput): SuspectedCause[] {
	const { targetConceptId, nodes, edges, masteryByConcept, evidenceByConcept } = input;
	const prereqs = transitivePrerequisites(targetConceptId, edges);
	const causes: SuspectedCause[] = [];
	for (const pid of prereqs) {
		const m = masteryByConcept[pid];
		const ev = evidenceByConcept[pid] ?? [];
		const node = nodes.find((n) => n.id === pid);
		if (!node) continue;
		const weak = !m || m.state === "not_introduced" || m.state === "developing" || m.state === "needs_reinforcement" || m.state === "inconsistent" || m.score < 0.6;
		if (!weak) continue;
		const supporting = ev.filter((e) => !e.correct).map((e) => `incorrect response ${e.id}`);
		const contradicting = ev.filter((e) => e.correct).map((e) => `correct response ${e.id}`);
		const confidence: ConfidenceLabel = ev.length < 3 ? "low" : ev.length < 8 ? "moderate" : "high";
		causes.push({
			conceptId: pid,
			reason: `Student shows weak mastery of ${node.name} (state=${m?.state ?? "not_introduced"}, score=${(m?.score ?? 0).toFixed(2)}), which is a prerequisite of the target concept.`,
			supportingEvidence: supporting.length ? supporting : ["no direct evidence; inferred from missing mastery"],
			contradictingEvidence: contradicting,
			confidence,
			alternativeExplanations: [
				"careless execution",
				"misreading the question",
				"calculation error",
				"unfamiliar problem format",
			],
		});
	}
	// Rank by depth (deeper prerequisites first) and confidence.
	causes.sort((a, b) => {
		const da = getPrerequisites(a.conceptId, edges).length;
		const db = getPrerequisites(b.conceptId, edges).length;
		return db - da;
	});
	return causes;
}

export function toHypothesis(cause: SuspectedCause, sessionId: string): RootCauseHypothesis {
	return {
		id: `hyp_${cause.conceptId}`,
		sessionId,
		conceptId: cause.conceptId,
		description: cause.reason,
		supportingEvidence: cause.supportingEvidence,
		contradictingEvidence: cause.contradictingEvidence,
		confidence: cause.confidence,
		diagnosticQuestionIds: [],
		status: "suspected",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};
}