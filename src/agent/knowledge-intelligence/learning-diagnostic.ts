import type { KnowledgeNode, KnowledgeEdge, StudentConceptMastery, LearningEvidence, MasteryState } from "../../core/contracts/knowledge-intelligence.ts";
import { computeMasteryState, classifyConfidence } from "../../core/knowledge-intelligence.ts";

export interface DiagnosticInput {
	conceptId: string;
	evidence: LearningEvidence[];
}

export function diagnoseConcept(input: DiagnosticInput): { state: MasteryState; confidence: "low" | "moderate" | "high" | "confirmed"; evidenceCount: number } {
	const state = computeMasteryState(input.evidence);
	const confidence = classifyConfidence(input.evidence.length);
	return { state, confidence, evidenceCount: input.evidence.length };
}

export function distinguishEvidenceQuality(evidence: LearningEvidence[]): string {
	if (evidence.length === 0) return "never_introduced";
	if (evidence.length < 3) return "insufficient_evidence";
	const allCorrect = evidence.every((e) => e.correct);
	const allWrong = evidence.every((e) => !e.correct);
	if (allCorrect) return "demonstrated_proficiency";
	if (allWrong) return "developing";
	return "inconsistent";
}