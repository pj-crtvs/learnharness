// Knowledge Graph & Prerequisite Intelligence Engine contracts.
// Shared types for the academic knowledge graph, student mastery, diagnostics,
// root-cause hypotheses, interventions, mastery verification, and agent
// evaluation. Pure types only.

export type KnowledgeNodeType =
	| "subject"
	| "course"
	| "chapter"
	| "topic"
	| "subtopic"
	| "concept"
	| "definition"
	| "principle"
	| "theorem"
	| "formula"
	| "mathematical_operation"
	| "skill"
	| "problem_solving_technique"
	| "misconception"
	| "prerequisite"
	| "learning_objective"
	| "assessment_objective"
	| "textbook_reference"
	| "visual_representation"
	| "real_world_application";

export type KnowledgeEdgeType =
	| "requires"
	| "builds_on"
	| "part_of"
	| "related_to"
	| "contrasts_with"
	| "applies_to"
	| "derived_from"
	| "used_in"
	| "commonly_confused_with"
	| "represented_by"
	| "assessed_by";

export type VerificationStatus = "unverified" | "ai_proposed" | "verified" | "rejected";

export interface KnowledgeNode {
	id: string;
	name: string;
	description?: string;
	type: KnowledgeNodeType;
	subject?: string;
	classification?: string;
	difficulty?: number; // 0..1
	learningObjectives?: string[];
	requiredPriorKnowledge?: string[];
	relatedConcepts?: string[];
	formulas?: string[];
	principles?: string[];
	commonMisconceptions?: string[];
	examples?: string[];
	lessons?: string[];
	exercises?: string[];
	sourceReferences?: SourceReference[];
	confidence?: number; // 0..1
	verificationStatus?: VerificationStatus;
	createdAt: string;
	updatedAt: string;
}

export interface SourceReference {
	id: string;
	source: string;
	page?: number;
	excerpt?: string;
	reliability?: number;
}

export interface KnowledgeEdge {
	id: string;
	source: string;
	target: string;
	type: KnowledgeEdgeType;
	explanation?: string;
	confidence?: number;
	evidence?: string;
	verified: boolean;
	aiProposed: boolean;
	conditions?: string;
	createdAt: string;
	updatedAt: string;
}

export interface PrerequisiteDependency {
	id: string;
	conceptId: string; // dependent
	prerequisiteId: string;
	alternativePathway?: boolean;
	depth?: number;
	createdAt: string;
}

export type MasteryState =
	| "not_introduced"
	| "introduced"
	| "developing"
	| "needs_reinforcement"
	| "inconsistent"
	| "proficient"
	| "strong_mastery"
	| "insufficient_evidence";

export type ConfidenceLabel = "low" | "moderate" | "high" | "confirmed";

export interface StudentConceptMastery {
	id: string;
	studentId: string;
	conceptId: string;
	state: MasteryState;
	conceptual: number;
	procedural: number;
	independent: number;
	retention: number;
	application: number;
	reasoning: number;
	score: number;
	confidence: ConfidenceLabel;
	evidenceCount: number;
	lastValidated?: string;
	updatedAt: string;
}

export interface LearningEvidence {
	id: string;
	studentId: string;
	conceptId: string;
	sourceType: "teaching" | "practice" | "flashcard" | "diagnostic" | "pdf" | "assessment";
	activityId?: string;
	correct: boolean;
	score?: number;
	independent?: boolean;
	hintUsed?: boolean;
	reasoning?: string;
	timestamp: string;
}

export type DiagnosticStatus = "open" | "in_progress" | "completed" | "abandoned";

export interface DiagnosticSession {
	id: string;
	studentId: string;
	targetConceptId: string;
	status: DiagnosticStatus;
	hypotheses: RootCauseHypothesis[];
	questionIds: string[];
	createdAt: string;
	updatedAt: string;
}

export type DiagnosticLevel = 1 | 2 | 3 | 4 | 5;

export interface DiagnosticQuestion {
	id: string;
	sessionId: string;
	conceptId: string;
	level: DiagnosticLevel;
	prompt: string;
	expectedAnswer?: string;
	generatedAt: string;
}

export interface DiagnosticResponse {
	id: string;
	questionId: string;
	sessionId: string;
	answer: string;
	reasoning?: string;
	correct: boolean;
	score?: number;
	evaluatedAt: string;
}

export interface RootCauseHypothesis {
	id: string;
	sessionId: string;
	conceptId: string;
	description: string;
	supportingEvidence: string[];
	contradictingEvidence: string[];
	confidence: ConfidenceLabel;
	diagnosticQuestionIds: string[];
	status: "suspected" | "confirmed" | "rejected" | "inconclusive";
	createdAt: string;
	updatedAt: string;
}

export interface InterventionPlan {
	id: string;
	studentId: string;
	sessionId?: string;
	targetConceptId: string;
	rootCauseConceptId?: string;
	activities: InterventionActivity[];
	status: "proposed" | "approved" | "in_progress" | "completed" | "revised";
	evaluatorDecision?: AgentEvaluation;
	createdAt: string;
	updatedAt: string;
}

export interface InterventionActivity {
	id: string;
	planId: string;
	type: "explanation" | "diagram" | "flashcard" | "conceptual_question" | "worked_example" | "guided_practice" | "independent_practice" | "teach_back" | "retention_check";
	conceptId: string;
	description: string;
	order: number;
	completed: boolean;
}

export interface MasteryAssessment {
	id: string;
	studentId: string;
	conceptId: string;
	interventionPlanId?: string;
	conceptual: number;
	independentRecall: number;
	explanationQuality: number;
	application: number;
	problemSolving: number;
	transfer: number;
	delayedRetention?: number;
	outcome: "resolved" | "improved" | "no_improvement" | "new_misconception" | "insufficient_evidence";
	createdAt: string;
}

export type AgentDecision = "approved" | "revise" | "insufficient_evidence" | "rejected";

export interface AgentEvaluation {
	id: string;
	targetType: "knowledge_graph" | "diagnosis" | "intervention" | "mastery";
	targetId: string;
	decision: AgentDecision;
	overallQuality: number;
	criteria: {
		factualAccuracy: number;
		relationshipAccuracy: number;
		prerequisiteValidity: number;
		evidenceQuality: number;
		logicalConsistency: number;
		pedagogicalQuality: number;
	};
	identifiedErrors: string[];
	unsupportedClaims: string[];
	missingEvidence: string[];
	recommendedChanges: string[];
	reasoningSummary: string;
	requiresHumanReview: boolean;
	createdAt: string;
}

export interface AgentExecution {
	id: string;
	agent: string;
	input: unknown;
	output: unknown;
	startedAt: string;
	finishedAt?: string;
	status: "running" | "completed" | "failed";
}

export interface GraphValidationRecord {
	id: string;
	graphVersion?: string;
	valid: boolean;
	errors: string[];
	warnings: string[];
	createdAt: string;
}

export interface GraphRevisionHistory {
	id: string;
	nodeId?: string;
	edgeId?: string;
	action: "create" | "update" | "delete" | "merge";
	agent: string;
	evaluationId?: string;
	createdAt: string;
	details?: unknown;
}

export interface EvaluationCycleResult {
	decision: AgentDecision;
	evaluation: AgentEvaluation;
	revisions: number;
	finalOutput: unknown;
}