import type { AgentEvaluation, AgentDecision, EvaluationCycleResult } from "../../core/contracts/knowledge-intelligence.ts";

export interface CycleInput<T> {
	generate: () => T;
	validateStructure: (output: T) => string[];
	evaluateContent: (output: T) => AgentEvaluation;
	revise: (output: T, feedback: AgentEvaluation) => T;
	maxRevisions?: number;
}

export function runEvaluationCycle<T>(input: CycleInput<T>): EvaluationCycleResult {
	const max = input.maxRevisions ?? 3;
	let output = input.generate();
	let revisions = 0;
	let evaluation: AgentEvaluation;
	for (let i = 0; i <= max; i++) {
		const structErrors = input.validateStructure(output);
		if (structErrors.length) {
			evaluation = {
				id: `eval_struct_${i}`,
				targetType: "knowledge_graph",
				targetId: "generated",
				decision: "revise",
				overallQuality: 20,
				criteria: { factualAccuracy: 20, relationshipAccuracy: 20, prerequisiteValidity: 20, evidenceQuality: 20, logicalConsistency: 20, pedagogicalQuality: 20 },
				identifiedErrors: structErrors,
				unsupportedClaims: [],
				missingEvidence: [],
				recommendedChanges: ["fix structural errors"],
				reasoningSummary: "structural validation failed",
				requiresHumanReview: false,
				createdAt: new Date().toISOString(),
			};
			if (i === max) break;
			output = input.revise(output, evaluation);
			revisions++;
			continue;
		}
		evaluation = input.evaluateContent(output);
		if (evaluation.decision === "approved" || evaluation.decision === "insufficient_evidence" || evaluation.decision === "rejected") {
			// For rejected/insufficient, stop too (bounded).
			break;
		}
		if (i === max) break;
		output = input.revise(output, evaluation);
		revisions++;
	}
	return {
		decision: evaluation!.decision,
		evaluation: evaluation!,
		revisions,
		finalOutput: output,
	};
}