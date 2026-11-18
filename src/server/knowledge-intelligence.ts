import { knowledgeIntelligenceStore as store } from "../store/knowledge-intelligence.ts";
import { orchestrateDiagnosis } from "../agent/knowledge-intelligence/orchestrator.ts";
import type { KnowledgeNode, KnowledgeEdge } from "../core/contracts/knowledge-intelligence.ts";

export function analyzeDiagnosticSession(sessionId: string) {
	const session = store.getDiagnosticSession(sessionId);
	if (!session) return null;
	const nodes = store.listNodes();
	const edges = store.listEdges();
	const studentId = session.studentId ?? "";
	const masteryRecords = store.listMastery(studentId);
	const evidence = store.listEvidence(session.studentId);
	const masteryByConcept: Record<string, { state: string; score: number }> = {};
	for (const m of masteryRecords) masteryByConcept[m.conceptId] = { state: m.state, score: m.score };
	const evidenceByConcept: Record<string, any[]> = {};
	for (const e of evidence) {
		if (!evidenceByConcept[e.conceptId]) evidenceByConcept[e.conceptId] = [];
		evidenceByConcept[e.conceptId]!.push(e);
	}
	const result = orchestrateDiagnosis({
		studentId,
		targetConceptId: session.targetConceptId,
		nodes: nodes as KnowledgeNode[],
		edges: edges as KnowledgeEdge[],
		masteryByConcept,
		evidenceByConcept,
	});
	// Persist hypotheses
	for (const h of result.hypotheses) {
		store.createHypothesis(h);
	}
	// Persist intervention plan if present
	if (result.interventionPlan) {
		const plan = store.createInterventionPlan({
			studentId: result.interventionPlan.studentId,
			sessionId,
			targetConceptId: result.interventionPlan.targetConceptId,
			rootCauseConceptId: result.interventionPlan.rootCauseConceptId,
			activities: result.interventionPlan.activities,
			status: result.interventionPlan.status,
			evaluatorDecision: result.interventionPlan.evaluatorDecision,
		});
		for (const a of result.interventionPlan.activities) {
			store.createInterventionActivity({ ...a, planId: plan.id });
		}
	}
	// Persist evaluations
	for (const ev of result.evaluations) {
		store.createAgentEvaluation(ev);
	}
	store.updateDiagnosticSession(sessionId, { hypotheses: result.hypotheses, status: result.needsMoreEvidence ? "in_progress" : "completed" });
	return result;
}