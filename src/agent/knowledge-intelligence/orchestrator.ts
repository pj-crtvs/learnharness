import type { KnowledgeNode, KnowledgeEdge, RootCauseHypothesis, InterventionPlan, AgentEvaluation, LearningEvidence } from "../../core/contracts/knowledge-intelligence.ts";
import { investigateRootCause, toHypothesis } from "./root-cause.ts";
import { evaluateDiagnosis } from "./diagnostic-evaluator.ts";
import { planIntervention } from "./intervention-planner.ts";

export interface OrchestrationInput {
	studentId: string;
	targetConceptId: string;
	nodes: KnowledgeNode[];
	edges: KnowledgeEdge[];
	masteryByConcept: Record<string, { state: string; score: number }>;
	evidenceByConcept: Record<string, LearningEvidence[]>;
}

export interface OrchestrationResult {
	hypotheses: RootCauseHypothesis[];
	evaluations: AgentEvaluation[];
	interventionPlan: InterventionPlan | null;
	needsMoreEvidence: boolean;
}

export function orchestrateDiagnosis(input: OrchestrationInput): OrchestrationResult {
	const causes = investigateRootCause(input);
	const sessionId = `diag_${input.studentId}_${input.targetConceptId}`;
	const hypotheses = causes.map((c) => toHypothesis(c, sessionId));
	const evaluations: AgentEvaluation[] = [];
	let needsMoreEvidence = false;
	for (const h of hypotheses) {
		const evCount = (input.evidenceByConcept[h.conceptId] ?? []).length;
		const hasContradicting = (input.evidenceByConcept[h.conceptId] ?? []).some((e) => e.correct);
		const ev = evaluateDiagnosis({ hypothesis: h, evidenceCount: evCount, hasContradicting });
		evaluations.push(ev);
		if (ev.decision === "insufficient_evidence") needsMoreEvidence = true;
	}
	let interventionPlan: InterventionPlan | null = null;
	if (hypotheses.length > 0 && !needsMoreEvidence) {
		const first = hypotheses[0]!;
		const plan = planIntervention({
			studentId: input.studentId,
			targetConceptId: input.targetConceptId,
			rootCauseConceptId: first.conceptId,
			hypothesisConfidence: first.confidence,
		});
		interventionPlan = {
			id: `ip_${Date.now()}`,
			...plan,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		} as InterventionPlan;
	}
	return { hypotheses, evaluations, interventionPlan, needsMoreEvidence };
}