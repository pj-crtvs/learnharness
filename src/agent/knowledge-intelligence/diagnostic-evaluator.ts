import type { AgentEvaluation, AgentDecision, RootCauseHypothesis } from "../../core/contracts/knowledge-intelligence.ts";

export interface DiagnosticEvaluationInput {
	hypothesis: RootCauseHypothesis;
	evidenceCount: number;
	hasContradicting: boolean;
}

export function evaluateDiagnosis(input: DiagnosticEvaluationInput): AgentEvaluation {
	const { hypothesis, evidenceCount, hasContradicting } = input;
	let decision: AgentDecision = "approved";
	const errors: string[] = [];
	const missing: string[] = [];
	if (evidenceCount < 3) {
		decision = "insufficient_evidence";
		missing.push("need at least 3 diagnostic responses");
	}
	if (hasContradicting && hypothesis.confidence === "high") {
		decision = "revise";
		errors.push("contradicting evidence present but confidence high");
	}
	const quality = evidenceCount >= 8 ? 80 : evidenceCount >= 3 ? 60 : 30;
	return {
		id: `eval_${hypothesis.id}`,
		targetType: "diagnosis",
		targetId: hypothesis.id,
		decision,
		overallQuality: quality,
		criteria: {
			factualAccuracy: quality,
			relationshipAccuracy: 70,
			prerequisiteValidity: 75,
			evidenceQuality: quality,
			logicalConsistency: 70,
			pedagogicalQuality: 70,
		},
		identifiedErrors: errors,
		unsupportedClaims: [],
		missingEvidence: missing,
		recommendedChanges: decision === "insufficient_evidence" ? ["generate targeted diagnostic question"] : [],
		reasoningSummary: `Evaluated hypothesis ${hypothesis.id} with ${evidenceCount} evidence items.`,
		requiresHumanReview: false,
		createdAt: new Date().toISOString(),
	};
}